// Alarm kelas guru: bunyi + getaran + notifikasi bila kelas bermula dan tamat (waktu peranti, jadual hari ini dari pelayan).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { Icon } from '../lib/icons'
import { Button, Card, cx, Switch, useToast } from '../lib/ui'
import { useLive } from '../lib/live'
import { isIOS, isStandalone } from '../lib/pwa'
import { PUSH_EVENT, disablePush, enablePush, pushActive, pushSupported, sendTestPush, syncPush } from '../lib/push'
import type { PushStatus } from '../lib/pushUtil'
import { useLang } from '../components/LangSwitch'
import { ALARM_EVENT, askNotifyPermission, loadAlarm, loadFired, notifyPermission, notifySupported, saveAlarm, saveFired, showSystemNotification, startRinging, unlockAudio } from '../lib/alarm'
import { dueAlarms, localDate, secondsOfDay, toMin, type AlarmEvent, type AlarmSession, type AlarmSettings } from '../lib/alarmLogic'

function useAlarmSettings(): [AlarmSettings, (s: AlarmSettings) => void] {
  const [s, setS] = useState<AlarmSettings>(loadAlarm)
  useEffect(() => {
    const f = () => setS(loadAlarm())
    window.addEventListener(ALARM_EVENT, f)
    window.addEventListener('storage', f)
    return () => { window.removeEventListener(ALARM_EVENT, f); window.removeEventListener('storage', f) }
  }, [])
  return [s, (n) => { setS(n); saveAlarm(n) }]
}

const titleOf = (e: AlarmEvent) =>
  e.kind === 'start' ? t('Class starts now') : e.kind === 'end' ? t('Class has ended') : t('Class starts in {n} min', { n: Math.max(1, Math.round((toMin(e.session.start) * 60 - e.atSec) / 60)) })
const bodyOf = (e: AlarmEvent) => [e.session.className, e.session.subject, e.session.room].filter(Boolean).join(' · ')

/** Diletakkan sekali dalam shell guru: memantau jadual dan membunyikan alarm. */
export function ClassAlarmHost() {
  const { dash } = useLive()
  const [settings] = useAlarmSettings()
  const [alerts, setAlerts] = useState<AlarmEvent[]>([])
  const lang = useLang()
  const stopRef = useRef<(() => void) | null>(null)
  const sessions = useMemo(() => (dash?.today?.sessions ?? []) as AlarmSession[], [dash])
  const dashDate: string | undefined = dash?.today?.date
  const holiday = !!dash?.today?.holiday

  // pelayar hanya benarkan bunyi selepas ketikan pertama pengguna
  useEffect(() => {
    const f = () => unlockAudio()
    window.addEventListener('pointerdown', f, { once: true })
    window.addEventListener('keydown', f, { once: true })
    return () => { window.removeEventListener('pointerdown', f); window.removeEventListener('keydown', f) }
  }, [])

  useEffect(() => {
    if (!settings.enabled || !dashDate || holiday) return
    const check = () => {
      const date = localDate()
      if (date !== dashDate) return // tarikh peranti ≠ tarikh sekolah (zon masa/melepasi tengah malam): jangan bunyi
      const fired = loadFired(date)
      const due = dueAlarms(sessions, secondsOfDay(), date, fired, settings)
      if (!due.length) return
      due.forEach((e) => fired.add(e.key))
      saveFired(date, fired)
      stopRef.current?.()
      const kind = due.some((e) => e.kind === 'start') ? 'start' : due.some((e) => e.kind === 'end') ? 'end' : 'soon'
      stopRef.current = startRinging(kind, settings)
      setAlerts(due)
      if (settings.notify && !pushActive() && document.visibilityState !== 'visible') for (const e of due) void showSystemNotification(titleOf(e), bodyOf(e), e.key)
    }
    check()
    const iv = window.setInterval(check, 1000)
    const vis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', vis)
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [settings, sessions, dashDate, holiday])

  // selaraskan tetapan & bahasa dengan pelayan supaya alarm latar belakang (push) ikut pilihan terkini
  useEffect(() => { void syncPush(settings) }, [settings, lang])

  useEffect(() => () => { stopRef.current?.() }, [])
  const stop = () => { stopRef.current?.(); stopRef.current = null; setAlerts([]) }
  if (!alerts.length) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="alertdialog" aria-live="assertive">
      <div className="relative w-full max-w-sm bg-surface p-5 chamfer chamfer-lg [--line:var(--border)]">
        <div className="mx-auto mb-3 grid h-14 w-14 live-dot place-items-center rounded-full bg-primary-soft text-primary"><Icon.bell width={26} height={26} /></div>
        <div className="space-y-3 text-center">
          {alerts.map((e) => (
            <div key={e.key}>
              <p className="font-display text-xl font-bold text-foreground">{titleOf(e)}</p>
              <p className="text-sm text-muted-foreground">{bodyOf(e)}</p>
              <p className="font-mono text-[12px] text-muted-foreground">{e.session.start} – {e.session.end}</p>
            </div>
          ))}
        </div>
        <Button variant="primary" size="lg" block className="mt-5" onClick={stop}>{t('Stop alarm')}</Button>
      </div>
    </div>
  )
}

