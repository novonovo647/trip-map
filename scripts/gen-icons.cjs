// 外部パッケージ不要の純 Node.js PNG ジェネレーター
// 地球儀アイコンを生成して public/ に出力する
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// CRC32 テーブル
const CRC_TABLE = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function createPNG(width, height, drawPixel) {
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit depth, RGBA

  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4)
    row[0] = 0 // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height)
      const i = 1 + x * 4
      row[i] = r; row[i+1] = g; row[i+2] = b; row[i+3] = a
    }
    rows.push(row)
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 6 })
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))])
}

// ── 地球儀アイコン描画 ──────────────────────────────────────────────────
function drawGlobe(x, y, w, h) {
  const cx = w / 2, cy = h / 2
  const R  = w * 0.42
  const dx = x - cx, dy = y - cy
  const dist = Math.sqrt(dx*dx + dy*dy)

  // 背景 #1a1a2e
  const BG     = [26,  26,  46,  255]
  const BORDER = [74,  122, 155, 255] // #4a7a9b
  const OCEAN  = [29,  53,  87,  255] // #1d3557
  const LAND   = [55,  85,  120, 255] // やや明るい陸地色
  const GRID   = [74,  122, 155, 90 ] // 薄いグリッド

  // グローブ外側のアンチエイリアス的なフェード
  if (dist > R + 3) return BG
  if (dist > R)     return [...BORDER.slice(0,3), Math.round(255 * (R + 3 - dist) / 3)]

  // 縁取り
  if (dist > R - 4) return BORDER

  // 球面座標に変換
  const nx = dx / R
  const ny = dy / R
  const nz = Math.sqrt(Math.max(0, 1 - nx*nx - ny*ny))
  const lon = Math.atan2(nx, nz)          // -π ～ π
  const lat = Math.asin(Math.max(-1, Math.min(1, ny)))  // -π/2 ～ π/2

  // グリッド線 (30° 間隔)
  const S = Math.PI / 6
  const dLon = Math.abs(((lon % S) + S) % S - S/2)
  const dLat = Math.abs(((lat % S) + S) % S - S/2)
  const lineW = R < 100 ? 0.06 : 0.03

  if (dLon < lineW || dLat < lineW) return GRID

  // おおまかな大陸配置
  // ユーラシア
  if (lon > -0.3 && lon < 2.5 && lat > -0.1 && lat < 1.2) return LAND
  // アフリカ
  if (lon >  0.0 && lon < 0.9 && lat > -0.6 && lat < 0.3) return LAND
  // 南北アメリカ
  if (lon > -2.5 && lon < -0.5 && lat > -0.9 && lat < 1.2) return LAND
  // オーストラリア
  if (lon >  2.0 && lon < 2.9 && lat > -0.7 && lat < -0.1) return LAND

  return OCEAN
}

// 出力先
const OUT = path.join(__dirname, '..', 'public')
fs.mkdirSync(OUT, { recursive: true })

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), createPNG(size, size, drawGlobe))
  console.log(`✓ icon-${size}.png`)
}
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), createPNG(180, 180, drawGlobe))
console.log('✓ apple-touch-icon.png')
