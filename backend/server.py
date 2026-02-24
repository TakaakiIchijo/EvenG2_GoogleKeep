"""
Keep G2 バックエンドサーバー

gkeepapi を使用して Google Keep のノートを取得し、
フロントエンド（Even G2 アプリ）に JSON API として提供する。

認証方式: Google アカウントのメールアドレス + Master Token
Master Token の取得方法は README.md を参照。
"""

import os
import json
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
import gkeepapi

# ---- ロギング設定 ----
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

# フロントエンド（Vite dev server / GitHub Pages）からのリクエストを許可
CORS(app, origins=[
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    os.environ.get("FRONTEND_ORIGIN", ""),
])

# ---- Keep クライアントのシングルトン ----
_keep: gkeepapi.Keep | None = None


def get_keep() -> gkeepapi.Keep:
    """
    gkeepapi.Keep インスタンスを返す（初回のみ認証）。

    環境変数:
        KEEP_EMAIL       : Google アカウントのメールアドレス
        KEEP_MASTER_TOKEN: Master Token（aas_et/... 形式）
        KEEP_STATE_FILE  : ノートキャッシュファイルのパス（省略可、デフォルト: keep_state.json）
    """
    global _keep
    if _keep is not None:
        return _keep

    email = os.environ.get("KEEP_EMAIL")
    master_token = os.environ.get("KEEP_MASTER_TOKEN")

    if not email or not master_token:
        raise RuntimeError(
            "環境変数 KEEP_EMAIL と KEEP_MASTER_TOKEN を設定してください。"
            " Master Token の取得方法は README.md を参照してください。"
        )

    state_file = os.environ.get("KEEP_STATE_FILE", "keep_state.json")

    keep = gkeepapi.Keep()

    # キャッシュファイルが存在する場合はリストアしてから認証（高速化）
    if os.path.exists(state_file):
        logger.info("キャッシュファイルからノート状態を復元: %s", state_file)
        with open(state_file, "r", encoding="utf-8") as f:
            state = json.load(f)
        keep.authenticate(email, master_token, state=state)
    else:
        logger.info("Google Keep に接続中...")
        keep.authenticate(email, master_token)

    logger.info("Google Keep への認証成功")
    _keep = keep
    return keep


def _serialize_note(note) -> dict:
    """
    gkeepapi の Note / List オブジェクトをフロントエンド互換の dict に変換する。

    フロントエンドの keep-api.ts の Note 型に合わせた形式で返す。
    """
    is_list = isinstance(note, gkeepapi.node.List)

    body: dict = {}
    if is_list:
        items = []
        for item in note.items:
            items.append({
                "text": {"text": item.text},
                "checked": item.checked,
            })
        body["list"] = {"listItems": items}
    else:
        body["text"] = {"text": note.text or ""}

    return {
        "name": f"notes/{note.id}",
        "title": note.title or "",
        "createTime": note.timestamps.created.isoformat() if note.timestamps.created else "",
        "updateTime": note.timestamps.updated.isoformat() if note.timestamps.updated else "",
        "trashed": note.trashed,
        "body": body,
    }


# ---- エンドポイント ----

@app.route("/api/health", methods=["GET"])
def health():
    """ヘルスチェック"""
    return jsonify({"status": "ok"})


@app.route("/api/notes", methods=["GET"])
def list_notes():
    """
    Google Keep のノート一覧を返す。

    クエリパラメータ:
        sync (bool): true の場合、Google サーバーと同期してから返す（デフォルト: false）
        trashed (bool): true の場合、ゴミ箱のノートも含める（デフォルト: false）
        archived (bool): true の場合、アーカイブ済みノートも含める（デフォルト: false）

    レスポンス:
        { "notes": [ { Note オブジェクト }, ... ] }
    """
    try:
        keep = get_keep()
    except RuntimeError as e:
        logger.error("認証エラー: %s", e)
        return jsonify({"error": str(e)}), 500

    # 同期オプション
    do_sync = request.args.get("sync", "false").lower() == "true"
    if do_sync:
        logger.info("Google Keep と同期中...")
        keep.sync()
        # 同期後にキャッシュを保存
        state_file = os.environ.get("KEEP_STATE_FILE", "keep_state.json")
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(keep.dump(), f)
        logger.info("キャッシュを保存: %s", state_file)

    # フィルタオプション
    include_trashed = request.args.get("trashed", "false").lower() == "true"
    include_archived = request.args.get("archived", "false").lower() == "true"

    notes = []
    for note in keep.all():
        if note.trashed and not include_trashed:
            continue
        if note.archived and not include_archived:
            continue
        notes.append(_serialize_note(note))

    # 更新日時の降順でソート
    notes.sort(key=lambda n: n.get("updateTime", ""), reverse=True)

    logger.info("%d 件のノートを返します", len(notes))
    return jsonify({"notes": notes})


@app.route("/api/notes/sync", methods=["POST"])
def sync_notes():
    """
    Google Keep と手動で同期する。
    フロントエンドの「更新」ボタンから呼び出す。
    """
    try:
        keep = get_keep()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    logger.info("手動同期リクエスト受信")
    keep.sync()

    state_file = os.environ.get("KEEP_STATE_FILE", "keep_state.json")
    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(keep.dump(), f)

    return jsonify({"status": "synced"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Keep G2 バックエンドサーバーを起動: port=%d, debug=%s", port, debug)
    app.run(host="0.0.0.0", port=port, debug=debug)
