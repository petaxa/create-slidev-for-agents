import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { renderSpec } from "./render";

export function createSpecsReviewConfig({
  specsDirectory = fileURLToPath(new URL("../specs", import.meta.url)),
  publicDirectory = fileURLToPath(new URL("../public", import.meta.url)),
} = {}) {
  return defineConfig({
    root: fileURLToPath(new URL("./", import.meta.url)),
    publicDir: publicDirectory,
    resolve: { alias: { "@specs": specsDirectory } },
    plugins: [
      {
        name: "ox-content-page-specs",
        enforce: "pre",
        async load(id) {
          const query = "?spec-review";
          if (!id.endsWith(`.md${query}`)) return;
          const file = id.slice(0, -query.length);
          this.addWatchFile(file);
          const spec = renderSpec(await readFile(file, "utf8"));
          return `export default ${JSON.stringify(spec)};`;
        },
        configureServer(server) {
          // specs/ is outside the viewer root; watch the directory for new files too.
          server.watcher.add(specsDirectory);
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 3031,
      open: true,
      fs: {
        allow: [fileURLToPath(new URL("../", import.meta.url)), specsDirectory, publicDirectory],
      },
    },
  });
}
