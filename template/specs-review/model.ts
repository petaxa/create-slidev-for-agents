import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, linkify: true });
const renderImage = markdown.renderer.rules.image;
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  // Both Slidev's /images/... and paths relative to specs/ are supported.
  const source = token.attrGet("src");
  if (typeof source === "string" && source.startsWith("../public/")) {
    token.attrSet("src", source.slice("../public".length));
  }
  return renderImage
    ? renderImage(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options);
};

export interface Spec {
  name: string;
  title: string;
  html: string;
}

export function collectSpecs(files: Record<string, string>): Spec[] {
  return Object.entries(files)
    .map(([path, source]) => ({ name: path.split("/").at(-1) ?? path, source }))
    .filter(({ name }) => /^\d+_.+\.md$/.test(name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map(({ name, source }) => {
      const tokens = markdown.parse(source, {});
      const heading = tokens.findIndex((token) => token.type === "heading_open");
      return {
        name,
        title: heading >= 0 ? tokens[heading + 1].content : name.replace(/\.md$/, ""),
        html: markdown.renderer.render(tokens, markdown.options, {}),
      };
    });
}

export function selectionIndex(specs: Spec[], name: string | null, fallback = 0): number {
  const found = specs.findIndex((spec) => spec.name === name);
  return found >= 0 ? found : Math.max(0, Math.min(fallback, specs.length - 1));
}
