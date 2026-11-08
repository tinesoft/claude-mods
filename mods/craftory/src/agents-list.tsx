import type { Tone } from '../types'
import type { Acts } from './action'
import {
  barPercent,
  barRole,
  elapsedText,
  hasMeterLine,
  hasWorktreeLine,
  isRunning,
  kTokens,
  ROW_LABELS,
  type AgentRow,
  type AgentsView,
} from './build'
import { MINUS, ROW_ROLES, paint, SPACE, TOKENS } from './theme'
import { branchSvg, hexOr } from './icons'
import { Icon, inkOf, isRich, roleInk, type Ui } from './ui'
import { Badge, CardButton, HookNote } from './widgets'

const BAR_CELLS = { terminal: 12, rich: 16 } as const
const BAR_GLYPHS = { full: '█', empty: '░', fullAscii: '#', emptyAscii: '-' } as const

type AgentArgs = {
  ui: Ui
  tone: Tone | undefined
  ascii: boolean
  on: Acts
}

const TokenBar = ({
  ui,
  tone,
  ascii,
  row,
}: Pick<AgentArgs, 'ui' | 'tone' | 'ascii'> & { row: AgentRow }) => {
  const { Box, Text } = ui
  const colour = paint(barRole(row), tone).fg
  const pct = barPercent(row)
  if (isRich(ui) && tone !== undefined) {
    return (
      <Box key={`agent-bar-${row.ref}`} width={BAR_CELLS.rich} backgroundColor={TOKENS[tone].fill2}>
        <Box key={`agent-bar-fill-${row.ref}`} width={`${pct}%`} backgroundColor={colour}>
          <Text backgroundColor={colour}> </Text>
        </Box>
      </Box>
    )
  }
  const cells = BAR_CELLS.terminal
  const filled = pct === 0 ? 0 : Math.min(cells, Math.max(1, Math.round((pct / 100) * cells)))
  return (
    <Box key={`agent-bar-${row.ref}`} flexDirection="row">
      <Text color={colour}>{(ascii ? BAR_GLYPHS.fullAscii : BAR_GLYPHS.full).repeat(filled)}</Text>
      <Text dimColor>
        {(ascii ? BAR_GLYPHS.emptyAscii : BAR_GLYPHS.empty).repeat(cells - filled)}
      </Text>
    </Box>
  )
}
const AgentRowView = ({ ui, tone, ascii, on, row }: AgentArgs & { row: AgentRow }) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const stepInk =
    row.status === 'over' || row.status === 'failed'
      ? roleInk('danger', tone)
      : isRunning(row)
        ? inkOf(tone, 'ink2')
        : inkOf(tone, 'muted')
  return (
    <Box key={`agent-${row.ref}`} flexDirection="column" rowGap={SPACE.agentLineGap}>
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexShrink={1} minWidth={0}>
          <Text mono={rich} {...inkOf(tone, 'muted')}>
            {row.ref}
          </Text>
          <Text bold wrap="truncate-end" {...inkOf(tone, 'ink')}>
            {row.title}
          </Text>
        </Box>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} alignItems="center">
          {row.status === 'over' && (
            <CardButton
              ui={ui}
              tone={tone}
              id={`agent-raise-${row.ref}`}
              label="Raise budget"
              onPress={() => on.act({ kind: 'raise-budget', ticket: row.ref })}
            />
          )}
          {row.status === 'failed' && (
            <CardButton
              ui={ui}
              tone={tone}
              id={`agent-diagnose-${row.ref}`}
              label="Diagnose"
              onPress={() => on.act({ kind: 'diagnose', about: `Agent ${row.ref} failed` })}
            />
          )}
          <Badge
            ui={ui}
            tone={tone}
            role={ROW_ROLES[row.status]}
            text={ROW_LABELS[row.status]}
            id={row.ref}
          />
        </Box>
      </Box>
      {hasMeterLine(row) && (
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} alignItems="center">
          {row.step !== null && (
            <Text mono={rich} wrap="truncate-end" {...stepInk}>
              {row.step}
            </Text>
          )}
          <Box flexGrow={1} />
          {row.tokens > 0 && <TokenBar ui={ui} tone={tone} ascii={ascii} row={row} />}
          <Text mono={rich} {...inkOf(tone, 'text2')}>
            {`${kTokens(row.tokens)} · ${elapsedText(row.elapsedMs)}`}
          </Text>
        </Box>
      )}
      {hasWorktreeLine(row) && (
        <Box
          key={`agent-worktree-${row.ref}`}
          flexDirection="row"
          columnGap={SPACE.rowLabelGap}
          flexWrap="wrap"
          alignItems="center"
        >
          {rich && <Icon ui={ui} svg={branchSvg(hexOr(t?.ink2))} alt="" px={12} />}
          {row.worktree !== null && (
            <Text mono={rich} {...inkOf(tone, 'ink2')}>
              {row.worktree}
            </Text>
          )}
          {row.branch !== null && (
            <Text
              mono={rich}
              {...inkOf(tone, 'text2')}
              {...(t !== undefined && rich && { backgroundColor: t.fill })}
            >
              {row.branch}
            </Text>
          )}
          {row.added !== null && (
            <Text mono={rich} {...roleInk('perm', tone)}>{`+${row.added}`}</Text>
          )}
          {row.deleted !== null && (
            <Text
              mono={rich}
              {...roleInk('danger', tone)}
            >{`${ascii ? MINUS.ascii : MINUS.glyph}${row.deleted}`}</Text>
          )}
          {row.commits !== null && (
            <Text mono={rich} {...inkOf(tone, 'muted')}>
              {row.commits}
            </Text>
          )}
          {row.note !== null && <Text {...inkOf(tone, 'muted')}>{row.note}</Text>}
        </Box>
      )}
    </Box>
  )
}

