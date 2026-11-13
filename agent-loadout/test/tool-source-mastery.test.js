import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openMatchGrowth } from '../match-growth.js'

test('tool mastery assigns the round to its first successful source and recovers proven history once', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-source-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const hero = { id: 'standard', name: 'Standard' }
  const tool = { id: 'tool:example', kind: 'tool', name: 'example' }
  const harbor = { ...tool, sourceId: 'plugin:harbor', sourceName: 'Harbor' }
  const forest = { ...tool, sourceId: 'plugin:forest', sourceName: 'Forest' }
  const unknown = { ...tool, sourceId: 'profile' }
  const session = { id: 'example' }
  const save = (folder, name, value) => writeFile(join(folder, name + '.json'), JSON.stringify(value))
  const open = () => openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async () => [], profileGear: async () => [],
  })
  await save(directory, 'progress', { version: 1, heroes: {}, sessions: {},
    gear: { [tool.id]: { ...tool, xp: 48 } },
    recent: [
      { sessionId: session.id, turn: 6, quest: true, awards: [{ ...forest, xp: 24 }] },
      { sessionId: session.id, turn: 5, awards: [{ ...unknown, xp: 8 }] },
      { sessionId: session.id, turn: 4, awards: [{ ...tool, xp: 8 }] },
      { sessionId: session.id, turn: 3, awards: [{ ...harbor, xp: 8 }] },
    ],
  })
  const growth = await open()
  assert.equal(growth.gearRank(tool.id).xp, 48)
  assert.equal(growth.toolSourceRank(tool.id, harbor.sourceId).xp, 8)
  assert.equal(growth.toolSourceRank(tool.id, forest.sourceId).xp, 0)
  assert.equal(growth.toolSourceRank(tool.id, unknown.sourceId), undefined)
  assert.equal(growth.notice(session.id).receipt.usedGear, undefined)

  async function play(turn, calls, kind = 'completed') {
    growth.begin(session, { seq: turn * 10, data: { turn } }, hero, [])
    growth.observe(session, { type: 'user/message', data: { source: { kind: 'user' } } })
    growth.observe(session, { type: 'step/start' })
    for (const item of calls) growth.toolUsed(session, item)
    growth.observe(session, { type: 'turn/end', seq: turn * 10 + 9, data: { turn, reason: { kind } } },
      () => ({ ready: [], profile: [] }))
    await growth.settle()
    const { receipts } = await growth.settlements(session.id)
    return receipts.find(receipt => receipt.turn === turn)?.awards.find(award => award.id === tool.id)
  }

  const mixed = await play(7, [harbor, forest, harbor])
  assert.equal(mixed.xp, 8)
  assert.equal(mixed.sourceId, undefined)
  assert.deepEqual(mixed.sourceMastery, { sourceId: harbor.sourceId, sourceName: harbor.sourceName, level: 1, totalXp: 16 })
  assert.deepEqual(growth.notice(session.id).receipt.usedGear.map(({ id, sourceId, usedSources }) => [id, sourceId, usedSources]), [
    [tool.id, undefined, [
      { sourceId: harbor.sourceId, sourceName: harbor.sourceName },
      { sourceId: forest.sourceId, sourceName: forest.sourceName },
    ]],
  ])
  assert.equal((await play(8, [unknown, forest])).sourceMastery, undefined)
  const latest = growth.notice(session.id).receipt
  assert.deepEqual(latest.usedGear[0].usedSources, [{ sourceId: forest.sourceId, sourceName: forest.sourceName }])
  assert.equal(await play(9, [forest], 'aborted'), undefined)
  assert.equal(growth.notice(session.id).receipt.id, latest.id)
  assert.deepEqual((await play(10, [harbor])).sourceMastery, { sourceId: harbor.sourceId, sourceName: harbor.sourceName,
    level: 2, previousLevel: 1, totalXp: 24 })
  assert.equal((await play(11, [forest])).sourceMastery.totalXp, 8)

  const reopened = await open()
  assert.equal(reopened.gearRank(tool.id).xp, 80)
  assert.equal(reopened.toolSourceRank(tool.id, harbor.sourceId).xp, 24)
  assert.equal(reopened.toolSourceRank(tool.id, forest.sourceId).xp, 8)
})

