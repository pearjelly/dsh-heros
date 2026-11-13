import { AsyncLocalStorage } from 'node:async_hooks'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declaredIsolation, declaredRealm } from './equipment-isolation.js'
import { jsonFingerprint } from './loader-support.js'
import { observePanelRoutes } from './panel-activities.js'

export const name = 'agent-loadout-tool-origins'

const original = Symbol.for('cordis.original')
const shadow = Symbol.for('cordis.shadow')
const turnEvents = new Set([
  'agent/pre-step', 'agent/request', 'agent/request-error', 'agent/assistant-stream', 'agent/turn-stopping',
])

function containingUnit(entry, scopeOf) {
  const scope = scopeOf(entry.ctx)
  for (;;) {
    const tree = entry.parent?.tree
    if (!tree) return entry
    const parent = entry.parent.ctx?.fiber?.entry
    if (parent && parent !== entry && scopeOf(parent.ctx) === scope
      && (entry.parent !== tree.root || parent.subtree === tree)) {
      entry = parent
    } else {
      return entry
    }
  }
}

function originOf(context, scopeOf) {
  const entry = context.fiber?.entry
  if (!entry?.options?.name) return
  const unit = containingUnit(entry, scopeOf)
  const scope = scopeOf(unit.ctx)
  return {
    unit: unit.options,
    scope,
    baseUrl: unit.parent?.tree?.ctx?.baseUrl,
    entryId: entry.id,
    moduleName: entry.options.name,
    moduleBaseUrl: entry.parent?.tree.ctx.baseUrl,
    toolEntry: entry,
    unitEntry: unit,
    ...(!scope ? { profileEntry: entry } : {}),
  }
}

export function isProfileToolSource(id) {
  return typeof id === 'string' && /^profile:[a-f0-9]{24}$/.test(id)
}

export function profileProviderId(entry) {
  if (!entry?.options?.name || !entry.parent || entry.options.group) return
  const { disabled: _disabled, ...row } = entry.options
  const base = realBase(entry.parent.tree.ctx.baseUrl)
  const key = jsonFingerprint({ profileEntry: entry.id, base, row })
  if (key) return 'profile:' + key
}

function realBase(url) {
  let base = url ?? ''
  if (base.startsWith('file:')) {
    try {
      base = pathToFileURL(realpathSync(fileURLToPath(base))).href
    } catch {
      // The loader's original URL remains usable for live attribution.
    }
  }
  return base
}

export function profileProviderActive(entry) {
  return entry?.fiber?.state === 2 && !entry.disabled && entry.parent?.tree.store[entry.options.id] === entry
}

export function scopedToolProviderId(origin, scope) {
  const { toolEntry, unitEntry } = origin
  if (!origin.scope || !toolEntry?.parent || !unitEntry?.parent) return
  const key = jsonFingerprint({ entry: toolEntry.id, role: origin.scope === scope ? 'session' : 'preset',
    base: realBase(unitEntry.parent.tree.ctx.baseUrl), row: declaredIsolation(unitEntry.options) })
  if (key) return 'scoped:' + key
}

function namedRealm(entry, service) {
  while (entry) {
    if (entry.options.isolate && Object.hasOwn(entry.options.isolate, service)) {
      const label = entry.options.isolate[service]
      return typeof label === 'string' && label ? declaredRealm(label) : undefined
    }
    const parent = entry.parent?.ctx?.fiber?.entry
    if (parent === entry) return
    entry = parent
  }
}

export function scopeApi(ctx) {
  const runtime = ctx.get('pluginPackages')?.packageOf('@deepseek-ai/dsh-scope', ctx.baseUrl)
  return runtime && createRequire(runtime.manifestPath)(runtime.name)
}

