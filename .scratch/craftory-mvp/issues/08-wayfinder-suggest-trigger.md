# When the mod suggests /wayfinder

Type: grilling
Status: resolved

## Question

What fires `entry.wayfinder.suggest` (the plan's default is `long-grill`): which signal, what threshold, how it shows (notice, rail nudge), how it is dismissed and remembered, and what it does when a Map already exists?

## Answer

- **Signal:** the number of questions the mod has counted in the current Align grill (the same count behind the `Q6 of ~14` marker). Not the skill's `~N` estimate, token use or Spec size.
- **Threshold:** configurable, default 12 questions. Config shape: `"entry": { "wayfinder": { "suggest": "long-grill" | "off", "afterQuestions": 12 } }`. `"off"` is the global Settings switch.
- **Display:** a band notice with an action button, `Chart a map instead? · /wayfinder`. A toast carries no action in 2.1.302. The Align card showing the command ready is optional polish.
- **Firing:** once per grill, when the count first crosses the threshold. It does not re-arm.
- **Dismiss and memory:** Dismiss silences it for that Feature, stored on the Feature. Running `/wayfinder` from the notice also clears it. Other Features still get the suggestion.
- **When a map exists:** silent if the Feature has a `map` link. If it has none but an open map exists (Local or tracker), the button reads **Attach to <map name>** instead of **Chart a map**, following the active-map rule from the source decision.
