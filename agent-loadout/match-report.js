import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { sourceConflictCode } from './tool-bindings.js'
import { validShortcut } from './match-shortcuts.js'
import { materialProofRecord } from './match-comparisons.js'

const requestPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const pageSize = 8
export const toolSourceRecord = 'plugin:dsh-agent-loadout/tool-source'
export const panelActivityRecord = 'plugin:dsh-agent-loadout/panel-activity'
const validSourceId = id => typeof id === 'string' && id.length > 0 && id.length <= 512
const terminalTurns = new Set(['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted', 'forked'])
const unfinishedTools = new Set(['ABORTED_BEFORE_DISPATCH', 'TOOL_NOT_STARTED', 'TOOL_OUTCOME_UNKNOWN', 'TOOL_INTERRUPTED', 'TOOL_ABORTED'])

function digest(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function matchReceipts(directory) {
  const known = new Set()
  const writes = new Set()
  let modified

  async function refresh() {
    try {
      const { mtimeNs } = await stat(directory, { bigint: true })
      if (modified === mtimeNs) return
      for (const file of await readdir(directory)) {
        if (!file.endsWith('.json')) continue
        const requestId = file.slice(0, -5)
        if (requestPattern.test(requestId)) known.add(requestId)
      }
      modified = mtimeNs
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      modified = undefined
    }
  }

  async function persist(sessionId, requestId, { text, move }) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const filename = join(directory, requestId + '.json')
    const temp = filename + '.' + randomUUID() + '.tmp'
    const body = JSON.stringify({ sessionId, digest: digest(text), ...move })
    try {
      await writeFile(temp, body, { flag: 'wx', mode: 0o600 })
      try {
        await link(temp, filename)
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        if (await readFile(filename, 'utf8') !== body) throw new Error('操作请求已变化，请重新发送。')
      }
      known.add(requestId)
    } finally {
      await rm(temp, { force: true })
    }
  }

  function record(sessionId, requestId, submission) {
    if (typeof requestId !== 'string' || !requestPattern.test(requestId)) throw new Error('操作请求无效。')
    const writing = persist(sessionId, requestId, submission).finally(() => writes.delete(writing))
    writes.add(writing)
    return writing
  }

  async function find(requestId, uncached = false) {
    if (typeof requestId !== 'string' || !requestPattern.test(requestId) || (!uncached && !known.has(requestId))) return
    const filename = join(directory, requestId + '.json')
    try {
      const data = JSON.parse(await readFile(filename, 'utf8'))
      if (typeof data.sessionId === 'string' && typeof data.digest === 'string'
        && ['gear', 'hero', 'tool', 'quest'].includes(data.kind) && typeof data.id === 'string'
        && typeof data.title === 'string' && typeof data.label === 'string') return data
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
  }

  async function sourceBindings(sessionId, requestId, text) {
    const data = await find(requestId, true)
    if (data?.sessionId !== sessionId || data.digest !== digest(text)) return []
    const binding = data.kind === 'tool' ? data.shortcut : data.kind === 'gear' ? data.sourceBinding : undefined
    const bindings = binding?.id === data.id && validShortcut(binding) ? [binding] : []
    if ((data.kind === 'gear' || data.kind === 'quest') && Array.isArray(data.sourceBindings)) {
      bindings.push(...data.sourceBindings.filter(item => item && validShortcut(item) && item.id.startsWith('tool:')))
    }
    return bindings
  }

  async function confirmedActions(sessionId, messages) {
    const actions = []
    for (const message of messages) {
      const [part] = message.content
      if (message.content.length !== 1 || part?.type !== 'text' || !part.text.startsWith('【')) continue
      const receipt = await find(message.source.rpcId, true)
      if (receipt?.sessionId === sessionId && (receipt.kind === 'hero' || receipt.kind === 'gear' || receipt.kind === 'quest')
        && receipt.digest === digest(part.text)) actions.push(receipt)
    }
    return actions
  }

  return { record, find, sourceBindings, refresh, confirmedActions, settle: () => Promise.allSettled(writes) }
}

export function matchToolRecords(appendRecord, notify) {
  const turns = new WeakMap()
  const teammates = new Map()

  function share(session, hero, delegation) {
    const turn = turns.get(session)
    if (!turn || !delegation) return
    turn.hero = hero
    turn.delegation = delegation
    for (const parentId of delegation.ancestors) {
      if (!teammates.has(parentId)) teammates.set(parentId, new Set())
      teammates.get(parentId).add(session)
    }
  }

  function changed(session, turn) {
    notify(session.id)
    for (const parentId of turn.delegation?.ancestors ?? []) notify(parentId)
  }

  function end(session) {
    const turn = turns.get(session)
    if (!turn) return
    turns.delete(session)
    for (const parentId of turn.delegation?.ancestors ?? []) {
      const children = teammates.get(parentId)
      children.delete(session)
      if (!children.size) teammates.delete(parentId)
    }
    if (turn.running.size || turn.finished) changed(session, turn)
  }

  function observe(session, event) {
    const { type, data } = event
    if (type === 'turn/start') {
      end(session)
      turns.set(session, { pending: new Map(), running: new Map() })
      return
    }
    const turn = turns.get(session)
    if (!turn) return
    if (type === 'turn/end') {
      end(session)
    } else if (type === 'tool/call' || type === 'tool/ptc-dispatch-start') {
      const key = type === 'tool/call' ? 'tool:' + data.callId : 'ptc:' + data.subCallId
      turn.pending.set(key, event)
    } else if (type === 'tool/result' || type === 'tool/ptc-dispatch') {
      const key = type === 'tool/result' ? 'tool:' + data.message.toolCallId : 'ptc:' + data.subCallId
      const call = turn.pending.get(key)
      const activity = turn.running.get(call)
      turn.pending.delete(key)
      if (activity) {
        turn.running.delete(call)
        const outcome = type === 'tool/result' ? data.message : data
        turn.finished = { ...activity, state: outcome.isError ? 'failed' : 'completed', finishedAt: Date.now() }
        changed(session, turn)
      }
    }
  }

  function capture({ agent, callId, name, parent, rootCallId }) {
    const session = agent.session
    const key = (parent === undefined ? 'tool:' : 'ptc:') + callId
    const turn = turns.get(session)
    const call = turn?.pending.get(key)
    if (!call || call.data.name !== name || (parent !== undefined && call.data.rootCallId !== rootCallId)) return
    const isCurrent = () => turns.get(session) === turn && turn.pending.get(key) === call
    return {
      isCurrent,
      begin({ id, sourceId, shortcutKey, sourceName, provider, profile }) {
        if (!isCurrent() || turn.running.has(call)) return
        turn.running.set(call, { seq: call.seq, id, name, sourceId, shortcutKey, sourceName, provider, profile, state: 'running' })
        changed(session, turn)
      },
      record(source) {
        if (isCurrent()) record(session, call, source)
      },
    }
  }

  function activity(session) {
    const turn = turns.get(session)
    if (!turn) return { count: 0, calls: [] }
    const calls = [...turn.running.values()].slice(-8)
    if (turn.finished && Date.now() - turn.finished.finishedAt < 1600) calls.push(turn.finished)
    return { count: turn.running.size, calls }
  }

  function teammateActivity(parentId) {
    return Array.from(teammates.get(parentId) ?? []).flatMap(session => {
      const { running, delegation, hero } = turns.get(session)
      const call = [...running.values()].at(-1)
      if (!call) return []
      return [{ session, hero, count: running.size, call,
        address: { parentSessionId: delegation.ancestors[0], childSessionId: session.id, mode: delegation.mode } }]
    })
  }

  function record(session, call, { id, sourceId, sourceName, blocked, registeredSourceName }) {
    try {
      appendRecord(session, toolSourceRecord, { callSeq: call.seq,
        ...(id ? { id } : {}), ...(typeof sourceName === 'string' ? { sourceName: sourceName.slice(0, 300) } : {}),
        ...(validSourceId(sourceId) ? { sourceId } : {}),
        ...(blocked ? { blocked: true } : {}),
        ...(typeof registeredSourceName === 'string' ? { registeredSourceName: registeredSourceName.slice(0, 300) } : {}) })
    } catch {
      // Session logging is observational and must not change the tool result.
    }
  }

  return { observe, capture, record, activity, share, end, teammateActivity }
}

function answerChoices(message) {
  const text = message.content.find(part => part.type === 'text')?.text
  if (!text || text.length > 16_384) return
  try {
    const { answers } = JSON.parse(text)
    if (!Array.isArray(answers)) return
    const labels = answers.flatMap(answer => Array.isArray(answer?.selected) ? answer.selected : [])
      .filter(label => typeof label === 'string' && label.length <= 200)
    if (labels.length) return labels
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error
  }
}

function settleTool(call, outcome, error, time) {
  if (!outcome.isError) call.state = 'completed'
  else if (error?.code === sourceConflictCode) call.state = 'conflict'
  else call.state = unfinishedTools.has(error?.code) ? 'unfinished' : 'failed'
  if (time !== undefined) call.duration = Math.max(0, time - call.time)
  if (call.name === 'ask_user_question' && call.state === 'completed') call.choices = answerChoices(outcome)
}

function applyToolSource(call, { id, sourceId, sourceName, blocked, registeredSourceName }) {
  if (typeof id === 'string' && /^tool:[a-f0-9]{12}$/.test(id)) call.id = id
  if (blocked === true) {
    if (typeof sourceName === 'string') call.expectedSourceName = sourceName.slice(0, 300)
    if (typeof registeredSourceName === 'string') call.blockedSourceName = registeredSourceName.slice(0, 300)
    return
  }
  if (validSourceId(sourceId)) call.sourceId = sourceId
  if (typeof sourceName !== 'string' || !sourceName) return
  const label = sourceName.slice(0, 300)
  call.sourceNames ??= []
  if (!call.sourceNames.includes(label)) call.sourceNames.push(label)
}

async function reportTurn(source, start, end, receipts) {
  const events = source.events
  const beginning = events[start]
  const calls = new Map()
  const nestedCalls = new Map()
  const callsBySeq = new Map()
  const entries = []
  const pendingActions = []
  let status = source.source === 'live' ? 'running' : 'interrupted'
  let endSeq
  const inherited = start < source.inheritedEventCount
  function addToolCall(name, seq, time, nested = false) {
    const call = { type: 'tool', name, seq, time, state: 'running', ...(nested ? { nested: true } : {}) }
    entries.push(call)
    callsBySeq.set(seq, call)
    return call
  }
  for (let index = start + 1; index < end; index++) {
    const { type, data, seq, time, sourceEventSeqs, ignorable } = events[index]
    if (type === 'turn/end') {
      status = terminalTurns.has(data.reason.kind) ? data.reason.kind : 'ended'
      endSeq = seq
    } else if (type === 'user/message' && data.source.kind === 'user' && data.source.rpcId) {
      pendingActions.push(receipts.find(data.source.rpcId).then(record => {
        if (!record || (record.sessionId !== source.header.id && seq >= source.inheritedEventCount)) return
        const [part] = data.content
        const edited = data.content.length !== 1 || part?.type !== 'text' || digest(part.text) !== record.digest
        const { id, kind, title, label } = record
        entries.push({ type: 'action', id, kind, title, label, seq, edited })
      }))
    } else if (type === 'tool/call') {
      calls.set(data.step + '\0' + data.callId, addToolCall(data.name, seq, time))
    } else if (type === 'tool/result') {
      const call = callsBySeq.get(sourceEventSeqs?.[0]) ?? calls.get(data.step + '\0' + data.message.toolCallId)
      if (call) settleTool(call, data.message, data.error, time)
    } else if (type === 'tool/ptc-dispatch-start') {
      nestedCalls.set(data.subCallId, addToolCall(data.name, seq, time, true))
    } else if (type === 'tool/ptc-dispatch') {
      const started = nestedCalls.get(data.subCallId)
      settleTool(started ?? addToolCall(data.name, seq, time, true), data, data.error, started && time)
    } else if (type === toolSourceRecord && ignorable === true && data && typeof data === 'object') {
      const call = callsBySeq.get(data.callSeq)
      if (call) applyToolSource(call, data)
    }
  }
  await Promise.all(pendingActions)
  if (!entries.length) return
  if (status !== 'running') {
    for (const call of callsBySeq.values()) if (call.state === 'running') call.state = 'unfinished'
  }
  return { seq: start, endSeq, turn: beginning.data.turn, time: beginning.time, inherited, status,
    entries: entries.sort((a, b) => a.seq - b.seq) }
}

export function noteDeliveredFiles(files, { files: delivered, turn }, seq) {
  for (const [index, file] of (delivered ?? []).entries()) {
    if (typeof file.path !== 'string') continue
    const name = basename(file.path.replaceAll('\\', '/')).replace(/\p{Cc}/gu, '').slice(0, 200)
    if (name) files.set(file.path, { name, turn, ...(Number.isSafeInteger(seq) && { seq, index }) })
  }
}

function comparisonQuestions(value, state) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).flatMap(question => {
    if (typeof question?.question !== 'string' || !question.question.trim()) return []
    const options = Array.isArray(question.options) ? question.options.slice(0, 12)
      .flatMap(option => typeof option?.label === 'string' && option.label ? [option.label.slice(0, 200)] : []) : []
    return [{ question: question.question.slice(0, 1000), options, state }]
  })
}

