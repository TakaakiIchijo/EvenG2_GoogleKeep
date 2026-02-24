"""
Google Keep Master Token 取得スクリプト

gkeepapi の認証に必要な Master Token を取得します。

【仕組み】
gkeepapi は内部で gpsoauth を使い、Google の非公開モバイル API に
アクセスします。認証には「Master Token」が必要で、これは
Google アカウントの OAuth トークンを gpsoauth.exchange_token() に
渡すことで取得できます。

【OAuth トークンの取得方法】
1. ブラウザで https://accounts.google.com/EmbeddedSetup を開く
2. Google アカウントでサインインする
3. ブラウザの開発者ツール（F12）を開く
4. Application > Storage > Cookies から `oauth_token` の値をコピーする

【使用方法】
    pip install gpsoauth
    python3 get_master_token.py

参考:
    https://gkeepapi.readthedocs.io/en/latest/#obtaining-a-master-token
"""

import sys

try:
    import gpsoauth
except ImportError:
    print("エラー: gpsoauth がインストールされていません。")
    print("以下のコマンドでインストールしてください:")
    print("  pip install gpsoauth")
    sys.exit(1)


def main():
    print("=" * 60)
    print("Google Keep Master Token 取得ツール")
    print("=" * 60)
    print()
    print("事前に以下の手順で OAuth トークンを取得してください:")
    print("  1. ブラウザで https://accounts.google.com/EmbeddedSetup を開く")
    print("  2. Google アカウントでサインインする")
    print("  3. 開発者ツール（F12）> Application > Cookies から")
    print("     'oauth_token' の値をコピーする")
    print()

    email = input("Google アカウントのメールアドレス: ").strip()
    if not email:
        print("エラー: メールアドレスを入力してください")
        sys.exit(1)

    oauth_token = input("OAuth トークン（上記手順で取得した値）: ").strip()
    if not oauth_token:
        print("エラー: OAuth トークンを入力してください")
        sys.exit(1)

    android_id = input("Android ID（省略可、Enter でスキップ）: ").strip()
    if not android_id:
        android_id = "0000000000000000"

    print()
    print("Master Token を取得中...")

    try:
        result = gpsoauth.exchange_token(email, oauth_token, android_id)
        master_token = result.get("Token")

        if not master_token:
            print("エラー: Master Token の取得に失敗しました")
            print("レスポンス:", result)
            print()
            print("ヒント: OAuth トークンが正しいか確認してください。")
            print("      トークンは取得後すぐに使用してください（有効期限があります）。")
            sys.exit(1)

        print()
        print("=" * 60)
        print("Master Token の取得に成功しました！")
        print("=" * 60)
        print()
        print("以下の値をデプロイ先（Render / Railway）の環境変数に設定してください:")
        print()
        print(f"  KEEP_EMAIL         = {email}")
        print(f"  KEEP_MASTER_TOKEN  = {master_token}")
        print()
        print("注意: Master Token はパスワードと同等の機密情報です。")
        print("      .env ファイルに保存する場合は .gitignore に含まれていることを")
        print("      確認し、絶対にリポジトリにコミットしないでください。")

    except Exception as e:
        print(f"エラー: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
