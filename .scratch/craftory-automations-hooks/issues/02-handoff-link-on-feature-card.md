# 02: Link the handoff document from the Feature card

**What to build:** After `/handoff` has written its document, the active Feature's card shows a link to it, so the developer can find it later. The skill decides where the document goes; Craftory only observes the outcome and links it.

**Blocked by:** 01 (Automation notice pattern, proven with Handoff at 80%)

**Status:** ready-for-agent

- [ ] A handoff written through the notice is linked from the Feature card
- [ ] No link appears when no handoff was written, or when the run was cancelled
- [ ] Craftory writes no file of its own to make the link
- [ ] Fake-world test asserts the card link after a handoff completes
