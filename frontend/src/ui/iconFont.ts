// 图标字体就绪探测（只为 WebF 存在）。
//
// ── 为什么需要这个东西 ────────────────────────────────────────────────────
//
// WebF 的 `@font-face` 是**布局期懒加载**：`CSSText.createTextSpan` 在排版时
// fire-and-forget 调 `CSSFontFace.ensureFontLoaded`，字体到货后**只给第一个
// 请求者**的 renderStyle 打 `markNeedsLayout()`；同一批并发请求者走
// `if (existingLoad != null) return existingLoad;` 直接 return，**永远拿不到脏标记**
// （webf 0.24.27 `lib/src/css/font_face.dart`）。于是这些图标的段落缓存永久停在
// fallback 字形：BMP 私有区落成方块 ▯，而播放器图标用的是平面 15 私有区码点
// （U+F0056 / U+F0192 / U+F0193 …），在把 SPUA-A 映射进 emoji 字体的 ROM
// （HyperOS 等）上会渲染成 🎯🔻🎪 这类**完全无关的 emoji**。
// 第二次进页面就正常，是因为 `_loadedFonts` 是跨 controller 的 static——
// 这正是 songloft-org/songloft-plugin-miot#81 里「关掉播放器再回来就好了」的由来。
//
// ── 做法 ──────────────────────────────────────────────────────────────────
//
// 插件改不了 pub 依赖，只能不依赖那条重排路径：自己判断字体何时真的生效，
// 然后让所有图标元素**重建**（`SlIcon` 把 [iconFontEpoch] 放进 `:key`），
// 重建出来的文本节点会重新排版，此时 `_loadedFonts` 已命中，拿到的就是真字形。
//
// 判据是**离屏探针对比**：同一个码点、同一个字号，一份用真图标字体、一份用一个
// 故意不存在的 family。两者都 fallback 到系统字体时宽度相同；真字体生效后
// 宽度必然分叉（图标字体的 advance 恒等于 1em）。刻意不用 `document.fonts`
// ——WebF 没有实现 FontFaceSet。
import { ref } from 'vue';
import { isWebFRuntime } from '../runtime';

/** 图标字形是否可以画了。非 WebF（浏览器 / 系统 WebView）不受影响，直接为真。 */
export const iconFontReady = ref(!isWebFRuntime);

/** 每次自增都让所有 `SlIcon` 重建，从而重新排版拿到最新字体。 */
export const iconFontEpoch = ref(0);

/** 探针字号：越大宽度差越明显，1em advance 与 fallback 的差值也越难被取整吃掉。 */
const PROBE_FONT_SIZE = 100;

/** 一定不存在的 family，作为「纯 fallback」参照。 */
const MISSING_FAMILY = 'SlIconProbeMissing';

/** 轮询间隔。 */
const POLL_INTERVAL = 50;

/**
 * 最迟多久必须放行字形。探测失败（fallback 宽度恰好等于 1em）时的兜底：
 * 宁可显示可能不对的字形，也不能让图标永远空着。
 */
const RELEASE_TIMEOUT = 500;

/** 分叉探测总时长上限。慢网下字体可能几秒后才到，这段时间里要继续补 epoch。 */
const WATCH_TIMEOUT = 8000;

/** 探测失灵时的无条件重建时刻（ms）。见 startProbing 里的说明。 */
const SAFETY_BUMPS = [1500, 4000];

/**
 * 探针码点刻意挑 BMP 私有区（两个字体里都确实有），避免探针自己踩上
 * 「平面 15 码点在某些 ROM 上被 emoji 字体接管」那条坑。也刻意用
 * `String.fromCodePoint` 而不是把私有区字符直接写进源码——那种字符在
 * 编辑器与终端里都不可见，被改坏了看不出来。
 */
const PROBES: Array<{ family: string; glyph: string }> = [
  { family: 'Miot UI Icons', glyph: String.fromCodePoint(0xe88e) }, // info
  { family: 'Material Icons Player', glyph: String.fromCodePoint(0xe25b) }, // favorite
];

