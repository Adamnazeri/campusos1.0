import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameKey, urlBase64ToUint8Array } from '../src/lib/pushUtil.ts'

const KEY = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'

test('urlBase64ToUint8Array: kunci VAPID 65 bait, bermula 0x04, aksara URL-safe dipulihkan', () => {
  const b = urlBase64ToUint8Array(KEY)
  assert.equal(b.length, 65); assert.equal(b[0], 4)
  assert.deepEqual([...urlBase64ToUint8Array('_-8')], [255, 239])
  assert.equal(urlBase64ToUint8Array('').length, 0)
})

test('sameKey: mengesan kunci VAPID yang bertukar (langganan lama mesti diganti)', () => {
  const buf = urlBase64ToUint8Array(KEY).buffer as ArrayBuffer
  assert.equal(sameKey(buf, KEY), true)
  const other = new Uint8Array(buf.slice(0)); other[10] ^= 1
  assert.equal(sameKey(other.buffer as ArrayBuffer, KEY), false)
  assert.equal(sameKey(null, KEY), false)
  assert.equal(sameKey(new ArrayBuffer(3), KEY), false)
})
