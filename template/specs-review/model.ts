export interface Spec {
  name: string;
  title: string;
  html: string;
}

export function collectSpecs(files: Record<string, Omit<Spec, "name">>): Spec[] {
  return Object.entries(files)
    .map(([path, document]) => ({ name: path.split("/").at(-1) ?? path, ...document }))
    .filter(({ name }) => /^\d+_.+\.md$/.test(name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map((spec) => ({ ...spec, title: spec.title || spec.name.replace(/\.md$/, "") }));
}

export function selectionIndex(specs: Spec[], name: string | null, fallback = 0): number {
  const found = specs.findIndex((spec) => spec.name === name);
  return found >= 0 ? found : Math.max(0, Math.min(fallback, specs.length - 1));
}
