import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  AGENT_DOCS,
  docsOf,
  ensureCraftoryIgnores,
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
import { mergedTerms, parseGlossary, termsOf } from '../../src/glossary'
import {
  INSTALL_TIMEOUT_MS,
  installOutcome,
  LIST_ARGV,
  pluginStatus,
  PROBE_TIMEOUT_MS,
} from '../../src/plugin'
import type { ContextSnapshot, DocsLayout, InstallState, RepoSnapshot } from '../../types'
import { GLOSSARY_MAP, parseGlossaryMap, titleOf } from '../../src/glossary-map'

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

/**
 * The glossary map when it exists on disk, whatever docs/agents/domain.md says, with each
 * context's glossary; else the one glossary of a single-context repo.
 */
async function loadContexts($: EngineInterface, docs: DocsLayout) {
  const mapText = await readText($, docs.map ?? GLOSSARY_MAP)
  const glossaryMap = mapText === null ? null : parseGlossaryMap(mapText)
  const entries = glossaryMap?.contexts ?? [
    { name: '', description: '', path: docs.glossary, folder: '.' },
  ]
  const contexts = await Promise.all(
    entries.map(async (entry): Promise<ContextSnapshot> => {
      const text = await readText($, entry.path)
      return {
        ...entry,
        name: glossaryMap === null ? titleOf(text) : entry.name,
        glossary: parseGlossary(text),
      }
    }),
  )
  return { contexts, glossaryMap }
}

export async function loadRepo($: EngineInterface) {
  const [configText, files] = await Promise.all([readText($, CONFIG_PATH), readSetupFiles($)])
  const config = parseConfig(configText)
  const setup = readSetup(files)
  const docs = docsOf(setup)
  const [{ contexts, glossaryMap }, hasContextMd, hasScratch, url, at] = await Promise.all([
    loadContexts($, docs),
    exists($, 'CONTEXT.md'),
    exists($, '.scratch'),
    remoteUrl($),
    $.clock.now(),
  ])
  const file = steeringOf(files)
  const steering = file === 'CLAUDE.md' ? files.claudeMd : files.agentsMd
  const { worktrees } = configOf(config)
  const snapshot: RepoSnapshot = {
    config,
    setup,
    contexts,
    glossaryMap,
    steering: { file, hasBlock: steering !== null && /^## Agent skills\s*$/m.test(steering) },
    remoteHost: remoteHostOf(url),
    hasContextMd,
    hasScratch,
    hasGitignoreEntry:
      files.gitignore !== null &&
      ensureCraftoryIgnores(files.gitignore, worktrees.folder) === files.gitignore,
    at,
  }
  await update($, repoState, () => snapshot)
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
  const { repo, docs } = await repoFacts($)
  return {
    steering: repo?.steering.file ?? steering ?? null,
    docs,
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
  return (repo?.contexts ?? []).flatMap(c =>
    c.glossary.state === 'ok' ? termsOf(c.glossary.value) : [],
  )
}

/**
 * The reply's terms: one entry per name, with every context's definition labelled when the repo
 * has a map; a repo without one reads as the flat list.
 */
export async function glossaryEntries($: EngineInterface) {
  const repo = await repoSnapshot($)
  if (repo?.glossaryMap == null) return glossaryTerms($)
  return mergedTerms(repo.contexts)
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
