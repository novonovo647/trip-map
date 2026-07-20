// 移動手段・切符種別のマスタ定義（純粋データ）
// value は保存済みデータ（Firestore の plans）のキーそのものなので変更しないこと。

// 移動手段マスタ（表示順で定義）
export const TRANSPORT_MODES = [
  { value: '飛行機', emoji: '✈️', label: '飛行機' },
  { value: '電車',   emoji: '🚆', label: '電車'   },
  { value: 'バス',   emoji: '🚌', label: 'バス'   },
  { value: '船',     emoji: '🛳️', label: '船'     },
  { value: 'その他', emoji: '🚗', label: 'その他' },
]

// 切符種別マスタ
export const TICKET_TYPES = [
  { value: '世界一周券' },
  { value: '自己手配'   },
]

// デフォルト値
export const DEFAULT_MODE   = TRANSPORT_MODES[0].value  // '飛行機'
export const DEFAULT_TICKET = TICKET_TYPES[0].value     // '世界一周券'

// value → emoji の逆引き
export const MODE_EMOJI = Object.fromEntries(
  TRANSPORT_MODES.map(m => [m.value, m.emoji])
)

// 指定 mode の絵文字を返す（未知の値はデフォルトにフォールバック）
export function modeEmoji(mode) {
  return MODE_EMOJI[mode] ?? MODE_EMOJI[DEFAULT_MODE]
}

// 指定 mode の「絵文字 + ラベル」表示文字列を返す
export function modeLabel(mode) {
  const m = TRANSPORT_MODES.find(x => x.value === mode)
  return m ? `${m.emoji} ${m.label}` : mode
}
