<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { navigation } from '../runtime';

const props = defineProps<{ modelValue: number; popupId: string; disabled?: boolean }>();
const emit = defineEmits<{ change: [number] }>();

// 档位与后端/插件侧 [0.5, 2.0] 夹紧区间一致，全部落在 atempo 单滤镜原生支持范围内。
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const current = computed(() => props.modelValue || 1);
const label = computed(() => {
  // 1 倍显示「1×」而非「1.0×」，其余保留两位有效数字。
  const v = current.value;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2).replace(/0$/, '')}×`;
});
const open = computed(() => navigation.playerPopup === props.popupId);
const anchor = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({});

function speedLabel(v: number): string {
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toString()}×`;
}

function positionPopup(): void {
  const element = anchor.value;
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const mobile = window.innerWidth < 600;
  const panelWidth = mobile ? 140 : 160;
  const itemHeight = mobile ? 44 : 48;
  const panelHeight = SPEEDS.length * itemHeight + 16;
  const edgeInset = 16;
  const gap = 8;
  const centeredLeft = rect.left + rect.width / 2 - panelWidth / 2;
  const left = Math.max(edgeInset, Math.min(centeredLeft, window.innerWidth - panelWidth - edgeInset));
  const aboveTop = rect.top - panelHeight - gap;
  const top = aboveTop < edgeInset ? rect.bottom + gap : aboveTop;

  popupStyle.value = {
    height: `${panelHeight}px`,
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${panelWidth}px`,
  };
}

function handleViewportChange(): void {
  if (open.value) positionPopup();
}

watch(open, (isOpen) => {
  if (isOpen) {
    nextTick(positionPopup);
    window.addEventListener('resize', handleViewportChange);
    return;
  }
  window.removeEventListener('resize', handleViewportChange);
});

onBeforeUnmount(() => window.removeEventListener('resize', handleViewportChange));

function toggle(): void {
  if (!open.value) positionPopup();
  navigation.playerPopup = open.value ? '' : props.popupId;
}

function choose(speed: number): void {
  navigation.playerPopup = '';
  emit('change', speed);
}
</script>

<template>
  <div ref="anchor" class="player-popup-anchor" @click.stop>
    <button
      type="button"
      class="player-speed-button player-tool-button"
      :class="{ 'player-control-active': current !== 1 }"
      :title="`播放倍速 ${label}`"
      :disabled="disabled"
      @click="toggle"
    >{{ label }}</button>
    <template v-if="open">
      <div class="player-popup-dismiss" aria-label="关闭倍速菜单" @click="navigation.playerPopup = ''"></div>
      <div class="player-mode-popup player-speed-popup" :style="popupStyle" role="menu" aria-label="播放倍速">
        <button
          v-for="speed in SPEEDS"
          :key="speed"
          type="button"
          class="player-mode-option"
          :class="{ selected: speed === current }"
          role="menuitemradio"
          :aria-checked="speed === current"
          @click="choose(speed)"
        >
          <span class="player-speed-option-label">{{ speedLabel(speed) }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
