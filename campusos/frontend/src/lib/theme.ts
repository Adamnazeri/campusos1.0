// Pemilihan tema (tulen, boleh diuji): pilihan tersimpan > tetapan sistem pengendalian > cerah.
export type Theme = 'light' | 'dark'
export const THEME_KEY = 'campusos.theme'
/** Warna bar penyemak imbas mudah alih (meta theme-color) bagi setiap tema. */
export const THEME_COLOR: Record<Theme, string> = { light: '#f6f3e8', dark: '#0f1a15' }

export function resolveTheme(saved: string | null | undefined, prefersDark: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved
  return prefersDark ? 'dark' : 'light'
}
