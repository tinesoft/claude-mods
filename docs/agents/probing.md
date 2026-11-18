# Probing how Claude Code behaves

For a spike: a question the types do not answer, such as when `cost.usd` moves or what a hook's event carries. Run a throwaway mod headless and read what it logs. Nothing here is committed; keep the probe in the scratchpad.

## The probe

A plugin of three files:

- `.claude-plugin/plugin.json`: `{"name":"probe","version":"0.0.1","description":"probe"}`
- `hooks/hooks.json`: `{"description":"probe","modules":["./register.ts"]}`
- `hooks/register.ts`: exports `register`, and logs with `console.log` under a marker you can grep.

```ts
const w = (o: object) => console.log('PROBE ' + JSON.stringify({ t: Date.now(), ...o }))
export const register = (on: any) => {
  on('turn.step', async function* ($: any, e: any, next: any) {
    const r = yield* next(e)
    const u = await $.session.usage().catch(() => undefined)
    w({ ev: 'step', agent: e.agentId ?? 'main', cost: u?.cost?.usd })
    return r
  })
}
```

A hooks module imports only its own files by relative path and `claude-code`. Importing `node:fs` or any other `node:` module stops it from loading, and nothing is logged. Log with `console.log` instead.

## Run it

```sh
claude -p --model haiku --plugin-dir <probe> --output-format json --debug-file <log> "<prompt>" </dev/null > result.json
grep PROBE <log>
```

- `</dev/null` skips the 3 s wait for stdin.
- A probe that did not load says why in the debug file: `grep "hooks module" <log>`.
- `--output-format json` gives `total_cost_usd` and `num_turns` to compare the log against.
- Choose a prompt whose tools need no permission. A nested `--permission-mode bypassPermissions` is refused by the auto-mode classifier.
- The run is a real session on the user's account. Use haiku and a small prompt.
- The local `claude` may be newer than the pinned version (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`). Say so with the result.

## Record the answer

Put the answer, with the version, the date and the readings, in the spec's decisions and the ticket's Comments. The cost-timing spike in `.scratch/craftory-tokenomics-v1/spec.md` is the model.
