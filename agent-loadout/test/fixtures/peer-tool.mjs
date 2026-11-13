export const inject = ['tools', 'fixturePeerLedger']

export function apply(ctx, config) {
  const definition = {
    name: config?.toolName ?? 'peer_ledger_marker',
    description: 'Return the marker from this preset’s ledger service.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
    async execute() { return config?.sourceTag ? config.sourceTag + '/' + ctx.fixturePeerLedger : ctx.fixturePeerLedger },
  }
  ctx.tools.register(definition)
  const turnTool = config?.turnTool ?? (definition.name === 'collected_peer_marker'
    ? { trigger: 'fixture collect', name: 'collected_turn_marker' } : undefined)
  if (turnTool) {
    ctx.on('agent/pre-step', async ({ messages }, next) => {
      const user = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
      if (user?.content[0]?.text === turnTool.trigger) {
        await ctx.tools.register({ ...definition, name: turnTool.name })()
      }
      return next()
    })
  }
}
