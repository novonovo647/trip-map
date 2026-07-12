// 地理座標計算ユーティリティ（純粋関数・UI/Firestore 非依存）

// 大圏弧の座標列を計算（球面線形補間）。返り値は [lat, lng] の配列。
export function geodesicPoints(from, to, n = 60) {
  const toRad = d => d * Math.PI / 180
  const toDeg = r => r * 180 / Math.PI
  const [lon1, lat1] = from.map(toRad)
  const [lon2, lat2] = to.map(toRad)
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ))
  if (d < 0.001) return [[toDeg(lat1), toDeg(lon1)], [toDeg(lat2), toDeg(lon2)]]
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const A = Math.sin((1 - t) * d) / Math.sin(d)
    const B = Math.sin(t * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))])
  }
  return pts
}

// 日付変更線をまたぐ経度ジャンプを除去（[lat, lng] の配列に対して）
export function unwrapLongitudes(pts) {
  const result = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prevLng = result[i - 1][1]
    let lng = pts[i][1]
    while (lng - prevLng > 180) lng -= 360
    while (lng - prevLng < -180) lng += 360
    result.push([pts[i][0], lng])
  }
  return result
}

// GeoJSON リングの日付変更線ジャンプを除去（[lng, lat] の配列に対して）
export function wrapGeoJSONRing(ring) {
  if (!ring || ring.length === 0) return ring
  const result = [[...ring[0]]]
  for (let i = 1; i < ring.length; i++) {
    const prev = result[i - 1][0]
    let lng = ring[i][0]
    while (lng - prev > 180) lng -= 360
    while (lng - prev < -180) lng += 360
    result.push([lng, ring[i][1]])
  }
  return result
}

export function wrapGeoJSONGeometry(geometry) {
  if (!geometry) return geometry
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(wrapGeoJSONRing) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(poly => poly.map(wrapGeoJSONRing)) }
  }
  return geometry
}

export function wrapAntimeridian(fc) {
  return { ...fc, features: fc.features.map(f => ({ ...f, geometry: wrapGeoJSONGeometry(f.geometry) })) }
}
