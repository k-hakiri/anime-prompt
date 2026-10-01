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

既定は provider `jev`、UTC の現在シーズン・年、human 出力、`full` profile です。取得済み `data/raw/{year}-{season}.jsonl` を使用します。`--raw PATH` / `--model ID` で入力とモデルを指定できます。`--input-profile basic|full` は特徴量生成と同じ項目集合を使い、basic は title / description / genres / format / episodes / duration、full は basic + tags（name / rank）/ source です。studio・人気・スコアは渡しません。主比較は `basic` / one-shot に固定し、Jev / Luna / Sol で同じ raw・profile・自然文を使用してください。`full` / staged は豊富な metadata を使う追加実験として別集計します。CLI の既定 profile は互換性のため full のままです。

`--prompt` がなければ stdin TTY で1行の入力を受け付け、案内は stderr に出します。パイプ入力はエラーになります。`--prompt` の文字列は空白を含めてそのまま保持します。

### Luna / Sol の basic one-shot (#25)

```sh
# OPENAI_API_KEY を環境変数に設定。同じ raw と自然文を各 provider へ渡す
anime-recommend --provider luna --input-profile basic --season SUMMER --year 2026 \
  --prompt "仕事帰りで疲れた。気楽に旅や世界観を楽しみたい" --format jsonl \
  > data/results/luna-after-work.jsonl
anime-recommend --provider sol --input-profile basic --season SUMMER --year 2026 \
  --prompt "仕事帰りで疲れた。気楽に旅や世界観を楽しみたい" --format jsonl \
  > data/results/sol-after-work.jsonl
```

`--provider jev|luna|sol` で明示選択します。既定モデルは Jev が `jev-1.13.0`、Luna が `gpt-5.6-luna`、Sol が `gpt-5.6-sol` です。`--model` は選んだ provider の family のみ許可し、Jev は `jev-` prefix、Luna / Sol は既定 ID またはその `-YYYY-MM-DD` snapshot ID を受け付けます。snapshot の実際の利用可否は API が判定します。別 family や別 provider のモデルを指定すると呼び出し前に失敗します。

Luna / Sol は **basic のみ**対応します。`--input-profile basic` を明示してください。full（省略時の既定値も含む）は明示エラーにし、basic へ自動変更しません。既存 Jev の basic one-shot / full staged 経路と full 既定は維持します。

両モデルへ同じ指示・候補・schema・`reasoning.effort: none` を Responses API の1 request で渡します。Structured Outputs は順位順の `recommendations: [{anime_id}]` だけを返し、ID の enum を候補集合に固定します。ローカルでも候補内 ID・重複なし・ちょうど5件（5件未満なら全件）を検証し、title は raw 候補から復元します。拒否、不完全な応答、不正な出力、HTTP / 通信失敗は stdout に結果を出さず、stderr の診断と終了コード1で返します。API key / Authorization / prompt / 作品本文 / API のエラー本文は診断へ含めません。

Luna / Sol の JSONL は `result_schema_version: v3`、`provider: luna|sol`、`strategy: openai-one-shot-v1` です。rank / anime_id / title の推薦、input_prompt / input_profile、resolved model、`reasoning_effort: none`、usage の input_tokens / output_tokens と API が返した cached_tokens / reasoning_tokens、latency_ms、timestamp を保存します。metadata に requested_model、reasoning_effort、candidate_ids、raw_sha256、input_sha256、prompt_version、season / year / candidate_filter / top_k を保持します。input_sha256 は model・指示・構造化 schema・effort を含む送信 JSON 全体の SHA256 なので、モデル間では異なります。候補集合の同一性は candidate_ids と raw_sha256 で確認してください。

Jev の v2 と異なり、probabilities / normalized_probabilities / confidence / recommendation probability はありません。human 表示は順位・タイトル・時間・usage です。runtime_cost_usd は未実装のため null（human は「未計算」）を維持します。比較できるのは順位・選択結果・usage・latency・cost であり、OpenAI の確率を捏造しません。実 API 結果は Git 管理外の `data/results/` へ保存してください。unit / smoke は合成 fixture と mock fetch を使い、OpenAI 実 API は呼びません。

