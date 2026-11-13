import { randomUUID } from 'node:crypto'

export function apply(ctx) {
  ctx.provide('fixturePeerSeed', randomUUID())
}
