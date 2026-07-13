// MapLibre（WebGL / canvas）描画用の色。
// canvas 描画のため CSS クラス・CSS変数は使えず、JS の値として保持する必要がある。
// 値は src/style.css のデザイントークンと一致させている。
export const MAP_COLORS = {
  visited:       '#d93025', // 渡航済み（= --danger）
  planned:       '#1e8e3e', // プラン済み（= --success）
  strikethrough: '#757575', // 取り消し線の国
  skip:          '#c0c4cc', // スキップ国
  unvisited:     '#dfe1e5', // 未渡航・デフォルト（= --land）
  ocean:         '#a9cdec', // 地図背景・海（= --ocean）
  border:        '#ffffff', // 国境線・マーカー枠・文字ハロー
  label:         '#202124', // 都市ラベル文字（= --text）
}
