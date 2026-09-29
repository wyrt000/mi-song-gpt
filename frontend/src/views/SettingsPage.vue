<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import AppBar from './AppBar.vue';
import DeviceSettings from './settings/DeviceSettings.vue';
import PlaybackSettings from './settings/PlaybackSettings.vue';
import VoiceSettings from './settings/VoiceSettings.vue';
import ScheduleSettings from './settings/ScheduleSettings.vue';
import ToolboxSettings from './settings/ToolboxSettings.vue';
import SlIcon from '../ui/SlIcon.vue';
import { closePage, navigation } from '../runtime';
import { state } from '../store';
import { openSelect } from '../ui/selectState';

const isNarrow = ref(typeof window !== 'undefined' && window.innerWidth < 600);
const categories = [
  { id: 'device', title: '设备', subtitle: '服务器、账号和设备分组', icon: 'speaker_group', component: DeviceSettings },
  { id: 'playback', title: '播放', subtitle: '格式、音量和触屏显示', icon: 'music_note', component: PlaybackSettings },
  { id: 'voice', title: '语音', subtitle: '监听、口令和搜索', icon: 'record_voice_over', component: VoiceSettings },
  { id: 'schedule', title: '定时', subtitle: '调度规则和执行日志', icon: 'schedule', component: ScheduleSettings },
  { id: 'toolbox', title: '工具箱', subtitle: 'URL、TTS 和操作结果', icon: 'construction', component: ToolboxSettings },
];
const currentCategory = computed(() => categories.find((category) => category.id === (navigation.settingsCategory || 'device')) || categories[0]);
const showMobileMenu = computed(() => isNarrow.value && !navigation.settingsCategory);
const appbarTitle = computed(() => isNarrow.value && navigation.settingsCategory ? currentCategory.value.title : '设置');
const settingsBody = ref<HTMLElement | null>(null);
const settingsContent = ref<HTMLElement | null>(null);
const mobileMenu = ref<HTMLElement | null>(null);
function resetSettingsViewport(): void {
  openSelect.value = null;
  navigation.editorOpen = false;
  settingsContent.value?.scrollTo?.(0, 0);
  mobileMenu.value?.scrollTo?.(0, 0);
  settingsBody.value?.scrollTo?.(0, 0);
  if (settingsBody.value) settingsBody.value.scrollTop = 0;
}
function setCategory(id: string) {
  resetSettingsViewport();
  navigation.settingsCategory = id;
  void nextTick(resetSettingsViewport);
}
function close() { resetSettingsViewport(); navigation.settingsCategory = ''; closePage(); }
function back() {
  resetSettingsViewport();
  if (isNarrow.value && navigation.settingsCategory) navigation.settingsCategory = '';
  else closePage();
}
function updateWidth() { isNarrow.value = window.innerWidth < 600; }
onMounted(() => window.addEventListener('resize', updateWidth));
onUnmounted(() => window.removeEventListener('resize', updateWidth));
</script>

<template>
  <div class="settings-page page-view">
    <div class="settings-appbar-shell">
      <div class="settings-appbar-inner">
        <AppBar :title="appbarTitle" back @back="back" />
      </div>
    </div>
    <div ref="settingsBody" class="settings-scroll-body">
    <div class="settings-shell">
      <div v-if="showMobileMenu" ref="mobileMenu" class="settings-mobile-menu">
        <button v-for="category in categories" :key="category.id" class="settings-nav-item" @click="setCategory(category.id)"><span class="settings-nav-icon"><SlIcon :name="category.icon" :size="20" /></span><span class="settings-nav-copy"><strong class="settings-nav-title">{{ category.title }}</strong><small class="settings-nav-subtitle">{{ category.subtitle }}</small></span><SlIcon name="chevron_right" :size="20" /></button>
      </div>
      <div v-else class="settings-layout">
        <nav class="settings-nav" aria-label="设置分类">
          <button v-for="category in categories" :key="category.id" class="settings-nav-item" :class="{ active: category.id === currentCategory.id }" @click="setCategory(category.id)"><span class="settings-nav-icon"><SlIcon :name="category.icon" :size="20" /></span><span class="settings-nav-copy"><strong class="settings-nav-title">{{ category.title }}</strong><small class="settings-nav-subtitle">{{ category.subtitle }}</small></span></button>
        </nav>
        <section ref="settingsContent" class="settings-content">
          <div class="settings-header"><h1>{{ currentCategory.title }}</h1></div>
          <component :is="currentCategory.component" />
        </section>
      </div>
    </div>
    </div>
  </div>
</template>
