<script setup lang="ts">
import { ref } from 'vue';
import { useNativeUI } from '../runtime';
import { bindNativeProps } from './nativeProps';

const props = defineProps<{ modelValue: boolean; disabled?: boolean; ariaLabel?: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const native = ref<HTMLElement | null>(null);
bindNativeProps(native, () => ({ checked: props.modelValue, disabled: !!props.disabled }));

function nativeChange(event: Event) {
  const detail = (event as CustomEvent).detail;
  emit('update:modelValue', typeof detail === 'boolean' ? detail : !props.modelValue);
}
</script>

<template>
  <flutter-cupertino-checkbox
    v-if="useNativeUI"
    ref="native"
    class="sl-checkbox-native"
    @change="nativeChange"
  />
  <input
    v-else
    class="sl-checkbox"
    type="checkbox"
    :checked="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
  />
</template>
