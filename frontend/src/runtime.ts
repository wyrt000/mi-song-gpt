import { reactive } from 'vue';
import { resolveConfirm, state } from './store';

export const isWebFRuntime = typeof window !== 'undefined' && !!window.webf;

/**
 * 探测某个原生元素在当前 WebF 里**真的可用**（songloft-org/songloft-plugin-miot#97）。
 *
 * ── 为什么不能用 `property in el` ──────────────────────────────────────────
 *
 * WebF 的绑定成员由 C++/QuickJS 侧的方法表在**取值**时解析，`in`（has_property）
 * 走不到那张表。webf 0.24.27 桌面探针实测（挂载前后一致）：
 *
 * | 标签 / 成员                          | `in`  | `typeof` |
 * |--------------------------------------|-------|----------|
 * | `webf-list-view` / `finishLoad`      | false | function |
 * | `flutter-cupertino-switch` / `checked` | false | boolean  |
 *
 * 所以旧写法让 `useNativeUI` / `useNativeList` 在 WebF 下**恒为 false** ——
 * 原生 Cupertino 控件与原生列表从未启用过。反方向同样错：`'value' in el` 对
 * **任何** WebF 元素都为 true（连未注册的标签也是），旧的 `useNativeSlider`
 * 因此是个假阳性，碰巧结论对而理由错。
 *
 * ── 两类元素、两条判据（都在真实 WebF 上逐条实测过）───────────────────────
 *
 * ① webf 内建元素与 `webf_cupertino_ui` 元素**有绑定成员**：直接 `typeof`
 *    取一个该元素独有的成员。未注册标签上它是 `undefined`（实测，且不会挂）。
 * ② `<songloft-slider>` 这类宿主 Dart 侧自定义元素**一个绑定成员都没有**
 *    （整个元素只读 attribute），见 [nativeDisplayProbe]。
 */
