import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { t as tr } from './i18n'

/** Terjemah rentetan paparan; nod React lain dibiarkan. Selamat dipanggil berulang (teks yang sudah diterjemah tiada dalam kamus). */
const tx = (n: ReactNode): ReactNode => (typeof n === 'string' ? tr(n) : n)

/* ---------------- className helper ---------------- */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; title: string; desc?: string; tone?: 'default' | 'ok' | 'warn' | 'danger'; action?: { label: string; onClick: () => void } }
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  function push(t: Omit<Toast, 'id'>) {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { ...t, id }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4200)
  }
  const toneBar: Record<string, string> = {
    default: 'bg-foreground',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
  }
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-3 w-[340px] max-w-[calc(100vw-2rem)]">
        {items.map((t) => (
          <div key={t.id} className="sheet-up relative overflow-hidden bg-card chamfer [--line:var(--border)]">
            <div className="flex items-start gap-3 p-4">
              <span className={cx('mt-2 h-3 w-3 shrink-0', toneBar[t.tone ?? 'default'])} aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-semibold text-card-foreground">{tr(t.title)}</p>
                {t.desc && <p className="mt-1 text-[14px] text-muted-foreground">{tr(t.desc)}</p>}
              </div>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); setItems((s) => s.filter((x) => x.id !== t.id)) }}
                  className="shrink-0 rounded-lg px-3 py-1 text-[14px] font-semibold text-foreground underline hover:bg-primary-soft"
                >
                  {tr(t.action.label)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------------- Button ---------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: keyof typeof Icon
  iconRight?: keyof typeof Icon
  block?: boolean
}
export function Button({ variant = 'secondary', size = 'md', icon, iconRight, block, className, children, ...rest }: BtnProps) {
  const variants: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-accent',
    secondary: 'bg-muted text-foreground [--line:var(--border)] hover:[--line:var(--foreground)] focus-visible:outline-foreground',
    outline: 'text-foreground [--line:var(--border-strong)] hover:bg-primary-soft focus-visible:outline-foreground',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-foreground',
    danger: 'bg-danger text-danger-foreground hover:bg-danger-hover focus-visible:outline-accent',
  }
  const sizes: Record<string, string> = {
    sm: 'chamfer-sm h-8 px-3 text-[14px] gap-2',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-[16px] gap-2',
  }
  const IconL = icon ? Icon[icon] : null
  const IconR = iconRight ? Icon[iconRight] : null
  const s = size === 'sm' ? 15 : 17
  return (
    <button
      className={cx(
        'relative chamfer inline-flex items-center justify-center font-semibold outline-none active:translate-y-px focus-visible:outline-2 focus-visible:-outline-offset-4 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {IconL && <IconL width={s} height={s} />}
      {tx(children)}
      {IconR && <IconR width={s} height={s} />}
    </button>
  )
}

/* ---------------- Card ---------------- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('relative chamfer [--line:var(--border)] bg-card', className)} {...rest}>
      {children}
    </div>
  )
}

/* ---------------- Badge ---------------- */
export function Badge({ tone = 'neutral', dot, children, className }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'primary'; dot?: boolean; children: ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-muted text-foreground',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
    primary: 'bg-primary-soft text-foreground',
  }
  const dotColor: Record<string, string> = {
    neutral: 'bg-muted-foreground', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info', primary: 'bg-primary',
  }
  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <span className={cx('h-2 w-2 rounded-full', dotColor[tone])} />}
      {tx(children)}
    </span>
  )
}

/* ---------------- Avatar ---------------- */
const AVATAR_COLORS = ['#1b5740', '#7a3e0a', '#0b5a85', '#8a2a1f', '#4f5a1c', '#35544a', '#6b3b2a', '#1d4f5e']
export function Avatar({ name, size = 36, src }: { name: string; size?: number; src?: string }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  const c = Math.max(4, Math.round(size * 0.22)) // sudut serong kecil, selaras dengan kotak lain
  const clipPath = `polygon(0 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% 100%, ${c}px 100%, 0 calc(100% - ${c}px))`
  if (src) return <img src={src} alt={name} width={size} height={size} className="object-cover bg-muted" style={{ width: size, height: size, clipPath }} />
  return (
    <div
      className="flex shrink-0 items-center justify-center font-semibold text-white font-display"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38, clipPath }}
    >
      {initials}
    </div>
  )
}

/* ---------------- Input / Field ---------------- */
export function Input({ className, icon, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: keyof typeof Icon }) {
  const IconL = icon ? Icon[icon] : null
  return (
    <div className="relative">
      {IconL && <IconL width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      <input
        className={cx(
          'h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground focus:ring-2 focus:ring-ring/30',
          IconL && 'pl-9', className,
        )}
        {...rest}
      />
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-semibold text-foreground">{tr(label)}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted-foreground">{tr(hint)}</span>}
    </label>
  )
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx('h-10 w-full appearance-none rounded-lg border border-border bg-surface-2 pl-3 pr-9 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus-primary/20', className)}
        {...rest}
      >
        {children}
      </select>
      <Icon.chevronDown width={15} height={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/* ---------------- Tabs ---------------- */
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'relative whitespace-nowrap px-3 py-3 text-sm font-semibold ',
            value === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tr(t.label)}
          {t.count != null && <span className="ml-2 text-[12px] text-muted-foreground tnum">{t.count}</span>}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-1 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])
  if (!open) return null
  const content = (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className={cx('sheet-up relative flex max-h-[90dvh] w-full flex-col overflow-hidden chamfer chamfer-lg [--line:var(--border-strong)] bg-card ', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-card-foreground">{tr(title)}</h3>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted"><Icon.x width={18} height={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

/* ---------------- Progress / meter ---------------- */
export function Meter({ value, tone = 'primary', className }: { value: number; tone?: 'primary' | 'ok' | 'warn' | 'danger'; className?: string }) {
  const colors: Record<string, string> = { primary: 'bg-primary', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' }
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cx('h-full rounded-full ', colors[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/* ---------------- Empty state ---------------- */
export function Empty({ icon = 'inbox', title, desc, action }: { icon?: keyof typeof Icon; title: string; desc?: string; action?: ReactNode }) {
  const I = Icon[icon]
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center bg-muted text-muted-foreground chamfer"><I width={22} height={22} /></div>
      <p className="font-display text-[16px] font-semibold text-foreground">{tr(title)}</p>
      {desc && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{tr(desc)}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ---------------- Section header ---------------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight text-foreground">{tr(title)}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{tr(subtitle)}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------- Switch (togol hidup/mati) ---------------- */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx('flex h-6 w-11 shrink-0 items-center rounded-full p-1 ', on ? 'bg-primary' : 'bg-muted')}>
      <span className={cx('h-5 w-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
    </button>
  )
}
