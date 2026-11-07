# 09: End-to-end run and tested support range

**What to build:** Confidence that the whole loop works, and a clear statement of what is supported. One end-to-end test puts the Local `mixed` fixture into a fake filesystem with a stubbed `/wayfinder` that claims and then resolves a ticket, and asserts the rail and Tickets tab update. The README states the tested mattpocock-skills range (1.3.x), and the convention of a sibling `1.4/` fixture set run alongside `1.3/` until the range moves is documented.

**Blocked by:** 02 (Tickets tab map card), 03 (Edge-case states)

**Status:** resolved

- [x] End-to-end test shows the chip, card and Tickets tab updating after a claim and a resolve
- [x] README states the tested skill range
- [x] The `1.4/` side-by-side fixture convention is documented
- [x] Checks pass on the pinned Claude Code version
