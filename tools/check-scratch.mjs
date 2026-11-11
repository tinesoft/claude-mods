#!/usr/bin/env node
// Lints the `.scratch/` tracker (docs/agents/issue-tracker.md) so its state can be trusted:
// - every spec and ticket has exactly one `Status:` line, plain or bold (to-tickets writes bold,
//   wayfinder writes plain, so both stay legal), with a value the readers understand;
// - every `Blocked by:` ref names a file that exists;
// - a file whose status says finished is read as finished by the mod's reader, so the two Local
//   readers can't drift from the status vocabulary again;
// - a spec isn't left `needs-triage` or `ready-for-agent` once every ticket is finished or human-only.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  FINISHED_STATUSES,
  isFinished,
  readScratch,
  ROLES,
  statusLines,
  WORKING_STATUSES,
} from './scratch-read.mjs'

const ALLOWED = new Set([...ROLES, ...FINISHED_STATUSES, ...WORKING_STATUSES])
const OPEN_FOR_AGENT = new Set(['needs-triage', 'ready-for-agent'])

const { snapshot, statusOf, root } = await readScratch()
const problems = []

const checkStatus = (location, values) => {
  if (values.length !== 1) problems.push(`${location}: ${values.length} Status lines, want 1`)
  else if (!ALLOWED.has(values[0]))
    problems.push(`${location}: Status "${values[0]}" is not one of ${[...ALLOWED].join(', ')}`)
}

const files = [
  ...snapshot.issues.map(i => ({
    ...i,
    readFinished: i.status === 'done' || i.status === 'closed',
  })),
  ...(snapshot.maps ?? []).flatMap(m =>
    m.tickets.map(t => ({ ...t, readFinished: t.state === 'resolved' })),
  ),
]
const refs = new Set(files.map(f => f.ref))
for (const f of files) {
  const values = statusOf(f.location)
  checkStatus(f.location, values)
  if (values.length === 1 && isFinished(values[0]) && !f.readFinished)
    problems.push(`${f.location}: Status ${values[0]}, but Craftory's reader takes it as open`)
  for (const b of f.blockedBy) {
    if (!refs.has(b)) problems.push(`${f.location}: Blocked by ${b}, which has no file`)
  }
}

// Other top-level notes (an analysis, a handoff) need no status, but one they carry must be valid.
for (const dir of readdirSync(path.join(root, '.scratch'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  for (const name of readdirSync(path.join(root, '.scratch', dir.name))) {
    if (!name.endsWith('.md') || name === 'spec.md' || name === 'map.md') continue
    const location = `.scratch/${dir.name}/${name}`
    const values = statusLines(readFileSync(path.join(root, location), 'utf8'))
    if (values.length > 0) checkStatus(location, values)
  }
}

for (const s of snapshot.issues.filter(i => i.kind === 'spec')) {
  const own = statusOf(s.location)[0]
  const tickets = snapshot.issues.filter(i => i.parent === s.ref).map(i => statusOf(i.location)[0])
  if (!OPEN_FOR_AGENT.has(own) || tickets.length === 0) continue
  if (tickets.every(t => isFinished(t) || t === 'ready-for-human')) {
    const next = tickets.every(t => isFinished(t)) ? 'resolved' : 'ready-for-human'
    problems.push(`${s.location}: Status ${own}, but no ticket is left for an agent; set ${next}`)
  }
}

if (snapshot.problem) problems.push(snapshot.problem)
for (const p of problems) console.error(p)
if (problems.length > 0) {
  console.error(`\n${problems.length} .scratch problem(s); see docs/agents/issue-tracker.md`)
  process.exit(1)
}
console.log('.scratch ok')
