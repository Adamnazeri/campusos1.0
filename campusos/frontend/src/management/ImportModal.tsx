import { useMemo, useRef, useState } from 'react'
import { t as tr, tp } from '../lib/i18n'
import { Badge, Button, Modal } from '../lib/ui'
import { api, ApiError, type ImportResult } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { FIELD_LABELS, mapRecords, parseCsv, templateCsv, toCsv, type ImportKind } from '../lib/csv'
import { inviteUrl } from './Manage'
import { useLive } from '../lib/live'

const COPY: Record<ImportKind, { title: string; what: string; hint: string }> = {
  teachers: { title: tr('Import teachers'), what: 'teachers', hint: 'Required columns: name, email. Optional: phone, department, branch, title, weeklyHours, subjects (separate several with ;). Unknown departments are created automatically.' },
  classes: { title: tr('Import classes'), what: 'classes', hint: tr('Required column: name. Optional: classTeacher (name or email of an existing teacher), room, branch. Subjects are assigned afterwards on the Subjects page.') },
  students: { title: tr('Import students'), what: 'students', hint: tr('Required column: name. Optional: class (must already exist), studentCode (or no_kp / no_matrik), guardianName (nama_penjaga), guardianPhone (telefon_penjaga), guardianEmail.') },
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function ImportModal({ kind, open, onClose, classId }: { kind: ImportKind; open: boolean; onClose: () => void; classId?: string }) {
  const { refresh } = useLive()
  const copy = COPY[kind]
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [invite, setInvite] = useState(true)
  const [check, setCheck] = useState<ImportResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapped = useMemo(() => mapRecords(parseCsv(text), kind), [text, kind, classId])
  const rows = mapped.records
  const reset = () => { setText(''); setFileName(''); setCheck(null); setDone(null); setError(null) }
  const close = () => { reset(); onClose() }
  const tooMany = rows.length > 2000

  async function pick(f: File | undefined) {
    if (!f) return
    setCheck(null); setDone(null); setError(null); setFileName(f.name)
    setText(await f.text())
  }
  const call = async (dryRun: boolean) => {
    setBusy(true); setError(null)
    try {
      const r = await api.importRows(kind, { rows, dryRun, ...(kind === 'teachers' ? { invite } : {}), ...(classId ? { classId } : {}) })
      if (dryRun) setCheck(r)
      else { setDone(r); await refresh('teachers', 'classes', 'subjects', 'overview', 'workload') }
    } catch (e) { setError(e instanceof ApiError ? e.message : tr('Something went wrong')) } finally { setBusy(false) }
  }
  const label = (i: number) => rows[i]?.name || rows[i]?.email || tr('Row {n}', { n: i + 2 })
  const shown = (check ?? done)?.results ?? []
  const problems = shown.filter((r) => r.status === 'error')

  return (
    <Modal open={open} onClose={close} title={copy.title} wide
      footer={done ? <Button variant="primary" onClick={close}>{tr('Done')}</Button> : <>
        <Button variant="ghost" onClick={close}>{tr('Cancel')}</Button>
        {!check ? <Button variant="primary" disabled={busy || !rows.length || mapped.missing.length > 0 || tooMany} onClick={() => void call(true)}>{tr('Check file')}</Button>
          : <Button variant="primary" disabled={busy || check.ok === 0} onClick={() => void call(false)}>{tr('Import {n} {what}', { n: check.ok, what: tr(copy.what) })}{check.errors ? ` (${tr('skip {n}', { n: check.errors })})` : ''}</Button>}
      </>}>
      {done ? (
        <div className="flex flex-col gap-3 text-sm text-foreground">
          <p className="text-base font-semibold">{tr('{n} {what} imported', { n: done.created, what: tr(copy.what) })}{done.errors ? `, ${tr('{n} skipped', { n: done.errors })}` : ''}.</p>
          {kind === 'teachers' && done.created > 0 && (done.emailed ? <p className="text-muted-foreground">{tr('Invitation emails are being sent. They arrive within a couple of minutes.')}</p>
            : done.invites ? <>
              <p className="rounded-lg bg-warn-soft p-3">{tr('Email delivery isn\'t set up on this server, so nobody has been emailed. Download the invitation links and share them yourself.')}</p>
              <div><Button variant="outline" icon="download" onClick={() => download('campusos-invitation-links.csv', toCsv([['name', 'email', 'link'], ...done.invites!.map((i) => [i.name, i.email, inviteUrl(i.token)])]))}>{tr('Download invitation links')}</Button></div>
            </> : null)}
          {problems.length > 0 && <ProblemList problems={problems} label={label} />}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-muted-foreground">{tr(copy.hint)} {tr('Save your Excel sheet as CSV. Column names in Bahasa Melayu (nama, e-mel, kelas, jabatan…) are understood too.')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button variant="outline" icon="download" onClick={() => fileRef.current?.click()}>{tr('Choose CSV file')}</Button>
            <Button variant="ghost" onClick={() => download(`campusos-${kind}-template.csv`, templateCsv(kind))}>{tr('Download template')}</Button>
            {fileName && <span className="text-[14px] text-muted-foreground">{fileName}</span>}
          </div>
          <textarea aria-label={tr('Paste CSV rows')} className="min-h-[96px] w-full rounded-lg border border-border bg-surface-2 p-3 font-mono text-[12px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder={tr('…or paste rows here, including the header line')} value={text} onChange={(e) => { setText(e.target.value); setCheck(null); setError(null) }} />
          {text.trim() && (
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <Badge tone={mapped.missing.length ? 'danger' : 'ok'}>{tp(rows.length, '{n} row', '{n} rows')}</Badge>
              {mapped.recognized.map((f) => <Badge key={f}>{FIELD_LABELS[kind][f]}</Badge>)}
              {mapped.missing.length > 0 && <span className="font-medium text-danger">{tr('Missing column:')} {mapped.missing.map((f) => tr(FIELD_LABELS[kind][f])).join(', ')}</span>}
              {mapped.ignored.length > 0 && <span className="text-muted-foreground">{tr('Ignored:')} {mapped.ignored.join(', ')}</span>}
              {tooMany && <span className="font-medium text-danger">{tr('Too many rows (max 2000 per import).')}</span>}
            </div>
          )}
          {kind === 'teachers' && <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={invite} onChange={(e) => { setInvite(e.target.checked); setCheck(null) }} /> {tr('Send each teacher an invitation email')}</label>}
          {check && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-semibold text-foreground">{tr('{n} ready to import', { n: check.ok })}{check.errors ? `, ${tr('{n} with problems (they will be skipped)', { n: check.errors })}` : ''}.</p>
              {check.results.some((r) => r.note) && <ul className="mt-1 list-disc pl-5 text-[14px] text-muted-foreground">{[...new Set(check.results.filter((r) => r.note).map((r) => r.note))].slice(0, 5).map((n) => <li key={n}>{n}</li>)}</ul>}
              {problems.length > 0 && <ProblemList problems={problems} label={label} />}
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-[14px] font-medium text-danger">{error}</p>}
    </Modal>
  )
}

function ProblemList({ problems, label }: { problems: { line: number; message?: string }[]; label: (i: number) => string }) {
  return (
    <div className="mt-2 max-h-48 overflow-auto rounded-lg bg-danger-soft p-2 text-[12px]">
      {problems.slice(0, 100).map((p) => <p key={p.line} className="py-1 text-foreground"><b>{tr('Line {n}', { n: p.line })}</b> · {label(p.line - 2)}. {friendlyError('VALIDATION_ERROR', p.message ?? '')}</p>)}
      {problems.length > 100 && <p className="pt-1 text-muted-foreground">{tr('…and {n} more.', { n: problems.length - 100 })}</p>}
    </div>
  )
}
