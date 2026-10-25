import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  AGENT_DOCS,
  DEFAULT_DOCS,
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
  isShared,
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
import type { InstallState, RepoSnapshot } from '../../types'

const repoState = atom({ plugin: 'craftory', key: 'repo' } as const, null)

const pluginState = atom({ plugin: 'craftory', key: 'plugin' } as const, { kind: 'checking' })

const installState = atom({ plugin: 'craftory', key: 'install' } as const, { kind: 'idle' })

export function repoSnapshot($: EngineInterface) {
  return read($, repoState)
}

export function pluginOf($: EngineInterface) {
  return read($, pluginState)
}

export function installOf($: EngineInterface) {
  return read($, installState)
}

export function readText($: EngineInterface, path: string): Promise<string | null> {
  return $.fs.read(path).catch(() => null)
}

export function exists($: EngineInterface, path: string): Promise<boolean> {
  return $.fs.exists(path).catch(() => false)
}

export /** `git remote get-url origin`; the desktop and mobile surfaces run no commands, so null there. */ function remoteUrl(
  $: EngineInterface,
): Promise<string | null> {
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
  const glossaryPath = setup.state === 'ok' ? setup.value.docs.glossary : DEFAULT_DOCS.glossary
  const [glossaryText, hasContextMd, hasScratch, url, at] = await Promise.all([
    readText($, glossaryPath),
    exists($, 'CONTEXT.md'),
    exists($, '.scratch'),
    remoteUrl($),
    $.clock.now(),
  ])
  const file = steeringOf(files)
  const steering = file === 'CLAUDE.md' ? files.claudeMd : files.agentsMd
  const worktrees = configOf(config).worktrees.folder
  const snapshot: RepoSnapshot = {
    config,
    setup,
    glossary: parseGlossary(glossaryText),
    steering: { file, hasBlock: steering !== null && /^## Agent skills\s*$/m.test(steering) },
    remoteHost: remoteHostOf(url),
    hasContextMd,
    hasScratch,
    hasGitignoreEntry:
      files.gitignore !== null && ensureGitignore(files.gitignore, worktrees) === files.gitignore,
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
  const repo = await repoSnapshot($)
  const config = configOf(repo?.config)
  return {
    steering: repo?.steering.file ?? steering ?? null,
    docs: repo?.setup.state === 'ok' ? repo.setup.value.docs : DEFAULT_DOCS,
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
  if (isShared(op.path, ctx) && (await readText($, op.path)) !== op.before) {
    return { ok: false, reason: `${op.path} changed since it was planned` }
  }
  await $.fs.write(op.path, op.after)
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
