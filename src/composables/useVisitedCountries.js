import { ref, computed } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import Papa from 'papaparse'
import { db, auth } from '../firebase.js'
import { saveWithHistory } from '../lib/persistence.js'
import { NAME_MAP, MISSING_EN_MAP } from '../utils/countries.js'
import countryNamesJa from '../assets/country_names_ja.json'

/**
 * 渡航済み国データのドメイン Composable。
 * CSV（tripdata/countries）の読み込み・編集・保存・リアルタイム同期を一体で扱う。
 *
 * @param {object}   options
 * @param {() => void} [options.onUpdated] 渡航済みデータ更新時に呼ばれる（地図再描画などに使用）
 */
export function useVisitedCountries({ onUpdated } = {}) {
  // 実データ（Vue reactivity 不要：関数内で直接参照。再描画は visitedVersion で誘発）
  let visitedSet = new Set()
  let jaMapData  = {}

  const totalCount     = ref(0)  // 英語名なし含む全件数
  const visitedVersion = ref(0)  // groupedList の強制再計算トリガー

  // ── 編集状態 ──
  const countryEditMode   = ref(false)
  const countryEditSet    = ref(new Set())
  const countryEditOrig   = ref(new Set())
  const countryEditStatus = ref('idle')  // 'idle' | 'saving' | 'saved' | 'error' | 'external'
  const countryEditorInfo = ref(null)    // { name, photo }
  const countryEditError  = ref('')
  let   countryEditTimer  = null

  const countryEditAdded   = computed(() => { let n = 0; for (const en of countryEditSet.value) { if (!countryEditOrig.value.has(en)) n++ }; return n })
  const countryEditRemoved = computed(() => { let n = 0; for (const en of countryEditOrig.value) { if (!countryEditSet.value.has(en)) n++ }; return n })

  // CSV英語名が空欄の地域の補完マッピングを使いつつ、visitedSet/jaMapData を構築
  function loadCSV(text) {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true })
    result.data.forEach(row => {
      const ja = row['名称']?.trim()
      let en = row['英語名称']?.trim()
      if (!en && ja && MISSING_EN_MAP[ja]) en = MISSING_EN_MAP[ja]
      if (ja || en) totalCount.value++
      if (en) {
        visitedSet.add(en)
        if (ja) jaMapData[en] = ja
      }
    })
  }

  // 渡航済み判定（NAME_MAP の差異を吸収）
  function isVisited(propName) {
    if (!propName) return false
    if (visitedSet.has(propName)) return true
    for (const [csvName, mappedName] of Object.entries(NAME_MAP)) {
      if (mappedName === propName && visitedSet.has(csvName)) return true
    }
    return false
  }

  // 地図フィーチャー名 → 日本語名
  function getJaName(propName) {
    if (!propName) return '不明'
    if (jaMapData[propName]) return jaMapData[propName]
    for (const [csvName, mappedName] of Object.entries(NAME_MAP)) {
      if (mappedName === propName && jaMapData[csvName]) return jaMapData[csvName]
    }
    return countryNamesJa[propName] || propName
  }

  // ── 編集操作 ──
  function enterEditMode() {
    countryEditSet.value    = new Set(visitedSet)
    countryEditOrig.value   = new Set(visitedSet)
    countryEditError.value  = ''
    countryEditStatus.value = 'idle'
    countryEditorInfo.value = null
    countryEditMode.value   = true
  }

  function toggleEdit(enName, jaName) {
    const next = new Set(countryEditSet.value)
    if (next.has(enName)) { next.delete(enName) }
    else { next.add(enName); if (jaName && !jaMapData[enName]) jaMapData[enName] = jaName }
    countryEditSet.value = next
    // オートセーブ（1.5秒デバウンス）
    countryEditStatus.value = 'saving'
    clearTimeout(countryEditTimer)
    countryEditTimer = setTimeout(() => doSave(), 1500)
  }

  // 編集終了（保留分を即時保存）。listMode 等の UI 状態はコンポーネント側で扱う。
  function closeEdit() {
    if (countryEditMode.value && countryEditTimer !== null) {
      clearTimeout(countryEditTimer)
      countryEditTimer = null
      doSave()
    }
    countryEditMode.value   = false
    countryEditStatus.value = 'idle'
    countryEditorInfo.value = null
  }

  async function doSave() {
    countryEditTimer        = null
    countryEditStatus.value = 'saving'
    countryEditError.value  = ''
    try {
      const lines = ['名称,英語名称']
      for (const en of [...countryEditSet.value].sort()) {
        const ja = jaMapData[en] || countryNamesJa[en] || en
        lines.push(`${ja},${en}`)
      }
      const csv = lines.join('\n') + '\n'
      await saveWithHistory('countries', {
        csv,
        savedBy:     auth.currentUser?.uid          ?? '',
        editorName:  auth.currentUser?.displayName  ?? '',
        editorPhoto: auth.currentUser?.photoURL     ?? '',
      })
      countryEditStatus.value = 'saved'
    } catch (e) {
      countryEditStatus.value = 'error'
      countryEditError.value  = e.message
    }
  }

  // ── リアルタイム同期 ──
  let unsub = null
  function start() {
    unsub = onSnapshot(doc(db, 'tripdata', 'countries'), (snap) => {
      if (!snap.exists()) return
      const d = snap.data()
      // 編集中に他ユーザーの変更が来た場合: editSet を更新してアイコン表示
      if (countryEditMode.value && d.savedBy && d.savedBy !== auth.currentUser?.uid) {
        clearTimeout(countryEditTimer)
        countryEditTimer = null
        visitedSet = new Set(); jaMapData = {}; totalCount.value = 0
        loadCSV(d.csv)
        countryEditSet.value    = new Set(visitedSet)
        countryEditorInfo.value = { name: d.editorName || '他のユーザー', photo: d.editorPhoto || null }
        countryEditStatus.value = 'external'
        setTimeout(() => { if (countryEditStatus.value === 'external') countryEditStatus.value = 'saved' }, 3000)
      } else {
        visitedSet = new Set(); jaMapData = {}; totalCount.value = 0
        loadCSV(d.csv)
      }
      visitedVersion.value++
      onUpdated?.()
    })
  }

  function stop() {
    unsub?.()
    unsub = null
  }

  return {
    // state
    totalCount, visitedVersion,
    countryEditMode, countryEditSet, countryEditOrig, countryEditStatus, countryEditorInfo, countryEditError,
    countryEditAdded, countryEditRemoved,
    // lookups
    isVisited, getJaName,
    // edit ops
    enterEditMode, toggleEdit, closeEdit, doSave,
    // sync
    start, stop,
  }
}
