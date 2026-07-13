import { ref } from 'vue'
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase.js'

/**
 * Google 認証を扱う Composable。
 * ホワイトリスト（allowedEmails）外のアカウントは自動ログアウトする。
 *
 * @param {object}   options
 * @param {string[]} options.allowedEmails ログインを許可するメールアドレス一覧（空なら全許可）
 * @param {(user: object) => void} [options.onLogin]  ログイン確定時に呼ばれる
 * @param {() => void}              [options.onLogout] ログアウト確定時に呼ばれる
 */
export function useAuth({ allowedEmails = [], onLogin, onLogout } = {}) {
  const currentUser = ref(null)
  const authReady   = ref(false)
  const loginError  = ref('')
  let unsub = null

  async function signIn() {
    loginError.value = ''
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        loginError.value = 'ログインエラー: ' + (e.code ?? e.message)
      }
    }
  }

  async function handleSignOut() {
    await fbSignOut(auth)
  }

  // 認証状態の監視を開始
  function start() {
    unsub = onAuthStateChanged(auth, async user => {
      // ホワイトリスト外のアカウントはログアウト
      if (user && allowedEmails.length && !allowedEmails.includes(user.email)) {
        await fbSignOut(auth)
        loginError.value  = 'このアカウントはアクセス権がありません'
        currentUser.value = null
        authReady.value   = true
        return
      }
      currentUser.value = user
      authReady.value   = true
      if (user) onLogin?.(user)
      else      onLogout?.()
    })
  }

  // 監視を解除
  function stop() {
    unsub?.()
    unsub = null
  }

  return { currentUser, authReady, loginError, signIn, handleSignOut, start, stop }
}
