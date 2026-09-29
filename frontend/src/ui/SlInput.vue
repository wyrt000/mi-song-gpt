<script setup lang="ts">
import { ref } from 'vue';
import { useNativeUI } from '../runtime';
import { bindNativeProps } from './nativeProps';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    type?: 'text' | 'password' | 'number' | 'tel' | 'email' | 'url';
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    ariaLabel?: string;
    inputKey?: string | number;
  }>(),
  { type: 'text', placeholder: '' },
);
const emit = defineEmits<{
  'update:modelValue': [string];
  change: [];
  submit: [];
}>();
const native = ref<HTMLElement | null>(null);
bindNativeProps(native, () => ({
  val: props.modelValue,
  disabled: !!props.disabled,
  clearable: !!props.clearable,
}));

function onNativeInput(event: Event) {
  emit('update:modelValue', String((event as CustomEvent).detail ?? ''));
}
</script>

<template>
  <flutter-cupertino-input
    v-if="useNativeUI"
    :key="inputKey"
    ref="native"
    class="sl-input-native"
    :type="type"
    :placeholder="placeholder"
    @input="onNativeInput"
    @blur="emit('change')"
    @submit="emit('submit')"
  />
  <input
    v-else
    class="sl-input"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @change="emit('change')"
    @keyup.enter="emit('submit')"
  />
</template>
