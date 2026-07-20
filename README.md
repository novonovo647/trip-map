# 🌍 海外旅行マップ

海外の渡航記録と旅行プランをインタラクティブな世界地図上に表示する Web アプリ（PWA）です。渡航済みの国、旅行プラン、都市間のルート（世界一周券／自己手配）を地図上で可視化します。

## 主な機能

- 🗺️ **世界地図の色分け表示** — 渡航済み・プラン済み・未渡航を色分け
- ✈️ **旅行プランの可視化** — 都市間ルートを移動手段（飛行機・電車・バス・船）ごとにアーク表示
- 📍 **都市マーカー** — 宿泊数・メモ・スポット情報をポップアップ表示
- 📊 **統計表示** — 渡航済み／プラン済み／未渡航の国数を集計
- 🔐 **Google 認証** — ログインユーザーのみ編集可能
- ☁️ **リアルタイム同期** — Firestore による複数端末・複数ユーザー間の同期
- 🕘 **データ復旧** — 世代バックアップからの復元
- 📱 **PWA 対応** — ホーム画面へのインストール、オフライン表示

## 技術構成

| 分類 | 使用技術 |
|------|----------|
| フロントエンド | [Vue 3](https://vuejs.org/)（Composition API / `<script setup>`） |
| ビルドツール | [Vite 6](https://vitejs.dev/) |
| 地図描画 | [MapLibre GL JS](https://maplibre.org/) |
| 地図データ | [Natural Earth](https://www.naturalearthdata.com/)（TopoJSON） |
| 認証・DB | [Firebase](https://firebase.google.com/)（Authentication / Firestore） |
| CSV パース | [PapaParse](https://www.papaparse.com/) |
| デプロイ | GitHub Pages（GitHub Actions による自動デプロイ） |

## セットアップ

前提: Node.js 20 以上

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# 本番ビルド
npm run build

# ビルド結果のプレビュー
npm run preview
```

### Firebase の設定

このアプリは Firebase（Authentication / Firestore）を利用します。利用する場合は、自身の Firebase プロジェクトを作成し、[src/firebase.js](src/firebase.js) の設定値を置き換えてください。

アクセス制御は **Firestore セキュリティルール**で行います。認証済みかつ許可されたユーザーのみ読み書きできるようにルールを設定してください（例）:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tripdata/{document} {
      allow read, write: if request.auth != null
        && request.auth.token.email in ['your-email@example.com'];
    }
  }
}
```

> **Note**: Firebase の Web API キーは公開されても問題ありません（クライアント設定であり秘密情報ではない）。アクセス制御は上記の Firestore ルールで担保されます。

## プロジェクト構成

```
src/
  App.vue                  # ルートコンポーネント
  firebase.js              # Firebase 初期化
  main.js                  # エントリーポイント
  assets/                  # 地図・国名データ
  components/              # UI コンポーネント（地図・モーダル・エディタ）
  composables/             # 認証・ジオコーディング・渡航国管理
  lib/                     # Firestore 永続化・バックアップ
  utils/                   # 地理計算・色・テキスト等のユーティリティ
public/
  manifest.json            # PWA マニフェスト
  sw.js                    # Service Worker
```

## データ出典

- 地図データ: [Natural Earth](https://www.naturalearthdata.com/)（パブリックドメイン）
- 国・地域コード: [ISO 3166-1](https://ja.wikipedia.org/wiki/ISO_3166-1)

## ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。

なお、地図データ（[Natural Earth](https://www.naturalearthdata.com/)）はパブリックドメインであり、本ソフトウェアのライセンスとは別に提供元の条件が適用されます。
