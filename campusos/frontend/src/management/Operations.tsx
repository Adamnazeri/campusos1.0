import { useState } from 'react'
import { activityText, conflictText } from '../lib/activity'
import { t as tr, tp } from '../lib/i18n'
import { ApiError, api, downloadReport, fmtDay } from '../lib/api'
import { useFetch, useLive } from '../lib/live'
import { Icon } from '../lib/icons'
import { Avatar, Badge, Button, Card, cx, Meter, PageHeader, Select, useToast } from '../lib/ui'
import { StatCard, Toolbar } from '../components/common'
import { LineChart } from '../components/Charts'
import { useApp } from '../lib/store'
import { ConfirmModal } from './Manage'
import { SubjectPicker } from './Subjects'
import { Modal, Field, Input } from '../lib/ui'
import { EMPTY } from '../lib/empty'

/* ============ OVERVIEW ============ */
export function Overview() {
  const { navigate } = useApp()
  const { push } = useToast()
  const { user, overview: ov, liveClasses, activity, teachers, conflicts } = useLive()
  const att = useFetch(() => api.attendanceOverview())
  const trend = (att.data?.trend ?? []).slice(-6).filter((t: { rate: number | null }) => t.rate !== null).map((t: { label: string; date: string; rate: number }) => ({ x: `${tr(t.label)} ${t.date.slice(8, 10)}`, y: t.rate }))
  const hour = new Date().getHours()
  const greeting = hour < 12 ? tr('Good morning') : hour < 18 ? tr('Good afternoon') : tr('Good evening')
  const st = ov?.stats

  const quickActions = [
    { label: tr('Add Teacher'), icon: 'users' as const, go: () => navigate('teachers') },
    { label: tr('Create Class'), icon: 'book' as const, go: () => navigate('classes') },
    { label: tr('Timetable'), icon: 'calendar' as const, go: () => navigate('timetable') },
    { label: tr('Announcement'), icon: 'megaphone' as const, go: () => navigate('announcements') },
    { label: tr('Generate Report'), icon: 'file' as const, go: () => navigate('reports') },
  ]

  const stateMeta = {
    'in-progress': { tone: 'ok' as const, label: tr('In progress'), mark: 'bg-ok' },
    starting: { tone: 'warn' as const, label: tr('Starting soon'), mark: 'bg-warn' },
    cancelled: { tone: 'danger' as const, label: tr('Cancelled'), mark: 'bg-danger' },
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted-foreground">{ov ? `${tr(ov.day)} · ${ov.date}` : EMPTY}</p>
          <h1 className="mt-1 font-display text-[24px] font-bold tracking-tight text-foreground">{greeting}, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr("Here's what's happening across {org} right now.", { org: user.org.name })}</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => navigate('timetable')}>{tr('Take action')}</Button>
      </div>

      {ov?.holiday && (
        <div className="relative mb-4 flex items-center gap-3 bg-info-soft px-4 py-3 text-sm text-foreground chamfer">
          <Icon.calendar width={18} height={18} className="text-info" />
          <span className="flex-1"><b>{tr(ov.holiday.title)}</b> ({tr(ov.holiday.type)}): {tr('school holiday is active today.')}</span>
        </div>
      )}

      {(st?.reliefNeeded ?? 0) > 0 && (
        <button onClick={() => navigate('leave')} className="relative mb-4 flex w-full items-center gap-3 bg-warn-soft px-4 py-3 text-left text-sm text-foreground chamfer">
          <Icon.alert width={18} height={18} className="text-warn" />
          <span className="flex-1"><b>{tp(st.reliefNeeded, '{n} class session today', '{n} class sessions today')}</b> {tr('need a relief (substitute) teacher due to approved staff leave.')}</span>
          <span className="text-[12px] font-semibold text-primary underline">{tr('Assign relief')}</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Active classes')} value={String(st?.activeClasses ?? EMPTY)} icon="book" sub={tp(st?.branches ?? 0, 'Across {n} branch', 'Across {n} branches')} />
        <StatCard label={tr('Teachers on duty')} value={String(st?.teachers ?? EMPTY)} icon="users" sub={tr('{n} present today', { n: st?.teachersPresent ?? 0 })} />
        <StatCard label={tr('Today\'s classes')} value={String(st?.todaysClasses ?? EMPTY)} deltaTone="neutral" icon="calendar" sub={tr('{n} remaining', { n: st?.remainingToday ?? 0 })} />
        <StatCard label={tr('Attendance')} value={st?.attendance.today ?? st?.attendance.week ? `${st.attendance.today ?? st.attendance.week}%` : EMPTY} icon="checkCircle" sub={st ? tr('{rate}% vs {target}% target', { rate: st.attendance.today ?? st.attendance.week ?? 0, target: st.attendance.target }) : ''} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Live operations */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ok live-dot" />
              <h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Live operations')}</h2>
            </div>
            <div className="flex items-center gap-3 text-[12px] font-medium text-muted-foreground">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ok" /> {tr('{n} live', { n: liveClasses.filter(l=>l.state==='in-progress').length })}</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-warn" /> {tr('{n} soon', { n: liveClasses.filter(l=>l.state==='starting').length })}</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-danger" /> {tr('{n} cancelled', { n: liveClasses.filter(l=>l.state==='cancelled').length })}</span>
            </div>
          </div>

          {/* conflict banner */}
          {conflicts.length > 0 && (
            <button onClick={() => navigate('timetable')} className="flex w-full items-center gap-3 border-b border-danger/20 bg-danger-soft px-5 py-3 text-left">
              <Icon.alert width={17} height={17} className="text-danger" />
              <span className="flex-1 text-[14px] font-medium text-danger">{tp(conflicts.length, '{n} schedule conflict', '{n} schedule conflicts')}: {conflictText(conflicts[0].message)}</span>
              <span className="text-[12px] font-semibold text-danger underline">{tr('Resolve')}</span>
            </button>
          )}

          <div className="divide-y divide-border">
            {liveClasses.length === 0 && <p className="px-5 py-8 text-center text-[14px] text-muted-foreground">{tr('No classes running or starting within the hour.')}</p>}
            {liveClasses.map((l) => {
              const m = stateMeta[l.state]
              return (
                <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cx('h-3 w-3 shrink-0 rounded-full', m.mark)} aria-hidden />
                  <div className="w-14 shrink-0 font-mono text-[12px] text-muted-foreground tnum">{l.time.split('–')[0]}</div>
                  <div className="min-w-0 flex-1">
                    <p className={cx('truncate text-sm font-semibold', l.state === 'cancelled' ? 'text-muted-foreground line-through' : 'text-card-foreground')}>{tr(l.subject)} · {l.className}</p>
                    <p className="mt-1 flex items-center gap-2 truncate text-[12px] text-muted-foreground">
                      <Icon.mapPin width={12} height={12} /> {l.room}
                      <span className="text-border-strong">·</span> {l.substituteTeacher ? tr('Relief: {sub} (for {orig})', { sub: l.substituteTeacher, orig: l.teacher }) : l.teacher}
                    </p>
                  </div>
                  {l.needsRelief && <Badge tone="warn">{tr('Needs relief')}</Badge>}
                  <Badge tone={m.tone} dot>{m.label}</Badge>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          {/* Quick actions */}
          <Card className="p-4">
            <h2 className="mb-3 font-display text-[16px] font-semibold text-card-foreground">{tr('Quick actions')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((a) => {
                const I = Icon[a.icon]
                return (
                  <button key={a.label} onClick={a.go} className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary hover:bg-primary-soft">
                    <I width={18} height={18} className="text-primary" />
                    <span className="text-[14px] font-semibold text-foreground">{a.label}</span>
                  </button>
                )
              })}
              <button onClick={() => downloadReport('att').then(() => push({ title: tr('Report downloaded'), desc: tr('Attendance summary (CSV).'), tone: 'ok' })).catch((e) => push({ title: tr('Report failed'), desc: e instanceof ApiError ? e.message : undefined, tone: 'danger' }))} className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-3 text-left hover:border-primary">
                <Icon.plus width={18} height={18} className="text-muted-foreground" />
                <span className="text-[14px] font-semibold text-muted-foreground">{tr('More')}</span>
              </button>
            </div>
          </Card>

          {/* Attendance trend */}
          <Card className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Attendance this week')}</h2>
              {att.data?.rate != null && <Badge tone="ok" dot>{att.data.rate}%</Badge>}
            </div>
            {trend.length > 1 ? <LineChart compact series={[{ name: tr('Attendance rate'), points: trend }]} yUnit="%" yMax={100} height={150} ariaLabel={tr('Attendance this week')} /> : <p className="py-6 text-center text-[12px] text-muted-foreground">{tr('Not enough attendance data yet.')}</p>}
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        {/* Activity */}
        <Card className="p-5">
          <h2 className="mb-4 font-display text-[16px] font-semibold text-card-foreground">{tr('Recent activity')}</h2>
          <div className="relative pl-5">
            <div className="absolute left-[6px] top-1 bottom-1 w-px bg-border" />
            {activity.length === 0 && <p className="text-[14px] text-muted-foreground">{tr('No activity yet.')}</p>}
            {activity.map((a, i) => (
              <div key={i} className="relative mb-4 last:mb-0">
                <span className="absolute -left-[15px] top-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                <p className="text-[14px] text-foreground">{activityText(a.text)}</p>
                <p className="mt-1 font-mono text-[12px] text-muted-foreground">{a.time} · {tr(a.by)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Workload snapshot */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Teacher workload')}</h2>
            <button onClick={() => navigate('workload')} className="text-[12px] font-semibold text-primary hover:underline">{tr('View all')}</button>
          </div>
          <div className="flex flex-col gap-4">
            {[...teachers].sort((a, b) => b.hours - a.hours).slice(0, 5).map((t) => {
              const pct = Math.min(100, (t.hours / 36) * 100)
              const tone = t.status === 'Overloaded' ? 'danger' : t.status === 'Heavy' ? 'warn' : 'ok'
              return (
                <button key={t.id} onClick={() => navigate('teacher-profile', t.id)} className="flex items-center gap-3 text-left">
                  <Avatar name={t.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-[14px] font-semibold text-foreground">{t.name}</p>
                      <span className="font-mono text-[12px] text-muted-foreground tnum">{t.hours}{tr('h')}</span>
                    </div>
                    <Meter value={pct} tone={tone} className="mt-2" />
                  </div>
                  <Badge tone={tone as any}>{t.status}</Badge>
                </button>
              )
            })}
          </div>
        </Card>
      </div>
    </>
  )
}

/* ============ TIMETABLE ============ */
export function Timetable() {
  const { push } = useToast()
  const { sessions, days: DAYS, slots: SLOTS, conflicts, teachers, classes, rooms, refresh } = useLive()
  const [conflictOpen, setConflictOpen] = useState(true)
  const [fTeacher, setFTeacher] = useState('')
  const [fClass, setFClass] = useState('')
  const [fRoom, setFRoom] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null) // null = sesi baharu
  const [removing, setRemoving] = useState(false)
  const [form, setForm] = useState({ classId: '', subject: '', day: 'Mon', start: '09:00', duration: '60', room: '' })
  const [clash, setClash] = useState<string[] | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const conflictIds = new Set(conflicts.flatMap((c) => c.sessionIds))
  async function submitSession(force: boolean) {
    setFormErr(null)
    if (!form.classId) { setFormErr(tr('Choose a class.')); return }
    if (classes.find((c) => c.id === form.classId)?.subjects.length && !form.subject) { setFormErr(tr('Choose a subject.')); return }
    try {
      const payload = { classId: form.classId, subjectId: form.subject || undefined, day: form.day, start: form.start, duration: Number(form.duration), roomId: form.room || undefined }
      if (editId) await api.patchSession(editId, payload, force)
      else await api.addSession(payload, force)
      setAdding(false); setClash(null)
      push({ title: editId ? 'Session updated' : 'Session scheduled', tone: 'ok' })
      await refresh('timetable', 'overview')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') setClash(((e.extra.conflicts as { message: string }[]) ?? []).map((c) => conflictText(c.message)))
      else setFormErr(e instanceof ApiError ? e.message : tr('Something went wrong'))
    }
  }

  function openEdit(s: (typeof sessions)[number]) {
    setEditId(s.id); setClash(null); setFormErr(null)
    setForm({ classId: s.classId ?? '', subject: classes.find((c) => c.id === s.classId)?.subjects.find((x) => x.subject === s.subject)?.subjectId ?? '', day: s.day, start: s.slot, duration: String(s.duration ?? 60), room: s.roomId ?? '' })
    setAdding(true)
  }
  async function removeSession() {
    if (!editId) return
    try { await api.deleteSession(editId); push({ title: tr('Session removed'), tone: 'ok' }); setRemoving(false); setAdding(false); await refresh('timetable', 'overview') }
    catch (e) { setRemoving(false); push({ title: tr('Could not remove session'), desc: e instanceof ApiError ? e.message : undefined, tone: 'danger' }) }
  }

  const subjectColor: Record<string, string> = {
    Mathematics: 'bg-info-soft text-info border-info/25',
    'Further Maths': 'bg-info-soft text-info border-info/25',
    Physics: 'bg-primary-soft text-primary border-primary/25',
    Biology: 'bg-ok-soft text-ok border-ok/25',
    English: 'bg-warn-soft text-warn border-warn/25',
    History: 'bg-danger-soft text-danger border-danger/25',
    'Computer Science': 'bg-muted text-foreground border-border-strong',
  }
  const visible = sessions.filter((s) => (!fTeacher || s.teacher === fTeacher) && (!fClass || s.className === fClass) && (!fRoom || s.room === fRoom))
  const cell = (day: string, slot: string) => visible.filter((s) => s.day === day && s.slot.slice(0, 2) === slot.slice(0, 2))

  return (
    <>
      <PageHeader
        title={tr('Timetable')}
        subtitle={tr('Click a session to edit, move or remove it. Conflicts are flagged instantly.')}
        actions={<>
          <Button icon="plus" variant="primary" onClick={() => { setEditId(null); setForm({ classId: '', subject: '', day: 'Mon', start: '09:00', duration: '60', room: '' }); setAdding(true); setClash(null); setFormErr(null) }}>{tr('Add session')}</Button>
        </>}
      />

      <Toolbar>
        <Select value={fTeacher} onChange={(e) => setFTeacher(e.target.value)}><option value="">{tr('All teachers')}</option>{teachers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</Select>
        <Select value={fClass} onChange={(e) => setFClass(e.target.value)}><option value="">{tr('All classes')}</option>{classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</Select>
        <Select value={fRoom} onChange={(e) => setFRoom(e.target.value)}><option value="">{tr('All rooms')}</option>{rooms.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</Select>
      </Toolbar>

      {conflictOpen && conflicts.length > 0 && (
        <Card className="mb-4 [--line:var(--border)] bg-danger-soft p-0">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <Icon.alert width={20} height={20} className="text-danger" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-danger">{tp(conflicts.length, '{n} schedule conflict', '{n} schedule conflicts')}</p>
              {conflicts.slice(0, 3).map((c, i) => <p key={i} className="text-[14px] text-danger/90">{conflictText(c.message)}</p>)}
            </div>
            <Button size="sm" variant="outline" onClick={() => setConflictOpen(false)}>{tr('Dismiss')}</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid" style={{ gridTemplateColumns: `64px repeat(${DAYS.length}, 1fr)` }}>
              <div className="border-b border-r border-border bg-surface-2 p-2" />
              {DAYS.map((d) => (
                <div key={d} className="border-b border-r border-border bg-surface-2 p-3 text-center last:border-r-0">
                  <p className="text-sm font-semibold text-foreground">{tr(d)}</p>
                </div>
              ))}
              {SLOTS.map((slot) => (
                <div key={slot} className="contents">
                  <div className="border-b border-r border-border p-2 text-right font-mono text-[12px] text-muted-foreground">{slot}</div>
                  {DAYS.map((day) => {
                    const here = cell(day, slot)
                    return (
                      <div key={day + slot} className="flex min-h-[62px] flex-col gap-1 border-b border-r border-border p-1 last:border-r-0 hover:bg-muted">
                        {here.map((s) => (
                          <button key={s.id} type="button" onClick={() => openEdit(s)} className={cx('flex-1 rounded-lg border px-2 py-2 text-left outline-none hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring', conflictIds.has(s.id) ? 'border-danger bg-danger-soft ring-1 ring-danger' : subjectColor[s.subject] ?? 'bg-muted')}>
                            <p className="truncate text-[12px] font-semibold leading-tight">{tr(s.subject)}</p>
                            <p className="mt-1 truncate text-[10.5px] opacity-80">{s.className} · {s.room.replace('Room ', 'Rm ')}</p>
                            <p className="mt-1 truncate text-[12px] opacity-70">{s.teacher.split(' ')[0]}</p>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={editId ? 'Edit session' : 'Add session'} footer={<>
        {editId && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setRemoving(true)}>{tr('Remove')}</Button>}
        <Button variant="ghost" onClick={() => setAdding(false)}>{tr('Cancel')}</Button>
        {clash ? <Button variant="danger" onClick={() => void submitSession(true)}>{editId ? 'Save anyway' : 'Schedule anyway'}</Button> : <Button variant="primary" onClick={() => void submitSession(false)}>{editId ? 'Save changes' : 'Schedule'}</Button>}
      </>}>
        <div className="flex flex-col gap-4">
          <Field label={tr('Class')}><Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, subject: '' })}><option value="">{tr('Select a class…')}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <SubjectPicker classId={form.classId} by="id" value={form.subject} onChange={(v) => setForm((f) => ({ ...f, subject: v }))} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr('Day')}><Select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>{DAYS.map((d) => <option key={d} value={d}>{tr(d)}</option>)}</Select></Field>
            <Field label={tr('Start')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
            <Field label={tr('Duration')}><Select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}><option value="45">{tr('45 min')}</option><option value="60">{tr('60 min')}</option><option value="90">{tr('90 min')}</option><option value="120">{tr('120 min')}</option></Select></Field>
          </div>
          <Field label={tr('Room (defaults to the class room)')}><Select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}><option value="">{tr('Class default')}</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          {formErr && <p className="text-[14px] font-medium text-danger">{formErr}</p>}
          {clash && <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-[14px] text-danger"><p className="font-semibold">{tr('This clashes with existing sessions:')}</p>{clash.map((m, i) => <p key={i}>• {m}</p>)}</div>}
        </div>
      </Modal>
      <ConfirmModal open={removing} onClose={() => setRemoving(false)} title={tr('Remove session')} confirmLabel={tr('Remove')} message={tr('Remove this session from the weekly timetable? To skip a single day only, ask the teacher to mark it cancelled instead.')} onConfirm={removeSession} />
    </>
  )
}

/* ============ ATTENDANCE (management) ============ */
export function AttendanceOverview() {
  const [tab, setTab] = useState('class')
  const { push } = useToast()
  const { data: ov, loading } = useFetch(() => api.attendanceOverview())
  type Row = { id: string; name: string; teacher: string | null; rate: number | null; absent: number; late: number }
  const rows: Row[] = ov?.classes ?? []
  const byTeacher = [...rows.reduce((m, r) => { const k = r.teacher ?? EMPTY; const e = m.get(k) ?? { n: 0, sum: 0 }; if (r.rate !== null) { e.n++; e.sum += r.rate } m.set(k, e); return m }, new Map<string, { n: number; sum: number }>())]
    .map(([name, e]) => ({ id: name, name, rate: e.n ? Math.round((e.sum / e.n) * 10) / 10 : 0 }))
  const list = (tab === 'class' ? rows.map((r) => ({ id: r.id, name: r.name, rate: r.rate ?? 0 })) : byTeacher).slice(0, 8)
  const trend = (ov?.trend ?? []).filter((t: { rate: number | null }) => t.rate !== null).map((t: { date: string; rate: number }) => ({ x: t.date, y: t.rate }))
  const total = (ov?.present ?? 0) + (ov?.absent ?? 0) + (ov?.late ?? 0)
  const attention = [
    ...rows.filter((r) => r.rate !== null && r.rate < (ov?.target ?? 92)).sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0)).slice(0, 4)
      .map((r) => ({ c: r.name, t: r.teacher ?? EMPTY, issue: tr('Attendance {rate}%: below {target}% target', { rate: r.rate ?? 0, target: ov?.target ?? 92 }), tone: (r.rate ?? 100) < 90 ? 'danger' as const : 'warn' as const })),
    ...(ov?.today.pending ?? []).map((p: { name: string; teacher: string | null }) => ({ c: p.name, t: p.teacher ?? EMPTY, issue: tr('Attendance not yet marked today'), tone: 'warn' as const })),
  ]
  return (
    <>
      <PageHeader title={tr('Attendance')} subtitle={tr('Live attendance across the organization, updated as teachers submit.')} actions={<Button icon="download" variant="outline" onClick={() => downloadReport('att').catch((e) => push({ title: tr('Export failed'), desc: e instanceof ApiError ? e.message : undefined, tone: 'danger' }))}>{tr('Export')}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Attendance rate')} value={ov?.rate != null ? `${ov.rate}%` : EMPTY} icon="checkCircle" sub={ov ? tr('Last 14 days · target {target}%', { target: ov.target }) : ''} />
        <StatCard label={tr('Absences')} value={String(ov?.absent ?? EMPTY)} deltaTone="danger" icon="user" sub={total ? tr('{pct}% of records', { pct: Math.round(((ov?.absent ?? 0) / total) * 1000) / 10 }) : ''} />
        <StatCard label={tr('Late arrivals')} value={String(ov?.late ?? EMPTY)} deltaTone="neutral" icon="clock" sub={total ? tr('{pct}% of records', { pct: Math.round(((ov?.late ?? 0) / total) * 1000) / 10 }) : ''} />
        <StatCard label={tr('Classes marked today')} value={ov ? `${ov.today.marked}/${ov.today.scheduledClasses}` : EMPTY} icon="clipboard" sub={ov ? tr('{n} pending', { n: ov.today.pending.length }) : ''} />
      </div>
      {loading && <p className="mt-3 text-[14px] text-muted-foreground">{tr('Loading…')}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-[16px] font-semibold text-card-foreground">{tr('Attendance trend (14 days)')}</h2>
          {trend.length > 1 ? <LineChart xKind="date" series={[{ name: tr('Attendance rate'), points: trend }]} yUnit="%" yMax={100} height={260} target={ov?.target != null ? { value: ov.target, label: tr('Target {target}%', { target: ov.target }) } : undefined} ariaLabel={tr('Attendance trend (14 days)')} /> : <p className="py-10 text-center text-[14px] text-muted-foreground">{tr('Not enough attendance data yet.')}</p>}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
            {[['class', 'By class'], ['teacher', 'By teacher']].map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)} className={cx('flex-1 rounded-md py-2 text-[14px] font-semibold', tab === id ? 'bg-card text-foreground ' : 'text-muted-foreground')}>{tr(l)}</button>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {list.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-[14px] font-medium text-foreground">{tab === 'class' ? c.name : c.name.split(' ')[0]}</span>
                <Meter value={c.rate} tone={c.rate >= 95 ? 'ok' : c.rate >= 92 ? 'primary' : 'warn'} />
                <span className="w-12 shrink-0 text-right font-mono text-[12px] text-muted-foreground tnum">{c.rate}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Classes needing attention')}</h2></div>
        <div className="divide-y divide-border">
          {attention.length === 0 && <p className="px-5 py-8 text-center text-[14px] text-muted-foreground">{tr('Every class is on target.')}</p>}
          {attention.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={r.t} size={34} />
              <div className="flex-1"><p className="text-sm font-semibold text-foreground">{r.c} · {r.t}</p><p className="text-[12px] text-muted-foreground">{r.issue}</p></div>
              <Badge tone={r.tone} dot>{r.tone === 'danger' ? 'Critical' : 'Watch'}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

/* ============ WORKLOAD ============ */
export function Workload() {
  const { navigate } = useApp()
  const { push } = useToast()
  const { teachers, workload } = useLive()
  const [dept, setDept] = useState('')
  const list = [...teachers].filter((t) => !dept || t.department === dept).sort((a, b) => b.hours - a.hours)
  const depts = [...new Set(teachers.map((t) => t.department))]
  const sm = workload?.summary

  return (
    <>
      <PageHeader title={tr('Teacher workload')} subtitle={tr('Balance teaching hours and spot overloaded staff before it becomes a problem.')} actions={<Button icon="download" variant="outline" onClick={() => downloadReport('wl').catch((e) => push({ title: tr('Export failed'), desc: e instanceof ApiError ? e.message : undefined, tone: 'danger' }))}>{tr('Export')}</Button>} />
      <Toolbar>
        <Select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">{tr('All departments')}</option>{depts.map((d) => <option key={d} value={d}>{tr(d)}</option>)}</Select>
      </Toolbar>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={tr('Avg weekly hours')} value={String(sm?.avgHours ?? EMPTY)} icon="gauge" sub={tr('Target 18–26h')} />
        <StatCard label={tr('Overloaded')} value={String(sm?.Overloaded ?? EMPTY)} deltaTone="danger" icon="alert" sub={tr('Needs redistribution')} />
        <StatCard label={tr('Under-utilized')} value={String(sm?.Light ?? EMPTY)} deltaTone="neutral" icon="user" sub={tr('Capacity available')} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {list.map((t) => {
          const pct = Math.min(100, (t.hours / 40) * 100)
          const tone = t.status === 'Overloaded' ? 'danger' : t.status === 'Heavy' ? 'warn' : t.status === 'Light' ? 'info' : 'ok'
          return (
            <Card key={t.id} className="flex flex-wrap items-center gap-4 p-4 hover:[--line:var(--border-strong)]">
              <button onClick={() => navigate('teacher-profile', t.id)} className="flex min-w-[200px] items-center gap-3">
                <Avatar name={t.name} size={40} />
                <div className="text-left"><p className="text-sm font-semibold text-foreground">{t.name}</p><p className="text-[12px] text-muted-foreground">{tr(t.department)}</p></div>
              </button>
              <div className="min-w-[180px] flex-1">
                <div className="mb-1 flex items-center justify-between text-[12px]"><span className="text-muted-foreground">{tr('{n} teaching hours', { n: t.hours })}</span><span className="text-muted-foreground">{tp(t.classes, '{n} class', '{n} classes')}</span></div>
                <Meter value={pct} tone={tone as any} />
              </div>
              <Badge tone={tone as any} dot>{t.status}</Badge>
              <Button size="sm" variant="ghost" iconRight="chevronRight" onClick={() => navigate('teacher-profile', t.id)}>{tr('Details')}</Button>
            </Card>
          )
        })}
      </div>
    </>
  )
}
