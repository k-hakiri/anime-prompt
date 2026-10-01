---
name: anime-prompt-dev
description: Use when implementing a GitHub Issue or preparing a pull request in the Anime Prompt repository; applies to repository changes, not running recommendation experiments alone.
---

# Anime Prompt の開発フロー

[AGENTS.md](../../../AGENTS.md) を常時ルールとし、この Skill は Issue から PR・CI までの手順を扱う。

```text
Issue確認 → branch作成 → 必要な仕様を読む → 実装 → local verify
→ 初回はfresh contextの独立review
→ blockingあり: 修正 → verify → 同じreviewer/contextで再review（最大3回）
→ PASS → push → PR作成・更新 → GitHub CI → 結果報告
```

## 1. Issue・branch・仕様

1. 対象 GitHub Issue の本文と Acceptance Criteria、必要な Parent / dependency / 後続 Issue を読む。
2. 作業ツリーと branch を確認する。ユーザーの変更を上書きせず、Issue 用 branch を作る。既に専用 branch / worktree があれば再利用する。
3. [Notion の仕様正本](https://app.notion.com/p/3eb4daebe6d481548d93c55b3fdf5cbe?pvs=204) から必要な範囲だけ読む。Issue と正本が矛盾する、または必要な仕様を取得できない場合は、その箇所を報告して依存する実装を止める。Issue 外の変更が必要なら理由と範囲をユーザーに確認する。

## 2. 実装・実験データ

- 主推薦経路は **raw → direct recommendation → Top 5** とし、AniList の取得・正規化、直接推薦、YAML バッチの責務を分ける。Jev は気分と作品情報を Choice へ直接渡し、probabilities から Top 5 を生成する。小さい責務と単純なデータフローを保つ。
- 旧6軸方式の特徴量生成・feature schema・raw/features join・ローカル距離ランキング・前処理コスト分離は、その方式を扱う追加実験時のみの契約とする。旧コードは保持し、主推薦経路の依存にしない。
- CLI / データ / benchmark に関わる変更では [公開契約と再現性](references/contracts.md) を読む。仕様を丸ごと repo へ複製しない。
- Secret は環境変数から受け取る。ローカルの `.env` を読み出してログへ出したり、Credential を sample / fixture / PR に含めたりしない。`.env.example` はキー名と空値だけにする。
- 実データはローカルまたは非公開の保存先で保持する。raw は `data/raw/`、旧6軸方式の features は `data/features/`、結果は `data/results/` に置く。仕様の実行例にある `results/` を使う場合も Git 管理対象外にする。別の出力先を追加するなら ignore も更新する。
- 公開 sample / fixture は `examples/` 等に置く最小の合成データにする。実取得データをそのまま縮小・改名して公開しない。個人の評価メモ・未公開分析結果もコミットしない。
- 通常のテストは fixture / mock で再現可能にし、AniList / Jev / OpenAI を実呼び出ししない。本番 API key を CI に渡さない。

## 3. Local verify

1. Acceptance Criteria を一つずつ確認する。[README](../../../README.md#セットアップと検証) に従い、固定した Node.js と `npm ci` で環境を準備する。
2. PR 作成前に、ローカル・CI 共通の `npm run verify` を実行する。format check / lint / typecheck / unit test / CLI smoke test のコマンド・終了コード・結果・未実行項目を記録する。文書・設定だけの変更でも省略しない。失敗は修正して再実行し、未実行・失敗を PASS と扱わない。`git diff --check`、文書リンク、`git check-ignore` による保護対象と公開ファイルの確認も行う。
3. 公開 repo 向けに差分の全内容と追加ファイルを確認する。Secret、実取得 raw / feature data、benchmark results、個人メモがないことを確認する。ignore は既に追跡されたファイルには効かないため、`git ls-files` も確認する。Secret を含む出力は記録・共有せず、検出した場合は公開を止める。

## 4. 独立 review と再 review

1. [review Skill の入力契約](../anime-prompt-review/references/review-package.md) に従って Review Package を作る。原則として commit 済みの head を固定し、必須情報・該当する正本・検証結果と、reviewer 起動の requested configuration（model / effort / read-only 方針）を添える。起動後にしか分からない effective configuration は Package の完成条件にしない。未コミット変更の場合も基準 HEAD と全差分（未追跡ファイルを含む）を明示する。
2. `superpowers:requesting-code-review` とその reviewer template を使い、初回は実装者とは別の **fresh context の read-only review agent** に委譲する。会話履歴・実装者の結論を渡さず、Review Package と正本から判断させる。dev Skill 自身のセルフレビューで代用しない。reviewer は修正・commit・push・PR 作成・追加 subagent 起動を行わない。
3. [repo review Skill](../anime-prompt-review/SKILL.md) を reviewer に読ませる。起動者は [reviewer 起動契約](../anime-prompt-review/references/reviewer-launch.md) に従い、reviewer 起動後に launcher が本体の effective configuration を確認し、Package の requested configuration（`gpt-6.1-sol` / `medium` / read-only）と照合する。不一致・未確認ならその review は無効とし、設定を確定して再実行する。初回は実装者とは別の fresh context とし、再 review の context 選択は第5項に従う。設定の修復後に同じ reviewer / context を継続できる場合は継続する。effective 値・確認方法・一致判定は review 結果と一緒に記録する。Orca の仲介 agent の設定や requested 値だけで保証しない。保証できない経路では明示設定の `codex exec` を使う。Superpowers 本文を repo にコピーしない。
4. reviewer は `Strengths`、`Blocking findings`、`Cannot verify / Declined to judge`、`Verdict: PASS / BLOCKED` を返す。好みの refactor、Issue 外の改善、style 差だけを blocking にしない。
5. 指摘は `superpowers:receiving-code-review` に従って技術的に検証する。正しい blocking は修正し、verify、Review Package 更新後、原則として同じ reviewer / context で再 review し、前回 finding の解消と回帰の有無を確認する。独立性は初回で担保し、再 review では継続性を優先する。大幅な設計変更、scope 変更、判断の不一致、または同じ reviewer / context を継続できない場合のみ、理由を記録して新しい fresh context でやり直す。判断に必要な `cannot verify` は黙って捨てず、正本・repo・GitHub の根拠を補って同じ reviewer / context に再判定を依頼する（上記の例外時は fresh context）。
6. 初回 review 後の **修正・verify・再 review は最大3回**。reviewer / context の変更で回数をリセットしない。3回で PASS しない、必要な情報を補えない、または独立 review を実施できない場合は PR を作らず停止する。finding、検証結果、必要な判断をユーザーへ返す。実装者が PASS を代行しない。
7. launcher が requested / effective の一致を確認した有効な review に限り PASS を採用する。PASS は reviewer が返し、blocking finding が0件、かつ PR 前の判断に必要な `cannot verify` が解消済みの場合だけとする。当該 PR 作成後の CI は次の段階で確認する。review 後に差分を変更した場合は verify・独立 review を再実施し、再 review の context 選択は第5項に従う。

## 5. PR・CI

ユーザーから対象 GitHub Issue の実装を依頼された場合、その範囲に必要な commit / push / PR 作成・更新 / CI 確認までを依頼に含むものとして扱う。local verify と有効な独立 review が PASS したら、追加の人間確認なしで push・PR 作成または既存 PR 更新・CI 確認まで進める。review 対象を固定するための local commit は第4節の手順に従う。ユーザーが明示した停止指示や操作制限がある場合は、その指示を優先する。

PR 本文には次を残す。

- 対象 Issue（`Closes #番号`）と変更概要。
- local verify のコマンド・結果・未実行項目。
- 独立 reviewer の判定、blocking 件数、再 review 回数。
- 残る制約、軽微な指摘、`cannot verify / declined to judge` とその影響。

PR 後は GitHub 上の当該 head の CI / status checks を確認する。CI 失敗で修正する場合も `npm run verify`・独立 review をやり直し、PR の検証記録を更新する。CI が未整備・未実行・pending・失敗の状態を成功と扱わず、すべての PR で **CI 成功前に merge しない**。

**merge はユーザーから明示的に指示された場合のみ実行する。** Issue の実装依頼や CI 成功だけでは merge の指示と扱わない。明示指示がない場合は PR と CI の結果を報告して終了し、merge の確認待ちを必須工程にしない。Branch Protection 等の人間設定は [README](../../../README.md#github-ciと人間による設定) の手順に従い、コード実装と分けて扱う。
