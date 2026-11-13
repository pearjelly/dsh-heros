import { createInterface } from 'node:readline'

const lines = createInterface({ input: process.stdin })
for await (const line of lines) {
  const message = JSON.parse(line)
  if (message.id === undefined) continue
  let result
  if (message.method === 'initialize') {
    result = {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'loadout-fixture', version: '1.0.0' },
    }
  } else if (message.method === 'tools/list') {
    result = {
      tools: [{ name: 'read_marker', description: 'Returns a synthetic marker.',
        inputSchema: { type: 'object', properties: { fail: { type: 'boolean' } } } }],
    }
  } else if (message.method === 'tools/call') {
    const failed = message.params.arguments?.fail === true
    result = { content: [{ type: 'text', text: failed ? 'Marker unavailable' : 'Local inventory marker' }], isError: failed }
  } else {
    result = {}
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n')
}
