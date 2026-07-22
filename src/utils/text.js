// テキスト整形ユーティリティ（純粋関数）

// メモ文字列を安全な HTML に変換する。
// - HTML特殊文字をエスケープ
// - ¥n / \n / 実改行 を <br> に変換
export function memoHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/¥n|\\n|\n/g, '<br>')
}

// 数値（円）をカンマ区切りの「¥12,000」形式に整形する。
// 空値・非数値は空文字を返す。
export function formatYen(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `¥${n.toLocaleString('ja-JP')}`
}
