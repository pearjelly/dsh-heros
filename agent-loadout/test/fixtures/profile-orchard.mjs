export const inject = ['fixtureTurnGate']

export function apply(ctx, { branch, names = ['fixture_orchard_selection', 'fixture_orchard_receipt'], trigger = 'fixture orchard ' + branch }) {
  const scheduled = new WeakMap()

  function register(agent) {
    const disposers = names.map(name => agent.ctx.tools.register({
      name,
      description: 'Return the active orchard branch.',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
      async execute() { return branch },
    }))
    return () => Promise.all(disposers.map(dispose => dispose()))
  }

  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return
    const dispose = scheduled.get(agent)
    scheduled.delete(agent)
    return dispose?.()
  })
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const lastUser = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
    const text = lastUser?.content[0]?.text
    const fromEquipment = text?.includes('当前会话的工具') && names.some(name => text.includes(JSON.stringify(name)))
    if (fromEquipment && text.split('\n').includes(trigger)) {
      if (!scheduled.has(agent)) scheduled.set(agent, register(agent))
      return next()
    }
    if (text !== trigger) return next()
    const dispose = register(agent)
    try {
      await ctx.fixtureTurnGate.wait(agent.id, signal)
      return { kind: 'reject' }
    } finally {
      await dispose()
    }
  })
}
