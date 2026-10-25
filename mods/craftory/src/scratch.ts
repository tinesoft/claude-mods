import { withSlash, type FileWrite } from './files'

export type ScratchFile = { path: string; text: string }

export type ScratchItem = { from: string; to: string; ref: string; title: string }

export type ScratchPlan = { items: ScratchItem[]; writes: FileWrite[] }

const slugOf = (name: string) =>
  name
    .replace(/\.md$/, '')
    .replace(/^\d+-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const titleOf = (text: string, fallback: string) =>
  /^# (.+?)\s*$/m.exec(text)?.[1] ?? fallback.replace(/-/g, ' ')

const lineValue = (text: string, label: string) =>
  new RegExp(`^(?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*?)[ \\t]*$`, 'im').exec(
    text.split('\n').slice(0, 40).join('\n'),
  )?.[1]

const STATUS = /^[a-z][a-z-]*$/

const frontMatter = (fields: Record<string, string | undefined>) =>
  `---\n${Object.entries(fields)
    .flatMap(([k, v]) => (v === undefined || v === '' ? [] : [`${k}: ${v}`]))
    .join('\n')}\n---\n`

function classify(path: string) {
  const parts = path.replace(/^\.scratch\//, '').split('/')
  const feature = parts[0]
  if (feature === undefined || parts.length < 2) return undefined
  if (parts.length === 2 && parts[1] === 'spec.md') return { feature, kind: 'spec' as const }
  const match = /^(\d+)-.*\.md$/.exec(parts[2] ?? '')
  return parts.length === 3 && parts[1] === 'issues' && match
    ? { feature, kind: 'ticket' as const, n: Number(match[1]) }
    : undefined
}

export function planScratchImport(args: {
  files: readonly ScratchFile[]
  taken: readonly number[]
  folder: string
}): ScratchPlan {
  const { files, taken } = args
  const folder = withSlash(args.folder)
  let next = Math.max(0, ...taken) + 1
  const items: ScratchItem[] = []
  const writes: FileWrite[] = []
  const features = [...new Set(files.flatMap(f => classify(f.path)?.feature ?? []))].sort()
  for (const feature of features) {
    const mine = files.flatMap(f => {
      const c = classify(f.path)
      return c?.feature === feature ? [{ ...f, ...c }] : []
    })
    const spec = mine.find(f => f.kind === 'spec')
    const tickets = mine
      .flatMap(f => (f.kind === 'ticket' ? [{ ...f, n: f.n }] : []))
      .sort((a, b) => a.n - b.n)
    const specNumber = spec === undefined ? undefined : next++
    const numbers = new Map(tickets.map(t => [t.n, next++]))
    const put = (
      file: ScratchFile,
      n: number,
      slug: string,
      fields: Record<string, string | undefined>,
    ) => {
      const to = `${folder}${n}-${slug || 'issue'}.md`
      writes.push({ path: to, before: null, after: frontMatter(fields) + file.text })
      items.push({ from: file.path, to, ref: `#${n}`, title: titleOf(file.text, slug) })
    }
    if (spec !== undefined && specNumber !== undefined) {
      const status = lineValue(spec.text, 'Status')?.toLowerCase()
      put(spec, specNumber, slugOf(feature), {
        type: 'spec',
        ...(status !== undefined && STATUS.test(status) && { status }),
      })
    }
    for (const ticket of tickets) {
      const status = lineValue(ticket.text, 'Status')?.toLowerCase()
      const blockers = [...(lineValue(ticket.text, 'Blocked by') ?? '').matchAll(/\d+/g)]
        .flatMap(m => numbers.get(Number(m[0])) ?? [])
        .map(n => String(n))
      put(ticket, numbers.get(ticket.n)!, slugOf(ticket.path.split('/').pop()!), {
        type: 'ticket',
        ...(specNumber !== undefined && { parent: String(specNumber) }),
        ...(status !== undefined && STATUS.test(status) && { status }),
        ...(blockers.length > 0 && { 'blocked-by': `[${blockers.join(', ')}]` }),
      })
    }
  }
  return { items, writes }
}

export function scratchSummary(plan: ScratchPlan): string {
  const first = plan.items[0]
  const last = plan.items.at(-1)
  if (first === undefined || last === undefined) return 'nothing to import'
  return `${plan.items.length} issues as ${first.ref}${plan.items.length > 1 ? ` to ${last.ref}` : ''}`
}
