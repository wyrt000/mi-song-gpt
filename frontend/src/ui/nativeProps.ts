import type { Ref } from 'vue';
import { onMounted, watchEffect } from 'vue';

/**
 * 以 **JS property** 形式喂原生元素。
 *
 * 适用于 `flutter-cupertino-*`：`webf_cupertino_ui` 在 Dart 侧为这些元素注册了
 * property 绑定，property 才是它们的正经入口。
 */
export function bindNativeProps(
  element: Ref<HTMLElement | null>,
  props: () => Record<string, unknown>,
): void {
  const apply = () => {
    const target = element.value as (HTMLElement & Record<string, unknown>) | null;
    if (!target) return;
    for (const [key, value] of Object.entries(props())) target[key] = value;
  };
  onMounted(apply);
  watchEffect(apply);
}

/**
 * 以 **HTML attribute** 形式喂原生元素。
 *
 * `<songloft-slider>`（宿主 `songloft_slider.dart`）全程只读 `getAttribute`，
 * 而 WebF 的 `WidgetElement` 没有 property → attribute 反射，所以对它用
 * [bindNativeProps] 等于什么都没传：orientation 恒为 horizontal、value 恒等于
 * min、尺寸落回默认 160×28 —— 这就是 songloft-org/songloft-plugin-miot#81 里
 * 「音量滑块横着、停在 0、还溢出弹出层」的成因。
 *
 * 刻意不在模板里用 `:value="..."` 直接绑：Vue 对含连字符的自定义元素走
 * `key in el` 判定，而 WebF 元素上 `'value' in el` 为真（对**任何** WebF 元素都为
 * 真，连未注册标签也是，见 `runtime.ts` 的 nativeMemberProbe 注释），
 * 于是又会写成 property。
 *
 * `false` / `null` / `undefined` 一律 `removeAttribute`：宿主对 `disabled`
 * 是「属性存在即禁用」的语义，留一个 `disabled="false"` 反而会被当成禁用。
 * `true` 写成空串，与 HTML 布尔属性一致。
 */
export function bindNativeAttrs(
  element: Ref<HTMLElement | null>,
  attrs: () => Record<string, string | number | boolean | null | undefined>,
): void {
  // 记住上次真正写下去的值，只写变化的那几个。
  // 不是纯粹的性能优化：进度条每秒都会重算全部 6 个属性，而 WebF 的 setAttribute
  // 每次都跨 JS→Dart 桥并触发一次 requestUpdateState，无脑重写会变成每秒 6 次
  // 无谓的重建请求。
  let applied: Record<string, string | null> = {};
  let appliedTo: HTMLElement | null = null;
  const apply = () => {
    const target = element.value;
    if (!target) return;
    if (target !== appliedTo) {
      // 换了元素（v-if 切换、父级 key 变化导致重建）就作废缓存，
      // 否则新元素会因为「值没变」而一个属性都拿不到。按元素身份判断而不是挂在
      // onMounted 上：onMounted 每个组件实例只跑一次，同实例内换元素它不会再触发。
      applied = {};
      appliedTo = target;
    }
    for (const [key, value] of Object.entries(attrs())) {
      const next =
        value === null || value === undefined || value === false
          ? null
          : value === true
            ? ''
            : String(value);
      if (applied[key] === next) continue;
      applied[key] = next;
      if (next === null) target.removeAttribute(key);
      else target.setAttribute(key, next);
    }
  };
  onMounted(apply);
  watchEffect(apply);
}
