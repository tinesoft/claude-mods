# 01: Model and effort per phase for subagents

**What to build:** Settings › Pipeline gets a model (`session`, `haiku`, `sonnet`, `opus`, or your own id) and an effort (`session`, `low` to `max`) for each phase, written to `phases.<phase>.model` and `phases.<phase>.effort`.

- A Build implementer spawns on Build's model. Any other subagent spawns on the model of the phase running in the main session.
- A spawn whose call names its own model is left alone. The model is set at spawn only, never on a later step.
- Every step of a routed subagent gets the phase's effort.
- The phase card shows `Runs on sonnet · medium` when routing is set.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Config keys with defaults, the effort values as one constant, and fallback with a problem line; config tests
- [x] A pure function for which phase a subagent belongs to, remembered per agent id in the shell; table tests
- [x] `agent.spawn` passes the model on for an implementer and for another subagent, and leaves a named model alone; fake-world tests asserting the spawn's `model`
- [x] `turn.step` gives each of a routed agent's steps the effort, and never a model; fake-world tests asserting the step's `effort` and `model`
- [x] Phase card row `Runs on …`; card tests
- [x] Settings › Pipeline rows per phase; settings tests
