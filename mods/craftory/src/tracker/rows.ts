import type { IssueRef, WayMap, WayState, WayTicket } from '../../types'
import { headOf, PARENT_LINE, parseIssueRef, sectionOf, TICKET_TYPES, upstreamLine } from './refs'

/** What every tracker's map reader shares: issue rows, the map label, and the map model built from them. */
export const MAP_LABEL = 'wayfinder:map'

export type Json = Record<string, unknown>
export const isRecord = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * What a tracker's API answered for one issue's sub-issues or blockers: the numbers (none when the
 * host has no such links), or null when the lookup failed and so said nothing.
 */
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

/** What a tracker's issue object holds, under the names it gives them (`updatedAt` or `updated_at`). */
export type RowFields = {
  number: number
  title: unknown
  body: unknown
  labels: string[]
  closed: boolean
  assignee: string | undefined
  updated: unknown
  created: unknown
  url: unknown
}

/** A row from the fields a tracker's issue object names in its own words. */
export function rowFrom(fields: RowFields): Row {
  const updated = Date.parse(str(fields.updated) || str(fields.created))
  return {
    number: fields.number,
    title: str(fields.title),
    body: str(fields.body),
    labels: fields.labels,
    closed: fields.closed,
    assignee: fields.assignee ?? null,
    updatedAt: Number.isNaN(updated) ? 0 : updated,
    url: str(fields.url),
  }
}

/** The first non-empty `key` of each object in a list, e.g. every label's `name`. */
export const namesOf = (list: unknown, key: string): string[] =>
  Array.isArray(list)
    ? list.flatMap(o => (isRecord(o) && str(o[key]) !== '' ? [str(o[key])] : []))
    : []

/** `Part of #12` and `Blocked by: #3, #4`, only where a ticket's own head says so. */
function edgesOf(body: string): { parent: number | null; blockedBy: number[] } {
  const head = headOf(body)
  const parent = PARENT_LINE.exec(head)?.[1]
  const blocked = upstreamLine('Blocked by').exec(head)?.[1] ?? ''
  return {
    parent: parent === undefined ? null : Number(parent.slice(1)),
    blockedBy: /none/i.test(blocked) ? [] : [...blocked.matchAll(/#(\d+)/g)].map(m => Number(m[1])),
  }
}

/** The checked or unchecked task-list lines of a map's body that name a ticket. */
const taskListOf = (body: string): number[] =>
  [...body.matchAll(/^[ \t]*[-*][ \t]+\[[ xX]\][ \t]+[^\n]*?#(\d+)/gm)].map(m => Number(m[1]))

/**
 * The structural children of each map: its native sub-issues when the tracker gave any, else the
 * numbers in its body's task list plus the issues whose head says `Part of #<map>`. Nothing a
 * ticket merely mentions in its prose or a comment joins.
 */
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

const refOf = (n: number) => parseIssueRef(String(n)) as IssueRef

function typeOf(row: Row): WayTicket['type'] {
  const line = upstreamLine('Type').exec(headOf(row.body))?.[1]?.toLowerCase() ?? ''
  const labelled = row.labels.map(l => l.toLowerCase().replace(/^type:\s*/, ''))
  return TICKET_TYPES.find(t => t === line) ?? TICKET_TYPES.find(t => labelled.includes(t)) ?? null
}

function ticketOf(row: Row, blocked: Links): WayTicket {
  const state: WayState = row.closed ? 'resolved' : row.assignee !== null ? 'claimed' : 'open'
  const found = blocked.get(row.number)
  const native = found ?? []
  return {
    ref: refOf(row.number),
    title: row.title,
    type: typeOf(row),
    state,
    assignee: row.closed ? null : row.assignee,
    blockedBy: (native.length > 0 ? [...native] : edgesOf(row.body).blockedBy).map(refOf),
    ...(found === null && row.closed === false && { blockersUnknown: true }),
    location: row.url,
  }
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
        ref: refOf(map.number),
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
