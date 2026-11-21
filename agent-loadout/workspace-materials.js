import { randomBytes } from 'node:crypto'
import { readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { workspaceMaterialPath } from './match-comparisons.js'

const pageSize = 48
const searchBudget = 480
const cursorLifetime = 5 * 60_000
const maxCursors = 192
const nameOrder = (left, right) => left < right ? -1 : left === right ? 0 : 1
const browseOrder = (left, right) => nameOrder(left.kind, right.kind) || nameOrder(left.name, right.name)
const searchOrder = (left, right) => nameOrder(right.kind, left.kind) || nameOrder(left.name, right.name)
const normalizeSearch = value => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ')

async function directoryEntries(root, directory, signal, includesPath) {
  const folder = join(root, directory)
  signal?.throwIfAborted()
  if (includesPath && !includesPath(folder)) throw new Error('Directory is outside this file picker')
  // A discovered directory can be replaced by a link before the next page.
  if (await realpath(folder) !== folder) throw new Error('Cannot browse a noncanonical directory')
  const children = await readdir(folder, { withFileTypes: true })
  if (await realpath(folder) !== folder) throw new Error('Directory changed during the read')
  signal?.throwIfAborted()
  return children.flatMap(entry => {
    const kind = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : undefined
    const path = directory ? directory + '/' + entry.name : entry.name
    return kind && workspaceMaterialPath(path) === path && (!includesPath || includesPath(join(folder, entry.name)))
      ? [{ name: entry.name, path, kind }] : []
  })
}

function indexAfter(entries, bookmark, order) {
  if (!bookmark) return 0
  const index = entries.findIndex(entry => order(entry, bookmark) > 0)
  return index < 0 ? entries.length : index
}

async function browse(root, directory, bookmark, signal, includesPath) {
  const children = (await directoryEntries(root, directory, signal, includesPath)).sort(browseOrder)
  const offset = indexAfter(children, bookmark, browseOrder)
  const entries = children.slice(offset, offset + pageSize)
  return { entries, bookmark: offset + entries.length < children.length ? entries.at(-1) : undefined }
}

async function search(root, directory, query, bookmark, signal, includesPath) {
  const words = query.split(' ')
  const frames = bookmark?.map(frame => ({ ...frame })) ?? [{ directory }]
  const entries = []
  let remaining = searchBudget
  while (frames.length && entries.length < pageSize && remaining > 0) {
    const frame = frames.at(-1)
    signal?.throwIfAborted()
    if (!frame.children) {
      try {
        frame.children = (await directoryEntries(root, frame.directory, signal, includesPath)).sort(searchOrder)
        frame.index = indexAfter(frame.children, frame.after, searchOrder)
      } catch (error) {
        signal?.throwIfAborted()
        if (frame.directory === directory) throw error
        frames.pop()
        remaining--
        continue
      }
    }
    if (frame.index === frame.children.length) {
      frames.pop()
      continue
    }
    const entry = frame.children[frame.index++]
    frame.after = entry
    remaining--
    if (entry.kind === 'directory') frames.push({ directory: entry.path })
    else {
      const path = normalizeSearch(entry.path)
      if (words.every(word => path.includes(word))) entries.push(entry)
    }
  }
  while (frames.length) {
    const frame = frames.at(-1)
    if (!frame.children || frame.index < frame.children.length) break
    frames.pop()
  }
  return { entries, bookmark: frames.length ? frames.map(({ directory, after }) => ({ directory, after })) : undefined }
}

export function workspaceMaterialPicker(registry, pathFilter) {
  const cursors = new Map()

  function keepCursor(binding, bookmark) {
    const now = Date.now()
    for (const [key, state] of cursors) {
      if (state.until > now && cursors.size < maxCursors) break
      cursors.delete(key)
    }
    const key = randomBytes(16).toString('hex')
    cursors.set(key, { binding, bookmark, until: now + cursorLifetime })
    return key
  }

  return async function materials({ workspaceId, directory: value = '', query: text = '', cursor }, signal) {
    const workspace = typeof workspaceId === 'string' && workspaceId.length <= 512 && registry()?.get(workspaceId)
    if (!workspace) throw new Error('请选择一个现有的工作区。')
    const directory = value === '' ? '' : workspaceMaterialPath(value)
    if (directory === undefined) throw new Error('目录路径无效，请从工作区重新选择。')
    if (typeof text !== 'string' || text.length > 160) throw new Error('文件搜索内容最多 160 字。')
    const query = normalizeSearch(text)
    const binding = JSON.stringify([workspaceId, workspace.path, directory, query])
    let bookmark
    if (cursor !== undefined) {
      const saved = typeof cursor === 'string' && cursors.get(cursor)
      if (!saved || saved.binding !== binding || saved.until <= Date.now()) throw new Error('文件列表已变化，请重新查找。')
      bookmark = saved.bookmark
    }
    try {
      // The registry stores the real workspace path. Refuse a later replacement of that root by a link.
      if (await realpath(workspace.path) !== workspace.path) throw new Error('Workspace root changed')
      const includesPath = pathFilter && await pathFilter()
      const result = query ? await search(workspace.path, directory, query, bookmark, signal, includesPath)
        : await browse(workspace.path, directory, bookmark, signal, includesPath)
      const next = result.bookmark && keepCursor(binding, result.bookmark)
      return { directory, entries: result.entries, searching: Boolean(query), ...(next && { next }) }
    } catch {
      signal?.throwIfAborted()
      throw new Error('无法打开工作区中的这个目录。')
    }
  }
}
