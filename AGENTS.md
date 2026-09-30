# Anime Prompt 開発ルール

- GitHub Issue を起点に作業し、Issue 外へ無断で scope を広げない。仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)。
- 小さい責務と単純なデータフローを優先し、不要な抽象化を増やさない。
- Secret をコード、ログ、sample、README、PR に出さない。`.env.example` はキー名と空値だけにする。
- 実取得した AniList raw data、生成した feature data、benchmark results、個人の評価メモを Git にコミットしない。公開 sample は形式確認用の最小の合成データにする。
- CLI の JSONL / stdout / stderr、入力モード、終了コードの公開契約を壊さない。
- PR 前に local verify と、実装者とは別の fresh context の独立 review を必須にする。blocking finding が残る場合は PR を作らない。CI 成功前に merge しない。ただし CI 未整備の Issue #2・#3 に限り、[開発 Skill の bootstrap 条件](.codex/skills/anime-prompt-dev/SKILL.md#bootstrap-期間の-merge) を満たせば merge 可能。
- 詳細は [開発 Skill](.codex/skills/anime-prompt-dev/SKILL.md) に従う。
