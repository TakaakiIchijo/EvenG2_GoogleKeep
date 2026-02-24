"""
Google Keep Master Token 取得スクリプト

このスクリプトを使用して、gkeepapi の認証に必要な Master Token を取得します。

使用方法:
    python3 get_master_token.py

必要なパッケージ:
    pip install gpsoauth

参考:
    https://gpsoauth.readthedocs.io/
"""

import sys

try:
    import gpsoauth
except ImportError:
    print("gpsoauth がインストールされていません。")
    print("以下のコマンドでインストールしてください:")
    print("  pip install gpsoauth")
    sys.exit(1)


def main():
    print("=" * 60)
    print("Google Keep Master Token 取得ツール")
    print("=" * 60)
    print()
    print("このツールは Google アカウントの Master Token を取得します。")
    print("Master Token は安全な場所に保管し、.env ファイルに設定してください。")
    print()

    email = input("Google アカウントのメールアドレス: ").strip()
    if not email:
        print("エラー: メールアドレスを入力してください")
        sys.exit(1)

    print()
    print("OAuth トークンの取得方法:")
    print("  1. ブラウザで以下の URL を開いてください:")
    print("     https://accounts.google.com/EmbeddedSetup")
    print("  2. Google アカウントでサインインしてください")
    print("  3. ブラウザの開発者ツール（F12）を開き、")
    print("     Application > Cookies から 'oauth_token' の値をコピーしてください")
    print()

    oauth_token = input("OAuth トークン: ").strip()
    if not oauth_token:
        print("エラー: OAuth トークンを入力してください")
        sys.exit(1)

    android_id = input("Android ID（省略可、Enterでスキップ）: ").strip()
    if not android_id:
        # デフォルトの Android ID を使用
        android_id = "0000000000000000"

    print()
    print("Master Token を取得中...")

    try:
        result = gpsoauth.exchange_token(email, oauth_token, android_id)
        master_token = result.get("Token")

        if not master_token:
            print("エラー: Master Token の取得に失敗しました")
            print("レスポンス:", result)
            sys.exit(1)

        print()
        print("=" * 60)
        print("Master Token の取得に成功しました！")
        print("=" * 60)
        print()
        print("以下の値を backend/.env ファイルに設定してください:")
        print()
        print(f"KEEP_EMAIL={email}")
        print(f"KEEP_MASTER_TOKEN={master_token}")
        print()
        print("注意: Master Token は機密情報です。")
        print("      .env ファイルは .gitignore に含まれているため、")
        print("      リポジトリにコミットされません。")

    except Exception as e:
        print(f"エラー: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
