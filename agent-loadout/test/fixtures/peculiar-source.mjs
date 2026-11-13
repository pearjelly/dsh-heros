export const inject = ['tools', 'fixtureCompass', 'fixtureTurnGate']

function definition(name) {
  return {
    name,
    description: 'Return a synthetic fixture note.',
    parameters: { fail: { type: 'boolean' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute({ fail }) {
      if (fail) throw new Error('Fixture tool failure')
      return 'ready'
    },
  }
}

const standingTool = definition('quartz_note')
const sessionTool = definition('celestial_ledger')
const turnTool = definition('meridian_beacon')
const briefTool = definition('fixture_fading_signal')

export function apply(ctx) {
  if (ctx.fixtureCompass !== 'north') throw new Error('The provider dependency was not mounted')
  ctx.tools.register(standingTool)
  ctx.on('agent/created', async ({ agent }) => {
    await Promise.resolve()
    agent.ctx.tools.register(sessionTool)
  })
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const last = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
    const trigger = last?.content.find(block => block.type === 'text')?.text
    if (trigger !== 'fixture turn' && trigger !== 'fixture signal') return next()
    if (trigger === 'fixture turn') await agent.ctx.tools.register(briefTool)()
    const dispose = agent.ctx.tools.register(trigger === 'fixture signal' ? briefTool : turnTool)
    try {
      await ctx.fixtureTurnGate.wait(agent.id, signal)
      return { kind: 'reject' }
    } finally {
      await dispose()
    }
  })
}
