import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prompts from "@clack/prompts";

import {
  cloneGitHubRepository,
  copyDesignRepository,
  designRepositoryEntries,
  parseGitHubDesignSource,
  resolveGitHubDesignSource,
} from "./design";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const templateDirectory = path.join(packageRoot, "template");
const packageManagers = new Set(["npm", "pnpm", "yarn", "bun"]);

export interface CliOptions {
  designPath?: string;
  designRepository?: string;
  directory?: string;
  dryRun: boolean;
  help: boolean;
  install: boolean;
  title?: string;
  version: boolean;
  yes: boolean;
}

export interface Logger {
  log(message: string): void;
}

export interface ScaffoldOptions {
  cwd?: string;
  designPath?: string;
  designRepository?: string;
  directory: string;
  dryRun?: boolean;
  install?: boolean;
  logger?: Logger;
  title?: string;
  cloneDesignRepository?: typeof cloneGitHubRepository;
  resolveDesignSource?: typeof resolveGitHubDesignSource;
}

export interface ScaffoldResult {
  deckTitle: string;
  packageManager: string;
  projectName: string;
  targetDirectory: string;
}

export const helpText = `
Create a Slidev deck with an optional GitHub design guide.

Usage:
  vp create slidev-for-agents -- [directory] [options]
  npm create slidev-for-agents@latest [directory] -- [options]
  create-slidev-for-agents [directory] [options]

Options:
  --title <title>       Set the presentation title
  --design-repo <url>   GitHub file, folder, or repository URL
  --design-path <path>  Directory within the design repository
  -y, --yes             Use defaults for unanswered questions
  --install             Install dependencies after creating files
  --dry-run             Preview without creating files or installing dependencies
  -h, --help            Show this help
  -v, --version         Show the package version
`;