function activeComparisonQuestions(asks, body, live, projection) {
  const active = new Map((projection?.active ?? []).filter(call => asks.has(call.callId)).map(call => [call.callId, call]))
  const results = new Set(body.filter(event => event.type === 'tool/result').map(event => event.data.message.toolCallId))
  return [...asks].flatMap(([callId, call]) => {
    const item = active.get(callId)
    if (item) return comparisonQuestions(item.questions, item.state)
    if (!live || results.has(callId) || typeof call.data.arguments !== 'string' || call.data.arguments.length > 32_000) return []
    try {
      return comparisonQuestions(JSON.parse(call.data.arguments)?.questions, 'open')
    } catch {
      return []
    }
  })
}

function answeredComparisonTurns(events, after, asks, live, presetId, verifyMaterialProof, exactMessages) {
  const turns = []
  let start
  let linked = false
  let unrelated = false
  let proof
  let reason
  let continuationReason
  let selectedPreset = presetId
  for (let index = after; index < events.length; index++) {
    const event = events[index]
    if (event.type === 'turn/start') {
      start = index
      linked = false
      unrelated = false
      proof = undefined
      reason = selectedPreset !== presetId ? 'changed-loadout' : undefined
    } else if (event.type === 'agent-preset/selected') {
      selectedPreset = event.data.agentPreset
      if (start !== undefined && selectedPreset !== presetId) reason = 'changed-loadout'
    } else if (verifyMaterialProof && start !== undefined && event.type === materialProofRecord && event.ignorable === true &&
      event.data.turn === events[start].data.turn && Array.isArray(event.data.replies)) {
      proof = event.data
    } else if (start !== undefined && event.type === 'user/message' && (event.surfaceOp === 'append' || exactMessages)) {
      const { source } = event.data
      if (event.surfaceOp === 'append' && source.kind === 'user-question-reply' && asks.has(source.callId)) {
        linked = true
        if (verifyMaterialProof && (!proof?.replies.includes(source.callId) || proof.state !== 'verified')) {
          reason ??= proof?.state === 'changed' ? 'changed-material' : 'unverified-material'
        }
      } else if (source.kind === 'user' || source.kind === 'user-question-reply' || source.kind === 'agent-message') unrelated = true
    } else if (start !== undefined && event.type === 'turn/end') {
      if (linked && !unrelated && event.data.turn === events[start].data.turn && event.data.reason.kind === 'completed') {
        if (reason) continuationReason ??= reason
        else turns.push([start, index])
      }
      start = undefined
    }
  }
  return { turns, continuationReason, running: live && start !== undefined && linked && !unrelated && (!exactMessages || !reason) }
}

