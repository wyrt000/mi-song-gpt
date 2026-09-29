<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; disabled?: boolean; ariaLabel?: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>

<template>
  <label class="switch">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="switch-track"></span>
    <span class="switch-thumb"></span>
  </label>
</template>
