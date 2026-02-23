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
/** テキスト表示の最大文字数（SDK 制限: 作成時 1000 文字） */
const MAX_TEXT_LENGTH = 950
/** スクロールイベントのクールダウン（ms） */
const SCROLL_COOLDOWN_MS = 300

// ---------------------------------------------------------------------------
// 状態管理
// ---------------------------------------------------------------------------

interface G2State {
  bridge: EvenAppBridge | null
  /** createStartUpPageContainer が成功したか */
  initialized: boolean
  currentNote: Note | null
  scrollCooldown: boolean
}

const state: G2State = {
  bridge: null,
  initialized: false,
  currentNote: null,
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
  await renderNoteDetail(state.bridge, note)
  onStatus(`「${getNoteTitle(note)}」を G2 に投影しました`, 'success')
}

// ---------------------------------------------------------------------------
// 内部: 画面描画
// ---------------------------------------------------------------------------

/**
 * ノートの詳細（テキスト形式）を G2 に表示する。
 * リストノートはチェックリスト形式、テキストノートはそのまま表示する。
 */
async function renderNoteDetail(bridge: EvenAppBridge, note: Note): Promise<void> {
  const title = getNoteTitle(note)
  let body = ''

  if (note.body?.list) {
    body = getListItems(note).join('\n')
  } else if (note.body?.text) {
    body = getTextContent(note)
  }

  let content = `${title}\n${'─'.repeat(20)}\n${body}`
  if (content.length > MAX_TEXT_LENGTH) {
    content = content.substring(0, MAX_TEXT_LENGTH) + '\n...'
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
    await renderNoteDetail(bridge, note)
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
        // 上スクロール: リスト表示に切替
        if (state.currentNote?.body?.list) {
          setCooldown()
          await renderNoteAsList(bridge, state.currentNote)
        }
      } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        // 下スクロール: テキスト表示に戻す
        if (state.currentNote) {
          setCooldown()
          await renderNoteDetail(bridge, state.currentNote)
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
