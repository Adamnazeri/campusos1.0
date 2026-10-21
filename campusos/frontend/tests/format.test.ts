import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLang } from '../src/lib/i18n.ts'
import { fmtDay, fmtMonYear, fmtSchedule, monthOf, ago, blankIfDash, orgInitials, whatsappUrl } from '../src/lib/format.ts'
import { EMPTY } from '../src/lib/empty.ts'

test('fmtDay / fmtMonYear / monthOf / fmtSchedule', () => {
  setLang('en')
  assert.equal(fmtDay('2026-10-05'), '05 Oct')
  assert.equal(fmtDay(null), EMPTY)
  assert.equal(fmtMonYear('2022-01-17'), 'Jan 2022')
  assert.equal(monthOf('2026-12-31'), 'DEC')
  assert.equal(fmtSchedule('Mon, Wed, Fri · 08:00'), 'Mon, Wed, Fri · 08:00')
  setLang('ms')
  assert.equal(fmtSchedule('Mon, Wed, Fri · 08:00'), 'Isn, Rab, Jum · 08:00')
  assert.equal(fmtSchedule(null), EMPTY)
  setLang('en')
})

test('ago: minit, jam, hari, tidak negatif', () => {
  const now = Date.UTC(2026, 9, 8, 12, 0, 0)
  assert.equal(ago(now - 20_000, now), 'just now')
  assert.equal(ago(now - 5 * 60_000, now), '5m ago')
  assert.equal(ago(now - 3 * 3600_000, now), '3h ago')
  assert.equal(ago(now - 2 * 86400_000, now), '2d ago')
  assert.equal(ago(now + 60_000, now), 'just now')
})

test('blankIfDash: pemegang tempat EMPTY tidak dihantar ke API', () => {
  assert.equal(blankIfDash(EMPTY), '')
  assert.equal(blankIfDash(undefined), '')
  assert.equal(blankIfDash('Room 204'), 'Room 204')
})

test('orgInitials', () => {
  assert.equal(orgInitials('Greenfield Academy'), 'GA')
  assert.equal(orgInitials('  sekolah  menengah  kebangsaan '), 'SM')
  assert.equal(orgInitials(''), '·')
})

test('whatsappUrl: format nombor Malaysia 01x kepada 601x dan encode mesej', () => {
  assert.equal(whatsappUrl('012-345 6789', 'Salam Waris'), 'https://wa.me/60123456789?text=Salam%20Waris')
  assert.equal(whatsappUrl('+60198887777'), 'https://wa.me/60198887777')
  assert.equal(whatsappUrl(null), null)
})
