import { ref, watch, onBeforeUnmount } from 'vue'
import { auth } from '../firebase.js'
import { saveWithHistory } from '../lib/persistence.js'

// 自動保存のデバウンス時間（ms）
const AUTOSAVE_DEBOUNCE_MS = 1500
// 外部更新の通知表示を維持する時間（ms）
const EXTERNAL_NOTICE_MS = 3000
// プランデータの Firestore ドキュメントID
const PLANS_DOC_ID = 'plans'

/**
 * プランデータの自動保存・外部同期を担う composable。
 * PlanEditor / PlanManagerModal で共通利用する。
 *
 * @param {object} data reactive なプランデータ配列
 * @param {object} options
 * @param {() => any} options.getExternalData props.externalData を返すゲッター
 * @param {() => object[]} [options.serialize] 保存用データを生成（既定: data のディープコピー）
 * @param {(newData: object[]) => void} [options.onExternalApply] 外部反映後の追加処理
 * @param {'idle'|'saved'} [options.externalRevertStatus] 外部通知後に戻す状態
 * @param {() => void} options.emitClose 'close' を emit する関数
 */
export function usePlanPersistence(data, {
  getExternalData,
  serialize = () => JSON.parse(JSON.stringify(data)),
  onExternalApply,
  externalRevertStatus = 'saved',
  emitClose,
}) {
  const saveStatus = ref('idle')   // 'idle' | 'saved' | 'saving' | 'error' | 'external'
  const saveError  = ref('')
  let autoSaveTimer      = null
  let initialized        = false
  let isApplyingExternal = false   // 外部反映中の自動保存誤発火を防ぐ
  let dirty              = false

  watch(data, () => {
    if (!initialized || isApplyingExternal) return
    dirty = true
    saveStatus.value = 'saving'
    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => doSave(false), AUTOSAVE_DEBOUNCE_MS)
  }, { deep: true })

  // 他ユーザーの更新を反映
  watch(getExternalData, (newVal) => {
    if (!newVal) return
    isApplyingExternal = true
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
    dirty = false
    data.splice(0, data.length, ...JSON.parse(JSON.stringify(newVal)))
    onExternalApply?.(newVal)
    setTimeout(() => { isApplyingExternal = false }, 0)
    saveStatus.value = 'external'
    setTimeout(() => {
      if (saveStatus.value === 'external') saveStatus.value = externalRevertStatus
    }, EXTERNAL_NOTICE_MS)
  })

  // watch登録後に初期化（初期値で自動保存しない）
  setTimeout(() => { initialized = true }, 0)
  onBeforeUnmount(() => clearTimeout(autoSaveTimer))

  async function doSave(shouldClose = false) {
    saveStatus.value = 'saving'
    saveError.value  = ''
    try {
      await saveWithHistory(PLANS_DOC_ID, {
        sets:        serialize(),
        savedBy:     auth.currentUser?.uid          ?? '',
        editorName:  auth.currentUser?.displayName  ?? '',
        editorPhoto: auth.currentUser?.photoURL     ?? '',
      })
      dirty = false
      saveStatus.value = 'saved'
      if (shouldClose) emitClose()
    } catch (e) {
      saveStatus.value = 'error'
      saveError.value  = e.message
    }
  }

  function handleClose() {
    clearTimeout(autoSaveTimer)
    if (dirty) doSave(true)
    else emitClose()
  }

  // 未保存の変更があれば即時保存を発火（画面遷移前）
  function flush() {
    if (dirty) { clearTimeout(autoSaveTimer); doSave(false) }
  }

  return { saveStatus, saveError, doSave, handleClose, flush }
}
