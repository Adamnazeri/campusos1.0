import { useState } from 'react'
import { t as tr } from '../lib/i18n'
import { LangSwitch } from './LangSwitch'
import { api, ApiError, setSession, type Session_ } from '../lib/api'
import { Icon, type IconName } from '../lib/icons'
import { Avatar, Badge, Button, cx, Field, Input, Select } from '../lib/ui'

type StepDef = { id: string; label: string; title: string; desc: string; icon: IconName }
const STEPS: StepDef[] = [
  { id: 'org', label: tr('Organization'), title: tr('Create your organization'), desc: tr('Start with your school name. You can change these details later.'), icon: 'building' },
  { id: 'type', label: tr('Type'), title: tr('What kind of organization?'), desc: tr('This tailors terminology and defaults across CampusOS.'), icon: 'grid' },
  { id: 'branches', label: tr('Branches'), title: tr('Add your branches'), desc: tr('Campuses or locations you operate from.'), icon: 'mapPin' },
  { id: 'departments', label: tr('Departments'), title: tr('Create departments'), desc: tr('Group subjects and teachers by department.'), icon: 'book' },
  { id: 'teachers', label: tr('Teachers'), title: tr('Add your teachers'), desc: tr('Invite staff: they get an onboarding email.'), icon: 'users' },
  { id: 'subjects', label: tr('Subjects'), title: tr('Add your subjects'), desc: tr('What your school teaches: e.g. Mathematics, English. You will assign them to classes later.'), icon: 'book' },
  { id: 'classes', label: tr('Classes'), title: tr('Create classes'), desc: tr('Groups of students: e.g. Form 4A. Subjects and teachers are assigned to each class afterwards.'), icon: 'clipboard' },
  { id: 'rooms', label: tr('Rooms'), title: tr('Add rooms'), desc: tr('Physical spaces to schedule sessions into.'), icon: 'door' },
  { id: 'timetable', label: tr('Timetable'), title: tr('Build your first timetable'), desc: tr('Set operating days and hours. Schedule sessions after setup.'), icon: 'calendar' },
  { id: 'invite', label: tr('Invite'), title: tr('Invite your team'), desc: tr('Bring in admins and coordinators to help run things.'), icon: 'megaphone' },
]

const ORG_TYPES: { name: string; desc: string; icon: IconName }[] = [
  { name: 'School', desc: tr('Primary & secondary education'), icon: 'book' },
  { name: 'University', desc: tr('Higher education & faculties'), icon: 'award' },
  { name: 'College', desc: tr('Diplomas & further education'), icon: 'clipboard' },
  { name: 'Tuition Centre', desc: tr('Supplementary tuition'), icon: 'users' },
  { name: 'Training Centre', desc: tr('Vocational & professional'), icon: 'gauge' },
  { name: 'Academy', desc: tr('Specialized programs'), icon: 'building' },
]

type ChipItem = { id: number; name: string; meta?: string }

