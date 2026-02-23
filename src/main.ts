/**
 * Keep G2 - メインエントリーポイント
 *
 * フロー:
 *   【初回起動】
 *     1. 認証画面 → Google サインイン（OAuth2 Implicit Flow）
 *     2. Keep からノート一覧を取得
 *     3. ノート選択 UI を表示 → ユーザーがノートを選択
 *     4. 選択を localStorage に保存 → G2 に投影
 *
 *   【2回目以降】
 *     1. 保存済みトークン＋選択ノートを確認
 *     2. 前回選択したノートを自動復元 → G2 に即座に投影
 *     3. 「別のノートを選択」ボタンで選択画面に戻れる
 */

import {
  signInWithGoogle,
  handleOAuthCallback,
  getStoredAccessToken,
  clearAccessToken,
  saveClientId,
  getStoredClientId,
  fetchKeepNotes,
  getNoteTitle,
  saveSelectedNote,
  getStoredSelectedNote,
  clearSelectedNote,
  Note,
} from './keep-api'

import { initG2, sendNoteToG2, setStatusCallback } from './g2-display'

// ---------------------------------------------------------------------------
// DOM 要素
// ---------------------------------------------------------------------------

const authSection         = document.getElementById('auth-section')!
const selectSection       = document.getElementById('select-section')!
const statusSection       = document.getElementById('status-section')!
const authBtn             = document.getElementById('auth-btn') as HTMLButtonElement
const clientIdInput       = document.getElementById('client-id-input') as HTMLInputElement
const authStatus          = document.getElementById('auth-status')!
const notesLoading        = document.getElementById('notes-loading')!
const noteListEl          = document.getElementById('note-list')!
const selectedNoteLabel   = document.getElementById('selected-note-label')!
const selectedNoteTitle   = document.getElementById('selected-note-title')!
const projectBtn          = document.getElementById('project-btn') as HTMLButtonElement
const refreshNotesBtn     = document.getElementById('refresh-notes-btn') as HTMLButtonElement
const g2Dot               = document.getElementById('g2-dot')!
const g2StatusText        = document.getElementById('g2-status-text')!
const g2StatusEl          = document.getElementById('g2-status')!
const projectingNoteLabel = document.getElementById('projecting-note-label')!
const projectingNoteTitle = document.getElementById('projecting-note-title')!
const changeNoteBtn       = document.getElementById('change-note-btn') as HTMLButtonElement
const signoutBtn          = document.getElementById('signout-btn') as HTMLButtonElement

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

let accessToken: string | null = null
let allNotes: Note[] = []
let selectedNote: Note | null = null

// ---------------------------------------------------------------------------
// UI ヘルパー
// ---------------------------------------------------------------------------

type Section = 'auth' | 'select' | 'status'

function showSection(section: Section): void {
  authSection.style.display   = section === 'auth'   ? 'block' : 'none'
  selectSection.style.display = section === 'select' ? 'block' : 'none'
  statusSection.style.display = section === 'status' ? 'block' : 'none'
}

function showAuthStatus(msg: string, type: 'success' | 'error' | 'info'): void {
  authStatus.className = `status ${type}`
  authStatus.textContent = msg
  authStatus.style.display = 'block'
}

type G2StatusType = 'connecting' | 'connected' | 'error'

function setG2Status(msg: string, type: G2StatusType): void {
  g2StatusText.textContent = msg
  g2Dot.className = `g2-dot ${type}`
}

function showG2Message(msg: string, type: 'success' | 'error' | 'info'): void {
  g2StatusEl.className = `status ${type}`
  g2StatusEl.textContent = msg
  g2StatusEl.style.display = 'block'
}

// ---------------------------------------------------------------------------
// ノートリスト描画
// ---------------------------------------------------------------------------

function renderNoteList(notes: Note[], savedNoteName: string | null): void {
  notesLoading.style.display = 'none'
  noteListEl.innerHTML = ''

  if (notes.length === 0) {
    notesLoading.className = 'status info'
    notesLoading.textContent = 'Keep にノートが見つかりませんでした。'
    notesLoading.style.display = 'block'
    return
  }

  notes.forEach(note => {
    const isSelected = note.name === savedNoteName
    const isListNote = !!note.body?.list

    const li = document.createElement('li')
    li.className = isSelected ? 'selected' : ''

    const badge = document.createElement('span')
    badge.className = `note-type-badge ${isListNote ? 'badge-list' : 'badge-text'}`
    badge.textContent = isListNote ? 'LIST' : 'TEXT'

    const titleEl = document.createElement('span')
    titleEl.className = 'note-title'
    titleEl.textContent = getNoteTitle(note)

    const check = document.createElement('span')
    check.className = 'note-check'
    check.textContent = '✓'

    li.append(badge, titleEl, check)
    li.addEventListener('click', () => {
      // 選択状態を更新
      document.querySelectorAll('.note-list li').forEach(el => el.classList.remove('selected'))
      li.classList.add('selected')
      selectedNote = note
      selectedNoteTitle.textContent = getNoteTitle(note)
      selectedNoteLabel.style.display = 'block'
      projectBtn.disabled = false
    })

    noteListEl.appendChild(li)
  })

  if (selectedNote) {
    selectedNoteTitle.textContent = getNoteTitle(selectedNote)
    selectedNoteLabel.style.display = 'block'
    projectBtn.disabled = false
  }
}

