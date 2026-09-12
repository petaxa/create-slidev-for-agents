<script setup lang="ts">
defineProps<{
  sectionLabel?: string;
  footerLabel?: string;
}>();
</script>

<template>
  <section class="slidev-layout deck-frame deck-cover">
    <header v-if="sectionLabel || $slots.section" class="deck-frame__section">
      <span
        ><slot name="section">{{ sectionLabel }}</slot></span
      >
      <span class="deck-frame__section-line" aria-hidden="true" />
    </header>

    <main class="deck-cover__content">
      <h1 class="deck-cover__title"><slot name="title" /></h1>
    </main>

    <footer v-if="footerLabel || $slots.footer" class="deck-frame__footer">
      <span class="deck-frame__footer-label"
        ><slot name="footer">{{ footerLabel }}</slot></span
      >
      <span class="deck-frame__footer-line" aria-hidden="true" />
    </footer>
  </section>
</template>
