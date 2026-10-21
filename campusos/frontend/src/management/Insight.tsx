import { useEffect, useState } from 'react'
import { t as tr, tp } from '../lib/i18n'
import { Icon, type IconName } from '../lib/icons'
import { Badge, Button, Card, cx, Field, Input, PageHeader, Select, Tabs, useToast } from '../lib/ui'
import { StatCard, TableWrap, Td, Th } from '../components/common'
import { LineChart, BarChart, Donut } from '../components/Charts'
import { api, ApiError, downloadReport, fmtDay, getSession, setSession } from '../lib/api'
import { useFetch, useLive } from '../lib/live'
import { useApp } from '../lib/store'
import { useSession } from '../lib/session'
import { RecoveryCodes, UsersPanel } from './Manage'
import { scaleError } from '../lib/grades'
import { ShareAppCard } from '../components/InstallCard'
import { EMPTY } from '../lib/empty'

const errText = (e: unknown) => (e instanceof ApiError ? e.message : tr('Something went wrong'))
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/* ============ REPORTS ============ */
const REPORT_ICONS: Record<string, IconName> = { att: 'checkCircle', wl: 'gauge', cls: 'book', tt: 'calendar', room: 'door', leave: 'plane', asg: 'clipboard', exam: 'award' }
export function Reports() {
  const { push } = useToast()
  const list = useFetch(() => api.reports())
  const branches = useFetch(() => api.branches())
  const depts = useFetch(() => api.departments())
  const [sel, setSel] = useState('att')
  const [range, setRange] = useState('month')
  const [branch, setBranch] = useState('')
  const [dept, setDept] = useState('')
  const [preview, setPreview] = useState<{ columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const reports = list.data?.items ?? []
  const active = reports.find((r) => r.id === sel) ?? reports[0]
  const A = Icon[REPORT_ICONS[active?.id ?? 'att'] ?? 'file']

  function params() {
    const to = new Date(), from = new Date()
    from.setDate(to.getDate() - (range === 'week' ? 7 : range === 'month' ? 30 : 90))
    const p: Record<string, string> = { from: isoDay(from), to: isoDay(range === 'week' || range === 'month' || range === 'term' ? to : to) }
    if (branch) p.branch = branch
    if (dept) p.department = dept
    return p
  }
  async function generate() {
    if (!active) return
    setBusy(true)
    try { await downloadReport(active.id, params()); push({ title: tr('Report downloaded'), desc: `${tr(active.title)} (CSV).`, tone: 'ok' }) }
    catch (e) { push({ title: tr('Report failed'), desc: errText(e), tone: 'danger' }) }
    finally { setBusy(false) }
  }
  async function doPreview() {
    if (!active) return
    setBusy(true)
    try { setPreview(await api.reportJson(active.id, params()) as never) }
    catch (e) { push({ title: tr('Preview failed'), desc: errText(e), tone: 'danger' }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={tr('Reports')} subtitle={tr('Generate and export operational reports as CSV.')} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          {reports.map((r) => {
            const I = Icon[REPORT_ICONS[r.id] ?? 'file']
            return (
              <button key={r.id} onClick={() => { setSel(r.id); setPreview(null) }} className={cx('relative chamfer flex flex-col items-start gap-2 p-4 pr-10 text-left ', sel === r.id ? '[--line:var(--border-strong)] bg-primary-soft' : '[--line:var(--border)] bg-card hover:[--line:var(--border-strong)]')} aria-pressed={sel === r.id}>
                {sel === r.id && <Icon.check width={16} height={16} className="absolute right-3 top-3 text-foreground" />}
                <span className={cx(sel === r.id ? 'text-foreground' : 'text-muted-foreground')}><I width={18} height={18} /></span>
                <span className="text-[14px] font-semibold text-foreground">{tr(r.title)}</span>
                <span className="text-[12px] leading-tight text-muted-foreground">{tr(r.desc)}</span>
              </button>
            )
          })}
        </div>
        <Card className="h-fit p-5">
          {active && (
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="inline-flex shrink-0 items-center justify-center text-foreground"><A width={22} height={22} /></span>
              <div><h2 className="font-display text-lg font-semibold text-card-foreground">{tr(active.title)}</h2><p className="text-[14px] text-muted-foreground">{tr(active.desc)}</p></div>
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={tr('Date range')}><Select value={range} onChange={(e) => setRange(e.target.value)}><option value="week">{tr('Last 7 days')}</option><option value="month">{tr('Last 30 days')}</option><option value="term">{tr('Last 90 days')}</option></Select></Field>
            <Field label={tr('Branch')}><Select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">{tr('All branches')}</option>{(branches.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{tr(b.name)}</option>)}</Select></Field>
            <Field label={tr('Department')}><Select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">{tr('All departments')}</option>{(depts.data?.items ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.id}>{tr(d.name)}</option>)}</Select></Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" icon="download" disabled={busy} onClick={() => void generate()}>{tr('Download CSV')}</Button>
            <Button variant="outline" icon="file" disabled={busy} onClick={() => void doPreview()}>{tr('Preview')}</Button>
          </div>
          {preview && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-2"><tr>{preview.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left font-mono text-[12px] uppercase tracking-wider text-muted-foreground">{tr(c.label)}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.slice(0, 8).map((r, i) => <tr key={i}>{preview.columns.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 text-foreground">{tr(String(r[c.key] ?? EMPTY))}</td>)}</tr>)}
                  {preview.rows.length === 0 && <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={preview.columns.length}>{tr('No data for this period.')}</td></tr>}
                </tbody>
              </table>
              {preview.total > 8 && <p className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">{tr('Showing 8 of {n} rows. Download the CSV for everything.', { n: preview.total })}</p>}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

/* ============ ANALYTICS ============ */
export function Analytics() {
  const [range, setRange] = useState('term')
  const { data: a, loading, error } = useFetch(() => api.analytics(range), [range])
  const trend = (a?.attendanceTrend ?? []).filter((t: { rate: number | null }) => t.rate !== null).map((t: { date: string; rate: number }) => ({ x: t.date, y: t.rate }))
  const examTrend = (a?.examTrend ?? []).map((e: { date: string; value: number; title: string; subject: string | null; marks: number }) => ({ x: e.date, y: e.value, note: `${e.title}${e.subject ? ` · ${tr(e.subject)}` : ''} · ${tp(e.marks, '{n} mark', '{n} marks')}` }))
  const mix = a?.teacherStatusMix
  const delta = a?.attendance.delta as number | null | undefined
  return (
    <>
      <PageHeader title={tr('Analytics')} subtitle={tr('Operational trends across your organization.')} actions={<Select value={range} onChange={(e) => setRange(e.target.value)}><option value="term">{tr('Last 90 days')}</option><option value="month">{tr('Last 30 days')}</option><option value="week">{tr('Last 7 days')}</option></Select>} />
      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tr('Attendance rate')} value={a?.attendance.rate != null ? `${a.attendance.rate}%` : EMPTY} delta={delta != null ? `${Math.abs(delta)}%` : undefined} deltaTone={delta != null && delta < 0 ? 'danger' : 'ok'} icon="checkCircle" sub={a ? tr('Target {target}%', { target: a.attendance.target }) : ''} />
        <StatCard label={tr('Room utilization')} value={a ? `${a.roomUtilization}%` : EMPTY} icon="door" />
        <StatCard label={tr('Assignment completion')} value={a?.assignmentCompletion != null ? `${a.assignmentCompletion}%` : EMPTY} icon="clipboard" />
        <StatCard label={tr('Avg workload')} value={a ? `${a.avgWorkload}${tr('h')}` : EMPTY} deltaTone="neutral" icon="gauge" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-display text-[16px] font-semibold text-card-foreground">{tr('Attendance trend')}</h2>
          {trend.length > 1 ? <LineChart xKind="date" series={[{ name: tr('Attendance rate'), points: trend }]} yUnit="%" yMax={100} height={280} target={a ? { value: a.attendance.target, label: tr('Target {target}%', { target: a.attendance.target }) } : undefined} ariaLabel={tr('Attendance trend')} /> : <p className="py-16 text-center text-[14px] text-muted-foreground">{loading ? tr('Loading…') : tr('Not enough attendance data for this period.')}</p>}
        </Card>
        <Card className="flex flex-col items-center p-5">
          <h2 className="mb-4 self-start font-display text-[16px] font-semibold text-card-foreground">{tr('Teacher status mix')}</h2>
          {mix && mix.total > 0 ? (
            <>
              <Donut label={String(mix.total)} sub={tr('teachers')} segments={[{ value: mix.Healthy, color: 'var(--ok)' }, { value: mix.Heavy, color: 'var(--warn)' }, { value: mix.Overloaded, color: 'var(--danger)' }, { value: mix.Light, color: 'var(--info)' }].filter((s) => s.value > 0)} />
              <div className="mt-4 flex flex-col gap-2 self-stretch">
                {[['Healthy', mix.Healthy, 'var(--ok)'], ['Heavy', mix.Heavy, 'var(--warn)'], ['Overloaded', mix.Overloaded, 'var(--danger)'], ['Light', mix.Light, 'var(--info)']].map(([l, n, c]) => (
                  <div key={l as string} className="flex items-center gap-2 text-[14px]"><span className="h-3 w-3 rounded-full" style={{ background: c as string }} /><span className="flex-1 text-muted-foreground">{tr(l as string)}</span><span className="font-mono text-muted-foreground tnum">{n}</span></div>
                ))}
              </div>
            </>
          ) : <p className="py-10 text-[14px] text-muted-foreground">{tr('No teachers yet.')}</p>}
        </Card>
      </div>
      <Card className="mt-5 p-5">
        <h2 className="mb-4 font-display text-[16px] font-semibold text-card-foreground">{tr('Teaching hours by department')}</h2>
        {(a?.hoursByDepartment ?? []).length ? <BarChart data={a.hoursByDepartment} unit="h" /> : <p className="py-8 text-center text-[14px] text-muted-foreground">{tr('No data yet.')}</p>}
      </Card>
      {a && <AnalyticsDetail a={a} />}
    </>
  )
}

/** Skala gred: peratus minimum → gred. Dipakai untuk semua keputusan peperiksaan. */
function GradeScaleEditor({ scale, onSave }: { scale: { grade: string; min: number }[]; onSave: (s: { grade: string; min: number }[]) => Promise<void> }) {
  const init = () => [...scale].sort((a, b) => b.min - a.min).map((g) => ({ grade: g.grade, min: String(g.min) }))
  const [rows, setRows] = useState(init)
  useEffect(() => setRows(init()), [JSON.stringify(scale)]) // eslint-disable-line react-hooks/exhaustive-deps
  const err = scaleError(rows)
  const dirty = JSON.stringify(rows) !== JSON.stringify(init())
  const set = (i: number, k: 'grade' | 'min', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="sm:col-span-2">
      <span className="mb-1 block text-[14px] font-semibold text-foreground">{tr('Grade scale')}</span>
      <p className="mb-2 text-[12px] text-muted-foreground">{tr('A student gets the first grade (from the top) whose minimum % they reach. Changing it re-grades all results, past and future.')}</p>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Grade ${i + 1}`} className="w-28" maxLength={12} value={r.grade} onChange={(e) => set(i, 'grade', e.target.value)} />
            <span className="text-[14px] text-muted-foreground">{tr('from')}</span>
            <Input aria-label={`Minimum % for grade ${i + 1}`} className="w-20" inputMode="numeric" value={r.min} onChange={(e) => set(i, 'min', e.target.value)} />
            <span className="text-[14px] text-muted-foreground">%</span>
            <button type="button" aria-label={`Remove grade ${i + 1}`} disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"><Icon.x width={16} height={16} /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={rows.length >= 12} onClick={() => setRows([...rows, { grade: '', min: '' }])}>{tr('Add grade')}</Button>
        <Button size="sm" variant="primary" disabled={!dirty || !!err} onClick={() => void onSave(rows.map((r) => ({ grade: r.grade.trim(), min: Number(r.min) })).sort((a, b) => b.min - a.min))}>{tr('Save grade scale')}</Button>
        {dirty && err && <span role="alert" className="text-[12px] font-medium text-danger">{err}</span>}
      </div>
    </div>
  )
}

type Pt = { label: string; value: number }
function AnalyticsDetail({ a }: { a: Record<string, any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { navigate } = useApp()
  const t = a.totals as { students: number; attendanceRecords: number; subjectsWithoutTeacher: number; classesWithoutSubjects: number }
  const empty = (msg: string) => <p className="py-8 text-center text-[14px] text-muted-foreground">{tr(msg)}</p>
  const gaps = t.subjectsWithoutTeacher + t.classesWithoutSubjects
  return (
    <>
      {gaps > 0 && (
        <button onClick={() => navigate('subjects')} className="relative mt-5 flex w-full items-center gap-3 bg-warn-soft p-4 text-left chamfer ">
          <Icon.alert width={18} height={18} />
          <span className="flex-1 text-sm text-foreground"><b>{tr('Timetable data is incomplete.')}</b> {t.subjectsWithoutTeacher > 0 && `${tp(t.subjectsWithoutTeacher, '{n} class subject has no teacher.', '{n} class subjects have no teacher.')} `}{t.classesWithoutSubjects > 0 && `${tp(t.classesWithoutSubjects, '{n} class has no subjects.', '{n} classes have no subjects.')} `}{tr('Workload and hours figures only count what is assigned.')}</span>
          <span className="text-[14px] font-semibold text-primary">{tr('Fix on Subjects')}</span>
        </button>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Attendance by weekday')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{tr('Which days students are most often absent.')}</p>
          {(a.attendanceByWeekday as Pt[]).length ? <BarChart data={a.attendanceByWeekday} unit="%" max={100} /> : empty('No attendance recorded in this period.')}
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Classes needing attention')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{tr('Lowest attendance in this period.')}</p>
          {(a.classesNeedingAttention as { id: string; name: string; teacher: string | null; rate: number; absent: number }[]).length ? (
            <div className="flex flex-col gap-3">
              {a.classesNeedingAttention.map((c: { id: string; name: string; teacher: string | null; rate: number; absent: number }) => (
                <button key={c.id} onClick={() => navigate('class-detail', c.id)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{c.name}</span><span className="block truncate text-[12px] text-muted-foreground">{c.teacher ?? tr('No class teacher')} · {tp(c.absent, '{n} absence', '{n} absences')}</span></span>
                  <Badge tone={c.rate < (a.attendance.target ?? 90) ? 'danger' : 'ok'}>{c.rate}%</Badge>
                </button>
              ))}
            </div>
          ) : empty('No attendance recorded in this period.')}
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Assignment completion by subject')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{tr('Share of expected submissions received (published assignments due in this period).')}</p>
          {(a.completionBySubject as Pt[]).length ? <BarChart data={a.completionBySubject} unit="%" max={100} /> : empty('No published assignments due in this period.')}
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Weekly teaching hours by subject')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{tr('From the current timetable.')}</p>
          {(a.hoursBySubject as Pt[]).length ? <BarChart data={a.hoursBySubject} unit="h" /> : empty('No timetable sessions yet.')}
        </Card>
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-3"><h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Students with the most absences')}</h2><p className="text-[12px] text-muted-foreground">{tr('Students with at least 3 attendance records in this period. {n} active students in total.', { n: t.students })}</p></div>
        {(a.frequentAbsentees as { id: string; name: string; studentCode?: string; guardianName?: string; guardianPhone?: string; class: string | null; absent: number; late: number; records: number; rate: number }[]).length ? (
          <TableWrap>
            <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Student')}</Th><Th>{tr('Class')}</Th><Th>{tr('Absent')}</Th><Th>{tr('Late')}</Th><Th>{tr('Attendance')}</Th></tr></thead>
            <tbody className="divide-y divide-border">
              {a.frequentAbsentees.map((s: { id: string; name: string; studentCode?: string; guardianName?: string; guardianPhone?: string; class: string | null; absent: number; late: number; records: number; rate: number }) => (
                <tr key={s.id}>
                  <Td>
                    <div className="font-semibold">{s.name}{s.studentCode ? ` (${s.studentCode})` : ''}</div>
                    {(s.guardianName || s.guardianPhone) && <div className="text-[12px] text-muted-foreground">{tr('Guardian:')} {s.guardianName ?? EMPTY}{s.guardianPhone ? ` · ${s.guardianPhone}` : ''}</div>}
                  </Td>
                  <Td className="text-muted-foreground">{s.class ?? EMPTY}</Td>
                  <Td className="tnum">{tr('{absent} of {records}', { absent: s.absent, records: s.records })}</Td>
                  <Td className="tnum">{s.late}</Td>
                  <Td><Badge tone={s.rate < 80 ? 'danger' : 'warn'}>{s.rate}%</Badge></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : empty('No student has repeated absences in this period.')}
      </Card>
      <Card className="mt-5 p-5">
        <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Exam average over time')}</h2>
        <p className="mb-4 text-[12px] text-muted-foreground">{tr('Each point is one exam: the average mark of the students who sat it.')}</p>
        {examTrend.length > 0 ? <LineChart xKind="date" series={[{ name: tr('Average mark'), points: examTrend }]} yUnit="%" yMax={100} height={260} ariaLabel={tr('Exam average over time')} /> : empty('No exam marks entered in this period.')}
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Average exam score by subject')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{a.examPassRate === null ? tr('From marks entered for exams in this period.') : tp(a.examTotals.examsWithMarks, 'Overall pass rate {rate}% · {marks} marks from {n} exam.', 'Overall pass rate {rate}% · {marks} marks from {n} exams.', { rate: a.examPassRate, marks: a.examTotals.marksEntered })}</p>
          {(a.examAverageBySubject as Pt[]).length ? <BarChart data={a.examAverageBySubject} unit="%" max={100} /> : empty('No exam marks entered in this period.')}
          {a.examTotals.examsAwaitingMarks > 0 && <p className="mt-3 rounded-lg bg-warn-soft p-3 text-[12px] text-foreground">{tp(a.examTotals.examsAwaitingMarks, '{n} exam has taken place but no marks are entered yet.', '{n} exams have taken place but no marks are entered yet.')}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Exam pass rate by class')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{tr('Lowest first.')}</p>
          {(a.examPassRateByClass as Pt[]).length ? <BarChart data={a.examPassRateByClass} unit="%" max={100} /> : empty('No exam marks entered in this period.')}
        </Card>
      </div>
      {(a.leaveDaysByType as Pt[]).length > 0 && (
        <Card className="mt-5 p-5">
          <h2 className="mb-1 font-display text-[16px] font-semibold text-card-foreground">{tr('Approved leave days by type')}</h2>
          <p className="mb-4 text-[12px] text-muted-foreground">{tr('Approved requests that overlap this period (full length of each request).')}</p>
          <BarChart data={a.leaveDaysByType} unit=" d" />
        </Card>
      )}
    </>
  )
}

/* ============ HOLIDAYS PANEL ============ */
function HolidaysPanel() {
  const { act } = useLive()
  const hols = useFetch(() => api.holidays())
  const [f, setF] = useState({ title: '', startDate: '', endDate: '', type: 'Public Holiday' })
  async function add() {
    if (!f.title.trim() || !f.startDate) return
    const r = await act(() => api.addHoliday({ title: f.title.trim(), startDate: f.startDate, endDate: f.endDate || f.startDate, type: f.type }),
      { ok: { title: tr('Holiday added'), desc: f.title.trim() }, reload: ['overview'] })
    if (r) { setF({ title: '', startDate: '', endDate: '', type: 'Public Holiday' }); hols.reload() }
  }
  async function remove(id: string, title: string) {
    const r = await act(() => api.deleteHoliday(id), { ok: { title: tr('Holiday removed'), desc: title }, reload: ['overview'] })
    if (r) hols.reload()
  }
  const items = hols.data?.items ?? []
  return (
    <Card className="p-5">
      <h3 className="font-display text-[16px] font-semibold text-card-foreground">{tr('School & public holidays')}</h3>
      <p className="mt-1 text-[12px] text-muted-foreground">{tr('Holidays are excluded from staff leave deductions and daily unmarked-attendance alerts.')}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={tr('Holiday / break name')}><Input placeholder={tr('e.g. Hari Kebangsaan / Cuti Penggal 1')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={tr('Type')}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['Public Holiday', 'School Holiday', 'Term Break', 'Special Event'].map((t) => <option key={t} value={t}>{tr(t)}</option>)}</Select></Field>
        <Field label={tr('Start date')}><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate || e.target.value })} /></Field>
        <Field label={tr('End date')}><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" icon="plus" variant="primary" disabled={!f.title.trim() || !f.startDate} onClick={() => void add()}>{tr('Add holiday')}</Button>
      </div>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {items.length === 0 && <p className="p-4 text-center text-[14px] text-muted-foreground">{tr('No holidays scheduled yet.')}</p>}
        {items.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-[160px] flex-1">
              <p className="font-medium text-foreground">{tr(h.title)}</p>
              <p className=" font-mono text-[12px] text-muted-foreground">{h.startDate}{h.endDate !== h.startDate ? ` → ${h.endDate}` : ''} · {tp(h.days, '{n} weekday', '{n} weekdays')}</p>
            </div>
            <Badge tone={h.type === 'Public Holiday' ? 'info' : 'primary'}>{h.type}</Badge>
            <Button size="sm" variant="ghost" onClick={() => void remove(h.id, h.title)}>{tr('Remove')}</Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ============ SETTINGS ============ */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cx('flex h-6 w-11 items-center rounded-full p-1 ', on ? 'bg-primary' : 'bg-muted')}>
      <span className={cx('h-5 w-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
    </button>
  )
}

export function Settings() {
  const { user, setUser } = useSession()
  const { act } = useLive()
  const [tab, setTab] = useState('org')
  const org = useFetch(() => api.org())
  const settings = useFetch(() => api.settings())
  const roles = useFetch(() => api.roles())
  const branches = useFetch(() => api.branches())
  const depts = useFetch(() => api.departments())
  const [orgF, setOrgF] = useState<{ name: string; type: string; contactEmail: string; timezone: string } | null>(null)
  const o = orgF ?? (org.data ? { name: org.data.name, type: org.data.type, contactEmail: org.data.contactEmail ?? '', timezone: org.data.timezone } : null)
  const [newBranch, setNewBranch] = useState('')
  const [newDept, setNewDept] = useState('')
  const [tfa, setTfa] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const s = settings.data

  async function patchSetting(patch: Record<string, unknown>) {
    const r = await act(() => api.patchSettings(patch))
    if (r) settings.reload()
  }
  async function saveOrg() {
    if (!o) return
    const r = await act(() => api.patchOrg(o), { ok: { title: tr('Settings saved') } })
    if (!r) return
    const me = await api.me(); const cur = getSession(); if (cur) setSession({ ...cur, user: me }); setUser(me); org.reload()
  }
  async function addBranch() { if (!newBranch.trim()) return; const r = await act(() => api.addBranch(newBranch.trim()), { ok: { title: tr('Branch added') } }); if (r) { setNewBranch(''); branches.reload() } }
  async function addDept() { if (!newDept.trim()) return; const r = await act(() => api.addDepartment(newDept.trim()), { ok: { title: tr('Department added') } }); if (r) { setNewDept(''); depts.reload() } }
  async function start2fa() { const r = await act(() => api.twoFaSetup()); if (r) setTfa(r) }
  async function enable2fa() { const r = await act(() => api.twoFaEnable(code), { ok: { title: tr('Two-factor authentication enabled') } }); if (r) { const { recoveryCodes, ...u } = r; setUser(u); setTfa(null); setCode(''); setCodes(recoveryCodes) } }
  async function regenCodes() { const r = await act(() => api.twoFaRecoveryCodes(pw, code), { ok: { title: tr('New recovery codes generated'), desc: tr('Old codes no longer work.') } }); if (r) { setCodes(r.recoveryCodes); setCode(''); setPw('') } }
  async function disable2fa() { const r = await act(() => api.twoFaDisable(pw, code), { ok: { title: tr('Two-factor authentication disabled') } }); if (r) { setUser(r); setCode(''); setPw('') } }

  // Hanya tetapan yang benar-benar dikuatkuasakan backend dipaparkan (tiada togol "hiasan").
  const toggles: Record<string, { label: string; hint?: string; get: (x: NonNullable<typeof s>) => boolean; set: (v: boolean) => Record<string, unknown> }[]> = {
    academic: [
      { label: tr('Apply holiday calendar to leave & attendance'), hint: tr('When enabled, scheduled holidays are excluded from teacher leave deductions and daily attendance alerts.'), get: (x) => x.holidays !== false, set: (v) => ({ holidays: v }) },
    ],
    notif: [
      { label: tr('Leave request emails'), hint: tr('Email admins about new leave requests and teachers about decisions.'), get: (x) => x.notifications.leave, set: (v) => ({ notifications: { leave: v } }) },
    ],
    security: [
      { label: tr('Require two-factor for all staff'), hint: tr('Everyone must set up an authenticator app the next time they use CampusOS.'), get: (x) => x.security.twoFactor, set: (v) => ({ security: { twoFactor: v } }) },
    ],
  }
  const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const toggleDay = (d: string) => {
    if (!s) return
    const next = s.operatingDays.includes(d) ? s.operatingDays.filter((x: string) => x !== d) : ALL_DAYS.filter((x) => x === d || s.operatingDays.includes(x))
    if (next.length) void patchSetting({ operatingDays: next })
  }

  return (
    <>
      <PageHeader title={tr('Settings')} subtitle={tr('School details, users, notifications and security.')} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'org', label: tr('Organization') }, { id: 'academic', label: tr('Academic year') }, { id: 'structure', label: tr('Structure') },
        { id: 'users', label: tr('Users & access') }, { id: 'roles', label: tr('Roles & permissions') }, { id: 'notif', label: tr('Notifications') }, { id: 'app', label: tr('Mobile app') }, { id: 'security', label: tr('Security') },
      ]} />
      <div className="mt-5">
        {tab === 'org' && o && (
          <Card className="max-w-2xl p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr('Organization name')}><Input value={o.name} onChange={(e) => setOrgF({ ...o, name: e.target.value })} /></Field>
              <Field label={tr('Organization type')}><Select value={o.type} onChange={(e) => setOrgF({ ...o, type: e.target.value })}>{['School', 'University', 'College', 'Tuition Centre', 'Training Centre', 'Academy'].map((t) => <option key={t} value={t}>{tr(t)}</option>)}</Select></Field>
              <Field label={tr('Primary contact')}><Input value={o.contactEmail} onChange={(e) => setOrgF({ ...o, contactEmail: e.target.value })} /></Field>
              <Field label={tr('Timezone')}><Select value={o.timezone} onChange={(e) => setOrgF({ ...o, timezone: e.target.value })}>{['GMT (UTC+0)', 'WAT (UTC+1)', 'EAT (UTC+3)', 'MYT (UTC+8)'].map((t) => <option key={t} value={t}>{tr(t)}</option>)}</Select></Field>
            </div>
            <div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => void saveOrg()}>{tr('Save changes')}</Button></div>
          </Card>
        )}
        {tab === 'app' && <ShareAppCard />}
        {tab === 'structure' && (
          <Card className="max-w-2xl p-5">
            <h3 className="mb-3 font-display text-[16px] font-semibold text-card-foreground">{tr('Organization structure')}</h3>
            <div className="rounded-lg border border-border bg-surface-2 p-4 font-mono text-[14px] text-foreground">
              <p className="flex items-center gap-2"><Icon.building width={15} height={15} className="text-primary" /> {user.org.name}</p>
              {(branches.data?.items ?? []).map((b: { id: string; name: string; teachers: number; classes: number }, i: number, arr: unknown[]) => (
                <p key={b.id} className="ml-4 mt-2 flex items-center gap-2 text-muted-foreground"><span>{i === arr.length - 1 ? '└─' : '├─'}</span> {tr(b.name)} <span className="text-muted-foreground/60">· {tp(b.teachers, '{n} teacher', '{n} teachers')} · {tp(b.classes, '{n} class', '{n} classes')}</span></p>
              ))}
              <p className="ml-4 mt-3 text-[12px] uppercase tracking-widest text-muted-foreground/70">{tr('Departments')}</p>
              {(depts.data?.items ?? []).map((d: { id: string; name: string; teachers: number }) => <p key={d.id} className="ml-8 text-muted-foreground/80">• {tr(d.name)} <span className="text-muted-foreground/50">({d.teachers})</span></p>)}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="flex gap-2"><Input placeholder={tr('New branch')} value={newBranch} onChange={(e) => setNewBranch(e.target.value)} /><Button size="sm" icon="plus" variant="outline" onClick={() => void addBranch()}>{tr('Add')}</Button></div>
              <div className="flex gap-2"><Input placeholder={tr('New department')} value={newDept} onChange={(e) => setNewDept(e.target.value)} /><Button size="sm" icon="plus" variant="outline" onClick={() => void addDept()}>{tr('Add')}</Button></div>
            </div>
          </Card>
        )}
        {tab === 'users' && <UsersPanel roles={(roles.data?.roles ?? []) as { id: string; label: string }[]} />}
        {tab === 'roles' && roles.data && (
          <Card className="max-w-3xl overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2"><tr>
                <th className="px-4 py-3 text-left font-mono text-[12px] uppercase tracking-widest text-muted-foreground">{tr('Permission')}</th>
                {roles.data.roles.map((r: { id: string; label: string }) => <th key={r.id} className="px-3 py-3 text-center font-mono text-[12px] uppercase tracking-widest text-muted-foreground">{tr(r.label)}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {roles.data.rows.map((row: { permission: string; allowed: Record<string, boolean> }) => (
                  <tr key={row.permission}><td className="px-4 py-3 font-medium text-foreground">{tr(row.permission)}</td>
                    {roles.data!.roles.map((r: { id: string }) => <td key={r.id} className="px-3 py-3 text-center">{row.allowed[r.id] ? <Icon.check width={16} height={16} className="mx-auto text-ok" /> : <Icon.x width={14} height={14} className="mx-auto text-muted-foreground/40" />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
        {s && (tab === 'academic' || tab === 'notif' || tab === 'security') && (
          <div className="flex max-w-2xl flex-col gap-5">
            <Card className="p-5">
              {tab === 'academic' && (
                <div className="grid gap-4 border-b border-border pb-4 sm:grid-cols-2">
                  <Field label={tr('Academic year')}><Input defaultValue={s.academicYear} onBlur={(e) => e.target.value !== s.academicYear && void patchSetting({ academicYear: e.target.value })} /></Field>
                  <Field label={tr('Current term')}><Input defaultValue={tr(s.term)} onBlur={(e) => e.target.value !== s.term && void patchSetting({ term: e.target.value })} /></Field>
                  <Field label={tr('Day starts')}><Input type="time" defaultValue={s.dayStart} onBlur={(e) => e.target.value && e.target.value !== s.dayStart && void patchSetting({ dayStart: e.target.value })} /></Field>
                  <Field label={tr('Day ends')}><Input type="time" defaultValue={s.dayEnd} onBlur={(e) => e.target.value && e.target.value !== s.dayEnd && void patchSetting({ dayEnd: e.target.value })} /></Field>
                  <Field label={tr('Attendance target (%)')}><Input type="number" min={0} max={100} defaultValue={s.attendanceTarget} onBlur={(e) => Number(e.target.value) !== s.attendanceTarget && void patchSetting({ attendanceTarget: Number(e.target.value) })} /></Field>
                  <GradeScaleEditor scale={s.gradeScale} onSave={(g) => patchSetting({ gradeScale: g })} />
                  <div>
                    <span className="mb-2 block text-[14px] font-semibold text-foreground">{tr('School days')}</span>
                    <div className="flex flex-wrap gap-2">{ALL_DAYS.map((d) => <button key={d} type="button" onClick={() => toggleDay(d)} className={cx('rounded-lg border px-3 py-2 text-[14px] font-semibold', s.operatingDays.includes(d) ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>{tr(d)}</button>)}</div>
                  </div>
                </div>
              )}
              <div className="flex flex-col divide-y divide-border">
                {toggles[tab].map((t) => (
                  <label key={t.label} className="flex items-center justify-between gap-4 py-3"><span><span className="block text-sm font-medium text-foreground">{t.label}</span>{t.hint && <span className="block text-[12px] text-muted-foreground">{t.hint}</span>}</span><Toggle on={t.get(s)} onChange={(v) => void patchSetting(t.set(v))} /></label>
                ))}
              </div>
            </Card>
            {tab === 'academic' && <HolidaysPanel />}
            {tab === 'security' && (
              <Card className="p-5">
                <Field label={tr('Sign out inactive users after')}>
                  <Select value={String(s.security.sessionTimeoutMin)} onChange={(e) => void patchSetting({ security: { sessionTimeoutMin: Number(e.target.value) } })}>
                    {[15, 30, 60, 120, 480].map((m) => <option key={m} value={m}>{m < 60 ? tr('{n} minutes', { n: m }) : tp(m / 60, '{n} hour', '{n} hours')}</option>)}
                  </Select>
                </Field>
                <p className="mt-2 text-[12px] text-muted-foreground">{tr('Applies to everyone in your organization, including shared staff-room computers.')}</p>
              </Card>
            )}
            {tab === 'security' && (
              <Card className="p-5">
                <div className="flex items-center justify-between"><div><h3 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Your account: authenticator app (2FA)')}</h3><p className="text-[14px] text-muted-foreground">{tr('Protect {email} with a 6-digit code at sign-in.', { email: user.email })}</p></div><Badge tone={user.twoFactor ? 'ok' : 'neutral'} dot>{user.twoFactor ? 'Enabled' : 'Off'}</Badge></div>
                {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
                {!user.twoFactor && !tfa && <Button className="mt-4" variant="outline" onClick={() => void start2fa()}>{tr('Set up 2FA')}</Button>}
                {!user.twoFactor && tfa && (
                  <div className="mt-4 flex flex-col gap-3">
                    <p className="text-[14px] text-muted-foreground">{tr('Add this key to Google Authenticator, Authy or 1Password, then enter the 6-digit code.')}</p>
                    <code className="select-all break-all rounded-lg bg-surface-2 p-3 font-mono text-[14px] text-foreground">{tfa.secret}</code>
                    <div className="flex gap-2"><Input placeholder="123456" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /><Button variant="primary" onClick={() => void enable2fa()}>{tr('Enable')}</Button></div>
                  </div>
                )}
                {user.twoFactor && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input type="password" placeholder={tr('Password')} value={pw} onChange={(e) => setPw(e.target.value)} />
                    <Input placeholder={tr('6-digit or recovery code')} maxLength={9} value={code} onChange={(e) => setCode(e.target.value)} />
                    <Button variant="outline" onClick={() => void disable2fa()}>{tr('Disable')}</Button>
                    <Button variant="ghost" className="sm:col-span-3 sm:justify-self-start" onClick={() => void regenCodes()}>{tr('Generate new recovery codes (needs password + code above)')}</Button>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
      
    </>
  )
}

/* ============ BILLING ============ */
const PLAN_COPY: Record<string, { tag: string; feats: string[] }> = {
  starter: { tag: 'For small learning organizations', feats: ['Up to 10 teachers', '25 classes', '1 branch', 'Core operations'] },
  growth: { tag: 'For growing organizations', feats: ['Up to 100 teachers', 'Unlimited classes', '5 branches', 'Analytics & reports', 'Priority support'] },
  enterprise: { tag: 'For large organizations', feats: ['Unlimited teachers', 'Unlimited branches', 'Dedicated success manager', 'SLA & onboarding'] },
}
export function Billing() {
  const { act } = useLive()
  const { data: b, reload, error } = useFetch(() => api.billing())
  const money = (cents: number | null) => (cents === null ? tr('Custom') : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`)
  async function change(plan: string) {
    const r = await act(() => api.changePlan(plan), { ok: { title: tr('Plan updated'), desc: tr('Switched to {plan}.', { plan: tr(plan) }) } })
    if (r) reload()
  }
  if (error) return <Card className="p-8 text-center text-sm text-muted-foreground">{error}</Card>
  if (!b) return <Card className="p-8 text-center text-sm text-muted-foreground">{tr('Loading billing…')}</Card>
  const u = b.usage as Record<string, { used: number; limit: number | null }>
  return (
    <>
      <PageHeader title={tr('Billing')} subtitle={tr('Manage your plan, usage and invoices.')} />
      <Card className="mb-5 flex flex-wrap items-center gap-5 p-5">
        <div><p className="text-[14px] text-muted-foreground">{tr('Current plan')}</p><p className="font-display text-xl font-bold text-foreground">{tr(b.plan.name)}</p></div>
        <div className="h-10 w-px bg-border" />
        {(['teachers', 'classes', 'branches'] as const).map((k) => (
          <div key={k}><p className="text-[14px] capitalize text-muted-foreground">{tr(k)}</p><p className="font-semibold text-foreground tnum">{u[k].used} / {u[k].limit ?? '∞'}</p></div>
        ))}
        <div className="ml-auto text-right"><p className="text-[14px] text-muted-foreground">{tr('Next invoice')}</p><p className="font-semibold text-foreground">{b.nextInvoice ? `${money(b.nextInvoice.amountCents)} · ${fmtDay(b.nextInvoice.date)}` : EMPTY}</p></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {b.plans.map((p: { id: string; name: string; priceCents: number | null }) => {
          const current = p.id === b.plan.id
          return (
            <Card key={p.id} className={cx('flex flex-col p-5', current && 'bg-primary-soft')}>
              <div className="flex items-center justify-between"><h3 className="font-display text-lg font-bold text-foreground">{tr(p.name)}</h3>{current && <Badge tone="primary">{tr('Current')}</Badge>}</div>
              <p className="mt-1 text-[14px] text-muted-foreground">{tr(PLAN_COPY[p.id]?.tag ?? '')}</p>
              <p className="mt-4 font-display text-3xl font-bold text-foreground">{money(p.priceCents)}<span className="text-base font-medium text-muted-foreground">{p.priceCents ? tr('/mo') : ''}</span></p>
              <div className="mt-4 flex flex-1 flex-col gap-3">{(PLAN_COPY[p.id]?.feats ?? []).map((f) => <div key={f} className="flex items-center gap-2 text-[14px] text-foreground"><Icon.check width={15} height={15} className="text-ok" /> {tr(f)}</div>)}</div>
              <Button variant={current ? 'outline' : 'primary'} block className="mt-5" onClick={() => void change(p.id)} disabled={current}>{current ? 'Your plan' : p.id === 'enterprise' ? 'Contact sales' : p.priceCents === 0 ? 'Downgrade' : 'Upgrade'}</Button>
            </Card>
          )
        })}
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Billing history')}</h2></div>
        <div className="divide-y divide-border">
          {b.invoices.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">{tr('No invoices yet.')}</p>}
          {b.invoices.map((i: { id: string; amountCents: number; status: string; issuedAt: number }) => (
            <div key={i.id} className="flex items-center gap-4 px-5 py-3"><Icon.file width={16} height={16} className="text-muted-foreground" /><span className="flex-1 text-sm text-foreground">{fmtDay(new Date(i.issuedAt).toISOString().slice(0, 10))} {new Date(i.issuedAt).getFullYear()}</span><span className="font-mono text-sm text-foreground tnum">{money(i.amountCents)}</span><Badge tone={i.status === 'Paid' ? 'ok' : i.status === 'Due' ? 'warn' : 'danger'}>{i.status}</Badge></div>
          ))}
        </div>
      </Card>
    </>
  )
}
