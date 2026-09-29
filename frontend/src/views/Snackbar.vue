<script setup lang="ts">
import { state } from '../store';
</script>

<template>
  <div v-if="state.snackbar" class="toast-host">
    <div class="toast" :class="`toast-${state.snackbar.kind}`" role="status">{{ state.snackbar.text }}</div>
  </div>
</template>
