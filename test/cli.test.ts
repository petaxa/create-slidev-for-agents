import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vite-plus/test";

import {
  detectPackageManager,
  helpText,
  normalizePackageName,
  parseArgs,
  scaffold,
  titleFromDirectory,
} from "../src/cli";

test("help advertises the Vite+ and npm create commands", () => {
  expect(helpText).toMatch(/vp create slidev-for-agents/);
  expect(helpText).toMatch(/npm create slidev-for-agents@latest/);
  expect(helpText).not.toMatch(/@petaxa\/slidev/);
});

test("parseArgs reads scaffold options", () => {
  expect(parseArgs(["demo", "--title", "Demo Deck", "--install"])).toEqual({
    directory: "demo",
    help: false,
    install: true,
    title: "Demo Deck",
    version: false,
  });
});

test("dependency installation is opt-in", () => {
  expect(parseArgs(["demo"]).install).toBe(false);
  expect(parseArgs(["demo", "--no-install"]).install).toBe(false);
});

test("parseArgs rejects the removed package manager option", () => {
  expect(() => parseArgs(["demo", "--pm", "pnpm"])).toThrow(/Unknown option: --pm/);
});

test("package and title helpers create safe defaults", () => {
  expect(normalizePackageName("My Great Talk!")).toBe("my-great-talk");
  expect(normalizePackageName("日本語")).toBe("slidev-deck");
  expect(titleFromDirectory("my-great_talk")).toBe("My great talk");
  expect(detectPackageManager("pnpm/11.0.0 npm/? node/v22")).toBe("pnpm");
  expect(detectPackageManager("")).toBe("npm");
});

test("scaffold creates a blank Vite+ deck without installing", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "create-slidev-for-agents-test-"));
  const logs: string[] = [];

  try {
    const result = await scaffold({
      cwd: temporaryRoot,
      directory: "sample-talk",
      install: false,
      logger: { log: (message) => logs.push(message) },
      title: "サンプル発表",
    });

    const generatedPackage = JSON.parse(
      await readFile(path.join(result.targetDirectory, "package.json"), "utf8"),
    );
    const slides = await readFile(path.join(result.targetDirectory, "slides.md"), "utf8");
    const generatedDesign = await readFile(path.join(result.targetDirectory, "DESIGN.md"), "utf8");
    const generatedReadme = await readFile(path.join(result.targetDirectory, "README.md"), "utf8");
    const generatedAgents = await readFile(path.join(result.targetDirectory, "AGENTS.md"), "utf8");
    const generatedViteConfig = await readFile(
      path.join(result.targetDirectory, "vite.config.ts"),
      "utf8",
    );
    const vscodeSettings = await readFile(
      path.join(result.targetDirectory, ".vscode/settings.json"),
      "utf8",
    );
    const generatedDeckConfig = await readFile(
      path.join(result.targetDirectory, "deck.config.ts"),
      "utf8",
    );
    const deployWorkflow = await readFile(
      path.join(result.targetDirectory, ".github/workflows/deploy.yml"),
      "utf8",
    );
    const plotTemplate = await readFile(
      path.join(result.targetDirectory, "specs/_prot.md"),
      "utf8",
    );
    const feedbackTemplate = await readFile(
      path.join(result.targetDirectory, "specs/_feedback.md"),
      "utf8",
    );
    const pageSpecs = (await readdir(path.join(result.targetDirectory, "specs")))
      .filter((name) => /^\d{2}_.+\.md$/.test(name))
      .sort();
    const pageFiles = (await readdir(path.join(result.targetDirectory, "pages")))
      .filter((name) => /^\d{2}_.+\.vue$/.test(name))
      .sort();
    const rootEntries = await readdir(result.targetDirectory);
    const detectedPackageManager = detectPackageManager();
    const installCommand =
      detectedPackageManager === "yarn" ? "yarn" : `${detectedPackageManager} install`;

    expect(generatedPackage.name).toBe("sample-talk");
    expect(generatedPackage.private).toBe(true);
    expect(generatedPackage.scripts).toBeUndefined();
    expect(slides).toMatch(/title: "サンプル発表"/);
    expect(slides).not.toMatch(/__DECK_TITLE__/);
    expect(slides).not.toMatch(/<Slide\d+/);
    expect(generatedDesign).toMatch(/Editorial Paper/);
    expect(generatedReadme).toContain(installCommand);
    expect(generatedReadme).toMatch(/vp run dev/);
    expect(generatedReadme).toContain("vp run specs");
    expect(generatedPackage.devDependencies["@ox-content/napi"]).toBe("3.2.1");
    expect(generatedViteConfig).toContain("vp dev --config specs-review/vite.config.ts");
    expect(
      await readFile(path.join(result.targetDirectory, "specs-review/index.html"), "utf8"),
    ).toContain("仕様レビュー");
    expect(generatedAgents).toMatch(/specs\/NN_name\.md/);
    expect(generatedAgents).toMatch(/ユーザーによる仕様確認を待つ/);
    expect(generatedDeckConfig).toMatch(/footerLabel: "サンプル発表"/);
    expect(generatedDeckConfig).not.toMatch(/__DECK_TITLE_UPPER__/);
    expect(deployWorkflow).toMatch(/vp run build --base \.\//);
    expect(generatedViteConfig).toMatch(/command: "slidev"/);
    expect(generatedViteConfig).toMatch(/build: "slidev build"/);
    expect(generatedViteConfig).toMatch(/command: "slidev export"/);
    expect(vscodeSettings).toMatch(/"editor.formatOnSave": true/);
    expect(vscodeSettings).toMatch(/"editor.defaultFormatter": "oxc.oxc-vscode"/);
    expect(plotTemplate).toMatch(/\[ページの役割\]/);
    expect(feedbackTemplate).toMatch(/\[修正後に満たしてほしい条件\]/);
    expect(pageSpecs).toEqual([]);
    expect(pageFiles).toEqual([]);
    expect(rootEntries).toContain("AGENTS.md");
    expect(rootEntries).toContain(".github");
    expect(rootEntries).toContain(".gitignore");
    expect(rootEntries).not.toContain("dot-gitignore");
    expect(rootEntries).toContain("components");
    expect(rootEntries).toContain("layouts");
    expect(rootEntries).toContain("pages");
    expect(rootEntries).toContain("specs");
    expect(rootEntries).toContain("styles");
    expect(rootEntries).not.toContain("vercel.json");
    expect(rootEntries).not.toContain("netlify.toml");
    expect(rootEntries).not.toContain(".vercel");
    expect(rootEntries).not.toContain(".netlify");
    expect(logs.join("\n")).toContain(installCommand);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("scaffold escapes the title in TypeScript string literals", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "create-slidev-for-agents-test-"));

  try {
    const result = await scaffold({
      cwd: temporaryRoot,
      directory: "quoted-title",
      install: false,
      logger: { log: () => {} },
      title: 'Say "hello" \\ now',
    });
    const generatedDeckConfig = await readFile(
      path.join(result.targetDirectory, "deck.config.ts"),
      "utf8",
    );

    expect(generatedDeckConfig).toMatch(/footerLabel: "SAY \\"HELLO\\" \\\\ NOW"/);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("scaffold refuses to overwrite a non-empty directory", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "create-slidev-for-agents-test-"));

  try {
    const logger = { log: () => {} };
    await scaffold({ cwd: temporaryRoot, directory: "existing", install: false, logger });
    await expect(
      scaffold({ cwd: temporaryRoot, directory: "existing", install: false, logger }),
    ).rejects.toThrow(/not empty/);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
