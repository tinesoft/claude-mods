import { atom, type EngineInterface, read, type Timer, update } from 'claude-code'
import { isoOf } from '../../src/build'
import { SPEND_DIR } from '../../src/files'
import {
  breakdownOf,
  draftOfKey,
  EMPTY_SPEND,
  observe,
  otherRowsOf,
  OUTSIDE_DAYS,
  phaseSpendText,
  spendSummaryLine,
  ownRowsOf,
  parseLocalSpend,
  rekeyLedger,
  rekeyRows,
  rowsOfKey,
  STORE_SPEND_OUTSIDE,
  storeDraftKey,
  withinDays,
  withSession,
  parseSpendFile,
  reading,
  rowsBySpec,
  seedRows,
  serialiseSpendFile,
  sessionRows,
  sessionSlug,
  specOfKey,
  spendPath,
  type SpendBreakdown,
  spendSlug,
  spendText,
  type SpendTotal,
  tokensOf,
  totalOf,
} from '../../src/spend'
import type { Flow } from '../../src/evidence'
import { draftKey, isArchived, specKey } from '../../src/features'
import { PHASE_ORDER } from '../../src/phases'
import {
  parseSpendGroup,
  type PersonRow,
  type SpendFeatureInput,
  type SpendGroup,
  spendTabView,
  type SpendTabView,
  STORE_SPEND_GROUP,
} from '../../src/spend-view'
import type {
  FeatureKey,
  LocalSpend,
  PhaseId,
  SessionSpend,
  SpendDisk,
  SpendLedger,
  SpendRow,
  SpendTarget,
} from '../../types'
import { draftsOf, featuresOf } from './features'
import { listDir, readText, sh, writableContext, writeRepoFile } from './repo'

const spendState = atom({ plugin: 'craftory', key: 'spend' } as const, EMPTY_SPEND)

const EMPTY_DISK: SpendDisk = {
  session: null,
  user: null,
  startedAt: null,
  others: {},
  drafts: {},
  outside: [],
  hasCost: false,
  skipped: [],
  written: {},
}
const diskState = atom({ plugin: 'craftory', key: 'spendDisk' } as const, EMPTY_DISK)

/** While agents step, their spend is written at most this often, so a crash loses little. */
export const FLUSH_EVERY_MS = 30_000

let flushTimer: Timer | undefined

/** The session's cost so far; undefined where the host keeps no cost ledger or the read failed. */
async function costOf($: EngineInterface): Promise<number | undefined> {
  return $.session
    .usage()
    .then(u => u.cost?.usd)
    .catch(() => undefined)
}

/** One `git config` value, or '' when it is unset or no command can run here. */
async function gitConfig($: EngineInterface, key: string): Promise<string> {
  const out = await sh($, ['git', 'config', key])
  return out?.exitCode === 0 ? out.stdout.trim() : ''
}

/**
 * Who ran the session, as git knows them: `Name <email>`, or whichever of the two is set; null
 * when neither is or no command can run here.
 */
async function userOf($: EngineInterface): Promise<string | null> {
  const [name, email] = await Promise.all([gitConfig($, 'user.name'), gitConfig($, 'user.email')])
  if (name !== '' && email !== '') return `${name} <${email}>`
  return name || email || null
}

type SessionFiles = {
  others: Record<string, SessionSpend[]>
  own: SpendRow[]
  skipped: string[]
}

/**
 * Every committed spend file: other sessions' rows by Feature slug, this session's own rows (a
 * resumed session wrote them before), and the files that could not be read.
 */
async function readSessionFiles($: EngineInterface, session: string): Promise<SessionFiles> {
  const out: SessionFiles = { others: {}, own: [], skipped: [] }
  const folders = await listDir($, SPEND_DIR).catch(() => [])
  for (const folder of folders) {
    if (folder.kind !== 'dir') continue
    const files = await listDir($, `${SPEND_DIR}${folder.name}`).catch(() => [])
    for (const entry of files) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
      const path = `${SPEND_DIR}${folder.name}/${entry.name}`
      const raw = await readText($, path)
      const parsed = raw === null ? null : parseSpendFile(raw)
      if (parsed?.state !== 'ok') {
        out.skipped.push(path)
        continue
      }
      if (entry.name === `${sessionSlug(session)}.json`) out.own.push(...parsed.value.rows)
      else
        out.others[folder.name] = [
          ...(out.others[folder.name] ?? []),
          {
            session: parsed.value.session,
            user: parsed.value.user ?? null,
            rows: parsed.value.rows,
          },
        ]
    }
  }
  return out
}