// ---------------------------------------------------------------------------
// Keep ノート取得
// ---------------------------------------------------------------------------

async function loadNotes(token: string): Promise<void> {
  notesLoading.className = 'status info'
  notesLoading.textContent = 'ノートを取得中...'
  notesLoading.style.display = 'block'
  noteListEl.innerHTML = ''

  try {
    const notes = await fetchKeepNotes(token)
    allNotes = notes.filter(n => !n.trashed)
    renderNoteList(allNotes, getStoredSelectedNote())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'AUTH_EXPIRED') {
      accessToken = null
      showSection('auth')
      showAuthStatus('セッションが期限切れです。再度サインインしてください。', 'error')
    } else {
      notesLoading.className = 'status error'
      notesLoading.textContent = `ノート取得エラー: ${msg}`
      notesLoading.style.display = 'block'
    }
  }
}

// ---------------------------------------------------------------------------
// G2 への投影
// ---------------------------------------------------------------------------

async function projectToG2(note: Note): Promise<void> {
  showSection('status')
  setG2Status('G2 に接続中...', 'connecting')
  projectingNoteTitle.textContent = getNoteTitle(note)
  projectingNoteLabel.style.display = 'block'
  g2StatusEl.style.display = 'none'

  saveSelectedNote(note.name)

  try {
    await initG2()
    setG2Status('G2 に接続しました', 'connected')
    await sendNoteToG2(note)
    setG2Status(`「${getNoteTitle(note)}」を投影中`, 'connected')
    showG2Message('G2 への投影が完了しました', 'success')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setG2Status('G2 接続エラー', 'error')
    showG2Message(`G2 エラー: ${msg}`, 'error')
  }
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const savedClientId = getStoredClientId()
  if (savedClientId) clientIdInput.value = savedClientId

  const oauthResult = handleOAuthCallback()
  if (oauthResult?.error) {
    showSection('auth')
    showAuthStatus(`認証エラー: ${oauthResult.error}`, 'error')
    return
  }

  if (oauthResult?.token) {
    accessToken = oauthResult.token
    showSection('select')
    await loadNotes(oauthResult.token)
    return
  }

  const token = getStoredAccessToken()
  if (!token) {
    showSection('auth')
    return
  }

  accessToken = token
  const savedNoteName = getStoredSelectedNote()

  if (savedNoteName) {
    // 前回の選択がある → ノートを取得して自動投影
    showSection('status')
    setG2Status('前回の選択を復元中...', 'connecting')
    try {
      const notes = await fetchKeepNotes(token)
      allNotes = notes.filter(n => !n.trashed)
      const restoredNote = allNotes.find(n => n.name === savedNoteName)
      if (restoredNote) {
        await projectToG2(restoredNote)
      } else {
        clearSelectedNote()
        showSection('select')
        renderNoteList(allNotes, null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'AUTH_EXPIRED') {
        accessToken = null
        showSection('auth')
        showAuthStatus('セッションが期限切れです。再度サインインしてください。', 'error')
      } else {
        showSection('select')
        await loadNotes(token)
      }
    }
  } else {
    // 初回 → ノート選択画面
    showSection('select')
    await loadNotes(token)
  }
}

// ---------------------------------------------------------------------------
// イベントリスナー
// ---------------------------------------------------------------------------

authBtn.addEventListener('click', async () => {
  const clientId = clientIdInput.value.trim()
  if (!clientId) {
    showAuthStatus('Client ID を入力してください', 'error')
    return
  }
  saveClientId(clientId)
  authBtn.disabled = true
  authBtn.textContent = 'Google に移動中...'
  authStatus.style.display = 'none'

  try {
    signInWithGoogle(clientId)
  } catch (err) {
    showAuthStatus(`認証エラー: ${err instanceof Error ? err.message : String(err)}`, 'error')
    authBtn.disabled = false
    authBtn.textContent = 'Google でサインイン'
  }
})

projectBtn.addEventListener('click', async () => {
  if (!selectedNote) return
  await projectToG2(selectedNote)
})

refreshNotesBtn.addEventListener('click', async () => {
  if (!accessToken) return
  await loadNotes(accessToken)
})

changeNoteBtn.addEventListener('click', async () => {
  if (!accessToken) return
  showSection('select')
  if (allNotes.length === 0) {
    await loadNotes(accessToken)
  } else {
    renderNoteList(allNotes, getStoredSelectedNote())
  }
})

signoutBtn.addEventListener('click', () => {
  clearAccessToken()
  clearSelectedNote()
  accessToken = null
  allNotes = []
  selectedNote = null
  authBtn.disabled = false
  authBtn.textContent = 'Google でサインイン'
  authStatus.style.display = 'none'
  showSection('auth')
})

// G2 ステータスコールバックを登録
setStatusCallback((msg, type) => showG2Message(msg, type))

// アプリ起動
init()
