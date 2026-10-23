import type { Observed } from './model'

export const mcpParts = (tool: string) => {
  const match = /^mcp__(.+?)__(.+)$/.exec(tool)
  return match ? { server: match[1]!, name: match[2]! } : undefined
}

export const relativePath = (path: string, cwd: string) => {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`
  return path.startsWith(root) ? path.slice(root.length) : path
}

const lastSegments = (path: string, n: number) =>
  path.split('/').filter(Boolean).slice(-n).join('/')

const field = (input: unknown, name: string) => {
  const value = (input as Record<string, unknown> | null)?.[name]
  return typeof value === 'string' ? value : undefined
}

export const callSummary = (tool: string, input: unknown, cwd: string) => {
  const command = field(input, 'command')
  if (tool === 'Bash' && command !== undefined) {
    const words = command
      .trim()
      .split(/\s+/)
      .filter(w => !/^\w+=/.test(w))
    return words.slice(0, 2).join(' ') || 'Bash'
  }
  const path = field(input, 'file_path') ?? field(input, 'notebook_path') ?? field(input, 'path')
  if (path !== undefined) return relativePath(path, cwd)
  const url = field(input, 'url')
  if (url !== undefined) {
    try {
      return new URL(url).hostname
    } catch {
      return tool
    }
  }
  const mcp = mcpParts(tool)
  return mcp ? `${mcp.server} · ${mcp.name}` : tool
}

/**
 * The server's name when the host runs it in process (`source: "sdk"`), such as Desktop's
 * `ccd_turn`: its tools are the host's plumbing, not a server the person added.
 */
export const hostServerOf = (server: unknown) => {
  const { name, source } = (server ?? {}) as { name?: unknown; source?: unknown }
  return source === 'sdk' && typeof name === 'string' ? name : undefined
}

export const fromMcpCall = (
  tool: string,
  isError: boolean,
  hostServers: readonly string[] = [],
): Observed | undefined => {
  const mcp = mcpParts(tool)
  if (!mcp || hostServers.includes(mcp.server)) return undefined
  return {
    kind: 'mcp',
    key: mcp.server,
    label: mcp.server,
    detail: isError ? `${mcp.name} returned an error` : `Called ${mcp.name}`,
    meta: mcp.name,
    status: isError ? 'error' : 'ok',
  }
}

const SKILL_SOURCES: Record<string, string> = {
  userSettings: 'your user skills',
  projectSettings: 'this project',
  policySettings: 'your organization',
  plugin: 'a plugin',
  'built-in': 'Claude Code',
  mcp: 'an MCP server',
}

export const fromSkill = (e: {
  skill: string
  source: string
  pluginName?: string
  path?: string
}): Observed => ({
  kind: 'skill',
  key: e.skill,
  label: e.skill,
  meta: 'Loaded',
  detail: `Claude loaded this skill from ${e.pluginName ?? SKILL_SOURCES[e.source] ?? e.source}.`,
  ...(e.path !== undefined && { source: e.path }),
  ...(e.pluginName !== undefined && { plugin: e.pluginName }),
  status: 'active',
})

export const fromSpawn = (
  e: {
    subagentType: string
    description: string
    background: boolean
    provider: { plugin: string }
  },
  agentId: string | undefined,
): Observed => ({
  kind: 'agent',
  key: e.subagentType,
  label: e.subagentType,
  detail: e.description ? `Started for: ${e.description}` : 'Started a subagent.',
  meta: e.background ? 'background' : 'foreground',
  ...(e.provider.plugin !== 'engine' && { plugin: e.provider.plugin }),
  status: agentId === undefined ? 'ok' : 'running',
  ...(agentId !== undefined && { startedAgentId: agentId, agentId }),
})

export type Verdict = {
  decision: 'allow' | 'ask' | 'deny'
  reason?: string
  rule?: string
  hook?: string
}

const earnsChip = (verdict: Verdict) =>
  verdict.decision === 'ask' ||
  verdict.rule !== undefined ||
  (verdict.decision === 'deny' && verdict.hook === undefined)

export const fromPermission = (
  tool: string,
  input: unknown,
  verdict: Verdict,
  cwd: string,
  callId: string,
): Observed | undefined => {
  if (!earnsChip(verdict)) return undefined
  const summary = callSummary(tool, input, cwd)
  const by = verdict.rule ?? 'the permission mode'
  const detail =
    verdict.decision === 'allow'
      ? `Auto-allowed by ${by}.`
      : verdict.decision === 'deny'
        ? `Denied by ${by}${verdict.reason ? `: ${verdict.reason}` : '.'}`
        : 'Claude asked for permission before running it.'
  return {
    kind: 'perm',
    key: verdict.rule ?? `${tool}:${summary}`,
    label: verdict.decision === 'allow' ? `Allowed: ${summary}` : summary,
    detail,
    meta: tool,
    ...(verdict.decision === 'ask' && { askedCallId: callId }),
    status: verdict.decision === 'deny' ? 'denied' : verdict.decision === 'ask' ? 'running' : 'ok',
  }
}

type HookEntry = { matcher?: unknown; hooks?: unknown }

export const hookCommands = (settings: unknown, event: string, target?: string): string[] => {
  const hooks = (settings as { hooks?: Record<string, unknown> } | null)?.hooks
  const entries = hooks?.[event]
  if (!Array.isArray(entries)) return []
  return (entries as HookEntry[]).flatMap(entry => {
    if (!matches(entry.matcher, target) || !Array.isArray(entry.hooks)) return []
    return (entry.hooks as { command?: unknown; type?: unknown }[]).map(h =>
      typeof h.command === 'string' ? h.command : `${String(h.type ?? 'unknown')} hook`,
    )
  })
}

/** What a hook's matcher is tested against: the tool, or the start source or compaction trigger. */
export const hookTarget = (e: object): string | undefined => {
  for (const name of ['tool_name', 'tool', 'source', 'trigger']) {
    const value = (e as Record<string, unknown>)[name]
    if (typeof value === 'string') return value
  }
  return undefined
}

const matches = (matcher: unknown, target: string | undefined) => {
  if (typeof matcher !== 'string' || matcher === '' || matcher === '*' || target === undefined) {
    return true
  }
  try {
    return new RegExp(`^(?:${matcher})$`).test(target)
  } catch {
    return matcher === target
  }
}

const LAUNCHER_WORD =
  /^(npx|pnpx|bunx|npm|pnpm|yarn|bun|deno|node|uv|python3?|bash|sh|zsh|exec|dlx|run|-.*)$/

export const commandName = (command: string) => {
  const words = command.trim().split(/\s+/)
  const named = words.find(w => !LAUNCHER_WORD.test(w))
  const script =
    words.find(w => w.includes('/') || /\.(sh|js|mjs|ts|py)$/.test(w)) ?? named ?? words[0] ?? ''
  const base = script.split('/').pop() ?? script
  return base.replace(/\.(sh|js|mjs|cjs|ts|py)$/, '') || command
}

export type HookOutcome = 'running' | { blocked?: string }

export const fromHook = (
  event: string,
  commands: readonly string[],
  outcome: HookOutcome,
  target: string | undefined,
): Observed | undefined => {
  const blocked = outcome === 'running' ? undefined : outcome.blocked
  if (commands.length === 0 && blocked === undefined) return undefined
  const only = commands.length === 1 ? commands[0] : undefined
  const n = commands.length === 1 ? '1 command' : `${commands.length} commands`
  return {
    kind: 'hook',
    key: only ?? event,
    label: only !== undefined ? commandName(only) : `${event} hooks`,
    detail:
      outcome === 'running'
        ? `Running ${n}.`
        : blocked !== undefined
          ? `Blocked: ${blocked}`
          : `Ran ${n}.`,
    meta: target !== undefined ? `${event} · ${target}` : event,
    ...(only !== undefined && { source: only }),
    status: outcome === 'running' ? 'running' : blocked !== undefined ? 'blocked' : 'ok',
  }
}

const REASONS: Record<string, string> = {
  session_start: 'at session start',
  nested_traversal: 'when Claude entered its folder',
  path_glob_match: 'when a matching file was read',
  include: 'through an @ import',
  compact: 'after compaction',
}

export const fromInstructions = (
  file: { path: string; tier: string; reason?: string; lines?: number | undefined },
  cwd: string,
): Observed => {
  const relative = relativePath(file.path, cwd)
  const isOutside = relative === file.path
  const when =
    file.reason !== undefined ? (REASONS[file.reason] ?? file.reason) : 'at session start'
  const lines = file.lines !== undefined ? ` · ${file.lines} lines` : ''
  return {
    kind: 'rule',
    key: file.path,
    label: isOutside ? lastSegments(file.path, 2) : relative,
    detail: `Loaded ${when}${lines}.`,
    meta: file.tier.toLowerCase(),
    source: file.path,
    status: 'active',
  }
}

export const lineCount = (text: string) => (text === '' ? 0 : text.split('\n').length)

export const fromCommand = (command: string, args: string): Observed => ({
  kind: 'command',
  key: command,
  label: command,
  detail: args ? `Ran /${command} ${args}` : `Ran /${command}`,
  status: 'ok',
})

export const fromCompaction = (trigger: string): Observed => ({
  kind: 'context',
  key: 'compaction',
  label: 'Compacted',
  detail: `The conversation was compacted (${trigger}).`,
  status: 'active',
})

export const fromContextUsage = (percent: number): Observed => ({
  kind: 'context',
  key: 'usage',
  label: `${Math.round(percent)}% used`,
  detail: `The context window is ${Math.round(percent)}% full.`,
  status: 'active',
})

export const fromModel = (model: string): Observed => ({
  kind: 'model',
  key: 'model',
  label: `Model: ${model}`,
  detail: `Switched the model to ${model}.`,
  status: 'active',
})

export const fromBackground = (command: string, cwd: string): Observed => ({
  kind: 'background',
  key: callSummary('Bash', { command }, cwd),
  label: callSummary('Bash', { command }, cwd),
  detail: 'Started in the background.',
  source: command,
  status: 'ok',
})

const MEMORY_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])

const isMemoryFile = (path: string) => {
  const name = path.split('/').pop() ?? path
  return (
    name === 'CLAUDE.md' ||
    name === 'CLAUDE.local.md' ||
    (name.endsWith('.md') && path.split('/').includes('memory'))
  )
}

export const fromMemoryWrite = (tool: string, input: unknown): Observed | undefined => {
  const path = field(input, 'file_path')
  if (!MEMORY_TOOLS.has(tool) || path === undefined || !isMemoryFile(path)) return undefined
  const name = path.split('/').pop() ?? path
  return {
    kind: 'memory',
    key: path,
    label: `Remembered: ${name}`,
    detail: `Claude updated ${name} with ${tool}.`,
    meta: tool,
    source: path,
    status: 'active',
  }
}

/** The one-line notice for an action that was just stopped; undefined for anything else. */
export const stopNotice = (
  seen: Pick<Observed, 'status' | 'label' | 'meta'>,
): string | undefined => {
  if (seen.status === 'blocked') {
    const tool = seen.meta?.split(' · ')[1]
    return `↯ ${seen.label} blocked ${tool ?? 'an action'}`
  }
  if (seen.status === 'denied') return `⚷ ${seen.meta ?? 'A tool'} denied: ${seen.label}`
  return undefined
}
