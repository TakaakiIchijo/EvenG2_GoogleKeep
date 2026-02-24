/**
 * Google Keep API クライアント（バックエンド経由）
 *
 * バックエンドサーバー（backend/server.py）が gkeepapi を使用して
 * Google Keep のノートを取得し、このモジュールはそのバックエンド API を呼び出す。
 *
 * 認証は完全にバックエンド側で処理されるため、フロントエンドに
 * APIキーや認証情報は不要。
 */

// ---------------------------------------------------------------------------
// 型定義（バックエンドのレスポンス形式に対応）
// ---------------------------------------------------------------------------

export interface TextContent {
  text: string
}

export interface ListItem {
  text: TextContent
  checked: boolean
}

export interface ListContent {
  listItems: ListItem[]
}

export interface NoteBody {
  text?: TextContent
  list?: ListContent
}

export interface Note {
  name: string
  title?: string
  createTime: string
  updateTime: string
  trashed?: boolean
  body?: NoteBody
}

export interface ListNotesResponse {
  notes: Note[]
  error?: string
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** バックエンドサーバーのベース URL（環境変数で上書き可能） */
// VITE_BACKEND_URL はビルド時に静的に埋め込まれる。
// Railway/Render の Variables タブで設定し、リビルドすること。
const BACKEND_BASE_URL: string = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080'

const LS_SELECTED_NOTE = 'keep_g2_selected_note'

// ---------------------------------------------------------------------------
// LocalStorage ヘルパー
// ---------------------------------------------------------------------------

/** 選択中のノート名（name フィールド）を保存する */
export function saveSelectedNote(noteName: string): void {
  localStorage.setItem(LS_SELECTED_NOTE, noteName)
}

/** 保存された選択ノート名を返す */
export function getStoredSelectedNote(): string | null {
  return localStorage.getItem(LS_SELECTED_NOTE)
}

/** 選択ノートの保存を削除する */
export function clearSelectedNote(): void {
  localStorage.removeItem(LS_SELECTED_NOTE)
}

// ---------------------------------------------------------------------------
// バックエンド API 呼び出し
// ---------------------------------------------------------------------------

/**
 * バックエンドサーバーのヘルスチェックを行う。
 * サーバーが起動していない場合は false を返す。
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * バックエンドサーバーから Google Keep のノート一覧を取得する。
 *
 * @param options.sync true の場合、Google サーバーと同期してから返す
 */
export async function fetchKeepNotes(options?: { sync?: boolean }): Promise<Note[]> {
  const params = new URLSearchParams()
  if (options?.sync) params.set('sync', 'true')

  const url = `${BACKEND_BASE_URL}/api/notes${params.size > 0 ? '?' + params.toString() : ''}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`バックエンドエラー: ${res.status} ${errText}`)
  }

  const data: ListNotesResponse = await res.json()

  if (data.error) {
    throw new Error(data.error)
  }

  return data.notes ?? []
}

/**
 * バックエンドサーバーに Google Keep との手動同期を要求する。
 */
export async function syncKeepNotes(): Promise<void> {
  const res = await fetch(`${BACKEND_BASE_URL}/api/notes/sync`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`同期エラー: ${res.status} ${errText}`)
  }
}

// ---------------------------------------------------------------------------
// ノートユーティリティ
// ---------------------------------------------------------------------------

/**
 * ノートのタイトルを返す。
 * タイトルフィールドがない場合は本文の先頭行を使用する。
 */
export function getNoteTitle(note: Note): string {
  if (note.title?.trim()) return note.title.trim()
  if (note.body?.text?.text) {
    const firstLine = note.body.text.text.split('\n')[0].trim()
    return firstLine.substring(0, 50) || '（無題）'
  }
  if (note.body?.list?.listItems?.[0]?.text?.text) {
    return note.body.list.listItems[0].text.text.substring(0, 50) || '（無題）'
  }
  return '（無題）'
}

/**
 * リストノートのアイテムを `[ ] テキスト` / `[x] テキスト` 形式の文字列配列に変換する。
 */
export function getListItems(note: Note): string[] {
  if (!note.body?.list) return []
  return note.body.list.listItems.map(item => {
    const check = item.checked ? '[x] ' : '[ ] '
    return check + (item.text?.text ?? '')
  })
}

/**
 * テキストノートの本文を返す。
 */
export function getTextContent(note: Note): string {
  return note.body?.text?.text ?? ''
}

/**
 * ノートがリスト形式かどうかを返す。
 */
export function isListNote(note: Note): boolean {
  return !!note.body?.list
}
