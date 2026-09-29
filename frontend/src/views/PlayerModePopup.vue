<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { navigation } from '../runtime';
import type { PlayMode } from '../types';
import SlButton from '../ui/SlButton.vue';
import SlIcon from '../ui/SlIcon.vue';

const props = defineProps<{ modelValue: PlayMode; popupId: string; disabled?: boolean }>();
const emit = defineEmits<{ change: [PlayMode] }>();

const modes: Array<{ value: PlayMode; label: string; icon: string }> = [
  { value: 'order', label: '顺序播放', icon: 'format_list_numbered' },
  { value: 'loop', label: '列表循环', icon: 'repeat' },
  { value: 'single', label: '单曲循环', icon: 'repeat_one' },
  { value: 'random', label: '随机播放', icon: 'shuffle' },
  { value: 'singlePlay', label: '单曲播放', icon: 'looks_one' },
];
const current = computed(() => modes.find((mode) => mode.value === props.modelValue) || modes[0]);
const open = computed(() => navigation.playerPopup === props.popupId);
const anchor = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({});

function positionPopup(): void {
  const element = anchor.value;
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const mobile = window.innerWidth < 600;
  const panelWidth = mobile ? 140 : 160;
  const itemHeight = mobile ? 44 : 48;
  const panelHeight = modes.length * itemHeight + 16;
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

function choose(mode: PlayMode): void {
  navigation.playerPopup = '';
  emit('change', mode);
}
</script>

<template>
  <div ref="anchor" class="player-popup-anchor" @click.stop>
    <SlButton
      variant="icon"
      :icon="current.icon"
      player-icon
      class="player-tool-button"
      :title="current.label"
      :disabled="disabled"
      :class="{ 'player-control-active': modelValue !== 'order' }"
      @click="toggle"
    />
    <template v-if="open">
      <div class="player-popup-dismiss" aria-label="关闭播放模式菜单" @click="navigation.playerPopup = ''"></div>
      <div class="player-mode-popup" :style="popupStyle" role="menu" aria-label="播放模式">
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          class="player-mode-option"
          :class="{ selected: mode.value === modelValue }"
          role="menuitemradio"
          :aria-checked="mode.value === modelValue"
          @click="choose(mode.value)"
        >
          <SlIcon :name="mode.icon" :size="20" player-icon />
          <span>{{ mode.label }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
