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
vp run specs
```

`export` には環境によって Playwright のブラウザ導入が必要です。

`dev`、`build`、`export`、`specs` は `package.json` ではなく `vite.config.ts` の Vite+ タスクとして定義されています。フォーマット、lint、型検査をまとめて実行する場合は `vp check` を使います。VS Code では推奨拡張機能を導入すると、`.vscode/settings.json` に従って Oxc が保存時に整形と fix を行います。

## 仕様をブラウザで確認する

```bash
vp run specs
```

ブラウザに仕様ビューアが開きます（既定: `http://127.0.0.1:3031`。使用中の場合は次の空きポート）。`specs/NN_name.md` を番号順に表示し、`README.md`、`_prot.md`、`_feedback.md` は一覧から除外します。Slidev と同時に起動できます。

- `←` / `→`: 前 / 次の仕様へ移動
- `Home` / `End`: 最初 / 最後の仕様へ移動
- 左の一覧または下のボタン: クリックで移動
- 本文のスクロール: 長い仕様を確認

確認中の仕様はURLに保持され、再読み込みやブラウザの戻る・進むでも移動できます。Markdownの保存・追加・削除は自動反映されます。仕様がまだなければ作成方法を表示します。

見出し、箇条書き、表、コードブロック、画像などのMarkdownを表示します。画像は `public/images/` に置き、`/images/example.png` または `../public/images/example.png` で参照してください。HTML・Vueコンポーネントは実行せずテキストとして表示し、Mermaidなどの独自構文はコードとして確認します。このビューアはローカルの仕様確認用で、通常のスライドビルドやGitHub Pagesには含まれません。

## GitHub Pages へのデプロイ

`main` または `master` ブランチへ push すると、`.github/workflows/deploy.yml` が Slidev をビルドして GitHub Pages へデプロイします。手動実行にも対応しています。

workflow は lockfile から npm / pnpm / Yarn / Bun を判定します。通常のリポジトリでは `/<repository-name>/`、`*.github.io` リポジトリでは `/` をベースパスとして自動設定します。

GitHub リポジトリの **Settings → Pages → Build and deployment → Source** が **GitHub Actions** になっていることを確認してください。Vercel や Netlify の設定ファイルは使用しません。
