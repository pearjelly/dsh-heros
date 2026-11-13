export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'fixture_standing_note',
    description: 'Return the marker from this preset’s ledger service.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
    async execute() { return 'spare' },
  })
}
