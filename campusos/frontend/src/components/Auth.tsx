import { useState } from 'react'
import { Icon } from '../lib/icons'
import { Button, Field, Input, Modal } from '../lib/ui'
import { api, ApiError, type Session_ } from '../lib/api'
import { getLang, t } from '../lib/i18n'
import { LangSwitch } from './LangSwitch'

type Mode = 'signin' | 'forgot' | 'reset' | 'invite'

/** Baca ?invite=TOKEN / ?reset=TOKEN daripada pautan e-mel. */
function initialLink(): { mode: Mode; token: string } {
  const q = new URLSearchParams(window.location.search)
  if (q.get('invite')) return { mode: 'invite', token: q.get('invite')! }
  if (q.get('reset')) return { mode: 'reset', token: q.get('reset')! }
  return { mode: 'signin', token: '' }
}
const clearLink = () => window.history.replaceState({}, '', window.location.pathname)

/** Hiasan: grid jadual waktu ringkas; satu sel amber ialah kelas "sekarang". Tiada teks supaya tidak perlu terjemahan. */
function TimetableMotif() {
  const cells = [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1, 0, 1, 0, 0]
  return (
    <div aria-hidden className="mt-10 grid w-72 grid-cols-5 gap-1">
      {cells.map((c, i) => <div key={i} className={c === 2 ? 'h-9 rounded-lg bg-accent' : c === 1 ? 'h-9 rounded-lg bg-sidebar-hover' : 'h-9 rounded-lg border border-sidebar-border'} />)}
    </div>
  )
}

