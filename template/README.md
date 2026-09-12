# {{DECK_TITLE}}

Slidev で作るプレゼンテーションです。

## 開発

```bash
__INSTALL_COMMAND__
__DEV_COMMAND__
```

`slides.md` がスライド順を管理し、各ページの実装は `pages/` に置きます。
ページごとの意図は、同名の `specs/*.md` に記録します。共通の見た目は `layouts/`、`components/`、`styles/` に分かれています。

デザインを変更・拡張するときは、最初に [DESIGN.md](./DESIGN.md) を確認してください。

LLM にスライドを書かせる場合は、[AGENTS.md](./AGENTS.md) の指示に従います。最初に `specs/_prot.md` を書き、LLM が作成した `specs/*.md` を確認してからページ実装へ進んでください。実装確認後は `specs/_feedback.md` に修正内容を書き、仕様とページを一緒に更新させます。

## 主なコマンド

```bash
__DEV_COMMAND__
__BUILD_COMMAND__
__EXPORT_COMMAND__
```

`export` には環境によって Playwright のブラウザ導入が必要です。

`dev`、`build`、`export` は `package.json` ではなく `vite.config.ts` の Vite+ タスクとして定義されています。フォーマット、lint、型検査をまとめて実行する場合は `vp check` を使います。VS Code では推奨拡張機能を導入すると、`.vscode/settings.json` に従って Oxc が保存時に整形と fix を行います。

## GitHub Pages へのデプロイ

`main` または `master` ブランチへ push すると、`.github/workflows/deploy.yml` が Slidev をビルドして GitHub Pages へデプロイします。手動実行にも対応しています。

workflow は lockfile から npm / pnpm / Yarn / Bun を判定します。通常のリポジトリでは `/<repository-name>/`、`*.github.io` リポジトリでは `/` をベースパスとして自動設定します。

GitHub リポジトリの **Settings → Pages → Build and deployment → Source** が **GitHub Actions** になっていることを確認してください。Vercel や Netlify の設定ファイルは使用しません。
