import { useState } from 'react'
import { Icon } from '../lib/icons'
import { Button, Field, Input } from '../lib/ui'
import { api, ApiError, getSession, setSession, type ApiUser } from '../lib/api'
import { RecoveryCodes } from '../management/Manage'
import { t } from '../lib/i18n'

/** Layar wajib bila organisasi mewajibkan 2FA dan akaun ini belum menyediakannya. */
export function TwoFactorGate({ user, onDone, onSignOut }: { user: ApiUser; onDone: (u: ApiUser) => void; onSignOut: () => void }) {
  const [tfa, setTfa] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setError(null); setBusy(true)
    try { await fn() } catch (e) { setError(e instanceof ApiError ? e.message : t('Something went wrong')) } finally { setBusy(false) }
  }
  const finish = async () => {
    const me = await api.me()
    const cur = getSession(); if (cur) setSession({ ...cur, user: me })
    onDone(me)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3"><Icon.logo /><span className="font-display text-xl font-bold tracking-tight text-foreground">CampusOS</span></div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{t('Set up two-factor sign-in')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Your organization requires a second step at sign-in for {email}. It takes about a minute.', { email: user.email })}</p>

        {codes ? (
          <RecoveryCodes codes={codes} onDone={() => void run(finish)} />
        ) : !tfa ? (
          <Button className="mt-6" variant="primary" size="lg" block disabled={busy} onClick={() => void run(async () => setTfa(await api.twoFaSetup()))}>{t('Start setup')}</Button>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-[14px] text-muted-foreground">{t('1. Add this key to Google Authenticator, Authy or 1Password (choose “enter a setup key”).')}</p>
            <code className="select-all break-all rounded-lg bg-surface-2 p-3 font-mono text-[14px] text-foreground">{tfa.secret}</code>
            <Field label={t('2. Enter the 6-digit code it shows')}><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></Field>
            <Button variant="primary" size="lg" block disabled={busy || code.length < 6} onClick={() => void run(async () => { const r = await api.twoFaEnable(code); setCodes(r.recoveryCodes) })}>{t('Turn on two-factor')}</Button>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[14px] font-medium text-danger">{error}</p>}
        <button onClick={onSignOut} className="mt-6 text-[14px] font-medium text-muted-foreground hover:text-foreground">{t('Sign out')}</button>
      </div>
    </div>
  )
}
