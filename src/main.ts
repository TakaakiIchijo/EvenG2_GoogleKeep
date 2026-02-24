/**
 * Keep G2 - メインエントリーポイント
 *
 * フロー:
 *   【初回起動】
 *     1. バックエンドサーバーの起動確認
 *     2. Keep からノート一覧を取得（バックエンド経由）
 *     3. ノート選択 UI を表示 → ユーザーがノートを選択
 *     4. 選択を localStorage に保存 → G2 に投影
 *
 *   【2回目以降】
 *     1. 保存済み選択ノートを確認
 *     2. 前回選択したノートを自動復元 → G2 に即座に投影
 *     3. 「別のノートを選択」ボタンで選択画面に戻れる
 *
 * 認証はバックエンドサーバー（backend/server.py）が gkeepapi を使用して処理する。
 * フロントエンドに認証情報は不要。
 */

import {
  checkBackendHealth,
  fetchKeepNotes,
  syncKeepNotes,
  getNoteTitle,
  saveSelectedNote,
  getStoredSelectedNote,
  clearSelectedNote,
  isListNote,
  Note,
} from './keep-api'

import { initG2, sendNoteToG2, setStatusCallback } from './g2-display'

// ---------------------------------------------------------------------------
// DOM 要素
// ---------------------------------------------------------------------------

const backendSection      = document.getElementById('backend-section')!
const selectSection       = document.getElementById('select-section')!
const statusSection       = document.getElementById('status-section')!
const backendStatus       = document.getElementById('backend-status')!
const retryBackendBtn     = document.getElementById('retry-backend-btn') as HTMLButtonElement
const notesLoading        = document.getElementById('notes-loading')!
const noteListEl          = document.getElementById('note-list')!
const selectedNoteLabel   = document.getElementById('selected-note-label')!
const selectedNoteTitle   = document.getElementById('selected-note-title')!
const projectBtn          = document.getElementById('project-btn') as HTMLButtonElement
const refreshNotesBtn     = document.getElementById('refresh-notes-btn') as HTMLButtonElement
const syncNotesBtn        = document.getElementById('sync-notes-btn') as HTMLButtonElement
const g2Dot               = document.getElementById('g2-dot')!
const g2StatusText        = document.getElementById('g2-status-text')!
const g2StatusEl          = document.getElementById('g2-status')!
const projectingNoteLabel = document.getElementById('projecting-note-label')!
const projectingNoteTitle = document.getElementById('projecting-note-title')!
const changeNoteBtn       = document.getElementById('change-note-btn') as HTMLButtonElement

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

let allNotes: Note[] = []
let selectedNote: Note | null = null

// ---------------------------------------------------------------------------
// UI ヘルパー
// ---------------------------------------------------------------------------

type Section = 'backend' | 'select' | 'status'

function showSection(section: Section): void {
  backendSection.style.display = section === 'backend' ? 'block' : 'none'
  selectSection.style.display  = section === 'select'  ? 'block' : 'none'
  statusSection.style.display  = section === 'status'  ? 'block' : 'none'
}

function showBackendStatus(msg: string, type: 'success' | 'error' | 'info'): void {
  backendStatus.className = `status ${type}`
  backendStatus.textContent = msg
  backendStatus.style.display = 'block'
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
    const isSaved = note.name === savedNoteName
    const isList = isListNote(note)

    const li = document.createElement('li')
    li.className = isSaved ? 'selected' : ''

    const badge = document.createElement('span')
    badge.className = `note-type-badge ${isList ? 'badge-list' : 'badge-text'}`
    badge.textContent = isList ? 'LIST' : 'TEXT'

    const titleEl = document.createElement('span')
    titleEl.className = 'note-title'
    titleEl.textContent = getNoteTitle(note)

    const check = document.createElement('span')
    check.className = 'note-check'
    check.textContent = '✓'

    li.append(badge, titleEl, check)
    li.addEventListener('click', () => {
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

async function loadNotes(): Promise<void> {
  notesLoading.className = 'status info'
  notesLoading.textContent = 'ノートを取得中...'
  notesLoading.style.display = 'block'
  noteListEl.innerHTML = ''

  try {
    const notes = await fetchKeepNotes()
    allNotes = notes.filter(n => !n.trashed)
    renderNoteList(allNotes, getStoredSelectedNote())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    notesLoading.className = 'status error'
    notesLoading.textContent = `ノート取得エラー: ${msg}`
    notesLoading.style.display = 'block'
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
// バックエンド接続確認
// ---------------------------------------------------------------------------

async function checkAndConnectBackend(): Promise<boolean> {
  showBackendStatus('バックエンドサーバーに接続中...', 'info')
  retryBackendBtn.disabled = true

  const healthy = await checkBackendHealth()
  if (!healthy) {
    showBackendStatus(
      'バックエンドサーバーに接続できません。\n' +
      'backend/ ディレクトリで python3 server.py を実行してください。',
      'error'
    )
    retryBackendBtn.disabled = false
    return false
  }

  showBackendStatus('バックエンドサーバーに接続しました', 'success')
  return true
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const healthy = await checkBackendHealth()

  if (!healthy) {
    showSection('backend')
    showBackendStatus(
      'バックエンドサーバーに接続できません。\n' +
      'backend/ ディレクトリで python3 server.py を実行してください。',
      'error'
    )
    retryBackendBtn.disabled = false
    return
  }

  const savedNoteName = getStoredSelectedNote()

  if (savedNoteName) {
    // 前回の選択がある → ノートを取得して自動投影
    showSection('status')
    setG2Status('前回の選択を復元中...', 'connecting')
    try {
      const notes = await fetchKeepNotes()
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
      showSection('select')
      await loadNotes()
    }
  } else {
    // 初回 → ノート選択画面
    showSection('select')
    await loadNotes()
  }
}

// ---------------------------------------------------------------------------
// イベントリスナー
// ---------------------------------------------------------------------------

retryBackendBtn.addEventListener('click', async () => {
  const ok = await checkAndConnectBackend()
  if (ok) {
    showSection('select')
    await loadNotes()
  }
})

projectBtn.addEventListener('click', async () => {
  if (!selectedNote) return
  await projectToG2(selectedNote)
})

refreshNotesBtn.addEventListener('click', async () => {
  await loadNotes()
})

syncNotesBtn.addEventListener('click', async () => {
  syncNotesBtn.disabled = true
  syncNotesBtn.textContent = '同期中...'
  try {
    await syncKeepNotes()
    await loadNotes()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    notesLoading.className = 'status error'
    notesLoading.textContent = `同期エラー: ${msg}`
    notesLoading.style.display = 'block'
  } finally {
    syncNotesBtn.disabled = false
    syncNotesBtn.textContent = 'Keep と同期'
  }
})

changeNoteBtn.addEventListener('click', async () => {
  showSection('select')
  if (allNotes.length === 0) {
    await loadNotes()
  } else {
    renderNoteList(allNotes, getStoredSelectedNote())
  }
})

// G2 ステータスコールバックを登録
setStatusCallback((msg, type) => showG2Message(msg, type))

// アプリ起動
init()
