import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function versionIncreased(before: unknown, after: unknown): boolean {
  const parse = (version: unknown): bigint[] => {
    if (
      typeof version !== "string" ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    ) {
      throw new Error(`Expected a stable package version, got: ${String(version)}`);
    }
    return version.split(".").map(BigInt);
  };
  const oldParts = parse(before);
  const newParts = parse(after);
  for (let index = 0; index < 3; index++) {
    if (newParts[index] > oldParts[index]) return true;
    if (newParts[index] < oldParts[index]) throw new Error("Package version must not decrease.");
  }
  return false;
}

export function detectVersionIncrease(before: string, after: string, cwd = process.cwd()): boolean {
  const readVersion = (sha: string): unknown => {
    if (!/^[a-f0-9]{40}$/.test(sha) || /^0+$/.test(sha)) {
      throw new Error("Expected a nonzero push commit SHA.");
    }
    const contents = execFileSync("git", ["show", `${sha}:package.json`], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });
    return (JSON.parse(contents) as { version?: unknown }).version;
  };
  return versionIncreased(readVersion(before), readVersion(after));
}

export async function createReleasePR(
  repository: string,
  branch: string,
  token: string,
  api = "https://api.github.com",
): Promise<string> {
  const match = /^release\/v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(branch);
  if (!match || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) {
    throw new Error("Expected a release/vX.Y.Z branch, repository and GITHUB_TOKEN.");
  }
  const [owner] = repository.split("/");
  const endpoint = `${api}/repos/${repository}/pulls`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const existing = await fetch(
    `${endpoint}?${new URLSearchParams({ state: "open", base: "main", head: `${owner}:${branch}` })}`,
    { headers },
  );
  if (!existing.ok) throw new Error(`Could not list release PRs: HTTP ${existing.status}`);
  const prs = (await existing.json()) as { html_url: string }[];
  if (prs.length) return prs[0].html_url;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `chore: release v${match[1]}`,
      head: branch,
      base: "main",
      body: `Release create-slidev-for-agents ${match[1]}.\n\nMerging this PR starts package checks, builds the package and stages it on npm. Approve the staged package on npm to publish.`,
    }),
  });
  if (!response.ok)
    throw new Error(
      `Could not create release PR: HTTP ${response.status}. Check Actions workflow PR permissions.`,
    );
  return ((await response.json()) as { html_url: string }).html_url;
}

async function main() {
  if (process.argv[2] === "detect") {
    if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
    const increased = detectVersionIncrease(
      process.env.BEFORE_SHA ?? "",
      process.env.AFTER_SHA ?? "",
    );
    appendFileSync(process.env.GITHUB_OUTPUT, `increased=${increased}\n`);
    console.log(
      increased
        ? "Package version increased; preparing publication."
        : "Package version unchanged; skipping publication.",
    );
  } else if (process.argv[2] === "pr") {
    const url = await createReleasePR(
      process.env.GITHUB_REPOSITORY ?? "",
      process.env.GITHUB_REF_NAME ?? "",
      process.env.GITHUB_TOKEN ?? "",
      process.env.GITHUB_API_URL,
    );
    console.log(url);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Release PR: ${url}\n`);
  } else throw new Error("Expected detect or pr.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