export function parseArgs(argv: string[]): CliOptions {
  const result: CliOptions = {
    designPath: undefined,
    designRepository: undefined,
    directory: undefined,
    dryRun: false,
    help: false,
    install: false,
    title: undefined,
    version: false,
    yes: false,
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

    if (argument === "-y" || argument === "--yes") {
      result.yes = true;
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

    if (argument === "--dry-run") {
      result.dryRun = true;
      continue;
    }

    if (argument === "--title" || argument === "--design-repo" || argument === "--design-path") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === "--title") result.title = value;
      else if (argument === "--design-repo") result.designRepository = value;
      else result.designPath = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--title=")) {
      result.title = argument.slice("--title=".length);
      continue;
    }

    if (argument.startsWith("--design-repo=")) {
      const value = argument.slice("--design-repo=".length);
      if (!value) throw new Error("--design-repo requires a value.");
      result.designRepository = value;
      continue;
    }

    if (argument.startsWith("--design-path=")) {
      const value = argument.slice("--design-path=".length);
      if (!value) throw new Error("--design-path requires a value.");
      result.designPath = value;
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

async function validateTarget(targetDirectory: string): Promise<void> {
  if (!(await pathExists(targetDirectory))) {
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
  designPath,
  designRepository,
  directory,
  dryRun = false,
  install = false,
  logger = console,
  title,
  cloneDesignRepository = cloneGitHubRepository,
  resolveDesignSource = resolveGitHubDesignSource,
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
  if (designPath && !designRepository) {
    throw new Error("--design-path requires --design-repo.");
  }
  let designSource = designRepository
    ? parseGitHubDesignSource(designRepository, designPath)
    : undefined;

  await validateTarget(targetDirectory);
  let temporaryDesignDirectory: string | undefined;
  try {
    let designEntries: string[] | undefined;
    if (!dryRun && designSource) {
      designSource = await resolveDesignSource(designSource);
      temporaryDesignDirectory = await mkdtemp(path.join(os.tmpdir(), "slidev-design-"));
      const checkoutDirectory = path.join(temporaryDesignDirectory, "repository");
      await cloneDesignRepository(designSource.repositoryUrl, checkoutDirectory, designSource.ref);
      designEntries = await designRepositoryEntries(
        path.join(checkoutDirectory, designSource.directory),
        designSource.kind,
        checkoutDirectory,
      );
    }

    if (!dryRun) {
      await mkdir(targetDirectory, { recursive: true });
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
      if (temporaryDesignDirectory && designEntries && designSource) {
        await mkdir(path.join(targetDirectory, "DESIGN-dot-md/theme"));
        await copyDesignRepository(
          path.join(
            temporaryDesignDirectory,
            "repository",
            designSource.kind === "file"
              ? path.dirname(designSource.directory)
              : designSource.directory,
          ),
          path.join(targetDirectory, "DESIGN-dot-md/theme"),
          designEntries,
        );
      }
    }
  } finally {
    if (temporaryDesignDirectory) {
      await rm(temporaryDesignDirectory, { force: true, recursive: true });
    }
  }

  logger.log(
    `\n${dryRun ? "[dry-run] Would create" : "Created"} ${deckTitle} in ${targetDirectory}`,
  );
  if (designSource) {
    const sourceDescription = `${designSource.repositoryUrl}${designSource.directory ? ` (${designSource.directory})` : ""}`;
    logger.log(
      `${dryRun ? "[dry-run] Would copy" : "Copied"} design files from ${sourceDescription} to DESIGN-dot-md/theme/.`,
    );
  }

  if (install) {
    if (dryRun) {
      logger.log(`\n[dry-run] Would install dependencies with ${packageManager}.`);
    } else {
      logger.log(`\nInstalling dependencies with ${packageManager}...\n`);
      await runInstall(packageManager, targetDirectory);
    }
  }

  const displayTarget = relativeTarget(cwd, targetDirectory);
  const cdCommand = displayTarget === "." ? "" : `cd ${quotePathForDisplay(displayTarget)}`;
  const devCommand = runCommand("dev");

  logger.log("\nNext steps:");
  if (cdCommand) logger.log(`  ${cdCommand}`);
  if (!install || dryRun) logger.log(`  ${installCommand}`);
  logger.log(`  ${devCommand}\n`);

  return { deckTitle, packageManager, projectName, targetDirectory };
}

async function readVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as { version: string };
  return packageJson.version;
}

class PromptCancelled extends Error {}

function answer<T>(value: T | symbol): T {
  if (prompts.isCancel(value)) throw new PromptCancelled();
  return value as T;
}

function validationMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function configureInteractively(options: CliOptions): Promise<CliOptions> {
  const configured = { ...options };
  if (!configured.directory) {
    let previous = "my-slidev-deck";
    for (;;) {
      const directory = answer(
        await prompts.text({
          message: "Where should we create your slides?",
          placeholder: "my-slidev-deck",
          defaultValue: "my-slidev-deck",
          initialValue: previous,
          validate: (value) => (!value?.trim() ? "Enter a directory name." : undefined),
        }),
      ).trim();
      try {
        await validateTarget(path.resolve(directory));
        configured.directory = directory;
        break;
      } catch (error) {
        prompts.log.error(validationMessage(error));
        previous = directory;
      }
    }
  } else {
    await validateTarget(path.resolve(configured.directory));
  }

  if (configured.title === undefined) {
    const defaultTitle = titleFromDirectory(path.basename(path.resolve(configured.directory)));
    configured.title =
      answer(
        await prompts.text({
          message: "What is your presentation called?",
          placeholder: defaultTitle,
          defaultValue: defaultTitle,
        }),
      ).trim() || defaultTitle;
  }

  if (!configured.designRepository) {
    const design = answer(
      await prompts.select({
        message: "Would you like to bring a design guide?",
        initialValue: "skip",
        options: [
          { value: "skip", label: "Start with the slide guide", hint: "No extra setup" },
          { value: "github", label: "Import from GitHub", hint: "Copy a design file or folder" },
        ],
      }),
    );
    if (design === "github") {
      configured.designRepository = answer(
        await prompts.text({
          message: "GitHub file, folder, or repository URL",
          placeholder: "owner/repository or https://github.com/owner/repo/tree/main/design",
          validate: (value) => {
            try {
              parseGitHubDesignSource(value ?? "", configured.designPath);
            } catch (error) {
              return validationMessage(error);
            }
          },
        }),
      ).trim();
      if (
        configured.designPath === undefined &&
        !parseGitHubDesignSource(configured.designRepository).ref
      ) {
        configured.designPath =
          answer(
            await prompts.text({
              message: "Which folder should we import? (Enter for repository root)",
              placeholder: "e.g. design-md/10x",
              validate: (value) => {
                try {
                  parseGitHubDesignSource(configured.designRepository!, value?.trim() || undefined);
                } catch (error) {
                  return validationMessage(error);
                }
              },
            }),
          ).trim() || undefined;
      }
    }
  }

  const source = configured.designRepository
    ? parseGitHubDesignSource(configured.designRepository, configured.designPath)
    : undefined;
  prompts.note(
    [
      `Directory: ${path.resolve(configured.directory)}`,
      `Title: ${configured.title}`,
      `Design: ${source ? `${source.repositoryUrl}${source.ref ? ` @ ${source.ref}` : ""} / ${source.directory || "(root)"}` : "Slide guide only"}`,
      `Dependencies: ${configured.install ? `Install with ${detectPackageManager()}` : "Install later"}`,
    ].join("\n"),
    configured.dryRun ? "Preview settings — no files will be written" : "Your settings",
  );
  if (
    !answer(
      await prompts.confirm({
        message: configured.dryRun ? "Preview with these settings?" : "Create your slides?",
        initialValue: true,
      }),
    )
  )
    throw new PromptCancelled();
  return configured;
}

export async function runCli(argv: string[]): Promise<void> {
  let options = parseArgs(argv);

  if (options.help) {
    console.log(helpText.trim());
    return;
  }
  if (options.version) {
    console.log(await readVersion());
    return;
  }
  // Reject invalid explicit options before asking unrelated questions.
  if (options.designPath && !options.designRepository) {
    throw new Error("--design-path requires --design-repo.");
  }
  if (options.designRepository) {
    parseGitHubDesignSource(options.designRepository, options.designPath);
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.yes);
  let progress: ReturnType<typeof prompts.spinner> | undefined;
  try {
    if (interactive) {
      prompts.intro("create-slidev-for-agents");
      options = await configureInteractively(options);
      if (!options.dryRun) {
        progress = prompts.spinner();
        progress.start(
          options.designRepository
            ? "Importing design guide and creating slides"
            : "Creating your slides",
        );
      }
    }
    const messages: string[] = [];
    const result = await scaffold({
      designPath: options.designPath,
      designRepository: options.designRepository,
      directory: options.directory ?? "my-slidev-deck",
      dryRun: options.dryRun,
      install: interactive ? false : options.install,
      title: options.title,
      logger: interactive ? { log: (message) => messages.push(message) } : console,
    });
    if (interactive) {
      progress?.stop(`Created ${result.deckTitle}`);
      progress = undefined;
      if (options.install && !options.dryRun) {
        prompts.log.step(`Installing dependencies with ${result.packageManager}…`);
        await runInstall(result.packageManager, result.targetDirectory);
      }
      // scaffold's plain output remains available for scripts; the TTY gets a compact next step.
      const commands: string[] = [];
      const displayTarget = relativeTarget(process.cwd(), result.targetDirectory);
      if (displayTarget !== ".") commands.push(`cd ${quotePathForDisplay(displayTarget)}`);
      if (!options.install || options.dryRun) {
        commands.push(
          result.packageManager === "yarn" ? "yarn" : `${result.packageManager} install`,
        );
      }
      commands.push("vp run dev");
      if (options.dryRun) {
        prompts.note(messages.join("\n").trim(), "Preview — no files were written");
        if (options.install)
          prompts.log.info(`Would install dependencies with ${result.packageManager}.`);
      } else {
        prompts.note(commands.join("\n"), "Next steps");
      }
      prompts.outro(options.dryRun ? "Preview complete." : "Your slides are ready.");
    }
  } catch (error) {
    progress?.error("Could not create slides");
    if (error instanceof PromptCancelled) {
      prompts.cancel("Setup cancelled. No files were created.");
      process.exitCode = 130;
      return;
    }
    throw error;
  }
}
