import { activeAgentUnits, activePresetUnits, dispatchedToolDetails, executorTools, profileToolSources,
  registeredToolDetails, toolDefinitionMatches, toolKey } from './ecosystem.js'
import { isProfileToolSource } from './tool-origins.js'

export const sourceConflictCode = 'LOADOUT_SOURCE_CHANGED'
const conflictMessage = '当前注册的工具与所选装备来源不符。请等待原来源恢复，或回城更换来源。'
const noTools = Object.freeze([])
const cached = new WeakMap()

export function equippedToolBindings(record) {
  if (!record) return noTools
  let bindings = cached.get(record)
  if (bindings) return bindings
  const live = record.liveTools ?? noTools
  const standing = record.standingTools ?? Object.entries(record.equipmentSources ?? {}).flatMap(([id, source]) => {
    const name = record.equipmentLabels?.[id]
    if (!name || source === 'profile' || live.some(tool => tool.id === id)) return []
    return [{ id, name, equipId: source }]
  })
  bindings = [...live.map(tool => {
    if (tool.equipId) return tool
    const source = record.equipmentSources?.[tool.id]
    return { ...tool, profile: true, ...(isProfileToolSource(source) ? { profileSourceId: source } : {}) }
  }),
    ...standing.map(tool => ({ ...tool, standing: true }))]
  cached.set(record, bindings)
  return bindings
}

export function boundToolState(ctx, scope, standingScope, record, tool, profileSources) {
  const definition = ctx.tools.get(tool.name, scope)
  if (tool.transport) {
    if (matches(ctx, scope, standingScope, record, tool, definition)) return 'ready'
  } else if (definition) {
    return matches(ctx, scope, standingScope, record, tool, definition) ? 'ready' : 'conflict'
  }
  if (definition || executorTools(ctx, scope).schemas.some(schema => schema.name === tool.name)) return 'conflict'
  const source = tool.profileSourceId
  const canTrigger = tool.deferred && (!source || (profileSources ?? profileToolSources(ctx)).get(source)?.active)
  return canTrigger ? 'waiting' : 'missing'
}

function matches(ctx, scope, standingScope, record, tool, definition) {
  return toolDefinitionMatches(ctx, scope, tool, record.definition.plugins, definition,
    { requireProvider: true, standingScope })
}

function executorActivity(ctx, execution, scope, record, executor, schema) {
  const standing = activePresetUnits(ctx, execution.agent.ctx, record?.definition.plugins)
  const session = activeAgentUnits(ctx, scope)
  const id = toolKey(schema)
  const details = registeredToolDetails(ctx, scope, [], standing, session, { ...executor, schemas: [schema] }).get(id)
  const profile = executor.origin?.profileEntry
  const provider = [...standing, ...session].find(unit => (unit.row.config?.sourceUnitId ?? unit.id) === details.artSourceId)
  return { id, sourceId: details.artSourceId, sourceName: details.sourceName, provider,
    profile: profile && details.artSourceId && { id: profile.id, unitId: executor.origin.unitEntry.id } }
}

