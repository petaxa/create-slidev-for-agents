import { spawn } from "node:child_process";
import { cp, lstat, readdir } from "node:fs/promises";
import path from "node:path";

const githubPart = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface GitHubDesignSource {
  repositoryUrl: string;
  directory: string;
  ref?: string;
  kind: "file" | "directory";
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
    throw new Error("Design path must be inside the GitHub repository.");
  }
  return parts.join("/");
}

export function parseGitHubDesignSource(value: string, designPath?: string): GitHubDesignSource {
  const input = value.trim();
  let repositoryPath = input;
  let directoryFromUrl: string | undefined;
  let ref: string | undefined;
  let kind: GitHubDesignSource["kind"] = "directory";

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
      throw new Error("Enter a GitHub file, folder, or repository URL, or owner/repository.");
    }
    const segments = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment));
    repositoryPath = segments.slice(0, 2).join("/");
    if (segments.length > 2) {
      if (!["tree", "blob"].includes(segments[2]) || segments.length < 5) {
        throw new Error(
          "Use a GitHub file or folder URL with /blob/<ref>/<path> or /tree/<ref>/<path>.",
        );
      }
      kind = segments[2] === "blob" ? "file" : "directory";
      ref = segments[3];
      directoryFromUrl = segments.slice(4).join("/");
    }
  }

  const parts = repositoryPath.replace(/\.git$/, "").split("/");
  if (parts.length !== 2 || !parts.every((part) => githubPart.test(part))) {
    throw new Error("Enter a GitHub file, folder, or repository URL, or owner/repository.");
  }
  if (directoryFromUrl !== undefined && designPath !== undefined) {
    throw new Error("Specify the design directory in either the GitHub URL or --design-path.");
  }
  if (ref && !ref.split("/").every((part) => githubPart.test(part))) {
    throw new Error("The GitHub directory URL has an invalid branch name.");
  }

  return {
    repositoryUrl: `https://github.com/${parts[0]}/${parts[1]}.git`,
    directory: normalizeDesignDirectory(directoryFromUrl ?? designPath ?? ""),
    kind,
    ...(ref ? { ref } : {}),
  };
}

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    child.on("error", (error) => reject(new Error(`Could not start git: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Git failed: ${errorOutput.trim() || `exit ${code}`}`));
    });
  });
}

// A GitHub URL does not delimit refs containing slashes from the selected path.
export async function resolveGitHubDesignSource(
  source: GitHubDesignSource,
  listRefs = (url: string) => runGit(["ls-remote", "--heads", "--tags", "--", url]),
): Promise<GitHubDesignSource> {
  if (!source.ref || /^[a-f0-9]{40}$/i.test(source.ref)) return source;
  const combined = `${source.ref}/${source.directory}`;
  const refs = (await listRefs(source.repositoryUrl))
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace(/^refs\/(heads|tags)\//, ""))
    .filter((ref): ref is string => Boolean(ref) && !ref.endsWith("^{}"))
    .sort((a, b) => b.length - a.length);
  const ref = refs.find((candidate) => combined.startsWith(`${candidate}/`));
  if (!ref) throw new Error(`No branch or tag matches the GitHub URL: ${combined}`);
  return { ...source, ref, directory: normalizeDesignDirectory(combined.slice(ref.length + 1)) };
}

export async function cloneGitHubRepository(
  repositoryUrl: string,
  destination: string,
  ref?: string,
): Promise<void> {
  if (ref && /^[a-f0-9]{40}$/i.test(ref)) {
    await runGit(["init", "--", destination]);
    await runGit(["-C", destination, "fetch", "--depth", "1", "--", repositoryUrl, ref]);
    await runGit(["-C", destination, "checkout", "--detach", "FETCH_HEAD"]);
    return;
  }
  const args = ["clone", "--depth", "1", "--single-branch"];
  if (ref) args.push("--branch", ref);
  await runGit([...args, "--", repositoryUrl, destination]);
}

// Validate before creating the deck. Reject links rather than copying dangling
// references to the temporary checkout or reading files outside the selection.
export async function designRepositoryEntries(
  sourcePath: string,
  kind: GitHubDesignSource["kind"] = "directory",
  checkoutRoot = sourcePath,
): Promise<string[]> {
  async function validate(entryPath: string): Promise<void> {
    const entry = await lstat(entryPath);
    if (entry.isSymbolicLink())
      throw new Error(`Symbolic links are not supported in design sources: ${entryPath}`);
    if (entry.isDirectory()) {
      for (const name of await readdir(entryPath)) {
        if (name !== ".git") await validate(path.join(entryPath, name));
      }
    } else if (!entry.isFile()) throw new Error(`Unsupported design file: ${entryPath}`);
  }
  // Check every path component too, so a selected subfolder cannot traverse a link.
  let current = sourcePath;
  while (current !== checkoutRoot && path.dirname(current) !== current) {
    if ((await lstat(current)).isSymbolicLink())
      throw new Error(`Symbolic links are not supported in design sources: ${current}`);
    current = path.dirname(current);
  }
  const sourceStat = await lstat(sourcePath);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Symbolic links are not supported in design sources: ${sourcePath}`);
  }
  if (kind === "file" ? !sourceStat.isFile() : !sourceStat.isDirectory()) {
    throw new Error(`Design source is not a ${kind}: ${sourcePath}`);
  }
  await validate(sourcePath);
  return kind === "file"
    ? [path.basename(sourcePath)]
    : (await readdir(sourcePath)).filter((name) => name !== ".git");
}

export async function copyDesignRepository(
  sourceDirectory: string,
  targetDirectory: string,
  entries: string[],
): Promise<void> {
  for (const entry of entries) {
    await cp(path.join(sourceDirectory, entry), path.join(targetDirectory, entry), {
      errorOnExist: true,
      force: false,
      recursive: true,
      filter: (source) => path.basename(source) !== ".git",
    });
  }
}
