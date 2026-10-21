import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import { getLang, setLang, subscribeLang, t, type Lang } from '../lib/i18n'

export const useLang = () => useSyncExternalStore(subscribeLang, getLang)

/** Bahasa ditukar dengan memuat semula halaman: semua t() (termasuk senarai peringkat modul) dinilai semula; laluan kekal (URL hash) dan sesi kekal (localStorage). */
export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useLang()
  return <Fragment key={lang}>{children}</Fragment>
}

/** Pilihan bahasa EN | BM. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useLang()
  const opt = (l: Lang, label: string, full: string) => (
    <button key={l} type="button" onClick={() => { if (l === lang) return; setLang(l); window.location.reload() }} aria-pressed={lang === l} title={full}
      className={`rounded-md px-3 py-1 text-[12px] font-semibold ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
  )
  return (
    <div role="group" aria-label={t('Language')} className={`inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1 ${className}`}>
      {opt('en', 'EN', 'English')}{opt('ms', 'BM', 'Bahasa Melayu')}
    </div>
  )
}
