import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { Song } from './types';
import { hostPathPrefix } from './api';

const MAX_CONCURRENT_COVERS = 3;

/**
 * 全局可见性 nonce —— 每次页面从不可见变为可见时自增。
 *
 * 用于驱动列表封面（`SongRow`）在 Tab 切回时刷新：WebF 的 imageCache 在页面
 * Offstage 期间可能驱逐已加载的图片，导致 `<img>` 显示空白**且不触发 error 事件**
 * （画着一个已 dispose 的 `ui.Image`）。只有换掉 URL 才能让 WebF 重新解码。
 *
 * 播放器封面有自己的 `useSongCover` composable 独立处理；列表封面靠这个全局信号。
 */
export const listCoverNonce: Ref<number> = ref(0);

let _visibilityListenerInstalled = false;

export function installListCoverVisibilityRecovery(): void {
  if (_visibilityListenerInstalled) return;
  _visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' || !document.hidden) {
      listCoverNonce.value += 1;
    }
  });
}

/** 同一首歌最多自动重试几次加载失败的封面。 */
const MAX_COVER_RETRIES = 2;
/** 自动重试的间隔，避开「失败瞬间立刻重试还是同样失败」。 */
const COVER_RETRY_DELAY_MS = 1200;
/** 强制刷新后等多久，仍然 `load` / `error` 一个都没来就再补一次。 */
const COVER_VISIBILITY_WATCHDOG_MS = 1500;

interface CoverTask {
  cancelled: boolean;
  granted: boolean;
  resolve: () => void;
}

export interface CoverSlot {
  promise: Promise<void>;
  release: () => void;
}

let activeCovers = 0;
const coverQueue: CoverTask[] = [];

