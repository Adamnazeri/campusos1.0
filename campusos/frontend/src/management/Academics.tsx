import { useEffect, useState } from 'react'
import { t as tr, tp } from '../lib/i18n'
import { Icon } from '../lib/icons'
import { Avatar, Badge, Button, Card, cx, Field, Input, Meter, Modal, PageHeader, Select, Tabs, useToast } from '../lib/ui'
import { Td, Th, TableWrap, StatCard } from '../components/common'
import type { LeaveReq, SubstitutionItem, Task } from '../lib/data'
import { api, monthOf } from '../lib/api'
import { useFetch, useLive } from '../lib/live'
import { SubjectPicker } from './Subjects'
import { ResultsModal } from './Results'
import { EMPTY } from '../lib/empty'

/* ---------- modal semak & tanda penyerahan tugasan pelajar ---------- */
export function AssignmentSubmissionsModal({ assignmentId, open, onClose }: { assignmentId: string | null; open: boolean; onClose: () => void }) {
  const { act } = useLive()
  const subQ = useFetch(() => (open && assignmentId ? api.assignmentSubmissions(assignmentId) : Promise.resolve(null)), [open, assignmentId])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'Draft' | 'Published' | 'Completed'>('Published')

  useEffect(() => {
    if (subQ.data) {
      setChecked(new Set(subQ.data.students.filter((s) => s.submitted).map((s) => s.id)))
      setStatus(subQ.data.assignment.status)
    }
  }, [subQ.data])

  const a = subQ.data?.assignment
  const students = subQ.data?.students ?? []
  const toggle = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  async function save() {
    if (!assignmentId || !a) return
    const r = await act(async () => {
      if (status !== a.status) await api.patchAssignment(assignmentId, { status })
      const effectiveStatus = status !== a.status ? status : a.status
      if (effectiveStatus !== 'Draft') {
        await api.saveSubmissions(assignmentId, [...checked], true)
      }
      return true
    }, { ok: { title: tr('Assignment updated'), desc: tr('{n}/{total} submitted', { n: checked.size, total: students.length }) }, reload: ['assignments', 'overview', 'dash'] })
    if (r) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={a ? `${tr(a.title)} · ${a.className}` : 'Assignment submissions'} wide
      footer={<><Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button><Button variant="primary" disabled={!a} onClick={() => void save()}>{tr('Save changes')}</Button></>}>
      {!a ? <p className="py-8 text-center text-sm text-muted-foreground">{tr('Loading…')}</p> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{tr(a.subject ?? 'General')} · {tr('Due {date}', { date: a.due ?? EMPTY })}</p>
              <p className="text-[12px] text-muted-foreground">{tr('{n} of {total} students submitted', { n: checked.size, total: students.length })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as 'Draft' | 'Published' | 'Completed')}>
                <option value="Draft">{tr('Draft')}</option>
                <option value="Published">{tr('Published')}</option>
                <option value="Completed">{tr('Completed')}</option>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setChecked(new Set(students.map((s) => s.id)))}>{tr('Select all')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>{tr('Clear')}</Button>
            </div>
          </div>
          {status === 'Draft' && <p className="rounded-lg bg-warn-soft p-3 text-[12px] text-foreground">{tr('This assignment is currently a draft. Switch status to Published above to record student submissions.')}</p>}
          {students.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{tr('No students in this class yet.')}</p> : (
            <Card className="max-h-[48vh] divide-y divide-border overflow-y-auto">
              {students.map((s, i) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted">
                  <span className="w-6 font-mono text-[12px] text-muted-foreground tnum">{String(i + 1).padStart(2, '0')}</span>
                  <input type="checkbox" disabled={status === 'Draft'} checked={checked.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="flex-1 text-sm font-medium text-foreground">{s.name}{s.studentCode ? ` (${s.studentCode})` : ''}</span>
                  <Badge tone={checked.has(s.id) ? 'ok' : 'neutral'}>{checked.has(s.id) ? 'Submitted' : 'Pending'}</Badge>
                </label>
              ))}
            </Card>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ============ ASSIGNMENTS ============ */
export function Assignments() {
  const { assignments: ASSIGN, classes, act } = useLive()
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(false)
  const [subFor, setSubFor] = useState<string | null>(null)
  const [f, setF] = useState({ title: '', classId: '', subject: '', due: '', status: 'Draft' })
  async function submit() {
    const r = await act(() => api.addAssignment({ title: f.title, classId: f.classId, subject: f.subject || undefined, due: f.due || undefined, status: f.status }), { ok: { title: tr('Assignment created'), desc: f.title }, reload: ['assignments'] })
    if (r) { setOpen(false); setF({ title: '', classId: '', subject: '', due: '', status: 'Draft' }) }
  }
  const tabs = [
    { id: 'all', label: tr('All'), count: ASSIGN.length },
    { id: 'Published', label: tr('Published'), count: ASSIGN.filter((a) => a.status === 'Published').length },
    { id: 'Draft', label: tr('Draft'), count: ASSIGN.filter((a) => a.status === 'Draft').length },
    { id: 'Completed', label: tr('Completed'), count: ASSIGN.filter((a) => a.status === 'Completed').length },
  ]
  const list = ASSIGN.filter((a) => tab === 'all' || a.status === tab)
  const tone = { Published: 'primary', Draft: 'neutral', Completed: 'ok' } as const
  return (
    <>
      <PageHeader title={tr('Assignments')} subtitle={tr('Click any assignment to record student submissions or update its status.')} actions={<Button icon="plus" variant="primary" onClick={() => setOpen(true)}>{tr('New assignment')}</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <AssignmentSubmissionsModal assignmentId={subFor} open={!!subFor} onClose={() => setSubFor(null)} />
      <Modal open={open} onClose={() => setOpen(false)} title={tr('New assignment')} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void submit()}>{tr('Create')}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={tr('Title')}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tr('e.g. Problem Set 5')} /></Field></div>
          <Field label={tr('Class')}><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, subject: '' })}><option value="">{tr('Select a class…')}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <SubjectPicker classId={f.classId} value={f.subject} onChange={(v) => setF((x) => ({ ...x, subject: v }))} />
          <Field label={tr('Due date')}><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          <Field label={tr('Status')}><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="Draft">{tr('Draft')}</option><option value="Published">{tr('Published')}</option></Select></Field>
        </div>
      </Modal>
      <div className="mt-4">
        <TableWrap>
          <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Assignment')}</Th><Th>{tr('Class')}</Th><Th>{tr('Teacher')}</Th><Th>{tr('Due')}</Th><Th>{tr('Submissions')}</Th><Th>{tr('Status')}</Th><Th /></tr></thead>
          <tbody className="divide-y divide-border">
            {list.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-muted" onClick={() => setSubFor(a.id)}>
                <Td><div><p className="font-semibold">{tr(a.title)}</p><p className="text-[12px] text-muted-foreground">{tr(a.subject)}</p></div></Td>
                <Td className="text-muted-foreground">{a.className}</Td>
                <Td className="text-muted-foreground">{a.teacher}</Td>
                <Td className="text-muted-foreground">{a.due}</Td>
                <Td><div className="flex items-center gap-2"><Meter value={a.total ? (a.submitted / a.total) * 100 : 0} tone={a.total && a.submitted === a.total ? 'ok' : 'primary'} className="w-20" /><span className="font-mono text-[12px] text-muted-foreground tnum">{a.submitted}/{a.total}</span></div></Td>
                <Td><Badge tone={tone[a.status]} dot>{a.status}</Badge></Td>
                <Td><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSubFor(a.id) }}>{tr('Submissions')}</Button></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </>
  )
}

