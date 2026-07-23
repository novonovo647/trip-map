# Copilot 指示

## プロジェクト概要

海外の渡航記録と旅行プランをインタラクティブな世界地図上に可視化する Vue 3 製の Web アプリ（PWA）。
認証とデータ同期は Firebase（Authentication / Firestore）を利用する。

## 技術スタック

- **フロントエンド**: Vue 3（Composition API / `<script setup>`）
- **ビルド**: Vite 6（`vite-plugin-singlefile` で単一ファイル出力）
- **地図描画**: MapLibre GL JS + Natural Earth（TopoJSON）
- **認証 / DB**: Firebase（Authentication / Firestore）
- **CSV パース**: PapaParse
- **状態管理**: コンポーネント内 `ref` / `reactive` と composables のみ（外部の状態管理ライブラリは使わない）

## コーディング規約

- コメント・UI 文言はすべて**日本語**で書く。既存の日本語 UI を英語化しない。
- ロジックは `src/composables/`（認証・ジオコーディング・渡航国管理など）と `src/utils/`（地理計算・色・テキスト等）に切り出す。コンポーネントに直接書かない。
- 依存パッケージを安易に追加しない。現状の軽量構成を維持する。
- 既存のファイル構成・命名規則に合わせる。

## ハードコード禁止・定数の一元化（重要）

**マジックナンバー・マジックストリング・設定値を、色に限らず一切ハードコードしない。**

- すべての定数は既存の一元管理ファイルに定義し、そこから import して使う。新しい定数もこれらに追加する。
  - 色: `src/utils/mapColors.js`（`MAP_COLORS`）
  - 移動手段・チケット種別: `src/utils/transport.js`（`TRANSPORT_MODES`, `DEFAULT_MODE`, `DEFAULT_TICKET` など）
  - 国名・表記ゆれ・除外リスト: `src/utils/countries.js`（`NAME_MAP`, `EXCLUDE_FROM_LIST`, `SKIP_NAMES` など）
- 対象となる値の例: 色、ラベル文字列、しきい値、デフォルト値、マップの初期中心・ズーム、レイヤー ID / ソース ID、Firestore のコレクション名・ドキュメント ID、外部 URL、各種マジックナンバー。
- 同じ値が 2 箇所以上に現れる場合、または意味を持つ数値・文字列は、必ず名前付き定数として一元化する。
- 適切な定数ファイルが存在しない場合は、`src/utils/` に新しい定数モジュールを作成してそこにまとめる（値をコンポーネントに直書きしない）。

## 地図描画の注意点

- 座標順は用途で異なる。**GeoJSON / MapLibre は `[lng, lat]`**、内部の地理計算（`utils/geo.js`）は `[lat, lng]` の箇所がある。変換を必ず意識する。
- `renderWorldCopies` により地図は 3 コピー描画される前提。
- 日付変更線をまたぐ経度は `unwrapLongitudes` / `wrapAntimeridian`（`utils/geo.js`）で処理する。
- レイヤー / ソースの追加・更新は既存の命名・パターンに合わせる。

## Firestore

- Firebase の Web API キーは公開されても問題ない（クライアント設定であり秘密情報ではない）。アクセス制御は **Firestore セキュリティルール**で担保する。
- 主なドキュメント: `tripdata/plans`（プラン）、`tripdata/geodata`（都市座標・国名）。コレクション名・ドキュメント ID もハードコードせず定数化を検討する。

## やらないこと

- 既存の日本語 UI を英語化しない。
- 値のハードコード（色・文字列・数値・ID・URL など）をしない。
- 依存を安易に追加しない。
- 依頼されていないリファクタリングや機能追加をしない。
