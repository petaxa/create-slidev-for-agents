import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "playground:cli": {
        command: "vp pack && node ./dist/create-slidev.mjs --dry-run",
        cache: false,
      },
      "playground:specs": {
        command: "vp dev --config playground/vite.config.ts",
        cache: false,
      },
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  pack: {
    clean: true,
    entry: ["src/entry.ts"],
    format: ["esm"],
    outDir: "dist",
    outputOptions: {
      entryFileNames: "create-slidev.mjs",
    },
    platform: "node",
    target: "node20",
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["steps.md"],
  },
  lint: {
    ignorePatterns: ["steps.md", "template/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
