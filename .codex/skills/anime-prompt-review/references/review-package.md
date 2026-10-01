# Review Package の入力契約

起動者が準備し、reviewer が最初に検査する。参照先だけでなく、取得済みの本文・差分・検証結果を渡すか、reviewer が読めるファイルへ保存する。Secret や実取得データを含めず、package / launch log / verdict は repo 外の一時保存先で管理する。

## 必須入力

| 入力 | 内容 |
| --- | --- |
| 対象と概要 | repo、branch / PR URL、変更の目的と範囲 |
| revision | base ref、base SHA、merge-base SHA、head SHA。可変 ref だけで済ませない |
| 全 diff | `git diff --binary <merge-base SHA> <head SHA>`。変更ファイル一覧だけでは不可 |
| 要件 | GitHub Issue URL、取得時点の本文全文と Acceptance Criteria |
| repo ルール | 対象 revision の `AGENTS.md` 全文 |
| local verify | 対象 revision、実行コマンド、終了コード、結果、未実行項目と理由 |

原則として commit 済みの head を固定して review する。未コミット変更を扱う場合は基準 HEAD、staged / unstaged diff、未追跡ファイルの全内容と一覧を添え、対象を一意に固定する。review 中に変更せず、commit 後に内容が一致することを確認する。一致しない場合は再 verify・再 review。

## 該当時の入力

- Parent / dependency / 後続 Issue の本文・状態。
- Notion 正本の必要な範囲（URL、取得時点、抜粋）。全仕様を repo に複製しない。
- JSON / JSONL schema、feature schema、CLI 入出力、外部 API adapter の既存定義。
- GitHub の当該 head の CI / status checks の実状態と確認時点。PR 前なら「当該 PR は未作成」を明示し、既存 workflow の有無を添える。
- reviewer 起動の model ID / reasoning effort / read-only の実効値、確認方法、CLI / runtime version。単なる requested 値と effective 値を区別する。

文書・設定だけの bootstrap PR では README / dev Skill の文書 verify を渡す。まだないアプリのテストを成功扱いしない。Issue #4 で verify / CI が導入された後は共通 verify 入口を用いる。

## Superpowers への受け渡し

環境にある `superpowers:requesting-code-review` の `code-reviewer.md` を直接読み、description、requirements、base / head の placeholder に Package を割り当てる。Git Range の base は **merge-base SHA** を使い、別途 base SHA も示す。repo review Skill を読む指示と repo 固有の4項目の出力契約を付加する。会話履歴や実装者の verdict は付加しない。template 自体を repo に保存しない。

Package の不足は `Cannot verify` として報告する。起動者が不足を補うか、非該当とする根拠を追加し、判断に必要な不足なら新しい reviewer が再判定する。
