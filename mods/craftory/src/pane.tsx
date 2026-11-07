import type { RenderSurface } from 'claude-code'
import type { IssueRef, PaneTab, Tone } from '../types'
import type { Flow } from './evidence'
import { WORKTREE_LABELS, type WorktreeKind, type WorktreeRowView, type WorktreesView } from './git'
import {
  flowRows,
  TABS,
  type GlossaryView,
  type InboxAction,
  type InboxRowView,
  type TabCounts,
  type TicketRowView,
  type TicketsView,
} from './pane-view'
import type { Action } from './action'
import { FrontierCard, MapChip, MapTicketsCard } from './map-card'
import type { MapView } from './map-view'
import type { NoticeView } from './notices'
import { NoticeRow } from './notice-row'
import { PhaseStrip, type BandActions } from './rail'
import { SettingsTab, type SettingsArgs } from './settings'
import { paint, SPACE, PHASE_LOOKS, TOKENS, type Role } from './theme'
import { inkOf, isRich, type Ui } from './ui'
import { Badge, CardButton } from './widgets'

export type PaneActions = {
  tab: (tab: PaneTab) => void
  diff: (path: string) => void
  openTerminal: (path: string, surface: RenderSurface) => void
  remove: (path: string) => void
  prune: () => void
  openFolder: (folder: string, surface: RenderSurface) => void
  inbox: (action: InboxAction) => void
  implement: (arg: string) => void
  implementSpec: () => void
  search: (text: string) => void
  editTerm: (name: string) => void
  rail: Pick<BandActions, 'phase' | 'triage'>
  map: () => void
  wayfinder: (arg: string) => void
  decided: () => void
  pickMap: (ref: IssueRef) => void
  closeCard: () => void
  act: (action: Action) => void
}

