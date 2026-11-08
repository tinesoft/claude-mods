import { expect, test } from 'claude-code/testing'
import type { IssueRef, WayMap, WayState, WayTicket } from '../types'
import {
  mapArg,
  mapChipCompact,
  mapChipText,
  mapView,
  routeStatus,
  ticketArg,
} from '../src/map-view'

const ticket = (n: number, state: WayState, blockedBy: string[] = []): WayTicket => ({
  ref: `m/0${n}` as IssueRef,
  title: `Ticket ${n}`,
  type: null,
  state,
  assignee: null,
  blockedBy: blockedBy as IssueRef[],
  location: `.scratch/m/issues/0${n}.md`,
})

const mapOf = (tickets: WayTicket[]): WayMap => ({
  ref: 'm' as IssueRef,
  source: 'local',
  title: 'M',
  origin: '.scratch/m',
  location: '.scratch/m/map.md',
  isClosed: false,
  destination: '',
  hasFog: false,
  tickets,
  updatedAt: 1,
})

test('a ticket is blocked while any blocker is unresolved', () => {
  const view = mapView(
    mapOf([ticket(1, 'resolved'), ticket(2, 'open'), ticket(3, 'open', ['m/01', 'm/02'])]),
  )
  expect(view.takeable.map(t => t.title)).toEqual(['Ticket 2'])
  expect(view.blocked.map(b => b.waitsOn)).toEqual([['Ticket 2']])
})

test('a blocker that is no ticket of the map counts as unresolved, named by its ref', () => {
  const view = mapView(mapOf([ticket(1, 'resolved'), ticket(2, 'open', ['m/01', '#99'])]))
  expect(view.takeable).toEqual([])
  expect(view.blocked.map(b => b.waitsOn)).toEqual([['#99']])
})

test('a Local map and ticket are handed to the skill by file path, a numbered one by its ref', () => {
  const local = ticket(1, 'open')
  expect(mapArg(mapOf([local]))).toBe('.scratch/m/map.md')
  expect(ticketArg(mapOf([local]), local)).toBe('.scratch/m/map.md .scratch/m/issues/01.md')
  const numbered = { ...mapOf([]), ref: '#12' as IssueRef, location: 'https://h/issues/12' }
  const task = { ...local, ref: '#14' as IssueRef, location: 'https://h/issues/14' }
  expect(mapArg(numbered)).toBe('#12')
  expect(ticketArg(numbered, task)).toBe('#12 #14')
})

const billing = (tickets: WayTicket[], over: Partial<WayMap> = {}) =>
  mapView({ ...mapOf(tickets), title: 'Billing v2', ...over })

test('the chip names the map, then how many tickets are decided and open', () => {
  const view = billing([ticket(1, 'resolved'), ticket(2, 'open'), ticket(3, 'claimed')])
  expect(mapChipText(view, false)).toBe('◆ Billing v2 · 1 decided · 2 open')
  expect(mapChipText(view, true)).toBe('* Billing v2 · 1 decided · 2 open')
})

test('the chip keeps its counts when no ticket is open, and says Closed after them', () => {
  const clear = billing([ticket(1, 'resolved')], { hasFog: true })
  expect(mapChipText(clear, false)).toBe('◆ Billing v2 · 1 decided · 0 open')
  expect(mapChipText(clear, false)).not.toMatch(/Route|fog/)
  const closed = billing([ticket(1, 'resolved'), ticket(2, 'open')], { isClosed: true })
  expect(mapChipText(closed, false)).toBe('◆ Billing v2 · 1 decided · 1 open · Closed')
})

test('a long map name is clipped in the chip', () => {
  const view = billing([], { title: 'A very long map name indeed' })
  expect(mapChipText(view, false)).toBe('◆ A very long map… · 0 decided · 0 open')
})

test('the compact counts are decided and open marks, ascii-safe', () => {
  const view = billing([ticket(1, 'resolved'), ticket(2, 'open'), ticket(3, 'open')])
  expect(mapChipCompact(view, false)).toBe('1✓ 2?')
  expect(mapChipCompact(view, true)).toBe('1v 2?')
  expect(mapChipCompact(billing([ticket(1, 'open')], { isClosed: true }), false)).toBe(
    '0✓ 1? Closed',
  )
})

test('the route status asks whether the route is clear only when no ticket is open', () => {
  expect(routeStatus(billing([ticket(1, 'open')]))).toBeNull()
  expect(routeStatus(billing([ticket(1, 'resolved')]))).toBe('No open tickets · Route clear?')
  expect(routeStatus(billing([ticket(1, 'resolved')], { hasFog: true }))).toBe(
    'No open tickets · Route clear? Not yet specified still has fog.',
  )
  expect(routeStatus(billing([ticket(1, 'resolved')], { isClosed: true }))).toBeNull()
})
