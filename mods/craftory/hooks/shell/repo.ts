import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  AGENT_DOCS,
  docsOf,
  ensureGitignore,
  readSetup,
  remoteHostOf,
  type SetupFiles,
  steeringOf,
} from '../../src/agents-md'
import { CONFIG_PATH, configOf, parseConfig } from '../../src/config'
import {
  type FileWrite,
  GITIGNORE,
  isGuarded,
  isWritable,
  type WritableContext,
} from '../../src/files'
import { parseGlossary, termsOf } from '../../src/glossary'
import {
  INSTALL_TIMEOUT_MS,
  installOutcome,
  LIST_ARGV,
  pluginStatus,
  PROBE_TIMEOUT_MS,
} from '../../src/plugin'
import { planScratchImport, type ScratchFile } from '../../src/scratch'
import type { InstallState, RepoSnapshot } from '../../types'

const repoState = atom({ plugin: 'craftory', key: 'repo' } as const, null)

const pluginState = atom({ plugin: 'craftory', key: 'plugin' } as const, { kind: 'checking' })

const installState = atom({ plugin: 'craftory', key: 'install' } as const, { kind: 'idle' })

export function repoSnapshot($: EngineInterface) {
  return read($, repoState)
}

/** The snapshot with the config and docs layout read from it, defaulted while the repo is unread. */
export async function repoFacts($: EngineInterface) {
  const repo = await read($, repoState)
  return { repo, config: configOf(repo?.config), docs: docsOf(repo?.setup) }
}

export function pluginOf($: EngineInterface) {
  return read($, pluginState)
}

export function installOf($: EngineInterface) {
  return read($, installState)
}

/**
 * The engine resolves a relative path against the session's directory, which is not always the
 * repo root, so every repo file is addressed from the root git reports. Without git it stays
 * relative.
 */
export async function repoRoot($: EngineInterface): Promise<string | null> {
  const top = await sh($, ['git', 'rev-parse', '--show-toplevel'], { timeoutMs: PROBE_TIMEOUT_MS })
  const root = top?.exitCode === 0 ? top.stdout.trim() : ''
  return root === '' ? null : root
}

export async function repoPath($: EngineInterface, path: string): Promise<string> {
  const root = await repoRoot($)
  return root === null ? path : `${root}/${path}`
}

export async function readText($: EngineInterface, path: string): Promise<string | null> {
  return $.fs.read(await repoPath($, path)).catch(() => null)
}

export async function exists($: EngineInterface, path: string): Promise<boolean> {
  return $.fs.exists(await repoPath($, path)).catch(() => false)
}

export async function listDir($: EngineInterface, path: string) {
  return $.fs.list(await repoPath($, path))
}

/** `git remote get-url origin`; the desktop and mobile surfaces run no commands, so null there. */
export function remoteUrl($: EngineInterface): Promise<string | null> {
  return $.process
    .run(['git', 'remote', 'get-url', 'origin'], { timeoutMs: PROBE_TIMEOUT_MS })
    .then(r => (r.exitCode === 0 ? r.stdout.trim() : null))
    .catch(() => null)
}

export async function readSetupFiles($: EngineInterface): Promise<SetupFiles> {
  const [tracker, triage, domain, claudeMd, agentsMd, gitignore] = await Promise.all([
    readText($, AGENT_DOCS.tracker),
    readText($, AGENT_DOCS.triage),
    readText($, AGENT_DOCS.domain),
    readText($, 'CLAUDE.md'),
    readText($, 'AGENTS.md'),
    readText($, GITIGNORE),
  ])
  return { tracker, triage, domain, claudeMd, agentsMd, gitignore }
}

