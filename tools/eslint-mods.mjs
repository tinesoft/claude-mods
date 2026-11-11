// ESLint rules for mod code, the mechanical half of CONTRIBUTING.md's "Writing mod code".
const HOOK_PARAMS = ['$', 'e', 'next']

const isFunction = node =>
  node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression'

/** `on(event, [filter], fn)`: fn's parameters are `$, e, next`, in that order (a prefix is fine). */
const hookParams = {
  meta: {
    type: 'problem',
    messages: { name: 'Hook parameter {{index}} is `{{got}}`; name it `{{want}}`.' },
  },
  create: context => ({
    CallExpression(node) {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'on') return
      const fn = node.arguments.at(-1)
      if (!isFunction(fn)) return
      fn.params.forEach((param, i) => {
        const want = HOOK_PARAMS[i]
        const got = param.type === 'Identifier' ? param.name : context.sourceCode.getText(param)
        if (got !== want)
          context.report({
            node: param,
            messageId: 'name',
            data: { index: i + 1, got, want: want ?? '(none)' },
          })
      })
    },
  }),
}

/** `$` is used as `$`: never copied into another name or destructured. */
const noAliasEngine = {
  meta: {
    type: 'problem',
    messages: { alias: 'Use `$` directly; do not alias or destructure it.' },
  },
  create: context => {
    const isEngine = node => node?.type === 'Identifier' && node.name === '$'
    return {
      VariableDeclarator(node) {
        if (isEngine(node.init)) context.report({ node, messageId: 'alias' })
      },
      AssignmentExpression(node) {
        if (isEngine(node.right)) context.report({ node, messageId: 'alias' })
      },
    }
  },
}

/** Helpers in `src/` take plain data, so `claude plugin test` can test them without the engine. */
const noEngineInSrc = {
  meta: {
    type: 'problem',
    messages: { engine: 'Helpers in src/ take plain data, not `$`; pass what they need.' },
  },
  create: context => {
    const check = node => {
      for (const p of node.params) {
        if (p.type === 'Identifier' && p.name === '$')
          context.report({ node: p, messageId: 'engine' })
      }
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    }
  },
}

export default {
  rules: {
    'hook-params': hookParams,
    'no-alias-engine': noAliasEngine,
    'no-engine-in-src': noEngineInSrc,
  },
}
