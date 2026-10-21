import { THEME_COLOR, THEME_KEY, resolveTheme, type Theme } from './theme.ts'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { buildHash, homeFor, parseHash } from './route'

export type Role = 'management' | 'teacher'

type AppState = {
  route: string
  param?: string
  navigate: (route: string, param?: string) => void
  role: Role
  setRole: (r: Role) => void
  theme: Theme
  toggleTheme: () => void
  logout: () => void
  cmdOpen: boolean
  setCmdOpen: (v: boolean) => void
}

const Ctx = createContext<AppState | null>(null)
export const useApp = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

export function AppProvider({ role, onLogout, children }: { role: Role; onLogout: () => void; children: ReactNode }) {
  // laluan disimpan dalam URL (#/teachers, #/class-detail/<id>). Refresh, butang Back dan bookmark berfungsi
  const initial = parseHash(window.location.hash, role)
  const [route, setRoute] = useState(initial.route)
  const [param, setParam] = useState<string | undefined>(initial.param)
  const [theme, setTheme] = useState<Theme>(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(THEME_KEY) } catch { /* storan diblokir */ }
    return resolveTheme(saved, !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  })
  const [roleState, setRoleState] = useState<Role>(role)
  const [cmdOpen, setCmdOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  }, [theme])
  const chooseTheme = (next: Theme) => {
    setTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* storan diblokir */ }
  }

  // Back/Forward / hash diubah manual → ikut URL
  useEffect(() => {
    const onHash = () => {
      const r = parseHash(window.location.hash, roleState)
      setRoute(r.route); setParam(r.param)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [roleState])

  function navigate(r: string, p?: string) {
    const next = buildHash(r, p)
    if (window.location.hash === next) { setRoute(r); setParam(p); window.scrollTo({ top: 0 }); return }
    window.location.hash = next // mencetus 'hashchange' → state dikemas kini & sejarah penyemak imbas direkod
  }

  return (
    <Ctx.Provider
      value={{
        route,
        param,
        navigate,
        role: roleState,
        setRole: (r) => { setRoleState(r); navigate(homeFor(r)) },
        theme,
        toggleTheme: () => chooseTheme(theme === 'dark' ? 'light' : 'dark'),
        logout: onLogout,
        cmdOpen,
        setCmdOpen,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