function nativeMemberProbe(tagName: string, member: string): boolean {
  if (!isWebFRuntime) return false;
  try {
    const element = document.createElement(tagName) as unknown as Record<string, unknown>;
    return typeof element[member] !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * 靠 `defaultStyle` 探测宿主 Dart 侧自定义元素是否已注册。
 *
 * `<songloft-slider>` 在 JS 侧与一个**未注册**的带连字符标签几乎无法区分，实测：
 *   - `Object.prototype.toString.call(el)` 两者都是 `[object WidgetElement]`；
 *   - `typeof el[任意成员]` 两者都是 `undefined`（它没有绑定成员可探）；
 *   - **`Object.getOwnPropertyNames(el)` 在未注册标签上会把 JS 线程挂死** ——
 *     实测表现是打完上一行日志后整页再无任何输出。它对已注册的 widget 元素能
 *     列出完整绑定表（很诱人），但绝不能用来做探测。
 *
 * 唯一可用的差异是元素自己声明的 `defaultStyle`：已注册的 `<songloft-slider>`
 * 是 `inline-block`（`songloft_slider.dart` 的 `defaultStyle`），未注册标签落到
 * WebF 的 `_UnknownHTMLElement`，那是 `block`。
 *
 * 两个必须遵守的前提：
 *   - **必须真的挂进文档**：游离态两者都是 `inline`，读不到 defaultStyle
 *     （WebF 只在 `applyStyle` 时套 defaultStyle，而那要求已挂载）。
 *     `display` 是**样式**不是布局，`getComputedStyle` 内部会同步 flush 样式，
 *     所以不用等帧，也不能改成读 `offsetHeight`（那个要等 Flutter 布局）。
 *   - **探测元素不带 class**，且页面 CSS 里没有针对裸 `songloft-slider` 标签的
 *     `display` 规则（已核对 theme.css / components.css / webf-shims.css /
 *     本插件 style.css）。哪天谁加了这样一条规则，这条探测会静默失效。
 */
function nativeDisplayProbe(tagName: string, expected: string): boolean {
  if (!isWebFRuntime || !document.body) return false;
  let host: HTMLElement | null = null;
  try {
    host = document.createElement('div');
    host.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;');
    const probe = document.createElement(tagName);
    host.appendChild(probe);
    document.body.appendChild(host);
    return window.getComputedStyle(probe).display === expected;
  } catch {
    return false;
  } finally {
    // 摘不掉也不能影响判定：留一个 0×0 的屏外空盒子，代价远小于抛错。
    try {
      if (host && host.parentNode) host.parentNode.removeChild(host);
    } catch {
      /* ignore */
    }
  }
}

export const useNativeUI = nativeMemberProbe('flutter-cupertino-switch', 'checked');
/**
 * 歌单列表是否用原生 `<webf-list-view>` 渲染。**恒为 false**（songloft-org/songloft#444）。
 *
 * 30e51e0 修好探测后该分支随 v2026.9.4 首次在生产启用，大歌单滚动随即出现
 * 空白/失联：真机（Android 14 WebF 0.24.27，2000 首歌单）复现定位到——JS 侧
 * 虚拟窗口完全正常（scrollTop 读数、窗口推进、DOM 内行内容都正确），但
 * `ListView.builder` 不把 Vue 动态 patch 的 childNodes（滑动的窗口行 + 高度变化的
 * 首尾占位条）重新渲染上屏：滚过初始窗口（约 30 行）后列表区持续空白，偶尔
 * 短暂刷出当前窗口又失联。div 分支（overflow 滚动容器）scrollHeight 是子元素
 * 真实高度之和，确定性的，没有"外推-钳制-失联"这一类问题；同一手势脚本 A/B
 * 对比，div 分支慢滚 400 步 + 连发 fling 全程逐帧渲染正确、零空白。
 *
 * 重新启用的前提：WebF 修复动态 childNodes 的渲染同步后，按 #444 的复现路径
 * （大歌单慢滚/快滚到底、日志核对窗口与屏幕一致）在真机重测通过，再恢复探测：
 * `nativeMemberProbe('webf-list-view', 'finishLoad')`。
 */
export const useNativeList = false;
export const useNativeSlider = nativeDisplayProbe('songloft-slider', 'inline-block');

export type AppPage = 'main' | 'settings' | 'player';

export const navigation = reactive({
  page: 'main' as AppPage,
  pageHistory: [] as AppPage[],
  settingsCategory: '',
  playerPopup: '',
  editorOpen: false,
  dialogOpen: false,
  devicePickerOpen: false,
});

export function openPage(page: AppPage): void {
  if (navigation.page === page) return;
  navigation.pageHistory.push(navigation.page);
  navigation.page = page;
  navigation.playerPopup = '';
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function closePage(): void {
  navigation.playerPopup = '';
  navigation.page = navigation.pageHistory.pop() || 'main';
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

// 宿主返回键回调：按「最上层浮层 → 编辑器 → 设置子分类 → 页面」的顺序收起，
// 每层都真正关闭并吞掉这次返回；没有浮层时返回 false 交由宿主处理。
// 之前 dialogOpen/editorOpen 从未被置位，导致弹窗/编辑器打开时返回键会直接退出页面。
export function consumeBack(): boolean {
  if (state.confirm.open) {
    resolveConfirm(false);
    return true;
  }
  if (navigation.devicePickerOpen) {
    navigation.devicePickerOpen = false;
    return true;
  }
  if (navigation.playerPopup) {
    navigation.playerPopup = '';
    return true;
  }
  if (navigation.editorOpen) {
    navigation.editorOpen = false;
    return true;
  }
  if (navigation.page === 'settings' && navigation.settingsCategory && window.innerWidth < 600) {
    navigation.settingsCategory = '';
    return true;
  }
  if (navigation.page !== 'main') {
    if (navigation.page === 'settings') navigation.settingsCategory = '';
    closePage();
    return true;
  }
  return false;
}

export function installHostBack(): void {
  if (!isWebFRuntime) return;
  window.SongloftPlugin?.onHostBack?.(consumeBack);
  // common.js 在 IIFE 加载期注册 `requestBack`，那时 webf methodChannel 可能尚未就绪，
  // 导致 handler 没注册上、宿主返回键永远拿不到「已消费」、直接退出页面。
  // 这里在插件 mount（methodChannel 已就绪）时再注册一次作为兜底，handler 逻辑与
  // common.js 等价（consumeBack 优先，其次浏览器历史回退）。
  const mc = (window as unknown as { webf?: { methodChannel?: { addMethodCallHandler?: (n: string, f: () => unknown) => void } } }).webf?.methodChannel;
  if (mc && typeof mc.addMethodCallHandler === 'function') {
    mc.addMethodCallHandler('requestBack', () => {
      try {
        if (consumeBack()) return true;
      } catch {
        /* 不能因插件回调抛错卡死返回键 */
      }
      if (window.history && window.history.length > 1) {
        window.history.back();
        return true;
      }
      return false;
    });
  }
}

/**
 * 通知宿主刷新收藏缓存（songloft-org/songloft-plugin-miot#86）。
 *
 * 我们只改了服务端数据，而 Flutter 侧曲库的红心读的是 `FavoriteNotifier` 的内存
 * 缓存，不推这一下就不会同步。
 *
 * ⚠️ **这个方法必须存在于 `common.js` 末尾那个 `window.SongloftPlugin` 字面量里。**
 * 上一版写的是 `SongloftPlugin?.invokeHost?.(...)`，而 `invokeHost` 当时只挂在
 * `window.__SongloftInternal`（内部句柄）、公开对象里并没有 —— 我们却在
 * `env.d.ts` 里自己声明了它，于是 TS 放行、运行时被可选调用**静默吞掉**，
 * 整个功能一个字节都没发出去。加宿主 API 前先去 `common.js` 核对那个字面量。
 *
 * 失败只吞掉：收藏本身已经成功了，不该因为缓存同步失败去打扰用户。
 */
export function notifyHostFavorite(songId: number, isFavorited: boolean): void {
  try {
    void window.SongloftPlugin?.favorite?.refresh?.(songId, isFavorited)?.catch(() => {});
  } catch {
    /* 老客户端没有 favorite 命名空间 */
  }
}

export const hostMode = reactive({ value: 'tab' as 'tab' | 'fullscreen' | 'browser' });

export function detectHostMode(): void {
  let available = false;
  try {
    available = !!window.SongloftPlugin?.host?.isAvailable?.();
  } catch {
    available = false;
  }
  if (!available) hostMode.value = 'browser';
  else if (document.documentElement.classList.contains('embed')) hostMode.value = 'fullscreen';
  else hostMode.value = 'tab';
  document.documentElement.classList.add(`miot-mode-${hostMode.value}`);
}
