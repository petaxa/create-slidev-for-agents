import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createReleasePR, detectVersionIncrease, versionIncreased } from "../scripts/release-ci";

test.each([
  ["0.0.2", "0.0.2", false],
  ["0.0.2", "0.0.3", true],
  ["0.9.9", "0.10.0", true],
  ["1.9.9", "2.0.0", true],
  ["1.0.9", "1.0.10", true],
])("compares stable versions %s → %s", (before, after, expected) => {
  expect(versionIncreased(before, after)).toBe(expected);
});

test.each([
  ["1.0.0", "0.9.9"],
  ["1.2.3", "1.1.99"],
  ["1.2.3", "1.2.2"],
  ["1.0.0", "1.1.0-beta.1"],
  ["1.0.0", "01.1.0"],
  ["invalid", "invalid"],
  [undefined, "1.0.0"],
  ["1.0.0", undefined],
])("rejects decreases and malformed versions %s → %s", (before, after) => {
  expect(() => versionIncreased(before, after)).toThrow();
});

test("detect reads both pushed snapshots, ignores dependency-only changes and writes Actions output", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "release-detect-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const commit = (version: string, dependencies = {}) => {
    writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ version, dependencies }));
    git("add", "package.json");
    git("commit", "-m", "ordinary commit message");
    return git("rev-parse", "HEAD");
  };
  try {
    git("init");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    const before = commit("0.0.2");
    const dependenciesOnly = commit("0.0.2", { example: "1.0.0" });
    const increased = commit("0.0.3");
    const after = commit("0.0.3", { example: "2.0.0" });
    expect(detectVersionIncrease(before, dependenciesOnly, cwd)).toBe(false);
    expect(detectVersionIncrease(before, after, cwd)).toBe(true);
    // A version bump need not be in the last commit of a multi-commit push.
    expect(detectVersionIncrease(increased, after, cwd)).toBe(false);
    const output = path.join(cwd, "actions-output");
    const script = fileURLToPath(new URL("../scripts/release-ci.ts", import.meta.url));
    for (const [from, to] of [
      [before, after],
      [before, dependenciesOnly],
    ]) {
      execFileSync(process.execPath, [script, "detect"], {
        cwd,
        env: { ...process.env, BEFORE_SHA: from, AFTER_SHA: to, GITHUB_OUTPUT: output },
        stdio: "pipe",
      });
    }
    expect(readFileSync(output, "utf8")).toBe("increased=true\nincreased=false\n");
    for (const invalid of ["", "0".repeat(40), "--help", "f".repeat(40)]) {
      expect(() => detectVersionIncrease(invalid, after, cwd)).toThrow();
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

afterEach(() => vi.unstubAllGlobals());

test("creates a main-targeted PR with GitHub's CI token", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/owner/repo/pull/1" }),
    });
  vi.stubGlobal("fetch", fetch);
  expect(await createReleasePR("owner/repo", "release/v0.0.3", "ci-token")).toBe(
    "https://github.com/owner/repo/pull/1",
  );
  const [endpoint, options] = fetch.mock.calls[1];
  expect(endpoint).toBe("https://api.github.com/repos/owner/repo/pulls");
  expect(options.headers.Authorization).toBe("Bearer ci-token");
  expect(JSON.parse(options.body)).toMatchObject({
    head: "release/v0.0.3",
    base: "main",
    title: "chore: release v0.0.3",
  });
});

test("re-running the workflow reuses its open PR", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => [{ html_url: "existing" }] });
  vi.stubGlobal("fetch", fetch);
  expect(await createReleasePR("owner/repo", "release/v0.0.3", "ci-token")).toBe("existing");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain("head=owner%3Arelease%2Fv0.0.3");
});

test("reports missing PR permission and rejects unrelated branch names", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: false, status: 403 });
  vi.stubGlobal("fetch", fetch);
  await expect(createReleasePR("owner/repo", "release/v0.0.3", "ci-token")).rejects.toThrow(
    /permissions/,
  );
  fetch.mockClear();
  await expect(createReleasePR("owner/repo", "feature", "ci-token")).rejects.toThrow(/Expected/);
  expect(fetch).not.toHaveBeenCalled();
});