function appendQuery(url: string, name: string, value: string): string {
  if (new RegExp(`(?:\\?|&)${name}=`).test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(value)}`;
}

/** Build an image URL that works in both the browser and WebF image elements. */
export function songCoverUrl(song: Song | null | undefined, width: number): string {
  let url = song?.cover_url?.trim() || '';
  if (!url) return '';

  // Preview/test data and external CDNs do not use Songloft resource authentication.
  if (/^(?:data:|blob:)/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) {
    try {
      if (new URL(url).origin !== window.location.origin) return url;
    } catch {
      return '';
    }
  } else {
    if (!url.startsWith('/')) url = `/${url}`;
    // 反代 BASE_PATH 子路径部署下，绝对路径会绕过 BASE_PATH 直接打到域名根
    // （songloft-org/songloft#407），补上从当前页面路径推出的 BASE_PATH 前缀。
    url = `${hostPathPrefix()}${url}`;
  }

  url = appendQuery(url, 'w', String(Math.max(1, Math.round(width))));
  const token = window.SongloftPlugin?.getAuthToken?.() || '';
  return token ? appendQuery(url, 'access_token', token) : url;
}

export interface SongCover {
  /** 绑到 `<img :src>`；为空串时说明该显示占位图。 */
  src: ComputedRef<string>;
  /**
   * 绑到 `<img :key>`。每次强制刷新都自增，逼 Vue **卸掉旧 `<img>` 再插一个新的**，
   * 而不是就地改 `src`。单调递增：值一旦回退，Vue 就有机会复用到那个坏掉的旧元素。
   * 为什么光换 URL 不够见 `useSongCover` 的注释③。
   */
  epoch: Ref<number>;
  /** 绑到 `<img @error>`。 */
  onError: () => void;
  /** 绑到 `<img @load>`。重试预算是「每段连续失败」而非「每首歌」，靠它归零。 */
  onLoad: () => void;
}

/**
 * 播放器封面（PlayerBar / FullscreenPlayer 共用）。
 *
 * 这里的两条设计都是 songloft-org/songloft-plugin-miot#86「切标签回来封面永久
 * 丢失」的直接产物，改动前请先读完：
 *
 * ① **失败标记不能是粘滞闩锁。** 以前是 `coverFailed=true` 之后只有「换歌」能复位，
 *    于是任何一次瞬时失败都等于「这首歌的封面这一整个会话都没了」。而 WebF 的
 *    `ImageElement._onImageError` **重试成功也照样派发 `error` 事件**
 *    （`hadTryReload` 是元素级、永不复位），所以这个闩锁被无谓扣上的概率很高。
 *
 * ② **复位必须真正换掉 `src`，光清标记不够。** WebF 的 `_loadNormalImage` 会
 *    `evict(BoxFitImageKey(url, ImageConfiguration.empty), includeLive: true)`
 *    紧接着又用同一个 key 去 resolve，且宿主的 `imageCache` 是**和 Flutter 侧曲库
 *    封面共用同一个池子**——切到曲库刷一屏封面正好加剧它的周转。结果是切回来时
 *    可能画着一个已 dispose 的 `ui.Image`：**空白，但不发 error 事件**。这种情况下
 *    `src` 不变就不会重新解码，清标记完全无效。带一个自增的 `_r` 参数换掉 URL，
 *    才能让 WebF 走 `set src` → 新 provider → 新 stream → 重新解码。
 *
 * ③ **换 URL 也还不够，必须换掉 `<img>` 元素本身。** #96 第三次复发给出的判据是
 *    「封面丢失后**切歌也不出图**」——而换歌本来就会走 WebF 的 `set src`
 *    （`_cachedImageInfo = null` → `_stopListeningStream` → 完整重新加载一遍），
 *    连它都救不回来，说明坏的不是 URL / 缓存键，而是这个 `ImageElement` 的**绘制链路**：
 *    真正上屏的是 `ImageState.build` 里的 `WebFRawImage(image: _cachedImageInfo?.image)`，
 *    而解码完成后要重绘**只能**靠 `_handleImageFrame` 里的 `state!.requestStateUpdate()`，
 *    `state` 取的是 `_imageState` 里 mounted 的那个 `ImageState`。这个集合一旦空了
 *    （Tab 被 `Offstage` 期间 Flutter 侧回收掉了那棵子树），`_handleImageFrame` 的两个分支
 *    都不成立、连 `_hasPendingImageUpdate` 兜底都不置位 —— 图片照常下载、照常解码、
 *    `load` 事件照常派发，但**永远不重绘**。表现正是用户报的「空白 + 不发 error +
 *    换任何 src 都没用」，而同页 96px 的 `PlayerBar` 封面同时是好的（同一个 composable、
 *    同一个 token，差别只在元素本身），也只有这条解释得通。
 *    出路是让 Vue 卸掉旧 `<img>` 再建一个新的（`:key` 绑 `epoch`）：新元素走的是「首次
 *    打开全屏播放器」那条已知可用的挂载路径，会拿到全新的 `ImageElement` + `WebFImage`
 *    + `ImageState`，并顺带绕掉元素级、永不复位的 `hadTryReload` 闩锁。
 *    `_r` 仍然要保留 —— 新元素若解析到同一个 `BoxFitImageKey`，`imageCache` 可能把那个
 *    已 dispose 的 completer 直接还给它，等于白换。
 *
 * `visibilitychange` 由宿主推：WebF 自己只在 App 级前后台切换时派发它，Tab 切换
 * 在 JS 侧完全不可见，所以客户端补了 `PluginRenderController.setPageVisible`。
 * 老客户端不推这个事件时，本 composable 退化为「② 之外仍有 ① 的有限次重试」。
 */
export function useSongCover(getSong: () => Song | null | undefined, width: number): SongCover {
  const failed = ref(false);
  // 0 表示「原始 URL」，不加 `_r` 参数，避免给正常路径也带上无意义的查询串。
  const nonce = ref(0);
  // `<img :key>` 用。与 `nonce` 分开：`nonce` 在换歌时归 0（URL 本来就变了，不需要 `_r`），
  // 而 key 一旦回退到旧值，Vue 就有机会复用到那个绘制链路已经断掉的旧元素。
  const epoch = ref(0);
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  // 每个可见期只补一次看门狗，别把「这张图真的是 404」变成无限重建。
  let watchdogUsed = false;

  function clearRetryTimer(): void {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function clearWatchdog(): void {
    if (watchdogTimer === null) return;
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }

  const src = computed(() => {
    if (failed.value) return '';
    const url = songCoverUrl(getSong(), width);
    if (!url || nonce.value === 0) return url;
    return appendQuery(url, '_r', String(nonce.value));
  });

  /**
   * 强制重新拉取：清失败态 + 换 URL（注释②）+ 换元素（注释③）。
   *
   * 两件事都要做：换 URL 是为了不让 `imageCache` 把同一个已 dispose 的 completer 还回来，
   * 换元素是为了拿到一个真正挂上了 `ImageState` 的新 `ImageElement`。少任何一件都修不好。
   */
  function reload(): void {
    clearRetryTimer();
    failed.value = false;
    nonce.value += 1;
    epoch.value += 1;
  }

  /**
   * 强制刷新后 `load` / `error` 一个都没来 → 再补一次。
   *
   * 针对 WebF 的另一种失效：`_updateImageData` 那条任务链（`Debounce` → `addPostFrameCallback`
   * → `registerCallbackOnceForFlutterAttached`）卡住时，图既不加载也不报错，页面侧完全没有
   * 可观测事件，`onError` 的重试路径永远不会被触发。
   */
  function armWatchdog(): void {
    clearWatchdog();
    if (watchdogUsed) return;
    watchdogTimer = setTimeout(() => {
      watchdogTimer = null;
      // 已经又切走了就别白重建一次：下一次可见会重新走 reload + armWatchdog。
      if (document.visibilityState !== 'visible' && document.hidden) return;
      watchdogUsed = true;
      // 这条日志是给 #96 下一轮留的取证：它出现 = 图既没 load 也没 error，
      // 即 WebF 的加载链路卡死（而不是解码成功却没重绘）。页面 console 会进客户端日志。
      console.log(`[miot] cover watchdog fired w=${width} epoch=${epoch.value}`);
      reload();
    }, COVER_VISIBILITY_WATCHDOG_MS);
  }

  function onError(): void {
    clearWatchdog();
    if (retries >= MAX_COVER_RETRIES) {
      // 重试用尽才落到占位图。真 404 的封面不该无限重试下去。
      // `clearRetryTimer()` 不能省：上一次失败排的定时器还在飞，不撤掉的话它会在
      // 1.2s 后把已经放弃的图又复活一次（浏览器实测过，见 #86）。
      clearRetryTimer();
      failed.value = true;
      return;
    }
    retries += 1;
    // 先摘掉 `<img>` 再换 URL 重挂，确保拿到的是全新的 ImageElement
    // （WebF 的 `hadTryReload` 是元素级的，复用旧元素等于放弃它自己那次重试）。
    failed.value = true;
    clearRetryTimer();
    retryTimer = setTimeout(reload, COVER_RETRY_DELAY_MS);
  }

  /**
   * 加载成功就把重试预算还回去，让预算的含义是「每段连续失败」而非「每首歌」。
   *
   * 这条对本 bug 的场景很实在：插件 Tab 靠 Offstage 无限期保活，同一个组件实例可能
   * 活好几个小时。没有它的话，早上偶发失败两次就把额度耗光，之后整天都只能靠
   * 「换歌」或「重新可见」才救得回来。
   */
  function onLoad(): void {
    clearWatchdog();
    retries = 0;
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible' || !document.hidden) {
      // 重置重试预算与看门狗额度：这是一次新的展示机会，不该受上一次可见期的失败次数拖累。
      retries = 0;
      watchdogUsed = false;
      reload();
      armWatchdog();
      // 同样是给 #96 下一轮留的取证：这条不出现 = 宿主没推可见性通知（客户端太老 /
      // setPageVisible 没走到），出现了但封面仍空白 = 换元素这条路也没能重建绘制链路。
      console.log(`[miot] cover reload on visible w=${width} epoch=${epoch.value}`);
    }
  }

  // 换歌时回到干净状态：URL 本来就变了，不需要 `_r`。
  watch(
    () => {
      const song = getSong();
      return [song?.id, song?.cover_url];
    },
    () => {
      clearRetryTimer();
      clearWatchdog();
      retries = 0;
      watchdogUsed = false;
      failed.value = false;
      nonce.value = 0;
      // `epoch` 刻意**不**归零：换歌时 URL 本来就变了、就地换 `src` 够用，而 key 回退会让
      // Vue 复用到旧元素。它只在 `reload()` 里自增，所以换歌不会白白重建一次 `<img>`。
    },
  );

  onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
  onUnmounted(() => {
    clearRetryTimer();
    clearWatchdog();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { src, epoch, onError, onLoad };
}

function pumpCoverQueue(): void {
  while (activeCovers < MAX_CONCURRENT_COVERS && coverQueue.length) {
    const task = coverQueue.shift();
    if (!task || task.cancelled) continue;
    activeCovers += 1;
    task.granted = true;
    task.resolve();
  }
}

/** Limit WebF image requests so fast list scrolling cannot saturate the host. */
export function acquireCoverSlot(): CoverSlot {
  let resolvePromise = (): void => undefined;
  const task: CoverTask = {
    cancelled: false,
    granted: false,
    resolve: () => resolvePromise(),
  };
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  if (activeCovers < MAX_CONCURRENT_COVERS) {
    activeCovers += 1;
    task.granted = true;
    task.resolve();
  } else {
    coverQueue.push(task);
  }

  return {
    promise,
    release() {
      if (task.cancelled) return;
      task.cancelled = true;
      if (task.granted) {
        activeCovers = Math.max(0, activeCovers - 1);
        pumpCoverQueue();
      }
    },
  };
}
