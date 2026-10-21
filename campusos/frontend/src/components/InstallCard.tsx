// Pasang CampusOS sebagai app (PWA) + kad untuk admin kongsi pautan app kepada guru.
import { useState } from 'react'
import { t } from '../lib/i18n'
import { Icon } from '../lib/icons'
import { Button, Card, useToast } from '../lib/ui'
import { useInstall } from '../lib/pwa'

const DISMISS = 'campusos.install.dismissed'

function installHelp(ios: boolean, android: boolean): string {
  return ios ? t('On iPhone: tap the Share button, then Add to Home Screen.')
    : android ? t('On Android: open the browser menu (three dots) and tap Install app or Add to Home screen.')
    : t('Open the browser menu and choose Install app or Add to Home screen.')
}

/** Kad "Pasang app" untuk pengguna. `dismissible` = boleh ditutup (dingat dalam peranti). */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const { installed, canPrompt, ios, android, install } = useInstall()
  const [hidden, setHidden] = useState(() => { try { return dismissible && localStorage.getItem(DISMISS) === '1' } catch { return false } })
  if (hidden) return null
  if (installed) return dismissible ? null : (
    <Card className="flex items-center gap-3 p-4"><span className="inline-flex shrink-0 items-center justify-center text-ok"><Icon.checkCircle width={20} height={20} /></span><p className="text-sm text-foreground">{t('CampusOS is installed on this device.')}</p></Card>
  )
  const close = () => { setHidden(true); try { localStorage.setItem(DISMISS, '1') } catch { /* storan diblokir */ } }
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex shrink-0 items-center justify-center text-foreground"><Icon.download width={20} height={20} /></span>
        <div className="flex-1">
          <p className="font-display text-[16px] font-semibold text-card-foreground">{t('Install CampusOS on your phone')}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{t('Add CampusOS to your home screen to open it like an app, with no browser search needed.')}</p>
          {!canPrompt && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-foreground">{installHelp(ios, android)}</p>}
          <div className="mt-3 flex gap-2">
            {canPrompt && <Button size="sm" variant="primary" icon="download" onClick={() => void install()}>{t('Install app')}</Button>}
            {dismissible && <Button size="sm" variant="ghost" onClick={close}>{t('Not now')}</Button>}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Admin: kongsi pautan app kepada guru (salin / WhatsApp / kongsi sistem) dan pasang pada peranti ini. */
export function ShareAppCard() {
  const toast = useToast()
  const { installed, canPrompt, install } = useInstall()
  const url = typeof window !== 'undefined' ? window.location.origin : ''
  const msg = t('Open CampusOS: {url} then tap Install app to add it to your phone.', { url })
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.push({ title: t('Link copied'), tone: 'ok' }) }
    catch { toast.push({ title: url, desc: t('Copy this link manually.'), tone: 'warn' }) }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <Card className="max-w-2xl p-5">
      <h3 className="font-display text-[16px] font-semibold text-card-foreground">{t('Give teachers the app')}</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{t('Teachers open this link on their phone and tap Install app. CampusOS then opens from their home screen like any other app.')}</p>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[14px] text-foreground"><Icon.link width={15} height={15} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{url}</span></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon="copy" onClick={() => void copy()}>{t('Copy link')}</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" icon="share">{t('Share on WhatsApp')}</Button></a>
        {canShare && <Button size="sm" variant="outline" icon="share" onClick={() => void navigator.share({ title: 'CampusOS', text: msg, url }).catch(() => {})}>{t('Share')}</Button>}
        {canPrompt && !installed && <Button size="sm" variant="ghost" icon="download" onClick={() => void install()}>{t('Install on this device')}</Button>}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">{t('The link needs HTTPS to be installable. Teachers can also install from the invitation page after setting their password.')}</p>
    </Card>
  )
}
