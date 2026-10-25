import type { IssueRef } from '../../types'

export function parseIssueRef(text: string): IssueRef | undefined {
  const t = text.trim()
  if (/^#?\d+$/.test(t)) return `#${t.replace(/^#/, '').replace(/^0+(?=\d)/, '')}` as IssueRef
  return /^[A-Z][A-Z0-9]+-\d+$/.test(t) ? (t as IssueRef) : undefined
}

export function refsIn(text: string): IssueRef[] {
  const found = text.match(/(?<![\w/])(?:#\d+|[A-Z][A-Z0-9]+-\d+)\b/g) ?? []
  return [...new Set(found)].flatMap(raw => parseIssueRef(raw) ?? [])
}

/**
 * `to-spec` 1.3.1 applies no `spec` label, so a spec is told apart by its template headings
 * (the same test serves the Local and GitHub trackers).
 */
export const isSpecBody = (body: string) =>
  /^## Problem Statement\b/m.test(body) && /^## User Stories\b/m.test(body)

export const storiesIn = (body: string): number => body.match(/^\s*\d+\.\s+As an?\b/gm)?.length ?? 0
