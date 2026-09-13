import { collectSpecs } from "./model";

export const specs = collectSpecs(
  import.meta.glob("../specs/*.md", { query: "?spec-review", import: "default", eager: true }),
);
