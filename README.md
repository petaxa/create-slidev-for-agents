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

まだ npm へは公開していません。このリポジトリから試す場合は、Vite+ で TypeScript のCLIをビルドしてから実行します。

```bash
vp install
vp pack
node ./dist/create-slidev.mjs ./my-talk --title "発表タイトル"
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
├── specs-review/
│   ├── index.html
│   ├── main.js
│   ├── documents.js
│   ├── config.ts
│   ├── model.ts
│   ├── render.ts
│   ├── style.css
│   └── vite.config.ts
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

仕様の確認には、生成先で `vp run specs` を実行します。ox-contentでMarkdownをHTMLに変換して番号順にブラウザ表示し、左右キーで前後へ、`Home` / `End` で最初・最後へ移動できます。ファイルの保存・追加・削除も自動反映します。ビューアはローカル専用で、スライドの公開には含まれません。

`slides.md` は frontmatter とスライド順を持ち、各スライドは `pages/*.vue` に分けます。ページ固有の内容と、再利用するレイアウト・デザイントークンを混ぜないための構造です。

生成先の `AGENTS.md` は、仕様作成とページ実装の間、およびページ実装とフィードバック反映の間でユーザーの確認を待つよう LLM に指示します。

生成先では Vite+ を使います。`vite.config.ts` に Slidev の `dev`、`build`、`export` タスクと Oxc の設定をまとめ、`.vscode/` で保存時フォーマットを有効にしています。

`.github/workflows/deploy.yml` は、`main` または `master` への push 時に GitHub Pages へデプロイします。lockfile に応じて npm / pnpm / Yarn / Bun を使い分け、リポジトリ名に合わせて Slidev のベースパスを設定します。Vercel / Netlify 用の設定はテンプレートに含めません。

## CLI オプション

```text
--title <title>   発表タイトル
--install         生成後に依存関係をインストールする
--dry-run         ファイル作成・依存関係のインストールをせず実行内容を確認する
-h, --help        ヘルプ
-v, --version     バージョン
```

既存ファイルの誤上書きを避けるため、生成先が空でない場合は停止します。

## 開発

### 手元で試す（Playground）

最初に `vp install` を実行します。以下はこのリポジトリのルートから使える開発用コマンドです。

```bash
vp run playground:cli
vp run playground:specs
```

`playground:cli` は最新のCLIをビルドしてdry-runで実行します。ターミナルでは生成先の入力を試せます。生成先の検証やタイトル・次の手順の表示は通常と同じですが、デッキや依存関係は作成しません。ビルド結果の `dist/` は更新されます。引数付きの操作も試せます。

```bash
vp run playground:cli demo-talk --title "サンプル発表" --install
vp run playground:cli --help
```

`--install` を付けてもインストールは予告だけです。既存の空でないディレクトリを指定すると、通常のCLIと同じエラーになります。何度でも実行でき、生成されるファイルの内容は `template/` で確認できます。

`playground:specs` はサンプル3ページ入りの仕様ビューアをブラウザで開きます（既定: `http://127.0.0.1:3031`）。左右キー・一覧・ボタンでの移動、表・コード・画像・長文の表示を試せます。`playground/specs/*.md` の編集・追加・削除は自動反映されます。

画面の実装は `template/specs-review/` を直接使うため、変更のたびにデッキを生成し直す必要はありません。画像サンプルは `playground/public/` に置きます。両コマンドは `Ctrl+C` で終了できます。`playground/` は生成デッキにもnpmパッケージにも含まれません。

### 検証とパッケージ作成

```bash
vp install
vp check
vp test
vp pack
vp pm pack -- --dry-run
```

テストは Vitest API を `vite-plus/test` から利用し、CLIのビルドは `vite.config.ts` の `pack` 設定を通じて tsdown が行います。`package.json` に独自の test/build script は置かず、Vite+ の組み込みコマンドを直接使います。

npm 公開は後続タスクで行います。公開前に、パッケージ名・バージョン・README のコマンド例・npm provenance の方針を最終確認します。

## デザイン

色やフォントだけでなく、情報量、余白、レイアウトの選び方まで [template/DESIGN.md](./template/DESIGN.md) にまとめています。テンプレートの一部として生成先へコピーされます。
