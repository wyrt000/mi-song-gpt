<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; stacked?: boolean }>();
</script>

<template>
  <div class="setting-row" :class="{ 'setting-row-stacked': stacked }">
    <div class="setting-row-copy">
      <div class="setting-row-title">{{ title }}</div>
      <div v-if="subtitle" class="setting-row-subtitle">{{ subtitle }}</div>
    </div>
    <div class="setting-row-control"><slot /></div>
  </div>
</template>
