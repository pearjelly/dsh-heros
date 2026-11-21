import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

export const workspaceComparisonArms = ['direct', 'review']
export const planComparisonArms = ['left', 'right']
const rematchBaselineArms = { workspace: workspaceComparisonArms, plans: planComparisonArms, rematch: ['rematch'] }
export const comparisonIdValid = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)
export const materialProofRecord = 'plugin:dsh-agent-loadout/comparison-material'

export function validRematchReference({ kind, comparisonId, arm }) {
  if (kind === 'personal') return arm === 'task' && comparisonIdValid(comparisonId) && comparisonId.startsWith('a076')
  return typeof kind === 'string' && Object.hasOwn(rematchBaselineArms, kind) &&
    rematchBaselineArms[kind].includes(arm) && comparisonIdValid(comparisonId)
}

function comparisonHash(namespace, ...parts) {
  return createHash('sha256').update(JSON.stringify([namespace, ...parts])).digest('hex').slice(0, 32)
}

export async function openMatchComparisons(directory, name, arms, saveEntry, warn, validate = () => true, armsFor = () => arms) {
  const recordDirectory = join(directory, name + 's')
  const records = new Map()
  const members = new Map()
  let latest

  function identity(id, arm) {
    const hash = comparisonHash(name, id, arm, 'draft')
    return { sessionId: 'session-' + comparisonHash(name, id, arm, 'session'),
      requestId: [hash.slice(0, 8), hash.slice(8, 12), '4' + hash.slice(13, 16), '8' + hash.slice(17, 20), hash.slice(20)].join('-') }
  }

  async function readJson(filename) {
    try {
      return JSON.parse(await readFile(filename, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  async function restore(id) {
    const record = await readJson(join(recordDirectory, id + '.json'))
    if (!record) return
    if (record.id !== id || !Number.isSafeInteger(record.createdAt) || typeof record.task !== 'string' ||
      !record.task || record.task.length > 4000 || !validate(record)) throw new Error('Invalid comparison')
    records.set(id, record)
    for (const arm of armsFor(record)) members.set(identity(id, arm).sessionId, { id, arm, task: record.task })
    if (!latest || latest.createdAt < record.createdAt || latest.createdAt === record.createdAt && latest.id < id) latest = record
    return record
  }

  const files = await readdir(recordDirectory).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return []
  })
  for (const file of files) {
    const id = file.endsWith('.json') ? file.slice(0, -5) : ''
    if (!comparisonIdValid(id)) continue
    try {
      await restore(id)
    } catch {
      warn()
    }
  }

  // Native session IDs share a home even when the comparison lives in one profile.
  const launchRecordId = launchId => comparisonHash(name, recordDirectory, launchId)

  async function create(launchId, createFields) {
    const id = launchRecordId(launchId)
    if (records.has(id)) return records.get(id)
    try {
      const fields = await createFields()
      await saveEntry(recordDirectory, id, { ...fields, id, createdAt: Date.now() }, { exclusive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    return restore(id)
  }

  const armDirectory = id => join(recordDirectory, id)
  function latestMatching(predicate) {
    if (!latest || !predicate || predicate(latest)) return latest
    let chosen
    for (const record of records.values()) {
      if (predicate(record) && (!chosen || chosen.createdAt < record.createdAt ||
        chosen.createdAt === record.createdAt && chosen.id < record.id)) chosen = record
    }
    return chosen
  }

  return { arms, armsFor, identity, create, armDirectory, read: id => records.get(id),
    member: id => members.get(id), latest: latestMatching,
    list: () => records.values(),
    readArm: (id, arm) => readJson(join(armDirectory(id), arm + '.json')),
    writeArm: (id, arm, info) => saveEntry(armDirectory(id), arm, info) }
}

export function workspaceMaterialPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\p{Cc}:]/u.test(value)) return
  const normalized = value.trim().replaceAll('\\', '/')
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) return
  return normalized
}

export function workspaceComparisonDraft(english) {
  return english ? 'Read the selected material and prepare a short handoff. Identify what the receiver should check and attach the original file in this conversation when the handoff is ready.'
    : '阅读选定的材料，准备一份简短的交接说明。指出接收人应该核对的内容，并在交付条件满足时，把原文件附到当前对话。'
}

export function workspaceComparisonTask({ material: value, task }, english) {
  const material = workspaceMaterialPath(value)
  if (!material) throw new Error('请选择工作区内的普通文件，填写相对路径。')
  if (task !== undefined && (typeof task !== 'string' || task.length > 1200)) throw new Error('任务说明最多 1200 字。')
  const brief = task?.trim() || workspaceComparisonDraft(english)
  const text = english
    ? `[Workspace comparison]\nSelected material: ${JSON.stringify(material)}\n${brief}\nKeep the original file unchanged. Use the handoff flow of the current loadout in this conversation.`
    : `【工作区同题对照】\n选定材料 ${JSON.stringify(material)}\n${brief}\n保留原文件。按当前出装的交付流程在本对话中完成任务。`
  return { material, task: text }
}

export function validWorkspaceComparison(record) {
  return typeof record.workspaceId === 'string' && Boolean(record.workspaceId) && typeof record.cwd === 'string' &&
    isAbsolute(record.cwd) && workspaceMaterialPath(record.material) === record.material && /^[a-f0-9]{64}$/.test(record.digest)
}

export function validPlanComparison(record) {
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
  return validWorkspaceComparison(record) && hash(record.inputHash) && hash(record.token) &&
    typeof record.brief === 'string' && record.brief.length > 0 && record.brief.length <= 1200 &&
    planComparisonArms.every(arm => {
      const plan = record.plans?.[arm]
      return plan && [plan.id, plan.revision, plan.presetId, plan.heroId, plan.planName, plan.heroName].every(
        value => typeof value === 'string' && Boolean(value)) && /^[a-f0-9]{24}$/.test(plan.identity)
    }) && record.plans.left.id !== record.plans.right.id
}

export function validRematchComparison(record) {
  const { baseline, loadout, edit, change, inputHash, token } = record
  const label = item => item && typeof item.id === 'string' && typeof item.name === 'string' && Boolean(item.name)
  const pinned = item => item && [item.presetId, item.heroId, item.heroName].every(value => typeof value === 'string' && Boolean(value)) &&
    /^[a-f0-9]{24}$/.test(item.identity)
  return validWorkspaceComparison(record) && pinned(baseline) && pinned(loadout) &&
    validRematchReference(baseline) && (baseline.kind !== 'rematch' || baseline.comparisonId !== record.id) &&
    (baseline.kind !== 'personal' || baseline.sessionId === 'session-' + baseline.comparisonId) &&
    /^session-[a-f0-9]{32}$/.test(baseline.sessionId) && /^[a-f0-9]{64}$/.test(inputHash) && /^[a-f0-9]{64}$/.test(token) &&
    edit && change && (edit.addId !== undefined || edit.removeId !== undefined) &&
    (baseline.evidenceReplay === undefined || (baseline.evidenceReplay === true && baseline.kind === 'personal' &&
      baseline.heroId === 'standard' && loadout.heroId === 'standard' && edit.removeId === 'evidence' &&
      edit.addId === undefined && edit.sourceId === undefined)) &&
    (edit.removeId === undefined ? change.removed === undefined : label(change.removed) && change.removed.id === edit.removeId) &&
    (edit.addId === undefined ? change.added === undefined : label(change.added) && change.added.id === edit.addId)
}

export async function digestWorkspaceMaterial(cwd, material, signal) {
  const filename = join(cwd, material)
  if (!(await lstat(filename)).isFile()) throw new Error('Not a regular file')
  const resolved = await realpath(filename)
  const fromWorkspace = relative(cwd, resolved)
  if (!fromWorkspace || fromWorkspace === '..' || fromWorkspace.startsWith('..' + sep) || isAbsolute(fromWorkspace)) {
    throw new Error('Material is outside the workspace')
  }
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile()) throw new Error('Not a regular file')
    const hash = createHash('sha256')
    for await (const chunk of file.createReadStream({ autoClose: false, signal })) hash.update(chunk)
    const after = await file.stat({ bigint: true })
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error('Material changed while reading')
    }
    return hash.digest('hex')
  } finally {
    await file.close()
  }
}

export async function workspaceMaterialState({ cwd, material, digest }, signal) {
  try {
    return await digestWorkspaceMaterial(cwd, material, signal) === digest ? 'verified' : 'changed'
  } catch {
    signal?.throwIfAborted()
    return 'unavailable'
  }
}
