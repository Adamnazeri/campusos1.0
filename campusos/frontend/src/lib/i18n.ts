// Sistem bahasa ringan (English ↔ Bahasa Melayu), tanpa pustaka tambahan.
// Kunci = teks English itu sendiri: t('Today') → 'Hari ini' dalam BM; teks yang belum diterjemah kekal English (tiada skrin kosong).
// Modul tulen (tiada import React) supaya boleh digunakan dalam format.ts / errors.ts dan diuji dalam Node.
import { MS } from './i18n-ms.ts'

export type Lang = 'en' | 'ms'
export const LANG_KEY = 'campusos.lang'

function detect(): Lang {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null
    if (saved === 'en' || saved === 'ms') return saved
  } catch { /* storan diblokir */ }
  return typeof navigator !== 'undefined' && /^ms\b/i.test(navigator.language ?? '') ? 'ms' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = current

export const getLang = (): Lang => current
export const subscribeLang = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export function setLang(l: Lang) {
  if (l === current) return
  current = l
  try { localStorage.setItem(LANG_KEY, l) } catch { /* storan diblokir */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l
  listeners.forEach((f) => f())
}

/** Terjemah + isi pemegang tempat: t('{n} students', { n: 3 }). */
export function t(en: string | null | undefined, vars?: Record<string, string | number>): string {
  if (en == null) return ''
  const s = (current === 'ms' ? MS[en] : undefined) ?? en
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k]))) : s
}

/** Bentuk jamak English: tp(2, '{n} session', '{n} sessions'). BM tidak berjamak: kedua-dua kunci dipetakan ke teks sama. */
export const tp = (n: number, one: string, many: string, vars: Record<string, string | number> = {}) => t(n === 1 ? one : many, { ...vars, n })