export function enforceEquippedToolSources(ctx, runtime, records, captureCall, shortcuts, creditTool, observeDispatch) {
  const dispatched = new WeakMap()
  ctx.on('tools/result', (execution, outcome) => {
    const used = dispatched.get(execution)
    if (!used) return
    dispatched.delete(execution)
    if (outcome.isError || !used.call.isCurrent()) return
    try { creditTool?.(execution.agent, used.record, execution.name, used.source) } catch {
      // Mastery is observational and cannot change the native outcome.
    }
  }, { global: true })

  ctx.on('internal/dispatch', (mode, event, args) => {
    if (mode !== 'waterfall' || event !== 'tools/execute' || args.length !== 2) return
    const [execution, dispatch] = args
    if (!execution?.agent || typeof dispatch !== 'function') return
    const record = records.get(ctx.agentPresets.composedPreset(execution.agent.ctx))
    const bindings = equippedToolBindings(record).filter(tool => tool.name === execution.name)
    const call = captureCall?.(execution)
    const scope = runtime.scopeOf(execution.agent.ctx)
    if (!scope) return
    const fromShortcuts = shortcuts?.forCall(execution)
    if (!bindings.length && !call && !fromShortcuts) return

    // Cordis passes the native innermost callback in this event. Check there so
    // a registration changed by an async around-dispatch wrapper is covered.
    // Leave permissions, cancellation, and the actual dispatch with DSH.
    function checked(pins = []) {
      if (execution.signal.aborted) return dispatch()
      const definition = typeof ctx.tools.executable === 'function'
        ? ctx.tools.executable(execution.name, execution.agent, execution.toolSet)
        : ctx.tools.get(execution.name, scope)
      const executor = !definition ? executorTools(ctx, scope) : undefined
      if (!definition && !executor?.schemas.some(schema => schema.name === execution.name) && !pins.length) return dispatch()
      const binding = bindings.find(tool => matches(ctx, scope, runtime.scopeParentOf(scope), record, tool, definition))
      const selectedSource = pins[0]?.sourceId ?? record?.equipmentSources?.[binding?.id] ?? binding?.equipId
      let source
      if (call && definition) {
        try { source = dispatchedToolDetails(ctx, scope, definition, execution.agent.ctx, record?.definition.plugins, selectedSource) } catch {
          // A label lookup must never change the native tool outcome.
        }
      }
      const changedPin = pins.find(pin => !shortcuts.matches(scope, pin, executor))
      if (changedPin || (bindings.length && !binding)) {
        const expected = changedPin ?? (bindings.length === 1 ? bindings[0] : undefined)
        call?.record({ id: expected?.id, blocked: true,
          sourceName: changedPin?.sourceName ?? record?.equipmentSourceLabels?.[expected?.id],
          registeredSourceName: source?.sourceName ?? executor?.origin?.unit.id })
        return Promise.resolve({ isError: true, content: [{ type: 'text', text: 'Error: ' + conflictMessage }],
          error: { message: conflictMessage, info: { name: 'LoadoutToolSourceChanged', code: sourceConflictCode } } })
      }
      const sourceId = selectedSource && selectedSource !== 'profile' ? selectedSource : source?.sourceId
      const sourceName = pins[0]?.sourceName ?? record?.equipmentSourceLabels?.[binding?.id] ?? source?.sourceName
      if (call) {
        try {
          const schema = !source && executor?.schemas.find(tool => tool.name === execution.name)
          const details = source ?? (schema && executorActivity(ctx, execution, scope, record, executor, schema))
          if (details) {
            const { id, provider, profile } = details
            const shortcutKey = shortcuts?.source(scope, execution.name, executor)?.key
            call.begin({ id, sourceId: sourceId ?? details.sourceId, shortcutKey, sourceName: sourceName ?? details.sourceName,
              provider: provider?.row.config?.sourceUnitId ?? provider?.id, profile })
          }
        } catch {
          // Live feedback is observational and cannot change native dispatch.
        }
      }
      const result = observeDispatch ? observeDispatch(execution, definition, scope, dispatch) : dispatch()
      if (!source) return result
      return result.then(outcome => {
        // The body can succeed before native post-execute policies and cancellation settle the result.
        const recordedSource = sourceId ?? selectedSource
        if (!outcome.isError) dispatched.set(execution, { record, call, source: { ...source, sourceId: recordedSource, sourceName } })
        const code = outcome.error?.info?.code
        if (code !== 'ABORTED_BEFORE_DISPATCH' && code !== 'UNKNOWN_TOOL') {
          call.record({ id: source.id, sourceId: recordedSource, sourceName })
        }
        return outcome
      })
    }
    args[1] = () => fromShortcuts ? fromShortcuts().then(checked) : checked()
  }, { global: true })
}
