import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { nativeTrialKey, openMatchGrowth } from '../match-growth.js'

test('old settlements preserve the round, delegated awards and follow-up across restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-settlements-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let failProgressSave = false
  async function save(folder, name, value) {
    if (failProgressSave && name === 'progress') throw new Error('Fixture interrupted progress save')
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, name + '.json'), JSON.stringify(value))
  }
  const open = () => openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async () => [], profileGear: async () => [],
  })
  const tool = { id: 'tool:fixture', name: 'Ledger', kind: 'tool', sourceId: 'plugin:ledger', sourceName: 'Ledger plugin' }
  const parent = 'parent-match'
  const child = 'child-match'
  const other = 'unrelated-match'
  const standard = { id: 'standard', name: 'Standard', xp: 12 }
  const worker = { id: 'recruiting-advisor', name: 'Recruiter', xp: 12 }
  const separate = { id: 'minimal', name: 'Minimal', xp: 12 }
  const turn = (sessionId, number, delegation) => ({ id: sessionId + ':' + number, sessionId, turn: number, time: number,
    delegation, awards: [sessionId === parent ? standard : sessionId === child ? worker : separate,
      { ...tool, xp: 8, previousXp: 0, totalXp: 8, level: 1 }] })
  const firstRound = turn(parent, 1)
  const quest = { ...firstRound, id: 'first-quest', quest: true, title: 'Review', awards: [{ ...tool, xp: 24 }] }
  const delegatedRound = turn(child, 1, { ancestors: [parent], mode: 'team' })
  const parentRounds = Array.from({ length: 6 }, (_, index) => turn(parent, index + 2))
  const noise = Array.from({ length: 55 }, (_, index) => turn(other, index + 1))
  await save(directory, 'progress', { version: 1, heroes: {}, gear: {}, sessions: {},
    recent: [firstRound, quest, delegatedRound, ...parentRounds, ...noise].reverse() })

  const growth = await open()
  const recordMore = (store, number) => store.recordEquipmentUse(other, { seq: 200 + number, time: 200 + number, data: {} },
    { kind: 'command', name: 'command-' + number }, { id: 'plugin:fixture', name: 'Fixture', kind: 'plugin' })
  const newest = await growth.settlements(parent)
  assert.deepEqual(newest.receipts.map(item => item.turn), [7, 6, 5, 4, 3])
  assert.ok(newest.before)
  const firstHeroPage = await growth.heroRounds(standard.id)
  assert.deepEqual(firstHeroPage.rounds.map(item => item.turn), [7, 6, 5, 4, 3])
  assert.ok(firstHeroPage.before)
  assert.equal(firstHeroPage.rounds[0].xp, 12)
  assert.deepEqual(firstHeroPage.rounds[0].followUpGear, [tool])
  const firstWorkerPage = await growth.heroRounds(worker.id)
  assert.deepEqual(firstWorkerPage.rounds.map(item => item.id), [delegatedRound.id])
  failProgressSave = true
  await assert.rejects(recordMore(growth, 0), /interrupted progress save/)
  assert.deepEqual(await (await open()).settlements(parent), newest)
  assert.deepEqual(await (await open()).heroRounds(standard.id), firstHeroPage)
  failProgressSave = false
  await recordMore(growth, 0)

  const mixedPage = await growth.settlements(parent, newest.before)
  assert.deepEqual(mixedPage.receipts.map(item => item.id), [parentRounds[0].id, delegatedRound.id, quest.id, firstRound.id])
  assert.deepEqual(mixedPage.receipts[2].followUpGear, [tool])
  assert.deepEqual(mixedPage.receipts[1].followUpGear, [])
  assert.equal(mixedPage.before, undefined)
  const plugin = { id: 'plugin:panel', name: 'Ledger panel', kind: 'plugin' }
  const action = { kind: 'panel', name: 'Save ledger' }
  const actionId = 'save-ledger'
  const sourceId = 'profile:fixture'
  const panelId = child + ':199'
  await growth.recordEquipmentUse(child, { seq: 199, time: 199, data: {} },
    { ...action, actionId, sourceId, delegation: delegatedRound.delegation }, plugin)
  assert.equal(growth.notice(parent).receipt.teammate, true)
  assert.equal(growth.notice(parent).receipt.usedGear, undefined)
  assert.equal(growth.notice(child).receipt.usedGear[0].id, plugin.id)
  for (let number = 1; number < 67; number++) await recordMore(growth, number)
  const reopened = await open()
  assert.equal(reopened.read(parent, 'standard').recent.length, 0)
  const parentPage = await reopened.settlements(parent)
  const delegatedPanel = parentPage.receipts[0]
  assert.equal(delegatedPanel.id, panelId)
  assert.deepEqual(delegatedPanel.followUpGear, [])
  assert.equal(delegatedPanel.followUpAction, undefined)
  const previousPage = await reopened.settlements(parent, parentPage.before)
  assert.deepEqual([...parentPage.receipts.slice(1), previousPage.receipts[0]], newest.receipts)
  assert.deepEqual(await reopened.settlements(parent, newest.before), mixedPage)
  assert.deepEqual(await reopened.heroRounds(standard.id), firstHeroPage)
  assert.deepEqual((await reopened.heroRounds(standard.id, firstHeroPage.before)).rounds.map(item => item.id), [parentRounds[0].id, firstRound.id])
  assert.deepEqual(await reopened.heroRounds(worker.id), firstWorkerPage)
  assert.deepEqual(await reopened.reportFollowUps(parent, [1, 7, 199]), new Map([
    [1, { id: firstRound.id, followUpGear: [tool], provenLoadout: true }],
    [7, { id: parentRounds.at(-1).id, followUpGear: [tool], provenLoadout: true }],
  ]))
  assert.deepEqual(await reopened.reportFollowUps(child, [199]), new Map())
  const proof = await reopened.provenLoadout(parent, firstRound.id)
  assert.deepEqual(proof.windows, [{ turn: 1, endSeq: 1 }])
  assert.deepEqual(proof.gear, [{ ...tool, evidence: 'tool',
    sources: [{ sourceId: tool.sourceId, sourceName: tool.sourceName }] }])
  assert.equal(await reopened.provenLoadout(parent, delegatedRound.id), undefined)
  assert.deepEqual((await reopened.followUp(parent, quest.id, [tool.id])).gear, [tool])
  assert.deepEqual((await reopened.followUp(child, delegatedRound.id, [tool.id])).gear, [tool])
  assert.equal((await reopened.followUp(child, delegatedRound.id, [tool.id])).heroId, worker.id)
  const [panelReceipt] = (await reopened.settlements(child)).receipts
  assert.equal(panelReceipt.id, panelId)
  assert.equal(panelReceipt.nativeTrialKeys, undefined)
  assert.deepEqual(panelReceipt.followUpAction, action)
  const panelTrial = await reopened.followUp(child, panelId, [plugin.id])
  assert.deepEqual(panelTrial.quest, { mode: 'trial', gearId: plugin.id,
    trialActionKey: nativeTrialKey(plugin.id, action.kind, actionId, sourceId) })
  await assert.rejects(reopened.followUp(parent, panelId, [plugin.id]), /找不到/)
  await assert.rejects(reopened.followUp(parent, delegatedRound.id, [tool.id]), /找不到/)
  await assert.rejects(reopened.followUp(other, firstRound.id, [tool.id]), /找不到/)
  await assert.rejects(reopened.settlements(parent, '1'), /找不到这页/)
})

