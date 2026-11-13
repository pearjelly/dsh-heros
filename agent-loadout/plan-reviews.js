import { createHash } from 'node:crypto'
import { profileProviderActive } from './tool-origins.js'

const original = Symbol.for('cordis.original')
const planNote = {
  id: 'send-plan-note', name: '提交计划批注', detail: '在计划评审中选中原文，添加并发送批注。',
  component: 'PlanNoteComposer',
}

function declaration(pkg) {
  const row = pkg.manifest?.dsh?.loadout?.planReview
    ?? (pkg.name === 'dsh-plan-note' && pkg.manifest?.version === '0.1.2' ? planNote : undefined)
  if (!row || typeof row.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(row.id)
    || typeof row.component !== 'string' || !/^[a-zA-Z_$][\w$]{0,63}$/.test(row.component)
    || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 48) return
  return { id: row.id, name: row.name.trim(), component: row.component,
    detail: typeof row.detail === 'string' && row.detail.length <= 160 ? row.detail.trim() : undefined }
}

function feedbackDigest(question, answer) {
  const items = answer?.answers
  const item = Array.isArray(items) && items.length === 1 && items[0]
  if (!item || item.id !== question.id || !Array.isArray(item.selected) || item.selected.length !== 1
    || item.selected[0] === question.intent.approve || !Array.isArray(question.options)
    || !question.options.some(option => option.label === item.selected[0])
    || typeof item.custom !== 'string' || !item.custom.trim()) return
  return createHash('sha256').update(JSON.stringify([item.id, item.selected, item.custom])).digest('hex')
}

export function planReviewActivities(ctx) {
  const reviews = new WeakMap()
  const declarations = new WeakMap()

  function sources() {
    const result = new Map()
    for (const entry of ctx.loader.entries()) {
      if (!entry.options.name || entry.options.group || !profileProviderActive(entry)) continue
      const module = entry.options.name
      const fiber = entry.fiber
      let cached = declarations.get(entry)
      if (cached?.module !== module || cached.fiber !== fiber) {
        let source
        try {
          const pkg = ctx.pluginPackages.packageOf(module, entry.parent.tree.ctx.baseUrl)
          const activity = pkg?.manifest?.dsh?.client && declaration(pkg)
          if (activity) source = { entry, packageName: pkg.name, activity }
        } catch {
          // Optional review metadata leaves the native composer in charge.
        }
        cached = { module, fiber, source }
        declarations.set(entry, cached)
      }
      const source = cached.source
      if (source) result.set(source.packageName, result.has(source.packageName) ? null : source)
    }
    return new Map([...result].filter(([, source]) => source))
  }

  async function observe(session, callId, question, ask) {
    let calls = reviews.get(session)
    if (!calls) reviews.set(session, calls = new Map())
    const proof = {}
    calls.set(callId, proof)
    if (calls.size > 12) calls.delete(calls.keys().next().value)
    try {
      const answer = await ask()
      proof.digest = feedbackDigest(question, answer)
      if (proof.digest) proof.time = Date.now()
      return answer
    } finally {
      if (!proof.digest && calls.get(callId) === proof) calls.delete(callId)
    }
  }

  if (!('userQuestions.ask' in ctx)) {
    ctx.accessor('userQuestions.ask', {
      get(receiver) {
        const service = receiver?.[original]
        if (!service) return
        const method = Reflect.get(service, 'ask', receiver)
        if (typeof method !== 'function') return method
        return function(request, ...args) {
          const ask = () => Reflect.apply(method, this, [request, ...args])
          const question = request?.questions?.length === 1 && request.questions[0]
          const callId = question?.intent?.kind === 'plan-review' && question.intent.callId
          const session = request?.agent?.session
          return session && typeof callId === 'string' && sources().size ? observe(session, callId, question, ask) : ask()
        }
      },
    })
  }

  function confirm(session, callId, digest, complete) {
    const calls = reviews.get(session)
    const proof = calls?.get(callId)
    if (!proof) return { accepted: false }
    if (!proof.digest) return { pending: true }
    if (Date.now() - proof.time > 30_000) {
      calls.delete(callId)
      return { accepted: false }
    }
    if (proof.digest !== digest || !complete(proof.time)) return { accepted: false }
    calls.delete(callId)
    return { accepted: true }
  }

  return { sources, confirm }
}
