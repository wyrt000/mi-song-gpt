<script setup lang="ts">
import { ref } from 'vue';
import { useNativeList } from '../runtime';

defineProps<{ ariaLabel?: string }>();
const emit = defineEmits<{ scroll: [Event] }>();

/**
 * 滚动位置的读写与 `@scroll` 事件，供 MainPage 的虚拟列表定位窗口用。
 *
 * ⚠️ 原生分支当前**停用**：`runtime.ts` 的 `useNativeList` 恒为 false
 * （songloft-org/songloft#444：`ListView.builder` 不随 Vue 对 childNodes 的动态
 * patch 重新渲染，虚拟窗口一滑动列表就整片空白，真机 A/B 实测钉死结论）。
 * 模板分支与下方原生分支的实测笔记保留作存档，待 WebF 修复后按 #444 路径重测回切。
 *
 * 原生分支也绑 `@scroll`：WebF 的 `handleScroll` 只在**挂了监听器**时才派发 DOM `scroll`
 * （`_dispatchScrollEvent`），不绑就永远收不到。
 *
 * 实测结论（WebF 0.24.27，真实 miot 构建产物 + 假后端 2000 首歌，#97 修复后跑通）：
 *  - 渲染的是 `<webf-list-view>`（非 `div.sl-list-view-html`），`clientHeight` 读得到，
 *    首尾 spacer 与虚拟窗口协同正常（`0px,126080px` ≈ (2000−30)×64）。
 *  - `scrollTop` **读**：实时返回数值，绑定是活的。
 *  - `@scroll` **派发**：滚动事件被监听器收到。
 *  - `MainPage.scrollToIndex` **精确落点**：点「定位当前播放」（定位第 1500 首）后
 *    `scrollTop` 一次落到 95807px（= 1499×64 − (viewport−64)/2），首行变第 1485 首、
 *    当前歌居中可见，无需重试。
 *  - 机理（`webf_list_view.dart` 的 `build`）：内部是 `ListView.builder`，
 *    `itemCount = childNodes.length`，`maxScrollExtent` 按**已布局子节点的平均高度**外推
 *    未布局的。裸写一个大 offset（窗口在顶、十几万 px 的尾占位条尚未被布局）会被钳到
 *    ~1400px；但 `scrollToIndex` 先挪窗口（目标行附近变成已渲染区 + 一个已被布局测量的大
 *    顶占位条），`maxScrollExtent` 随之撑大，写入即精确落点。此前「裸写 32000 只滚到
 *    ~640px」是探针未先挪窗口的假象，非 bug。
 */
const root = ref<HTMLElement | null>(null);

/** 当前滚动位置（px）。列表尚未布局时为 0。 */
function scrollTop(): number {
  return root.value?.scrollTop ?? 0;
}

/** 滚到指定位置。WebF 布局是异步的，列表还没有滚动范围时这次写入会被忽略，调用方需自行校验。 */
function setScrollTop(value: number): void {
  if (!root.value) return;
  root.value.scrollTop = Math.max(0, Math.round(value));
}

/** 可视区高度（px）。用来决定虚拟窗口要渲染多少行。 */
function clientHeight(): number {
  return root.value?.clientHeight ?? 0;
}

defineExpose({ scrollTop, setScrollTop, clientHeight });
</script>

<template>
  <webf-list-view
    v-if="useNativeList"
    ref="root"
    class="sl-list-view"
    shrink-wrap="false"
    scroll-direction="vertical"
    :aria-label="ariaLabel"
    @scroll="emit('scroll', $event)"
  >
    <slot />
  </webf-list-view>
  <div v-else ref="root" class="sl-list-view sl-list-view-html" :aria-label="ariaLabel" @scroll="emit('scroll', $event)">
    <slot />
  </div>
</template>