async function localOf($: EngineInterface, key: string): Promise<LocalSpend> {
  return parseLocalSpend(await $.store.get(key).catch(() => undefined))
}

type LocalRows = { drafts: Record<string, SpendRow[]>; outside: SpendRow[]; own: SpendRow[] }

/**
 * The spend kept on this machine: other sessions' rows of each draft still in flight and of
 * Outside features (the last 30 days of it), and this session's own, which a resume takes back.
 */
async function readLocal($: EngineInterface, session: string, now: number): Promise<LocalRows> {
  const out: LocalRows = { drafts: {}, outside: [], own: [] }
  for (const id of Object.keys(await draftsOf($))) {
    const local = await localOf($, storeDraftKey(id))
    out.drafts[id] = otherRowsOf(local, session)
    out.own.push(...ownRowsOf(local, session))
  }
  const outside = withinDays(await localOf($, STORE_SPEND_OUTSIDE), now, OUTSIDE_DAYS)
  out.outside = otherRowsOf(outside, session)
  out.own.push(...ownRowsOf(outside, session))
  return out
}

/**
 * At session start: the cost already on the session (0 for a new one, more after a resume) is the
 * baseline, so the first step is priced and nothing from before the resume is charged to it. The
 * session's own files, when a resume finds them, are taken back, and every other session's are
 * read for the totals.
 */
export async function startSpend($: EngineInterface) {
  const [usd, session, user, now] = await Promise.all([
    costOf($),
    $.session.id(),
    userOf($),
    $.clock.now(),
  ])
  const [files, local] = await Promise.all([
    readSessionFiles($, session),
    readLocal($, session, now),
  ])
  await update($, spendState, () =>
    seedRows({ ...EMPTY_SPEND, baseline: usd ?? null }, [...files.own, ...local.own]),
  )
  await update($, diskState, () => ({
    ...EMPTY_DISK,
    session,
    user,
    startedAt: isoOf(now),
    others: files.others,
    drafts: local.drafts,
    outside: local.outside,
    hasCost: usd !== undefined,
    skipped: files.skipped,
  }))
}

/** Reads the other sessions' files again: after each tracker refresh, when a pull may bring some. */
export async function reloadSpendFiles($: EngineInterface) {
  const { session } = await read($, diskState)
  if (session === null) return
  const files = await readSessionFiles($, session)
  await update($, diskState, disk => ({ ...disk, others: files.others, skipped: files.skipped }))
}

/**
 * Writes this session's spend, one file per Feature it touched. A file whose text has not changed
 * is not written again. A write that fails is left for the next flush, which rewrites the whole
 * file, so nothing is lost but the time in between.
 */
export async function flushSpend($: EngineInterface) {
  const disk = await read($, diskState)
  if (disk.session === null || disk.startedAt === null) return
  const all = sessionRows(await read($, spendState))
  await saveLocal($, disk.session, all)
  const bySpec = rowsBySpec(all)
  if (bySpec.size === 0) return
  const ctx = await writableContext($)
  const written: Record<string, string> = {}
  for (const [spec, rows] of bySpec) {
    const path = spendPath(spec, disk.session)
    const after = serialiseSpendFile({
      version: 1,
      session: disk.session,
      ...(disk.user !== null && { user: disk.user }),
      startedAt: disk.startedAt,
      rows,
    })
    if (disk.written[path] === after) continue
    const before = await readText($, path)
    const ok = await writeRepoFile($, { path, before, after }, ctx).then(
      r => r.ok,
      () => false,
    )
    if (ok) written[path] = after
  }
  if (Object.keys(written).length > 0)
    await update($, diskState, held => ({ ...held, written: { ...held.written, ...written } }))
}

/**
 * Keeps this session's draft and Outside features rows in `$.store`, never in the repo: a draft
 * has no spec to file them under yet, and Outside features is nobody's Feature.
 */
async function saveLocal($: EngineInterface, session: string, rows: readonly SpendRow[]) {
  const now = await $.clock.now()
  const at = isoOf(now)
  const drafts = new Set(rows.flatMap(r => draftOfKey(r.feature) ?? []))
  for (const id of drafts) {
    const key = storeDraftKey(id)
    const mine = rowsOfKey(rows, `draft:${id}`)
    await $.store.set(key, withSession(await localOf($, key), session, mine, at))
  }
  const outside = rowsOfKey(rows, null)
  if (outside.length === 0) return
  const kept = withinDays(await localOf($, STORE_SPEND_OUTSIDE), now, OUTSIDE_DAYS)
  await $.store.set(STORE_SPEND_OUTSIDE, withSession(kept, session, outside, at))
}

