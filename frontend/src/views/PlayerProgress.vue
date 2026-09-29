<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useNativeSlider, isWebFRuntime } from '../runtime';
import { bindNativeAttrs } from '../ui/nativeProps';

const props = withDefaults(
  defineProps<{ position: number; duration: number; mini?: boolean; disabled?: boolean }>(),
  { mini: false, disabled: false },
);
const emit = defineEmits<{ seek: [number] }>();

const dragging = ref(false);
const dragPosition = ref(props.position);
const seekShell = ref<HTMLElement | null>(null);
const nativeSlider = ref<HTMLElement | null>(null);
const safeDuration = computed(() => Math.max(0, Number(props.duration) || 0));
const safeMax = computed(() => Math.max(1, safeDuration.value - 3));
const displayPosition = computed(() => dragging.value ? dragPosition.value : Math.max(0, Number(props.position) || 0));
const progress = computed(() => safeDuration.value > 0 ? Math.min(1, displayPosition.value / safeDuration.value) : 0);
const progressStyle = computed(() => ({ width: `${progress.value * 100}%` }));
const thumbStyle = computed(() => {
  const percent = progress.value * 100;
  return { left: `calc(6px + ${percent}% - ${progress.value * 12}px)` };
});

watch(() => props.position, (value) => {
  if (!dragging.value) dragPosition.value = value;
});

function time(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

// --- Native slider (songloft-slider) for WebF ---
// 必须走 attribute：`songloft_slider.dart` 只读 getAttribute（见 ui/nativeProps.ts）。
// 用 property 的话 min/max 恒为默认的 0/100，拖动进度条会把一首 3 分半的歌
// 映射成 0~100 秒的量程 —— 视觉上看不出来（轨道与滑块是另外的 div，原生元素
// opacity 0 只当手势层），但 seek 到的位置是错的。
bindNativeAttrs(nativeSlider, () => ({
  value: displayPosition.value,
  min: 0,
  max: safeMax.value,
  step: 1,
  disabled: props.disabled || safeDuration.value <= 0,
  orientation: 'horizontal',
}));

function nativeInput(event: Event): void {
  const detail = (event as CustomEvent).detail;
  const val = Number((event as InputEvent).data ?? detail ?? (event.target as HTMLInputElement).value);
  dragging.value = true;
  dragPosition.value = val;
}

function nativeChange(event: Event): void {
  const detail = (event as CustomEvent).detail;
  const val = Number((event as InputEvent).data ?? detail ?? (event.target as HTMLInputElement).value);
  if (!dragging.value) dragging.value = true;
  dragPosition.value = val;
  dragging.value = false;
  emit('seek', val);
}

// --- Touch/mouse drag handling on the shell (WebF fallback without native slider) ---
const useTouchSeek = isWebFRuntime && !useNativeSlider;

function positionFromX(clientX: number): number {
  const shell = seekShell.value;
  if (!shell) return 0;
  const rect = shell.getBoundingClientRect();
  const padding = 6;
  const trackWidth = rect.width - padding * 2;
  if (trackWidth <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left - padding) / trackWidth));
  return Math.round(ratio * safeMax.value);
}

function onTouchStart(event: TouchEvent): void {
  if (!useTouchSeek) return;
  if (props.disabled || safeDuration.value <= 0) return;
  const touch = event.touches[0];
  if (!touch) return;
  dragging.value = true;
  dragPosition.value = positionFromX(touch.clientX);
}

function onTouchMove(event: TouchEvent): void {
  if (!dragging.value) return;
  const touch = event.touches[0];
  if (!touch) return;
  event.preventDefault();
  dragPosition.value = positionFromX(touch.clientX);
}

function onTouchEnd(): void {
  if (!dragging.value) return;
  dragging.value = false;
  emit('seek', dragPosition.value);
}

function onMouseDown(event: MouseEvent): void {
  if (!useTouchSeek) return;
  if (props.disabled || safeDuration.value <= 0) return;
  dragging.value = true;
  dragPosition.value = positionFromX(event.clientX);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(event: MouseEvent): void {
  if (!dragging.value) return;
  event.preventDefault();
  dragPosition.value = positionFromX(event.clientX);
}

function onMouseUp(): void {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  if (!dragging.value) return;
  dragging.value = false;
  emit('seek', dragPosition.value);
}

// --- Standard input range (browser) ---
function valueFrom(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}

function update(event: Event): void {
  dragging.value = true;
  dragPosition.value = valueFrom(event);
}

function commit(event: Event): void {
  if (!dragging.value) return;
  dragPosition.value = valueFrom(event);
  dragging.value = false;
  emit('seek', dragPosition.value);
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div v-if="mini" class="player-mini-progress" aria-hidden="true">
    <div class="player-mini-progress-active" :style="progressStyle"></div>
  </div>
  <div v-else class="player-full-progress">
    <span class="player-progress-time">{{ time(displayPosition) }}</span>
    <div
      ref="seekShell"
      class="player-seek-shell"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @mousedown="onMouseDown"
    >
      <div class="player-seek-track">
        <div class="player-seek-active" :style="progressStyle"></div>
      </div>
      <span class="player-seek-thumb" :style="thumbStyle"></span>
      <!-- WebF: native slider element (most reliable) -->
      <songloft-slider
        v-if="useNativeSlider"
        ref="nativeSlider"
        class="player-seek-input"
        @input="nativeInput"
        @change="nativeChange"
      />
      <!-- WebF without native slider: touch area (handled by shell events above) -->
      <div
        v-else-if="useTouchSeek"
        class="player-seek-input player-seek-touch-area"
        role="slider"
        :aria-label="'播放进度'"
        :aria-valuemin="0"
        :aria-valuemax="safeMax"
        :aria-valuenow="displayPosition"
      ></div>
      <!-- Browser: standard range input -->
      <input
        v-else
        class="player-seek-input"
        type="range"
        :value="displayPosition"
        :min="0"
        :max="safeMax"
        :step="1"
        :disabled="disabled || safeDuration <= 0"
        aria-label="播放进度"
        @input="update"
        @change="commit"
      />
    </div>
    <span class="player-progress-time">{{ time(safeDuration) }}</span>
  </div>
</template>
