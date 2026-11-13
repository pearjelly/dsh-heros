import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { executorTools, profileToolSources, registeredToolKey, toolKey } from './ecosystem.js'
import { isProfileToolSource, profileProviderActive, profileProviderId, scopedToolProviderId } from './tool-origins.js'

const equipmentId = /^(?:tool:[a-f0-9]{12}|plugin:[a-f0-9]{24})$/
const sourceKey = /^(?:(?:profile|scoped|plugin):[a-f0-9]{24}|registration:[0-9a-f-]{36})$/
export const shortcutPromptPrefix = '请使用当前会话的工具 '
export const englishShortcutPromptPrefix = 'Use the current session tool '

export function isProfileShortcut(id) {
  return typeof id === 'string' && id.length <= 512 && /^(?:host|bundle):.+$/u.test(id)
}

export function validShortcut({ id, key, name, transport }) {
  return typeof id === 'string' && typeof key === 'string' && (isProfileShortcut(id) ? isProfileToolSource(key)
    : equipmentId.test(id) && sourceKey.test(key))
    && typeof name === 'string' && Boolean(name)
    && (transport === undefined || (transport === true && id.startsWith('tool:')))
}

export function matchShortcutStore(directory, saveEntry, warn) {
  const loaded = new Map()
  const writes = new Map()
  const keyOf = sessionId => createHash('sha256').update(sessionId).digest('hex')

  function read(sessionId) {
    if (!loaded.has(sessionId)) {
      const key = keyOf(sessionId)
      loaded.set(sessionId, readFile(join(directory, key + '.json'), 'utf8').then(raw => {
        const { pins, carry } = JSON.parse(raw)
        if (!Array.isArray(pins) || !pins.every(validShortcut) ||
          (carry !== undefined && (!Array.isArray(carry) || !carry.every(validShortcut)))) throw new Error('Invalid equipment shortcuts')
        return { pins, carry }
      }).catch(error => {
        if (error.code !== 'ENOENT') warn(key)
        return { pins: [] }
      }))
    }
    return loaded.get(sessionId)
  }

  function change(sessionId, edit) {
    const writing = (writes.get(sessionId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const previous = await read(sessionId)
      const next = edit(previous)
      if (next === previous) return
      await saveEntry(directory, keyOf(sessionId), next)
      loaded.set(sessionId, Promise.resolve(next))
    }).finally(() => {
      if (writes.get(sessionId) === writing) writes.delete(sessionId)
    })
    writes.set(sessionId, writing)
    return writing
  }

  function update(sessionId, id, key, pin) {
    return change(sessionId, previous => {
      const current = previous.pins.find(item => item.id === id)
      if (current && current.key !== key) throw new Error('快捷槽来源已变化，请重新查看对局装备。')
      if (Boolean(current) === Boolean(pin)) return previous
      return { ...previous, pins: pin ? [...previous.pins, pin] : previous.pins.filter(item => item.id !== id) }
    })
  }

  async function stage(sessionId, sourceSessionId) {
    const { pins } = await read(sourceSessionId)
    if (pins.length) await change(sessionId, previous => previous.carry === undefined ? { ...previous, carry: pins } : previous)
  }

  function resolveCarry(sessionId, selected) {
    return change(sessionId, previous => {
      if (!previous.carry?.length) throw new Error('原对局快捷槽已处理，请刷新装备。')
      const chosen = previous.carry.filter(pin => selected.get(pin.id) === pin.key)
      if (chosen.length !== selected.size) throw new Error('快捷槽已变化，请重新核对。')
      const existing = new Set(previous.pins.map(pin => pin.id))
      return { pins: [...previous.pins, ...chosen.filter(pin => !existing.has(pin.id))], carry: [] }
    })
  }

  return { read, update, stage, resolveCarry, settle: () => Promise.allSettled(writes.values()) }
}

export function shortcutBindings(ctx, receipts) {
  const registrations = new WeakMap()
  const turns = new WeakMap()

  function source(scope, name, transport) {
    const definition = ctx.tools.get(name, scope)
    const offered = !definition && (transport ?? executorTools(ctx, scope))
    const schema = offered && offered.schemas.find(item => item.name === name)
    const identity = definition ?? (schema && offered.executor)
    if (!identity) return
    const origin = definition ? ctx.get('agentLoadoutToolOrigins')?.get(definition, scope) : offered.origin
    let key
    if (origin?.profileSourceId) {
      if (!profileProviderActive(origin.profileEntry) || profileProviderId(origin.profileEntry) !== origin.profileSourceId) return
      key = origin.profileSourceId
    } else if (origin?.shortcutSourceId || (schema && origin?.scope)) {
      key = scopedToolProviderId(origin, scope)
      if (!key || !profileProviderActive(origin.toolEntry)) return
      if (definition && scopedToolProviderId(origin, origin.shortcutScope) !== origin.shortcutSourceId) return
    } else {
      if (!registrations.has(identity)) registrations.set(identity, 'registration:' + randomUUID())
      key = registrations.get(identity)
    }
    return { id: definition ? registeredToolKey(definition) : toolKey(schema), key,
      deferred: Boolean(origin?.deferred && !key.startsWith('registration:')), ...(schema && { transport: true }) }
  }

  function matches(scope, pin, transport) {
    const binding = source(scope, pin.name, transport)
    return binding?.id === pin.id && binding.key === pin.key && binding.transport === pin.transport
  }

  function toolAvailability(scope, transport) {
    let profileSources
    let scopedSources
    return pin => {
      if (ctx.tools.get(pin.name, scope) || transport.schemas.some(schema => schema.name === pin.name)) {
        return matches(scope, pin, transport) ? 'ready' : 'conflict'
      }
      if (!pin.deferred) return 'missing'
      if (isProfileToolSource(pin.key)) {
        profileSources ??= profileToolSources(ctx)
        return profileSources.get(pin.key)?.active ? 'waiting' : 'missing'
      }
      scopedSources ??= ctx.get('agentLoadoutToolOrigins')?.scopedToolSources(scope) ?? new Set()
      return scopedSources.has(pin.key) ? 'waiting' : 'missing'
    }
  }

  function observe(session, { type, data }) {
    if (type === 'turn/start') turns.set(session, [])
    else if (type === 'turn/end') turns.delete(session)
    else if (type === 'user/message' && data.source.kind === 'user' && data.source.rpcId && data.content.length === 1) {
      const [part] = data.content
      if (part.type === 'text' && (part.text.startsWith(shortcutPromptPrefix) || part.text.startsWith(englishShortcutPromptPrefix) || part.text.startsWith('【'))) {
        const checks = turns.get(session)
        if (checks) {
          // Keep read errors for the dispatcher without leaving a rejected promise
          // when this user message never requests a tool.
          checks.push(receipts.sourceBindings(session.id, data.source.rpcId, part.text).catch(error => ({ error })))
        }
      }
    }
  }

  function forCall({ agent, name }) {
    const checks = turns.get(agent.session)
    if (!checks?.length) return
    return () => Promise.all(checks).then(results => {
      for (const result of results) if (result?.error) throw result.error
      return results.flat().filter(pin => pin.name === name)
    })
  }

  return { source, matches, toolAvailability, observe, forCall }
}