export async function comparisonEvidence(source, { cwd, presetId, task, material, verifyMaterialDelivery,
  verifyMaterialProof = true, exactMessages = !verifyMaterialProof, linkedChoicesOnly = false,
  includeWindows, includeFileCoordinates }, receipts) {
  const unavailable = reason => ({ status: 'unavailable', reason })
  if (source.header.cwd !== cwd || source.header.isSeeded || source.inheritedEventCount !== 0) {
    return unavailable('session-unavailable')
  }
  const events = source.events
  const start = events.findIndex(event => event.type === 'turn/start')
  const beforeTurn = start < 0 ? events : events.slice(0, start)
  const initialPreset = beforeTurn.findLast(event => event.type === 'agent-preset/selected')
  const presetChanged = (initialPreset?.data.agentPreset ?? source.header.agentPreset) !== presetId
  if (start < 0) return { status: 'waiting', ...(presetChanged && { presetChanged: true }) }
  const turn = events[start].data.turn
  const end = events.findIndex((event, index) => index > start && event.type === 'turn/end')
  const body = events.slice(start + 1, end < 0 ? undefined : end)
  if (presetChanged || body.some(event => event.type === 'agent-preset/selected' && event.data.agentPreset !== presetId)) {
    return unavailable('changed-loadout')
  }
  const messages = body.filter(event => event.type === 'user/message' && (event.surfaceOp === 'append' || exactMessages) &&
    (event.data.source.kind === 'user' || (exactMessages && event.data.source.kind === 'agent-message')))
  const content = messages[0]?.data.content
  if (messages.length && (messages.length !== 1 || messages[0].surfaceOp !== 'append' || messages[0].data.source.kind !== 'user' ||
    content?.length !== 1 || content[0].type !== 'text' || content[0].text !== task)) {
    return unavailable('changed-task')
  }
  const live = source.source === 'live'
  if (!messages.length && end < 0 && live) return { status: 'running', turn }
  const finish = events[end]
  if (end >= 0 && (finish.data.turn !== turn || finish.data.reason.kind !== 'completed') || end < 0 && !live) return unavailable('interrupted')
  if (!messages.length) return unavailable('changed-task')
  let materialState
  if (material && verifyMaterialProof) {
    const message = messages[0]
    const proof = body.findLast(event => event.type === materialProofRecord && event.ignorable === true &&
      event.seq < message.seq && event.data.turn === turn && event.data.requestId === (message.data.source.rpcId ?? null))
    materialState = proof?.data.state
    if (materialState !== 'verified') {
      return { ...unavailable(materialState === 'changed' ? 'changed-material' : 'unverified-material'), materialState }
    }
  }
  if (!material && end < 0) return { status: 'running', turn }

  const asks = new Map(material ? body.filter(event => event.type === 'tool/call' && event.data.name === 'ask_user_question')
    .map(event => [event.data.callId, event]) : [])
  const projection = source.projections?.values.userQuestions
  const pendingQuestions = activeComparisonQuestions(asks, body, live && end < 0, projection)
  const followUps = end >= 0 && asks.size ? answeredComparisonTurns(events, end + 1, asks, live, presetId, verifyMaterialProof, exactMessages) : { turns: [] }
  const turns = [[start, end], ...followUps.turns]
  // A settled projection includes replies outside the accepted turns. Only use linked replies in this task.
  const replies = (exactMessages || linkedChoicesOnly) && new Set(turns.flatMap(([from, finish]) => finish < 0 ? []
    : events.slice(from + 1, finish).flatMap(event => event.type === 'user/message' && event.surfaceOp === 'append' &&
      event.data.source.kind === 'user-question-reply' ? [event.data.source.callId] : [])))
  const settled = new Map((projection?.settled ?? []).filter(entry => asks.has(entry.callId) && (!replies || replies.has(entry.callId)))
    .map(entry => [entry.callId, entry.answers]))
  // The host records an in-turn answer in the native tool result. Only a late answer creates a separate user reply.
  if (linkedChoicesOnly) {
    for (const event of body) {
      if (event.type === 'tool/result' && event.surfaceOp === 'append' && event.data.turn === turn && !event.data.message.isError) {
        const { toolCallId } = event.data.message
        if (asks.has(toolCallId)) replies.add(toolCallId)
      }
    }
  }
  const status = pendingQuestions.length ? 'waiting-choice' : end < 0 || followUps.running ? 'running' : 'complete'

  const files = new Map()
  const models = new Set()
  const entries = []
  const windows = []
  for (const [from, finish] of turns) {
    const number = events[from].data.turn
    if (includeWindows && finish >= 0) windows.push({ endSeq: events[finish].seq, turn: number })
    for (const event of events.slice(from + 1, finish < 0 ? undefined : finish)) {
      if (finish >= 0 && event.type === 'deliverables/presented' && event.data.turn === number) {
        noteDeliveredFiles(files, event.data, includeWindows || includeFileCoordinates ? event.seq : undefined)
      }
      if (event.type !== 'request/header') continue
      const { provider, model } = event.data.header?.config ?? {}
      if (typeof model === 'string' && model) models.add(typeof provider === 'string' && provider ? provider + '/' + model : model)
    }
    const evidence = await reportTurn(source, from, finish < 0 ? events.length : finish + 1, receipts)
    for (const { type, name, state, sourceNames, choices, nested, seq } of evidence?.entries ?? []) {
      if (type !== 'tool') continue
      const callId = events[seq]?.data.callId
      const answer = name === 'ask_user_question' && settled.get(callId)
      const selected = answer && answer.flatMap(item => item.selected ?? []).filter(label => typeof label === 'string' && label.length <= 200)
      const linkedReply = exactMessages && selected?.length && state === 'unfinished'
      const recordedChoices = !linkedChoicesOnly || replies?.has(callId) ? choices : undefined
      entries.push({ type, name, state: linkedReply ? 'completed' : state, sourceNames, choices: selected?.length ? selected : recordedChoices, nested })
    }
  }
  const materialDelivered = verifyMaterialDelivery && [...files.keys()].some(file => resolve(cwd, file) === resolve(cwd, material))
  return { status, turn, entries, deliverables: [...files.values()], ...(models.size && { models: [...models] }),
    ...(verifyMaterialDelivery && { materialDelivered }),
    ...(materialState && { materialState }), ...(pendingQuestions.length && { pendingQuestions }),
    ...(followUps.continuationReason && { continuationReason: followUps.continuationReason }), ...(includeWindows && { windows }) }
}