export const AgentsList = ({
  ui,
  tone,
  ascii,
  view,
  on,
}: AgentArgs & {
  view: AgentsView
}) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  const skill = paint('skill', tone)
  return (
    <Box
      key="agents"
      flexDirection="column"
      rowGap={SPACE.agentsGap}
      {...(t !== undefined &&
        rich && {
          borderStyle: 'round' as const,
          borderColor: t.line,
          paddingX: SPACE.agentsPadX,
          paddingY: SPACE.agentsPadY,
        })}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap}>
          <Text color={skill.fg}>{rich ? '●' : ascii ? '*' : '●'}</Text>
          <Text bold {...inkOf(tone, 'ink')}>
            Agents
          </Text>
          <Text {...inkOf(tone, 'text2')}>{view.summary}</Text>
        </Box>
        <Text mono={rich} {...inkOf(tone, 'text2')}>
          {view.tokens}
        </Text>
      </Box>
      {view.note !== null && <HookNote ui={ui} tone={tone} id="agents-note" text={view.note} />}
      {view.rows.map(row => (
        <AgentRowView key={row.ref} ui={ui} tone={tone} ascii={ascii} on={on} row={row} />
      ))}
      {view.more > 0 && (
        <Text {...inkOf(tone, 'muted')}>{`and ${view.more} more · Open panel`}</Text>
      )}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        columnGap={SPACE.rowLabelGap}
      >
        <Box flexShrink={1} minWidth={0}>
          <Text size="footnote" wrap="truncate-end" {...inkOf(tone, 'muted')}>
            {view.footer}
          </Text>
        </Box>
        <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
          <CardButton
            ui={ui}
            tone={tone}
            id="agents-pause"
            label={view.isPaused ? 'Resume' : 'Pause all'}
            onPress={() => on.act({ kind: 'pause-all' })}
          />
          <CardButton
            ui={ui}
            tone={tone}
            id="agents-open-panel"
            label="Open panel"
            onPress={() => on.act({ kind: 'open-panel' })}
          />
        </Box>
      </Box>
    </Box>
  )
}
