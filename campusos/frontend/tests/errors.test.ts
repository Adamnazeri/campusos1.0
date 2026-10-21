import { test } from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError } from '../src/lib/errors.ts'

test('kod ralat dikenali → English', () => {
  assert.equal(friendlyError('INVALID_CREDENTIALS', 'E-mel atau kata laluan salah'), 'Incorrect email or password.')
  assert.equal(friendlyError('HAS_CLASSES', 'Guru ini masih mengajar 3 kelas aktif.'), 'This teacher still has active classes. Reassign those classes first.')
  assert.equal(friendlyError('CODE_TAKEN', 'No. pelajar sudah digunakan'), 'That student ID is already in use.')
  assert.equal(friendlyError('TEACHER_ON_LEAVE', 'Guru sedang bercuti'), 'That teacher is on approved leave on the selected date.')
})

test('ralat validasi diterjemah mengikut peraturan', () => {
  assert.equal(friendlyError('VALIDATION_ERROR', 'name: wajib diisi'), 'Name is required.')
  assert.equal(friendlyError('VALIDATION_ERROR', 'password: minimum 8 aksara'), 'Password must be at least 8 characters.')
  assert.equal(friendlyError('VALIDATION_ERROR', 'capacity: mesti antara 1 dan 5000'), 'Capacity must be between 1 and 5000.')
  assert.equal(friendlyError('VALIDATION_ERROR', 'setup.rooms[].name: wajib diisi'), 'setup.rooms[].name is required.')
  assert.equal(friendlyError('VALIDATION_ERROR', 'xyz: peraturan baharu'), 'xyz: peraturan baharu') // tidak dikenali → mesej asal
})

test('kod tidak dikenali: guna mesej pelayan; 5xx → mesej umum', () => {
  assert.equal(friendlyError('ANEH', 'Pesan khas', 400), 'Pesan khas')
  assert.equal(friendlyError('ANEH', '', 400), 'Something went wrong.')
  assert.equal(friendlyError('ANEH', 'stack trace', 502), 'Something went wrong on the server. Please try again.')
})
