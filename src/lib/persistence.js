import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'

// 世代バックアップの保持件数（最新から N 件を残す）
export const MAX_HISTORY = 10

/**
 * tripdata/{docId} を上書き保存する前に、現行内容を
 * tripdata/{docId}_backups の history 配列に退避する。
 *
 * - ライブドキュメント（plans / countries など）のスキーマは変更しない
 * - バックアップも同じ tripdata コレクション内に置くため、既存のルールで許可されやすい
 * - バックアップ失敗は本保存を妨げない（データ保存を最優先）
 *
 * @param {string} docId   tripdata 内のドキュメントID（例: 'plans', 'countries'）
 * @param {object} payload 新しく保存する内容
 */
export async function saveWithHistory(docId, payload) {
  const liveRef   = doc(db, 'tripdata', docId)
  const backupRef = doc(db, 'tripdata', `${docId}_backups`)

  // 1) 現行内容をバックアップ履歴へ退避（失敗しても続行）
  try {
    const current = await getDoc(liveRef)
    if (current.exists()) {
      const bk = await getDoc(backupRef)
      const history = bk.exists() ? (bk.data().history ?? []) : []
      history.push({ data: current.data(), at: Date.now() })
      // 最新 MAX_HISTORY 件だけ残す
      const trimmed = history.slice(-MAX_HISTORY)
      await setDoc(backupRef, { history: trimmed })
    }
  } catch {
    /* バックアップ失敗は無視（本保存を優先） */
  }

  // 2) 新データを保存
  await setDoc(liveRef, payload)
}

/**
 * バックアップ履歴を取得する（新しい順）。
 * @param {string} docId
 * @returns {Promise<Array<{ data: object, at: number }>>}
 */
export async function loadHistory(docId) {
  const backupRef = doc(db, 'tripdata', `${docId}_backups`)
  const bk = await getDoc(backupRef)
  if (!bk.exists()) return []
  const history = bk.data().history ?? []
  return [...history].reverse()
}
