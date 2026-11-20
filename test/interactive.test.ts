import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import * as prompts from "@clack/prompts";
import { runCli } from "../src/cli";

const mocks = vi.hoisted(() => ({
  cancelled: Symbol("cancelled"),
  progress: { start: vi.fn(), stop: vi.fn(), error: vi.fn() },
  spawn: vi.fn(() => {
    throw new Error("Unexpected dependency installation");
  }),
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("@clack/prompts", () => ({
  text: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  log: { error: vi.fn(), step: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => mocks.progress),
  isCancel: (value: unknown) => value === mocks.cancelled,
}));

let root: string;
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const originalExitCode = process.exitCode;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(prompts.text).mockReset();
  vi.mocked(prompts.select).mockReset().mockResolvedValue("skip");
  vi.mocked(prompts.confirm).mockReset().mockResolvedValue(true);
  root = await mkdtemp(path.join(os.tmpdir(), "slidev-interactive-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(console, "log").mockImplementation(() => {});
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY);
  else Reflect.deleteProperty(process.stdin, "isTTY");
  if (stdoutTTY) Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
  else Reflect.deleteProperty(process.stdout, "isTTY");
  process.exitCode = originalExitCode;
  await rm(root, { recursive: true, force: true });
});

test("creates slides from answers and shows usable next steps without installing", async () => {
  vi.mocked(prompts.text).mockResolvedValueOnce("my-talk").mockResolvedValueOnce("My talk");
  await runCli([]);
  const pkg = JSON.parse(await readFile(path.join(root, "my-talk/package.json"), "utf8"));
  expect(pkg.name).toBe("my-talk");
  expect(await readdir(path.join(root, "my-talk/DESIGN-dot-md"))).toEqual(["DESIGN.slide.md"]);
  expect(prompts.note).toHaveBeenLastCalledWith(
    expect.stringContaining("cd my-talk"),
    "Next steps",
  );
  expect(mocks.progress.stop).toHaveBeenCalledWith("Created My talk");
  expect(mocks.spawn).not.toHaveBeenCalled();
});

test.each([0, 1, 2, 3, 4])("cancelling at question %i never creates files", async (question) => {
  // Directory, title, design choice, repository, and repository folder.
  const answers: (string | symbol)[] = ["talk", "Talk", "owner/design", "design-md/theme"];
  if (question === 2) vi.mocked(prompts.select).mockResolvedValue(mocks.cancelled);
  else {
    const textIndex = question > 2 ? question - 1 : question;
    answers[textIndex] = mocks.cancelled;
    vi.mocked(prompts.select).mockResolvedValue("github");
  }
  for (const value of answers) vi.mocked(prompts.text).mockResolvedValueOnce(value);
  await runCli([]);
  expect(await readdir(root)).toEqual([]);
  expect(prompts.cancel).toHaveBeenCalled();
  expect(process.exitCode).toBe(130);
  expect(prompts.spinner).not.toHaveBeenCalled();
});

test("declining the final confirmation does not create files", async () => {
  vi.mocked(prompts.confirm).mockResolvedValue(false);
  await runCli(["talk", "--title", "Talk"]);
  expect(await readdir(root)).toEqual([]);
  expect(prompts.cancel).toHaveBeenCalled();
});

test("an occupied directory can be corrected without losing existing files", async () => {
  await mkdir(path.join(root, "occupied"));
  await writeFile(path.join(root, "occupied/keep.txt"), "keep");
  vi.mocked(prompts.text)
    .mockResolvedValueOnce("occupied")
    .mockResolvedValueOnce("new-talk")
    .mockResolvedValueOnce("Talk");
  await runCli([]);
  expect(prompts.log.error).toHaveBeenCalledWith(expect.stringContaining("not empty"));
  expect(await readFile(path.join(root, "occupied/keep.txt"), "utf8")).toBe("keep");
  expect(await readdir(root)).toEqual(["new-talk", "occupied"]);
});

test.each(["tree", "blob"])(
  "GitHub %s URLs skip the folder question and dry-run never installs",
  async (kind) => {
    vi.mocked(prompts.select).mockResolvedValue("github");
    vi.mocked(prompts.text).mockResolvedValueOnce(
      `https://github.com/owner/design/${kind}/main/theme`,
    );
    await runCli(["talk", "--title", "Talk", "--dry-run", "--install"]);
    expect(prompts.text).toHaveBeenCalledTimes(1);
    expect(prompts.note).toHaveBeenCalledWith(
      expect.stringContaining("@ main / theme"),
      expect.any(String),
    );
    expect(prompts.note).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] Would create"),
      expect.any(String),
    );
    expect(await readdir(root)).toEqual([]);
    expect(prompts.spinner).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  },
);

test("repository and folder validation explain errors and allow correction", async () => {
  vi.mocked(prompts.select).mockResolvedValue("github");
  vi.mocked(prompts.text).mockResolvedValueOnce("owner/design").mockResolvedValueOnce("theme");
  await runCli(["talk", "--title", "Talk", "--dry-run"]);
  const repositoryValidator = vi.mocked(prompts.text).mock.calls[0][0].validate as (
    value: string,
  ) => unknown;
  const folderValidator = vi.mocked(prompts.text).mock.calls[1][0].validate as (
    value: string,
  ) => unknown;
  expect(repositoryValidator("https://example.com/design")).toEqual(expect.any(String));
  expect(repositoryValidator("owner/design")).toBeUndefined();
  expect(folderValidator("../outside")).toEqual(expect.any(String));
  expect(folderValidator("theme")).toBeUndefined();
  expect(folderValidator("")).toBeUndefined();
});

test("explicit options skip corresponding questions", async () => {
  await runCli(["talk", "--title", "Talk", "--design-repo", "owner/design", "--dry-run"]);
  expect(prompts.text).not.toHaveBeenCalled();
  expect(prompts.select).not.toHaveBeenCalled();
  expect(prompts.confirm).toHaveBeenCalledOnce();
});

test.each(["--yes", "-y", "pipe"])("%s uses defaults without invoking prompts", async (mode) => {
  if (mode === "pipe")
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
  await runCli(["--dry-run", ...(mode === "pipe" ? [] : [mode])]);
  expect(prompts.intro).not.toHaveBeenCalled();
  expect(prompts.text).not.toHaveBeenCalled();
  expect(prompts.confirm).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[dry-run] Would create"));
  expect(await readdir(root)).toEqual([]);
});

test("invalid explicit options fail before any questions", async () => {
  await expect(runCli(["--design-path", "theme"])).rejects.toThrow(/requires --design-repo/);
  await expect(runCli(["--design-repo", "invalid"])).rejects.toThrow(/GitHub/);
  expect(prompts.intro).not.toHaveBeenCalled();
});

test("a target changed after confirmation fails safely and stops the spinner", async () => {
  vi.mocked(prompts.confirm).mockImplementationOnce(async () => {
    await mkdir(path.join(root, "talk"));
    await writeFile(path.join(root, "talk/keep.txt"), "keep");
    return true;
  });
  await expect(runCli(["talk", "--title", "Talk"])).rejects.toThrow(/not empty/);
  expect(mocks.progress.error).toHaveBeenCalledWith("Could not create slides");
  expect(prompts.outro).not.toHaveBeenCalled();
  expect(await readdir(path.join(root, "talk"))).toEqual(["keep.txt"]);
});