export type PaneArgs = {
  ui: Ui
  surface: RenderSurface
  tone: Tone | undefined
  ascii: boolean
  spinFrame: number
  tab: PaneTab
  pluginLine: string
  flow: Flow | null
  map: MapView | null
  isMapOpen: boolean
  isDecidedOpen: boolean
  waiting: number
  notices: readonly NoticeView[]
  counts: TabCounts
  tickets: TicketsView
  worktrees: WorktreesView | null
  glossary: GlossaryView
  query: string
  settings: Omit<SettingsArgs, 'ui' | 'tone' | 'readOnly'>
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

const TabRow = ({
  ui,
  tone,
  tab,
  counts,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'tab' | 'counts' | 'on'>) => {
  const { Box, Button, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Box
      key="tabs"
      flexDirection="row"
      flexWrap="wrap"
      columnGap={rich ? 0 : SPACE.tabGap}
      {...(rich && t !== undefined && { backgroundColor: t.fill })}
    >
      {TABS.map(({ id, hotkey, title }) => {
        const isOn = tab === id
        const count = counts[id]
        return (
          <Box
            key={`tab-${id}-box`}
            paddingX={SPACE.tabPad}
            columnGap={SPACE.chipGap}
            {...(rich &&
              t !== undefined &&
              isOn && {
                backgroundColor: t.surface,
                borderStyle: 'round' as const,
                borderColor: t.line,
              })}
          >
            <Button key={`tab-${id}`} plain hotkey={hotkey} onPress={() => on.tab(id)}>
              <Text
                bold={isOn}
                dimColor={!isOn && tone === undefined}
                {...(tone !== undefined && inkOf(tone, isOn ? 'ink' : 'text2'))}
              >
                {title}
              </Text>
              {count !== undefined && (
                <Text mono={rich} {...inkOf(tone, 'muted')}>{` ${count}`}</Text>
              )}
            </Button>
          </Box>
        )
      })}
    </Box>
  )
}

const FlowTab = ({
  ui,
  tone,
  surface,
  ascii,
  spinFrame,
  flow,
  map,
  isMapOpen,
  waiting,
  notices,
  on,
}: Pick<
  PaneArgs,
  | 'ui'
  | 'tone'
  | 'surface'
  | 'ascii'
  | 'spinFrame'
  | 'flow'
  | 'map'
  | 'isMapOpen'
  | 'waiting'
  | 'notices'
  | 'on'
>) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const head = map !== null && surface === 'mobile' && (
    <Box key="map-head" flexDirection="column" rowGap={SPACE.paneGap}>
      <MapChip ui={ui} tone={tone} ascii={ascii} view={map} isOpen={isMapOpen} on={on} />
      {isMapOpen && <FrontierCard ui={ui} tone={tone} ascii={ascii} view={map} on={on} />}
    </Box>
  )
  if (flow === null) {
    return (
      <Box key="flow" flexDirection="column" rowGap={SPACE.paneGap}>
        {head}
        <Text {...inkOf(tone, 'text2')}>
          No feature in flight. Talk the plan through first with /grill-with-docs.
        </Text>
      </Box>
    )
  }
  return (
    <Box key="flow" flexDirection="column" rowGap={SPACE.paneGap}>
      {head}
      {notices.map(notice => (
        <NoticeRow key={notice.id} ui={ui} tone={tone} notice={notice} on={on} />
      ))}
      {surface === 'mobile' && (
        <PhaseStrip
          id="pane-rail"
          wrap
          args={{ ui, tone, ascii, spinFrame, flow, waiting, open: null, on: on.rail }}
          fits={() => false}
        />
      )}
      <Text {...inkOf(tone, 'text2')}>
        {`${flow.title} · ${flow.doneCount} of ${flow.enabledCount} phases done`}
      </Text>
      {flowRows(flow).map(row => {
        const look = PHASE_LOOKS[row.state]
        const colours = paint(look.role, tone)
        return (
          <Box key={`flow-${row.phase}`} flexDirection="row" columnGap={SPACE.rowLabelGap}>
            <Text key={`flow-glyph-${row.phase}`} bold color={colours.fg}>
              {ascii ? look.ascii : look.glyph}
            </Text>
            <Box flexDirection="column" flexShrink={1} minWidth={0}>
              <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap">
                <Text
                  bold
                  {...(row.state === 'next' || row.state === 'running'
                    ? { color: colours.fg }
                    : inkOf(tone, 'ink'))}
                >
                  {row.label}
                </Text>
                {row.command !== '' && (
                  <Text mono={rich} {...inkOf(tone, 'muted')}>
                    {row.command}
                  </Text>
                )}
              </Box>
              <Text wrap="wrap" {...inkOf(tone, 'text2')}>
                {row.result}
              </Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

const ROLE_OF_ISSUE: Record<InboxRowView['role'], Role> = {
  'needs-triage': 'neutral',
  'needs-info': 'neutral',
  'ready-for-agent': 'skill',
  'ready-for-human': 'hook',
  wontfix: 'muted',
}

const STATUS_ROLE: Record<TicketRowView['status'], Role> = {
  merged: 'perm',
  ready: 'skill',
  blocked: 'muted',
  human: 'hook',
  open: 'neutral',
}

const InboxRow = ({
  ui,
  tone,
  row,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'on'> & { row: InboxRowView }) => {
  const { Box, Text } = ui
  const rich = isRich(ui)
  return (
    <Box
      key={`inbox-${row.ref}`}
      flexDirection="row"
      flexWrap="wrap"
      columnGap={SPACE.rowLabelGap}
      alignItems="center"
    >
      <Text mono={rich} {...inkOf(tone, 'muted')}>
        {row.ref}
      </Text>
      <Box flexDirection="column" flexShrink={1} minWidth={0}>
        <Text bold wrap="wrap" {...inkOf(tone, 'ink')}>
          {row.title}
        </Text>
        <Text wrap="wrap" {...inkOf(tone, 'text2')}>
          <Text mono={rich} color={paint(ROLE_OF_ISSUE[row.role], tone).fg}>
            {row.role}
          </Text>
          {` · ${row.note}`}
        </Text>
      </Box>
      {row.action !== null && row.label !== null && (
        <CardButton
          ui={ui}
          tone={tone}
          id={`inbox-${row.action.kind}-${row.ref}`}
          label={row.label}
          onPress={() => row.action && on.inbox(row.action)}
        />
      )}
    </Box>
  )
}

const TicketCard = ({
  ui,
  tone,
  row,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'on'> & { row: TicketRowView }) => {
  const { Box, Text } = ui
  const rich = isRich(ui) && tone !== undefined
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Box
      key={`ticket-${row.ref}`}
      flexDirection="column"
      rowGap={SPACE.lineGap}
      {...(rich &&
        t !== undefined && {
          borderStyle: 'round' as const,
          borderColor: t.line,
          backgroundColor: t.surface,
          paddingX: SPACE.agentsPadX,
          paddingY: SPACE.agentsPadY,
        })}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
        <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexShrink={1} minWidth={0}>
          <Text mono={rich} {...inkOf(tone, 'muted')}>
            {row.ref}
          </Text>
          <Text bold wrap="wrap" {...inkOf(tone, 'ink')}>
            {row.title}
          </Text>
        </Box>
        <Badge
          ui={ui}
          tone={tone}
          role={STATUS_ROLE[row.status]}
          text={row.statusLabel}
          id={row.ref}
        />
      </Box>
      <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap" alignItems="center">
        {row.blockedBy.length > 0 && (
          <Text {...inkOf(tone, 'text2')}>{`Blocked by ${row.blockedBy.join(', ')}`}</Text>
        )}
        {row.command !== null && (
          <CardButton
            ui={ui}
            tone={tone}
            id={`implement-${row.ref}`}
            label={row.command}
            onPress={() => on.implement(row.arg)}
          />
        )}
      </Box>
    </Box>
  )
}

const TicketsTab = ({
  ui,
  tone,
  ascii,
  map,
  isDecidedOpen,
  view,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'ascii' | 'map' | 'isDecidedOpen' | 'on'> & {
  view: TicketsView
}) => {
  const { Box, Link, Text } = ui
  return (
    <Box key="tickets" flexDirection="column" rowGap={SPACE.paneGap}>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        columnGap={SPACE.rowLabelGap}
      >
        <Text key="tracker-header" {...inkOf(tone, 'text2')}>
          {view.header}
        </Text>
        {view.folder !== null && (
          <CardButton
            ui={ui}
            tone={tone}
            id="open-folder"
            label="Open folder"
            onPress={surface => on.openFolder(view.folder!, surface)}
          />
        )}
      </Box>
      {map !== null && (
        <MapTicketsCard
          ui={ui}
          tone={tone}
          ascii={ascii}
          view={map}
          isDecidedOpen={isDecidedOpen}
          on={on}
        />
      )}
      {view.links !== null && (
        <Box key="tracker-links" flexDirection="column" rowGap={SPACE.lineGap}>
          <Text wrap="wrap" {...inkOf(tone, 'text2')}>
            Craftory shows links for this tracker. Issues stay where they are.
          </Text>
          {view.links.items.map(link => (
            <Link key={`link-${link.url}`} href={link.url} label={`${link.label} · ${link.url}`} />
          ))}
          {view.links.note !== null && view.links.items.length === 0 && (
            <Text wrap="wrap" {...inkOf(tone, 'ink2')}>
              {view.links.note}
            </Text>
          )}
        </Box>
      )}
      {view.showInbox && (
        <Box key="inbox" flexDirection="column" rowGap={SPACE.lineGap}>
          <Box flexDirection="row" columnGap={SPACE.rowLabelGap}>
            <Text bold {...inkOf(tone, 'ink')}>
              Inbox
            </Text>
            <Text {...inkOf(tone, 'text2')}>Issues from outside the flow · triage roles</Text>
          </Box>
          {view.inbox.length === 0 && <Text {...inkOf(tone, 'muted')}>Nothing waiting.</Text>}
          {view.inbox.map(row => (
            <InboxRow key={row.ref} ui={ui} tone={tone} row={row} on={on} />
          ))}
        </Box>
      )}
      {view.specLabel !== null && (
        <Text bold {...inkOf(tone, 'ink')}>
          {view.specLabel}
        </Text>
      )}
      {view.tickets.map(row => (
        <TicketCard key={row.ref} ui={ui} tone={tone} row={row} on={on} />
      ))}
      {view.runAll !== null && (
        <CardButton
          ui={ui}
          tone={tone}
          id="implement-spec"
          label={view.runAll}
          onPress={() => on.implementSpec()}
        />
      )}
      {view.links === null && view.specLabel === null && (
        <Text wrap="wrap" {...inkOf(tone, 'text2')}>
          No spec in flight. Tickets of the active feature show here.
        </Text>
      )}
    </Box>
  )
}

const GlossaryTab = ({
  ui,
  tone,
  view,
  query,
  on,
}: Pick<PaneArgs, 'ui' | 'tone' | 'on' | 'query'> & { view: GlossaryView }) => {
  const { Box, Input, Text } = ui
  const rich = isRich(ui)
  return (
    <Box key="glossary" flexDirection="column" rowGap={SPACE.paneGap}>
      {Input !== undefined && (
        <Input
          key="glossary-search"
          value={query}
          placeholder={`Search ${view.total} terms`}
          submitLabel="search"
          onInput={text => on.search(text)}
          onSubmit={text => on.search(text)}
        />
      )}
      <Text key="glossary-summary" mono={rich} {...inkOf(tone, 'muted')}>
        {view.summary}
      </Text>
      {view.hasFile && (
        <Box
          key="glossary-used"
          flexDirection="column"
          rowGap={SPACE.lineGap}
          {...(rich &&
            tone !== undefined && {
              borderStyle: 'round' as const,
              borderColor: paint('skill', tone).bd ?? TOKENS[tone].line,
              backgroundColor: paint('skill', tone).bg ?? TOKENS[tone].fill,
              paddingX: SPACE.agentsPadX,
              paddingY: SPACE.agentsPadY,
            })}
        >
          <Text bold color={paint('skill', tone).fg}>
            Used in last reply
          </Text>
          {view.used.length === 0 && (
            <Text {...inkOf(tone, 'text2')}>No glossary term in the last reply.</Text>
          )}
          {view.used.map(term => (
            <Text key={`used-${term.name}`} wrap="wrap" {...inkOf(tone, 'ink2')}>
              <Text bold>{term.name}</Text>
              {` ${term.definition}`}
            </Text>
          ))}
          <Text wrap="wrap" {...inkOf(tone, 'text2')}>
            On the terminal this list stands in for underlined terms.
          </Text>
        </Box>
      )}
      {view.terms.map(term => (
        <Box key={`term-${term.name}`} flexDirection="column" rowGap={SPACE.lineGap}>
          <Box
            flexDirection="row"
            justifyContent="space-between"
            columnGap={SPACE.rowLabelGap}
            alignItems="center"
          >
            <Box flexDirection="row" columnGap={SPACE.rowLabelGap}>
              <Text bold {...inkOf(tone, 'ink')}>
                {term.name}
              </Text>
              {term.isNew && <Badge ui={ui} tone={tone} role="perm" text="New" id={term.name} />}
            </Box>
            <CardButton
              ui={ui}
              tone={tone}
              id={`term-edit-${term.name}`}
              label="Edit"
              onPress={() => on.editTerm(term.name)}
            />
          </Box>
          <Text wrap="wrap" {...inkOf(tone, 'text2')}>
            {term.definition}
          </Text>
          {term.avoid.length > 0 && (
            <Text wrap="wrap" {...inkOf(tone, 'muted')}>{`Avoid: ${term.avoid.join(', ')}`}</Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

export function renderPane(args: PaneArgs) {
  const { ui, tone, ascii, map, tab, pluginLine, on } = args
  const { Box, Text } = ui
  return (
    <Box
      flexDirection="column"
      paddingLeft={SPACE.paneLeft}
      paddingRight={SPACE.paneRight}
      rowGap={SPACE.paneGap}
    >
      <Text bold>Craftory</Text>
      <Text {...inkOf(tone, 'text2')}>{pluginLine}</Text>
      <TabRow ui={ui} tone={tone} tab={tab} counts={args.counts} on={on} />
      {tab === 'flow' && <FlowTab {...args} />}
      {tab === 'tickets' && (
        <TicketsTab
          ui={ui}
          tone={tone}
          ascii={ascii}
          map={map}
          isDecidedOpen={args.isDecidedOpen}
          view={args.tickets}
          on={on}
        />
      )}
      {tab === 'worktrees' && <WorktreesTab ui={ui} tone={tone} view={args.worktrees} on={on} />}
      {tab === 'glossary' && (
        <GlossaryTab ui={ui} tone={tone} view={args.glossary} query={args.query} on={on} />
      )}
      {tab === 'settings' && (
        <SettingsTab ui={ui} tone={tone} readOnly={args.surface === 'mobile'} {...args.settings} />
      )}
    </Box>
  )
}
