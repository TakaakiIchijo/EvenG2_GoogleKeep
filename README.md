# Keep G2 - Google Keep for Even G2

Google Keep のノート（特にチェックリスト）を Even G2 スマートグラスに投影するための、サーバーレス Web アプリケーションです。

このリポジトリをフォークし、いくつかの簡単な設定を行うだけで、すぐに自分の Google アカウントと連携した G2 アプリを GitHub Pages にデプロイできます。

## ✨ 主な機能

- **Google Keep ノート連携**: Google Keep アカウントからノート（テキスト・リスト）を安全に読み込みます。
- **G2 への投影**: 選択したノートを Even G2 スマートグラスに投影します。
- **自動復元**: 前回選択したノートを記憶し、次回起動時に自動で G2 に投影します。
- **サーバーレス**: アプリの実行にバックエンドサーバーは不要です。すべての処理はブラウザ上で完結します。
- **GitHub Actions 自動デプロイ**: `main` ブランチにプッシュするだけで、ビルドと GitHub Pages へのデプロイが自動的に実行されます。

---

## 🚀 Getting Started

このプロジェクトを自分の環境で動かすための手順です。

### 📋 前提条件

- **Node.js**: v20 以降がインストールされていること。
- **GitHub アカウント**: コードをフォークし、GitHub Pages にデプロイするために必要です。
- **Google アカウント**: Google Keep を利用しているアカウント。

###  STEP 1: リポジトリのフォークとクローン

1.  このリポジトリの右上にある **Fork** ボタンをクリックして、自分の GitHub アカウントにフォークします。
2.  フォークしたリポジトリをローカル環境にクローンします。

    ```bash
    git clone https://github.com/<YOUR_GITHUB_USERNAME>/keep-g2.git
    cd keep-g2
    ```

### STEP 2: Google OAuth クライアント ID の取得

このアプリケーションが Google Keep API にアクセスするためには、OAuth 2.0 クライアント ID が必要です。以下の手順に従って取得してください。

1.  **Google Cloud Console にアクセス**
    - [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、Google アカウントでログインします。

2.  **新しいプロジェクトを作成**
    - 画面上部のプロジェクト選択メニューから「新しいプロジェクト」をクリックし、任意のプロジェクト名（例: `keep-g2-app`）で作成します。

3.  **Google Keep API を有効化**
    - 作成したプロジェクトを選択した状態で、ナビゲーションメニューから「API とサービス」>「ライブラリ」に移動します。
    - `Google Keep API` を検索し、選択して「有効にする」ボタンをクリックします。

4.  **OAuth 同意画面を設定**
    - 「API とサービス」>「OAuth 同意画面」に移動します。
    - **User Type** は「外部」を選択し、「作成」をクリックします。
    - **アプリ名**（例: `Keep G2 App`）、**ユーザーサポートメール**、**デベロッパーの連絡先情報** を入力し、「保存して次へ」をクリックします。（他の項目は任意です）
    - スコープの画面は何もせず「保存して次へ」をクリックします。
    - テストユーザーの画面では、自分の Google アカウントのメールアドレスを追加し、「保存して次へ」をクリックします。

5.  **OAuth 2.0 クライアント ID を作成**
    - 「API とサービス」>「認証情報」に移動します。
    - 「認証情報を作成」>「OAuth 2.0 クライアント ID」を選択します。
    - **アプリケーションの種類** に「ウェブ アプリケーション」を選択します。
    - **名前** は任意（例: `Keep G2 Web Client`）です。
    - **承認済みの JavaScript 生成元** に、以下の 2 つの URI を追加します。
        - `http://localhost:5173` （ローカル開発用）
        - `https://<YOUR_GITHUB_USERNAME>.github.io` （GitHub Pages 公開用）
    - **承認済みのリダイレクト URI** に、以下の 2 つの URI を追加します。
        - `http://localhost:5173` （ローカル開発用）
        - `https://<YOUR_GITHUB_USERNAME>.github.io/keep-g2/` （GitHub Pages 公開用）
    - 「作成」をクリックすると、**クライアント ID** が表示されます。これを安全な場所にコピーしておきます。

### STEP 3: ローカルでの開発と実行

1.  **依存パッケージのインストール**

    ```bash
    npm install
    ```

2.  **開発サーバーの起動**

    ```bash
    npm run dev
    ```

3.  **ブラウザで確認**
    - Web ブラウザで `http://localhost:5173` を開きます。
    - 表示された入力欄に、STEP 2 で取得した **クライアント ID** を貼り付けます。
    - 「Google でサインイン」ボタンを押し、認証を完了すると、Keep のノートが一覧表示されます。

#### 🔧 トラブルシューティング: 「安全なブラウザの使用」エラー

Google 認証画面で以下のようなエラーが表示される場合があります。

`KeepG2 のリクエストは Google の「安全なブラウザの使用」に関するポリシーに準拠していません`

この場合、埋め込みブラウザ / WebView ではなく、**Safari または Chrome で直接このアプリ URL を開いて**サインインしてください。

- ローカル: `http://localhost:5173`
- GitHub Pages: `https://<YOUR_GITHUB_USERNAME>.github.io/keep-g2/`

また、Google Cloud Console の OAuth クライアント設定に以下が正しく登録されていることを再確認してください。

- 承認済みの JavaScript 生成元: `https://<YOUR_GITHUB_USERNAME>.github.io`
- 承認済みのリダイレクト URI: `https://<YOUR_GITHUB_USERNAME>.github.io/keep-g2/`

---

## 🌐 GitHub Pages へのデプロイ

このリポジトリは、`main` ブランチにプッシュするだけで GitHub Actions が自動的にビルドとデプロイを行うように設定されています。

1.  **リポジトリの設定を確認**
    - フォークしたリポジトリの「Settings」>「Pages」に移動します。
    - **Source** が `Deploy from a branch` ではなく `GitHub Actions` になっていることを確認します。

2.  **コードをプッシュ**
    - ローカルでの変更をコミットし、`main` ブランチにプッシュします。

    ```bash
    git add .
    git commit -m "Initial setup"
    git push origin main
    ```

3.  **デプロイの確認**
    - リポジトリの「Actions」タブに移動すると、`Deploy to GitHub Pages` ワークフローが実行されているのが確認できます。
    - ワークフローが完了すると、`https://<YOUR_GITHUB_USERNAME>.github.io/keep-g2/` でアプリケーションが公開されます。

---

## 📂 プロジェクト構成

```
.
├── .github/workflows/    # GitHub Actions ワークフロー
│   ├── ci.yml            # ビルドとテストのCI
│   └── deploy.yml        # GitHub Pages への自動デプロイ
├── src/
│   ├── main.ts           # UIロジックとアプリケーションのメインエントリーポイント
│   ├── keep-api.ts       # Google Keep API 連携と OAuth 認証
│   └── g2-display.ts     # Even Hub SDK を使った G2 への表示ロジック
├── index.html            # アプリケーションのUI
├── vite.config.ts        # Vite の設定ファイル
├── package.json          # プロジェクトの依存関係とスクリプト
└── README.md             # このファイル
```

## 📜 ライセンス

このプロジェクトは [MIT License](./LICENSE) の下で公開されています。
