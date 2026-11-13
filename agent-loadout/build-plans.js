import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const planKey = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/

function metadata({ name, note = '' }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 48) {
    throw new Error('请输入 1 到 48 字的方案名称。')
  }
  if (typeof note !== 'string' || note.length > 240) throw new Error('使用说明最多 240 字。')
  return { name: name.trim(), note: note.trim() }
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
      plans.set(id, { ...record, ...metadata(record) })
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

  function write(selection, draftHeroId, resolveDraft) {
    return serialize(async () => {
      const fields = metadata(selection)
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
      const record = { id: current?.id ?? randomUUID(), revision: randomUUID(), ...fields,
        presetId, heroId, heroName, updatedAt: Date.now() }
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
