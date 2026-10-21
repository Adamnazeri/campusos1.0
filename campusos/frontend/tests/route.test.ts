import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHash, parseHash } from '../src/lib/route.ts'

test('buildHash / parseHash pergi-balik, termasuk param dengan aksara khas', () => {
  assert.equal(buildHash('teachers'), '#/teachers')
  assert.equal(buildHash('class-detail', 'abc123'), '#/class-detail/abc123')
  assert.deepEqual(parseHash('#/class-detail/abc123', 'management'), { route: 'class-detail', param: 'abc123' })
  const odd = 'a/b c?d'
  assert.deepEqual(parseHash(buildHash('teacher-profile', odd), 'management'), { route: 'teacher-profile', param: odd })
})

test('hash kosong / tidak sah / bukan untuk peranan ini → halaman utama', () => {
  assert.deepEqual(parseHash('', 'management'), { route: 'overview' })
  assert.deepEqual(parseHash('#/entah', 'management'), { route: 'overview' })
  assert.deepEqual(parseHash('#/billing', 'teacher'), { route: 'home' }) // guru tidak boleh membuka laluan pengurusan
  assert.deepEqual(parseHash('#/settings', 'teacher'), { route: 'home' })
  assert.deepEqual(parseHash('#/schedule', 'teacher'), { route: 'schedule', param: undefined })
  assert.deepEqual(parseHash('#/teachers', 'teacher'), { route: 'home' })
})

test('hash rosak tidak melempar ralat', () => {
  assert.deepEqual(parseHash('#/teacher-profile/%E0%A4%A', 'management'), { route: 'teacher-profile', param: undefined })
})
