import { useState } from 'react'
import { activityText } from '../lib/activity'
import { t as tr, tp } from '../lib/i18n'
import { Icon } from '../lib/icons'
import { Avatar, Badge, Button, Card, Field, Input, Meter, Modal, PageHeader, Select, Tabs, useToast } from '../lib/ui'
import { StatCard, Td, Th, TableWrap, Toolbar } from '../components/common'
import { useApp } from '../lib/store'
import { useFetch, useLive } from '../lib/live'
import { api, ApiError, downloadReport } from '../lib/api'
import { ClassSubjectsPanel } from './Subjects'
import { ImportModal } from './ImportModal'
import { ClassResultsPanel, StudentReportModal } from './Results'
import type { ImportKind } from '../lib/csv'
import { ConfirmModal, EditClassModal, EditRoomModal, EditTeacherModal, ManualInviteModal, MarkAttendanceModal, StudentsPanel, type RosterStudent } from './Manage'
import { EMPTY } from '../lib/empty'

function statusTone(s: string) {
  return s === 'Overloaded' ? 'danger' : s === 'Heavy' ? 'warn' : s === 'Light' ? 'info' : 'ok'
}

/* ============ TEACHERS ============ */
export function Teachers() {
  const { navigate } = useApp()
  const { push } = useToast()
  const { teachers, act } = useLive()
  const deptsQ = useFetch(() => api.departments())
  const branchesQ = useFetch(() => api.branches())
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [branch, setBranch] = useState('')
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ name: '', email: '', department: '', branch: '', title: 'Teacher', hours: '20' })
  const depts = [...new Set(teachers.map((t) => t.department))]
  const list = teachers.filter((t) => (!q || t.name.toLowerCase().includes(q.toLowerCase())) && (!dept || t.department === dept) && (!branch || t.branch === branch))
  const [manual, setManual] = useState<{ email: string; token: string; error?: string } | null>(null)
  const [importing, setImporting] = useState(false)
  async function submit() {
    const r = await act(() => api.addTeacher({ name: f.name, email: f.email, department: f.department || undefined, branch: f.branch || undefined, title: f.title, weeklyHours: Number(f.hours) || 0 }),
      { reload: ['teachers', 'overview', 'workload'] })
    if (!r) return
    if (r.emailed) push({ title: tr('Invitation emailed'), desc: tr('{name} will receive an onboarding email at {email}.', { name: f.name, email: f.email }), tone: 'ok' })
    else if (r.inviteToken) setManual({ email: f.email, token: r.inviteToken, error: r.emailError })
    else push({ title: tr('Teacher added'), desc: f.name, tone: 'ok' })
    setAdd(false); setF({ name: '', email: '', department: '', branch: '', title: 'Teacher', hours: '20' })
  }

  return (
    <>
      <ManualInviteModal email={manual?.email ?? ''} token={manual?.token ?? null} error={manual?.error} onClose={() => setManual(null)} />
      <ImportModal kind="teachers" open={importing} onClose={() => setImporting(false)} />
      <PageHeader title={tr('Teachers')} subtitle={tp(depts.length, '{staff} staff across {n} department', '{staff} staff across {n} departments', { staff: teachers.length })} actions={<><Button variant="outline" onClick={() => setImporting(true)}>{tr('Import CSV')}</Button><Button icon="download" variant="outline" onClick={() => downloadReport('wl').catch((e) => push({ title: tr('Export failed'), desc: e instanceof ApiError ? e.message : undefined, tone: 'danger' }))}>{tr('Export')}</Button><Button icon="plus" variant="primary" onClick={() => setAdd(true)}>{tr('Add teacher')}</Button></>} />
      <Toolbar>
        <div className="min-w-[220px] flex-1"><Input icon="search" placeholder={tr('Search teachers…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">{tr('All departments')}</option>{depts.map((d) => <option key={d} value={d}>{tr(d)}</option>)}</Select>
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">{tr('All branches')}</option>{(branchesQ.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.name}>{tr(b.name)}</option>)}</Select>
      </Toolbar>

      <TableWrap>
        <thead className="border-b border-border bg-surface-2"><tr>
          <Th>{tr('Teacher')}</Th><Th>{tr('Department')}</Th><Th>{tr('Subjects')}</Th><Th>{tr('Classes')}</Th><Th>{tr('Weekly hours')}</Th><Th>{tr('Attendance')}</Th><Th>{tr('Status')}</Th><Th />
        </tr></thead>
        <tbody className="divide-y divide-border">
          {list.map((t) => (
            <tr key={t.id} className="cursor-pointer hover:bg-muted" onClick={() => navigate('teacher-profile', t.id)}>
              <Td><div className="flex items-center gap-3"><Avatar name={t.name} size={34} /><div><p className="font-semibold">{t.name}</p><p className="text-[12px] text-muted-foreground">{tr(t.role)}</p></div></div></Td>
              <Td className="text-muted-foreground">{tr(t.department)}</Td>
              <Td><div className="flex gap-1">{t.subjects.slice(0, 2).map((s) => <Badge key={s}>{tr(s)}</Badge>)}</div></Td>
              <Td className="tnum">{t.classes}</Td>
              <Td className="tnum">{t.hours}{tr('h')}</Td>
              <Td className="tnum text-muted-foreground">{t.attendanceRate}%</Td>
              <Td><Badge tone={statusTone(t.status) as any} dot>{t.status}</Badge></Td>
              <Td><Icon.chevronRight width={16} height={16} className="text-muted-foreground" /></Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Modal open={add} onClose={() => setAdd(false)} title={tr('Add teacher')} wide
        footer={<><Button variant="ghost" onClick={() => setAdd(false)}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void submit()}>{tr('Send invite')}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('Full name')}><Input placeholder={tr('e.g. Sarah Mensah')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={tr('Work email')}><Input placeholder={tr('name@campusos.io')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={tr('Department')}><Select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">{tr('None')}</option>{(deptsQ.data?.items ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.name}>{tr(d.name)}</option>)}</Select></Field>
          <Field label={tr('Branch')}><Select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">{tr('None')}</option>{(branchesQ.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.name}>{tr(b.name)}</option>)}</Select></Field>
          <Field label={tr('Role')}><Select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}><option value="Teacher">{tr('Teacher')}</option><option value="Senior Teacher">{tr('Senior Teacher')}</option><option value="Coordinator">{tr('Coordinator')}</option></Select></Field>
          <Field label={tr('Weekly hours target')}><Input type="number" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  )
}

/* ============ TEACHER PROFILE ============ */
export function TeacherProfile({ id }: { id?: string }) {
  const { navigate } = useApp()
  const { teachers, classes, assignments, activity, act } = useLive()
  const t = teachers.find((x) => x.id === id) ?? teachers[0]
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const prof = useFetch(() => (t ? api.teacher(t.id) : Promise.resolve(null)), [t?.id])
  if (!t) return <Card className="p-10 text-center text-sm text-muted-foreground">{tr('Loading teacher…')}</Card>
  const myClasses = classes.filter((c) => c.teacher === t.name)
  const myAssign = assignments.filter((a) => a.teacher === t.name)
  const myActivity = activity.filter((a) => a.by === t.name)
  const pct = Math.min(100, (t.hours / 40) * 100)
  const bal: { type: string; allowance: number; remaining: number }[] = prof.data?.leave?.balances ?? []

  return (
    <>
      <button onClick={() => navigate('teachers')} className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground"><Icon.chevronLeft width={16} height={16} /> {tr('Teachers')}</button>

      <Card className="mb-5 overflow-hidden">
        <div className="h-16 border-b border-border bg-muted" />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <div className="-mt-8"><div className="rounded-full border-4 border-card bg-card"><Avatar name={t.name} size={72} /></div></div>
          <div className="flex-1">
            <div className="flex items-center gap-2"><h1 className="font-display text-xl font-bold text-foreground">{t.name}</h1><Badge tone={statusTone(t.status) as any} dot>{t.status}</Badge></div>
            <p className="text-sm text-muted-foreground">{tr(t.role)} · {tr(t.department)} · {tr(t.branch)}</p>
          </div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing(true)}>{tr('Edit')}</Button><Button variant="outline" onClick={() => setArchiving(true)}>{tr('Archive')}</Button><Button variant="outline" icon="megaphone" onClick={() => navigate('announcements')}>{tr('Message')}</Button><Button variant="primary" icon="calendar" onClick={() => navigate('timetable')}>{tr('View schedule')}</Button></div>
        </div>
      </Card>

      <EditTeacherModal teacher={t} open={editing} onClose={() => setEditing(false)} />
      <ConfirmModal open={archiving} onClose={() => setArchiving(false)} title={tr('Archive teacher')} confirmLabel={tr('Archive')}
        message={tr('Archive {name}? They lose access immediately and are removed from the timetable. Teachers with active classes cannot be archived until those classes are reassigned.', { name: t.name })}
        onConfirm={async () => { const r = await act(() => api.archiveTeacher(t.id), { ok: { title: tr('Teacher archived'), desc: t.name }, reload: ['teachers', 'classes', 'overview', 'workload', 'timetable'] }); setArchiving(false); if (r) navigate('teachers') }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Weekly hours')} value={`${t.hours}${tr('h')}`} icon="gauge" sub={tp(t.classes, '{n} class', '{n} classes')} />
        <StatCard label={tr('Attendance activity')} value={`${t.attendanceRate}%`} icon="checkCircle" sub={tr('Marking consistency')} />
        <StatCard label={tr('Students taught')} value={`${myClasses.reduce((a, c) => a + c.students, 0)}`} icon="users" sub={tp(myClasses.length, '{n} class', '{n} classes')} />
        <StatCard label={tr('Assignments')} value={String(myAssign.length)} icon="clipboard" sub={tr('{n} published', { n: myAssign.filter((a) => a.status === 'Published').length })} />
      </div>

      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: tr('Overview') }, { id: 'classes', label: tr('Classes'), count: myClasses.length }, { id: 'schedule', label: tr('Schedule') }, { id: 'activity', label: tr('Activity') }, { id: 'leave', label: tr('Leave') }]} />
        <div className="mt-4">
          {tab === 'overview' && (
            <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <Card className="p-5">
                <h3 className="mb-3 font-display text-[16px] font-semibold text-card-foreground">{tr('Details')}</h3>
                <dl className="flex flex-col gap-3 text-sm">
                  {[['Email', t.email], ['Phone', t.phone], ['Department', tr(t.department)], ['Branch', tr(t.branch)], ['Joined', t.joined], ['Subjects', t.subjects.map((s) => tr(s)).join(', ')]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{tr(k)}</dt><dd className="text-right font-medium text-foreground">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-4 border-t border-border pt-4">
                  <div className="mb-2 flex justify-between text-[14px]"><span className="text-muted-foreground">{tr('Workload capacity')}</span><span className="font-semibold text-foreground">{t.hours}/40{tr('h')}</span></div>
                  <Meter value={pct} tone={statusTone(t.status) as any} />
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-4 font-display text-[16px] font-semibold text-card-foreground">{tr('Activity timeline')}</h3>
                <div className="relative pl-5">
                  <div className="absolute left-[6px] top-1 bottom-1 w-px bg-border" />
                  {myActivity.length === 0 && <p className="text-[14px] text-muted-foreground">{tr('No recent activity.')}</p>}
                  {myActivity.map((a, i) => (
                    <div key={i} className="relative mb-4 last:mb-0">
                      <span className="absolute -left-[15px] top-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                      <p className="text-[14px] text-foreground">{activityText(a.text)}</p>
                      <p className="mt-1 font-mono text-[12px] text-muted-foreground">{a.time}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {tab === 'classes' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myClasses.map((c) => (
                <Card key={c.id} className="cursor-pointer p-4 hover:[--line:var(--border-strong)]" onClick={() => navigate('class-detail', c.id)}>
                  <div className="flex items-center justify-between"><p className="font-display font-semibold text-foreground">{c.name}</p><Badge tone="primary">{tr(c.subject)}</Badge></div>
                  <p className="mt-2 text-[14px] text-muted-foreground">{tp(c.students, '{n} student', '{n} students')} · {c.room}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{c.schedule}</p>
                </Card>
              ))}
            </div>
          )}
          {tab === 'schedule' && (
            <Card className="divide-y divide-border">
              {(prof.data?.schedule ?? []).length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{tr('No sessions scheduled.')}</p>}
              {(prof.data?.schedule ?? []).map((s: { id: string; day: string; start: string; end: string; className: string; subject: string; room: string }) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3"><span className="w-12 font-semibold text-foreground">{tr(s.day)}</span><span className="w-28 font-mono text-[12px] text-muted-foreground tnum">{s.start}–{s.end}</span><p className="flex-1 text-sm text-foreground">{tr(s.subject)} · {s.className}</p><span className="text-[14px] text-muted-foreground">{s.room}</span></div>
              ))}
            </Card>
          )}
          {tab === 'activity' && (
            <Card className="divide-y divide-border">
              {myActivity.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{tr('No recent activity.')}</p>}
              {myActivity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3"><span className="font-mono text-[12px] text-muted-foreground tnum">{a.time}</span><p className="text-sm text-foreground">{activityText(a.text)}</p></div>
              ))}
            </Card>
          )}
          {tab === 'leave' && (
            <Card className="p-5">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">{tr('Leave balance')}</p><Badge tone="ok">{tr('{n} days remaining', { n: bal.reduce((a, b) => a + b.remaining, 0) })}</Badge></div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {bal.map((b) => [tr(b.type.replace(' leave', '')), `${b.remaining} / ${b.allowance}`]).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-[12px] text-muted-foreground">{k}</p><p className="mt-1 font-display text-lg font-bold text-foreground tnum">{v}</p></div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

/* ============ CLASSES ============ */
export function Classes() {
  const { navigate } = useApp()
  const { push } = useToast()
  const { classes, teachers, rooms, subjects, act } = useLive()
  const branchesQ = useFetch(() => api.branches())
  const [importKind, setImportKind] = useState<ImportKind | null>(null)
  const [q, setQ] = useState('')
  const [fSubject, setFSubject] = useState('')
  const [fTeacher, setFTeacher] = useState('')
  const [add, setAdd] = useState(false)
  const blank = { name: '', teacher: '', room: '', branch: '' }
  const [f, setF] = useState(blank)
  const list = classes.filter((c) => (!q || c.name.toLowerCase().includes(q.toLowerCase())) && (!fSubject || c.subjects.some((x) => x.subjectId === fSubject)) && (!fTeacher || c.teacher === fTeacher || c.subjects.some((x) => x.teacher === fTeacher)))
  async function submit() {
    const r = await act(() => api.addClass({ name: f.name, teacher: f.teacher || undefined, room: f.room || undefined, branch: f.branch || undefined }),
      { ok: { title: tr('Class created'), desc: f.name }, reload: ['classes', 'overview', 'workload'] })
    if (r) { setAdd(false); setF(blank) }
  }
  return (
    <>
      {importKind && <ImportModal kind={importKind} open onClose={() => setImportKind(null)} />}
      <PageHeader title={tr('Classes')} subtitle={tp(classes.length, '{n} active class', '{n} active classes')} actions={<><Button variant="outline" onClick={() => setImportKind('classes')}>{tr('Import classes')}</Button><Button variant="outline" onClick={() => setImportKind('students')}>{tr('Import students')}</Button><Button icon="download" variant="outline" onClick={() => downloadReport('cls').catch((e) => push({ title: tr('Export failed'), desc: e instanceof ApiError ? e.message : undefined, tone: 'danger' }))}>{tr('Export')}</Button><Button icon="plus" variant="primary" onClick={() => setAdd(true)}>{tr('Create class')}</Button></>} />
      <Toolbar>
        <div className="min-w-[220px] flex-1"><Input icon="search" placeholder={tr('Search classes…')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={fSubject} onChange={(e) => setFSubject(e.target.value)}><option value="">{tr('Any subject')}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}</Select>
        <Select value={fTeacher} onChange={(e) => setFTeacher(e.target.value)}><option value="">{tr('All teachers')}</option>{teachers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</Select>
      </Toolbar>
      <TableWrap>
        <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Class')}</Th><Th>{tr('Class teacher')}</Th><Th>{tr('Subjects')}</Th><Th>{tr('Students')}</Th><Th>{tr('Schedule')}</Th><Th>{tr('Room')}</Th><Th>{tr('Attendance')}</Th><Th>{tr('Status')}</Th><Th /></tr></thead>
        <tbody className="divide-y divide-border">
          {list.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-muted" onClick={() => navigate('class-detail', c.id)}>
              <Td><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-[14px] font-bold text-primary">{c.name.replace('Form ', '').slice(0, 3)}</span><div><p className="font-semibold">{c.name}</p><p className="text-[12px] text-muted-foreground">{tr(c.branch)}</p></div></div></Td>
              <Td className="text-muted-foreground">{c.teacher}</Td>
              <Td><div className="flex flex-wrap gap-1">{c.subjects.length === 0 ? <span className="text-[12px] text-muted-foreground">{tr('None yet')}</span> : <>{c.subjects.slice(0, 2).map((x) => <Badge key={x.id}>{tr(x.subject)}</Badge>)}{c.subjects.length > 2 && <Badge>+{c.subjects.length - 2}</Badge>}</>}</div></Td>
              <Td className="tnum">{c.students}</Td>
              <Td className="text-muted-foreground">{c.schedule}</Td>
              <Td className="text-muted-foreground">{c.room}</Td>
              <Td><div className="flex items-center gap-2"><Meter value={c.attendance} tone={c.attendance >= 95 ? 'ok' : 'primary'} className="w-16" /><span className="font-mono text-[12px] text-muted-foreground tnum">{c.attendance}%</span></div></Td>
              <Td><Badge tone="ok" dot>{c.status}</Badge></Td>
              <Td><Icon.chevronRight width={16} height={16} className="text-muted-foreground" /></Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Modal open={add} onClose={() => setAdd(false)} title={tr('Create class')} wide footer={<><Button variant="ghost" onClick={() => setAdd(false)}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void submit()}>{tr('Create class')}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('Class name')}><Input placeholder={tr('e.g. Form 4A')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={tr('Class teacher')} hint={tr('The homeroom teacher. Subject teachers are set on the Subjects page.')}><Select value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value="">{tr('Unassigned')}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label={tr('Assign room')}><Select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">{tr('None')}</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label={tr('Branch')}><Select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">{tr('None')}</option>{(branchesQ.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{tr(b.name)}</option>)}</Select></Field>
        </div>
      </Modal>
    </>
  )
}

/* ============ CLASS DETAIL ============ */
export function ClassDetail({ id }: { id?: string }) {
  const { navigate } = useApp()
  const { classes, rooms, act } = useLive()
  const c = classes.find((x) => x.id === id) ?? classes[0]
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [markingAtt, setMarkingAtt] = useState(false)
  const [report, setReport] = useState<{ id: string; name: string } | null>(null)
  const det = useFetch(() => (c ? api.classDetail(c.id) : Promise.resolve(null)), [c?.id])
  if (!c) return <Card className="p-10 text-center text-sm text-muted-foreground">{tr('Loading class…')}</Card>
  const roster: RosterStudent[] = det.data?.roster ?? []
  const recent: { date: string; present: number; absent: number; late: number; rate: number | null }[] = det.data?.recentAttendance ?? []
  const classAssignments: { id: string; title: string; dueDate: string | null; status: string }[] = det.data?.assignments ?? []
  return (
    <>
      <button onClick={() => navigate('classes')} className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground"><Icon.chevronLeft width={16} height={16} /> {tr('Classes')}</button>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="relative flex h-14 w-14 items-center justify-center bg-primary-soft font-display text-lg font-bold text-primary chamfer">{c.name.replace('Form ', '')}</span>
          <div><div className="flex items-center gap-2"><h1 className="font-display text-xl font-bold text-foreground">{c.name}</h1><Badge tone="ok" dot>{c.status}</Badge></div><p className="text-sm text-muted-foreground">{tp(c.subjects.length, '{n} subject', '{n} subjects')} · {tp(c.students, '{n} student', '{n} students')} · {tr(c.branch)}</p></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing(true)}>{tr('Edit')}</Button><Button variant="outline" onClick={() => setArchiving(true)}>{tr('Archive')}</Button><Button variant="outline" icon="calendar" onClick={() => navigate('timetable')}>{tr('Reschedule')}</Button><Button variant="primary" icon="checkCircle" onClick={() => setMarkingAtt(true)}>{tr('Mark attendance')}</Button></div>
      </div>
      <StudentReportModal student={report} onClose={() => setReport(null)} />
      <EditClassModal cls={c} open={editing} onClose={() => setEditing(false)} />
      <MarkAttendanceModal classId={c.id} className={c.name} open={markingAtt} onClose={() => setMarkingAtt(false)} onSaved={det.reload} />
      <ConfirmModal open={archiving} onClose={() => setArchiving(false)} title={tr('Archive class')} confirmLabel={tr('Archive')}
        message={tr('Archive {name}? Its timetable sessions are removed. Students and past attendance are kept.', { name: c.name })}
        onConfirm={async () => { const r = await act(() => api.archiveClass(c.id), { ok: { title: tr('Class archived'), desc: c.name }, reload: ['classes', 'overview', 'workload', 'timetable'] }); setArchiving(false); if (r) navigate('classes') }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Class teacher')} value={c.teacher.split(' ')[0]} icon="user" sub={c.teacher} />
        <StatCard label={tr('Room')} value={c.room.replace('Room ', 'Rm ')} icon="door" sub={tr(rooms.find((r) => r.name === c.room)?.building ?? EMPTY)} />
        <StatCard label={tr('Attendance')} value={`${c.attendance}%`} icon="checkCircle" sub={tr('This term')} />
        <StatCard label={tr('Schedule')} value={c.schedule.split(' · ')[0]} icon="clock" sub={c.schedule.split(' · ')[1]} />
      </div>

      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: tr('Overview') }, { id: 'subjects', label: tr('Subjects'), count: c.subjects.length }, { id: 'students', label: tr('Students'), count: c.students }, { id: 'results', label: tr('Results') }, { id: 'schedule', label: tr('Schedule') }, { id: 'attendance', label: tr('Attendance') }, { id: 'assignments', label: tr('Assignments') }]} />
        <div className="mt-4">
          {tab === 'overview' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5"><h3 className="mb-3 font-display text-[16px] font-semibold text-card-foreground">{tr('Class information')}</h3>
                <dl className="flex flex-col gap-3 text-sm">{[['Class teacher', c.teacher], ['Subjects', c.subjects.map((x) => tr(x.subject)).join(', ') || tr('None yet')], ['Room', c.room], ['Schedule', c.schedule], ['Students', String(c.students)], ['Branch', tr(c.branch)]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{tr(k)}</dt><dd className="font-medium text-foreground">{v}</dd></div>)}</dl>
              </Card>
              <Card className="p-5"><h3 className="mb-4 font-display text-[16px] font-semibold text-card-foreground">{tr('Recent attendance')}</h3>
                <div className="flex flex-col gap-3">{recent.length === 0 && <p className="text-[14px] text-muted-foreground">{tr('No attendance recorded yet.')}</p>}{recent.slice(0, 5).map((a) => <div key={a.date} className="flex gap-3 text-[14px]"><span className="font-mono text-muted-foreground tnum">{a.date.slice(5)}</span><span className="text-foreground">{tr('{rate}% present · {a} absent · {l} late', { rate: a.rate ?? 0, a: a.absent, l: a.late })}</span></div>)}</div>
              </Card>
            </div>
          )}
          {tab === 'subjects' && <ClassSubjectsPanel cls={c} />}
          {tab === 'students' && <StudentsPanel classId={c.id} roster={roster} onChanged={det.reload} onReport={setReport} />}
          {tab === 'results' && <ClassResultsPanel classId={c.id} onReport={setReport} />}
          {tab === 'schedule' && <Card className="p-8 text-center text-sm text-muted-foreground">{tr('{schedule} in {room}.', { schedule: c.schedule, room: c.room })} <button onClick={() => navigate('timetable')} className="font-semibold text-primary hover:underline">{tr('Open the Timetable to edit.')}</button></Card>}
          {tab === 'attendance' && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end"><Button size="sm" variant="primary" icon="checkCircle" onClick={() => setMarkingAtt(true)}>{tr('Mark / edit attendance')}</Button></div>
              <Card className="divide-y divide-border">
                {recent.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{tr('No attendance recorded yet.')}</p>}
                {recent.map((a) => <div key={a.date} className="flex items-center gap-4 px-4 py-3 text-sm"><span className="w-24 font-mono text-[12px] text-muted-foreground tnum">{a.date}</span><span className="flex-1 text-foreground">{tr('{p} present · {a} absent · {l} late', { p: a.present, a: a.absent, l: a.late })}</span><Badge tone={(a.rate ?? 0) >= 92 ? 'ok' : 'warn'}>{a.rate ?? 0}%</Badge></div>)}
              </Card>
            </div>
          )}
          {tab === 'assignments' && (
            <Card className="divide-y divide-border">
              {classAssignments.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{tr('No assignments for {name} yet.', { name: c.name })}</p>}
              {classAssignments.map((a) => <div key={a.id} className="flex items-center gap-4 px-4 py-3 text-sm"><span className="flex-1 font-medium text-foreground">{tr(a.title)}</span><span className="text-[14px] text-muted-foreground">{tr('Due {date}', { date: a.dueDate ?? EMPTY })}</span><Badge>{a.status}</Badge></div>)}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

/* ============ ROOMS ============ */
export function Rooms() {
  const { rooms, act } = useLive()
  const [add, setAdd] = useState(false)
  const [editRoom, setEditRoom] = useState<(typeof rooms)[number] | null>(null)
  const [delRoom, setDelRoom] = useState<(typeof rooms)[number] | null>(null)
  const blank = { name: '', capacity: '30', building: '', type: 'Classroom' }
  const [f, setF] = useState(blank)
  async function submit() {
    const r = await act(() => api.addRoom({ name: f.name, capacity: Number(f.capacity) || 30, building: f.building || undefined, type: f.type }), { ok: { title: tr('Room added'), desc: f.name }, reload: ['rooms'] })
    if (r) { setAdd(false); setF(blank) }
  }
  const tone = { Occupied: 'danger', Available: 'ok', Maintenance: 'warn' } as const
  return (
    <>
      <PageHeader title={tr('Rooms')} subtitle={tr('Live availability and utilization across all buildings.')} actions={<Button icon="plus" variant="primary" onClick={() => setAdd(true)}>{tr('Add room')}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Total rooms')} value={String(rooms.length)} icon="door" />
        <StatCard label={tr('Occupied now')} value={String(rooms.filter((r) => r.status === 'Occupied').length)} deltaTone="neutral" icon="user" />
        <StatCard label={tr('Available')} value={String(rooms.filter((r) => r.status === 'Available').length)} icon="checkCircle" />
        <StatCard label={tr('Avg utilization')} value={rooms.length ? `${Math.round(rooms.reduce((a, r) => a + r.utilization, 0) / rooms.length)}%` : EMPTY} icon="gauge" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((r) => (
          <Card key={r.id} className="p-4 hover:[--line:var(--border-strong)]">
            <div className="flex items-start justify-between">
              <div><p className="font-display font-semibold text-foreground">{r.name}</p><p className="text-[12px] text-muted-foreground">{tr(r.building)} · {tr(r.type)}</p></div>
              <Badge tone={tone[r.status]} dot>{r.status}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between text-[14px]"><span className="text-muted-foreground">{tr('Capacity')}</span><span className="font-semibold text-foreground tnum">{tr('{n} seats', { n: r.capacity })}</span></div>
            <div className="mt-3"><div className="mb-1 flex justify-between text-[12px]"><span className="text-muted-foreground">{tr('Utilization')}</span><span className="font-mono text-muted-foreground tnum">{r.utilization}%</span></div><Meter value={r.utilization} tone={r.utilization > 80 ? 'danger' : r.utilization > 60 ? 'warn' : 'ok'} /></div>
            <div className="mt-3 flex gap-2 border-t border-border pt-3"><Button size="sm" variant="outline" onClick={() => setEditRoom(r)}>{tr('Edit')}</Button><Button size="sm" variant="ghost" onClick={() => setDelRoom(r)}>{tr('Delete')}</Button></div>
          </Card>
        ))}
      </div>
      {editRoom && <EditRoomModal room={editRoom} open onClose={() => setEditRoom(null)} />}
      <ConfirmModal open={!!delRoom} onClose={() => setDelRoom(null)} title={tr('Delete room')} confirmLabel={tr('Delete')}
        message={tr('Delete {name}? Rooms still used in the timetable cannot be deleted. Move those sessions first.', { name: delRoom?.name ?? tr('this room') })}
        onConfirm={async () => { if (delRoom) await act(() => api.deleteRoom(delRoom.id), { ok: { title: tr('Room deleted'), desc: delRoom.name }, reload: ['rooms', 'classes'] }); setDelRoom(null) }} />
      <Modal open={add} onClose={() => setAdd(false)} title={tr('Add room')} footer={<><Button variant="ghost" onClick={() => setAdd(false)}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void submit()}>{tr('Add room')}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('Room name')}><Input placeholder={tr('e.g. Lab 301')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={tr('Capacity')}><Input type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <Field label={tr('Building')}><Input placeholder={tr('e.g. Block B')} value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })} /></Field>
          <Field label={tr('Type')}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['Classroom', 'Laboratory', 'Computer Lab', 'Auditorium', 'Library', 'Gym', 'Other'].map((t) => <option key={t} value={t}>{tr(t)}</option>)}</Select></Field>
        </div>
      </Modal>
    </>
  )
}
