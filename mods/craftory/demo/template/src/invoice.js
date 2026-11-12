export const total = invoice =>
  invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
