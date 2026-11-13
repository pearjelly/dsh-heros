export const inject = ['tools', 'fixtureTurnGate']

export function registerSessionKey(agent, wrongSchema) {
  return agent.ctx.tools.register({
    name: 'local_session_key',
    description: 'Return a synthetic value bound to this session.',
    parameters: wrongSchema ? { tag: { type: 'string' } } : {},
    output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
    async execute() { return agent.id },
  })
}

export function apply(ctx, { wrongSchema, deferred } = {}) {
  if (deferred) {
    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
      if (!messages.some(message => message.content.some(block => block.type === 'text' && block.text === 'fixture turn'))) {
        return next()
      }
      const dispose = registerSessionKey(agent, wrongSchema)
      try {
        await ctx.fixtureTurnGate.wait(agent.id, signal)
        return { kind: 'reject' }
      } finally {
        dispose()
      }
    })
    return
  }
  ctx.on('agent/created', ({ agent }) => {
    registerSessionKey(agent, wrongSchema)
  })
}
