import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './lib/store'
import { ToastProvider } from './lib/ui'
import { Auth } from './components/Auth'
import { Onboarding } from './components/Onboarding'
import { TwoFactorGate } from './components/TwoFactorGate'
import { Management } from './management'
import { Teacher } from './teacher'
import { api, getSession, isManagement, setSession, type ApiUser, type Session_ } from './lib/api'
import { LiveProvider } from './lib/live'
import { pushOnLogout } from './lib/push'
import { SessionContext } from './lib/session'

function RoleView() {
  const { role } = useApp()
  return role === 'management' ? <Management /> : <Teacher />
}

export default function App() {
  const [user, setUser] = useState<ApiUser | null>(() => getSession()?.user ?? null)
  const [onboarding, setOnboarding] = useState(() => !getSession()?.user && window.location.hash === '#/onboarding')

  // sesi tamat / ditolak pelayan → kembali ke layar log masuk
  useEffect(() => {
    const h = () => setUser(null)
    window.addEventListener('campusos:signout', h)
    return () => window.removeEventListener('campusos:signout', h)
  }, [])

  // muat semula profil sekali setiap kali aplikasi dibuka: peranan, ciri (bil) dan keperluan 2FA mungkin berubah sejak log masuk
  const uid = user?.id
  useEffect(() => {
    if (!uid) return
    let alive = true
    api.me().then((me) => { if (!alive) return; const cur = getSession(); if (cur) setSession({ ...cur, user: me }); setUser(me) }).catch(() => undefined)
    return () => { alive = false }
  }, [uid])

  const enter = (s: Session_) => { setSession(s); setUser(s.user) }
  const signOut = async () => { await pushOnLogout(); await api.logout(); setSession(null); setUser(null) }

  if (onboarding) {
    return (
      <ToastProvider>
        <Onboarding
          onComplete={(s) => { if (window.location.hash === '#/onboarding') window.history.replaceState({}, '', window.location.pathname); enter(s); setOnboarding(false) }}
          onExit={() => { if (window.location.hash === '#/onboarding') window.history.replaceState({}, '', window.location.pathname); setOnboarding(false) }}
        />
      </ToastProvider>
    )
  }

  if (!user) return <Auth onEnter={enter} onStartOnboarding={() => { window.location.hash = '#/onboarding'; setOnboarding(true) }} />

  if (user.twoFactorRequired && !user.twoFactor) {
    return <TwoFactorGate user={user} onDone={setUser} onSignOut={() => void signOut()} />
  }

  return (
    <ToastProvider>
      <SessionContext.Provider value={{ user, setUser, signOut: () => void signOut() }}>
        <LiveProvider key={user.id} user={user}>
          <AppProvider role={isManagement(user) ? 'management' : 'teacher'} onLogout={() => void signOut()}>
            <RoleView />
          </AppProvider>
        </LiveProvider>
      </SessionContext.Provider>
    </ToastProvider>
  )
}
