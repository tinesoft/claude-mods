# Craftory hard gates

Status: ready-for-human

Source: grilling thread on making soft gates hard. Builds on the `deny` rules in `mods/craftory/src/deny.ts` and the `tool.call` and `prompt.submit` hooks in `mods/craftory/hooks/register.tsx`.

## Problem Statement

Craftory's gates are soft. Starting a phase whose gated predecessor is not done asks first, and **Run anyway** runs it. Two opt-in rules, `deny.skipGate` and `deny.editOnIntegrationBranch`, already turn parts of that into refusals, but they are two separate switches, the rail and the pane still offer **Run anyway** while `deny.skipGate` is on, and nothing stops unreviewed work leaving the machine as a pull request or merge request. A team that wants the SDLC order enforced, not suggested, has to know about both rules, turn each on, and still has two holes: the button, and `gh pr create` / `glab mr create`.

## Solution

One repo-level switch, `deny.hardGates`, off by default. When on, Craftory enforces the SDLC order through hooks instead of asking:

- It turns on both existing rules, `deny.skipGate` and `deny.editOnIntegrationBranch`, whatever their own values.
- It refuses to open a pull request (`gh pr create`) or merge request (`glab mr create`) from a `Bash` call until Review is done.
- It removes **Run anyway** from every place that offers it, so a press in the rail or the pane refuses the same way a typed command does. **Diagnose** stays.

A hard gate only refuses when Craftory positively knows the predecessor is not done. Missing or unreadable evidence (tracker offline, invalid config, no git snapshot) lets the call through, as soft gates already do. There is no per-command override. Every refusal names the rule and the one switch that turns it off.

## User Stories

1. As a tech lead, I want one setting that turns on hard gates, so that I do not have to know which individual rules exist.
2. As a developer, I want hard gates off by default, so that nobody is refused until a repo opts in.
3. As a tech lead, I want the setting in `.craftory/config.json`, so that it is committed policy for the whole team, not a personal preference.
4. As a developer, I want the setting in Settings › Automation next to the two deny rules, so that I find it where I already look.
5. As a developer, I want `deny.hardGates` on to behave as if `deny.skipGate` and `deny.editOnIntegrationBranch` were on, so that I get one mental model.
6. As a developer, I want the two sub-rules to show as on and locked while `deny.hardGates` is on, so that the master is the one switch. (Decided: locked.)
7. As a developer, I want a typed gated command refused with the reason, so that I know what to finish first.
8. As a developer, I want Claude's own `Skill` call for a gated phase refused with the same reason, so that the agent cannot skip a phase either.
9. As a developer, I want a press on a gated phase in the rail or the pane refused, with no **Run anyway** button, so that a click is not a way around the gate.
10. As a developer, I want **Diagnose** to remain on a refused press, so that a refusal leads somewhere useful.
11. As a developer on mobile, I want the gated button in the Flow tab to show the refusal and **Diagnose** only, so that the surface matches the others.
12. As a developer, I want `gh pr create` and `gh pr ready` refused when Review is not done, so that unreviewed work does not go up as a PR or get marked ready. A draft is let through, since Build opens one.
13. As a developer on GitLab, I want `glab mr create` and `glab mr update --ready` refused the same way, so that GitLab repos get the same protection.
14. As a developer, I want the PR and MR check to look at Review's state itself, whatever `phases.ship.gate` says, so that hard mode does not depend on Ship being gated (it is off by default).
15. As a developer whose Review phase is turned off or skipped for the active feature, I want the PR and MR check to let the call through, so that a phase I disabled does not block me.
16. As a developer, I want the PR and MR check to match through the usual wrappers (an `rtk` prefix, `env` assignments, `cd dir &&`, `sudo`), so that a wrapper is not a bypass.
17. As a developer, I want a `gh pr create` or `glab mr create` that only appears inside a quoted string, an `echo` or a comment to be let through, so that I am not refused for text.
18. As a developer, I want the PR and MR check to let `gh pr view`, `gh pr list`, `glab mr view` and the like through, so that only creation is gated.
19. As a developer, I want a refusal to name the rule (`deny.hardGates`), the reason (Review is not done, with the blockers when known) and the switch that turns it off, so that I can recover.
20. As a developer, I want no per-command `--force` or one-shot override, so that the mode is not defeated by habit.
21. As a developer, I want a hard gate to let a call through when Craftory cannot read the evidence (tracker offline, `config.json` invalid, no git snapshot), so that a flaky signal never locks me out.
22. As a developer, I want an invalid `deny.hardGates` value to fall back to off with the existing config problem line, so that a typo never turns enforcement on or locks anything.
23. As a developer using `gh api` or `glab api` to open a PR or MR directly, I want it documented as not covered, so that nobody assumes the check is airtight.
24. As a maintainer, I want the soft-gate behaviour unchanged when `deny.hardGates` is off, so that this ships without changing anyone's day.
25. As a reader of the README and glossary, I want the Gate entry and the Gates section to describe hard mode, so that the docs match the behaviour.

