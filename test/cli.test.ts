import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test, vi } from "vite-plus/test";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("Tests must not install dependencies");
  }),
}));

import {
  detectPackageManager,
  helpText,
  normalizePackageName,
  parseArgs,
  scaffold,
  titleFromDirectory,
} from "../src/cli";
import { parseGitHubDesignSource } from "../src/design";

test("help advertises the Vite+ and npm create commands", () => {
  expect(helpText).toMatch(/vp create slidev-for-agents/);
  expect(helpText).toMatch(/npm create slidev-for-agents@latest/);
  expect(helpText).not.toMatch(/@petaxa\/slidev/);
});

test("parseArgs reads scaffold options", () => {
  expect(
    parseArgs(["demo", "--title", "Demo Deck", "--design-repo", "owner/design", "--install"]),
  ).toEqual({
    designPath: undefined,
    designRepository: "owner/design",
    directory: "demo",
    dryRun: false,
    help: false,
    install: true,
    title: "Demo Deck",
    version: false,
  });
});

test("GitHub design sources accept repositories and directory URLs", () => {
  expect(parseGitHubDesignSource("owner/design")).toEqual({
    repositoryUrl: "https://github.com/owner/design.git",
    directory: "",
  });
  expect(parseGitHubDesignSource("https://github.com/owner/design.git/")).toEqual({
    repositoryUrl: "https://github.com/owner/design.git",
    directory: "",
  });
  expect(
    parseGitHubDesignSource("https://github.com/owner/design/tree/main/design-md/10x"),
  ).toEqual({
    repositoryUrl: "https://github.com/owner/design.git",
    directory: "design-md/10x",
    ref: "main",
  });
  expect(parseGitHubDesignSource("owner/design", "design-md/10x").directory).toBe("design-md/10x");
  expect(() => parseGitHubDesignSource("https://github.com.evil.test/owner/design")).toThrow();
  expect(() => parseGitHubDesignSource("owner/design/extra")).toThrow();
  expect(() => parseGitHubDesignSource("owner/design", "../other")).toThrow();
  expect(() =>
    parseGitHubDesignSource("https://github.com/owner/design/tree/main/design-md/10x", "other"),
  ).toThrow();
  expect(() => parseArgs(["--design-repo="])).toThrow(/requires a value/);
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
    const generatedSlideDesign = await readFile(
      path.join(result.targetDirectory, "DESIGN-dot-md/DESIGN.slide.md"),
      "utf8",
    );
    const designFiles = await readdir(path.join(result.targetDirectory, "DESIGN-dot-md"));
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
    expect(generatedSlideDesign).toMatch(/一枚につき、ひとつの主題/);
    expect(designFiles).toEqual(["DESIGN.slide.md"]);
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
    expect(rootEntries).not.toContain("playground");
    expect(logs.join("\n")).toContain(installCommand);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("scaffold copies a GitHub design repository into DESIGN-dot-md", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "slidev-design-test-"));
  try {
    const source = path.join(temporaryRoot, "source");
    await mkdir(path.join(source, "images"), { recursive: true });
    await mkdir(path.join(source, ".git"));
    await writeFile(path.join(source, "DESIGN.md"), "# Custom theme\n");
    await writeFile(path.join(source, "images", "sample.svg"), "<svg />");
    await writeFile(path.join(source, ".git", "config"), "private metadata");

    const logs: string[] = [];
    const result = await scaffold({
      cwd: temporaryRoot,
      designRepository: "owner/design",
      directory: "deck",
      logger: { log: (message) => logs.push(message) },
      cloneDesignRepository: async (url, destination) => {
        expect(url).toBe("https://github.com/owner/design.git");
        await cp(source, destination, { recursive: true });
      },
    });

    const designDirectory = path.join(result.targetDirectory, "DESIGN-dot-md");
    expect(await readFile(path.join(designDirectory, "DESIGN.theme.md"), "utf8")).toBe(
      "# Custom theme\n",
    );
    expect(await readFile(path.join(designDirectory, "images/sample.svg"), "utf8")).toBe("<svg />");
    expect(await readdir(designDirectory)).toEqual([
      "DESIGN.slide.md",
      "DESIGN.theme.md",
      "images",
    ]);
    expect(logs.join("\n")).toContain("Copied design files from");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("scaffold copies only the selected design directory", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "slidev-design-test-"));
  try {
    const source = path.join(temporaryRoot, "source");
    const selected = path.join(source, "design-md", "10x");
    await mkdir(selected, { recursive: true });
    await writeFile(path.join(source, "README.md"), "Repository overview");
    await writeFile(path.join(selected, "DESIGN.md"), "# 10x design\n");
    await writeFile(path.join(selected, "preview.html"), "<html></html>");

    const result = await scaffold({
      cwd: temporaryRoot,
      designRepository: "https://github.com/owner/design/tree/main/design-md/10x",
      directory: "deck",
      logger: { log: () => {} },
      cloneDesignRepository: async (url, destination, ref) => {
        expect(url).toBe("https://github.com/owner/design.git");
        expect(ref).toBe("main");
        await cp(source, destination, { recursive: true });
      },
    });

    const designDirectory = path.join(result.targetDirectory, "DESIGN-dot-md");
    expect(await readFile(path.join(designDirectory, "DESIGN.theme.md"), "utf8")).toBe(
      "# 10x design\n",
    );
    expect(await readFile(path.join(designDirectory, "preview.html"), "utf8")).toBe(
      "<html></html>",
    );
    expect((await readdir(designDirectory)).sort()).toEqual([
      "DESIGN.slide.md",
      "DESIGN.theme.md",
      "preview.html",
    ]);

    const pathResult = await scaffold({
      cwd: temporaryRoot,
      designRepository: "owner/design",
      designPath: "design-md/10x",
      directory: "deck-by-path",
      logger: { log: () => {} },
      cloneDesignRepository: async (_url, destination) => {
        await cp(source, destination, { recursive: true });
      },
    });
    expect(
      await readFile(
        path.join(pathResult.targetDirectory, "DESIGN-dot-md/DESIGN.theme.md"),
        "utf8",
      ),
    ).toBe("# 10x design\n");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("missing DESIGN.md stops before creating a deck", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "slidev-design-test-"));
  try {
    await expect(
      scaffold({
        cwd: temporaryRoot,
        designRepository: "owner/design",
        directory: "deck",
        logger: { log: () => {} },
        cloneDesignRepository: async (_url, destination) => {
          await mkdir(destination);
        },
      }),
    ).rejects.toThrow(/must contain DESIGN\.md/);
    expect(await readdir(temporaryRoot)).toEqual([]);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("dry-run is parsed independently of install and does not create a target", async () => {
  expect(parseArgs(["demo", "--dry-run", "--install"])).toMatchObject({
    dryRun: true,
    install: true,
  });
  const root = await mkdtemp(path.join(os.tmpdir(), "slidev-dry-run-"));
  const logs: string[] = [];
  try {
    const result = await scaffold({
      cwd: root,
      directory: "nested/demo",
      dryRun: true,
      install: true,
      title: "Demo",
      logger: { log: (message) => logs.push(message) },
    });
    expect(result.deckTitle).toBe("Demo");
    expect(result.targetDirectory).toBe(path.join(root, "nested/demo"));
    expect(await readdir(root)).toEqual([]);
    expect(logs.join("\n")).toContain("[dry-run] Would create Demo");
    expect(logs.join("\n")).toContain("[dry-run] Would install dependencies");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dry-run accepts empty targets and validates occupied targets without modifying them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "slidev-dry-run-"));
  const options = { cwd: root, directory: "target", dryRun: true, logger: { log: () => {} } };
  try {
    await mkdir(path.join(root, "target"));
    await scaffold(options);
    expect(await readdir(path.join(root, "target"))).toEqual([]);
    await writeFile(path.join(root, "target/keep.txt"), "keep");
    await expect(scaffold(options)).rejects.toThrow(/not empty/);
    expect(await readFile(path.join(root, "target/keep.txt"), "utf8")).toBe("keep");
    await expect(scaffold({ ...options, directory: "target/keep.txt" })).rejects.toThrow(
      /not a directory/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
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
