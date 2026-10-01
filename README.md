# Anime Prompt

「今の気分」を自然文で入力し、今期アニメの推薦結果・コスト・処理時間を Jev / GPT-5.6 Luna / GPT-5.6 Sol で比較する CLI の実験プロジェクトです。

仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)、実装範囲は [GitHub Issues](https://github.com/k-hakiri/anime-prompt/issues) で管理します。

## 現在の状態

TypeScript の取得・Jev特徴量生成・推薦 CLI と、ローカル・GitHub CI 共通の品質ゲートを提供します。[Issue #7](https://github.com/k-hakiri/anime-prompt/issues/7)・[#8](https://github.com/k-hakiri/anime-prompt/issues/8)・[#9](https://github.com/k-hakiri/anime-prompt/issues/9)・[#14](https://github.com/k-hakiri/anime-prompt/issues/14) の範囲です。Luna / Sol 直接推薦・YAML batch・benchmark 集計は後続 Issue です。独立 review は [review Skill](.codex/skills/anime-prompt-review/SKILL.md) に従い、reviewer を `gpt-6.1-sol` / `medium` で起動します。

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

`main.ts` は scaffold のヘルプを提供します。引数なしや不正な引数は stdout に結果を出さず、stderr に診断を出して終了コード2で終了します。取得 CLI は以下で実行できます。

## AniList取得 (#7)

```sh
node src/cli/fetch_anilist.ts --season FALL --year 2026 > data/raw/2026-fall.jsonl
# コマンド名で実行する場合（Node 24.21.0 を PATH に設定）
npm link
anime-fetch-anilist --season FALL --year 2026 > data/raw/2026-fall.jsonl
```

手動で実 API の疎通を1回確認する場合は、次を実行します（Secret 不要）。全候補を取得し、先頭3行を表示します。CI は mock のままです。

```sh
anime-fetch-anilist --season FALL --year 2026 | sed -n '1,3p'
```

取得は [AniList GraphQL API](https://docs.anilist.co/guide/graphql/queries/media) のシーズン・年と `isAdult: false` フィルタを使い、全ページ取得後に1作品1行の JSONL を出します。HTTP/GraphQL/データ不正は stderr と終了コード1で知らせます。自動 retry は行いません。AI API は呼びません。

正規化契約は [Anime schema](src/anime/schema.ts) に定義します。`anime_id` は AniList の正整数 ID、`title` は native → romaji → english → `Anime ID` の順です。`description`、`episodes`、`duration`、`format`、原作種別 `source`、`studio`、`season`、`year` の欠損は null、`genres` / `tags` は空配列です。`isAdult` は boolean（旧キャッシュで未取得の場合は null）を保持します。tags は name / rank (0–100 または null) を保持します。`data_source: anilist` と `source_url` で取得元を区別します。description は API の `asHtml: false` で取得します。

## Jev特徴量生成 (#8)

```sh
# TYPESAFE_API_KEY を環境変数として設定してから実行
node src/cli/build_features.ts --schema features/schema/v1.yaml --input-profile full \
  < data/raw/2026-fall.jsonl > data/features/2026-fall-full-v1.jsonl
# npm link 後は anime-build-features でも同じオプションを使用できます
```

既定は full / 同梱 v1 schema / model `jev-1.13.0` です。1作品につき6問の Score を1回の request で評価し、連続値を `score / (criteria数 - 1)` で0〜1に正規化します。confidence は0〜1で別に保存します。[YAML 定義](features/schema/v1.yaml) の各軸は0側から1側へ並べた2〜10個の criteria を持ちます。高い値の意味は、healing=癒し、cognitive_load=理解負荷、seriousness=深刻さ、world_building=世界観の重要度、character_focus=キャラ中心、travel=旅・土地性です。

basic は title / description / genres / format / episodes / duration、full はそれに tags / rank / source を追加します。studio や人気指標は渡しません。Jev の [公式 HTTP API](https://docs.typesafe.ai/api) を使う adapter を domain から分離しています。API key は環境変数だけから取得し、API の error body はログへ出しません。自動 retry はなく、失敗時は stderr と終了コード1を返します。逐次処理なので途中で失敗した場合、stdout に先行する有効な行が残ります。保存時は終了コードを確認してください。

[FeatureRecord / MoodProfile](src/features/schema.ts) は作品特徴量とユーザー条件の別 schema です。作品側には anime_id / feature_schema_version / input_profile / provider / resolved・requested model / prompt_version / schema・入力の SHA256 / usage / latency_ms / generated_at を残し、作品メタデータは複製しません。MoodProfile は original_prompt をそのまま保持し、同じ6軸・schema version・hash で比較できます。6軸方式は追加実験用として [legacy.ts](src/recommend/legacy.ts) と [rank.ts](src/recommend/rank.ts) に残します。主推薦 CLI は特徴量ファイルや MoodProfile を使用しません。計測用の usage と時間は保存しますが、単価・コスト集計は後続の benchmark Issue で扱います。

## 気分から直接推薦 (#14)

```sh
# 先に raw を取得し、TYPESAFE_API_KEY を環境変数に設定
node src/cli/recommend.ts --season SUMMER --year 2026
node src/cli/recommend.ts --season SUMMER --year 2026 \
  --prompt "仕事帰りで疲れた。気楽に旅や世界観を楽しみたい" --format jsonl \
  > data/results/after-work.jsonl
# npm link 後は anime-recommend でも実行可能
anime-recommend --season SUMMER --year 2026 --input-profile basic
anime-recommend --season SUMMER --year 2026 --input-profile full
```

既定は UTC の現在シーズン・年、human 出力、`full` profile です。取得済み `data/raw/{year}-{season}.jsonl` を使用します。`--raw PATH` / `--model ID` で入力とモデルを指定できます。`--input-profile basic|full` は特徴量生成と同じ項目集合を使い、basic は title / description / genres / format / episodes / duration、full は basic + tags（name / rank）/ source です。studio・人気・スコアは渡しません。モデル間比較では同じ raw と profile を使用してください。

`--prompt` がなければ stdin TTY で1行の入力を受け付け、案内は stderr に出します。パイプ入力はエラーになります。`--prompt` の文字列は空白を含めてそのまま保持します。

主経路は自然文を state の mood、候補作品を anime_id キーの Choice criteria として Jev へ1回渡します。[Choice API](https://docs.typesafe.ai/api) の全候補の確率分布を降順に並べ、同点は anime_id 昇順、上位5件（候補が5件未満なら全件）を返します。human 表示は順位・タイトル・選択確率を中心とし、長文理由は生成しません。

候補は指定シーズン・年に一致し、`isAdult: false` と確認できる作品です。成人向け作品と成人向け状態が不明な作品は除外します。**旧 raw キャッシュは isAdult を持たないため、取得 CLI で再取得してください。** 人気・スコア・format・durationによる足切りはしません。候補0件・重複ID・Choice上限255件超過は API 呼び出し前に失敗し、候補を黙って切り捨てません。特徴量の事前生成は不要となり、旧 `--features` / `--schema` オプションは主推薦 CLI から削除しました。旧6軸方式の関数とテストは追加実験用に保持しています。

JSONL は1実行1行、`result_schema_version: v2` / `strategy: jev-choice-v1` です。input_prompt / input_profile（basic または full）/ provider / resolved model / recommendations（rank・anime_id・title・probability）/ 全候補の probabilities / confidence / usage / latency_ms / timestamp を記録します。metadata は candidate_ids、raw ファイル内容の SHA256、state と questions の入力 SHA256、requested model、prompt_version、シーズン・年・候補条件・top_k を保持します。v1 の6軸結果と区別して集計してください。価格設定は後続 Issue のため runtime_cost_usd は null、人間向けには「未計算」と表示します。API 障害、不正な確率分布、不正入力、データ欠損は stderr と終了コード1で返し、結果を出しません。

テストは API を呼ばず、unit と子プロセス smoke で確認します。実 stdin TTY を作る smoke test のため Python 3 も使用します（GitHub の Ubuntu runner に同梱）。

途中で失敗した生成を再実行するときは、`>` で出力ファイルを作り直し、`>>` で追記しないでください。自動 retry / resume は行いません。

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
