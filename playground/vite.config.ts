import { fileURLToPath } from "node:url";
import { createSpecsReviewConfig } from "../template/specs-review/config";

export default {
  ...createSpecsReviewConfig({
    specsDirectory: fileURLToPath(new URL("./specs", import.meta.url)),
    publicDirectory: fileURLToPath(new URL("./public", import.meta.url)),
  }),
  // Keep development caches out of the template copied into new decks.
  cacheDir: fileURLToPath(new URL("../node_modules/.vite-playground", import.meta.url)),
};
