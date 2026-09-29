<script setup lang="ts">
import SlButton from '../ui/SlButton.vue';
defineProps<{ title: string; subtitle?: string; back?: boolean }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <header class="miot-appbar">
    <SlButton v-if="back" variant="icon" icon="arrow_back" title="返回" @click="$emit('back')" />
    <h1 class="miot-appbar-title">
      {{ title }}
      <span v-if="subtitle" class="miot-appbar-subtitle">{{ subtitle }}</span>
    </h1>
    <div class="appbar-actions"><slot /></div>
  </header>
</template>
