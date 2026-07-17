// 国・地域に関する定数（純粋データ・UI/Firestore 非依存）

// 一覧の地域表示順
export const REGION_ORDER = [
  '東アジア', '東南アジア', '南アジア', '中央アジア',
  '中東・西アジア', 'ヨーロッパ', 'アフリカ',
  '北米・中米', 'カリブ海', '南アメリカ', 'オセアニア', 'その他',
]

// 一覧・カウントから除外する地域（実質的に渡航履歴管理の対象外）
export const EXCLUDE_FROM_LIST = new Set([
  'Akrotiri',                  // アクロティリ（英軍基地）
  'Ashmore and Cartier Is.',   // アシュモア・カルティエ諸島
  'Br. Indian Ocean Ter.',     // 英領インド洋地域
  'Indian Ocean Ter.',         // インド洋地域
  'Cyprus U.N. Buffer Zone',   // キプロス国連緩衝地帯
  'USNB Guantanamo Bay',       // グアンタナモ湾米軍基地
  'Clipperton I.',             // クリッパートン島
  'Coral Sea Is.',             // コーラル海諸島
  'S. Geo. and the Is.',       // サウスジョージア・南サンドウィッチ諸島
  'Siachen Glacier',           // シアチェン氷河
  'Scarborough Reef',          // スカボロー礁
  'Serranilla Bank',           // セラニーリャ礁
  'Dhekelia',                  // デケリア（英軍基地）
  'Heard I. and McDonald Is.', // ハード島・マクドナルド諸島
  'Baikonur',                  // バイコヌール
  'Bajo Nuevo Bank',           // バホ・ヌエボ礁
  'Fr. S. Antarctic Lands',    // フランス南方・南極地域
  'Spratly Is.',               // 南沙諸島
  'U.S. Minor Outlying Is.',   // 米国領有小離島

  'Åland',  // オーランド諸島
  'Guernsey',      // ガーンジー
  'Jersey',        // ジャージー
  'Faeroe Is.', // フェロー諸島
  'Isle of Man', // マン島
  'Norfolk Island', // ノーフォーク島
  'Falkland Is.', // フォークランド諸島
])

// 渡航困難国（二重取り消し線表示・マップ濃いグレー）
export const STRIKETHROUGH_NAMES = new Set([
  'Haiti', 'Ukraine', 'Afghanistan', 'Yemen', 'Iraq', 'Iran', 'Syria', 'Lebanon',
  'Sudan', 'Somalia', 'Central African Rep.', 'Burkina Faso', 'Mali', 'S. Sudan', 'Libya',
  'North Korea', 'Cuba',
  'Pakistan', 'Somaliland', 'Palestine',
  'Niger',
  'Nigeria', 'Eritrea', 'Burundi', 'Belarus',
])

// 行かない国（取り消し線表示・マップ薄いグレー）
export const SKIP_NAMES = new Set([
  'Saudi Arabia', 'Brunei', 'Kuwait',
])

// CSV英語名 → 10mデータの properties.name への変換（差異のある分のみ）
export const NAME_MAP = {
  'United States': 'United States of America',
  'Czech Republic': 'Czechia',
  'FYR Macedonia': 'Macedonia',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Cook Islands': 'Cook Is.',
  'Slovak Republic': 'Slovakia',
}

// CSVで英語名が空欄の地域の補完マッピング（日本語名 → 英語名）
export const MISSING_EN_MAP = {
  'ニューカレドニア': 'New Caledonia',
  'ジプラルタル': 'Gibraltar',
  'スコットランド': 'Scotland',
}
