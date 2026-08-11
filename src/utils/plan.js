// プランの都市/移動エントリー判定ユーティリティ（純粋関数）

// 移動エントリー（transport）かどうか。都市エントリーは name キーを持つ。
export function isTransport(item) {
  return !item || !('name' in item)
}

// 都市エントリーかどうか。
export function isCity(item) {
  return !!item && ('name' in item)
}

// コースの泊数合計（都市・移動エントリーの泊数を集計）。
export function sumNights(plan) {
  return (plan?.cities || []).reduce((acc, item) => acc + (Number(item?.nights) || 0), 0)
}

// コース複製時にコース名へ付与する接尾辞。
export const COURSE_COPY_SUFFIX = '（コピー）'