/* ============ EXAMS ============ */
export function Exams() {
  const { exams: EXAMS, classes, rooms, teachers, act, user } = useLive()
  const [open, setOpen] = useState(false)
  const [marksFor, setMarksFor] = useState<string | null>(null)
  const blank = { title: '', classId: '', subject: '', date: '', time: '09:00', room: '', invigilator: '', maxMark: '100', passPct: '40' }
  const [f, setF] = useState(blank)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = EXAMS.filter((e) => e.status === 'Scheduled' && e.rawDate >= today)
  async function submit() {
    const r = await act(() => api.addExam({ title: f.title, classId: f.classId, subject: f.subject || undefined, date: f.date, time: f.time, room: f.room || undefined, invigilator: f.invigilator || undefined, maxMark: Number(f.maxMark) || 100, passPct: Number(f.passPct) }),
      { ok: { title: tr('Exam scheduled'), desc: f.title }, reload: ['exams'] })
    if (r) { setOpen(false); setF(blank) }
  }
  const tone = { Scheduled: 'primary', Grading: 'warn', Completed: 'ok' } as const
  return (
    <>
      <PageHeader title={tr('Exams')} subtitle={tr('Exam timetable, invigilation and grading status.')} actions={<Button icon="plus" variant="primary" onClick={() => setOpen(true)}>{tr('Schedule exam')}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Upcoming exams')} value={String(upcoming.length)} icon="calendar" sub={tr('Scheduled')} />
        <StatCard label={tr('Awaiting grading')} value={String(EXAMS.filter((e) => e.status === 'Grading').length)} deltaTone="neutral" icon="clock" />
        <StatCard label={tr('Completed')} value={String(EXAMS.filter((e) => e.status === 'Completed').length)} icon="checkCircle" />
        <StatCard label={tr('Invigilators')} value={String(new Set(EXAMS.map((e) => e.invigilator).filter((x) => x !== EMPTY)).size)} icon="users" sub={tr('Assigned this cycle')} />
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={tr('Schedule exam')} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void submit()}>{tr('Schedule')}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={tr('Title')}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tr('e.g. Mathematics Mid-Term')} /></Field></div>
          <Field label={tr('Class')}><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">{tr('Select a class…')}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label={tr('Room')}><Select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">{tr('None')}</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label={tr('Date')}><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={tr('Time')}><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label={tr('Full marks')}><Input type="number" min={1} max={1000} value={f.maxMark} onChange={(e) => setF({ ...f, maxMark: e.target.value })} /></Field>
          <Field label={tr('Pass mark (%)')}><Input type="number" min={0} max={100} value={f.passPct} onChange={(e) => setF({ ...f, passPct: e.target.value })} /></Field>
          <Field label={tr('Invigilator')}><Select value={f.invigilator} onChange={(e) => setF({ ...f, invigilator: e.target.value })}><option value="">{tr('None')}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
      </Modal>
      {marksFor && <ResultsModal examId={marksFor} open isAdmin={user.permissions.includes('exams:manage')} onClose={() => setMarksFor(null)} />}
      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Examination calendar')}</h2></div>
        <div className="divide-y divide-border">
          {EXAMS.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{tr('No exams scheduled.')}</p>}
          {EXAMS.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="flex w-14 flex-col items-center rounded-lg bg-primary-soft py-2 text-primary"><span className="text-[12px] font-semibold uppercase">{monthOf(e.rawDate)}</span><span className="font-display text-lg font-bold leading-none tnum">{e.date.split(' ')[0]}</span></div>
              <div className="min-w-[180px] flex-1"><p className="font-semibold text-foreground">{tr(e.title)}</p><p className="text-[12px] text-muted-foreground">{e.className} · {tr(e.subject)}</p></div>
              <div className="flex items-center gap-2 text-[14px] text-muted-foreground"><Icon.clock width={14} height={14} /> {e.time}</div>
              <div className="flex items-center gap-2 text-[14px] text-muted-foreground"><Icon.mapPin width={14} height={14} /> {e.room}</div>
              <div className="flex items-center gap-2"><Avatar name={e.invigilator} size={26} /><span className="text-[14px] text-muted-foreground">{e.invigilator.split(' ')[0]}</span></div>
              <Badge tone={tone[e.status]} dot>{e.status}</Badge>
              {e.rawDate <= today ? <Button size="sm" variant={e.status === 'Completed' ? 'outline' : 'primary'} onClick={() => setMarksFor(e.id)}>{e.status === 'Completed' ? tr('Results') : tr('Marks {done}/{total}', { done: e.resultsEntered, total: e.classStudents })}</Button> : <span className="w-[88px]" />}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

/* ============ LEAVE & RELIEF COVERAGE ============ */
export function Leave() {
  const { push } = useToast()
  const { leave: items, overview, act, refresh } = useLive()
  const [tab, setTab] = useState('Pending')
  const [reliefDate, setReliefDate] = useState(() => overview?.date ?? new Date().toISOString().slice(0, 10))
  const subsQ = useFetch(() => api.substitutions(reliefDate), [reliefDate])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const list = items.filter((l) => l.status === tab)

  async function decide(l: LeaveReq, status: 'Approved' | 'Rejected') {
    const r = await act(() => api.decideLeave(l.id, status), { reload: ['leave', 'overview'] })
    if (!r) return
    subsQ.reload()
    push({ title: tr(status === 'Approved' ? 'Leave approved' : 'Leave rejected'), desc: `${l.teacher}: ${tr(l.type)}`, tone: status === 'Approved' ? 'ok' : 'danger',
      action: { label: tr('Undo'), onClick: () => { void act(() => api.reopenLeave(l.id), { reload: ['leave', 'overview'] }).then(() => subsQ.reload()); void refresh('leave') } } })
  }
  async function assignSub(item: SubstitutionItem) {
    const teacherId = picked[item.sessionId] ?? item.substituteTeacherId ?? item.availableTeachers[0]?.id
    if (!teacherId) return
    const r = await act(() => api.assignSubstitute(item.sessionId, { date: reliefDate, substituteTeacherId: teacherId }),
      { ok: { title: tr('Relief teacher assigned'), desc: `${item.className} (${item.start}–${item.end})` }, reload: ['overview'] })
    if (r) subsQ.reload()
  }
  async function removeSub(item: SubstitutionItem) {
    await act(() => api.removeSubstitute(item.sessionId, reliefDate),
      { ok: { title: tr('Relief assignment removed') }, reload: ['overview'] })
    subsQ.reload()
  }

  const tone = { Pending: 'warn', Approved: 'ok', Rejected: 'danger' } as const
  const subsItems = subsQ.data?.items ?? []
  const uncoveredCount = subsQ.data?.counts.uncovered ?? 0

  return (
    <>
      <PageHeader title={tr('Leave & relief management')} subtitle={tr('Review leave requests and assign relief (substitute) teachers for affected classes.')} actions={<Button icon="calendar" variant="outline" onClick={() => setTab('Relief')}>{tr('Relief coverage')}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Pending requests')} value={String(items.filter((l) => l.status === 'Pending').length)} deltaTone="neutral" icon="clock" />
        <StatCard label={tr('Approved')} value={String(items.filter((l) => l.status === 'Approved').length)} icon="checkCircle" />
        <StatCard label={tr('On leave today')} value={String(overview?.stats.teachersOnLeave ?? 0)} icon="plane" sub={tr('Approved absences')} />
        <StatCard label={tr('Classes needing relief')} value={String(uncoveredCount)} deltaTone={uncoveredCount > 0 ? 'danger' : 'neutral'} icon="users" sub={tr('For {date}', { date: reliefDate })} />
      </div>
      <div className="mt-5"><Tabs value={tab} onChange={setTab} tabs={[
        { id: 'Pending', label: tr('Pending'), count: items.filter((l) => l.status === 'Pending').length },
        { id: 'Approved', label: tr('Approved'), count: items.filter((l) => l.status === 'Approved').length },
        { id: 'Rejected', label: tr('Rejected'), count: items.filter((l) => l.status === 'Rejected').length },
        { id: 'Relief', label: tr('Relief coverage'), count: subsItems.length },
      ]} /></div>

      {tab === 'Relief' ? (
        <div className="mt-4 flex flex-col gap-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{tr('Relief teacher schedule ({day})', { day: tr(subsQ.data?.day ?? '') })}</p>
              <p className="text-[12px] text-muted-foreground">{tr('Automatically lists classes whose teacher is on approved leave on the selected date and filters available teachers without timetable clashes.')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">{tr('Date:')}</span>
              <Input type="date" className="w-40" value={reliefDate} onChange={(e) => setReliefDate(e.target.value)} />
            </div>
          </Card>
          {subsItems.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">{tr('No classes require a relief teacher on {date}.', { date: reliefDate })}</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {subsItems.map((item) => {
                const currentPick = picked[item.sessionId] ?? item.substituteTeacherId ?? item.availableTeachers[0]?.id ?? ''
                return (
                  <Card key={item.sessionId} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="w-24 font-mono text-[14px] font-semibold text-foreground tnum">{item.start}–{item.end}</div>
                    <div className="min-w-[180px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{item.className} · {tr(item.subject ?? 'Session')}</p>
                        <Badge tone={item.status === 'Covered' ? 'ok' : 'danger'} dot>{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {tr('Regular teacher:')} <b>{item.originalTeacher ?? EMPTY}</b> ({tr(item.reason)}){item.room ? ` · ${item.room}` : ''}
                      </p>
                      {item.substituteTeacher && (
                        <p className="mt-1 text-[12px] font-medium text-ok">{tr('Assigned relief:')} {item.substituteTeacher}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={currentPick} onChange={(e) => setPicked({ ...picked, [item.sessionId]: e.target.value })}>
                        {item.availableTeachers.length === 0 && <option value="">{tr('No free teachers')}</option>}
                        {item.availableTeachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.hours}{tr('h/wk')})</option>
                        ))}
                      </Select>
                      <Button size="sm" variant="primary" disabled={!currentPick} onClick={() => void assignSub(item)}>
                        {item.status === 'Covered' ? 'Update relief' : 'Assign relief'}
                      </Button>
                      {item.status === 'Covered' && (
                        <Button size="sm" variant="ghost" onClick={() => void removeSub(item)}>{tr('Clear')}</Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {list.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">{tr('No {status} requests.', { status: tr(tab).toLowerCase() })}</Card>}
          {list.map((l) => (
            <Card key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <Avatar name={l.teacher} size={42} />
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2"><p className="font-semibold text-foreground">{l.teacher}</p><Badge tone={tone[l.status]} dot>{l.type}</Badge></div>
                <p className="mt-1 text-[14px] text-muted-foreground">{tr(l.reason)}</p>
              </div>
              <div className="text-right"><p className="text-[14px] font-semibold text-foreground">{l.from} → {l.to}</p><p className="text-[12px] text-muted-foreground">{tp(l.days, '{n} day', '{n} days')}</p></div>
              {l.status === 'Pending' && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void decide(l, 'Rejected')}>{tr('Reject')}</Button><Button size="sm" variant="primary" onClick={() => void decide(l, 'Approved')}>{tr('Approve')}</Button></div>}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

/* ============ TASKS (kanban) ============ */
export function Tasks() {
  const { tasks: items, teachers, act } = useLive()
  const [open, setOpen] = useState(false)
  const blank = { title: '', assignee: '', due: '', priority: 'Medium' }
  const [f, setF] = useState(blank)
  async function create() {
    const r = await act(() => api.addTask({ title: f.title, assignee: f.assignee || undefined, due: f.due || undefined, priority: f.priority }), { ok: { title: tr('Task created'), desc: f.title }, reload: ['tasks', 'overview'] })
    if (r) { setOpen(false); setF(blank) }
  }
  const cols: Task['status'][] = ['To Do', 'In Progress', 'Completed']
  const colTone = { 'To Do': 'neutral', 'In Progress': 'info', Completed: 'ok' } as const
  const prTone = { High: 'danger', Medium: 'warn', Low: 'neutral' } as const
  function advance(t: Task) {
    const next = t.status === 'To Do' ? 'In Progress' : 'Completed'
    void act(() => api.advanceTask(t.id), { ok: { title: tr('Task updated'), desc: tr('Moved to {status}.', { status: tr(next) }) }, reload: ['tasks', 'overview'] })
  }
  return (
    <>
      <PageHeader title={tr('Tasks')} subtitle={tr('Operational tasks assigned across staff.')} actions={<Button icon="plus" variant="primary" onClick={() => setOpen(true)}>{tr('New task')}</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title={tr('New task')} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void create()}>{tr('Create')}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={tr('Task')}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tr('What needs doing?')} /></Field></div>
          <Field label={tr('Assign to')}><Select value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">{tr('Unassigned')}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label={tr('Due date')}><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          <Field label={tr('Priority')}><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="High">{tr('High')}</option><option value="Medium">{tr('Medium')}</option><option value="Low">{tr('Low')}</option></Select></Field>
        </div>
      </Modal>
      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((col) => {
          const list = items.filter((t) => t.status === col)
          return (
            <div key={col} className="relative bg-surface-2/60 p-3 chamfer [--line:var(--border)]">
              <div className="mb-3 flex items-center gap-2 px-1"><Badge tone={colTone[col]} dot>{col}</Badge><span className="ml-auto font-mono text-[12px] text-muted-foreground tnum">{list.length}</span></div>
              <div className="flex flex-col gap-3">
                {list.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="mb-2 flex items-center justify-between"><Badge tone={prTone[t.priority]}>{t.priority}</Badge><span className="text-[12px] text-muted-foreground">{tr('Due {date}', { date: t.due })}</span></div>
                    <p className={cx('text-[14px] font-medium leading-snug', t.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-foreground')}>{tr(t.title)}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2"><Avatar name={t.assignee} size={22} /><span className="text-[12px] text-muted-foreground">{t.assignee.split(' ')[0]}</span></div>
                      {t.status !== 'Completed' && <button onClick={() => advance(t)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary-soft">{tr('Move →')}</button>}
                    </div>
                  </Card>
                ))}
                {list.length === 0 && <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">{tr('Nothing here.')}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ============ ANNOUNCEMENTS ============ */
export function Announcements() {
  const { announcements: items, reach, act, refresh } = useLive()
  const branchesQ = useFetch(() => api.branches())
  const deptsQ = useFetch(() => api.departments())
  const [compose, setCompose] = useState(false)
  const blank = { title: '', audience: 'all|', tag: 'General', body: '' }
  const [f, setF] = useState(blank)
  async function send(status: 'Published' | 'Draft') {
    const [audienceType, audienceValue] = f.audience.split('|')
    const r = await act(() => api.addAnnouncement({ title: f.title, body: f.body, tag: f.tag, audienceType, audienceValue: audienceValue || undefined, status }),
      { ok: { title: status === 'Published' ? 'Announcement published' : 'Draft saved', desc: status === 'Published' ? 'Delivered to selected audience.' : undefined }, reload: ['announcements', 'reach', 'overview'] })
    if (r) { setCompose(false); setF(blank) }
  }
  const tagTone = { General: 'neutral', Schedule: 'info', Emergency: 'danger', Meeting: 'primary' } as const
  return (
    <>
      <PageHeader title={tr('Announcements')} subtitle={tr('Broadcast to your whole organization or targeted groups.')} actions={<Button icon="plus" variant="primary" onClick={() => setCompose(true)}>{tr('New announcement')}</Button>} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          {items.map((a) => (
            <Card key={a.id} className="cursor-pointer p-4" onClick={() => { if (!a.read) void api.readAnnouncement(a.id).then(() => refresh('announcements')) }}>
              <div className="flex items-center gap-2"><Badge tone={tagTone[a.tag]} dot>{a.tag}</Badge>{!a.read && <span className="h-2 w-2 rounded-full bg-accent" aria-label={tr('Unread')} />}<span className="ml-auto text-[12px] text-muted-foreground">{a.time}</span></div>
              <h3 className="mt-2 font-display text-[16px] font-semibold text-card-foreground">{tr(a.title)}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{tr(a.body)}</p>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground"><Icon.megaphone width={13} height={13} /> {tr(a.audience)}<span className="text-border-strong">·</span> {tr(a.author)}</div>
            </Card>
          ))}
        </div>
        <Card className="h-fit p-5">
          <h3 className="mb-3 font-display text-[16px] font-semibold text-card-foreground">{tr('Delivery reach')}</h3>
          <div className="flex flex-col gap-3">
            {reach.map((r, i) => (
              <div key={r.label}><div className="mb-1 flex justify-between text-[14px]"><span className="text-muted-foreground">{tr(r.label)}</span><span className="font-mono text-muted-foreground tnum">{tp(r.count, '{n} recipient', '{n} recipients')}</span></div><Meter value={reach[0]?.count ? (r.count / reach[0].count) * 100 : 0} tone={(['ok', 'primary', 'info', 'warn'] as const)[i % 4] as any} /></div>
            ))}
          </div>
        </Card>
      </div>
      <Modal open={compose} onClose={() => setCompose(false)} title={tr('New announcement')} wide footer={<><Button variant="ghost" onClick={() => void send('Draft')}>{tr('Save draft')}</Button><Button variant="primary" onClick={() => void send('Published')}>{tr('Publish')}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label={tr('Title')}><Input placeholder={tr('What\'s the announcement?')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr('Audience')}><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              <option value="all|">{tr('Entire organization')}</option>
              {(branchesQ.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={`branch|${b.id}`}>{tr(b.name)}</option>)}
              {(deptsQ.data?.items ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={`department|${d.id}`}>{tr('{name} dept.', { name: tr(d.name) })}</option>)}
              <option value="role|teacher">{tr('Teachers')}</option><option value="role|coordinator">{tr('Coordinators')}</option>
            </Select></Field>
            <Field label={tr('Type')}><Select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}><option value="General">{tr('General')}</option><option value="Schedule">{tr('Schedule')}</option><option value="Meeting">{tr('Meeting')}</option><option value="Emergency">{tr('Emergency')}</option></Select></Field>
          </div>
          <Field label={tr('Message')}><textarea rows={4} className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={tr('Write your message…')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  )
}
