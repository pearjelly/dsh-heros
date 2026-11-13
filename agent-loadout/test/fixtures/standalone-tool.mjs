export const inject = ['tools']

export function apply(ctx, config) {
  if (config?.marker !== 'sky') throw new Error('The standalone module requires marker: sky')
  ctx.tools.register({
    name: config.variant === 'summary' ? 'standalone_summary' : 'standalone_skymark',
    description: 'Return the synthetic marker from an individually installed module.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
    async execute() { return config.marker },
  })
}
