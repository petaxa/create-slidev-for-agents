import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: "../public",
  plugins: [
    {
      name: "watch-page-specs",
      configureServer(server) {
        // specs/ is outside the viewer root; watch the directory for new files too.
        server.watcher.add(fileURLToPath(new URL("../specs", import.meta.url)));
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 3031,
    open: true,
    fs: { allow: [fileURLToPath(new URL("../", import.meta.url))] },
  },
});
