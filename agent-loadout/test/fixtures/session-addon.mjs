import { readFile } from 'node:fs/promises'

export const inject = ['tools', 'fixtureCompass']

export async function apply(ctx, config) {
  const note = (await readFile(new URL(config.resource, ctx.baseUrl), 'utf8')).trim()
  if (ctx.fixtureCompass !== 'north' || (!config.toolNameFromNote && note !== 'portable note')) {
    throw new Error('The session plugin lost its loader base or isolated service')
  }
  ctx.tools.register({
    name: config.toolNameFromNote ? note : config.toolName ?? 'runtime_annotation',
    description: 'Read the annotation mounted by a session-local Loader tree.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
    async execute() { return note },
  })
}
