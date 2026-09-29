<script setup lang="ts">
import SlButton from '../ui/SlButton.vue';
import SlIcon from '../ui/SlIcon.vue';
import { deviceId, deviceName, selectDevice, state } from '../store';

const emit = defineEmits<{ close: [] }>();

async function choose(accountId: string, selectedDeviceId: string) {
  await selectDevice(accountId, selectedDeviceId);
  emit('close');
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog device-picker-dialog" role="dialog" aria-modal="true" aria-label="选择播放设备">
      <h2 class="dialog-title">选择播放设备</h2>
      <div v-if="state.devices.length" class="device-picker-list">
        <section v-for="account in state.devices" :key="account.account_id" class="device-picker-account">
          <h3>{{ account.account_name || account.account_id }}</h3>
          <button
            v-for="device in account.devices"
            :key="deviceId(device)"
            type="button"
            class="device-picker-row"
            :class="{ selected: account.account_id === state.currentAccountId && deviceId(device) === state.currentDeviceId }"
            @click="choose(account.account_id, deviceId(device))"
          >
            <span class="device-picker-icon"><SlIcon name="speaker" :size="20" /></span>
            <span class="device-picker-copy">
              <strong>{{ deviceName(device) }}</strong>
              <small>{{ device.model || device.hardware || 'MIoT 设备' }} · {{ device.presence === 'online' ? '在线' : '离线' }}</small>
            </span>
            <SlIcon
              v-if="account.account_id === state.currentAccountId && deviceId(device) === state.currentDeviceId"
              name="check"
              :size="20"
            />
          </button>
        </section>
      </div>
      <div v-else class="empty-state">暂无可选设备，请先在设置中添加账号。</div>
      <div class="dialog-actions">
        <SlButton variant="text" label="取消" @click="emit('close')" />
      </div>
    </div>
  </div>
</template>
