import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const thresholds = [0, 24, 60, 120, 210, 330]
const badges = { 3: '熟练', 5: '精通', 6: '大师' }
const rewards = { hero: 12, tool: 8, plugin: 4, delivery: 30, heroDelivery: 40, teamDelivery: 40, trial: 24, actionTrial: 32,
  comboHero: 24, comboGear: 16, comboActionGear: 8, stagedGear: 16, relayHero: 24, relayGear: 16, firstRelayGear: 32 }
const stagedLevel = 3
const relayGearLevel = 3
const signatureRules = { level: 3, uses: 3 }
const recentLimit = 64
const settlementPageSize = 5
const archiveName = /^(\d+)(?:-(\d+))?-([a-f0-9]{64})\.json$/

function receiptKey(id) {
  return createHash('sha256').update(id).digest('hex')
}

export function nativeTrialKey(gearId, kind, actionId, sourceId) {
  return 'native:' + createHash('sha256').update(JSON.stringify([gearId, kind, actionId, sourceId])).digest('hex')
}

export function nativeOperationKey(kind, actionId, sourceId) {
  return nativeTrialKey(null, kind, actionId, sourceId)
}

function questComplete(quest) {
  return quest?.completed !== undefined || Boolean(quest?.nativeProof || quest?.teamTask?.proof)
}

function teamTaskKey(sessionId, taskId) {
  return JSON.stringify([sessionId, taskId])
}

function trialProof(quest) {
  const action = quest.trialAction
  if (!action) return
  return action.kind ? { name: action.name, kind: action.kind, proof: quest.nativeProof }
    : { name: action.name, turn: quest.completed }
}

function flagKey(hero, pair) {
  return createHash('sha256').update(JSON.stringify([hero.id, ...pair.map(item => item.id).sort()])).digest('hex')
}

export function questToolSource(item) {
  if (item?.kind === 'tool' && knownToolSource(item.sourceId)) return item.sourceId
}

function sourceFlagKey(combinationId, pair) {
  const sources = pair.filter(questToolSource).map(item => [item.id, item.sourceId]).sort(([a], [b]) => a.localeCompare(b))
  return sources.length ? createHash('sha256').update(JSON.stringify(['source', combinationId, sources])).digest('hex') : combinationId
}

function comboFlagGroup(state, combinationId) {
  return Object.values(state.flags).filter(flag => flag.id === combinationId || flag.combinationId === combinationId)
}

function comboExperience(group, slot) {
  const first = group.length === 0
  const extra = slot && !group.some(flag => flag[slot]) ? slot === 'stagedAction' ? rewards.stagedGear : rewards.comboActionGear : 0
  return { heroXp: first ? rewards.comboHero : 0, gearXp: (first ? rewards.comboGear : 0) + extra }
}

function comboReward(quest, state) {
  const existing = state.flags[quest.flagId]
  const action = quest.comboAction
  const slot = action?.staged ? 'stagedAction' : action ? 'comboAction' : undefined
  if (existing && (!slot || existing[slot])) {
    const previous = slot ? existing[slot] : existing
    return { flag: 'record', heroXp: 0, gearXp: 0,
      existing: { id: existing.id, title: previous.title ?? existing.title, sessionId: previous.sessionId ?? existing.sessionId } }
  }
  return { flag: existing ? 'upgrade' : 'unlock',
    ...comboExperience(comboFlagGroup(state, quest.combinationId ?? quest.flagId), slot) }
}

function teamFlagKey(leaderId, workerId) {
  return createHash('sha256').update(JSON.stringify(['team', ...[leaderId, workerId].sort()])).digest('hex')
}

function flagHeroes(flag) {
  return flag.teamwork ? [flag.hero.id, flag.teamwork.hero.id] : [flag.hero.id]
}

function withoutProfileEntries({ profileEntries, shortcutKey, shortcut, ...item }) {
  return item
}

function rank(xp = 0) {
  const index = thresholds.findLastIndex(threshold => xp >= threshold)
  const badgeLevel = [6, 5, 3].find(level => index + 1 >= level)
  return { xp, level: index + 1, floor: thresholds[index], next: thresholds[index + 1], badge: badges[badgeLevel] }
}

function rankedItem(records, id) {
  const item = Object.hasOwn(records, id) ? records[id] : undefined
  return { ...rank(item?.xp), ...(item?.frame && { frame: item.frame }) }
}

function addXp(records, { shortcutKey, shortcut, ...item }, amount) {
  const previous = rankedItem(records, item.id)
  const next = rank(previous.xp + amount)
  const { sourceId, sourceName, activity, ...logicalItem } = item
  records[item.id] = { ...logicalItem, xp: next.xp, ...(previous.frame && { frame: previous.frame }) }
  return { ...item, xp: amount, level: next.level, previousXp: previous.xp, totalXp: next.xp,
    ...(next.level > previous.level ? { leveled: true } : {}) }
}

function knownToolSource(id) {
  return typeof id === 'string' && Boolean(id) && id !== 'profile'
}

function creditToolSource(records, item, amount) {
  const { id, sourceId, sourceName } = item
  const sources = Object.hasOwn(records, id) ? records[id] : {}
  const previous = rankedItem(sources, sourceId)
  const next = rank(previous.xp + amount)
  records[id] = { ...sources, [sourceId]: { xp: next.xp } }
  return { sourceId, sourceName, level: next.level, totalXp: next.xp,
    ...(next.level > previous.level && { previousLevel: previous.level }) }
}

function recoverToolSources(receipts) {
  const records = Object.create(null)
  for (const receipt of receipts) {
    if (receipt.quest || !Number.isSafeInteger(receipt.turn)) continue
    for (const award of receipt.awards) {
      if (award.kind === 'tool' && knownToolSource(award.sourceId) && award.xp === rewards.tool) {
        creditToolSource(records, award, award.xp)
      }
    }
  }
  return records
}

function receiptSources(item) {
  if (item.kind !== 'tool') return []
  return Array.isArray(item.usedSources) ? item.usedSources : [knownToolSource(item.sourceId) ? item : item.sourceMastery]
}

function receiptProof(receipt) {
  return { sessionId: receipt.sessionId, ...(Number.isFinite(receipt.time) && { time: receipt.time }),
    ...(Number.isSafeInteger(receipt.turn) && { turn: receipt.turn }), ...(receipt.delegation && { delegation: receipt.delegation }) }
}

function noteHeroGear(records, receipt) {
  if (receipt?.quest || !Array.isArray(receipt?.awards)) return
  const round = Number.isSafeInteger(receipt.turn)
  const heroId = round ? receipt.awards.find(item => item && !item.kind)?.id : receipt.heroId
  if (!heroId || (!round && !receipt.command && !receipt.panelAction && !receipt.compaction)) return
  const used = receipt.awards.filter(item => item?.kind && typeof item.id === 'string' && item.xp > 0)
  if (!used.length) return
  const gear = { ...(Object.hasOwn(records, heroId) ? records[heroId] : undefined) }
  const proof = receiptProof(receipt)
  for (const item of used) {
    const previous = Object.hasOwn(gear, item.id) ? gear[item.id] : undefined
    const latest = !previous || (proof.time ?? 0) >= (previous.last.time ?? 0)
    const sources = { ...previous?.sources }
    const confirmed = round ? receiptSources(item) : []
    for (const source of confirmed) {
      if (!knownToolSource(source?.sourceId)) continue
      const before = Object.hasOwn(sources, source.sourceId) ? sources[source.sourceId] : undefined
      const latestSource = !before || (proof.time ?? 0) >= (before.time ?? 0)
      const time = latestSource ? proof.time : before.time
      const name = (latestSource ? source.sourceName : before.name) ?? before?.name
      const last = latestSource ? proof : before.last
      sources[source.sourceId] = { rounds: (before?.rounds ?? 0) + 1,
        ...(time !== undefined && { time }), ...(name && { name }), ...(last && { last }) }
    }
    gear[item.id] = { id: item.id, kind: item.kind, name: latest ? item.name : previous.name,
      rounds: (previous?.rounds ?? 0) + Number(round), actions: (previous?.actions ?? 0) + Number(!round),
      last: latest ? proof : previous.last, sources }
  }
  records[heroId] = gear
}

function journalLeg({ hero, sessionId, turn }) {
  return { hero, sessionId, turn }
}

function roundEquipment(receipt) {
  if (!receipt || receipt.quest || !Number.isSafeInteger(receipt.turn)) return []
  return receipt.awards.filter(item => item.kind === 'tool' || item.kind && item.activity?.length)
}

function nativeReceiptAction(receipt) {
  if (receipt?.nativeTrialKeys) return receipt.awards[0]?.activity?.[0]
}

function roundHero(receipt) {
  if (!receipt?.quest && Number.isSafeInteger(receipt?.turn)) {
    return receipt.awards?.find(item => item && !item.kind && typeof item.id === 'string' && item.xp > 0)
  }
}

function questRoundNumber(receipt) {
  if (receipt.comboAction?.proof) return
  return receipt.turn ?? receipt.trialAction?.turn ?? receipt.heroAction?.turn
    ?? receipt.comboAction?.turn ?? receipt.relay?.at(-1)?.turn ?? receipt.flag?.turn
}

function followUpItem({ id, name, kind, sourceId, sourceName }) {
  return { id, name, kind, sourceId, sourceName }
}

function provenRoundGear(receipt) {
  const gear = roundEquipment(receipt)
  const providers = new Set(gear.flatMap(item => receiptSources(item).filter(Boolean).map(source => source.sourceId)))
  return gear.filter(item => item.kind === 'tool' || !providers.has(item.id) ||
    item.activity?.some(event => event.kind !== 'provider'))
}

function provenGear(item, evidence, awards) {
  const activity = awards.flatMap(award => award.activity ?? []).map(({ kind, name }) => ({ kind, name }))
  const sources = awards[0] !== item && questToolSource(item) ? [item] : awards.flatMap(receiptSources).filter(Boolean)
  return { ...followUpItem(item), evidence, ...(activity.length && { activity }),
    ...(item.kind === 'tool' && { sources: sources.filter(source => knownToolSource(source.sourceId))
      .map(({ sourceId, sourceName }) => ({ sourceId, sourceName })) }) }
}

