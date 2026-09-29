<script setup lang="ts">
import SlIcon from './SlIcon.vue';

// ⚠️ **单一 HTML 实现，刻意不做 cupertino 按钮的原生分支**
// （songloft-org/songloft#440；tests/run.mjs 有硬断言防止加回）。
//
// WebF 的 `flex-wrap: wrap` 容器（.inline-fields / .field-actions 等）测量 auto 宽度
// 子项的 flex 基线时，会把子项 maxWidth 放松到 ∞；cupertino 按钮是 `RenderWidget`
// （非 replaced），`RenderWidget._layoutChild` 把 ∞ **clamp 回视口宽度**、再把视口级
// 约束传给内容层 —— 按钮宽 = 视口宽 + 两侧 padding，超出屏幕、每个按钮独占一行
// （机理逐环见主仓 `docs/webf/handoff.md` 第 21 条；`⛔ 不要用 max-width 夹`、
// `⛔ 不要只把 wrap 改 nowrap` 两条禁区也在同条）。
//
// downloader 插件 2026-08 已实证此路不通并删除 cupertino 分支（其 `style.css`
// 约束⑦⑧），本组件与其对齐。另：`CupertinoButton.filled` 的底色不接受 CSS
// `background-color`（handoff 第 23 条），ThemePack 下原生按钮外观本来也不对。
// 哪天 WebF 修好 WidgetElement 的基线测量再考虑恢复原生分支。
withDefaults(
  defineProps<{
    label?: string;
    icon?: string;
    playerIcon?: boolean;
    iconSize?: number;
    trailingIcon?: string;
    variant?: 'filled' | 'outlined' | 'text' | 'icon' | 'tonal';
    disabled?: boolean;
    title?: string;
    block?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'text', type: 'button' },
);
defineEmits<{ click: [MouseEvent] }>();
</script>

<template>
  <button
    class="sl-button"
    :class="[`sl-button-${variant}`, { 'sl-button-block': block }]"
    :disabled="disabled"
    :title="title"
    :aria-label="variant === 'icon' ? label || title : undefined"
    :type="type"
    @click="$emit('click', $event)"
  >
    <span class="sl-button-content">
      <SlIcon v-if="icon" :name="icon" :size="iconSize ?? (variant === 'icon' ? 22 : 18)" :player-icon="playerIcon" />
      <span v-if="label && variant !== 'icon'" class="sl-button-label">{{ label }}</span>
      <SlIcon v-if="trailingIcon" :name="trailingIcon" :size="18" />
    </span>
  </button>
</template>
