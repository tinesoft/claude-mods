import type { IssueRef } from '../../types'

/** Made here only. `#42` and `42` become `#42`; `BILL-42` stays; anything else is undefined. */
export function parseIssueRef(text: string): IssueRef | undefined {
  const t = text.trim()
  if (/^#?\d+$/.test(t)) return `#${t.replace(/^#/, '').replace(/^0+(?=\d)/, '')}` as IssueRef
  return /^[A-Z][A-Z0-9]+-\d+$/.test(t) ? (t as IssueRef) : undefined
}

/** Every `#n` and `KEY-n` in free text, in order, without repeats. */
export function refsIn(text: string): IssueRef[] {
  const found = text.match(/(?<![\w/])(?:#\d+|[A-Z][A-Z0-9]+-\d+)\b/g) ?? []
  return [...new Set(found)].flatMap(raw => parseIssueRef(raw) ?? [])
}
