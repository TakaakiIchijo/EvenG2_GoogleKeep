/**
 * Google Keep API v1 クライアント
 *
 * OAuth2 Implicit Flow を使用してサーバーレスで認証する。
 * アクセストークンはブラウザの localStorage に保存される。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface TextContent {
  text: string
}

export interface ListItem {
  childListItems?: ListItem[]
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
  createTime: string
  updateTime: string
  trashTime?: string
  trashed?: boolean
  title?: string
  body?: NoteBody
}

export interface ListNotesResponse {
  notes: Note[]
  nextPageToken?: string
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const KEEP_SCOPE = 'https://www.googleapis.com/auth/keep.readonly'
const OAUTH2_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const KEEP_API_BASE = 'https://keep.googleapis.com/v1'

const LS_ACCESS_TOKEN = 'keep_g2_access_token'
const LS_TOKEN_EXPIRY = 'keep_g2_token_expiry'
const LS_CLIENT_ID = 'keep_g2_client_id'
const LS_SELECTED_NOTE = 'keep_g2_selected_note'

// ---------------------------------------------------------------------------
// LocalStorage ヘルパー
// ---------------------------------------------------------------------------

/** アクセストークンを保存する */
export function saveAccessToken(token: string, expiresIn: number): void {
  const expiry = Date.now() + expiresIn * 1000
  localStorage.setItem(LS_ACCESS_TOKEN, token)
  localStorage.setItem(LS_TOKEN_EXPIRY, expiry.toString())
}

/**
 * 保存されたアクセストークンを返す。
 * 有効期限切れ（1分前）の場合は null を返し、ストレージから削除する。
 */
export function getStoredAccessToken(): string | null {
  const token = localStorage.getItem(LS_ACCESS_TOKEN)
  const expiry = localStorage.getItem(LS_TOKEN_EXPIRY)
  if (!token || !expiry) return null
  if (Date.now() > parseInt(expiry, 10) - 60_000) {
    localStorage.removeItem(LS_ACCESS_TOKEN)
    localStorage.removeItem(LS_TOKEN_EXPIRY)
    return null
  }
  return token
}

/** アクセストークンを削除する */
export function clearAccessToken(): void {
  localStorage.removeItem(LS_ACCESS_TOKEN)
  localStorage.removeItem(LS_TOKEN_EXPIRY)
}

/** OAuth2 Client ID を保存する */
export function saveClientId(clientId: string): void {
  localStorage.setItem(LS_CLIENT_ID, clientId)
}

/** 保存された OAuth2 Client ID を返す */
export function getStoredClientId(): string | null {
  return localStorage.getItem(LS_CLIENT_ID)
}

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
// OAuth2 Implicit Flow
// ---------------------------------------------------------------------------

/**
 * Google OAuth2 Implicit Flow でサインインする。
 * ポップアップウィンドウを開き、アクセストークンを取得して返す。
 *
 * @param clientId Google Cloud Console で作成した OAuth2 クライアント ID
 */
export function signInWithGoogle(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin + window.location.pathname
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: KEEP_SCOPE,
      include_granted_scopes: 'true',
    })
    const authUrl = `${OAUTH2_ENDPOINT}?${params.toString()}`

    const popup = window.open(authUrl, 'google-auth', 'width=500,height=600,scrollbars=yes')
    if (!popup) {
      reject(new Error('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。'))
      return
    }

    const checkInterval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(checkInterval)
          reject(new Error('認証がキャンセルされました'))
          return
        }
        const popupUrl = popup.location.href
        if (popupUrl.includes('access_token')) {
          const hash = popup.location.hash.substring(1)
          const hashParams = new URLSearchParams(hash)
          const token = hashParams.get('access_token')
          const expiresIn = parseInt(hashParams.get('expires_in') ?? '3600', 10)
          popup.close()
          clearInterval(checkInterval)
          if (token) {
            saveAccessToken(token, expiresIn)
            resolve(token)
          } else {
            reject(new Error('アクセストークンの取得に失敗しました'))
          }
        }
      } catch {
        // クロスオリジンエラーは無視（Google 認証ページ表示中は正常）
      }
    }, 500)

    // 5分でタイムアウト
    setTimeout(() => {
      clearInterval(checkInterval)
      if (!popup.closed) popup.close()
      reject(new Error('認証がタイムアウトしました（5分）'))
    }, 300_000)
  })
}

// ---------------------------------------------------------------------------
// Keep API
// ---------------------------------------------------------------------------

/**
 * Keep API からノート一覧を取得する（ページネーション対応）。
 * 401 エラーの場合は 'AUTH_EXPIRED' エラーをスローする。
 */
export async function fetchKeepNotes(accessToken: string): Promise<Note[]> {
  const allNotes: Note[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${KEEP_API_BASE}/notes?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      if (res.status === 401) {
        clearAccessToken()
        throw new Error('AUTH_EXPIRED')
      }
      const errText = await res.text()
      throw new Error(`Keep API エラー: ${res.status} ${errText}`)
    }

    const data: ListNotesResponse = await res.json()
    if (data.notes) allNotes.push(...data.notes)
    pageToken = data.nextPageToken
  } while (pageToken)

  return allNotes
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
