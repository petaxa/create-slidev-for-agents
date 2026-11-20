import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function nextVersion(version: string, bump: string): string {
  if (!["patch", "minor", "major"].includes(bump)) {
    throw new Error("Usage: vp run release <patch|minor|major>");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a stable version, got: ${version}`);
  }
  const [major, minor, patch] = version.split(".").map(BigInt);
  if (bump === "major") return `${major + 1n}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1n}.0`;
  return `${major}.${minor}.${patch + 1n}`;
}

export function release(
  bump: string,
  cwd = process.cwd(),
  verify = () => {
    for (const args of [["check"], ["test"], ["pack"]]) {
      execFileSync("vp", args, { cwd, stdio: "inherit" });
    }
  },
): void {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const root = git("rev-parse", "--show-toplevel");
  if (realpathSync(cwd) !== realpathSync(root))
    throw new Error("Run release from the repository root.");
  const packagePath = path.join(root, "package.json");
  const original = readFileSync(packagePath, "utf8");
  const pkg = JSON.parse(original) as { version: string };
  const version = nextVersion(pkg.version, bump);
  const branch = `release/v${version}`;
  if (git("branch", "--show-current") !== "main") throw new Error("Release requires main.");
  if (git("status", "--porcelain"))
    throw new Error("Commit or stash your changes before releasing.");
  git("fetch", "origin", "refs/heads/main:refs/remotes/origin/main");
  const head = git("rev-parse", "HEAD");
  if (head !== git("rev-parse", "refs/remotes/origin/main")) {
    throw new Error("main must match origin/main. Pull or push your changes first.");
  }
  if (
    git("branch", "--list", branch) ||
    git("ls-remote", "--heads", "origin", `refs/heads/${branch}`)
  ) {
    throw new Error(`Release branch already exists: ${branch}`);
  }
  verify();
  if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== head) {
    throw new Error(
      "Verification changed the working tree or HEAD. Review changes before releasing.",
    );
  }
  git("switch", "-c", branch);
  writeFileSync(packagePath, original.replace(/("version"\s*:\s*")[^"]+(".*)/, `$1${version}$2`));
  try {
    git("add", "--", "package.json");
    git("commit", "-m", `chore: release v${version}`);
  } catch (error) {
    // Do not reset HEAD or discard other files when a commit hook fails.
    if (git("rev-parse", "HEAD") === head) {
      writeFileSync(packagePath, original);
      git("restore", "--staged", "--", "package.json");
    }
    throw error;
  }
  console.log(`Pushing ${branch} to origin…`);
  try {
    git("push", "--set-upstream", "origin", `HEAD:refs/heads/${branch}`);
  } catch (error) {
    console.error(
      `Push failed. The release commit is kept on ${branch}. Retry:\ngit push --set-upstream origin HEAD:refs/heads/${branch}`,
    );
    throw error;
  }
  console.log(
    `Pushed ${branch}. GitHub Actions will create a release PR. Merge it to stage the package on npm.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: vp run release <patch|minor|major>");
    release(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