test('combo flags require the chosen tool source and share rewards across source variants', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-source-flags-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const save = (folder, name, value) => writeFile(join(folder, name + '.json'), JSON.stringify(value))
  const harbor = { id: 'tool:ledger', kind: 'tool', name: 'Ledger', sourceId: 'plugin:harbor', sourceName: 'Harbor' }
  const forest = { ...harbor, sourceId: 'plugin:forest', sourceName: 'Forest' }
  const index = { id: 'tool:index', kind: 'tool', name: 'Index', sourceId: 'plugin:index', sourceName: 'Index' }
  const hero = { id: 'standard', name: 'Standard' }
  const legacyHero = { id: 'legacy', name: 'Legacy' }
  const legacyId = createHash('sha256').update(JSON.stringify([legacyHero.id, index.id, harbor.id])).digest('hex')
  await save(directory, 'progress', { version: 1, heroes: {}, gear: {}, sessions: {}, recent: [],
    flags: { [legacyId]: { id: legacyId, hero: legacyHero, pair: [harbor, index], comboAction: { name: 'Earlier' } } },
    display: { [legacyHero.id]: legacyId } })
  const action = { gearId: index.id, key: 'verify', name: 'Verify' }
  const confirmations = new Map()
  const growth = await openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async sessionId => confirmations.get(sessionId) ?? [], profileGear: async () => [],
  })
  const accept = (session, pair, comboAction, selectedHero = hero, upgradeFlagId) => growth.accept(session.id,
    { title: 'Review', mode: 'combo', hero: selectedHero, pair, comboAction, after: 0, upgradeFlagId })
  const claim = (session, quest) => growth.settleQuest(session.id, quest.id, true)
  async function play(session, number, used, quest, selectedHero = hero) {
    confirmations.set(session.id, quest?.comboAction ? [{ kind: 'gear', id: index.id, label: action.name, proofKey: action.key, questId: quest.id }] : [])
    growth.begin(session, { seq: number * 10, data: { turn: number } }, selectedHero, [])
    growth.observe(session, { type: 'user/message', data: { source: { kind: 'user' } } })
    growth.observe(session, { type: 'step/start' })
    for (const item of used) growth.toolUsed(session, item)
    growth.observe(session, { type: 'turn/end', seq: number * 10 + 9, data: { turn: number, reason: { kind: 'completed' } } },
      () => ({ ready: [], profile: [] }))
    await growth.settle()
    return growth.read(session.id, selectedHero.id).quest
  }
  const awards = async session => (await growth.settlements(session.id)).receipts[0].awards.map(item => item.xp)
  const preview = (item, selectedHero = hero) => growth.comboPreview(selectedHero,
    [item, { ...index, trialActions: [action] }])
  const previewMode = (item, id, selectedHero) => preview(item, selectedHero).modes.find(mode => mode.id === id)

  const harborMatch = { id: 'harbor-match' }
  assert.deepEqual(previewMode(harbor, 'basic'), { id: 'basic', flag: 'unlock', move: undefined, heroXp: 24, gearXp: 16 })
  assert.equal(previewMode(harbor, 'action').gearXp, 24)
  assert.match(previewMode(harbor, 'staged').reason, /Lv.3/)
  assert.deepEqual(preview(harbor).levelGaps.map(item => item.level), [1, 1, 1])
  const harborQuest = await accept(harborMatch, [harbor, index])
  const otherHarborMatch = { id: 'other-harbor-match' }
  const otherHarborQuest = await accept(otherHarborMatch, [index, harbor])
  const forestMatch = { id: 'forest-match' }
  const forestQuest = await accept(forestMatch, [index, forest])
  assert.deepEqual(forestQuest.comboReward, { flag: 'unlock', heroXp: 24, gearXp: 16 })
  const wrong = await play(harborMatch, 1, [forest, index])
  assert.deepEqual(wrong.progress.sourceMismatch, [harbor.id])
  assert.equal(wrong.completed, undefined)
  await assert.rejects(claim(harborMatch, harborQuest), /请先完成/)
  await play(harborMatch, 2, [forest, harbor, index])
  const harborFlag = (await claim(harborMatch, harborQuest)).flag
  assert.equal(harborFlag.pair[0].sourceId, harbor.sourceId)
  assert.deepEqual(await awards(harborMatch), [24, 16, 16])
  await assert.rejects(accept(harborMatch, [index, harbor]), /已解锁战旗/)
  assert.deepEqual(growth.read(forestMatch.id, hero.id).quest.comboReward, { flag: 'unlock', heroXp: 0, gearXp: 0 })
  const existing = { id: harborFlag.id, title: harborFlag.title, sessionId: harborMatch.id }
  assert.deepEqual(growth.read(otherHarborMatch.id, hero.id).quest.comboReward, { flag: 'record', heroXp: 0, gearXp: 0, existing })
  await assert.rejects(claim(otherHarborMatch, otherHarborQuest), /请先完成/)
  await play(otherHarborMatch, 1, [harbor, index])
  assert.equal(growth.notice(otherHarborMatch.id).ready.id, otherHarborQuest.id)
  const repeated = await claim(otherHarborMatch, otherHarborQuest)
  assert.deepEqual(repeated.comboRepeat, existing)
  assert.equal(repeated.flag, undefined)
  assert.deepEqual(await awards(otherHarborMatch), [])
  assert.equal(growth.notice(otherHarborMatch.id).receipt.comboRepeat, true)
  const repeatedEntry = growth.journal().completed.find(item => item.id === otherHarborQuest.id)
  assert.deepEqual(repeatedEntry.comboRepeat, existing)
  assert.deepEqual(repeatedEntry.gear, [index, harbor])
  assert.equal(repeatedEntry.mode, 'combo')
  assert.deepEqual(growth.flags(hero.id).map(flag => flag.id), [harborFlag.id])
  await assert.rejects(claim(otherHarborMatch, otherHarborQuest), /委托已变化/)
  const reopened = await openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async () => [], profileGear: async () => [],
  })
  assert.deepEqual(reopened.journal().completed.find(item => item.id === otherHarborQuest.id), JSON.parse(JSON.stringify(repeatedEntry)))
  assert.equal(preview(harbor).flagName, 'Review')
  assert.equal(preview(harbor).flagId, harborFlag.id)
  await assert.rejects(accept(harborMatch, [forest, index], action, hero, harborFlag.id), /原战旗/)
  await assert.rejects(accept(harborMatch, [harbor, index], undefined, hero, harborFlag.id), /新的连携操作/)
  assert.match(previewMode(harbor, 'basic').reason, /已解锁战旗/)
  assert.deepEqual(previewMode(harbor, 'action'), { id: 'action', flag: 'upgrade', move: {
    key: action.key, name: action.name, gearName: index.name,
  }, heroXp: 0, gearXp: 8 })
  assert.deepEqual(previewMode(forest, 'basic'), { id: 'basic', flag: 'unlock', move: undefined, heroXp: 0, gearXp: 0 })

  await play(forestMatch, 1, [forest, index])
  const forestFlag = (await claim(forestMatch, forestQuest)).flag
  assert.notEqual(forestFlag.id, harborFlag.id)
  assert.equal(forestFlag.combinationId, harborFlag.combinationId)
  assert.deepEqual(await awards(forestMatch), [])

  const harborUpgrade = await accept(harborMatch, [harbor, index], action, hero, harborFlag.id)
  const sameUpgrade = await accept(otherHarborMatch, [harbor, index], action)
  const wrongOrder = await play(harborMatch, 3, [forest, index, harbor], harborUpgrade)
  assert.equal(wrongOrder.progress.ordered, false)
  await play(harborMatch, 4, [harbor, index], harborUpgrade)
  assert.equal((await claim(harborMatch, harborUpgrade)).flag.id, harborFlag.id)
  assert.deepEqual(await awards(harborMatch), [8, 8])
  await play(otherHarborMatch, 2, [harbor, index], sameUpgrade)
  assert.deepEqual((await claim(otherHarborMatch, sameUpgrade)).comboRepeat, existing)
  assert.deepEqual(await awards(otherHarborMatch), [])
  assert.match(previewMode(harbor, 'action').reason, /已经记录了连携操作/)
  assert.equal(previewMode(forest, 'action').gearXp, 0)
  assert.equal(previewMode(forest, 'action', legacyHero).gearXp, 0)
  const forestUpgrade = await accept(forestMatch, [forest, index], action)
  await play(forestMatch, 2, [forest, index], forestUpgrade)
  assert.equal((await claim(forestMatch, forestUpgrade)).flag.id, forestFlag.id)
  assert.deepEqual(await awards(forestMatch), [])

  const legacyMatch = { id: 'legacy-match' }
  const legacyQuest = await accept(legacyMatch, [forest, index], action, legacyHero)
  await play(legacyMatch, 1, [forest, index], legacyQuest, legacyHero)
  assert.equal((await claim(legacyMatch, legacyQuest)).flag.combinationId, legacyId)
  assert.deepEqual(await awards(legacyMatch), [])
  assert.equal(growth.flagFor(legacyHero.id).id, legacyId)

  const stored = JSON.parse(await readFile(join(directory, 'progress.json'), 'utf8'))
  const archivedRound = stored.recent.find(row => row.sessionId === harborMatch.id && row.turn === 4 && !row.quest)
  assert.ok(archivedRound)
  const hash = value => createHash('sha256').update(value).digest('hex')
  const archive = join(directory, 'settlements', hash(harborMatch.id))
  await mkdir(archive, { recursive: true })
  await save(archive, '1-4-' + hash(archivedRound.id), archivedRound)
  delete stored.flags[harborFlag.id].comboAction.key
  stored.recent = stored.recent.filter(row => row !== archivedRound)
  stored.archivedThrough = 1
  await save(directory, 'progress', stored)
  const migrated = await openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async () => [], profileGear: async () => [],
  })
  const pair = [harbor, { ...index, trialActions: [action] }]
  assert.throws(() => migrated.flagPractice(harborFlag.id, hero, pair), /旧记录/)
  await migrated.recoverFlagPractice(harborFlag.id)
  assert.equal(migrated.flagPractice(harborFlag.id, hero, pair).comboActionKey, action.key)
  assert.throws(() => migrated.flagPractice(harborFlag.id, hero, [forest, pair[1]]), /装备来源已变化/)
  assert.throws(() => migrated.flagPractice(harborFlag.id, hero, [harbor, index]), /原连携操作当前不可用/)
})

