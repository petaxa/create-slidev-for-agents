import { parse, render, sanitizeHtml } from "@ox-content/napi";
import type { Spec } from "./model";

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  children?: MarkdownNode[];
}

function plainText(node: MarkdownNode): string {
  return node.value ?? node.alt ?? node.children?.map(plainText).join("") ?? "";
}

function prepareNode(node: MarkdownNode): void {
  // Keep HTML and Vue examples visible without executing them.
  if (node.type === "html") node.type = "text";
  if ((node.type === "image" || node.type === "definition") && node.url?.startsWith("../public/")) {
    node.url = node.url.slice("../public".length);
  }
  node.children?.forEach(prepareNode);
}

// Native ox-content stays in the Vite server; the browser receives rendered data only.
export function renderSpec(source: string): Omit<Spec, "name"> {
  const parsed = parse(source, { gfm: true });
  if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
  const ast = JSON.parse(parsed.ast) as MarkdownNode;
  const heading = ast.children?.find((node) => node.type === "heading");
  const title = heading ? plainText(heading) : "";
  prepareNode(ast);
  const rendered = render(JSON.stringify(ast));
  if (rendered.errors.length) throw new Error(rendered.errors.join("\n"));
  return { title, html: sanitizeHtml(rendered.html) };
}
