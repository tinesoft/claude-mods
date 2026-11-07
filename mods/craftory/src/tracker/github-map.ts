import type { WayMap } from '../../types'
import { childrenIn, type Links, mapsIn, namesOf, rowFrom, isRecord, str, type Row } from './rows'

function rowOf(raw: unknown): Row | null {
  if (!isRecord(raw) || typeof raw.number !== 'number') return null
  return rowFrom({
    number: raw.number,
    title: raw.title,
    body: raw.body,
    labels: namesOf(raw.labels, 'name'),
    closed: str(raw.state).toUpperCase() === 'CLOSED',
    assignee: namesOf(raw.assignees, 'login')[0],
    updated: raw.updatedAt,
    created: raw.createdAt,
    url: raw.url,
  })
}

/**
 * The structural children of each map: its native sub-issues when GitHub gave any, else the
 * numbers in its body's task list plus the issues whose head says `Part of #<map>`.
 */
export function mapChildren(rawRows: readonly unknown[], subs: Links): Map<number, number[]> {
  return childrenIn(
    rawRows.flatMap(r => rowOf(r) ?? []),
    subs,
  )
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
