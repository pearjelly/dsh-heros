import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

function targetKey(kind, id) {
  if (!['hero', 'gear'].includes(kind) || typeof id !== 'string' || !id || id.length > 512) {
    throw new Error('找不到对应的英雄或装备。')
  }
  return createHash('sha256').update(JSON.stringify([kind, id])).digest('hex').slice(0, 32)
}

function revisionOf(record) {
  return record ? createHash('sha256').update(JSON.stringify(record)).digest('hex').slice(0, 24) : ''
}

function field(value, limit, label, optional = false) {
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || value.length > limit || (!optional && !value.trim())) {
    throw new Error(label + '需要填写有效内容，最多 ' + limit + ' 字。')
  }
  return value.trim()
}

function normalizeActions(actions, existing, loading = false) {
  if (!Array.isArray(actions)) throw new Error('自定义操作的格式无效。')
  const known = new Set(existing?.actions.map(action => action.id))
  const used = new Set()
  return actions.map(action => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('自定义操作的格式无效。')
    const id = action.id ?? (loading ? undefined : randomUUID())
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || used.has(id)
      || (!loading && action.id !== undefined && !known.has(id))) {
      throw new Error('自定义操作已变化，请重新打开设置。')
    }
    used.add(id)
    if (action.requiresInput !== undefined && typeof action.requiresInput !== 'boolean') {
      throw new Error('补充材料设置无效。')
    }
    return {
      id,
      name: field(action.name, 48, '操作名称'),
      detail: field(action.detail, 160, '操作说明', true),
      instruction: field(action.instruction, 4000, '会话指令'),
      requiresInput: Boolean(action.requiresInput),
    }
  })
}

export async function customActionStore(directory, saveEntry, warnings) {
  const stored = new Map()
  const writes = new Map()
  let entries
  try {
    entries = await readdir(directory)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    entries = []
  }
  for (const file of entries.filter(file => /^[a-f0-9]{32}\.json$/.test(file))) {
    try {
      const { kind, id, title, actions } = JSON.parse(await readFile(join(directory, file), 'utf8'))
      const key = targetKey(kind, id)
      if (file !== key + '.json' || typeof title !== 'string') throw new Error('Invalid action record')
      stored.set(key, { kind, id, title, actions: normalizeActions(actions, undefined, true) })
    } catch {
      warnings.push(file)
    }
  }

  function read(kind, id) {
    const record = stored.get(targetKey(kind, id))
    return { revision: revisionOf(record), actions: record?.actions ?? [] }
  }

  function write({ kind, id, actions, revision }, title) {
    const key = targetKey(kind, id)
    const saving = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const previous = stored.get(key)
      if (revision !== revisionOf(previous)) throw new Error('自定义操作已在其他窗口更新，请重新读取。')
      const record = { kind, id, title, actions: normalizeActions(actions, previous) }
      await saveEntry(directory, key, record)
      stored.set(key, record)
      return read(kind, id)
    }).finally(() => {
      if (writes.get(key) === saving) writes.delete(key)
    })
    writes.set(key, saving)
    return saving
  }

  return {
    read, write,
    entries: () => [...stored.values()].filter(record => record.actions.length > 0),
    settle: () => Promise.allSettled(writes.values()),
  }
}
