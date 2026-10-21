import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Teacher, ClassRow, SubjectRow, Room, LeaveReq, Task, Announce, Assignment, Exam, LiveClass, Session } from './data'
import {
  api, ApiError, ago, hhmm, isManagement, toAnnounce, toAssignment, toClass, toExam, toLeave, toLive, toRoom, toSession, toTask, toTeacher,
  type ApiUser,
} from './api'
import { useToast } from './ui'
import { t } from './i18n'

type Key = 'teachers' | 'classes' | 'subjects' | 'rooms' | 'leave' | 'tasks' | 'announcements' | 'assignments' | 'exams' | 'timetable' | 'overview' | 'workload' | 'reach' | 'dash' | 'balances'
type R = any // eslint-disable-line @typescript-eslint/no-explicit-any

export type Conflict = { type: string; day: string; start: string; message: string; sessionIds: string[] }

type Live = {
  user: ApiUser
  management: boolean
  loading: boolean
  teachers: Teacher[]
  classes: ClassRow[]
  subjects: SubjectRow[]
  rooms: Room[]
  leave: LeaveReq[]
  tasks: Task[]
  announcements: Announce[]
  unread: number
  reach: { label: string; count: number }[]
  assignments: Assignment[]
  exams: (Exam & { rawDate: string })[]
  liveClasses: LiveClass[]
  liveNow: R | null
  sessions: Session[]
  days: string[]
  slots: string[]
  conflicts: Conflict[]
  overview: R | null
  activity: { time: string; text: string; by: string }[]
  workload: R | null
  dash: R | null
  balances: R[]
  refresh: (...keys: Key[]) => Promise<void>
  /** Jalankan tindakan API: toast ralat automatik, muat semula sumber yang berkaitan, pulangkan hasil (true jika tiada kandungan) atau undefined jika gagal. */
  act: <T,>(fn: () => Promise<T>, opts?: { ok?: { title: string; desc?: string; tone?: 'default' | 'ok' | 'danger' | 'warn' }; reload?: Key[] }) => Promise<T | undefined>
}

const Ctx = createContext<Live | null>(null)
export const useLive = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLive di luar LiveProvider')
  return c
}

export function LiveProvider({ user, children }: { user: ApiUser; children: ReactNode }) {
  const { push } = useToast()
  const management = isManagement(user)
  const [loading, setLoading] = useState(true)
  const [d, setD] = useState<Partial<Record<string, any>>>({}) // eslint-disable-line @typescript-eslint/no-explicit-any

  const loaders = useMemo<Record<Key, () => Promise<R>>>(() => ({
    teachers: async () => ({ teachers: (await api.teachers()).items.map(toTeacher) }),
    classes: async () => ({ classes: (await api.classes()).items.map(toClass) }),
    subjects: async () => ({ subjects: (await api.subjects()).items }),
    rooms: async () => ({ rooms: (await api.rooms()).items.map(toRoom) }),
    leave: async () => ({ leave: (await api.leave()).items.map(toLeave) }),
    tasks: async () => ({ tasks: (await api.tasks()).items.map(toTask) }),
    announcements: async () => { const r = await api.announcements(); return { announcements: r.items.map(toAnnounce), unread: r.unread } },
    assignments: async () => ({ assignments: (await api.assignments()).items.map(toAssignment) }),
    exams: async () => ({ exams: (await api.exams()).items.map(toExam) }),
    timetable: async () => {
      const t = await api.timetable()
      return { sessions: t.sessions.map(toSession), days: t.days, slots: t.slots, conflicts: t.conflicts }
    },
    overview: async () => {
      const [overview, act] = await Promise.all([api.overview(), api.activity()])
      return {
        overview, liveNow: overview.live, liveClasses: overview.live.items.map(toLive),
        activity: act.items.map((a) => ({ time: ago(a.at), text: a.text, by: a.actor })),
      }
    },
    workload: async () => ({ workload: await api.workload() }),
    reach: async () => ({ reach: (await api.announcementReach()).items }),
    dash: async () => ({ dash: await api.myDashboard() }),
    balances: async () => ({ balances: (await api.leaveBalance()).balances }),
  }), [])

  const keys: Key[] = useMemo(
    () => (management
      ? ['teachers', 'classes', 'subjects', 'rooms', 'leave', 'tasks', 'announcements', 'assignments', 'exams', 'timetable', 'overview', 'workload', 'reach']
      : ['classes', 'subjects', 'leave', 'tasks', 'announcements', 'assignments', 'exams', 'timetable', 'dash', 'balances']),
    [management],
  )

  const refresh = useCallback(async (...ks: Key[]) => {
    const list = ks.length ? ks : keys
    const results = await Promise.allSettled(list.map((k) => loaders[k]()))
    const merged: R = {}
    results.forEach((r) => { if (r.status === 'fulfilled') Object.assign(merged, r.value) })
    setD((cur) => ({ ...cur, ...merged }))
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (failed && !ks.length) push({ title: t('Some data could not be loaded'), desc: failed.reason instanceof ApiError ? failed.reason.message : undefined, tone: 'danger' })
  }, [keys, loaders, push])

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  const act: Live['act'] = useCallback(async (fn, opts) => {
    try {
      const r = await fn()
      if (opts?.ok) push({ title: opts.ok.title, desc: opts.ok.desc, tone: opts.ok.tone ?? 'ok' })
      if (opts?.reload?.length) await refresh(...opts.reload)
      // tindakan tanpa kandungan (204) pulangkan `true` supaya pemanggil boleh bezakan berjaya daripada gagal (undefined)
      return (r === undefined ? (true as unknown as typeof r) : r)
    } catch (e) {
      push({ title: t('Something went wrong'), desc: e instanceof ApiError ? e.message : t('Something went wrong'), tone: 'danger' })
      return undefined
    }
  }, [push, refresh])

  const value: Live = {
    user, management, loading,
    teachers: d.teachers ?? [], classes: d.classes ?? [], subjects: d.subjects ?? [], rooms: d.rooms ?? [], leave: d.leave ?? [], tasks: d.tasks ?? [],
    announcements: d.announcements ?? [], unread: d.unread ?? 0, reach: d.reach ?? [], assignments: d.assignments ?? [], exams: d.exams ?? [],
    liveClasses: d.liveClasses ?? [], liveNow: d.liveNow ?? null, sessions: d.sessions ?? [], days: d.days ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    slots: d.slots ?? [], conflicts: d.conflicts ?? [], overview: d.overview ?? null, activity: d.activity ?? [], workload: d.workload ?? null,
    dash: d.dash ?? null, balances: d.balances ?? [], refresh, act,
  }
  void hhmm
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Ambil data sekali (dan bila deps berubah). */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fn()
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.message : 'Something went wrong') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}
