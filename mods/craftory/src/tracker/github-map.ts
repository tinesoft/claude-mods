import type { IssueRef, WayMap, WayState, WayTicket } from '../../types'
import { sectionOf } from './local-map'
import { parseIssueRef, upstreamLine } from './refs'

export const MAP_LABEL = 'wayfinder:map'

const TYPES = ['research', 'prototype', 'grilling', 'task'] as const

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** What `gh api` answered for one issue's sub-issues or blockers: the numbers, or null when it failed. */
export type Links = ReadonlyMap<number, readonly number[] | null>

export type Row = {
  number: number
  title: string
  body: string
  labels: string[]
  closed: boolean
  assignee: string | null
  updatedAt: number
  url: string
}

function rowOf(raw: unknown): Row | null {
  if (!isRecord(raw) || typeof raw.number !== 'number') return null
  const names = Array.isArray(raw.labels)
    ? raw.labels.flatMap(l => (isRecord(l) && str(l.name) !== '' ? [str(l.name)] : []))
    : []
  const who = Array.isArray(raw.assignees)
    ? raw.assignees.flatMap(a => (isRecord(a) && str(a.login) !== '' ? [str(a.login)] : []))[0]
    : undefined
  const updated = Date.parse(str(raw.updatedAt) || str(raw.createdAt))
  return {
    number: raw.number,
    title: str(raw.title),
    body: str(raw.body),
    labels: names,
    closed: str(raw.state).toUpperCase() === 'CLOSED',
    assignee: who ?? null,
    updatedAt: Number.isNaN(updated) ? 0 : updated,
    url: str(raw.url),
  }
}

/** The lines above a ticket's first `## ` heading: where `Type:`, `Part of` and `Blocked by:` live. */
const headOf = (body: string) => body.split(/^## /m)[0]!.split('\n').slice(0, 40).join('\n')

/** `Part of #12` and `Blocked by: #3, #4`, only where a ticket's own head says so. */
function edgesOf(body: string): { parent: number | null; blockedBy: number[] } {
  const head = headOf(body)
  const parent = /^(?:\*\*)?(?:Part of|Parent):?(?:\*\*)?[ \t]*#(\d+)/im.exec(head)?.[1]
  const blocked = upstreamLine('Blocked by').exec(head)?.[1] ?? ''
  return {
    parent: parent === undefined ? null : Number(parent),
    blockedBy: /none/i.test(blocked) ? [] : [...blocked.matchAll(/#(\d+)/g)].map(m => Number(m[1])),
  }
}

/** The checked or unchecked task-list lines of a map's body that name a ticket. */
const taskListOf = (body: string): number[] =>
  [...body.matchAll(/^[ \t]*[-*][ \t]+\[[ xX]\][ \t]+[^\n]*?#(\d+)/gm)].map(m => Number(m[1]))

/**
 * The structural children of each map: its native sub-issues when GitHub gave any, else the
 * numbers in its body's task list plus the issues whose head says `Part of #<map>`. Nothing a
 * ticket merely mentions in its prose or a comment joins.
 */
export function mapChildren(rawRows: readonly unknown[], subs: Links): Map<number, number[]> {
  return childrenIn(
    rawRows.flatMap(r => rowOf(r) ?? []),
    subs,
  )
}

/** `mapChildren` over rows already read, whichever tracker they came from. */
export function childrenIn(rows: readonly Row[], subs: Links): Map<number, number[]> {
  const known = new Set(rows.map(r => r.number))
  return new Map(
    rows
      .filter(r => r.labels.includes(MAP_LABEL))
      .map(map => {
        const native = subs.get(map.number) ?? []
        const found =
          native.length > 0
            ? native
            : [
                ...taskListOf(map.body),
                ...rows.filter(r => edgesOf(r.body).parent === map.number).map(r => r.number),
              ]
        const kids = [...new Set(found)].filter(n => known.has(n) && n !== map.number)
        return [map.number, kids.sort((a, b) => a - b)]
      }),
  )
}

const ref = (n: number) => parseIssueRef(String(n)) as IssueRef

function typeOf(row: Row): WayTicket['type'] {
  const line = upstreamLine('Type').exec(headOf(row.body))?.[1]?.toLowerCase() ?? ''
  const labelled = row.labels.map(l => l.toLowerCase().replace(/^type:\s*/, ''))
  return TYPES.find(t => t === line) ?? TYPES.find(t => labelled.includes(t)) ?? null
}

function ticketOf(row: Row, blocked: Links): WayTicket {
  const state: WayState = row.closed ? 'resolved' : row.assignee !== null ? 'claimed' : 'open'
  const native = blocked.get(row.number) ?? []
  return {
    ref: ref(row.number),
    title: row.title,
    type: typeOf(row),
    state,
    assignee: row.closed ? null : row.assignee,
    blockedBy: (native.length > 0 ? [...native] : edgesOf(row.body).blockedBy).map(ref),
    location: row.url,
  }
}

/** The wayfinder maps of a repo's issue list: the issues labelled `wayfinder:map`, with their children. */
export function githubMaps(rawRows: readonly unknown[], subs: Links, blocked: Links): WayMap[] {
  return mapsIn(
    rawRows.flatMap(r => rowOf(r) ?? []),
    subs,
    blocked,
    'github',
  )
}

/** The maps among rows already read, whichever tracker they came from. */
export function mapsIn(
  rows: readonly Row[],
  subs: Links,
  blocked: Links,
  from: WayMap['source'],
): WayMap[] {
  const byNumber = new Map(rows.map(r => [r.number, r]))
  const children = childrenIn(rows, subs)
  return rows
    .filter(r => r.labels.includes(MAP_LABEL))
    .map(map => {
      const tickets = (children.get(map.number) ?? []).flatMap(n => {
        const row = byNumber.get(n)
        return row === undefined ? [] : [ticketOf(row, blocked)]
      })
      const kids = (children.get(map.number) ?? []).flatMap(n => byNumber.get(n)?.updatedAt ?? [])
      return {
        ref: ref(map.number),
        source: from,
        title: map.title,
        origin: `#${map.number}`,
        location: map.url,
        isClosed: map.closed,
        destination: sectionOf(map.body, 'Destination').replace(/\s+/g, ' '),
        hasFog: sectionOf(map.body, 'Not yet specified') !== '',
        tickets,
        updatedAt: Math.max(map.updatedAt, ...kids),
      }
    })
}
