<script setup lang="ts">
import { resolveConfirm, state } from '../store';
import SlButton from '../ui/SlButton.vue';
import SlCheckbox from '../ui/SlCheckbox.vue';
</script>

<template>
  <div v-if="state.confirm.open" class="dialog-overlay" @click.self="resolveConfirm(false)">
    <div class="dialog" role="dialog" aria-modal="true">
      <h2 class="dialog-title">{{ state.confirm.title }}</h2>
      <div class="dialog-content">{{ state.confirm.message }}</div>
      <label v-if="state.confirm.checkbox" class="dialog-checkbox">
        <SlCheckbox
          :model-value="state.confirm.checkbox.checked"
          :aria-label="state.confirm.checkbox.label"
          @update:model-value="(v) => { if (state.confirm.checkbox) state.confirm.checkbox.checked = v; }"
        />
        <span>{{ state.confirm.checkbox.label }}</span>
      </label>
      <div class="dialog-actions">
        <SlButton variant="text" label="取消" @click="resolveConfirm(false)" />
        <SlButton :variant="state.confirm.dangerous ? 'filled' : 'filled'" :label="state.confirm.confirmText" @click="resolveConfirm(true)" />
      </div>
    </div>
  </div>
</template>
