<script setup lang="ts">
import { useClipboard } from "../composables/useClipboard";

const props = defineProps<{
  command: string;
}>();

const { copied, copy } = useClipboard();
</script>

<template>
  <div class="deck-command-card">
    <span class="deck-command-card__chrome" aria-hidden="true" />
    <button
      type="button"
      class="deck-command-card__copy"
      :aria-label="copied ? 'コピーしました' : 'コマンドをコピー'"
      :title="copied ? 'コピーしました' : 'コマンドをコピー'"
      @click="copy(props.command)"
    >
      <svg v-if="copied" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <svg v-else aria-hidden="true" viewBox="0 0 24 24">
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M5 15V7a2 2 0 0 1 2-2h8" />
      </svg>
    </button>
    <code class="deck-command-card__code language-bash">
      <span class="deck-command-card__prompt" aria-hidden="true">$</span
      ><span class="deck-command-card__command">{{ command }}</span>
    </code>
  </div>
</template>
