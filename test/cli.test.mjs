import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  detectPackageManager,
  helpText,
  normalizePackageName,
  parseArgs,
  scaffold,
  titleFromDirectory,
} from "../src/cli.mjs";

test("help advertises the Vite+ and npm create commands", () => {
  assert.match(helpText, /vp create slidev-for-agents/);
  assert.match(helpText, /npm create slidev-for-agents@latest/);
  assert.doesNotMatch(helpText, /@petaxa\/slidev/);
});

test("parseArgs reads scaffold options", () => {
  assert.deepEqual(parseArgs(["demo", "--title", "Demo Deck", "--install"]), {
    directory: "demo",
    help: false,
    install: true,
    title: "Demo Deck",
    version: false,
  });
});

test("dependency installation is opt-in", () => {
  assert.equal(parseArgs(["demo"]).install, false);
  assert.equal(parseArgs(["demo", "--no-install"]).install, false);
});

test("parseArgs rejects the removed package manager option", () => {
  assert.throws(() => parseArgs(["demo", "--pm", "pnpm"]), /Unknown option: --pm/);
});

test("package and title helpers create safe defaults", () => {
  assert.equal(normalizePackageName("My Great Talk!"), "my-great-talk");
  assert.equal(normalizePackageName("日本語"), "slidev-deck");
  assert.equal(titleFromDirectory("my-great_talk"), "My great talk");
  assert.equal(detectPackageManager("pnpm/11.0.0 npm/? node/v22"), "pnpm");
  assert.equal(detectPackageManager(""), "npm");
});

test("scaffold creates a blank Vite+ deck without installing", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "create-slidev-for-agents-test-"));
  const logs = [];

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

    assert.equal(generatedPackage.name, "sample-talk");
    assert.equal(generatedPackage.private, true);
    assert.equal(generatedPackage.scripts, undefined);
    assert.match(slides, /title: "サンプル発表"/);
    assert.doesNotMatch(slides, /__DECK_TITLE__/);
    assert.doesNotMatch(slides, /<Slide\d+/);
    assert.match(generatedDesign, /Editorial Paper/);
    assert.ok(generatedReadme.includes(installCommand));
    assert.match(generatedReadme, /vp run dev/);
    assert.match(generatedAgents, /specs\/NN_name\.md/);
    assert.match(generatedAgents, /ユーザーによる仕様確認を待つ/);
    assert.match(generatedDeckConfig, /footerLabel: "サンプル発表"/);
    assert.doesNotMatch(generatedDeckConfig, /__DECK_TITLE_UPPER__/);
    assert.match(deployWorkflow, /vp run build --base \.\//);
    assert.match(generatedViteConfig, /command: "slidev"/);
    assert.match(generatedViteConfig, /build: "slidev build"/);
    assert.match(generatedViteConfig, /command: "slidev export"/);
    assert.match(vscodeSettings, /"editor.formatOnSave": true/);
    assert.match(vscodeSettings, /"editor.defaultFormatter": "oxc.oxc-vscode"/);
    assert.match(plotTemplate, /\[ページの役割\]/);
    assert.match(feedbackTemplate, /\[修正後に満たしてほしい条件\]/);
    assert.deepEqual(pageSpecs, []);
    assert.deepEqual(pageFiles, []);
    assert.ok(rootEntries.includes("AGENTS.md"));
    assert.ok(rootEntries.includes(".github"));
    assert.ok(rootEntries.includes(".gitignore"));
    assert.ok(!rootEntries.includes("dot-gitignore"));
    assert.ok(rootEntries.includes("components"));
    assert.ok(rootEntries.includes("layouts"));
    assert.ok(rootEntries.includes("pages"));
    assert.ok(rootEntries.includes("specs"));
    assert.ok(rootEntries.includes("styles"));
    assert.ok(!rootEntries.includes("vercel.json"));
    assert.ok(!rootEntries.includes("netlify.toml"));
    assert.ok(!rootEntries.includes(".vercel"));
    assert.ok(!rootEntries.includes(".netlify"));
    assert.ok(logs.join("\n").includes(installCommand));
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

    assert.match(generatedDeckConfig, /footerLabel: "SAY \\"HELLO\\" \\\\ NOW"/);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("scaffold refuses to overwrite a non-empty directory", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "create-slidev-for-agents-test-"));

  try {
    const logger = { log: () => {} };
    await scaffold({ cwd: temporaryRoot, directory: "existing", install: false, logger });
    await assert.rejects(
      scaffold({ cwd: temporaryRoot, directory: "existing", install: false, logger }),
      /not empty/,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
