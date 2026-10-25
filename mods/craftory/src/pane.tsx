/**
 * The pane body. The Worktrees tab is complete (M4); Flow, Tickets, Glossary and Settings stay a
 * placeholder until M5 draws their tabs and the tab row.
 */
import type { RenderSurface } from 'claude-code'
import type { PaneTab, Tone } from '../types'
import { WORKTREE_LABELS, type WorktreeKind, type WorktreeRowView, type WorktreesView } from './git'
import { CardButton, isRich, type Ui } from './rail'
import { paint, SPACE, TOKENS, type Role } from './theme'

export type PaneActions = {
  writeSetup: () => void
  /** The diff line toggles under the row. */
  diff: (path: string) => void
  openTerminal: (path: string, surface: RenderSurface) => void
  remove: (path: string) => void
  prune: () => void
}

export type PaneArgs = {
  ui: Ui
  tone: Tone | undefined
  tab: PaneTab
  pluginLine: string
  setupNote: string | null
  /** The Worktrees tab's rows; null before git has been read. */
  worktrees: WorktreesView | null
  on: PaneActions
}

const KIND_ROLES: Record<WorktreeKind, Role> = {
  checkout: 'neutral',
  integration: 'perm',
  agent: 'skill',
  kept: 'hook',
  stale: 'hook',
  other: 'muted',
}

const inkOf = (tone: Tone | undefined, key: 'ink' | 'ink2' | 'text2' | 'muted') =>
  tone === undefined
    ? key === 'ink' || key === 'ink2'
      ? {}
      : { dimColor: true }
    : { color: TOKENS[tone][key] }

const WorktreeCard = ({
  ui,
  tone,
  row,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'on'> & { row: WorktreeRowView }) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const role = KIND_ROLES[row.kind]
  const colours = paint(role, tone)
  const label = WORKTREE_LABELS[row.kind]
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Box
      key={`wt-${row.shown}`}
      flexDirection="column"
      rowGap={SPACE.lineGap}
      {...(rich &&
        t !== undefined && {
          borderStyle: 'round' as const,
          borderColor: row.kind === 'agent' ? colours.bd : t.line,
          backgroundColor: t.surface,
          paddingX: SPACE.agentsPadX,
          paddingY: SPACE.agentsPadY,
        })}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
        <Box flexDirection="column" flexShrink={1} minWidth={0}>
          <Text mono={rich} bold {...inkOf(tone, 'ink')}>
            {row.shown}
          </Text>
          {row.branch !== null && (
            <Text mono={rich} {...inkOf(tone, 'text2')}>
              {row.branch}
            </Text>
          )}
        </Box>
        {rich && t !== undefined ? (
          <Box
            key={`wt-badge-${row.shown}`}
            paddingX={SPACE.chipPadX}
            borderStyle="round"
            {...(colours.bd !== undefined && { borderColor: colours.bd })}
            backgroundColor={colours.bg ?? t.fill}
          >
            <Text bold color={colours.fg}>
              {label}
            </Text>
          </Box>
        ) : (
          <Text bold color={colours.fg}>{`[${label}]`}</Text>
        )}
      </Box>
      <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap">
        <Text
          {...(row.kind === 'stale' || row.kind === 'kept'
            ? { color: paint('hook', tone).fg }
            : inkOf(tone, 'text2'))}
        >
          {row.sync}
        </Text>
        {row.added !== null && (
          <Text mono={rich} color={paint('perm', tone).fg}>{`+${row.added}`}</Text>
        )}
        {row.deleted !== null && (
          <Text mono={rich} color={paint('danger', tone).fg}>{`−${row.deleted}`}</Text>
        )}
        {row.link !== null && (
          <Text mono={rich} {...inkOf(tone, 'muted')}>
            {row.link}
          </Text>
        )}
      </Box>
      {row.diff !== null && (
        <Text mono={rich} {...inkOf(tone, 'ink2')}>
          {row.diff}
        </Text>
      )}
      <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
        {row.canDiff && (
          <CardButton
            ui={ui}
            tone={tone}
            id={`wt-diff-${row.shown}`}
            label="Diff"
            onPress={() => on.diff(row.path)}
          />
        )}
        <CardButton
          ui={ui}
          tone={tone}
          id={`wt-terminal-${row.shown}`}
          label="Open terminal"
          onPress={surface => on.openTerminal(row.path, surface)}
        />
        {row.canRemove && (
          <CardButton
            ui={ui}
            tone={tone}
            id={`wt-remove-${row.shown}`}
            label="Remove"
            onPress={() => on.remove(row.path)}
          />
        )}
      </Box>
    </Box>
  )
}

export function renderPane({ ui, tone, tab, pluginLine, setupNote, worktrees, on }: PaneArgs) {
  const { Box, Button, Text } = ui
  const quiet = tone === undefined ? { dimColor: true } : { color: TOKENS[tone].text2 }
  return (
    <Box
      flexDirection="column"
      paddingLeft={SPACE.paneLeft}
      paddingRight={SPACE.paneRight}
      rowGap={SPACE.paneGap}
    >
      <Text bold>Craftory</Text>
      <Text {...quiet}>{pluginLine}</Text>
      {tab === 'worktrees' && <WorktreesTab ui={ui} tone={tone} view={worktrees} on={on} />}
      {tab === 'settings' && (
        <Box flexDirection="column" rowGap={SPACE.paneGap}>
          <Button key="pane-write-setup" onPress={() => on.writeSetup()}>
            <Text>Write setup with detected defaults</Text>
          </Button>
          {setupNote !== null && <Text {...quiet}>{setupNote}</Text>}
        </Box>
      )}
    </Box>
  )
}

const WorktreesTab = ({
  ui,
  tone,
  view,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'on'> & { view: WorktreesView | null }) => {
  const { Box, Text } = ui
  if (view === null) {
    return <Text {...inkOf(tone, 'text2')}>Reading the worktrees…</Text>
  }
  return (
    <Box key="worktrees" flexDirection="column" rowGap={SPACE.paneGap}>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        columnGap={SPACE.rowLabelGap}
      >
        <Text key="wt-summary" {...inkOf(tone, 'text2')}>
          {view.summary}
        </Text>
        {view.prunable > 0 && (
          <CardButton
            ui={ui}
            tone={tone}
            id="wt-prune"
            label={`Prune ${view.prunable} stale`}
            onPress={() => on.prune()}
          />
        )}
      </Box>
      {view.rows.map(row => (
        <WorktreeCard key={row.shown} ui={ui} tone={tone} row={row} on={on} />
      ))}
      <Text {...inkOf(tone, 'text2')}>
        Each agent works in its own worktree, branched from the integration branch. When its ticket
        is green it merges back and the worktree is removed.
      </Text>
    </Box>
  )
}
