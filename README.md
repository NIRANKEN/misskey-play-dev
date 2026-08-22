# misskey-play-dev

Misskey Play（旧Flash）用の AiScript スクリプトを開発・検証するリポジトリです。

## 収録スクリプト

### `plays/mountain-gacha.is` — 今日の山ガチャ ＋ ひとこと登山ガイド & Tips

ボタンを押すと「今日の山」（標高・所在地・難易度）と、その山にまつわるひとことTipsをランダムに表示するPlayです。

- 結果は**日替わり固定（おみくじ式）**です。同じ日・同じユーザーであれば、何度ボタンを押しても同じ山が選ばれます。
- 現在は「日本百名山」より20座を収録。各山につきTipsを5件収録し、その中からランダムに1件表示します。スクリプト内の `mountains` 配列に同じ形のオブジェクトを追記していけば、100座まで拡張できます。
- 緯度経度からGoogleマップへのリンクを表示します。各山のWikipedia等で公開されている山頂座標を基に設定していますが、Googleマップ誘導用の目安としてご利用ください。
- 写真のインライン表示は行っていません（Misskey Play/MFMには画像を埋め込む機能が無く、Wikimedia CommonsへのリンクもUXが良くなかったため削除しました）。

#### 使い方

1. Misskeyで新しい Play（`/play`）を作成します。
2. `plays/mountain-gacha.is` の内容をまるごと「スクリプト」欄に貼り付けます。
3. タイトル・概要（summary）・公開範囲は、Play編集画面のフォームで別途設定してください（スクリプト自体にはメタデータを含めていません）。
   - タイトル例: `今日の山ガチャ ＋ ひとこと登山ガイド`
   - 概要例: `ボタンを押すと、今日のあなただけの一座が選ばれます。標高・所在地・難易度・豆知識つき。（日替わり）`
4. 保存して「Play」ボタンから動作を確認してください。

#### 既知の制約

- Misskey Play（AiScript）には画像コンポーネント（`Ui:C:image`等）や、MFMの画像埋め込み構文が存在しないため、写真を常時インライン表示することはできません（Misskey本体のソースコードで確認済み）。そのため本Playでは写真表示自体を行わず、地図リンクのみを提供しています。

## テスト（検証の仕組み化）

Play用のAiScriptは、Misskeyクライアント無しでも `@syuilo/aiscript`（npm公開パッケージ。Misskey本体が実際に依存しているバージョンに合わせています）を使ってNode上で構文・実行検証ができます。このリポジトリでは検証を毎回口頭で説明しなくて済むよう、テストコードとCIとして仕組み化しています。

```sh
npm install
npm test
```

- `test/helpers/play-harness.mjs`: Misskey本体（`packages/frontend/src/aiscript/ui.ts` / `api.ts`）と同じシグネチャの `Ui:C:*` / `Mk:*` スタブを提供する共通ハーネス。新しいPlayスクリプトのテストからも再利用できます。
- `test/plays-syntax.test.mjs`: `plays/*.is` を自動的に列挙し、バージョンプラグマの有無・構文エラーの有無を検証します（新しいスクリプトを追加すれば自動的に対象になります）。
- `test/mountain-gacha.test.mjs`: `mountain-gacha.is` 固有のテスト。初期表示・ボタン押下後の描画内容・日替わり固定ロジックの決定性・全20座がシード違いで出現することを検証します。
- `.github/workflows/test.yml`: push / PR のたびに `npm ci && npm test` をGitHub Actionsで自動実行します。

新しいPlayを追加する場合も、`plays/` にスクリプトを置くだけで基本的な構文チェックは自動的に効きます。個別の動作検証を書きたい場合は `test/mountain-gacha.test.mjs` を参考に、`play-harness.mjs` のヘルパー（`runPlayScript` / `findComponent` / `findAllComponents`）を使ってテストを追加してください。