function createProbe(family: string, glyph: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = glyph;
  el.setAttribute('aria-hidden', 'true');
  // 两条都不能改成看起来更「干净」的写法：
  // ① 用 opacity 而非 `display: none` / `visibility: hidden` —— 前者不参与布局，
  //    也就永远不会触发字体加载；后者虽然参与布局，但语义树里会被跳过，没必要冒险。
  // ② 挪到 `left: -9999px` 而不是留在 (0,0) —— WebF **没有实现 pointer-events**
  //    （`css_property_name.dart` 里只有属性名映射，渲染侧完全不消费），留在左上角
  //    的 100×100 透明盒子会吞掉那一块的点击，而设置页的返回箭头正好在那儿。
  el.style.cssText =
    'position: fixed; top: 0; left: -9999px; opacity: 0;' +
    'white-space: pre; line-height: 1;' +
    `font-size: ${PROBE_FONT_SIZE}px; font-family: '${family}';`;
  document.body.appendChild(el);
  return el;
}

function widthOf(el: HTMLElement): number {
  try {
    return el.getBoundingClientRect().width;
  } catch {
    return 0;
  }
}

/** WebF 没给 Element 绑 `remove()`，只能走 parentNode.removeChild。 */
function dropProbe(el: HTMLElement): void {
  try {
    el.parentNode?.removeChild(el);
  } catch {
    /* 清理失败无所谓：探针是 opacity 0 且已挪出视口的空盒子 */
  }
}

/**
 * 安装探针并开始轮询。幂等，只在 WebF 下有副作用。
 *
 * 必须在 Vue mount **之前**调用：探针要抢到「第一个请求者」的位置，
 * 那是 WebF 唯一会在字体到货后重排的那个节点，也就是我们能观测到分叉的前提。
 */
let installed = false;

export function installIconFontWatch(): void {
  if (!isWebFRuntime || installed) return;
  installed = true;
  try {
    startProbing();
  } catch {
    // 探测机制自己出问题，绝不能把图标永久藏起来 —— 退化成修复前的行为
    // （可能先闪一下 fallback 字形），而不是整个 UI 没有图标。
    iconFontReady.value = true;
  }
}

function startProbing(): void {
  if (!document.body) {
    iconFontReady.value = true;
    return;
  }

  const probes = PROBES.map((p) => ({
    real: createProbe(p.family, p.glyph),
    fallback: createProbe(MISSING_FAMILY, p.glyph),
    diverged: false,
  }));

  const startedAt = Date.now();
  let released = false;
  let nextSafetyBump = 0;
  const timer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    let changed = false;
    for (const probe of probes) {
      if (probe.diverged) continue;
      const real = widthOf(probe.real);
      const fallback = widthOf(probe.fallback);
      if (real > 0 && Math.abs(real - fallback) > 0.5) {
        probe.diverged = true;
        changed = true;
      }
    }
    const allDiverged = probes.every((probe) => probe.diverged);

    if (!released && (allDiverged || elapsed >= RELEASE_TIMEOUT)) {
      released = true;
      iconFontReady.value = true;
      iconFontEpoch.value += 1;
      // 留一条日志：这类问题一定会再犯（换字体、换 WebF 版本、动 CSS 都可能），
      // 而它的表现是「图标是错的」而不是报错。届时先看这行是走了探测还是超时。
      console.log(
        `[miot] icon font released after ${elapsed}ms via ` +
          (allDiverged ? 'probe divergence' : 'timeout'),
      );
    } else if (released && changed) {
      // 放行之后才到货的字体：再重建一轮，否则这批图标又会永久停在 fallback。
      iconFontEpoch.value += 1;
      console.log(`[miot] icon font diverged late at ${elapsed}ms, icons rebuilt`);
    }

    // 分叉探测有个盲区：万一 fallback 字形的 advance 恰好也等于 1em，两个探针宽度
    // 永远相同，`changed` 就永远不为真。此时靠这几个无条件重建兜住「字体在放行之后
    // 才到货」的情况。重建一轮只是重新排版几十个小 span，代价可以忽略。
    while (
      released &&
      !allDiverged &&
      nextSafetyBump < SAFETY_BUMPS.length &&
      elapsed >= SAFETY_BUMPS[nextSafetyBump]
    ) {
      nextSafetyBump += 1;
      iconFontEpoch.value += 1;
    }

    if (allDiverged || elapsed >= WATCH_TIMEOUT) {
      window.clearInterval(timer);
      for (const probe of probes) {
        dropProbe(probe.real);
        dropProbe(probe.fallback);
      }
    }
  }, POLL_INTERVAL);
}
