# 09: Decide the Local tracker default (`docs/issues` or `.scratch`)

**What to build:** The user decides whether `docs/issues` or `.scratch` is the Local tracker default, and records the choice here. The README wording in 10 depends on it.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Choice recorded in this file
- [x] Code default matches the choice, or a follow-up ticket is filed to change it

## Answer

`.scratch/`, the same default as mattpocock-skills (`/setup-matt-pocock-skills` puts local issues under `.scratch/<feature>/`). Craftory's Local tracker, the setup template and the README already use `.scratch/`, so the code needs no change. One leftover: the folder hint in Settings suggests `docs/issues/`. Ticket 10 changes it to `.scratch/`.