function recordedHandoffTool(events, call) {
  const source = events.findLast(event => event.type === toolSourceRecord && event.ignorable === true &&
    event.data.callSeq === call.seq && event.data.blocked !== true)?.data
  if (source?.id && validSourceId(source.sourceId)) return { tool: call.data.name, id: source.id, sourceId: source.sourceId }
}

export function observedTextHandoff(events, turn, binding) {
  if (!binding) return false
  const body = events.filter(event => event.data?.turn === turn)
  const reads = new Set(body.flatMap(event => {
    if (event.type !== 'tool/call' || event.data.name !== binding.tool) return []
    const recorded = recordedHandoffTool(events, event)
    return recorded?.id === binding.id && recorded.sourceId === binding.sourceId ? [event.data.callId] : []
  }))
  const result = body.find(event => event.type === 'tool/result' && event.surfaceOp === 'append' &&
    !event.data.message.isError && reads.has(event.data.message.toolCallId))
  return Boolean(result && body.some(event => event.type === 'assistant/message' && event.surfaceOp === 'append' &&
    event.seq > result.seq && event.data.message.source.kind === 'model' &&
    event.data.message.content.some(part => part.type === 'text' && part.text.trim())))
}

function findOriginalDelivery(body, calls, results, cwd, material) {
  const presented = new Set(results.filter(({ data }) => calls.get(data.message.toolCallId)?.data.name === 'present')
    .map(({ data }) => data.message.toolCallId))
  return body.find(event => event.type === 'deliverables/presented' && presented.has(event.data.callId) &&
    event.data.files.some(file => typeof file.path === 'string' && resolve(cwd, file.path) === resolve(cwd, material)))
}

