import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../lib/icons'
import { Avatar, Badge, Button, Card, cx, Field, Input, Modal, Select } from '../lib/ui'
import { useApp } from '../lib/store'
import type { Student } from '../lib/data'
import { api, fmtDay, whatsappUrl } from '../lib/api'
import { useFetch, useLive } from '../lib/live'
import { SubjectPicker } from '../management/Subjects'
import { ResultsModal } from '../management/Results'
import { AssignmentSubmissionsModal } from '../management/Academics'
import { t, tp } from '../lib/i18n'
import { LangSwitch } from '../components/LangSwitch'
import { InstallCard } from '../components/InstallCard'
import { AlarmChip, AlarmSettingsCard, ClassAlarmHost } from './ClassAlarm'
import { EMPTY } from '../lib/empty'

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'classes', label: 'Classes', icon: 'book' },
  { id: 'tasks', label: 'Tasks', icon: 'check2' },
  { id: 'more', label: 'More', icon: 'more' },
]

export function Teacher() {
  const { route, navigate, theme, toggleTheme, logout } = useApp()
  const { loading } = useLive()
  const active = ['home', 'schedule', 'classes', 'tasks', 'more'].includes(route) ? route : (['exams', 'announcements'].includes(route) ? 'more' : 'home')

  let page: ReactNode
  switch (route) {
    case 'schedule': page = <Schedule />; break
    case 'classes': page = <TClasses />; break
    case 'tasks': page = <TTasks />; break
    case 'more': page = <More onLogout={logout} theme={theme} toggleTheme={toggleTheme} />; break
    case 'exams': page = <TExams />; break
    case 'announcements': page = <TAnnouncements />; break
    case 'attendance': page = <TakeAttendance />; break
    case 'leave': page = <RequestLeave />; break
    default: page = <Home />
  }

  const { user, unread } = useLive()
  const side: { id: string; label: string; icon: IconName; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar' },
    { id: 'classes', label: 'Classes', icon: 'book' },
    { id: 'tasks', label: 'Tasks', icon: 'check2' },
    { id: 'exams', label: 'My exams', icon: 'award' },
    { id: 'leave', label: 'Request leave', icon: 'plane' },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', badge: unread },
    { id: 'more', label: 'Alarm & app', icon: 'bell' },
  ]
  const sideActive = route === 'attendance' ? 'classes' : route

  return (
    <div className="min-h-dvh bg-background">
      <ClassAlarmHost />
      {/* Desktop / laptop: bar sisi seperti konsol admin */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 px-5 py-4">
          <Icon.logo />
          <span className="font-display text-lg font-bold tracking-tight text-sidebar-foreground">{t('CampusOS')}</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {side.map((n) => {
            const I = Icon[n.icon]
            const on = sideActive === n.id
            return (
              <button key={n.id} onClick={() => navigate(n.id)} className={cx('group mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ', on ? 'bg-sidebar-active text-sidebar-active-foreground' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground')}>
                <I width={18} height={18} />
                <span className="flex-1 text-left">{t(n.label)}</span>
                {!!n.badge && <span className="rounded-full bg-accent px-2 py-1 text-[12px] font-bold text-accent-foreground">{n.badge}</span>}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 flex items-center gap-3 px-1">
            <Avatar name={user.name} size={34} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-sidebar-foreground">{user.name}</p>
              <p className="truncate text-[12px] text-sidebar-muted">{user.org.name}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-1 py-2"><span className="text-[14px] text-sidebar-foreground">{t('Language')}</span><LangSwitch /></div>
          <button onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[14px] text-sidebar-foreground hover:bg-sidebar-hover">
            {theme === 'dark' ? <Icon.sun width={16} height={16} /> : <Icon.moon width={16} height={16} />}{t(theme === 'dark' ? 'Light mode' : 'Dark mode')}
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[14px] text-sidebar-foreground hover:bg-sidebar-hover"><Icon.logout width={16} height={16} /> {t('Sign out')}</button>
        </div>
      </aside>

      {/* Kandungan: penuh pada telefon, lajur tengah pada tablet, ruang luas di sebelah bar sisi pada laptop */}
      <div className="lg:pl-64">
        <div className="mx-auto min-h-dvh w-full max-w-md bg-background pb-28 sm:max-w-2xl lg:max-w-5xl lg:pb-10">
          {loading ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">{t('Loading your day…')}</p> : <div key={route} >{page}</div>}
        </div>
      </div>

      {/* Navigasi bawah: telefon dan tablet sahaja */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md pb-[env(safe-area-inset-bottom)] sm:max-w-2xl lg:hidden">
        <nav className="relative m-3 flex items-center justify-around bg-surface p-2 chamfer chamfer-lg [--line:var(--border)]">
          {NAV.map((n) => {
            const I = Icon[n.icon]
            const on = active === n.id
            return (
              <button key={n.id} onClick={() => navigate(n.id)} className={cx('flex flex-1 flex-col items-center gap-1 py-2 ', on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                <I width={21} height={21} />
                <span className="text-[12px] font-semibold">{t(n.label)}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function TopBar({ title, back }: { title: string; back?: boolean }) {
  const { navigate } = useApp()
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
      {back && <button onClick={() => navigate('home')} className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted"><Icon.chevronLeft width={20} height={20} /></button>}
      <h1 className="font-display text-lg font-bold text-foreground">{title}</h1>
    </div>
  )
}

/* ============ HOME ============ */
function Home() {
  const { navigate } = useApp()
  const { user, dash, tasks, announcements } = useLive()
  const sessions: { id: string; start: string; end: string; subject: string; className: string; room: string; classId: string; state: string; isRelief?: boolean; originalTeacher?: string | null }[] = dash?.today.sessions ?? []
  const next = dash?.nextClass as (typeof sessions)[number] | null | undefined
  const hour = new Date().getHours()
  const greeting = t(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
  const quick = [
    { label: 'Take Attendance', icon: 'checkCircle' as const, go: () => navigate('attendance') },
    { label: 'Create Assignment', icon: 'clipboard' as const, go: () => navigate('classes') },
    { label: 'View Schedule', icon: 'calendar' as const, go: () => navigate('schedule') },
    { label: 'Submit Leave', icon: 'plane' as const, go: () => navigate('leave') },
  ]
  return (
    <>
      <div className="flex items-center justify-between px-4 pb-2 pt-5">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted-foreground">{dash ? `${t(dash.today.day)} · ${fmtDay(dash.today.date)}` : EMPTY}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{greeting}, {user.name.split(' ')[0]}</h1>
        </div>
        <Avatar name={user.name} size={42} />
      </div>

      {dash?.today.holiday && (
        <div className="relative mx-4 mt-2 bg-info-soft px-4 py-3 text-[14px] text-foreground chamfer">
          <b>{t(dash.today.holiday.title)}</b> ({t(dash.today.holiday.type)})
        </div>
      )}

      {/* Up next hero */}
      <div className="px-4 pt-3">
        {!next ? (
          <Card className="p-5 text-center"><p className="font-display text-lg font-semibold text-foreground">{user.teacherId ? t('No more classes today') : t('No teaching profile linked')}</p><p className="mt-1 text-[14px] text-muted-foreground">{user.teacherId ? t('Enjoy the rest of your day.') : t('Ask management to link your account to a teacher profile.')}</p></Card>
        ) : (
        <button onClick={() => navigate('attendance', next.classId)} className="relative block w-full bg-sidebar p-6 text-left text-sidebar-foreground chamfer chamfer-lg">
          <div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent live-dot" /><span className="text-[12px] font-semibold text-sidebar-muted">{next.state === 'in-progress' ? t('In progress now') : t('Up next · starts {time}', { time: next.start })}</span></div>
            <p className="mt-3 font-display text-xl font-bold">{t(next.subject)}</p>
            <p className="text-sidebar-muted">{next.className} · {next.room}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-mono text-sm text-sidebar-foreground">{next.start}–{next.end}</span>
              <span className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[14px] font-semibold text-accent-foreground">{t('Take attendance')} <Icon.chevronRight width={15} height={15} /></span>
            </div>
          </div>
        </button>
        )}
      </div>
      <div className="flex px-4 pt-3"><AlarmChip /></div>
      <div className="px-4 pt-3 lg:hidden"><InstallCard dismissible /></div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 lg:grid-cols-4">
        {quick.map((q) => { const I = Icon[q.icon]; return (
          <button key={q.label} onClick={q.go} className="relative flex items-center gap-3 bg-card p-4 text-left chamfer [--line:var(--border)]"><span className="inline-flex shrink-0 items-center justify-center text-foreground"><I width={18} height={18} /></span><span className="text-[14px] font-semibold text-foreground">{t(q.label)}</span></button>
        )})}
      </div>

      <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-2">
      {/* Today's classes */}
      <div className="px-4 pt-5 lg:col-span-3">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-[16px] font-semibold text-foreground">{t("Today's classes")}</h2><span className="font-mono text-[12px] text-muted-foreground">{tp(sessions.length, '{n} session', '{n} sessions')}</span></div>
        <div className="flex flex-col gap-2">
          {sessions.length === 0 && <p className="py-6 text-center text-[14px] text-muted-foreground">{t('No classes scheduled today.')}</p>}
          {sessions.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex w-14 flex-col items-center rounded-lg bg-muted py-2"><span className="font-mono text-[12px] font-semibold text-foreground tnum">{s.start}</span></div>
              <div className="flex-1"><div className="flex items-center gap-2"><p className="text-sm font-semibold text-foreground">{t(s.subject)}</p>{s.isRelief && <Badge tone="info">{t('Relief')}</Badge>}</div><p className="text-[12px] text-muted-foreground">{s.className} · {s.room}{s.isRelief && s.originalTeacher ? ` · ${t('for {name}', { name: s.originalTeacher })}` : ''}</p></div>
              <Badge tone={s.state === 'in-progress' ? 'ok' : s.state === 'cancelled' ? 'danger' : s.state === 'done' ? 'neutral' : s.id === next?.id ? 'warn' : 'neutral'} dot>{t(s.state === 'in-progress' ? 'Now' : s.state === 'cancelled' ? 'Cancelled' : s.state === 'done' ? 'Done' : s.id === next?.id ? 'Next' : 'Later')}</Badge>
            </Card>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2">
      {/* Tasks + announcements */}
      <div className="px-4 pt-5">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-[16px] font-semibold text-foreground">{t('Pending tasks')}</h2><button onClick={() => navigate('tasks')} className="text-[12px] font-semibold text-primary">{t('View all')}</button></div>
        <div className="flex flex-col gap-2">
          {tasks.filter((tk) => tk.status !== 'Completed').length === 0 && <p className="py-3 text-center text-[14px] text-muted-foreground">{t('All caught up.')}</p>}
          {tasks.filter((tk) => tk.status !== 'Completed').map((tk) => (
            <Card key={tk.id} className="flex items-center gap-3 p-3"><span className="h-2 w-2 rounded-full bg-warn" /><span className="flex-1 text-[14px] font-medium text-foreground">{t(tk.title)}</span><span className="text-[12px] text-muted-foreground">{t('Due {date}', { date: tk.due })}</span></Card>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 pt-5">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-[16px] font-semibold text-foreground">{t('Announcements')}</h2></div>
        <div className="flex flex-col gap-2">
          {announcements.slice(0, 2).map((a) => (
            <Card key={a.id} className="p-3">
              <div className="flex items-center gap-2"><Badge tone={a.tag === 'Emergency' ? 'danger' : a.tag === 'Meeting' ? 'primary' : 'info'}>{t(a.tag)}</Badge>{!a.read && <span className="h-2 w-2 rounded-full bg-accent" aria-label={t('Unread')} />}<span className="ml-auto text-[12px] text-muted-foreground">{a.time}</span></div>
              <p className="mt-2 text-[14px] font-semibold text-foreground">{t(a.title)}</p>
            </Card>
          ))}
        </div>
      </div>
      </div>
      </div>
    </>
  )
}

/* ============ SCHEDULE ============ */
function Schedule() {
  const { sessions: all, days, dash } = useLive()
  const [day, setDay] = useState<string>(dash?.today.day ?? 'Mon')
  const ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayIso: string = dash?.today.date ?? new Date().toISOString().slice(0, 10)
  const dateFor = (d: string) => new Date(Date.parse(todayIso + 'T00:00:00Z') + (ORDER.indexOf(d) - ORDER.indexOf(dash?.today.day ?? 'Mon')) * 86_400_000).toISOString().slice(8, 10)
  const list = all.filter((s) => s.day === day).sort((a, b) => a.slot.localeCompare(b.slot))
  return (
    <>
      <TopBar title={t('Schedule')} />
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {days.map((d) => <button key={d} onClick={() => setDay(d)} className={cx('relative chamfer chamfer-sm flex flex-col items-center px-4 py-2', day === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><span className="text-[12px] font-semibold">{t(d)}</span><span className="font-display text-base font-bold">{dateFor(d)}</span></button>)}
      </div>
      <div className="px-4">
        {list.length > 0 ? (
          <div className="relative pl-14">
            {list.map((s) => (
              <div key={s.id} className="relative mb-3">
                <span className="absolute -left-14 top-1 font-mono text-[12px] text-muted-foreground tnum">{s.slot}</span>
                <Card className="bg-primary-soft p-4"><p className="text-sm font-semibold text-foreground">{t(s.subject)}</p><p className="mt-1 text-[12px] text-muted-foreground">{s.className} · {s.room}</p></Card>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 text-center"><Icon.calendar width={28} height={28} className="text-muted-foreground" /><p className="mt-3 font-display font-semibold text-foreground">{t('No classes on {day}', { day: t(day) })}</p><p className="text-[14px] text-muted-foreground">{t('Enjoy your free day.')}</p></div>
        )}
      </div>
    </>
  )
}

/* ============ CLASSES & ASSIGNMENTS (guru) ============ */
function TClasses() {
  const { navigate } = useApp()
  const { classes: mine, assignments, act, user } = useLive()
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [subFor, setSubFor] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  async function createAssignment() {
    const r = await act(() => api.addAssignment({ title, classId: assignFor, subject: subject || undefined, due: due || undefined, status: 'Published' }), { ok: { title: t('Assignment published'), desc: title }, reload: ['assignments', 'dash'] })
    if (r) { setAssignFor(null); setTitle(''); setDue(''); setSubject('') }
  }
  return (
    <>
      <TopBar title={t('My classes & assignments')} />
      <AssignmentSubmissionsModal assignmentId={subFor} open={!!subFor} onClose={() => setSubFor(null)} />
      <div className="flex flex-col gap-3 px-4 py-3 lg:grid lg:grid-cols-2 lg:items-start">
        {mine.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-[12px] font-bold text-primary">{c.name.replace('Form ', '')}</span><div><p className="font-semibold text-foreground">{c.name}</p><p className="text-[12px] text-muted-foreground">{(c.subjects.filter((x) => x.teacherId === user.teacherId).map((x) => t(x.subject)).join(', ')) || t('Class teacher')}</p></div></div><Badge>{tp(c.students, '{n} student', '{n} students')}</Badge></div>
            <p className="mt-3 text-[12px] text-muted-foreground">{c.schedule} · {c.room}</p>
            <div className="mt-3 flex gap-2"><Button size="sm" variant="primary" block icon="checkCircle" onClick={() => navigate('attendance', c.id)}>{t('Attendance')}</Button><Button size="sm" variant="outline" block icon="clipboard" onClick={() => setAssignFor(c.id)}>{t('Assign')}</Button></div>
          </Card>
        ))}
        {mine.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('No classes assigned to you yet.')}</p>}

        {assignments.length > 0 && (
          <div className="mt-3">
            <h2 className="mb-2 font-display text-[16px] font-semibold text-foreground">{t('My assignments')}</h2>
            <div className="flex flex-col gap-2">
              {assignments.map((a) => (
                <Card key={a.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{t(a.title)}</p>
                    <p className="text-[12px] text-muted-foreground">{a.className} · {t(a.subject)} · {t('Due {date}', { date: a.due })}</p>
                  </div>
                  <Badge tone={a.status === 'Completed' ? 'ok' : a.status === 'Published' ? 'primary' : 'neutral'}>{a.submitted}/{a.total}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setSubFor(a.id)}>{t('Submissions')}</Button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
      <Modal open={assignFor !== null} onClose={() => setAssignFor(null)} title={t('New assignment')} footer={<><Button variant="ghost" onClick={() => setAssignFor(null)}>{t('Cancel')}</Button><Button variant="primary" onClick={() => void createAssignment()}>{t('Publish')}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label={t('Title')}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Problem Set 5')} /></Field>
          <SubjectPicker classId={assignFor ?? ''} value={subject} onChange={setSubject} />
          <Field label={t('Due date')}><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  )
}

/* ============ TASKS ============ */
function TTasks() {
  const { tasks: items, act } = useLive()
  const [filter, setFilter] = useState('To Do')
  const advance = (id: string) => void act(() => api.advanceTask(id), { ok: { title: t('Task updated') }, reload: ['tasks', 'dash'] })
  const prTone = { High: 'danger', Medium: 'warn', Low: 'neutral' } as const
  return (
    <>
      <TopBar title={t('Tasks')} />
      <div className="flex gap-2 px-4 py-3">
        {['To Do', 'In Progress', 'Completed'].map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('rounded-full px-3 py-2 text-[12px] font-semibold', filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{t(f)}</button>)}
      </div>
      <div className="flex flex-col gap-3 px-4">
        {items.filter((tk) => tk.status === filter).map((tk) => (
          <Card key={tk.id} className="p-4">
            <div className="flex items-center gap-2"><Badge tone={prTone[tk.priority]}>{t(tk.priority)}</Badge><span className="ml-auto text-[12px] text-muted-foreground">{t('Due {date}', { date: tk.due })}</span></div>
            <p className={cx('mt-2 text-[14px] font-medium', tk.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-foreground')}>{t(tk.title)}</p>
            {tk.status !== 'Completed' && <Button size="sm" variant="outline" block className="mt-3" onClick={() => advance(tk.id)}>{t(tk.status === 'To Do' ? 'Mark in progress' : 'Mark complete')}</Button>}
          </Card>
        ))}
        {items.filter((tk) => tk.status === filter).length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">{t('Nothing in {status}.', { status: t(filter).toLowerCase() })}</div>}
      </div>
    </>
  )
}

/* ============ TAKE ATTENDANCE ============ */
function TakeAttendance() {
  const { navigate, param } = useApp()
  const { classes, dash, act, user } = useLive()
  const todayIso: string = dash?.today.date ?? new Date().toISOString().slice(0, 10)
  const minIso = new Date(Date.parse(todayIso + 'T00:00:00Z') - 7 * 86_400_000).toISOString().slice(0, 10)
  const [selectedClassId, setSelectedClassId] = useState<string>(() => param ?? dash?.nextClass?.classId ?? classes[0]?.id ?? '')
  const [date, setDate] = useState<string>(todayIso)
  const classId = selectedClassId || param || dash?.nextClass?.classId || classes[0]?.id
  const att = useFetch(() => (classId ? api.classAttendance(classId, date) : Promise.resolve(null)), [classId, date])
  const [list, setList] = useState<Student[]>([])
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (att.data) setList((att.data.roster as Student[]).map((r) => ({ ...r, status: r.status ?? 'Present' })))
  }, [att.data])
  async function submit() {
    const r = await act(() => api.putAttendance(classId!, { date, records: list.map((s) => ({ studentId: s.id, status: s.status })) }),
      { ok: { title: t('Attendance saved'), desc: t('{p} present · {a} absent · {l} late', { p: counts.Present, a: counts.Absent, l: counts.Late }) }, reload: ['dash', 'classes'] })
    if (r) setDone(true)
  }
  const counts = { Present: list.filter((s) => s.status === 'Present').length, Absent: list.filter((s) => s.status === 'Absent').length, Late: list.filter((s) => s.status === 'Late').length }
  function set(id: string, status: Student['status']) { setList((s) => s.map((x) => x.id === id ? { ...x, status } : x)) }
  const cycle: Record<string, Student['status']> = { Present: 'Absent', Absent: 'Late', Late: 'Present' }

  if (done) return (
    <>
      <TopBar title={t('Attendance saved')} back />
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft text-ok"><Icon.checkCircle width={32} height={32} /></div>
        <h2 className="font-display text-xl font-bold text-foreground">{t('Attendance saved')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{att.data?.className} · {date}</p>
        <div className="mt-6 grid w-full grid-cols-3 gap-3">
          {(['Present', 'Absent', 'Late'] as const).map((k) => <div key={k} className="relative bg-card p-3 chamfer [--line:var(--border)]"><p className="font-display text-2xl font-bold text-foreground tnum">{counts[k]}</p><p className="text-[12px] text-muted-foreground">{t(k)}</p></div>)}
        </div>
        <Button variant="primary" block className="mt-6" onClick={() => navigate('home')}>{t('Back to home')}</Button>
      </div>
    </>
  )

  return (
    <>
      <TopBar title={t('Take attendance')} back />
      <div className="sticky top-[53px] z-10 border-b border-border bg-surface px-4 py-3">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Select value={classId ?? ''} onChange={(e) => setSelectedClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input type="date" min={minIso} max={todayIso} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-between"><div><p className="font-semibold text-foreground">{att.data?.className ?? EMPTY} · {t(att.data?.subject ?? '')}</p><p className="text-[12px] text-muted-foreground">{date} · {tp(list.length, '{n} student', '{n} students')}</p></div><Button size="sm" variant="outline" onClick={() => setList((s) => s.map((x) => ({ ...x, status: 'Present' })))}>{t('Present all')}</Button></div>
        <div className="mt-2 flex gap-2 text-[12px] font-semibold"><span className="text-ok">{t('{n} present', { n: counts.Present })}</span><span className="text-danger">{t('{n} absent', { n: counts.Absent })}</span><span className="text-warn">{t('{n} late', { n: counts.Late })}</span></div>
      </div>
      <div className="divide-y divide-border px-1">
        {!classId && <p className="py-16 text-center text-sm text-muted-foreground lg:col-span-2">{t('You have no classes to take attendance for.')}</p>}
        {classId && att.loading && list.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground lg:col-span-2">{t('Loading class…')}</p>}
        {list.map((s, i) => {
          const wa = s.guardianPhone && (s.status === 'Absent' || s.status === 'Late')
            ? whatsappUrl(s.guardianPhone, `Salam / Hello ${s.guardianName ?? 'Parent/Guardian'}, makluman daripada ${user.org.name}: ${s.name} (${att.data?.className ?? ''}) direkodkan ${s.status === 'Absent' ? 'TIDAK HADIR (Absent)' : 'LEWAT (Late)'} pada ${date}.`)
            : null
          return (
            <div key={s.id} className="flex items-center gap-3 px-3 py-3">
              <span className="w-5 font-mono text-[12px] text-muted-foreground tnum">{String(i + 1).padStart(2, '0')}</span>
              <Avatar name={s.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                {s.guardianPhone && <p className="text-[12px] text-muted-foreground">{s.guardianPhone}</p>}
              </div>
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-ok-soft px-2 py-1 text-[12px] font-semibold text-ok">WA</a>}
              <button onClick={() => set(s.id, cycle[s.status!])} className={cx('rounded-lg px-3 py-2 text-[12px] font-bold', s.status === 'Present' ? 'bg-ok-soft text-ok' : s.status === 'Absent' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>{t(s.status!)}</button>
            </div>
          )
        })}
      </div>
      <div className="sticky bottom-24 mx-4 mt-3 lg:bottom-4">
        <Button variant="primary" block size="lg" disabled={list.length === 0} onClick={() => void submit()}>{att.data?.marked ? t('Update attendance') : t('Submit attendance')}</Button>
      </div>
    </>
  )
}

/* ============ REQUEST LEAVE ============ */
function RequestLeave() {
  const { navigate } = useApp()
  const { balances, leave, dash, act } = useLive()
  const today: string = dash?.today.date ?? new Date().toISOString().slice(0, 10)
  const [type, setType] = useState('Medical leave')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState('')
  async function submit() {
    const r = await act(() => api.requestLeave({ type, from, to, reason: reason || undefined }), { ok: { title: t('Leave request submitted'), desc: t('Management has been notified.') }, reload: ['leave', 'balances', 'dash'] })
    if (r) navigate('home')
  }
  const total = balances.reduce((a: number, b: { remaining: number }) => a + b.remaining, 0)
  return (
    <>
      <TopBar title={t('Request leave')} back />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Card className="p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">{t('Leave balance')}</p><Badge tone="ok">{t('{n} days left', { n: total })}</Badge></div>
          <div className="mt-3 grid grid-cols-3 gap-2">{balances.map((b: { type: string; remaining: number }) => <div key={b.type} className="rounded-lg bg-muted p-2 text-center"><p className="font-display text-lg font-bold text-foreground tnum">{b.remaining}</p><p className="text-[12px] text-muted-foreground">{t(b.type.replace(' leave', ''))}</p></div>)}</div>
        </Card>
        <Field label={t('Leave type')}><Select value={type} onChange={(e) => setType(e.target.value)}>{['Medical leave', 'Casual leave', 'Annual leave', 'Study leave'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={t('Start date')}><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} /></Field><Field label={t('End date')}><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>
        <Field label={t('Reason')}><textarea rows={4} className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary" placeholder={t('Briefly describe your reason…')} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Button variant="primary" block size="lg" onClick={() => void submit()}>{t('Submit request')}</Button>
        {leave.length > 0 && (
          <div>
            <p className="mb-2 text-[14px] font-semibold text-foreground">{t('My requests')}</p>
            <div className="flex flex-col gap-2">
              {leave.slice(0, 6).map((l) => (
                <Card key={l.id} className="flex items-center gap-3 p-3"><div className="flex-1"><p className="text-[14px] font-semibold text-foreground">{t(l.type)}</p><p className="text-[12px] text-muted-foreground">{l.from} → {l.to} · {tp(l.days, '{n} day', '{n} days')}</p></div><Badge tone={l.status === 'Approved' ? 'ok' : l.status === 'Rejected' ? 'danger' : 'warn'} dot>{t(l.status)}</Badge></Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ============ MORE ============ */
function More({ onLogout, theme, toggleTheme }: { onLogout: () => void; theme: string; toggleTheme: () => void }) {
  const { navigate } = useApp()
  const { user, unread } = useLive()
  const items: { label: string; icon: IconName; go?: () => void }[] = [
    { label: t('Assignments'), icon: 'clipboard', go: () => navigate('classes') },
    { label: t('Exams (my invigilation)'), icon: 'award', go: () => navigate('exams') },
    { label: t('Request leave'), icon: 'plane', go: () => navigate('leave') },
    { label: unread ? t('Announcements ({n} new)', { n: unread }) : t('Announcements'), icon: 'megaphone', go: () => navigate('announcements') },
  ]
  return (
    <>
      <TopBar title={t('More')} />
      <div className="px-4 py-4 lg:max-w-2xl">
        <Card className="flex items-center gap-3 p-4"><Avatar name={user.name} size={48} /><div className="flex-1"><p className="font-display font-semibold text-foreground">{user.name}</p><p className="text-[12px] text-muted-foreground">{t(user.roleLabel)} · {user.org.name}</p></div></Card>
        <div className="mt-4"><AlarmSettingsCard /></div>
        <div className="mt-4"><InstallCard /></div>
        <div className="relative mt-4 overflow-hidden bg-card chamfer [--line:var(--border)]">
          {items.map((it) => { const I = Icon[it.icon]; return (
            <button key={it.label} onClick={it.go} className="flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left last:border-0 hover:bg-muted"><span className="text-muted-foreground"><I width={19} height={19} /></span><span className="flex-1 text-sm font-medium text-foreground">{it.label}</span><Icon.chevronRight width={16} height={16} className="text-muted-foreground" /></button>
          )})}
        </div>
        <div className="relative mt-4 overflow-hidden bg-card chamfer [--line:var(--border)]">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3"><span className="flex-1 text-sm font-medium text-foreground">{t('Language')}</span><LangSwitch /></div>
          <button onClick={toggleTheme} className="flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left hover:bg-muted"><span className="text-muted-foreground">{theme === 'dark' ? <Icon.sun width={19} height={19} /> : <Icon.moon width={19} height={19} />}</span><span className="flex-1 text-sm font-medium text-foreground">{t(theme === 'dark' ? 'Light mode' : 'Dark mode')}</span></button>
          <button onClick={onLogout} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-danger-soft"><span className="text-danger"><Icon.logout width={19} height={19} /></span><span className="flex-1 text-sm font-medium text-danger">{t('Sign out')}</span></button>
        </div>
      </div>
    </>
  )
}

/* ============ EXAMS (guru) ============ */
function TExams() {
  const { exams } = useLive()
  const [marksFor, setMarksFor] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <>
      <TopBar title={t('My exams')} back />
      {marksFor && <ResultsModal examId={marksFor} open onClose={() => setMarksFor(null)} />}
      <div className="flex flex-col gap-3 px-4 py-3 lg:grid lg:grid-cols-2 lg:items-start">
        {exams.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground lg:col-span-2">{t('No exams for your classes.')}</p>}
        {exams.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-center justify-between"><p className="font-semibold text-foreground">{t(e.title)}</p><Badge tone={e.status === 'Completed' ? 'ok' : e.status === 'Grading' ? 'warn' : 'primary'} dot>{t(e.status)}</Badge></div>
            <p className="mt-1 text-[12px] text-muted-foreground">{e.className} · {t(e.subject)}</p>
            <p className="mt-2 text-[14px] text-foreground">{e.date} · {e.time} · {e.room}</p>
            {e.rawDate <= today && <Button size="sm" variant={e.status === 'Completed' ? 'outline' : 'primary'} className="mt-3" onClick={() => setMarksFor(e.id)}>{e.status === 'Completed' ? t('View results') : t('Enter marks ({done}/{total})', { done: e.resultsEntered, total: e.classStudents })}</Button>}
          </Card>
        ))}
      </div>
    </>
  )
}

/* ============ ANNOUNCEMENTS (guru) ============ */
function TAnnouncements() {
  const { announcements, refresh } = useLive()
  return (
    <>
      <TopBar title={t('Announcements')} back />
      <div className="flex flex-col gap-3 px-4 py-3 lg:grid lg:grid-cols-2 lg:items-start">
        {announcements.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground lg:col-span-2">{t('No announcements.')}</p>}
        {announcements.map((a) => (
          <Card key={a.id} className="cursor-pointer p-4" onClick={() => { if (!a.read) void api.readAnnouncement(a.id).then(() => refresh('announcements')) }}>
            <div className="flex items-center gap-2"><Badge tone={a.tag === 'Emergency' ? 'danger' : a.tag === 'Meeting' ? 'primary' : 'info'}>{t(a.tag)}</Badge>{!a.read && <span className="h-2 w-2 rounded-full bg-accent" aria-label={t('Unread')} />}<span className="ml-auto text-[12px] text-muted-foreground">{a.time}</span></div>
            <p className="mt-2 text-[14px] font-semibold text-foreground">{t(a.title)}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{t(a.body)}</p>
            <p className="mt-2 text-[12px] text-muted-foreground">{t(a.author)} · {t(a.audience)}</p>
          </Card>
        ))}
      </div>
    </>
  )
}
