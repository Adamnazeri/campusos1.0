import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, THEME_COLOR } from '../src/lib/theme.ts'

test('resolveTheme: pilihan tersimpan menang; jika tiada ikut sistem; lalai cerah', () => {
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
  assert.equal(resolveTheme('rosak', true), 'dark')
  assert.match(THEME_COLOR.dark, /^#[0-9a-f]{6}$/)
})