/**
 * A draft's spec bound: its spend follows it. This session's rows are charged to the spec, every
 * other session's stored rows of the draft join them, and the stored entry is cleared, so the
 * next flush commits all of it, once, in this session's file.
 */
export async function moveDraftSpend($: EngineInterface, from: FeatureKey, to: FeatureKey) {
  const id = draftOfKey(from)
  if (id === null) return
  const disk = await read($, diskState)
  const theirs = rekeyRows(
    disk.session === null ? [] : otherRowsOf(await localOf($, storeDraftKey(id)), disk.session),
    from,
    to,
  )
  await update($, spendState, ledger => seedRows(rekeyLedger(ledger, from, to), theirs))
  await $.store.delete(storeDraftKey(id))
  await update($, diskState, held => ({
    ...held,
    drafts: Object.fromEntries(Object.entries(held.drafts).filter(([d]) => d !== id)),
  }))
  $.clock.after(0, () => void flushSpend($))
}

/** After an agent's step: a flush within `FLUSH_EVERY_MS`, unless one is already due. */
export function scheduleSpendFlush($: EngineInterface) {
  if (flushTimer !== undefined) return
  flushTimer = $.clock.after(FLUSH_EVERY_MS, () => {
    flushTimer = undefined
    void flushSpend($)
  })
}

/**
 * The session ends. Its spend is written one last time. After a `/clear` the process goes on
 * under a new id with no `session.start`, so the ledger starts over for it: the next step sets the
 * baseline, and the next flush writes a new file.
 */
export async function endSpend($: EngineInterface, isCleared: boolean) {
  flushTimer?.cancel()
  flushTimer = undefined
  await flushSpend($)
  if (!isCleared) return
  const session = await $.session.id().catch(() => null)
  await update($, spendState, () => EMPTY_SPEND)
  await update($, diskState, disk => ({ ...disk, written: {}, session }))
}

/**
 * One answered step: rolls its tokens up under `target`, and shares out whatever the session's
 * cost moved by since the last reading. Answers whether the short spend text changed, so the
 * caller redraws the status line only then.
 */
export async function noteSpendStep(
  $: EngineInterface,
  target: SpendTarget,
  usage: {
    model: string
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  } | null,
  active: FeatureKey | null,
): Promise<boolean> {
  if (usage === null) return false
  const usd = await costOf($)
  if (usd !== undefined)
    await update($, diskState, disk => (disk.hasCost ? disk : { ...disk, hasCost: true }))
  const before = await spendTotalOf($, active)
  await update($, spendState, ledger =>
    observe(ledger, { ...target, model: usage.model, tokens: tokensOf(usage) }, usd),
  )
  return spendText(await spendTotalOf($, active)) !== spendText(before)
}

/** A `session.measure` whose cost grew: prices the steps still waiting for it. */
export async function noteSpendReading(
  $: EngineInterface,
  usd: number,
  active: FeatureKey | null,
): Promise<boolean> {
  const before = await spendTotalOf($, active)
  await update($, spendState, ledger => reading(ledger, usd))
  return spendText(await spendTotalOf($, active)) !== spendText(before)
}

/** What the Feature has cost: this session's spend and every other session's committed files. */
export async function spendTotalOf(
  $: EngineInterface,
  feature: FeatureKey | null,
): Promise<SpendTotal> {
  const [ledger, disk] = await Promise.all([read($, spendState), read($, diskState)])
  return totalOf(ledger, feature, diskRowsOf(disk, feature))
}

/** A Feature's spend by phase and by ticket, and whether dollars can be had here at all. */
export async function spendBreakdownOf(
  $: EngineInterface,
  feature: FeatureKey | null,
): Promise<SpendBreakdown & { hasCost: boolean }> {
  const [ledger, disk] = await Promise.all([read($, spendState), read($, diskState)])
  return { ...breakdownOf(ledger, feature, diskRowsOf(disk, feature)), hasCost: disk.hasCost }
}

/**
 * How many sessions spent on the Feature: this one if it did, and every other session whose
 * committed file (or, for a draft, stored entry) has rows for it.
 */
