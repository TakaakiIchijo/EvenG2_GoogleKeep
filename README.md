# Keep G2: Google Keep notes on Even G2 smart glasses

!["EvenG2_GoogleKeep スクリーンショット"]("images/EvenG2_GoogleKeep.png")

**Even G2 スマートグラスに、あなたの Google Keep のノートを投影するアプリケーションです。**

このプロジェクトは、フロントエンド（Vite + TypeScript）とバックエンド（Python + Flask + gkeepapi）で構成されています。バックエンドが非公式の `gkeepapi` ライブラリを使用して Google Keep のノートを取得し、フロントエンドがそれを Even G2 スマートグラスに表示します。

## 主な機能

- **ノート一覧表示**: G2 ディスプレイに Google Keep のノート一覧を表示します。
- **ノート内容投影**: 選択したノート（テキストまたはチェックリスト）の内容を G2 に投影します。
- **自動復元**: 次回起動時に、前回選択したノートを自動的に復元して投影します。
- **手動同期**: フロントエンドのボタンから、Google Keep との同期を手動で実行できます。

## アーキテクチャ

このアプリケーションは、フロントエンドとバックエンドの2つのサービスで構成されています。

- **フロントエンド**: `src/` ディレクトリ
  - Vite + TypeScript で構築された静的サイト。
  - Even Hub SDK を使用して G2 スマートグラスと通信します。
  - バックエンド API を呼び出してノートデータを取得します。
- **バックエンド**: `backend/` ディレクトリ
  - Python + Flask で構築された API サーバー。
  - `gkeepapi` を使用して Google Keep のノートを取得します。
  - フロントエンドにノートデータを JSON API として提供します。

## デプロイ

このプロジェクトは、**Render** または **Railway** のどちらのホスティングサービスにもデプロイできます。フォークしたリポジトリを接続するだけで、フロントエンドとバックエンドが自動的にデプロイされます。

### 0. 共通の事前準備

#### a. リポジトリをフォーク

まず、このリポジトリをあなた自身の GitHub アカウントにフォークしてください。

#### b. Master Token の取得

バックエンドは、Google Keep にアクセスするために **Master Token** を必要とします。リポジトリに含まれる `get_master_token.py` スクリプトを使って取得します。

1.  **Python 環境の準備**: ローカルマシンに Python 3.8 以上がインストールされていることを確認してください。

2.  **依存パッケージのインストール**:
※ externally-managed-environmentで怒られるのでvenvで仮想環境を作ってから実行

    ```bash
    pip install gpsoauth
    ```

3.  **スクリプトの実行**:
    ターミナルで以下のコマンドを実行し、プロンプトに従ってメールアドレスと **OAuth トークン** を入力します。

    ```bash
    python backend/get_master_token.py
    ```

4.  **Master Token のコピー**: `KEEP_MASTER_TOKEN = aas_et/...` という形式でMaster Tokenが出力されます。後で使いますので、安全な場所にコピーしておいてください。

--- 

### 1. Render へのデプロイ

1.  **Render にサインアップ**: [Render](https://render.com/) に GitHub アカウントでサインアップします。

2.  **Blueprint から新規作成**: ダッシュボードで `New` -> `Blueprint` を選択します。

3.  **リポジトリを接続**: フォークしたあなたのリポジトリを選択して `Connect` をクリックします。

4.  **サービスを確認**: Render が `render.yaml` を読み込み、`keep-g2-backend` (Web Service) と `keep-g2-frontend` (Static Site) の2つのサービスを自動的に検出します。そのまま `Apply` をクリックします。

5.  **環境変数を設定**: デプロイが開始されたら、`keep-g2-backend` サービスの `Environment` タブに移動し、以下の3つの環境変数を設定します。

    | Key                 | Value                                               |
    | ------------------- | --------------------------------------------------- |
    | `KEEP_EMAIL`        | あなたの Google アカウントのメールアドレス          |
    | `KEEP_MASTER_TOKEN` | 事前準備で取得した Master Token (`aas_et/...`)      |
    | `FRONTEND_ORIGIN`   | `keep-g2-frontend` の URL（例: `https://keep-g2-frontend.onrender.com`） |

6.  **フロントエンドにバックエンドURLを設定**: `keep-g2-frontend` サービスの `Environment` タブに移動し、以下の環境変数を設定します。

    | Key                | Value                                               |
    | ------------------ | --------------------------------------------------- |
    | `VITE_BACKEND_URL` | `keep-g2-backend` の URL（例: `https://keep-g2-backend.onrender.com`） |

7.  **デプロイ完了**: `keep-g2-frontend` の URL にアクセスすると、アプリケーションが表示されます。

--- 

### 2. Railway へのデプロイ

1.  **Railway にサインアップ**: [Railway](https://railway.app/) に GitHub アカウントでサインアップします。

2.  **プロジェクトを新規作成**: ダッシュボードで `New Project` -> `Deploy from GitHub repo` を選択します。

3.  **リポジトリを接続**: フォークしたあなたのリポジトリを選択して `Deploy Now` をクリックします。

4.  **サービスを確認**: Railway が `railway.toml` を読み込み、`backend` と `frontend` の2つのサービスを自動的に検出してデプロイを開始します。

5.  **環境変数を設定**: デプロイが完了したら、`backend` サービスの `Variables` タブに移動し、以下の3つの変数を設定します。

    | Variable Name       | Value                                               |
    | ------------------- | --------------------------------------------------- |
    | `KEEP_EMAIL`        | あなたの Google アカウントのメールアドレス          |
    | `KEEP_MASTER_TOKEN` | 事前準備で取得した Master Token (`aas_et/...`)      |
    | `FRONTEND_ORIGIN`   | `frontend` サービスに自動で割り当てられたドメイン（例: `https://frontend-production-xxxx.up.railway.app`） |

6.  **フロントエンドにバックエンドURLを設定**: `frontend` サービスの `Variables` タブに移動し、以下の変数を設定します。

    | Variable Name      | Value                                               |
    | ------------------ | --------------------------------------------------- |
    | `VITE_BACKEND_URL` | `backend` サービスに自動で割り当てられたドメイン（例: `https://backend-production-xxxx.up.railway.app`） |

7.  **デプロイ完了**: `frontend` サービスのドメインにアクセスすると、アプリケーションが表示されます。

## ローカルでの開発

1.  リポジトリをクローンします。

2.  **バックエンドのセットアップ**:

    ```bash
    # backend ディレクトリに移動
    cd backend

    # .env ファイルを作成
    cp .env.example .env

    # .env ファイルを編集して KEEP_EMAIL と KEEP_MASTER_TOKEN を設定

    # 依存パッケージをインストール
    pip install -r requirements.txt

    # バックエンドサーバーを起動
    python server.py
    ```

3.  **フロントエンドのセットアップ**（別のターミナルで）:

    ```bash
    # リポジトリのルートディレクトリで実行
    npm install

    # 開発サーバーを起動
    npm run dev
    ```

4.  ブラウザで `http://localhost:5173` を開きます。

## ライセンス

[MIT](./LICENSE)
