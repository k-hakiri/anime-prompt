---
name: anime-prompt-dev
description: Use when implementing a GitHub Issue or preparing a pull request in the Anime Prompt repository; applies to repository changes, not running recommendation experiments alone.
---

# Anime Prompt の開発フロー

[AGENTS.md](../../../AGENTS.md) を常時ルールとし、この Skill は Issue から PR・CI までの手順を扱う。

```text
Issue確認 → branch作成 → 必要な仕様を読む → 実装 → local verify
→ fresh contextの独立review
→ blockingあり: 修正 → verify → 再review（最大3回）
→ PASS → PR作成 → GitHub CI
```

## 1. Issue・branch・仕様

1. 対象 GitHub Issue の本文と Acceptance Criteria、必要な Parent / dependency / 後続 Issue を読む。
2. 作業ツリーと branch を確認する。ユーザーの変更を上書きせず、Issue 用 branch を作る。既に専用 branch / worktree があれば再利用する。
3. [Notion の仕様正本](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204) から必要な範囲だけ読む。Issue と正本が矛盾する、または必要な仕様を取得できない場合は、その箇所を報告して依存する実装を止める。Issue 外の変更が必要なら理由と範囲をユーザーに確認する。

## 2. 実装・実験データ

- AniList の取得・正規化、特徴量生成、推薦、YAML バッチの責務を分ける。小さい責務と単純なデータフローを保つ。
- CLI / データ / benchmark に関わる変更では [公開契約と再現性](references/contracts.md) を読む。仕様を丸ごと repo へ複製しない。
- Secret は環境変数から受け取る。ローカルの `.env` を読み出してログへ出したり、Credential を sample / fixture / PR に含めたりしない。`.env.example` はキー名と空値だけにする。
- 実データはローカルまたは非公開の保存先で保持する。raw は `data/raw/`、features は `data/features/`、結果は `data/results/` に置く。仕様の実行例にある `results/` を使う場合も Git 管理対象外にする。別の出力先を追加するなら ignore も更新する。
- 公開 sample / fixture は `examples/` 等に置く最小の合成データにする。実取得データをそのまま縮小・改名して公開しない。個人の評価メモ・未公開分析結果もコミットしない。
- 通常のテストは fixture / mock で再現可能にし、AniList / Jev / OpenAI を実呼び出ししない。本番 API key を CI に渡さない。

## 3. Local verify

