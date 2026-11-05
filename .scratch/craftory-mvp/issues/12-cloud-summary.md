# Does summary.ts cover the cloud text summary

Type: research
Status: resolved

## Question

Does `mods/craftory/src/summary.ts` already produce the text summary of the active feature that `/craftory` replies with on claude.ai/code cloud, per DESIGN.md Surfaces? List any gap.

## Answer

Yes. `markdownSummary` in `mods/craftory/src/summary.ts` is the cloud text summary: `/craftory` returns it from the command handler whenever the surface draws nothing, opening no pane. Output is `## title` plus one line per phase. Gaps, none blocking: (A) the code cannot tell cloud from chat or `claude -p`, so all three get the summary while DESIGN.md says "Nothing" for chat and `-p`, so the docs need aligning; (B) the "No feature in flight" and unsupported-version paths are untested; (C) optional: the summary does not name the focus phase, next action, tickets or the active feature when several exist.

Findings: `.scratch/craftory-mvp/research/12-cloud-summary.md`.
