import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { comparisonIdValid, workspaceMaterialPath } from './match-comparisons.js'

const planKey = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const requestHash = /^[a-f0-9]{64}$/
export const planTaskSessionId = /^session-a076[a-f0-9]{28}$/u

export function planTaskPrompt({ material: value, task }, english) {
  const material = workspaceMaterialPath(value)
  if (!material) throw new Error('请选择工作区内的普通文件，填写相对路径。')
  if (typeof task !== 'string' || !task.trim() || task.length > 1200) throw new Error('请输入 1 到 1200 字的新任务。')
  const brief = task.trim()
  return { material, task: english
    ? `[Loadout task]\nSelected material: ${JSON.stringify(material)}\n${brief}\nUse the current loadout’s workflow for this task in this conversation.`
    : `【出装任务】\n选定材料 ${JSON.stringify(material)}\n${brief}\n在本对话中，按当前出装的工作流程处理。` }
}

function metadata({ name, note = '' }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 48) {
    throw new Error('请输入 1 到 48 字的方案名称。')
  }
  if (typeof note !== 'string' || note.length > 240) throw new Error('使用说明最多 240 字。')
  return { name: name.trim(), note: note.trim() }
}

function evidenceOrigin(value) {
  if (comparisonIdValid(value?.comparisonId) && (value.arm === 'baseline' || value.arm === 'rematch')) {
    return { comparisonId: value.comparisonId, arm: value.arm }
  }
}

function handoffOrigin(value) {
  if (typeof value?.sessionId === 'string' && planTaskSessionId.test(value.sessionId) &&
    (value.style === 'direct' || value.style === 'review')) {
    return { sessionId: value.sessionId, style: value.style }
  }
}

function webPilotOrigin(value) {
  if (value?.personal === true) {
    if (typeof value.sessionId === 'string' && /^session-a077[a-f0-9]{28}$/.test(value.sessionId) &&
      ['standard', 'evidence'].includes(value.arm) && value.received === undefined) {
      return { sessionId: value.sessionId, arm: value.arm, personal: true }
    }
    return
  }
  if (typeof value?.sessionId === 'string' && planTaskSessionId.test(value.sessionId) &&
    value.personal === undefined && (value.arm === 'standard' || value.arm === 'evidence') &&
    (value.received === undefined || value.received === true)) {
    return { sessionId: value.sessionId, arm: value.arm, ...(value.received && { received: true }) }
  }
}

function webPilotSaveRequest(value) {
  if (typeof value?.key === 'string' && typeof value.digest === 'string' &&
    requestHash.test(value.key) && requestHash.test(value.digest)) {
    return { key: value.key, digest: value.digest }
  }
}

export async function openBuildPlans(directory, saveEntry, warnings) {
  const plans = new Map()
  let writes = Promise.resolve()
  const files = await readdir(directory).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return []
  })
  for (const file of files) {
    const id = file.endsWith('.json') ? file.slice(0, -5) : ''
    if (!planKey.test(id)) continue
    try {
      const record = JSON.parse(await readFile(join(directory, file), 'utf8'))
      if (record.id !== id || !planKey.test(record.revision) || !Number.isSafeInteger(record.updatedAt) ||
        ![record.presetId, record.heroId, record.heroName].every(value => typeof value === 'string' && value)) {
        throw new Error('Invalid build plan')
      }
      const { evidenceOrigin: storedOrigin, handoffOrigin: storedHandoff, webPilotOrigin: storedPilot,
        webPilotSaveRequest: storedSave, ...plan } = record
      const origin = evidenceOrigin(storedOrigin)
      const handoff = handoffOrigin(storedHandoff)
      const pilot = webPilotOrigin(storedPilot)
      const saveRequest = webPilotSaveRequest(storedSave)
      const fields = metadata(plan)
      if ((storedOrigin !== undefined && !origin) || (storedHandoff !== undefined && !handoff) ||
        (storedPilot !== undefined && !pilot) || (storedSave !== undefined && !saveRequest)) warnings.push(file)
      plans.set(id, { ...plan, ...fields, ...(origin && { evidenceOrigin: origin }), ...(handoff && { handoffOrigin: handoff }),
        ...(pilot && { webPilotOrigin: pilot }), ...(saveRequest && { webPilotSaveRequest: saveRequest }) })
    } catch {
      warnings.push(file)
    }
  }

  function serialize(write) {
    const next = writes.then(write)
    writes = next.catch(() => {})
    return next
  }

  function requireCurrent(id, revision) {
    const current = plans.get(id)
    if (!current || current.revision !== revision) throw new Error('方案已在其他窗口更新，请重新打开出装方案。')
    return current
  }

  function write(selection, draftHeroId, resolveDraft, makeSaveRequest) {
    return serialize(async () => {
      const fields = metadata(selection)
      const saveRequest = makeSaveRequest?.(fields)
      if (saveRequest) {
        const saved = [...plans.values()].find(plan => plan.webPilotSaveRequest?.key === saveRequest.key)
        if (saved) {
          if (saved.webPilotOrigin && saved.webPilotSaveRequest.digest === saveRequest.digest) return saved
          throw new Error('方案已在其他窗口更新，请重新打开出装方案。')
        }
      }
      const current = selection.id === undefined ? undefined : requireCurrent(selection.id, selection.revision)
      const updating = selection.draft !== undefined
      if (current && updating && current.heroId !== draftHeroId) throw new Error('请选择同一位英雄来更新出装。')
      const nameKey = fields.name.normalize('NFKC').toLowerCase()
      if ([...plans.values()].some(plan => plan.id !== current?.id && plan.heroId === (current?.heroId ?? draftHeroId) &&
        plan.name.normalize('NFKC').toLowerCase() === nameKey)) {
        throw new Error('这个英雄已有同名方案。')
      }
      const target = current && !updating ? current : await resolveDraft()
      const { presetId, heroId, heroName } = target
      const origin = evidenceOrigin(target.evidenceOrigin)
      const handoff = handoffOrigin(target.handoffOrigin)
      const pilot = webPilotOrigin(target.webPilotOrigin)
      const request = saveRequest ?? current?.webPilotSaveRequest
      const record = { id: current?.id ?? randomUUID(), revision: randomUUID(), ...fields,
        presetId, heroId, heroName, updatedAt: Date.now(), ...(origin && { evidenceOrigin: origin }),
        ...(handoff && { handoffOrigin: handoff }), ...(pilot && { webPilotOrigin: pilot }),
        ...(request && { webPilotSaveRequest: request }) }
      await saveEntry(directory, record.id, record)
      plans.set(record.id, record)
      return record
    })
  }

  function remove({ id, revision }) {
    return serialize(async () => {
      const record = requireCurrent(id, revision)
      await rm(join(directory, record.id + '.json'), { force: true })
      plans.delete(record.id)
      return { id: record.id }
    })
  }

  return { write, remove, read: requireCurrent, get size() { return plans.size },
    list: () => [...plans.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    settle: () => writes }
}
