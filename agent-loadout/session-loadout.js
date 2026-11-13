import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runtimeModule } from './loader-support.js'
import { panelActivityRecord } from './match-report.js'

function completedBoundary(events) {
  const end = events.findLast(event => event.type === 'turn/end')
  if (!end) {
    if (events.some(event => ['turn/start', 'agent/inbox/spliced', 'user/message'].includes(event.type))) return
    return events.findLast(event => (event.type === 'command/done' && event.data.kind === 'success')
      || (event.type === panelActivityRecord && event.ignorable === true))?.seq
  }
  let boundary = end.seq
  for (let i = boundary + 1; i < events.length; i++) {
    const event = events[i]
    if (event.type === 'turn/start' || event.type === 'agent/inbox/spliced'
      || (event.type === 'user/message' && event.surfaceOp === 'append')) break
    boundary = event.seq
  }
  return boundary
}

export async function continueLoadout(ctx, { sourceSessionId, presetId }, verify, signal, cut, destination) {
  if (typeof sourceSessionId !== 'string' || !sourceSessionId || typeof presetId !== 'string' || !presetId) {
    throw new Error('无法读取原会话或所选阵容。')
  }
  const query = ctx.get('sessionQuery')
  const agents = ctx.get('agents')
  const controller = ctx.get('sessionController')
  const workspaces = ctx.get('workspaceRegistry')
  const defaultModel = ctx.get('agentDefaultModel')
  // Reuse the Session Controller's setup in both supported DSH versions so
  // model selection and preset mounting match ordinary sessions and forks.
  if (!query || !agents || !controller?.agents?.composeAgent || !workspaces || !defaultModel) {
    throw new Error('当前 DSH 无法续战，可以选择另开新局。')
  }
  const preset = await ctx.agentPresets.resolve(presetId)
  if (preset.broken) throw new Error(preset.broken)
  const live = agents.get(sourceSessionId)
  if (!destination && live && ctx.agentPresets.composedPreset(live.ctx) === preset.id) {
    await verify({ presetId: preset.id, sessionId: sourceSessionId })
    return { sessionId: sourceSessionId }
  }

  const source = await query.observeSession(sourceSessionId, { projectionMode: 'none', signal })
  try {
    const events = source.events
    const boundary = cut ? cut.boundary : completedBoundary(events)
    const blank = boundary === undefined ? { sourceSessionId, length: cut?.length ?? events.length } : undefined
    if (boundary !== undefined && (!events[boundary] || (cut?.endedTurn !== undefined &&
      (events[boundary].type !== 'turn/end' || events[boundary].data.turn !== cut.endedTurn ||
        (cut.endedAt !== undefined && events[boundary].time !== cut.endedAt))))) {
      throw new Error('无法读取本次续战的回合记录。')
    }
    if (boundary === undefined && (cut ? events.slice(0, cut.length) : events).some(event =>
      event.type === 'turn/start' || event.type === 'agent/inbox/spliced' || event.type === 'user/message')) {
      throw new Error('首个回合尚未结束。回原会话等它结束后再续战，或选择另开新局。')
    }
    const workspace = workspaces.list().find(item => item.sessionIds.includes(source.header.id))
    if (destination) {
      const existing = await query.observeSession(destination, { projectionMode: 'none', signal }).catch(error => {
        if (error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error
      })
      if (existing) {
        try {
          const parent = boundary === undefined ? undefined : source.header.id
          if (existing.header.parentSession !== parent || existing.header.agentPreset !== preset.id ||
            existing.inheritedEventCount !== (boundary === undefined ? 0 : boundary + 1)) {
            throw new Error('已创建的续战会话与原安排不一致。')
          }
          const result = await controller.resolveAgent(destination)
          if (!result.agent) throw new Error(result.error?.message ?? '无法恢复已创建的续战会话。')
          await verify({ presetId: preset.id, sessionId: destination, sourceSessionId, blank })
          signal?.throwIfAborted()
          await workspace?.attachSession(destination)
          return { sessionId: destination }
        } finally {
          existing[Symbol.dispose]()
        }
      }
      if (live && ctx.agentPresets.composedPreset(live.ctx) === preset.id) {
        await verify({ presetId: preset.id, sessionId: sourceSessionId })
        return { sessionId: sourceSessionId }
      }
    }
    const composition = await controller.agents.composeAgent(preset.id)
    const sessionModule = '@deepseek-ai/dsh-session'
    const seed = boundary === undefined ? undefined : (await runtimeModule(ctx, sessionModule, '/fork')).buildForkSeed(events, boundary)
    // A preset selection from before the first source turn also survives a
    // fork. Record the new selection after the inherited prefix if needed.
    const inheritedPreset = seed?.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset
    const sessionId = destination ?? 'session-' + randomUUID()
    const { provider, model } = defaultModel.currentSelection()
    signal?.throwIfAborted()
    const handle = await agents.create({
      sessionId,
      signal,
      ...(seed && { seed, inheritedEventCount: boundary + 1 }),
      meta: {
        cwd: source.header.cwd,
        agentPreset: preset.id,
        ...(seed && { isSeeded: true, parentSession: source.header.id }),
      },
      agentOptions: { provider, model },
      async setup(agentCtx, agent) {
        const commit = await composition.setup(agentCtx, agent)
        if (inheritedPreset !== undefined && inheritedPreset !== preset.id) {
          agent.session.append('agent-preset/selected', { agentPreset: preset.id })
        }
        return commit
      },
    })
    try {
      await verify({ presetId: preset.id, sessionId, sourceSessionId, blank })
      if (destination) await ctx.get('sessions')?.flush(handle.agent.session)
      await workspace?.attachSession(sessionId)
    } catch (error) {
      await handle.dispose().catch(() => {})
      throw error
    }
    return { sessionId }
  } finally {
    source[Symbol.dispose]()
  }
}

function entryKey(sessionId) {
  return createHash('sha256').update(sessionId).digest('hex')
}

const queueStates = new Set(['waiting', 'starting', 'ready', 'interrupted', 'failed'])

function validateEntry(entry, filename) {
  const count = value => Number.isSafeInteger(value) && value >= 0
  const validCut = cut => cut && count(cut.length) &&
    (cut.boundary === undefined || (count(cut.boundary) && cut.boundary < cut.length)) &&
    (cut.endedTurn === undefined || (count(cut.endedTurn) && count(cut.endedAt) && cut.boundary !== undefined))
  const { anchor, id, sourceSessionId, presetId, state, sessionId } = entry
  if (typeof sourceSessionId !== 'string' || !sourceSessionId || sourceSessionId.length > 512
    || entryKey(sourceSessionId) + '.json' !== filename
    || typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
    || typeof presetId !== 'string' || !presetId || typeof entry.title !== 'string' || !queueStates.has(state)
    || !validCut(anchor) || typeof anchor.wait !== 'boolean' || typeof anchor.next !== 'boolean'
    || (anchor.turn !== undefined && (!count(anchor.turn) || !count(anchor.start) || anchor.start >= anchor.length))
    || ((state === 'starting' || state === 'ready') && !validCut(entry.cut))
    || (state === 'ready' && sessionId !== 'session-' + id && sessionId !== sourceSessionId)) {
    throw new Error('Invalid continuation')
  }
}

export function continuationQueue(ctx, verify, notify, signal, directory, saveEntry) {
  const entries = new Map()
  const jobs = new Set()

  function status(sessionId) {
    const entry = entries.get(sessionId)
    if (!entry?.anchor || entry.arming || entry.cancelling) return
    const { id, presetId, title, state, turn, sessionId: nextSessionId, error } = entry
    return { id, presetId, title, state, turn, sessionId: nextSessionId, error,
      next: entry.anchor.next && turn === undefined }
  }

  function track(job) {
    jobs.add(job)
    const release = () => jobs.delete(job)
    void job.then(release, release)
    return job
  }

  function persist(entry) {
    const { id, sourceSessionId, presetId, title, state, anchor, cut, turn, sessionId, error } = entry
    const snapshot = { id, sourceSessionId, presetId, title, state, anchor, cut, turn, sessionId, error }
    const write = (entry.write?.catch(() => {}) ?? Promise.resolve()).then(() =>
      saveEntry(directory, entryKey(sourceSessionId), snapshot))
    entry.write = track(write)
    return write
  }

  function active(entry) {
    return entries.get(entry.sourceSessionId) === entry && !entry.cancelling && !signal.aborted
  }

  function transition(entry, state, error) {
    if (!active(entry)) return
    entry.state = state
    entry.buffer = undefined
    entry.error = error instanceof Error ? error.message : error
    notify(entry.sourceSessionId)
    return persist(entry).catch(() => {
      entry.error = [entry.error, '续战状态暂时无法保存。'].filter(Boolean).join(' ')
      notify(entry.sourceSessionId)
    })
  }

  function interrupt(entry) {
    return transition(entry, 'interrupted', '重新排队会沿用这套阵容，并等待原会话的回合结束。')
  }

  function run(entry, restoring = false) {
    const job = Promise.resolve().then(async () => {
      if (!restoring) {
        const sessions = ctx.get('sessions')
        const source = sessions?.get(entry.sourceSessionId)
        if (source) await sessions.flush(source)
        signal.throwIfAborted()
        await persist(entry)
      }
      signal.throwIfAborted()
      const { sessionId } = await continueLoadout(ctx, entry, verify, signal, entry.cut, 'session-' + entry.id)
      entry.sessionId = sessionId
      await transition(entry, 'ready')
    }).catch(error => transition(entry, 'failed', error))
    return track(job)
  }

  function begin(entry, cut) {
    if (!active(entry) || entry.state !== 'waiting') return
    entry.state = 'starting'
    entry.cut = cut
    notify(entry.sourceSessionId)
    run(entry)
  }

  function advance(entry, event) {
    if (entry.state !== 'waiting') return
    if (event.type === 'turn/start' && entry.turn === undefined) {
      entry.turn = event.data.turn
      notify(entry.sourceSessionId)
    }
    if (event.type === 'turn/end' && event.data.turn === entry.turn) {
      const reason = event.data.reason
      if (reason.kind === 'interrupted' || reason.kind === 'forked' ||
        (reason.kind === 'aborted' && reason.reason?.kind === 'disposed')) {
        interrupt(entry)
      } else {
        begin(entry, { boundary: event.seq, length: event.seq + 1, endedTurn: event.data.turn, endedAt: event.time })
      }
    }
  }

  function replay(entry, events, agent, restoring) {
    if (!active(entry) || entry.state !== 'waiting') return
    const buffered = entry.buffer
    entry.buffer = undefined
    const { length, start, turn, wait, next } = entry.anchor
    if (events.length < length || (turn !== undefined &&
      (events[start]?.type !== 'turn/start' || events[start].data.turn !== turn))) return interrupt(entry)
    if (!wait) return begin(entry, entry.anchor)
    entry.turn = turn
    for (const event of events.slice(length)) advance(entry, event)
    for (const event of buffered) if (event.seq >= events.length) advance(entry, event)
    if (entry.state !== 'waiting' || next) return
    const attached = ctx.get('agents')?.get(entry.sourceSessionId)
    if (!attached || (agent && attached !== agent)) return interrupt(entry)
    if (attached.status !== 'running') {
      if (!restoring && entry.turn === undefined) begin(entry, entry.anchor)
      else interrupt(entry)
    }
  }

  ctx.on('session/event', (session, event) => {
    const entry = entries.get(session.id)
    if (!entry || !active(entry) || entry.state !== 'waiting' || (event.type !== 'turn/start' && event.type !== 'turn/end')) return
    if (entry.buffer) entry.buffer.push(event)
    else advance(entry, event)
  }, { global: true })

  ctx.on('agent/status', ({ agent, status: next }) => {
    const entry = entries.get(agent.id)
    if (next === 'idle' && entry?.state === 'waiting' && !entry.buffer) {
      if (entry.turn !== undefined) interrupt(entry)
      else if (!entry.anchor.next) begin(entry, entry.anchor)
    }
  }, { global: true })

  ctx.on('agent/disposed', ({ agent }) => {
    const entry = entries.get(agent.id)
    if (entry?.state === 'waiting' && !entry.buffer && (!entry.anchor.next || entry.turn !== undefined)) interrupt(entry)
  }, { global: true })

  function capture(sourceSessionId) {
    if (typeof sourceSessionId !== 'string' || !sourceSessionId || sourceSessionId.length > 512) {
      throw new Error('无法读取原会话。')
    }
    const agent = ctx.get('agents')?.get(sourceSessionId)
    return { agent, length: agent?.session.seq, running: agent?.status === 'running' }
  }

  async function schedule({ sourceSessionId, presetId, title }, { agent, length, running }, requireTurn = false) {
    signal.throwIfAborted()
    if (typeof presetId !== 'string' || !presetId) throw new Error('无法读取所选阵容。')
    const query = ctx.get('sessionQuery')
    if (!query) throw new Error('当前 DSH 无法安排续战。')
    const current = entries.get(sourceSessionId)
    if (current?.cancelling || current?.arming) throw new Error('续战安排正在更新。')
    if (current?.presetId === presetId && !['failed', 'interrupted'].includes(current.state)) return status(sourceSessionId)
    if (current?.state === 'waiting' || current?.state === 'starting') {
      throw new Error('这场对局已经安排了续战。请先处理现有安排。')
    }
    const entry = { id: randomUUID(), sourceSessionId, presetId, title, state: 'waiting', buffer: [], arming: true }
    entries.set(sourceSessionId, entry)
    try {
      const source = await query.observeSession(sourceSessionId, { projectionMode: 'none', signal })
      try {
        if (!active(entry) || entry.state !== 'waiting') return status(sourceSessionId)
        const events = source.events
        const initial = length === undefined ? events : events.slice(0, length)
        const last = initial.findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
        entry.anchor = { boundary: completedBoundary(initial), length: length ?? initial.length,
          wait: running || requireTurn, next: requireTurn && !running,
          ...(running && last?.type === 'turn/start' ? { turn: last.data.turn, start: last.seq } : {}) }
        // Publish the wait to the client only after the selected arrangement is durable.
        await persist(entry)
        entry.arming = false
        await replay(entry, events, agent, false)
        notify(sourceSessionId)
      } finally {
        source[Symbol.dispose]()
      }
    } catch (error) {
      if (active(entry) && entry.state === 'waiting') {
        if (current) entries.set(sourceSessionId, current)
        else entries.delete(sourceSessionId)
        notify(sourceSessionId)
      }
      throw error
    }
    return status(sourceSessionId)
  }

  async function cancel({ sourceSessionId, id }) {
    const entry = entries.get(sourceSessionId)
    if (!entry || entry.id !== id) return status(sourceSessionId)
    if (entry.state === 'starting') throw new Error('续战会话正在准备。')
    if (entry.cancelling) return
    entry.cancelling = true
    return track((async () => {
      try {
        await entry.write?.catch(() => {})
        await rm(join(directory, entryKey(sourceSessionId) + '.json'), { force: true })
        entries.delete(sourceSessionId)
      } finally {
        entry.cancelling = false
        notify(sourceSessionId)
      }
    })())
  }

  function requeue({ sourceSessionId, id }) {
    const entry = entries.get(sourceSessionId)
    if (!entry || entry.id !== id || !['interrupted', 'failed'].includes(entry.state)) {
      throw new Error('此续战安排已变化，请刷新后重试。')
    }
    return schedule(entry, capture(sourceSessionId), true)
  }

  async function restore(warn) {
    const files = await readdir(directory).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return []
    })
    for (const file of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
      try {
        const entry = JSON.parse(await readFile(join(directory, file), 'utf8'))
        validateEntry(entry, file)
        if (entry.state === 'waiting') entry.buffer = []
        entries.set(entry.sourceSessionId, entry)
      } catch {
        warn(file)
      }
    }
    ctx.inject(['agents', 'sessions', 'sessionQuery', 'sessionController', 'workspaceRegistry', 'agentDefaultModel'], () => {
      for (const entry of entries.values()) {
        if (entry.state === 'starting' && !entry.recovering) {
          entry.recovering = true
          run(entry, true)
        } else if (entry.state === 'waiting' && entry.buffer && !entry.recovering) {
          entry.recovering = true
          track((async () => {
            try {
              const source = await ctx.get('sessionQuery').observeSession(entry.sourceSessionId, { projectionMode: 'none', signal })
              try { await replay(entry, source.events, undefined, true) }
              finally { source[Symbol.dispose]() }
            } catch (error) {
              await transition(entry, 'failed', error)
            }
          })())
        }
      }
    })
  }

  return { status, capture, schedule, cancel, requeue, restore, settle: () => Promise.allSettled(jobs) }
}
