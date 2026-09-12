import { onBeforeUnmount, ref } from "vue";

export function useClipboard(resetAfter = 1200) {
  const copied = ref(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy(value: string) {
    if (!navigator?.clipboard) return false;

    await navigator.clipboard.writeText(value);
    copied.value = true;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      copied.value = false;
    }, resetAfter);
    return true;
  }

  onBeforeUnmount(() => {
    if (resetTimer) clearTimeout(resetTimer);
  });

  return { copied, copy };
}
