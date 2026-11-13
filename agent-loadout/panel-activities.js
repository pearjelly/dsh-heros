const original = Symbol.for('cordis.original')
const maxJsonBytes = 16 * 1024

const fastTier = {
  id: 'enable-fast', name: '启用 Fast 档位', detail: '在当前会话的模型菜单中打开速度选项。',
  path: '/api/fast', request: { action: 'set', fast: true },
  response: { fast: true, configured: true, locked: false, source: 'session' },
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const matches = (data, conditions) => conditions.every(([key, value]) => Object.hasOwn(data, key) && data[key] === value)

function conditions(value) {
  if (!isRecord(value)) return
  const pairs = Object.entries(value)
  if (pairs.length && pairs.length <= 12 && pairs.every(([key, expected]) => /^[a-zA-Z0-9_-]{1,64}$/.test(key)
    && (expected === null || typeof expected === 'boolean' || Number.isFinite(expected)
      || typeof expected === 'string' && expected.length <= 160))) return pairs
}

function activityDeclarations(pkg) {
  const data = pkg?.manifest?.dsh?.loadout?.panelActivities
  const declared = Array.isArray(data) ? data.slice(0, 24)
    : pkg?.name === '@delthin/dsh-fast' && pkg.manifest.version === '0.1.4' ? [fastTier] : []
  const activities = new Map()
  for (const item of declared) {
    if (!item || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(item.id)
      || activities.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 48
      || typeof item.path !== 'string' || item.path.length > 160 || !/^\/api(?:\/[a-zA-Z0-9_.-]+)+$/.test(item.path)) continue
    const request = conditions(item.request)
    const response = conditions(item.response)
    if (request && response) {
      const detail = typeof item.detail === 'string' && item.detail.length <= 160 ? item.detail.trim() : undefined
      activities.set(item.id, { id: item.id, name: item.name.trim(), detail, path: item.path, request, response })
    }
  }
  return [...activities.values()]
}

async function smallJson(message) {
  let reader
  try {
    const type = message.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (type !== 'application/json' || Number(message.headers.get('content-length')) > maxJsonBytes) return
    reader = message.clone().body?.getReader()
    if (!reader) return
    const chunks = []
    let bytes = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxJsonBytes) return
      chunks.push(value)
    }
    const data = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'))
    if (isRecord(data)) return data
  } catch {
    // Observing a panel receipt must leave the original request and response intact.
  } finally {
    void reader?.cancel().catch(() => {})
  }
}

export function observePanelRoutes(ctx, scopeOf) {
  const registered = new WeakMap()
  if ('connection.fetch' in ctx) return
  ctx.accessor('connection.fetch', {
    get(receiver) {
      const service = receiver?.[original]
      if (!service) return
      const registry = Reflect.get(service, 'fetch', receiver)
      const caller = this
      const entry = caller.fiber?.entry
      if (!entry?.options.name || scopeOf(caller)) return registry
      return {
        ...registry,
        register(route) {
          if (route?.requestBody !== 'buffered' || !route.methods?.includes('POST') || typeof route.fetch !== 'function') {
            return registry.register(route)
          }
          let activities
          try {
            const pkg = ctx.get('pluginPackages')?.packageOf(entry.options.name, entry.parent.tree.ctx.baseUrl)
            activities = activityDeclarations(pkg).filter(item => item.path === route.path)
          } catch {
            return registry.register(route)
          }
          if (!activities.length) return registry.register(route)
          const dispose = registry.register({
            ...route,
            async fetch(request) {
              if (request.method !== 'POST') return Reflect.apply(route.fetch, this, [request])
              const input = smallJson(request)
              const result = await Reflect.apply(route.fetch, this, [request])
              if (result.ok) {
                const occurredAt = Date.now()
                void Promise.all([input, smallJson(result)]).then(([submitted, confirmed]) => {
                  const sessionId = submitted?.sessionId
                  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512 || !confirmed
                    || registered.get(entry)?.get(route.path) !== activities) return
                  const accepted = activities.filter(activity => matches(submitted, activity.request) && matches(confirmed, activity.response))
                  if (accepted.length === 1) ctx.emit('agent-loadout/panel-activity', entry, sessionId, accepted[0], occurredAt)
                }).catch(() => {})
              }
              return result
            },
          })
          let routes = registered.get(entry)
          if (!routes) registered.set(entry, routes = new Map())
          routes.set(route.path, activities)
          const remove = () => { if (routes.get(route.path) === activities) routes.delete(route.path) }
          caller.effect(() => remove)
          return function(...args) {
            remove()
            return Reflect.apply(dispose, this, args)
          }
        },
      }
    },
  })
  ctx.provide('agentLoadoutPanelActivities', {
    owns(entry, activity) {
      return registered.get(entry)?.get(activity?.path)?.includes(activity) === true
    },
    list(entry) {
      return [...(registered.get(entry)?.values() ?? [])].flatMap(activities =>
        activities.map(({ id, name, detail }) => ({ id, name, detail })))
    },
  })
}
