import { expect, test } from "vite-plus/test";
import { collectSpecs, selectionIndex } from "../template/specs-review/model";
import { renderSpec } from "../template/specs-review/render";

function parseSpecs(files: Record<string, string>) {
  return collectSpecs(
    Object.fromEntries(Object.entries(files).map(([name, source]) => [name, renderSpec(source)])),
  );
}

test("only page specs appear, in numeric order even beyond 99", () => {
  const specs = parseSpecs({
    "../specs/100_end.md": "# 終わり",
    "../specs/02_intro.md": "# はじめに",
    "../specs/10_detail.md": "No heading",
    "../specs/_prot.md": "# Plot",
    "../specs/_feedback.md": "# Feedback",
    "../specs/README.md": "# Instructions",
    "../specs/03_.md": "# Invalid",
  });
  expect(specs.map((spec) => spec.name)).toEqual(["02_intro.md", "10_detail.md", "100_end.md"]);
  expect(specs.map((spec) => spec.title)).toEqual(["はじめに", "10_detail", "終わり"]);
  expect(collectSpecs({})).toEqual([]);
});

test("renders structured Markdown while keeping embedded code inert", () => {
  const [spec] = parseSpecs({
    "01_demo.md":
      "# 目的\n\n- **要点**\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```vue\n<Demo />\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![図](../public/images/demo.png)",
  });
  expect(spec.html).toMatch(/<h1[^>]*>目的<\/h1>/);
  expect(spec.html).toContain("<strong>要点</strong>");
  expect(spec.html).toContain("<table>");
  expect(spec.html).toContain("&lt;Demo /&gt;");
  expect(spec.html).not.toContain("<script>");
  expect(spec.html).not.toContain('href="javascript:');
  expect(spec.html).toContain('src="/images/demo.png"');
});

test("selection follows filenames across insertions and falls back after deletion", () => {
  const specs = parseSpecs({ "01_a.md": "", "02_b.md": "", "03_c.md": "" });
  expect(selectionIndex(specs, "02_b.md", 0)).toBe(1);
  expect(selectionIndex(specs.slice(1), "02_b.md", 1)).toBe(0);
  expect(selectionIndex(specs.slice(0, 2), "03_c.md", 2)).toBe(1);
  expect(selectionIndex(specs, "missing.md")).toBe(0);
  expect(selectionIndex([], "03_c.md", 2)).toBe(0);
});

test("ox-content handles formatted titles and GFM task lists", () => {
  const spec = renderSpec("# **確認**と`コード`\n\n- [x] 確認済み\n- [ ] 未確認\n\n~~削除~~");
  expect(spec.title).toBe("確認とコード");
  expect(spec.html).toContain('type="checkbox"');
  expect(spec.html).toContain("checked");
  expect(spec.html).toContain("<del>削除</del>");
});

test("reference images keep paths relative to the public directory", () => {
  const spec = renderSpec("![図][diagram]\n\n[diagram]: ../public/images/demo.png");
  expect(spec.html).toContain('src="/images/demo.png"');
});