export function Onboarding({ onComplete, onExit }: { onComplete: (s: Session_) => void; onExit: () => void }) {
  const [step, setStep] = useState(0)
  const [orgName, setOrgName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [password, setPassword] = useState('')
  const [timezone, setTimezone] = useState('GMT (UTC+0)')
  const [dayStart, setDayStart] = useState('08:00')
  const [dayEnd, setDayEnd] = useState('16:00')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [orgType, setOrgType] = useState('School')
  const [branches, setBranches] = useState<ChipItem[]>([])
  const [departments, setDepartments] = useState<ChipItem[]>([])
  const [teachers, setTeachers] = useState<ChipItem[]>([])
  const [subjectsL, setSubjectsL] = useState<ChipItem[]>([])
  const [classesL, setClassesL] = useState<ChipItem[]>([])
  const [rooms, setRooms] = useState<ChipItem[]>([])
  const [days, setDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  const [invites, setInvites] = useState<ChipItem[]>([])

  const s = STEPS[step]
  const pct = Math.round(((step + 1) / STEPS.length) * 100)
  const isLast = step === STEPS.length - 1

  const ROLE_IDS: Record<string, string> = { Admin: 'admin', 'Academic Manager': 'academic', Coordinator: 'coordinator' }
  async function finish() {
    setError(null)
    if (!orgName.trim() || !ownerName.trim() || !ownerEmail.trim() || password.length < 8) {
      setStep(0)
      setError(tr('Enter the organization name, your name, a work email and a password of at least 8 characters.'))
      return
    }
    const badTeacher = teachers.find((t) => !t.meta || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.meta))
    if (badTeacher) { setStep(4); setError(tr('Add a valid work email for {name}.', { name: badTeacher.name })); return }
    setBusy(true)
    try {
      const session = await api.signupOrg({
        orgName: orgName.trim(), orgType, name: ownerName.trim(), email: ownerEmail.trim(), password, timezone,
        setup: {
          branches: branches.map((b) => b.name), departments: departments.map((d) => d.name),
          teachers: teachers.map((t) => ({ name: t.name, email: t.meta })),
          subjects: subjectsL.map((s) => s.name),
          classes: classesL.map((c) => ({ name: c.name })),
          rooms: rooms.map((r) => ({ name: r.name, capacity: parseInt(r.meta ?? '', 10) || 30 })),
          timetable: { operatingDays: days, dayStart, dayEnd },
          invites: invites.map((i) => ({ email: i.name, role: ROLE_IDS[i.meta ?? 'Admin'] ?? 'admin' })),
        },
      })
      setSession(session)
      onComplete(session)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('Something went wrong'))
      setBusy(false)
    }
  }
  function next() { isLast ? void finish() : setStep((n) => n + 1) }
  function back() { step === 0 ? onExit() : setStep((n) => n - 1) }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[300px_1fr]">
      {/* Rail */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-8 text-sidebar-foreground lg:flex">
        <div className="relative">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Icon.logo /><span className="font-display text-lg font-bold tracking-tight">{tr('CampusOS')}</span></div><LangSwitch /></div>
          <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.18em] text-sidebar-muted">{tr('Setup · {pct}% complete', { pct })}</p>
          <nav className="mt-4 flex flex-col gap-1">
            {STEPS.map((st, i) => {
              const done = i < step
              const active = i === step
              return (
                <button key={st.id} onClick={() => i <= step && setStep(i)} disabled={i > step} className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] ', active ? 'bg-sidebar-active text-sidebar-active-foreground' : done ? 'text-sidebar-muted hover:bg-sidebar-hover' : 'text-sidebar-muted')}>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', done ? 'bg-sidebar-active text-sidebar-active-foreground' : active ? 'border-2 border-sidebar-foreground text-sidebar-foreground' : 'border border-sidebar-border text-sidebar-muted')}>
                    {done ? <Icon.check width={13} height={13} /> : i + 1}
                  </span>
                  <span className="font-medium">{st.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
        <p className="relative text-[12px] text-sidebar-muted">{tr('You can skip steps and finish setup later from Settings.')}</p>
      </aside>

      {/* Content */}
      <div className="flex flex-col">
        {/* Mobile progress */}
        <div className="border-b border-border px-5 py-3 lg:hidden">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Icon.logo /><span className="font-display font-bold text-foreground">{tr('CampusOS')}</span></div><div className="flex items-center gap-3"><LangSwitch /><span className="font-mono text-[12px] text-muted-foreground">{tr('Step {n}/{total}', { n: step + 1, total: STEPS.length })}</span></div></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="flex flex-1 items-start justify-center overflow-y-auto px-5 py-8 lg:px-12 lg:py-14">
          <div key={s.id} className="w-full max-w-xl">
            <span className="inline-flex shrink-0 items-center justify-center text-foreground">{(() => { const I = Icon[s.icon]; return <I width={22} height={22} /> })()}</span>
            <h1 className="font-display text-[24px] font-bold tracking-tight text-foreground">{s.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>

            <div className="mt-7">
              {s.id === 'org' && (
                <div className="flex flex-col gap-4">
                  <Field label={tr('Organization name')}><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={tr('e.g. Greenfield Academy')} /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tr('Your name')}><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder={tr('e.g. Aisha Rahman')} /></Field>
                    <Field label={tr('Work email (your sign-in)')}><Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder={tr('you@school.edu')} /></Field>
                    <Field label={tr('Password')}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('At least 8 characters')} /></Field>
                    <Field label={tr('Timezone')}><Select value={timezone} onChange={(e) => setTimezone(e.target.value)}><option value="GMT (UTC+0)">{tr('GMT (UTC+0)')}</option><option value="WAT (UTC+1)">{tr('WAT (UTC+1)')}</option><option value="EAT (UTC+3)">{tr('EAT (UTC+3)')}</option><option value="MYT (UTC+8)">{tr('MYT (UTC+8)')}</option></Select></Field>
                  </div>
                </div>
              )}

              {s.id === 'type' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ORG_TYPES.map((t) => { const I = Icon[t.icon]; const on = orgType === t.name; return (
                    <button key={t.name} onClick={() => setOrgType(t.name)} className={cx('relative chamfer flex items-start gap-3 p-4 pr-10 text-left ', on ? '[--line:var(--border-strong)] bg-primary-soft' : '[--line:var(--border)] bg-card hover:[--line:var(--border-strong)]')} aria-pressed={on}>
                      {on && <Icon.check width={18} height={18} className="absolute right-4 top-4 text-foreground" />}
                      <span className={cx('mt-1 shrink-0', on ? 'text-foreground' : 'text-muted-foreground')}><I width={18} height={18} /></span>
                      <span><span className="block text-sm font-semibold text-foreground">{tr(t.name)}</span><span className="block text-[12px] text-muted-foreground">{t.desc}</span></span>
                    </button>
                  )})}
                </div>
              )}

              {s.id === 'branches' && <ChipBuilder items={branches} setItems={setBranches} placeholder={tr('Branch name: e.g. East Branch')} label={tr('Branch')} icon="mapPin" />}
              {s.id === 'departments' && <ChipBuilder items={departments} setItems={setDepartments} placeholder={tr('Department name: e.g. Languages')} label={tr('Department')} icon="book" />}
              {s.id === 'teachers' && <PersonBuilder items={teachers} setItems={setTeachers} />}
              {s.id === 'subjects' && <ChipBuilder items={subjectsL} setItems={setSubjectsL} placeholder={tr('Subject: e.g. Mathematics')} label={tr('Subject')} icon="book" />}
              {s.id === 'classes' && <ChipBuilder items={classesL} setItems={setClassesL} placeholder={tr('Class name: e.g. Form 5B')} label={tr('Class')} icon="clipboard" />}
              {s.id === 'rooms' && <MetaBuilder items={rooms} setItems={setRooms} namePh={tr('Room name: e.g. Lab 301')} metaPh={tr('Capacity')} icon="door" />}

              {s.id === 'timetable' && (
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="mb-2 text-[14px] font-semibold text-foreground">{tr('Operating days')}</p>
                    <div className="flex flex-wrap gap-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => { const on = days.includes(d); return (
                        <button key={d} onClick={() => setDays((v) => on ? v.filter((x) => x !== d) : [...v, d])} className={cx('rounded-lg border px-4 py-2 text-[14px] font-semibold ', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-border-strong')}>{tr(d)}</button>
                      )})}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tr('Day starts')}><Select value={dayStart} onChange={(e) => setDayStart(e.target.value)}><option>07:00</option><option>08:00</option><option>09:00</option></Select></Field>
                    <Field label={tr('Day ends')}><Select value={dayEnd} onChange={(e) => setDayEnd(e.target.value)}><option>15:00</option><option>16:00</option><option>17:00</option></Select></Field>
                  </div>
                  <div className="relative bg-surface-2 p-4 chamfer [--line:var(--border)]">
                    <p className="text-[14px] font-semibold text-foreground">{tr('Ready to schedule')}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{tr('{days} operating days · {classes} classes · {subjects} subjects · {teachers} teachers. Drag sessions into the grid from the Timetable page after setup.', { days: days.length, classes: classesL.length, subjects: subjectsL.length, teachers: teachers.length })}</p>
                  </div>
                </div>
              )}

              {s.id === 'invite' && (
                <div className="flex flex-col gap-4">
                  <InviteBuilder items={invites} setItems={setInvites} />
                  <div className="relative bg-ok-soft p-4 chamfer">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-ok"><Icon.checkCircle width={16} height={16} /> {tr("You're all set")}</p>
                    <p className="mt-1 text-[12px] text-ok/90">{tr('{org} is ready. Finish to open your operations console.', { org: orgName })}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mx-5 mb-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger lg:mx-12">{error}</p>}
        {/* Footer nav */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 lg:px-12">
          <Button variant="ghost" icon="chevronLeft" onClick={back}>{step === 0 ? 'Back to sign in' : 'Back'}</Button>
          <div className="flex items-center gap-2">
            {!isLast && <Button variant="ghost" onClick={next}>{tr('Skip')}</Button>}
            <Button variant="primary" disabled={busy} iconRight={isLast ? 'check' : 'chevronRight'} onClick={next}>{isLast ? (busy ? 'Creating…' : 'Finish setup') : 'Continue'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---- builders ---- */
function useAdd<T extends ChipItem>(items: T[], setItems: (v: T[]) => void) {
  return (item: Omit<T, 'id'>) => setItems([...items, { ...item, id: Date.now() } as T])
}

function ChipBuilder({ items, setItems, placeholder, label, icon }: { items: ChipItem[]; setItems: (v: ChipItem[]) => void; placeholder: string; label: string; icon: IconName }) {
  const [val, setVal] = useState('')
  const add = useAdd(items, setItems)
  const I = Icon[icon]
  function submit() { if (!val.trim()) return; add({ name: val.trim() }); setVal('') }
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="flex-1"><Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} /></div>
        <Button type="submit" variant="primary" icon="plus">{tr('Add')}</Button>
      </form>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
            <span className="inline-flex shrink-0 items-center justify-center text-foreground"><I width={16} height={16} /></span>
            <span className="flex-1 text-sm font-medium text-foreground">{it.name}</span>
            <Badge>{label}</Badge>
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Icon.x width={15} height={15} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetaBuilder({ items, setItems, namePh, metaPh, icon }: { items: ChipItem[]; setItems: (v: ChipItem[]) => void; namePh: string; metaPh: string; icon: IconName }) {
  const [name, setName] = useState('')
  const [meta, setMeta] = useState('')
  const add = useAdd(items, setItems)
  const I = Icon[icon]
  function submit() { if (!name.trim()) return; add({ name: name.trim(), meta: meta.trim() || undefined }); setName(''); setMeta('') }
  return (
    <div className="flex flex-col gap-3">
      <form className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={namePh} />
        <Input value={meta} onChange={(e) => setMeta(e.target.value)} placeholder={metaPh} />
        <Button type="submit" variant="primary" icon="plus">{tr('Add')}</Button>
      </form>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
            <span className="inline-flex shrink-0 items-center justify-center text-foreground"><I width={16} height={16} /></span>
            <span className="flex-1 text-sm font-medium text-foreground">{it.name}</span>
            {it.meta && <span className="text-[12px] text-muted-foreground">{it.meta}</span>}
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Icon.x width={15} height={15} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PersonBuilder({ items, setItems }: { items: ChipItem[]; setItems: (v: ChipItem[]) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const add = useAdd(items, setItems)
  function submit() { if (!name.trim()) return; add({ name: name.trim(), meta: email.trim() || undefined }); setName(''); setEmail('') }
  return (
    <div className="flex flex-col gap-3">
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Full name')} />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr('Work email')} />
        <Button type="submit" variant="primary" icon="plus">{tr('Add')}</Button>
      </form>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
            <Avatar name={it.name} size={32} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{it.name}</span>{it.meta && <span className="block truncate text-[12px] text-muted-foreground">{it.meta}</span>}</span>
            <Badge tone="warn">{tr('Invite pending')}</Badge>
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Icon.x width={15} height={15} /></button>
          </div>
        ))}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-border py-6 text-center text-[14px] text-muted-foreground">{tr('No teachers added yet.')}</p>}
      </div>
    </div>
  )
}

function InviteBuilder({ items, setItems }: { items: ChipItem[]; setItems: (v: ChipItem[]) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Admin')
  const add = useAdd(items, setItems)
  function submit() { if (!email.trim()) return; add({ name: email.trim(), meta: role }); setEmail('') }
  return (
    <div className="flex flex-col gap-3">
      <form className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr('teammate@campusos.io')} />
        <Select value={role} onChange={(e) => setRole(e.target.value)}><option value="Admin">{tr('Admin')}</option><option value="Academic Manager">{tr('Academic Manager')}</option><option value="Coordinator">{tr('Coordinator')}</option></Select>
        <Button type="submit" variant="primary" icon="plus">{tr('Invite')}</Button>
      </form>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
            <span className="text-muted-foreground"><Icon.inbox width={20} height={20} /></span>
            <span className="flex-1 truncate text-sm font-medium text-foreground">{it.name}</span>
            <Badge tone="primary">{it.meta}</Badge>
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Icon.x width={15} height={15} /></button>
          </div>
        ))}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-border py-6 text-center text-[14px] text-muted-foreground">{tr('Optional: invite teammates now or later from Settings.')}</p>}
      </div>
    </div>
  )
}