function provenEvidence(item, awards, move) {
  if (item.kind === 'tool') return 'tool'
  const activity = awards.flatMap(award => award.activity ?? [])
  if (move || activity.some(event => event.kind !== 'provider')) return 'action'
  return activity.length ? 'provider' : 'ready'
}

function provenTurn(receipt) {
  if (!receipt) return
  const prefix = receipt.sessionId + ':'
  const seq = receipt.id.startsWith(prefix) ? receipt.id.slice(prefix.length) : ''
  const endSeq = /^\d+$/.test(seq) ? Number(seq) : undefined
  if (Number.isSafeInteger(endSeq)) return { turn: receipt.turn, endSeq }
}

function comboMove(quest) {
  const combo = quest?.comboAction
  return combo?.staged && !quest.comboFirst ? combo.prepare : combo
}

function nativeMove(quest) {
  const move = quest?.trialAction ?? comboMove(quest)
  if (move?.kind) return move
}

function actionTarget(quest) {
  if (quest?.heroAction) return { kind: 'hero', id: quest.hero.id, key: quest.heroAction.key }
  if (quest?.trialAction) return { kind: 'gear', id: quest.gear.id, key: quest.trialAction.key }
  const action = comboMove(quest)
  if (action) return { kind: 'gear', id: action.gearId, key: action.key }
}

function comboSupport(quest) {
  return quest.pair.find(item => item.id !== quest.comboAction.gearId)
}

function questTaskDetails(quest) {
  const target = actionTarget(quest)
  const support = quest.comboAction?.staged && !quest.comboFirst && !target ? comboSupport(quest) : undefined
  return { quest, target, support }
}

function comboProof(quest) {
  const move = quest.comboAction
  return move && { name: move.name, gearId: move.gearId, turn: quest.completed,
    ...(move.kind && { kind: move.kind, proof: quest.nativeProof }),
    ...(move.staged && { staged: true, first: quest.comboFirst }),
    ...(move.prepare && { prepare: { name: move.prepare.name, gearId: move.prepare.gearId,
      ...(move.prepare.kind && { kind: move.prepare.kind }) } }) }
}

function performed(actions, quest, target) {
  return actions.some(receipt => receipt.kind === target.kind && receipt.id === target.id
    && (receipt.questId ?? receipt.trialId) === quest.id && (receipt.proofKey ?? receipt.trialKey) === target.key)
}

function equipmentReady(item, turn, activeProfile, allowProfile) {
  if (item.kind === 'tool') return Boolean(toolOrderFor(item, turn))
  return turn.gear.has(item.id) || turn.ready.has(item.id)
    || (allowProfile && item.profileEntries?.some(id => activeProfile?.has(id)))
}

function toolOrderFor(item, turn) {
  const order = turn.toolOrder.get(item.id)
  const source = questToolSource(item)
  return source ? order?.sources.get(source) : order
}

function usedDifferentSource(item, turn) {
  return questToolSource(item) && turn.toolOrder.get(item.id)?.sources.size > 0 && !toolOrderFor(item, turn)
}

function journalReceipt({ id, sessionId, title, time, awards, flag, relay, relayGear, trialAction, heroAction, comboAction, pair, comboRepeat, practiceFlagId,
  teamTask, teamwork, flagUpgrade }, quest) {
  const heroAward = awards.find(item => !item.kind)
  const hero = relay?.at(-1)?.hero ?? quest?.hero ?? flag?.hero ?? (heroAward && { id: heroAward.id, name: heroAward.name })
  return { id, sessionId, title, settledAt: time, hero,
    mode: quest?.mode ?? (relay ? 'relay' : flag || comboRepeat ? 'combo' : heroAward ? 'delivery' : 'trial'),
    awards: awards.map(({ id, name, kind, sourceId, xp, level, leveled, activity }) =>
      ({ id, name, kind, sourceId, xp, level, leveled, activity })),
    flagId: flag?.id, relay: relay && { first: journalLeg(relay[0]), second: journalLeg(relay[1]) }, relayGear,
    previousSessionId: quest?.previousSessionId, trialAction, heroAction, comboAction, teamTask, teamwork, flagUpgrade,
    ...(pair && { gear: pair }), ...(comboRepeat && { comboRepeat }), ...(practiceFlagId && { practiceFlagId }),
  }
}

