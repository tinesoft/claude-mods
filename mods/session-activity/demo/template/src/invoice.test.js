import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceTotal } from './invoice.js'

test('an invoice totals its lines', () => {
  const invoice = {
    lines: [
      { quantity: 2, unitPrice: 15 },
      { quantity: 1, unitPrice: 5 },
    ],
  }
  assert.equal(invoiceTotal(invoice), 35)
})
