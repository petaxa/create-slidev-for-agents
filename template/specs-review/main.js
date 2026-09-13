import "../styles/tokens.css";
import "./style.css";
import { specs as initialSpecs } from "./documents.js";
import { selectionIndex } from "./model";

const list = document.querySelector("#spec-list");
const reader = document.querySelector("#reader");
const content = document.querySelector("#content");
const filename = document.querySelector("#filename");
const position = document.querySelector("#position");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
let specs = initialSpecs;
let index = 0;
let currentName;

function render({ preserveScroll = false } = {}) {
  const requested = new URL(location.href).searchParams.get("spec");
  index = selectionIndex(specs, requested, index);
  const spec = specs[index];
  const samePage = currentName === spec?.name;
  currentName = spec?.name;
  const url = new URL(location.href);
  if (spec) url.searchParams.set("spec", spec.name);
  else url.searchParams.delete("spec");
  history.replaceState(null, "", url);

  list.replaceChildren(
    ...specs.map((item, itemIndex) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      const destination = new URL(location.href);
      destination.searchParams.set("spec", item.name);
      link.href = destination.href;
      link.textContent = item.title;
      link.title = item.name;
      if (itemIndex === index) link.setAttribute("aria-current", "page");
      link.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(itemIndex);
      });
      li.append(link);
      return li;
    }),
  );
  filename.textContent = spec?.name ?? "specs/";
  position.textContent = specs.length ? `${index + 1} / ${specs.length}` : "0 / 0";
  document.title = spec ? `${spec.title} — 仕様レビュー` : "仕様レビュー";
  content.innerHTML =
    spec?.html ||
    (spec
      ? "<p>この仕様はまだ空です。</p>"
      : `
    <h1>確認する仕様がありません</h1>
    <p><code>specs/01_title.md</code> のような番号付きのMarkdownを作成すると、ここに表示されます。</p>
    <p>まず <code>specs/_prot.md</code> にプロットを書き、LLMにページ仕様の作成を依頼してください。</p>
  `);
  previous.disabled = !specs.length || index === 0;
  next.disabled = !specs.length || index === specs.length - 1;
  if (!preserveScroll || !samePage) reader.scrollTop = 0;
  list.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
}

function navigate(target) {
  if (target < 0 || target >= specs.length || target === index) return;
  const url = new URL(location.href);
  url.searchParams.set("spec", specs[target].name);
  history.pushState(null, "", url);
  render();
  reader.focus({ preventScroll: true });
}

previous.addEventListener("click", () => navigate(index - 1));
next.addEventListener("click", () => navigate(index + 1));
window.addEventListener("popstate", () => render());
window.addEventListener("keydown", (event) => {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.target.closest("input, textarea, select, [contenteditable]")
  )
    return;
  const targets = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: specs.length - 1 };
  if (Object.hasOwn(targets, event.key)) {
    event.preventDefault();
    navigate(targets[event.key]);
  }
});

// Keep Markdown links to other page specifications inside the reviewer.
content.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const destination = new URL(link.href);
  if (destination.origin !== location.origin) return;
  const name = decodeURIComponent(destination.pathname.split("/").at(-1));
  const target = specs.findIndex((spec) => spec.name === name);
  if (target < 0) return;
  event.preventDefault();
  navigate(target);
});

if (import.meta.hot) {
  import.meta.hot.accept("./documents.js", (updated) => {
    if (!updated) return;
    specs = updated.specs;
    render({ preserveScroll: true });
  });
}

render();
