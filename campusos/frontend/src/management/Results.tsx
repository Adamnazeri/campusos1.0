import { useEffect, useMemo, useRef, useState } from 'react'
import { t as tr, tp } from '../lib/i18n'
import { Badge, Button, Card, Modal } from '../lib/ui'
import { Td, Th, TableWrap } from '../components/common'
import { api, ApiError } from '../lib/api'
import { gradeFor, parseMark, pctOf } from '../lib/grades'
import { toCsv } from '../lib/csv'
import { useFetch, useLive } from '../lib/live'
import { ConfirmModal } from './Manage'
import type { ExamResults } from '../lib/data'
import { EMPTY } from '../lib/empty'

type Draft = { mark: string; absent: boolean; remarks: string }
const toDraft = (r: ExamResults['students'][number]): Draft => ({ mark: r.mark === null ? '' : String(r.mark), absent: r.absent, remarks: r.remarks })
const same = (a: Draft, b: Draft) => a.mark === b.mark && a.absent === b.absent && a.remarks === b.remarks
const tone = (p: number | null, pass: number) => (p === null ? 'neutral' : p >= pass ? 'ok' : 'danger') as 'neutral' | 'ok' | 'danger'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

/* ============ MASUKKAN / LIHAT MARKAH SATU PEPERIKSAAN ============ */
export function ResultsModal({ examId, open, onClose, isAdmin = false }: { examId: string; open: boolean; onClose: () => void; isAdmin?: boolean }) {
  const { refresh } = useLive()
  const [data, setData] = useState<ExamResults | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'complete' | 'reopen' | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = (d: ExamResults) => { setData(d); setDrafts(Object.fromEntries(d.students.map((s) => [s.studentId, toDraft(s)]))); setSaveErr(null) }
  useEffect(() => {
    if (!open) return
    setData(null); setLoadErr(null)
    api.examResults(examId).then(load).catch((e) => setLoadErr(e instanceof ApiError ? e.message : tr('Something went wrong')))
  }, [open, examId])

  const max = data?.exam.maxMark ?? 100
  const edited = (id: string) => data ? !same(drafts[id], toDraft(data.students.find((s) => s.studentId === id)!)) : false
  const parsed = useMemo(() => Object.fromEntries((data?.students ?? []).map((s) => [s.studentId, drafts[s.studentId] ? parseMark(drafts[s.studentId].mark, max) : { value: null }])), [data, drafts, max])
  const invalid = Object.values(parsed).filter((p) => 'error' in p).length
  const changed = (data?.students ?? []).filter((s) => edited(s.studentId))
  const editable = !!data?.canEdit

  async function save() {
    if (!data || invalid) return
    setBusy(true); setSaveErr(null)
    try {
      const r = await api.saveExamResults(examId, changed.map((s) => {
        const d = drafts[s.studentId], p = parsed[s.studentId] as { value: number | null }
        return { studentId: s.studentId, mark: d.absent ? null : p.value, absent: d.absent, remarks: d.remarks.trim() || undefined }
      }))
      load(r); await refresh('exams')
    } catch (e) { setSaveErr(e instanceof ApiError ? e.message : tr('Something went wrong')) } finally { setBusy(false) }
  }
  async function finalize(kind: 'complete' | 'reopen') {
    setBusy(true); setSaveErr(null)
    try { load(await (kind === 'complete' ? api.completeExam(examId) : api.reopenExam(examId))); await refresh('exams') }
    catch (e) { setSaveErr(e instanceof ApiError ? e.message : tr('Something went wrong')) } finally { setBusy(false); setConfirm(null) }
  }
  const focusNext = (i: number) => { const next = data?.students[i + 1]; if (next) inputs.current[next.studentId]?.focus() }

  const scale = data?.scale ?? []
  const preview = (id: string) => { const p = parsed[id]; return p && 'value' in p && !drafts[id].absent ? gradeFor(pctOf(p.value, max), scale) : null }
  const st = data?.stats
  const completed = data?.exam.status === 'Completed'

  return (
    <>
      <Modal open={open} onClose={() => { if (!changed.length || window.confirm(tr('Discard unsaved marks?'))) onClose() }} wide
        title={data ? `${tr(data.exam.title)} · ${data.exam.className}` : 'Exam results'}
        footer={!data ? <Button variant="ghost" onClick={onClose}>{tr('Close')}</Button> : <>
          {editable && !completed && <Button variant="ghost" className="mr-auto" disabled={busy || changed.length > 0} onClick={() => setConfirm('complete')} title={changed.length ? tr('Save your changes first') : undefined}>{tr('Finalize results')}</Button>}
          {completed && isAdmin && <Button variant="ghost" className="mr-auto" disabled={busy} onClick={() => setConfirm('reopen')}>{tr('Reopen')}</Button>}
          <Button variant="ghost" onClick={() => { if (!changed.length || window.confirm(tr('Discard unsaved marks?'))) onClose() }}>{tr('Close')}</Button>
          {editable && <Button variant="primary" disabled={busy || !changed.length || invalid > 0} onClick={() => void save()}>{changed.length ? tp(changed.length, 'Save {n} change', 'Save {n} changes') : tr('Saved')}</Button>}
        </>}>
        {loadErr && <p role="alert" className="text-sm font-medium text-danger">{loadErr}</p>}
        {!data && !loadErr && <p className="py-10 text-center text-sm text-muted-foreground">{tr('Loading…')}</p>}
        {data && st && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
              <span>{tr(data.exam.subject ?? 'No subject')} · {tr('out of')} <b className="text-foreground">{max}</b> · {tr('pass at {pct}%', { pct: data.exam.passPct })}</span>
              <Badge tone={completed ? 'ok' : data.exam.status === 'Grading' ? 'warn' : 'primary'} dot>{data.exam.status}</Badge>
              {!editable && <Badge>{completed ? 'Finalized: read only' : 'View only'}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[['Entered', `${st.graded + st.absent}/${st.total}`], ['Average', st.average === null ? EMPTY : `${st.average}%`], ['Highest', st.highest === null ? EMPTY : String(st.highest)], ['Lowest', st.lowest === null ? EMPTY : String(st.lowest)], ['Pass rate', st.passRate === null ? EMPTY : `${st.passRate}%`]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 px-3 py-2"><p className="text-[12px] font-semibold uppercase text-muted-foreground">{tr(k)}</p><p className="font-display text-lg font-bold text-foreground tnum">{v}</p></div>
              ))}
            </div>
            {st.graded > 0 && <div className="flex flex-wrap gap-2 text-[12px]">{st.distribution.map((d) => <Badge key={d.grade}>{d.grade}: {d.count}</Badge>)}</div>}
            {data.students.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{tr('This class has no students yet.')}</p> : (
              <Card className="max-h-[48vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-border bg-surface-2"><tr><Th>#</Th><Th>{tr('Student')}</Th><Th>{tr('Mark')} / {max}</Th><Th>{tr('Absent')}</Th><Th>%</Th><Th>{tr('Grade')}</Th><Th>{tr('Remarks')}</Th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.students.map((s, i) => {
                      const d = drafts[s.studentId] ?? toDraft(s), p = parsed[s.studentId], err = p && 'error' in p ? p.error : null
                      const pc = !d.absent && p && 'value' in p ? pctOf(p.value, max) : null
                      return (
                        <tr key={s.studentId} className={edited(s.studentId) ? 'bg-primary-soft/40' : ''}>
                          <Td className="font-mono text-[12px] text-muted-foreground tnum">{i + 1}</Td>
                          <Td className="font-semibold">{s.name}</Td>
                          <Td>
                            <input ref={(el) => { inputs.current[s.studentId] = el }} aria-label={`Mark for ${s.name}`} inputMode="decimal" disabled={!editable || d.absent} value={d.mark}
                              onChange={(e) => setDrafts({ ...drafts, [s.studentId]: { ...d, mark: e.target.value } })}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(i) } }}
                              className={`h-9 w-20 rounded-lg border bg-surface-2 px-2 text-sm tnum outline-none focus:ring-2 focus:ring-primary/20 ${err ? 'border-danger' : 'border-border focus:border-primary'}`} />
                            {err && <p role="alert" className="mt-1 text-[12px] text-danger">{err}</p>}
                          </Td>
                          <Td><input type="checkbox" aria-label={`${s.name} absent`} disabled={!editable} checked={d.absent} onChange={(e) => setDrafts({ ...drafts, [s.studentId]: { ...d, absent: e.target.checked, mark: e.target.checked ? '' : d.mark } })} /></Td>
                          <Td className="tnum text-muted-foreground">{pc === null ? EMPTY : `${pc}%`}</Td>
                          <Td>{d.absent ? <Badge>{tr('Absent')}</Badge> : preview(s.studentId) ? <Badge tone={tone(pc, data.exam.passPct)}>{preview(s.studentId)}</Badge> : <span className="text-muted-foreground">{EMPTY}</span>}</Td>
                          <Td><input aria-label={`Remarks for ${s.name}`} disabled={!editable} maxLength={200} value={d.remarks} onChange={(e) => setDrafts({ ...drafts, [s.studentId]: { ...d, remarks: e.target.value } })} className="h-9 w-40 rounded-lg border border-border bg-surface-2 px-2 text-sm outline-none focus:border-primary" /></Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            )}
            {editable && <p className="text-[12px] text-muted-foreground">{tr('Press Enter to jump to the next student. Leave a mark empty if it is not known yet. Marks can only be entered on or after the exam date.')}</p>}
            {saveErr && <p role="alert" className="text-[14px] font-medium text-danger">{saveErr}</p>}
          </div>
        )}
      </Modal>
      <ConfirmModal open={confirm === 'complete'} onClose={() => setConfirm(null)} danger={false} title={tr('Finalize results')} confirmLabel={tr('Finalize')}
        message={`${tr('Finalize these results?')} ${st && st.pending > 0 ? `${tp(st.pending, '{n} student has no mark yet.', '{n} students have no mark yet.')} ` : ''}${tr('After this the teacher can no longer change the marks; an administrator can reopen them.')}`} onConfirm={() => finalize('complete')} />
      <ConfirmModal open={confirm === 'reopen'} onClose={() => setConfirm(null)} danger={false} title={tr('Reopen results')} confirmLabel={tr('Reopen')} message={tr('Allow the teacher to edit these marks again?')} onConfirm={() => finalize('reopen')} />
    </>
  )
}

