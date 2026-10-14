import { spawn } from "node:child_process";
import { cp, lstat, readdir } from "node:fs/promises";
import path from "node:path";

const githubPart = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface GitHubDesignSource {
  repositoryUrl: string;
  directory: string;
  ref?: string;
}

function normalizeDesignDirectory(value: string): string {
  const directory = value.trim();
  if (!directory) return "";

  const parts = directory.split("/");
  if (
    directory.startsWith("/") ||
    directory.includes("\\") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Design path must be a directory inside the GitHub repository.");
  }
  return parts.join("/");
}

export function parseGitHubDesignSource(value: string, designPath?: string): GitHubDesignSource {
  const input = value.trim();
  let repositoryPath = input;
  let directoryFromUrl: string | undefined;
  let ref: string | undefined;

  if (input.startsWith("https://")) {
    const url = new URL(input);
    if (
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("Enter a GitHub repository or directory URL, or owner/repository.");
    }
    const segments = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment));
    repositoryPath = segments.slice(0, 2).join("/");
    if (segments.length > 2) {
      if (segments[2] !== "tree" || segments.length < 5) {
        throw new Error("Use a GitHub directory URL with /tree/<branch>/<path>.");
      }
      ref = segments[3];
      directoryFromUrl = segments.slice(4).join("/");
    }
  }

  const parts = repositoryPath.replace(/\.git$/, "").split("/");
  if (parts.length !== 2 || !parts.every((part) => githubPart.test(part))) {
    throw new Error("Enter a GitHub repository or directory URL, or owner/repository.");
  }
  if (directoryFromUrl !== undefined && designPath !== undefined) {
    throw new Error("Specify the design directory in either the GitHub URL or --design-path.");
  }
  if (ref && !githubPart.test(ref)) {
    throw new Error("The GitHub directory URL has an invalid branch name.");
  }

  return {
    repositoryUrl: `https://github.com/${parts[0]}/${parts[1]}.git`,
    directory: normalizeDesignDirectory(directoryFromUrl ?? designPath ?? ""),
    ...(ref ? { ref } : {}),
  };
}

export function cloneGitHubRepository(
  repositoryUrl: string,
  destination: string,
  ref?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["clone", "--depth", "1", "--single-branch"];
    if (ref) args.push("--branch", ref);
    args.push("--", repositoryUrl, destination);
    const child = spawn("git", args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`Could not start git: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`Could not clone ${repositoryUrl}: ${errorOutput.trim() || `exit ${code}`}`),
        );
      }
    });
  });
}

export async function designRepositoryEntries(sourceDirectory: string): Promise<string[]> {
  let sourceStat;
  try {
    sourceStat = await lstat(sourceDirectory);
  } catch {
    throw new Error(`Design directory does not exist: ${sourceDirectory}`);
  }
  if (!sourceStat.isDirectory()) {
    throw new Error(`Design path is not a directory: ${sourceDirectory}`);
  }

  const designFile = path.join(sourceDirectory, "DESIGN.md");
  let designStat;
  try {
    designStat = await lstat(designFile);
  } catch {
    throw new Error(`The selected design directory must contain DESIGN.md: ${sourceDirectory}`);
  }
  if (!designStat.isFile()) {
    throw new Error("The selected design directory must contain a regular DESIGN.md file.");
  }

  const entries = (await readdir(sourceDirectory)).filter((name) => name !== ".git");
  if (entries.includes("DESIGN.theme.md") || entries.includes("DESIGN.slide.md")) {
    throw new Error("The design repository contains a file that conflicts with DESIGN-dot-md.");
  }
  return entries;
}

export async function copyDesignRepository(
  sourceDirectory: string,
  targetDirectory: string,
  entries: string[],
): Promise<void> {
  for (const entry of entries) {
    const destinationName = entry === "DESIGN.md" ? "DESIGN.theme.md" : entry;
    await cp(path.join(sourceDirectory, entry), path.join(targetDirectory, destinationName), {
      errorOnExist: true,
      force: false,
      recursive: true,
    });
  }
}