export async function openMatchGrowth(directory, saveEntry, notify, warn, { confirmedActions, profileGear }) {
  const turns = new WeakMap()
  let data = { version: 1, heroes: {}, gear: {}, toolSources: {}, heroGear: {}, signatures: {}, sessions: {}, flags: {}, display: {}, questHistory: {},
    nativeTrials: {}, teamClaims: {}, recent: [], archivedThrough: 0 }
  let invalid = false
  let version = 0
  let writes = Promise.resolve()
  let heroGearReady = Promise.resolve()
  let heroRoundsReady
  try {
    const saved = JSON.parse(await readFile(join(directory, 'progress.json'), 'utf8'))
    const tables = [saved?.heroes, saved?.gear, saved?.sessions, saved?.flags ?? {}, saved?.display ?? {},
      saved?.questHistory ?? {}, saved?.nativeTrials ?? {}, saved?.teamClaims ?? {}, saved?.toolSources ?? {}, saved?.heroGear ?? {},
      saved?.signatures ?? {}]
    const archivedThrough = saved?.archivedThrough ?? 0
    if (saved?.version !== 1 || !tables.every(table => table && typeof table === 'object' && !Array.isArray(table))
      || !Array.isArray(saved.recent) || !Number.isSafeInteger(archivedThrough) || archivedThrough < 0) throw new Error('Invalid growth record')
    const questHistory = saved.questHistory ?? Object.fromEntries(saved.recent.filter(receipt => receipt.quest)
      .map(receipt => [receipt.id, journalReceipt(receipt)]))
    data = { ...saved, flags: saved.flags ?? {}, display: saved.display ?? {}, questHistory, nativeTrials: saved.nativeTrials ?? {},
      teamClaims: saved.teamClaims ?? {}, toolSources: saved.toolSources ?? recoverToolSources(saved.recent),
      heroGear: saved.heroGear ?? {}, signatures: saved.signatures ?? {}, archivedThrough }
    if (saved.heroGear == null) {
      heroGearReady = recoverHeroGear(data).then(heroGear => { data = { ...data, heroGear } })
    }
  } catch (error) {
    if (error.code !== 'ENOENT') { invalid = true; warn(error) }
  }

  function update(edit) {
    const next = writes.then(async () => {
      if (invalid) throw new Error('成长记录暂时无法读取。')
      await heroGearReady
      const copy = table => Object.assign(Object.create(null), table)
      const draft = { ...data, heroes: copy(data.heroes), gear: copy(data.gear), toolSources: copy(data.toolSources),
        heroGear: copy(data.heroGear), signatures: copy(data.signatures), sessions: copy(data.sessions), flags: copy(data.flags),
        display: copy(data.display), recent: [...data.recent] }
      const result = await edit(draft)
      if (!result) return
      // Commit the archive boundary with XP so readers can ignore staged files after a failed save.
      for (const receipt of draft.recent.slice(recentLimit).reverse()) {
        await archiveReceipt(receipt, ++draft.archivedThrough)
      }
      if (draft.recent.length > recentLimit) draft.recent.length = recentLimit
      await saveEntry(directory, 'progress', draft)
      data = draft
      version++
      notify()
      return result
    })
    writes = next.catch(() => {})
    return next
  }

  function sessionData(sessionId) {
    return Object.hasOwn(data.sessions, sessionId) ? data.sessions[sessionId] : undefined
  }

  function recordSettlement(draft, receipt, heroes) {
    noteHeroGear(draft.heroGear, receipt)
    const awards = new Map(receipt.awards.filter(item => item.kind).map(item => [item.id, item]))
    const eligible = new Map(heroes.filter(hero => hero?.id).map(hero => [hero.id, hero]))
    const promotedGear = [...awards.values()].filter(item => Number.isSafeInteger(item.previousXp) &&
      rank(item.previousXp).level < signatureRules.level && item.level >= signatureRules.level).map(item => item.id)
    if (promotedGear.length) {
      for (const [id, gear] of Object.entries(draft.heroGear)) {
        if (eligible.has(id) || !promotedGear.some(item => Object.hasOwn(gear, item))) continue
        const name = Object.hasOwn(draft.heroes, id) ? draft.heroes[id].name : undefined
        eligible.set(id, { id, name: name ?? id })
      }
    }
    const signatures = [...eligible.values()].flatMap(hero => {
      if (rankedItem(draft.heroes, hero.id).level < signatureRules.level) return []
      const promoted = rankedItem(data.heroes, hero.id).level < signatureRules.level
      const after = Object.hasOwn(draft.heroGear, hero.id) ? draft.heroGear[hero.id] : {}
      const before = Object.hasOwn(data.heroGear, hero.id) ? data.heroGear[hero.id] : {}
      return Object.values(after).flatMap(item => {
        if ((!promoted && !awards.has(item.id)) || !signatureProgress(hero.id, item, draft).ready) return []
        const previous = Object.hasOwn(before, item.id) ? before[item.id] : undefined
        if (previous && signatureProgress(hero.id, previous, data).ready) return []
        const award = awards.get(item.id)
        const usedHere = item.last.sessionId === receipt.sessionId && item.last.time === receipt.time && !receipt.quest
        const recorded = usedHere ? award?.sourceId ?? award?.sourceMastery?.sourceId : undefined
        const sourceId = item.kind === 'tool' && (recorded && Object.hasOwn(item.sources, recorded) ? recorded
          : Object.keys(item.sources).sort((a, b) => (item.sources[b].time ?? 0) - (item.sources[a].time ?? 0))[0])
        const source = sourceId && item.sources[sourceId]
        return [{ hero: { id: hero.id, name: hero.name }, ...followUpItem(item),
          ...(source && { sourceId, sourceName: source.name }) }]
      })
    })
    draft.recent.unshift(signatures.length ? { ...receipt, signatures } : receipt)
  }

  function visibleReceipt(receipt, sessionId) {
    return receipt.sessionId === sessionId || receipt.delegation?.ancestors.includes(sessionId)
  }

  function archiveDirectory(sessionId) {
    return join(directory, 'settlements', receiptKey(sessionId))
  }

  const heroRoundsDirectory = join(directory, 'hero-rounds')
  const heroArchive = heroId => join(heroRoundsDirectory, receiptKey(heroId))

  function indexHeroRound(receipt, order) {
    const hero = roundHero(receipt)
    if (hero) {
      return saveEntry(heroArchive(hero.id), order + '-' + receiptKey(receipt.id),
        { sessionId: receipt.sessionId, turn: receipt.turn })
    }
  }

  async function archiveReceipt(receipt, order) {
    const views = new Set([receipt.sessionId, ...(receipt.delegation?.ancestors ?? [])])
    const key = receiptKey(receipt.id)
    const locations = [...views].map(sessionId => {
      const ownedRound = sessionId === receipt.sessionId && !receipt.quest && Number.isSafeInteger(receipt.turn)
      const filename = order + (ownedRound ? '-' + receipt.turn : '') + '-' + key
      return saveEntry(archiveDirectory(sessionId), filename, receipt)
    })
    await Promise.all([...locations, indexHeroRound(receipt, order)])
  }

  async function archiveEntriesAt(folder, boundary) {
    if (!boundary) return []
    const files = await readdir(folder).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    return files.flatMap(filename => {
      const match = archiveName.exec(filename)
      if (!match || Number(match[1]) < 1 || Number(match[1]) > boundary) return []
      return [{ filename, order: Number(match[1]), turn: match[2] === undefined ? undefined : Number(match[2]), key: match[3] }]
    }).sort((a, b) => b.order - a.order)
  }

  function archiveEntries(sessionId, boundary) {
    return archiveEntriesAt(archiveDirectory(sessionId), boundary)
  }

  async function readArchived(sessionId, entry) {
    if (!entry) return
    const receipt = JSON.parse(await readFile(join(archiveDirectory(sessionId), entry.filename), 'utf8'))
    if (!visibleReceipt(receipt, sessionId) || receiptKey(receipt.id) !== entry.key) throw new Error('这条结算记录暂时无法读取。')
    return receipt
  }

  async function recoverHeroGear({ archivedThrough, sessions, recent }) {
    const records = Object.create(null)
    if (archivedThrough) {
      for (const sessionId of Object.keys(sessions)) {
        const entries = await archiveEntries(sessionId, archivedThrough).catch(error => { warn(error); return [] })
        for (const entry of entries) {
          try {
            const receipt = await readArchived(sessionId, entry)
            if (receipt.sessionId === sessionId) noteHeroGear(records, receipt)
          } catch (error) {
            warn(error)
          }
        }
      }
    }
    for (const receipt of recent) noteHeroGear(records, receipt)
    return records
  }

  async function heroEquipment(heroId) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    await heroGearReady
    if (!Object.hasOwn(data.heroGear, heroId)) return []
    return Object.values(data.heroGear[heroId]).sort((a, b) => (b.last.time ?? 0) - (a.last.time ?? 0)
      || (b.rounds + b.actions) - (a.rounds + a.actions) || a.name.localeCompare(b.name, 'zh-CN'))
  }

  async function equipmentHeroes(ids, sourceIdentity = id => id) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    await heroGearReady
    const heroes = []
    for (const [heroId, gear] of Object.entries(data.heroGear)) {
      const matches = ids.filter(id => Object.hasOwn(gear, id)).map(id => gear[id])
      if (!matches.length) continue
      let rounds = 0
      let actions = 0
      let last
      const sources = Object.create(null)
      for (const item of matches) {
        rounds += item.rounds
        actions += item.actions
        if (!last || (item.last.time ?? 0) > (last.time ?? 0)) last = item.last
        for (const [sourceId, source] of Object.entries(item.sources)) {
          const id = sourceIdentity(sourceId)
          const previous = sources[id]
          const latest = !previous || (source.time ?? 0) > (previous.time ?? 0)
          sources[id] = { ...(latest ? source : previous), rounds: (previous?.rounds ?? 0) + source.rounds }
        }
      }
      const name = Object.hasOwn(data.heroes, heroId) ? data.heroes[heroId].name : undefined
      heroes.push({ hero: { id: heroId, name: name ?? heroId, rank: heroRank(heroId) }, rounds, actions, last, sources })
    }
    return heroes.sort((a, b) => (b.last.time ?? 0) - (a.last.time ?? 0) ||
      b.rounds + b.actions - (a.rounds + a.actions) || a.hero.name.localeCompare(b.hero.name, 'zh-CN'))
  }

  async function recoverHeroRounds({ sessions, archivedThrough }) {
    if (!archivedThrough) return
    try {
      const index = JSON.parse(await readFile(join(heroRoundsDirectory, 'index.json'), 'utf8'))
      if (index?.version === 1 && Number.isSafeInteger(index.through) && index.through > 0 && index.through <= archivedThrough) return
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
    for (const sessionId of Object.keys(sessions)) {
      for (const entry of await archiveEntries(sessionId, archivedThrough)) {
        if (entry.turn === undefined) continue
        const receipt = await readArchived(sessionId, entry).catch(error => { warn(error) })
        if (receipt?.sessionId === sessionId && receipt.turn === entry.turn) await indexHeroRound(receipt, entry.order)
      }
    }
    await saveEntry(heroRoundsDirectory, 'index', { version: 1, through: archivedThrough })
  }

  async function heroArchiveEntries(heroId, boundary) {
    heroRoundsReady ??= recoverHeroRounds(data).catch(error => { heroRoundsReady = undefined; throw error })
    await heroRoundsReady
    return archiveEntriesAt(heroArchive(heroId), boundary)
  }

  async function readHeroArchive(heroId, entry) {
    const { sessionId, turn } = JSON.parse(await readFile(join(heroArchive(heroId), entry.filename), 'utf8'))
    if (typeof sessionId !== 'string' || !sessionId || !Number.isSafeInteger(turn)) throw new Error('找不到这条实战记录。')
    const filename = [entry.order, turn, entry.key].join('-') + '.json'
    const receipt = await readArchived(sessionId, { filename, key: entry.key })
    if (receipt.sessionId !== sessionId || receipt.turn !== turn || roundHero(receipt)?.id !== heroId) throw new Error('找不到这条实战记录。')
    return receipt
  }

  async function equipmentSourceProof(heroId, ids, sourceId, sourceIdentity = id => id) {
    const heroes = await equipmentHeroes(ids, sourceIdentity)
    const source = heroes.find(row => row.hero.id === heroId)?.sources[sourceId]
    if (!source || source.last) return source?.last
    const { recent, archivedThrough } = data
    const fits = receipt => roundHero(receipt)?.id === heroId &&
      (source.time === undefined || receipt.time === source.time) && receipt.awards.some(item => ids.includes(item.id) &&
        receiptSources(item).some(entry => knownToolSource(entry?.sourceId) && sourceIdentity(entry.sourceId) === sourceId))
    const current = recent.find(fits)
    if (current) return receiptProof(current)
    if (archivedThrough) {
      for (const entry of await heroArchiveEntries(heroId, archivedThrough)) {
        const receipt = await readHeroArchive(heroId, entry)
        if (fits(receipt)) return receiptProof(receipt)
      }
    }
  }

  async function heroRounds(heroId, before) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new Error('找不到这页实战记录。')
    const { recent, archivedThrough } = data
    const limit = before ?? Infinity
    const page = recent.map((receipt, index) => ({ receipt, order: archivedThrough + recent.length - index }))
      .filter(({ receipt, order }) => order < limit && roundHero(receipt)?.id === heroId).slice(0, settlementPageSize + 1)
    if (page.length <= settlementPageSize && archivedThrough) {
      const older = (await heroArchiveEntries(heroId, archivedThrough))
        .filter(entry => entry.order < limit).slice(0, settlementPageSize + 1 - page.length)
      for (const entry of older) page.push({ entry, order: entry.order })
    }
    const receipts = await Promise.all(page.slice(0, settlementPageSize).map(row => row.receipt ?? readHeroArchive(heroId, row.entry)))
    return { before: page.length > settlementPageSize ? page[settlementPageSize - 1].order : undefined,
      rounds: receipts.map(receipt => ({ id: receipt.id, sessionId: receipt.sessionId, turn: receipt.turn, time: receipt.time,
        delegation: receipt.delegation, xp: roundHero(receipt).xp,
        gear: receipt.awards.filter(item => item.kind).map(({ xp, activity, ...item }) => ({ ...followUpItem(item), xp,
          actions: activity?.filter(event => event.kind === 'action').map(event => event.name) })),
        followUpGear: roundEquipment(receipt).map(followUpItem) })) }
  }

  async function roundForReceipt(receipt, recent, entries) {
    if (!receipt?.quest) return receipt
    const turn = questRoundNumber(receipt)
    if (turn === undefined) return
    const recentRound = recent.find(item => !item.quest && item.sessionId === receipt.sessionId && item.turn === turn)
    return recentRound ?? readArchived(receipt.sessionId, (await entries()).find(entry => entry.turn === turn))
  }

  async function recordedComboMove(gearId, name, sessionId, turn, source) {
    if (typeof sessionId !== 'string' || !Number.isSafeInteger(turn)) return
    const { recent, archivedThrough } = data
    const receipt = await roundForReceipt({ quest: true, sessionId, turn }, recent, () => archiveEntries(sessionId, archivedThrough))
    const award = receipt?.awards.find(item => item.id === gearId && (!source || item.sourceId === source))
    const keys = new Set(award?.activity
      ?.filter(move => move.kind === 'action' && move.name === name && typeof move.proofKey === 'string').map(move => move.proofKey))
    if (keys.size === 1) return keys.values().next().value
  }

  async function recoverFlagPractice(id) {
    const flag = Object.hasOwn(data.flags, id) && data.flags[id]
    const slot = flag?.stagedAction ? 'stagedAction' : 'comboAction'
    const recorded = flag?.[slot]
    if (!recorded || (recorded.key && (!recorded.prepare || recorded.prepareKey))) return
    const { prepare, first } = recorded
    const source = gearId => questToolSource(flag.pair.find(item => item.id === gearId))
    const [key, prepareKey] = await Promise.all([
      recorded.key ?? (!recorded.kind && recordedComboMove(recorded.gearId, recorded.name, recorded.sessionId, recorded.turn, source(recorded.gearId))),
      prepare && (recorded.prepareKey ?? (!prepare.kind && recordedComboMove(prepare.gearId, prepare.name, first?.sessionId, first?.turn, source(prepare.gearId)))),
    ])
    if (!key || (prepare && !prepareKey)) return
    await update(draft => {
      if (draft.flags[id]?.[slot] !== recorded) return
      draft.flags[id] = { ...draft.flags[id], [slot]: { ...recorded, key, ...(prepareKey && { prepareKey }) } }
      return true
    })
  }

  function read(sessionId, heroId) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    const { quest, relayTo, questTo } = sessionData(sessionId) ?? {}
    return { hero: heroRank(heroId), quest: quest && publicQuest(quest), rewards,
      relayTo, questTo,
      gear: Object.values(data.gear).sort((a, b) => b.xp - a.xp).map(item => ({ ...withoutProfileEntries(item), ...rank(item.xp) })),
      recent: data.recent.filter(item => visibleReceipt(item, sessionId)).slice(0, settlementPageSize) }
  }

  function provenComboHero(receipt) {
    if (!receipt?.quest || receipt.pair?.length !== 2 || receipt.teamwork || receipt.relay || !(receipt.flag || receipt.comboRepeat)) return
    const history = Object.hasOwn(data.questHistory, receipt.id) && data.questHistory[receipt.id]
    return receipt.flag?.hero ?? (history?.sessionId === receipt.sessionId && history.mode === 'combo' ? history.hero : undefined)
  }

  function hasProvenLoadout(receipt) {
    return Boolean(provenComboHero(receipt) || roundHero(receipt) && provenRoundGear(receipt).length)
  }

  function ownSettlementHistory(sessionId) {
    const { recent, archivedThrough } = data
    let archived
    const entries = () => archived ??= archiveEntries(sessionId, archivedThrough)
    async function read(receiptId) {
      if (typeof receiptId !== 'string' || !receiptId || receiptId.length > 1024) throw new Error('找不到该回合的结算。')
      const receipt = recent.find(item => item.sessionId === sessionId && item.id === receiptId)
        ?? await readArchived(sessionId, (await entries()).find(entry => entry.key === receiptKey(receiptId)))
      if (receipt?.sessionId === sessionId) return receipt
    }
    return { recent, entries, read }
  }

  async function provenLoadout(sessionId, receiptId) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    const { recent, entries, read } = ownSettlementHistory(sessionId)
    const receipt = await read(receiptId)
    const comboHero = provenComboHero(receipt)
    const hero = comboHero ?? roundHero(receipt)
    if (!hero) return
    const turn = receipt.turn
    if (!comboHero) {
      const gear = provenRoundGear(receipt).map(item => provenGear(item, provenEvidence(item, [item]), [item]))
      if (gear.length) return { id: receipt.id, sessionId, hero, turn, windows: [provenTurn(receipt)].filter(Boolean), kind: 'round', gear }
      return
    }
    const { comboAction } = receipt
    const recordedTurns = new Set()
    if (Number.isSafeInteger(turn) && !comboAction?.proof) recordedTurns.add(turn)
    if (comboAction?.first?.sessionId === sessionId && Number.isSafeInteger(comboAction.first.turn)) {
      recordedTurns.add(comboAction.first.turn)
    }
    const rounds = await Promise.all([...recordedTurns].map(number =>
      roundForReceipt({ quest: true, sessionId, turn: number }, recent, entries)))
    const gear = receipt.pair.map(item => {
      const source = questToolSource(item)
      const awards = rounds.flatMap(round => round?.awards ?? []).filter(award =>
        award.id === item.id && (!source || receiptSources(award).some(used => used?.sourceId === source)))
      const move = [comboAction, comboAction?.prepare].find(action => action?.gearId === item.id)
      const proof = provenGear(item, provenEvidence(item, awards, move), awards)
      if (move && !proof.activity?.some(action => action.name === move.name)) {
        proof.activity = [...(proof.activity ?? []), { kind: move.kind ?? 'action', name: move.name }]
      }
      return proof
    })
    const windows = rounds.map(provenTurn).filter(Boolean)
    return { id: receipt.id, sessionId, hero, title: receipt.title, turn: Number.isSafeInteger(turn) ? turn : undefined,
      windows, kind: comboAction?.staged ? 'staged' : 'combo', gear }
  }

  async function settlements(sessionId, before) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new Error('找不到这页结算记录。')
    const { recent, archivedThrough } = data
    const limit = before ?? Infinity
    let archived
    const entries = () => archived ??= archiveEntries(sessionId, archivedThrough)
    const page = recent.map((receipt, index) => ({ receipt, order: archivedThrough + recent.length - index }))
      .filter(({ receipt, order }) => order < limit && visibleReceipt(receipt, sessionId)).slice(0, settlementPageSize + 1)
    if (page.length <= settlementPageSize) {
      const older = (await entries()).filter(entry => entry.order < limit).slice(0, settlementPageSize + 1 - page.length)
      for (const entry of older) page.push({ entry, order: entry.order })
    }
    const receipts = await Promise.all(page.slice(0, settlementPageSize).map(async row => {
      const stored = row.receipt ?? await readArchived(sessionId, row.entry)
      const { nativeTrialKeys, ...receipt } = stored
      const ownReceipt = receipt.sessionId === sessionId
      const round = ownReceipt ? await roundForReceipt(receipt, recent, entries) : undefined
      const action = ownReceipt && nativeReceiptAction(stored)
      const gear = action ? receipt.awards.filter(item => {
        const key = nativeTrialKeys[item.id]
        return key && !nativeTrialMastered({ kind: action.kind, key })
      }) : roundEquipment(round)
      return { ...receipt, ...(action && { followUpAction: action }), followUpGear: gear.map(followUpItem),
        ...(ownReceipt && hasProvenLoadout(receipt) && { provenLoadout: true }),
        awards: receipt.awards.map(award => ({ ...award,
          ...(Number.isSafeInteger(award.totalXp) && Number.isSafeInteger(award.previousXp)
            ? { before: rank(award.previousXp), after: rank(award.totalXp) } : {}),
        })),
      }
    }))
    return { receipts, before: page.length > settlementPageSize ? page[settlementPageSize - 1].order : undefined }
  }

  async function reportFollowUps(sessionId, endSeqs) {
    if (invalid || !endSeqs.length) return new Map()
    const { recent, archivedThrough } = data
    const receipts = new Map(recent.filter(item => item.sessionId === sessionId).map(item => [item.id, item]))
    let archived
    const read = () => archived ??= archiveEntries(sessionId, archivedThrough)
      .then(entries => new Map(entries.map(entry => [entry.key, entry])))
    const result = await Promise.all(endSeqs.map(async seq => {
      const id = sessionId + ':' + seq
      const receipt = receipts.get(id) ?? await readArchived(sessionId, (await read()).get(receiptKey(id)))
      return [seq, { id, followUpGear: roundEquipment(receipt).map(followUpItem),
        ...(hasProvenLoadout(receipt) && { provenLoadout: true }) }]
    }))
    return new Map(result.filter(([, receipt]) => receipt.followUpGear.length))
  }

  async function followUp(sessionId, receiptId, gearIds) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    const { recent, entries, read } = ownSettlementHistory(sessionId)
    const receipt = await read(receiptId)
    const action = nativeReceiptAction(receipt)
    if (action) {
      if (!Array.isArray(gearIds) || gearIds.length !== 1) throw new Error('请选择一件完成此操作的装备。')
      const item = receipt.awards.find(item => item.id === gearIds[0])
      const key = item && receipt.nativeTrialKeys[item.id]
      if (!key) throw new Error('请选择一件完成此操作的装备。')
      if (nativeTrialMastered({ kind: action.kind, key })) throw new Error('这件装备的此项试炼已领取奖励。')
      return { activity: action, gear: [followUpItem(item)], quest: { mode: 'trial', gearId: item.id, trialActionKey: key } }
    }
    const round = receipt && await roundForReceipt(receipt, recent, entries)
    const used = roundEquipment(round)
    if (!used.length) throw new Error('找不到这回合可带回备战的装备。')
    if (!Array.isArray(gearIds) || gearIds.length < 1 || gearIds.length > 2 || new Set(gearIds).size !== gearIds.length) {
      throw new Error('请选择一到两件不同的装备。')
    }
    const gear = gearIds.map(id => used.find(item => item.id === id))
    if (!gear.every(Boolean)) throw new Error('请选择这回合有实际使用记录的装备。')
    const combo = gear.length === 2
    const staged = combo && !gear.some(item => item.kind === 'tool')
    const operations = gear.flatMap(item => {
      if (combo && !gear.some(other => other !== item && other.kind === 'tool')) return []
      return item.activity?.filter(event => event.kind === 'action' && typeof event.proofKey === 'string') ?? []
    })
    const key = operations.length === 1 ? operations[0].proofKey : undefined
    const hero = roundHero(round)
    return {
      turn: round.turn,
      hero: hero?.name,
      heroId: hero?.id,
      gear: gear.map(followUpItem),
      quest: combo ? { mode: 'combo', gearIds, comboActionKey: key, ...(staged && { staged }) }
        : { mode: 'trial', gearId: gear[0].id, trialActionKey: key },
    }
  }

  function notice(sessionId) {
    if (invalid) return
    const state = sessionData(sessionId)
    const quest = state?.quest
    const receipt = data.recent.find(item => visibleReceipt(item, sessionId))
    const ready = questComplete(quest) && !nativeTrialMastered(quest.trialAction)
      ? { id: quest.id, title: quest.title, turn: quest.completed } : undefined
    if (!receipt && !ready) return
    const heroes = receipt?.awards.filter(item => !item.kind) ?? []
    const hero = heroes.length === 1 ? heroes[0] : undefined
    const gear = receipt?.awards.filter(item => item.kind) ?? []
    const usedGear = receipt && receipt.sessionId === sessionId && !receipt.quest && gear
      .filter(item => item.xp > 0 && (item.kind === 'tool' || item.activity?.length))
      .map(({ id, kind, name, xp, sourceId, sourceName, usedSources }) => ({
        id, kind, name, xp, sourceId, sourceName, usedSources,
      }))
    const promoted = receipt?.awards.filter(item => item.leveled) ?? []
    return { ready, receipt: receipt && {
      id: receipt.id, turn: receipt.turn, command: receipt.command, panelAction: receipt.panelAction, compaction: receipt.compaction,
      title: receipt.title, flag: Boolean(receipt.flag), teammate: receipt.sessionId !== sessionId,
      teamFlag: Boolean(receipt.flag?.teamwork),
      dismissed: state?.seenReceipt === receipt.id,
      flagUpgrade: receipt.flagUpgrade,
      ...(receipt.signatures?.length && { signatures: receipt.signatures.length }),
      ...(receipt.comboRepeat && { comboRepeat: true }),
      relay: receipt.relay ? { count: heroes.length, xp: heroes.reduce((sum, item) => sum + item.xp, 0) } : undefined,
      hero: hero && { id: hero.id, name: hero.name, xp: hero.xp }, gearXp: gear.reduce((sum, item) => sum + item.xp, 0),
      ...(usedGear?.length && { usedGear }),
      promotion: promoted[0] && { name: promoted[0].name, level: promoted[0].level, count: promoted.length },
    } }
  }

  function dismissReceipt(sessionId, id) {
    return update(draft => {
      const receipt = draft.recent.find(item => visibleReceipt(item, sessionId))
      if (!receipt || receipt.id !== id || draft.sessions[sessionId]?.seenReceipt === id) return
      draft.sessions[sessionId] = { ...draft.sessions[sessionId], seenReceipt: id }
      return true
    })
  }

  function publicQuest(quest) {
    return { ...quest, gear: quest.gear && withoutProfileEntries(quest.gear), pair: quest.pair?.map(withoutProfileEntries),
      ...(quest.mode === 'combo' && { comboReward: comboReward(quest, data) }),
      ...(quest.gear && quest.relay?.second && { relayGearXp: relayGearAward(quest, data) }),
      ...(nativeTrialMastered(quest.trialAction) && { mastered: true }) }
  }

  function relayGearAward(quest, state) {
    const first = quest.relay.first.hero.id
    const second = quest.relay.second.hero.id
    const claimed = Object.values(state.questHistory).some(entry => {
      if (entry.relayGear?.id !== quest.gear.id) return false
      const from = entry.relay?.first?.hero.id
      const to = entry.relay?.second?.hero.id
      return (from === first && to === second) || (from === second && to === first)
    })
    return claimed ? rewards.relayGear : rewards.firstRelayGear
  }

  function journal() {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    const active = []
    for (const [sessionId, { quest }] of Object.entries(data.sessions)) {
      if (!quest) continue
      const { id, title, mode, acceptedAt, completed, progress, previousSessionId } = quest
      const runner = quest.relay?.runner
      active.push({ id, sessionId, title, mode, acceptedAt, completed, progress, previousSessionId, hero: runner ?? quest.hero,
        trialAction: trialProof(quest), mastered: nativeTrialMastered(quest.trialAction) || undefined,
        heroAction: quest.heroAction && { name: quest.heroAction.name, turn: completed },
        comboAction: comboProof(quest), teamTask: quest.teamTask,
        gear: (quest.pair ?? (quest.gear ? [quest.gear] : [])).map(withoutProfileEntries),
        relay: runner && { starter: quest.hero, runner, first: quest.relay.first && journalLeg(quest.relay.first),
          second: quest.relay.second && journalLeg(quest.relay.second) },
      })
    }
    active.sort((a, b) => (b.acceptedAt ?? 0) - (a.acceptedAt ?? 0))
    const completed = Object.values(data.questHistory).sort((a, b) => b.settledAt - a.settledAt)
    return { active, completed }
  }

  function blankContinuation(sessionId) {
    return sessionData(sessionId)?.blankContinuation
  }

  function recordBlankContinuation(sessionId, parentId, length) {
    const source = sessionData(parentId)?.quest
    if (!source || source.teamTask || questComplete(source) || source.after > length || blankContinuation(sessionId)) return
    return update(draft => {
      const quest = draft.sessions[parentId]?.quest
      if (!quest || quest.id !== source.id || quest.teamTask || questComplete(quest) || quest.after > length ||
        draft.sessions[sessionId]?.blankContinuation) return
      draft.sessions[sessionId] = { ...draft.sessions[sessionId], blankContinuation: { parentId, length, questId: quest.id } }
      return true
    })
  }

  function questFrom(state, { sessionId, parentId, inherited, hero, createdAt }) {
    const target = Object.hasOwn(state.sessions, sessionId) ? state.sessions[sessionId] : undefined
    const blank = !parentId && target?.blankContinuation
    parentId ??= blank?.parentId
    if (!parentId || parentId === sessionId || !Number.isSafeInteger(inherited) ||
      target?.quest) return
    const quest = Object.hasOwn(state.sessions, parentId) && state.sessions[parentId].quest
    if (!quest || quest.teamTask || questComplete(quest) || nativeTrialMastered(quest.trialAction, state) ||
      (quest.receivedAt ?? quest.acceptedAt ?? 0) > createdAt ||
      (blank && blank.questId !== quest.id)) return
    const first = quest.relay?.first
    if (first ? first.seq >= inherited : (blank?.length ?? inherited) < quest.after || hero.id !== quest.hero.id) return
    return { quest, parentId }
  }

  function continuationOffer(context, describeTask) {
    if (invalid) return
    const source = questFrom(data, context)
    if (!source) return
    const { quest, parentId } = source
    const comboFirst = quest.comboFirst?.seq < context.inherited ? quest.comboFirst : undefined
    return { id: quest.id, title: quest.title, mode: quest.mode, hero: quest.hero, parentId,
      from: quest.relay?.runner ?? quest.hero, firstTurn: quest.relay?.first?.turn,
      nextLeg: Boolean(quest.relay?.first && context.hero.id !== quest.hero.id),
      gear: quest.pair?.map(withoutProfileEntries) ?? (quest.gear ? [withoutProfileEntries(quest.gear)] : quest.mode === 'relay' ? undefined : []),
      trialAction: quest.trialAction, heroAction: quest.heroAction, comboAction: quest.comboAction, comboFirst,
      ...describeTask?.(questTaskDetails(comboFirst === quest.comboFirst ? quest : { ...quest, comboFirst })),
    }
  }

  function relayLoadout(sessionId, id) {
    const quest = sessionData(sessionId)?.quest
    if (quest?.id !== id || !quest?.relay || !quest.gear || questComplete(quest)) {
      throw new Error('接力委托已变化，请回原对局核对。')
    }
    return { title: quest.title, gear: withoutProfileEntries(quest.gear), first: quest.relay.first?.hero }
  }

  function handoff(context, id, verifies, verifiesProgress) {
    return update(draft => {
      const source = questFrom(draft, context)
      if (!source || source.quest.id !== id) throw new Error('原委托已变化，请刷新成长面板。')
      const { quest, parentId } = source
      if (quest.relay?.first && !verifies(quest.relay.first)) throw new Error('续战记录中找不到第一棒的完成回合。')
      const { sessionId, after, hero } = context
      const progress = quest.progress && verifiesProgress(quest.progress) ? { ...quest.progress,
        sessionId: quest.progress.sessionId ?? parentId } : undefined
      const comboFirst = quest.comboFirst && verifies(quest.comboFirst) ? quest.comboFirst : undefined
      const moved = { sessionId, title: quest.title, hero }
      draft.sessions[parentId] = { ...draft.sessions[parentId], quest: undefined,
        relayTo: quest.relay ? moved : undefined, questTo: quest.relay ? undefined : moved }
      draft.sessions[sessionId] = { ...draft.sessions[sessionId], quest: { ...quest, after, progress, comboFirst, receivedAt: Date.now(),
        ...(quest.relay ? { relay: { ...quest.relay, runner: hero } } : { previousSessionId: parentId }) } }
      return { accepted: true }
    })
  }

  function flagFor(heroId) {
    const id = Object.hasOwn(data.display, heroId) && data.display[heroId]
    return id ? data.flags[id] : undefined
  }

  function flags(heroId) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    return Object.values(data.flags).filter(flag => heroId === undefined || flagHeroes(flag).includes(heroId))
      .map(flag => {
        const displayedFor = flagHeroes(flag).filter(id => flagFor(id)?.id === flag.id)
        return { ...flag, displayed: displayedFor.includes(heroId ?? flag.hero.id), ...(flag.teamwork && { displayedFor }) }
      })
      .sort((a, b) => b.earnedAt - a.earnedAt)
  }

  function displayFlag(heroId, id) {
    if (typeof heroId !== 'string' || !heroId || heroId.length > 512 || (id !== null && typeof id !== 'string')) {
      throw new Error('找不到这面战旗。')
    }
    return update(draft => {
      if (id === null) delete draft.display[heroId]
      else {
        if (!Object.hasOwn(draft.flags, id) || !flagHeroes(draft.flags[id]).includes(heroId)) throw new Error('这位英雄尚未解锁该战旗。')
        draft.display[heroId] = id
      }
      return { displayed: id }
    })
  }

  function setFrame(kind, id, frame) {
    if ((kind !== 'hero' && kind !== 'gear') || typeof id !== 'string' || !id || id.length > 512 ||
      !['auto', 'classic', '3', '5', '6'].includes(frame)) throw new Error('找不到对应的熟练度边框。')
    return update(draft => {
      const records = kind === 'hero' ? draft.heroes : draft.gear
      const current = rankedItem(records, id)
      const required = badges[frame] ? Number(frame) : 3
      if (current.level < required) throw new Error('达到 Lv.' + required + ' 后可选择这个边框。')
      if ((current.frame ?? 'auto') === frame) return
      const { frame: _frame, ...item } = records[id]
      records[id] = frame === 'auto' ? item : { ...item, frame }
      return true
    })
  }

  function heroRank(id) { return rankedItem(data.heroes, id) }
  function gearRank(id) { return rankedItem(data.gear, id) }

  function signatureFor(heroId) {
    if (Object.hasOwn(data.signatures, heroId)) return data.signatures[heroId]
  }

  function signatureProgress(heroId, item, state = data) {
    const heroLevel = rankedItem(state.heroes, heroId).level
    const gearLevel = rankedItem(state.gear, item.id).level
    const uses = item.rounds + item.actions
    return { gearLevel, uses, ready: heroLevel >= signatureRules.level && gearLevel >= signatureRules.level && uses >= signatureRules.uses }
  }

  function setSignature(heroId, gearId, sourceId) {
    if (typeof heroId !== 'string' || !heroId || heroId.length > 512 ||
      (gearId !== null && (typeof gearId !== 'string' || !gearId)) ||
      (sourceId !== undefined && !knownToolSource(sourceId))) throw new Error('找不到对应的招牌装备。')
    return update(draft => {
      if (gearId === null) {
        if (!Object.hasOwn(draft.signatures, heroId)) return
        delete draft.signatures[heroId]
        return true
      }
      const records = Object.hasOwn(draft.heroGear, heroId) ? draft.heroGear[heroId] : {}
      const item = Object.hasOwn(records, gearId) ? records[gearId] : undefined
      if (!item || !signatureProgress(heroId, item, draft).ready) throw new Error('这位英雄尚未解锁该招牌装备。')
      if (sourceId && !Object.hasOwn(item.sources, sourceId)) throw new Error('这位英雄尚无该来源的实战记录。')
      const current = draft.signatures[heroId]
      if (current?.id === gearId && current.sourceId === sourceId) return
      draft.signatures[heroId] = { id: gearId, name: item.name, kind: item.kind,
        ...(sourceId && { sourceId, sourceName: item.sources[sourceId].name }) }
      return true
    })
  }

  function toolSourceRank(id, sourceId) {
    if (knownToolSource(sourceId)) return rankedItem(Object.hasOwn(data.toolSources, id) ? data.toolSources[id] : {}, sourceId)
  }
  function toolSourceRanks(id) {
    if (!Object.hasOwn(data.toolSources, id)) return
    return Object.fromEntries(Object.entries(data.toolSources[id]).map(([sourceId, item]) => [sourceId, rank(item.xp)]))
  }

  function nativeTrialMastered(action, state = data) {
    return Boolean(action?.kind && Object.hasOwn(state.nativeTrials, action.key))
  }

  function comboLevelGaps(hero, pair, state) {
    return [hero, ...pair].flatMap((item, index) => {
      const { level, xp } = rankedItem(index === 0 ? state.heroes : state.gear, item.id)
      return level < stagedLevel ? [{ name: item.name, level, xpNeeded: thresholds[stagedLevel - 1] - xp }] : []
    })
  }

  function comboRestriction(hero, pair, flag, slot, state) {
    if (slot === 'stagedAction') {
      if (comboLevelGaps(hero, pair, state).length) return '英雄和两件装备都达到 Lv.' + stagedLevel + ' 后可以分回合连携。'
      if (flag?.stagedAction) return '这面战旗已经记录了分回合连携。'
    } else {
      if (!pair.some(item => item.kind === 'tool')) return '同回合连携至少需要一件工具。'
      if (flag && (!slot || flag.comboAction)) {
        return flag.comboAction ? '这面战旗已经记录了连携操作。' : '这组装备已解锁战旗，指定一次连携操作可升级战旗。'
      }
    }
  }

  function comboPreview(hero, pair, practice) {
    if (invalid) return { modes: [], reason: '成长记录暂时无法读取。' }
    const combinationId = flagKey(hero, pair)
    const flag = data.flags[sourceFlagKey(combinationId, pair)]
    const group = comboFlagGroup(data, combinationId)
    const basic = { id: 'basic' }
    const action = { id: 'action', slot: 'comboAction' }
    const staged = { id: 'staged', slot: 'stagedAction' }
    const moveKeys = { action: [], staged: [] }
    for (const [index, item] of pair.entries()) {
      const other = pair[1 - index]
      for (const move of item.trialActions ?? []) {
        if (other.kind === 'tool' && !move.kind) {
          moveKeys.action.push(move.key)
          action.move ??= { key: move.key, name: move.name, gearName: item.name }
        }
        if (other.kind === 'tool' || other.trialActions?.some(prepare => !prepare.operation || prepare.operation !== move.operation)) {
          moveKeys.staged.push(move.key)
        }
      }
    }
    const modes = [basic, action, staged].map(({ id, slot, move }) => {
      if (practice) {
        const selected = practice.staged ? 'staged' : practice.comboActionKey ? 'action' : 'basic'
        return id === selected ? { id, flag: 'record', heroXp: 0, gearXp: 0 }
          : { id, reason: '复练沿用战旗已记录的连携方式。' }
      }
      const reason = comboRestriction(hero, pair, flag, slot, data) ?? (id === 'action' && !move
        ? '需要一件工具辅助另一件装备完成指定操作。'
        : id === 'staged' && !moveKeys.staged.length ? '当前阵容缺少可搭配的准备和发动操作。' : undefined)
      return reason ? { id, reason } : { id, flag: flag ? 'upgrade' : 'unlock', move, ...comboExperience(group, slot) }
    })
    return { modes, moveKeys, flagId: flag?.id, flagName: flag?.title, levelGaps: comboLevelGaps(hero, pair, data), stagedLevel }
  }

  function flagPractice(id, hero, pair) {
    const flag = typeof id === 'string' && Object.hasOwn(data.flags, id) && data.flags[id]
    if (!flag || flag.teamwork || pair?.length !== 2 || !pair.every(Boolean) ||
      sourceFlagKey(flagKey(hero, pair), pair) !== id) throw new Error('原战旗的英雄或装备来源已变化，请重新核对。')
    const recorded = flag.stagedAction ?? flag.comboAction
    const title = recorded?.title ?? flag.title
    const selection = { mode: 'combo', title, gearIds: pair.map(item => item.id), practiceFlagId: id,
      questSources: Object.fromEntries(pair.filter(questToolSource).map(item => [item.id, item.sourceId])) }
    if (!recorded) return selection
    if (!recorded.key || (recorded.prepare && !recorded.prepareKey)) throw new Error('这面战旗的旧记录缺少可核验的操作。')
    const matches = (gearId, key) => pair.some(item => item.id === gearId && item.trialActions?.some(move => move.key === key))
    if (!matches(recorded.gearId, recorded.key) || (recorded.prepareKey && !matches(recorded.prepare.gearId, recorded.prepareKey))) {
      throw new Error('原连携操作当前不可用，请核对装备配置。')
    }
    return { ...selection, comboActionKey: recorded.key, prepareActionKey: recorded.prepareKey, ...(recorded.staged && { staged: true }) }
  }

  function validateQuest({ title, mode, gear, pair, hero, comboAction, trialAction, practiceFlagId, upgradeFlagId, allowBasicReplay }, state = data) {
    if (invalid) throw new Error('成长记录暂时无法读取。')
    if (typeof title !== 'string' || !title.trim() || title.length > 80) throw new Error('请输入 1 到 80 字的任务目标。')
    if (!['delivery', 'trial', 'combo', 'relay'].includes(mode)) throw new Error('请选择有效的委托类型。')
    if (mode === 'trial' && !gear) throw new Error('请选择一件可参与试炼的装备。')
    if (mode === 'relay' && gear) {
      if (rankedItem(state.gear, gear.id).level < relayGearLevel) throw new Error('装备达到 Lv.' + relayGearLevel + ' 后可以指定接力装备。')
      if (gear.kind === 'tool' && !questToolSource(gear)) throw new Error('请为接力工具选择可核验的来源。')
    }
    if (nativeTrialMastered(trialAction, state)) throw new Error('这件装备的此项试炼已领取奖励。')
    if (mode === 'combo' && (pair?.length !== 2 || !pair.every(Boolean) || pair[0].id === pair[1].id)) throw new Error('请选择两件不同的装备。')
    const combinationId = mode === 'combo' ? flagKey(hero, pair) : undefined
    const flagId = combinationId && sourceFlagKey(combinationId, pair)
    const flag = flagId && state.flags[flagId]
    const basicReplay = allowBasicReplay && mode === 'combo' && !comboAction && flag && !flag.teamwork
    if (upgradeFlagId !== undefined && (upgradeFlagId !== flag?.id || !comboAction || practiceFlagId !== undefined)) {
      throw new Error('升级需要原战旗的英雄、装备来源和新的连携操作。')
    }
    if (practiceFlagId !== undefined) {
      const recorded = flag?.stagedAction ?? flag?.comboAction
      if (practiceFlagId !== flagId || !flag || flag.teamwork || Boolean(recorded) !== Boolean(comboAction) ||
        (recorded && (!recorded.key || recorded.key !== comboAction.key || recorded.gearId !== comboAction.gearId ||
          Boolean(recorded.staged) !== Boolean(comboAction.staged) || recorded.prepareKey !== comboAction.prepare?.key ||
          recorded.prepare?.gearId !== comboAction.prepare?.gearId))) throw new Error('原战旗的英雄、装备来源或操作已变化，请重新核对。')
    }
    if (mode === 'combo') {
      const slot = comboAction?.staged ? 'stagedAction' : comboAction ? 'comboAction' : undefined
      const reason = comboRestriction(hero, pair, practiceFlagId || basicReplay ? undefined : flag, slot, state)
      if (reason) throw new Error(reason)
    }
    return { flagId, combinationId, practiceId: practiceFlagId ?? (basicReplay ? flagId : undefined) }
  }

  function openedWithQuest(sessionId) {
    return Boolean(sessionData(sessionId)?.openingQuestId)
  }

  function openingQuest(sessionId) {
    const state = sessionData(sessionId)
    const quest = state?.quest
    if (quest && quest.id === state.openingQuestId && !questComplete(quest) && !quest.comboFirst && !nativeTrialMastered(quest.trialAction)) {
      return { id: quest.id, title: quest.title, mode: quest.mode, nativeAction: nativeMove(quest)?.name }
    }
  }

  function questTask(sessionId) {
    const quest = sessionData(sessionId)?.quest
    if (!quest || quest.teamTask || questComplete(quest) || nativeMove(quest) ||
      (quest.relay?.first && quest.relay.runner.id === quest.hero.id)) return
    return questTaskDetails(quest)
  }

  function questForAction(sessionId, move) {
    const quest = sessionData(sessionId)?.quest
    const target = actionTarget(quest)
    if (target && !questComplete(quest) && !nativeMove(quest) && move.kind === target.kind &&
      target.id === move.id && target.key === move.proofKey) return quest
  }

  function teamTaskClaimed(sessionId, taskId, state = data) {
    return Object.hasOwn(state.teamClaims, teamTaskKey(sessionId, taskId))
  }

  function teamQuest(sessionId) {
    const quest = sessionData(sessionId)?.quest
    return quest?.teamTask && quest
  }

  function recordTeamTask(sessionId, questId, task, event) {
    return update(draft => {
      const current = draft.sessions[sessionId]
      const quest = current?.quest
      const previous = quest?.teamTask
      if (!previous || quest.id !== questId || previous.id !== task.id || task.revision <= previous.revision || event.seq < quest.after) return
      const teamTask = { ...task, ...(task.status === 'completed' && { proof: { seq: event.seq, time: event.time } }) }
      draft.sessions[sessionId] = { ...current, quest: { ...quest, teamTask } }
      return true
    })
  }

  function accept(sessionId, { title, mode, gear, pair, hero, after, opening, trialAction, heroAction, comboAction, teamTask, brief,
    practiceFlagId, upgradeFlagId, allowBasicReplay }) {
    return update(draft => {
      const previous = Object.hasOwn(draft.sessions, sessionId) ? draft.sessions[sessionId] : undefined
      if (previous?.quest) throw new Error('请先结算或放弃当前委托。')
      if (teamTask && teamTaskClaimed(sessionId, teamTask.id, draft)) throw new Error('这项队伍任务已领取交付奖励。')
      const { flagId, combinationId, practiceId } = validateQuest({ title, mode, gear, pair, hero, comboAction, trialAction,
        practiceFlagId, upgradeFlagId, allowBasicReplay }, draft)
      const quest = { id: randomUUID(), title: title.trim(), mode, gear, pair, flagId, combinationId, hero, after, acceptedAt: Date.now(), trialAction, heroAction,
        comboAction, ...(teamTask && { teamTask }), ...(brief && { brief }), ...(practiceId && { practiceFlagId: practiceId }),
        ...(mode === 'relay' ? { relay: { runner: hero } } : {}) }
      draft.sessions[sessionId] = { ...previous, quest, ...(opening && { openingQuestId: quest.id }) }
      return publicQuest(quest)
    })
  }

  function settleQuest(sessionId, id, claim, rewardGear, verifyTeamTask) {
    return update(async draft => {
      const previous = Object.hasOwn(draft.sessions, sessionId) ? draft.sessions[sessionId] : undefined
      const quest = previous?.quest
      if (!quest || quest.id !== id) throw new Error('这个委托已变化，请刷新后再试。')
      const teamTask = quest.teamTask
      let teamwork
      if (claim && teamTask) {
        if (teamTaskClaimed(sessionId, teamTask.id, draft)) throw new Error('这项队伍任务已领取交付奖励。')
        const verification = teamTask.proof && await verifyTeamTask(quest)
        if (!verification) throw new Error('请先在 DSH 任务板确认这项任务已完成，再验收交付。')
        teamwork = verification.teamwork
      }
      if (claim && nativeTrialMastered(quest.trialAction, draft)) throw new Error('这件装备的此项试炼已领取奖励。')
      if (claim && !questComplete(quest)) throw new Error(nativeMove(quest)
        ? '请先完成委托指定的原生操作。' : '请先完成委托所需的对局回合。')
      const { quest: _quest, ...remaining } = previous
      draft.sessions[sessionId] = remaining
      if (!claim) return { settled: true }
      const time = Date.now()
      let awards
      let flag
      let relay
      let relayGear
      let flagUpgrade
      let pair
      let comboRepeat
      const comboAction = comboProof(quest)
      if (quest.mode === 'relay') {
        const legs = [quest.relay.first, quest.relay.second]
        const target = quest.gear && withoutProfileEntries(quest.gear)
        const selected = Number.isInteger(rewardGear?.leg) && legs[rewardGear.leg]?.gear.find(item => item.id === rewardGear.id)
        if (rewardGear !== undefined && (target || !selected)) throw new Error(target ? '本次接力已指定奖励装备。' : '请选择在接力回合中有记录的装备。')
        awards = legs.map(leg => addXp(draft.heroes, leg.hero, rewards.relayHero))
        if (target) {
          const xp = relayGearAward(quest, draft)
          relayGear = { ...target, xp, first: xp === rewards.firstRelayGear }
          awards.push(addXp(draft.gear, target, xp))
        } else if (selected) awards.push(addXp(draft.gear, selected, rewards.relayGear))
        relay = legs.map(({ hero, sessionId, turn, gear }) => ({ hero, sessionId, turn,
          gear: gear.filter(item => item.kind === 'tool' || item.id === (target ?? selected)?.id) }))
      } else if (quest.mode === 'combo') {
        const { heroXp, gearXp, existing: alreadyAwarded } = comboReward(quest, draft)
        pair = quest.pair.map(withoutProfileEntries)
        if (alreadyAwarded) comboRepeat = alreadyAwarded
        else {
          const existing = draft.flags[quest.flagId]
          const combinationId = quest.combinationId ?? quest.flagId
          flag = existing ?? { id: quest.flagId, hero: quest.hero, pair, title: quest.title,
            sessionId, turn: quest.completed, earnedAt: time, ...(quest.flagId !== combinationId && { combinationId }) }
          if (comboAction) {
            const slot = comboAction.staged ? 'stagedAction' : 'comboAction'
            flag = { ...flag, [slot]: { ...comboAction, sessionId, title: quest.title, key: quest.comboAction.key,
              ...(quest.comboAction.prepare && { prepareKey: quest.comboAction.prepare.key }) } }
          }
          flagUpgrade = Boolean(existing)
          draft.flags[flag.id] = flag
        }
        awards = [...(heroXp ? [addXp(draft.heroes, quest.hero, heroXp)] : []),
          ...(gearXp ? pair.map(item => addXp(draft.gear, item, gearXp)) : [])]
      } else {
        const deliveryXp = teamTask ? rewards.teamDelivery : quest.heroAction ? rewards.heroDelivery : rewards.delivery
        awards = [quest.mode === 'delivery' ? addXp(draft.heroes, quest.hero, deliveryXp)
          : addXp(draft.gear, withoutProfileEntries(quest.gear), quest.trialAction ? rewards.actionTrial : rewards.trial)]
      }
      const trialAction = trialProof(quest)
      if (teamwork) {
        const flagId = teamFlagKey(quest.hero.id, teamwork.hero.id)
        if (!Object.hasOwn(draft.flags, flagId)) {
          flag = { id: flagId, hero: quest.hero, pair: [], title: quest.title, sessionId, earnedAt: time, teamwork }
          draft.flags[flagId] = flag
        }
      }
      if (quest.trialAction?.kind) draft.nativeTrials = { ...draft.nativeTrials, [quest.trialAction.key]: id }
      if (teamTask) draft.teamClaims = { ...draft.teamClaims, [teamTaskKey(sessionId, teamTask.id)]: id }
      const heroAction = quest.heroAction && { name: quest.heroAction.name, turn: quest.completed }
      const receipt = { id, sessionId, title: quest.title, quest: true, turn: quest.completed,
        time, awards, flag, relay, relayGear, trialAction, heroAction, comboAction, teamTask, teamwork, flagUpgrade,
        ...(pair && { pair }), ...(comboRepeat && { comboRepeat }), ...(quest.practiceFlagId && { practiceFlagId: quest.practiceFlagId }) }
      draft.questHistory = { ...draft.questHistory, [id]: journalReceipt(receipt, quest) }
      recordSettlement(draft, receipt, relay ? relay.map(leg => leg.hero) : [quest.hero])
      return { settled: true, flag, flagUpgrade, ...(comboRepeat && { comboRepeat }) }
    })
  }

  function recordEquipmentUse(sessionId, event, { kind, name, actionId = name, sourceId, heroId, delegation }, equipment, profileEntries) {
    const field = { panel: 'panelActivities', command: 'commands', compaction: 'compactions' }[kind]
    const label = { panel: { panelAction: name }, command: { command: name }, compaction: { compaction: name } }[kind]
    return update(async draft => {
      const current = draft.sessions[sessionId]
      const key = JSON.stringify([equipment.id, actionId])
      const earnedUse = current?.[field]?.includes(key)
      const quest = current?.quest
      const action = nativeMove(quest)
      const first = quest?.comboFirst
      const commandId = kind === 'command' ? event.data.commandId : kind === 'compaction' ? event.data.sourceCommandId : undefined
      const canProve = sourceId && action?.kind === kind && !questComplete(quest) &&
        !nativeTrialMastered(quest.trialAction, draft) && quest.hero.id === heroId && event.seq >= quest.after &&
        event.time >= (quest.receivedAt ?? quest.acceptedAt) &&
        (!first || (event.seq > first.seq && event.time >= first.time && (!commandId || first.commandId !== commandId)))
      if (earnedUse && !canProve) return
      const profile = profileEntries && await profileGear(profileEntries)
      const matching = profile?.filter(item => item.profileEntries.includes(equipment.id.slice('host:'.length))) ?? []
      const gear = matching.length ? matching.map(withoutProfileEntries) : [equipment]
      const proven = canProve && gear.some(item => item.id === (action.gearId ?? quest.gear?.id) &&
        action.key === nativeTrialKey(item.id, kind, actionId, sourceId))
      if (earnedUse && !proven) return
      const next = { ...current }
      if (proven) {
        const proof = { seq: event.seq, time: event.time }
        next.quest = quest.comboAction?.staged && !first
          ? { ...quest, progress: undefined, comboFirst: { ...proof, sessionId, kind, name,
            ...(commandId && { commandId }),
            ...(kind === 'compaction' && { compactionId: event.data.compactionId }) } }
          : { ...quest, progress: undefined, nativeProof: proof }
      }
      if (!earnedUse) {
        const awards = gear.map(item => addXp(draft.gear, { ...item, activity: [{ kind, name }] }, rewards.plugin))
        next[field] = [...(current?.[field] ?? []), key]
        const nativeTrialKeys = sourceId && Object.fromEntries(gear.map(item => [item.id, nativeTrialKey(item.id, kind, actionId, sourceId)]))
        const receipt = { id: sessionId + ':' + event.seq, sessionId, heroId, ...label, time: event.time, awards, delegation,
          ...(nativeTrialKeys && { nativeTrialKeys }) }
        const hero = heroId && Object.hasOwn(draft.heroes, heroId) ? draft.heroes[heroId] : undefined
        recordSettlement(draft, receipt, hero ? [{ id: heroId, name: hero.name ?? heroId }] : [])
      }
      draft.sessions[sessionId] = next
      return true
    })
  }

  function useEquipment(turn, item, kind, name, proofKey) {
    const activity = turn.gear.get(item.id)?.activity ?? []
    if (!activity.some(event => event.kind === kind && event.name === name && event.proofKey === proofKey)) {
      activity.push({ kind, name, ...(proofKey && { proofKey }) })
    }
    turn.gear.set(item.id, { ...item, activity })
  }

  function recordTurn(sessionId, turn, end, activeProfile) {
    return update(async draft => {
      const current = Object.hasOwn(draft.sessions, sessionId) ? draft.sessions[sessionId] : undefined
      if (current?.end >= end.seq) return
      let actions = await confirmedActions(sessionId, turn.messages).catch(() => [])
      const profile = new Map()
      if (turn.profileProviders.size || actions.some(action => action.kind === 'gear' && (action.id.startsWith('host:') || action.id.startsWith('bundle:')))) {
        for (const { profileEntries, ...item } of await profileGear(activeProfile).catch(() => [])) {
          profile.set(item.id, item)
          const used = turn.gear.get(item.id)
          if (used) turn.gear.set(item.id, { ...used, name: item.name })
          if (!item.id.startsWith('bundle:')) continue
          for (const id of profileEntries) {
            for (const name of turn.profileProviders.get(id) ?? []) useEquipment(turn, item, 'provider', name)
          }
        }
      }
      actions = actions.filter(action => !action.profileShortcutKey || profile.get(action.id)?.shortcutKey === action.profileShortcutKey)
      for (const action of actions.filter(action => action.kind === 'gear')) {
        const item = turn.ready.get(action.id) ?? profile.get(action.id) ?? turn.gear.get(action.id)
        if (item) useEquipment(turn, item, 'action', action.label, action.proofKey ?? action.trialKey)
      }
      let quest = current?.quest
      const runner = quest?.relay?.runner ?? quest?.hero
      const eligible = quest && !quest.teamTask && !questComplete(quest) && !nativeMove(quest) && runner.id === turn.hero.id &&
        turn.start >= quest.after && (!quest.comboFirst || turn.start > quest.comboFirst.seq)
      if (eligible && quest.mode === 'relay') {
        const first = quest.relay.first
        if (!first || first.hero.id !== turn.hero.id) {
          const target = quest.gear
          const used = target?.kind === 'tool' ? toolOrderFor(target, turn) : target && turn.gear.has(target.id)
          const proof = { sessionId, turn: end.data.turn, seq: end.seq, time: end.time }
          if (target && !used) {
            quest = { ...quest, progress: { ...proof, missing: [target.id],
              ...(usedDifferentSource(target, turn) && { sourceMismatch: [target.id] }) } }
          } else {
            const gear = [...turn.gear.values()].map(item => withoutProfileEntries(item.id === target?.id && target.kind === 'tool'
              ? { ...item, sourceId: target.sourceId, sourceName: used.sourceName ?? target.sourceName } : item))
            const leg = { ...proof, hero: turn.hero, gear }
            quest = first ? { ...quest, progress: undefined, completed: end.data.turn, relay: { ...quest.relay, second: leg } }
              : { ...quest, progress: undefined, relay: { ...quest.relay, first: leg } }
          }
        }
      } else if (eligible && quest.comboAction?.staged && !quest.comboFirst) {
        const support = comboSupport(quest)
        const target = actionTarget(quest)
        const sent = target ? performed(actions, quest, target) : actions.some(receipt => receipt.kind === 'quest' && receipt.questId === quest.id)
        const ready = equipmentReady(support, turn, activeProfile, sent)
        if (sent && ready) {
          quest = { ...quest, progress: undefined, comboFirst: { sessionId, turn: end.data.turn, seq: end.seq, time: end.time } }
        } else if (sent) {
          quest = { ...quest, progress: { turn: end.data.turn, seq: end.seq, time: end.time, sessionId, missing: [support.id], action: true,
            ...(usedDifferentSource(support, turn) && { sourceMismatch: [support.id] }) } }
        }
      } else if (eligible) {
        const staged = quest.comboAction?.staged
        const target = actionTarget(quest)
        const targets = staged ? quest.pair.filter(item => item.id === target.id) : quest.pair ?? (quest.gear ? [quest.gear] : [])
        const action = target && performed(actions, quest, target)
        const missing = targets.filter(item => !equipmentReady(item, turn, activeProfile, !target || action)).map(item => item.id)
        const sourceMismatch = targets.filter(item => usedDifferentSource(item, turn)).map(item => item.id)
        let ordered
        if (quest.comboAction && !staged && action && !missing.length && targets.every(item => item.kind === 'tool')) {
          const support = targets.find(item => item.id !== target.id)
          const first = toolOrderFor(support, turn)?.first
          const last = toolOrderFor(targets.find(item => item.id === target.id), turn)?.last
          ordered = first < last
        }
        if (!missing.length && (!target || action) && ordered !== false) quest = { ...quest, completed: end.data.turn, progress: undefined }
        else if (quest.mode === 'combo' || target || sourceMismatch.length || quest.progress?.sourceMismatch) {
          quest = { ...quest, progress: { turn: end.data.turn, seq: end.seq, time: end.time, sessionId, missing, action, ordered,
            ...(sourceMismatch.length && { sourceMismatch }) } }
        }
      }
      const awards = [addXp(draft.heroes, turn.hero, rewards.hero)]
      for (const item of turn.gear.values()) {
        const award = addXp(draft.gear, item, item.kind === 'tool' ? rewards.tool : rewards.plugin)
        const firstSource = turn.firstToolSources.get(item.id)
        if (knownToolSource(firstSource?.sourceId)) award.sourceMastery = creditToolSource(draft.toolSources, firstSource, award.xp)
        const usedSources = turn.toolOrder.get(item.id)?.sources
        if (usedSources?.size && !knownToolSource(award.sourceId)) {
          award.usedSources = Array.from(usedSources, ([sourceId, { sourceName }]) => ({ sourceId, sourceName }))
        }
        awards.push(award)
      }
      draft.sessions[sessionId] = { ...current, end: end.seq, quest }
      const receipt = { id: sessionId + ':' + end.seq, sessionId, turn: end.data.turn, time: end.time, awards, delegation: turn.delegation }
      recordSettlement(draft, receipt, [turn.hero])
      return true
    })
  }

  function begin(session, event, hero, ready, delegation) {
    if (invalid) return
    turns.set(session, { hero, delegation, start: event.seq, number: event.data.turn, ready: new Map(ready.map(item => [item.id, item])),
      gear: new Map(), messages: [], profileProviders: new Map(), toolOrder: new Map(), firstToolSources: new Map(), toolSequence: 0,
      calls: new Map() })
  }

  function toolUsed(session, item) {
    const turn = turns.get(session)
    if (!turn) return
    const previous = turn.gear.get(item.id)
    const differentSource = previous && (previous.sourceId !== item.sourceId || !item.sourceId && previous.sourceName !== item.sourceName)
    turn.gear.set(item.id, differentSource ? { ...item, sourceId: undefined, sourceName: undefined } : item)
    if (!turn.firstToolSources.has(item.id)) turn.firstToolSources.set(item.id, item)
    const last = ++turn.toolSequence
    const order = turn.toolOrder.get(item.id) ?? { first: last, sources: new Map() }
    order.last = last
    if (knownToolSource(item.sourceId)) {
      const previousSource = order.sources.get(item.sourceId)
      order.sources.set(item.sourceId, { first: previousSource?.first ?? last, last, sourceName: item.sourceName ?? previousSource?.sourceName })
    }
    turn.toolOrder.set(item.id, order)
  }

  function providerUsed(session, item, name, profileIds = []) {
    const turn = turns.get(session)
    if (!turn) return
    useEquipment(turn, item, 'provider', name)
    for (const id of profileIds) {
      let names = turn.profileProviders.get(id)
      if (!names) turn.profileProviders.set(id, names = new Set())
      names.add(name)
    }
  }

  function observe(session, event, finish, executorCall, rememberRuntimeUse) {
    const turn = turns.get(session)
    if (!turn) return
    if (event.type === 'user/message') {
      const { source } = event.data
      if (source.kind === 'user') {
        turn.hasAssignment = true
        if (source.rpcId && event.surfaceOp === 'append') turn.messages.push(event.data)
      } else if (source.kind === 'agent-message' && source.form === 'relay' &&
        turn.delegation?.ancestors.includes(source.senderSessionId)) {
        turn.hasAssignment = true
      }
    } else if (event.type === 'step/start') turn.stepped = true
    else if (event.type === 'tool/call' && executorCall) {
      const { step, callId } = event.data
      turn.calls.set(step + '\0' + callId, executorCall)
    } else if (event.type === 'tool/result') {
      const key = event.data.step + '\0' + event.data.message.toolCallId
      const transport = turn.calls.get(key)
      if (transport && !event.data.message.isError) {
        const { tool, provider, profileIds, runtimeOnly, sessionProvider } = transport
        toolUsed(session, tool)
        if (provider) providerUsed(session, provider, tool.name, profileIds)
        if (runtimeOnly) rememberRuntimeUse(session.id, turn.hero.id, tool, sessionProvider)
      }
      turn.calls.delete(key)
    } else if (event.type === 'turn/end') {
      turns.delete(session)
      if (event.data.turn === turn.number && event.data.reason.kind === 'completed' && turn.hasAssignment && turn.stepped) {
        const quest = sessionData(session.id)?.quest
        const targets = quest?.pair ?? (quest?.gear ? [quest.gear] : [])
        const needsProfile = turn.messages.length || turn.profileProviders.size || targets.some(item => item.profileEntries?.length)
        const { ready, profile } = finish(turn.hero.id, needsProfile)
        for (const item of ready) turn.ready.set(item.id, item)
        void recordTurn(session.id, turn, event, profile).catch(warn)
      }
    }
  }

  return { begin, observe, toolUsed, providerUsed, recordEquipmentUse, heroRank, gearRank, toolSourceRank, toolSourceRanks, heroEquipment, heroRounds,
    equipmentHeroes, equipmentSourceProof, reportFollowUps,
    accept, settleQuest, read, flags, flagFor, displayFlag, signatureRules, signatureFor, signatureProgress, setSignature,
    teamTaskClaimed, teamQuest, recordTeamTask,
    settlements, followUp, provenLoadout, notice, dismissReceipt, continuationOffer, relayLoadout, recordBlankContinuation, handoff, journal,
    setFrame, validateQuest, comboPreview, flagPractice, recoverFlagPractice, nativeTrialMastered, openedWithQuest, openingQuest, questTask, questForAction,
    rewards, stagedLevel, relayGearLevel,
    get version() { return version }, settle: () => writes }
}
