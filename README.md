# Anime Prompt

「今の気分」を自然文で入力し、今期アニメの推薦結果・コスト・処理時間を Jev / GPT-5.6 Luna / GPT-5.6 Sol で比較する CLI の実験プロジェクトです。

仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)、実装範囲は [GitHub Issues](https://github.com/k-hakiri/anime-prompt/issues) で管理します。

## 現在の状態

開発ルールと公開 repo の初期基盤を整備する段階です。CLI 本体は未実装で、実装言語・依存管理・verify 入口・GitHub CI は [Issue #4](https://github.com/k-hakiri/anime-prompt/issues/4) で決定します。独立 review の repo 固有 Skill は [Issue #3](https://github.com/k-hakiri/anime-prompt/issues/3) で整備します。

## 開発

[AGENTS.md](AGENTS.md) と [開発 Skill](.codex/skills/anime-prompt-dev/SKILL.md) を読み、次の流れで進めます。

```text
Issue → branch → 必要な仕様 → 実装 → local verify
→ fresh contextの独立review → PASS → PR → GitHub CI
```

blocking があれば修正・verify・再 review を最大3回行い、解消しなければ PR を作らず停止します。CI 成功前に merge しません。

verify 入口が整うまで、文書・設定のみの変更は `git diff --check`、リンクと全変更内容の確認、`git check-ignore` による ignore の確認を行い、コマンドと結果を独立 reviewer に渡します。アプリのテストや CI が成功したとは扱いません。整備後は README・dev Skill・CI で共通の verify 入口を使います。

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
