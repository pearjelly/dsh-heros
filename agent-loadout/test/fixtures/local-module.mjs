export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'serpentine_index',
    description: 'Read a synthetic index from a package local to the source preset.',
    parameters: {},
    output: { schema: { type: 'string' }, render: value => [{ type: 'text', text: value }] },
    async execute() { return 'fixture' },
  })
}
