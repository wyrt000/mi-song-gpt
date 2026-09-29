<script setup lang="ts">
import { ref } from 'vue';
import SectionCard from '../../ui/SectionCard.vue';
import SlButton from '../../ui/SlButton.vue';
import SlInput from '../../ui/SlInput.vue';
import { messageOf, notify, playerCommand, state } from '../../store';

const url = ref('https://lhttp.qtfm.cn/live/4915/64k.mp3');
const text = ref('');
async function sendUrl() { if (!url.value.trim()) return; try { await playerCommand('/mina/play-url', { url: url.value.trim() }); } catch (error) { notify(messageOf(error), 'error'); } }
async function sendText() { if (!text.value.trim()) return; try { await playerCommand('/mina/tts', { text: text.value.trim() }); text.value = ''; } catch (error) { notify(messageOf(error), 'error'); } }
</script>

<template>
  <SectionCard title="URL 播放" icon="link" description="将音频 URL 推送到当前选中的设备或设备分组。URL 必须能从音箱所在网络访问。">
    <div class="form-body"><div class="inline-fields"><SlInput v-model="url" type="url" placeholder="https://example.com/audio.mp3" aria-label="音频 URL" @submit="sendUrl" /><SlButton variant="filled" label="播放" icon="play_arrow" @click="sendUrl" /></div></div>
  </SectionCard>
  <SectionCard title="文字播报" icon="record_voice_over" description="使用当前设备的 TTS 播报文字。">
    <div class="form-body"><div class="inline-fields"><SlInput v-model="text" placeholder="输入要播报的文字" aria-label="播报文字" @submit="sendText" /><SlButton variant="filled" label="播报" icon="campaign" @click="sendText" /></div></div>
  </SectionCard>
  <SectionCard title="操作结果" icon="terminal">
    <div class="form-body"><div class="field-actions"><SlButton variant="text" label="清空记录" icon="delete_sweep" @click="state.operationLog = []" /></div><div v-for="item in state.operationLog" :key="`${item.time}-${item.message}`" class="list-item"><div class="list-item-copy"><strong class="list-item-title">{{ item.message }}</strong><span class="list-item-subtitle">{{ item.time }}</span></div><span class="chip" :class="item.success ? 'chip-success' : 'chip-error'">{{ item.success ? '成功' : '失败' }}</span></div><div v-if="!state.operationLog.length" class="empty-state">暂无操作记录</div></div>
  </SectionCard>
</template>
