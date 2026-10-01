# Anime Prompt 開発ルール

- GitHub Issue を起点に作業し、Issue 外へ無断で scope を広げない。仕様の正本は [Notion](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204)。
- 小さい責務と単純なデータフローを優先し、不要な抽象化を増やさない。
- Secret をコード、ログ、sample、README、PR に出さない。`.env.example` はキー名と空値だけにする。
- 実取得した AniList raw data、生成した feature data、benchmark results、個人の評価メモを Git にコミットしない。公開 sample は形式確認用の最小の合成データにする。
- CLI の JSONL / stdout / stderr、入力モード、終了コードの公開契約を壊さない。
- PR 前に local verify (`npm run verify`) と、実装者とは別の fresh context の独立 review を必須にする。blocking finding が残る場合は PR を作らない。
- Issue の実装依頼を受けたら、その範囲に必要な commit / push / PR 作成・更新 / CI 確認まで追加確認なしで進める。push・PR 作成・更新は local verify と有効な独立 review の PASS を条件とし、ユーザーが明示した操作制限を優先する。merge はユーザーの明示指示がある場合のみ実行し、最新 head の CI 成功も必須とする。
- 詳細は [開発 Skill](.codex/skills/anime-prompt-dev/SKILL.md) に従う。
