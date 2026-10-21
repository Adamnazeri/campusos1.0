import { useEffect, useState } from 'react'
import { t as tr, tp } from '../lib/i18n'
import { Avatar, Badge, Button, Card, cx, Field, Input, Modal, Select, useToast } from '../lib/ui'
import { Icon } from '../lib/icons'
import { api, fmtDay, whatsappUrl } from '../lib/api'
import { useSession } from '../lib/session'
import { ImportModal } from './ImportModal'
import { blankIfDash } from '../lib/format'
import { useFetch, useLive } from '../lib/live'
import type { Teacher, ClassRow, Room, Student } from '../lib/data'
import { EMPTY } from '../lib/empty'

/* ---------- pengesahan tindakan berbahaya ---------- */
export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onClose, danger = true }: {
  open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> | void; onClose: () => void; danger?: boolean
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{tr(confirmLabel)}</Button></>}>
      <p className="text-sm text-foreground">{tr(message)}</p>
    </Modal>
  )
}

/* ---------- edit guru ---------- */
export function EditTeacherModal({ teacher, open, onClose }: { teacher: Teacher; open: boolean; onClose: () => void }) {
  const { act } = useLive()
  const deptsQ = useFetch(() => api.departments())
  const branchesQ = useFetch(() => api.branches())
  const init = () => ({
    name: teacher.name, email: teacher.email, phone: blankIfDash(teacher.phone), department: blankIfDash(teacher.department), branch: blankIfDash(teacher.branch),
    title: teacher.role, hours: String(teacher.hours), subjects: teacher.subjects.join(', '),
  })
  const [f, setF] = useState(init)
  useEffect(() => { if (open) setF(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const r = await act(() => api.patchTeacher(teacher.id, {
      name: f.name, email: f.email, phone: f.phone || null, department: f.department || null, branch: f.branch || null, title: f.title,
      weeklyHours: Number(f.hours) || 0, subjects: f.subjects.split(',').map((s) => s.trim()).filter(Boolean),
    }), { ok: { title: tr('Teacher updated'), desc: f.name }, reload: ['teachers', 'classes', 'overview', 'workload'] })
    if (r) onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={tr('Edit teacher')} wide footer={<><Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void save()}>{tr('Save changes')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('Full name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={tr('Work email')}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={tr('Phone')}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={tr('Role')}><Select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}>{[...new Set(['Teacher', 'Senior Teacher', 'Coordinator', f.title])].map((r) => <option key={r} value={r}>{tr(r)}</option>)}</Select></Field>
        <Field label={tr('Department')}><Select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">{tr('None')}</option>{(deptsQ.data?.items ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.name}>{tr(d.name)}</option>)}</Select></Field>
        <Field label={tr('Branch')}><Select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">{tr('None')}</option>{(branchesQ.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.name}>{tr(b.name)}</option>)}</Select></Field>
        <Field label={tr('Weekly hours target')}><Input type="number" min={0} max={80} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
        <Field label={tr('Subjects')} hint={tr('Separate with commas')}><Input value={f.subjects} onChange={(e) => setF({ ...f, subjects: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

/* ---------- edit kelas ---------- */
export function EditClassModal({ cls, open, onClose }: { cls: ClassRow; open: boolean; onClose: () => void }) {
  const { act, teachers, rooms } = useLive()
  const branchesQ = useFetch(() => api.branches())
  const init = () => ({ name: cls.name, teacher: blankIfDash(cls.teacher), room: blankIfDash(cls.room), branch: blankIfDash(cls.branch) })
  const [f, setF] = useState(init)
  useEffect(() => { if (open) setF(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const r = await act(() => api.patchClass(cls.id, { name: f.name, teacher: f.teacher || null, room: f.room || null, branch: f.branch || null }),
      { ok: { title: tr('Class updated'), desc: f.name }, reload: ['classes', 'overview', 'workload', 'timetable'] })
    if (r) onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={tr('Edit class')} wide footer={<><Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void save()}>{tr('Save changes')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('Class name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={tr('Class teacher')} hint={tr('Subject teachers are set on the Subjects page.')}><Select value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value="">{tr('Unassigned')}</option>{teachers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</Select></Field>
        <Field label={tr('Room')}><Select value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })}><option value="">{tr('None')}</option>{rooms.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</Select></Field>
        <Field label={tr('Branch')}><Select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">{tr('None')}</option>{(branchesQ.data?.items ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.name}>{tr(b.name)}</option>)}</Select></Field>
      </div>
    </Modal>
  )
}

/* ---------- edit bilik ---------- */
export function EditRoomModal({ room, open, onClose }: { room: Room; open: boolean; onClose: () => void }) {
  const { act } = useLive()
  const init = () => ({ name: room.name, capacity: String(room.capacity), building: blankIfDash(room.building), type: room.type, maintenance: room.status === 'Maintenance' })
  const [f, setF] = useState(init)
  useEffect(() => { if (open) setF(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const r = await act(() => api.patchRoom(room.id, { name: f.name, capacity: Number(f.capacity) || 1, building: f.building || null, type: f.type, status: f.maintenance ? 'Maintenance' : 'Available' }),
      { ok: { title: tr('Room updated'), desc: f.name }, reload: ['rooms', 'classes', 'timetable'] })
    if (r) onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={tr('Edit room')} footer={<><Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button><Button variant="primary" onClick={() => void save()}>{tr('Save changes')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('Room name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={tr('Capacity')}><Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label={tr('Building')}><Input value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })} /></Field>
        <Field label={tr('Type')}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['Classroom', 'Laboratory', 'Computer Lab', 'Auditorium', 'Library', 'Gym', 'Other'].map((t) => <option key={t} value={t}>{tr(t)}</option>)}</Select></Field>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground sm:col-span-2"><input type="checkbox" checked={f.maintenance} onChange={(e) => setF({ ...f, maintenance: e.target.checked })} /> {tr('Mark as under maintenance (cannot be booked)')}</label>
      </div>
    </Modal>
  )
}

/* ---------- modal tanda kehadiran terus dari ClassDetail (dengan pemilih tarikh & WhatsApp waris) ---------- */
export function MarkAttendanceModal({ classId, className, open, onClose, onSaved }: { classId: string; className: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { act, overview, user } = useLive()
  const today = overview?.date ?? new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const att = useFetch(() => (open ? api.classAttendance(classId, date) : Promise.resolve(null)), [open, classId, date])
  const [list, setList] = useState<Student[]>([])

  useEffect(() => {
    if (att.data?.roster) {
      setList((att.data.roster as Student[]).map((r) => ({ ...r, status: r.status ?? 'Present' })))
    }
  }, [att.data])

  const counts = {
    Present: list.filter((s) => s.status === 'Present').length,
    Absent: list.filter((s) => s.status === 'Absent').length,
    Late: list.filter((s) => s.status === 'Late').length,
  }
  const cycle: Record<string, Student['status']> = { Present: 'Absent', Absent: 'Late', Late: 'Present' }

  async function save() {
    const r = await act(() => api.putAttendance(classId, { date, records: list.map((s) => ({ studentId: s.id, status: s.status })) }),
      { ok: { title: tr('Attendance saved'), desc: `${className} (${date}) · ${tr('{p} present, {a} absent', { p: counts.Present, a: counts.Absent })}` }, reload: ['classes', 'overview'] })
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${tr('Attendance')} · ${className}`} wide
      footer={<><Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button><Button variant="primary" disabled={list.length === 0} onClick={() => void save()}>{tr('Save attendance')}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-muted-foreground">{tr('Date:')}</span>
            <Input type="date" className="w-40" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold">
            <span className="text-ok">{tr('{n} present', { n: counts.Present })}</span>
            <span className="text-danger">{tr('{n} absent', { n: counts.Absent })}</span>
            <span className="text-warn">{tr('{n} late', { n: counts.Late })}</span>
            <Button size="sm" variant="outline" onClick={() => setList((s) => s.map((x) => ({ ...x, status: 'Present' })))}>{tr('Present all')}</Button>
          </div>
        </div>
        {att.loading && list.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{tr('Loading roster…')}</p> : list.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{tr('No students in this class yet.')}</p> : (
          <Card className="max-h-[52vh] divide-y divide-border overflow-y-auto">
            {list.map((s, i) => {
              const wa = s.guardianPhone && (s.status === 'Absent' || s.status === 'Late')
                ? whatsappUrl(s.guardianPhone, `Salam / Hello ${s.guardianName ?? 'Parent/Guardian'}, makluman daripada ${user.org.name}: ${s.name} (${className}) direkodkan ${s.status === 'Absent' ? 'TIDAK HADIR (Absent)' : 'LEWAT (Late)'} pada ${date}. Mohon maklum balas. Terima kasih.`)
                : null
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 font-mono text-[12px] text-muted-foreground tnum">{String(i + 1).padStart(2, '0')}</span>
                  <Avatar name={s.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}{s.studentCode ? ` (${s.studentCode})` : ''}</p>
                    {s.guardianPhone && <p className="text-[12px] text-muted-foreground">{tr('Guardian:')} {s.guardianName ?? EMPTY} · {s.guardianPhone}</p>}
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-ok-soft px-3 py-1 text-[12px] font-semibold text-ok hover:bg-ok hover:text-background">{tr('WhatsApp Waris')}</a>
                  )}
                  <button type="button" onClick={() => setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: cycle[x.status!] } : x)))}
                    className={cx('w-20 rounded-lg px-3 py-2 text-center text-[12px] font-bold', s.status === 'Present' ? 'bg-ok-soft text-ok' : s.status === 'Absent' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>
                    {tr(s.status!)}
                  </button>
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </Modal>
  )
}

export type RosterStudent = {
  id: string; name: string; studentCode?: string | null; guardianName?: string | null; guardianPhone?: string | null; guardianEmail?: string | null; notes?: string | null
}

/* ---------- pelajar dalam kelas: tambah, maklumat waris/ID, pindah/naik kelas, eksport & padam PDPA ---------- */
export function StudentsPanel({ classId, roster, onChanged, onReport }: { classId: string; roster: RosterStudent[]; onChanged: () => void; onReport?: (s: { id: string; name: string }) => void }) {
  const { act, classes, user } = useLive()
  const { push } = useToast()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [names, setNames] = useState('')
  const [editing, setEditing] = useState<(RosterStudent & { classId: string }) | null>(null)
  const [removing, setRemoving] = useState<RosterStudent | null>(null)
  const [purge, setPurge] = useState(false)
  const [promForm, setPromForm] = useState({ mode: 'promote' as 'promote' | 'graduate', toClassId: '', academicYear: '' })
  const parsed = names.split('\n').map((n) => n.trim()).filter(Boolean)

  async function add() {
    if (!parsed.length) return
    const r = await act(() => api.addStudents(classId, parsed), { ok: { title: tp(parsed.length, '{n} student added', '{n} students added') }, reload: ['classes', 'overview'] })
    if (r) { setAdding(false); setNames(''); onChanged() }
  }
  async function save() {
    if (!editing) return
    const r = await act(() => api.patchStudent(editing.id, {
      name: editing.name,
      classId: editing.classId || null,
      studentCode: editing.studentCode || null,
      guardianName: editing.guardianName || null,
      guardianPhone: editing.guardianPhone || null,
      guardianEmail: editing.guardianEmail || null,
      notes: editing.notes || null,
    }), { ok: { title: tr('Student updated') }, reload: ['classes'] })
    if (r) { setEditing(null); onChanged() }
  }
  async function exportPdpa(s: { id: string; name: string }) {
    try {
      const data = await api.exportStudent(s.id)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: `student-pdpa-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json` })
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      push({ title: tr('PDPA data exported'), desc: `${s.name} (JSON)`, tone: 'ok' })
    } catch {
      push({ title: tr('Could not export student data'), tone: 'danger' })
    }
  }
  async function remove() {
    if (!removing) return
    await act(() => api.removeStudent(removing.id, purge), {
      ok: { title: purge ? 'Student permanently erased (PDPA)' : 'Student removed', desc: removing.name },
      reload: ['classes', 'overview'],
    })
    setRemoving(null); setPurge(false); onChanged()
  }
  async function promote() {
    const graduate = promForm.mode === 'graduate'
    if (!graduate && !promForm.toClassId) return
    const r = await act(() => api.promoteStudents({
      fromClassId: classId,
      ...(graduate ? { graduate: true } : { toClassId: promForm.toClassId }),
      ...(promForm.academicYear.trim() ? { academicYear: promForm.academicYear.trim() } : {}),
    }), {
      ok: { title: graduate ? 'Students graduated' : 'Students promoted', desc: tp(roster.length, '{n} student processed.', '{n} students processed.') },
      reload: ['classes', 'overview'],
    })
    if (r) { setPromoting(false); onChanged() }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {roster.length > 0 && <Button variant="outline" onClick={() => { setPromForm({ mode: 'promote', toClassId: classes.find((c) => c.id !== classId)?.id ?? '', academicYear: '' }); setPromoting(true) }}>{tr('Promote / Rollover')}</Button>}
        <Button variant="outline" onClick={() => setImporting(true)}>{tr('Import CSV')}</Button>
        <Button icon="plus" variant="primary" onClick={() => setAdding(true)}>{tr('Add students')}</Button>
      </div>
      <ImportModal kind="students" classId={classId} open={importing} onClose={() => { setImporting(false); onChanged() }} />
      <Card className="divide-y divide-border">
        {roster.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{tr('No students in this class yet. Add them one per line or import a CSV with student ID and parent contact info.')}</p>}
        {roster.map((s, i) => {
          const wa = whatsappUrl(s.guardianPhone, `Salam / Hello ${s.guardianName ?? 'Parent/Guardian'}, makluman daripada ${user.org.name} mengenai ${s.name}.`)
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-6 font-mono text-[12px] text-muted-foreground tnum">{String(i + 1).padStart(2, '0')}</span>
              <Avatar name={s.name} size={30} />
              <div className="min-w-[160px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  {s.studentCode && <Badge tone="neutral">{s.studentCode}</Badge>}
                </div>
                {(s.guardianName || s.guardianPhone) && (
                  <p className="text-[12px] text-muted-foreground">
                    {tr('Guardian:')} {s.guardianName || EMPTY}
                    {s.guardianPhone && <> · <a href={`tel:${s.guardianPhone}`} className="font-medium text-primary hover:underline">{s.guardianPhone}</a></>}
                    {wa && <> · <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-ok hover:underline">{tr('WhatsApp')}</a></>}
                  </p>
                )}
              </div>
              {onReport && <button className="rounded-lg px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary-soft" aria-label={`Report card for ${s.name}`} onClick={() => onReport(s)}>{tr('Report')}</button>}
              <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ ...s, classId })}><Icon.settings width={16} height={16} /></button>
              <button className="rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${s.name}`} onClick={() => { setPurge(false); setRemoving(s) }}><Icon.x width={16} height={16} /></button>
            </div>
          )
        })}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={tr('Add students')}
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>{tr('Cancel')}</Button><Button variant="primary" disabled={!parsed.length} onClick={() => void add()}>{parsed.length ? tp(parsed.length, 'Add {n} student', 'Add {n} students') : tr('Add students')}</Button></>}>
        <Field label={tr('Student names')} hint={tr('One name per line: paste a whole class list at once. To include Student ID and Guardian contacts in bulk, use Import CSV.')}>
          <textarea className="min-h-[160px] w-full rounded-lg border border-border bg-surface-2 p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Aisyah binti Rahman\nWei Jie Tan\nPriya Nair'} />
        </Field>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={tr('Edit student & guardian details')} wide
        footer={<>
          {editing && <Button variant="outline" icon="download" className="mr-auto" onClick={() => void exportPdpa(editing)}>{tr('Export PDPA JSON')}</Button>}
          <Button variant="ghost" onClick={() => setEditing(null)}>{tr('Cancel')}</Button>
          <Button variant="primary" onClick={() => void save()}>{tr('Save')}</Button>
        </>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr('Full name')}><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label={tr('Student ID / Matric / MyKid')}><Input placeholder={tr('e.g. SMK-2026-001')} value={editing.studentCode ?? ''} onChange={(e) => setEditing({ ...editing, studentCode: e.target.value })} /></Field>
            <Field label={tr('Class')} hint={tr('Moving a student keeps their attendance & exam history.')}><Select value={editing.classId} onChange={(e) => setEditing({ ...editing, classId: e.target.value })}><option value="">{tr('No class')}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={tr('Parent / Guardian name')}><Input placeholder={tr('e.g. Rahman bin Ali')} value={editing.guardianName ?? ''} onChange={(e) => setEditing({ ...editing, guardianName: e.target.value })} /></Field>
            <Field label={tr('Guardian phone / WhatsApp')}><Input placeholder="e.g. 012-3456789" value={editing.guardianPhone ?? ''} onChange={(e) => setEditing({ ...editing, guardianPhone: e.target.value })} /></Field>
            <Field label={tr('Guardian email')}><Input type="email" placeholder={tr('parent@example.com')} value={editing.guardianEmail ?? ''} onChange={(e) => setEditing({ ...editing, guardianEmail: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label={tr('Notes (medical / welfare / remarks)')}><Input placeholder={tr('Optional notes for teachers…')} value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field></div>
          </div>
        )}
      </Modal>

      <Modal open={promoting} onClose={() => setPromoting(false)} title={tr('Promote / Rollover students')}
        footer={<><Button variant="ghost" onClick={() => setPromoting(false)}>{tr('Cancel')}</Button><Button variant="primary" disabled={promForm.mode === 'promote' && !promForm.toClassId} onClick={() => void promote()}>{promForm.mode === 'graduate' ? tr('Graduate {n} students', { n: roster.length }) : tr('Move {n} students', { n: roster.length })}</Button></>}>
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-muted-foreground">{tr('Move all {n} active students in this class to their next form/year class, or graduate them at the end of the academic year. Past attendance and exam records are preserved.', { n: roster.length })}</p>
          <Field label={tr('Action')}>
            <Select value={promForm.mode} onChange={(e) => setPromForm({ ...promForm, mode: e.target.value as 'promote' | 'graduate' })}>
              <option value="promote">{tr('Promote to another class')}</option>
              <option value="graduate">{tr('Graduate / complete schooling (archive students)')}</option>
            </Select>
          </Field>
          {promForm.mode === 'promote' && (
            <Field label={tr('Destination class')}>
              <Select value={promForm.toClassId} onChange={(e) => setPromForm({ ...promForm, toClassId: e.target.value })}>
                <option value="">{tr('Select destination class…')}</option>
                {classes.filter((c) => c.id !== classId).map((c) => <option key={c.id} value={c.id}>{c.name} ({tp(c.students, '{n} student', '{n} students')})</option>)}
              </Select>
            </Field>
          )}
          <Field label={tr('Update organization academic year (optional)')} hint={tr('Leave blank to keep the current academic year.')}>
            <Input placeholder="e.g. 2026/27" value={promForm.academicYear} onChange={(e) => setPromForm({ ...promForm, academicYear: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title={tr('Remove student')}
        footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>{tr('Cancel')}</Button><Button variant="danger" onClick={() => void remove()}>{purge ? 'Erase permanently' : 'Remove'}</Button></>}>
        <div className="flex flex-col gap-3 text-sm text-foreground">
          <p>{tr('Remove')} <b>{removing?.name}</b> {tr('from the school? By default, their past attendance and exam marks stay in historical reports.')}</p>
          <label className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-[14px]">
            <input type="checkbox" className="mt-1" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
            <span><b>{tr('Permanently erase all records (PDPA request):')}</b> {tr('deletes the student profile, attendance history, assignment submissions, and exam marks permanently.')}</span>
          </label>
        </div>
      </Modal>
    </>
  )
}


/* ---------- kod pemulihan 2FA (dipaparkan sekali sahaja) ---------- */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const text = codes.join('\n')
  function download() {
    const url = URL.createObjectURL(new Blob([`CampusOS recovery codes\nEach code works once. Keep them somewhere safe.\n\n${text}\n`], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'campusos-recovery-codes.txt' })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    setSaved(true)
  }
  return (
    <div className="relative mt-4 bg-warn-soft p-4 chamfer">
      <p className="text-sm font-semibold text-foreground">{tr('Save your recovery codes')}</p>
      <p className="mt-1 text-[14px] text-muted-foreground">{tr('If you lose your phone, each of these codes lets you sign in once. They are shown only now.')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[14px] text-foreground sm:grid-cols-4">{codes.map((c) => <code key={c} className="select-all rounded-md bg-card px-2 py-2 text-center">{c}</code>)}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(text).catch(() => undefined); setSaved(true) }}>{tr('Copy')}</Button>
        <Button size="sm" variant="outline" icon="download" onClick={download}>{tr('Download')}</Button>
        <Button size="sm" variant="primary" disabled={!saved} onClick={onDone}>{tr('I have saved them')}</Button>
      </div>
    </div>
  )
}

/* ---------- pautan jemputan manual (bila e-mel belum disediakan) ---------- */
export const inviteUrl = (token: string) => `${window.location.origin}/?invite=${token}`
export function ManualInviteModal({ email, token, error, onClose }: { email: string; token: string | null; error?: string | null; onClose: () => void }) {
  const url = token ? inviteUrl(token) : ''
  return (
    <Modal open={!!token} onClose={onClose} title={tr('Share this invitation link')} footer={<><Button variant="outline" onClick={() => { navigator.clipboard?.writeText(url).catch(() => undefined) }}>{tr('Copy link')}</Button><Button variant="primary" onClick={onClose}>{tr('Done')}</Button></>}>
      {error
        ? <p className="text-sm text-foreground">{tr('The invitation email to {email} could not be sent ({error}). Send them this link yourself (WhatsApp, etc.). It works once and expires in 7 days.', { email, error })}</p>
        : <p className="text-sm text-foreground">{tr('Email delivery is not set up on this server, so')} <b>{email}</b> {tr('has not been emailed. Send them this link yourself (WhatsApp, etc.). It works once and expires in 7 days.')}</p>}
      <code className="mt-3 block select-all break-all rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-foreground">{url}</code>
      <p className="mt-3 text-[12px] text-muted-foreground">{error ? tr('Ask your administrator to check the SMTP settings (password, sender address, port). The server will also retry automatically.') : tr('Ask your administrator to set up SMTP so invitations are emailed automatically.')}</p>
    </Modal>
  )
}

/* ---------- pengguna & jemputan ---------- */
export function UsersPanel({ roles }: { roles: { id: string; label: string }[] }) {
  const { act } = useLive()
  const { push } = useToast()
  const { user: me } = useSession()
  const users = useFetch(() => api.users())
  const invites = useFetch(() => api.invites())
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('teacher')
  const [manual, setManual] = useState<{ email: string; token: string; error?: string } | null>(null)
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null)
  const assignable = roles.filter((r) => r.id !== 'owner' || me.role === 'owner')

  async function invite() {
    const to = email.trim()
    const r = await act(() => api.invite({ email: to, role }))
    if (!r) return
    setEmail(''); invites.reload()
    if (r.emailed) push({ title: tr('Invitation emailed'), desc: to, tone: 'ok' })
    else if (r.token) setManual({ email: to, token: r.token, error: r.emailError })
  }
  async function patchUser(id: string, b: Record<string, unknown>, title: string) {
    const r = await act(() => api.patchUser(id, b), { ok: { title } })
    if (r) users.reload()
  }
  const fmt = (ms: number | null) => (ms ? `${fmtDay(new Date(ms).toISOString().slice(0, 10))} ${new Date(ms).getFullYear()}` : tr('Never'))

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card className="p-5">
        <h3 className="font-display text-[16px] font-semibold text-card-foreground">{tr('Invite someone')}</h3>
        <p className="mt-1 text-[14px] text-muted-foreground">{tr('They receive an email link to set a password. Links expire after 7 days.')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <Input type="email" placeholder={tr('name@school.edu')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select value={role} onChange={(e) => setRole(e.target.value)}>{assignable.map((r) => <option key={r.id} value={r.id}>{tr(r.label)}</option>)}</Select>
          <Button variant="primary" disabled={!email.trim()} onClick={() => void invite()}>{tr('Send invite')}</Button>
        </div>
        {me.features?.mail === false && <p role="status" className="mt-3 rounded-lg bg-warn-soft p-3 text-[12px] text-foreground">{tr('Email delivery isn\'t set up on this server, so invitations are not emailed. After you invite someone you will get a link to share manually. Ask your administrator to configure SMTP.')}</p>}
        {(invites.data?.items ?? []).length > 0 && (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {invites.data!.items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 font-medium text-foreground">{i.email}</span><Badge>{tr(i.role)}</Badge>
                <span title={i.emailError ?? undefined} className={`text-[12px] ${i.emailStatus === 'failed' ? 'font-medium text-danger' : 'text-muted-foreground'}`}>{i.emailStatus === 'sent' ? tr('Email sent') : i.emailStatus === 'failed' ? tr('Email failed') : i.emailStatus === 'queued' ? tr('Sending…') : tr('Not emailed')}</span>
                <span className="text-[12px] text-muted-foreground">{tr('expires {date}', { date: fmt(i.expiresAt) })}</span>
                <Button size="sm" variant="ghost" onClick={async () => { const r = await act(() => api.invite({ email: i.email, role: i.role })); if (!r) return; invites.reload(); if (r.emailed) push({ title: tr('Invitation re-sent'), desc: i.email, tone: 'ok' }); else if (r.token) setManual({ email: i.email, token: r.token, error: r.emailError }) }}>{tr('Resend')}</Button>
                <Button size="sm" variant="ghost" onClick={async () => { const r = await act(() => api.deleteInvite(i.id), { ok: { title: tr('Invitation revoked') } }); if (r) invites.reload() }}>{tr('Revoke')}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3"><h3 className="font-display text-[16px] font-semibold text-card-foreground">{tr('People with access')}</h3></div>
        <div className="divide-y divide-border">
          {(users.data?.items ?? []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Avatar name={u.name} size={32} />
              <div className="min-w-[160px] flex-1"><p className="text-sm font-semibold text-foreground">{u.name}{u.id === me.id && <span className="ml-2 text-[12px] font-normal text-muted-foreground">{tr('(you)')}</span>}</p><p className="text-[12px] text-muted-foreground">{u.email} · {tr('last sign-in {date}', { date: fmt(u.lastLoginAt) })}</p></div>
              <div className="w-40"><Select value={u.role} disabled={u.id === me.id} onChange={(e) => void patchUser(u.id, { role: e.target.value }, 'Role updated')}>{roles.map((r) => <option key={r.id} value={r.id}>{tr(r.label)}</option>)}</Select></div>
              {!u.active && <Badge tone="danger">{tr('Deactivated')}</Badge>}
              {u.id !== me.id && <>
                <Button size="sm" variant="ghost" onClick={() => setResetFor({ id: u.id, name: u.name })}>{tr('Reset 2FA')}</Button>
                <Button size="sm" variant="ghost" onClick={() => void patchUser(u.id, { active: !u.active }, u.active ? 'Account deactivated' : 'Account reactivated')}>{u.active ? 'Deactivate' : 'Reactivate'}</Button>
              </>}
            </div>
          ))}
        </div>
      </Card>

      <ManualInviteModal email={manual?.email ?? ''} token={manual?.token ?? null} error={manual?.error} onClose={() => setManual(null)} />
      <ConfirmModal open={!!resetFor} onClose={() => setResetFor(null)} title={tr('Reset two-factor')} confirmLabel={tr('Reset 2FA')}
        message={tr('Reset two-factor sign-in for {name}? They are signed out everywhere and can sign in with just their password (they will need to set 2FA up again if your organization requires it). Use this when they lost their phone and recovery codes.', { name: resetFor?.name ?? tr('this person') })}
        onConfirm={async () => { if (resetFor) await act(() => api.resetUser2fa(resetFor.id), { ok: { title: tr('Two-factor reset'), desc: resetFor.name } }); setResetFor(null) }} />
    </div>
  )
}
