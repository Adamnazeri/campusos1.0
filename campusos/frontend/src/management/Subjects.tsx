import { useEffect, useState } from 'react'
import { t as tr, tp } from '../lib/i18n'
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Tabs } from '../lib/ui'
import { Td, Th, TableWrap } from '../components/common'
import { useApp } from '../lib/store'
import { useLive } from '../lib/live'
import { api } from '../lib/api'
import { ConfirmModal } from './Manage'
import type { ClassRow, ClassSubject, SubjectRow } from '../lib/data'
import { EMPTY } from '../lib/empty'

const RELOAD = ['classes', 'subjects', 'teachers', 'workload', 'timetable', 'overview'] as const

/* ---------- tetapkan: kelas ini mengambil subjek ini, diajar oleh siapa ---------- */
export function AssignSubjectModal({ cls, subject, link, open, onClose }: { cls: ClassRow; subject: SubjectRow; link?: ClassSubject; open: boolean; onClose: () => void }) {
  const { act, teachers } = useLive()
  const [teacher, setTeacher] = useState('')
  const [periods, setPeriods] = useState('0')
  const [removing, setRemoving] = useState(false)
  useEffect(() => { if (open) { setTeacher(link?.teacherId ?? ''); setPeriods(String(link?.periodsPerWeek ?? 0)) } }, [open, link])
  // guru yang layak (subjek mereka sepadan) dipaparkan dahulu
  const qualified = (t: { subjects: string[] }) => t.subjects.some((s) => s.toLowerCase() === subject.name.toLowerCase())
  const sorted = [...teachers].sort((a, b) => Number(qualified(b)) - Number(qualified(a)) || a.name.localeCompare(b.name))

  async function save() {
    const body = { teacher: teacher || null, periodsPerWeek: Number(periods) || 0 }
    const r = await act(() => (link ? api.patchClassSubject(link.id, body) : api.assignSubject(cls.id, { subject: subject.id, ...body })),
      { ok: { title: link ? 'Updated' : 'Subject assigned', desc: `${cls.name} · ${tr(subject.name)}` }, reload: [...RELOAD] })
    if (r) onClose()
  }
  async function remove() {
    if (!link) return
    const r = await act(() => api.removeClassSubject(link.id), { ok: { title: tr('Subject removed'), desc: `${cls.name} · ${tr(subject.name)}` }, reload: [...RELOAD] })
    setRemoving(false)
    if (r) onClose()
  }
  return (
    <>
      <Modal open={open} onClose={onClose} title={`${cls.name} · ${tr(subject.name)}`}
        footer={<>{link && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setRemoving(true)}>{tr('Remove subject')}</Button>}
          <Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void save()}>{link ? tr('Save') : tr('Assign subject')}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label={tr('Teacher for this subject')} hint={tr('Teachers whose subjects include this one are listed first.')}>
            <Select value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">{tr('Not assigned yet')}</option>
              {sorted.map((t) => <option key={t.id} value={t.id}>{t.name}{qualified(t) ? `: ${tr('teaches {name}', { name: tr(subject.name) })}` : ''}</option>)}
            </Select>
          </Field>
          <Field label={tr('Periods per week')} hint={tr('Optional. Used for planning only.')}><Input type="number" min={0} max={60} value={periods} onChange={(e) => setPeriods(e.target.value)} /></Field>
        </div>
      </Modal>
      <ConfirmModal open={removing} onClose={() => setRemoving(false)} title={tr('Remove subject from class')} confirmLabel={tr('Remove')}
        message={tr('Stop teaching {subject} to {cls}? This is blocked while it still has sessions in the timetable.', { subject: tr(subject.name), cls: cls.name })} onConfirm={remove} />
    </>
  )
}

