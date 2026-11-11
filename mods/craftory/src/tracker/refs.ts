import type { Issue, IssueRef, IssueStatus, TriageLabels, TriageRole } from '../../types'

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

/** The labels a spec and a ticket carry unless a tracker's config names others. */
export const SPEC_LABEL = 'spec'
export const TICKET_LABEL = 'ticket'

/** A `Part of #12` or `Parent: #12` line; the ref is its first group. */
export const PARENT_LINE = /^(?:\*\*)?(?:Part of|Parent):?(?:\*\*)?[ \t]*(#\d+)/im

/** `Blocked by:` and `Part of`/`Parent:` lines near the top of an issue body, whichever tracker wrote it. */
export function bodyEdges(body: string): { blockedBy: IssueRef[]; parent: IssueRef | null } {
  const head = body.split('\n').slice(0, 40).join('\n')
  const blocked = /^(?:\*\*)?Blocked by:(?:\*\*)?[ \t]*(.*)$/im.exec(head)?.[1] ?? ''
  const parent = PARENT_LINE.exec(head)?.[1]
  return {
    blockedBy: /none/i.test(blocked) ? [] : refsIn(blocked),
    parent: parent ? (parseIssueRef(parent) ?? null) : null,
  }
}

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

/**
 * The `Status:` values a Local file uses besides the triage roles: the one list both Local readers
 * (local.ts, local-map.ts) and the `.scratch` tools (tools/check-scratch.mjs) read. `closed` is
 * finished without being done; the others are done. wayfinder writes `resolved`.
 */
export const FINISHED_STATUSES = ['resolved', 'done', 'closed'] as const
export const WORKING_STATUSES = ['claimed', 'in-progress', 'in progress'] as const

export const isFinishedStatus = (status: string) =>
  (FINISHED_STATUSES as readonly string[]).includes(status.trim().toLowerCase())

/** A `Status: x` style line, plain or bold, as Matt's skills write it near the top of a file. */
export const upstreamLine = (label: string) =>
  new RegExp(`^(?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*?)[ \\t]*$`, 'im')

/**
 * `Blocked by: 01, billing/02`: a bare number is a ticket of the same feature. to-tickets writes
 * "numbers/titles", so a bracketed title (`01 (Handoff at 80%)`) is dropped before matching.
 */
export const blockersOf = (value: string, feature: string): IssueRef[] =>
  /none/i.test(value)
    ? []
    : [
        ...value.replace(/\([^)]*\)/g, ' ').matchAll(/([a-z0-9]+(?:-[a-z0-9]+)*\/\d+)|\b(\d+)\b/g),
      ].flatMap(m => parseRef(m[1] ?? `${feature}/${m[2]}`) ?? [])

/** The ticket types a wayfinder map names, in a `Type:` line or a `wayfinder:<type>` label. */
export const TICKET_TYPES = ['research', 'prototype', 'grilling', 'task'] as const

const HEAD_LINES = 60

/** The lines above a file's first `## ` heading: where its own `Type:`, `Status:` and `Blocked by:` live, never the prose below. */
export const headOf = (text: string) =>
  text.split('\n').slice(0, HEAD_LINES).join('\n').split(/^## /m)[0] ?? ''

/** The text under a `## ` heading, without comments, up to the next heading. */
export function sectionOf(text: string, heading: string): string {
  const match = new RegExp(`^## ${heading}[ \\t]*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'im').exec(
    text,
  )
  return (match?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim()
}

export const roleOf = (names: readonly string[], labels: TriageLabels): TriageRole | null =>
  (Object.keys(labels) as TriageRole[]).find(r => names.includes(labels[r])) ?? null

/** What a tracker's issue says, however it said it; the kind, role and bug flag follow from it. */
export type IssueFacts = {
  ref: IssueRef
  title: string
  body: string
  labels: readonly string[]
  status: IssueStatus
  createdAt: number | null
  location: string
  /** The tracker's native blockers; the body's `Blocked by:` line stands in when it gave none. */
  native?: readonly IssueRef[]
  /** The tracker has its own word that this is a spec, beyond the label and the template headings. */
  isSpec?: boolean
}

export function issueOf(
  facts: IssueFacts,
  config: { triage: TriageLabels; specLabel: string; ticketLabel: string },
): Issue {
  const { body, labels } = facts
  const edges = bodyEdges(body)
  const isSpec = labels.includes(config.specLabel) || isSpecBody(body) || facts.isSpec === true
  return {
    ref: facts.ref,
    title: facts.title,
    kind: isSpec
      ? 'spec'
      : edges.parent !== null || labels.includes(config.ticketLabel)
        ? 'ticket'
        : 'issue',
    status: facts.status,
    role: roleOf(labels, config.triage),
    parent: edges.parent,
    blockedBy:
      facts.native !== undefined && facts.native.length > 0 ? [...facts.native] : edges.blockedBy,
    isBug: labels.some(n => n.toLowerCase() === 'bug'),
    ...(isSpec && { stories: storiesIn(body) }),
    createdAt: facts.createdAt,
    location: facts.location,
  }
}
