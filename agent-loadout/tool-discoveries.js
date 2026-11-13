import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const filePattern = /^([a-f0-9]{24})-([a-f0-9]{12})-(opening|turn)(?:-([a-f0-9]{24}))?\.json$/
const usePattern = /^used-([a-f0-9]{12})\.json$/
const sourceUsePattern = /^used-([a-f0-9]{12})-(plugin|profile|scoped)-([a-f0-9]{24})\.json$/
const sourcePattern = /^(plugin|profile|scoped):[a-f0-9]{24}$/

export function validToolModule(module) {
  return module && typeof module.moduleName === 'string' && Boolean(module.moduleName)
    && (module.baseUrl === undefined || typeof module.baseUrl === 'string')
}

function moduleKey(module) {
  return createHash('sha256').update(JSON.stringify([module.moduleName, module.baseUrl])).digest('hex').slice(0, 24)
}

function validUse({ name, sessionId, heroId, time }) {
  return typeof name === 'string' && name.length > 0 && name.length <= 256
    && [sessionId, heroId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 512)
    && Number.isSafeInteger(time) && time >= 0
}

export async function openToolDiscoveries(directory, saveEntry, warn, checkSnapshot) {
  const providers = new Map()
  const usedTools = new Map()
  const sourceUses = new Map()
  const sourceSnapshots = new Map()
  const writes = new Map()
  const saved = new Set()
  const sessions = new WeakMap()

  function include(catalog, provider, card, module) {
    let tools = catalog.get(provider)
    if (!tools) catalog.set(provider, tools = new Map())
    const previous = tools.get(card.id)
    const modules = previous?.modules ?? new Map()
    if (module) modules.set(moduleKey(module), module)
    const preferred = previous?.deferred === false ? previous : card
    tools.set(card.id, { ...preferred, modules })
  }

  function includeUse(id, sourceId, record) {
    if (!sourceUses.has(id)) sourceUses.set(id, new Map())
    sourceUses.get(id).set(sourceId, record)
    if (record.snapshot && (sourceSnapshots.get(sourceId)?.time ?? -1) < record.time) {
      sourceSnapshots.set(sourceId, { ...record, toolId: id })
    }
  }

  const files = await readdir(directory).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return []
  })
  for (const file of files) {
    const match = filePattern.exec(file)
    const use = usePattern.exec(file)
    const sourceUse = sourceUsePattern.exec(file)
    if (!match && !use && !sourceUse) continue
    try {
      const record = JSON.parse(await readFile(join(directory, file), 'utf8'))
      if (sourceUse) {
        if (!validUse(record) || (record.sourceName !== undefined && typeof record.sourceName !== 'string')) {
          throw new Error('Invalid source discovery')
        }
        const [, tool, kind, fingerprint] = sourceUse
        const id = 'tool:' + tool
        const sourceId = kind + ':' + fingerprint
        const { name, sessionId, heroId, time, sourceName, snapshot } = record
        if (snapshot) checkSnapshot(snapshot, sourceId, id)
        includeUse(id, sourceId, { name, sessionId, heroId, time, sourceName, snapshot })
      } else if (use) {
        if (!validUse(record)) throw new Error('Invalid tool discovery')
        const { name, sessionId, heroId, time } = record
        usedTools.set('tool:' + use[1], { name, sessionId, heroId, time })
      } else {
        const [, provider, tool, timing, origin] = match
        const { name, summary, transport, module } = record
        if (typeof name !== 'string' || !name || (summary !== undefined && typeof summary !== 'string')
          || (transport !== undefined && transport !== true)
          || (origin ? !validToolModule(module) || moduleKey(module) !== origin : module !== undefined)) {
          throw new Error('Invalid discovered tool')
        }
        include(providers, provider, { id: 'tool:' + tool, name, summary, deferred: timing === 'turn', transport }, module)
      }
      saved.add(file.slice(0, -5))
    } catch {
      warn(file)
    }
  }

  function persist(key, record) {
    if (saved.has(key) || writes.has(key)) return
    const writing = saveEntry(directory, key, record).then(() => saved.add(key), () => warn(key))
      .finally(() => writes.delete(key))
    writes.set(key, writing)
  }

  function remember(provider, { id, name, summary, deferred, transport, module }) {
    if (!name || typeof name !== 'string') return
    const key = provider + '-' + id.slice('tool:'.length) + '-' + (deferred ? 'turn' : 'opening')
      + (module ? '-' + moduleKey(module) : '')
    include(providers, provider, { id, name, summary, deferred, transport }, module)
    persist(key, { name, summary, transport, module })
  }

  function recordUse(id, record) {
    if (!/^tool:[a-f0-9]{12}$/.test(id) || !validUse(record)) return
    if (!usedTools.has(id)) usedTools.set(id, record)
    persist('used-' + id.slice('tool:'.length), usedTools.get(id))
  }

  function recordSourceUse(id, sourceId, record, capture) {
    if (!/^tool:[a-f0-9]{12}$/.test(id) || !sourcePattern.test(sourceId ?? '') || !validUse(record)) return
    let entry = sourceUses.get(id)?.get(sourceId)
    if (!entry) {
      const sourceName = typeof record.sourceName === 'string' ? record.sourceName.slice(0, 300) : undefined
      entry = { name: record.name, sessionId: record.sessionId, heroId: record.heroId, time: record.time, sourceName }
      if (capture) {
        try {
          const snapshot = capture()
          checkSnapshot(snapshot, sourceId, id)
          entry.snapshot = snapshot
        } catch {
          // The observed source remains useful when its configuration is session-only.
        }
      }
      includeUse(id, sourceId, entry)
    }
    persist('used-' + id.slice('tool:'.length) + '-' + sourceId.replace(':', '-'), entry)
  }

  function rememberSession(scope, provider, card) {
    let catalog = sessions.get(scope)
    if (!catalog) sessions.set(scope, catalog = new Map())
    const { module, ...tool } = card
    include(catalog, provider, tool, module)
  }

  return { remember, rememberSession, recordUse, recordSourceUse, usageOf: id => usedTools.get(id), usedTools: () => usedTools.entries(),
    sourcesOf: id => sourceUses.get(id), snapshotOf: sourceId => sourceSnapshots.get(sourceId),
    forProvider: (key, id) => id ? providers.get(key)?.get(id) : providers.get(key)?.values(),
    forSession: (scope, provider) => sessions.get(scope)?.get(provider)?.values(),
    settle: () => Promise.allSettled(writes.values()) }
}