/** Butang kecil pada dashboard: hidup/matikan alarm dengan satu ketikan. */
export function AlarmChip({ className }: { className?: string }) {
  const [s, set] = useAlarmSettings()
  const toggle = async () => {
    const on = !s.enabled
    if (on) { unlockAudio(); if (s.notify) void askNotifyPermission() }
    set({ ...s, enabled: on })
  }
  return (
    <button onClick={() => void toggle()} className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-semibold ', s.enabled ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground', className)}>
      <Icon.bell width={14} height={14} /> {t(s.enabled ? 'Class alarm on' : 'Class alarm off')}
    </button>
  )
}

const pushMsgOf = (st: PushStatus): string =>
  st === 'ok' ? t('Background alarm is on. You will get a notification when a class starts or ends, even if the app is closed.')
    : st === 'needs-install' ? t('On iPhone, install CampusOS to your home screen first, then turn this on.')
    : st === 'denied' ? t('Notifications are blocked. Allow them in your browser settings, then try again.')
    : st === 'unsupported' ? t('This browser does not support background notifications.')
    : st === 'unavailable' ? t('Background alarms are turned off on the server.')
    : t('Could not turn on the background alarm. Check your connection and try again.')

/** Tetapan penuh (halaman More). */
export function AlarmSettingsCard() {
  const [s, set] = useAlarmSettings()
  const [perm, setPerm] = useState(notifyPermission())
  const toast = useToast()
  const [pushOn, setPushOn] = useState(pushActive)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)
  useEffect(() => { const f = () => setPushOn(pushActive()); window.addEventListener(PUSH_EVENT, f); return () => window.removeEventListener(PUSH_EVENT, f) }, [])
  const togglePush = async (on: boolean) => {
    setPushBusy(true); setPushMsg(null)
    if (on) { const st = await enablePush(s); setPushOn(st === 'ok'); setPushMsg(pushMsgOf(st)) }
    else { await disablePush(); setPushOn(false) }
    setPushBusy(false)
  }
  const testPush = async () => {
    const r = await sendTestPush()
    toast.push({ title: r && r.sent > 0 ? t('Test notification sent') : t('Could not send the test notification'), tone: r && r.sent > 0 ? 'ok' : 'warn' })
  }
  const patch = (p: Partial<AlarmSettings>) => set({ ...s, ...p })
  const enable = async (on: boolean) => {
    if (on) { unlockAudio(); if (s.notify) setPerm(await askNotifyPermission()) }
    patch({ enabled: on })
  }
  const test = () => { unlockAudio(); const stop = startRinging('start', s); window.setTimeout(stop, 3500) }
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-3"><span className="text-sm text-foreground">{label}</span>{children}</div>
  )
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex shrink-0 items-center justify-center text-foreground"><Icon.bell width={20} height={20} /></span>
        <div className="flex-1">
          <p className="font-display text-[16px] font-semibold text-card-foreground">{t('Class alarm')}</p>
          <p className="text-[12px] text-muted-foreground">{t('Rings and vibrates when your class starts and ends.')}</p>
        </div>
        <Switch on={s.enabled} onChange={(v) => void enable(v)} label={t('Class alarm')} />
      </div>
      {s.enabled && (
        <div className="mt-3 divide-y divide-border border-t border-border">
          <Row label={t('Alarm when a class starts')}><Switch on={s.start} onChange={(v) => patch({ start: v })} /></Row>
          <Row label={t('Alarm when a class ends')}><Switch on={s.end} onChange={(v) => patch({ end: v })} /></Row>
          <Row label={t('Remind me before class')}>
            <div className="flex overflow-hidden rounded-lg border border-border text-[12px] font-semibold">
              {([0, 5, 10] as const).map((m) => (
                <button key={m} onClick={() => patch({ leadMin: m })} className={cx('px-3 py-2', s.leadMin === m ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground')}>{m === 0 ? t('Off') : t('{n} min', { n: m })}</button>
              ))}
            </div>
          </Row>
          <Row label={t('Sound')}><Switch on={s.sound} onChange={(v) => patch({ sound: v })} /></Row>
          <Row label={t('Vibration')}><Switch on={s.vibrate} onChange={(v) => patch({ vibrate: v })} /></Row>
          {notifySupported() && (
            <Row label={t('Notification when the app is in the background')}>
              <Switch on={s.notify} onChange={async (v) => { patch({ notify: v }); if (v) setPerm(await askNotifyPermission()) }} />
            </Row>
          )}
          {pushSupported() && (
            <Row label={t('Alarm even when the app is closed')}><Switch on={pushOn} onChange={(v) => { if (!pushBusy) void togglePush(v) }} /></Row>
          )}
        </div>
      )}
      {s.enabled && !pushSupported() && isIOS() && !isStandalone() && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-foreground">{t('On iPhone, install CampusOS to your home screen to get alarms even when the app is closed.')}</p>}
      {s.enabled && pushMsg && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-foreground">{pushMsg}</p>}
      {s.enabled && perm === 'denied' && s.notify && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-foreground">{t('Notifications are blocked. Allow them in your browser settings to get alerts when the app is in the background.')}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" icon="bell" onClick={test}>{t('Test alarm')}</Button>
        {s.enabled && pushOn && <Button size="sm" variant="outline" icon="bell" onClick={() => void testPush()}>{t('Send test notification')}</Button>}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{t('The alarm rings while CampusOS is open on your phone. Install the app and keep it open during school hours for best results.')}</p>
      {pushOn && <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t('When the app is closed you get a system notification with your phone normal sound and vibration, not a continuously ringing alarm.')}</p>}
      {isIOS() && <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t('iPhone does not support vibration in web apps; sound and notifications still work.')}</p>}
    </Card>
  )
}
