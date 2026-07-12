// プランの都市/移動エントリー判定ユーティリティ（純粋関数）

// 移動エントリー（transport）かどうか。都市エントリーは name キーを持つ。
export function isTransport(item) {
  return !item || !('name' in item)
}

// 都市エントリーかどうか。
export function isCity(item) {
  return !!item && ('name' in item)
}
