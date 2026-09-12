import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const templateDirectory = path.join(packageRoot, "template");
const packageManagers = new Set(["npm", "pnpm", "yarn", "bun"]);

export interface CliOptions {
  directory?: string;
  help: boolean;
  install: boolean;
  title?: string;
  version: boolean;
}

export interface Logger {
  log(message: string): void;
}

export interface ScaffoldOptions {
  cwd?: string;
  directory: string;
  install?: boolean;
  logger?: Logger;
  title?: string;
}

export interface ScaffoldResult {
  deckTitle: string;
  packageManager: string;
  projectName: string;
  targetDirectory: string;
}

export const helpText = `
Create a Slidev deck with the petaxa editorial theme.

Usage:
  vp create slidev-for-agents -- [directory] [options]
  npm create slidev-for-agents@latest [directory] -- [options]
  create-slidev-for-agents [directory] [options]

Options:
  --title <title>       Set the presentation title
  --install             Install dependencies after creating files
  -h, --help            Show this help
  -v, --version         Show the package version
`;

export function parseArgs(argv: string[]): CliOptions {
  const result: CliOptions = {
    directory: undefined,
    help: false,
    install: false,
    title: undefined,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      const rest = argv.slice(index + 1);
      if (rest.length > 1 || (rest.length === 1 && result.directory)) {
        throw new Error("Only one target directory can be specified.");
      }
      result.directory ??= rest[0];
      break;
    }

    if (argument === "-h" || argument === "--help") {
      result.help = true;
      continue;
    }

    if (argument === "-v" || argument === "--version") {
      result.version = true;
      continue;
    }

    if (argument === "--no-install") {
      result.install = false;
      continue;
    }

    if (argument === "--install") {
      result.install = true;
      continue;
    }

    if (argument === "--title") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a value.`);
      }
      result.title = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--title=")) {
      result.title = argument.slice("--title=".length);
      continue;
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (result.directory) {
      throw new Error("Only one target directory can be specified.");
    }

    result.directory = argument;
  }

  return result;
}

export function detectPackageManager(userAgent = process.env.npm_config_user_agent ?? ""): string {
  const detected = userAgent.split(" ")[0]?.split("/")[0];
  return packageManagers.has(detected) ? detected : "npm";
}

export function normalizePackageName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "slidev-deck";
}

export function titleFromDirectory(value: string): string {
  const title = value.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");

  return title ? title.charAt(0).toUpperCase() + title.slice(1) : "My presentation";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJavaScriptString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureWritableTarget(targetDirectory: string): Promise<void> {
  if (!(await pathExists(targetDirectory))) {
    await mkdir(targetDirectory, { recursive: true });
    return;
  }

  const targetStat = await stat(targetDirectory);
  if (!targetStat.isDirectory()) {
    throw new Error(`Target already exists and is not a directory: ${targetDirectory}`);
  }

  const entries = (await readdir(targetDirectory)).filter((entry) => entry !== ".DS_Store");
  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${targetDirectory}`);
  }
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function replacePlaceholders(
  targetDirectory: string,
  replacements: Record<string, string>,
): Promise<void> {
  const files = await collectFiles(targetDirectory);

  for (const filePath of files) {
    const contents = await readFile(filePath, "utf8");
    let nextContents = contents;

    for (const [placeholder, value] of Object.entries(replacements)) {
      nextContents = nextContents.replaceAll(placeholder, value);
    }

    if (nextContents !== contents) {
      await writeFile(filePath, nextContents, "utf8");
    }
  }
}

function runInstall(packageManager: string, cwd: string): Promise<void> {
  const command = process.platform === "win32" ? `${packageManager}.cmd` : packageManager;
  const args = packageManager === "yarn" ? [] : ["install"];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(new Error(`Could not start ${packageManager}: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${packageManager} install exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

function relativeTarget(cwd: string, targetDirectory: string): string {
  const relative = path.relative(cwd, targetDirectory);
  return relative && !relative.startsWith("..") ? relative : targetDirectory;
}

function quotePathForDisplay(value: string): string {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

export async function scaffold({
  cwd = process.cwd(),
  directory,
  install = false,
  logger = console,
  title,
}: ScaffoldOptions): Promise<ScaffoldResult> {
  if (!directory) {
    throw new Error("A target directory is required.");
  }

  const packageManager = detectPackageManager();
  const targetDirectory = path.resolve(cwd, directory);
  const directoryName = path.basename(targetDirectory);
  const projectName = normalizePackageName(directoryName);
  const deckTitle = (title?.trim() || titleFromDirectory(directoryName)).replace(/\s+/g, " ");
  const installCommand = packageManager === "yarn" ? "yarn" : `${packageManager} install`;
  const runCommand = (task: string) => `vp run ${task}`;

  await ensureWritableTarget(targetDirectory);
  await cp(templateDirectory, targetDirectory, { recursive: true });
  await rename(
    path.join(targetDirectory, "dot-gitignore"),
    path.join(targetDirectory, ".gitignore"),
  );
  await replacePlaceholders(targetDirectory, {
    "{{DECK_TITLE}}": deckTitle,
    __DECK_TITLE_HTML__: escapeHtml(deckTitle),
    __DECK_TITLE_UPPER__: escapeJavaScriptString(deckTitle.toUpperCase()),
    __DECK_TITLE_YAML__: JSON.stringify(deckTitle),
    __BUILD_COMMAND__: runCommand("build"),
    __DEV_COMMAND__: runCommand("dev"),
    __EXPORT_COMMAND__: runCommand("export"),
    __INSTALL_COMMAND__: installCommand,
    __PROJECT_NAME__: projectName,
  });

  logger.log(`\nCreated ${deckTitle} in ${targetDirectory}`);

  if (install) {
    logger.log(`\nInstalling dependencies with ${packageManager}...\n`);
    await runInstall(packageManager, targetDirectory);
  }

  const displayTarget = relativeTarget(cwd, targetDirectory);
  const cdCommand = displayTarget === "." ? "" : `cd ${quotePathForDisplay(displayTarget)}`;
  const devCommand = runCommand("dev");

  logger.log("\nNext steps:");
  if (cdCommand) logger.log(`  ${cdCommand}`);
  if (!install) logger.log(`  ${installCommand}`);
  logger.log(`  ${devCommand}\n`);

  return { deckTitle, packageManager, projectName, targetDirectory };
}

async function readVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as { version: string };
  return packageJson.version;
}

async function promptForDirectory(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "my-slidev-deck";
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Project directory (my-slidev-deck): ");
  prompt.close();
  return answer.trim() || "my-slidev-deck";
}

export async function runCli(argv: string[]): Promise<void> {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(helpText.trim());
    return;
  }

  if (options.version) {
    console.log(await readVersion());
    return;
  }

  const directory = options.directory ?? (await promptForDirectory());
  await scaffold({
    directory,
    install: options.install,
    title: options.title,
  });
}