## Implementation Decisions

- **One master switch, two existing rules kept.** Add `deny.hardGates: false` to `DEFAULT_CONFIG.deny` and `DenyConfig`. The effective value of each rule is `deny.hardGates || deny.<rule>`. One helper resolves it (in `src/deny.ts`) so every hook asks the same question. The two existing rules keep working on their own.
- **Repo-level only.** The setting lives in `.craftory/config.json`, read through the existing config loader, and is written by the existing Settings › Automation toggles. No new per-user option and no precedence rule.
- **No override.** There is no per-command escape. The `switchText` pattern in `src/deny.ts` is extended so a `hardGates` denial reads "turn it off in Settings › Automation, or set `"deny": { "hardGates": false }` in `.craftory/config.json`". Where a refusal comes from a rule that is on only because of the master switch, the text names `hardGates`, not the sub-rule, because turning the sub-rule off would not help.
- **Fail open on missing evidence.** The decision functions return a refusal only on a positive finding (a gated phase whose state is `gated`, a Review state that is known and not done). `null` flow, `null` git snapshot, an invalid or absent config and an unreachable tracker all return "let through". This matches `checkRun`, `skipGateDenial` and `integrationEditDenial` today.
- **Removing Run anyway.**
  - The band question and the mobile Flow-tab question (built from `gateText`, `dropText` and the `RUN_ANYWAY` constant) become a refusal notice with **Diagnose** only when the effective `skipGate` is on.
  - `src/gates.ts`'s `checkRun` and the pass machinery (`issuePass`, `consumePass`, `PASS_MS`) are not used on that path. The soft path is untouched.
  - The README already says a press "still asks, and its Run anyway still runs" under `deny.skipGate`. That sentence changes: under `deny.hardGates` a press is refused, while under `deny.skipGate` alone it keeps asking. This keeps `skipGate` backward compatible and makes the master switch the stricter one.
- **PR and MR check.** A new `tool.call` hook on `Bash` (the existing one handles kept-worktree removal and returns early, so the check is a second, independent hook, or a shared one that runs both checks).
  - Pure function in `src/deny.ts`, in the style of `removalTargets`: `createsReview(command)` returns `'pr' | 'mr' | null`.
  - It splits the command on `&&`, `||`, `;`, `|` and newlines, strips leading `env` assignments and the wrappers `rtk`, `command`, `sudo`, `env`, `time`, `nohup`, then tests each segment's start for `gh pr create` or `glab mr create`. Quoted strings and `echo`/`printf` arguments are not matched.
  - `glab mr new` is an alias of `glab mr create`; verify against the pinned `glab` docs and match it if the alias exists. Verify `gh pr create` has no alias; if it does, match it.
  - `gh api` and `glab api` calls that POST to the pulls or merge_requests endpoint, `git push` with push options that open an MR, and hosts other than GitHub and GitLab are out of scope.
  - The refusal condition is the Review phase state from the current flow: refuse when it is known and not done; let through when the flow is null or Review is disabled or skipped for the active feature (`isPhaseOn`). It reads the Review phase directly and ignores `phases.ship.gate`.
  - Refusal text: `Craftory denied this <gh pr create | glab mr create>: Review is not done (<blockers>). <switchText>`.
