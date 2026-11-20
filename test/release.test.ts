import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { nextVersion, release } from "../scripts/release";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "slidev-release-"));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  const cwd = path.join(root, "repo");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  execFileSync("git", ["init", "-b", "main", cwd], { stdio: "pipe" });
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(
    path.join(cwd, "package.json"),
    '{\n  "name": "example",\n  "version": "0.0.2"\n}\n',
  );
  git("add", ".");
  git("commit", "-m", "initial");
  git("remote", "add", "origin", remote);
  git("push", "-u", "origin", "main");
  return { cwd, remote, git };
}

test("bumps stable versions and rejects invalid input", () => {
  expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
  expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
  expect(() => nextVersion("1.2.3-beta.1", "patch")).toThrow(/stable/);
  expect(() => nextVersion("01.2.3", "patch")).toThrow(/stable/);
  expect(() => nextVersion("1.2.3", "unknown")).toThrow(/Usage/);
});

test("checks before updating and pushes only the release branch", () => {
  const { cwd, remote, git } = fixture();
  const before = git("rev-parse", "HEAD");
  let checked = false;
  release("patch", cwd, () => {
    expect(JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")).version).toBe("0.0.2");
    checked = true;
  });
  expect(checked).toBe(true);
  expect(git("status", "--porcelain")).toBe("");
  expect(git("branch", "--show-current")).toBe("release/v0.0.3");
  expect(git("tag", "--list")).toBe("");
  expect(git("show", "--format=", "--name-only", "HEAD")).toBe("package.json");
  const remoteGit = (...args: string[]) =>
    execFileSync("git", ["--git-dir", remote, ...args], { encoding: "utf8" }).trim();
  expect(remoteGit("rev-parse", "main")).toBe(before);
  expect(remoteGit("rev-parse", "release/v0.0.3")).toBe(git("rev-parse", "HEAD"));
});

test("refuses dirty trees, non-main branches, unpublished commits and duplicate release branches", () => {
  const { cwd, git } = fixture();
  const verify = () => {
    throw new Error("Verification must not run");
  };
  writeFileSync(path.join(cwd, "untracked"), "keep");
  expect(() => release("patch", cwd, verify)).toThrow(/stash/);
  rmSync(path.join(cwd, "untracked"));
  git("switch", "-c", "feature");
  expect(() => release("patch", cwd, verify)).toThrow(/requires main/);
  git("switch", "main");
  git("commit", "--allow-empty", "-m", "ahead");
  expect(() => release("patch", cwd, verify)).toThrow(/match origin/);
  git("push", "origin", "main");
  git("branch", "release/v0.0.3");
  git("push", "origin", "release/v0.0.3");
  git("branch", "-D", "release/v0.0.3");
  expect(() => release("patch", cwd, verify)).toThrow(/already exists/);
});

test("failed verification creates no commit, version update or tag", () => {
  const { cwd, git } = fixture();
  const before = git("rev-parse", "HEAD");
  expect(() =>
    release("patch", cwd, () => {
      throw new Error("checks failed");
    }),
  ).toThrow("checks failed");
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("status", "--porcelain")).toBe("");
  expect(git("tag", "--list")).toBe("");
});

test("rejected push leaves main unchanged and keeps local release for retry", () => {
  const { cwd, remote, git } = fixture();
  const before = git("rev-parse", "HEAD");
  writeFileSync(
    path.join(remote, "hooks/update"),
    '#!/bin/sh\ncase "$1" in refs/heads/release/*) exit 1;; esac\n',
    { mode: 0o755 },
  );
  expect(() => release("patch", cwd, () => {})).toThrow();
  expect(git("branch", "--show-current")).toBe("release/v0.0.3");
  expect(git("rev-parse", "HEAD")).not.toBe(before);
  expect(
    execFileSync("git", ["--git-dir", remote, "rev-parse", "main"], { encoding: "utf8" }).trim(),
  ).toBe(before);
  expect(git("ls-remote", "--tags", "origin")).toBe("");
});
