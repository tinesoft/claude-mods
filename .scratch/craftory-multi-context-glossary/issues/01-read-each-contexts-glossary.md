# 01: Read each context's glossary in a multi-context repo

**What to build:** Craftory finds the glossary map when one exists and treats each listed context's glossary as its own. A repo without a map is one context, named after the glossary's title, and behaves exactly as today. The Glossary tab shows every context's terms grouped under the context's name, with filter chips (All, then one per context) and search across all contexts. The selected chip is a per-repo personal convenience. Settings › Glossary shows the map read-only (contexts and relationships). A malformed map line, or one pointing outside the repo, becomes a problem line and is skipped without hiding the rest. Whether the map exists on disk decides the layout, so a stale docs layout file cannot hide it. Every later reader (reply, drift, Settings) goes through one per-context repo snapshot, so nothing branches on layout after loading.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] In a repo with a map and two contexts, the Glossary tab lists both contexts' terms, grouped by context, and the filter chips narrow them
- [ ] Search spans every context
- [ ] A context whose glossary file does not exist shows "No glossary yet"; one that does not parse shows the existing problem line and stays read-only
- [ ] A malformed or out-of-repo map line is reported as a problem line and ignored
- [ ] Settings › Glossary shows the map read-only
- [ ] The docs layout is detected as multi-context from this repo's own layout file and map
- [ ] Existing single-context glossary tests pass unchanged
