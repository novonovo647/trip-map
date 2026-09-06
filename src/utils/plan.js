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

// プランの旅行済みフラグのキー。
export const TRAVELED_KEY = 'traveled'

// プラン管理の表示フィルタ。
export const PLAN_FILTERS = { UNVISITED: 'unvisited', VISITED: 'visited', ALL: 'all' }
export const DEFAULT_PLAN_FILTER = PLAN_FILTERS.UNVISITED
export const PLAN_FILTER_ORDER = [PLAN_FILTERS.UNVISITED, PLAN_FILTERS.VISITED, PLAN_FILTERS.ALL]
export const PLAN_FILTER_LABELS = {
  [PLAN_FILTERS.UNVISITED]: '未旅行のみ',
  [PLAN_FILTERS.VISITED]:   '旅行済みのみ',
  [PLAN_FILTERS.ALL]:       'すべて',
}

// プランが旅行済みか（undefined は未旅行として扱う）。
export function isTraveled(set) {
  return !!set?.[TRAVELED_KEY]
}
