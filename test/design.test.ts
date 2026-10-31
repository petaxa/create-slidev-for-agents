import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vite-plus/test";

import {
  cloneGitHubRepository,
  designRepositoryEntries,
  parseGitHubDesignSource,
  resolveGitHubDesignSource,
} from "../src/design";

test("design repository checkout copies committed files", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "slidev-design-clone-test-"));
  const source = path.join(temporaryRoot, "source");
  const destination = path.join(temporaryRoot, "destination");

  try {
    execFileSync("git", ["init", "-q", source]);
    await writeFile(path.join(source, "DESIGN.md"), "# Theme\n");
    execFileSync("git", ["-C", source, "add", "DESIGN.md"]);
    execFileSync("git", [
      "-C",
      source,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "Initial design",
    ]);
    execFileSync("git", ["-C", source, "branch", "selected-design"]);

    await cloneGitHubRepository(source, destination);
    expect(await readFile(path.join(destination, "DESIGN.md"), "utf8")).toBe("# Theme\n");
    execFileSync("git", ["-C", source, "branch", "feat/theme"]);
    const resolvedSource = await resolveGitHubDesignSource({
      repositoryUrl: source,
      ref: "feat",
      directory: "theme/DESIGN.md",
      kind: "file",
    });
    expect(resolvedSource.ref).toBe("feat/theme");
    expect(resolvedSource.directory).toBe("DESIGN.md");
    const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const commitDestination = path.join(temporaryRoot, "commit-destination");
    await cloneGitHubRepository(source, commitDestination, commit);
    expect(await readFile(path.join(commitDestination, "DESIGN.md"), "utf8")).toBe("# Theme\n");
    const selectedDestination = path.join(temporaryRoot, "selected-destination");
    await cloneGitHubRepository(source, selectedDestination, "selected-design");
    expect(await readFile(path.join(selectedDestination, "DESIGN.md"), "utf8")).toBe("# Theme\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("file and folder URLs resolve refs containing slashes", async () => {
  for (const kind of ["blob", "tree"]) {
    const source = parseGitHubDesignSource(
      `https://github.com/owner/design/${kind}/feat/theme/docs/DESIGN.md`,
    );
    const resolved = await resolveGitHubDesignSource(
      source,
      async () => "abc\trefs/heads/feat\nabc\trefs/heads/feat/theme\n",
    );
    expect(resolved.ref).toBe("feat/theme");
    expect(resolved.directory).toBe("docs/DESIGN.md");
    expect(resolved.kind).toBe(kind === "blob" ? "file" : "directory");
  }
  await expect(
    resolveGitHubDesignSource(
      parseGitHubDesignSource("https://github.com/owner/design/tree/missing/docs"),
      async () => "",
    ),
  ).rejects.toThrow(/No branch or tag/);
});

test("symbolic links are rejected before copying, including parent path components", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "slidev-link-test-"));
  try {
    await mkdir(path.join(root, "docs/images"), { recursive: true });
    await writeFile(path.join(root, "docs/guide.md"), "# Design");
    await symlink("guide.md", path.join(root, "docs/alias.md"));
    await expect(designRepositoryEntries(path.join(root, "docs"))).rejects.toThrow(
      /Symbolic links/,
    );
    await expect(designRepositoryEntries(path.join(root, "docs/alias.md"), "file")).rejects.toThrow(
      /Symbolic links/,
    );
    await symlink("docs", path.join(root, "linked"));
    await expect(
      designRepositoryEntries(path.join(root, "linked/images"), "directory", root),
    ).rejects.toThrow(/Symbolic links/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