export function Auth({ onEnter, onStartOnboarding }: { onEnter: (s: Session_) => void; onStartOnboarding: () => void }) {
  const start = initialLink()
  const [mode, setMode] = useState<Mode>(start.mode)
  const [token] = useState(start.token)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pdpaOpen, setPdpaOpen] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'signin') {
        onEnter(await api.login(email.trim(), password, needCode ? code : undefined))
      } else if (mode === 'forgot') {
        const r = await api.forgotPassword(email.trim())
        setInfo(r.message)
      } else if (mode === 'reset') {
        await api.resetPassword(token, password)
        clearLink(); setMode('signin'); setPassword(''); setInfo(t('Password updated. Sign in with your new password.'))
      } else {
        const s = await api.acceptInvite(token, password, name.trim() || undefined)
        clearLink(); onEnter(s)
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOTP_REQUIRED') { setNeedCode(true); setInfo(t('Enter the 6-digit code from your authenticator app, or a recovery code.')) }
      else setError(err instanceof ApiError ? err.message : t('Something went wrong'))
    } finally { setBusy(false) }
  }

  const title = t({ signin: 'Welcome back', forgot: 'Reset your password', reset: 'Choose a new password', invite: 'Accept your invitation' }[mode])
  const sub = t({ signin: 'Sign in with the email your school gave you.', forgot: "Enter your work email and we'll send a reset link.", reset: 'Pick a new password for your account.', invite: 'Set a password to join your school.' }[mode])
  const cta = t({ signin: 'Sign in', forgot: 'Send reset link', reset: 'Update password', invite: 'Create my account' }[mode])

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel jenama */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <Icon.logo />
          <span className="font-display text-xl font-bold tracking-tight">CampusOS</span>
        </div>
        <div className="max-w-lg">
          <h1 className="font-display text-[40px] font-extrabold leading-[1.1] tracking-tight">{t('One timetable. One attendance list. One place to find a substitute.')}</h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-sidebar-muted">
            {t('CampusOS keeps timetables, attendance, leave and exam results together. The office works on a desktop and teachers run their day from a phone.')}
          </p>
          <TimetableMotif />
        </div>
        <p className="text-[14px] text-sidebar-muted">{t('Built for schools and training centres.')}</p>
      </div>

      {/* Right form */}
      <div className="flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-end"><LangSwitch /></div>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Icon.logo />
            <span className="font-display text-xl font-bold tracking-tight text-foreground">CampusOS</span>
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
            {mode === 'invite' && <Field label={t('Your name (optional)')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Full name')} /></Field>}
            {(mode === 'signin' || mode === 'forgot') && (
              <Field label={t('Work email')}><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('you@school.edu')} /></Field>
            )}
            {mode !== 'forgot' && (
              <Field label={t(mode === 'signin' ? 'Password' : 'New password')} hint={mode === 'signin' ? undefined : t('At least 8 characters')}>
                <Input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            {mode === 'signin' && needCode && (
              <Field label={t('Authenticator code')} hint={t('Lost your phone? Enter one of your recovery codes instead.')}><Input autoComplete="one-time-code" maxLength={9} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></Field>
            )}
            {error && <p role="alert" className="text-[14px] font-medium text-danger">{error}</p>}
            {info && <p className="text-[14px] font-medium text-ok">{info}</p>}
            <Button variant="primary" size="lg" block type="submit" iconRight="chevronRight" disabled={busy}>{busy ? t('Please wait…') : cta}</Button>
          </form>

          {mode === 'signin' && (
            <button onClick={() => { setMode('forgot'); setError(null); setInfo(null) }} className="mt-4 block w-full text-center text-[14px] font-medium text-muted-foreground hover:text-foreground">{t('Forgot your password?')}</button>
          )}
          {(mode === 'forgot') && (
            <button onClick={() => { setMode('signin'); setError(null); setInfo(null) }} className="mt-4 block w-full text-center text-[14px] font-medium text-muted-foreground hover:text-foreground">{t('Back to sign in')}</button>
          )}
          {mode === 'signin' && (
            <p className="mt-6 text-center text-[14px] text-muted-foreground">
              {t('New organization?')} <button onClick={onStartOnboarding} className="font-semibold text-primary hover:underline">{t('Start onboarding')}</button>
            </p>
          )}
          <p className="mt-6 text-center text-[11.5px] text-muted-foreground">
            {t('Protected under PDPA 2010')} · <button type="button" onClick={() => setPdpaOpen(true)} className="underline hover:text-foreground">{t('Privacy & Data Protection Notice')}</button>
          </p>
        </div>
      </div>

      <Modal open={pdpaOpen} onClose={() => setPdpaOpen(false)} title={t('Privacy & Personal Data Protection Notice (PDPA 2010)')} wide
        footer={<Button variant="primary" onClick={() => setPdpaOpen(false)}>{t('Close')}</Button>}>
        <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-foreground">
          {getLang() === 'ms' ? (
            <>
              <p><b>Bahasa Melayu (Notis Privasi PDPA 2010):</b> CampusOS memproses data peribadi kakitangan, pelajar, dan ibu bapa/penjaga (nama, ID pelajar/MyKid, nombor telefon waris, rekod kehadiran, tugasan, serta keputusan peperiksaan) bagi pihak institusi pendidikan anda untuk tujuan pengurusan akademik dan kebajikan pelajar.</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li><b>Hak Akses & Pembetulan:</b> Ibu bapa/penjaga berhak memohon salinan penuh atau pembetulan data peribadi pelajar melalui pihak pentadbiran sekolah (<i>Eksport JSON PDPA</i>).</li>
                <li><b>Pemadaman Kekal:</b> Pentadbir sekolah boleh memadam rekod pelajar secara kekal (termasuk kehadiran & markah peperiksaan) atas permintaan rasmi.</li>
                <li><b>Keselamatan:</b> Semua sesi menggunakan token disulitkan, pengesahan dua faktor TOTP pilihan, kawalan akses berasaskan peranan, dan sandaran harian automatik.</li>
              </ul>
            </>
          ) : (
            <>
              <p><b>English:</b> CampusOS processes staff and student records (names, student identifiers, parent/guardian contact numbers, attendance, assignment submissions, and examination results) strictly on behalf of your educational institution for academic administration and safety.</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li><b>Access & Portability:</b> Parents, guardians, and students may request a full copy of their personal data via the school administrator (<i>Export PDPA JSON</i>).</li>
                <li><b>Right to Erasure:</b> Upon formal withdrawal or request, administrators can permanently purge a student's profile, attendance, and exam records.</li>
                <li><b>Security:</b> All sessions use encrypted tokens, optional organization-wide TOTP two-factor authentication, role-based access control, and automated daily backups.</li>
              </ul>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
