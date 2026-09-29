<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import MainPage from './views/MainPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import FullscreenPlayer from './views/FullscreenPlayer.vue';
import Snackbar from './views/Snackbar.vue';
import ConfirmDialog from './views/ConfirmDialog.vue';
import { detectHostMode, installHostBack, navigation } from './runtime';
import { disposeStore, initialize, state } from './store';

onMounted(() => {
  detectHostMode();
  installHostBack();
  void initialize();
});

watch(
  () => navigation.page,
  () => {
    navigation.playerPopup = '';
  },
);

onUnmounted(disposeStore);
</script>

<template>
  <div class="miot-app">
    <div v-if="state.loading" class="app-state-page">
      <span class="loading-spinner" aria-hidden="true"></span>
      <p>正在加载</p>
    </div>
    <div v-else-if="state.startupError" class="app-state-page">
      <div class="state-icon"><span class="material-symbols-outlined">cloud_off</span></div>
      <h2>页面加载失败</h2>
      <p>{{ state.startupError }}</p>
      <button class="btn-filled" @click="initialize">重试</button>
    </div>
    <template v-else>
      <SettingsPage v-if="navigation.page === 'settings'" />
      <!-- 刻意不套 KeepAlive：WebF 重新挂载缓存子树时不会重排，第二次打开播放器
           整个 fullscreen-playback（歌名/进度/控制/工具）会零尺寸不可见
           （songloft-org/songloft-plugin-miot#81）。重建成本很低——onMounted 会
           重新拉歌词与延迟停止状态，而歌词本来就随 current_song 变化重拉。 -->
      <FullscreenPlayer v-if="navigation.page === 'player'" />
      <MainPage v-if="navigation.page !== 'settings' && navigation.page !== 'player'" />
    </template>
    <Snackbar />
    <ConfirmDialog />
  </div>
</template>