export async function loadRepo($: EngineInterface) {
  const [configText, files] = await Promise.all([readText($, CONFIG_PATH), readSetupFiles($)])
  const config = parseConfig(configText)
  const setup = readSetup(files)
  const [glossaryText, hasContextMd, hasScratch, url, at] = await Promise.all([
    readText($, docsOf(setup).glossary),
    exists($, 'CONTEXT.md'),
    exists($, '.scratch'),
    remoteUrl($),
    $.clock.now(),
  ])
  const file = steeringOf(files)
  const steering = file === 'CLAUDE.md' ? files.claudeMd : files.agentsMd
  const { worktrees, tracker } = configOf(config)
  const scratchCount = hasScratch ? (await scratchPlan($, tracker.local.folder)).items.length : 0
  const snapshot: RepoSnapshot = {
    config,
    setup,
    glossary: parseGlossary(glossaryText),
    steering: { file, hasBlock: steering !== null && /^## Agent skills\s*$/m.test(steering) },
    remoteHost: remoteHostOf(url),
    hasContextMd,
    hasScratch,
    scratchCount,
    hasGitignoreEntry:
      files.gitignore !== null &&
      ensureGitignore(files.gitignore, worktrees.folder) === files.gitignore,
    at,
  }
  await update($, repoState, () => snapshot)
}

async function readScratch($: EngineInterface): Promise<ScratchFile[]> {
  const found: ScratchFile[] = []
  const take = async (path: string) => {
    const text = await readText($, path)
    if (text !== null) found.push({ path, text })
  }
  const features = (await listDir($, '.scratch').catch(() => [])).filter(e => e.kind === 'dir')
  for (const feature of features) {
    const base = `.scratch/${feature.name}`
    await take(`${base}/spec.md`)
    const issues = await listDir($, `${base}/issues`).catch(() => [])
    for (const issue of issues)
      if (issue.kind === 'file' && issue.name.endsWith('.md'))
        await take(`${base}/issues/${issue.name}`)
  }
  return found
}

export async function scratchPlan($: EngineInterface, folder: string) {
  const taken = (await listDir($, folder).catch(() => []))
    .map(e => /^(\d+)-/.exec(e.name)?.[1])
    .flatMap(n => (n === undefined ? [] : [Number(n)]))
  return planScratchImport({ files: await readScratch($), taken, folder })
}

export async function detectPlugin($: EngineInterface) {
  const commands = await $.command.list().catch(() => [])
  const listJson = await $.process
    .run(LIST_ARGV, { timeoutMs: PROBE_TIMEOUT_MS })
    .then(r => (r.exitCode === 0 ? r.stdout : null))
    .catch(() => null)
  await update($, pluginState, () => pluginStatus({ commands, listJson }))
}

export async function installPlugin($: EngineInterface, argv: readonly string[]) {
  const setInstall = (state: InstallState) => update($, installState, () => state)
  await setInstall({ kind: 'installing', startedAt: await $.clock.now() })
  $.ui.invalidate('ui.render')
  const result = await $.process
    .run(argv, { timeoutMs: INSTALL_TIMEOUT_MS })
    .catch(error => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  const outcome = installOutcome(result)
  await setInstall(outcome.ok ? { kind: 'restart' } : { kind: 'failed', message: outcome.message })
  await detectPlugin($)
  $.ui.invalidate('ui.render')
}

export async function writableContext($: EngineInterface, steering?: WritableContext['steering']) {
  const { repo, config, docs } = await repoFacts($)
  return {
    steering: repo?.steering.file ?? steering ?? null,
    docs,
    issuesFolder: config.tracker.local.folder,
  } satisfies WritableContext
}

type WriteResult = { ok: true } | { ok: false; reason: string }

export async function writeRepoFile(
  $: EngineInterface,
  op: FileWrite,
  ctx: WritableContext,
): Promise<WriteResult> {
  if (!isWritable(op.path, ctx))
    throw new Error(`craftory: ${op.path} is not a file Craftory writes`)
  if (isGuarded(op.path, ctx) && (await readText($, op.path)) !== op.before) {
    return { ok: false, reason: `${op.path} changed since it was planned` }
  }
  await $.fs.write(await repoPath($, op.path), op.after)
  return { ok: true }
}

export async function applyWrites(
  $: EngineInterface,
  writes: readonly FileWrite[],
  ctx: WritableContext,
) {
  const wrote: string[] = []
  for (const op of writes) {
    if (op.after === op.before) continue
    const result = await writeRepoFile($, op, ctx)
    if (!result.ok) return { wrote, refused: result.reason }
    wrote.push(op.path)
  }
  return { wrote, refused: null }
}

export async function glossaryTerms($: EngineInterface) {
  const repo = await repoSnapshot($)
  return repo?.glossary.state === 'ok' ? termsOf(repo.glossary.value) : []
}

const GIT_MS = 15_000

type Shell = { exitCode: number; stdout: string; stderr: string }

export function sh(
  $: EngineInterface,
  argv: readonly string[],
  init?: { cwd?: string; timeoutMs?: number },
): Promise<Shell | null> {
  return $.process.run(argv, { timeoutMs: GIT_MS, ...init }).catch(() => null)
}