test('hero equipment combines archived and recent use without counting delegated copies or quest rewards', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-hero-equipment-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  async function save(folder, name, value) {
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, name + '.json'), JSON.stringify(value))
  }
  const open = () => openMatchGrowth(directory, save, () => {}, error => assert.fail(error), {
    confirmedActions: async () => [], profileGear: async () => [],
  })
  const hash = value => createHash('sha256').update(value).digest('hex')
  const hero = { id: 'standard', name: 'Standard' }
  const teammate = { id: 'recruiting-advisor', name: 'Recruiter' }
  const harbor = { id: 'tool:example', kind: 'tool', name: 'Ledger', sourceId: 'plugin:harbor', sourceName: 'Harbor' }
  const forest = { ...harbor, sourceId: 'plugin:forest', sourceName: 'Forest' }
  const plugin = { id: 'plugin:archive', kind: 'plugin', name: 'Archive' }
  const parent = { id: 'parent' }
  const child = { id: 'child' }
  const oldRound = (sessionId, turn, time, selectedHero, item, delegation) => ({ id: sessionId + ':' + turn,
    sessionId, turn, time, awards: [{ ...selectedHero, xp: 12 }, { ...item, xp: 8 }], delegation })
  const first = oldRound(parent.id, 1, 10, hero, harbor)
  const delegated = oldRound(child.id, 1, 20, teammate, forest, { ancestors: [parent.id], mode: 'team' })
  const archive = (view, order, receipt, owned) => save(join(directory, 'settlements', hash(view)),
    [order, ...(owned ? [receipt.turn] : []), hash(receipt.id)].join('-'), receipt)
  await archive(parent.id, 1, first, true)
  await archive(child.id, 2, delegated, true)
  await archive(parent.id, 2, delegated, false)
  const recent = oldRound(parent.id, 2, 30, hero, forest)
  await save(directory, 'progress', { version: 1, heroes: { [hero.id]: { ...hero, xp: 60 }, [teammate.id]: { ...teammate, xp: 60 } },
    gear: { [harbor.id]: { xp: 60 }, [plugin.id]: { xp: 40 } }, sessions: { [parent.id]: {}, [child.id]: {} },
    archivedThrough: 2, recent: [{ ...recent, id: 'bonus', quest: true }, recent] })

  const growth = await open()
  assert.deepEqual((await growth.heroRounds(hero.id)).rounds.map(item => item.id), [recent.id, first.id])
  assert.deepEqual((await growth.heroRounds(teammate.id)).rounds.map(item => item.id), [delegated.id])
  const [before] = await growth.heroEquipment(hero.id)
  assert.equal(before.rounds, 2)
  assert.equal(before.sources[harbor.sourceId].rounds, 1)
  assert.equal(before.sources[forest.sourceId].rounds, 1)
  assert.deepEqual(growth.signatureProgress(hero.id, before), { gearLevel: 3, uses: 2, ready: false })
  await assert.rejects(growth.setSignature(hero.id, harbor.id, harbor.sourceId), /尚未解锁/)
  const [partnerUsage] = await growth.heroEquipment(teammate.id)
  assert.equal(partnerUsage.rounds, 1)
  assert.equal(partnerUsage.last.sessionId, child.id)

  growth.begin(parent, { seq: 30, data: { turn: 3 } }, hero, [])
  growth.observe(parent, { type: 'user/message', data: { source: { kind: 'user' } } })
  growth.observe(parent, { type: 'step/start' })
  for (const item of [harbor, forest, harbor]) growth.toolUsed(parent, item)
  growth.observe(parent, { type: 'turn/end', seq: 40, time: 40, data: { turn: 3, reason: { kind: 'completed' } } },
    () => ({ ready: [], profile: [] }))
  await growth.settle()
  const native = () => growth.recordEquipmentUse(parent.id, { seq: 41, time: 41, data: {} },
    { kind: 'command', name: 'check', heroId: hero.id }, plugin)
  await native()
  assert.deepEqual(growth.notice(parent.id).receipt.usedGear.map(({ id, xp }) => [id, xp]), [[plugin.id, 4]])
  await native()
  for (const seq of [42, 43, 44]) await growth.recordEquipmentUse(child.id, { seq, time: seq, data: {} },
    { kind: 'command', name: 'child-check-' + seq, heroId: teammate.id }, plugin)
  const [commandUsage, toolUsage] = await growth.heroEquipment(hero.id)
  assert.deepEqual([commandUsage.id, commandUsage.actions, commandUsage.rounds], [plugin.id, 1, 0])
  assert.equal(toolUsage.rounds, 3)
  assert.equal(toolUsage.last.turn, 3)
  assert.equal(toolUsage.sources[harbor.sourceId].rounds, 2)
  assert.equal(toolUsage.sources[forest.sourceId].rounds, 2)
  const roster = await growth.equipmentHeroes([harbor.id])
  assert.deepEqual(roster.map(row => [row.hero.id, row.rounds]), [[hero.id, 3], [teammate.id, 1]])
  assert.equal(roster[0].sources[harbor.sourceId].last.turn, 3)
  assert.equal(roster[1].sources[harbor.sourceId], undefined)
  assert.equal(roster[1].sources[forest.sourceId].last.sessionId, child.id)
  assert.deepEqual((await growth.equipmentHeroes([plugin.id])).map(row => [row.hero.id, row.rounds, row.actions]), [[teammate.id, 0, 3], [hero.id, 0, 1]])
  assert.deepEqual(growth.signatureProgress(hero.id, toolUsage), { gearLevel: 3, uses: 3, ready: true })
  const roundUnlock = (await growth.settlements(parent.id)).receipts.find(item => item.turn === 3).signatures
  assert.deepEqual(roundUnlock, [{ ...harbor, hero }])
  assert.equal((await growth.settlements(parent.id)).receipts[0].signatures, undefined)
  await assert.rejects(growth.setSignature(teammate.id, harbor.id, forest.sourceId), /尚未解锁/)
  await assert.rejects(growth.setSignature(hero.id, harbor.id, 'plugin:unknown'), /实战记录/)
  const rankBeforeDisplay = [growth.heroRank(hero.id), growth.gearRank(harbor.id)]
  await growth.setSignature(hero.id, harbor.id, forest.sourceId)
  const reopened = await open()
  assert.deepEqual(reopened.signatureFor(hero.id), { id: forest.id, name: forest.name, kind: forest.kind,
    sourceId: forest.sourceId, sourceName: forest.sourceName })
  assert.equal(reopened.signatureFor(teammate.id), undefined)
  assert.deepEqual([reopened.heroRank(hero.id), reopened.gearRank(harbor.id)], rankBeforeDisplay)
  assert.deepEqual(await reopened.heroEquipment(hero.id), await growth.heroEquipment(hero.id))
  assert.deepEqual((await reopened.heroRounds(hero.id)).rounds.map(item => item.turn), [3, 2, 1])
  const useNative = seq => reopened.recordEquipmentUse(parent.id, { seq, time: seq, data: {} },
    { kind: 'command', name: 'check-' + seq, heroId: hero.id }, plugin)
  const [locked] = await reopened.heroEquipment(hero.id)
  assert.deepEqual(reopened.signatureProgress(hero.id, locked), { gearLevel: 2, uses: 1, ready: false })
  await assert.rejects(reopened.setSignature(hero.id, plugin.id), /尚未解锁/)
  await useNative(42)
  const [nativeUnlock] = (await reopened.settlements(parent.id)).receipts
  assert.deepEqual(nativeUnlock.signatures, [{ ...plugin, hero: teammate, sourceId: undefined, sourceName: undefined }])
  await useNative(43)
  const [parentUnlock] = (await reopened.settlements(parent.id)).receipts
  assert.deepEqual(parentUnlock.signatures, [{ ...plugin, hero, sourceId: undefined, sourceName: undefined }])
  assert.equal((await reopened.settlements(child.id)).receipts[0].signatures, undefined)
  await reopened.setSignature(teammate.id, plugin.id)
  assert.equal(reopened.notice(parent.id).receipt.signatures, 1)
  await reopened.setSignature(hero.id, plugin.id)
  const recovered = await open()
  assert.deepEqual(recovered.signatureFor(hero.id), plugin)
  assert.equal((await recovered.settlements(parent.id)).receipts[0].signatures[0].id, plugin.id)
  await reopened.setSignature(hero.id, null)
  assert.equal((await open()).signatureFor(hero.id), undefined)

  const stored = JSON.parse(await readFile(join(directory, 'progress.json'), 'utf8'))
  delete stored.heroGear[teammate.id][forest.id].sources[forest.sourceId].last
  await save(directory, 'progress', stored)
  const legacy = await open()
  const currentForest = 'plugin:current-forest'
  const sourceIdentity = id => id === forest.sourceId ? currentForest : id
  const proof = await legacy.equipmentSourceProof(teammate.id, [forest.id], currentForest, sourceIdentity)
  assert.deepEqual(proof, { sessionId: child.id, turn: 1, time: 20, delegation: delegated.delegation })
  assert.equal(await legacy.equipmentSourceProof(teammate.id, [forest.id], harbor.sourceId), undefined)
})
