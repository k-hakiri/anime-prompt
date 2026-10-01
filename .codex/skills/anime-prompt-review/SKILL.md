---
name: anime-prompt-review
description: Use when independently reviewing an Anime Prompt branch or PR before creation or update, using a fresh context and read-only review.
---

# Anime Prompt 独立レビュー

[開発 Skill](../anime-prompt-dev/SKILL.md) から依頼された、実装者とは別の **fresh context の read-only review agent** が使う。汎用的なレビュー方法は `superpowers:requesting-code-review` とその `code-reviewer.md` template を直接使う。この Skill は repo 固有の契約だけを追加し、Superpowers 本文はコピーしない。

## 入力と役割

- 最初に [Review Package](references/review-package.md) の必須入力と対象 revision を確認する。不足を推測で埋めず `Cannot verify` に記す。
- 実装者の会話履歴・セッションメモリ・「PASS のはず」という結論を渡さない。Package と repo / GitHub / [Notion 正本](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204) を根拠にする。
- レビューは read-only。作業ツリー・index・HEAD・branch を変更せず、修正・commit・push・PR 作成・追加 subagent 起動を行わない。
- 起動者は [reviewer 起動契約](references/reviewer-launch.md) に従い、reviewer **本体**の model / effort と read-only を確認する。仲介 agent の設定では代用しない。
- 必要な Superpowers Skill / template、正本や差分を読めない場合も不足として返す。アプリや schema が未実装の文書 PR では、該当しない観点を未実装の欠陥にしない。

## Anime Prompt 固有の確認点

汎用的な correctness、回帰、設計、テスト、security は Superpowers に従う。仕様に明記されていなくても通常期待される動作を検討し、次の該当項目を追加する。

- Issue の Acceptance Criteria を一つずつ満たし、Parent / dependency / 後続 Issue と矛盾しないか。この PR を merge した後に次の Issue を実行可能か。
- [公開契約](../anime-prompt-dev/references/contracts.md) を守るか。stdout は結果だけで、進捗・warning・debug・対話案内は stderr か。JSONL は1行1JSONとして機械処理できるか。
- interactive mode と `--prompt` 非対話モード、TTY / 非 TTY、`--format human` / `jsonl`、失敗時 non-zero exit の契約を壊さないか。
- raw → features → recommendation の責務分離、fetch 時に AI API を呼ばない境界、薄い YAML batch の役割を保つか。
- raw / features の `anime_id` join、`feature_schema_version`、`input_profile`、provider / model、score / confidence を失わないか。再実行に必要な入力・設定・usage・cost・latency を残すか。
- Secret、実取得 raw、生成 feature、benchmark results、個人メモが repo / log / fixture に漏れないか。公開 sample は最小の合成データか。ignore 済みでも追跡されたファイルを見落とさないか。
- テストは fixture / mock で再現でき、AniList / Jev / OpenAI を不用意に実呼び出ししないか。production Credential を CI に渡さないか。
- benchmark の候補・気分入力・嗜好を揃え、Luna / Sol のモデル以外の入力・指示・schema・effort を無断で変えていないか。reviewer 用の medium と実験用の effort を混同しないか。
- Issue 外の「賢い」抽象化・RAG・DB・Web UI 等へ scope creep していないか。

好みの refactor、scope 外改善、style 差だけを blocking にしない。

## 出力と判定

Superpowers template の指摘を次の順で返す。

1. **Strengths**: 根拠のある良い点を短く記す。軽微な非 blocking 指摘もここで明示する。
2. **Blocking findings**: 各件に severity、file:line または対象、問題、blocking の理由、修正方針を記す。なければ **0件**。
3. **Cannot verify / Declined to judge**: 各件に確認対象、判断できない／対象外とした理由、追加すべき根拠、PR 前または merge 判断への影響を記す。なければ **なし**。黙って捨てない。
4. **Verdict: PASS / BLOCKED**: blocking finding が0件で、現在の判断に必要な `cannot verify` が根拠で解消済みの場合だけ `PASS`。blocking または判断に必要な不足が残れば `BLOCKED`。

PR 前に存在しない当該 PR の CI は PR 作成後に確認する。CI 未整備・未実行・pending・失敗を成功と扱わない。[dev Skill の bootstrap 条件](../anime-prompt-dev/SKILL.md#bootstrap-期間の-merge) に当てはまるかを区別する。`PASS` は merge 許可でも CI 成功でもない。

## 指摘の引き継ぎ

実装者は `superpowers:receiving-code-review` で指摘を技術的に検証する。正しい blocking は修正・verify 後、Package を更新して **別の fresh context の reviewer** に再判定を依頼する。判断に必要な `cannot verify` は repo / GitHub / Notion の根拠を補い、同様に再判定する。対象外事項・軽微な指摘を残す場合は影響と理由を PR に記録する。

最終 PASS は reviewer が返す。初回後の修正・verify・再 review は最大3回。PASS しない、必要な根拠を補えない、独立 reviewer を起動できない場合は PR を作らず finding と検証結果をユーザーへ返す。review 後に差分が変われば verify と独立 review をやり直す。