test('equipment relay requires real use by each hero and awards a first-pair bonus once', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-gear-relay-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const save = (folder, name, value) => writeFile(join(folder, name + '.json'), JSON.stringify(value))
  const first = { id: 'standard', name: 'Standard' }
  const second = { id: 'archive', name: 'Archive' }
  const harbor = { id: 'tool:ledger', kind: 'tool', name: 'Ledger', sourceId: 'plugin:harbor', sourceName: 'Harbor' }
  const forest = { ...harbor, sourceId: 'plugin:forest', sourceName: 'Forest' }
  const plugin = { id: 'host:ledger', kind: 'plugin', name: 'Ledger plugin', profileEntries: ['ledger'] }
  await save(directory, 'progress', { version: 1, heroes: {}, sessions: {}, recent: [], gear: {
    [harbor.id]: { ...harbor, xp: 52 }, [plugin.id]: { ...plugin, xp: 60 },
  } })
  const open = () => openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async () => [], profileGear: async () => [],
  })
  let growth = await open()
  const accept = (session, hero, gear) => growth.accept(session.id, { title: 'Deliver the ledger', mode: 'relay', hero, gear, after: 0 })
  const claim = (session, quest, rewardGear) => growth.settleQuest(session.id, quest.id, true, rewardGear)
  async function play(session, hero, turn, { tools = [], ready = [], provider } = {}) {
    growth.begin(session, { seq: turn * 10, data: { turn } }, hero, ready)
    growth.observe(session, { type: 'user/message', data: { source: { kind: 'user' } } })
    growth.observe(session, { type: 'step/start' })
    for (const item of tools) growth.toolUsed(session, item)
    if (provider) growth.providerUsed(session, provider, 'ledger')
    growth.observe(session, { type: 'turn/end', seq: turn * 10 + 9, time: Date.now(), data: { turn, reason: { kind: 'completed' } } },
      () => ({ ready, profile: ready.flatMap(item => item.profileEntries ?? []) }))
    await growth.settle()
    return growth.read(session.id, hero.id).quest
  }
  async function handoff(quest, parent, session, hero, inherited) {
    const context = { sessionId: session.id, parentId: parent.id, inherited, after: inherited, hero, createdAt: Date.now() }
    assert.equal(growth.continuationOffer(context).gear[0].sourceId, quest.gear.sourceId)
    await growth.handoff(context, quest.id, proof => proof.seq < inherited)
  }

  const origin = { id: 'origin' }
  const next = { id: 'next' }
  await assert.rejects(accept(origin, first, harbor), /Lv\.3/)
  await play(origin, first, 1, { tools: [harbor] })
  await assert.rejects(accept(origin, first, { ...harbor, sourceId: 'profile' }), /可核验的来源/)
  const quest = await accept(origin, first, harbor)
  const wrong = await play(origin, first, 2, { tools: [forest] })
  assert.equal(wrong.relay.first, undefined)
  assert.deepEqual(wrong.progress.sourceMismatch, [harbor.id])
  const start = await play(origin, first, 3, { tools: [forest, harbor] })
  assert.equal(start.relay.first.gear[0].sourceId, harbor.sourceId)
  await handoff(quest, origin, next, second, 40)
  assert.equal((await play(next, second, 4, { tools: [forest] })).relay.second, undefined)
  await assert.rejects(claim(next, quest), /请先完成/)
  const end = await play(next, second, 5, { tools: [harbor] })
  assert.equal(end.relayGearXp, 32)
  await assert.rejects(claim(next, quest, { leg: 0, id: harbor.id }), /已指定奖励装备/)
  await claim(next, quest)
  const [receipt] = (await growth.settlements(next.id)).receipts
  assert.deepEqual(receipt.awards.map(({ id, xp }) => [id, xp]), [[first.id, 24], [second.id, 24], [harbor.id, 32]])
  assert.deepEqual(receipt.relayGear, { ...harbor, xp: 32, first: true })

  growth = await open()
  assert.deepEqual(growth.journal().completed[0].relayGear, receipt.relayGear)
  const reverse = { id: 'reverse' }
  const finish = { id: 'finish' }
  const replay = await accept(reverse, second, forest)
  await play(reverse, second, 1, { tools: [forest] })
  await handoff(replay, reverse, finish, first, 20)
  assert.equal((await play(finish, first, 2, { tools: [forest] })).relayGearXp, 16)
  await claim(finish, replay)
  assert.equal((await growth.settlements(finish.id)).receipts[0].relayGear.first, false)

  const pluginMatch = { id: 'plugin' }
  await accept(pluginMatch, first, plugin)
  assert.equal((await play(pluginMatch, first, 1, { ready: [plugin] })).relay.first, undefined)
  const actual = await play(pluginMatch, first, 2, { provider: plugin })
  assert.equal(actual.relay.first.gear[0].id, plugin.id)
})
