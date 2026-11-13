export const inject = ['fixturePeerSeed']

export function apply(ctx) {
  ctx.provide('fixturePeerLedger', ctx.fixturePeerSeed)
}
