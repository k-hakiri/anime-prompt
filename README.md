# Anime Prompt

「今の気分」を自然文で入力し、今期アニメの推薦結果・コスト・処理時間を Jev / GPT-5.6 Luna / GPT-5.6 Sol で比較する CLI の実験プロジェクトです。

仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)、実装範囲は [GitHub Issues](https://github.com/k-hakiri/anime-prompt/issues) で管理します。

## 現在の状態

TypeScript の最小 CLI と、ローカル・GitHub CI 共通の品質ゲートを整備しています。取得・特徴量生成・推薦の本体は [Issue #7](https://github.com/k-hakiri/anime-prompt/issues/7)・[#8](https://github.com/k-hakiri/anime-prompt/issues/8)・[#9](https://github.com/k-hakiri/anime-prompt/issues/9) で実装します。独立 review は [review Skill](.codex/skills/anime-prompt-review/SKILL.md) に従います。Review Package・判定条件と、reviewer 本体を `gpt-6.1-sol` / `medium` で起動する方法を定めています。

## セットアップと検証

MVP のツールチェーンは **TypeScript・Node.js 24.21.0・npm 11.19.0** です。JSON を扱う CLI の契約を型検査でき、既存の Node.js 環境を活用できるため選びました。Node.js の native TypeScript 実行と標準 test runner を使い、配布用 build や追加 test framework は導入していません。

`.node-version` の Node.js を用意してください。たとえば対応する version manager を使う場合は次のように切り替えます。npm はこの Node.js の配布物に含まれます。

```sh
nvm install "$(cat .node-version)"
nvm use "$(cat .node-version)"
node --version  # v24.21.0
npm --version   # 11.19.0
npm ci
npm run verify
```

依存は `package-lock.json` に固定します。`.npmrc` の `engine-strict` により、Node.js・npm のバージョン不一致は `npm ci` で失敗します。`npm run verify` は以下を順に実行し、いずれかが失敗すると非0終了します。

- format check: Prettier（コード・設定・文書）
- lint: ESLint / typescript-eslint
- typecheck: TypeScript strict / `tsc --noEmit`
- unit test: 引数判定
- CLI smoke test: 実プロセスの stdout・stderr・終了コード

整形を修正する場合は `npm run format` を使います。テストは `tests/unit/` と `tests/smoke/` の `**/*.test.ts` を対象とし、追加テストも同じ入口で実行します。各テスト群で対象ファイルが0件なら失敗します。Secret・実取得データ・AniList/Jev/OpenAI への実リクエストは不要です。

最小 CLI の起動確認は次のコマンドで行えます。

```sh
node src/cli/main.ts --help
```

現時点ではヘルプのみを提供します。引数なしや不正な引数は stdout に結果を出さず、stderr に診断を出して終了コード2で終了します。本体の3つの CLI は後続 Issue で追加します。

## 開発

[AGENTS.md](AGENTS.md) と [開発 Skill](.codex/skills/anime-prompt-dev/SKILL.md) を読み、次の流れで進めます。

```text
Issue → branch → 必要な仕様 → 実装 → local verify
→ 初回はfresh contextの独立review → PASS → push → PR作成・更新 → GitHub CI → 結果報告
```

Issue の実装依頼には、その範囲に必要な commit / push / PR 作成・更新 / CI 確認までを含みます。local verify と有効な独立 review が PASS したら、push・PR 作成または更新・CI 確認まで追加の人間確認なしで進めます。review 対象を固定する local commit は [開発 Skill](.codex/skills/anime-prompt-dev/SKILL.md) に従い、ユーザーが明示した操作制限を優先します。

文書・設定だけの変更でも、PR 前に `npm run verify` と公開差分・ignore・リンクの確認を行い、結果を独立 reviewer に渡します。初回の独立 review は実装者とは別の fresh context で行います。blocking があれば原則として同じ reviewer / context で修正・verify・再 review を最大3回行い、解消しなければ PR を作らず停止します。大幅な設計変更・scope 変更・判断の不一致・context 継続不能の場合のみ fresh context でやり直し、回数はリセットしません。すべての PR で最新 head の CI 成功を必須とし、CI の未実行・pending・失敗を成功とは扱いません。**merge はユーザーから明示的に指示された場合のみ実行します。** 指示がなければ PR と CI の結果を報告して終了します。

## GitHub CIと人間による設定

[CI workflow](.github/workflows/ci.yml) は `pull_request` で動き、固定した Node.js と `npm ci` の後、ローカルと同じ `npm run verify` を実行します。権限は `contents: read` のみで、API Secret は渡しません。同一 PR の古い run はキャンセルし、job の実行時間は10分に制限します。

CI を merge の必須条件にする GitHub 設定は、管理者が別途行います。

1. PR の `verify` check が実行され、成功したことを確認します。
2. GitHub の Settings → Branches の Branch Protection、または Settings → Rules → Rulesets で `main` を対象とするルールを設定します。
3. PR と status checks を必須にし、required status check に `verify`（GitHub Actions）を指定します。
4. 失敗・pending の check で merge が許可されないことを確認します。設定を bypass できる権限の運用も管理者が決定します。

workflow を追加しただけでは Branch Protection の設定は変更されません。

## ローカル設定と公開データ

API を使う実装が追加されたら `.env.example` を `.env` にコピーし、ローカルで Credential を設定します。現時点のキー名は `OPENAI_API_KEY` と `TYPESAFE_API_KEY` で、API adapter 導入時に SDK の要件に合わせて確認します。`.env` を自動で読み込む機能はまだありません。

- `.env` とその派生ファイルには Secret を置き、コミットしません。`.env.example` はキー名と空値だけを公開します。
- 実取得した AniList raw data は `data/raw/`、生成した特徴量は `data/features/`、benchmark results は `data/results/` に保存します。これらと、仕様の実行例にある `results/` は ignore 対象です。
- 個人の評価メモ・未公開分析結果は `data/private/` 等の非公開保存先で保持します。実データは別のパスへ移してもコミットしません。
- 公開する sample / fixture は `examples/` 等に置く形式確認用の最小の合成データだけにします。

必要なローカルデータ用ディレクトリは次のコマンドで作成できます。

```sh
mkdir -p data/raw data/features data/results data/private
```

CLI の JSONL / stdout / stderr と再現性のルールは [公開契約](.codex/skills/anime-prompt-dev/references/contracts.md) を参照してください。セットアップと CLI 実行例は、本体の実装 Issue に合わせて追加します。

## ライセンス

[MIT](LICENSE)