export function observedMaterialDelivery(events, turn, cwd, material) {
  const body = events.filter(event => event.data?.turn === turn)
  const calls = new Map(body.filter(event => event.type === 'tool/call').map(event => [event.data.callId, event]))
  const results = body.filter(event => event.type === 'tool/result' && event.surfaceOp === 'append' && !event.data.message.isError)
  const original = findOriginalDelivery(body, calls, results, cwd, material)
  if (original) return recordedHandoffTool(events, calls.get(original.data.callId))
}

export function observedHeroHandoff(events, turn, cwd, material, contents, bindingArm) {
  const body = events.filter(event => event.data?.turn === turn)
  const calls = new Map(body.filter(event => event.type === 'tool/call').map(event => [event.data.callId, event]))
  const results = body.filter(event => event.type === 'tool/result' && event.surfaceOp === 'append' && !event.data.message.isError)
  const fullCard = contents.trimEnd().split('\n').filter(Boolean)
  const read = results.find(({ data }) => {
    const tool = calls.get(data.message.toolCallId)?.data.name
    if (tool !== 'read' && tool !== 'bash') return false
    if (tool === 'read' && data.meta?.path && resolve(cwd, data.meta.path) !== resolve(cwd, material)) return false
    const text = data.message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    return fullCard.every(line => text.includes(line))
  })
  const original = findOriginalDelivery(body, calls, results, cwd, material)
  const summary = body.filter(event => event.type === 'assistant/message' && event.surfaceOp === 'append' &&
    (!read || event.seq > read.seq) &&
    event.data.message.source.kind === 'model').flatMap(({ data }) =>
    data.message.content.filter(part => part.type === 'text' && part.text.trim()).map(part => part.text.trim()))
    .at(-1)?.slice(0, 1800)
  const originalFile = original && {
    name: basename(material), seq: original.seq,
    index: original.data.files.findIndex(file => typeof file.path === 'string' && resolve(cwd, file.path) === resolve(cwd, material)),
  }
  const result = { materialRead: Boolean(read), originalAttached: Boolean(original), originalFile, ...(summary && { summary }) }
  if (!bindingArm || !read) return result
  const readCall = calls.get(read.data.message.toolCallId)
  const presentCall = original && calls.get(original.data.callId)
  const stockCalls = bindingArm === 'standard' && readCall?.data.name === 'read' && presentCall ? [readCall, presentCall]
    : bindingArm === 'minimal' && readCall?.data.name === 'bash' && !original ? [readCall] : undefined
  if (!stockCalls) return result
  // Tool attribution is written as a separate record without a turn field.
  const bindings = stockCalls.map(call => recordedHandoffTool(events, call))
  return bindings.every(Boolean) ? { ...result, bindings } : result
}

