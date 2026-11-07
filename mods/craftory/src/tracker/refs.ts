import type { IssueRef } from '../../types'

/** A tracker-numbered ref (`#44`) or a Jira-style key (`ENG-12`): what a pull request is called. */
export function parseIssueRef(text: string): IssueRef | undefined {
  const t = text.trim()
  if (/^#?\d+$/.test(t)) return `#${t.replace(/^#/, '').replace(/^0+(?=\d)/, '')}` as IssueRef
  return /^[A-Z][A-Z0-9]+-\d+$/.test(t) ? (t as IssueRef) : undefined
}

const SCRATCH_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)?$/

/** Any ref an issue can have: those above, or a `.scratch` feature (`csv-export`) or ticket (`csv-export/01`). */
export function parseRef(text: string): IssueRef | undefined {
  const t = text.trim()
  return parseIssueRef(t) ?? (SCRATCH_REF.test(t) ? (t as IssueRef) : undefined)
}

/**
 * What to hand a skill for an issue: a numbered ref as it is, and for a `.scratch` ref the path of
 * its file, which is how Matt's Local tracker names one.
 */
export const argFor = (
  issues: readonly { ref: IssueRef; location: string }[] | null,
  ref: IssueRef,
): string =>
  parseIssueRef(ref) === undefined ? (issues?.find(i => i.ref === ref)?.location ?? ref) : ref

/** A ref spelled for a file, branch or worktree name: no `#`, and `/` becomes `-`. */
export const refSlug = (ref: IssueRef): string => ref.replace(/^#/, '').replace('/', '-')

export function refsIn(text: string): IssueRef[] {
  const found = text.match(/(?<![\w/])(?:#\d+|[A-Z][A-Z0-9]+-\d+)\b/g) ?? []
  return [...new Set(found)].flatMap(raw => parseIssueRef(raw) ?? [])
}

export const isUnsupported = (stderr: string | undefined) =>
  /\b(?:404|403|410)\b|not found|forbidden/i.test(stderr ?? '')

/**
 * `to-spec` 1.3.1 applies no `spec` label, so a spec is told apart by its template headings
 * (the same test serves the Local and GitHub trackers).
 */
export const isSpecBody = (body: string) =>
  /^## Problem Statement\b/m.test(body) && /^## User Stories\b/m.test(body)

export const storiesIn = (body: string): number => body.match(/^\s*\d+\.\s+As an?\b/gm)?.length ?? 0

const sortKey = (ref: IssueRef): [number, string, number] => {
  if (ref.startsWith('#')) return [0, '', Number(ref.slice(1))]
  const [feature = '', ticket] = ref.split('/')
  return [1, feature, ticket === undefined ? -1 : Number(ticket)]
}

/** Numbered refs first, then `.scratch` refs by feature, with a feature before its tickets. */
export const byNumber = (a: { ref: IssueRef }, b: { ref: IssueRef }) => {
  const [rankA, featureA, nA] = sortKey(a.ref)
  const [rankB, featureB, nB] = sortKey(b.ref)
  return rankA - rankB || featureA.localeCompare(featureB, 'en', { numeric: true }) || nA - nB
}

/** A `Status: x` style line, plain or bold, as Matt's skills write it near the top of a file. */
export const upstreamLine = (label: string) =>
  new RegExp(`^(?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*?)[ \\t]*$`, 'im')

/** `Blocked by: 01, billing/02`: a bare number is a ticket of the same feature. */
export const blockersOf = (value: string, feature: string): IssueRef[] =>
  /none/i.test(value)
    ? []
    : [...value.matchAll(/([a-z0-9]+(?:-[a-z0-9]+)*\/\d+)|\b(\d+)\b/g)].flatMap(
        m => parseRef(m[1] ?? `${feature}/${m[2]}`) ?? [],
      )
