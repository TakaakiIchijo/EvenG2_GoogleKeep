/**
 * Even G2 スマートグラスへの表示ロジック
 *
 * Even Hub SDK を使用してノートを G2 ディスプレイに投影する。
 * initG2() で接続し、sendNoteToG2() でノートを表示する。
 *
 * ナレッジ:
 *   - createStartUpPageContainer は初回のみ呼ぶ（initialized フラグで管理）
 *   - rebuildPageContainer は 2 回目以降の更新に使う
 *   - クリックイベントは eventType === 0 と undefined の両方をチェックする
 *   - スクロールイベントは 300ms のクールダウンを設ける
 *   - TextContainerProperty の borderRdaius は SDK の typo のためそのまま使う
 *   - 日本語を含む場合は UTF-8 バイト数が増えるため 900 バイト以下でページ分割する
 */

import {
  waitForEvenAppBridge,
  EvenAppBridge,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  OsEventTypeList,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk'

import { Note, getNoteTitle, getListItems, getTextContent } from './keep-api'

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const CONTAINER_MAIN = 1
/** G2 ディスプレイの有効表示領域（SDK 座標系） */
const G2_WIDTH = 576
const G2_HEIGHT = 288
/** 1ページあたりの最大バイト数（UTF-8）。日本語3バイト/文字を考慮 */
const MAX_BYTES_PER_PAGE = 900
/** スクロールイベントのクールダウン（ms） */
const SCROLL_COOLDOWN_MS = 300

// ---------------------------------------------------------------------------
// バイト数ユーティリティ
// ---------------------------------------------------------------------------

const _encoder = new TextEncoder()

/** 文字列の UTF-8 バイト数を返す */
function byteLength(str: string): number {
  return _encoder.encode(str).byteLength
}

/**
 * テキストを MAX_BYTES_PER_PAGE バイト以下のページ配列に分割する。
 * 文字単位で分割し、マルチバイト文字の途中で切れないようにする。
 */
function splitIntoPages(text: string, maxBytes: number = MAX_BYTES_PER_PAGE): string[] {
  const pages: string[] = []
  let current = ''
  let currentBytes = 0

  for (const char of text) {
    const charBytes = byteLength(char)
    if (currentBytes + charBytes > maxBytes) {
      pages.push(current)
      current = char
      currentBytes = charBytes
    } else {
      current += char
      currentBytes += charBytes
    }
  }

  if (current.length > 0) {
    pages.push(current)
  }

  return pages.length > 0 ? pages : ['']
}

// ---------------------------------------------------------------------------
// 状態管理
// ---------------------------------------------------------------------------

interface G2State {
  bridge: EvenAppBridge | null
  /** createStartUpPageContainer が成功したか */
  initialized: boolean
  currentNote: Note | null
  /** 現在表示中のページ配列（テキスト表示モード） */
  pages: string[]
  /** 現在表示中のページインデックス */
  pageIndex: number
  scrollCooldown: boolean
}

const state: G2State = {
  bridge: null,
  initialized: false,
  currentNote: null,
  pages: [],
  pageIndex: 0,
  scrollCooldown: false,
}

// ---------------------------------------------------------------------------
// ステータスコールバック
// ---------------------------------------------------------------------------

type StatusCallback = (msg: string, type: 'success' | 'error' | 'info') => void
let onStatus: StatusCallback = () => {}

/** UI 側からステータスメッセージを受け取るコールバックを登録する */
export function setStatusCallback(cb: StatusCallback): void {
  onStatus = cb
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * Even G2 ブリッジに接続する。
 * 既に接続済みの場合は何もしない。
 */
export async function initG2(): Promise<void> {
  if (state.bridge) return

  onStatus('Even G2 への接続を試みています...', 'info')
  try {
    const bridge = await waitForEvenAppBridge()
    state.bridge = bridge
    state.initialized = false // 新しい接続なので初期化フラグをリセット
    onStatus('Even G2 に接続しました', 'success')
    setupEventListeners(bridge)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStatus(`G2 接続エラー: ${msg}`, 'error')
    throw err
  }
}

/**
 * 指定したノートを G2 に投影する。
 * initG2() の後に呼び出すこと。
 */
export async function sendNoteToG2(note: Note): Promise<void> {
  if (!state.bridge) {
    throw new Error('G2 に接続されていません。先に initG2() を呼び出してください。')
  }
  state.currentNote = note
  state.pageIndex = 0
  await renderNoteDetail(state.bridge, note, 0)
  onStatus(`「${getNoteTitle(note)}」を G2 に投影しました`, 'success')
}

// ---------------------------------------------------------------------------
// 内部: 画面描画
// ---------------------------------------------------------------------------

/**
 * ノートの詳細（テキスト形式）を G2 に表示する。
 * 900 バイトを超える場合はページ分割し、指定ページを表示する。
 * ページ番号は右上に [現在/合計] 形式で表示する。
 */
async function renderNoteDetail(
  bridge: EvenAppBridge,
  note: Note,
  pageIndex: number
): Promise<void> {
  const title = getNoteTitle(note)
  let body = ''

  if (note.body?.list) {
    body = getListItems(note).join('\n')
  } else if (note.body?.text) {
    body = getTextContent(note)
  }

  const fullContent = `${title}\n${'─'.repeat(20)}\n${body}`

  // ページ分割（ヘッダー行はページ番号表示のため余裕を持たせる）
  const pages = splitIntoPages(fullContent)
  state.pages = pages

  // pageIndex を有効範囲にクランプ
  const clampedIndex = Math.max(0, Math.min(pageIndex, pages.length - 1))
  state.pageIndex = clampedIndex

  let content = pages[clampedIndex]

  // 複数ページある場合はページ番号を付与
  if (pages.length > 1) {
    const pageLabel = `[${clampedIndex + 1}/${pages.length}]`
    // ページ番号をコンテンツ末尾に追記（改行で区切る）
    content = `${content}\n${pageLabel}`
  }

  const textProp = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: G2_WIDTH,
    height: G2_HEIGHT,
    borderWidth: 0,
    borderColor: 5,
    borderRdaius: 4, // SDK の typo のためそのまま使う
    paddingLength: 6,
    containerID: CONTAINER_MAIN,
    containerName: 'note-detail',
    content,
    isEventCapture: 1,
  })

  await renderPage(bridge, { textObject: [textProp] })
}

