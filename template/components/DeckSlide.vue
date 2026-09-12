<script setup lang="ts">
import { computed } from "vue";

import { deckConfig } from "../deck.config";
import Cover from "../layouts/Cover.vue";
import Description from "../layouts/Description.vue";

const props = withDefaults(
  defineProps<{
    layout?: "cover" | "description";
    sectionLabel?: string;
    title?: string;
    lead?: string;
    footerLabel?: string;
    variant?: "default" | "center" | "statement";
  }>(),
  {
    layout: "description",
    variant: "statement",
  },
);

const resolvedFooter = computed(() => props.footerLabel ?? deckConfig.footerLabel);
</script>

<template>
  <div class="deck-page">
    <Cover v-if="layout === 'cover'" :section-label="sectionLabel" :footer-label="resolvedFooter">
      <template #title
        ><slot name="title">{{ title }}</slot></template
      >
    </Cover>

    <Description
      v-else
      :section-label="sectionLabel"
      :title="title"
      :lead="lead"
      :footer-label="resolvedFooter"
      :variant="variant"
    >
      <template v-if="$slots.title" #title><slot name="title" /></template>
      <template v-if="$slots.lead" #lead><slot name="lead" /></template>
      <slot />
    </Description>

    <slot name="overlay" />
  </div>
</template>
