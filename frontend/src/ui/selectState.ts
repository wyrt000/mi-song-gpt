import { ref } from 'vue';

export const openSelect = ref<number | null>(null);
let sequence = 0;
export function nextSelectId(): number {
  sequence += 1;
  return sequence;
}
