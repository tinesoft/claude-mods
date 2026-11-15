// A stand-in GitHub MCP server over stdio, with one tool that lists two fixed issues.
import { createInterface } from 'node:readline'

const send = message => process.stdout.write(`${JSON.stringify(message)}\n`)
const ISSUES = '#12 Fix rounding in lineTotal\n#14 Add a due date to invoices'
const TOOLS = [
  {
    name: 'list_issues',
    description: 'List the open issues',
    inputSchema: { type: 'object', properties: {} },
  },
]

createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line)
  if (id === undefined) return
  const result =
    method === 'initialize'
      ? {
          protocolVersion: params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'github', version: '1.0.0' },
        }
      : method === 'tools/list'
        ? { tools: TOOLS }
        : method === 'tools/call'
          ? { content: [{ type: 'text', text: ISSUES }] }
          : {}
  send({ jsonrpc: '2.0', id, result })
})