1. Acceptance Criteria を一つずつ確認する。[README](../../../README.md) の verify 入口を実行し、コマンド・終了コード・結果・未実行項目を記録する。失敗は修正して再実行する。
2. verify 入口・ツールチェーン・CI は [Issue #4](https://github.com/k-hakiri/anime-prompt/issues/4) で整備する。それまでは文書・設定だけの変更に限り、`git diff --check`、全変更ファイルとリンクの確認、`git check-ignore` による保護対象と公開ファイルの確認を local verify として記録する。アプリの品質ゲートを実行済みと扱わない。コード変更に必要な verify が未整備なら PR 前に停止する。
3. 公開 repo 向けに差分の全内容と追加ファイルを確認する。Secret、実取得 raw / feature data、benchmark results、個人メモがないことを確認する。ignore は既に追跡されたファイルには効かないため、`git ls-files` も確認する。Secret を含む出力は記録・共有せず、検出した場合は公開を止める。

## 4. Fresh context の独立 review

1. [review Skill の入力契約](../anime-prompt-review/references/review-package.md) に従って Review Package を作る。原則として commit 済みの head を固定し、必須情報・該当する正本・検証結果と、reviewer 起動の requested configuration（model / effort / read-only 方針）を添える。起動後にしか分からない effective configuration は Package の完成条件にしない。未コミット変更の場合も基準 HEAD と全差分（未追跡ファイルを含む）を明示する。
2. `superpowers:requesting-code-review` とその reviewer template を使い、実装者とは別の **fresh context の read-only review agent** に委譲する。会話履歴・実装者の結論を渡さず、Review Package と正本から判断させる。dev Skill 自身のセルフレビューで代用しない。reviewer は修正・commit・push・PR 作成・追加 subagent 起動を行わない。
3. [repo review Skill](../anime-prompt-review/SKILL.md) を reviewer に読ませる。起動者は [reviewer 起動契約](../anime-prompt-review/references/reviewer-launch.md) に従い、reviewer 起動後に launcher が本体の effective configuration を確認し、Package の requested configuration（`gpt-6.1-sol` / `medium` / read-only）と照合する。不一致・未確認ならその review は無効とし、設定を確定して別の fresh context で再実行する。effective 値・確認方法・一致判定は review 結果と一緒に記録する。Orca の仲介 agent の設定や requested 値だけで保証しない。保証できない経路では明示設定の新規 `codex exec` を使う。Superpowers 本文を repo にコピーしない。
4. reviewer は `Strengths`、`Blocking findings`、`Cannot verify / Declined to judge`、`Verdict: PASS / BLOCKED` を返す。好みの refactor、Issue 外の改善、style 差だけを blocking にしない。
5. 指摘は `superpowers:receiving-code-review` に従って技術的に検証する。正しい blocking は修正し、verify、Review Package 更新、別の fresh context の独立 review を行う。判断に必要な `cannot verify` は黙って捨てず、正本・repo・GitHub の根拠を補って再判定を依頼する。
6. 初回 review 後の **修正・verify・再 review は最大3回**。3回で PASS しない、必要な情報を補えない、または独立 review を実施できない場合は PR を作らず停止する。finding、検証結果、必要な判断をユーザーへ返す。実装者が PASS を代行しない。
7. launcher が requested / effective の一致を確認した有効な review に限り PASS を採用する。PASS は reviewer が返し、blocking finding が0件、かつ PR 前の判断に必要な `cannot verify` が解消済みの場合だけとする。当該 PR 作成後の CI は次の段階で確認する。review 後に差分を変更した場合は verify・独立 review を再実施する。

## 5. PR・CI

local verify と独立 review PASS の後、セッションで PR 作成が許可されていれば PR を作る。許可が未確定なら、レビュー済み差分と次の本文を用意してから確認する。

PR 本文には次を残す。

- 対象 Issue（`Closes #番号`）と変更概要。
- local verify のコマンド・結果・未実行項目。
- 独立 reviewer の判定、blocking 件数、再 review 回数。
- 残る制約、軽微な指摘、`cannot verify / declined to judge` とその影響。

PR 後は GitHub 上の当該 head の CI / status checks を確認する。CI 失敗で修正する場合も verify・独立 review をやり直し、PR の検証記録を更新する。CI が未整備・未実行・pending の状態を成功と扱わず、以下の bootstrap 例外を除き **CI 成功前に merge しない**。merge はセッションの許可範囲に従う。Branch Protection 等の人間設定はコード実装と分けて扱う。

### Bootstrap 期間の merge

親 Issue #1 の順序 `#2 → #3 → #4` を進めるため、次の条件をすべて満たす場合だけ CI 成功を merge 条件から除外する。

- 対象が Issue #2 または #3 の初期整備 PR であり、repo に CI がまだ導入されていない。
- GitHub 上の当該 head に CI / status checks が存在しないことを確認し、PR 本文に CI 未整備・未実行であることと、この例外を適用する旨を明記する。
- 当該差分の local verify と fresh context の独立 review が PASS し、blocking finding と判断に必要な `cannot verify` が残っていない。

CI が存在するのに未実行・pending・失敗している場合や、#2・#3 以外の PR には適用しない。Issue #4 自身は、追加した CI を当該 PR の最新 head 上で成功させてから merge する。#4 で CI を導入した後はこの例外を廃止し、AGENTS.md・この Skill・README の例外記述を削除する。以後はすべての PR で CI 成功を必須にする。この例外は merge の実行許可を与えない。