/* ============ RINGKASAN KELAS (tab Results dalam butiran kelas) ============ */
export function ClassResultsPanel({ classId, onReport }: { classId: string; onReport: (s: { id: string; name: string }) => void }) {
  const { data, loading, error } = useFetch(() => api.classResults(classId), [classId])
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">{tr('Loading…')}</p>
  if (error) return <p className="py-10 text-center text-sm text-danger">{error}</p>
  if (!data || data.exams.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">{tr('No exam marks have been entered for this class yet. Open an exam on the Exams page after its date to enter marks.')}</Card>
  const csv = () => download(`${data.class.name.replace(/\W+/g, '-')}-results.csv`, toCsv([
    ['Student', ...data.exams.map((e) => `${e.title}${e.subject ? ` (${e.subject}, /${e.maxMark})` : ` (/${e.maxMark})`}`), 'Average %', 'Grade'],
    ...data.students.map((s) => [s.name, ...s.cells.map((c) => (c.absent ? 'Absent' : c.mark === null ? '' : String(c.mark))), s.average === null ? '' : String(s.average), s.grade ?? '']),
  ]))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><Button variant="outline" icon="download" onClick={csv}>{tr('Export CSV')}</Button></div>
      <TableWrap>
        <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Student')}</Th>{data.exams.map((e) => <Th key={e.id}>{tr(e.title)}<span className="block text-[12px] font-normal normal-case text-muted-foreground">{tr(e.subject ?? '')} · /{e.maxMark}</span></Th>)}<Th>{tr('Average')}</Th><Th>{tr('Grade')}</Th></tr></thead>
        <tbody className="divide-y divide-border">
          {data.students.map((s) => (
            <tr key={s.studentId}>
              <Td><button className="font-semibold text-foreground hover:text-primary hover:underline" onClick={() => onReport({ id: s.studentId, name: s.name })}>{s.name}</button></Td>
              {s.cells.map((c) => <Td key={c.examId} className="tnum">{c.absent ? <Badge>{tr('Absent')}</Badge> : c.mark === null ? <span className="text-muted-foreground">{EMPTY}</span> : <>{c.mark} <span className="text-[12px] text-muted-foreground">{c.grade}</span></>}</Td>)}
              <Td className="tnum font-semibold">{s.average === null ? EMPTY : `${s.average}%`}</Td>
              <Td>{s.grade ? <Badge>{s.grade}</Badge> : EMPTY}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  )
}

/* ============ KAD LAPORAN SEORANG PELAJAR ============ */
export function StudentReportModal({ student, onClose }: { student: { id: string; name: string } | null; onClose: () => void }) {
  const { user } = useLive()
  const [rep, setRep] = useState<import('../lib/data').StudentReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setRep(null); setErr(null)
    if (student) api.studentReport(student.id).then(setRep).catch((e) => setErr(e instanceof ApiError ? e.message : tr('Something went wrong')))
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={!!student} onClose={onClose} wide title={student ? `${tr('Report card')} · ${student.name}` : 'Report card'}
      footer={<><Button variant="ghost" onClick={onClose}>{tr('Close')}</Button>{rep && rep.items.length > 0 && <Button variant="primary" onClick={() => window.print()}>{tr('Print')}</Button>}</>}>
      {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
      {!rep && !err && <p className="py-8 text-center text-sm text-muted-foreground">{tr('Loading…')}</p>}
      {rep && (rep.items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{tr('No exam results for {name} yet.', { name: rep.student.name })}</p> : (
        <div className="printable-report flex flex-col gap-4">
          <div className="print-only hidden border-b-2 border-black pb-3">
            <h1 className="font-display text-xl font-bold">{user.org.name}</h1>
            <p className="text-xs uppercase tracking-wider">{tr('Slip Keputusan Peperiksaan · Student Report Card')}</p>
            <div className="mt-2 flex justify-between text-sm">
              <span><b>Student / Nama:</b> {rep.student.name}</span>
              <span><b>Class / Kelas:</b> {rep.student.class ?? EMPTY}</span>
              <span><b>Date:</b> {new Date().toISOString().slice(0, 10)}</span>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground">{rep.student.class ?? tr('No class')} · {tp(rep.summary.exams, '{n} exam', '{n} exams')} · {tr('overall')} <b className="text-foreground">{rep.summary.average}%</b>{rep.summary.grade ? ` (${rep.summary.grade})` : ''}</p>
          <div className="flex flex-wrap gap-2">{rep.summary.subjects.map((s) => <Badge key={s.subject}>{`${tr(s.subject)}: ${s.average}% ${s.grade}`}</Badge>)}</div>
          <TableWrap>
            <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Exam')}</Th><Th>{tr('Subject')}</Th><Th>{tr('Mark')}</Th><Th>%</Th><Th>{tr('Grade')}</Th><Th>{tr('Class avg')}</Th><Th>{tr('Rank')}</Th></tr></thead>
            <tbody className="divide-y divide-border">
              {rep.items.map((i) => (
                <tr key={i.examId}>
                  <Td className="font-semibold">{tr(i.title)}<span className="block text-[12px] font-normal text-muted-foreground">{i.date}</span></Td>
                  <Td className="text-muted-foreground">{tr(i.subject ?? EMPTY)}</Td>
                  <Td className="tnum">{i.absent ? <Badge>{tr('Absent')}</Badge> : `${i.mark}/${i.maxMark}`}</Td>
                  <Td className="tnum">{i.pct === null ? EMPTY : `${i.pct}%`}</Td>
                  <Td>{i.grade ? <Badge tone={i.passed ? 'ok' : 'danger'}>{i.grade}</Badge> : EMPTY}</Td>
                  <Td className="tnum text-muted-foreground">{i.classAverage === null ? EMPTY : `${i.classAverage}%`}</Td>
                  <Td className="tnum">{i.rank === null ? EMPTY : `${i.rank} / ${i.outOf}`}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="print-only hidden pt-10 text-xs">
            <div className="grid grid-cols-3 gap-8 pt-8 text-center">
              <div className="border-t border-black pt-2">{tr('Class Teacher / Guru Kelas')}</div>
              <div className="border-t border-black pt-2">{tr('Principal / Pengetua')}</div>
              <div className="border-t border-black pt-2">{tr('Parent / Ibu Bapa / Penjaga')}</div>
            </div>
          </div>
        </div>
      ))}
    </Modal>
  )
}