async function sessionsOf(
  $: EngineInterface,
  feature: FeatureKey,
  ledger: SpendLedger,
  disk: SpendDisk,
): Promise<number> {
  const mine = sessionRows(ledger).some(r => r.feature === feature) ? 1 : 0
  const spec = specOfKey(feature)
  if (spec !== null)
    return mine + (disk.others[spendSlug(spec)] ?? []).filter(s => s.rows.length > 0).length
  const draft = draftOfKey(feature)
  if (draft === null || disk.session === null) return mine
  const local = await localOf($, storeDraftKey(draft))
  return (
    mine +
    Object.entries(local.sessions).filter(([id, e]) => id !== disk.session && e.rows.length > 0)
      .length
  )
}

/** The Spend line of `/craftory`'s text reply; null when the Feature spent nothing. */
export async function spendSummaryOf(
  $: EngineInterface,
  feature: FeatureKey,
): Promise<string | null> {
  const [ledger, disk] = await Promise.all([read($, spendState), read($, diskState)])
  const total = totalOf(ledger, feature, diskRowsOf(disk, feature))
  return spendSummaryLine(total, await sessionsOf($, feature, ledger, disk), disk.hasCost)
}

/** Each phase's Spend row for its card, by phase; a phase that spent nothing is left out. */
export async function phaseSpendOf(
  $: EngineInterface,
  feature: FeatureKey | null,
): Promise<Partial<Record<PhaseId, string>>> {
  const { phases, hasCost } = await spendBreakdownOf($, feature)
  return Object.fromEntries(
    PHASE_ORDER.flatMap(p => {
      const total = phases[p]
      const text = total === undefined ? null : phaseSpendText(total, hasCost)
      return text === null ? [] : [[p, text]]
    }),
  )
}

/** Other sessions' rows of a Feature key: committed files, a draft's or Outside features' store. */
function diskRowsOf(disk: SpendDisk, feature: FeatureKey | null): SpendRow[] {
  if (feature === null) return disk.outside
  const spec = specOfKey(feature)
  if (spec !== null) return (disk.others[spendSlug(spec)] ?? []).flatMap(s => s.rows)
  const draft = draftOfKey(feature)
  return draft === null ? [] : (disk.drafts[draft] ?? [])
}

/** The personal choice of how the Spend tab breaks the active Feature down. */
export async function spendGroupOf($: EngineInterface): Promise<SpendGroup> {
  return parseSpendGroup(await $.store.get(STORE_SPEND_GROUP).catch(() => undefined))
}

export async function setSpendGroup($: EngineInterface, group: SpendGroup) {
  await $.store.set(STORE_SPEND_GROUP, group)
  $.ui.invalidate('ui.render')
}

/** Everything the Spend tab shows, gathered from this session, the committed files and the store. */
export async function spendTabOf($: EngineInterface, flow: Flow | null): Promise<SpendTabView> {
  const [ledger, disk, records, drafts, group] = await Promise.all([
    read($, spendState),
    read($, diskState),
    featuresOf($),
    draftsOf($),
    spendGroupOf($),
  ])
  const mine: PersonRow[] = sessionRows(ledger).map(r => ({ ...r, user: disk.user }))
  const tag = (rows: readonly SpendRow[], user: string | null): PersonRow[] =>
    rows.map(r => ({ ...r, user }))
  const diskRows = (key: FeatureKey): PersonRow[] => {
    const spec = specOfKey(key)
    if (spec !== null) return (disk.others[spendSlug(spec)] ?? []).flatMap(s => tag(s.rows, s.user))
    const draft = draftOfKey(key)
    return draft === null ? [] : tag(disk.drafts[draft] ?? [], disk.user)
  }
  const features: SpendFeatureInput[] = [
    ...Object.values(records).map(r => ({
      key: specKey(r.spec),
      title: r.title || r.spec,
      isArchived: isArchived(r),
    })),
    ...Object.values(drafts).map(d => ({
      key: draftKey(d.draftId),
      title: d.title,
      isArchived: false,
    })),
  ].map(f => ({ ...f, rows: [...mine.filter(r => r.feature === f.key), ...diskRows(f.key)] }))
  return spendTabView({
    group,
    hasCost: disk.hasCost,
    active: flow?.feature.key ?? null,
    features,
    titles: Object.fromEntries(flow?.tickets.map(t => [t.issue.ref, t.issue.title]) ?? []),
    outside: [...mine.filter(r => r.feature === null), ...tag(disk.outside, disk.user)],
    skipped: disk.skipped,
  })
}

/** Spend files that could not be read, for the Spend tab. */
export async function skippedSpendFiles($: EngineInterface): Promise<string[]> {
  return (await read($, diskState)).skipped
}
