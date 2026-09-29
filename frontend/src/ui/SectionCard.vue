<script setup lang="ts">
import SlIcon from './SlIcon.vue';
defineProps<{ title: string; icon?: string; description?: string }>();
</script>

<template>
  <section class="miot-section">
    <div class="section-title">{{ title }}</div>
    <div class="card miot-card">
      <div v-if="description" class="section-description">
        <SlIcon v-if="icon" :name="icon" :size="18" />
        <span>{{ description }}</span>
      </div>
      <slot />
    </div>
  </section>
</template>
