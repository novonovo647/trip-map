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