export async function matchReport(source, before, receipts) {
  const events = source.events
  if (before !== undefined && (!Number.isSafeInteger(before) ||
    !['turn/start', 'command/run', 'compaction/end', panelActivityRecord].includes(events[before]?.type))) {
    throw new Error('找不到这页对局记录。')
  }
  await receipts.refresh()
  const turns = []
  const commands = []
  const panelActivities = []
  const compactions = []
  const result = () => ({ turns, ...(commands.length && { commands }), ...(panelActivities.length && { panelActivities }),
    ...(compactions.length && { compactions }) })
  const outcomes = new Map()
  const limit = before ?? events.length
  let end = events.length
  let last
  for (let index = events.length - 1; index >= 0; index--) {
    const { type, data, time, seq } = events[index]
    let turn
    let command
    let panel
    let compaction
    if (type === 'command/done') {
      outcomes.set(data.commandId, data.kind)
    } else if (type === 'command/run') {
      const outcome = outcomes.get(data.commandId)
      outcomes.delete(data.commandId)
      if (index >= limit) continue
      const inherited = index < source.inheritedEventCount
      const pending = source.source === 'live' && !inherited ? 'running' : 'unfinished'
      command = { seq, name: data.name, time, inherited, state: outcome === 'success' ? 'completed' : outcome ? 'failed' : pending }
    } else if (type === panelActivityRecord && events[index].ignorable === true && index < limit
      && typeof data?.name === 'string' && data.name.length <= 48 && typeof data?.source === 'string' && data.source.length <= 300) {
      panel = { seq, name: data.name, source: data.source, time, inherited: index < source.inheritedEventCount }
    } else if (type === 'compaction/end' && index < limit) {
      compaction = { seq, time, state: data.error === undefined ? 'completed' : 'failed', inherited: index < source.inheritedEventCount }
    } else if (type === 'turn/start') {
      if (index < limit) turn = await reportTurn(source, index, end, receipts)
      end = index
    }
    if (!turn && !command && !panel && !compaction) continue
    if (turns.length + commands.length + panelActivities.length + compactions.length === pageSize) {
      return { ...result(), nextBefore: last }
    }
    if (turn) turns.push(turn)
    else if (command) commands.push(command)
    else if (panel) panelActivities.push(panel)
    else compactions.push(compaction)
    last = index
  }
  return result()
}
