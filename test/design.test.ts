import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vite-plus/test";

import { cloneGitHubRepository } from "../src/design";

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
    const selectedDestination = path.join(temporaryRoot, "selected-destination");
    await cloneGitHubRepository(source, selectedDestination, "selected-design");
    expect(await readFile(path.join(selectedDestination, "DESIGN.md"), "utf8")).toBe("# Theme\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