- **Wrapper reliability check first.** Before building the matcher, confirm what command string `tool.call` hands the hook when the `rtk` rewrite hook is active. The first ticket is a short investigation that settles this and fixes the wrapper list. If the hook cannot see the real command, ship hard mode without the PR and MR check and say so in the README.
- **Settings UI.** Add a toggle for `deny.hardGates` to Settings › Automation (`src/settings.tsx`), above the two existing rules, with the hint "Refuses instead of asking. Turns on both rules below, and blocks PRs and MRs before Review." The two rules show as on and locked while the master is on, or stay editable with the effective state shown. See the open question.
- **Surfaces.** The refusal on a typed command works on every surface through `prompt.submit`. The rail and pane refusals follow the existing surface split (band on terminal and Desktop, Flow tab on mobile, pane in VS Code).
- **Glossary and docs.** Update the **Gate** entry in `GLOSSARY.md` (soft by default, hard when `deny.hardGates` is on), the README Gates section, the config table and the "What its hooks decide" list.

## Decisions made while building

- The sub-rules are shown on and locked while the master is on. A team cannot keep the PR check but drop the edit guard.
- Drafts are let through and `gh pr ready` / `glab mr update --ready` are gated too: Build opens a draft PR, so gating `create` alone would block Build, and a draft marked ready would bypass the check.

## Open Questions

- Should the master also add a `deny` reason line to the rail for a gated phase when no one pressed anything (a passive "gated until Review is done")? The existing `⊘` Gated state may be enough.

## Testing Decisions

- **What makes a good test.** It asserts what the user sees or what the hook answers (a refusal text, a `deny`, a let-through), not helper calls.
- **Seam 1 (main): the hooks in the fake world.** Using the existing harness and fake UI, feed a flow in and assert:
  - `prompt.submit` refuses a typed gated command with `deny.hardGates` on, and with it off asks as today;
  - `tool.call` on `Skill` refuses a gated phase's skill;
  - a rail or pane press yields a refusal with **Diagnose** and no **Run anyway**, and with only `deny.skipGate` on still asks;
  - `tool.call` on `Edit` and `Write` refuses on the integration branch;
  - `tool.call` on `Bash` refuses `gh pr create` and `glab mr create` with Review not done, and lets them through with Review done, disabled, or the flow unreadable.
- **Seam 2: the matcher.** A table test for `createsReview`: plain, with `rtk`, `env X=1`, `cd d &&`, `sudo`, in a pipeline, inside quotes, in `echo`, `gh pr view`, `glab mr list`, `gh pr create --draft`, `glab mr new` (if aliased), multi-line.
- **Seam 3: config.** `deny.hardGates` defaults off, survives `patchConfig`, falls back to off on a wrong type with a problem line, and resolves the effective value of both rules.
- **Fail-open cases.** One test per kind of missing evidence returns "let through": null flow, null git, invalid config, Review state unknown.
- **Prior art.** `deny-rules.test.ts`, `gate.test.ts`, `gates.test.ts`, `review-gate.test.ts`, `settings.test.ts`, `config.test.ts` and `harness.ts`.
- Run tests on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`), not a local auto-updated `claude`.

## Out of Scope

- Gating `git commit` and `git push`. Commits happen all through a build, and a refusal there would be wrong far more often than right.
- Gating on Done-when criteria. That reads evidence the mod cannot always trust, and a wrong "unmet" would block valid work.
- A per-user or per-session override, a `--force` flag or a one-shot bypass.
- Covering `gh api` or `glab api` calls that open a PR or MR, or any host other than GitHub and GitLab.
- Server-side enforcement (branch protection, required reviews, CI). Hard gates are a client guard for people and agents using Claude Code, not a security boundary.
- Changing the soft-gate behaviour or the defaults.

## Further Notes

- Tickets, in vertical slices: (1) investigation of what `tool.call` sees for `Bash` under the `rtk` hook, plus the `glab mr new` and `gh pr create` alias checks; (2) config and master switch, with the effective-rule helper and its tests; (3) rail and pane refusal without **Run anyway**; (4) the PR and MR check; (5) Settings toggle, glossary and README. Ticket 4 is blocked by 1 and 2; ticket 3 by 2.
- Ticket 1 may end with "not feasible", in which case ticket 4 becomes a documentation note and the rest ships.
- Commit scope is `craftory`. Do not edit versions or `CHANGELOG.md` by hand.