/* ---------- subjek dalam satu kelas (tab dalam butiran kelas) ---------- */
export function ClassSubjectsPanel({ cls }: { cls: ClassRow }) {
  const { subjects } = useLive()
  const { navigate } = useApp()
  const [editing, setEditing] = useState<ClassSubject | null>(null)
  const [adding, setAdding] = useState('')
  const taken = new Set(cls.subjects.map((s) => s.subjectId))
  const free = subjects.filter((s) => !taken.has(s.id))
  const addSubject = subjects.find((s) => s.id === adding)
  return (
    <div className="flex flex-col gap-4">
      <Card className="divide-y divide-border">
        {cls.subjects.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{tr('{name} does not take any subject yet. Add the first one below.', { name: cls.name })}</p>}
        {cls.subjects.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-[160px] flex-1"><p className="text-sm font-semibold text-foreground">{tr(s.subject)}</p><p className="text-[12px] text-muted-foreground">{s.teacher ?? tr('No teacher assigned')}{s.periodsPerWeek ? ` · ${tr('{n} periods/week', { n: s.periodsPerWeek })}` : ''}</p></div>
            {!s.teacher && <Badge tone="warn">{tr('Needs teacher')}</Badge>}
            <Button size="sm" variant="outline" onClick={() => setEditing(s)}>{tr('Change teacher')}</Button>
          </div>
        ))}
      </Card>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1"><Field label={tr('Add a subject to this class')}>
          <Select value={adding} onChange={(e) => setAdding(e.target.value)}><option value="">{free.length ? tr('Choose a subject…') : tr('All subjects already added')}</option>{free.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}</Select>
        </Field></div>
        {addSubject && <AssignSubjectModal cls={cls} subject={addSubject} open onClose={() => setAdding('')} />}
        <button onClick={() => navigate('subjects')} className="pb-2 text-[14px] font-semibold text-primary hover:underline">{tr('Manage the subject list')}</button>
      </Card>
      {editing && <AssignSubjectModal cls={cls} subject={subjects.find((x) => x.id === editing.subjectId) ?? { id: editing.subjectId, name: editing.subject, code: null, classes: 0, teachers: [] }} link={editing} open onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ============ HALAMAN SUBJECTS ============ */
export function Subjects() {
  const { classes, subjects, act } = useLive()
  const [tab, setTab] = useState('matrix')
  const [cell, setCell] = useState<{ cls: ClassRow; subject: SubjectRow; link?: ClassSubject } | null>(null)
  const [edit, setEdit] = useState<{ id?: string; name: string; code: string } | null>(null)
  const [del, setDel] = useState<SubjectRow | null>(null)
  const [onlyGaps, setOnlyGaps] = useState(false)
  const missing = classes.reduce((n, c) => n + c.subjects.filter((s) => !s.teacherId).length, 0)

  async function saveSubject() {
    if (!edit) return
    const r = await act(() => (edit.id ? api.patchSubject(edit.id, { name: edit.name, code: edit.code }) : api.addSubject({ name: edit.name, code: edit.code || undefined })),
      { ok: { title: edit.id ? 'Subject renamed' : 'Subject added', desc: edit.name }, reload: [...RELOAD] })
    if (r) setEdit(null)
  }
  const shownClasses = onlyGaps ? classes.filter((c) => c.subjects.some((s) => !s.teacherId)) : classes

  return (
    <>
      <PageHeader title={tr('Subjects')} subtitle={tr('Classes are groups of students. Subjects are what they study. Decide here which class takes which subject, and who teaches it.')}
        actions={<Button icon="plus" variant="primary" onClick={() => setEdit({ name: '', code: '' })}>{tr('Add subject')}</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'matrix', label: tr('Class × Subject') }, { id: 'list', label: tr('Subject list'), count: subjects.length }]} />
      <div className="mt-4">
        {subjects.length === 0 || classes.length === 0 ? (
          <Empty icon="book" title={subjects.length === 0 ? 'No subjects yet' : 'No classes yet'} desc={subjects.length === 0 ? 'Add the subjects your school teaches (Mathematics, English…). Then assign them to classes.' : 'Create a class first, then assign subjects to it.'}
            action={subjects.length === 0 ? <Button variant="primary" icon="plus" onClick={() => setEdit({ name: '', code: '' })}>{tr('Add subject')}</Button> : undefined} />
        ) : tab === 'matrix' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[14px] text-muted-foreground">
              <span>{tr('Click a cell to give a class a subject, change its teacher, or remove it.')}</span>
              {missing > 0 && <button onClick={() => setOnlyGaps(!onlyGaps)} className="rounded-full bg-warn-soft px-3 py-1 font-semibold text-foreground">{tp(missing, '{n} subject without a teacher', '{n} subjects without a teacher')}{onlyGaps ? ` · ${tr('show all')}` : ` · ${tr('show only these')}`}</button>}
            </div>
            <TableWrap>
              <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Class')}</Th>{subjects.map((s) => <Th key={s.id}>{tr(s.name)}</Th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {shownClasses.map((c) => (
                  <tr key={c.id}>
                    <Td><p className="font-semibold">{c.name}</p><p className="text-[12px] text-muted-foreground">{tp(c.subjects.length, '{n} subject', '{n} subjects')}</p></Td>
                    {subjects.map((s) => {
                      const link = c.subjects.find((x) => x.subjectId === s.id)
                      return (
                        <Td key={s.id}>
                          <button type="button" onClick={() => setCell({ cls: c, subject: s, link })} aria-label={`${c.name} ${s.name}`}
                            className={link ? (link.teacher ? 'w-full rounded-lg bg-primary-soft px-2 py-2 text-left text-[12px] font-semibold text-primary hover:underline' : 'w-full rounded-lg bg-warn-soft px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:underline')
                              : 'w-full rounded-lg border border-dashed border-border px-2 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted'}>
                            {link ? (link.teacher ?? tr('Needs teacher')) : tr('+ Add')}
                          </button>
                        </Td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </>
        ) : (
          <TableWrap>
            <thead className="border-b border-border bg-surface-2"><tr><Th>{tr('Subject')}</Th><Th>{tr('Code')}</Th><Th>{tr('Taken by')}</Th><Th>{tr('Teachers')}</Th><Th /></tr></thead>
            <tbody className="divide-y divide-border">
              {subjects.map((s) => (
                <tr key={s.id}>
                  <Td className="font-semibold">{tr(s.name)}</Td>
                  <Td className="font-mono text-[12px] text-muted-foreground">{s.code ?? EMPTY}</Td>
                  <Td className="tnum">{tp(s.classes, '{n} class', '{n} classes')}</Td>
                  <Td className="text-muted-foreground">{s.teachers.join(', ') || EMPTY}</Td>
                  <Td><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEdit({ id: s.id, name: s.name, code: s.code ?? '' })}>{tr('Rename')}</Button><Button size="sm" variant="ghost" onClick={() => setDel(s)}>{tr('Delete')}</Button></div></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {cell && <AssignSubjectModal cls={cell.cls} subject={cell.subject} link={cell.link} open onClose={() => setCell(null)} />}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Rename subject' : 'Add subject'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{tr('Cancel')}</Button><Button variant="primary" disabled={!edit?.name.trim()} onClick={() => void saveSubject()}>{edit?.id ? 'Save' : 'Add subject'}</Button></>}>
        {edit && <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label={tr('Subject name')}><Input autoFocus placeholder={tr('e.g. Mathematics')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={tr('Code')}><Input placeholder={tr('MATH')} maxLength={20} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
        </div>}
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} title={tr('Delete subject')} confirmLabel={tr('Delete')}
        message={tr('Delete {name}? Subjects that are still taken by a class cannot be deleted. Remove them from those classes first.', { name: del?.name ?? tr('this subject') })}
        onConfirm={async () => { if (del) await act(() => api.deleteSubject(del.id), { ok: { title: tr('Subject deleted'), desc: del.name }, reload: [...RELOAD] }); setDel(null) }} />
    </>
  )
}

/* ---------- pilih subjek bagi kelas yang dipilih (jadual, tugasan, peperiksaan) ---------- */
export function SubjectPicker({ classId, value, onChange, by = 'name', label = tr('Subject'), optional = false }: {
  classId: string; value: string; onChange: (v: string) => void; by?: 'id' | 'name'; label?: string; optional?: boolean
}) {
  const { classes } = useLive()
  const subs = classes.find((c) => c.id === classId)?.subjects ?? []
  const key = (s: ClassSubject) => (by === 'id' ? s.subjectId : s.subject)
  // satu subjek sahaja → pilih automatik
  useEffect(() => { if (classId && subs.length === 1 && value !== key(subs[0])) onChange(key(subs[0])) }, [classId, subs.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field label={label} hint={!classId ? tr('Choose a class first.') : subs.length === 0 ? tr('This class has no subjects yet. Assign one on the Subjects page.') : undefined}>
      <Select value={value} disabled={!classId || subs.length === 0} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional ? tr('Any / not specific') : tr('Choose a subject…')}</option>
        {subs.map((s) => <option key={s.id} value={key(s)}>{tr(s.subject)}{s.teacher ? `: ${s.teacher}` : ''}</option>)}
      </Select>
    </Field>
  )
}
