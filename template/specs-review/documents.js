import { collectSpecs } from "./model";

export const specs = collectSpecs(
  import.meta.glob("../specs/*.md", { query: "?raw", import: "default", eager: true }),
);