公式資料（確認日: 2026-10-01）: [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)、[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)、[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。

### Jev の診断 (#18)

```sh
ANIME_PROMPT_DEBUG=1 anime-recommend --season SUMMER --year 2026 \
  --input-profile full --prompt "気楽に見たい" --format jsonl
```

`ANIME_PROMPT_DEBUG=1` のときだけ `Jev debug ` に続く JSON を stderr に出します。未設定・`0`・その他の値では既存出力を維持します。送信前の `request` は input_profile、候補数、serialized request body / state / questions / criteria の UTF-8 bytes、tags 総数、最大候補 criteria bytes を記録します。criteria bytes は質問ごとの criteria の合計、候補数・tags 総数・最大候補 bytes は Choice の集計です。profile を持たない adapter 呼び出しは input_profile が null になります。

`response` は HTTP status、content-type、content-length、既知の安全な error_code を記録します。content-type は固定 MIME のみを出し、未知値は `other`、content-length は安全な非負整数のみを出します。JSON のエラー応答は最大8 KiB・1秒まで読み、現時点では `detail.error_type` が完全一致する `max_tokens_exceeded` だけを許可します。未知の code、自由文 message、本文は出しません。通信失敗は `request_failed` を記録します。API key・Authorization・prompt・作品本文・tag 文字列・request/response 全文は診断に含めません。HTTP エラーは引き続き `Jev HTTP STATUS` と終了コード1で返します。

full の情報量によっては Jev の token 上限に達します。bytes は比較用の集計であり token 数や固定の byte 上限ではありません。[公式モデル資料](https://docs.typesafe.ai/models) は、取得時点（2026-10-01）の制約として request 全体64k tokens、state と最長の質問の合計32k tokens を示しています。診断は入力項目・候補集合・tags を変更しません。

主比較の `basic` は自然文を state の mood、全候補作品を anime_id キーの Choice criteria として Jev へ1回渡します。[Choice API](https://docs.typesafe.ai/api) の全候補の確率分布を降順に並べ、同点は anime_id 昇順、上位5件（候補が5件未満なら全件）を返します。human 表示は順位・タイトル・選択確率を中心とし、長文理由は生成しません。

候補は指定シーズン・年に一致し、`isAdult: false` と確認できる作品です。成人向け作品と成人向け状態が不明な作品は除外します。**旧 raw キャッシュは isAdult を持たないため、取得 CLI で再取得してください。** 人気・スコア・format・durationによる足切りはしません。候補0件・重複ID・Jev Choice上限255件超過は API 呼び出し前に失敗し、候補を黙って切り捨てません。特徴量の事前生成は不要となり、旧 `--features` / `--schema` オプションは主推薦 CLI から削除しました。旧6軸方式の関数とテストは追加実験用に保持しています。

Jev basic の JSONL は1実行1行、`result_schema_version: v2` / `strategy: jev-choice-v1` です。input_prompt / input_profile（basic または full）/ provider / resolved model / recommendations（rank・anime_id・title・probability）/ 全候補の probabilities / confidence / usage / latency_ms / timestamp を記録します。metadata は candidate_ids、raw ファイル内容の SHA256、state と questions の入力 SHA256、requested model、prompt_version、シーズン・年・候補条件・top_k を保持します。v1 の6軸結果と区別して集計してください。価格設定は後続 Issue のため runtime_cost_usd は null、人間向けには「未計算」と表示します。API 障害、不正な確率分布、不正入力、データ欠損は stderr と終了コード1で返し、結果を出しません。

Choice 確率の合計検証は `bounded-cent-grid-v1` です。[公式 API](https://docs.typesafe.ai/api) は合計1を要求しますが、丸め精度や許容幅は公表していません。Issue #16 の実 API 調査（2026-10-01、jev-1.13.0、SUMMER 2026、basic、106候補、同一英語入力5回）では、百分率刻みの値に浮動小数点の微小誤差が付いた分布で、合計1と約0.99の一時的な応答差を観測しました。量子化・丸めの内部原因は断定しません。

各確率は有限な0〜1、候補 ID 集合は完全一致、choice は最大確率の候補であることを引き続き要求します。合計の許容幅は従来の0.001を維持し、全確率が0.01刻みの場合だけ観測した1ポイントのずれに限って0.01とします。刻み判定には `abs(p * 100 - round(p * 100)) <= 1e-12`、合計比較には許容幅に `1e-12` を加えて浮動小数点誤差を扱います。合計0や許容範囲外は拒否し、エラーには `sum=実値` だけを追加します。百分率刻みだけで任意のずれを受け入れたり、自動 retry したりはしません。

JSONL の既存 `probabilities` は API の元の全確率を保持します。追加する `normalized_probabilities` は各値を元の合計で割った全確率で、recommendations の probability と human 表示はこの補正後の値を使います。confidence は API の値を保持します。metadata に `probability_sum`（元の合計）、`probability_sum_tolerance`（適用した許容幅）、`probability_policy` を追加します。v2 への追加フィールドとして扱い、元の分布を分析する処理は引き続き probabilities を使ってください。観測応答は `data/results/` など Git 管理外に保存し、公開テストには数値形状を再現する合成 fixture だけを使います。

### full の staged Choice (#23)

`--input-profile full` は `strategy: jev-staged-choice-v1` の二段階推薦です。候補を anime_id 昇順に並べ、`ceil(候補数 / 27)` 個の group に round-robin で配分します。106候補なら27 / 27 / 26 / 26となります。全 group の Choice を `Promise.all` で並列開始し、各 group の確率上位5件（5件未満なら全件）を残します。全 group が成功した後、その finalist 全件へ final Choice を1回実行し、最終確率から Top 5 を返します。同点は各段階とも anime_id 昇順です。finalist の入力順も anime_id 昇順に固定します。

first / final のいずれも同じ full profile を使い、description・tags・tag rank・source を削りません。人気・スコアで候補を削らず、prompt によって group を変更しません。group の HTTP / token 超過 / 不正応答は全体を失敗させ、partial finalist で final を実行せず、stdout に結果を出しません。一般的な retry・自動再分割はしません。失敗時、開始済みのほかの group request は完了し得ます。basic と同様、全候補255件までを受け付けます。

27件は固定 group 数ではなく MVP の実測に基づく group 件数上限です。2026-10-01、jev-1.13.0、SUMMER 2026 の106候補・full で、4並列 group + final の実API成功を確認しました。各 group の入力 usage は最大12,398 tokens、20 finalist の final は11,211 tokensでした。この観測は32k制約への余裕を確認する根拠ですが、将来の作品情報や長い mood の token 上限を保証しません。tokenizer や自動最適化は導入せず、上限に当たれば情報を削らず終了コード1で失敗します。結果・raw は Git 管理外に保存し、CI / unit / smoke は mock のみを使います。

full の JSONL も v2 / 1行1JSONです。既存の recommendations / probabilities / normalized_probabilities / confidence は **final-stage の分布**です。metadata.candidate_ids は元の全候補、raw_sha256 は元の raw ファイル全体を示します。次を追加します。

- `group_count`、metadata の `grouping_version: anime-id-round-robin-v1` / `group_max_candidates` / `group_assignment`（group 順の candidate_ids 配列）。
- `first_stages`: group_index（0始まり）、candidate_ids、resolved model、probabilities / normalized_probabilities、confidence、usage、latency_ms、input_sha256 / prompt_version、確率検証情報、selected_ids（確率上位5件）。
- `finalists`: final に渡した anime_id 昇順の ID 配列。`final_stage` は first と同じ call 記録（group_index を除く）。
- `api_call_count`、`usage`（全 call の token usage 合計）、`api_latency_sum_ms`（各 call latency の単純合計）、`wall_clock_latency_ms`（first stage 開始から最終 Top 5 確定まで）。既存の `latency_ms` は wall-clock と同じ値です。
- metadata の `prompt_version: recommend-staged-choice-v1` と `input_sha256`。入力 hash は strategy / grouping_version / group_max_candidates / group 順の first_stage_inputs hash / final_stage_input hash の JSON から計算し、各 call の hash は既存と同じ state / questions の JSON から計算します。

human は最終 Top 5・final confidence・合計 usage・wall-clock の表示に留めます。コスト計算は引き続き未実装で null ですが、算出時は全 call の token usage 合計を使い、5 call だから5倍とは扱いません。full の複数 call を basic one-shot の主比較に混ぜず、Luna / Sol の API 呼び出し形態まで揃えることは目的にしません。

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
