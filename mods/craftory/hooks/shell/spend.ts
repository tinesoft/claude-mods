import { atom, type EngineInterface, read, type Timer, update } from 'claude-code'
import { isoOf } from '../../src/build'
import { SPEND_DIR } from '../../src/files'
import {
  EMPTY_SPEND,
  observe,
  parseSpendFile,
  reading,
  rowsBySpec,
  seedRows,
  serialiseSpendFile,
  sessionRows,
  sessionSlug,
  specOfKey,
  spendPath,
  spendSlug,
  spendText,
  type SpendTotal,
  tokensOf,
  totalOf,
} from '../../src/spend'
import type { FeatureKey, SpendDisk, SpendRow, SpendTarget } from '../../types'
import { listDir, readText, sh, writableContext, writeRepoFile } from './repo'

const spendState = atom({ plugin: 'craftory', key: 'spend' } as const, EMPTY_SPEND)

const EMPTY_DISK: SpendDisk = {
  session: null,
  user: null,
  startedAt: null,
  others: {},
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

/** `git config user.email`, or null when it is unset or no command can run here. */
async function userOf($: EngineInterface): Promise<string | null> {
  const out = await sh($, ['git', 'config', 'user.email'])
  const email = out?.exitCode === 0 ? out.stdout.trim() : ''
  return email === '' ? null : email
}

type SessionFiles = { others: Record<string, SpendRow[]>; own: SpendRow[]; skipped: string[] }

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
      else out.others[folder.name] = [...(out.others[folder.name] ?? []), ...parsed.value.rows]
    }
  }
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
  const files = await readSessionFiles($, session)
  await update($, spendState, () => seedRows({ ...EMPTY_SPEND, baseline: usd ?? null }, files.own))
  await update($, diskState, () => ({
    ...EMPTY_DISK,
    session,
    user,
    startedAt: isoOf(now),
    others: files.others,
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
  const bySpec = rowsBySpec(sessionRows(await read($, spendState)))
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
  const spec = specOfKey(feature)
  return totalOf(ledger, feature, spec === null ? [] : (disk.others[spendSlug(spec)] ?? []))
}

/** Spend files that could not be read, for the Spend tab. */
export async function skippedSpendFiles($: EngineInterface): Promise<string[]> {
  return (await read($, diskState)).skipped
}
