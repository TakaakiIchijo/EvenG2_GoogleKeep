/**
 * Google Keep API v1 クライアント
 *
 * OAuth2 Implicit Flow（リダイレクト）を使用してサーバーレスで認証する。
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
const LS_OAUTH_STATE = 'keep_g2_oauth_state'

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

function getRedirectUri(): string {
  return window.location.origin + window.location.pathname
}

function createOAuthState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')
}

function mapOAuthError(error: string, description: string): string {
  const raw = `${error} ${description}`.toLowerCase()
  if (raw.includes('disallowed_useragent') || raw.includes('secure browser')) {
    return 'この環境は Google の安全なブラウザ要件を満たしていません。Safari / Chrome でこの URL を開いてサインインしてください。'
  }
  if (error === 'access_denied') {
    return '認証がキャンセルされました。'
  }
  return description || error || '認証に失敗しました。'
}

/**
 * Google OAuth2 Implicit Flow を同一タブのリダイレクトで開始する。
 * @param clientId Google Cloud Console で作成した OAuth2 クライアント ID
 */
export function signInWithGoogle(clientId: string): void {
  const state = createOAuthState()
  localStorage.setItem(LS_OAUTH_STATE, state)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'token',
    scope: KEEP_SCOPE,
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  })
  const authUrl = `${OAUTH2_ENDPOINT}?${params.toString()}`
  window.location.assign(authUrl)
}

/**
 * OAuth リダイレクト結果を処理し、必要ならトークンを保存して返す。
 */
export function handleOAuthCallback(): { token: string | null; error: string | null } | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : ''
  const search = window.location.search.startsWith('?') ? window.location.search.substring(1) : ''

  if (!hash && !search) return null

  const hashParams = new URLSearchParams(hash)
  const searchParams = new URLSearchParams(search)
  const token = hashParams.get('access_token')
  const expiresIn = parseInt(hashParams.get('expires_in') ?? '3600', 10)
  const state = hashParams.get('state') ?? searchParams.get('state')
  const error = hashParams.get('error') ?? searchParams.get('error')
  const errorDescription =
    hashParams.get('error_description') ?? searchParams.get('error_description') ?? ''

  const expectedState = localStorage.getItem(LS_OAUTH_STATE)
  if (expectedState) {
    localStorage.removeItem(LS_OAUTH_STATE)
  }

  if (token) {
    if (expectedState && state !== expectedState) {
      window.history.replaceState(null, '', getRedirectUri())
      return { token: null, error: '認証の検証に失敗しました。もう一度お試しください。' }
    }
    saveAccessToken(token, expiresIn)
    window.history.replaceState(null, '', getRedirectUri())
    return { token, error: null }
  }

  if (error) {
    window.history.replaceState(null, '', getRedirectUri())
    return { token: null, error: mapOAuthError(error, decodeURIComponent(errorDescription)) }
  }

  return null
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
