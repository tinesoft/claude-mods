# Export invoices as CSV

**Status:** ready-for-agent

## Problem

Accountants ask for invoices in a spreadsheet. Today the only way out is copy and paste.

## User stories

1. As a bookkeeper, I export a customer's invoices as one CSV so I can open it in a spreadsheet.
2. As a bookkeeper, I choose which columns are exported.
3. As a bookkeeper, amounts use the invoice currency with two decimals.
4. As a developer, a bad invoice names itself in the error instead of failing the whole export.

## Done when

- `exportCsv(invoices, { columns })` returns a CSV string.
- A CLI `invoicely export --customer <id>` writes the file.
