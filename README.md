# create-slidev-for-agents

個人用の Slidev ボイラープレートを生成する CLI です。発表内容に依存しないレイアウト、コンポーネント、デザインルールをまとめています。

## 使い方

npm 公開後は、Vite+ から新しいスライドを作成できます。

```bash
vp create slidev-for-agents
```

生成先とタイトルは、`--` より後ろへテンプレートのオプションとして渡します。

```bash
vp create slidev-for-agents -- my-talk --title "発表タイトル"
```

Vite+ を使わない場合は、npmのcreateコマンドからも実行できます。

```bash
npm create slidev-for-agents@latest my-talk -- --title "発表タイトル"
```

ジェネレーター自身は、依存関係を自動インストールしません。`vp create` から実行した場合は、生成後のVite+処理が依存関係をインストールします。CLIを直接実行した場合は、最後に表示されるインストールコマンドを実行してください。この案内と、明示的に `--install` を指定した場合だけ、CLIを起動したパッケージマネージャーを自動検出します。利用者がパッケージマネージャーを指定するオプションはありません。

## 現在のローカル実行

まだ npm へは公開していません。このリポジトリから試す場合は次のように実行します。

```bash
node ./bin/create-slidev.mjs ./my-talk --title "発表タイトル"
```

## 生成される構造

```text
my-talk/
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── .github/
│   └── workflows/
│       └── deploy.yml
├── AGENTS.md
├── components/
│   ├── CommandBlock.vue
│   └── DeckSlide.vue
├── composables/
│   └── useClipboard.ts
├── layouts/
│   ├── Cover.vue
│   └── Description.vue
├── pages/
├── public/images/
├── specs/
│   ├── README.md
│   ├── _prot.md
│   └── _feedback.md
├── styles/
│   ├── base.css
│   ├── layouts.css
│   ├── patterns.css
│   └── tokens.css
├── deck.config.ts
├── DESIGN.md
├── slides.md
├── style.css
└── vite.config.ts
```

生成直後の `pages/` には例示ページを含めません。`specs/_prot.md` を書いた後、LLM に `specs/NN_name.md` を作らせ、内容を確認してから `pages/NN_name.vue` を実装させます。実装確認後の修正は `specs/_feedback.md` に書き、仕様とページへ同時に反映させます。

`slides.md` は frontmatter とスライド順を持ち、各スライドは `pages/*.vue` に分けます。ページ固有の内容と、再利用するレイアウト・デザイントークンを混ぜないための構造です。

生成先の `AGENTS.md` は、仕様作成とページ実装の間、およびページ実装とフィードバック反映の間でユーザーの確認を待つよう LLM に指示します。

生成先では Vite+ を使います。`vite.config.ts` に Slidev の `dev`、`build`、`export` タスクと Oxc の設定をまとめ、`.vscode/` で保存時フォーマットを有効にしています。

`.github/workflows/deploy.yml` は、`main` または `master` への push 時に GitHub Pages へデプロイします。lockfile に応じて npm / pnpm / Yarn / Bun を使い分け、リポジトリ名に合わせて Slidev のベースパスを設定します。Vercel / Netlify 用の設定はテンプレートに含めません。

## CLI オプション

```text
--title <title>   発表タイトル
--install         生成後に依存関係をインストールする
-h, --help        ヘルプ
-v, --version     バージョン
```

既存ファイルの誤上書きを避けるため、生成先が空でない場合は停止します。

## 開発

```bash
pnpm test
pnpm test:pack
```

npm 公開は後続タスクで行います。公開前に、パッケージ名・バージョン・README のコマンド例・npm provenance の方針を最終確認します。

## デザイン

色やフォントだけでなく、情報量、余白、レイアウトの選び方まで [template/DESIGN.md](./template/DESIGN.md) にまとめています。テンプレートの一部として生成先へコピーされます。
