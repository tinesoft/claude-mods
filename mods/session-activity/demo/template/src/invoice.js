export const lineTotal = line => line.quantity * line.unitPrice

export const invoiceTotal = invoice => invoice.lines.reduce((sum, line) => sum + lineTotal(line), 0)
