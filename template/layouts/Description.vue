<script setup lang="ts">
withDefaults(
  defineProps<{
    sectionLabel?: string;
    title?: string;
    lead?: string;
    footerLabel?: string;
    variant?: "default" | "center" | "statement";
  }>(),
  {
    variant: "default",
  },
);
</script>

<template>
  <section
    class="slidev-layout deck-frame deck-description"
    :class="`deck-description--${variant}`"
  >
    <header v-if="sectionLabel || $slots.section" class="deck-frame__section">
      <span
        ><slot name="section">{{ sectionLabel }}</slot></span
      >
      <span class="deck-frame__section-line" aria-hidden="true" />
    </header>

    <main class="deck-description__content">
      <h1 v-if="title || $slots.title" class="deck-description__title">
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="lead || $slots.lead" class="deck-description__lead">
        <slot name="lead">{{ lead }}</slot>
      </p>
      <div class="deck-description__body"><slot /></div>
    </main>

    <footer v-if="footerLabel || $slots.footer" class="deck-frame__footer">
      <span class="deck-frame__footer-label"
        ><slot name="footer">{{ footerLabel }}</slot></span
      >
      <span class="deck-frame__footer-line" aria-hidden="true" />
    </footer>
  </section>
</template>