export function apply(ctx) {
  const runtime = scopeApi(ctx)
  if (!runtime) return
  const { scopeChainOf, scopeOf } = runtime
  observePanelRoutes(ctx, scopeOf)
  const rootOrigins = new WeakMap()
  const scopedOrigins = new WeakMap()
  const executorOrigins = new WeakMap()
  const presentations = new WeakMap()
  const scopedEntries = new WeakMap()
  const commandOrigins = new WeakMap()
  const commandUses = new WeakMap()
  const listenerOrigin = new AsyncLocalStorage()
  let observing = true
  let forwardingListener = false

  function registrationOrigin(context, scope) {
    const direct = originOf(context, scopeOf)
    const listener = listenerOrigin.getStore()
    // An agent context can inherit the core loader entry. Its owner is only
    // evidence for this registration if that entry lives in the same scope.
    const owner = direct && direct.scope === scope ? direct : listener
    if (!owner) return
    const origin = { ...owner, ...(listener?.deferred ? { deferred: true } : {}),
      ...(listener?.initialization ? { initialization: true } : {}),
      ...(owner.profileEntry ? { profileSourceId: profileProviderId(owner.profileEntry) } : {}) }
    if (scope && origin.scope) {
      origin.shortcutSourceId = scopedToolProviderId(origin, scope)
      origin.shortcutScope = scope
    }
    return origin
  }

  function remember(context, definition) {
    if (!observing || !definition || typeof definition !== 'object') return
    const scope = scopeOf(context)
    const origin = registrationOrigin(context, scope)
    if (!origin) return
    if (!scope) {
      rootOrigins.set(definition, origin)
      if (origin.profileSourceId && (origin.initialization || origin.deferred)) {
        ctx.emit('agent-loadout/tool-discovered', origin, definition, scope)
      }
      return
    }
    let byDefinition = scopedOrigins.get(scope)
    if (!byDefinition) scopedOrigins.set(scope, byDefinition = new WeakMap())
    byDefinition.set(definition, origin)
    if (origin.scope ? scopeChainOf(scope).includes(origin.scope) : origin.profileSourceId) {
      ctx.emit('agent-loadout/tool-discovered', origin, definition, scope)
    }
  }

  // Cordis associates service methods with dotted accessors. Forward the
  // original register method with its native caller and provider contexts.
  if ('tools.register' in ctx) return
  function observeRegistration(service, key, observe, prepare) {
    if (service + '.' + key in ctx) return
    ctx.accessor(service + '.' + key, {
      get(receiver) {
        const raw = receiver?.[original]
        if (!raw) return
        const method = Reflect.get(raw, key, receiver)
        if (typeof method !== 'function') return method
        const caller = this
        const context = caller.extend({ [shadow]: raw.ctx })
        const forwarded = new Proxy(receiver, {
          get(target, property, proxy) {
            return property === 'ctx' ? context : Reflect.get(target, property, proxy)
          },
        })
        return function(definition, ...args) {
          if (this !== receiver) return Reflect.apply(method, this, [definition, ...args])
          let value = definition
          try {
            if (prepare) value = prepare(caller, definition)
          } catch {
            // Fall back to the native registration when attribution is unavailable.
          }
          const result = Reflect.apply(method, forwarded, [value, ...args])
          try {
            return observe?.(caller, definition, result) ?? result
          } catch {
            return result
          }
        }
      },
    })
  }
  observeRegistration('tools', 'register', remember)
  observeRegistration('tools', 'setExecutor', (caller, executor, dispose) => {
    if (!observing) return
    const scope = scopeOf(caller)
    const origin = registrationOrigin(caller, scope)
    if (origin) executorOrigins.set(executor, origin)
    function notify() {
      if (observing) ctx.emit('agent-loadout/executor-changed', scope)
    }
    notify()
    if (typeof dispose !== 'function') return
    let removed = false
    function detach() {
      if (removed) return
      removed = true
      notify()
    }
    caller.effect(() => detach)
    return function(...args) {
      try {
        return Reflect.apply(dispose, this, args)
      } finally {
        detach()
      }
    }
  })
  observeRegistration('tools', 'presentAs', (caller, mode, dispose) => {
    if (!observing || typeof dispose !== 'function') return
    const scope = scopeOf(caller)
    if (!scope) return
    const record = { mode, origin: registrationOrigin(caller, scope) }
    presentations.set(scope, record)
    const remove = () => { if (presentations.get(scope) === record) presentations.delete(scope) }
    caller.effect(() => remove)
    return function(...args) {
      remove()
      return Reflect.apply(dispose, this, args)
    }
  })
  observeRegistration('commands', 'register', undefined, (caller, definition) => {
    if (!observing || typeof definition?.handler !== 'function') return definition
    const origin = registrationOrigin(caller, scopeOf(caller))
    if (!origin) return definition
    const { handler, name } = definition
    function tracked(invocation) {
      const session = invocation?.agent?.session
      if (observing && session && typeof invocation.commandId === 'string') {
        let uses = commandUses.get(session)
        if (!uses) commandUses.set(session, uses = new Map())
        uses.set(invocation.commandId, { name, origin })
      }
      return Reflect.apply(handler, this, [invocation])
    }
    commandOrigins.set(tracked, origin)
    return { ...definition, handler: tracked }
  })

  // A listener may register through agent.ctx instead of its own plugin
  // context. Retain the owning loader entry across async lifecycle hooks.
  ctx.on('internal/listener', function(event, listener, options) {
    const deferred = turnEvents.has(event)
    if ((!deferred && event !== 'agent/created') || forwardingListener) return
    const origin = originOf(this, scopeOf)
    if (!origin) return
    if (deferred) origin.deferred = true
    else origin.initialization = true
    forwardingListener = true
    try {
      return this.on(event, function(...args) {
        return observing
          ? listenerOrigin.run(origin, () => Reflect.apply(listener, this, args))
          : Reflect.apply(listener, this, args)
      }, options)
    } finally {
      forwardingListener = false
    }
  }, { global: true, prepend: true })

  ctx.on('loader/entry-init', entry => {
    // The Loader emits from its constructor before assigning the entry's parent.
    queueMicrotask(() => {
      const scope = entry.parent && scopeOf(entry.parent.ctx)
      if (!observing || !scope) return
      let entries = scopedEntries.get(scope)
      if (!entries) scopedEntries.set(scope, entries = new Set())
      entries.add(new WeakRef(entry))
    })
  }, { global: true })

  function* entriesIn(scope) {
    const entries = scopedEntries.get(scope)
    for (const reference of entries ?? []) {
      const entry = reference.deref()
      if (entry && entry.parent.tree.store[entry.options.id] === entry) yield entry
      else entries.delete(reference)
    }
  }

  function unitModules(scope) {
    const units = new Map()
    for (const entry of entriesIn(scope)) {
      if (entry.fiber?.state !== 2 || entry.disabled) continue
      const unit = containingUnit(entry, scopeOf)
      if (scopeOf(unit.ctx) !== scope) continue
      let modules = units.get(unit)
      if (!modules) units.set(unit, modules = [])
      if (!entry.options.group) modules.push({ moduleName: entry.options.name, baseUrl: entry.parent.tree.ctx.baseUrl })
    }
    return units
  }

  ctx.provide('agentLoadoutToolOrigins', {
    command(definition) {
      return definition && commandOrigins.get(definition.handler)
    },
    takeCommand(session, id) {
      const uses = commandUses.get(session)
      const command = uses?.get(id)
      if (command) uses.delete(id)
      return command
    },
    executor(executor) {
      return executorOrigins.get(executor)
    },
    service(name, scope) {
      const layers = [...scopeChainOf(scope), undefined]
      const byLayer = new Map()
      for (const key of Reflect.ownKeys(ctx.reflect.store)) {
        const service = ctx.reflect.store[key]
        if (service?.name !== name) continue
        const context = service.ctx ?? service.fiber?.ctx
        if (!context || !layers.includes(scopeOf(context))) continue
        const origin = originOf(context, scopeOf)
        if (!profileProviderActive(origin?.toolEntry)) continue
        byLayer.set(origin.scope, byLayer.has(origin.scope) ? undefined : origin)
      }
      for (const layer of layers) {
        if (!byLayer.has(layer)) continue
        const origin = byLayer.get(layer)
        if (origin) return { ...origin, ...(origin.scope && { shortcutSourceId: scopedToolProviderId(origin, scope) }) }
        return
      }
    },
    get(definition, scope) {
      if (!definition) return
      for (const key of scopeChainOf(scope)) {
        const owner = scopedOrigins.get(key)?.get(definition)
        if (owner) return owner
        const presentation = definition.name === 'run_code' && presentations.get(key)
        if (presentation) return presentation.mode === 'ptc' ? presentation.origin : undefined
      }
      return rootOrigins.get(definition)
    },
    baseOf(scope) {
      for (const entry of entriesIn(scope)) {
        const unit = containingUnit(entry, scopeOf)
        if (scopeOf(unit.parent.ctx) === scope) return unit.parent.tree.ctx.baseUrl
      }
    },
    units(scope) {
      return new Set(unitModules(scope).keys())
    },
    unitModules,
    scopedToolSources(scope) {
      const sources = new Map()
      for (const layer of scopeChainOf(scope)) {
        for (const entry of entriesIn(layer)) {
          if (entry.options.group || !profileProviderActive(entry)) continue
          const origin = originOf(entry.fiber.ctx, scopeOf)
          const source = origin && scopedToolProviderId(origin, scope)
          if (source) sources.set(source, origin)
        }
      }
      return sources
    },
    serviceRelations(scope) {
      const services = new Map()
      const dependencies = []
      const required = []
      const visibleScopes = new Set(scopeChainOf(scope))
      for (const key of Reflect.ownKeys(ctx.reflect.store)) {
        const impl = ctx.reflect.store[key]
        const context = impl?.ctx ?? impl?.fiber?.ctx
        if (context?.fiber.state !== 2 || !visibleScopes.has(scopeOf(context))) continue
        const provider = originOf(context, scopeOf)
        const label = namedRealm(context.fiber.entry, impl.name)
        if (provider) services.set(impl, { provider, realm: label ? [impl.name, label] : undefined })
      }
      for (const entry of entriesIn(scope)) {
        if (entry.fiber?.state !== 2 || entry.disabled) continue
        const consumer = originOf(entry.fiber.ctx, scopeOf)
        if (!consumer) continue
        // The fiber records the actual implementation used by its declared injections.
        const bindings = entry.fiber.committed ?? entry.fiber.store
        for (const name of Object.keys(entry.fiber.inject)) {
          const service = services.get(bindings?.[name])
          if (!service) continue
          const relation = { consumer, provider: service.provider }
          if (service.realm) dependencies.push(relation)
          if (service.provider.scope === scope) required.push(relation)
        }
      }
      return { services: [...services.values()].filter(({ provider, realm }) => realm && provider.scope === scope),
        dependencies, required }
    },
  })
  ctx.effect(() => () => {
    observing = false
    listenerOrigin.disable()
  })
}
