import type { IssueRef, WayMap, WayState, WayTicket } from '../../types'
import { blockersOf, upstreamLine } from './refs'

/** The files of one effort folder holding a `map.md`, with or without a `spec.md`: a map if its text says so. */
export type MapPlan = {
  effort: string
  map: { path: string; mtimeMs: number }
  tickets: { path: string; n: string; mtimeMs: number }[]
}

/** The text of a map's files, in the order of its plan; null for a file that could not be read. */
export type MapTexts = { map: string | null; tickets: (string | null)[] }

const HEAD_LINES = 60

const lineOf = (head: string, label: string) => upstreamLine(label).exec(head)?.[1] ?? ''
/** The lines above the first `## ` heading: where a file keeps its own `Status:`, never the prose below. */
const headOf = (text: string) =>
  text.split('\n').slice(0, HEAD_LINES).join('\n').split(/^## /m)[0] ?? ''

const TYPES = ['research', 'prototype', 'grilling', 'task'] as const

/** What a file's own `Status:` and `Assignee:` lines say, and nothing it quotes in its prose. */
function stateOf(head: string): { state: WayState; assignee: string | null } {
  const status = lineOf(head, 'Status').toLowerCase()
  const assignee = lineOf(head, 'Assignee').replace(/^@/, '')
  const who = assignee === '' || /^none$/i.test(assignee) ? null : assignee
  if (['resolved', 'closed', 'done'].includes(status)) return { state: 'resolved', assignee: who }
  if (status === 'claimed' || who !== null) return { state: 'claimed', assignee: who }
  return { state: 'open', assignee: null }
}

/** The text under a `## ` heading, without comments, up to the next heading. */
export function sectionOf(text: string, heading: string): string {
  const match = new RegExp(`^## ${heading}[ \\t]*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'im').exec(
    text,
  )
  return (match?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim()
}

const titleOf = (text: string, fallback: string) =>
  /^# (.+?)\s*$/m.exec(text)?.[1]?.replace(/^\d+:\s*/, '') ?? fallback

function ticketOf(effort: string, file: MapPlan['tickets'][number], text: string): WayTicket {
  const head = headOf(text)
  const type = lineOf(head, 'Type').toLowerCase()
  return {
    ref: `${effort}/${file.n}` as IssueRef,
    title: titleOf(text, file.n),
    type: TYPES.find(t => t === type) ?? null,
    ...stateOf(head),
    blockedBy: blockersOf(lineOf(head, 'Blocked by'), effort),
    location: file.path,
  }
}

/** A map is recognised by its `## Destination` heading; its tickets are the files in its `issues/`. */
export function mapOf(plan: MapPlan, texts: MapTexts): WayMap | null {
  const text = texts.map
  if (text === null || !/^## Destination[ \t]*$/m.test(text)) return null
  const tickets = plan.tickets.flatMap((file, i) => {
    const body = texts.tickets[i]
    return body === null || body === undefined ? [] : [ticketOf(plan.effort, file, body)]
  })
  const mtimes = [plan.map.mtimeMs, ...plan.tickets.map(t => t.mtimeMs)]
  return {
    ref: plan.effort as IssueRef,
    source: 'local',
    title: titleOf(text, plan.effort.replace(/-/g, ' ')),
    origin: `.scratch/${plan.effort}`,
    location: plan.map.path,
    isClosed: stateOf(headOf(text)).state === 'resolved',
    destination: sectionOf(text, 'Destination').replace(/\s+/g, ' '),
    hasFog: sectionOf(text, 'Not yet specified') !== '',
    tickets,
    updatedAt: Math.max(...mtimes),
  }
}
