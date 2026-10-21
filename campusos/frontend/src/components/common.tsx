import type { ReactNode } from 'react'
import { Icon, type IconName } from '../lib/icons'
import { Card, cx } from '../lib/ui'
import { t as tr } from '../lib/i18n'

/** Angka besar bertipografi tanpa kotak ikon. `icon` diterima untuk keserasian tetapi tidak dipaparkan. */
export function StatCard({ label, value, delta, deltaTone = 'ok', sub }: { label: string; value: string; delta?: string; deltaTone?: 'ok' | 'danger' | 'neutral'; icon?: IconName; sub?: string }) {
  const dt = { ok: 'text-ok', danger: 'text-danger', neutral: 'text-muted-foreground' }[deltaTone]
  return (
    <Card className="p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{tr(label)}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-display text-[32px] font-extrabold leading-none tracking-tight text-foreground tnum">{value}</p>
        {delta && (
          <span className={cx('flex items-center gap-1 text-[12px] font-semibold', dt)}>
            {deltaTone === 'danger' ? <Icon.arrowDown width={12} height={12} /> : <Icon.arrowUp width={12} height={12} />}
            {delta}
          </span>
        )}
      </div>
      {sub && <p className="mt-2 text-[14px] text-muted-foreground">{tr(sub)}</p>}
    </Card>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx('whitespace-nowrap px-4 py-3 text-left font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground', className)}>{typeof children === 'string' ? tr(children) : children}</th>
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx('whitespace-nowrap px-4 py-3 text-sm text-foreground', className)}>{children}</td>
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </Card>
  )
}
