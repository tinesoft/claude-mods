import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from './invoice.js'

test('total sums line items', () => {
  assert.equal(
    total({
      items: [
        { quantity: 2, unitPrice: 5 },
        { quantity: 1, unitPrice: 3 },
      ],
    }),
    13,
  )
})
