# 06: The spend summary at Retro

**What to build:** One pure summary of a Feature's spend:

- the total;
- Build's forecast against its actual;
- the three costliest tickets and the three costliest phases;
- the cache-hit %;
- the spend by model.

It shows in three places:

- The Retro card shows it as rows.
- When `/retro` is submitted (typed, pressed, or by the Retro automation), `startContext` adds it as Markdown context.
- Once Retro is done, or Ship is done with Retro turned off, Craftory writes it to `.craftory/spend/<slug>/spend.md`. The file is written once and never rewritten. `isWritable` allows exactly that path.

Without a cost ledger it is in tokens.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Pure summary (top 3, ties, no forecast, no cost ledger) rendered as rows and as Markdown; table tests
- [ ] Retro card rows; card tests
- [ ] `/retro` context on every way it starts; fake-world tests
- [ ] `spend.md` written once at Retro done, or at Ship done when Retro is off; `isWritable` path; fake-world and files tests