/**
 * ノートのリストアイテムを G2 のネイティブリストコンテナで表示する。
 * ファームウェアがハイライトとスクロールを自動処理する。
 */
async function renderNoteAsList(bridge: EvenAppBridge, note: Note): Promise<void> {
  if (!note.body?.list) {
    await renderNoteDetail(bridge, note, state.pageIndex)
    return
  }

  const title = getNoteTitle(note)
  const items = getListItems(note)
  const displayItems = [`── ${title} ──`, ...items].slice(0, 20)

  const listProp = new ListContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: G2_WIDTH,
    height: G2_HEIGHT,
    borderWidth: 0,
    borderColor: 13,
    borderRdaius: 4,
    paddingLength: 4,
    containerID: CONTAINER_MAIN,
    containerName: 'note-list',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: displayItems.length,
      itemWidth: G2_WIDTH - 16,
      isItemSelectBorderEn: 0,
      itemName: displayItems,
    }),
  })

  await renderPage(bridge, { listObject: [listProp] })
}

/**
 * ページを描画する。
 * 未初期化時は createStartUpPageContainer、初期化済みは rebuildPageContainer を使う。
 */
async function renderPage(
  bridge: EvenAppBridge,
  containers: {
    textObject?: TextContainerProperty[]
    listObject?: ListContainerProperty[]
  }
): Promise<void> {
  if (!state.initialized) {
    const page = new CreateStartUpPageContainer({
      containerTotalNum: 1,
      ...containers,
    })
    const result = await bridge.createStartUpPageContainer(page)
    state.initialized = result === StartUpPageCreateResult.success
  } else {
    const page = new RebuildPageContainer({
      containerTotalNum: 1,
      ...containers,
    })
    await bridge.rebuildPageContainer(page)
  }
}

// ---------------------------------------------------------------------------
// 内部: イベント処理
// ---------------------------------------------------------------------------

function setupEventListeners(bridge: EvenAppBridge): void {
  bridge.onEvenHubEvent(async (event) => {
    if (state.scrollCooldown) return

    // テキストコンテナのイベント（Up / Down / Click）
    if (event.textEvent) {
      const { eventType } = event.textEvent

      if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
        // 上スクロール
        if (state.currentNote) {
          setCooldown()
          if (state.pages.length > 1 && state.pageIndex > 0) {
            // 複数ページあり、前のページへ
            await renderNoteDetail(bridge, state.currentNote, state.pageIndex - 1)
          } else if (state.currentNote.body?.list) {
            // 先頭ページかつリストノート → リスト表示に切替
            await renderNoteAsList(bridge, state.currentNote)
          }
        }
      } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        // 下スクロール
        if (state.currentNote) {
          setCooldown()
          if (state.pages.length > 1 && state.pageIndex < state.pages.length - 1) {
            // 複数ページあり、次のページへ
            await renderNoteDetail(bridge, state.currentNote, state.pageIndex + 1)
          } else {
            // 最終ページ or 単一ページ → テキスト表示（先頭に戻す）
            await renderNoteDetail(bridge, state.currentNote, 0)
          }
        }
      }
      // クリックイベント (eventType === 0 または undefined) は現在未使用
    }

    // システムイベント（DoubleClick）
    if (event.sysEvent) {
      const { eventType } = event.sysEvent
      if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        bridge.shutDownPageContainer(0)
      }
    }
  })
}

function setCooldown(): void {
  state.scrollCooldown = true
  setTimeout(() => {
    state.scrollCooldown = false
  }, SCROLL_COOLDOWN_MS)
}
