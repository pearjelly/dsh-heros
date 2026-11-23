import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { digestWorkspaceMaterial } from '../match-comparisons.js'
import { createGitModule, gitModuleName, moduleName, moduleVersion, name as marketPackage, startMarket, version as marketVersion } from './fixtures/market-fixture.mjs'

const exec = promisify(execFile)
const binary = process.env.DSH_LOADOUT_TEST_BINARY || 'dsh'
const packagePath = fileURLToPath(new URL('../', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))
const endpoint = '/api/agent-loadout'
const turnEndpoint = '/api/loadout-fixture-turn'

async function installProfile(directory, env) {
  const store = join(await realpath(directory), 'store')
  await exec(binary, ['plugin', '--profile', 'web', 'add', '-w', '--store-dir=' + store, packagePath], { env, cwd: directory })
  // The native manager installs into the profile workspace root without -w.
  const profile = join(env.DSH_HOME, 'profiles', 'web')
  await appendFile(join(profile, 'pnpm-workspace.yaml'), '\nignoreWorkspaceRootCheck: true\nfetchRetries: 0\nstoreDir: ' + JSON.stringify(store) + '\n')
  await writeFile(join(profile, '.npmrc'), 'ignore-workspace-root-check=true\nfetch-retries=0\nstore-dir=' + store + '\n')
}

test('market installs a verified bundle and records its native actions and tool usage', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-market-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  let registry
  try {
    registry = await startMarket(directory)
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => host.request(endpoint, { action, ...payload }, status)
    const setup = (await invoke('market-indexes')).value
    assert.equal(setup.available, false)
    assert.match(setup.enableId, /^bundle:/)
    const enabled = (await invoke('enable-profile', { itemId: setup.enableId })).value
    if (enabled.application === 'restart-required') {
      await host.stop()
      host = await startHost(env, patch)
    }
    const indexes = (await invoke('market-indexes')).value
    assert.equal(indexes.available, true)
    assert.deepEqual(indexes.sources, [])
    assert.equal(registry.requests.length, 0)
    await invoke('market-add', { url: registry.index })
    const added = (await invoke('market-add', { url: registry.secondary })).value
    assert.deepEqual(added.sources.map(source => source.url), [registry.index, registry.secondary])
    assert.equal(registry.requests.length, 0)
    const initial = (await invoke('market-search', { url: registry.index })).value
    assert.equal(initial.nextOffset, 8)
    const lastPage = (await invoke('market-search', { url: registry.index, offset: initial.nextOffset })).value
    assert.equal(lastPage.entries.length, 2)
    assert.equal(lastPage.nextOffset, null)
    const found = (await invoke('market-search', { url: registry.index, query: 'wayfindr' })).value
    assert.equal(found.total, 1)
    const [entry] = found.entries
    assert.equal(entry.title, '寻路罗盘')
    assert.equal(entry.name, marketPackage)
    assert.equal(entry.defaultVersion, marketVersion)
    assert.equal(entry.installation, 'not-installed')
    assert.equal(entry.installedVersion, undefined)
    assert.equal(entry.versions[0].compatible, false)
    assert.deepEqual(entry.versions[0].requirements, { 'engines.dsh': '>=99.0.0' })
    assert.match(entry.versions[0].runtimeVersion, /^0\.2\./)
    await invoke('market-search', { url: registry.origin + '/unconfigured.json' }, 422)
    const requested = { url: registry.index, name: entry.name, ...entry.versions.find(item => item.version === marketVersion) }
    await invoke('market-install', { ...requested, spec: 'other-package@1.0.0' }, 422)
    await invoke('market-install', { url: registry.index, name: entry.name, ...entry.versions[0] }, 422)
    assert.ok(!registry.requests.some(path => path.startsWith('/registry/')))
    const result = (await invoke('market-install', requested)).value
    assert.ok(['applied', 'restart-required'].includes(result.application))
    assert.ok(registry.requests.some(path => path.endsWith('.tgz')))
    if (result.application === 'restart-required') {
      await host.stop()
      host = await startHost(env, patch)
    }
    const equipment = (await host.request(endpoint)).value
    assert.equal(equipment.equipment.find(item => item.id === 'bundle:' + marketPackage).packageMoves[0][0], '核对路径')
    const hero = equipment.presets.find(preset => preset.id === 'fixture-wayfinder')
    const tool = equipment.equipment.find(item => item.name === 'market_wayfinder')
    assert.ok(hero && !hero.broken, hero?.broken)
    assert.ok(tool && hero.tools[tool.id].state === 'included')
    assert.equal(equipment.roles.guard, '核验')
    assert.deepEqual(equipment.equipment.find(item => item.id === 'evidence').roles, ['guard'])
    assert.deepEqual(tool.roles, ['scout'])
    assert.deepEqual(hero.roles, ['scout'])
    assert.ok([...equipment.equipment, ...equipment.presets].every(item =>
      item.roles.length > 0 && item.roles.every(role => Object.hasOwn(equipment.roles, role))))
    const target = equipment.presets.find(preset => preset.id === 'recruiting-advisor')
    assert.deepEqual(target.roles, ['guard'])
    assert.equal(target.tools[tool.id].state, 'available')
    const composed = (await host.request(endpoint, { presetId: target.id, equipmentIds: [tool.id] })).value
    assert.match(composed.presetId, /^loadout-/)
    const installed = (await invoke('market-search', { url: registry.index, query: entry.name })).value.entries[0]
    assert.equal(installed.installation, 'installed')
    assert.equal(installed.installedVersion, marketVersion)
    assert.deepEqual(installed.versions, entry.versions)

    const { sessionId, workspaceId } = await host.request('/api/loadout-fixture-session', {
      presetId: target.id, workspacePath: directory,
    })
    const profileTool = equipment.equipment.find(item => item.name === 'market_profile_wayfinder')
    const provider = equipment.equipment.find(item => item.kind === 'host' && item.id.endsWith('fixture-market-profile-tool'))
    const bundleId = 'bundle:' + marketPackage
    const rootStatus = target.tools[profileTool.id]
    assert.match(rootStatus.includedBy, /^profile:[a-f0-9]{24}$/)
    assert.match(rootStatus.includedSourceName, /fixture-market-profile-tool/)
    const localHero = equipment.presets.find(item => item.id === 'fixture-local-wayfinder')
    const localSource = localHero.tools[profileTool.id].includedBy
    const localProvider = equipment.equipment.find(item => item.id === localSource)
    const bundle = equipment.equipment.find(item => item.id === bundleId)
    assert.deepEqual(rootStatus.roles, ['scout', 'support'])
    assert.ok(bundle.roles.includes('orchestration'))
    assert.ok(provider.roles.includes('guard'))
    const inheritedArt = equipment.equipment.find(item => item.name === 'market_wayfinder').art
    assert.match(inheritedArt, /\?equipment=[a-f0-9]+&provider=1$/)
    const sharedToolLink = { id: profileTool.id, providerId: provider.id, sourceId: rootStatus.includedBy }
    assert.deepEqual(provider.providedTools, [sharedToolLink])
    assert.deepEqual(bundle.providedTools, [sharedToolLink])
    assert.deepEqual(localProvider.providedTools, [{ id: profileTool.id, providerId: localSource, sourceId: localSource }])
    assert.deepEqual(new Map(profileTool.providerGear.map(link => [link.sourceId, link.id])),
      new Map([[localSource, localProvider.id], [rootStatus.includedBy, provider.id]]))
    const rootOption = localHero.tools[profileTool.id].sourceChoices.find(item => item.sourceId === rootStatus.includedBy)
    assert.deepEqual(rootOption.replacement, { tools: [profileTool.name], remove: [localSource] })
    const removeLocal = { presetId: localHero.id, equipmentIds: [], removedEquipmentIds: [localSource] }
    const fallback = (await invoke('growth-opening-choices', { draft: removeLocal })).value
    assert.equal(fallback.choices.find(item => item.id === profileTool.id).sourceId, rootStatus.includedBy)
    const preview = (await invoke('compare', removeLocal)).value
    assert.ok(preview.sourceChanges.some(item => item.id === profileTool.id &&
      item.fromSourceId === localSource && item.sourceId === rootStatus.includedBy))
    const match = async (action, data) => (await invoke(action, { sessionId, ...data })).value
    const snapshot = await equipmentIn(host, sessionId)
    const liveProfileTool = snapshot.tools.find(item => item.id === profileTool.id)
    assert.equal(liveProfileTool.artSourceId, rootStatus.includedBy)
    assert.equal(liveProfileTool.sourceName, rootStatus.includedSourceName)
    assert.match(liveProfileTool.art, /\?equipment=/)
    assert.equal(liveProfileTool.art, rootStatus.art)
    assert.notEqual(liveProfileTool.art, provider.art)
    assert.deepEqual(snapshot.heroRoles, target.roles)
    assert.deepEqual(liveProfileTool.roles, profileTool.roles)
    const bundleShortcut = snapshot.profileEquipment.find(item => item.id === bundleId)
    const providerShortcut = snapshot.profileEquipment.find(item => item.id === provider.id)
    assert.deepEqual(bundleShortcut.roles, bundle.roles)
    assert.deepEqual(providerShortcut.roles, provider.roles)
    assert.match(bundle.art, /\?equipment=/)
    assert.equal(bundleShortcut.art, bundle.art)
    assert.equal(providerShortcut.art, provider.art)
    assert.equal(snapshot.skills.find(item => item.id === bundleId).art, bundle.art)
    const landmark = await host.requestRaw(liveProfileTool.art)
    assert.equal(landmark.status, 200)
    assert.equal(landmark.headers.get('content-type'), 'image/webp')
    const pinProfile = (item, remove = false) => match('match-shortcut', { itemId: item.id, shortcutKey: item.shortcutKey, remove })
    assert.match(bundleShortcut.shortcutKey, /^profile:[a-f0-9]{24}$/)
    assert.match(providerShortcut.shortcutKey, /^profile:[a-f0-9]{24}$/)
    await invoke('match-shortcut', { sessionId, itemId: bundleId, shortcutKey: providerShortcut.shortcutKey, remove: false }, 422)
    await pinProfile(providerShortcut)
    assert.deepEqual((await pinProfile(bundleShortcut)).pinned.map(({ id, state }) => [id, state]),
      [[provider.id, 'ready'], [bundleId, 'ready']])
    assert.equal(snapshot.gearRanks[bundleId].xp, 0)
    assert.ok(!snapshot.plugins.some(item => item.id === bundleId || item.id === provider.id))
    const move = snapshot.skills.find(item => item.id === bundleId).actions.find(item => item.name === '核对路径')
    const selection = { targetKind: 'gear', targetId: bundleId, revision: move.revision, moveId: move.id, input: '',
      shortcutKey: bundleShortcut.shortcutKey }
    let turn = 0
    const play = async (text, requestId) => {
      turn++
      await host.request(turnEndpoint, { sessionId, text, requestId })
      for (let attempt = 0; attempt < 80; attempt++) {
        const view = await match('match-growth')
        if (view.recent[0]?.turn === turn) return view
        await delay(50)
      }
      assert.fail('Missing settlement for turn ' + turn)
    }
    const profileAwards = view => view.recent[0].awards.filter(item => item.id.startsWith('host:') || item.id.startsWith('bundle:'))
      .map(item => [item.id, item.xp])
    const sendAction = async (input, edit = text => text) => {
      const requestId = randomUUID()
      const { text } = await match('match-record', { ...selection, input, requestId })
      return play(edit(text), requestId)
    }
    assert.deepEqual(profileAwards(await play('准备核对路径。')), [])
    assert.deepEqual(profileAwards(await play('调用市场路标，测试工具出错。')), [])
    const dispatched = await play('调用市场路标。')
    assert.deepEqual(profileAwards(dispatched), [[provider.id, 4], [bundleId, 4]])
    const toolAward = dispatched.recent[0].awards.find(item => item.id === profileTool.id)
    assert.equal(toolAward.xp, 8)
    assert.equal(toolAward.sourceId, rootStatus.includedBy)
    const profileProof = await match('match-proven-loadout', { receiptId: dispatched.recent[0].id })
    assert.equal(profileProof.kind, 'round')
    const provedProfile = profileProof.gear.find(item => item.id === profileTool.id)
    assert.equal(provedProfile.available, true)
    assert.equal(provedProfile.sourceId, rootStatus.includedBy)
    assert.deepEqual(profileProof.draft?.equipmentIds, [profileTool.id])
    assert.deepEqual(profileProof.draft.equipmentSources, { [profileTool.id]: rootStatus.includedBy })
    assert.deepEqual(profileProof.gear.filter(item => [provider.id, bundleId].includes(item.id))
      .map(({ evidence, selected }) => [evidence, selected]), [['provider', false], ['provider', false]])
    const profileOnly = await match('match-proven-loadout', { receiptId: dispatched.recent[0].id, gearIds: [provider.id] })
    assert.equal(profileOnly.gear.find(item => item.id === provider.id).available, false)
    assert.equal(profileOnly.draft, undefined)
    const toolPreview = (await invoke('equipment-pairing-preview', { id: profileTool.id, heroId: target.id,
      sourceId: rootStatus.includedBy })).value
    assert.equal(toolPreview.placement, 'included')
    assert.deepEqual(toolPreview.draft.equipmentIds, [])
    const bundlePreview = (await invoke('equipment-pairing-preview', { id: bundleId, heroId: target.id })).value
    assert.equal(bundlePreview.placement, 'profile')
    assert.deepEqual(bundlePreview.draft.equipmentIds, [])
    for (const id of [provider.id, bundleId]) {
      assert.deepEqual(dispatched.recent[0].awards.find(item => item.id === id).activity,
        [{ kind: 'provider', name: 'market_profile_wayfinder' }])
    }
    assert.deepEqual(profileAwards(await sendAction('')), [[bundleId, 4]])
    const combined = await sendAction('调用市场路标。')
    assert.deepEqual(profileAwards(combined), [[provider.id, 4], [bundleId, 4]])
    assert.deepEqual(combined.recent[0].awards.find(item => item.id === bundleId).activity,
      [{ kind: 'provider', name: 'market_profile_wayfinder' }, { kind: 'action', name: move.name, proofKey: move.proofKey }])
    const next = await match('match-follow-up', { receiptId: combined.recent[0].id, gearIds: [provider.id, bundleId] })
    assert.deepEqual(next.quest, { mode: 'combo', gearIds: [provider.id, bundleId], staged: true })
    const pairPreview = await match('match-follow-up-preview', { receiptId: combined.recent[0].id, gearIds: [provider.id, bundleId] })
    assert.ok(pairPreview.combo.modes.every(mode => mode.reason))
    assert.deepEqual(pairPreview.combo.levelGaps.map(item => item.xpNeeded), [52, 48])
    const pairWithTool = { receiptId: combined.recent[0].id, gearIds: [profileTool.id, bundleId] }
    const actionPreview = await match('match-follow-up-preview', pairWithTool)
    const selectedMove = actionPreview.combo.modes.find(mode => mode.id === 'action')
    assert.equal(selectedMove.flag, 'unlock')
    const configured = await match('match-follow-up', { ...pairWithTool, combo: { mode: 'action', actionKey: selectedMove.move.key } })
    assert.deepEqual(configured.quest, { mode: 'combo', gearIds: pairWithTool.gearIds,
      questSources: { [profileTool.id]: rootStatus.includedBy }, comboActionKey: selectedMove.move.key })
    await invoke('match-follow-up', { sessionId, ...pairWithTool, combo: { mode: 'staged', actionKey: selectedMove.move.key } }, 422)
    const { value: nextChoices } = await invoke('growth-opening-choices', { draft: { presetId: target.id, equipmentIds: [] },
      restoreGear: next.gear.map(({ id }) => ({ id })) })
    assert.deepEqual(nextChoices.repairs, [{ id: provider.id }, { id: bundleId }])
    assert.ok(nextChoices.choices.some(item => item.id === provider.id && item.profile))
    assert.ok(nextChoices.choices.some(item => item.id === bundleId && item.profile))

    const { choices } = await match('match-growth', { includeChoices: true })
    const trial = choices.find(item => item.id === bundleId).trialActions.find(item => item.name === move.name)
    const quest = await match('growth-accept', { mode: 'trial', title: '用组合包装备核对路径',
      gearId: bundleId, trialActionKey: trial.key })
    const edited = await sendAction('', text => text + '（已修改）')
    assert.deepEqual(profileAwards(edited), [])
    assert.deepEqual(edited.quest.progress.missing, [bundleId])
    assert.equal(edited.quest.progress.action, false)
    const ready = await sendAction('')
    assert.equal(ready.quest.completed, turn)
    assert.deepEqual(profileAwards(ready), [[bundleId, 4]])
    await match('growth-claim', { id: quest.id })
    assert.equal((await equipmentIn(host, sessionId)).gearRanks[bundleId].xp, 48)

    const audit = choices.find(item => item.id === provider.id).trialActions.find(item => item.name === '核验装备作用')
    const auditQuest = await match('growth-accept', { mode: 'trial', title: '判断路标插件是否适用',
      gearId: provider.id, trialActionKey: audit.key })
    const auditMove = { targetKind: 'gear', targetId: provider.id, moveId: 'gear:task', input: '核对路径核验的适用条件。',
      shortcutKey: providerShortcut.shortcutKey }
    await invoke('match-prompt', { sessionId, ...auditMove, input: '' }, 422)
    await invoke('match-prompt', { sessionId, ...auditMove, targetId: 'host:missing' }, 422)
    const auditPrompt = await match('match-prompt', auditMove)
    assert.match(auditPrompt.text, /继续当前方案、补齐条件或回城换装/)
    assert.match(auditPrompt.text, /当前可核验的工具包括 "market_profile_wayfinder"/)
    assert.deepEqual(profileAwards(await play(auditPrompt.text)), [])
    const requestId = randomUUID()
    const audited = await match('match-record', { ...auditMove, requestId })
    const auditResult = await play(audited.text, requestId)
    assert.equal(auditResult.quest.completed, turn)
    assert.deepEqual(profileAwards(auditResult), [[provider.id, 4]])
    await match('growth-claim', { id: auditQuest.id })
    assert.deepEqual((await match('match-settlements'))[0].awards.map(item => [item.id, item.xp]), [[provider.id, 32]])
    assert.deepEqual((await pinProfile(providerShortcut, true)).pinned.map(item => item.id), [bundleId])
    await invoke('match-prompt', { sessionId, ...auditMove }, 422)

    const before = await equipmentIn(host, sessionId)
    const command = { name: 'fixture-landmark', description: 'Read the current landmark.', hint: '[fail]' }
    for (const id of [provider.id, bundleId]) {
      assert.deepEqual(before.profileEquipment.find(item => item.id === id).commands, [command])
    }
    const runCommand = (line, id = sessionId) => host.request('/api/loadout-fixture-command', { sessionId: id, line })
    assert.equal((await runCommand('/fixture-landmark fail')).result.kind, 'error')
    assert.ok(!(await match('match-settlements')).some(receipt => receipt.command))
    assert.equal((await runCommand('/fixture-landmark')).result.text, 'profile landmark')
    assert.equal((await runCommand('/fixture-landmark')).result.kind, 'success')
    let after
    for (let attempt = 0; attempt < 80; attempt++) {
      after = await equipmentIn(host, sessionId)
      if (after.settlement.receipt.command) break
      await delay(50)
    }
    assert.equal(after.settlement.receipt.command, command.name)
    assert.equal(after.heroRank.xp, before.heroRank.xp)
    assert.equal(after.gearRanks[provider.id].xp, before.gearRanks[provider.id].xp + 4)
    assert.equal(after.gearRanks[bundleId].xp, before.gearRanks[bundleId].xp + 4)
    const commandReceipts = (await match('match-settlements')).filter(receipt => receipt.command)
    assert.equal(commandReceipts.length, 1)
    assert.deepEqual(commandReceipts[0].awards.map(item => [item.id, item.activity]),
      [provider.id, bundleId].map(id => [id, [{ kind: 'command', name: command.name }]]))
    const log = await match('match-report')
    assert.deepEqual(log.commands.map(item => [item.name, item.state]),
      [[command.name, 'completed'], [command.name, 'completed'], [command.name, 'failed']])
    const older = await match('match-report', { before: log.commands.at(-1).seq })
    assert.equal(older.commands, undefined)
    assert.ok(older.turns.length > 0)

    const panelName = '保存路径'
    const reviewName = '评审路径计划'
    const panelIds = [provider.id, bundleId]
    const panelCatalog = (await host.request(endpoint)).value
    for (const id of panelIds) {
      for (const inventory of [after.profileEquipment, panelCatalog.equipment]) {
        assert.deepEqual(inventory.find(item => item.id === id).panelActivities.map(item => item.name), [panelName, reviewName])
      }
    }
    const runPanel = (action, result, id = sessionId, status = 200) =>
      host.request('/api/fixture-market-panel', { sessionId: id, action, result, content: 'not part of the receipt' }, status)
    await host.request(turnEndpoint, { sessionId, selectOnly: true })
    await runPanel('read')
    await runPanel('save', 'refused')
    await runPanel('save', 'error', sessionId, 409)
    await runPanel('save', 'success', 'missing-session')
    assert.equal((await match('match-report')).panelActivities, undefined)
    assert.equal((await runPanel('save')).saved, true)
    assert.equal((await runPanel('save')).saved, true)
    let panelResult
    for (let attempt = 0; attempt < 80; attempt++) {
      panelResult = await equipmentIn(host, sessionId)
      if (panelResult.settlement.receipt.panelAction) break
      await delay(50)
    }
    assert.equal(panelResult.settlement.receipt.panelAction, panelName)
    assert.equal(panelResult.heroRank.xp, after.heroRank.xp)
    for (const id of panelIds) assert.equal(panelResult.gearRanks[id].xp, after.gearRanks[id].xp + 4)
    const panelReceipts = (await match('match-settlements')).filter(receipt => receipt.panelAction)
    assert.equal(panelReceipts.length, 1)
    assert.deepEqual(panelReceipts[0].awards.map(item => [item.id, item.activity]),
      panelIds.map(id => [id, [{ kind: 'panel', name: panelName }]]))
    const panelLog = await match('match-report')
    assert.deepEqual(panelLog.panelActivities.map(item => item.name), [panelName, panelName])
    const nativePanelRows = (await host.request('/api/loadout-fixture-history?sessionId=' + sessionId)).events
      .filter(event => event.type === 'plugin:dsh-agent-loadout/panel-activity')
    assert.deepEqual(nativePanelRows.map(event => event.data), [{ name: panelName, source: panelLog.panelActivities[0].source },
      { name: panelName, source: panelLog.panelActivities[0].source }])

    const reviewSources = (await invoke('plan-review-activities')).value
    assert.deepEqual(reviewSources.find(item => item.packageName === marketPackage),
      { packageName: marketPackage, id: 'review-route-plan', component: 'MarketPlanReview' })
    const nativeReview = callId => host.request('/api/loadout-fixture-plan-review', { sessionId, callId })
    const claimReview = (callId, digest, extra) => match('plan-review-record', {
      callId, digest, packageName: marketPackage, actionId: 'review-route-plan', ...extra,
    })
    const fingerprint = ({ id, selected, custom }) => createHash('sha256').update(JSON.stringify([id, selected, custom])).digest('hex')
    const callId = 'fixture-plan-feedback'
    const { answers: [feedback] } = await nativeReview(callId)
    assert.equal(feedback.custom, '先核对路径来源。')
    const hash = fingerprint(feedback)
    assert.deepEqual(await claimReview(callId, 'a'.repeat(64)), { accepted: false })
    assert.deepEqual(await claimReview(callId, hash, { packageName: 'different-package' }), { accepted: false })
    assert.deepEqual(await claimReview(callId, hash, { sessionId: 'different-session' }), { accepted: false })
    assert.deepEqual(await claimReview(callId, hash), { accepted: true })
    assert.deepEqual(await claimReview(callId, hash), { accepted: false })
    const approval = 'fixture-plan-approve'
    const { answers: [approved] } = await nativeReview(approval)
    assert.deepEqual(await claimReview(approval, fingerprint(approved)), { accepted: false })
    const report = await match('match-report')
    assert.deepEqual(report.panelActivities.map(item => item.name), [reviewName, panelName, panelName])
    assert.ok(!JSON.stringify(report).includes(feedback.custom))
    let reviewReceipt
    for (let attempt = 0; attempt < 80; attempt++) {
      reviewReceipt = (await match('match-settlements')).find(receipt => receipt.panelAction === reviewName)
      if (reviewReceipt) break
      await delay(50)
    }
    assert.deepEqual(reviewReceipt.awards.map(({ id, xp }) => [id, xp]), panelIds.map(id => [id, 4]))

    const other = await host.request('/api/loadout-fixture-session', { presetId: hero.id })
    const scoped = await equipmentIn(host, other.sessionId)
    const scopedProvider = scoped.plugins.find(item => item.commands?.some(item => item.name === command.name))
    assert.ok(scopedProvider)
    assert.ok(scoped.profileEquipment.every(item => !item.commands?.some(item => item.name === command.name)))
    assert.equal((await runCommand('/fixture-landmark', other.sessionId)).result.text, 'preset landmark')
    let scopedReceipt
    for (let attempt = 0; attempt < 80; attempt++) {
      scopedReceipt = (await equipmentIn(host, other.sessionId)).settlement?.receipt
      if (scopedReceipt) break
      await delay(50)
    }
    assert.equal(scopedReceipt.command, command.name)
    const [scopedSettlement] = (await invoke('match-settlements', { sessionId: other.sessionId })).value
    assert.deepEqual(scopedSettlement.awards.map(({ id, xp }) => [id, xp]), [[scopedProvider.id, 4]])

    const nativeChoice = (view, id, kind, name) => view.choices.find(item => item.id === id)
      ?.trialActions?.find(move => move.kind === kind && move.name === name)
    const live = await match('match-growth', { includeChoices: true })
    const commandMove = nativeChoice(live, bundleId, 'command', command.name)
    assert.ok(commandMove)
    const commandReceipt = commandReceipts[0]
    assert.deepEqual(commandReceipt.followUpAction, { kind: 'command', name: command.name })
    assert.deepEqual(commandReceipt.followUpGear.map(item => item.id), [provider.id, bundleId])
    await invoke('match-follow-up', { sessionId, receiptId: commandReceipt.id, gearIds: [provider.id, bundleId] }, 422)
    await invoke('match-follow-up', { sessionId: other.sessionId, receiptId: commandReceipt.id, gearIds: [bundleId] }, 422)
    const prepareCommandTrial = gearIds => match('match-follow-up', { receiptId: commandReceipt.id, gearIds })
    const preparedCommand = await prepareCommandTrial([bundleId])
    assert.deepEqual(preparedCommand.activity, commandReceipt.followUpAction)
    assert.deepEqual(preparedCommand.quest, { mode: 'trial', gearId: bundleId, trialActionKey: commandMove.key })
    const scopedChoices = (await invoke('match-growth', { sessionId: other.sessionId, includeChoices: true })).value
    const scopedMove = nativeChoice(scopedChoices, scopedProvider.id, 'command', command.name)
    assert.ok(scopedMove)
    assert.equal(nativeChoice(scopedChoices, bundleId, 'command', command.name), undefined)
    const scopedTrial = (await invoke('match-follow-up', { sessionId: other.sessionId, receiptId: scopedSettlement.id,
      gearIds: [scopedProvider.id] })).value.quest
    assert.equal(scopedTrial.trialActionKey, scopedMove.key)
    assert.notEqual(scopedTrial.trialActionKey, commandMove.key)
    const commandQuest = await match('growth-accept', { ...preparedCommand.quest, title: '查询路径路标' })
    await invoke('match-follow-up', { sessionId, receiptId: commandReceipt.id, gearIds: [provider.id] }, 422)
    const proofIn = async id => {
      for (let attempt = 0; attempt < 80; attempt++) {
        const value = (await invoke('match-growth', { sessionId: id })).value
        if (value.quest?.nativeProof) return value.quest.nativeProof
        await delay(50)
      }
      assert.fail('Missing native trial proof')
    }
    await invoke('growth-claim', { sessionId, id: commandQuest.id }, 422)
    await invoke('match-prompt', { sessionId, questId: commandQuest.id, input: '查询路径路标' }, 422)
    assert.equal((await runCommand('/fixture-landmark fail')).result.kind, 'error')
    await runPanel('save')
    await invoke('growth-claim', { sessionId, id: commandQuest.id }, 422)
    assert.equal((await runCommand('/fixture-landmark')).result.kind, 'success')
    const commandProof = await proofIn(sessionId)
    assert.equal((await equipmentIn(host, sessionId)).settlement.ready.id, commandQuest.id)
    await match('growth-claim', { id: commandQuest.id })
    const receipts = await match('match-settlements')
    assert.equal(receipts.filter(receipt => receipt.command).length, 1)
    assert.deepEqual(receipts.find(receipt => receipt.id === commandReceipt.id).followUpGear.map(item => item.id), [provider.id])
    await invoke('match-follow-up', { sessionId, receiptId: commandReceipt.id, gearIds: [bundleId] }, 422)
    assert.equal((await prepareCommandTrial([provider.id])).quest.trialActionKey, nativeChoice(live, provider.id, 'command', command.name).key)
    assert.deepEqual(receipts[0].trialAction, { name: command.name, kind: 'command', proof: commandProof })
    assert.deepEqual(receipts[0].awards.map(({ id, xp }) => [id, xp]), [[bundleId, 32]])
    assert.equal(receipts[0].turn, undefined)

    const draft = { presetId: target.id, equipmentIds: [] }
    const opening = (await invoke('growth-opening-choices', { draft })).value
    const panelMove = nativeChoice(opening, bundleId, 'panel', panelName)
    assert.deepEqual(panelMove, nativeChoice(live, bundleId, 'panel', panelName))
    const panelTrialSetup = await match('match-follow-up', { receiptId: panelReceipts[0].id, gearIds: [bundleId] })
    assert.deepEqual(panelTrialSetup.activity, { kind: 'panel', name: panelName })
    assert.equal(panelTrialSetup.quest.trialActionKey, panelMove.key)
    const panelTrial = { ...panelTrialSetup.quest, title: '保存已核对的路径' }
    const newMatch = (await invoke('growth-open', { draft, workspaceId, launchId: '0'.repeat(32), quest: panelTrial })).value
    assert.equal(newMatch.questError, undefined)
    const newSnapshot = await equipmentIn(host, newMatch.sessionId)
    assert.equal(newSnapshot.openingQuest.nativeAction, panelName)
    assert.equal(newSnapshot.questTask, undefined)
    const panelQuest = await match('growth-accept', panelTrial)
    await runPanel('save', 'refused')
    await invoke('growth-claim', { sessionId, id: panelQuest.id }, 422)
    await runPanel('save')
    await runPanel('save', 'success', newMatch.sessionId)
    const panelProof = await proofIn(sessionId)
    await proofIn(newMatch.sessionId)
    const claims = await Promise.allSettled([
      match('growth-claim', { id: panelQuest.id }),
      invoke('growth-claim', { sessionId: newMatch.sessionId, id: newSnapshot.openingQuest.id }),
    ])
    assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1)
    const recorded = (await invoke('growth-journal')).value.completed.filter(entry => entry.trialAction?.name === panelName)
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].trialAction.kind, 'panel')
    assert.equal(recorded[0].awards[0].xp, 32)
    if (recorded[0].sessionId === sessionId) assert.deepEqual(recorded[0].trialAction.proof, panelProof)
    const mastered = await match('match-growth', { includeChoices: true })
    assert.equal(nativeChoice(mastered, bundleId, 'panel', panelName).mastered, true)
    assert.equal(nativeChoice(mastered, provider.id, 'panel', panelName).mastered, undefined)
    if (mastered.quest) await match('growth-abandon', { id: mastered.quest.id })
    await invoke('growth-accept', { ...panelTrial, sessionId }, 422)

    const reviewMove = nativeChoice(mastered, provider.id, 'panel', reviewName)
    const staleId = 'fixture-plan-before-trial'
    const { answers: [staleFeedback] } = await nativeReview(staleId)
    const reviewQuest = await match('growth-accept', { mode: 'trial', gearId: provider.id,
      trialActionKey: reviewMove.key, title: '提出新的计划修改意见' })
    assert.deepEqual(await claimReview(staleId, fingerprint(staleFeedback)), { accepted: true })
    await invoke('growth-claim', { sessionId, id: reviewQuest.id }, 422)
    const freshId = 'fixture-plan-during-trial'
    const { answers: [freshFeedback] } = await nativeReview(freshId)
    assert.deepEqual(await claimReview(freshId, fingerprint(freshFeedback)), { accepted: true })
    const reviewProof = await proofIn(sessionId)
    await match('growth-claim', { id: reviewQuest.id })
    assert.deepEqual((await match('match-settlements'))[0].trialAction, { name: reviewName, kind: 'panel', proof: reviewProof })

    const preparePanel = nativeChoice(mastered, provider.id, 'panel', panelName)
    const prepareCommand = nativeChoice(mastered, provider.id, 'command', command.name)
    const combo = { mode: 'combo', staged: true, gearIds: [provider.id, bundleId], title: '核对路标后保存路径' }
    const waitForStage = async (id, check) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        const { quest } = (await invoke('match-growth', { sessionId: id })).value
        if (check(quest)) return quest
        await delay(50)
      }
      assert.fail('Missing stage proof')
    }
    await invoke('growth-accept', { sessionId, ...combo, prepareActionKey: preparePanel.key, comboActionKey: panelMove.key }, 422)
    await invoke('growth-accept', { sessionId, ...combo, staged: undefined, comboActionKey: panelMove.key }, 422)

    const nativeFirst = await match('growth-accept', { ...combo, prepareActionKey: preparePanel.key, comboActionKey: trial.key })
    assert.equal((await sendAction('')).quest.comboFirst, undefined)
    await runPanel('save')
    const preparedPanel = await waitForStage(sessionId, quest => quest.comboFirst)
    assert.equal(preparedPanel.comboFirst.kind, 'panel')
    assert.equal((await sendAction('')).quest.completed, turn)
    await match('growth-abandon', { id: nativeFirst.id })

    const turnFirst = await match('growth-accept', { ...combo, prepareActionKey: trial.key, comboActionKey: preparePanel.key })
    await runPanel('save')
    assert.equal((await sendAction('')).quest.comboFirst.turn, turn)
    await invoke('growth-claim', { sessionId, id: turnFirst.id }, 422)
    await runPanel('save')
    await proofIn(sessionId)
    await match('growth-abandon', { id: turnFirst.id })

    const { sessionId: beforeTurn } = await host.request('/api/loadout-fixture-session', { presetId: target.id })
    const nativeCombo = (await invoke('growth-accept', { sessionId: beforeTurn, ...combo,
      prepareActionKey: prepareCommand.key, comboActionKey: panelMove.key })).value
    assert.equal((await invoke('match-growth', { sessionId: beforeTurn })).value.task, undefined)
    await runPanel('save', 'success', beforeTurn)
    await runCommand('/fixture-landmark fail', beforeTurn)
    assert.equal((await invoke('match-growth', { sessionId: beforeTurn })).value.quest.comboFirst, undefined)
    const { sessionId: beforePreparation } = (await invoke('continue', { sourceSessionId: beforeTurn, presetId: composed.presetId })).value
    await runCommand('/fixture-landmark', beforeTurn)
    const { comboFirst } = await waitForStage(beforeTurn, quest => quest.comboFirst)
    assert.equal(comboFirst.kind, 'command')
    assert.equal(comboFirst.turn, undefined)
    assert.equal(comboFirst.name, command.name)
    const earlierOffer = (await invoke('match-growth', { sessionId: beforePreparation })).value.questOffer
    assert.equal(earlierOffer.comboFirst, undefined)
    assert.equal(earlierOffer.stepGearId, provider.id)
    await invoke('growth-claim', { sessionId: beforeTurn, id: nativeCombo.id }, 422)
    const { sessionId: continued } = (await invoke('continue', { sourceSessionId: beforeTurn, presetId: composed.presetId })).value
    assert.notEqual(continued, beforeTurn)
    const preparedOffer = (await invoke('match-growth', { sessionId: continued })).value.questOffer
    assert.deepEqual(preparedOffer.comboFirst, comboFirst)
    assert.equal(preparedOffer.stepGearId, bundleId)
    await invoke('growth-handoff', { sessionId: continued, id: nativeCombo.id })
    assert.deepEqual((await invoke('match-growth', { sessionId: continued })).value.quest.comboFirst, comboFirst)
    await runPanel('save', 'success', continued)
    const activation = await proofIn(continued)
    const earned = (await invoke('growth-claim', { sessionId: continued, id: nativeCombo.id })).value
    assert.equal(earned.flag.stagedAction.kind, 'panel')
    assert.deepEqual(earned.flag.stagedAction.first, comboFirst)
    assert.deepEqual(earned.flag.stagedAction.proof, activation)
    const [finishedCombo] = (await invoke('match-settlements', { sessionId: continued })).value
    assert.equal(finishedCombo.turn, undefined)
    assert.deepEqual(finishedCombo.awards.map(({ id, xp }) => [id, xp]), [[target.id, 24], [provider.id, 32], [bundleId, 32]])
    assert.deepEqual((await invoke('growth-journal')).value.completed.find(entry => entry.id === nativeCombo.id).comboAction,
      finishedCombo.comboAction)
    await invoke('growth-accept', { sessionId, ...combo, prepareActionKey: prepareCommand.key, comboActionKey: panelMove.key }, 422)
  } finally {
    await host?.stop()
    await registry?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('the native compaction provider earns equipment experience only after producing a summary', { timeout: 45_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-compaction-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const { sessionId } = await host.request('/api/loadout-fixture-session', { presetId: 'standard', workspacePath: directory })
    const match = async (action, payload, status) => (await host.request(endpoint, { action, sessionId, ...payload }, status)).value
    const { choices } = await match('match-growth', { includeChoices: true })
    const provider = choices.find(item => item.trialActions?.some(move => move.kind === 'compaction'))
    assert.ok(provider)
    const move = provider.trialActions.find(item => item.kind === 'compaction')
    const catalog = (await host.request(endpoint)).value
    assert.equal(catalog.equipment.find(item => item.id === provider.id).compactionActivities[0].name, move.name)
    const trial = { mode: 'trial', gearId: provider.id, trialActionKey: move.key, title: '归纳已完成的对话' }
    const quest = await match('growth-accept', trial)
    const compact = () => host.request('/api/loadout-fixture-command', { sessionId, line: '/compact' })
    await compact()
    await match('growth-claim', { id: quest.id }, 422)
    assert.equal((await match('match-settlements')).some(receipt => receipt.compaction), false)
    for (const text of ['记录交付目标。', '整理交付材料。', '核对已准备好的材料。']) {
      await host.request(turnEndpoint, { sessionId, text })
    }
    await match('growth-claim', { id: quest.id }, 422)
    assert.equal((await compact()).result.kind, 'success')
    let proof
    for (let attempt = 0; attempt < 80; attempt++) {
      proof = (await match('match-growth')).quest.nativeProof
      if (proof) break
      await delay(50)
    }
    assert.ok(proof)
    const base = (await match('match-settlements')).find(receipt => receipt.compaction)
    assert.deepEqual(base.awards.map(({ id, xp, activity }) => [id, xp, activity]),
      [[provider.id, 4, [{ kind: 'compaction', name: move.name }]]])
    assert.deepEqual(base.followUpAction, { kind: 'compaction', name: move.name })
    assert.deepEqual(base.followUpGear.map(item => item.id), [provider.id])
    const { compactions: [result] } = await match('match-report')
    assert.deepEqual(result, { seq: proof.seq, time: proof.time, state: 'completed', inherited: false })
    await match('growth-claim', { id: quest.id })
    const [settlement] = await match('match-settlements')
    assert.deepEqual(settlement.trialAction, { name: move.name, kind: 'compaction', proof })
    assert.deepEqual(settlement.awards.map(({ id, xp }) => [id, xp]), [[provider.id, 32]])
    assert.deepEqual((await match('match-settlements')).find(receipt => receipt.id === base.id).followUpGear, [])
    await match('growth-accept', trial, 422)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('dispatches a saved teammate build and credits native delegated work', { timeout: 45_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-delegation-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    await writeFile(join(directory, 'README.md'), 'Delegated delivery manifest\n')
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const open = () => host.request('/api/loadout-fixture-session', { presetId: 'standard' })
    const { sessionId } = await open()
    const { sessionId: unrelatedId } = await open()
    const match = async (id, action, data) => (await host.request(endpoint, { sessionId: id, action, ...data })).value
    const settlements = id => match(id, 'match-settlements')
    const catalog = (await host.request(endpoint)).value
    const note = catalog.equipment.find(item => item.name === 'fixture_standing_note')
    const hero = catalog.presets.find(item => item.id === 'recruiting-advisor')
    const status = hero.tools[note.id]
    const source = (status.sourceChoices ?? [status]).find(item => item.sourceName === 'standing-variant')
    const { presetId } = await match(sessionId, 'plan-save', { name: '交付核对出装', draft: {
      presetId: hero.id, equipmentIds: [note.id], equipmentSources: { [note.id]: source.sourceId },
    } })
    const roster = await match(sessionId, 'teammate-roster')
    assert.deepEqual(new Set(roster.map(item => item.id)), new Set(catalog.presets.map(item => item.id)))
    const build = roster.find(item => item.id === hero.id).builds.find(item => item.id === presetId)
    assert.equal(build.name, '交付核对出装')
    assert.equal(build.gear[0].id, note.id)
    await host.request(turnEndpoint, { sessionId, workingDirectory: directory })
    await host.request(turnEndpoint, { sessionId, selectOnly: true })
    const request = { sessionId, action: 'teammate-launch', presetId, title: '核对交付材料',
      task: '核对队友交付材料\n使用出装标记', launchId: randomUUID().replaceAll('-', '') }
    await host.request(endpoint, { ...request, presetId: 'unknown-hero' }, 422)
    await host.request('/api/loadout-fixture-shadow', { sessionId, mode: 'hold-result', tool: note.name, child: true })
    const feed = await host.requestRaw(endpoint + '/session-events?' + new URLSearchParams({ sessionId }),
      { signal: AbortSignal.timeout(8000) })
    assert.equal(feed.status, 200)
    const reader = feed.body.getReader()
    let address
    try {
      await reader.read()
      const [first, duplicate] = await Promise.all([host.request(endpoint, request), host.request(endpoint, request)])
      address = first.value
      assert.deepEqual(address, duplicate.value)
      let parent
      do {
        const { value, done } = await reader.read()
        assert.ok(!done && value, 'Parent updates ended before the teammate call')
        parent = await equipmentIn(host, sessionId)
      } while (!parent.teammateActivity?.some(item => item.tool.id === note.id))
      assert.equal(parent.activity, undefined)
      assert.equal(parent.teammateActivity.length, 1)
      const [live] = parent.teammateActivity
      assert.deepEqual(live.address, address)
      assert.equal(live.hero.id, hero.id)
      assert.equal(live.hero.name, hero.name)
      assert.equal(live.count, 1)
      assert.deepEqual([live.tool.id, live.tool.name, live.tool.sourceId, live.tool.sourceName],
        [note.id, note.name, source.sourceId, 'standing-variant'])
      assert.equal((await equipmentIn(host, unrelatedId)).teammateActivity, undefined)
      const child = await equipmentIn(host, address.childSessionId)
      assert.ok(child.activity.some(call => call.id === note.id && call.state === 'running'))
      assert.equal(child.teammateActivity, undefined)
      await host.request(turnEndpoint, { sessionId: address.childSessionId, finish: true })
      assert.equal((await equipmentIn(host, sessionId)).teammateActivity, undefined)
    } finally {
      await reader.cancel().catch(() => {})
    }
    const { childSessionId: childId } = address
    async function waitForSettlements(id, count) {
      let result
      const limit = Date.now() + 8_000
      do {
        result = await settlements(id)
        if (result.length >= count) return result
        await delay(120)
      } while (Date.now() < limit)
      assert.fail('Native teammate did not settle the expected work')
    }
    const [initial] = await waitForSettlements(childId, 1)
    assert.deepEqual(initial.awards.filter(item => !item.kind || item.kind === 'tool').map(({ name, xp }) => [name, xp]),
      [['招聘顾问', 12], ['glob', 8], ['fixture_standing_note', 8]])
    assert.equal(initial.delegation.ancestors[0], sessionId)
    assert.equal(initial.delegation.label, '核对交付材料')
    assert.deepEqual((await host.request(endpoint, request)).value, address)
    assert.equal((await settlements(sessionId))[0].id, initial.id)
    assert.deepEqual(await settlements(unrelatedId), [])
    await host.request('/api/loadout-fixture-delegation', { sessionId, childId })
    const receipts = await waitForSettlements(sessionId, 2)
    assert.equal(receipts.length, 2)
    const [followUp] = receipts
    assert.notEqual(followUp.id, initial.id)
    assert.equal(followUp.sessionId, childId)
    assert.equal(followUp.teammate, true)
    assert.deepEqual(followUp.awards.map(({ name, xp, totalXp }) => [name, xp, totalXp]),
      [['招聘顾问', 12, 24], ['glob', 8, 16], ['file-search', 4, 8]])
    assert.equal((await match(sessionId, 'match-growth')).hero.xp, 0)
    assert.equal((await equipmentIn(host, sessionId)).settlement.receipt.id, followUp.id)
    assert.deepEqual(await settlements(unrelatedId), [])
    const { events, presetId: actualPresetId } = await host.request('/api/loadout-fixture-history?sessionId=' + childId)
    assert.equal(actualPresetId, presetId)
    assert.ok(events.some(event => event.type === 'user/message' && event.data.source.kind === 'agent-message' &&
      event.data.source.senderSessionId === sessionId))
    assert.equal(events.filter(event => event.type === 'tool/result' && !event.data.message.isError &&
      event.data.message.content.some(part => part.type === 'text' && part.text.includes('README.md'))).length, 2)
    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual((await settlements(sessionId)).map(item => item.id), [followUp.id, initial.id])
    assert.deepEqual(await settlements(unrelatedId), [])
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('shows the native Team tool gate and restores a legacy hero on DSH 0.2.2-rc.2', { timeout: 45_000 }, async t => {
  const { stdout: version } = await exec(binary, ['--version'])
  if (version.trim() !== '0.2.2-rc.2') return t.skip('Team tool admission is specific to this runtime')
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-team-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    const legacy = join(env.DSH_HOME, '.agent-presets', 'legacy-team')
    const module = '@deepseek-ai/dsh-tool-subagent-control'
    await mkdir(legacy, { recursive: true })
    await writeFile(join(legacy, 'preset.yml'), 'name: 旧版队伍助手\n')
    await writeFile(join(legacy, 'agent.cordis.yml'), JSON.stringify([
      { id: 'control', name: module }, { id: 'list-agents', name: module + '/list-agents' },
    ]))
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload) => (await host.request(endpoint, { action, ...payload })).value
    const legacyPreview = await invoke('legacy-preset-preview', { id: 'legacy-team' })
    assert.deepEqual(legacyPreview.replacements, [{ from: module + '/list-agents', to: module, included: true }])
    assert.deepEqual(legacyPreview.missing, [])
    await invoke('legacy-preset-attach', { id: 'legacy-team', revision: legacyPreview.revision })
    const legacyTools = await host.request('/api/loadout-fixture-tools?id=legacy-team')
    assert.equal(legacyTools.filter(name => name === 'list_agents').length, 1)

    const { sessionId } = await host.request('/api/loadout-fixture-session', { presetId: 'standard' })
    const match = (action, payload) => invoke(action, { sessionId, ...payload })
    const lookup = async () => (await equipmentIn(host, sessionId)).tools.find(item => item.name === 'team_task_list')
    const off = await lookup()
    assert.equal(off.conditional, true)
    assert.equal(off.activation, 'disabled')
    assert.deepEqual(off.roles, ['orchestration'])
    const catalog = (await host.request(endpoint)).value
    assert.equal(catalog.presets.find(item => item.id === 'standard').tools[off.id].conditional, true)
    const { choices } = await match('match-growth', { includeChoices: true })
    assert.equal(choices.find(item => item.id === off.id).timing, 'condition')
    const quest = await match('growth-accept', { mode: 'trial', gearId: off.id, title: '核对队伍任务列表' })
    const run = () => host.request(turnEndpoint, { sessionId, text: '核对队伍任务列表' })
    const enable = enabled => host.request('/api/loadout-fixture-team', { sessionId, enabled })
    await run()
    assert.equal((await match('match-growth')).quest.completed, undefined)
    assert.deepEqual(await enable(true), { enabled: true })
    assert.equal((await lookup()).activation, 'enabled')
    await run()
    const [record] = await match('match-settlements')
    assert.equal(record.awards.find(item => item.id === off.id).xp, 8)
    await match('growth-claim', { id: quest.id })
    assert.equal((await match('match-growth')).gear.find(item => item.id === off.id).xp, 32)
    await enable(false)
    assert.equal((await lookup()).activation, 'disabled')

    await enable(true)
    const taskRoute = '/api/loadout-fixture-team-task'
    const create = (subject, blockedBy) => host.request(taskRoute, { sessionId, create: { subject, description: subject, blockedBy } })
    const change = ({ id, revision }, action, fields) => host.request(taskRoute, { sessionId,
      update: { taskId: id, expectedRevision: revision, action, ...fields } })
    const complete = async task => change(await change(task, 'claim'), 'complete')
    const ready = await complete(await create('已完成的旧交付'))
    const other = await create('另一项交付')
    const target = await create('核对交付材料')
    assert.deepEqual((await match('match-growth')).teamTasks.map(item => item.id), [other.id, target.id])
    const selection = teamTaskId => ({ sessionId, action: 'growth-accept', mode: 'delivery', title: '验收原生队伍任务', teamTaskId })
    await host.request(endpoint, selection(ready.id), 422)
    const delivery = await match('growth-accept', selection(target.id))
    assert.equal(delivery.teamTask.id, target.id)
    const claim = { sessionId, action: 'growth-claim', id: delivery.id }
    await complete(other)
    await run()
    await host.request(endpoint, claim, 422)
    assert.equal((await match('match-growth')).quest.completed, undefined)
    const completed = await complete(target)
    assert.equal(completed.status, 'completed')
    const journal = async () => (await invoke('growth-journal')).active.find(item => item.id === delivery.id)
    let recorded
    for (let attempt = 0; attempt < 40; attempt++) {
      recorded = await journal()
      if (recorded.teamTask.revision === completed.revision) break
      await delay(50)
    }
    assert.equal(recorded.teamTask.revision, completed.revision)
    assert.equal(recorded.teamTask.status, 'completed')
    assert.equal((await equipmentIn(host, sessionId)).settlement.ready.id, delivery.id)
    const reopened = await change(completed, 'reopen')
    await host.request(endpoint, claim, 422)
    assert.equal((await journal()).teamTask.proof, undefined)
    assert.equal((await equipmentIn(host, sessionId)).settlement.ready, undefined)
    const recompleted = await complete(reopened)
    await enable(false)
    const before = (await match('match-growth')).hero.xp
    await match('growth-claim', { id: delivery.id })
    assert.equal((await match('match-growth')).hero.xp - before, 40)
    const [receipt] = await match('match-settlements')
    assert.equal(receipt.teamTask.revision, recompleted.revision)
    assert.equal(receipt.flag, undefined)
    assert.deepEqual(receipt.awards.map(item => [item.id, item.xp]), [['standard', 40]])
    await host.request(endpoint, claim, 422)

    await enable(true)
    await change(recompleted, 'reopen')
    await host.request(endpoint, selection(target.id), 422)
    const toDelete = await create('待撤回的交付')
    const revoked = await match('growth-accept', selection(toDelete.id))
    await change(await complete(toDelete), 'delete')
    await host.request(endpoint, { ...claim, id: revoked.id }, 422)
    assert.equal((await match('match-growth')).quest.teamTask.status, 'deleted')
    await match('growth-abandon', { id: revoked.id })

    await writeFile(join(directory, 'README.md'), 'Native shared task manifest\n')
    await host.request(turnEndpoint, { sessionId, workingDirectory: directory })
    const upstream = await create('整理材料清单')
    const assigned = await create('队友核对交付文件', [upstream.id])
    const dispatch = ({ id, revision }, presetId = 'recruiting-advisor') => ({ sessionId, action: 'teammate-launch', presetId,
      launchId: randomUUID().replaceAll('-', ''), teamTask: { id, revision } })
    const taskChoices = async () => (await equipmentIn(host, sessionId)).teamDispatchTasks
    assert.equal((await taskChoices()).find(item => item.id === assigned.id).reason, '等待依赖')
    await host.request(endpoint, dispatch(assigned), 422)
    await complete(upstream)
    assert.equal((await taskChoices()).find(item => item.id === assigned.id).available, true)
    const boardQuest = await match('growth-accept', selection(assigned.id))
    const launch = dispatch(assigned)
    const [first, repeated] = await Promise.all([host.request(endpoint, launch), host.request(endpoint, launch)])
    assert.deepEqual(first.value, repeated.value)
    const childId = first.value.childSessionId
    async function waitForTeammate(parentId, childId) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const receipts = await invoke('match-settlements', { sessionId: parentId })
        const receipt = receipts.find(item => item.sessionId === childId)
        if (receipt) return receipt
        await delay(100)
      }
      assert.fail('Native teammate did not settle its board task')
    }
    const childReceipt = await waitForTeammate(sessionId, childId)
    assert.equal(childReceipt.awards.find(item => item.id === 'recruiting-advisor').xp, 12)
    assert.ok(childReceipt.awards.some(item => item.name === 'team_task_update' && item.xp === 8))
    const { events: rootEvents } = await host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const taskHistory = rootEvents.filter(event => event.type === 'team/task' && event.data.task.id === assigned.id).map(event => event.data.task)
    assert.deepEqual(taskHistory.map(task => [task.status, task.ownerId]), [['pending', undefined], ['in_progress', childId], ['completed', childId]])
    assert.deepEqual((await host.request(endpoint, launch)).value, first.value)
    await change(taskHistory.at(-1), 'edit', { description: '交付清单已附核对记录' })
    const leadBefore = (await match('match-growth')).hero.xp
    await enable(false)
    const { flag } = await match('growth-claim', { id: boardQuest.id })
    assert.equal((await match('match-growth')).hero.xp - leadBefore, 40)
    assert.equal(flag.hero.id, 'standard')
    assert.equal(flag.teamwork.hero.id, 'recruiting-advisor')
    assert.deepEqual(flag.teamwork.address, first.value)
    assert.equal((await match('match-settlements'))[0].teamwork.taskId, assigned.id)
    await match('growth-display', { heroId: 'standard', id: flag.id })
    await match('growth-display', { heroId: 'recruiting-advisor', id: flag.id })
    const teammate = await host.request('/api/loadout-fixture-session', { presetId: 'recruiting-advisor' })
    assert.equal((await equipmentIn(host, teammate.sessionId)).heroFlag.partner, '标准模式')
    assert.deepEqual((await invoke('growth-flags'))[0].displayedFor, ['standard', 'recruiting-advisor'])
    await host.request(endpoint, { action: 'growth-display', heroId: 'ptc', id: flag.id }, 422)

    await enable(true)
    const approvedOnBehalf = await create('由队长确认的交付')
    const manualQuest = await match('growth-accept', selection(approvedOnBehalf.id))
    const delegated = await change(approvedOnBehalf, 'reassign', { owner: childId })
    await change(delegated, 'complete')
    assert.equal((await match('growth-claim', { id: manualQuest.id })).flag, undefined)

    const reversedId = teammate.sessionId
    await host.request(turnEndpoint, { sessionId: reversedId, selectOnly: true })
    await host.request('/api/loadout-fixture-team', { sessionId: reversedId, enabled: true })
    const reversed = await host.request(taskRoute, { sessionId: reversedId, create: { subject: '换位协作', description: '核对交付' } })
    const reversedQuest = await invoke('growth-accept', { ...selection(reversed.id), sessionId: reversedId })
    const reversedChild = await invoke('teammate-launch', { ...dispatch(reversed, 'standard'), sessionId: reversedId })
    await waitForTeammate(reversedId, reversedChild.childSessionId)
    const repeatedFlag = await invoke('growth-claim', { sessionId: reversedId, id: reversedQuest.id })
    assert.equal(repeatedFlag.flag, undefined)
    const mirror = await create('同预设协作')
    const mirrorQuest = await match('growth-accept', selection(mirror.id))
    const mirrorChild = await invoke('teammate-launch', dispatch(mirror, 'standard'))
    await waitForTeammate(sessionId, mirrorChild.childSessionId)
    assert.equal((await match('growth-claim', { id: mirrorQuest.id })).flag, undefined)
    assert.deepEqual((await invoke('growth-flags')).map(item => item.id), [flag.id])

    const racing = await create('更改中的共享任务')
    const gate = (release = false) => host.request('/api/loadout-fixture-team-launch-gate', { sessionId, release })
    const waiting = host.request(endpoint, dispatch(racing), 422)
    waiting.catch(() => {})
    let rejectedChild
    for (let attempt = 0; attempt < 50 && !rejectedChild; attempt++) {
      rejectedChild = (await gate()).childId
      if (!rejectedChild) await delay(100)
    }
    assert.ok(rejectedChild)
    await change(racing, 'edit', { description: '等待补充说明' })
    await gate(true)
    assert.match((await waiting).error.message, /共享任务已变化/)
    const { events: rejectedEvents } = await host.request('/api/loadout-fixture-history?sessionId=' + rejectedChild)
    assert.ok(!rejectedEvents.some(event => event.type === 'request/context' || event.type === 'tool/call'))
    assert.deepEqual(await match('match-settlements', { sessionId: rejectedChild }), [])
    assert.equal((await taskChoices()).find(item => item.id === racing.id).available, true)
    await host.stop()
    host = await startHost(env, patch)
    const [restoredFlag] = await invoke('growth-flags')
    assert.equal(restoredFlag.id, flag.id)
    assert.deepEqual(restoredFlag.displayedFor, ['standard', 'recruiting-advisor'])
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('imports unindexed bundles and standalone equipment after reviewing their sources', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-direct-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home') }
  const patch = join(directory, 'fixture.yml')
  let host
  let registry
  try {
    registry = await startMarket(directory)
    await writeFile(patch, '[]')
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => host.request(endpoint, { action, ...payload }, status)
    assert.equal((await invoke('market-indexes')).value.available, false)
    await invoke('plugin-review', { spec: './relative-directory' }, 422)
    const git = (await invoke('plugin-review', { spec: 'git+https://example.test/plugin.git#v1' })).value
    assert.equal(git.kind, 'git')
    assert.equal(git.host, 'example.test')
    const archive = (await invoke('plugin-review', { spec: registry.tarball })).value
    assert.equal(archive.kind, 'tarball')
    assert.equal(archive.spec, registry.tarball)
    assert.equal(registry.requests.length, 0)
    const byName = (await invoke('plugin-review', {
      spec: marketPackage + '@^1', registry: registry.origin + '/registry/',
    })).value
    assert.equal(byName.kind, 'registry')
    assert.equal(byName.spec, marketPackage + '@' + marketVersion)
    assert.equal(byName.registry, registry.origin + '/registry/')
    const local = (await invoke('plugin-review', { spec: 'file:' + registry.packageDir })).value
    assert.equal(local.kind, 'path')
    assert.equal(local.name, marketPackage)
    assert.equal(local.version, marketVersion)
    await invoke('plugin-import', { source: { ...local, spec: archive.spec } }, 422)
    await invoke('plugin-import', { source: { ...local, version: '0.0.0' } }, 422)
    assert.ok(!(await host.request(endpoint)).value.presets.some(preset => preset.id === 'fixture-wayfinder'))
    const installed = (await invoke('plugin-import', { source: local })).value
    assert.ok(['applied', 'restart-required'].includes(installed.application))
    assert.equal(installed.bundle, marketPackage)
    if (installed.application === 'restart-required') {
      await host.stop()
      host = await startHost(env, patch)
    }
    const catalog = (await host.request(endpoint)).value
    const hero = catalog.presets.find(preset => preset.id === 'fixture-wayfinder')
    const tool = catalog.equipment.find(item => item.name === 'market_wayfinder')
    assert.ok(hero && !hero.broken, hero?.broken)
    assert.equal(hero.tools[tool.id].state, 'included')
    const composed = (await host.request(endpoint, { presetId: 'recruiting-advisor', equipmentIds: [tool.id] })).value
    assert.match(composed.presetId, /^loadout-/)

    const profile = join(env.DSH_HOME, 'profiles', 'web')
    const snapshot = () => Promise.all(['package.json', 'pnpm-lock.yaml'].map(file => readFile(join(profile, file), 'utf8')))
    const beforeModule = await snapshot()
    const registryUrl = registry.origin + '/registry/'
    for (const refused of ['9.0.0', '8.0.0']) {
      const review = (await invoke('plugin-review', { spec: moduleName + '@' + refused, registry: registryUrl })).value
      assert.equal(review.standalone, true)
      await invoke('plugin-import', { source: review }, 422)
      assert.deepEqual(await snapshot(), beforeModule)
    }
    const damaged = (await invoke('plugin-review', {
      spec: moduleName + '@' + moduleVersion, registry: registry.origin + '/bad-registry/',
    })).value
    await invoke('plugin-import', { source: damaged }, 422)
    assert.deepEqual(await snapshot(), beforeModule)
    const moduleSource = (await invoke('plugin-review', { spec: moduleName + '@^1', registry: registryUrl })).value
    assert.equal(moduleSource.standalone, true)
    assert.equal(moduleSource.spec, moduleName + '@' + moduleVersion)
    assert.equal(moduleSource.registry, registryUrl)
    await invoke('plugin-import', { source: { ...moduleSource, standalone: false } }, 422)
    const installedModule = (await invoke('plugin-import', { source: moduleSource })).value
    assert.equal(installedModule.module, moduleName)
    assert.equal(installedModule.version, moduleVersion)
    const [manifestText] = await snapshot()
    const manifest = JSON.parse(manifestText)
    assert.equal(manifest.dependencies[moduleName], moduleSource.archive?.url ?? moduleVersion)
    assert.ok(!manifest.dsh.profile.bundles.includes(moduleName))
    if (installedModule.application === 'restart-required') {
      await host.stop()
      host = await startHost(env, patch)
    }
    const installedCatalog = (await host.request(endpoint)).value
    assert.ok(!installedCatalog.equipment.some(item => item.name === 'standalone_skymark'))
    const moduleCard = installedCatalog.equipment.find(item => item.id === 'module:' + moduleName)
    assert.equal(moduleCard?.version, moduleVersion)
    assert.equal(moduleCard.kind, 'module')
    assert.equal(moduleCard.module, moduleName)
    assert.deepEqual(moduleCard.roles, ['scout'])
    assert.ok(moduleCard.summary.includes('marker'))
    assert.ok(!installedCatalog.equipment.some(item => item.id === 'module:' + marketPackage))
    const recruiting = installedCatalog.presets.find(hero => hero.id === 'recruiting-advisor')
    assert.equal(recruiting.tools[moduleCard.id].state, 'configure')
    await host.request(endpoint, { presetId: recruiting.id, equipmentIds: [moduleCard.id] }, 422)
    const config = { title: '无索引星标', text: JSON.stringify({ name: moduleName, config: { marker: 'sky' } }) }
    const reviewed = (await invoke('equipment-review', config)).value
    await invoke('equipment-save', { ...config, reviewedId: reviewed.id })
    const moduleBuild = (await host.request(endpoint, { presetId: 'recruiting-advisor', equipmentIds: [reviewed.id] })).value
    const moduleCatalog = (await host.request(endpoint)).value
    const skymark = moduleCatalog.equipment.find(item => item.name === 'standalone_skymark')
    assert.deepEqual(moduleCatalog.equipment.find(item => item.id === reviewed.id)?.roles, ['scout'])
    assert.ok(skymark?.sources.includes(moduleBuild.presetId))
    assert.ok(!skymark.sources.includes('recruiting-advisor'))

    await host.stop()
    const archiveRoot = join(directory, 'archive')
    const archiveEnv = { ...env, DSH_HOME: join(archiveRoot, 'home') }
    await mkdir(archiveRoot)
    await installProfile(archiveRoot, archiveEnv)
    host = await startHost(archiveEnv, patch)
    const confirmedArchive = (await invoke('plugin-review', { spec: registry.tarball })).value
    const archiveInstall = (await invoke('plugin-import', { source: confirmedArchive })).value
    assert.ok(['applied', 'restart-required'].includes(archiveInstall.application))
    assert.equal(archiveInstall.bundle, marketPackage)
    assert.ok(registry.requests.includes(new URL(registry.tarball).pathname))
    const localModule = (await invoke('plugin-review', { spec: registry.moduleDir })).value
    assert.equal(localModule.kind, 'path')
    assert.equal(localModule.standalone, true)
    const localModuleInstall = (await invoke('plugin-import', { source: localModule })).value
    assert.equal(localModuleInstall.module, moduleName)
    assert.equal(localModuleInstall.version, moduleVersion)
    const archiveManifest = JSON.parse(await readFile(join(archiveEnv.DSH_HOME, 'profiles/web/package.json'), 'utf8'))
    assert.ok(!archiveManifest.dsh.profile.bundles.includes(moduleName))
  } finally {
    await host?.stop()
    await registry?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

async function equipmentIn(host, sessionId) {
  return (await host.request(endpoint + '/session?' + new URLSearchParams({ sessionId }))).value
}

test('Lighthouse starts two real loadouts without sending, and awards the delivery combo once', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-lighthouse-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home') }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const starter = (route, launchId, status) => host.request(endpoint, { action: 'growth-starter-open', route, launchId }, status)
    const invoke = async (sessionId, action, payload, status) =>
      (await host.request(endpoint, { sessionId, action, ...payload }, status)).value
    const cards = join(env.DSH_HOME, 'profiles/web/agent-loadouts/lighthouse-supply-run')
    await starter('unknown', '0'.repeat(32), 422)
    await starter('delivery', '../../', 422)
    await assert.rejects(readFile(join(cards, '02-lighthouse.md')), { code: 'ENOENT' })

    const launch = '1'.repeat(32)
    const [recon, retried] = await Promise.all([starter('recon', launch), starter('recon', launch)])
    assert.deepEqual(recon, retried)
    assert.equal(recon.value.questError, undefined)
    const deliveryResponse = await host.requestRaw(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'growth-starter-open', route: 'delivery', launchId: '2'.repeat(32) }),
    })
    const delivery = await deliveryResponse.json()
    assert.equal(deliveryResponse.status, 200, JSON.stringify(delivery))
    assert.equal(delivery.value.questError, undefined)
    assert.notEqual(recon.value.sessionId, delivery.value.sessionId)
    assert.match(await readFile(join(cards, '02-lighthouse.md'), 'utf8'), /Gold beacon \/ 金色航标/)

    const histories = await Promise.all([recon, delivery].map(({ value }) =>
      host.request('/api/loadout-fixture-history?sessionId=' + value.sessionId)))
    assert.ok(histories[0].workspaceId)
    assert.equal(histories[0].workspaceId, histories[1].workspaceId)
    assert.equal((await host.request(endpoint)).value.lighthouseWorkspaceId, histories[0].workspaceId)
    for (const { events } of histories) {
      assert.equal(events.some(event => event.type === 'turn/start' || event.type === 'user/message'), false)
    }

    let bannerId
    for (const [index, [result, mode, expectedTools]] of [
      [recon, 'trial', ['glob']],
      [delivery, 'combo', ['glob', 'present']],
    ].entries()) {
      const { sessionId } = result.value
      const combo = mode === 'combo'
      const { questTask } = await equipmentIn(host, sessionId)
      assert.equal(questTask.mode, mode)
      assert.equal(questTask.title, combo ? 'Lighthouse Supply Run · Delivery' : '灯塔补给行动 · 侦察')
      assert.match(questTask.input, combo ? /Find the North Shore Lighthouse/ : /找到北岸灯塔/)
      const tools = await host.request('/api/loadout-fixture-tools?id=' + histories[index].presetId)
      assert.equal(tools.includes('present'), combo)
      const requestId = randomUUID()
      const prompt = await invoke(sessionId, 'match-record', { questId: questTask.id, input: questTask.input, requestId })
      await host.request(turnEndpoint, { sessionId, text: prompt.text, requestId })
      let growth
      for (let attempt = 0; attempt < 100; attempt++) {
        growth = await invoke(sessionId, 'match-growth')
        if (growth.quest?.completed !== undefined) break
        await delay(50)
      }
      const report = await invoke(sessionId, 'match-report')
      assert.deepEqual(report.turns[0].entries.filter(item => item.type === 'tool').map(item => item.name), expectedTools)
      assert.ok(growth.quest?.completed !== undefined, JSON.stringify(report.turns[0]))
      const { events } = await host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
      const presented = events.filter(event => event.type === 'deliverables/presented')
      assert.equal(presented.length, combo ? 1 : 0)
      if (combo) assert.equal(basename(presented[0].data.files[0].path), '02-lighthouse.md')
      const followUp = report.turns[0].followUp
      assert.ok(followUp.provenLoadout)
      if (combo) await invoke(sessionId, 'match-proven-loadout', { receiptId: questTask.id }, 422)
      const reward = await invoke(sessionId, 'growth-claim', { id: questTask.id })
      assert.equal(Boolean(reward.flag), combo)
      if (combo) {
        bannerId = reward.flag.id
        const afterClaim = await invoke(sessionId, 'match-growth')
        const listPlans = async () => (await host.request(endpoint)).value.plans
        const beforePlans = await listPlans()
        const historyPath = sourceId => '/api/loadout-fixture-history?sessionId=' + sourceId
        const afterClaimEvents = (await host.request(historyPath(sessionId))).events
        const ordinary = await invoke(sessionId, 'match-proven-loadout', { receiptId: followUp.id })
        assert.equal(ordinary.kind, 'round')
        assert.equal(ordinary.hero.id, 'standard')
        assert.equal(ordinary.turn, 1)
        assert.deepEqual(ordinary.deliverables, [{ name: '02-lighthouse.md', turn: 1 }])
        const usedTools = report.turns[0].entries.filter(item => item.type === 'tool')
        assert.deepEqual(new Set(ordinary.gear.map(item => item.id)), new Set(usedTools.map(item => item.id)))
        const searchTool = report.turns[0].entries.find(item => item.type === 'tool' && item.name === 'glob')
        assert.ok(ordinary.gear.some(item => item.id === searchTool.id && item.sourceId === searchTool.sourceId && item.selected))
        const searchOnly = await invoke(sessionId, 'match-proven-loadout', { receiptId: followUp.id, gearIds: [searchTool.id] })
        assert.ok(searchOnly.draft)
        assert.deepEqual(searchOnly.gear.filter(item => item.selected).map(item => item.id), [searchTool.id])
        await invoke(sessionId, 'match-proven-loadout', { receiptId: followUp.id, gearIds: [] }, 422)
        await invoke(sessionId, 'match-proven-loadout', { receiptId: followUp.id, gearIds: [searchTool.id, searchTool.id] }, 422)
        await invoke(sessionId, 'match-proven-loadout', { receiptId: followUp.id, gearIds: ['not-used'] }, 422)
        await invoke(recon.value.sessionId, 'match-proven-loadout', { receiptId: followUp.id }, 422)
        const history = await invoke(sessionId, 'match-settlements-page')
        assert.ok(history.receipts.find(item => item.id === questTask.id).provenLoadout)
        const proven = await invoke(sessionId, 'match-proven-loadout', { receiptId: questTask.id })
        assert.equal(proven.kind, 'combo')
        assert.deepEqual(proven.deliverables, ordinary.deliverables)
        assert.deepEqual(new Set(proven.gear.map(item => item.id)), new Set([searchTool.id, 'present']))
        assert.ok(proven.draft)
        assert.ok(proven.comparison)
        assert.deepEqual(await invoke(sessionId, 'match-growth'), afterClaim)
        assert.deepEqual(await listPlans(), beforePlans)
        assert.deepEqual((await host.request(historyPath(sessionId))).events, afterClaimEvents)

        const plan = await invoke(sessionId, 'plan-save', { name: 'Lighthouse proven loadout', draft: proven.draft })
        const fromProof = await host.request('/api/loadout-fixture-session', {
          presetId: plan.presetId, workspacePath: cards,
        })
        await invoke(fromProof.sessionId, 'verify-live', { presetId: plan.presetId })
        assert.ok((await listPlans()).some(item => item.id === plan.id))
        assert.equal((await host.request(historyPath(fromProof.sessionId))).events.some(item => item.type === 'turn/start'), false)

        const fork = await invoke(undefined, 'continue', { sourceSessionId: sessionId, presetId: 'standard' })
        const inherited = await invoke(fork.sessionId, 'match-report')
        assert.ok(inherited.turns.length && inherited.turns.every(item => item.inherited && !item.followUp?.provenLoadout))
        await invoke(fork.sessionId, 'match-proven-loadout', { receiptId: followUp.id }, 422)
      }
      await invoke(sessionId, 'growth-claim', { id: questTask.id }, 422)
    }
    assert.deepEqual(await starter('recon', launch), recon)
    const replay = (await starter('delivery', '3'.repeat(32))).value
    assert.equal(replay.questError, undefined)
    const { quest } = await invoke(replay.sessionId, 'match-growth')
    assert.equal(quest.comboReward.flag, 'record')
    assert.equal(quest.comboReward.existing.id, bannerId)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('Lighthouse same-task comparison keeps two original attempts and their native evidence', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-lighthouse-compare-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const read = filter => invoke('lighthouse-comparison', filter)
    const open = (arm, launchId, comparisonId, status) =>
      invoke('lighthouse-comparison-open', { arm, launchId, comparisonId }, status)
    const history = id => host.request('/api/loadout-fixture-history?sessionId=' + id)
    const armOf = (view, id) => view.arms.find(arm => arm.id === id)
    const rank = async () => (await host.request(endpoint)).value.presets.find(hero => hero.id === 'standard').rank?.xp ?? 0
    const launchA = 'a'.repeat(32)
    const launchB = 'b'.repeat(32)
    const preview = await read({ prototype: true })
    assert.deepEqual(preview.arms.map(arm => [arm.id, arm.status]), [['recon', 'unopened'], ['delivery', 'unopened']])
    assert.match(preview.task, /^【灯塔同题对照】\n/)
    await open('unknown', launchA, undefined, 422)
    await open('recon', '../', undefined, 422)
    const xpBefore = await rank()
    const [recon, retry] = await Promise.all([open('recon', launchA), open('recon', launchA)])
    assert.deepEqual(recon, retry)
    assert.equal(recon.task, preview.task)
    assert.ok(recon.requestId)
    const originalId = recon.id
    const filter = { comparisonId: originalId }
    const pending = await read()
    assert.equal(pending.id, originalId)
    assert.equal(armOf(pending, 'recon').status, 'waiting')
    assert.equal(armOf(pending, 'recon').sessionId, recon.sessionId)
    assert.equal(armOf(pending, 'delivery').status, 'unopened')
    assert.equal(await rank(), xpBefore)
    const reconHistory = await history(recon.sessionId)
    assert.ok(reconHistory.workspaceId)
    assert.ok(reconHistory.workspacePath)
    assert.ok(!reconHistory.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
    const linked = await equipmentIn(host, recon.sessionId)
    assert.deepEqual(linked.lighthouseComparison, { id: originalId, arm: 'recon', task: recon.task })
    assert.equal((await read({ sessionId: recon.sessionId })).id, originalId)

    await host.request('/api/loadout-fixture-shadow', { sessionId: recon.sessionId, mode: 'hold-result', tool: 'glob' })
    const reconTurn = host.request(turnEndpoint, { sessionId: recon.sessionId, text: recon.task, requestId: randomUUID() })
    reconTurn.catch(() => {})
    try {
      let held
      for (let attempt = 0; attempt < 100; attempt++) {
        held = (await host.request(turnEndpoint, { sessionId: recon.sessionId, gateStatus: true })).held
        if (held) break
        await delay(40)
      }
      assert.ok(held)
      assert.equal(armOf(await read(filter), 'recon').status, 'running')
    } finally {
      await host.request(turnEndpoint, { sessionId: recon.sessionId, finish: true })
      await reconTurn
    }
    const first = await read(filter)
    const doneRecon = armOf(first, 'recon')
    assert.equal(doneRecon.status, 'complete')
    assert.equal(doneRecon.turn, 1)
    assert.equal(armOf(first, 'delivery').status, 'unopened')
    assert.deepEqual(doneRecon.entries.map(entry => [entry.name, entry.state]),
      [['glob', 'completed'], ['ask_user_question', 'completed']])
    assert.ok(doneRecon.entries.find(entry => entry.name === 'glob').sourceNames?.length)
    assert.deepEqual(doneRecon.entries.find(entry => entry.name === 'ask_user_question').choices, ['先保留路径'])
    assert.deepEqual(doneRecon.deliverables, [])
    await invoke('match-report', { sessionId: recon.sessionId })
    const xpAfterRecon = await rank()

    const delivery = await open('delivery', launchB, originalId)
    assert.notEqual(delivery.sessionId, recon.sessionId)
    assert.notEqual(delivery.requestId, recon.requestId)
    assert.equal(delivery.task, recon.task)
    assert.deepEqual(await open('delivery', launchA, originalId), delivery)
    assert.equal(await rank(), xpAfterRecon)
    const deliveryHistory = await history(delivery.sessionId)
    assert.notEqual(deliveryHistory.workspaceId, reconHistory.workspaceId)
    assert.notEqual(deliveryHistory.workspacePath, reconHistory.workspacePath)
    assert.ok(!deliveryHistory.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
    for (const filename of ['01-waystation.md', '02-lighthouse.md', '03-old-bridge.md']) {
      const left = await readFile(join(reconHistory.workspacePath, filename), 'utf8')
      const right = await readFile(join(deliveryHistory.workspacePath, filename), 'utf8')
      assert.equal(right, left)
    }
    const equips = async ({ presetId }) => host.request('/api/loadout-fixture-tools?id=' + presetId)
    assert.ok(!(await equips(reconHistory)).includes('present'))
    assert.ok((await equips(deliveryHistory)).includes('present'))

    await host.request(turnEndpoint, { sessionId: delivery.sessionId, text: delivery.task, requestId: delivery.requestId })
    const complete = await read(filter)
    assert.deepEqual(armOf(complete, 'recon'), doneRecon)
    const otherLanguage = await host.requestRaw(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'lighthouse-comparison', ...filter }),
    })
    assert.equal(otherLanguage.status, 200)
    assert.equal((await otherLanguage.json()).value.task, recon.task)
    const doneDelivery = armOf(complete, 'delivery')
    assert.equal(doneDelivery.status, 'complete')
    assert.equal(doneDelivery.turn, 1)
    assert.deepEqual(doneDelivery.entries.map(entry => [entry.name, entry.state]), [['glob', 'completed'], ['present', 'completed']])
    assert.ok(doneDelivery.entries.find(entry => entry.name === 'present').sourceNames?.length)
    assert.deepEqual(doneDelivery.deliverables, [{ name: '02-lighthouse.md', turn: 1 }])
    const presented = (await history(delivery.sessionId)).events.find(event => event.type === 'deliverables/presented')
    assert.equal(presented.data.files[0].path, join(deliveryHistory.workspacePath, '02-lighthouse.md'))

    const { items: lighthouseHistory } = await invoke('comparison-history', { kind: 'lighthouse' })
    assert.equal(lighthouseHistory.length, 1)
    const lighthouseCard = lighthouseHistory[0]
    assert.equal(lighthouseCard.id, originalId)
    assert.equal(lighthouseCard.kind, 'lighthouse')
    assert.deepEqual(armOf(lighthouseCard, 'recon').choices, ['先保留路径'])
    assert.deepEqual(armOf(lighthouseCard, 'delivery').deliverables, doneDelivery.deliverables)
    assert.equal(armOf(lighthouseCard, 'delivery').sessionId, delivery.sessionId)
    const reuseLighthouse = arm => invoke('comparison-loadout-preview', { kind: 'lighthouse', comparisonId: originalId, arm })
    const reconDraft = await reuseLighthouse('recon')
    const deliveryDraft = await reuseLighthouse('delivery')
    assert.equal(reconDraft.sessionId, recon.sessionId)
    assert.ok(reconDraft.draft)
    assert.ok(!reconDraft.draft.equipmentIds.includes('present'))
    assert.equal(deliveryDraft.sessionId, delivery.sessionId)
    assert.ok(deliveryDraft.draft.equipmentIds.includes('present'))
    assert.deepEqual(deliveryDraft.deliverables, doneDelivery.deliverables)

    await host.request(turnEndpoint, { sessionId: delivery.sessionId, text: 'Fixture follow-up [0-9][0-9]-*.md' })
    assert.deepEqual(armOf(await read(filter), 'delivery'), doneDelivery)
    const fork = await invoke('continue', { sourceSessionId: delivery.sessionId, presetId: 'standard' })
    assert.ok((await history(fork.sessionId)).inherited > 0)
    assert.equal(await read({ sessionId: fork.sessionId }), null)

    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual((await read()).arms, complete.arms)
    assert.deepEqual(await open('recon', launchB, originalId), recon)
    assert.equal((await read({ sessionId: delivery.sessionId })).id, originalId)

    const edited = await open('delivery', 'c'.repeat(32))
    assert.notEqual(edited.id, originalId)
    await host.request(turnEndpoint, { sessionId: edited.sessionId,
      text: edited.task + '\nOnly for a separate experiment.', requestId: edited.requestId })
    const editedStatus = armOf(await read({ comparisonId: edited.id }), 'delivery')
    assert.equal(editedStatus.status, 'unavailable')
    assert.equal(editedStatus.reason, 'changed-task')
    assert.ok(!editedStatus.deliverables?.length)
    assert.ok((await history(edited.sessionId)).events.some(event => event.type === 'deliverables/presented'))
    await host.request(turnEndpoint, { sessionId: edited.sessionId, text: edited.task, requestId: randomUUID() })
    assert.deepEqual(armOf(await read({ comparisonId: edited.id }), 'delivery'), editedStatus)
    assert.deepEqual((await read(filter)).arms, complete.arms)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('field playbooks preview read-only and add a real handoff decision to the same task', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-playbook-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await writeFile(join(directory, 'handoff.md'), '# Lighthouse handoff summary\n')
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const preview = async (id, options = {}, status) =>
      (await host.request(endpoint, { action: 'field-playbook-preview', id, ...options }, status)).value
    const saved = async () => (await host.request(endpoint)).value.saved
    const existing = await saved()
    await preview('unknown', {}, 422)
    const direct = await preview('direct')
    const review = await preview('review', { againstDraft: direct.draft })
    assert.equal(direct.draft.presetId, 'standard')
    assert.deepEqual(direct.draft.equipmentIds, ['present'])
    assert.equal(review.draft.presetId, 'standard')
    assert.deepEqual([...review.draft.equipmentIds].sort(), ['present', 'review'])
    const effect = review.comparison.gained.find(card => card.id === 'review')
    assert.equal(effect?.kind, 'effect')
    assert.deepEqual(effect.decisions.map(([label]) => label), ['确认交付', '退回修改'])

    const both = await preview('evidence-review', { againstDraft: direct.draft })
    assert.equal(both.draft.presetId, 'standard')
    assert.deepEqual(both.draft.equipmentIds, ['present', 'evidence', 'review'])
    const evidenceEffect = both.comparison.gained.find(card => card.id === 'evidence')
    assert.equal(evidenceEffect?.kind, 'effect')
    assert.deepEqual(evidenceEffect.decisions.map(([label]) => label), ['继续补证', '降级推荐', '暂缓提交'])
    assert.deepEqual(both.comparison.gained.find(card => card.id === 'review')?.decisions, effect.decisions)
    const fromReview = await preview('evidence-review', { againstDraft: review.draft })
    assert.ok(fromReview.comparison.gained.some(card => card.id === 'evidence'))
    assert.ok(!fromReview.comparison.gained.some(card => card.id === 'review'))
    assert.deepEqual(await saved(), existing)

    const prepare = async draft => (await host.request(endpoint, draft)).value.presetId
    const open = async presetId => (await host.request('/api/loadout-fixture-session', { presetId, workspacePath: directory })).sessionId
    const history = async sessionId => (await host.request('/api/loadout-fixture-history?sessionId=' + sessionId)).events
    const delivered = events => events.filter(event => event.type === 'deliverables/presented')
      .flatMap(event => event.data.files.map(file => basename(file.path)))
    const text = 'Hand off the workspace file handoff.md in this conversation.'
    const directSession = await open(await prepare(direct.draft))
    const before = await history(directSession)
    const liveComparison = await preview('review', { sourceSessionId: directSession })
    assert.equal(liveComparison.comparison.live, true)
    assert.ok(liveComparison.comparison.gained.some(card => card.id === 'review'))
    assert.deepEqual(await history(directSession), before)
    await host.request(turnEndpoint, { sessionId: directSession, text })
    assert.deepEqual(delivered(await history(directSession)), ['handoff.md'])

    const reviewPresetId = await prepare(review.draft)
    const questions = '/api/loadout-fixture-handoff-question'
    for (const choice of ['Revise draft', 'Confirm handoff']) {
      const sessionId = await open(reviewPresetId)
      const turn = host.request(turnEndpoint, { sessionId, text })
      turn.catch(() => {})
      let question
      for (let attempt = 0; attempt < 100; attempt++) {
        question = (await host.request(questions, { sessionId })).question
        if (question) break
        await delay(30)
      }
      assert.deepEqual(question?.options.map(option => option.label), ['Confirm handoff', 'Revise draft'])
      assert.deepEqual(delivered(await history(sessionId)), [])
      await host.request(questions, { sessionId, choice })
      await turn
      assert.deepEqual(delivered(await history(sessionId)), choice === 'Confirm handoff' ? ['handoff.md'] : [])
    }
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('stock heroes use the same Lighthouse card and show which delivery need each native session meets', { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-stock-hero-trial-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const fixture = { insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }
  const material = '02-lighthouse.md'
  const sample = 'lighthouse-hero-handoff-1-zh'
  const handoff = 'Handoff: Collect 2 cans of lamp oil and 1 signal flag at the second-floor lookout. Source: 02-lighthouse.md.'
  let host
  let recipient
  try {
    await writeFile(patch, JSON.stringify([fixture]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, fields, status) => (await host.request(endpoint, { action, ...fields }, status)).value
    const create = async (launchId, need, status = 200, language = 'en') => {
      const response = await host.requestRaw(endpoint, { method: 'POST',
        headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': language },
        body: JSON.stringify({ action: 'hero-trial-create', launchId, need }) })
      const payload = await response.json()
      assert.equal(response.status, status, JSON.stringify(payload))
      return payload.value
    }
    const read = comparisonId => invoke('hero-trial', { comparisonId })
    const open = (comparisonId, arm, status) => invoke('hero-trial-open', { comparisonId, arm }, status)
    const pendingTrials = () => invoke('lighthouse-pending-runs')
    const previewReplay = (comparisonId, status) => invoke('hero-trial-replay-preview', { comparisonId }, status)
    const openReplay = (comparisonId, token, status) => invoke('hero-trial-replay-open', { comparisonId, token }, status)
    const shareTrial = (comparisonId, status) => invoke('hero-trial-challenge-share', { comparisonId }, status)
    const shareHandoff = (comparisonId, arm, status) => invoke('hero-trial-handoff-report', { comparisonId, arm }, status)
    const compareHandoff = (comparisonId, arm, code, status) => invoke('hero-trial-handoff-compare', { comparisonId, arm, code }, status)
    const challengeCode = (sample, need) => 'DSHC2.' + Buffer.from(JSON.stringify({ sample, need })).toString('base64url')
    const reportCode = fields => 'DSHR1.' + Buffer.from(JSON.stringify(fields)).toString('base64url')
    const history = sessionId => host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const minimalShortcut = async sessionId => (await equipmentIn(host, sessionId)).heroTrial.canReplayMinimalDelivery
    const send = ({ sessionId, task, requestId }) => host.request(turnEndpoint, { sessionId, text: task, requestId })
    const byHero = (trial, hero) => trial.arms.find(arm => arm.id === hero)
    const traceTools = native => native.events.filter(event => event.type === 'tool/call')
    const traceFiles = native => native.events.filter(event => event.type === 'deliverables/presented').flatMap(event => event.data.files)
    const toolSource = (native, name) => {
      const call = traceTools(native).find(event => event.data.name === name)
      const source = native.events.find(event => event.type === 'plugin:dsh-agent-loadout/tool-source' && event.data.callSeq === call?.seq)
      assert.ok(source?.data.id && source.data.sourceId, `Missing native ${name} source record`)
      return [source.data.id, source.data.sourceId]
    }
    const launchId = value => value.repeat(32)
    const nativeSessions = async (home = env.DSH_HOME) => {
      const entries = await readdir(join(home, 'sessions'), { recursive: true, withFileTypes: true }).catch(error => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      return entries.filter(entry => entry.isDirectory() && entry.name.startsWith('session-')).map(entry => entry.name).sort()
    }

    const before = (await host.request(endpoint)).value
    const beforeSessions = await nativeSessions()
    assert.equal(before.heroTrialAvailable, true)
    assert.equal(before.lastHeroTrial, undefined)
    assert.equal(before.hasLighthouseRuns, undefined)
    assert.deepEqual(await pendingTrials(), { items: [] })
    assert.equal((await read()).id, undefined)
    await create('../', 'original', 422)
    await create(launchId('c'), 'both', 422)
    const [trial, duplicate] = await Promise.all([create(launchId('a'), 'original', 200, 'zh'), create(launchId('a'), 'original', 200, 'zh')])
    assert.deepEqual(duplicate, trial)
    const transfer = { kind: 'hero-trial', comparisonId: trial.id, arm: 'minimal-present' }
    const standardTransfer = { ...transfer, arm: 'standard' }
    assert.equal(trial.need, 'original')
    assert.equal(trial.material, material)
    assert.match(trial.task, /^【英雄同题试玩】\n/u)
    assert.ok(trial.task.includes(material))
    assert.deepEqual(trial.arms.map(({ id, status }) => [id, status]), [['standard', 'unopened'], ['minimal', 'unopened']])
    assert.equal((await read()).id, trial.id)
    assert.deepEqual((await host.request(endpoint)).value.lastHeroTrial, { id: trial.id, need: 'original' })
    assert.equal((await host.request(endpoint)).value.hasLighthouseRuns, true)
    assert.deepEqual(await pendingTrials(), { items: [] })
    await create(launchId('a'), 'summary', 422)
    await open(trial.id, 'ptc', 422)
    await open(trial.id, 'minimal-present', 422)
    await open(launchId('d'), 'standard', 422)
    await previewReplay(trial.id, 422)
    await shareTrial(trial.id, 422)
    await shareHandoff(trial.id, 'standard', 422)
    assert.deepEqual(await nativeSessions(), beforeSessions)

    const [standard, sameStandard] = await Promise.all([open(trial.id, 'standard'), open(trial.id, 'standard')])
    assert.deepEqual(sameStandard, standard)
    const minimal = await open(trial.id, 'minimal')
    assert.notEqual(standard.sessionId, minimal.sessionId)
    assert.notEqual(standard.workspaceId, minimal.workspaceId)
    assert.deepEqual(await nativeSessions(), [...beforeSessions, standard.sessionId, minimal.sessionId].sort())
    const pending = await pendingTrials()
    assert.equal(pending.before, undefined)
    assert.deepEqual(pending.items.map(({ kind, sessionId, arm, need }) => [kind, sessionId, arm, need]).sort((a, b) => a[2].localeCompare(b[2])), [
      ['hero', minimal.sessionId, 'minimal', 'original'], ['hero', standard.sessionId, 'standard', 'original'],
    ])
    assert.ok(pending.items.every(item => Number.isSafeInteger(item.createdAt) && item.createdAt > 0))
    const drafts = new Map()
    const waiting = await read(trial.id)
    const standardFields = { sample, need: 'original', arm: 'standard', originalAttached: true }
    await shareHandoff(trial.id, 'standard', 422)
    await compareHandoff(trial.id, 'standard', reportCode(standardFields), 422)
    await invoke('lesson-task-options', standardTransfer, 422)
    for (const [hero, opened] of [['standard', standard], ['minimal', minimal]]) {
      assert.equal(opened.id, trial.id)
      assert.equal(opened.task, trial.task)
      assert.ok(opened.requestId)
      const native = await history(opened.sessionId)
      assert.equal(native.presetId, hero)
      assert.equal(native.workspaceId, opened.workspaceId)
      assert.equal(native.inherited, 0)
      assert.ok(!native.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
      assert.equal(byHero(waiting, hero).status, 'waiting')
      assert.equal(byHero(waiting, hero).summary, undefined)
      assert.deepEqual((await equipmentIn(host, opened.sessionId)).heroTrial,
        { id: trial.id, arm: hero, task: trial.task, need: 'original', firstTaskPending: true })
      drafts.set(hero, native)
    }
    const materialBytes = await readFile(join(drafts.get('standard').workspacePath, material))
    assert.notEqual(drafts.get('standard').workspacePath, drafts.get('minimal').workspacePath)
    assert.match(materialBytes.toString(), /Second-floor lookout.*2 cans of lamp oil, 1 signal flag/su)
    assert.deepEqual(await readFile(join(drafts.get('minimal').workspacePath, material)), materialBytes)
    assert.deepEqual((await host.request(endpoint)).value.plans, before.plans)

    await send(standard)
    assert.deepEqual((await pendingTrials()).items.map(item => item.sessionId), [minimal.sessionId])
    const between = await read(trial.id)
    assert.equal(byHero(between, 'minimal').status, 'waiting')
    assert.deepEqual(byHero(between, 'standard').lessonTaskSource, standardTransfer)
    const completedStandard = (await equipmentIn(host, standard.sessionId)).heroTrial
    assert.deepEqual(completedStandard.lessonTaskSource, standardTransfer)
    assert.equal(completedStandard.firstTaskPending, undefined)
    assert.equal(completedStandard.canCopyHeroReport, true)
    assert.notEqual(between.canReplayMinimalDelivery, true)
    assert.equal(await minimalShortcut(minimal.sessionId), undefined)
    await previewReplay(trial.id, 422)
    assert.equal(between.canShareHeroChallenge, true)
    const singleRoundInvitation = await shareTrial(trial.id)
    assert.deepEqual(singleRoundInvitation, { code: challengeCode(sample, 'original') })
    assert.deepEqual(await read(trial.id), between)
    assert.deepEqual(await nativeSessions(), [...beforeSessions, standard.sessionId, minimal.sessionId].sort())
    const senderHandoff = await shareHandoff(trial.id, 'standard')
    const standardOutcome = { arm: 'standard', originalAttached: true, meetsNeed: true }
    assert.deepEqual(senderHandoff, { need: 'original', local: standardOutcome, code: reportCode(standardFields) })
    assert.deepEqual(JSON.parse(Buffer.from(senderHandoff.code.slice('DSHR1.'.length), 'base64url').toString('utf8')), standardFields)
    await shareHandoff(trial.id, 'minimal', 422)
    await shareHandoff(trial.id, 'ptc', 422)
    await send(minimal)
    assert.deepEqual(await pendingTrials(), { items: [] })
    const result = await read(trial.id)
    for (const [hero, opened] of [['standard', standard], ['minimal', minimal]]) {
      const native = await history(opened.sessionId)
      const arm = byHero(result, hero)
      const actualPrompt = native.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      const nativeText = native.events.filter(event => event.type === 'assistant/message')
        .flatMap(event => event.data.message.content.filter(block => block.type === 'text').map(block => block.text))
      assert.equal(actualPrompt?.data.content[0].text, trial.task)
      assert.ok(nativeText.includes(handoff))
      const names = hero === 'standard' ? ['read', 'present'] : ['bash']
      assert.deepEqual(traceTools(native).map(event => event.data.name), names)
      const nativeRead = native.events.find(event => event.type === 'tool/result')
      assert.match(JSON.stringify(nativeRead.data.message.content), /Second-floor lookout.*2 cans of lamp oil/u)
      assert.deepEqual(traceFiles(native).map(file => file.path), hero === 'standard' ? [join(native.workspacePath, material)] : [])
      assert.deepEqual(await readFile(join(native.workspacePath, material)), materialBytes)
      assert.equal(arm.sessionId, opened.sessionId)
      assert.equal(arm.status, 'complete')
      assert.equal(arm.materialState, 'verified')
      assert.equal(arm.summary, handoff)
      assert.equal(arm.originalAttached, hero === 'standard')
      assert.equal(arm.meetsNeed, hero === 'standard')
      assert.deepEqual(arm.deliverables.map(file => file.name), hero === 'standard' ? [material] : [])
      assert.deepEqual(arm.entries.map(item => [item.name, item.state]), names.map(name => [name, 'completed']))
    }

    const { code } = await shareTrial(trial.id)
    assert.equal(code, challengeCode(sample, 'original'))
    const payload = JSON.parse(Buffer.from(code.slice('DSHC2.'.length), 'base64url').toString('utf8'))
    assert.deepEqual(payload, { sample, need: 'original' })
    const recipientEnv = { ...env, DSH_HOME: join(directory, 'hero-recipient') }
    await installProfile(directory, recipientEnv)
    recipient = await startHost(recipientEnv, patch)
    const receive = async (action, fields, status = 200) => {
      const response = await recipient.requestRaw(endpoint, { method: 'POST',
        headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
        body: JSON.stringify({ action, ...fields }) })
      const result = await response.json()
      assert.equal(response.status, status, JSON.stringify(result))
      return result.value
    }
    const checkChallenge = (text, status) => receive('lighthouse-challenge-preview', { code: text }, status)
    const joinChallenge = (fields, status) => receive('lighthouse-challenge-open', fields, status)
    const recipientSessions = () => readdir(join(recipientEnv.DSH_HOME, 'sessions')).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    assert.deepEqual(await recipientSessions(), [])
    assert.deepEqual(await receive('lighthouse-pending-runs'), { items: [] })
    assert.equal((await recipient.request(endpoint)).value.lastHeroTrial, undefined)
    await receive('hero-trial', { comparisonId: trial.id }, 422)
    const forged = data => 'DSHC2.' + Buffer.from(JSON.stringify(data)).toString('base64url')
    for (const text of [code + '!', forged({ ...payload, extra: true }), forged({ ...payload, sessionId: minimal.sessionId }),
      challengeCode('lighthouse-hero-handoff-2-zh', 'original'), challengeCode(sample, 'both')]) {
      await checkChallenge(text, 422)
    }
    const checked = await checkChallenge(code)
    assert.equal(checked.kind, 'hero-trial')
    assert.equal(checked.sample, sample)
    assert.equal(checked.sampleLanguage, 'zh')
    assert.equal(checked.need, 'original')
    assert.equal(checked.task, trial.task)
    assert.match(checked.token, /^[a-f0-9]{64}$/u)
    const receiverLaunch = { code, token: checked.token, launchId: launchId('1'), arm: 'minimal' }
    await joinChallenge({ ...receiverLaunch, token: '0'.repeat(64) }, 422)
    await joinChallenge({ ...receiverLaunch, arm: 'minimal-present' }, 422)
    await joinChallenge({ ...receiverLaunch, launchId: '../' }, 422)
    assert.deepEqual(await recipientSessions(), [])
    const [joined, sameJoin] = await Promise.all([joinChallenge(receiverLaunch), joinChallenge(receiverLaunch)])
    assert.deepEqual(sameJoin, joined)
    assert.equal(joined.task, trial.task)
    assert.notEqual(joined.id, trial.id)
    assert.ok(![standard, minimal].some(opened => opened.sessionId === joined.sessionId || opened.workspaceId === joined.workspaceId))
    const alteredCode = challengeCode(sample, 'summary')
    const altered = await checkChallenge(alteredCode)
    assert.notEqual(altered.token, checked.token)
    await joinChallenge({ ...receiverLaunch, arm: 'standard' }, 422)
    await joinChallenge({ ...receiverLaunch, code: alteredCode, token: altered.token }, 422)
    await joinChallenge({ ...receiverLaunch, token: altered.token }, 422)
    assert.equal((await recipientSessions()).length, 1)
    const recipientHistory = () => recipient.request('/api/loadout-fixture-history?sessionId=' + joined.sessionId)
    const recipientDraft = await recipientHistory()
    assert.equal(recipientDraft.presetId, 'minimal')
    assert.equal(recipientDraft.inherited, 0)
    assert.ok(!recipientDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    assert.deepEqual(await readFile(join(recipientDraft.workspacePath, material)), materialBytes)
    const recipientTrial = () => receive('hero-trial', { comparisonId: joined.id })
    assert.deepEqual((await equipmentIn(recipient, joined.sessionId)).heroTrial,
      { id: joined.id, arm: 'minimal', task: trial.task, need: 'original', firstTaskPending: true })
    assert.deepEqual((await recipient.request(endpoint)).value.lastHeroTrial, { id: joined.id, need: 'original' })
    assert.deepEqual((await recipientTrial()).arms.map(({ id, status }) => [id, status]), [['standard', 'unopened'], ['minimal', 'waiting']])
    assert.deepEqual((await receive('lighthouse-pending-runs')).items.map(item => [item.sessionId, item.arm]), [[joined.sessionId, 'minimal']])
    const recipientHandoff = (action, arm, fields, status) => receive(action, { comparisonId: joined.id, arm, ...fields }, status)
    await recipientHandoff('hero-trial-handoff-report', 'minimal', {}, 422)
    await recipientHandoff('hero-trial-handoff-compare', 'minimal', { code: senderHandoff.code }, 422)
    await recipient.request(turnEndpoint, { ...joined, text: joined.task })
    assert.deepEqual(await receive('lighthouse-pending-runs'), { items: [] })
    const recipientRound = await recipientHistory()
    assert.equal((await equipmentIn(recipient, joined.sessionId)).heroTrial.canCopyHeroReport, true)
    assert.equal(recipientRound.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')?.data.content[0].text, trial.task)
    assert.deepEqual(traceTools(recipientRound).map(event => event.data.name), ['bash'])
    assert.deepEqual(traceFiles(recipientRound), [])
    const received = await recipientTrial()
    assert.equal(byHero(received, 'standard').status, 'unopened')
    assert.equal(byHero(received, 'minimal').summary, handoff)
    assert.equal(byHero(received, 'minimal').materialState, 'verified')
    assert.equal(byHero(received, 'minimal').meetsNeed, false)
    assert.deepEqual(await readFile(join(recipientRound.workspacePath, material)), materialBytes)
    assert.deepEqual(await joinChallenge(receiverLaunch), joined)
    assert.equal((await recipientSessions()).length, 1)
    assert.equal(received.canShareHeroChallenge, true)
    assert.deepEqual(await receive('hero-trial-challenge-share', { comparisonId: joined.id }), singleRoundInvitation)
    const reportSessions = await nativeSessions()
    const recipientReportSessions = await nativeSessions(recipientEnv.DSH_HOME)
    const friendHandoff = await recipientHandoff('hero-trial-handoff-report', 'minimal')
    const minimalOutcome = { arm: 'minimal', originalAttached: false, meetsNeed: false }
    const friendFields = { sample, need: 'original', arm: 'minimal', originalAttached: false }
    assert.deepEqual(friendHandoff, { need: 'original', local: minimalOutcome, code: reportCode(friendFields) })
    assert.deepEqual(JSON.parse(Buffer.from(friendHandoff.code.slice('DSHR1.'.length), 'base64url').toString('utf8')), friendFields)
    assert.deepEqual(await compareHandoff(trial.id, 'standard', friendHandoff.code),
      { need: 'original', local: { ...standardOutcome, readingTool: 'read' }, friend: minimalOutcome, code: senderHandoff.code })
    assert.deepEqual(await recipientHandoff('hero-trial-handoff-compare', 'minimal', { code: senderHandoff.code }),
      { need: 'original', local: { ...minimalOutcome, readingTool: 'bash' }, friend: standardOutcome, code: friendHandoff.code })
    for (const changes of [{ sample: 'lighthouse-hero-handoff-1-en' }, { need: 'summary' }, { arm: 'ptc' },
      { originalAttached: 'yes' }, { status: 'complete' }, { sessionId: joined.sessionId }]) {
      await compareHandoff(trial.id, 'standard', reportCode({ ...friendFields, ...changes }), 422)
    }
    await recipientHandoff('hero-trial-handoff-report', 'standard', {}, 422)
    assert.deepEqual(await nativeSessions(), reportSessions)
    assert.deepEqual(await nativeSessions(recipientEnv.DSH_HOME), recipientReportSessions)
    assert.deepEqual(await recipientTrial(), received)
    assert.deepEqual(await read(trial.id), result)
    await recipient.stop()
    recipient = undefined

    assert.equal(result.canReplayMinimalDelivery, true)
    assert.equal(result.minimalReplay, undefined)
    assert.equal(result.deliveryReplay, undefined)
    assert.equal(await minimalShortcut(minimal.sessionId), true)
    const replayPreview = await previewReplay(trial.id)
    assert.match(replayPreview.token, /^[a-f0-9]{64}$/u)
    assert.equal(replayPreview.task, trial.task)
    assert.equal(replayPreview.material, material)
    assert.equal(replayPreview.source.name, '@deepseek-ai/dsh-tool-present')
    assert.ok(replayPreview.source.version)
    assert.equal(replayPreview.comparison.before.id, 'minimal')
    assert.equal(replayPreview.comparison.after.id, 'minimal')
    assert.deepEqual(replayPreview.comparison.after.outfit.map(item => item.id), ['present'])
    assert.deepEqual(replayPreview.comparison.lost, [])
    assert.deepEqual(replayPreview.comparison.timingChanges, [])
    assert.deepEqual(replayPreview.comparison.sourceChanges, [])
    assert.ok(replayPreview.comparison.gained.some(item => item.kind === 'tool' && item.name === 'present'))
    await openReplay(trial.id, '0'.repeat(64), 422)
    await openReplay(launchId('d'), replayPreview.token, 422)
    await open(trial.id, 'minimal-present', 422)

    const original = await history(minimal.sessionId)
    const originalCard = join(original.workspacePath, material)
    await appendFile(originalCard, '\nChanged after reviewing the replay.\n')
    assert.notEqual((await read(trial.id)).canReplayMinimalDelivery, true)
    assert.equal(await minimalShortcut(minimal.sessionId), undefined)
    await shareHandoff(trial.id, 'minimal', 422)
    await previewReplay(trial.id, 422)
    await openReplay(trial.id, replayPreview.token, 422)
    assert.deepEqual(await nativeSessions(), [...beforeSessions, standard.sessionId, minimal.sessionId].sort())
    await writeFile(originalCard, materialBytes)
    assert.equal(await minimalShortcut(minimal.sessionId), true)

    const [replay, retryReplay] = await Promise.all([
      openReplay(trial.id, replayPreview.token), openReplay(trial.id, replayPreview.token),
    ])
    assert.deepEqual(retryReplay, replay)
    assert.equal(replay.id, trial.id)
    assert.equal(replay.task, trial.task)
    assert.ok(replay.requestId)
    assert.deepEqual(await nativeSessions(), [...beforeSessions, standard.sessionId, minimal.sessionId, replay.sessionId].sort())
    assert.ok(![standard.workspaceId, minimal.workspaceId].includes(replay.workspaceId))
    const nativeDraft = await history(replay.sessionId)
    assert.match(nativeDraft.presetId, /^loadout-[a-f0-9]{24}$/u)
    assert.equal(nativeDraft.workspaceId, replay.workspaceId)
    assert.equal(nativeDraft.inherited, 0)
    assert.ok(!nativeDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    assert.deepEqual((await readdir(nativeDraft.workspacePath)).sort(), (await readdir(original.workspacePath)).sort())
    assert.deepEqual(await readFile(join(nativeDraft.workspacePath, material)), materialBytes)
    assert.deepEqual((await equipmentIn(host, replay.sessionId)).heroTrial,
      { id: trial.id, arm: 'minimal-present', task: trial.task, need: 'original', firstTaskPending: true })
    const replayWaiting = await read(trial.id)
    assert.deepEqual(replayWaiting.arms, result.arms)
    assert.equal(replayWaiting.minimalReplay.id, 'minimal-present')
    assert.equal(replayWaiting.minimalReplay.sessionId, replay.sessionId)
    assert.equal(replayWaiting.minimalReplay.status, 'waiting')
    assert.equal(replayWaiting.minimalReplay.summary, undefined)
    assert.equal(replayWaiting.minimalReplay.lessonTaskSource, undefined)
    assert.equal(replayWaiting.deliveryReplay, undefined)
    assert.equal(await minimalShortcut(minimal.sessionId), undefined)
    await shareHandoff(trial.id, 'minimal-present', 422)
    await invoke('lesson-task-options', transfer, 422)

    await send(replay)
    const nativeReplay = await history(replay.sessionId)
    const sentReplay = nativeReplay.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(sentReplay?.data.content[0].text, trial.task)
    assert.deepEqual(traceTools(nativeReplay).map(event => event.data.name), ['bash', 'present'])
    assert.deepEqual(toolSource(nativeReplay, 'bash'), toolSource(original, 'bash'))
    const present = traceTools(nativeReplay).at(-1)
    const delivery = nativeReplay.events.find(event => event.type === 'deliverables/presented')
    assert.equal(delivery.data.callId, present.data.callId)
    assert.deepEqual(traceFiles(nativeReplay).map(file => file.path), [join(nativeReplay.workspacePath, material)])
    assert.deepEqual(await readFile(join(nativeReplay.workspacePath, material)), materialBytes)
    assert.deepEqual(await readFile(originalCard), materialBytes)
    assert.deepEqual(traceFiles(await history(minimal.sessionId)), [])
    const replayed = await read(trial.id)
    assert.deepEqual(replayed.arms, result.arms)
    assert.equal(replayed.minimalReplay.status, 'complete')
    assert.equal(replayed.minimalReplay.materialState, 'verified')
    assert.equal(replayed.minimalReplay.summary, handoff)
    assert.equal(replayed.minimalReplay.originalAttached, true)
    assert.equal(replayed.minimalReplay.meetsNeed, true)
    assert.deepEqual(replayed.minimalReplay.deliverables.map(file => file.name), [material])
    assert.deepEqual(replayed.minimalReplay.entries.map(item => [item.name, item.state]), [['bash', 'completed'], ['present', 'completed']])
    assert.deepEqual(replayed.minimalReplay.lessonTaskSource, transfer)
    assert.deepEqual(replayed.deliveryReplay, { sessionId: replay.sessionId,
      originalFile: { name: material, seq: delivery.seq, index: 0 } })
    const replayMember = (await equipmentIn(host, replay.sessionId)).heroTrial
    assert.equal(replayMember.verifiedDeliveryReplay, true)
    assert.deepEqual(replayMember.lessonTaskSource, replayed.minimalReplay.lessonTaskSource)
    assert.equal(replayMember.canCopyHeroReport, true)
    const equippedOutcome = { arm: 'minimal-present', originalAttached: true, meetsNeed: true }
    const equippedCode = reportCode({ ...standardFields, arm: 'minimal-present' })
    assert.deepEqual(await shareHandoff(trial.id, 'minimal-present'), { need: 'original', local: equippedOutcome, code: equippedCode })
    assert.deepEqual(await compareHandoff(trial.id, 'minimal-present', senderHandoff.code),
      { need: 'original', local: { ...equippedOutcome, readingTool: 'bash' }, friend: standardOutcome, code: equippedCode })
    await open(trial.id, 'minimal-present', 422)

    const ownWorkspace = join(directory, 'personal-ledger')
    const ownFolder = '值班 材料'
    const ownFilename = '设备 台账.md'
    const ownMaterial = ownFolder + '/' + ownFilename
    const ownPath = join(ownWorkspace, ownMaterial)
    const ownContent = '# 舞台设备交接台账\n\n存放：工作室东侧 3 号柜\n已点验：2 台备用对讲机、1 根备用天线。\n'
    await mkdir(join(ownWorkspace, ownFolder), { recursive: true })
    await writeFile(ownPath, ownContent)
    const canonicalOwnWorkspace = await realpath(ownWorkspace)
    const canceledMaterial = new AbortController()
    const interruptedDigest = digestWorkspaceMaterial(canonicalOwnWorkspace, ownMaterial, canceledMaterial.signal)
    canceledMaterial.abort()
    await assert.rejects(interruptedDigest, { name: 'AbortError' })
    assert.equal(await digestWorkspaceMaterial(canonicalOwnWorkspace, ownMaterial),
      createHash('sha256').update(ownContent).digest('hex'))
    const method = 'workspace/create'
    const rpcId = randomUUID()
    const registered = await host.request('/api/' + method, { type: 'client-request', rpcId, method,
      payload: { args: { request: { path: await realpath(ownWorkspace) } } } })
    assert.equal(registered.rpcId, rpcId)
    assert.equal(registered.result.ok, true, JSON.stringify(registered.result))
    const { workspaceId } = registered.result.value.workspace
    const options = await invoke('lesson-task-options', replayMember.lessonTaskSource)
    assert.ok(options.workspaceIds.includes(workspaceId))
    assert.ok([standard, minimal, replay].every(item => !options.workspaceIds.includes(item.workspaceId)))
    assert.equal(options.source.sessionId, replay.sessionId)
    assert.equal(options.source.heroDeliveryTrial, true)
    assert.deepEqual(options.source.gearSource, replayPreview.source)
    for (const bad of [{ ...transfer, arm: 'minimal' }, { ...transfer, kind: 'workspace' }]) {
      await invoke('lesson-task-options', bad, 422)
    }
    const listed = await invoke('lesson-task-materials', { ...transfer, workspaceId, directory: ownFolder })
    assert.deepEqual(listed.entries.map(file => [file.name, file.path, file.kind]), [[ownFilename, ownMaterial, 'file']])
    await invoke('lesson-task-materials', { ...transfer, workspaceId: replay.workspaceId }, 422)
    const selection = { ...replayMember.lessonTaskSource, workspaceId, material: ownMaterial,
      task: '查看台账中已经点验的物资和存放地点，给夜班一条交接摘要，并把该台账的原件附在这个对话。' }
    const ownPreview = await invoke('lesson-task-preview', selection)
    assert.deepEqual(ownPreview.source, options.source)
    assert.deepEqual(ownPreview.gear.map(item => item.id), ['present'])
    assert.ok(ownPreview.task.includes(ownMaterial) && ownPreview.task.includes(selection.task))
    assert.ok(!ownPreview.task.includes(material) && ownPreview.task !== trial.task)
    assert.ok(ownPreview.token)
    const ownFields = { ...selection, token: ownPreview.token, launchId: launchId('8') }
    const beforePersonal = await nativeSessions()
    await invoke('lesson-task-open', { ...ownFields, token: '0'.repeat(64) }, 422)
    await appendFile(ownPath, '\nChanged after reviewing the personal material.\n')
    await invoke('lesson-task-open', ownFields, 422)
    await writeFile(ownPath, ownContent)
    const replayCard = join(nativeReplay.workspacePath, material)
    await appendFile(replayCard, '\nArchived sample changed after the native result.\n')
    const changedReplay = await read(trial.id)
    assert.equal(changedReplay.minimalReplay.lessonTaskSource, undefined)
    assert.equal(changedReplay.deliveryReplay, undefined)
    const staleReplay = (await equipmentIn(host, replay.sessionId)).heroTrial
    assert.equal(staleReplay.verifiedDeliveryReplay, undefined)
    assert.equal(staleReplay.lessonTaskSource, undefined)
    assert.equal(staleReplay.canCopyHeroReport, undefined)
    await shareHandoff(trial.id, 'minimal-present', 422)
    await invoke('lesson-task-options', transfer, 422)
    await invoke('lesson-task-open', ownFields, 422)
    await writeFile(replayCard, materialBytes)
    await appendFile(originalCard, '\nChanged after comparing both runs.\n')
    assert.equal((await read(trial.id)).deliveryReplay, undefined)
    const staleOriginal = (await equipmentIn(host, replay.sessionId)).heroTrial
    assert.equal(staleOriginal.verifiedDeliveryReplay, undefined)
    assert.equal(staleOriginal.lessonTaskSource, undefined)
    await writeFile(originalCard, materialBytes)
    assert.deepEqual((await read(trial.id)).deliveryReplay, replayed.deliveryReplay)
    assert.deepEqual(await nativeSessions(), beforePersonal)

    const [own, sameOwn] = await Promise.all([invoke('lesson-task-open', ownFields), invoke('lesson-task-open', ownFields)])
    assert.deepEqual(sameOwn, own)
    assert.equal(own.task, ownPreview.task)
    assert.deepEqual(await nativeSessions(), [...beforePersonal, own.sessionId].sort())
    const ownDraft = await history(own.sessionId)
    assert.equal(ownDraft.presetId, nativeReplay.presetId)
    assert.equal(ownDraft.workspaceId, workspaceId)
    assert.equal(ownDraft.inherited, 0)
    assert.ok(!ownDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    const tag = (await equipmentIn(host, own.sessionId)).planTask
    assert.deepEqual(tag.source, options.source)
    assert.equal(tag.material, ownMaterial)
    assert.equal(tag.task, own.task)
    await send(own)
    const ownNative = await history(own.sessionId)
    const ownPrompt = ownNative.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(ownPrompt?.data.content[0].text, own.task)
    assert.deepEqual(traceTools(ownNative).map(event => event.data.name), ['bash', 'present'])
    for (const name of ['bash', 'present']) assert.deepEqual(toolSource(ownNative, name), toolSource(nativeReplay, name))
    const ownDelivery = ownNative.events.find(event => event.type === 'deliverables/presented')
    assert.equal(ownDelivery.data.callId, traceTools(ownNative).at(-1).data.callId)
    assert.deepEqual(traceFiles(ownNative).map(file => file.path), [join(ownNative.workspacePath, ownMaterial)])
    assert.equal(await readFile(ownPath, 'utf8'), ownContent)
    const ownResult = await invoke('lesson-task-result', { sessionId: own.sessionId, review: true })
    assert.deepEqual(ownResult.source, options.source)
    assert.equal(ownResult.materialState, 'verified')
    assert.equal(ownResult.materialDelivered, true)
    assert.equal(ownResult.canReview, true)
    assert.ok(ownResult.draft, ownResult.reason)
    assert.deepEqual(ownResult.draft.equipmentIds, ['present'])
    assert.equal(ownResult.draft.presetId, 'minimal')
    assert.deepEqual(await read(trial.id), replayed)

    const standardOptions = await invoke('lesson-task-options', standardTransfer)
    assert.equal(standardOptions.source.sessionId, standard.sessionId)
    assert.deepEqual(standardOptions.source.gearSources.map(({ tool, name }) => [tool, name]),
      [['read', '@deepseek-ai/dsh-tool-fs'], ['present', '@deepseek-ai/dsh-tool-present']])
    assert.ok(standardOptions.workspaceIds.includes(workspaceId))
    assert.ok([standard, minimal, replay].every(item => !standardOptions.workspaceIds.includes(item.workspaceId)))
    assert.deepEqual((await invoke('lesson-task-materials', { ...standardTransfer, workspaceId, directory: ownFolder })).entries, listed.entries)
    await invoke('lesson-task-materials', { ...standardTransfer, workspaceId: standard.workspaceId }, 422)
    await invoke('lesson-task-preview', { ...selection, ...standardTransfer, workspaceId: standard.workspaceId, material }, 422)
    const standardSelection = { ...selection, ...standardTransfer }
    const standardPreview = await invoke('lesson-task-preview', standardSelection)
    assert.deepEqual(standardPreview.source, standardOptions.source)
    assert.ok(standardPreview.task.includes(ownMaterial) && standardPreview.task.includes(standardSelection.task))
    assert.ok(!standardPreview.task.includes(material) && standardPreview.task !== standard.task)
    const standardFieldsForOwn = { ...standardSelection, token: standardPreview.token, launchId: launchId('9') }
    const stockTrace = await history(standard.sessionId)
    const unavailableCard = join(stockTrace.workspacePath, material)
    const beforeStandardPersonal = await nativeSessions()
    await appendFile(unavailableCard, '\nChanged after the verified original handoff.\n')
    assert.equal(byHero(await read(trial.id), 'standard').lessonTaskSource, undefined)
    const staleStandard = (await equipmentIn(host, standard.sessionId)).heroTrial
    assert.equal(staleStandard.lessonTaskSource, undefined)
    assert.equal(staleStandard.canCopyHeroReport, undefined)
    await shareHandoff(trial.id, 'standard', 422)
    await invoke('lesson-task-open', standardFieldsForOwn, 422)
    await writeFile(unavailableCard, materialBytes)
    assert.deepEqual(await nativeSessions(), beforeStandardPersonal)
    const standardOwn = await invoke('lesson-task-open', standardFieldsForOwn)
    assert.notEqual(standardOwn.sessionId, standard.sessionId)
    assert.notEqual(standardOwn.sessionId, own.sessionId)
    assert.equal(standardOwn.workspaceId, workspaceId)
    assert.deepEqual(await nativeSessions(), [...beforeStandardPersonal, standardOwn.sessionId].sort())
    const stockDraft = await history(standardOwn.sessionId)
    assert.equal(stockDraft.presetId, 'standard')
    assert.equal(stockDraft.inherited, 0)
    assert.ok(!stockDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    assert.deepEqual((await equipmentIn(host, standardOwn.sessionId)).planTask.source, standardOptions.source)
    await send(standardOwn)
    const stockPersonal = await history(standardOwn.sessionId)
    const personalPrompt = stockPersonal.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(personalPrompt?.data.content[0].text, standardPreview.task)
    assert.deepEqual(traceTools(stockPersonal).map(event => event.data.name), ['read', 'present'])
    for (const name of ['read', 'present']) assert.deepEqual(toolSource(stockPersonal, name), toolSource(stockTrace, name))
    const stockDelivery = stockPersonal.events.find(event => event.type === 'deliverables/presented')
    assert.equal(stockDelivery?.data.callId, traceTools(stockPersonal).at(-1).data.callId)
    assert.deepEqual(traceFiles(stockPersonal).map(file => file.path), [await realpath(ownPath)])
    assert.equal(await readFile(ownPath, 'utf8'), ownContent)
    const stockResult = await invoke('lesson-task-result', { sessionId: standardOwn.sessionId, review: true })
    assert.equal(stockResult.materialState, 'verified')
    assert.equal(stockResult.materialDelivered, true)
    assert.equal(stockResult.canReview, true)
    assert.equal(stockResult.draft?.presetId, 'standard')
    assert.deepEqual(await read(trial.id), replayed)

    const alternatePreview = (sessionId, fields, status) => invoke('lesson-task-alternate-preview', { sessionId, ...fields }, status)
    const alternateOpen = (sessionId, token, status) => invoke('lesson-task-alternate-open', { sessionId, token }, status)
    const beforeAlternates = await nativeSessions()
    await alternatePreview(standard.sessionId, {}, 422)
    const alternateFromMinimal = await alternatePreview(own.sessionId, { arm: 'minimal', workspaceId: 'forged', material: 'wrong.md', task: 'Wrong task' })
    assert.equal(alternateFromMinimal.source.arm, 'standard')
    assert.equal(alternateFromMinimal.workspaceId, workspaceId)
    assert.equal(alternateFromMinimal.material, ownMaterial)
    assert.equal(alternateFromMinimal.task, own.task)
    await alternateOpen(own.sessionId, '0'.repeat(64), 422)
    await appendFile(ownPath, '\nMaterial changed after reviewing the other loadout.\n')
    await alternatePreview(own.sessionId, {}, 422)
    await alternateOpen(own.sessionId, alternateFromMinimal.token, 422)
    await writeFile(ownPath, ownContent)
    await appendFile(replayCard, '\nThe local source of equipped Minimal changed.\n')
    await alternatePreview(standardOwn.sessionId, {}, 422)
    await writeFile(replayCard, materialBytes)
    assert.deepEqual(await nativeSessions(), beforeAlternates)

    const alternateSessions = []
    const reviewedHeroPlans = new Map()
    const reviewPair = (sessionId, pairSide, status) => invoke('lesson-task-result', { sessionId, review: true, pairSide }, status)
    await reviewPair(own.sessionId, 'original', 422)
    await invoke('lesson-task-result', { sessionId: own.sessionId, pairSide: 'original' }, 422)
    for (const [started, arm, readTool, priorTrace, targetTrace] of [
      [own, 'standard', 'read', ownNative, stockTrace],
      [standardOwn, 'minimal-present', 'bash', stockPersonal, nativeReplay],
    ]) {
      assert.deepEqual((await invoke('lesson-task-result', { sessionId: started.sessionId })).alternateTask, { arm })
      const preview = await alternatePreview(started.sessionId)
      assert.equal(preview.task, started.task)
      assert.equal(preview.material, ownMaterial)
      assert.equal(preview.source.arm, arm)
      const [opened, duplicate] = await Promise.all([
        alternateOpen(started.sessionId, preview.token), alternateOpen(started.sessionId, preview.token),
      ])
      assert.deepEqual(duplicate, opened)
      assert.equal(opened.task, started.task)
      assert.equal(opened.workspaceId, workspaceId)
      alternateSessions.push(opened.sessionId)
      const draft = await history(opened.sessionId)
      assert.equal(draft.presetId, targetTrace.presetId)
      assert.equal(draft.inherited, 0)
      assert.ok(!draft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
      assert.equal((await invoke('lesson-task-result', { sessionId: opened.sessionId })).heroPair, undefined)
      await reviewPair(opened.sessionId, 'original', 422)
      await send(opened)
      const completed = await history(opened.sessionId)
      assert.deepEqual(traceTools(completed).map(event => event.data.name), [readTool, 'present'])
      assert.deepEqual(traceFiles(completed).map(file => file.path), [await realpath(ownPath)])
      for (const name of [readTool, 'present']) assert.deepEqual(toolSource(completed, name), toolSource(targetTrace, name))
      assert.deepEqual(await alternateOpen(started.sessionId, preview.token), { sessionId: opened.sessionId, workspaceId })
      const afterAlternate = await invoke('lesson-task-result', { sessionId: opened.sessionId })
      assert.equal(afterAlternate.alternateTask, undefined)
      assert.deepEqual(afterAlternate.heroPair, { material: ownMaterial,
        original: { sessionId: started.sessionId, arm: arm === 'standard' ? 'minimal-present' : 'standard',
          tools: traceTools(priorTrace).map(event => event.data.name), originalAttached: true, canReview: true },
        alternate: { sessionId: opened.sessionId, arm, tools: [readTool, 'present'], originalAttached: true, canReview: true } })
      await reviewPair(opened.sessionId, 'constructor', 422)
      for (const side of ['original', 'alternate']) {
        const run = afterAlternate.heroPair[side]
        const reviewed = await reviewPair(opened.sessionId, side)
        const minimal = run.arm === 'minimal-present'
        assert.equal(reviewed.sessionId, run.sessionId, reviewed.reason)
        assert.equal(reviewed.source.arm, run.arm)
        assert.deepEqual(reviewed.draft?.equipmentIds, minimal ? ['present'] : [])
        assert.equal(reviewed.draft?.presetId, minimal ? 'minimal' : 'standard')
        reviewedHeroPlans.set(reviewed.draft.presetId, { reviewed, run })
      }
      assert.deepEqual(await history(started.sessionId), priorTrace)
    }
    assert.deepEqual(await nativeSessions(), [...beforeAlternates, ...alternateSessions].sort())
    await appendFile(ownPath, '\nEdited after both personal handoffs.\n')
    for (const sessionId of alternateSessions) {
      const pair = (await invoke('lesson-task-result', { sessionId })).heroPair
      assert.equal(pair?.material, ownMaterial)
      assert.equal(pair?.alternate.originalAttached, true)
    }
    assert.equal((await reviewPair(alternateSessions[0], 'original')).draft?.presetId, 'minimal')
    await writeFile(ownPath, ownContent)
    await appendFile(replayCard, '\nThe equipped recipe evidence is no longer current.\n')
    assert.equal((await reviewPair(alternateSessions[0], 'original')).draft, undefined)
    assert.equal((await reviewPair(alternateSessions[0], 'alternate')).draft?.presetId, 'standard')
    await writeFile(replayCard, materialBytes)

    const newMaterial = ownFolder + '/补给 台账.md'
    const newPath = join(ownWorkspace, newMaterial)
    await writeFile(newPath, '# 夜班备用补给\n\n存放：东侧一号柜。\n')
    const beforeNewTasks = await nativeSessions()
    const savedIds = []
    const savedPlans = []
    for (const [preset, { reviewed, run }] of reviewedHeroPlans) {
      const name = 'Verified same-task ' + preset
      const saved = await invoke('plan-save', { name, draft: reviewed.draft })
      assert.equal(saved.name, name)
      assert.ok(!JSON.stringify(saved).includes(ownMaterial))
      savedPlans.push(saved)
      const fields = { id: saved.id, revision: saved.revision, workspaceId, material: newMaterial,
        task: '清点备用物资，并把所选的新台账原件附在这个对话。' }
      const preview = await invoke('plan-task-preview', fields)
      assert.equal(preview.planName, name)
      assert.ok(preview.task.includes(newMaterial) && preview.task.includes(fields.task))
      assert.ok(!preview.task.includes(ownMaterial) && preview.task !== reviewed.task)
      const opened = await invoke('plan-task-open', { ...fields, token: preview.token, launchId: launchId('b') })
      savedIds.push(opened.sessionId)
      const draft = await history(opened.sessionId)
      assert.equal(draft.inherited, 0)
      assert.ok(!draft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
      await send(opened)
      const completed = await history(opened.sessionId)
      assert.deepEqual(traceTools(completed).map(event => event.data.name), run.tools)
      assert.deepEqual(traceFiles(completed).map(file => file.path), [await realpath(newPath)])
    }
    assert.deepEqual(await nativeSessions(), [...beforeNewTasks, ...savedIds].sort())
    const listedPlans = (await host.request(endpoint)).value.plans
    assert.deepEqual(new Set(listedPlans.map(plan => plan.id)), new Set([...before.plans, ...savedPlans].map(plan => plan.id)))
    for (const { id, revision } of savedPlans) await invoke('plan-remove', { id, revision })

    const personalSource = stockResult.rematchSource
    assert.deepEqual(personalSource, { kind: 'personal', comparisonId: standardOwn.sessionId.slice('session-'.length), arm: 'task' })
    const personalOptions = await invoke('rematch-comparison-options', personalSource)
    assert.deepEqual(personalOptions.personalSuggestedChange, { addId: 'review' })
    assert.equal(personalOptions.workspaceId, workspaceId)
    assert.equal(personalOptions.material, ownMaterial)
    const change = personalOptions.personalSuggestedChange
    const rematchPreview = await invoke('rematch-comparison-preview', { ...personalSource, change })
    assert.equal(rematchPreview.task, standardOwn.task)
    assert.equal(rematchPreview.change.added.id, 'review')
    assert.equal(rematchPreview.change.removed, undefined)
    assert.ok(!rematchPreview.comparison.lost.some(item => ['read', 'present'].includes(item.name)))
    const checkedSource = { ...personalSource, change, token: rematchPreview.token }
    const beforePersonalRematches = await nativeSessions()
    await appendFile(ownPath, '\nMaterial edited after reviewing the rematch.\n')
    await invoke('rematch-comparison-options', personalSource, 422)
    await invoke('rematch-comparison-open', { ...checkedSource, launchId: launchId('3') }, 422)
    await writeFile(ownPath, ownContent)
    assert.deepEqual(await nativeSessions(), beforePersonalRematches)

    const questions = '/api/loadout-fixture-handoff-question'
    const rematchSessions = []
    for (const [id, choice] of [['3', 'Confirm handoff'], ['4', 'Revise draft']]) {
      const opened = await invoke('rematch-comparison-open', { ...checkedSource, launchId: launchId(id) })
      assert.notEqual(opened.sessionId, standardOwn.sessionId)
      assert.equal(opened.task, standardOwn.task)
      rematchSessions.push(opened.sessionId)
      const draft = await history(opened.sessionId)
      assert.equal(draft.workspaceId, workspaceId)
      assert.equal(draft.inherited, 0)
      assert.ok(!draft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
      const turn = send(opened)
      turn.catch(() => {})
      let question
      try {
        for (let count = 0; count < 100 && !question; count++) {
          question = (await host.request(questions, { sessionId: opened.sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(option => option.label), ['Confirm handoff', 'Revise draft'])
        const pending = await invoke('rematch-comparison', { comparisonId: opened.id })
        assert.equal(pending.arms[1].status, 'waiting-choice')
        assert.equal(pending.handoffOutcome, undefined)
      } finally {
        if (question) await host.request(questions, { sessionId: opened.sessionId, choice })
        await turn
      }
      const confirmed = choice === 'Confirm handoff'
      const completed = await invoke('rematch-comparison', { comparisonId: opened.id })
      assert.equal(completed.arms[0].sessionId, standardOwn.sessionId)
      assert.deepEqual(completed.handoffOutcome.arms.map(item => [item.style, item.choices, item.materialDelivered]),
        [['direct', [], true], ['review', [choice], confirmed]])
      const native = await history(opened.sessionId)
      assert.deepEqual(traceTools(native).map(event => event.data.name),
        confirmed ? ['read', 'ask_user_question', 'present'] : ['read', 'ask_user_question'])
      for (const name of confirmed ? ['read', 'present'] : ['read']) {
        assert.deepEqual(toolSource(native, name), toolSource(stockPersonal, name))
      }
      assert.deepEqual(traceFiles(native).map(file => file.path), confirmed ? [await realpath(ownPath)] : [])
    }
    assert.deepEqual(await nativeSessions(), [...beforePersonalRematches, ...rematchSessions].sort())
    assert.equal(await readFile(ownPath, 'utf8'), ownContent)
    assert.deepEqual((await host.request(endpoint)).value.plans, before.plans)

    const startingTrial = await create(launchId('6'), 'original')
    const onlyMinimal = await open(startingTrial.id, 'minimal')
    await send(onlyMinimal)
    const fitting = await previewReplay(startingTrial.id)
    const equipped = await openReplay(startingTrial.id, fitting.token)
    await send(equipped)
    const carry = (await equipmentIn(host, equipped.sessionId)).heroTrial.lessonTaskSource
    const ownInput = { ...carry, workspaceId, material: ownMaterial, task: selection.task }
    const checkedOwn = await invoke('lesson-task-preview', ownInput)
    const fromReplay = await invoke('lesson-task-open', { ...ownInput, token: checkedOwn.token, launchId: launchId('c') })
    assert.equal((await invoke('lesson-task-result', { sessionId: fromReplay.sessionId })).sourceTrial, undefined)
    await send(fromReplay)
    const otherOwnInput = { ...ownInput, material: newMaterial, task: '清点备用补给并交付这份原件。' }
    const checkedOther = await invoke('lesson-task-preview', otherOwnInput)
    const otherOwn = await invoke('lesson-task-open', { ...otherOwnInput, token: checkedOther.token, launchId: launchId('d') })
    await send(otherOwn)
    const sameFileInput = { ...ownInput, task: '核对原文件的存放地点，再附上原件。' }
    const checkedSameFile = await invoke('lesson-task-preview', sameFileInput)
    const sameFileOwn = await invoke('lesson-task-open', { ...sameFileInput, token: checkedSameFile.token, launchId: launchId('e') })
    await send(sameFileOwn)
    const differentTrial = await create(launchId('d'), 'original')
    assert.equal((await read()).id, differentTrial.id)
    const lessonResult = () => invoke('lesson-task-result', { sessionId: fromReplay.sessionId })
    const beforeSourceVisit = await nativeSessions()
    const sourceHint = { comparisonId: startingTrial.id, arm: 'standard' }
    assert.deepEqual((await lessonResult()).sourceTrial, sourceHint)
    assert.equal((await lessonResult()).alternateTask, undefined)
    assert.equal(byHero(await read(sourceHint.comparisonId), sourceHint.arm).status, 'unopened')
    assert.deepEqual(await nativeSessions(), beforeSourceVisit)
    await appendFile(ownPath, '\nEdited after completing the handoff.\n')
    assert.equal((await lessonResult()).sourceTrial, undefined)
    await writeFile(ownPath, ownContent)
    const openStandardFromTask = (sessionId, source = sourceHint, status) =>
      invoke('hero-trial-open-from-task', { ...source, sessionId }, status)
    await openStandardFromTask(fromReplay.sessionId, { ...sourceHint, comparisonId: differentTrial.id }, 422)
    await openStandardFromTask(standardOwn.sessionId, sourceHint, 422)
    assert.deepEqual(await nativeSessions(), beforeSourceVisit)
    const standardPractice = await openStandardFromTask(fromReplay.sessionId)
    assert.notEqual(standardPractice.sessionId, fromReplay.sessionId)
    assert.equal(standardPractice.task, startingTrial.task)
    assert.ok(!(await history(standardPractice.sessionId)).events.some(event => event.type === 'turn/start'))
    assert.deepEqual((await lessonResult()).sourceTrial, sourceHint)
    const { task: _practiceTask, ...pendingStandard } = standardPractice
    assert.deepEqual(await Promise.all([
      openStandardFromTask(fromReplay.sessionId), openStandardFromTask(otherOwn.sessionId), openStandardFromTask(sameFileOwn.sessionId),
    ]), [pendingStandard, pendingStandard, pendingStandard])
    const standardMember = async () => (await equipmentIn(host, standardPractice.sessionId)).heroTrial
    assert.equal((await standardMember()).returnTasks, undefined)
    await send(standardPractice)
    const stockPractice = await history(standardPractice.sessionId)
    assert.deepEqual(traceTools(stockPractice).map(event => event.data.name), ['read', 'present'])
    assert.deepEqual(traceFiles(stockPractice).map(file => file.path), [join(stockPractice.workspacePath, material)])
    assert.equal((await lessonResult()).sourceTrial, undefined)
    assert.deepEqual((await lessonResult()).alternateTask, { arm: 'standard' })
    await openStandardFromTask(fromReplay.sessionId, sourceHint, 422)
    const returns = (await standardMember()).returnTasks
    assert.deepEqual(new Set(returns.map(item => item.sessionId)), new Set([fromReplay.sessionId, otherOwn.sessionId, sameFileOwn.sessionId]))
    assert.equal(returns.find(item => item.sessionId === fromReplay.sessionId)?.briefPreview, ownInput.task)
    assert.equal(returns.find(item => item.sessionId === sameFileOwn.sessionId)?.briefPreview, sameFileInput.task)
    assert.equal(returns.find(item => item.sessionId === otherOwn.sessionId)?.material, newMaterial)
    assert.equal(returns.find(item => item.sessionId === otherOwn.sessionId)?.briefPreview, undefined)
    await appendFile(ownPath, '\nChanged again after both practice handoffs.\n')
    assert.deepEqual((await standardMember()).returnTasks?.map(item => item.sessionId), [otherOwn.sessionId])
    await writeFile(ownPath, ownContent)
    assert.deepEqual((await standardMember()).returnTasks, returns)
    assert.ok(!JSON.stringify(await shareHandoff(startingTrial.id, 'standard')).includes(fromReplay.sessionId))
    const privateAlternate = await alternatePreview(fromReplay.sessionId)
    assert.equal(privateAlternate.material, ownMaterial)
    assert.equal(privateAlternate.task, fromReplay.task)
    assert.deepEqual(await nativeSessions(), [...beforeSourceVisit, standardPractice.sessionId].sort())
    assert.equal((await read()).id, differentTrial.id)

    const summary = await create(launchId('b'), 'summary', 200, 'zh')
    assert.equal(summary.task, trial.task)
    assert.equal(summary.need, 'summary')
    assert.deepEqual((await host.request(endpoint)).value.lastHeroTrial, { id: summary.id, need: 'summary' })
    const minimalSummary = await open(summary.id, 'minimal')
    assert.deepEqual((await equipmentIn(host, minimalSummary.sessionId)).heroTrial,
      { id: summary.id, arm: 'minimal', task: summary.task, need: 'summary', firstTaskPending: true })
    const summaryTransfer = { kind: 'hero-trial', comparisonId: summary.id, arm: 'minimal' }
    await invoke('lesson-task-options', summaryTransfer, 422)
    await send(minimalSummary)
    const textOnly = byHero(await read(summary.id), 'minimal')
    assert.equal(textOnly.summary, handoff)
    assert.equal(textOnly.originalAttached, false)
    assert.equal(textOnly.meetsNeed, true)
    assert.notEqual((await read(summary.id)).canReplayMinimalDelivery, true)
    assert.equal(await minimalShortcut(minimalSummary.sessionId), undefined)
    await previewReplay(summary.id, 422)
    await openReplay(summary.id, replayPreview.token, 422)
    assert.deepEqual(textOnly.lessonTaskSource, summaryTransfer)
    assert.deepEqual((await equipmentIn(host, minimalSummary.sessionId)).heroTrial.lessonTaskSource, summaryTransfer)
    const summaryOptions = await invoke('lesson-task-options', summaryTransfer)
    assert.equal(summaryOptions.source.sessionId, minimalSummary.sessionId)
    assert.deepEqual(summaryOptions.source.gearSources.map(({ tool, name }) => [tool, name]),
      [['bash', '@deepseek-ai/dsh-tool-bash-persistent']])
    assert.ok(summaryOptions.workspaceIds.includes(workspaceId))
    assert.ok(!summaryOptions.workspaceIds.includes(minimalSummary.workspaceId))
    const summarySelection = { ...selection, ...summaryTransfer, task: '核对台账中列出的物资和存放地点，只给夜班一段可核对的文字交接。' }
    const summaryPreview = await invoke('lesson-task-preview', summarySelection)
    assert.deepEqual(summaryPreview.source, summaryOptions.source)
    assert.ok(summaryPreview.task.includes(ownMaterial) && summaryPreview.task.includes(summarySelection.task))
    assert.ok(!summaryPreview.task.includes(material) && summaryPreview.task !== summary.task)
    const summaryFields = { ...summarySelection, token: summaryPreview.token, launchId: launchId('5') }
    const summarySource = await history(minimalSummary.sessionId)
    const summaryCard = join(summarySource.workspacePath, material)
    const beforeSummaryTask = await nativeSessions()
    await appendFile(summaryCard, '\nThe original summary material is no longer sealed.\n')
    assert.equal(byHero(await read(summary.id), 'minimal').lessonTaskSource, undefined)
    await invoke('lesson-task-options', summaryTransfer, 422)
    await invoke('lesson-task-open', summaryFields, 422)
    await writeFile(summaryCard, materialBytes)
    assert.deepEqual(await nativeSessions(), beforeSummaryTask)
    const summaryOwn = await invoke('lesson-task-open', summaryFields)
    assert.notEqual(summaryOwn.sessionId, minimalSummary.sessionId)
    assert.equal(summaryOwn.workspaceId, workspaceId)
    assert.deepEqual(await nativeSessions(), [...beforeSummaryTask, summaryOwn.sessionId].sort())
    const summaryDraft = await history(summaryOwn.sessionId)
    assert.equal(summaryDraft.presetId, 'minimal')
    assert.equal(summaryDraft.inherited, 0)
    assert.ok(!summaryDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    await send(summaryOwn)
    const summaryNative = await history(summaryOwn.sessionId)
    assert.equal(summaryNative.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')?.data.content[0].text,
      summaryPreview.task)
    assert.deepEqual(traceTools(summaryNative).map(event => event.data.name), ['bash'])
    assert.deepEqual(toolSource(summaryNative, 'bash'), toolSource(summarySource, 'bash'))
    assert.deepEqual(traceFiles(summaryNative), [])
    assert.ok(summaryNative.events.some(event => event.type === 'assistant/message' &&
      event.data.message.content.some(block => block.type === 'text' && block.text.includes('工作室东侧 3 号柜领取 2 台备用对讲机'))))
    assert.equal(await readFile(ownPath, 'utf8'), ownContent)
    const summaryResult = await invoke('lesson-task-result', { sessionId: summaryOwn.sessionId, review: true })
    assert.equal(summaryResult.textHandoff, true)
    assert.equal(summaryResult.canReview, true)
    await alternatePreview(summaryOwn.sessionId, {}, 422)
    assert.equal(summaryResult.draft?.presetId, 'minimal')
    assert.deepEqual(summaryResult.source, summaryOptions.source)
    await appendFile(ownPath, '\nMaterial changed after the native text handoff.\n')
    const staleText = await invoke('lesson-task-result', { sessionId: summaryOwn.sessionId, review: true })
    assert.equal(staleText.textHandoff, undefined)
    assert.equal(staleText.canReview, undefined)
    await writeFile(ownPath, ownContent)
    const restoredText = await invoke('lesson-task-result', { sessionId: summaryOwn.sessionId, review: true })
    assert.equal(restoredText.textHandoff, true)
    assert.equal(restoredText.canReview, true)
    assert.deepEqual((await host.request(endpoint)).value.plans, before.plans)
    assert.deepEqual(byHero(await read(summary.id), 'minimal'), textOnly)
    const changed = await open(summary.id, 'standard')
    const changedNative = await history(changed.sessionId)
    await appendFile(join(changedNative.workspacePath, material), '\nEdited after opening the isolated trial.\n')
    await send(changed)
    const invalid = byHero(await read(summary.id), 'standard')
    assert.equal(invalid.status, 'unavailable')
    assert.equal(invalid.materialState, 'changed')
    assert.ok(!invalid.originalAttached && !invalid.meetsNeed)
    assert.deepEqual(await shareTrial(summary.id), { code: challengeCode(sample, 'summary') })

    await host.stop()
    host = await startHost({ ...env, DSH_LOADOUT_TEST_WRONG_LIGHTHOUSE_CARD: '1' }, patch)
    assert.deepEqual((await standardMember()).returnTasks, returns)
    assert.deepEqual(await read(trial.id), replayed)
    assert.deepEqual(await open(trial.id, 'standard'), standard)
    assert.deepEqual(await openReplay(trial.id, replayPreview.token), replay)
    assert.deepEqual(await invoke('lesson-task-open', ownFields), own)
    assert.deepEqual(await invoke('lesson-task-open', standardFieldsForOwn), standardOwn)
    assert.deepEqual(await invoke('lesson-task-open', summaryFields), summaryOwn)
    assert.equal((await read()).id, summary.id)
    const alternateTrial = await create(launchId('e'), 'original')
    const alternate = await open(alternateTrial.id, 'standard')
    const alternateNative = await history(alternate.sessionId)
    const sameName = join(alternateNative.workspacePath, 'alternate', material)
    await mkdir(dirname(sameName))
    await writeFile(sameName, materialBytes)
    await send(alternate)
    assert.deepEqual(traceFiles(await history(alternate.sessionId)).map(file => file.path), [sameName])
    assert.deepEqual(await readFile(join(alternateNative.workspacePath, material)), materialBytes)
    const wrongFile = byHero(await read(alternateTrial.id), 'standard')
    assert.equal(wrongFile.status, 'complete')
    assert.equal(wrongFile.summary, handoff)
    assert.equal(wrongFile.originalAttached, false)
    assert.equal(wrongFile.meetsNeed, false)
    assert.equal(wrongFile.lessonTaskSource, undefined)
    await invoke('lesson-task-options', { ...standardTransfer, comparisonId: alternateTrial.id }, 422)
    const badMinimal = await open(alternateTrial.id, 'minimal')
    await send(badMinimal)
    assert.equal((await shareTrial(alternateTrial.id)).code, challengeCode('lighthouse-hero-handoff-1-en', 'original'))
    const badReplayPreview = await previewReplay(alternateTrial.id)
    const badReplay = await openReplay(alternateTrial.id, badReplayPreview.token)
    const badNative = await history(badReplay.sessionId)
    const badAttachment = join(badNative.workspacePath, 'alternate', material)
    await mkdir(dirname(badAttachment))
    await writeFile(badAttachment, materialBytes)
    await send(badReplay)
    assert.deepEqual(traceFiles(await history(badReplay.sessionId)).map(file => file.path), [badAttachment])
    const wrongReplay = (await read(alternateTrial.id)).minimalReplay
    assert.equal(wrongReplay.status, 'complete')
    assert.equal(wrongReplay.originalAttached, false)
    assert.equal(wrongReplay.lessonTaskSource, undefined)
    assert.equal((await equipmentIn(host, badReplay.sessionId)).heroTrial.lessonTaskSource, undefined)
    await invoke('lesson-task-options', { ...transfer, comparisonId: alternateTrial.id }, 422)
    assert.deepEqual((await host.request(endpoint)).value.plans, before.plans)

    await host.stop()
    await writeFile(patch, JSON.stringify([fixture, { id: 'preset-minimal', disabled: true }]))
    host = await startHost(env, patch)
    const stoppedStock = (await host.request(endpoint)).value
    assert.equal(stoppedStock.heroTrialAvailable, false)
    assert.deepEqual(stoppedStock.lastHeroTrial, { id: alternateTrial.id, need: 'original' })
    const beforeResume = await nativeSessions()
    const resumed = await read(stoppedStock.lastHeroTrial.id)
    assert.deepEqual(resumed, await read())
    assert.deepEqual(resumed.arms.map(({ sessionId }) => sessionId), [alternate.sessionId, badMinimal.sessionId])
    assert.equal(resumed.minimalReplay.sessionId, badReplay.sessionId)
    assert.deepEqual(await nativeSessions(), beforeResume)
    await create(launchId('f'), 'original', 422)
    const unavailable = await invoke('lighthouse-challenge-preview', { code })
    assert.equal(unavailable.kind, 'hero-trial')
    assert.equal(unavailable.blocked, true)
    assert.equal(unavailable.token, undefined)
    const archived = await read(trial.id)
    assert.equal(archived.id, trial.id)
    assert.equal(archived.need, 'original')
    assert.deepEqual(byHero(archived, 'standard'), byHero(result, 'standard'))
    assert.deepEqual(await invoke('lesson-task-options', standardTransfer), standardOptions)

    const preSourceChange = await nativeSessions()
    await host.stop()
    await writeFile(patch, JSON.stringify([fixture, { id: 'preset-standard',
      config: { id: 'standard', plugins: [
        { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
        { id: 'present', name: '@deepseek-ai/dsh-tool-present', disabled: true },
      ] } }]))
    host = await startHost(env, patch)
    await invoke('lesson-task-options', standardTransfer, 422)
    await invoke('lesson-task-preview', standardSelection, 422)
    assert.deepEqual(await nativeSessions(), preSourceChange)
  } finally {
    await recipient?.stop()
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('isolated Lighthouse rematch lesson makes the real review choice visible', { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-lighthouse-lesson-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const files = ['01-waystation.md', '02-lighthouse.md', '03-old-bridge.md']
  const material = '02-lighthouse.md'
  const launchId = 'a'.repeat(32)
  let host
  try {
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, fields, status) => (await host.request(endpoint, { action, ...fields }, status)).value
    const open = (id, status) => invoke('lighthouse-rematch-open', { launchId: id }, status)
    const read = filter => invoke('workspace-comparison', filter)
    const completedHandoffs = async () => (await invoke('lighthouse-handoff-history')).items
    const workspace = '/api/loadout-fixture-session'
    const history = sessionId => host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const membership = async workspaceId => (await host.request(workspace, { inspectWorkspaceId: workspaceId })).sessionIds
    const catalog = async () => {
      const { plans, presets } = (await host.request(endpoint)).value
      return { plans, xp: presets.find(item => item.id === 'standard').rank?.xp ?? 0 }
    }
    const send = ({ sessionId, task, requestId }) => host.request(turnEndpoint, { sessionId, text: task, requestId })
    const noMessages = replay => !replay.events.some(item => item.type === 'turn/start' || item.type === 'user/message')
    const before = await catalog()
    assert.deepEqual(before.plans, [])
    assert.deepEqual(await completedHandoffs(), [])
    assert.equal((await host.request(endpoint)).value.hasLighthouseHandoffs, undefined)
    await invoke('lighthouse-handoff-history', { before: 'invalid' }, 422)
    const startReview = (fields, status) => invoke('lighthouse-review-start-open', fields, status)
    const ownPreview = await invoke('lighthouse-review-start-preview')
    assert.equal(ownPreview.sampleLanguage, 'zh')
    assert.deepEqual(ownPreview.routes, ['direct', 'review'])
    assert.equal(ownPreview.played, undefined)
    const ownEnglishPreview = await host.requestRaw(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'lighthouse-review-start-preview' }),
    })
    assert.equal(ownEnglishPreview.status, 200)
    const { value: englishStart } = await ownEnglishPreview.json()
    assert.equal(englishStart.sampleLanguage, 'en')
    assert.notEqual(englishStart.token, ownPreview.token)
    assert.notEqual(englishStart.task, ownPreview.task)
    await startReview({ token: englishStart.token, launchId: '2'.repeat(32), arm: 'review' }, 422)
    await startReview({ token: ownPreview.token, launchId: '2'.repeat(32), arm: 'minimal' }, 422)
    assert.equal((await host.request(endpoint)).value.hasLighthouseRuns, undefined)
    assert.deepEqual(await invoke('lighthouse-pending-runs'), { items: [] })
    await open('../', 422)
    await open('z'.repeat(32), 422)
    const [baseline, repeat] = await Promise.all([open(launchId), open(launchId)])
    assert.deepEqual(repeat, baseline)
    const filter = { comparisonId: baseline.id }
    const lesson = await read(filter)
    assert.equal(lesson.lesson, 'lighthouse-rematch')
    assert.deepEqual(lesson.arms.map(arm => [arm.id, arm.status]), [['direct', 'waiting']])
    assert.equal(lesson.material, material)
    assert.equal(lesson.task, baseline.task)
    assert.match(lesson.task, /^【工作区同题对照】\n选定材料 "02-lighthouse\.md"\n/u)
    assert.equal(lesson.materialState, 'verified')
    assert.equal((await read()).id, undefined)
    const native = await history(baseline.sessionId)
    assert.equal(native.workspaceId, lesson.workspaceId)
    assert.equal(native.inherited, 0)
    assert.ok(noMessages(native))
    assert.deepEqual((await readdir(native.workspacePath)).sort(), files)
    const contents = await Promise.all(files.map(file => readFile(join(native.workspacePath, file), 'utf8')))
    assert.match(contents[1], /North Shore Lighthouse/u)
    assert.deepEqual(await membership(lesson.workspaceId), [baseline.sessionId])
    assert.deepEqual(await catalog(), before)
    const draftMember = (await equipmentIn(host, baseline.sessionId)).workspaceComparison
    assert.equal(draftMember.lesson, lesson.lesson)
    assert.equal(draftMember.canTryDeliveryReview, undefined)
    await invoke('workspace-comparison-open', { ...filter, arm: 'review' }, 422)
    const reviewHash = createHash('sha256').update(JSON.stringify(['workspace-comparison', baseline.id, 'review', 'session'])).digest('hex')
    assert.equal(await read({ sessionId: 'session-' + reviewHash.slice(0, 32) }), null)
    assert.deepEqual(await invoke('workspace-comparison-open', { ...filter, arm: 'direct' }), baseline)
    const root = { ...filter, kind: 'workspace', arm: 'direct' }
    await invoke('rematch-comparison-options', root, 422)
    const shareReview = (kind, comparisonId, arm, status) =>
      invoke('lighthouse-review-challenge-share', { kind, comparisonId, arm }, status)
    await shareReview('workspace', baseline.id, 'direct', 422)

    await send(baseline)
    const direct = (await read(filter)).arms[0]
    assert.equal(direct.status, 'complete')
    assert.equal(direct.materialDelivered, true)
    assert.equal(direct.canRematch, true)
    const resultMember = (await equipmentIn(host, baseline.sessionId)).workspaceComparison
    assert.equal(resultMember.canTryDeliveryReview, true)
    assert.equal(resultMember.canReplayLighthouseEvidence, undefined)
    assert.deepEqual(direct.entries.map(item => [item.name, item.state]), [['present', 'completed']])
    assert.deepEqual(direct.deliverables, [{ name: material, turn: 1 }])
    const directReplay = await history(baseline.sessionId)
    const directFile = directReplay.events.find(item => item.type === 'deliverables/presented')
    assert.equal(directFile.data.files[0].path, join(native.workspacePath, material))
    const options = await invoke('rematch-comparison-options', root)
    assert.equal(options.suggestedGearId, 'review')
    assert.ok(options.available.some(item => item.id === 'review'))
    const change = { addId: 'review' }
    const preview = await invoke('rematch-comparison-preview', { ...root, change })
    assert.ok(preview.token)
    assert.equal(preview.change.added.id, 'review')
    assert.equal(preview.change.removed, undefined)
    assert.ok(preview.comparison.gained.some(item => item.id === 'review'))
    assert.equal(preview.task, baseline.task)
    const retry = launch => invoke('rematch-comparison-open', { ...root, change, token: preview.token, launchId: launch })
    const replayReview = (comparisonId, launchId, status) => invoke('lighthouse-review-repeat', { comparisonId, launchId }, status)
    await replayReview(baseline.id, '1'.repeat(32), 422)
    const questions = '/api/loadout-fixture-handoff-question'
    async function choose(attempt, answer) {
      assert.notEqual(attempt.sessionId, baseline.sessionId)
      assert.equal(attempt.task, baseline.task)
      const replay = await history(attempt.sessionId)
      assert.equal(replay.workspacePath, native.workspacePath)
      assert.equal(replay.workspaceId, lesson.workspaceId)
      assert.equal(replay.inherited, 0)
      assert.ok(noMessages(replay))
      const replayMember = (await equipmentIn(host, attempt.sessionId)).rematchComparison
      assert.equal(replayMember.lesson, lesson.lesson)
      assert.equal(replayMember.canTryDeliveryReview, undefined)
      const turn = send(attempt)
      turn.catch(() => {})
      let question
      try {
        for (let count = 0; count < 100 && !question; count++) {
          question = (await host.request(questions, { sessionId: attempt.sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(item => item.label), ['Confirm handoff', 'Revise draft'])
        const comparison = await invoke('rematch-comparison', { comparisonId: attempt.id })
        const pending = comparison.arms.find(arm => arm.id === 'rematch')
        assert.equal(pending.status, 'waiting-choice')
        assert.ok(!pending.deliverables?.length)
        assert.equal(comparison.publicReviewOutcome, undefined)
        assert.equal(comparison.canRepeatLighthouseReview, undefined)
        assert.equal(comparison.reviewChoiceComparison, undefined)
      } finally {
        if (question) await host.request(questions, { sessionId: attempt.sessionId, choice: answer })
        await turn
      }
      const completed = await invoke('rematch-comparison', { sessionId: attempt.sessionId })
      assert.equal(completed.lesson, lesson.lesson)
      assert.equal(completed.previous.lesson, lesson.lesson)
      assert.equal(completed.previous.sessionId, baseline.sessionId)
      assert.equal(completed.previous.comparisonId, baseline.id)
      const rematch = completed.arms.find(arm => arm.id === 'rematch')
      assert.equal(rematch.status, 'complete')
      assert.deepEqual(rematch.entries[0].choices, [answer])
      const outcome = completed.publicReviewOutcome
      assert.equal(completed.canRepeatLighthouseReview, true)
      assert.equal(outcome.material, material)
      assert.deepEqual(outcome.arms.map(({ id, style, choices, sessionId }) => [id, style, choices, sessionId]), [
        ['baseline', 'direct', [], baseline.sessionId], ['rematch', 'review', [answer], attempt.sessionId],
      ])
      assert.deepEqual(outcome.arms.map(side => side.lessonTaskSource), [
        { kind: 'workspace', comparisonId: baseline.id, arm: 'direct', handoffPairId: attempt.id },
        { kind: 'rematch', comparisonId: attempt.id, arm: 'rematch', handoffPairId: attempt.id },
      ])
      assert.equal(outcome.arms[0].materialDelivered, true)
      assert.equal(outcome.arms[0].deliveredCount, 1)
      assert.deepEqual(outcome.arms[0].deliverables, [{ name: material, turn: 1, seq: directFile.seq, index: 0 }])
      const events = (await history(attempt.sessionId)).events
      const user = events.find(item => item.type === 'user/message' && item.data.source.kind === 'user')
      assert.equal(user.data.content[0].text, baseline.task)
      return { rematch, outcome: outcome.arms[1], paired: completed.reviewChoiceComparison,
        presented: events.find(item => item.type === 'deliverables/presented') }
    }
    const confirmed = await retry('b'.repeat(32))
    await replayReview(confirmed.id, '1'.repeat(32), 422)
    const confirmedResult = await choose(confirmed, 'Confirm handoff')
    assert.equal(confirmedResult.paired, undefined)
    assert.deepEqual(confirmedResult.rematch.entries.map(item => item.name), ['ask_user_question', 'present'])
    assert.equal(confirmedResult.outcome.materialDelivered, true)
    assert.equal(confirmedResult.outcome.deliveredCount, 1)
    assert.deepEqual(confirmedResult.outcome.deliverables,
      [{ name: material, turn: 1, seq: confirmedResult.presented.seq, index: 0 }])
    assert.deepEqual(confirmedResult.rematch.deliverables, confirmedResult.outcome.deliverables)
    assert.equal(confirmedResult.presented.data.files[0].path, directFile.data.files[0].path)
    await replayReview(confirmed.id, '../', 422)
    const [revised, duplicate] = await Promise.all([replayReview(confirmed.id, 'c'.repeat(32)), replayReview(confirmed.id, 'c'.repeat(32))])
    assert.deepEqual(duplicate, revised)
    assert.notEqual(revised.sessionId, confirmed.sessionId)
    const [confirmedNative, revisedDraft] = await Promise.all([history(confirmed.sessionId), history(revised.sessionId)])
    assert.equal(revisedDraft.presetId, confirmedNative.presetId)
    assert.ok(noMessages(revisedDraft))
    assert.equal((await invoke('rematch-comparison', { comparisonId: confirmed.id })).reviewChoiceComparison, undefined)
    const revisedResult = await choose(revised, 'Revise draft')
    assert.deepEqual(revisedResult.rematch.entries.map(item => item.name), ['ask_user_question'])
    assert.deepEqual(revisedResult.rematch.deliverables, [])
    assert.equal(revisedResult.presented, undefined)
    assert.equal(revisedResult.outcome.materialDelivered, false)
    assert.equal(revisedResult.outcome.deliveredCount, 0)
    assert.deepEqual(revisedResult.outcome.deliverables, [])
    const confirmedSide = { sessionId: confirmed.sessionId, choices: ['Confirm handoff'], materialDelivered: true,
      deliverables: confirmedResult.outcome.deliverables }
    const revisedSide = { sessionId: revised.sessionId, choices: ['Revise draft'], materialDelivered: false, deliverables: [] }
    const directPreviewAction = 'lighthouse-review-direct-preview'
    const checkedZero = await invoke(directPreviewAction, { kind: 'rematch', comparisonId: revised.id, arm: 'rematch' })
    assert.equal(checkedZero.baseline.choice, 'Revise draft')
    assert.equal(checkedZero.baseline.materialDelivered, false)
    assert.equal(checkedZero.change.removed.id, 'review')
    assert.equal((await equipmentIn(host, revised.sessionId)).rematchComparison.canTryDirectDelivery, true)
    assert.deepEqual(revisedResult.paired, { current: revisedSide, other: confirmedSide })
    const confirmedBoard = await invoke('rematch-comparison', { comparisonId: confirmed.id })
    assert.deepEqual(confirmedBoard.reviewChoiceComparison, { current: confirmedSide, other: revisedSide })
    assert.deepEqual(new Set(await membership(lesson.workspaceId)), new Set([baseline.sessionId, confirmed.sessionId, revised.sessionId]))

    const soloSources = (await invoke('rematch-comparison', { comparisonId: revised.id })).publicReviewOutcome.arms
      .map(side => side.lessonTaskSource)
    const soloPath = join(directory, 'solo-private')
    const soloMaterial = '会签 文件.md'
    await mkdir(soloPath)
    await writeFile(join(soloPath, soloMaterial), '# Private solo handoff')
    const soloWorkspace = await host.request(workspace, { presetId: 'standard', workspacePath: soloPath })
    for (const [index, source] of soloSources.entries()) {
      const options = await invoke('lesson-task-options', source)
      assert.equal(options.source.sessionId, [baseline.sessionId, revised.sessionId][index])
      assert.ok(options.workspaceIds.includes(soloWorkspace.workspaceId))
      assert.ok(!options.workspaceIds.includes(lesson.workspaceId))
    }
    await invoke('lesson-task-options', { ...soloSources[1], handoffPairId: confirmed.id }, 422)
    const soloFields = { ...soloSources[0], workspaceId: soloWorkspace.workspaceId, material: soloMaterial,
      task: 'Deliver the personal meeting note.' }
    const soloPreview = await invoke('lesson-task-preview', soloFields)
    assert.deepEqual(await membership(soloWorkspace.workspaceId), [soloWorkspace.sessionId])
    const soloDirect = await invoke('lesson-task-open', { ...soloFields, token: soloPreview.token, launchId: '8'.repeat(32) })
    assert.ok(noMessages(await history(soloDirect.sessionId)))
    await send(soloDirect)
    const soloDirectResult = await invoke('lesson-task-result', { sessionId: soloDirect.sessionId })
    assert.equal(soloDirectResult.materialDelivered, true)
    assert.deepEqual(soloDirectResult.handoffAlternate.source, soloSources[1])
    const soloReplayFields = { ...soloFields, ...soloDirectResult.handoffAlternate.source, handoffAlternateOf: soloDirect.sessionId }
    const soloReplayPreview = await invoke('lesson-task-preview', soloReplayFields)
    assert.equal(soloReplayPreview.sameHandoffTask, true)
    const soloReview = await invoke('lesson-task-open', { ...soloReplayFields, token: soloReplayPreview.token, launchId: '9'.repeat(32) })
    const inspectSoloReview = () => invoke('lesson-task-result', { sessionId: soloReview.sessionId })
    assert.equal((await inspectSoloReview()).handoffPair, undefined)
    const soloResult = await finishFriendReview(soloReview, 'Revise draft', inspectSoloReview)
    assert.deepEqual(soloResult.handoffPair.arms.map(({ style, sessionId, materialDelivered, choices }) =>
      [style, sessionId, materialDelivered, choices]), [
      ['direct', soloDirect.sessionId, true, []], ['review', soloReview.sessionId, false, ['Revise draft']],
    ])
    assert.equal((await invoke('lesson-task-result', { sessionId: soloReview.sessionId, review: true, pairSide: 'direct' })).sessionId,
      soloDirect.sessionId)

    const directCode = (await shareReview('workspace', baseline.id, 'direct')).code
    const reviewCode = (await shareReview('rematch', revised.id, 'rematch')).code
    const invitationFields = code => {
      assert.match(code, /^DSHC3\./)
      return JSON.parse(Buffer.from(code.slice(6), 'base64url').toString('utf8'))
    }
    assert.deepEqual(invitationFields(directCode), { sample: 'lighthouse-delivery-review-1-zh', played: 'direct' })
    assert.deepEqual(invitationFields(reviewCode), { sample: 'lighthouse-delivery-review-1-zh', played: 'review' })
    assert.deepEqual(await shareReview('rematch', confirmed.id, 'rematch'), { code: reviewCode })
    assert.equal((await equipmentIn(host, revised.sessionId)).rematchComparison.reviewInvitation, 'review')
    await shareReview('workspace', baseline.id, 'review', 422)
    const malformed = 'DSHC3.' + Buffer.from(JSON.stringify({ ...invitationFields(directCode), task: 'hidden' })).toString('base64url')
    await invoke('lighthouse-challenge-preview', { code: malformed }, 422)
    const check = await host.requestRaw(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'lighthouse-challenge-preview', code: directCode }),
    })
    assert.equal(check.status, 200)
    const { value: invitation } = await check.json()
    assert.equal(invitation.kind, 'delivery-review')
    assert.equal(invitation.sampleLanguage, 'zh')
    assert.equal(invitation.task, baseline.task)
    assert.deepEqual(invitation.routes, ['direct', 'review'])
    const friendId = '8'.repeat(32)
    const friendOpen = (arm, id, token = invitation.token, status) =>
      invoke('lighthouse-challenge-open', { code: directCode, token, arm, launchId: id }, status)
    const reviewDrafts = async () => (await invoke('lighthouse-pending-runs')).items.map(({ kind, sessionId, arm, sampleLanguage }) =>
      [kind, sessionId, arm, sampleLanguage])
    assert.equal((await host.request(endpoint)).value.hasLighthouseRuns, undefined)
    await friendOpen('review', friendId, '0'.repeat(64), 422)
    assert.deepEqual(await reviewDrafts(), [])
    const [friend, again] = await Promise.all([friendOpen('review', friendId), friendOpen('review', friendId)])
    assert.deepEqual(again, friend)
    await friendOpen('direct', friendId, invitation.token, 422)
    const friendDraft = await history(friend.sessionId)
    assert.notEqual(friendDraft.workspaceId, lesson.workspaceId)
    assert.equal(friend.task, baseline.task)
    assert.ok(noMessages(friendDraft))
    assert.deepEqual(await membership(friendDraft.workspaceId), [friend.sessionId])
    assert.equal(await readFile(join(friendDraft.workspacePath, material), 'utf8'), contents[1])
    const friendMember = (await equipmentIn(host, friend.sessionId)).workspaceComparison
    assert.equal(friendMember.reviewChallengeArm, 'review')
    assert.equal(friendMember.firstTaskPending, true)
    assert.equal(friendMember.reviewInvitation, undefined)
    assert.equal((await host.request(endpoint)).value.hasLighthouseRuns, true)
    assert.equal((await host.request(endpoint)).value.hasLighthouseHandoffs, true)
    assert.ok(!(await completedHandoffs()).some(item => item.sessionId === friend.sessionId))
    assert.deepEqual(await reviewDrafts(), [['delivery-review', friend.sessionId, 'review', 'zh']])
    async function finishFriendReview(attempt, choice, inspect = async () => (await read({ comparisonId: attempt.id })).arms[0]) {
      const turn = send(attempt)
      turn.catch(() => {})
      let question
      try {
        for (let count = 0; count < 100 && !question; count++) {
          question = (await host.request(questions, { sessionId: attempt.sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(item => item.label), ['Confirm handoff', 'Revise draft'])
        assert.equal((await inspect()).status, 'waiting-choice')
      } finally {
        if (question) await host.request(questions, { sessionId: attempt.sessionId, choice })
        await turn
      }
      return inspect()
    }
    const reviewSource = { kind: 'workspace', comparisonId: friend.id, arm: 'review' }
    await invoke('lighthouse-review-report', reviewSource, 422)
    const friendResult = await finishFriendReview(friend, 'Revise draft')
    assert.equal(friendResult.status, 'complete')
    assert.equal(friendResult.materialDelivered, false)
    assert.deepEqual(friendResult.entries[0].choices, ['Revise draft'])
    assert.deepEqual(friendResult.deliverables, [])
    assert.deepEqual(await reviewDrafts(), [])
    assert.deepEqual(await shareReview('workspace', friend.id, 'review'), { code: reviewCode })
    const friendDirect = await friendOpen('direct', '9'.repeat(32))
    assert.equal(friendDirect.task, friend.task)
    const friendDirectHistory = await history(friendDirect.sessionId)
    assert.notEqual(friendDirectHistory.workspaceId, friendDraft.workspaceId)
    assert.ok(noMessages(friendDirectHistory))
    assert.deepEqual(await reviewDrafts(), [['delivery-review', friendDirect.sessionId, 'direct', 'zh']])
    await send(friendDirect)
    assert.equal((await read({ comparisonId: friendDirect.id })).arms[0].materialDelivered, true)
    assert.equal((await history(friendDirect.sessionId)).events.find(item => item.type === 'deliverables/presented').data.files[0].path,
      join(friendDirectHistory.workspacePath, material))
    const directSource = { kind: 'workspace', comparisonId: friendDirect.id, arm: 'direct' }
    const historiesBeforeRead = await Promise.all([history(friend.sessionId), history(friendDirect.sessionId)])
    const handoffs = await completedHandoffs()
    const chosen = [friend, friendDirect].map(attempt => handoffs.find(item => item.sessionId === attempt.sessionId))
    assert.deepEqual(chosen.map(({ sourceKind, comparisonId, arm, played, sampleLanguage, decision, originalAttached }) =>
      [sourceKind, comparisonId, arm, played, sampleLanguage, decision, originalAttached]), [
      ['workspace', friend.id, 'review', 'review', 'zh', 'revise', false],
      ['workspace', friendDirect.id, 'direct', 'direct', 'zh', 'direct', true],
    ])
    const [firstHandoff] = handoffs
    const olderHandoffs = await invoke('lighthouse-handoff-history', { before: firstHandoff.createdAt + ':' + firstHandoff.sessionId })
    assert.deepEqual(olderHandoffs.items, handoffs.slice(1))
    assert.deepEqual(await Promise.all([history(friend.sessionId), history(friendDirect.sessionId)]), historiesBeforeRead)
    const [directReport, reviewReport] = await Promise.all([
      invoke('lighthouse-review-report', directSource), invoke('lighthouse-review-report', reviewSource),
    ])
    function reportFields(code) {
      assert.match(code, /^DSHR3\./)
      return JSON.parse(Buffer.from(code.slice(6), 'base64url').toString('utf8'))
    }
    assert.deepEqual(reportFields(directReport.code), {
      sample: 'lighthouse-delivery-review-1-zh', played: 'direct', decision: 'direct', originalAttached: true,
    })
    assert.deepEqual(reportFields(reviewReport.code), {
      sample: 'lighthouse-delivery-review-1-zh', played: 'review', decision: 'revise', originalAttached: false,
    })
    assert.equal(reviewReport.local.choiceLabel, 'Revise draft')
    const compareReview = (source, code, status) => invoke('lighthouse-review-report-compare', { ...source, code }, status)
    const directComparison = await compareReview(directSource, reviewReport.code)
    assert.deepEqual(directComparison.local, directReport.local)
    assert.deepEqual(directComparison.friend, { language: 'zh', played: 'review', decision: 'revise', originalAttached: false })
    assert.deepEqual((await compareReview(reviewSource, directReport.code)).friend, {
      language: 'zh', played: 'direct', decision: 'direct', originalAttached: true,
    })
    const differentLanguage = 'DSHR3.' + Buffer.from(JSON.stringify({
      ...reportFields(reviewReport.code), sample: 'lighthouse-delivery-review-1-en',
    })).toString('base64url')
    const scopedChinese = await invoke('lighthouse-handoff-history', { code: reviewReport.code })
    assert.equal(scopedChinese.sampleLanguage, 'zh')
    assert.deepEqual(scopedChinese.items, handoffs.filter(item => item.sampleLanguage === 'zh'))
    assert.deepEqual(await invoke('lighthouse-handoff-history', { code: differentLanguage }), { items: [], sampleLanguage: 'en' })
    await invoke('lighthouse-handoff-history', { code: 'DSHR3.invalid' }, 422)
    assert.deepEqual(await completedHandoffs(), handoffs)
    await compareReview(directSource, differentLanguage, 422)
    await compareReview(directSource, reviewCode, 422)
    const repeatReport = (code, status) =>
      invoke('lighthouse-review-report-replay', { ...reviewSource, code, launchId: '7'.repeat(32) }, status)
    const tryDirectReport = (code, source = reviewSource, status) =>
      invoke('lighthouse-review-report-replay', { ...source, code, route: 'direct', launchId: '7'.repeat(32) }, status)
    const tryReviewFromDirect = (code, launchId = '3'.repeat(32), status) =>
      invoke('lighthouse-review-report-replay', { ...directSource, code, launchId }, status)
    await repeatReport(differentLanguage, 422)
    await tryDirectReport(differentLanguage, reviewSource, 422)
    await tryDirectReport(reviewReport.code, reviewSource, 422)
    await tryDirectReport(directReport.code, directSource, 422)
    await tryReviewFromDirect(differentLanguage, '3'.repeat(32), 422)
    assert.deepEqual(await reviewDrafts(), [])
    const reciprocal = []
    for (const [choice, launchDigit, attached] of [['Revise draft', '3', false], ['Confirm handoff', '4', true]]) {
      const openReview = () => tryReviewFromDirect(reviewReport.code, launchDigit.repeat(32))
      const [opened, duplicate] = await Promise.all([openReview(), openReview()])
      assert.deepEqual(opened, duplicate)
      assert.equal(opened.task, friendDirect.task)
      const draft = await history(opened.sessionId)
      assert.notEqual(draft.workspaceId, friendDirectHistory.workspaceId)
      assert.equal(draft.presetId, friendDraft.presetId)
      assert.ok(noMessages(draft))
      assert.equal(await readFile(join(draft.workspacePath, material), 'utf8'), contents[1])
      assert.deepEqual(await membership(draft.workspaceId), [opened.sessionId])
      const readPair = () => read({ comparisonId: opened.id })
      assert.equal((await readPair()).ownReviewPair, undefined)
      assert.equal((await equipmentIn(host, opened.sessionId)).workspaceComparison.canCompareOwnReview, undefined)
      const result = await finishFriendReview(opened, choice)
      const board = await readPair()
      assert.deepEqual(board.ownReviewPair.arms.map(({ id, sessionId, choices, materialDelivered, deliveredCount }) =>
        [id, sessionId, choices, materialDelivered, deliveredCount]), [
        ['review', opened.sessionId, [choice], attached, Number(attached)],
        ['direct', friendDirect.sessionId, [], true, 1],
      ])
      assert.deepEqual(board.ownReviewPair.arms[0].deliverables, result.deliverables)
      const pairSources = board.ownReviewPair.arms.map(side => side.lessonTaskSource)
      assert.deepEqual(pairSources, [
        { ...reviewSource, comparisonId: opened.id, handoffPairId: opened.id },
        { ...directSource, handoffPairId: opened.id },
      ])
      assert.equal((await equipmentIn(host, opened.sessionId)).workspaceComparison.canCompareOwnReview, true)
      assert.equal(board.directRematchArm, undefined)
      assert.equal((await equipmentIn(host, opened.sessionId)).workspaceComparison.canTryDirectDelivery, undefined)
      assert.deepEqual(await Promise.all(pairSources.map(async source =>
        (await invoke('lesson-task-options', source)).source.sessionId)), [opened.sessionId, friendDirect.sessionId])
      reciprocal.push({ readPair, pair: board.ownReviewPair })
    }
    const directMaterial = join(friendDirectHistory.workspacePath, material)
    await appendFile(directMaterial, '\nChanged original direct sample.\n')
    await tryReviewFromDirect(reviewReport.code, '3'.repeat(32), 422)
    for (const { readPair } of reciprocal) assert.equal((await readPair()).ownReviewPair, undefined)
    await writeFile(directMaterial, contents[1])
    for (const { readPair, pair } of reciprocal) assert.deepEqual((await readPair()).ownReviewPair, pair)
    const [reviewAgain, sameAgain] = await Promise.all([repeatReport(directReport.code), repeatReport(directReport.code)])
    assert.deepEqual(sameAgain, reviewAgain)
    assert.equal(reviewAgain.task, friend.task)
    const againHistory = await history(reviewAgain.sessionId)
    assert.notEqual(againHistory.workspaceId, friendDraft.workspaceId)
    assert.equal(await readFile(join(againHistory.workspacePath, material), 'utf8'), contents[1])
    assert.ok(noMessages(againHistory))
    assert.deepEqual(await membership(againHistory.workspaceId), [reviewAgain.sessionId])
    assert.deepEqual(await reviewDrafts(), [['delivery-review', reviewAgain.sessionId, 'review', 'zh']])
    const confirmedAgain = await finishFriendReview(reviewAgain, 'Confirm handoff')
    assert.equal(confirmedAgain.materialDelivered, true)
    assert.deepEqual(confirmedAgain.entries.map(item => item.name), ['ask_user_question', 'present'])
    const completedAgainReport = await invoke('lighthouse-review-report', { ...reviewSource, comparisonId: reviewAgain.id })
    assert.deepEqual(reportFields(completedAgainReport.code), {
      sample: 'lighthouse-delivery-review-1-zh', played: 'review', decision: 'confirm', originalAttached: true,
    })
    const [triedDirect, sameDirect] = await Promise.all([tryDirectReport(directReport.code), tryDirectReport(directReport.code)])
    assert.deepEqual(sameDirect, triedDirect)
    assert.notEqual(triedDirect.sessionId, reviewAgain.sessionId)
    assert.equal(triedDirect.task, friend.task)
    const triedHistory = await history(triedDirect.sessionId)
    assert.notEqual(triedHistory.workspaceId, friendDraft.workspaceId)
    assert.equal(triedHistory.presetId, friendDirectHistory.presetId)
    assert.equal(await readFile(join(triedHistory.workspacePath, material), 'utf8'), contents[1])
    assert.ok(noMessages(triedHistory))
    assert.deepEqual(await membership(triedHistory.workspaceId), [triedDirect.sessionId])
    assert.deepEqual(await reviewDrafts(), [['delivery-review', triedDirect.sessionId, 'direct', 'zh']])
    assert.equal((await read({ comparisonId: triedDirect.id })).ownReviewPair, undefined)
    assert.equal((await equipmentIn(host, triedDirect.sessionId)).workspaceComparison.canCompareOwnReview, undefined)
    await send(triedDirect)
    const triedBoard = await read({ comparisonId: triedDirect.id })
    const triedResult = triedBoard.arms[0]
    assert.equal(triedResult.materialDelivered, true)
    assert.deepEqual(triedResult.entries.map(item => item.name), ['present'])
    assert.equal(triedBoard.ownReviewPair.material, material)
    assert.deepEqual(triedBoard.ownReviewPair.arms.map(({ id, sessionId, choices, materialDelivered }) =>
      [id, sessionId, choices, materialDelivered]), [
      ['review', friend.sessionId, ['Revise draft'], false],
      ['direct', triedDirect.sessionId, [], true],
    ])
    assert.deepEqual(triedBoard.ownReviewPair.arms[0].deliverables, [])
    assert.deepEqual(triedBoard.ownReviewPair.arms[1].deliverables, triedResult.deliverables)
    const pairedSources = triedBoard.ownReviewPair.arms.map(side => side.lessonTaskSource)
    assert.deepEqual(pairedSources, [
      { ...reviewSource, handoffPairId: triedDirect.id },
      { kind: 'workspace', comparisonId: triedDirect.id, arm: 'direct', handoffPairId: triedDirect.id },
    ])
    await invoke('lesson-task-options', { ...pairedSources[0], handoffPairId: friendDirect.id }, 422)
    await invoke('lesson-task-options', { ...reviewSource, comparisonId: reviewAgain.id, handoffPairId: triedDirect.id }, 422)
    const carryPath = join(directory, 'carry-private')
    const carryMaterial = 'materials/reuse-fixture.md'
    const carryFile = join(carryPath, carryMaterial)
    await mkdir(dirname(carryFile), { recursive: true })
    const carryText = '# New private handoff notes'
    const carryBrief = 'Deliver these private notes.'
    await writeFile(carryFile, carryText)
    const carryWorkspace = await host.request(workspace, { presetId: 'standard', workspacePath: carryPath })
    const carried = new Set([carryWorkspace.sessionId])
    const carriedResults = []
    for (const side of triedBoard.ownReviewPair.arms) {
      const source = side.lessonTaskSource
      const review = side.id === 'review'
      const options = await invoke('lesson-task-options', source)
      assert.equal(options.source.sessionId, side.sessionId)
      assert.ok(options.workspaceIds.includes(carryWorkspace.workspaceId))
      assert.ok(!options.workspaceIds.includes(triedHistory.workspaceId))
      assert.equal(options.source.handoffPairId, triedDirect.id)
      const fields = { ...source, workspaceId: carryWorkspace.workspaceId, material: carryMaterial, task: carryBrief }
      const preview = await invoke('lesson-task-preview', fields)
      assert.equal(preview.source.sessionId, side.sessionId)
      assert.deepEqual(new Set(preview.gear.map(item => item.id)), new Set(review ? ['present', 'review'] : ['present']))
      assert.equal(preview.material, carryMaterial)
      assert.ok(!preview.task.includes(material))
      assert.deepEqual(new Set(await membership(carryWorkspace.workspaceId)), carried)
      const opened = await invoke('lesson-task-open', { ...fields, token: preview.token, launchId: (review ? 'a' : 'b').repeat(32) })
      carried.add(opened.sessionId)
      const unsent = await history(opened.sessionId)
      assert.equal(unsent.presetId, (await history(side.sessionId)).presetId)
      assert.ok(noMessages(unsent))
      const inspect = () => invoke('lesson-task-result', { sessionId: opened.sessionId })
      assert.equal((await inspect()).handoffAlternate, undefined)
      if (review) await finishFriendReview(opened, 'Revise draft', inspect)
      else await send(opened)
      const proof = await inspect()
      assert.equal(proof.handoffPair, undefined)
      assert.equal(proof.materialDelivered, !review)
      assert.deepEqual(proof.entries.map(item => item.name), review ? ['ask_user_question'] : ['present'])
      const events = (await history(opened.sessionId)).events
      const delivered = events.find(item => item.type === 'deliverables/presented')
      assert.equal(delivered?.data.files[0].path, review ? undefined : await realpath(carryFile))
      const alternate = { source: pairedSources[review ? 1 : 0], style: review ? 'direct' : 'review',
        rebaseline: { workspaceId: carryWorkspace.workspaceId, material: carryMaterial, brief: carryBrief } }
      assert.deepEqual(proof.handoffAlternate, alternate)
      const otherFields = { ...alternate.source, workspaceId: carryWorkspace.workspaceId, material: carryMaterial, task: carryBrief }
      const otherPreview = await invoke('lesson-task-preview', otherFields)
      assert.equal(otherPreview.task, opened.task)
      assert.equal(otherPreview.source.sessionId, triedBoard.ownReviewPair.arms[review ? 1 : 0].sessionId)
      assert.equal(otherPreview.gear.some(item => item.id === 'review'), !review)
      assert.deepEqual(new Set(await membership(carryWorkspace.workspaceId)), carried)
      carriedResults.push({ opened, inspect, otherFields, otherPreview })
    }
    await appendFile(carryFile, '\nChanged after both personal runs.\n')
    for (const result of carriedResults) assert.equal((await result.inspect()).handoffAlternate, undefined)
    await writeFile(carryFile, carryText)
    const first = carriedResults[0]
    const sameFields = { ...first.otherFields, handoffAlternateOf: first.opened.sessionId }
    await invoke('lesson-task-preview', { ...sameFields, handoffAlternateOf: '../' }, 422)
    const changedFields = { ...sameFields, task: 'Deliver a different brief on these notes.' }
    const changedPreview = await invoke('lesson-task-preview', changedFields)
    assert.equal(changedPreview.sameHandoffTask, undefined)
    const samePreview = await invoke('lesson-task-preview', sameFields)
    assert.equal(samePreview.sameHandoffTask, true)
    assert.equal(samePreview.task, first.opened.task)
    const englishSamePreview = await host.requestRaw(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'lesson-task-preview', ...sameFields }),
    })
    assert.equal(englishSamePreview.status, 200)
    const { value: translated } = await englishSamePreview.json()
    assert.equal(translated.sameHandoffTask, true)
    assert.match(translated.task, /^\[Loadout task\]/)
    assert.notEqual(samePreview.token, first.otherPreview.token)
    await invoke('lesson-task-open', { ...changedFields, token: samePreview.token, launchId: 'c'.repeat(32) }, 422)
    assert.deepEqual(new Set(await membership(carryWorkspace.workspaceId)), carried)
    const next = await invoke('lesson-task-open', { ...sameFields, token: samePreview.token, launchId: 'c'.repeat(32) })
    const inspectNext = () => invoke('lesson-task-result', { sessionId: next.sessionId })
    assert.equal(next.task, first.opened.task)
    assert.ok(noMessages(await history(next.sessionId)))
    assert.equal((await inspectNext()).handoffAlternate, undefined)
    assert.equal((await inspectNext()).handoffPair, undefined)
    await send(next)
    const nextProof = await inspectNext()
    assert.equal(nextProof.materialDelivered, true)
    assert.equal(nextProof.handoffPair.material, carryMaterial)
    assert.deepEqual(nextProof.handoffPair.arms.map(({ style, sessionId, choices, materialDelivered }) =>
      [style, sessionId, choices, materialDelivered]), [
      ['review', first.opened.sessionId, ['Revise draft'], false],
      ['direct', next.sessionId, [], true],
    ])
    assert.deepEqual(nextProof.handoffPair.arms[0].deliverables, [])
    assert.deepEqual(nextProof.handoffPair.arms[1].deliverables, nextProof.deliverables)
    assert.equal((await first.inspect()).handoffPair, undefined)
    const reviewSide = (sessionId, pairSide, status) => invoke('lesson-task-result', { sessionId, review: true, pairSide }, status)
    const saveSide = (handoffKeep, name, status) => invoke('handoff-pair-plan-save', { ...handoffKeep, name }, status)
    const soloSessionIds = carriedResults.map(({ opened }) => opened.sessionId)
    const reviewCurrent = sessionId => invoke('lesson-task-result', { sessionId, review: true })
    const [firstReviewProof, firstDirectProof] = await Promise.all(soloSessionIds.map(reviewCurrent))
    assert.equal(firstReviewProof.handoffStyle, 'review')
    assert.equal(firstDirectProof.handoffStyle, 'direct')
    for (const [index, proof] of [firstReviewProof, firstDirectProof].entries()) {
      assert.equal(proof.sessionId, soloSessionIds[index])
      assert.equal(proof.handoffKeep.sessionId, proof.sessionId)
      assert.equal(proof.handoffKeep.pairSide, 'current')
    }
    assert.deepEqual(firstReviewProof.deliverables, [])
    assert.deepEqual(firstReviewProof.entries.map(item => item.choices), [['Revise draft']])
    assert.equal(firstDirectProof.deliverables[0].name, basename(carryMaterial))
    await saveSide({ ...firstReviewProof.handoffKeep, sessionId: firstDirectProof.sessionId }, 'Wrong current result', 422)
    await invoke('lesson-task-result', { sessionId: next.sessionId, pairSide: 'direct' }, 422)
    await reviewSide(first.opened.sessionId, 'review', 422)
    const [directSide, reviewSideResult] = await Promise.all([
      reviewSide(next.sessionId, 'direct'), reviewSide(next.sessionId, 'review'),
    ])
    assert.equal(directSide.sessionId, next.sessionId)
    assert.equal(reviewSideResult.sessionId, first.opened.sessionId)
    assert.deepEqual(new Set(directSide.draft.equipmentIds), new Set(['present']))
    assert.deepEqual(new Set(reviewSideResult.draft.equipmentIds), new Set(['present', 'review']))
    assert.deepEqual(directSide.entries.map(item => item.name), ['present'])
    assert.deepEqual(reviewSideResult.entries.map(item => item.choices), [['Revise draft']])
    assert.deepEqual(reviewSideResult.deliverables, [])
    assert.equal(reviewSideResult.handoffKeep.sessionId, next.sessionId)
    await saveSide({ ...directSide.handoffKeep, pairSide: 'review' }, 'Wrong route proof', 422)
    await saveSide({ ...directSide.handoffKeep, pairSide: 'current' }, 'Wrong proof scope', 422)
    assert.deepEqual((await catalog()).plans, before.plans)
    await appendFile(carryFile, '\nChanged after the replay.\n')
    assert.equal((await inspectNext()).handoffPair, undefined)
    await saveSide(reviewSideResult.handoffKeep, 'Stale private review', 422)
    await saveSide(firstReviewProof.handoffKeep, 'Stale initial review', 422)
    assert.equal((await reviewCurrent(firstReviewProof.sessionId)).handoffKeep, undefined)
    assert.deepEqual((await catalog()).plans, before.plans)
    await writeFile(carryFile, carryText)
    assert.deepEqual((await inspectNext()).handoffPair, nextProof.handoffPair)
    const keptDirect = await saveSide(directSide.handoffKeep, 'Private direct result')
    const originalReview = await saveSide(reviewSideResult.handoffKeep, 'Private review result')
    const keptSoloReview = await saveSide(firstReviewProof.handoffKeep, 'First private review')
    const keptSoloDirect = await saveSide(firstDirectProof.handoffKeep, 'First private direct')
    const origin = ({ id, revision }, status) => invoke('plan-handoff-origin', { id, revision }, status)
    const keptReview = await invoke('plan-save', { id: originalReview.id, revision: originalReview.revision,
      name: 'Private review for the next shift', note: 'Check delivery first' })
    const storedPlan = async id => JSON.parse(await readFile(join(env.DSH_HOME, 'profiles/web/agent-loadouts/plans', id + '.json'), 'utf8'))
    assert.equal(keptDirect.presetId, (await history(next.sessionId)).presetId)
    assert.equal(keptReview.presetId, (await history(first.opened.sessionId)).presetId)
    const keptIds = [keptDirect, keptReview, keptSoloReview, keptSoloDirect].map(plan => plan.id).sort()
    const sources = [[keptDirect, next.sessionId, 'direct'], [keptReview, first.opened.sessionId, 'review'],
      [keptSoloReview, firstReviewProof.sessionId, 'review'], [keptSoloDirect, firstDirectProof.sessionId, 'direct']]
    const expectedOrigins = new Map([
      [next.sessionId, { sessionId: next.sessionId, style: 'direct', materialDelivered: true,
        choices: [], tools: ['present'], fileNames: [basename(carryMaterial)] }],
      [first.opened.sessionId, { sessionId: first.opened.sessionId, style: 'review', materialDelivered: false,
        choices: ['Revise draft'], tools: ['ask_user_question'], fileNames: [] }],
      [firstDirectProof.sessionId, { sessionId: firstDirectProof.sessionId, style: 'direct', materialDelivered: true,
        choices: [], tools: ['present'], fileNames: [basename(carryMaterial)] }],
    ])
    await origin(originalReview, 422)
    for (const [saved, sessionId, style] of sources) {
      assert.equal(saved.hasHandoffOrigin, true)
      assert.equal(saved.hasEvidenceOrigin, undefined)
      assert.equal(saved.handoffOrigin, undefined)
      assert.deepEqual(await origin(saved), expectedOrigins.get(sessionId))
      assert.deepEqual((await storedPlan(saved.id)).handoffOrigin, { sessionId, style })
      const exported = await invoke('plan-share-export', { id: saved.id, revision: saved.revision })
      assert.ok(exported.code?.startsWith('DSHH1.'), JSON.stringify(exported))
      const portable = Buffer.from(exported.code.slice('DSHH1.'.length), 'base64url').toString('utf8')
      assert.doesNotMatch(portable, /"(?:handoffOrigin|hasHandoffOrigin|sessionId|material|choices)"\s*:/u)
      for (const localDetail of [carryMaterial, carryBrief, sessionId, 'Revise draft']) {
        assert.ok(!JSON.stringify(saved).includes(localDetail))
        assert.ok(!portable.includes(localDetail), localDetail)
      }
    }
    assert.deepEqual(new Set(await membership(carryWorkspace.workspaceId)), new Set([...carried, next.sessionId]))
    await appendFile(carryFile, '\nThis file changed after the plans were saved.\n')
    assert.equal((await inspectNext()).handoffPair, undefined)
    for (const [saved, sessionId] of sources) assert.deepEqual(await origin(saved), expectedOrigins.get(sessionId))
    await writeFile(carryFile, carryText)
    assert.deepEqual((await read({ comparisonId: triedDirect.id })).ownReviewPair, triedBoard.ownReviewPair)
    assert.equal((await equipmentIn(host, triedDirect.sessionId)).workspaceComparison.canCompareOwnReview, true)
    assert.equal((await read({ comparisonId: friendDirect.id })).ownReviewPair, undefined)
    assert.deepEqual(await invoke('lighthouse-review-report', {
      ...directSource, comparisonId: triedDirect.id,
    }), directReport)
    assert.deepEqual(await invoke('lighthouse-review-report', reviewSource), reviewReport)
    await appendFile(join(friendDraft.workspacePath, material), '\nChanged recipient sample.\n')
    const afterMaterialChange = await completedHandoffs()
    assert.ok(!afterMaterialChange.some(item => item.sessionId === friend.sessionId))
    assert.ok(afterMaterialChange.some(item => item.sessionId === friendDirect.sessionId))
    await friendOpen('review', friendId, invitation.token, 422)
    await shareReview('workspace', friend.id, 'review', 422)
    await compareReview(reviewSource, directReport.code, 422)
    await tryDirectReport(directReport.code, reviewSource, 422)
    for (const { readPair, pair } of reciprocal) assert.deepEqual((await readPair()).ownReviewPair, pair)
    assert.equal((await read({ comparisonId: triedDirect.id })).ownReviewPair, undefined)
    assert.equal((await equipmentIn(host, triedDirect.sessionId)).workspaceComparison.canCompareOwnReview, undefined)
    assert.equal((await first.inspect()).handoffAlternate, undefined)
    assert.equal((await inspectNext()).handoffPair, undefined)
    assert.deepEqual((await inspectSoloReview()).handoffPair, soloResult.handoffPair)
    await saveSide(directSide.handoffKeep, 'Stale public source', 422)
    for (const [saved, sessionId] of sources) assert.deepEqual(await origin(saved), expectedOrigins.get(sessionId))
    const newMaterial = '会签 文件.md'
    const newFile = join(carryPath, newMaterial)
    await writeFile(newFile, '# Next personal handoff')
    const nextPlanFields = { id: keptSoloReview.id, revision: keptSoloReview.revision, workspaceId: carryWorkspace.workspaceId,
      material: newMaterial, task: 'Deliver the next handoff note.' }
    const nextPlanPreview = await invoke('plan-task-preview', nextPlanFields)
    assert.ok(nextPlanPreview.comparison.gained.some(item => item.id === 'review'))
    const reused = await invoke('plan-task-open', { ...nextPlanFields, token: nextPlanPreview.token, launchId: '7'.repeat(32) })
    assert.ok(noMessages(await history(reused.sessionId)))
    assert.equal((await history(reused.sessionId)).presetId, keptSoloReview.presetId)
    assert.ok(!reused.task.includes(carryBrief))
    await finishFriendReview(reused, 'Confirm handoff', async () => ({
      status: (await host.request(questions, { sessionId: reused.sessionId })).question ? 'waiting-choice' : 'complete',
    }))
    const reusedArtifact = (await history(reused.sessionId)).events.find(item => item.type === 'deliverables/presented')
    assert.equal(reusedArtifact?.data.files[0].path, await realpath(newFile))
    const savedDraft = await friendOpen('review', '5'.repeat(32))
    const staleDraft = await friendOpen('direct', '6'.repeat(32))
    const staleReplay = await history(staleDraft.sessionId)
    assert.ok(noMessages(staleReplay))
    await appendFile(join(staleReplay.workspacePath, material), '\nChanged pending sample.\n')
    assert.deepEqual(await reviewDrafts(), [['delivery-review', savedDraft.sessionId, 'review', 'zh']])

    const startFields = { token: ownPreview.token, launchId: '2'.repeat(32), arm: 'review' }
    await startReview({ ...startFields, token: invitation.token }, 422)
    const [ownReview, repeatedOwnReview] = await Promise.all([startReview(startFields), startReview(startFields)])
    assert.deepEqual(repeatedOwnReview, ownReview)
    assert.equal(ownReview.task, ownPreview.task)
    assert.equal(ownReview.task, baseline.task)
    const ownReviewDraft = await history(ownReview.sessionId)
    assert.ok(noMessages(ownReviewDraft))
    assert.deepEqual(await membership(ownReviewDraft.workspaceId), [ownReview.sessionId])
    await startReview({ ...startFields, arm: 'direct' }, 422)
    await shareReview('workspace', ownReview.id, 'review', 422)
    const soloStartSource = { kind: 'workspace', comparisonId: ownReview.id, arm: 'review' }
    await invoke(directPreviewAction, soloStartSource, 422)
    assert.equal((await equipmentIn(host, ownReview.sessionId)).workspaceComparison.canTryDirectDelivery, undefined)
    const chosenOwnReview = await finishFriendReview(ownReview, 'Confirm handoff')
    assert.equal(chosenOwnReview.materialDelivered, true)
    assert.equal((await equipmentIn(host, ownReview.sessionId)).workspaceComparison.canTryDirectDelivery, true)
    assert.equal((await read({ comparisonId: ownReview.id })).directRematchArm, 'review')
    assert.deepEqual(await shareReview('workspace', ownReview.id, 'review'), { code: reviewCode })
    const pendingBeforeDirect = await reviewDrafts()
    const directPreviewInEnglish = await host.requestRaw(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: directPreviewAction, ...soloStartSource }),
    })
    assert.equal(directPreviewInEnglish.status, 200)
    const { value: soloChange } = await directPreviewInEnglish.json()
    assert.equal(soloChange.task, ownReview.task)
    assert.equal(soloChange.baseline.sessionId, ownReview.sessionId)
    assert.equal(soloChange.baseline.choice, 'Confirm handoff')
    assert.equal(soloChange.baseline.materialDelivered, true)
    assert.deepEqual(Object.keys(soloChange.change), ['removed'])
    assert.equal(soloChange.change.removed.id, 'review')
    assert.deepEqual(await reviewDrafts(), pendingBeforeDirect)
    const openSoloDirect = (fields = {}, status) => invoke('lighthouse-review-direct-open',
      { ...soloStartSource, token: soloChange.token, launchId: '4'.repeat(32), ...fields }, status)
    await openSoloDirect({ token: checkedZero.token }, 422)
    await invoke('rematch-comparison-open', { ...soloStartSource, token: soloChange.token, change: { removeId: 'review' },
      launchId: '4'.repeat(32) }, 422)
    const sourceFile = join(ownReviewDraft.workspacePath, material)
    await appendFile(sourceFile, '\nChanged original sample.\n')
    await openSoloDirect({}, 422)
    assert.equal((await equipmentIn(host, ownReview.sessionId)).workspaceComparison.canTryDirectDelivery, undefined)
    assert.deepEqual(await reviewDrafts(), pendingBeforeDirect)
    await writeFile(sourceFile, contents[1])
    const [soloDirectRound, repeatedSoloDirect] = await Promise.all([openSoloDirect(), openSoloDirect()])
    assert.deepEqual(repeatedSoloDirect, soloDirectRound)
    assert.equal(soloDirectRound.task, ownReview.task)
    const newSoloHistory = await history(soloDirectRound.sessionId)
    assert.ok(noMessages(newSoloHistory))
    assert.notEqual(newSoloHistory.workspaceId, ownReviewDraft.workspaceId)
    assert.equal(await readFile(join(newSoloHistory.workspacePath, material), 'utf8'), contents[1])
    assert.equal((await read({ comparisonId: soloDirectRound.id })).ownReviewPair, undefined)
    await send(soloDirectRound)
    const soloDirectBoard = await read({ comparisonId: soloDirectRound.id })
    assert.deepEqual(soloDirectBoard.ownReviewPair.arms.map(side =>
      [side.style, side.sessionId, side.materialDelivered, side.choices, side.lessonTaskSource.handoffPairId]), [
      ['review', ownReview.sessionId, true, ['Confirm handoff'], soloDirectRound.id],
      ['direct', soloDirectRound.sessionId, true, [], soloDirectRound.id],
    ])
    assert.equal(soloDirectBoard.ownReviewPair.arms[1].deliverables[0].name, material)
    assert.equal((await equipmentIn(host, soloDirectRound.sessionId)).workspaceComparison.canCompareOwnReview, true)
    for (const side of soloDirectBoard.ownReviewPair.arms) {
      assert.equal((await invoke('lesson-task-options', side.lessonTaskSource)).source.sessionId, side.sessionId)
    }
    const ownDirect = await startReview({ ...startFields, launchId: '3'.repeat(32), arm: 'direct' })
    assert.equal(ownDirect.task, ownReview.task)
    const ownDirectDraft = await history(ownDirect.sessionId)
    assert.ok(noMessages(ownDirectDraft))
    assert.notEqual(ownDirectDraft.workspaceId, ownReviewDraft.workspaceId)
    assert.equal(await readFile(join(ownDirectDraft.workspacePath, material), 'utf8'), contents[1])
    await shareReview('workspace', ownDirect.id, 'direct', 422)
    await send(ownDirect)
    assert.equal((await read({ comparisonId: ownDirect.id })).arms[0].materialDelivered, true)
    assert.deepEqual(await shareReview('workspace', ownDirect.id, 'direct'), { code: directCode })
    assert.deepEqual(await reviewDrafts(), [['delivery-review', savedDraft.sessionId, 'review', 'zh']])

    const personalPath = join(directory, 'personal')
    await mkdir(personalPath)
    await writeFile(join(personalPath, 'report.md'), '# Personal workspace material')
    const personal = await host.request(workspace, { presetId: 'standard', workspacePath: personalPath })
    const own = await invoke('workspace-comparison-open', {
      launchId, arm: 'direct', workspaceId: personal.workspaceId, material: 'report.md', task: 'Review this separate report.',
    })
    assert.notEqual(own.id, baseline.id)
    assert.equal((await read()).id, own.id)
    await appendFile(join(native.workspacePath, material), '\nModified old practice material.\n')
    assert.equal((await inspectSoloReview()).handoffPair, undefined)
    await invoke('lesson-task-options', soloSources[0], 422)
    await shareReview('workspace', baseline.id, 'direct', 422)
    await shareReview('rematch', confirmed.id, 'rematch', 422)
    assert.equal((await read(filter)).materialState, 'changed')
    assert.equal((await equipmentIn(host, baseline.sessionId)).workspaceComparison.canTryDeliveryReview, undefined)
    const staleComparison = await invoke('rematch-comparison', { comparisonId: confirmed.id })
    assert.equal(staleComparison.publicReviewOutcome, undefined)
    assert.equal(staleComparison.reviewChoiceComparison, undefined)
    assert.equal(staleComparison.canRepeatLighthouseReview, undefined)
    assert.equal(staleComparison.arms.find(arm => arm.id === 'rematch').status, 'complete')
    await replayReview(confirmed.id, 'f'.repeat(32), 422)
    assert.deepEqual((await read(filter)).arms[0], direct)
    await invoke('rematch-comparison-options', root, 422)
    await invoke('rematch-comparison-preview', { ...root, change }, 422)

    const english = await host.requestRaw(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'lighthouse-rematch-open', launchId: 'd'.repeat(32) }),
    })
    assert.equal(english.status, 200)
    const fresh = (await english.json()).value
    assert.match(fresh.task, /^\[Workspace comparison\]\nSelected material: "02-lighthouse\.md"\n/u)
    const separate = await history(fresh.sessionId)
    assert.notEqual(fresh.id, baseline.id)
    assert.notEqual(separate.workspaceId, native.workspaceId)
    assert.notEqual(separate.workspacePath, native.workspacePath)
    assert.ok(noMessages(separate))
    assert.deepEqual((await readdir(separate.workspacePath)).sort(), files)
    assert.deepEqual(await Promise.all(files.map(file => readFile(join(separate.workspacePath, file), 'utf8'))), contents)
    await send(fresh)
    const englishSource = { kind: 'workspace', comparisonId: fresh.id, arm: 'direct' }
    const englishReport = await invoke('lighthouse-review-report', englishSource)
    const scopedEnglish = await invoke('lighthouse-handoff-history', { code: englishReport.code })
    assert.equal(scopedEnglish.sampleLanguage, 'en')
    assert.deepEqual(scopedEnglish.items.map(item => item.sessionId), [fresh.sessionId])
    assert.ok((await completedHandoffs()).some(item => item.sessionId === friendDirect.sessionId))
    assert.match(await readFile(join(native.workspacePath, material), 'utf8'), /Modified old practice material/u)
    assert.equal((await read()).id, own.id)
    assert.deepEqual((await invoke('lighthouse-comparison', { prototype: true })).arms.map(arm => arm.id), ['recon', 'delivery'])
    assert.deepEqual((await catalog()).plans.map(plan => plan.id).sort(), keptIds)
    await host.stop()
    host = await startHost({ ...env, DSH_LOADOUT_TEST_WRONG_LIGHTHOUSE_CARD: '1' }, patch)
    assert.deepEqual((await catalog()).plans.map(plan => plan.id).sort(), keptIds)
    for (const [saved, sessionId] of sources) assert.deepEqual(await origin(saved), expectedOrigins.get(sessionId))
    assert.deepEqual(await open(launchId), baseline)
    assert.deepEqual(await open('d'.repeat(32)), fresh)
    assert.deepEqual(await reviewDrafts(), [['delivery-review', savedDraft.sessionId, 'review', 'zh']])
    assert.ok(noMessages(await history(savedDraft.sessionId)))
    assert.equal((await read()).id, own.id)
    const wrong = await open('e'.repeat(32))
    const wrongReplay = await history(wrong.sessionId)
    const alternate = join(wrongReplay.workspacePath, 'alternate')
    await mkdir(alternate)
    await writeFile(join(alternate, material), '# Same filename in the wrong directory')
    await send(wrong)
    const wrongAttachment = (await history(wrong.sessionId)).events.find(event => event.type === 'deliverables/presented')
    assert.equal(wrongAttachment.data.files[0].path, join(alternate, material))
    const rejected = (await read({ comparisonId: wrong.id })).arms[0]
    assert.equal(rejected.materialDelivered, false)
    assert.ok(!rejected.canRematch)
    await shareReview('workspace', wrong.id, 'direct', 422)
    assert.equal((await equipmentIn(host, wrong.sessionId)).workspaceComparison.canTryDeliveryReview, undefined)
    await invoke('rematch-comparison-options', { ...root, comparisonId: wrong.id }, 422)
    const forgery = { hasHandoffOrigin: true, handoffOrigin: { sessionId: next.sessionId, style: 'direct' } }
    const ordinary = await invoke('plan-save', { name: 'Ordinary direct loadout', draft: directSide.draft, ...forgery })
    assert.equal(ordinary.hasHandoffOrigin, undefined)
    await origin(ordinary, 422)
    const replaced = await invoke('plan-save', { id: keptDirect.id, revision: keptDirect.revision,
      name: keptDirect.name, draft: directSide.draft, ...forgery })
    assert.equal(replaced.hasHandoffOrigin, undefined)
    assert.equal((await storedPlan(replaced.id)).handoffOrigin, undefined)
    await origin(keptDirect, 422)
    await origin(replaced, 422)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('Lighthouse Evidence Check offers real choices only for the unsupported handoff claim', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-lighthouse-evidence-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const material = '02-lighthouse.md'
  const sampleFiles = ['01-waystation.md', material, '03-old-bridge.md']
  const questions = '/api/loadout-fixture-handoff-question'
  let host
  let recipient
  try {
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, fields, status) => (await host.request(endpoint, { action, ...fields }, status)).value
    const open = (scenario, launchId, status) => invoke('lighthouse-evidence-open', { scenario, launchId }, status)
    const predict = (launchId, openingChoice, status, scenario = 'gap') =>
      invoke('lighthouse-evidence-open', { scenario, launchId, openingChoice }, status)
    const shareChallenge = (comparisonId, status) => invoke('lighthouse-challenge-share', { comparisonId }, status)
    const openEnglish = async (scenario, launchId) => {
      const response = await host.requestRaw(endpoint, { method: 'POST',
        headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
        body: JSON.stringify({ action: 'lighthouse-evidence-open', launchId, scenario }) })
      assert.equal(response.status, 200)
      return (await response.json()).value
    }
    const read = fields => invoke('workspace-comparison', fields)
    const pendingEvidence = (before, status) => invoke('lighthouse-pending-runs', { before }, status)
    const history = sessionId => host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const plans = async () => (await host.request(endpoint)).value.plans
    const send = ({ sessionId, task, requestId }) => host.request(turnEndpoint, { sessionId, text: task, requestId })
    const tools = native => native.events.filter(item => item.type === 'tool/call')
    const files = native => native.events.filter(item => item.type === 'deliverables/presented').flatMap(item => item.data.files)
    const replayFrom = comparisonId => ({ kind: 'workspace', comparisonId, arm: 'evidence' })
    const replayOptions = (comparisonId, status) => invoke('rematch-comparison-options', replayFrom(comparisonId), status)

    const normal = await plans()
    assert.deepEqual(await pendingEvidence(), { items: [] })
    await pendingEvidence('invalid', 422)
    await open('gap', '../', 422)
    await open('unsupported', 'a'.repeat(32), 422)
    const launchId = 'a'.repeat(32)
    const [gather, duplicate] = await Promise.all([open('gap', launchId), open('gap', launchId)])
    assert.deepEqual(duplicate, gather)
    await open('confirmed', launchId, 422)
    await predict(launchId, 'gather', 422)
    assert.match(gather.task, /两节备用电池/u)
    const predictedLaunch = 'b'.repeat(32)
    for (const rejected of ['later', false, null]) await predict(predictedLaunch, rejected, 422)
    await predict(predictedLaunch, 'qualify', 422, 'confirmed')
    const [lower, samePrediction] = await Promise.all([predict(predictedLaunch, 'pause'), predict(predictedLaunch, 'pause')])
    assert.deepEqual(samePrediction, lower)
    assert.equal((await read({ comparisonId: lower.id })).canShareChallenge, undefined)
    await shareChallenge(lower.id, 422)
    await predict(predictedLaunch, 'gather', 422)
    await open('gap', predictedLaunch, 422)
    const pause = await openEnglish('gap', 'c'.repeat(32))
    const confirmed = await openEnglish('confirmed', 'd'.repeat(32))
    assert.equal(lower.task, gather.task)
    assert.match(pause.task, /two spare batteries/u)
    assert.match(confirmed.task, /2 cans of lamp oil/u)
    assert.doesNotMatch(confirmed.task, /two spare batteries/u)
    const cases = [
      { opened: gather, scenario: 'gap', options: ['继续补证', '降级推荐', '暂缓提交'], decision: '继续补证', calls: ['read', 'ask_user_question', 'glob'] },
      { opened: lower, scenario: 'gap', options: ['继续补证', '降级推荐', '暂缓提交'], decision: '降级推荐', openingChoice: 'pause',
        calls: ['read', 'ask_user_question', 'write', 'present'], file: 'qualified-handoff.md' },
      { opened: pause, scenario: 'gap', options: ['Continue gathering evidence', 'Lower the recommendation to a qualified draft', 'Pause submission'],
        decision: 'Pause submission', calls: ['read', 'ask_user_question'] },
      { opened: confirmed, scenario: 'confirmed', calls: ['read', 'write', 'present'], file: 'verified-handoff.md' },
    ]
    assert.equal(new Set(cases.map(testCase => testCase.opened.sessionId)).size, cases.length)
    const pending = await pendingEvidence()
    assert.equal(pending.before, undefined)
    assert.ok(pending.items.every(item => item.kind === 'evidence' && Number.isSafeInteger(item.createdAt)))
    assert.deepEqual(pending.items.map(({ sessionId, scenario }) => sessionId + ':' + scenario).sort(),
      cases.map(({ opened, scenario }) => opened.sessionId + ':' + scenario).sort())
    const firstPending = pending.items[0]
    assert.deepEqual((await pendingEvidence(firstPending.createdAt + ':' + firstPending.sessionId)).items, pending.items.slice(1))
    assert.equal((await read({})).id, undefined)
    const proved = []
    for (const { opened, scenario, options, decision, openingChoice, calls, file } of cases) {
      const filter = { comparisonId: opened.id }
      const native = await history(opened.sessionId)
      const practice = native.workspacePath
      const seeded = await Promise.all(sampleFiles.map(name => readFile(join(practice, name), 'utf8')))
      assert.match(seeded[1], /2 cans of lamp oil/u)
      assert.doesNotMatch(seeded[1], /spare batteries/u)
      assert.deepEqual((await readdir(practice)).sort(), sampleFiles)
      assert.equal(native.inherited, 0)
      assert.ok(!native.events.some(event => event.type === 'user/message' || event.type === 'turn/start'))
      assert.deepEqual(tools(native), [])
      const waiting = await read(filter)
      assert.equal(waiting.lesson, 'lighthouse-evidence')
      assert.equal(waiting.scenario, scenario)
      assert.equal(waiting.task, opened.task)
      assert.equal(waiting.material, material)
      assert.deepEqual(waiting.arms.map(arm => [arm.id, arm.status]), [['evidence', 'waiting']])
      assert.equal(waiting.evidenceOpeningChoice, undefined)
      assert.equal(waiting.arms[0].canReplayLighthouseEvidence, undefined)
      assert.deepEqual((await equipmentIn(host, opened.sessionId)).workspaceComparison, {
        id: opened.id, arm: 'evidence', task: opened.task, lesson: 'lighthouse-evidence', scenario, firstTaskPending: true,
      })
      await invoke('workspace-comparison-open', { ...filter, arm: 'review' }, 422)
      if (opened === lower) await replayOptions(opened.id, 422)

      if (options) {
        const turn = send(opened)
        turn.catch(() => {})
        let question
        try {
          for (let attempt = 0; attempt < 100 && !question; attempt++) {
            question = (await host.request(questions, { sessionId: opened.sessionId })).question
            if (!question) await delay(40)
          }
          assert.deepEqual(question?.options.map(option => option.label), options)
          const pending = await read(filter)
          assert.equal(pending.evidenceOpeningChoice, undefined)
          const [arm] = pending.arms
          assert.equal(arm.status, 'waiting-choice')
          assert.ok(!(await pendingEvidence()).items.some(item => item.sessionId === opened.sessionId))
          assert.deepEqual(arm.pendingQuestions[0].options, options)
          assert.deepEqual(arm.deliverables, [])
          assert.equal(arm.canReplayLighthouseEvidence, undefined)
          if (opened === lower) await replayOptions(opened.id, 422)
          assert.deepEqual(files(await history(opened.sessionId)), [])
          const member = (await equipmentIn(host, opened.sessionId)).workspaceComparison
          assert.equal(member.lessonTaskSource, undefined)
          assert.equal(member.canReplayLighthouseEvidence, undefined)
          assert.equal(member.evidenceReportCode, undefined)
          assert.equal(member.firstTaskPending, undefined)
        } finally {
          if (question) await host.request(questions, { sessionId: opened.sessionId, choice: decision })
          await turn
        }
      } else {
        await send(opened)
      }
      const after = await history(opened.sessionId)
      const user = after.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      assert.equal(user.data.content[0].text, opened.task)
      assert.deepEqual(tools(after).map(event => event.data.name), calls)
      if (calls.includes('glob')) assert.match(JSON.stringify(tools(after).at(-1).data), /batter/u)
      assert.deepEqual(files(after).map(item => item.path), file ? [join(practice, file)] : [])
      if (file) {
        const body = await readFile(join(practice, file), 'utf8')
        assert.match(body, /Verified: 2 cans of lamp oil/u)
        if (scenario === 'gap') assert.match(body, /Unverified: two spare batteries/u)
      }
      assert.deepEqual(await Promise.all(sampleFiles.map(name => readFile(join(practice, name), 'utf8'))), seeded)
      const completed = await read({ sessionId: opened.sessionId })
      const [arm] = completed.arms
      assert.equal(arm.status, 'complete')
      assert.deepEqual(arm.entries.map(entry => [entry.name, entry.state]), calls.map(name => [name, 'completed']))
      assert.deepEqual(arm.entries.flatMap(entry => entry.choices ?? []), decision ? [decision] : [])
      assert.deepEqual(arm.deliverables, file ? [{ name: file, turn: 1 }] : [])
      assert.equal(arm.canReplayLighthouseEvidence, scenario === 'gap' ? true : undefined)
      const transfer = { kind: 'workspace', comparisonId: opened.id, arm: 'evidence' }
      assert.deepEqual(arm.lessonTaskSource, transfer)
      const member = (await equipmentIn(host, opened.sessionId)).workspaceComparison
      assert.deepEqual(member.lessonTaskSource, transfer)
      assert.equal(member.canReplayLighthouseEvidence, scenario === 'gap' ? true : undefined)
      assert.equal(member.firstTaskPending, undefined)
      if (scenario !== 'gap') assert.equal(member.evidenceReportCode, undefined)
      const openingResult = openingChoice && { choice: openingChoice, actualChoices: [decision] }
      assert.deepEqual(completed.evidenceOpeningChoice, openingResult)
      proved.push({ filter, arm, openingResult })
    }

    assert.deepEqual(await pendingEvidence(), { items: [] })
    const source = replayFrom(lower.id)
    const baseNative = await history(lower.sessionId)
    const baseFiles = (await readdir(baseNative.workspacePath)).sort()
    const workspaceDirectories = async () => (await readdir(dirname(baseNative.workspacePath))).sort()
    const before = await workspaceDirectories()
    const card = join(baseNative.workspacePath, material)
    const cardBytes = await readFile(card)
    const sampleBytes = await Promise.all(sampleFiles.map(name => readFile(join(baseNative.workspacePath, name))))
    const originalHandoff = await readFile(join(baseNative.workspacePath, 'qualified-handoff.md'))
    const options = await replayOptions(lower.id)
    assert.equal(options.evidenceReplay, true)
    assert.equal(options.publicEvidenceReplay, true)
    assert.equal(options.task, lower.task)
    assert.equal(options.material, material)
    assert.equal(options.baseline.sessionId, lower.sessionId)
    assert.deepEqual(options.baseline.choices, ['降级推荐'])
    assert.deepEqual(options.baseline.deliverables.map(item => item.name), ['qualified-handoff.md'])
    assert.ok(options.equipped.some(item => item.id === 'evidence'))
    assert.ok(options.equipped.some(item => item.id === 'present'))
    assert.deepEqual(options.available, [])
    await replayOptions(confirmed.id, 422)
    await invoke('rematch-comparison-options', { ...source, arm: 'direct' }, 422)
    const change = { removeId: 'evidence' }
    const previewFields = { ...source, change }
    const replayPreview = await invoke('rematch-comparison-preview', previewFields)
    assert.ok(replayPreview.token)
    assert.equal(replayPreview.evidenceReplay, true)
    assert.equal(replayPreview.publicEvidenceReplay, true)
    assert.equal(replayPreview.task, lower.task)
    assert.deepEqual(replayPreview.change, { removed: { id: 'evidence', name: '证据核验' } })
    assert.ok(!replayPreview.comparison.lost.some(item => item.id === 'present' || item.name === 'present'))
    for (const disallowed of [{ removeId: 'present' }, { addId: 'review' }, { removeId: 'evidence', addId: 'review' },
      { removeId: 'evidence', sourceId: 'featured:evidence' }]) {
      await invoke('rematch-comparison-preview', { ...source, change: disallowed }, 422)
    }
    const openFields = { ...previewFields, token: replayPreview.token, launchId: '9'.repeat(32) }
    await invoke('rematch-comparison-open', { ...openFields, comparisonId: pause.id }, 422)
    await invoke('rematch-comparison-open', { ...openFields, change: { removeId: 'present' } }, 422)
    await appendFile(card, '\nUnexpected edit after the public replay preview.\n')
    const staleMember = (await equipmentIn(host, lower.sessionId)).workspaceComparison
    assert.equal(staleMember.canReplayLighthouseEvidence, undefined)
    assert.equal(staleMember.evidenceReportCode, undefined)
    await replayOptions(lower.id, 422)
    await invoke('rematch-comparison-open', openFields, 422)
    assert.deepEqual(await workspaceDirectories(), before)
    await writeFile(card, cardBytes)
    assert.equal((await equipmentIn(host, lower.sessionId)).workspaceComparison.canReplayLighthouseEvidence, true)

    const [replay, duplicateReplay] = await Promise.all([
      invoke('rematch-comparison-open', openFields), invoke('rematch-comparison-open', openFields),
    ])
    assert.deepEqual(duplicateReplay, replay)
    assert.notEqual(replay.sessionId, lower.sessionId)
    assert.equal(replay.task, lower.task)
    const replayBefore = await history(replay.sessionId)
    assert.notEqual(replayBefore.workspaceId, baseNative.workspaceId)
    assert.notEqual(replayBefore.workspacePath, baseNative.workspacePath)
    assert.notEqual(replayBefore.presetId, baseNative.presetId)
    assert.equal(replayBefore.inherited, 0)
    assert.ok(!replayBefore.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
    assert.deepEqual(tools(replayBefore), [])
    assert.deepEqual((await readdir(replayBefore.workspacePath)).sort(), sampleFiles)
    assert.deepEqual(await Promise.all(sampleFiles.map(name => readFile(join(replayBefore.workspacePath, name)))), sampleBytes)
    const readReplay = () => invoke('rematch-comparison', { comparisonId: replay.id })
    const waitingReplay = await readReplay()
    assert.equal(waitingReplay.evidenceReplay, true)
    assert.equal(waitingReplay.publicEvidenceReplay, true)
    assert.equal(waitingReplay.evidenceOutcome, undefined)
    assert.equal(waitingReplay.arms[1].status, 'waiting')
    const directSource = { kind: 'rematch', comparisonId: replay.id, arm: 'rematch' }
    await invoke('lesson-task-options', directSource, 422)
    const privateHistory = () => invoke('comparison-history', { scope: 'evidence-replays', probe: true })
    assert.deepEqual(await privateHistory(), { available: false })

    await send(replay)
    const replayNative = await history(replay.sessionId)
    const user = replayNative.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(user.data.content[0].text, lower.task)
    assert.deepEqual(tools(replayNative).map(event => event.data.name), ['read', 'write', 'present'])
    assert.match(JSON.stringify(tools(replayNative)[0].data), /02-lighthouse\.md/u)
    const provider = native => {
      const call = tools(native).find(event => event.data.name === 'present')
      return native.events.find(event => event.type === 'plugin:dsh-agent-loadout/tool-source' && event.data.callSeq === call?.seq)?.data.sourceId
    }
    assert.ok(provider(baseNative))
    assert.equal(provider(replayNative), provider(baseNative))
    const directFile = join(replayNative.workspacePath, 'direct-handoff.md')
    assert.deepEqual(files(replayNative).map(item => item.path), [directFile])
    assert.match(await readFile(directFile, 'utf8'), /Verified: 2 cans of lamp oil/u)
    assert.deepEqual(await readFile(card), cardBytes)
    assert.deepEqual(await readFile(join(baseNative.workspacePath, 'qualified-handoff.md')), originalHandoff)
    assert.deepEqual((await readdir(baseNative.workspacePath)).sort(), baseFiles)
    const replayed = await readReplay()
    assert.equal(replayed.evidenceReplay, true)
    assert.equal(replayed.publicEvidenceReplay, true)
    assert.deepEqual(replayed.previous, { ...source, sessionId: lower.sessionId, lesson: 'lighthouse-evidence' })
    assert.deepEqual(replayed.arms.map(arm => [arm.id, arm.sessionId, arm.status]),
      [['baseline', lower.sessionId, 'complete'], ['rematch', replay.sessionId, 'complete']])
    assert.deepEqual(replayed.evidenceOutcome, { arms: [
      { id: 'baseline', sessionId: lower.sessionId, choices: ['降级推荐'], deliverables: replayed.arms[0].deliverables,
        canPreserve: false, lessonTaskSource: source },
      { id: 'rematch', sessionId: replay.sessionId, choices: [], deliverables: replayed.arms[1].deliverables,
        canPreserve: false, lessonTaskSource: directSource },
    ] })
    for (const [index, native, name] of [[0, baseNative, 'qualified-handoff.md'], [1, replayNative, 'direct-handoff.md']]) {
      const offered = replayed.evidenceOutcome.arms[index]
      const delivered = native.events.find(event => event.type === 'deliverables/presented')
      assert.deepEqual(offered.deliverables, [{ name, turn: 1, seq: delivered.seq, index: 0 }])
      assert.equal(replayed.arms[index].windows, undefined)
    }
    assert.deepEqual(await privateHistory(), { available: false })
    assert.deepEqual((await invoke('comparison-history', { scope: 'evidence-replays' })).items, [])
    const publicHistory = (await invoke('comparison-history', { kind: 'rematch' })).items.find(item => item.id === replay.id)
    assert.equal(publicHistory?.publicEvidenceReplay, true)
    assert.deepEqual(publicHistory.arms.map(arm => arm.sessionId), [lower.sessionId, replay.sessionId])
    for (const arm of ['baseline', 'rematch']) {
      await invoke('evidence-replay-plan-save', { comparisonId: replay.id, arm, name: 'Public practice plan' }, 422)
    }
    await shareChallenge(replay.id, 422)
    await invoke('rematch-comparison-options', { kind: 'rematch', comparisonId: replay.id, arm: 'rematch' }, 422)

    const plainPath = join(directory, 'plain-workspace')
    await mkdir(plainPath)
    await cp(join((await history(gather.sessionId)).workspacePath, material), join(plainPath, material))
    const qualifiedSource = (await equipmentIn(host, lower.sessionId)).workspaceComparison.lessonTaskSource
    const confirmedSource = (await equipmentIn(host, confirmed.sessionId)).workspaceComparison.lessonTaskSource
    const beforeWorkspace = await invoke('lesson-task-options', qualifiedSource)
    assert.deepEqual(beforeWorkspace.workspaceIds, [])
    const method = 'workspace/create'
    const rpcId = randomUUID()
    const registered = await host.request('/api/' + method, { type: 'client-request', rpcId, method,
      payload: { args: { request: { path: await realpath(plainPath) } } } })
    assert.equal(registered.rpcId, rpcId)
    assert.equal(registered.result.ok, true, JSON.stringify(registered.result))
    assert.equal(registered.result.value.created, true)
    const { workspaceId: nativeWorkspaceId } = registered.result.value.workspace
    assert.deepEqual((await invoke('lesson-task-options', qualifiedSource)).workspaceIds, [nativeWorkspaceId])
    assert.deepEqual((await invoke('lesson-task-options', confirmedSource)).workspaceIds, [nativeWorkspaceId])
    const directChoice = await invoke('lesson-task-options', directSource)
    assert.deepEqual(directChoice.workspaceIds, [nativeWorkspaceId])
    assert.equal(directChoice.source.sessionId, replay.sessionId)
    assert.equal(directChoice.source.publicEvidenceReplay, true)
    await invoke('lesson-task-options', { ...directSource, arm: 'baseline' }, 422)
    await invoke('lesson-task-materials', { ...directSource, workspaceId: replayNative.workspaceId }, 422)
    await invoke('lesson-task-materials', { ...directSource, workspaceId: baseNative.workspaceId }, 422)

    const ownFolder = '证据 材料'
    const ownFilename = '设备 台账.md'
    const ownMaterial = ownFolder + '/' + ownFilename
    const ownPath = join(plainPath, ownMaterial)
    const ownContent = '# Studio equipment ledger\n\nVerified: two spare radios.\n'
    await mkdir(join(plainPath, ownFolder))
    await writeFile(ownPath, ownContent)
    const selection = { workspaceId: nativeWorkspaceId, material: ownMaterial,
      task: '根据台账核对两台备用对讲机，以及交班消息提到的一台备用充电器。准备一份交接说明。' }
    const evidenceTask = await invoke('lesson-task-preview', { ...qualifiedSource, ...selection })
    const directTask = await invoke('lesson-task-preview', { ...directSource, ...selection })
    assert.deepEqual(directTask.source, directChoice.source)
    assert.equal(directTask.task, evidenceTask.task)
    assert.ok(directTask.task.includes(selection.task) && !directTask.task.includes(material))
    assert.deepEqual(evidenceTask.gear.map(item => item.id).sort(), ['evidence', 'present'])
    assert.deepEqual(directTask.gear.map(item => item.id), ['present'])
    const directOpen = { ...directSource, ...selection, token: directTask.token, launchId: '3'.repeat(32) }
    await invoke('lesson-task-open', { ...directOpen, token: evidenceTask.token }, 422)
    await appendFile(ownPath, '\nChanged after review.\n')
    await invoke('lesson-task-open', directOpen, 422)
    await writeFile(ownPath, ownContent)

    const ownEvidence = await invoke('lesson-task-open', {
      ...qualifiedSource, ...selection, token: evidenceTask.token, launchId: '2'.repeat(32),
    })
    const ownDirect = await invoke('lesson-task-open', directOpen)
    for (const [opened, native] of [[ownEvidence, baseNative], [ownDirect, replayNative]]) {
      const prepared = await history(opened.sessionId)
      assert.equal(prepared.presetId, native.presetId)
      assert.notEqual(prepared.workspaceId, native.workspaceId)
      assert.equal(prepared.workspaceId, nativeWorkspaceId)
      assert.equal(prepared.inherited, 0)
      assert.ok(!prepared.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
    }

    const ownEvidenceTurn = send(ownEvidence)
    ownEvidenceTurn.catch(() => {})
    let ownQuestion
    try {
      for (let attempt = 0; attempt < 100 && !ownQuestion; attempt++) {
        ownQuestion = (await host.request(questions, { sessionId: ownEvidence.sessionId })).question
        if (!ownQuestion) await delay(40)
      }
      assert.deepEqual(ownQuestion?.options.map(item => item.label), ['继续补证', '降级推荐', '暂缓提交'])
    } finally {
      if (ownQuestion) await host.request(questions, { sessionId: ownEvidence.sessionId, choice: '降级推荐' })
      await ownEvidenceTurn
    }
    await send(ownDirect)
    const ownEvidenceNative = await history(ownEvidence.sessionId)
    const ownDirectNative = await history(ownDirect.sessionId)
    assert.deepEqual(tools(ownEvidenceNative).map(event => event.data.name), ['read', 'ask_user_question', 'write', 'present'])
    assert.deepEqual(tools(ownDirectNative).map(event => event.data.name), ['read', 'write', 'present'])
    assert.equal(provider(ownDirectNative), provider(ownEvidenceNative))
    assert.deepEqual(files(ownEvidenceNative).map(item => item.path), [join(ownEvidenceNative.workspacePath, 'qualified-handoff.md')])
    assert.deepEqual(files(ownDirectNative).map(item => item.path), [join(ownDirectNative.workspacePath, 'direct-handoff.md')])
    assert.match(await readFile(join(ownDirectNative.workspacePath, 'direct-handoff.md'), 'utf8'), /two spare radios/u)
    const directResult = await invoke('lesson-task-result', { sessionId: ownDirect.sessionId, review: true })
    assert.deepEqual(directResult.deliverables.map(({ name, turn }) => [name, turn]), [['direct-handoff.md', 1]])
    assert.ok(Number.isSafeInteger(directResult.deliverables[0].seq))
    assert.equal(directResult.materialState, 'verified')
    assert.equal(directResult.canReview, true)
    assert.equal(directResult.source.publicEvidenceReplay, true)
    assert.deepEqual(directResult.draft.equipmentIds, ['present'])
    assert.equal(directResult.rematchSource, undefined)
    assert.equal(directResult.rebaseline, undefined)
    assert.deepEqual(await privateHistory(), { available: false })
    assert.equal(await readFile(ownPath, 'utf8'), ownContent)
    assert.deepEqual(await readReplay(), replayed)
    const plain = await host.request('/api/loadout-fixture-session', { presetId: 'standard', workspacePath: plainPath })
    assert.equal(plain.workspaceId, nativeWorkspaceId)
    await send({ sessionId: plain.sessionId, task: gather.task })
    const plainHistory = await history(plain.sessionId)
    const plainTools = await host.request('/api/loadout-fixture-tools?id=' + plainHistory.presetId)
    const plainCanPresent = plainTools.includes('present')
    assert.deepEqual(tools(plainHistory).map(event => event.data.name), plainCanPresent ? ['read', 'write', 'present'] : ['read'])
    assert.deepEqual(files(plainHistory).map(file => file.path), plainCanPresent ? [join(await realpath(plainPath), 'direct-handoff.md')] : [])
    assert.equal(await read({ sessionId: plain.sessionId }), null)
    assert.equal((await equipmentIn(host, plain.sessionId)).workspaceComparison, undefined)

    const edited = await predict('e'.repeat(32), 'gather')
    await send({ ...edited, task: 'Use a different handoff task.' })
    const rejected = await read({ comparisonId: edited.id })
    const [wrongChoice] = rejected.arms
    assert.equal(wrongChoice.status, 'unavailable')
    assert.equal(wrongChoice.reason, 'changed-task')
    assert.ok(!wrongChoice.deliverables?.length)
    assert.equal(wrongChoice.canReplayLighthouseEvidence, undefined)
    await replayOptions(edited.id, 422)
    assert.equal(rejected.evidenceOpeningChoice, undefined)
    const editedMember = (await equipmentIn(host, edited.sessionId)).workspaceComparison
    assert.equal(editedMember.lessonTaskSource, undefined)
    assert.equal(editedMember.evidenceReportCode, undefined)
    assert.equal(editedMember.firstTaskPending, undefined)
    const changed = await openEnglish('confirmed', 'f'.repeat(32))
    const changedNative = await history(changed.sessionId)
    await appendFile(join(changedNative.workspacePath, material), '\nAn unexpected change to this isolated supply card.\n')
    await send(changed)
    const changedView = await read({ comparisonId: changed.id })
    assert.equal(changedView.materialState, 'changed')
    assert.equal(changedView.arms[0].reason, 'changed-material')
    assert.ok(!changedView.arms[0].deliverables?.length)
    await replayOptions(changed.id, 422)
    assert.equal((await equipmentIn(host, changed.sessionId)).workspaceComparison.lessonTaskSource, undefined)

    assert.deepEqual(await plans(), normal)
    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual(await open('gap', launchId), gather)
    await open('confirmed', launchId, 422)
    assert.deepEqual(await predict(predictedLaunch, 'pause'), lower)
    await predict(predictedLaunch, 'qualify', 422)
    await open('gap', predictedLaunch, 422)
    assert.deepEqual(await readReplay(), replayed)
    assert.deepEqual(await invoke('rematch-comparison-open', openFields), replay)
    for (const { filter, arm, openingResult } of proved) {
      const restored = await read(filter)
      assert.deepEqual(restored.arms[0], arm)
      assert.deepEqual(restored.evidenceOpeningChoice, openingResult)
      assert.deepEqual((await equipmentIn(host, arm.sessionId)).workspaceComparison.lessonTaskSource, arm.lessonTaskSource)
    }
    assert.deepEqual((await invoke('lesson-task-options', qualifiedSource)).workspaceIds, [nativeWorkspaceId])
    const chronicle = await invoke('comparison-history', { kind: 'workspace', query: material })
    for (const { filter } of proved) {
      const item = chronicle.items.find(item => item.id === filter.comparisonId)
      assert.equal(item?.lesson, 'lighthouse-evidence')
      assert.equal(item.scenario, filter.comparisonId === confirmed.id ? 'confirmed' : 'gap')
    }

    for (const id of [confirmed.id, edited.id, changed.id]) {
      assert.equal((await read({ comparisonId: id })).canShareChallenge, undefined)
      await shareChallenge(id, 422)
      await invoke('lighthouse-evidence-report', { comparisonId: id }, 422)
    }
    await shareChallenge('0'.repeat(32), 422)
    const { code } = await shareChallenge(lower.id)
    assert.equal((await read({ comparisonId: lower.id })).canShareChallenge, true)
    assert.equal((await shareChallenge(gather.id)).code, code)
    assert.equal((await shareChallenge(pause.id)).code, code)
    const decodeCode = (text, prefix) => {
      assert.ok(text.startsWith(prefix))
      return JSON.parse(Buffer.from(text.slice(prefix.length), 'base64url').toString('utf8'))
    }
    const encodeCode = (data, prefix) => prefix + Buffer.from(JSON.stringify(data)).toString('base64url')
    const challenge = decodeCode(code, 'DSHC1.')
    assert.deepEqual(Object.keys(challenge), ['sample', 'loadout'])
    assert.equal(challenge.sample, 'lighthouse-evidence-1')
    const decisionReport = comparisonId => invoke('lighthouse-evidence-report', { comparisonId })
    const qualifiedReport = await decisionReport(lower.id)
    const qualifiedDecision = { choice: 'qualify', delivered: true }
    const pausedDecision = { choice: 'pause', delivered: false }
    assert.deepEqual(qualifiedReport.local, qualifiedDecision)
    assert.deepEqual(decodeCode(qualifiedReport.code, 'DSHR2.'), { sample: challenge.sample, ...qualifiedDecision })
    assert.equal((await equipmentIn(host, lower.sessionId)).workspaceComparison.evidenceReportCode, qualifiedReport.code)
    assert.deepEqual((await decisionReport(gather.id)).local, { choice: 'gather', delivered: false })
    assert.deepEqual((await decisionReport(pause.id)).local, pausedDecision)
    assert.equal((await read({ comparisonId: lower.id })).canShareEvidenceReport, true)
    const recipe = decodeCode(challenge.loadout, 'DSHH1.')
    assert.equal(recipe.name, 'Lighthouse evidence challenge')
    assert.equal(recipe.hero.id, 'standard')
    assert.deepEqual(recipe.gear.filter(item => item.kind === 'featured').map(item => [item.id, item.operation]).sort(),
      [['evidence', 'equip'], ['present', 'equip']])
    assert.ok(recipe.gear.filter(item => item.kind !== 'featured').every(item => item.kind === 'plugin' && item.operation === 'remove'))
    const portable = JSON.stringify(recipe)
    for (const privateValue of [directory, lower.id, lower.sessionId, lower.requestId, material, lower.task,
      'qualified-handoff.md', '降级推荐', '暂缓提交', 'Pause submission']) assert.ok(!portable.includes(privateValue), privateValue)
    assert.doesNotMatch(portable, /"(?:workspaceId|workspacePath|material|note|choices|openingChoice|deliverables)"\s*:/u)

    const recipientEnv = { ...env, DSH_HOME: join(directory, 'recipient') }
    await installProfile(directory, recipientEnv)
    recipient = await startHost(recipientEnv, patch)
    const receive = async (action, fields, status) => (await recipient.request(endpoint, { action, ...fields }, status)).value
    const previewChallenge = (text, status, useLocal) =>
      receive('lighthouse-challenge-preview', { code: text, ...(useLocal && { useLocal }) }, status)
    const openChallenge = (fields, status) => receive('lighthouse-challenge-open', fields, status)
    const recipientSessions = () => readdir(join(recipientEnv.DSH_HOME, 'sessions')).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const cleanCatalog = (await recipient.request(endpoint)).value
    assert.deepEqual(cleanCatalog.plans, [])
    assert.deepEqual(await recipientSessions(), [])
    await receive('workspace-comparison', { comparisonId: lower.id }, 422)
    await previewChallenge(encodeCode({ ...challenge, sample: 'unknown-evidence-sample' }, 'DSHC1.'), 422)
    await previewChallenge(encodeCode({ ...challenge, sessionId: lower.sessionId }, 'DSHC1.'), 422)
    const wrongLoadout = encodeCode({ ...recipe, gear: recipe.gear.filter(item => item.id !== 'evidence') }, 'DSHH1.')
    await previewChallenge(encodeCode({ ...challenge, loadout: wrongLoadout }, 'DSHC1.'), 422)
    const unavailableLoadout = encodeCode({ ...recipe, dependencies: [...recipe.dependencies,
      { package: 'dsh-fixture-unavailable-for-lighthouse-challenge', version: '1.0.0' }] }, 'DSHH1.')
    const unavailableCode = encodeCode({ ...challenge, loadout: unavailableLoadout }, 'DSHC1.')
    const unavailable = await previewChallenge(unavailableCode)
    assert.equal(unavailable.blocked, true)
    assert.equal(unavailable.token, undefined)
    assert.equal(unavailable.canUseLocalLoadout, undefined)
    const unavailableLocal = await previewChallenge(unavailableCode, undefined, true)
    assert.equal(unavailableLocal.blocked, true)
    assert.equal(unavailableLocal.token, undefined)

    const preview = await previewChallenge(code)
    assert.ok(preview.token, JSON.stringify(preview))
    assert.equal(preview.hero.id, 'standard')
    assert.deepEqual(new Set(preview.draft.equipmentIds), new Set(['evidence', 'present']))

    const senderVersion = recipe.host === '0.2.2-rc.3' ? '0.2.2-rc.5' : '0.2.2-rc.3'
    const skewVersion = ref => ({ ...ref, version: senderVersion })
    const skewHero = hero => ({ ...hero, owner: skewVersion(hero.owner) })
    const skewSlot = slot => ({ ...slot, hero: skewHero(slot.hero) })
    const skewedRecipe = { ...recipe, host: senderVersion, hero: skewHero(recipe.hero),
      gear: recipe.gear.map(item => item.kind === 'plugin' ? { ...item, source: skewSlot(item.source) } : item),
      dependencies: recipe.dependencies.map(skewVersion), companions: recipe.companions.map(skewSlot) }
    const challengeWithRecipe = changed => encodeCode({ ...challenge, loadout: encodeCode(changed, 'DSHH1.') }, 'DSHC1.')
    const crossVersionCode = challengeWithRecipe(skewedRecipe)
    const strict = await previewChallenge(crossVersionCode)
    assert.equal(strict.blocked, true)
    assert.equal(strict.canUseLocalLoadout, true)
    assert.equal(strict.token, undefined)
    const useLocal = await previewChallenge(crossVersionCode, undefined, true)
    assert.ok(useLocal.token, JSON.stringify(useLocal))
    assert.equal(useLocal.localLoadout, true)
    assert.equal(useLocal.originalHost, senderVersion)
    assert.deepEqual({ ...useLocal.draft, equipmentIds: [...useLocal.draft.equipmentIds].sort() },
      { ...preview.draft, equipmentIds: [...preview.draft.equipmentIds].sort() })
    assert.notEqual(useLocal.token, preview.token)

    const wrongOwner = { ...skewedRecipe.hero, owner: { ...skewedRecipe.hero.owner, package: 'dsh-fixture-foreign-standard' } }
    const wrongOwnerCode = challengeWithRecipe({ ...skewedRecipe, hero: wrongOwner,
      gear: skewedRecipe.gear.map(item => item.kind === 'plugin' ? { ...item, source: { ...item.source, hero: wrongOwner } } : item) })
    const foreign = await previewChallenge(wrongOwnerCode, undefined, true)
    assert.equal(foreign.blocked, true)
    assert.equal(foreign.canUseLocalLoadout, undefined)
    assert.equal(foreign.token, undefined)

    const challengeFields = { code: crossVersionCode, token: useLocal.token, useLocal: true, launchId: 'b'.repeat(32), openingChoice: 'qualify' }
    await openChallenge({ ...challengeFields, token: '0'.repeat(64) }, 422)
    await openChallenge({ ...challengeFields, code: unavailableCode }, 422)
    await openChallenge({ ...challengeFields, code: wrongOwnerCode }, 422)
    await openChallenge({ ...challengeFields, useLocal: undefined }, 422)
    await openChallenge({ ...challengeFields, token: preview.token }, 422)
    await openChallenge({ ...challengeFields, code }, 422)
    assert.deepEqual(await recipientSessions(), [])
    assert.deepEqual((await recipient.request(endpoint)).value.saved, cleanCatalog.saved)
    const [accepted, retried] = await Promise.all([openChallenge(challengeFields), openChallenge(challengeFields)])
    assert.deepEqual(retried, accepted)
    assert.notEqual(accepted.id, lower.id)
    assert.notEqual(accepted.sessionId, lower.sessionId)
    assert.equal(accepted.task, lower.task)
    await openChallenge({ ...challengeFields, openingChoice: 'gather' }, 422)
    assert.equal((await recipientSessions()).length, 1)
    const nativeRecipient = () => recipient.request('/api/loadout-fixture-history?sessionId=' + accepted.sessionId)
    const blank = await nativeRecipient()
    assert.equal(blank.presetId, (await history(lower.sessionId)).presetId)
    assert.notEqual(blank.workspacePath, (await history(lower.sessionId)).workspacePath)
    assert.ok(!blank.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    assert.deepEqual((await readdir(blank.workspacePath)).sort(), sampleFiles)
    const receivedView = () => receive('workspace-comparison', { comparisonId: accepted.id })
    assert.equal((await receivedView()).canShareChallenge, undefined)
    const pendingRecipient = async () => (await receive('lighthouse-pending-runs')).items.find(item => item.sessionId === accepted.sessionId)
    const recipientMember = async () => (await equipmentIn(recipient, accepted.sessionId)).workspaceComparison
    const selectRecipientPreset = async agentPreset => {
      const method = 'agentPresets/select'
      const rpcId = randomUUID()
      const changed = await recipient.request('/api/' + method, {
        type: 'client-request', rpcId, method, payload: { args: { agentId: accepted.sessionId, agentPreset } },
      })
      assert.equal(changed.rpcId, rpcId)
      assert.deepEqual(changed.result, { ok: true, value: agentPreset })
    }
    assert.equal((await pendingRecipient()).presetChanged, undefined)
    await selectRecipientPreset('standard')
    assert.equal((await pendingRecipient()).presetChanged, true)
    assert.equal((await recipientMember()).firstTaskPending, true)
    assert.equal((await recipientMember()).presetChanged, true)
    assert.ok(!(await nativeRecipient()).events.some(event => event.type === 'turn/start'))
    await selectRecipientPreset(blank.presetId)
    assert.equal((await pendingRecipient()).presetChanged, undefined)
    assert.equal((await recipientMember()).presetChanged, undefined)
    const recipientReportSource = { comparisonId: accepted.id }
    const friendReport = { ...recipientReportSource, code: qualifiedReport.code }
    await receive('lighthouse-evidence-report-compare', friendReport, 422)
    const play = recipient.request(turnEndpoint, { ...accepted, text: accepted.task })
    play.catch(() => {})
    let question
    try {
      for (let attempt = 0; attempt < 100 && !question; attempt++) {
        question = (await recipient.request(questions, { sessionId: accepted.sessionId })).question
        if (!question) await delay(40)
      }
      assert.deepEqual(question?.options.map(option => option.label), ['继续补证', '降级推荐', '暂缓提交'])
      assert.equal((await receivedView()).canShareChallenge, undefined)
      await receive('lighthouse-evidence-report', recipientReportSource, 422)
    } finally {
      if (question) await recipient.request(questions, { sessionId: accepted.sessionId, choice: '暂缓提交' })
      await play
    }
    const finished = await receivedView()
    assert.equal(finished.canShareChallenge, true)
    assert.equal(finished.canShareEvidenceReport, true)
    assert.equal(finished.arms[0].canReplayLighthouseEvidence, true)
    assert.deepEqual(finished.evidenceOpeningChoice, { choice: 'qualify', actualChoices: ['暂缓提交'] })
    assert.deepEqual(finished.arms[0].deliverables, [])
    const played = await nativeRecipient()
    assert.deepEqual(tools(played).map(event => event.data.name), ['read', 'ask_user_question'])
    assert.deepEqual(files(played), [])
    assert.deepEqual((await readdir(played.workspacePath)).sort(), sampleFiles)
    assert.deepEqual((await recipient.request(endpoint)).value.plans, [])
    assert.equal((await receive('lighthouse-challenge-share', { comparisonId: accepted.id })).code, code)
    const pausedReport = await receive('lighthouse-evidence-report', recipientReportSource)
    assert.deepEqual(pausedReport.local, pausedDecision)
    assert.deepEqual(decodeCode(pausedReport.code, 'DSHR2.'), { sample: challenge.sample, ...pausedDecision })
    assert.equal((await equipmentIn(recipient, accepted.sessionId)).workspaceComparison.evidenceReportCode, pausedReport.code)
    assert.deepEqual(await receive('lighthouse-evidence-report-compare', friendReport),
      { local: pausedDecision, code: pausedReport.code, friend: qualifiedDecision })
    assert.deepEqual(await invoke('lighthouse-evidence-report-compare', { comparisonId: lower.id, code: pausedReport.code }),
      { local: qualifiedDecision, code: qualifiedReport.code, friend: pausedDecision })
    for (const change of [{ sample: 'unknown-sample' }, { choice: 'unverified' }, { delivered: 1 }, { sessionId: lower.sessionId }]) {
      const invalid = encodeCode({ sample: challenge.sample, ...qualifiedDecision, ...change }, 'DSHR2.')
      await receive('lighthouse-evidence-report-compare', { comparisonId: accepted.id, code: invalid }, 422)
    }
    assert.equal((await recipientSessions()).length, 1)
    const matchup = { ...replayFrom(accepted.id), change }
    const recipientReplayPreview = await receive('rematch-comparison-preview', matchup)
    const recipientReplay = await receive('rematch-comparison-open', {
      ...matchup, token: recipientReplayPreview.token, launchId: 'e'.repeat(32),
    })
    await recipient.request(turnEndpoint, { ...recipientReplay, text: recipientReplay.task })
    const recipientResult = await receive('rematch-comparison', { comparisonId: recipientReplay.id })
    assert.equal(recipientResult.previous.sessionId, accepted.sessionId)
    assert.deepEqual(recipientResult.evidenceOutcome.arms.map(arm => [arm.choices, arm.deliverables.map(file => file.name)]),
      [[['暂缓提交'], []], [[], ['direct-handoff.md']]])
    const exact = await openChallenge({ code, token: preview.token, launchId: 'c'.repeat(32) })
    assert.notEqual(exact.sessionId, accepted.sessionId)
    assert.equal(exact.task, accepted.task)
    const exactDraft = await recipient.request('/api/loadout-fixture-history?sessionId=' + exact.sessionId)
    assert.equal(exactDraft.presetId, blank.presetId)
    assert.ok(!exactDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))

    const repeatedFields = { ...friendReport, launchId: 'd'.repeat(32) }
    const repeat = (overrides, status) => receive('lighthouse-evidence-repeat', { ...repeatedFields, ...overrides }, status)
    const sessionsBeforeRepeat = await recipientSessions()
    await repeat({ code }, 422)
    await repeat({ comparisonId: exact.id }, 422)
    await repeat({ launchId: '../' }, 422)
    const recipientCard = join(played.workspacePath, material)
    const recipientCardBytes = await readFile(recipientCard)
    await appendFile(recipientCard, '\nChanged since the original evidence round.\n')
    await repeat({}, 422)
    await writeFile(recipientCard, recipientCardBytes)
    assert.deepEqual(await recipientSessions(), sessionsBeforeRepeat)

    const [nextRound, retriedRound] = await Promise.all([repeat({}), repeat({})])
    assert.deepEqual(retriedRound, nextRound)
    assert.notEqual(nextRound.sessionId, accepted.sessionId)
    assert.equal(nextRound.task, accepted.task)
    assert.equal((await recipientSessions()).length, sessionsBeforeRepeat.length + 1)
    const repeatedNative = () => recipient.request('/api/loadout-fixture-history?sessionId=' + nextRound.sessionId)
    const nextDraft = await repeatedNative()
    assert.notEqual(nextDraft.workspaceId, played.workspaceId)
    assert.equal(nextDraft.presetId, played.presetId)
    assert.deepEqual(await Promise.all(sampleFiles.map(name => readFile(join(nextDraft.workspacePath, name)))), sampleBytes)
    assert.ok(!nextDraft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    const secondPlay = recipient.request(turnEndpoint, { ...nextRound, text: nextRound.task })
    secondPlay.catch(() => {})
    let nextQuestion
    try {
      for (let attempt = 0; attempt < 100 && !nextQuestion; attempt++) {
        nextQuestion = (await recipient.request(questions, { sessionId: nextRound.sessionId })).question
        if (!nextQuestion) await delay(40)
      }
      assert.deepEqual(nextQuestion?.options.map(option => option.label), ['继续补证', '降级推荐', '暂缓提交'])
    } finally {
      if (nextQuestion) await recipient.request(questions, { sessionId: nextRound.sessionId, choice: '降级推荐' })
      await secondPlay
    }
    const nextHistory = await repeatedNative()
    assert.deepEqual(tools(nextHistory).map(event => event.data.name), ['read', 'ask_user_question', 'write', 'present'])
    assert.equal(provider(nextHistory), provider(baseNative))
    assert.deepEqual(files(nextHistory).map(item => item.path), [join(nextHistory.workspacePath, 'qualified-handoff.md')])
    assert.deepEqual((await receive('workspace-comparison', { comparisonId: nextRound.id })).evidenceOpeningChoice, undefined)
    assert.deepEqual(await receive('lighthouse-evidence-report', { comparisonId: nextRound.id }), qualifiedReport)
    assert.deepEqual(await receive('lighthouse-evidence-report', { comparisonId: accepted.id }), pausedReport)
  } finally {
    await recipient?.stop()
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('Lighthouse Evidence Check carries real choices and derived files to personal material', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-personal-evidence-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const folder = '证据 材料'
  const file = '设备 台账.md'
  const material = folder + '/' + file
  const personal = join(directory, 'personal-workspace')
  const original = join(personal, material)
  const body = '# Studio equipment ledger\n\nVerified: two spare radios.\n'
  const questions = '/api/loadout-fixture-handoff-question'
  const labels = ['继续补证', '降级推荐', '暂缓提交']
  const prior = { id: randomUUID(), revision: randomUUID(), name: 'Prior Standard plan', note: '', heroId: 'standard',
    heroName: '标准模式', presetId: 'standard', updatedAt: 1 }
  let host
  try {
    await mkdir(join(personal, folder), { recursive: true })
    await writeFile(original, body)
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    const plansDir = join(env.DSH_HOME, 'profiles/web/agent-loadouts/plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, prior.id + '.json'), JSON.stringify(prior))
    host = await startHost(env, patch)
    const invoke = async (action, fields, status) => (await host.request(endpoint, { action, ...fields }, status)).value
    const history = sessionId => host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const send = ({ sessionId, task, requestId }) => host.request(turnEndpoint, { sessionId, text: task, requestId })
    const read = (sessionId, review) => invoke('lesson-task-result', { sessionId, review })
    const evidenceHistory = options => invoke('comparison-history', { scope: 'evidence-replays', ...options })
    const saveEvidencePlan = (comparisonId, arm, name, extra = {}, status) =>
      invoke('evidence-replay-plan-save', { comparisonId, arm, name, ...extra }, status)
    const planOrigin = ({ id, revision }, status) => invoke('plan-evidence-origin', { id, revision }, status)
    const assertPublicOrigin = (plan, hasOrigin) => {
      assert.equal(plan.hasEvidenceOrigin, hasOrigin ? true : undefined)
      for (const key of ['evidenceOrigin', 'comparisonId', 'arm', 'sessionId']) assert.ok(!Object.hasOwn(plan, key), key)
    }
    const assertNoEvidenceReplay = async () => {
      assert.deepEqual(await evidenceHistory({ probe: true }), { available: false })
      assert.deepEqual(await evidenceHistory(), { items: [] })
    }
    const files = native => native.events.filter(event => event.type === 'deliverables/presented')
    const usedTools = native => native.events.filter(event => event.type === 'tool/call')
    const launchId = character => character.repeat(32)
    const choose = async (opened, choice, whileWaiting) => {
      const { sessionId } = opened
      const turn = send(opened)
      turn.catch(() => {})
      let question
      try {
        for (let attempt = 0; attempt < 100 && !question; attempt++) {
          question = (await host.request(questions, { sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(option => option.label), labels)
        assert.deepEqual(files(await history(sessionId)), [])
        await whileWaiting?.()
      } finally {
        if (question) await host.request(questions, { sessionId, choice })
        await turn
      }
    }

    const workspace = '/api/loadout-fixture-session'
    const local = await host.request(workspace, { presetId: 'standard', workspacePath: personal })
    const { workspaceId } = local
    const initialPlans = (await host.request(endpoint)).value.plans
    assert.deepEqual(initialPlans.map(plan => plan.id), [prior.id])
    assertPublicOrigin(initialPlans[0], false)
    await planOrigin(prior, 422)
    await assertNoEvidenceReplay()
    const practice = await invoke('lighthouse-evidence-open', { scenario: 'gap', launchId: launchId('a') })
    const source = { kind: 'workspace', comparisonId: practice.id, arm: 'evidence' }
    const comparisonArm = async () => (await invoke('workspace-comparison', { comparisonId: practice.id })).arms[0]
    assert.equal((await comparisonArm()).lessonTaskSource, undefined)
    await invoke('lesson-task-options', source, 422)
    await choose(practice, labels[0], async () => {
      const pending = await comparisonArm()
      assert.equal(pending.status, 'waiting-choice')
      assert.equal(pending.lessonTaskSource, undefined)
      await invoke('lesson-task-options', source, 422)
    })
    const practiceProof = await comparisonArm()
    assert.deepEqual(practiceProof.lessonTaskSource, source)
    assert.deepEqual(practiceProof.deliverables, [])
    await invoke('lesson-task-options', { ...source, kind: 'rematch' }, 422)
    const options = await invoke('lesson-task-options', source)
    assert.equal(options.source.lesson, 'lighthouse-evidence')
    assert.equal(options.source.sessionId, practice.sessionId)
    const sample = await history(practice.sessionId)
    assert.ok(options.workspaceIds.includes(workspaceId))
    assert.ok(!options.workspaceIds.includes(sample.workspaceId))
    await invoke('lesson-task-materials', { ...source, workspaceId: sample.workspaceId }, 422)
    const picked = await invoke('lesson-task-materials', { ...source, workspaceId, query: '设备 台账' })
    assert.deepEqual(picked.entries, [{ path: material, name: file, kind: 'file' }])

    const gap = '根据台账核对两台备用对讲机，再核对交班消息里提到的一台备用充电器。准备本次交接，供我决策。如果需要，请另行询问交接格式。'
    const confirmed = '根据台账核对两台备用对讲机，为接班人生成一份交接说明。'
    const preview = (task, override = {}, status) => invoke('lesson-task-preview', { ...source, workspaceId, material, task, ...override }, status)
    const open = (task, token, id, status) => invoke('lesson-task-open', { ...source, workspaceId, material, task, token, launchId: launchId(id) }, status)
    await preview(gap, { workspaceId: sample.workspaceId, material: '02-lighthouse.md' }, 422)
    const checkedGap = await preview(gap)
    assert.deepEqual(checkedGap.source, options.source)
    assert.deepEqual(new Set(checkedGap.gear.map(gear => gear.id)), new Set(['evidence', 'present']))
    assert.match(checkedGap.task, /^【出装任务】\n/u)
    assert.ok(checkedGap.task.includes(gap))
    assert.ok(!checkedGap.task.includes(practice.task) && !checkedGap.task.includes('02-lighthouse.md'))
    await appendFile(original, '\nEdited after preview.\n')
    await open(gap, checkedGap.token, 'b', 422)
    assert.deepEqual((await host.request(workspace, { inspectWorkspaceId: workspaceId })).sessionIds, [local.sessionId])
    await writeFile(original, body)

    const cases = [
      { id: 'b', task: gap, choice: labels[0], tools: ['read', 'ask_user_question', 'glob'] },
      { id: 'c', task: gap, choice: labels[1], tools: ['read', 'ask_user_question', 'write', 'present'], file: 'qualified-handoff.md' },
      { id: 'd', task: gap, choice: labels[2], tools: ['read', 'ask_user_question'] },
      { id: 'e', task: confirmed, tools: ['read', 'write', 'present'], file: 'verified-handoff.md' },
    ]
    const proofs = new Map()
    let qualifiedReplay
    let pausedReplay
    for (const attempt of cases) {
      const checked = attempt.task === gap ? checkedGap : await preview(attempt.task)
      const opened = await open(attempt.task, checked.token, attempt.id)
      const { sessionId } = opened
      assert.equal(opened.task, checked.task)
      const before = await history(sessionId)
      assert.equal(before.workspaceId, workspaceId)
      assert.equal(before.presetId, sample.presetId)
      assert.equal(before.inherited, 0)
      assert.ok(!before.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
      assert.equal((await read(sessionId)).status, 'waiting')
      if (attempt.choice) {
        await choose(opened, attempt.choice, async () => {
          const pending = await read(sessionId, true)
          assert.equal(pending.status, 'waiting-choice')
          assert.deepEqual(pending.pendingQuestions[0].options, labels)
          assert.equal(pending.draft, undefined)
        })
      } else await send(opened)

      const native = await history(sessionId)
      const accepted = native.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      const admission = native.events.find(event => event.type === 'plugin:dsh-agent-loadout/comparison-material' &&
        event.ignorable && event.seq < accepted.seq)
      assert.equal(accepted.data.content[0].text, checked.task)
      assert.equal(admission?.data.state, 'verified')
      assert.equal(admission?.data.requestId, accepted.data.source.rpcId ?? null)
      assert.deepEqual(usedTools(native).map(event => event.data.name), attempt.tools)
      const attachments = files(native)
      assert.deepEqual(attachments.flatMap(event => event.data.files.map(item => item.path)),
        attempt.file ? [join(await realpath(personal), attempt.file)] : [])
      if (attempt.file) {
        const handoff = await readFile(join(personal, attempt.file), 'utf8')
        assert.match(handoff, /Verified: two spare radios/u)
        if (attempt.choice) assert.match(handoff, /Unverified: a spare charger/u)
        else assert.doesNotMatch(handoff, /Unverified/u)
      }
      assert.equal(await readFile(original, 'utf8'), body)
      const proved = await read(sessionId)
      assert.equal(proved.status, 'complete')
      assert.equal(proved.materialState, 'verified')
      assert.deepEqual(proved.source, options.source)
      assert.deepEqual(proved.entries.flatMap(entry => entry.choices ?? []), attempt.choice ? [attempt.choice] : [])
      assert.deepEqual(proved.deliverables, attempt.file ? [{ name: attempt.file, turn: attachments[0].data.turn, seq: attachments[0].seq, index: 0 }] : [])
      assert.equal(proved.materialDelivered, false)
      assert.equal(proved.canReview, true)
      assert.equal(proved.rebaseline, undefined)
      assert.ok(!JSON.stringify(proved).includes(native.workspacePath))
      const reviewed = await read(sessionId, true)
      assert.deepEqual(new Set(reviewed.draft.equipmentIds), new Set(['evidence', 'present']))
      const reference = { kind: 'personal', comparisonId: sessionId.slice('session-'.length), arm: 'task' }
      if (attempt.choice) {
        assert.deepEqual(proved.rematchSource, reference)
        const replayOptions = await invoke('rematch-comparison-options', reference)
        assert.equal(replayOptions.evidenceReplay, true)
        assert.equal(replayOptions.baseline.sessionId, sessionId)
        assert.deepEqual(replayOptions.baseline.choices, [attempt.choice])
        assert.deepEqual(replayOptions.baseline.deliverables.map(item => item.name), attempt.file ? [attempt.file] : [])
        assert.equal(replayOptions.workspaceId, workspaceId)
        assert.equal(replayOptions.material, material)
        assert.equal(replayOptions.task, opened.task)
        const fields = { ...reference, change: { removeId: 'evidence' } }
        const replayPreview = await invoke('rematch-comparison-preview', fields)
        assert.ok(replayPreview.token)
        assert.deepEqual(replayPreview.change, { removed: { id: 'evidence', name: '证据核验' } })
        assert.equal(replayPreview.task, opened.task)
        assert.ok(!replayPreview.comparison.lost.some(item => item.id === 'present' || item.name === 'present'))
        if (attempt.file) qualifiedReplay = { fields, replayPreview, native, opened }
        if (attempt.choice === labels[2]) pausedReplay = { fields, replayPreview, opened }
      } else {
        assert.equal(proved.rematchSource, undefined)
        await invoke('rematch-comparison-options', reference, 422)
      }
      proofs.set(sessionId, proved)
    }

    const { fields, replayPreview, native: qualified, opened: qualifiedSession } = qualifiedReplay
    for (const change of [{ removeId: 'present' }, { addId: 'review' }, { removeId: 'evidence', addId: 'review' }]) {
      await invoke('rematch-comparison-preview', { ...fields, change }, 422)
    }
    const replayFields = { ...fields, token: replayPreview.token, launchId: launchId('9') }
    await invoke('rematch-comparison-open', { ...replayFields, change: { removeId: 'present' } }, 422)
    const members = async () => (await host.request(workspace, { inspectWorkspaceId: workspaceId })).sessionIds
    const beforeReplay = await members()
    await appendFile(original, '\nEdited before opening the replay.\n')
    await invoke('rematch-comparison-options', fields, 422)
    await invoke('rematch-comparison-open', replayFields, 422)
    assert.deepEqual(await members(), beforeReplay)
    await writeFile(original, body)
    const [replay, duplicate] = await Promise.all([
      invoke('rematch-comparison-open', replayFields), invoke('rematch-comparison-open', replayFields),
    ])
    assert.deepEqual(duplicate, replay)
    assert.notEqual(replay.sessionId, qualifiedSession.sessionId)
    assert.equal(replay.task, qualifiedSession.task)
    const replayBefore = await history(replay.sessionId)
    assert.equal(replayBefore.workspaceId, workspaceId)
    assert.equal(replayBefore.workspacePath, qualified.workspacePath)
    assert.equal(replayBefore.inherited, 0)
    assert.notEqual(replayBefore.presetId, qualified.presetId)
    assert.ok(!replayBefore.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
    assert.equal((await equipmentIn(host, replay.sessionId)).rematchComparison.evidenceReplay, true)
    assert.equal((await invoke('rematch-comparison', { comparisonId: replay.id })).evidenceOutcome, undefined)
    await saveEvidencePlan(replay.id, 'baseline', 'Pending replay', {}, 422)
    await assertNoEvidenceReplay()
    const unverified = await invoke('rematch-comparison-open', { ...replayFields, launchId: launchId('8') })
    await send({ ...unverified, task: 'Use a different replay prompt.' })
    const rejectedReplay = await invoke('rematch-comparison', { comparisonId: unverified.id })
    assert.equal(rejectedReplay.evidenceReplay, true)
    assert.equal(rejectedReplay.evidenceOutcome, undefined)
    assert.equal(rejectedReplay.arms[1].status, 'unavailable')
    assert.equal(rejectedReplay.arms[1].reason, 'changed-task')
    await saveEvidencePlan(unverified.id, 'rematch', 'Wrong replay prompt', {}, 422)
    await assertNoEvidenceReplay()
    const qualifiedFile = join(personal, 'qualified-handoff.md')
    const originalHandoff = await readFile(qualifiedFile, 'utf8')
    await send(replay)
    const replayNative = await history(replay.sessionId)
    const originalRead = usedTools(qualified).find(event => event.data.name === 'read')
    const replayRead = usedTools(replayNative).find(event => event.data.name === 'read')
    assert.match(JSON.stringify(originalRead.data), /证据 材料\/设备 台账\.md/u)
    assert.match(JSON.stringify(replayRead.data), /证据 材料\/设备 台账\.md/u)
    const provider = native => {
      const present = usedTools(native).find(event => event.data.name === 'present')
      return native.events.find(event => event.type === 'plugin:dsh-agent-loadout/tool-source' && event.data.callSeq === present?.seq)?.data.sourceId
    }
    assert.ok(provider(qualified))
    assert.equal(provider(replayNative), provider(qualified))
    const nativeTools = await host.request('/api/loadout-fixture-tools?id=' + replayBefore.presetId)
    const clarification = nativeTools.includes('ask_user_question') ? ['ask_user_question'] : []
    assert.deepEqual(usedTools(replayNative).map(event => event.data.name), ['read', ...clarification, 'write', 'present'])
    const replayFile = 'direct-handoff.md'
    assert.deepEqual(files(replayNative).flatMap(event => event.data.files.map(item => item.path)), [join(await realpath(personal), replayFile)])
    assert.match(await readFile(join(personal, replayFile), 'utf8'), /Verified: two spare radios/u)
    assert.equal(await readFile(qualifiedFile, 'utf8'), originalHandoff)
    assert.equal(await readFile(original, 'utf8'), body)
    assert.deepEqual(files(await history(qualifiedSession.sessionId)), files(qualified))

    const readReplay = () => invoke('rematch-comparison', { comparisonId: replay.id })
    const replayProof = await readReplay()
    assert.equal(replayProof.evidenceReplay, true)
    assert.equal(replayProof.handoffOutcome, undefined)
    assert.deepEqual(replayProof.change, { removed: { id: 'evidence', name: '证据核验' } })
    const [baselineArm, replayArm] = replayProof.arms
    assert.equal(baselineArm.sessionId, qualifiedSession.sessionId)
    assert.deepEqual(baselineArm.entries.flatMap(entry => entry.choices ?? []), [labels[1]])
    assert.equal(baselineArm.deliverables[0].name, 'qualified-handoff.md')
    assert.equal(replayArm.status, 'complete')
    assert.equal(replayArm.sessionId, replay.sessionId)
    assert.deepEqual(replayArm.entries.flatMap(entry => entry.choices ?? []), clarification.length ? ['简明摘要'] : [])
    assert.equal(replayArm.deliverables[0].name, replayFile)
    assert.ok(!replayArm.canRematch)
    assert.deepEqual(replayProof.evidenceOutcome, { arms: [
      { id: 'baseline', choices: [labels[1]], deliverables: baselineArm.deliverables, canPreserve: true },
      { id: 'rematch', choices: clarification.length ? ['简明摘要'] : [], deliverables: replayArm.deliverables, canPreserve: true },
    ] })
    await saveEvidencePlan(replay.id, 'review', 'Wrong arm', {}, 422)
    await saveEvidencePlan(practice.id, 'baseline', 'Practice is not an evidence replay', {}, 422)
    await invoke('rematch-comparison-options', { kind: 'rematch', comparisonId: replay.id, arm: 'rematch' }, 422)
    const replayHistory = (await invoke('comparison-history', { kind: 'rematch', query: material })).items.find(item => item.id === replay.id)
    assert.equal(replayHistory?.evidenceReplay, true)
    const assertEvidenceReplay = async () => {
      assert.deepEqual(await evidenceHistory({ probe: true }), { available: true })
      const { items } = await evidenceHistory({ query: material })
      assert.deepEqual(items.map(item => item.id), [replay.id])
      const [only] = items
      assert.equal(only.kind, 'rematch')
      assert.equal(only.evidenceReplay, true)
      assert.deepEqual(only.arms.map(arm => [arm.id, arm.status, arm.sessionId]), [
        ['baseline', 'complete', qualifiedSession.sessionId], ['rematch', 'complete', replay.sessionId],
      ])
      assert.deepEqual(only.arms[0].choices, [labels[1]])
      assert.deepEqual(only.arms.map(arm => arm.deliverables.map(item => item.name)), [['qualified-handoff.md'], [replayFile]])
      assert.deepEqual((await evidenceHistory({ before: `${only.createdAt}:${only.kind}:${only.id}` })).items, [])
    }
    await assertEvidenceReplay()

    const stale = await open(confirmed, (await preview(confirmed)).token, 'f')
    await appendFile(original, '\nEdited after opening the draft.\n')
    await send(stale)
    const staleResult = await read(stale.sessionId, true)
    assert.equal(staleResult.status, 'unavailable')
    assert.equal(staleResult.reason, 'changed-material')
    assert.equal(staleResult.canReview, undefined)
    assert.equal(staleResult.draft, undefined)
    await assertEvidenceReplay()
    let earned
    for (let attempt = 0; attempt < 50 && !earned; attempt++) {
      const { receipts } = await invoke('match-settlements-page', { sessionId: stale.sessionId })
      earned = receipts.find(receipt => receipt.awards.some(award => award.id === 'standard'))
      if (!earned) await delay(40)
    }
    assert.ok(earned, 'The manually sent prior turn has finished settling before comparing plan-save XP')

    const planState = async () => {
      const { plans, presets } = (await host.request(endpoint)).value
      return { plans, xp: presets.find(preset => preset.id === 'standard').rank?.xp ?? 0, members: await members() }
    }
    const beforeSave = await planState()
    assert.deepEqual(beforeSave.plans, initialPlans)
    const initialBaseline = await saveEvidencePlan(replay.id, 'baseline', 'Keep evidence check', {
      note: 'From the verified original', draft: { presetId: 'standard', equipmentIds: [] },
    })
    const savedReplay = await saveEvidencePlan(replay.id, 'rematch', 'Keep the tested delivery')
    const baselineOrigin = { comparisonId: replay.id, arm: 'baseline', sessionId: qualifiedSession.sessionId }
    const replayOrigin = { comparisonId: replay.id, arm: 'rematch', sessionId: replay.sessionId }
    assert.equal(initialBaseline.presetId, qualified.presetId)
    assert.equal(initialBaseline.note, 'From the verified original')
    assert.equal(savedReplay.presetId, replayNative.presetId)
    assertPublicOrigin(initialBaseline, true)
    assertPublicOrigin(savedReplay, true)
    assert.deepEqual(await planOrigin(initialBaseline), baselineOrigin)
    assert.deepEqual(await planOrigin(savedReplay), replayOrigin)
    for (const [plan, arm] of [[initialBaseline, 'baseline'], [savedReplay, 'rematch']]) {
      const stored = JSON.parse(await readFile(join(plansDir, plan.id + '.json'), 'utf8'))
      assert.deepEqual(stored.evidenceOrigin, { comparisonId: replay.id, arm })
    }
    const savedBaseline = await invoke('plan-save', { id: initialBaseline.id, revision: initialBaseline.revision,
      name: 'Keep evidence check for the next shift', note: 'Use this for equipment handover' })
    assert.equal(savedBaseline.name, 'Keep evidence check for the next shift')
    assert.equal(savedBaseline.note, 'Use this for equipment handover')
    assertPublicOrigin(savedBaseline, true)
    assert.notEqual(savedBaseline.revision, initialBaseline.revision)
    await planOrigin(initialBaseline, 422)
    assert.deepEqual(await planOrigin(savedBaseline), baselineOrigin)
    await saveEvidencePlan(replay.id, 'rematch', savedBaseline.name, {}, 422)
    const afterSave = await planState()
    assert.deepEqual(new Set(afterSave.plans.map(plan => plan.id)), new Set([...initialPlans.map(plan => plan.id), savedBaseline.id, savedReplay.id]))
    for (const plan of afterSave.plans) assertPublicOrigin(plan, plan.id !== prior.id)
    assert.equal(afterSave.xp, beforeSave.xp)
    assert.deepEqual(afterSave.members, beforeSave.members)
    assert.deepEqual((await readReplay()).evidenceOutcome, replayProof.evidenceOutcome)
    assert.deepEqual(await comparisonArm(), practiceProof)
    await host.stop()
    host = await startHost(env, patch)
    await assertEvidenceReplay()
    assert.notEqual(await readFile(original, 'utf8'), body)
    await planOrigin(prior, 422)
    await planOrigin(initialBaseline, 422)
    assert.deepEqual(await planOrigin(savedBaseline), baselineOrigin)
    assert.deepEqual(await planOrigin(savedReplay), replayOrigin)
    for (const { id, revision, name } of [savedBaseline, savedReplay]) {
      const exported = await invoke('plan-share-export', { id, revision })
      assert.ok(exported.code?.startsWith('DSHH1.'), JSON.stringify(exported))
      const portable = Buffer.from(exported.code.slice('DSHH1.'.length), 'base64url').toString('utf8')
      assert.equal(JSON.parse(portable).name, name)
      assert.doesNotMatch(portable, /"(?:evidenceOrigin|hasEvidenceOrigin|comparisonId|sessionId|workspaceId|material|choices)"\s*:/u)
      for (const privateValue of [replay.id, practice.id, qualifiedSession.sessionId, replay.sessionId, workspaceId,
        material, qualified.workspacePath, 'qualified-handoff.md', replayFile, labels[1], '简明摘要']) {
        assert.ok(!portable.includes(privateValue), privateValue)
      }
    }
    await writeFile(original, body)
    assert.deepEqual((await planState()).plans, afterSave.plans)
    assert.deepEqual((await invoke('lesson-task-options', source)).source, options.source)
    for (const [sessionId, proved] of proofs) assert.deepEqual(await read(sessionId), proved)
    assert.deepEqual(await readReplay(), replayProof)
    assert.deepEqual(await invoke('rematch-comparison-open', replayFields), replay)

    const newWorkspace = join(directory, 'next-shift-workspace')
    const nextMaterial = folder + '/更新 台账.md'
    const nextBody = '# Next shift equipment ledger\n\nVerified: two spare radios in cupboard B.\n'
    const nextTask = '核对更新台账里的两台备用对讲机和交班消息提到的一台备用充电器。请单独准备新一班交接。'
    await mkdir(join(newWorkspace, folder), { recursive: true })
    await writeFile(join(newWorkspace, nextMaterial), nextBody)
    const next = await host.request(workspace, { presetId: 'standard', workspacePath: newWorkspace })
    const savedCases = [
      { plan: savedBaseline, id: '1', gear: ['evidence', 'present'], tools: ['read', 'ask_user_question', 'write', 'present'], file: 'qualified-handoff.md' },
      { plan: savedReplay, id: '2', gear: ['present'], tools: ['read', 'write', 'present'], file: replayFile },
    ]
    for (const { plan, id, gear, tools, file } of savedCases) {
      const request = { id: plan.id, revision: plan.revision, workspaceId: next.workspaceId, material: nextMaterial, task: nextTask }
      const checked = await invoke('plan-task-preview', request)
      assert.ok(checked.token)
      assert.equal(checked.id, plan.id)
      assert.equal(checked.revision, plan.revision)
      assert.equal(checked.planNote, plan.note)
      assert.deepEqual(new Set(checked.gear.map(item => item.id)), new Set(gear))
      assert.ok(checked.task.includes(nextTask) && !checked.task.includes(qualifiedSession.task))
      assert.ok(!checked.task.includes(savedBaseline.note))
      const task = await invoke('plan-task-open', { ...request, token: checked.token, launchId: launchId(id) })
      const draft = await history(task.sessionId)
      assert.ok(!JSON.stringify(task).includes(savedBaseline.note))
      assert.ok(!JSON.stringify(draft.events).includes(savedBaseline.note))
      assert.equal(draft.workspaceId, next.workspaceId)
      assert.equal(draft.presetId, plan.presetId)
      assert.equal(draft.inherited, 0)
      assert.ok(!draft.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
      assert.deepEqual((await equipmentIn(host, task.sessionId)).planTask, { planName: plan.name, material: nextMaterial, task: checked.task })
      if (gear.includes('evidence')) await choose(task, labels[1])
      else await send(task)
      const native = await history(task.sessionId)
      const submitted = native.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      assert.equal(submitted.data.content[0].text, checked.task)
      assert.ok(!JSON.stringify(native.events).includes(savedBaseline.note))
      assert.deepEqual(usedTools(native).map(event => event.data.name), tools)
      assert.match(usedTools(native)[0].data.arguments, /更新 台账\.md/u)
      assert.equal(provider(native), provider(qualified))
      assert.deepEqual(files(native).flatMap(event => event.data.files.map(item => item.path)), [join(await realpath(newWorkspace), file)])
    }
    assert.equal(await readFile(join(newWorkspace, nextMaterial), 'utf8'), nextBody)
    assert.equal(await readFile(qualifiedFile, 'utf8'), originalHandoff)
    assert.deepEqual(files(await history(qualifiedSession.sessionId)), files(qualified))
    assert.deepEqual(await readReplay(), replayProof)

    const paused = await invoke('rematch-comparison-open', { ...pausedReplay.fields, token: pausedReplay.replayPreview.token, launchId: launchId('3') })
    await send(paused)
    const pausedBoard = await invoke('rematch-comparison', { comparisonId: paused.id })
    assert.equal(pausedBoard.arms[0].sessionId, pausedReplay.opened.sessionId)
    assert.deepEqual(pausedBoard.evidenceOutcome.arms[0], { id: 'baseline', choices: [labels[2]], deliverables: [], canPreserve: true })
    assert.deepEqual((await planState()).plans, afterSave.plans)

    const sameArm = await saveEvidencePlan(replay.id, 'baseline', 'Another name for the evidence arm')
    const otherPair = await saveEvidencePlan(paused.id, 'rematch', 'Delivery from a different comparison')
    const planKey = ({ id, revision }) => ({ id, revision })
    const retestOptions = (plan, status) => invoke('evidence-retest-options', planKey(plan), status)
    const leftOptions = await retestOptions(savedBaseline)
    assert.deepEqual(leftOptions.alternatives, [planKey(savedReplay)])
    assert.ok(leftOptions.workspaceIds.includes(next.workspaceId))
    assert.ok(!leftOptions.workspaceIds.includes(sample.workspaceId))
    const rightOptions = await retestOptions(savedReplay)
    assert.deepEqual(new Set(rightOptions.alternatives.map(item => item.id)), new Set([savedBaseline.id, sameArm.id]))
    assert.deepEqual(await retestOptions(prior), { alternatives: [], workspaceIds: [] })
    assert.deepEqual(await retestOptions(otherPair), { alternatives: [], workspaceIds: [] })
    await retestOptions(initialBaseline, 422)

    const retest = { evidenceRetest: true, plans: { left: planKey(savedBaseline), right: planKey(savedReplay) },
      workspaceId: next.workspaceId, material: nextMaterial, task: nextTask + ' 分别测试这两套已保存出装。' }
    const retestPreview = (input, status) => invoke('plan-comparison-preview', input, status)
    const retestOpen = (input, status) => invoke('plan-comparison-open', input, status)
    const retestMembers = async () => (await host.request(workspace, { inspectWorkspaceId: next.workspaceId })).sessionIds
    const beforeRetest = await retestMembers()
    const beforeRetestPlans = (await planState()).plans
    const oldEvidenceHistory = await evidenceHistory()
    for (const invalid of [prior, sameArm, otherPair, { ...savedReplay, revision: randomUUID() }, { ...savedReplay, id: randomUUID() }]) {
      await retestPreview({ ...retest, plans: { ...retest.plans, right: planKey(invalid) } }, 422)
    }
    await retestPreview({ ...retest, workspaceId: sample.workspaceId, material: '02-lighthouse.md' }, 422)
    const reversed = { ...retest, plans: { left: retest.plans.right, right: retest.plans.left } }
    const checked = await retestPreview(reversed)
    assert.ok(checked.token, JSON.stringify(checked.arms))
    assert.equal(checked.workspaceId, next.workspaceId)
    assert.equal(checked.material, nextMaterial)
    assert.ok(checked.task.includes(retest.task) && !checked.task.includes(qualifiedSession.task))
    assert.deepEqual(checked.arms.map(({ id, planName, status }) => [id, planName, status]), [
      ['left', savedReplay.name, 'unopened'], ['right', savedBaseline.name, 'unopened'],
    ])
    assert.ok(checked.comparison.gained.some(item => item.id === 'evidence' || item.name === '证据核验'))
    const editedDraft = { presetId: 'standard', equipmentIds: [] }
    const edited = { ...reversed, draft: editedDraft, plans: { ...reversed.plans, right: { ...reversed.plans.right, draft: editedDraft } } }
    assert.deepEqual(await retestPreview(edited), checked)
    const firstRequest = { ...edited, token: checked.token, launchId: launchId('4'), arm: 'left' }
    await retestOpen({ ...firstRequest, plans: { ...firstRequest.plans, right: planKey(otherPair) } }, 422)
    await appendFile(join(newWorkspace, nextMaterial), '\nChanged after retest preview.\n')
    await retestOpen(firstRequest, 422)
    await writeFile(join(newWorkspace, nextMaterial), nextBody)
    assert.deepEqual(await retestMembers(), beforeRetest)
    assert.deepEqual((await planState()).plans, beforeRetestPlans)

    const left = await retestOpen(firstRequest)
    const comparisonFilter = { comparisonId: left.id }
    const storedRetestPath = join(dirname(plansDir), 'plan-comparisons', left.id + '.json')
    const storedRetest = JSON.parse(await readFile(storedRetestPath, 'utf8'))
    const { evidenceRetestSource: pinnedOrigin, ...legacyRetest } = storedRetest
    assert.deepEqual(pinnedOrigin, { comparisonId: replay.id, left: 'rematch', right: 'baseline' })
    const readRetest = () => invoke('plan-comparison', comparisonFilter)
    const readNote = (arm, status) => invoke('evidence-retest-note', { ...comparisonFilter, arm }, status)
    const saveNote = (arm, fields, status) => invoke('evidence-retest-note-save', { ...comparisonFilter, arm, ...fields }, status)
    const unopened = await readRetest()
    assert.deepEqual(unopened.arms.map(({ status }) => status), ['waiting', 'unopened'])
    assert.equal(unopened.evidenceRetestOutcome, undefined)
    await readNote('right', 422)
    await saveNote('left', { revision: savedReplay.revision, note: 'An unfinished retest' }, 422)
    const right = await retestOpen({ ...comparisonFilter, arm: 'right' })
    assert.equal(right.id, left.id)
    assert.notEqual(left.sessionId, right.sessionId)
    assert.equal(left.task, checked.task)
    assert.equal(right.task, checked.task)
    const waiting = await readRetest()
    assert.equal(waiting.evidenceRetest, true)
    assert.equal(waiting.evidenceRetestOutcome, undefined)
    assert.deepEqual(waiting.arms.map(({ status }) => status), ['waiting', 'waiting'])
    for (const [opened, expected] of [[left, savedReplay], [right, savedBaseline]]) {
      const draft = await history(opened.sessionId)
      assert.equal(draft.presetId, expected.presetId)
      assert.equal(draft.workspaceId, next.workspaceId)
      assert.equal(draft.inherited, 0)
      assert.ok(!draft.events.some(event => ['turn/start', 'user/message', 'tool/call', 'deliverables/presented'].includes(event.type)))
    }
    assert.deepEqual(new Set(await retestMembers()), new Set([...beforeRetest, left.sessionId, right.sessionId]))
    assert.deepEqual(await retestOpen(firstRequest), left)
    await send(left)
    const oneComplete = await readRetest()
    assert.deepEqual(oneComplete.arms.map(({ status }) => status), ['complete', 'waiting'])
    assert.equal(oneComplete.evidenceRetestOutcome, undefined)
    await choose(right, labels[2], async () => {
      const pending = await readRetest()
      assert.equal(pending.arms[0].status, 'complete')
      assert.equal(pending.arms[1].status, 'waiting-choice')
      assert.deepEqual(pending.arms[1].pendingQuestions[0].options, labels)
      assert.equal(pending.evidenceRetestOutcome, undefined)
      await readNote('left', 422)
    })
    const completed = await readRetest()
    assert.deepEqual(completed.arms.map(({ status }) => status), ['complete', 'complete'])
    assert.deepEqual(completed.arms.map(arm => arm.entries.flatMap(entry => entry.choices ?? [])), [[], [labels[2]]])
    assert.deepEqual(completed.arms.map(arm => arm.deliverables.map(item => item.name)), [[replayFile], []])
    const retestedDelivery = await history(left.sessionId)
    assert.deepEqual(usedTools(retestedDelivery).map(event => event.data.name), savedCases[1].tools)
    assert.equal(provider(retestedDelivery), provider(qualified))
    assert.deepEqual(files(retestedDelivery).flatMap(event => event.data.files.map(item => item.path)), [join(await realpath(newWorkspace), replayFile)])
    const retestedPause = await history(right.sessionId)
    assert.deepEqual(usedTools(retestedPause).map(event => event.data.name), ['read', 'ask_user_question'])
    assert.deepEqual(files(retestedPause), [])
    assert.deepEqual(completed.evidenceRetestOutcome, {
      source: { kind: 'rematch', comparisonId: replay.id, arm: 'rematch', evidenceReplay: true },
      arms: [
        { id: 'left', original: { choices: clarification.length ? ['简明摘要'] : [], deliverables: replayArm.deliverables },
          retest: { choices: [], deliverables: completed.arms[0].deliverables }, canEditPlanNote: true },
        { id: 'right', original: { choices: [labels[1]], deliverables: baselineArm.deliverables },
          retest: { choices: [labels[2]], deliverables: [] }, canEditPlanNote: true },
      ],
    })
    assert.deepEqual(await evidenceHistory(), oldEvidenceHistory)
    assert.equal(await readFile(join(newWorkspace, nextMaterial), 'utf8'), nextBody)
    assert.deepEqual((await planState()).plans, beforeRetestPlans)

    const planNote = ({ id, revision, name, note }) => ({ id, revision, name, note })
    const initialLeftNote = await readNote('left')
    assert.deepEqual(initialLeftNote, { ...planNote(savedReplay), note: '' })
    assert.deepEqual(await readNote('right'), planNote(savedBaseline))
    await readNote('baseline', 422)
    await saveNote('baseline', { revision: savedReplay.revision, note: 'Invalid side' }, 422)
    await saveNote('left', { revision: savedBaseline.revision, note: 'Revision for the other side' }, 422)
    await saveNote('left', { revision: savedReplay.revision }, 422)
    const taskBeforeNote = { ...planKey(savedReplay), workspaceId: next.workspaceId, material: nextMaterial, task: nextTask }
    const earlierPreview = await invoke('plan-task-preview', taskBeforeNote)
    assert.equal(earlierPreview.planNote, '')
    assert.ok(earlierPreview.token)
    const leftNoteText = '材料齐全时直接交付。\n保留原台账，另生成交接说明。'
    const leftUpdate = await saveNote('left', { revision: initialLeftNote.revision, note: leftNoteText,
      id: savedBaseline.id, name: 'Attempted rename', draft: { presetId: 'standard', equipmentIds: [] } })
    const savedLeftNote = await readNote('left')
    assert.deepEqual(leftUpdate, savedLeftNote)
    assert.notEqual(savedLeftNote.revision, initialLeftNote.revision)
    assert.deepEqual(savedLeftNote, { ...initialLeftNote, revision: savedLeftNote.revision, note: leftNoteText })
    const membersBeforeStaleTask = await retestMembers()
    await invoke('plan-task-open', { ...taskBeforeNote, token: earlierPreview.token, launchId: launchId('6') }, 422)
    assert.deepEqual(await retestMembers(), membersBeforeStaleTask)
    const updatedPreview = await invoke('plan-task-preview', { ...taskBeforeNote, revision: savedLeftNote.revision })
    assert.equal(updatedPreview.planNote, leftNoteText)
    assert.equal(updatedPreview.task, earlierPreview.task)
    assert.notEqual(updatedPreview.token, earlierPreview.token)
    const counterpartPreview = await invoke('plan-task-preview', { ...taskBeforeNote, ...planKey(savedBaseline) })
    assert.equal(counterpartPreview.planNote, savedBaseline.note)
    await saveNote('left', { revision: initialLeftNote.revision, note: 'Stale revision cannot overwrite the note' }, 422)
    assert.deepEqual(await readNote('left'), savedLeftNote)
    assert.deepEqual(await readNote('right'), planNote(savedBaseline))
    const notedReplay = (await planState()).plans.find(plan => plan.id === savedReplay.id)
    const initialReplayCard = beforeRetestPlans.find(plan => plan.id === savedReplay.id)
    assert.deepEqual(notedReplay, { ...initialReplayCard, ...savedLeftNote, updatedAt: notedReplay.updatedAt })
    await planOrigin(savedReplay, 422)
    assert.deepEqual(await planOrigin(notedReplay), replayOrigin)
    assert.deepEqual(await readRetest(), completed)
    assert.deepEqual(await history(left.sessionId), retestedDelivery)
    assert.deepEqual(await history(right.sessionId), retestedPause)
    assert.deepEqual(await readReplay(), replayProof)

    const alternateInput = { ...retest, plans: { left: planKey(sameArm), right: planKey(notedReplay) } }
    const alternate = await retestPreview(alternateInput)
    const oneArm = await retestOpen({ ...alternateInput, token: alternate.token, launchId: launchId('5'), arm: 'left' })
    const renamed = await invoke('plan-save', { ...planKey(sameArm), name: 'Renamed alternate evidence arm' })
    assert.notEqual(renamed.revision, sameArm.revision)
    const beforeStaleArm = await retestMembers()
    await retestOpen({ comparisonId: oneArm.id, arm: 'right' }, 422)
    assert.deepEqual(await retestMembers(), beforeStaleArm)

    const renamedBaseline = await invoke('plan-save', { ...planKey(savedBaseline), name: 'Renamed original evidence plan' })
    assert.notEqual(renamedBaseline.revision, savedBaseline.revision)
    assert.deepEqual(await readNote('right'), planNote(renamedBaseline))
    await saveNote('right', { revision: savedBaseline.revision, note: 'Stale after a genuine rename' }, 422)
    const cleared = await saveNote('right', { revision: renamedBaseline.revision, note: '' })
    assert.deepEqual(await readNote('right'), { ...planNote(renamedBaseline), revision: cleared.revision, note: '' })
    const rightNoteText = '材料缺少关键证据时暂缓提交，等待台账核验。'
    await saveNote('right', { revision: cleared.revision, note: rightNoteText })
    const savedRightNote = await readNote('right')
    assert.notEqual(savedRightNote.revision, renamedBaseline.revision)
    assert.deepEqual(savedRightNote, { ...planNote(renamedBaseline), revision: savedRightNote.revision, note: rightNoteText })
    assert.deepEqual(await planOrigin(savedRightNote), baselineOrigin)
    assert.deepEqual(await readRetest(), completed)
    await host.stop()
    await writeFile(storedRetestPath, JSON.stringify(legacyRetest))
    host = await startHost(env, patch)
    assert.deepEqual(await readRetest(), completed)
    assert.deepEqual(await readNote('left'), savedLeftNote)
    assert.deepEqual(await readNote('right'), savedRightNote)

    const draft = { presetId: 'standard', equipmentIds: [] }
    const forgery = { evidenceOrigin: { comparisonId: replay.id, arm: 'baseline' }, hasEvidenceOrigin: true }
    const replaced = await invoke('plan-save', { ...savedRightNote, draft, ...forgery })
    assert.notEqual(replaced.presetId, savedBaseline.presetId)
    assertPublicOrigin(replaced, false)
    await planOrigin(savedBaseline, 422)
    await planOrigin(replaced, 422)
    await readNote('right', 422)
    await saveNote('right', { revision: replaced.revision, note: 'A replacement is a different recipe' }, 422)
    const { evidenceRetestOutcome, ...withoutOrigin } = await readRetest()
    assert.equal(evidenceRetestOutcome, undefined)
    const { evidenceRetestOutcome: expectedOutcome, ...completedRounds } = completed
    assert.deepEqual(withoutOrigin, completedRounds)
    const ordinary = await invoke('plan-save', { name: 'Ordinary Standard plan', draft, ...forgery })
    assertPublicOrigin(ordinary, false)
    await planOrigin(ordinary, 422)
    assert.deepEqual(await retestOptions(ordinary), { alternatives: [], workspaceIds: [] })
    assert.deepEqual(await planOrigin(notedReplay), replayOrigin)
    const retainedOrigins = new Set([savedReplay.id, renamed.id, otherPair.id])
    for (const plan of (await planState()).plans) assertPublicOrigin(plan, retainedOrigins.has(plan.id))
    await host.stop()
    await writeFile(storedRetestPath, JSON.stringify(storedRetest))
    host = await startHost(env, patch)
    assert.deepEqual(await readNote('left'), savedLeftNote)
    await readNote('right', 422)
    const persistedRetest = await readRetest()
    assert.equal(persistedRetest.evidenceRetestOutcome.arms[0].canEditPlanNote, true)
    assert.equal(persistedRetest.evidenceRetestOutcome.arms[1].canEditPlanNote, undefined)
    const { id, original: formerResult, retest: newerResult } = expectedOutcome.arms[1]
    assert.deepEqual(persistedRetest, { ...completed,
      evidenceRetestOutcome: { ...expectedOutcome, arms: [expectedOutcome.arms[0], { id, original: formerResult, retest: newerResult }] } })
    assert.deepEqual(await readReplay(), replayProof)
    assert.deepEqual(await history(left.sessionId), retestedDelivery)
    assert.deepEqual(await history(right.sessionId), retestedPause)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('verified Lighthouse lesson gear carries into a new native task on personal material', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-lesson-task-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const personal = join(directory, 'personal-workspace')
  const folder = '案件 材料'
  const file = '交接 记录.md'
  const material = folder + '/' + file
  const body = '# Personal handoff record\n\nConfirm the attachment locally.\n'
  const task = '核对项目交接人和接收日期。确认之后，把这份交接记录附到对话。'
  let host
  try {
    await mkdir(join(personal, folder), { recursive: true })
    await writeFile(join(personal, material), body)
    await symlink(join(personal, material), join(personal, 'linked.md'))
    await symlink(join(personal, folder), join(personal, 'linked-folder'))
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, fields, status) => (await host.request(endpoint, { action, ...fields }, status)).value
    const workspace = '/api/loadout-fixture-session'
    const register = workspacePath => host.request(workspace, { presetId: 'standard', workspacePath })
    const history = id => host.request('/api/loadout-fixture-history?sessionId=' + id)
    const members = async id => (await host.request(workspace, { inspectWorkspaceId: id })).sessionIds
    const plans = async () => (await host.request(endpoint)).value.plans
    const send = ({ sessionId, task, requestId }) => host.request(turnEndpoint, { sessionId, text: task, requestId })
    const armOf = (view, arm) => view.arms.find(item => item.id === arm)
    const direct = await invoke('lighthouse-rematch-open', { launchId: 'a'.repeat(32) })
    const root = { kind: 'workspace', comparisonId: direct.id, arm: 'direct' }
    const directView = () => invoke('workspace-comparison', { comparisonId: direct.id })
    const options = (reference, status) => invoke('lesson-task-options', reference, status)
    assert.equal(armOf(await directView(), 'direct').lessonTaskSource, undefined)
    await options(root, 422)
    await send(direct)
    const directProof = await directView()
    assert.deepEqual(armOf(directProof, 'direct').lessonTaskSource, root)
    const directNative = await history(direct.sessionId)
    const selectedPracticeMaterial = join(directNative.workspacePath, directProof.material)
    const originalPracticeBytes = await readFile(selectedPracticeMaterial, 'utf8')
    const change = { addId: 'review' }
    const gear = (await invoke('rematch-comparison-options', root)).available.find(item => item.id === 'review')
    for (const label of ['交付前复核', 'Delivery Review', '退回修改', 'Request changes']) {
      assert.ok(gear?.searchTerms.includes(label), label)
    }
    const changePreview = await invoke('rematch-comparison-preview', { ...root, change })
    const review = await invoke('rematch-comparison-open', { ...root, change, token: changePreview.token, launchId: 'b'.repeat(32) })
    const reviewSource = { kind: 'rematch', comparisonId: review.id, arm: 'rematch' }
    const reviewView = () => invoke('rematch-comparison', { comparisonId: review.id })
    const waitingReview = await reviewView()
    assert.deepEqual(armOf(waitingReview, 'baseline').lessonTaskSource, root)
    assert.equal(armOf(waitingReview, 'rematch').lessonTaskSource, undefined)
    await options(reviewSource, 422)
    await options({ ...reviewSource, arm: 'baseline' }, 422)
    const questionPath = '/api/loadout-fixture-handoff-question'
    async function choose(attempt, answer) {
      const turn = send(attempt)
      turn.catch(() => {})
      let question
      try {
        for (let count = 0; count < 100 && !question; count++) {
          question = (await host.request(questionPath, { sessionId: attempt.sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(item => item.label), ['Confirm handoff', 'Revise draft'])
        assert.ok(!(await history(attempt.sessionId)).events.some(event => event.type === 'deliverables/presented'))
      } finally {
        if (question) await host.request(questionPath, { sessionId: attempt.sessionId, choice: answer })
        await turn
      }
      return history(attempt.sessionId)
    }
    const practiceReview = await choose(review, 'Revise draft')
    assert.ok(!practiceReview.events.some(event => event.type === 'deliverables/presented'))
    const reviewProof = await reviewView()
    assert.deepEqual(armOf(reviewProof, 'rematch').lessonTaskSource, reviewSource)
    assert.deepEqual(armOf(reviewProof, 'rematch').entries[0].choices, ['Revise draft'])
    const [directCarry, reviewCarry] = reviewProof.publicReviewOutcome.arms.map(side => side.lessonTaskSource)
    assert.deepEqual(directCarry, { ...root, handoffPairId: review.id })
    assert.deepEqual(reviewCarry, { ...reviewSource, handoffPairId: review.id })
    const baseOptions = await options(reviewCarry)
    assert.equal(baseOptions.source.sessionId, review.sessionId)
    assert.equal(baseOptions.source.change.added.id, 'review')
    assert.ok(!baseOptions.workspaceIds.includes(directNative.workspaceId))
    assert.equal((await options(root)).source.sessionId, direct.sessionId)

    const user = await register(personal)
    const profileRoot = dirname(directNative.workspacePath)
    const ancestor = await register(profileRoot)
    const nearPath = join(profileRoot, 'lighthouse-supply-run-personal')
    await mkdir(nearPath)
    await writeFile(join(nearPath, 'personal.md'), '# Similar name, ordinary file')
    const near = await register(nearPath)
    const descendantPath = join(directNative.workspacePath, 'practice-subfolder')
    await mkdir(descendantPath)
    const descendant = await register(descendantPath)
    const starter = await invoke('growth-starter-open', { route: 'recon', launchId: 'c'.repeat(32) })
    const comparison = await invoke('lighthouse-comparison-open', { arm: 'delivery', launchId: 'd'.repeat(32) })
    const legacyPractice = await Promise.all([history(starter.sessionId), history(comparison.sessionId)])
    const personalOptions = await options(reviewCarry)
    assert.deepEqual(new Set(personalOptions.workspaceIds),
      new Set([...baseOptions.workspaceIds, user.workspaceId, ancestor.workspaceId, near.workspaceId]))
    for (const notPersonal of [directNative, descendant, ...legacyPractice]) assert.ok(!personalOptions.workspaceIds.includes(notPersonal.workspaceId))

    const list = (fields, status) => invoke('lesson-task-materials', { ...reviewSource, workspaceId: user.workspaceId, ...fields }, status)
    const found = await list({ query: '交接 记录' })
    assert.deepEqual(found.entries, [{ name: file, path: material, kind: 'file' }])
    const browse = await list({ directory: folder })
    assert.deepEqual(browse.entries, found.entries)
    const onAncestor = await list({ workspaceId: ancestor.workspaceId })
    const practiceFolder = basename(directNative.workspacePath)
    assert.ok(onAncestor.entries.some(item => item.path === basename(nearPath)))
    assert.ok(!onAncestor.entries.some(item => item.path === practiceFolder))
    await list({ workspaceId: directNative.workspaceId }, 422)
    await list({ workspaceId: ancestor.workspaceId, directory: practiceFolder }, 422)
    await list({ directory: 'linked-folder' }, 422)
    const fields = { ...reviewCarry, workspaceId: user.workspaceId, material: found.entries[0].path, task }
    const preview = (override = {}, status) => invoke('lesson-task-preview', { ...fields, ...override }, status)
    for (const value of [join(personal, material), '../escape.md', 'linked.md', 'linked-folder/' + file]) {
      await preview({ material: value }, 422)
    }
    await preview({ workspaceId: directNative.workspaceId, material: directProof.material }, 422)
    await preview({ workspaceId: ancestor.workspaceId, material: practiceFolder + '/' + directProof.material }, 422)
    await preview({ task: '' }, 422)
    const checked = await preview()
    assert.ok(checked.token)
    assert.equal(checked.material, material)
    assert.equal(checked.workspaceId, user.workspaceId)
    assert.deepEqual(checked.source, personalOptions.source)
    assert.deepEqual(new Set(checked.gear.map(item => item.id)), new Set(['present', 'review']))
    assert.match(checked.task, /^【出装任务】\n/u)
    assert.ok(checked.task.includes(JSON.stringify(material)))
    assert.ok(checked.task.includes(task))
    assert.ok(!checked.task.includes('02-lighthouse.md'))
    assert.ok(!checked.task.includes('北岸灯塔'))
    assert.ok(!JSON.stringify(checked).includes(personal))
    const beforePlans = await plans()
    assert.deepEqual(beforePlans, [])
    assert.deepEqual(await members(user.workspaceId), [user.sessionId])
    const open = (token, status) => invoke('lesson-task-open', { ...fields, token, launchId: 'e'.repeat(32) }, status)
    await appendFile(join(personal, material), '\nModified after checking.\n')
    await open(checked.token, 422)
    assert.deepEqual(await members(user.workspaceId), [user.sessionId])
    await writeFile(join(personal, material), body)

    const checkedAgain = await preview()
    const [opened, repeated] = await Promise.all([open(checkedAgain.token), open(checkedAgain.token)])
    assert.deepEqual(repeated, opened)
    assert.notEqual(opened.sessionId, user.sessionId)
    assert.notEqual(opened.sessionId, review.sessionId)
    assert.equal(opened.task, checkedAgain.task)
    const brandNew = await history(opened.sessionId)
    assert.equal(brandNew.workspacePath, await realpath(personal))
    assert.equal(brandNew.workspaceId, user.workspaceId)
    assert.equal(brandNew.presetId, practiceReview.presetId)
    assert.equal(brandNew.inherited, 0)
    assert.ok(!brandNew.events.some(item => item.type === 'turn/start' || item.type === 'user/message'))
    const result = (sessionId, review) => invoke('lesson-task-result', { sessionId, review })
    const openedSnapshot = await equipmentIn(host, opened.sessionId)
    assert.deepEqual(openedSnapshot.planTask, { planName: checkedAgain.planName, material, task: checkedAgain.task, source: checkedAgain.source })
    assert.equal(openedSnapshot.lessonTaskResult, undefined)
    assert.equal((await result(opened.sessionId)).status, 'waiting')
    assert.equal(await result(user.sessionId), null)
    assert.deepEqual(new Set(await members(user.workspaceId)), new Set([user.sessionId, opened.sessionId]))
    assert.deepEqual(await plans(), beforePlans)
    const played = await choose(opened, 'Confirm handoff')
    const message = played.events.find(item => item.type === 'user/message' && item.data.source.kind === 'user')
    assert.equal(message.data.content[0].text, checkedAgain.task)
    const admission = played.events.find(item => item.type === 'plugin:dsh-agent-loadout/comparison-material' &&
      item.ignorable && item.seq < message.seq)
    assert.equal(admission?.data.state, 'verified')
    assert.equal(admission?.data.requestId, message.data.source.rpcId ?? null)
    assert.deepEqual(played.events.filter(item => item.type === 'tool/call').map(item => item.data.name), ['ask_user_question', 'present'])
    const attachment = played.events.find(item => item.type === 'deliverables/presented')
    assert.equal(attachment.data.files[0].path, join(await realpath(personal), material))
    const completedSnapshot = await equipmentIn(host, opened.sessionId)
    assert.equal(completedSnapshot.planTask, undefined)
    assert.equal(completedSnapshot.lessonTaskResult, true)
    assert.deepEqual(await directView(), directProof)
    assert.deepEqual(await reviewView(), reviewProof)
    assert.deepEqual(await plans(), beforePlans)

    const proved = await result(opened.sessionId)
    assert.equal(proved.status, 'complete')
    assert.equal(proved.canReview, true)
    assert.equal(proved.materialDelivered, true)
    assert.deepEqual(proved.entries.map(entry => entry.name), ['ask_user_question', 'present'])
    assert.deepEqual(proved.entries[0].choices, ['Confirm handoff'])
    assert.deepEqual(proved.deliverables, [{ name: file, turn: attachment.data.turn, seq: attachment.seq, index: 0 }])
    const settlements = async () => (await invoke('match-settlements-page', { sessionId: opened.sessionId })).receipts
      .filter(item => proved.receiptIds.includes(item.id))
    const earned = await settlements()
    assert.equal(earned.length, 1)
    assert.ok(earned[0].awards.some(item => item.name === 'present' && item.xp > 0))
    assert.deepEqual(proved.awards, earned[0].awards.filter(item => item.kind)
      .map(({ id, name, kind, xp, sourceName }) => ({ id, name, kind, xp, ...(sourceName && { sourceName }) })))
    assert.ok(!JSON.stringify(proved).includes(await realpath(personal)))

    const baseline = { kind: 'personal', comparisonId: opened.sessionId.slice('session-'.length), arm: 'task' }
    assert.deepEqual(proved.rematchSource, baseline)
    assert.deepEqual(proved.rebaseline, { workspaceId: user.workspaceId, material, brief: task })
    const rematchOptions = await invoke('rematch-comparison-options', baseline)
    assert.equal(rematchOptions.baseline.sessionId, opened.sessionId)
    assert.equal(rematchOptions.material, material)
    assert.equal(rematchOptions.task, checkedAgain.task)
    assert.ok(rematchOptions.equipped.some(item => item.id === 'review'))
    assert.deepEqual(rematchOptions.personalSuggestedChange, { removeId: 'review' })
    assert.deepEqual(rematchOptions.baseline.choices, ['Confirm handoff'])
    await invoke('rematch-comparison-options', { ...baseline, arm: 'baseline' }, 422)
    await invoke('lesson-task-options', baseline, 422)
    const ownReplay = { ...baseline, change: { removeId: 'review' } }
    const replayPreview = await invoke('rematch-comparison-preview', ownReplay)
    assert.equal(replayPreview.change.removed.id, 'review')
    assert.ok(replayPreview.token)
    const openReplay = status => invoke('rematch-comparison-open', { ...ownReplay, token: replayPreview.token,
      launchId: '6'.repeat(32) }, status)
    await appendFile(join(personal, material), '\nChanged after the personal rematch preview.\n')
    await openReplay(422)
    await writeFile(join(personal, material), body)
    const [replay, retriedReplay] = await Promise.all([openReplay(), openReplay()])
    assert.deepEqual(retriedReplay, replay)
    assert.notEqual(replay.sessionId, opened.sessionId)
    assert.equal(replay.task, checkedAgain.task)
    const replayNativeBefore = await history(replay.sessionId)
    assert.equal(replayNativeBefore.workspaceId, user.workspaceId)
    assert.notEqual(replayNativeBefore.presetId, played.presetId)
    assert.ok(!replayNativeBefore.events.some(item => item.type === 'user/message'))
    await send(replay)
    const replayNative = await history(replay.sessionId)
    assert.deepEqual(replayNative.events.filter(item => item.type === 'tool/call').map(item => item.data.name), ['present'])
    assert.equal(replayNative.events.find(item => item.type === 'deliverables/presented').data.files[0].path, join(await realpath(personal), material))
    const readReplay = () => invoke('rematch-comparison', { comparisonId: replay.id })
    const replayProof = await readReplay()
    assert.equal(armOf(replayProof, 'baseline').sessionId, opened.sessionId)
    assert.deepEqual(armOf(replayProof, 'baseline').entries[0].choices, ['Confirm handoff'])
    assert.equal(armOf(replayProof, 'rematch').deliverables[0].name, file)
    assert.equal(replayProof.previous, undefined)
    const baseReview = await invoke('comparison-loadout-preview', { kind: 'rematch', comparisonId: replay.id, arm: 'baseline' })
    assert.deepEqual(new Set(baseReview.draft.equipmentIds), new Set(['present', 'review']))

    const directFields = { ...directCarry, workspaceId: user.workspaceId, material, task }
    const directLoadout = await invoke('lesson-task-preview', directFields)
    assert.equal(directLoadout.source.sessionId, direct.sessionId)
    assert.deepEqual(directLoadout.gear.map(item => item.id), ['present'])
    const directPersonal = await invoke('lesson-task-open', { ...directFields, token: directLoadout.token, launchId: '4'.repeat(32) })
    const directDraft = await history(directPersonal.sessionId)
    assert.equal(directDraft.presetId, directNative.presetId)
    assert.equal(directDraft.inherited, 0)
    assert.ok(!directDraft.events.some(item => item.type === 'turn/start' || item.type === 'user/message'))
    await send(directPersonal)
    const directPlayed = await history(directPersonal.sessionId)
    assert.deepEqual(directPlayed.events.filter(item => item.type === 'tool/call').map(item => item.data.name), ['present'])
    assert.equal(directPlayed.events.find(item => item.type === 'deliverables/presented').data.files[0].path, join(await realpath(personal), material))
    const nextMove = (await result(directPersonal.sessionId)).rematchSource
    const eligible = await invoke('rematch-comparison-options', nextMove)
    assert.deepEqual(eligible.personalSuggestedChange, { addId: 'review' })
    assert.ok(!eligible.suggestedGearId)
    assert.equal(eligible.baseline.sessionId, directPersonal.sessionId)
    const membersBeforeHint = await members(user.workspaceId)
    const suggestedChange = { ...nextMove, change: eligible.personalSuggestedChange }
    const suggestedPreview = await invoke('rematch-comparison-preview', suggestedChange)
    assert.equal(suggestedPreview.task, directPersonal.task)
    assert.deepEqual(suggestedPreview.change, { added: { id: 'review', name: '交付前复核' } })
    const gainedReview = suggestedPreview.comparison.gained.find(item => item.id === 'review')
    assert.ok(gainedReview?.decisions.some(([label]) => label === '退回修改'))
    const presentSource = native => {
      const call = native.events.find(event => event.type === 'tool/call' && event.data.name === 'present')
      return native.events.find(event => event.type === 'plugin:dsh-agent-loadout/tool-source' && event.data.callSeq === call?.seq)?.data.sourceId
    }
    const originalPresentSource = presentSource(directPlayed)
    assert.ok(originalPresentSource)
    assert.deepEqual(await members(user.workspaceId), membersBeforeHint)
    await appendFile(join(personal, material), '\nUpdated after the Review suggestion.\n')
    await invoke('rematch-comparison-options', nextMove, 422)
    await invoke('rematch-comparison-open', { ...suggestedChange, token: suggestedPreview.token, launchId: '3'.repeat(32) }, 422)
    assert.deepEqual(await members(user.workspaceId), membersBeforeHint)
    await writeFile(join(personal, material), body)
    const ownReviews = [['3', 'Confirm handoff'], ['2', 'Revise draft']]
    let pickedFromHandoff
    for (const [id, label] of ownReviews) {
      const trial = await invoke('rematch-comparison-open', { ...suggestedChange, token: suggestedPreview.token, launchId: id.repeat(32) })
      assert.equal(trial.task, directPersonal.task)
      assert.notEqual(trial.sessionId, directPersonal.sessionId)
      assert.ok(!(await history(trial.sessionId)).events.some(item => item.type === 'user/message'))
      assert.equal((await invoke('rematch-comparison', { comparisonId: trial.id })).handoffOutcome, undefined)
      const observed = await choose(trial, label)
      assert.equal(presentSource(observed), label === 'Confirm handoff' ? originalPresentSource : undefined)
      const view = await invoke('rematch-comparison', { comparisonId: trial.id })
      assert.equal(armOf(view, 'baseline').sessionId, directPersonal.sessionId)
      assert.equal(armOf(view, 'baseline').deliverables[0].name, file)
      const arm = armOf(view, 'rematch')
      assert.deepEqual(arm.entries[0].choices, [label])
      const attached = label === 'Confirm handoff'
      assert.deepEqual(arm.deliverables.map(item => item.name), attached ? [file] : [])
      assert.deepEqual(view.handoffOutcome, { material, arms: [
        { id: 'baseline', style: 'direct', choices: [], materialDelivered: true, deliveredCount: 1, canPreserve: true },
        { id: 'rematch', style: 'review', choices: [label], materialDelivered: attached, deliveredCount: attached ? 1 : 0, canPreserve: true },
      ] })

      const child = { kind: 'rematch', comparisonId: trial.id, arm: 'rematch' }
      const followUp = await invoke('rematch-comparison-options', child)
      if (label === 'Revise draft') {
        assert.equal(followUp.personalSuggestedChange, undefined)
        assert.equal(followUp.baseline.choices, undefined)
        continue
      }
      assert.deepEqual(followUp.personalSuggestedChange, { removeId: 'review' })
      assert.deepEqual(followUp.baseline.choices, [label])
      const directChange = { ...child, change: followUp.personalSuggestedChange }
      const directPreview = await invoke('rematch-comparison-preview', directChange)
      assert.equal(directPreview.task, trial.task)
      assert.deepEqual(directPreview.change, { removed: { id: 'review', name: '交付前复核' } })
      const directReplay = await invoke('rematch-comparison-open', { ...directChange, token: directPreview.token, launchId: '1'.repeat(32) })
      assert.notEqual(directReplay.sessionId, trial.sessionId)
      assert.equal(directReplay.task, trial.task)
      assert.ok(!(await history(directReplay.sessionId)).events.some(item => item.type === 'user/message'))
      await send(directReplay)
      const directResult = await history(directReplay.sessionId)
      assert.equal(presentSource(directResult), originalPresentSource)
      assert.deepEqual(directResult.events.filter(item => item.type === 'tool/call').map(item => item.data.name), ['present'])
      const book = await invoke('rematch-comparison', { comparisonId: directReplay.id })
      assert.equal(book.previous.sessionId, trial.sessionId)
      assert.deepEqual(armOf(book, 'baseline').entries[0].choices, [label])
      assert.equal(armOf(book, 'rematch').deliverables[0].name, file)
      assert.deepEqual(book.handoffOutcome, { material, arms: [
        { id: 'baseline', style: 'review', choices: [label], materialDelivered: true, deliveredCount: 1, canPreserve: true },
        { id: 'rematch', style: 'direct', choices: [], materialDelivered: true, deliveredCount: 1, canPreserve: true },
      ] })
      const reviewArms = await Promise.all(book.handoffOutcome.arms.map(side =>
        invoke('comparison-loadout-preview', { kind: 'rematch', comparisonId: directReplay.id, arm: side.id })))
      assert.deepEqual(new Set(reviewArms[0].draft.equipmentIds), new Set(['present', 'review']))
      assert.deepEqual(reviewArms[1].draft.equipmentIds, ['present'])
      assert.deepEqual(await plans(), [])
      pickedFromHandoff = reviewArms[0]
    }
    assert.deepEqual(await history(directPersonal.sessionId), directPlayed)

    const alternate = 'alternate/' + material
    await mkdir(join(personal, 'alternate', folder), { recursive: true })
    await writeFile(join(personal, alternate), '# A different file with the same name')
    const collisionFields = { ...directFields, task: 'Check the alternate handoff file.' }
    const collisionDraft = await invoke('lesson-task-preview', collisionFields)
    const collisionDirect = await invoke('lesson-task-open', { ...collisionFields, token: collisionDraft.token, launchId: '0'.repeat(32) })
    await send(collisionDirect)
    const collisionBaseline = (await result(collisionDirect.sessionId)).rematchSource
    const collisionEdit = { ...collisionBaseline, change: { addId: 'review' } }
    const collisionPreview = await invoke('rematch-comparison-preview', collisionEdit)
    const collision = await invoke('rematch-comparison-open', { ...collisionEdit, token: collisionPreview.token, launchId: '0'.repeat(32) })
    const wrongFile = await choose(collision, 'Confirm handoff')
    assert.equal(wrongFile.events.find(event => event.type === 'deliverables/presented').data.files[0].path,
      join(await realpath(personal), alternate))
    const collisionView = await invoke('rematch-comparison', { comparisonId: collision.id })
    assert.deepEqual(collisionView.handoffOutcome.arms[1], {
      id: 'rematch', style: 'review', choices: ['Confirm handoff'], materialDelivered: false, deliveredCount: 1, canPreserve: true,
    })
    const collisionOptions = await invoke('rematch-comparison-options', { kind: 'rematch', comparisonId: collision.id, arm: 'rematch' })
    assert.equal(collisionOptions.personalSuggestedChange, undefined)

    const readyToSave = await result(opened.sessionId, true)
    assert.deepEqual(new Set(readyToSave.draft.equipmentIds), new Set(['present', 'review']))
    assert.deepEqual(readyToSave.gear.find(item => item.id === 'review')?.evidence, 'decision')
    assert.deepEqual(await plans(), [])
    assert.deepEqual(pickedFromHandoff.draft, readyToSave.draft)
    const personalPlan = await invoke('plan-save', { name: 'Personal Review plan', draft: pickedFromHandoff.draft })
    assert.equal(personalPlan.presetId, played.presetId)

    const freshFile = '会签 文件.md'
    await writeFile(join(personal, freshFile), '# Another real handoff\n')
    const freshFields = { id: personalPlan.id, revision: personalPlan.revision, workspaceId: user.workspaceId,
      material: freshFile, task: '先确认这份会签文件。' }
    const freshPreview = await invoke('plan-task-preview', freshFields)
    assert.ok(freshPreview.token)
    const fresh = await invoke('plan-task-open', { ...freshFields, token: freshPreview.token, launchId: 'f'.repeat(32) })
    const freshRun = await choose(fresh, 'Revise draft')
    assert.equal(freshRun.presetId, played.presetId)
    assert.ok(!freshRun.events.some(item => item.type === 'deliverables/presented'))
    assert.equal(await result(fresh.sessionId), null)
    assert.ok(!freshRun.events.some(item => item.type === 'plugin:dsh-agent-loadout/comparison-material'))

    const revise = await invoke('lesson-task-open', { ...fields, token: checkedAgain.token, launchId: '9'.repeat(32) })
    await choose(revise, 'Revise draft')
    const revised = await result(revise.sessionId)
    assert.deepEqual(revised.entries[0].choices, ['Revise draft'])
    assert.deepEqual(revised.deliverables, [])
    assert.equal(revised.materialDelivered, false)
    const edited = await invoke('lesson-task-open', { ...fields, token: checkedAgain.token, launchId: '8'.repeat(32) })
    await send({ sessionId: edited.sessionId, task: 'Run a different brief.' })
    const rejected = await result(edited.sessionId, true)
    assert.equal(rejected.reason, 'changed-task')
    assert.equal(rejected.draft, undefined)
    assert.ok(!(await history(edited.sessionId)).events.some(item => item.type === 'plugin:dsh-agent-loadout/comparison-material'))

    const changed = await invoke('lesson-task-open', { ...fields, token: checkedAgain.token, launchId: '7'.repeat(32) })
    await appendFile(join(personal, material), '\nEdited before sending the independently opened session.\n')
    const changedRun = await choose(changed, 'Confirm handoff')
    assert.ok(changedRun.events.some(item => item.type === 'plugin:dsh-agent-loadout/comparison-material' && item.data.state === 'changed'))
    assert.ok(changedRun.events.some(item => item.type === 'deliverables/presented'))
    await writeFile(join(personal, material), body)
    assert.equal((await result(changed.sessionId)).rematchSource, undefined)
    await invoke('rematch-comparison-options', { ...baseline, comparisonId: changed.sessionId.slice('session-'.length) }, 422)

    await send({ sessionId: opened.sessionId, task: 'Read another unrelated note after the handoff.' })
    const subsequent = (await invoke('match-settlements-page', { sessionId: opened.sessionId })).receipts
    assert.ok(subsequent.some(item => !proved.receiptIds.includes(item.id)))
    assert.deepEqual(await result(opened.sessionId), proved)

    const { draft } = await invoke('field-playbook-preview', { id: 'direct' })
    const legacyPlan = await invoke('plan-save', { name: 'Saved Direct plan', draft })
    const legacyFields = { id: legacyPlan.id, revision: legacyPlan.revision, workspaceId: user.workspaceId, material, task: 'Read this local file.' }
    const legacyPreview = await invoke('plan-task-preview', legacyFields)
    assert.ok(legacyPreview.token)
    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual(await open(checkedAgain.token), opened)
    assert.deepEqual(await options(reviewCarry), personalOptions)
    assert.equal((await options(reviewSource)).source.handoffPairId, undefined)
    assert.deepEqual(await reviewView(), reviewProof)
    assert.deepEqual(await result(opened.sessionId), proved)
    assert.deepEqual(await settlements(), earned)
    assert.deepEqual(await readReplay(), replayProof)
    assert.deepEqual(await openReplay(), replay)
    const legacy = await invoke('plan-task-open', { ...legacyFields, token: legacyPreview.token, launchId: 'e'.repeat(32) })
    assert.notEqual(legacy.sessionId, opened.sessionId)
    const legacyMarker = (await equipmentIn(host, legacy.sessionId)).planTask
    assert.deepEqual(legacyMarker, { planName: legacyPlan.name, material, task: legacyPreview.task })
    assert.equal(await readFile(join(personal, material), 'utf8'), body)
    assert.equal(await readFile(selectedPracticeMaterial, 'utf8'), originalPracticeBytes)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('workspace comparison uses the same material and records real review choices', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-workspace-compare-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const workspacePath = join(directory, 'existing-workspace')
  const material = 'materials/workspace-fixture.md'
  const brief = 'Verify the selected report and bring it to the conversation.'
  const content = '# Fixture workspace handoff\n\nA selected material before either route runs.\n'
  let host
  try {
    await mkdir(join(workspacePath, 'materials'), { recursive: true })
    await writeFile(join(workspacePath, material), content)
    const outside = join(directory, 'outside.md')
    await writeFile(outside, '# Outside the selected workspace\n')
    await symlink(outside, join(workspacePath, 'outside-link.md'))
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const history = id => host.request('/api/loadout-fixture-history?sessionId=' + id)
    const read = filter => invoke('workspace-comparison', filter)
    const open = (payload, status) => invoke('workspace-comparison-open', payload, status)
    const armOf = (view, id) => view.arms.find(item => item.id === id)
    const listComparisons = (filters, status) => invoke('comparison-history', filters, status)
    const listPlans = async () => (await host.request(endpoint)).value.plans
    const previewLoadout = (comparisonId, arm, status) => invoke('comparison-loadout-preview',
      { kind: 'workspace', comparisonId, arm }, status)
    const { workspaceId, sessionId: existing } = await host.request('/api/loadout-fixture-session', { presetId: 'standard', workspacePath })
    const prototype = await read({ prototype: true })
    assert.deepEqual(prototype.arms.map(item => [item.id, item.status]), [['direct', 'unopened'], ['review', 'unopened']])
    assert.equal(await read({ sessionId: existing }), null)
    assert.deepEqual((await listComparisons({})).items, [])
    const request = { arm: 'direct', launchId: 'a'.repeat(32), workspaceId, material, task: brief }
    for (const forbidden of ['../outside.md', outside, 'outside-link.md', 'materials', 'missing.md']) {
      await open({ ...request, material: forbidden }, 422)
    }
    const rank = async () => (await host.request(endpoint)).value.presets.find(hero => hero.id === 'standard').rank?.xp ?? 0
    const before = await rank()
    const [direct, retried] = await Promise.all([open(request), open(request)])
    assert.deepEqual(direct, retried)
    assert.match(direct.task, /^【工作区同题对照】/)
    assert.ok(direct.task.includes(material))
    assert.ok(direct.task.includes(brief))
    assert.ok(!direct.task.includes(workspacePath))
    const compare = () => read({ comparisonId: direct.id })
    const started = await compare()
    assert.equal(started.workspaceId, workspaceId)
    assert.equal(started.materialState, 'verified')
    assert.equal(armOf(started, 'direct').status, 'waiting')
    assert.equal(armOf(started, 'review').status, 'unopened')
    const initialCard = (await listComparisons({})).items[0]
    assert.equal(initialCard.id, direct.id)
    assert.equal(armOf(initialCard, 'direct').sessionId, direct.sessionId)
    assert.ok(!armOf(initialCard, 'direct').canReuse)
    assert.ok(!armOf(initialCard, 'review').canReuse)
    assert.equal(await rank(), before)
    const originalPath = await realpath(workspacePath)
    const nativeHistory = async sessionId => {
      const replay = await history(sessionId)
      assert.equal(replay.workspaceId, workspaceId)
      assert.equal(replay.workspacePath, originalPath)
      assert.equal(replay.inherited, 0)
      return replay
    }
    assert.ok(!(await nativeHistory(direct.sessionId)).events.some(item => item.type === 'turn/start' || item.type === 'user/message'))
    assert.equal(await readFile(join(workspacePath, material), 'utf8'), content)
    const send = attempt => host.request(turnEndpoint, { sessionId: attempt.sessionId, requestId: attempt.requestId, text: attempt.task })
    await send(direct)
    const noReview = armOf(await compare(), 'direct')
    assert.equal(noReview.status, 'complete')
    assert.equal(noReview.turn, 1)
    assert.deepEqual(noReview.entries.map(entry => [entry.name, entry.state]), [['present', 'completed']])
    assert.deepEqual(noReview.deliverables, [{ name: 'workspace-fixture.md', turn: 1 }])

    await appendFile(join(workspacePath, material), '\nA material change between attempts.\n')
    await open({ comparisonId: direct.id, arm: 'review' }, 422)
    const materialChanged = await compare()
    assert.equal(materialChanged.materialState, 'changed')
    assert.equal(armOf(materialChanged, 'review').status, 'unopened')
    assert.deepEqual(armOf(materialChanged, 'direct'), noReview)
    await writeFile(join(workspacePath, material), content)
    const review = await open({ comparisonId: direct.id, arm: 'review' })
    assert.equal(review.task, direct.task)
    assert.notEqual(review.sessionId, direct.sessionId)
    assert.notEqual(review.sessionId, existing)
    assert.notEqual(review.requestId, direct.requestId)
    assert.ok(!(await nativeHistory(review.sessionId)).events.some(item => item.type === 'turn/start' || item.type === 'user/message'))

    const questionPath = '/api/loadout-fixture-handoff-question'
    async function answerReview(attempt, choice) {
      const turn = send(attempt)
      turn.catch(() => {})
      let question
      try {
        for (let i = 0; i < 100; i++) {
          question = (await host.request(questionPath, { sessionId: attempt.sessionId })).question
          if (question) break
          await delay(40)
        }
        const labels = ['Confirm handoff', 'Revise draft']
        assert.deepEqual(question?.options.map(item => item.label), labels)
        const waiting = armOf(await read({ sessionId: attempt.sessionId }), 'review')
        assert.equal(waiting.status, 'waiting-choice')
        assert.ok(!waiting.deliverables?.length)
        assert.ok(waiting.pendingQuestions.some(item => item.state === 'open' &&
          item.options.join('|') === labels.join('|')))
        const waitingCard = (await listComparisons({ kind: 'workspace' })).items.find(item => item.id === attempt.id)
        const reviewCard = armOf(waitingCard, 'review')
        assert.equal(reviewCard.status, 'waiting-choice')
        assert.equal(reviewCard.pending, true)
        assert.ok(!reviewCard.canReuse)
      } finally {
        if (question) await host.request(questionPath, { sessionId: attempt.sessionId, choice })
        await turn
      }
      return armOf(await read({ sessionId: attempt.sessionId }), 'review')
    }
    const approved = await answerReview(review, 'Confirm handoff')
    assert.equal(approved.status, 'complete')
    assert.deepEqual(approved.entries.map(entry => [entry.name, entry.state]),
      [['ask_user_question', 'completed'], ['present', 'completed']])
    assert.deepEqual(approved.entries[0].choices, ['Confirm handoff'])
    assert.deepEqual(approved.deliverables, noReview.deliverables)
    const approvedPair = await compare()
    assert.equal(armOf(approvedPair, 'direct').sessionId, direct.sessionId)
    assert.equal(armOf(approvedPair, 'review').sessionId, review.sessionId)
    for (const attempt of [direct, review]) {
      const { events } = await nativeHistory(attempt.sessionId)
      const sent = events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
      assert.equal(sent.data.content[0].text, direct.task)
      const delivered = events.find(event => event.type === 'deliverables/presented')
      assert.equal(delivered.data.files[0].path, join(originalPath, material))
    }

    const revise = await open({ ...request, arm: 'review', launchId: 'b'.repeat(32) })
    assert.notEqual(revise.id, direct.id)
    const revised = await answerReview(revise, 'Revise draft')
    assert.equal(revised.status, 'complete')
    assert.deepEqual(revised.entries.map(entry => entry.name), ['ask_user_question'])
    assert.deepEqual(revised.entries[0].choices, ['Revise draft'])
    assert.deepEqual(revised.deliverables, [])
    assert.ok(!(await nativeHistory(revise.sessionId)).events.some(item => item.type === 'deliverables/presented'))

    const changed = await open({ ...request, launchId: 'c'.repeat(32) })
    await send({ ...changed, task: changed.task + '\nMake this a different task.' })
    assert.ok((await nativeHistory(changed.sessionId)).events.some(item => item.type === 'deliverables/presented'))
    const notCompared = armOf(await read({ sessionId: changed.sessionId }), 'direct')
    assert.equal(notCompared.status, 'unavailable')
    assert.equal(notCompared.reason, 'changed-task')
    assert.ok(!notCompared.deliverables?.length)

    const tampered = await open({ ...request, launchId: 'd'.repeat(32) })
    await appendFile(join(workspacePath, material), '\nChanged after opening, before sending.\n')
    await send(tampered)
    assert.ok((await nativeHistory(tampered.sessionId)).events.some(item => item.type === 'deliverables/presented'))
    const tainted = await read({ sessionId: tampered.sessionId })
    assert.equal(tainted.materialState, 'changed')
    assert.equal(armOf(tainted, 'direct').status, 'unavailable')
    assert.equal(armOf(tainted, 'direct').reason, 'changed-material')
    assert.ok(!armOf(tainted, 'direct').deliverables?.length)
    await writeFile(join(workspacePath, material), content)
    assert.deepEqual(armOf(await read({ sessionId: tampered.sessionId }), 'direct'), armOf(tainted, 'direct'))

    const lighthouse = await invoke('lighthouse-comparison-open', { arm: 'recon', launchId: 'e'.repeat(32) })
    const mixed = (await listComparisons({ kind: 'all' })).items
    assert.equal(mixed.length, 5)
    assert.deepEqual(new Set(mixed.map(item => item.kind)), new Set(['workspace', 'lighthouse']))
    assert.equal((await listComparisons({ kind: 'lighthouse' })).items[0].id, lighthouse.id)
    const { items: matching } = await listComparisons({ kind: 'workspace', query: 'WORKSPACE-FIXTURE.md' })
    assert.equal(matching.length, 4)
    assert.deepEqual(new Set(matching.map(item => item.id)), new Set([direct.id, revise.id, changed.id, tampered.id]))
    assert.deepEqual((await listComparisons({ query: 'unrelated hunt' })).items, [])
    assert.equal((await listComparisons({ query: 'FIXTURE WORKSPACE' })).items.length, 4)
    assert.equal((await listComparisons({ query: brief.slice(0, 20) })).items.length, 4)
    assert.deepEqual((await listComparisons({ query: 'A selected material before either route runs.' })).items, [])
    assert.deepEqual((await listComparisons({ outcome: 'delivered' })).items.map(item => item.id), [direct.id])
    assert.deepEqual(new Set((await listComparisons({ outcome: 'decisions' })).items.map(item => item.id)), new Set([direct.id, revise.id]))
    const prior = matching.find(item => item.id === direct.id)
    assert.ok(prior.title)
    assert.ok(prior.createdAt)
    assert.equal(prior.workspaceTitle, 'Fixture workspace')
    assert.equal(prior.material, material)
    assert.deepEqual(armOf(prior, 'review').choices, ['Confirm handoff'])
    assert.deepEqual(armOf(prior, 'review').deliverables, approved.deliverables)
    assert.equal(armOf(prior, 'review').sessionId, review.sessionId)
    assert.ok(armOf(prior, 'review').canReuse)
    assert.ok(armOf(prior, 'direct').canReuse)
    assert.ok(!armOf(matching.find(item => item.id === changed.id), 'direct').canReuse)
    assert.ok(!armOf(matching.find(item => item.id === tampered.id), 'direct').canReuse)
    assert.ok(!JSON.stringify(mixed).includes(originalPath))
    assert.ok(!JSON.stringify(mixed).includes('A selected material before either route runs.'))

    const plansBefore = await listPlans()
    const rankBeforeReuse = await rank()
    const originalEvents = (await history(review.sessionId)).events.filter(item => item.type === 'turn/start')
    const directReuse = await previewLoadout(direct.id, 'direct')
    const reviewReuse = await previewLoadout(direct.id, 'review')
    const reviseReuse = await previewLoadout(revise.id, 'review')
    assert.equal(directReuse.sessionId, direct.sessionId)
    assert.equal(reviewReuse.sessionId, review.sessionId)
    assert.equal(reviewReuse.workspaceId, workspaceId)
    assert.equal(reviewReuse.hero.id, 'standard')
    assert.ok(directReuse.draft.equipmentIds.includes('present'))
    assert.ok(!directReuse.draft.equipmentIds.includes('review'))
    assert.ok(reviewReuse.draft.equipmentIds.includes('present'))
    assert.ok(reviewReuse.draft.equipmentIds.includes('review'))
    assert.ok(reviewReuse.comparison)
    assert.deepEqual(reviewReuse.choices, ['Confirm handoff'])
    assert.deepEqual(reviewReuse.deliverables, approved.deliverables)
    assert.deepEqual(reviseReuse.choices, ['Revise draft'])
    assert.deepEqual(reviseReuse.deliverables, [])
    assert.ok(reviseReuse.draft.equipmentIds.includes('review'))
    assert.ok(reviseReuse.draft.equipmentIds.includes('present'))
    assert.equal(reviseReuse.gear.find(item => item.id === 'review').evidence, 'decision')
    assert.equal(reviseReuse.gear.find(item => item.id === 'present').evidence, 'equipped')
    await previewLoadout('../', 'direct', 422)
    await previewLoadout(lighthouse.id, 'direct', 422)
    await previewLoadout(direct.id, 'delivery', 422)
    await previewLoadout(changed.id, 'direct', 422)
    await previewLoadout(tampered.id, 'direct', 422)
    await previewLoadout(revise.id, 'direct', 422)
    assert.deepEqual(await listPlans(), plansBefore)
    assert.equal(await rank(), rankBeforeReuse)
    assert.deepEqual((await history(review.sessionId)).events.filter(item => item.type === 'turn/start'), originalEvents)

    const saved = await invoke('plan-save', { name: 'Reuse the verified workspace review', draft: reviseReuse.draft })
    assert.ok((await listPlans()).some(item => item.id === saved.id))
    const fresh = await host.request('/api/loadout-fixture-session', { presetId: saved.presetId, workspacePath })
    await invoke('verify-live', { sessionId: fresh.sessionId, presetId: saved.presetId })
    assert.ok(!(await nativeHistory(fresh.sessionId)).events.some(item => item.type === 'turn/start' || item.type === 'user/message'))

    const pagingMaterial = 'materials/history-page.md'
    await writeFile(join(workspacePath, pagingMaterial), '# Additional history file')
    const pagedIds = new Set(mixed.map(item => item.id))
    for (const launch of ['10', '11', '12', '13', '14', '15', '16', '17']) {
      const next = await open({ ...request, material: pagingMaterial, launchId: launch.repeat(16) })
      pagedIds.add(next.id)
    }
    const firstPage = await listComparisons({})
    assert.equal(firstPage.items.length, 12)
    assert.equal(typeof firstPage.before, 'string')
    const olderPage = await listComparisons({ before: firstPage.before })
    assert.equal(olderPage.items.length, 1)
    assert.equal(olderPage.before, undefined)
    const everyId = [...firstPage.items, ...olderPage.items].map(item => item.id)
    assert.equal(new Set(everyId).size, everyId.length)
    assert.deepEqual(new Set(everyId), pagedIds)
    await listComparisons({ before: '../' }, 422)

    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual((await read({ sessionId: direct.sessionId })).arms, approvedPair.arms)
    assert.deepEqual(await open({ comparisonId: direct.id, arm: 'review' }), review)
    assert.deepEqual((await listComparisons({ kind: 'workspace', query: 'workspace-fixture.md' })).items, matching)
    assert.deepEqual((await previewLoadout(revise.id, 'review')).draft, reviseReuse.draft)
    assert.equal(await readFile(join(workspacePath, material), 'utf8'), content)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('current Armory gear creates one reviewed native task without needing a saved plan', { timeout: 75_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-armory-task-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const workspacePath = join(directory, 'personal-workspace')
  const material = '案件 材料/交接 记录.md'
  const content = '# Personal handoff\n\nAn exact local attachment.\n'
  const task = 'Check the selected material, then hand it off with the current setup.'
  let host
  try {
    await mkdir(dirname(join(workspacePath, material)), { recursive: true })
    await writeFile(join(workspacePath, material), content)
    await symlink(join(workspacePath, material), join(workspacePath, 'shortcut.md'))
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)

    const action = async (name, fields, status) => (await host.request(endpoint, { action: name, ...fields }, status)).value
    const workspaceEndpoint = '/api/loadout-fixture-session'
    const { sessionId: seed, workspaceId } = await host.request(workspaceEndpoint, { presetId: 'standard', workspacePath })
    const members = async () => (await host.request(workspaceEndpoint, { inspectWorkspaceId: workspaceId })).sessionIds
    const catalog = async () => (await host.request(endpoint)).value
    const history = id => host.request('/api/loadout-fixture-history?sessionId=' + id)
    const preview = (fields, status) => action('armory-task-preview', fields, status)
    const open = (fields, token, launchId, status) => action('armory-task-open', { ...fields, token, launchId }, status)
    const send = ({ sessionId, task }) => host.request(turnEndpoint, { sessionId, text: task })
    const direct = { workspaceId, material, task, draft: { presetId: 'standard', equipmentIds: [] } }
    const review = { ...direct, draft: { ...direct.draft, equipmentIds: ['review'] } }
    const launchId = randomUUID().replaceAll('-', '')
    const before = await catalog()

    assert.deepEqual(before.plans, [])
    assert.ok((await action('armory-task-options')).workspaceIds.includes(workspaceId))
    assert.deepEqual((await action('lesson-task-materials', { workspaceId, query: '交接 记录' })).entries,
      [{ name: '交接 记录.md', path: material, kind: 'file' }])
    const [plain, equipped] = await Promise.all([preview(direct), preview(review)])
    assert.ok(plain.token && equipped.token && plain.token !== equipped.token, [plain.reason, equipped.reason].join(' / '))
    assert.equal(plain.task, equipped.task)
    assert.equal(plain.comparison.after.id, 'standard')
    assert.deepEqual(plain.gear, [])
    assert.deepEqual(equipped.gear.map(item => item.id), ['review'])
    assert.deepEqual(equipped.comparison.gained.find(item => item.id === 'review')?.decisions.map(([name]) => name),
      ['确认交付', '退回修改'])
    assert.ok(!JSON.stringify(equipped).includes(workspacePath))
    for (const path of [join(workspacePath, material), '../outside.md', 'shortcut.md']) {
      await preview({ ...direct, material: path }, 422)
    }
    await open(review, '0'.repeat(64), launchId, 422)
    await open(review, plain.token, launchId, 422)
    await appendFile(join(workspacePath, material), 'Changed after preview.')
    await open(review, equipped.token, launchId, 422)
    await writeFile(join(workspacePath, material), content)
    assert.deepEqual(await members(), [seed])
    const afterPreview = await catalog()
    assert.deepEqual(afterPreview.plans, before.plans)
    assert.deepEqual(afterPreview.saved, before.saved)

    const [first, duplicate] = await Promise.all([open(direct, plain.token, launchId), open(direct, plain.token, launchId)])
    assert.deepEqual(duplicate, first)
    const second = await open(review, equipped.token, randomUUID().replaceAll('-', ''))
    assert.equal(first.task, second.task)
    for (const draft of [first, second]) {
      const pending = await history(draft.sessionId)
      assert.equal(pending.workspaceId, workspaceId)
      assert.equal(pending.inherited, 0)
      assert.ok(!pending.events.some(event => ['turn/start', 'user/message', 'tool/call'].includes(event.type)))
      assert.deepEqual((await equipmentIn(host, draft.sessionId)).planTask,
        { planName: plain.planName, material, task: draft.task, armory: true })
    }
    assert.equal((await history(first.sessionId)).presetId, 'standard')
    assert.match((await history(second.sessionId)).presetId, /^loadout-/)
    assert.deepEqual(new Set(await members()), new Set([seed, first.sessionId, second.sessionId]))

    await send(first)
    const delivered = await history(first.sessionId)
    assert.deepEqual(delivered.events.filter(event => event.type === 'tool/call').map(event => event.data.name), ['present'])
    assert.equal(delivered.events.find(event => event.type === 'deliverables/presented').data.files[0].path,
      join(await realpath(workspacePath), material))
    const reference = { kind: 'personal', comparisonId: first.sessionId.slice('session-'.length), arm: 'task' }
    const firstSnapshot = await equipmentIn(host, first.sessionId)
    assert.equal(firstSnapshot.armoryTaskResult, true)
    assert.deepEqual(firstSnapshot.armoryReview, reference)
    const report = await action('lesson-task-result', { sessionId: first.sessionId, review: true })
    assert.equal(report.armory, true)
    assert.equal(report.materialDelivered, true)
    assert.equal(report.hero.id, 'standard')
    assert.deepEqual(report.rematchSource, reference)
    const choices = await action('rematch-comparison-options', reference)
    assert.equal(choices.suggestedGearId, 'review')
    const pickReview = { ...reference, change: { addId: 'review' } }
    const checked = await action('rematch-comparison-preview', pickReview)
    assert.deepEqual(checked.change.added.id, 'review')
    assert.equal(checked.task, first.task)
    await appendFile(join(workspacePath, material), 'Changed before replay.')
    assert.equal((await equipmentIn(host, first.sessionId)).armoryReview, undefined)
    const stale = await action('lesson-task-result', { sessionId: first.sessionId })
    assert.equal(stale.rematchSource, undefined)
    assert.equal(stale.materialDelivered, true)
    assert.deepEqual(stale.rebaseline, { workspaceId, material, brief: task })
    assert.equal(stale.armoryDraft.draft.presetId, 'standard')
    assert.ok((await preview({ ...stale.rebaseline, task: stale.rebaseline.brief, draft: stale.armoryDraft.draft })).token)
    await action('rematch-comparison-preview', pickReview, 422)
    await writeFile(join(workspacePath, material), content)
    const rematchInput = { ...pickReview, token: checked.token, launchId: randomUUID().replaceAll('-', '') }
    const rematch = await action('rematch-comparison-open', rematchInput)
    assert.deepEqual(await action('rematch-comparison-open', rematchInput), rematch)
    assert.equal(rematch.task, first.task)
    assert.notEqual(rematch.sessionId, second.sessionId)
    assert.ok(!(await history(rematch.sessionId)).events.some(event => event.type === 'turn/start'))

    async function answerReview(draft, answer) {
      const turn = send(draft)
      turn.catch(() => {})
      const questionPath = '/api/loadout-fixture-handoff-question'
      let question
      try {
        for (let i = 0; i < 100 && !question; i++) {
          question = (await host.request(questionPath, { sessionId: draft.sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(item => item.label), ['Confirm handoff', 'Revise draft'])
        assert.ok(!(await history(draft.sessionId)).events.some(event => event.type === 'deliverables/presented'))
      } finally {
        if (question) await host.request(questionPath, { sessionId: draft.sessionId, choice: answer })
        await turn
      }
      return history(draft.sessionId)
    }
    const revised = await answerReview(second, 'Revise draft')
    assert.deepEqual(revised.events.filter(event => event.type === 'tool/call').map(event => event.data.name), ['ask_user_question'])
    assert.ok(!revised.events.some(event => event.type === 'deliverables/presented'))
    assert.equal(await readFile(join(workspacePath, material), 'utf8'), content)
    assert.deepEqual((await catalog()).plans, before.plans)
    await answerReview(rematch, 'Revise draft')
    const paired = await action('rematch-comparison', { comparisonId: rematch.id })
    assert.deepEqual(paired.arms.map(arm => arm.sessionId), [first.sessionId, rematch.sessionId])
    assert.deepEqual(paired.handoffOutcome.arms.map(item => [item.style, item.choices, item.deliveredCount]),
      [['direct', [], 1], ['review', ['Revise draft'], 0]])
    const [beforeGear, afterGear] = paired.armoryHandoffOutcome.arms
    assert.equal(beforeGear.sessionId, first.sessionId)
    assert.equal(afterGear.sessionId, rematch.sessionId)
    assert.deepEqual(afterGear.choices, ['Revise draft'])
    assert.deepEqual(afterGear.deliverables, [])
    assert.equal(beforeGear.deliverables[0].name, '交接 记录.md')
    assert.ok(Number.isSafeInteger(beforeGear.deliverables[0].seq))
    assert.equal(beforeGear.deliverables[0].index, 0)
    for (const arm of [beforeGear, afterGear]) {
      assert.equal(arm.canPreserve, true)
      const preserve = await action('comparison-loadout-preview', { kind: 'rematch', comparisonId: rematch.id, arm: arm.id })
      assert.equal(preserve.draft.presetId, 'standard')
      assert.deepEqual(preserve.draft.equipmentIds, arm.id === 'baseline' ? [] : ['review'])
    }
    await appendFile(join(workspacePath, material), 'Changed after the rematch.')
    const archived = await action('rematch-comparison', { comparisonId: rematch.id })
    assert.equal(archived.armoryHandoffOutcome, undefined)
    assert.deepEqual(archived.handoffOutcome, paired.handoffOutcome)
    await writeFile(join(workspacePath, material), content)
    assert.deepEqual(await open(direct, plain.token, launchId), first)
    assert.deepEqual(new Set(await members()), new Set([seed, first.sessionId, second.sessionId, rematch.sessionId]))
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('saved Review loadout opens a manually submitted task on new workspace material', { timeout: 75_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-plan-task-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const workspacePath = join(directory, 'selected-workspace')
  const otherPath = join(directory, 'other-workspace')
  const material = 'materials/reuse-fixture.md'
  const alternate = 'materials/alternate.md'
  const content = '# Evidence for a fresh handoff\n\nPrivate fixture body.\n'
  const task = 'Check the selected document and prepare its handoff.'
  const launchId = 'a'.repeat(32)
  let host
  try {
    for (const path of [workspacePath, otherPath]) {
      await mkdir(join(path, 'materials'), { recursive: true })
      await writeFile(join(path, material), content)
    }
    await writeFile(join(workspacePath, alternate), content)
    await symlink(join(otherPath, material), join(workspacePath, 'materials/linked.md'))
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const workspace = '/api/loadout-fixture-session'
    const history = sessionId => host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const membership = id => host.request(workspace, { inspectWorkspaceId: id })
    const catalog = async () => {
      const { plans, saved, presets } = (await host.request(endpoint)).value
      return { plans, saved: saved.map(item => item.id), xp: presets.find(item => item.id === 'standard').rank?.xp ?? 0 }
    }
    const previewTask = (fields, status) => invoke('plan-task-preview', fields, status)
    const openTask = (fields, token, id = launchId, status) => invoke('plan-task-open', { ...fields, token, launchId: id }, status)
    const restoreDraft = (sessionId, status) => invoke('plan-task-draft-restore', { sessionId }, status)

    const selected = await host.request(workspace, { presetId: 'standard', workspacePath })
    const other = await host.request(workspace, { presetId: 'standard', workspacePath: otherPath })
    const originalWorkspace = await membership(selected.workspaceId)
    assert.deepEqual(originalWorkspace.sessionIds, [selected.sessionId])
    const originalOther = await membership(other.workspaceId)
    const playbook = await invoke('field-playbook-preview', { id: 'review' })
    const originalPlan = await invoke('plan-save', { name: 'Workspace review', draft: playbook.draft })
    const originalFields = { id: originalPlan.id, revision: originalPlan.revision, workspaceId: selected.workspaceId, material, task }
    const firstPreview = await previewTask(originalFields)
    const plan = await invoke('plan-save', { id: originalPlan.id, revision: originalPlan.revision, name: 'Workspace review v2' })
    assert.notEqual(plan.revision, originalPlan.revision)
    assert.equal(plan.presetId, originalPlan.presetId)
    await openTask(originalFields, firstPreview.token, launchId, 422)
    await previewTask(originalFields, 422)

    const fields = { ...originalFields, revision: plan.revision }
    const before = await catalog()
    const preview = await previewTask(fields)
    assert.equal(preview.id, plan.id)
    assert.equal(preview.revision, plan.revision)
    assert.equal(preview.planName, plan.name)
    assert.equal(preview.workspaceId, selected.workspaceId)
    assert.equal(preview.workspaceTitle, 'Fixture workspace')
    assert.equal(preview.material, material)
    assert.match(preview.task, /^【出装任务】\n/u)
    assert.ok(preview.task.split('\n')[1].includes(JSON.stringify(material)))
    assert.ok(preview.task.includes(task))
    assert.ok(!JSON.stringify(preview).includes(workspacePath))
    assert.ok(!JSON.stringify(preview).includes('Private fixture body.'))
    assert.ok(preview.comparison.gained.some(item => item.id === 'review'))
    assert.ok(preview.token)
    const english = await host.requestRaw(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-DSH-Heros-Language': 'en' },
      body: JSON.stringify({ action: 'plan-task-preview', ...fields }),
    })
    assert.equal(english.status, 200)
    assert.match((await english.json()).value.task, /^\[Loadout task\]\n/u)
    for (const unusable of ['../other-workspace/materials/reuse-fixture.md', join(workspacePath, material), 'materials/linked.md', 'materials', 'missing.md']) {
      await previewTask({ ...fields, material: unusable }, 422)
    }
    await previewTask({ ...fields, workspaceId: randomUUID() }, 422)
    await openTask(fields, preview.token + 'x', launchId, 422)
    await openTask({ ...fields, task: task + ' Changed.' }, preview.token, launchId, 422)
    await openTask({ ...fields, material: alternate }, preview.token, launchId, 422)
    await openTask({ ...fields, workspaceId: other.workspaceId }, preview.token, launchId, 422)
    await appendFile(join(workspacePath, material), '\nThe selected file changed after preview.\n')
    await openTask(fields, preview.token, launchId, 422)
    await writeFile(join(workspacePath, material), content)
    assert.deepEqual(await catalog(), before)
    assert.deepEqual(await membership(selected.workspaceId), originalWorkspace)
    assert.deepEqual(await membership(other.workspaceId), originalOther)

    const fresh = await previewTask(fields)
    const [opened, retried] = await Promise.all([openTask(fields, fresh.token), openTask(fields, fresh.token)])
    assert.deepEqual(opened, retried)
    assert.equal(opened.workspaceId, selected.workspaceId)
    assert.equal(opened.task, fresh.task)
    assert.notEqual(opened.sessionId, selected.sessionId)
    const existing = await history(opened.sessionId)
    const resolved = await realpath(workspacePath)
    assert.equal(existing.workspaceId, selected.workspaceId)
    assert.equal(existing.workspacePath, resolved)
    assert.equal(existing.presetId, plan.presetId)
    assert.equal(existing.inherited, 0)
    assert.ok(!existing.events.some(item => item.type === 'turn/start' || item.type === 'user/message'))
    assert.deepEqual(new Set((await membership(selected.workspaceId)).sessionIds), new Set([selected.sessionId, opened.sessionId]))
    assert.deepEqual(await catalog(), before)
    await invoke('verify-live', { sessionId: opened.sessionId, presetId: plan.presetId })
    const reviewedDraft = { planName: plan.name, material, task: fresh.task }
    assert.deepEqual((await equipmentIn(host, opened.sessionId)).planTask, reviewedDraft)

    const method = 'agentPresets/select'
    const rpcId = randomUUID()
    const switched = await host.request('/api/' + method, {
      type: 'client-request', rpcId, method, payload: { args: { agentId: opened.sessionId, agentPreset: 'standard' } },
    })
    assert.equal(switched.rpcId, rpcId)
    assert.deepEqual(switched.result, { ok: true, value: 'standard' })
    const changed = await equipmentIn(host, opened.sessionId)
    assert.equal(changed.presetId, 'standard')
    assert.deepEqual(changed.planTask, { ...reviewedDraft, presetChanged: true })
    const changedNative = await history(opened.sessionId)
    assert.equal(changedNative.presetId, 'standard')
    assert.equal(changedNative.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset, 'standard')
    assert.deepEqual(changedNative.events.slice(0, existing.events.length), existing.events)
    const membersWithDraft = await membership(selected.workspaceId)

    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual((await equipmentIn(host, opened.sessionId)).planTask, { ...reviewedDraft, presetChanged: true })
    await restoreDraft(selected.sessionId, 422)
    await restoreDraft('session-a076' + '0'.repeat(28), 422)
    assert.deepEqual(await restoreDraft(opened.sessionId), { presetId: plan.presetId })
    const restoredDraft = await equipmentIn(host, opened.sessionId)
    assert.equal(restoredDraft.presetId, plan.presetId)
    assert.deepEqual(restoredDraft.planTask, reviewedDraft)
    const restoredNative = await history(opened.sessionId)
    assert.equal(restoredNative.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset, plan.presetId)
    assert.ok(!restoredNative.events.some(event => ['turn/start', 'user/message', 'tool/call'].includes(event.type)))
    assert.deepEqual(await membership(selected.workspaceId), membersWithDraft)
    assert.deepEqual(await catalog(), before)
    await invoke('verify-live', { sessionId: opened.sessionId, presetId: plan.presetId })

    const turn = host.request(turnEndpoint, { sessionId: opened.sessionId, text: opened.task, requestId: opened.requestId })
    turn.catch(() => {})
    const questionPath = '/api/loadout-fixture-handoff-question'
    let question
    try {
      for (let i = 0; i < 100 && !question; i++) {
        question = (await host.request(questionPath, { sessionId: opened.sessionId })).question
        if (!question) await delay(40)
      }
      assert.deepEqual(question?.options.map(item => item.label), ['Confirm handoff', 'Revise draft'])
      assert.ok(!(await history(opened.sessionId)).events.some(item => item.type === 'deliverables/presented'))
      await restoreDraft(opened.sessionId, 422)
    } finally {
      if (question) await host.request(questionPath, { sessionId: opened.sessionId, choice: 'Confirm handoff' })
      await turn
    }
    const played = await history(opened.sessionId)
    const sent = played.events.find(item => item.type === 'user/message' && item.data.source.kind === 'user')
    assert.equal(sent.data.content[0].text, fresh.task)
    assert.deepEqual(played.events.filter(item => item.type === 'tool/call').map(item => item.data.name), ['ask_user_question', 'present'])
    const delivery = played.events.find(item => item.type === 'deliverables/presented')
    assert.equal(delivery.data.files[0].path, join(resolved, material))
    assert.equal(await readFile(join(workspacePath, material), 'utf8'), content)
    assert.equal((await equipmentIn(host, opened.sessionId)).planTask, undefined)
    await restoreDraft(opened.sessionId, 422)
    assert.deepEqual(await membership(selected.workspaceId), membersWithDraft)
    assert.deepEqual((await catalog()).plans, before.plans)

    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual(await openTask(fields, fresh.token), opened)
    assert.deepEqual(new Set((await membership(selected.workspaceId)).sessionIds), new Set([selected.sessionId, opened.sessionId]))
    const restored = await history(opened.sessionId)
    assert.equal(restored.presetId, plan.presetId)
    assert.equal(restored.events.filter(item => item.type === 'turn/start').length, 1)
    assert.deepEqual((await catalog()).plans, before.plans)

    const standard = await invoke('plan-save', { name: 'Standard without extra gear', draft: { presetId: 'standard', equipmentIds: [] } })
    assert.equal(standard.presetId, 'standard')
    const standardFields = { ...fields, id: standard.id, revision: standard.revision, material: alternate }
    const standardPreview = await previewTask(standardFields)
    assert.ok(standardPreview.token)
    const standardTask = await openTask(standardFields, standardPreview.token, 'b'.repeat(32))
    assert.notEqual(standardTask.sessionId, opened.sessionId)
    assert.equal(standardTask.task, standardPreview.task)
    const standardHistory = await history(standardTask.sessionId)
    assert.equal(standardHistory.presetId, 'standard')
    assert.equal(standardHistory.workspaceId, selected.workspaceId)
    assert.ok(!standardHistory.events.some(item => item.type === 'turn/start' || item.type === 'user/message'))
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('workspace material browsing returns safe paths for plans and comparisons', { timeout: 75_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-workspace-materials-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const workspacePath = join(directory, 'workspace')
  const otherPath = join(directory, 'outside')
  const shelf = '交付 材料'
  const nested = shelf + '/复核 子目录'
  const archive = 'archive'
  const file = '候选 Evidence 2026.md'
  const original = nested + '/' + file
  const moved = nested + '/已移动 Evidence.md'
  const content = '# Private fixture body.\n'
  const pages = Array.from({ length: 141 }, (_, index) => `page-${String(index).padStart(3, '0')}.md`)
  let host
  try {
    for (const path of [join(workspacePath, nested), join(workspacePath, archive), join(otherPath, archive)]) {
      await mkdir(path, { recursive: true })
    }
    await writeFile(join(workspacePath, original), content)
    await writeFile(join(workspacePath, 'root-note.md'), '# Root workspace document\n')
    await writeFile(join(workspacePath, '.notes.md'), '# Hidden regular document\n')
    await writeFile(join(otherPath, 'outside.md'), '# Outside the selected workspace\n')
    await writeFile(join(otherPath, archive, pages[0]), '# Separate workspace archive\n')
    await Promise.all(pages.map(name => writeFile(join(workspacePath, archive, name), 'Page ' + name)))
    await symlink(join(workspacePath, nested), join(workspacePath, 'inside-directory'))
    await symlink(otherPath, join(workspacePath, 'outside-directory'))
    await symlink(join(workspacePath, original), join(workspacePath, 'inside-file.md'))
    await symlink(join(otherPath, 'outside.md'), join(workspacePath, 'outside-file.md'))
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const workspace = '/api/loadout-fixture-session'
    const { workspaceId, sessionId } = await host.request(workspace, { presetId: 'standard', workspacePath })
    const other = await host.request(workspace, { presetId: 'standard', workspacePath: otherPath })
    const list = (options, status) => invoke('workspace-materials', { workspaceId, ...options }, status)

    const root = await list({})
    assert.equal(root.directory, '')
    assert.deepEqual(new Set(root.entries.map(({ path, kind }) => `${kind}:${path}`)),
      new Set([`directory:${shelf}`, `directory:${archive}`, 'file:root-note.md', 'file:.notes.md']))
    assert.deepEqual(root.entries.map(item => item.kind), ['directory', 'directory', 'file', 'file'])
    assert.ok(!JSON.stringify(root).includes(workspacePath))
    const selectedDirectory = root.entries.find(item => item.name === shelf)
    const browseShelf = await list({ directory: selectedDirectory.path })
    assert.equal(browseShelf.directory, shelf)
    assert.deepEqual(browseShelf.entries, [{ name: '复核 子目录', path: nested, kind: 'directory' }])
    const browseNested = await list({ directory: browseShelf.entries[0].path })
    assert.equal(browseNested.directory, nested)
    assert.deepEqual(browseNested.entries, [{ name: file, path: original, kind: 'file' }])

    const found = await list({ query: 'ＥＶＩＤＥＮＣＥ ２０２６' })
    assert.deepEqual(found.entries, browseNested.entries)
    assert.deepEqual((await list({ directory: archive, query: 'EVIDENCE 2026' })).entries, [])
    assert.deepEqual((await list({ query: 'Private fixture body' })).entries, [])
    assert.deepEqual((await list({ query: 'outside.md' })).entries, [])
    assert.deepEqual((await list({ query: 'outside-file.md' })).entries, [])
    for (const invalid of ['../outside', workspacePath, 'inside-directory', 'outside-directory', 'inside-file.md', original]) {
      await list({ directory: invalid }, 422)
    }
    await list({ workspaceId: randomUUID() }, 422)
    await list({ cursor: '../' }, 422)
    await list({ query: 'a'.repeat(161) }, 422)

    const first = await list({ directory: archive })
    assert.equal(first.entries.length, 48)
    assert.equal(typeof first.next, 'string')
    assert.deepEqual((await list({ directory: archive })).entries, first.entries)
    await list({ directory: nested, cursor: first.next }, 422)
    await list({ directory: archive, query: 'page', cursor: first.next }, 422)
    await list({ workspaceId: other.workspaceId, directory: archive, cursor: first.next }, 422)
    async function readPages(firstPage, query) {
      const seen = []
      let page = firstPage
      for (let index = 0; index < 12; index++) {
        assert.equal(page.directory, archive)
        seen.push(...page.entries.map(entry => {
          assert.equal(entry.kind, 'file')
          assert.equal(entry.path, archive + '/' + entry.name)
          return entry.name
        }))
        if (!page.next) break
        page = await list({ directory: archive, query, cursor: page.next })
      }
      assert.equal(page.next, undefined)
      return seen
    }
    assert.deepEqual(await readPages(first), pages)
    const searchFirst = await list({ directory: archive, query: 'PAGE' })
    assert.ok(searchFirst.next)
    assert.deepEqual((await readPages(searchFirst, 'PAGE')).sort(), pages)
    assert.deepEqual((await host.request(workspace, { inspectWorkspaceId: workspaceId })).sessionIds, [sessionId])

    const sparseDir = join(otherPath, 'sparse')
    await mkdir(sparseDir)
    for (let start = 0; start < 480; start += 32) {
      const batch = Array.from({ length: 32 }, (_, index) => join(sparseDir, `ordinary-${start + index}.md`))
      await Promise.all(batch.map(path => writeFile(path, 'Ordinary file')))
    }
    await writeFile(join(sparseDir, 'z-late-match.md'), '# Match beyond the first scan')
    const sparseRequest = { workspaceId: other.workspaceId, directory: 'sparse', query: 'late-match' }
    const partial = await list(sparseRequest)
    assert.deepEqual(partial.entries, [])
    assert.equal(partial.searching, true)
    assert.ok(partial.next)
    const afterBudget = await list({ ...sparseRequest, cursor: partial.next })
    assert.deepEqual(afterBudget.entries, [{ name: 'z-late-match.md', path: 'sparse/z-late-match.md', kind: 'file' }])
    assert.equal(afterBudget.next, undefined)

    const playbook = await invoke('field-playbook-preview', { id: 'review' })
    const plan = await invoke('plan-save', { name: 'Review selected materials', draft: playbook.draft })
    const task = 'Check both handoff dates before presenting the chosen file.'
    const planInput = { id: plan.id, revision: plan.revision, workspaceId, material: found.entries[0].path, task }
    const preview = await invoke('plan-task-preview', planInput)
    assert.ok(preview.token)
    assert.equal(preview.material, original)
    await rename(join(workspacePath, original), join(workspacePath, moved))
    await invoke('plan-task-open', { ...planInput, token: preview.token, launchId: 'a'.repeat(32) }, 422)
    assert.deepEqual((await list({ query: 'EVIDENCE 2026' })).entries, [])
    const edited = await list({ query: '已移动' })
    assert.deepEqual(edited.entries, [{ name: '已移动 Evidence.md', path: moved, kind: 'file' }])
    const nextInput = { ...planInput, material: edited.entries[0].path }
    const nextPreview = await invoke('plan-task-preview', nextInput)
    assert.ok(nextPreview.token)
    assert.notEqual(nextPreview.token, preview.token)
    assert.ok(nextPreview.task.includes(task))
    assert.deepEqual(nextPreview.task.split('\n').slice(2), preview.task.split('\n').slice(2))
    const opened = await invoke('plan-task-open', { ...nextInput, token: nextPreview.token, launchId: 'a'.repeat(32) })
    assert.notEqual(opened.sessionId, sessionId)
    assert.equal(opened.workspaceId, workspaceId)
    assert.deepEqual((await equipmentIn(host, opened.sessionId)).planTask, { planName: plan.name, material: moved, task: nextPreview.task })

    const comparison = await invoke('workspace-comparison-open', { workspaceId, material: edited.entries[0].path, task,
      arm: 'direct', launchId: 'b'.repeat(32) })
    const board = await invoke('workspace-comparison', { comparisonId: comparison.id })
    assert.equal(board.material, moved)
    assert.equal(board.materialState, 'verified')
    assert.ok(comparison.task.includes(task))
    for (const attempt of [opened, comparison]) {
      const native = await host.request('/api/loadout-fixture-history?sessionId=' + attempt.sessionId)
      assert.equal(native.workspaceId, workspaceId)
      assert.ok(!native.events.some(event => event.type === 'turn/start' || event.type === 'user/message'))
    }
    assert.deepEqual((await host.request(workspace, { inspectWorkspaceId: other.workspaceId })).sessionIds, [other.sessionId])
    assert.equal(await readFile(join(workspacePath, moved), 'utf8'), content)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('saved plan comparisons pin two different native workflows on the same material', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-plan-comparison-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const workspacePath = join(directory, 'workspace')
  const material = 'materials/reuse-fixture.md'
  const content = '# Selected evidence for two saved plans\n'
  const task = 'Locate the source and hand it off if your workflow allows.'
  let host
  try {
    await mkdir(join(workspacePath, 'materials'), { recursive: true })
    await writeFile(join(workspacePath, material), content)
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const workspace = '/api/loadout-fixture-session'
    const history = sessionId => host.request('/api/loadout-fixture-history?sessionId=' + sessionId)
    const { workspaceId, sessionId } = await host.request(workspace, { presetId: 'standard', workspacePath })
    const membership = async () => (await host.request(workspace, { inspectWorkspaceId: workspaceId })).sessionIds
    const catalog = async () => {
      const { plans, saved, presets } = (await host.request(endpoint)).value
      return { plans, saved: saved.map(item => item.id), xp: presets.find(item => item.id === 'standard').rank?.xp ?? 0 }
    }
    const read = filters => invoke('plan-comparison', filters)
    const preview = (fields, status) => invoke('plan-comparison-preview', fields, status)
    const open = (fields, status) => invoke('plan-comparison-open', fields, status)
    const send = attempt => host.request(turnEndpoint, { sessionId: attempt.sessionId, requestId: attempt.requestId, text: attempt.task })
    const armOf = (view, id) => view.arms.find(arm => arm.id === id)
    const key = ({ id, revision }) => ({ id, revision })
    const { draft: direct } = await invoke('field-playbook-preview', { id: 'direct' })
    const { draft: review } = await invoke('field-playbook-preview', { id: 'review' })
    const scoutPlan = await invoke('plan-save', { name: 'Find source only', draft: { ...direct, equipmentIds: [] } })
    const oldReview = await invoke('plan-save', { name: 'Reviewed delivery', draft: review })
    const inputs = { plans: { left: key(scoutPlan), right: key(oldReview) }, workspaceId, material, task }
    const stale = await preview(inputs)
    assert.ok(stale.token)
    const launchId = 'a'.repeat(32)
    await appendFile(join(workspacePath, material), '\nChanged after the pair was previewed.\n')
    await open({ ...inputs, token: stale.token, arm: 'left', launchId }, 422)
    await writeFile(join(workspacePath, material), content)
    const reviewPlan = await invoke('plan-save', { ...key(oldReview), name: 'Reviewed delivery v2' })
    assert.notEqual(reviewPlan.revision, oldReview.revision)
    await open({ ...inputs, token: stale.token, arm: 'left', launchId }, 422)
    const fields = { ...inputs, plans: { ...inputs.plans, right: key(reviewPlan) } }
    const before = await catalog()
    const checked = await preview(fields)
    assert.ok(checked.token)
    assert.equal(checked.workspaceId, workspaceId)
    assert.equal(checked.workspaceTitle, 'Fixture workspace')
    assert.equal(checked.material, material)
    assert.match(checked.task, /^【出装任务】\n/u)
    assert.ok(checked.task.includes(task))
    assert.deepEqual(checked.arms.map(arm => [arm.id, arm.planName, arm.status]),
      [['left', scoutPlan.name, 'unopened'], ['right', reviewPlan.name, 'unopened']])
    assert.ok(checked.arms.every(arm => arm.heroName))
    assert.ok(armOf(checked, 'left').removed.includes('文件交付工具'))
    assert.ok(checked.comparison.gained.some(item => item.id === 'review'))
    assert.ok(!JSON.stringify(checked).includes(workspacePath))
    assert.deepEqual(await catalog(), before)
    assert.deepEqual(await membership(), [sessionId])
    assert.equal(await read({ sessionId }), null)

    const request = { ...fields, token: checked.token, arm: 'left', launchId }
    const [left, same] = await Promise.all([open(request), open(request)])
    assert.deepEqual(left, same)
    assert.equal(left.task, checked.task)
    assert.notEqual(left.sessionId, sessionId)
    const filter = { comparisonId: left.id }
    const openedLeft = await read(filter)
    assert.equal(openedLeft.evidenceRetestOutcome, undefined)
    assert.equal(armOf(openedLeft, 'left').status, 'waiting')
    assert.equal(armOf(openedLeft, 'right').status, 'unopened')
    const native = async (attempt, expected) => {
      const snapshot = await history(attempt.sessionId)
      assert.equal(snapshot.workspaceId, workspaceId)
      assert.equal(snapshot.workspacePath, await realpath(workspacePath))
      assert.equal(snapshot.presetId, expected.presetId)
      assert.equal(snapshot.inherited, 0)
      return snapshot
    }
    assert.ok(!(await native(left, scoutPlan)).events.some(event => ['turn/start', 'user/message'].includes(event.type)))
    assert.deepEqual(await catalog(), before)
    await send(left)
    const located = armOf(await read(filter), 'left')
    assert.equal(located.status, 'complete')
    assert.deepEqual(located.entries.map(item => [item.name, item.state]), [['glob', 'completed']])
    assert.ok(located.entries[0].sourceNames?.length)
    assert.deepEqual(located.deliverables, [])
    assert.equal(located.canReuse, true)
    const discovery = (await native(left, scoutPlan)).events.find(event => event.type === 'tool/result')
    assert.match(JSON.stringify(discovery.data.message.content), /reuse-fixture\.md/u)

    const renamedScout = await invoke('plan-save', { ...key(scoutPlan), name: 'Renamed source finder' })
    await appendFile(join(workspacePath, material), '\nChanged between launch arms.\n')
    assert.deepEqual(await open(request), left)
    await open({ ...filter, arm: 'right' }, 422)
    assert.equal(armOf(await read(filter), 'right').status, 'unopened')
    await writeFile(join(workspacePath, material), content)
    const right = await open({ ...filter, arm: 'right' })
    assert.equal(right.id, left.id)
    assert.equal(right.task, left.task)
    assert.notEqual(right.sessionId, left.sessionId)
    assert.notEqual(right.requestId, left.requestId)
    assert.ok(!(await native(right, reviewPlan)).events.some(event => ['turn/start', 'user/message'].includes(event.type)))
    assert.deepEqual(new Set(await membership()), new Set([sessionId, left.sessionId, right.sessionId]))

    const waiting = send(right)
    waiting.catch(() => {})
    const questionPath = '/api/loadout-fixture-handoff-question'
    let question
    try {
      for (let attempt = 0; attempt < 100 && !question; attempt++) {
        question = (await host.request(questionPath, { sessionId: right.sessionId })).question
        if (!question) await delay(40)
      }
      assert.deepEqual(question?.options.map(option => option.label), ['Confirm handoff', 'Revise draft'])
      const card = armOf(await read(filter), 'right')
      assert.equal(card.status, 'waiting-choice')
      assert.ok(!card.deliverables?.length)
    } finally {
      if (question) await host.request(questionPath, { sessionId: right.sessionId, choice: 'Confirm handoff' })
      await waiting
    }
    const complete = await read({ sessionId: right.sessionId })
    assert.equal(complete.evidenceRetestOutcome, undefined)
    await invoke('evidence-retest-note', { ...filter, arm: 'right' }, 422)
    await invoke('evidence-retest-note-save', { ...filter, arm: 'right', revision: reviewPlan.revision, note: 'An ordinary comparison' }, 422)
    const delivered = armOf(complete, 'right')
    assert.equal(delivered.status, 'complete')
    assert.deepEqual(delivered.entries.map(item => [item.name, item.state]), [['ask_user_question', 'completed'], ['present', 'completed']])
    assert.deepEqual(delivered.entries[0].choices, ['Confirm handoff'])
    assert.deepEqual(delivered.deliverables, [{ name: 'reuse-fixture.md', turn: 1 }])
    assert.equal(armOf(complete, 'left').planName, scoutPlan.name)
    assert.equal(delivered.planName, reviewPlan.name)
    for (const attempt of [left, right]) {
      const replay = await history(attempt.sessionId)
      const submitted = replay.events.find(item => item.type === 'user/message' && item.data.source.kind === 'user')
      assert.equal(submitted.data.content[0].text, checked.task)
    }
    const rightReplay = await native(right, reviewPlan)
    const file = rightReplay.events.find(event => event.type === 'deliverables/presented').data.files[0]
    assert.equal(file.path, join(await realpath(workspacePath), material))

    const list = () => invoke('comparison-history', { kind: 'plans', query: 'reuse-fixture.md' })
    const listed = await list()
    assert.equal(listed.items.length, 1)
    assert.equal(listed.items[0].id, left.id)
    assert.equal(listed.items[0].kind, 'plans')
    assert.equal(armOf(listed.items[0], 'left').sessionId, left.sessionId)
    assert.deepEqual(armOf(listed.items[0], 'right').choices, ['Confirm handoff'])
    const priorPlans = (await catalog()).plans
    const reuse = arm => invoke('comparison-loadout-preview', { kind: 'plans', ...filter, arm })
    const scoutReuse = await reuse('left')
    assert.equal(scoutReuse.sessionId, left.sessionId)
    assert.deepEqual(scoutReuse.draft.equipmentIds, [])
    assert.deepEqual(scoutReuse.draft.removedEquipmentIds, direct.removedEquipmentIds)
    const reviewReuse = await reuse('right')
    assert.equal(reviewReuse.sessionId, right.sessionId)
    assert.deepEqual(new Set(reviewReuse.draft.equipmentIds), new Set(['review', 'present']))
    assert.deepEqual((await catalog()).plans, priorPlans)

    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual(await read(filter), complete)
    assert.deepEqual(await list(), listed)
    assert.deepEqual(await open(request), left)
    assert.deepEqual(await open({ ...filter, arm: 'right' }), right)

    const pendingFields = { ...fields, plans: { left: key(renamedScout), right: key(reviewPlan) } }
    const pending = await preview(pendingFields)
    const pendingPair = await open({ ...pendingFields, token: pending.token, arm: 'left', launchId: 'b'.repeat(32) })
    const renamedReview = await invoke('plan-save', { ...key(reviewPlan), name: 'Renamed reviewed delivery' })
    await open({ comparisonId: pendingPair.id, arm: 'right' }, 422)
    assert.equal(armOf(await read({ comparisonId: pendingPair.id }), 'right').status, 'unopened')
    assert.deepEqual(await open({ ...filter, arm: 'right' }), right)

    const foreign = await invoke('plan-save', { name: 'Alternate hero', draft: { presetId: 'fixture-spare-kit', equipmentIds: [] } })
    const crossHeroFields = { ...fields, plans: { left: key(renamedReview), right: key(foreign) } }
    const crossHero = await preview(crossHeroFields)
    assert.equal(crossHero.comparison.before.id, 'standard')
    assert.equal(crossHero.comparison.after.id, 'fixture-spare-kit')
    const alternate = await open({ ...crossHeroFields, token: crossHero.token, arm: 'right', launchId: 'c'.repeat(32) })
    const alternateNative = await native(alternate, foreign)
    assert.equal(alternateNative.presetId, 'fixture-spare-kit')
    assert.ok(!alternateNative.events.some(event => ['turn/start', 'user/message'].includes(event.type)))
    const alternateTools = await host.request('/api/loadout-fixture-tools?id=fixture-spare-kit')
    assert.ok(!alternateTools.includes('present'))
    assert.equal(await readFile(join(workspacePath, material), 'utf8'), content)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('one-gear rematches retain the proved original and require another native turn', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-rematch-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  const workspacePath = join(directory, 'workspace')
  const material = 'materials/workspace-fixture.md'
  const body = '# Original evidence for a one-gear rematch\n'
  const task = 'Verify the handoff summary and deliver the original material when ready.'
  let host
  try {
    await mkdir(join(workspacePath, 'materials'), { recursive: true })
    await writeFile(join(workspacePath, material), body)
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const workspace = '/api/loadout-fixture-session'
    const { workspaceId, sessionId } = await host.request(workspace, { presetId: 'standard', workspacePath })
    const membership = async () => (await host.request(workspace, { inspectWorkspaceId: workspaceId })).sessionIds
    const plans = async () => (await host.request(endpoint)).value.plans
    const history = id => host.request('/api/loadout-fixture-history?sessionId=' + id)
    const evidence = async id => (await history(id)).events.filter(event =>
      ['turn/start', 'turn/end', 'user/message', 'tool/call', 'tool/result', 'deliverables/presented'].includes(event.type))
    const send = attempt => host.request(turnEndpoint, { sessionId: attempt.sessionId, requestId: attempt.requestId, text: attempt.task })
    const armOf = (view, arm) => view.arms.find(item => item.id === arm)
    const start = await invoke('workspace-comparison-open', { arm: 'direct', launchId: 'a'.repeat(32), workspaceId, material, task })
    const root = { kind: 'workspace', comparisonId: start.id, arm: 'direct' }
    const source = () => invoke('workspace-comparison', { comparisonId: start.id })
    const options = status => invoke('rematch-comparison-options', root, status)
    const preview = (change, status) => invoke('rematch-comparison-preview', { ...root, change }, status)
    const change = { addId: 'review' }
    const open = (token, suffix, status) => invoke('rematch-comparison-open', { ...root, change, token, launchId: suffix.repeat(32) }, status)
    const read = filter => invoke('rematch-comparison', filter)
    await options(422)
    await send(start)
    const original = await source()
    const proof = armOf(original, 'direct')
    assert.equal(proof.status, 'complete')
    assert.deepEqual(proof.entries.map(item => [item.name, item.state]), [['present', 'completed']])
    assert.deepEqual(proof.deliverables, [{ name: 'workspace-fixture.md', turn: 1 }])
    const originalEvents = await evidence(start.sessionId)
    const beforePlans = await plans()
    const before = new Set(await membership())
    assert.deepEqual(before, new Set([sessionId, start.sessionId]))
    const choices = await options()
    assert.equal(choices.baseline.sessionId, start.sessionId)
    assert.ok(choices.equipped.some(item => item.id === 'present'))
    assert.ok(!choices.equipped.some(item => item.id === 'review'))
    assert.ok(choices.available.some(item => item.id === 'review'))
    for (const invalid of [{}, { addId: 'unknown-gear' }, { addId: 'present' }, { removeId: 'review' }, { removeId: 'present', addId: 'present' }]) {
      await preview(invalid, 422)
    }
    const sourceTool = choices.available.find(item => item.kind === 'tool' && item.sources?.length &&
      !choices.equipped.some(equipped => equipped.id === item.id))
    assert.ok(sourceTool)
    await preview({ addId: sourceTool.id, sourceId: 'plugin:' + 'f'.repeat(24) }, 422)
    const removal = await preview({ removeId: 'present' })
    assert.ok(removal.token)
    assert.equal(removal.change.removed.id, 'present')
    assert.equal(removal.change.added, undefined)
    assert.ok(removal.comparison.lost.some(item => item.id === 'present' || item.name === 'present'))
    const allowed = await preview(change)
    assert.ok(allowed.token)
    assert.equal(allowed.change.added.id, 'review')
    assert.equal(allowed.change.removed, undefined)
    assert.ok(allowed.comparison.gained.some(item => item.id === 'review'))
    const swapped = await preview({ removeId: 'present', addId: 'review' })
    assert.ok(swapped.token)
    assert.equal(swapped.change.removed.id, 'present')
    assert.equal(swapped.change.added.id, 'review')
    assert.deepEqual(await plans(), beforePlans)
    assert.deepEqual(new Set(await membership()), before)

    await appendFile(join(workspacePath, material), '\nModified after review preview.\n')
    await preview(change, 422)
    await open(allowed.token, 'b', 422)
    assert.deepEqual(new Set(await membership()), before)
    await writeFile(join(workspacePath, material), body)

    const refreshed = await preview(change)
    const [attempt, equal] = await Promise.all([open(refreshed.token, 'b'), open(refreshed.token, 'b')])
    assert.deepEqual(attempt, equal)
    assert.equal(attempt.task, start.task)
    assert.notEqual(attempt.sessionId, start.sessionId)
    assert.notEqual(attempt.requestId, start.requestId)
    assert.deepEqual(new Set(await membership()), new Set([...before, attempt.sessionId]))
    const repeatFrom = { kind: 'rematch', comparisonId: attempt.id, arm: 'rematch' }
    await invoke('rematch-comparison-options', repeatFrom, 422)
    const current = await read({ comparisonId: attempt.id })
    assert.equal(armOf(current, 'baseline').sessionId, start.sessionId)
    assert.deepEqual(armOf(current, 'baseline').deliverables, proof.deliverables)
    assert.equal(armOf(current, 'rematch').status, 'waiting')
    const clean = await history(attempt.sessionId)
    const resolved = await realpath(workspacePath)
    assert.equal(clean.workspacePath, resolved)
    assert.equal(clean.workspaceId, workspaceId)
    assert.equal(clean.inherited, 0)
    assert.notEqual(clean.presetId, (await history(start.sessionId)).presetId)
    assert.ok(!clean.events.some(event => ['turn/start', 'user/message'].includes(event.type)))
    const marker = (await equipmentIn(host, attempt.sessionId)).rematchComparison
    assert.deepEqual({ id: marker.id, arm: marker.arm, task: marker.task }, { id: attempt.id, arm: 'rematch', task: start.task })

    const questionPath = '/api/loadout-fixture-handoff-question'
    async function choose(attempt, answer, valid = true) {
      const turn = send(attempt)
      turn.catch(() => {})
      let question
      try {
        for (let count = 0; count < 100 && !question; count++) {
          question = (await host.request(questionPath, { sessionId: attempt.sessionId })).question
          if (!question) await delay(40)
        }
        assert.deepEqual(question?.options.map(item => item.label), ['Confirm handoff', 'Revise draft'])
        if (valid) {
          const waiting = armOf(await read({ comparisonId: attempt.id }), 'rematch')
          assert.equal(waiting.status, 'waiting-choice')
          assert.ok(!waiting.deliverables?.length)
        }
      } finally {
        if (question) await host.request(questionPath, { sessionId: attempt.sessionId, choice: answer })
        await turn
      }
      const replay = await history(attempt.sessionId)
      const message = replay.events.find(item => item.type === 'user/message' && item.data.source.kind === 'user')
      assert.equal(message.data.content[0].text, start.task)
      return replay.events.find(item => item.type === 'deliverables/presented')
    }
    assert.equal((await choose(attempt, 'Confirm handoff')).data.files[0].path, join(resolved, material))
    const complete = await read({ sessionId: attempt.sessionId })
    const plusReview = armOf(complete, 'rematch')
    assert.equal(plusReview.status, 'complete')
    assert.deepEqual(plusReview.entries.map(item => [item.name, item.state]), [['ask_user_question', 'completed'], ['present', 'completed']])
    assert.deepEqual(plusReview.entries[0].choices, ['Confirm handoff'])
    assert.deepEqual(plusReview.deliverables, proof.deliverables)
    assert.equal(plusReview.canRematch, true)
    assert.ok(!armOf(complete, 'baseline').canRematch)
    assert.deepEqual(complete.previous, { ...root, sessionId: start.sessionId })
    assert.deepEqual(armOf(await source(), 'direct'), proof)
    const reviewEvents = await evidence(attempt.sessionId)

    const revised = await open(refreshed.token, 'c')
    assert.equal(await choose(revised, 'Revise draft'), undefined)
    const notDelivered = armOf(await read({ comparisonId: revised.id }), 'rematch')
    assert.deepEqual(notDelivered.entries[0].choices, ['Revise draft'])
    assert.deepEqual(notDelivered.deliverables, [])

    const tampered = await open(refreshed.token, 'd')
    await appendFile(join(workspacePath, material), '\nModified after the fresh session opened.\n')
    assert.deepEqual(await open(refreshed.token, 'b'), attempt)
    assert.ok(await choose(tampered, 'Confirm handoff', false))
    const stale = await read({ comparisonId: tampered.id })
    assert.equal(armOf(stale, 'rematch').status, 'unavailable')
    assert.equal(armOf(stale, 'rematch').reason, 'changed-material')
    assert.ok(!armOf(stale, 'rematch').deliverables?.length)
    assert.deepEqual(armOf(stale, 'baseline').deliverables, proof.deliverables)
    await writeFile(join(workspacePath, material), body)
    assert.deepEqual(armOf(await read({ comparisonId: tampered.id }), 'rematch'), armOf(stale, 'rematch'))
    await invoke('rematch-comparison-options', { ...repeatFrom, comparisonId: tampered.id }, 422)
    await invoke('rematch-comparison-options', { ...repeatFrom, arm: 'baseline' }, 422)

    const nextChoices = await invoke('rematch-comparison-options', repeatFrom)
    assert.equal(nextChoices.baseline.sessionId, attempt.sessionId)
    assert.ok(nextChoices.equipped.some(item => item.id === 'review'))
    const nextInput = { ...repeatFrom, change: { removeId: 'review' } }
    const nextPreview = await invoke('rematch-comparison-preview', nextInput)
    assert.equal(nextPreview.task, start.task)
    assert.equal(nextPreview.material, material)
    assert.equal(nextPreview.change.removed.id, 'review')
    assert.ok(nextPreview.comparison.lost.some(item => item.id === 'review'))
    const nextOpen = (token, status) => invoke('rematch-comparison-open',
      { ...nextInput, token, launchId: 'e'.repeat(32) }, status)
    const beforeNext = await membership()
    await appendFile(join(workspacePath, material), '\nModified before opening the next round.\n')
    await invoke('rematch-comparison-preview', nextInput, 422)
    await nextOpen(nextPreview.token, 422)
    assert.deepEqual(await membership(), beforeNext)
    await writeFile(join(workspacePath, material), body)

    const checkedAgain = await invoke('rematch-comparison-preview', nextInput)
    const [second, secondRetry] = await Promise.all([nextOpen(checkedAgain.token), nextOpen(checkedAgain.token)])
    assert.deepEqual(second, secondRetry)
    assert.equal(second.task, start.task)
    assert.equal(new Set([start.sessionId, attempt.sessionId, second.sessionId]).size, 3)
    assert.deepEqual(new Set(await membership()), new Set([...beforeNext, second.sessionId]))
    const secondNative = await history(second.sessionId)
    assert.equal(secondNative.workspaceId, workspaceId)
    assert.equal(secondNative.workspacePath, resolved)
    assert.equal(secondNative.inherited, 0)
    assert.ok(!secondNative.events.some(event => ['turn/start', 'user/message'].includes(event.type)))
    await send(second)
    const secondEvents = await evidence(second.sessionId)
    const repeatedTask = secondEvents.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    assert.equal(repeatedTask.data.content[0].text, start.task)
    assert.deepEqual(secondEvents.filter(event => event.type === 'tool/call').map(event => event.data.name), ['present'])
    assert.equal(secondEvents.find(event => event.type === 'deliverables/presented').data.files[0].path, join(resolved, material))
    const secondResult = await read({ sessionId: second.sessionId })
    const secondArm = armOf(secondResult, 'rematch')
    assert.equal(secondArm.canRematch, true)
    assert.ok(!armOf(secondResult, 'baseline').canRematch)
    assert.deepEqual(secondArm.deliverables, proof.deliverables)
    assert.deepEqual(armOf(secondResult, 'baseline').entries, plusReview.entries)
    assert.deepEqual(secondResult.previous, { ...repeatFrom, sessionId: attempt.sessionId, change: complete.change })
    assert.deepEqual(await evidence(start.sessionId), originalEvents)
    assert.deepEqual(await evidence(attempt.sessionId), reviewEvents)

    const list = () => invoke('comparison-history', { kind: 'rematch', query: 'workspace-fixture.md' })
    const listed = await list()
    assert.deepEqual(new Set(listed.items.map(item => item.id)), new Set([attempt.id, revised.id, tampered.id, second.id]))
    const historyCard = listed.items.find(item => item.id === attempt.id)
    assert.equal(historyCard.kind, 'rematch')
    assert.deepEqual(historyCard.previous, complete.previous)
    assert.equal(complete.evidenceOutcome, undefined)
    await invoke('evidence-replay-plan-save', { comparisonId: attempt.id, arm: 'baseline', name: 'Ordinary rematch' }, 422)
    assert.deepEqual(listed.items.find(item => item.id === second.id).previous, secondResult.previous)
    assert.equal(armOf(historyCard, 'baseline').sessionId, start.sessionId)
    assert.deepEqual(armOf(historyCard, 'rematch').choices, ['Confirm handoff'])
    const evidenceScope = { scope: 'evidence-replays', kind: 'rematch', query: 'workspace-fixture.md' }
    assert.deepEqual(await invoke('comparison-history', { ...evidenceScope, probe: true }), { available: false })
    assert.deepEqual(await invoke('comparison-history', evidenceScope), { items: [] })
    const reuse = (arm, comparisonId = attempt.id, status) => invoke('comparison-loadout-preview', { kind: 'rematch', comparisonId, arm }, status)
    const reusedBaseline = await reuse('baseline')
    assert.equal(reusedBaseline.sessionId, start.sessionId)
    assert.deepEqual(reusedBaseline.draft.equipmentIds, ['present'])
    const reusedReview = await reuse('rematch')
    assert.equal(reusedReview.sessionId, attempt.sessionId)
    assert.deepEqual(new Set(reusedReview.draft.equipmentIds), new Set(['present', 'review']))
    await reuse('rematch', tampered.id, 422)
    const reuseSecond = await reuse('rematch', second.id)
    assert.equal(reuseSecond.sessionId, second.sessionId)
    assert.deepEqual(reuseSecond.draft.equipmentIds, ['present'])
    assert.deepEqual(await plans(), beforePlans)
    const saved = await invoke('plan-save', { name: 'Round after removing Review', draft: reuseSecond.draft })
    assert.equal(saved.presetId, secondNative.presetId)
    assert.ok((await plans()).some(item => item.id === saved.id))

    await host.stop()
    host = await startHost(env, patch)
    assert.deepEqual(await read({ comparisonId: attempt.id }), complete)
    assert.deepEqual(await read({ comparisonId: second.id }), secondResult)
    assert.deepEqual(await list(), listed)
    assert.deepEqual(await open(refreshed.token, 'b'), attempt)
    assert.deepEqual(await nextOpen(checkedAgain.token), second)
    assert.deepEqual((await reuse('rematch', second.id)).draft, reuseSecond.draft)
    assert.deepEqual(armOf(await source(), 'direct'), proof)
    assert.equal(await readFile(join(workspacePath, material), 'utf8'), body)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('shared plans resolve in a fresh profile without saving or copying private equipment', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-share-'))
  const root = await realpath(directory)
  const senderDir = join(root, 'sender')
  const receiverDir = join(root, 'receiver')
  const senderEnv = { ...process.env, DSH_HOME: join(senderDir, 'home') }
  const receiverEnv = { ...process.env, DSH_HOME: join(receiverDir, 'home') }
  const patch = join(directory, 'fixture.yml')
  let sender
  let receiver
  try {
    await Promise.all([mkdir(senderDir), mkdir(receiverDir)])
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    const publishFixture = async name => {
      const source = join(directory, name)
      await mkdir(source)
      await writeFile(join(source, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module',
        exports: { '.': './index.mjs', './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
      await writeFile(join(source, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'fixture-share-provider', name }] }]))
      await writeFile(join(source, 'index.mjs'), `
        export const inject = ['tools', 'agentLoadoutToolOrigins']
        export function apply(ctx) {
          ctx.tools.register({
            name: 'fixture_equal_schema',
            description: 'Return the installed fixture provider marker.',
            parameters: {},
            output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
            async execute() { return ${JSON.stringify(name)} },
          })
        }
      `)
      const { stdout } = await exec('npm', ['pack', '--silent', '--ignore-scripts', '--pack-destination', directory], { cwd: source })
      return join(directory, stdout.trim())
    }
    const packageAction = (action, spec, cwd, env) => exec(binary,
      ['plugin', '--profile', 'web', action, '-w', '--store-dir=' + join(cwd, 'store'), spec], { cwd, env })
    const senderPackage = 'dsh-fixture-share-north'
    const receiverPackage = 'dsh-fixture-share-south'
    const [senderTarball, receiverTarball] = await Promise.all([publishFixture(senderPackage), publishFixture(receiverPackage)])
    await Promise.all([
      installProfile(senderDir, senderEnv).then(() => packageAction('add', senderTarball, senderDir, senderEnv)),
      installProfile(receiverDir, receiverEnv).then(() => packageAction('add', receiverTarball, receiverDir, receiverEnv)),
    ])
    const prior = { id: randomUUID(), revision: randomUUID(), name: 'Prior Standard plan', note: '', heroId: 'standard',
      heroName: '标准模式', presetId: 'standard', updatedAt: 1 }
    const plansDir = join(senderEnv.DSH_HOME, 'profiles/web/agent-loadouts/plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, prior.id + '.json'), JSON.stringify(prior))
    sender = await startHost(senderEnv, patch)
    receiver = await startHost(receiverEnv, patch)
    const invoke = async (host, action, payload, status) => (await host.request(endpoint, { action, ...payload }, status)).value
    const catalog = async host => (await host.request(endpoint)).value
    const state = async host => {
      const { saved, plans } = await catalog(host)
      return { saved, plans }
    }
    const encode = (plan, revision = plan.revision, status) =>
      invoke(sender, 'plan-share-export', { id: plan.id, revision }, status)
    const decode = (code, status) => invoke(receiver, 'plan-share-preview', { code }, status)
    const options = (code, slot, query, status) =>
      invoke(receiver, 'plan-share-options', { code, slot, query }, status)
    const adapt = (code, choices, status) => invoke(receiver, 'plan-share-adapt', { code, choices }, status)

    const { draft } = await invoke(sender, 'field-playbook-preview', { id: 'review' })
    const review = await invoke(sender, 'plan-save', { name: 'Reviewed delivery', draft })
    assert.ok((await catalog(sender)).plans.some(plan => plan.id === prior.id))
    const earlierCode = await encode(prior)
    assert.ok(earlierCode.code)
    assert.deepEqual((await decode(earlierCode.code)).draft.equipmentIds, [])

    const bundleHero = await invoke(sender, 'plan-save', { name: 'Bundle hero plan',
      draft: { presetId: 'recruiting-advisor', equipmentIds: [] } })
    const bundleShare = await encode(bundleHero)
    assert.ok(bundleShare.code, JSON.stringify(bundleShare))
    const bundled = await decode(bundleShare.code)
    assert.equal(bundled.hero.sourceName, 'dsh-agent-loadout')
    assert.equal(bundled.draft?.presetId, 'recruiting-advisor')

    const standard = (await catalog(sender)).presets.find(item => item.id === 'standard')
    const [presentSlot] = Object.entries(standard.builtIn).find(([, equipment]) => equipment.tools.includes('present'))
    const alternate = await invoke(sender, 'plan-save', { name: 'Minimal with native preview',
      draft: { presetId: 'minimal', equipmentIds: [presentSlot] } })
    const alternateShare = await encode(alternate)
    assert.ok(alternateShare.code, JSON.stringify(alternateShare))
    const next = await decode(alternateShare.code)
    assert.equal(next.draft?.presetId, 'minimal')
    assert.ok(next.draft.equipmentIds.every(id => id.startsWith('plugin:')))
    assert.ok(next.comparison.gained.some(item => item.kind === 'tool' && item.name === 'present'))

    const receiverBefore = await state(receiver)
    const senderBefore = await state(sender)
    await encode(review, randomUUID(), 422)
    const exported = await encode(review)
    assert.match(exported.code, /^DSHH1\.[A-Za-z0-9_-]+$/)
    assert.ok(exported.host)
    await decode('not a share code', 422)
    await decode(exported.code.slice(0, -5), 422)
    const portable = JSON.parse(Buffer.from(exported.code.slice('DSHH1.'.length), 'base64url').toString('utf8'))
    const shareText = value => 'DSHH1.' + Buffer.from(JSON.stringify(value)).toString('base64url')
    await decode('DSHH9.' + exported.code.slice('DSHH1.'.length), 422)
    await decode(shareText({ ...portable, config: { command: './private-equipment.mjs' } }), 422)
    await decode(shareText({ ...portable, dependencies: [{ package: 'file:/tmp/unreviewed', version: '1.0.0' }] }), 422)
    const repeatedKey = '{"name":"Unexpected",' + JSON.stringify(portable).slice(1)
    await decode('DSHH1.' + Buffer.from(repeatedKey).toString('base64url'), 422)
    const extraCompanion = { kind: 'preset', hero: portable.hero, entry: 'unrecognized-companion' }
    const altered = await decode(shareText({ ...portable, companions: [...portable.companions, extraCompanion] }))
    assert.equal(altered.blocked, true)
    assert.equal(altered.draft, undefined)
    assert.ok(altered.dependencies.some(item => item.name === extraCompanion.entry && item.state === 'different'))
    const oldRecipe = JSON.parse(Buffer.from(earlierCode.code.slice('DSHH1.'.length), 'base64url').toString('utf8'))
    const foreignHero = { ...oldRecipe.hero, owner: { package: 'different-standard-owner', version: '1.0.0' } }
    const unresolved = await decode(shareText({ ...oldRecipe, hero: foreignHero }))
    assert.equal(unresolved.draft, undefined)
    assert.ok(unresolved.blocked || unresolved.reason)
    const preview = await decode(exported.code)
    assert.equal(preview.name, review.name)
    assert.ok(preview.draft)
    assert.equal(preview.draft.presetId, 'standard')
    assert.deepEqual([...preview.draft.equipmentIds].sort(), ['present', 'review'])
    const receiverReview = await invoke(receiver, 'field-playbook-preview', { id: 'review' })
    assert.deepEqual(preview.draft.removedEquipmentIds, receiverReview.draft.removedEquipmentIds)
    assert.deepEqual(new Set(preview.gear.map(item => item.operation)), new Set(['equip', 'remove']))
    assert.deepEqual(preview.comparison.gained.find(item => item.id === 'review').decisions.map(([label]) => label),
      ['确认交付', '退回修改'])

    const oldVersion = '0.0.0'
    const olderHero = { ...portable.hero, owner: { ...portable.hero.owner, version: oldVersion } }
    const versionCode = shareText({ ...portable, hero: olderHero,
      gear: portable.gear.map(item => item.operation === 'remove' ? { ...item, source: { ...item.source, hero: olderHero } } : item),
      dependencies: portable.dependencies.map(item => ({ ...item, version: oldVersion })),
    })
    const versionMismatch = await decode(versionCode)
    assert.equal(versionMismatch.blocked, true)
    assert.ok(versionMismatch.adaptation?.hero)
    const removedSlot = versionMismatch.adaptation.slots.find(item => item.operation === 'remove').slot
    const versionOptions = await options(versionCode, removedSlot)
    const localRemoval = versionOptions.choices.find(item => receiverReview.draft.removedEquipmentIds.includes(item.id))
    assert.ok(localRemoval)
    const localVersions = await adapt(versionCode, [{ slot: removedSlot, id: localRemoval.id }])
    assert.equal(localVersions.adapted, true)
    assert.deepEqual([...localVersions.draft.equipmentIds].sort(), [...receiverReview.draft.equipmentIds].sort())
    assert.deepEqual(localVersions.draft.removedEquipmentIds, receiverReview.draft.removedEquipmentIds)
    assert.ok(localVersions.dependencyChanges.some(item => item.previousVersion === oldVersion &&
      item.version === portable.hero.owner.version && item.state === 'changed'))

    const missingRemovalCode = shareText({ ...portable, gear: portable.gear.map(item => item.operation === 'remove'
      ? { ...item, source: { ...item.source, entry: 'missing-old-present-slot' } } : item) })
    const missingRemoval = await decode(missingRemovalCode)
    const oldSlot = missingRemoval.adaptation.slots.find(item => item.operation === 'remove').slot
    const previewSlot = portable.gear.findIndex(item => item.id === 'present')
    const conflicting = await adapt(missingRemovalCode, [{ slot: oldSlot, skip: true }, { slot: previewSlot, id: 'present' }])
    assert.equal(conflicting.blocked, true)
    assert.equal(conflicting.draft, undefined)
    assert.match(conflicting.reason, /无法核对要保留的自带装备/)
    const retained = await adapt(missingRemovalCode, [{ slot: oldSlot, skip: true }, { slot: previewSlot, skip: true }])
    assert.deepEqual(retained.draft.equipmentIds, ['review'])
    assert.deepEqual(retained.draft.removedEquipmentIds, [])

    assert.deepEqual(await state(receiver), receiverBefore)
    assert.deepEqual(await state(sender), senderBefore)

    const adopted = await invoke(receiver, 'plan-save', { name: preview.name, draft: preview.draft })
    assert.notEqual(adopted.id, review.id)
    assert.equal(adopted.heroId, 'standard')
    const { plans: receiverPlans, saved: receiverBuilds } = await state(receiver)
    assert.ok(receiverPlans.some(plan => plan.id === adopted.id))
    assert.ok(receiverBuilds.some(build => build.id === adopted.presetId))
    const tools = await receiver.request('/api/loadout-fixture-tools?id=' + adopted.presetId)
    assert.equal(tools.filter(name => name === 'present').length, 1)
    assert.ok(tools.includes('ask_user_question'))

    await writeFile(join(senderDir, 'private-equipment.mjs'), 'export function apply() {}\n')
    const privateInput = { title: 'Local equipment', directory: senderDir, text: JSON.stringify({
      name: './private-equipment.mjs', config: { token: 'fixture-private-config-value' },
    }) }
    const checked = await invoke(sender, 'equipment-review', privateInput)
    await invoke(sender, 'equipment-save', { ...privateInput, reviewedId: checked.id })
    const privatePlan = await invoke(sender, 'plan-save', { name: 'Local-only plan',
      draft: { presetId: 'standard', equipmentIds: [checked.id] } })
    const refused = await encode(privatePlan)
    assert.equal(refused.code, undefined)
    assert.ok(refused.blockers?.length)
    assert.ok(!JSON.stringify(refused).includes('fixture-private-config-value'))
    assert.ok(!JSON.stringify(refused).includes(senderDir))

    async function installedTool(host) {
      const { equipment, presets } = await catalog(host)
      const tool = equipment.find(item => item.name === 'fixture_equal_schema')
      assert.ok(tool)
      const standard = presets.find(item => item.id === 'standard')
      const sourceId = standard.tools[tool.id].includedBy
      assert.match(sourceId, /^profile:[a-f0-9]{24}$/)
      return { id: tool.id, sourceId }
    }
    const source = await installedTool(sender)
    const unrelated = await installedTool(receiver)
    assert.equal(source.id, unrelated.id)
    assert.notEqual(source.sourceId, unrelated.sourceId)
    const foreignPlan = await invoke(sender, 'plan-save', { name: 'Verified publisher',
      draft: { presetId: 'standard', equipmentIds: [source.id], equipmentSources: { [source.id]: source.sourceId } } })
    const foreignShare = await encode(foreignPlan)
    assert.ok(foreignShare.code, JSON.stringify(foreignShare.blockers))
    const external = JSON.parse(Buffer.from(foreignShare.code.slice('DSHH1.'.length), 'base64url').toString('utf8'))
    assert.deepEqual(external.gear[0].source.owner, { package: senderPackage, version: '1.0.0' })
    const beforeExternal = await state(receiver)
    const receiverManifest = join(receiverEnv.DSH_HOME, 'profiles/web/package.json')
    const installedPackages = await readFile(receiverManifest, 'utf8')
    const missing = await decode(foreignShare.code)
    assert.equal(missing.draft, undefined)
    assert.equal(missing.blocked, true)
    assert.ok(missing.dependencies.some(item => item.name === senderPackage && item.state === 'missing'))
    assert.ok(missing.gear.some(item => item.name === 'fixture_equal_schema' && item.state === 'different'))
    const row = missing.adaptation.slots.find(item => item.name === 'fixture_equal_schema')
    assert.ok(row?.required)
    const { slot } = row
    const alternatives = await options(foreignShare.code, slot, 'fixture_equal_schema')
    assert.equal(alternatives.canSkip, true)
    const recommended = alternatives.choices.find(item => item.id === unrelated.id && item.sourceId === unrelated.sourceId)
    assert.ok(recommended, JSON.stringify(alternatives))
    assert.equal(recommended.version, '1.0.0')
    assert.ok(recommended.sourceName)
    const changedSchema = shareText({ ...external, gear: external.gear.map(item => ({ ...item, schema: 'tool:ffffffffffff' })) })
    const interfaceChange = (await options(changedSchema, slot, 'fixture_equal_schema')).choices.find(item =>
      item.id === unrelated.id && item.sourceId === unrelated.sourceId)
    assert.match(interfaceChange?.note, /接口有变化/)
    assert.deepEqual((await options(foreignShare.code, slot, 'no-matching-fixture-name')).choices, [])
    await options(foreignShare.code, -1, '', 422)
    const unresolvedChoice = await adapt(foreignShare.code, [])
    assert.equal(unresolvedChoice.draft, undefined)
    assert.ok(unresolvedChoice.blocked || unresolvedChoice.unresolved?.length)
    const choice = { slot, id: unrelated.id, sourceId: unrelated.sourceId }
    await adapt(foreignShare.code, [{ ...choice, sourceId: source.sourceId }], 422)
    await adapt(foreignShare.code, [choice, choice], 422)
    await adapt(foreignShare.code, [{ ...choice, skip: true }], 422)
    const skipped = await adapt(foreignShare.code, [{ slot, skip: true }])
    assert.equal(skipped.adapted, true)
    assert.deepEqual(skipped.draft?.equipmentIds, [])
    assert.ok(skipped.dependencyChanges.some(item => item.name === senderPackage && item.state === 'removed'))
    const repaired = await adapt(foreignShare.code, [choice])
    assert.equal(repaired.adapted, true)
    assert.ok(repaired.comparison)
    assert.deepEqual(repaired.draft?.equipmentSources, { [unrelated.id]: unrelated.sourceId })
    assert.ok(repaired.changes?.length)
    assert.ok(repaired.dependencyChanges.some(item => item.name === senderPackage && item.state === 'removed'))
    assert.ok(repaired.dependencyChanges.some(item => item.name === receiverPackage && item.state === 'added'))
    const workflow = (await options(foreignShare.code, slot, '确认交付')).choices.find(item => item.id === 'review')
    assert.deepEqual(workflow?.decisions.map(([label]) => label), ['确认交付', '退回修改'])
    const revised = await adapt(foreignShare.code, [{ slot, id: workflow.id }])
    assert.deepEqual(revised.draft?.equipmentIds, ['review'])
    const reviewEffect = revised.comparison.gained.find(item => item.id === 'review')
    assert.deepEqual(reviewEffect?.decisions.map(([label]) => label), ['确认交付', '退回修改'])
    const deliverable = await adapt(foreignShare.code, [{ slot, id: 'present' }])
    assert.deepEqual(deliverable.draft?.removedEquipmentIds, receiverReview.draft.removedEquipmentIds)
    assert.equal(deliverable.additionalRemovals.length, 1)
    assert.deepEqual(await state(receiver), beforeExternal)
    assert.equal(await readFile(receiverManifest, 'utf8'), installedPackages)

    const localPlan = await invoke(receiver, 'plan-save', { name: 'Local replacement', draft: repaired.draft })
    const localSession = await receiver.request('/api/loadout-fixture-session', { presetId: localPlan.presetId })
    await invoke(receiver, 'verify-live', { sessionId: localSession.sessionId, presetId: localPlan.presetId })
    const reshared = await invoke(receiver, 'plan-share-export', { id: localPlan.id, revision: localPlan.revision })
    const localRecipe = JSON.parse(Buffer.from(reshared.code.slice('DSHH1.'.length), 'base64url').toString('utf8'))
    assert.deepEqual(localRecipe.gear[0].source.owner, { package: receiverPackage, version: '1.0.0' })
    assert.equal((await decode(foreignShare.code)).blocked, true)

    await receiver.stop()
    await packageAction('remove', receiverPackage, receiverDir, receiverEnv)
    await packageAction('add', senderTarball, receiverDir, receiverEnv)
    receiver = await startHost(receiverEnv, patch)
    const local = await installedTool(receiver)
    assert.notEqual(local.sourceId, source.sourceId)
    const resolved = await decode(foreignShare.code)
    assert.equal(resolved.draft?.equipmentSources[local.id], local.sourceId)
    assert.ok(resolved.dependencies.some(item => item.name === senderPackage && item.state === 'ready'))
    const imported = await invoke(receiver, 'plan-save', { name: resolved.name, draft: resolved.draft })
    const { sessionId } = await receiver.request('/api/loadout-fixture-session', { presetId: imported.presetId })
    await invoke(receiver, 'verify-live', { sessionId, presetId: imported.presetId })
  } finally {
    await Promise.all([sender?.stop(), receiver?.stop()])
    await rm(directory, { recursive: true, force: true })
  }
})

test('equips independent modules imported from an archive and a Git repository', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-remote-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home') }
  const patch = join(directory, 'fixture.yml')
  let host
  let registry
  try {
    registry = await startMarket(directory)
    await createGitModule(directory, registry.moduleDir)
    await writeFile(patch, JSON.stringify([{ insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') }] }]))
    await installProfile(directory, env)
    host = await startHost(env, patch)
    const invoke = async (action, payload) => (await host.request(endpoint, { action, ...payload })).value
    const equipmentIds = []
    for (const [kind, spec, name] of [['tarball', registry.moduleTarball, moduleName], ['git', registry.gitModule, gitModuleName]]) {
      const source = await invoke('plugin-review', { spec })
      assert.equal(source.kind, kind)
      const installed = await invoke('plugin-import', { source })
      assert.equal(installed.module, name)
      assert.equal(installed.version, moduleVersion)
      if (installed.application === 'restart-required') {
        await host.stop()
        host = await startHost(env, patch)
      }
      const catalog = (await host.request(endpoint)).value
      const card = catalog.equipment.find(item => item.kind === 'module' && item.module === name)
      assert.equal(card?.version, moduleVersion)
      const input = { title: name, text: JSON.stringify({ name: card.module, config: { marker: 'sky' } }) }
      const reviewed = await invoke('equipment-review', input)
      await invoke('equipment-save', { ...input, reviewedId: reviewed.id })
      equipmentIds.push(reviewed.id)
    }
    const profile = join(env.DSH_HOME, 'profiles', 'web')
    const snapshot = () => Promise.all(['package.json', 'pnpm-lock.yaml', 'node_modules/' + moduleName + '/package.json']
      .map(file => readFile(join(profile, file), 'utf8')))
    const installedProfile = await snapshot()
    const duplicate = await invoke('plugin-review', { spec: registry.duplicateModule })
    const rejected = await host.request(endpoint, { action: 'plugin-import', source: duplicate }, 422)
    assert.match(rejected.error.message, /无法确认这次安装只添加了一个新模块。/)
    assert.deepEqual(await snapshot(), installedProfile)
    const manifest = JSON.parse(installedProfile[0])
    for (const name of [moduleName, gitModuleName]) {
      assert.ok(manifest.dependencies[name])
      assert.ok(!manifest.dsh.profile.bundles.includes(name))
    }
    const presetId = 'recruiting-advisor'
    const composed = (await host.request(endpoint, { presetId, equipmentIds })).value
    const equipped = await host.request('/api/loadout-fixture-session', { presetId: composed.presetId })
    const items = await equipmentIn(host, equipped.sessionId)
    for (const id of equipmentIds) assert.ok(items.plugins.some(plugin => plugin.id === id && plugin.state === 'ready'))
    const base = await host.request('/api/loadout-fixture-session', { presetId })
    const plain = await equipmentIn(host, base.sessionId)
    for (const name of ['standalone_skymark', 'git_skymark']) {
      assert.ok(items.tools.some(tool => tool.name === name && tool.state === 'ready'))
      assert.ok(!plain.tools.some(tool => tool.name === name))
    }
    await host.request(turnEndpoint, { sessionId: equipped.sessionId, text: '核对独立模块的标记' })
    const report = await invoke('match-report', { sessionId: equipped.sessionId })
    const called = report.turns[0].entries.filter(item => item.state === 'completed')
    assert.deepEqual(called.map(item => item.name), ['standalone_skymark', 'git_skymark'])
    const [receipt] = await invoke('match-settlements', { sessionId: equipped.sessionId })
    for (const id of equipmentIds) assert.ok(receipt.awards.some(item => item.id === id && item.xp > 0))
    const input = { title: '星标摘要', text: JSON.stringify({ name: moduleName, config: { marker: 'sky', variant: 'summary' } }) }
    const reviewed = await invoke('equipment-review', input)
    await invoke('equipment-save', { ...input, reviewedId: reviewed.id })
    const alternative = (await host.request(endpoint, { presetId, equipmentIds: [reviewed.id] })).value
    const alternativeSession = await host.request('/api/loadout-fixture-session', { presetId: alternative.presetId })
    const alternativeItems = await equipmentIn(host, alternativeSession.sessionId)
    assert.ok(alternativeItems.tools.some(tool => tool.name === 'standalone_summary' && tool.state === 'ready'))
    assert.ok(!alternativeItems.tools.some(tool => tool.name === 'standalone_skymark'))
    const otherDirectory = join(directory, 'other-module')
    await cp(registry.moduleDir, otherDirectory, { recursive: true })
    const externalInput = { title: '另一份星标模块', directory: otherDirectory,
      text: JSON.stringify({ name: './index.mjs', config: { marker: 'sky' } }) }
    const external = await invoke('equipment-review', externalInput)
    await invoke('equipment-save', { ...externalInput, reviewedId: external.id })
    function checkModuleLinks({ equipment }) {
      const byId = new Map(equipment.map(item => [item.id, item]))
      const module = byId.get('module:' + moduleName)
      const git = byId.get('module:' + gitModuleName)
      assert.deepEqual(new Set(module.moduleConfigurations), new Set([equipmentIds[0], reviewed.id]))
      assert.deepEqual(git.moduleConfigurations, [equipmentIds[1]])
      assert.ok(byId.has(external.id))
      assert.equal(byId.get(external.id).installedModules, undefined)
      for (const [id, source, name] of [[equipmentIds[0], module, 'standalone_skymark'],
        [equipmentIds[1], git, 'git_skymark'], [reviewed.id, module, 'standalone_summary']]) {
        const gear = byId.get(id)
        assert.deepEqual(gear.installedModules, [source.id])
        assert.deepEqual(gear.providedTools.map(link => byId.get(link.id).name), [name])
      }
    }
    checkModuleLinks((await host.request(endpoint)).value)
    await host.stop()
    host = await startHost(env, patch)
    const restarted = (await host.request(endpoint)).value
    checkModuleLinks(restarted)
    for (const id of equipmentIds) assert.ok(restarted.equipment.find(item => item.id === id)?.rank?.xp > 0)
    assert.ok(registry.requests.includes('/equipment.git/git-upload-pack'))
  } finally {
    await host?.stop()
    await registry?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

async function waitForTool(host, sessionId, name, state = 'ready') {
  for (let attempt = 0; attempt < 80; attempt++) {
    const { tools } = await equipmentIn(host, sessionId)
    if (tools.some(tool => tool.name === name && tool.state === state)) return
    await delay(50)
  }
  assert.fail(name + ' did not reach ' + state + ' during the turn')
}

async function waitForContinuation(host, sessionId, state) {
  let continuation
  for (let attempt = 0; attempt < 100; attempt++) {
    continuation = (await equipmentIn(host, sessionId)).continuation
    if (continuation?.state === state || continuation?.state === 'failed') break
    await delay(50)
  }
  assert.equal(continuation?.state, state, continuation?.error)
  return continuation
}

async function startHost(env, patch, profile = 'web') {
  const child = spawn(binary, [profile, '--patch', patch, '--no-open', '--port', '0'], { env })
  let logs = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', chunk => { logs += chunk })
  }
  let stopped = false
  async function stop() {
    if (stopped) return
    stopped = true
    if (child.exitCode !== null || child.signalCode !== null) return
    const closed = once(child, 'close')
    child.kill()
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000)
    try {
      await closed
    } finally {
      clearTimeout(timer)
    }
  }
  const limit = Date.now() + 30_000
  try {
    let announcement
    while (!announcement && child.exitCode === null && Date.now() < limit) {
      announcement = logs.match(/^dsh web: (\S+)/m)?.[1]
      if (!announcement) await delay(40)
    }
    assert.ok(announcement, logs.replace(/https?:\/\/[^\s]+/g, '[URL]'))
    assert.doesNotMatch(logs, /entry did not activate/)
    const base = new URL(announcement)
    const response = await fetch(base, { redirect: 'manual' })
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)

    function requestRaw(path, options = {}) {
      return fetch(new URL(path, base), { ...options, headers: { cookie, origin: base.origin, ...options.headers } })
    }
    async function request(path, payload, status = 200) {
      const response = await requestRaw(path, payload === undefined ? undefined : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.text()
      assert.equal(response.status, status, path + '\n' + body + '\n' + logs.replace(/https?:\/\/[^\s]+/g, '[URL]'))
      return JSON.parse(body)
    }
    return { request, requestRaw, stop }
  } catch (error) {
    await stop()
    throw error
  }
}

test('executor tools retain their source in loadouts, mastery, shortcuts and published actions', { timeout: 60_000 }, async t => {
  const { stdout: version } = await exec(binary, ['--version'])
  if (!['0.2.2-rc.1', '0.2.2-rc.2'].includes(version.trim())) return t.skip('This fixture requires the scoped executor runtime')
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-profile-executor-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  await exec(binary, ['plugin', '--profile', 'web', 'add', '-w', packagePath], { env, cwd: directory })
  const publisher = 'fixture-program-provider'
  const moveName = '抽查批量结果'
  const programProvider = join(directory, publisher)
  const executorModule = join(programProvider, 'program-executor.mjs')
  await mkdir(programProvider)
  await writeFile(join(programProvider, 'package.json'), JSON.stringify({ name: publisher, version: '1.0.0', type: 'module',
    exports: './program-executor.mjs', dsh: { loadout: { actions: { tools: { run_code: [
      { id: 'sample-batch', name: moveName, instruction: '抽查工作区文本文件，列出样本和待复核项。', requiresInput: true },
    ] } } } } }))
  await writeFile(executorModule, `
    import { createRequire } from 'node:module'
    import { pathToFileURL } from 'node:url'
    export const inject = ['tools', 'systemPrompt', 'ptcRuntime', 'pluginPackages']
    export async function apply(ctx) {
      const native = ctx.pluginPackages.packageOf('@deepseek-ai/dsh-tool-executor-ptc', ctx.baseUrl)
      const { apply } = await import(pathToFileURL(createRequire(native.manifestPath).resolve(native.name)).href)
      apply(ctx, {})
    }
  `)
  await writeFile(patch, JSON.stringify([
    { id: 'tool-executor-native', disabled: true },
    { insert: [{ id: 'loadout-fixture', name: join(fixtures, 'preset.mjs') },
      { id: 'profile-program-executor', name: executorModule }] },
  ]))
  let host = await startHost(env, patch)
  try {
    const { value: catalog } = await host.request(endpoint)
    const tool = catalog.equipment.find(item => item.name === 'run_code' && item.transport)
    const profile = catalog.equipment.find(item => item.kind === 'host' && item.module.endsWith('/program-executor.mjs') && item.enabled)
    assert.ok(profile)
    const ptc = catalog.presets.find(hero => hero.id === 'ptc')
    const standing = ptc.tools[tool.id]
    const root = standing.sourceChoices.find(choice => choice.sourceId.startsWith('profile:'))
    assert.match(root.sourceName, /profile-program-executor/)
    assert.equal(root.packageMoves[0][0], moveName)
    assert.deepEqual(root.replacement.remove, [standing.includedBy])
    const inherit = catalog.presets.find(hero => hero.id === 'recruiting-advisor').tools[tool.id]
    assert.equal(inherit.includedBy, root.sourceId)

    const draft = { presetId: ptc.id, equipmentIds: [tool.id], equipmentSources: { [tool.id]: root.sourceId } }
    await host.request(endpoint, draft, 422)
    const removedEquipmentIds = root.replacement.remove
    const { value: opening } = await host.request(endpoint, { action: 'growth-opening-choices', draft: { ...draft, removedEquipmentIds } })
    assert.ok(opening.choices.find(item => item.id === tool.id).trialActions.some(move => move.name === moveName))
    const compared = (await host.request(endpoint, { action: 'compare', presetId: ptc.id, equipmentIds: [], removedEquipmentIds })).value
    const change = compared.sourceChanges.find(item => item.id === tool.id)
    assert.equal(change.fromSourceId, standing.includedBy)
    assert.equal(change.sourceId, root.sourceId)
    assert.deepEqual(change.gainedDecisions, [[moveName, '']])
    assert.deepEqual(change.gainedDecisionTrials, [opening.choices.find(item => item.id === tool.id).trialActions.find(move => move.name === moveName).key])
    assert.deepEqual([change.trialGear.id, change.trialGear.sourceId], [tool.id, root.sourceId])
    assert.equal(change.lostDecisions, undefined)
    assert.equal(change.decisionKeys, undefined)

    const { value: build } = await host.request(endpoint, { ...draft, removedEquipmentIds })
    const opened = await host.request('/api/loadout-fixture-session', { presetId: build.presetId })
    await host.request(endpoint, { action: 'verify-live', ...opened, presetId: build.presetId })
    const { sessionId } = opened
    const current = (await equipmentIn(host, sessionId)).tools.find(item => item.id === tool.id)
    assert.equal(current.state, 'ready')
    assert.equal(current.artSourceId, root.sourceId)
    assert.equal(current.sourceName, root.sourceName)
    const reverting = (await host.request(endpoint, { action: 'compare', presetId: ptc.id, equipmentIds: [], sourceSessionId: sessionId })).value
    assert.equal(reverting.live, true)
    const restoredSource = reverting.sourceChanges.find(item => item.id === tool.id)
    assert.equal(restoredSource.fromSourceId, root.sourceId)
    assert.deepEqual(restoredSource.lostDecisions, [[moveName, '']])
    assert.equal(restoredSource.gainedDecisions, undefined)
    assert.equal(restoredSource.gainedDecisionTrials, undefined)
    await host.request(turnEndpoint, { sessionId, text: 'fixture ptc partial' })
    const { value: [round] } = await host.request(endpoint, { action: 'match-settlements', sessionId })
    const award = round.awards.find(item => item.id === tool.id)
    assert.equal(award.xp, 8)
    assert.equal(award.sourceMastery.sourceId, root.sourceId)
    assert.equal(round.awards.find(item => item.id === profile.id).xp, 4)
    assert.ok(!round.awards.some(item => item.id === standing.includedBy))
    const { value: report } = await host.request(endpoint, { action: 'match-report', sessionId })
    const call = report.turns[0].entries.find(item => item.id === tool.id)
    assert.equal(call.state, 'completed')
    assert.equal(call.sourceId, root.sourceId)

    async function publishedAction(id) {
      const snapshot = await equipmentIn(host, id)
      const skill = snapshot.skills.find(item => item.kind === 'gear' && item.id === tool.id)
      const move = skill.actions.find(action => action.name === moveName)
      assert.equal(move?.publisher, publisher)
      return { targetKind: 'gear', targetId: tool.id, moveId: move.id, revision: move.revision, input: '只核对文本文件' }
    }
    async function recordAction(id, selection, status = 200) {
      const requestId = randomUUID()
      const { value } = await host.request(endpoint, { action: 'match-record', sessionId: id, requestId, ...selection }, status)
      return { requestId, text: value?.text }
    }
    const selection = await publishedAction(sessionId)
    const { value: growth } = await host.request(endpoint, { action: 'match-growth', sessionId, includeChoices: true })
    const trialActionKey = growth.choices.find(item => item.id === tool.id).trialActions.find(move => move.name === moveName).key
    const { value: quest } = await host.request(endpoint, { action: 'growth-accept', sessionId, mode: 'trial', gearId: tool.id,
      trialActionKey, title: '抽查工作区文本' })
    const submission = await recordAction(sessionId, { ...selection, questId: quest.id })
    assert.match(submission.text, /抽查工作区文本文件/)
    await host.request(turnEndpoint, { sessionId, ...submission })
    await host.request(endpoint, { action: 'growth-claim', sessionId, id: quest.id })
    const { value: [trialReceipt, trialRound] } = await host.request(endpoint, { action: 'match-settlements', sessionId })
    assert.equal(trialReceipt.trialAction.name, moveName)
    assert.equal(trialReceipt.awards.find(item => item.id === tool.id).xp, 32)
    assert.ok(trialRound.awards.find(item => item.id === tool.id).activity.some(item => item.kind === 'action' && item.name === moveName))

    const changed = await host.request('/api/loadout-fixture-session', { presetId: build.presetId, runtimePlugin: 'session-ptc' })
    await host.request(endpoint, { action: 'verify-live', ...changed, presetId: build.presetId }, 422)
    const conflict = (await equipmentIn(host, changed.sessionId)).tools.find(item => item.id === tool.id)
    assert.equal(conflict.state, 'conflict')
    await host.request(turnEndpoint, { sessionId: changed.sessionId, text: 'fixture ptc partial' })
    const { value: [changedRound] } = await host.request(endpoint, { action: 'match-settlements', sessionId: changed.sessionId })
    assert.ok(!changedRound.awards.some(item => item.id === tool.id || item.id === profile.id))

    const openHero = id => host.request('/api/loadout-fixture-session', { presetId: id })
    const currentTool = async id => (await equipmentIn(host, id)).tools.find(item => item.name === tool.name)
    const changePin = (id, item, remove = false) => host.request(endpoint, { action: 'match-shortcut',
      sessionId: id, itemId: item.id, shortcutKey: item.shortcutKey, remove })
    const recordPin = async (id, item, status = 200) => {
      const requestId = randomUUID()
      const result = await host.request(endpoint, { action: 'match-record', sessionId: id, toolId: item.id,
        shortcutKey: item.shortcutKey, requestId, input: '查找工作区文本文件' }, status)
      return { requestId, text: result.value?.text }
    }
    const pinnedTool = async id => (await equipmentIn(host, id)).pinned.find(item => item.id === tool.id)
    const shortcutTurn = async (id, submission, outcome) => {
      await host.request(turnEndpoint, { sessionId: id, ...submission })
      const { value } = await host.request(endpoint, { action: 'match-report', sessionId: id })
      const entries = value.turns[0].entries
      assert.equal(entries[0].label, '使用快捷装备')
      assert.equal(entries.find(entry => entry.name === 'run_code').state, outcome)
      assert.equal(entries.some(entry => entry.nested), outcome === 'completed')
    }

    const heroExecutor = (await openHero(ptc.id)).sessionId
    const heroTool = await currentTool(heroExecutor)
    assert.match(heroTool.shortcutKey, /^scoped:/)
    await changePin(heroExecutor, heroTool)
    await shortcutTurn(heroExecutor, await recordPin(heroExecutor, heroTool), 'completed')

    const profileSession = (await openHero('recruiting-advisor')).sessionId
    const profileTool = await currentTool(profileSession)
    assert.equal(profileTool.shortcutKey, root.sourceId)
    await changePin(profileSession, profileTool)
    await shortcutTurn(profileSession, await recordPin(profileSession, profileTool), 'completed')
    await host.request(turnEndpoint, { sessionId: profileSession, checkpoint: true })
    await host.stop()
    host = await startHost(env, patch)
    await host.request(turnEndpoint, { sessionId: profileSession, selectOnly: true })
    assert.equal((await pinnedTool(profileSession)).state, 'ready')
    const executorContinuation = (await host.request(endpoint, { action: 'continue', sourceSessionId: profileSession, presetId: ptc.id })).value
    const executorCarry = (await equipmentIn(host, executorContinuation.sessionId)).shortcutCarry.find(item => item.id === tool.id)
    assert.equal(executorCarry.shortcutKey, root.sourceId)
    assert.equal(executorCarry.state, 'conflict')
    assert.equal(executorCarry.canCarry, false)
    const skipExecutorCarry = { action: 'match-shortcut-carry', sessionId: executorContinuation.sessionId, selected: [] }
    assert.equal((await host.request(endpoint, skipExecutorCarry)).value.shortcutCarry, undefined)
    assert.equal((await pinnedTool(profileSession)).state, 'ready')
    const restored = (await host.request(endpoint)).value.saved.find(item => item.id === build.presetId)
    assert.equal(restored?.equipmentSources[tool.id], root.sourceId)
    const restoredSession = (await openHero(build.presetId)).sessionId
    await host.request(endpoint, { action: 'verify-live', sessionId: restoredSession, presetId: build.presetId })
    assert.equal((await currentTool(restoredSession)).artSourceId, root.sourceId)

    const acceptRelay = async (sessionId, sourceId) => (await host.request(endpoint, {
      action: 'growth-accept', sessionId, mode: 'relay', gearId: tool.id, questSources: { [tool.id]: sourceId }, title: '接力核对文本',
    })).value
    const relay = await acceptRelay(restoredSession, root.sourceId)
    const relayPreview = async (sessionId, questId, draft, status) => (await host.request(endpoint, {
      action: 'relay-loadout-preview', sessionId, questId, draft,
    }, status)).value
    const savedBeforeRelay = (await host.request(endpoint)).value.saved.map(item => item.id)
    const ptcDraft = { presetId: ptc.id, equipmentIds: ['evidence'] }
    const repair = await relayPreview(restoredSession, relay.id, ptcDraft)
    assert.equal(repair.wrongSource, true)
    assert.equal(repair.ready, false)
    assert.deepEqual(repair.repair.draft.equipmentIds, ['evidence', tool.id])
    assert.equal(repair.repair.draft.equipmentSources[tool.id], root.sourceId)
    assert.ok(repair.repair.removed.includes(ptc.builtIn[standing.includedBy].name))
    assert.equal((await relayPreview(restoredSession, relay.id, repair.repair.draft)).ready, true)
    assert.equal((await relayPreview(restoredSession, relay.id, { presetId: 'recruiting-advisor', equipmentIds: [] })).ready, true)
    await relayPreview(restoredSession, randomUUID(), ptcDraft, 422)

    await host.request(turnEndpoint, { sessionId: heroExecutor, selectOnly: true })
    const ownRelay = await acceptRelay(heroExecutor, standing.includedBy)
    const restore = await relayPreview(heroExecutor, ownRelay.id, { presetId: build.presetId, equipmentIds: [] })
    assert.equal(restore.wrongSource, true)
    assert.deepEqual(restore.repair.draft, { presetId: ptc.id, equipmentIds: [], equipmentSources: {}, removedEquipmentIds: [] })
    assert.deepEqual(restore.repair.restored, [ptc.builtIn[standing.includedBy].name])
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), savedBeforeRelay)

    const queued = await recordPin(profileSession, profileTool)
    const sourceAction = await publishedAction(profileSession)
    const queuedAction = await recordAction(profileSession, sourceAction)
    const feed = await host.requestRaw(endpoint + '/session-events?' + new URLSearchParams({ sessionId: profileSession }),
      { signal: AbortSignal.timeout(5000) })
    assert.equal(feed.status, 200)
    const events = feed.body.getReader()
    try {
      await events.read()
      await host.request('/api/loadout-fixture-shadow', { sessionId: profileSession, mode: 'executor' })
      assert.match(new TextDecoder().decode((await events.read()).value), /data: changed/)
    } finally {
      await events.cancel()
    }
    assert.equal((await pinnedTool(profileSession)).state, 'conflict')
    await recordPin(profileSession, profileTool, 422)
    await recordAction(profileSession, sourceAction, 422)
    await host.request(turnEndpoint, { sessionId: profileSession, ...queuedAction })
    const { value: blockedReport } = await host.request(endpoint, { action: 'match-report', sessionId: profileSession })
    const blocked = blockedReport.turns[0].entries
    assert.equal(blocked[0].label, moveName)
    assert.equal(blocked.find(item => item.name === tool.name).state, 'conflict')
    assert.ok(!blocked.some(item => item.nested))
    await shortcutTurn(profileSession, queued, 'conflict')
    await changePin(profileSession, profileTool, true)
    const sessionTool = await currentTool(profileSession)
    assert.match(sessionTool.shortcutKey, /^scoped:/)
    assert.notEqual(sessionTool.shortcutKey, heroTool.shortcutKey)
    await changePin(profileSession, sessionTool)
    await shortcutTurn(profileSession, await recordPin(profileSession, sessionTool), 'completed')
  } finally {
    await host.stop()
  }
})

test('contracts open, carry and settle against native session evidence', { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-relay-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    const external = join(directory, 'fixtures')
    const localPackage = join(external, 'node_modules', 'local-contributor')
    await cp(fixtures, external, { recursive: true })
    await mkdir(localPackage, { recursive: true })
    await writeFile(join(localPackage, 'package.json'), JSON.stringify({ name: 'local-contributor', type: 'module',
      exports: { '.': './tools.mjs', './package.json': './package.json' } }))
    await cp(join(external, 'local-module.mjs'), join(localPackage, 'tools.mjs'))
    const legacyModule = join(external, 'legacy-equipment')
    await mkdir(legacyModule)
    const toolsRequirement = '>=0.1.0-rc.1 <0.2.0-0'
    await writeFile(join(legacyModule, 'package.json'), JSON.stringify({ name: 'legacy-equipment', version: '1.0.0', type: 'module',
      peerDependencies: { '@deepseek-ai/dsh-tools': toolsRequirement } }))
    await writeFile(join(legacyModule, 'index.mjs'), 'export function apply() { throw new Error("Incompatible test equipment was activated") }\n')
    await writeFile(patch, JSON.stringify([{ insert: [
      { id: 'loadout-fixture', name: join(external, 'preset.mjs') },
      { id: 'legacy-preset', name: '@deepseek-ai/dsh-agent-preset', config: {
        id: 'legacy-directory', name: '旧版档案助手', plugins: [
          { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: '核对档案。', suffix: 'LEGACY PRESET CWD {{cwd}}' } },
          { id: 'legacy-gear', name: join(legacyModule, 'index.mjs') },
        ],
      } },
    ] }]))
    await installProfile(directory, env)
    const progressDir = join(env.DSH_HOME, 'profiles', 'web', 'agent-loadouts')
    const progressFile = join(progressDir, 'progress.json')
    await mkdir(progressDir, { recursive: true })
    await writeFile(progressFile, JSON.stringify({ version: 1, heroes: {}, gear: {}, sessions: {},
      recent: [{ id: 'legacy-quest', sessionId: 'old-match', title: '历史试炼', quest: true, time: 1,
        awards: [{ id: 'evidence', name: '证据核验', kind: 'featured', xp: 24, level: 2 }] }] }))
    host = await startHost(env, patch)
    const invoke = async (action, sessionId, extra, status) =>
      (await host.request(endpoint, { action, sessionId, ...extra }, status)).value
    const view = sessionId => invoke('match-growth', sessionId)
    const journal = () => invoke('growth-journal')
    const readUntil = async (sessionId, check) => {
      let value
      for (let attempt = 0; attempt < 80; attempt++) {
        value = await view(sessionId)
        if (check(value)) return value
        await delay(50)
      }
      assert.fail('Expected quest state was not reached: ' + JSON.stringify(value.quest))
    }
    const continuation = async (sourceSessionId, presetId) =>
      (await invoke('continue', undefined, { sourceSessionId, presetId })).sessionId
    const finish = (sessionId, text) => host.request(turnEndpoint, { sessionId, text })
    const catalog = (await host.request(endpoint)).value
    const legacy = catalog.presets.find(preset => preset.id === 'legacy-directory')
    assert.ok(legacy && !legacy.broken, legacy?.broken ?? 'Legacy preset was not discovered')
    assert.equal(legacy.gearCompatibility.length, 1)
    const [limited] = legacy.gearCompatibility
    const [issue] = limited.compatibility
    assert.equal(issue.name, 'legacy-equipment')
    assert.equal(issue.version, '1.0.0')
    assert.deepEqual(issue.requirements, { '@deepseek-ai/dsh-tools': toolsRequirement })
    assert.equal(legacy.tools[limited.id].state, 'unavailable')
    assert.ok(!legacy.builtIn[limited.id])
    assert.deepEqual(catalog.equipment.find(item => item.id === limited.id).compatibility, [issue])

    const legacyWorkspace = join(directory, 'legacy-workspace')
    const nested = join(legacyWorkspace, 'archive')
    await mkdir(nested, { recursive: true })
    const { sessionId: legacySession } = await host.request('/api/loadout-fixture-session', { presetId: legacy.id, workspacePath: legacyWorkspace })
    await finish(legacySession, '读取预设工作目录')
    await readUntil(legacySession, value => value.recent[0]?.turn === 1)
    await host.request(turnEndpoint, { sessionId: legacySession, workingDirectory: nested })
    await finish(legacySession, '读取预设工作目录')
    const legacyGrowth = await readUntil(legacySession, value => value.recent[0]?.turn === 2)
    assert.equal(legacyGrowth.hero.xp, 24)
    const legacyLog = await host.request('/api/loadout-fixture-history?' + new URLSearchParams({ sessionId: legacySession }))
    const output = legacyLog.events.filter(event => event.type === 'assistant/message').flatMap(event => event.data.message.content)
      .filter(block => block.type === 'text').map(block => block.text)
    assert.deepEqual(output, [await realpath(legacyWorkspace), await realpath(nested)])

    const legacyRoot = join(env.DSH_HOME, '.agent-presets')
    const importedSource = join(legacyRoot, 'legacy-archive')
    const nativeSource = join(legacyRoot, legacy.id)
    await Promise.all([mkdir(importedSource, { recursive: true }), mkdir(nativeSource, { recursive: true })])
    const metaFile = join(importedSource, 'preset.yml')
    const compositionFile = join(importedSource, 'agent.cordis.yml')
    const missingModule = './removed-provider.mjs'
    const waitingModule = './waiting.mjs'
    const persona = { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: '核对旧档案。' } }
    const recoveredGroup = { id: 'legacy-resources', name: 'cordis:group', group: true, isolate: { legacyArchiveProvider: true },
      config: [{ id: 'removed-provider', name: missingModule }, { id: 'waiting', name: waitingModule }] }
    await Promise.all([
      writeFile(metaFile, 'name: 旧版档案馆\n'),
      writeFile(join(nativeSource, 'preset.yml'), 'name: 不应覆盖原生定义\n'),
      writeFile(compositionFile, JSON.stringify([persona, { id: 'archives', name: './archives.mjs' }, recoveredGroup])),
      writeFile(join(importedSource, 'record.txt'), 'approved local archive'),
      writeFile(join(importedSource, 'waiting.mjs'), `export const inject = ['tools', 'legacyArchiveProvider']
        export function apply(ctx) {
          ctx.tools.register({ name: 'legacy_recovered', description: 'Read the restored legacy archive.', parameters: {},
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute() { return ctx.legacyArchiveProvider } })
        }`),
      writeFile(join(importedSource, 'archives.mjs'), `import { readFile } from 'node:fs/promises'
        export const inject = ['tools']
        export function apply(ctx) {
          ctx.tools.register({ name: 'legacy_lookup', description: 'Read the legacy archive.', parameters: {},
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute() { return readFile(new URL('./record.txt', import.meta.url), 'utf8') } })
        }`),
    ])
    const importedId = 'legacy-archive'
    const candidates = await invoke('legacy-presets')
    assert.equal(candidates.find(item => item.id === legacy.id).registered, true)
    assert.equal(candidates.find(item => item.id === importedId).registered, false)
    const beforeImport = await invoke('legacy-preset-preview', undefined, { id: importedId })
    assert.deepEqual(beforeImport.missing, [missingModule])
    assert.ok(!(await host.request(endpoint)).value.presets.some(item => item.id === importedId))
    await invoke('legacy-preset-preview', undefined, { id: '../escape' }, 422)
    await invoke('legacy-preset-attach', undefined, { id: importedId, revision: beforeImport.revision }, 422)
    await writeFile(metaFile, 'name: 旧版档案馆\ndescription: 来自已有工作目录\n')
    await invoke('legacy-preset-attach', undefined, { id: importedId, revision: beforeImport.revision, skipMissing: true }, 422)
    const currentImport = await invoke('legacy-preset-preview', undefined, { id: importedId })
    const attached = await invoke('legacy-preset-attach', undefined, { id: importedId, revision: currentImport.revision, skipMissing: true })
    assert.equal(attached.broken, undefined)
    assert.deepEqual(attached.skipped, [missingModule, waitingModule])
    assert.equal((await invoke('legacy-preset-attach', undefined, { id: importedId, revision: currentImport.revision })).alreadyRegistered, true)
    const importedCatalog = (await host.request(endpoint)).value.presets.find(item => item.id === importedId)
    assert.equal(importedCatalog.name, '旧版档案馆')
    assert.deepEqual(importedCatalog.legacySkipped, attached.skipped)
    assert.ok(Object.values(importedCatalog.builtIn).find(item => item.locked)?.name)
    const { presetId: importedBuild } = (await host.request(endpoint, { presetId: importedId, equipmentIds: ['review'] })).value
    const { sessionId: importedSession } = await host.request('/api/loadout-fixture-session', { presetId: importedBuild, workspacePath: legacyWorkspace })
    await finish(importedSession, '读取旧预设档案')
    const importedGrowth = await readUntil(importedSession, value => value.recent.length === 1)
    assert.deepEqual(importedGrowth.recent[0].awards.slice(0, 2).map(item => [item.name, item.xp]), [['旧版档案馆', 12], ['legacy_lookup', 8]])
    const importedHistory = await host.request('/api/loadout-fixture-history?' + new URLSearchParams({ sessionId: importedSession }))
    assert.equal(importedHistory.events.findLast(event => event.type === 'assistant/message').data.message.content[0].text, '对局结果 approved local archive')
    await writeFile(metaFile, 'name: 文件已变化\n')

    const origin = await host.request('/api/loadout-fixture-session', { presetId: 'fixture-foreign', workspacePath: directory })
    const first = origin.sessionId
    const initialJournal = await journal()
    assert.deepEqual(initialJournal.active, [])
    assert.deepEqual(initialJournal.completed.map(entry => [entry.id, entry.mode, entry.awards[0].xp]), [['legacy-quest', 'trial', 24]])
    await finish(first, '准备接力任务。')
    const preparation = await readUntil(first, value => value.recent.length === 1)
    assert.deepEqual(preparation.recent[0].awards.map(item => [item.id, item.xp]), [['fixture-foreign', 12]])
    await invoke('match-follow-up', first, { receiptId: preparation.recent[0].id, gearIds: ['review'] }, 422)
    const quest = await invoke('growth-accept', first, { mode: 'relay', title: '查档后交付摘要' })
    assert.match((await invoke('match-prompt', first, { questId: quest.id, input: quest.title })).text, /完成接力的第一棒/)
    assert.deepEqual((await journal()).active.map(entry => [entry.id, entry.sessionId, entry.workspace]),
      [[quest.id, first, 'Fixture workspace']])
    const early = await continuation(first, 'standard')
    assert.equal((await view(early)).relayOffer, undefined)
    await finish(first, '请使用当前会话的工具 "quartz_note" 核对档案。')
    const initialLeg = (await readUntil(first, value => value.quest?.relay.first)).quest.relay.first
    const quartz = initialLeg.gear.find(item => item.name === 'quartz_note')
    assert.equal(quartz.kind, 'tool')
    const quartzProvider = initialLeg.gear.find(item => item.id === quartz.sourceId)
    assert.equal(quartzProvider?.name, 'fixture-isolated-group')
    assert.deepEqual(quartzProvider.activity, [{ kind: 'provider', name: 'quartz_note' }])
    assert.deepEqual(initialLeg.gear.map(item => item.id), [quartz.id, quartzProvider.id])
    assert.equal((await view(first)).task, undefined)
    assert.equal((await view(early)).relayOffer, undefined)
    await invoke('growth-claim', first, { id: quest.id }, 422)

    const assembled = (await host.request(endpoint, { presetId: 'fixture-foreign', equipmentIds: ['evidence'] })).value
    const gearChange = await continuation(first, assembled.presetId)
    const sameHeroOffer = (await view(gearChange)).relayOffer
    assert.equal(sameHeroOffer.nextLeg, false)
    await invoke('growth-handoff', gearChange, { id: quest.id })
    const old = await view(first)
    assert.equal(old.quest, undefined)
    assert.equal(old.relayTo.sessionId, gearChange)
    await finish(gearChange, '用同一位英雄整理查档结果。')
    const afterGearChange = await readUntil(gearChange, value => value.recent.length === 1)
    assert.equal(afterGearChange.quest.relay.first.sessionId, first)
    assert.equal(afterGearChange.quest.completed, undefined)

    const next = await continuation(gearChange, 'standard')
    const sibling = await continuation(gearChange, 'recruiting-advisor')
    assert.equal((await equipmentIn(host, next)).relayOffer.nextLeg, true)
    assert.equal((await view(sibling)).relayOffer.id, quest.id)
    await finish(next, '接棒前的工作。')
    await readUntil(next, value => value.recent.length === 1)
    await invoke('growth-handoff', next, { id: quest.id })
    await invoke('growth-handoff', sibling, { id: quest.id }, 422)
    assert.equal((await view(next)).quest.completed, undefined)
    assert.equal((await view(gearChange)).relayTo.sessionId, next)
    assert.deepEqual((await journal()).active.map(entry => [entry.id, entry.sessionId, entry.hero.id, entry.relay.first.sessionId]),
      [[quest.id, next, 'standard', first]])

    await host.stop()
    host = await startHost(env, patch)
    const restoredPreset = (await host.request(endpoint)).value.presets.find(item => item.id === importedId)
    assert.equal(restoredPreset?.name, '旧版档案馆')
    assert.deepEqual(restoredPreset.legacySkipped, attached.skipped)
    assert.equal(restoredPreset.rank.xp, 12)
    const { sessionId: retainedSession } = await host.request('/api/loadout-fixture-session', { presetId: importedId, workspacePath: legacyWorkspace })
    await finish(retainedSession, '读取旧预设档案')
    await readUntil(retainedSession, value => value.recent.length === 1)
    await writeFile(join(importedSource, 'removed-provider.mjs'), `export function apply(ctx) {
      ctx.provide('legacyArchiveProvider', 'restored local archive')
    }`)
    await writeFile(compositionFile, JSON.stringify([{ ...persona, config: {} }, recoveredGroup]))
    const badUpdate = await invoke('legacy-preset-preview', undefined, { id: importedId })
    await invoke('legacy-preset-refresh', undefined, { id: importedId, revision: badUpdate.revision }, 422)
    const rolledBack = (await host.request(endpoint)).value.presets.find(item => item.id === importedId)
    assert.equal(rolledBack.name, '旧版档案馆')
    assert.equal(rolledBack.broken, undefined)
    assert.deepEqual(rolledBack.legacySkipped, attached.skipped)
    await writeFile(metaFile, 'name: 旧版档案馆\ndescription: 恢复后的档案资源\n')
    await writeFile(compositionFile, JSON.stringify([persona, recoveredGroup]))
    await invoke('legacy-preset-refresh', undefined, { id: importedId, revision: badUpdate.revision }, 422)
    const reviewedUpdate = await invoke('legacy-preset-preview', undefined, { id: importedId })
    assert.equal(reviewedUpdate.managed, true)
    assert.deepEqual(reviewedUpdate.changes.restoring, attached.skipped)
    assert.deepEqual(reviewedUpdate.changes.removed, ['./archives.mjs'])
    const refreshed = await invoke('legacy-preset-refresh', undefined, { id: importedId, revision: reviewedUpdate.revision })
    assert.equal(refreshed.updated, true)
    assert.deepEqual(refreshed.restored, attached.skipped)
    await invoke('legacy-preset-refresh', undefined, { id: importedId, revision: reviewedUpdate.revision }, 422)
    const { sessionId: recoveredSession } = await host.request('/api/loadout-fixture-session', { presetId: importedId, workspacePath: legacyWorkspace })
    assert.ok(!(await equipmentIn(host, recoveredSession)).tools.some(item => item.name === 'legacy_lookup'))
    await finish(recoveredSession, '读取恢复后的档案')
    const recovered = await readUntil(recoveredSession, value => value.recent.length === 1)
    assert.deepEqual(recovered.recent[0].awards.slice(0, 2).map(item => [item.name, item.xp]), [['旧版档案馆', 12], ['legacy_recovered', 8]])
    assert.ok((await equipmentIn(host, retainedSession)).tools.some(item => item.name === 'legacy_lookup'))
    await finish(retainedSession, '读取旧预设档案')
    assert.equal((await readUntil(retainedSession, value => value.recent.length === 2)).hero.xp, 48)
    await host.request(turnEndpoint, { sessionId: next, selectOnly: true })
    const resumed = await view(next)
    assert.equal(resumed.quest.id, quest.id)
    assert.equal(resumed.quest.relay.first.sessionId, first)
    assert.equal(resumed.quest.relay.runner.id, 'standard')
    assert.equal(resumed.quest.completed, undefined)
    assert.match((await invoke('match-prompt', next, { questId: quest.id, input: quest.title })).text, /依据第一棒留下的结果/)
    await finish(next, '结合已核验的档案交付摘要。')
    const finished = await readUntil(next, value => value.quest?.completed !== undefined)
    assert.equal(finished.quest.relay.second.sessionId, next)
    assert.deepEqual(finished.quest.relay.second.gear, [])
    assert.equal((await journal()).active[0].completed, finished.quest.completed)
    assert.equal((await equipmentIn(host, next)).settlement.ready.id, quest.id)
    await invoke('growth-claim', next, { id: quest.id, rewardGear: { leg: 1, id: quartz.id } }, 422)
    await invoke('growth-claim', next, { id: quest.id, rewardGear: { leg: 0, id: quartz.id } })
    await invoke('growth-claim', next, { id: quest.id }, 422)
    const [receipt] = await invoke('match-settlements', next)
    assert.equal(receipt.id, quest.id)
    assert.deepEqual(receipt.awards.map(item => [item.id, item.xp]), [['fixture-foreign', 24], ['standard', 24], [quartz.id, 16]])
    assert.deepEqual(receipt.relay.map(leg => leg.sessionId), [first, next])
    assert.equal(receipt.awards[2].sourceId, quartz.sourceId)
    const settled = (await equipmentIn(host, next)).settlement
    assert.equal(settled.ready, undefined)
    assert.deepEqual(settled.receipt.relay, { count: 2, xp: 48 })
    assert.equal(settled.receipt.gearXp, 16)
    await host.stop()
    const saved = JSON.parse(await readFile(progressFile, 'utf8'))
    assert.ok(saved.recent.some(entry => entry.id === quest.id))
    await writeFile(progressFile, JSON.stringify({ ...saved, recent: [] }))
    host = await startHost(env, patch)
    assert.deepEqual(await invoke('match-settlements', next), [])
    const archived = await journal()
    assert.deepEqual(archived.active, [])
    assert.deepEqual(archived.completed.map(entry => entry.id), [quest.id, 'legacy-quest'])
    const [entry] = archived.completed
    assert.equal(entry.sessionId, next)
    assert.deepEqual(entry.awards.map(item => [item.id, item.xp]), receipt.awards.map(item => [item.id, item.xp]))
    assert.equal(entry.relay.first.sessionId, first)
    assert.equal(entry.relay.second.sessionId, next)

    const draft = { presetId: 'fixture-foreign', equipmentIds: ['evidence'] }
    const preview = await invoke('growth-opening-choices', undefined, { draft })
    assert.equal(preview.hero.id, draft.presetId)
    assert.equal(preview.choices.find(item => item.id === quartz.id).kind, 'tool')
    assert.ok(preview.choices.some(item => item.id === 'evidence'))
    const savedPreview = await invoke('growth-opening-choices', undefined, { draft: { presetId: assembled.presetId, equipmentIds: [] } })
    assert.ok(savedPreview.choices.some(item => item.id === 'evidence'))
    const launch = { draft, workspaceId: origin.workspaceId, launchId: '0123456789abcdef'.repeat(2),
      quest: { mode: 'combo', title: '开局查档并核验材料', gearIds: [quartz.id, 'evidence'],
        brief: '核验档案 A-031 的开局材料。' } }
    await invoke('growth-open', undefined, { ...launch, draft: { ...draft, equipmentIds: [] } }, 422)
    await invoke('growth-open', undefined, { ...launch, quest: { ...launch.quest, brief: '字'.repeat(4001) } }, 422)
    const [opened, retried] = await Promise.all([invoke('growth-open', undefined, launch), invoke('growth-open', undefined, launch)])
    assert.equal(opened.questError, undefined)
    assert.deepEqual(retried, opened)
    const opening = (await view(opened.sessionId)).quest
    assert.deepEqual(opening.pair.map(item => item.id), launch.quest.gearIds)
    assert.deepEqual(opening.comboReward, { flag: 'unlock', heroXp: 24, gearXp: 16 })
    const duplicateTitle = '另一局核验档案来源'
    const duplicateMatch = await invoke('growth-open', undefined, { ...launch, launchId: '3456789abcdef012'.repeat(2),
      quest: { ...launch.quest, title: duplicateTitle } })
    assert.equal(duplicateMatch.questError, undefined)
    const firstSnapshot = await equipmentIn(host, opened.sessionId)
    assert.equal(firstSnapshot.openingQuest.id, opening.id)
    assert.deepEqual(firstSnapshot.questTask, { id: opening.id, title: opening.title, mode: 'combo', input: launch.quest.brief })
    assert.equal(firstSnapshot.settlement, undefined)
    const history = await host.request('/api/loadout-fixture-history?sessionId=' + encodeURIComponent(opened.sessionId))
    assert.equal(history.workspaceId, origin.workspaceId)
    assert.equal(history.events.some(event => event.type === 'turn/start' || event.type === 'user/message'), false)
    const openingInput = { questId: opening.id, input: firstSnapshot.questTask.input }
    await invoke('match-prompt', opened.sessionId, { ...openingInput, questId: randomUUID() }, 422)
    await invoke('match-prompt', opened.sessionId, { ...openingInput, input: ' ' }, 422)
    const openingRequest = randomUUID()
    const openingPrompt = await invoke('match-record', opened.sessionId, { ...openingInput, requestId: openingRequest })
    assert.match(openingPrompt.text, /^【连携挑战】开局查档并核验材料/)
    assert.ok(openingPrompt.text.endsWith(launch.quest.brief))
    await host.request(turnEndpoint, { sessionId: opened.sessionId, text: openingPrompt.text, requestId: openingRequest })
    await readUntil(opened.sessionId, value => value.quest?.completed !== undefined)
    assert.equal((await equipmentIn(host, opened.sessionId)).openingQuest, undefined)
    const openingReport = await invoke('match-report', opened.sessionId)
    assert.deepEqual(openingReport.turns[0].entries.map(item => [item.type, item.kind, item.label ?? item.name]),
      [['action', 'quest', '连携挑战'], ['tool', undefined, 'quartz_note']])
    const { flag } = await invoke('growth-claim', opened.sessionId, { id: opening.id })
    assert.equal(flag.title, launch.quest.title)
    const duplicate = (await view(duplicateMatch.sessionId)).quest
    assert.deepEqual(duplicate.comboReward, { flag: 'record', heroXp: 0, gearXp: 0,
      existing: { id: flag.id, title: flag.title, sessionId: opened.sessionId } })
    await invoke('growth-claim', duplicateMatch.sessionId, { id: duplicate.id }, 422)
    await finish(duplicateMatch.sessionId, '请使用当前会话的工具 "quartz_note" 核验另一份档案。')
    await readUntil(duplicateMatch.sessionId, value => value.quest?.completed !== undefined)
    const duplicateSettlement = await invoke('growth-claim', duplicateMatch.sessionId, { id: duplicate.id })
    assert.equal(duplicateSettlement.flag, undefined)
    assert.equal(duplicateSettlement.comboRepeat.id, flag.id)
    const [duplicateReceipt] = await invoke('match-settlements', duplicateMatch.sessionId)
    assert.deepEqual(duplicateReceipt.awards, [])
    assert.equal(duplicateReceipt.pair.find(item => item.id === quartz.id).sourceId, flag.pair[0].sourceId)
    const duplicateEntry = (await journal()).completed.find(entry => entry.id === duplicate.id)
    assert.equal(duplicateEntry.title, duplicateTitle)
    assert.equal(duplicateEntry.comboRepeat.sessionId, opened.sessionId)
    const savedBeforeFlag = (await host.request(endpoint)).value.saved.map(item => item.id)
    const replay = await invoke('growth-flag-loadout', undefined, { id: flag.id })
    assert.equal(replay.count, 2)
    assert.equal(replay.draft.presetId, draft.presetId)
    assert.deepEqual(replay.draft.equipmentIds, ['evidence'])
    assert.deepEqual(replay.slots.map(item => [item.id, item.placement]), [[quartz.id, 'included'], ['evidence', 'selected']])
    assert.deepEqual(replay.practice, { mode: 'combo', title: launch.quest.title, gearIds: launch.quest.gearIds,
      practiceFlagId: flag.id, questSources: { [quartz.id]: flag.pair[0].sourceId } })
    assert.equal(replay.upgrade.flagId, flag.id)
    assert.deepEqual(replay.upgrade.modes.map(mode => mode.id), ['action', 'staged'])
    assert.equal(replay.upgrade.modes[0].gearXp, 8)
    const replayOpening = await invoke('growth-opening-choices', undefined, { draft: replay.draft })
    assert.equal(replayOpening.choices.find(item => item.id === quartz.id).sourceId, flag.pair[0].sourceId)
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), savedBeforeFlag)
    await invoke('growth-flag-loadout', undefined, { id: '0'.repeat(64) }, 422)
    assert.deepEqual(await invoke('growth-open', undefined, launch), opened)
    assert.equal((await view(opened.sessionId)).quest, undefined)
    await invoke('match-record', opened.sessionId, { ...openingInput, requestId: randomUUID() }, 422)

    const blank = await invoke('growth-open', undefined, { ...launch, launchId: '123456789abcdef0'.repeat(2),
      quest: { mode: 'trial', title: '试炼后复核档案', gearId: quartz.id, brief: '核对档案 A-032 的试炼资料。' } })
    assert.equal(blank.questError, undefined)
    const trial = (await view(blank.sessionId)).quest
    const enhanced = (await host.request(endpoint, { ...draft, equipmentIds: ['evidence', 'review'] })).value
    const blankChild = await continuation(blank.sessionId, enhanced.presetId)
    const otherHero = await continuation(blank.sessionId, 'standard')
    assert.equal((await view(otherHero)).questOffer, undefined)
    const blankHistory = await host.request('/api/loadout-fixture-history?sessionId=' + encodeURIComponent(blankChild))
    assert.equal(blankHistory.inherited, 0)
    assert.equal((await equipmentIn(host, blankChild)).questOffer.id, trial.id)
    await host.stop()
    host = await startHost(env, patch)
    await host.request(turnEndpoint, { sessionId: blankChild, selectOnly: true })
    assert.equal((await view(blankChild)).questOffer.id, trial.id)
    await invoke('growth-handoff', blankChild, { id: trial.id })
    assert.equal((await view(blankChild)).quest.previousSessionId, blank.sessionId)
    assert.equal((await view(blankChild)).quest.completed, undefined)
    assert.equal((await view(blankChild)).task.input, '核对档案 A-032 的试炼资料。')
    await invoke('match-prompt', blank.sessionId, { questId: trial.id, input: trial.brief }, 422)
    await finish(blankChild, '请使用当前会话的工具 "quartz_note" 核对试炼资料。')
    await readUntil(blankChild, value => value.quest?.completed !== undefined)
    await invoke('growth-claim', blankChild, { id: trial.id })
    const [trialAward] = (await invoke('match-settlements', blankChild))[0].awards
    assert.deepEqual([trialAward.id, trialAward.xp], [quartz.id, 24])

    const olderBranch = await continuation(blankChild, assembled.presetId)
    await delay(5)
    const combo = await invoke('growth-accept', blankChild, {
      mode: 'combo', title: '换装后核验再交付', gearIds: [quartz.id, 'review'],
    })
    assert.equal((await view(olderBranch)).questOffer, undefined)
    await finish(blankChild, '请使用当前会话的工具 "quartz_note" 测试工具出错')
    const partial = (await readUntil(blankChild, value => value.quest?.progress)).quest.progress
    assert.deepEqual(partial.missing, [quartz.id])
    const reviewOnly = (await host.request(endpoint, { ...draft, equipmentIds: ['review'] })).value
    const continuing = await continuation(blankChild, reviewOnly.presetId)
    const withoutReview = await continuation(blankChild, assembled.presetId)
    assert.equal((await view(withoutReview)).questOffer.id, combo.id)
    await invoke('growth-handoff', continuing, { id: combo.id })
    await invoke('growth-handoff', withoutReview, { id: combo.id }, 422)
    const moved = await view(blankChild)
    assert.equal(moved.quest, undefined)
    assert.equal(moved.questTo.sessionId, continuing)
    const renewed = await view(continuing)
    assert.equal(renewed.quest.completed, undefined)
    assert.deepEqual(renewed.quest.progress, partial)
    assert.deepEqual(renewed.recent, [])
    assert.deepEqual((await journal()).active.map(item => [item.id, item.sessionId]), [[combo.id, continuing]])
    await invoke('growth-claim', blankChild, { id: combo.id }, 422)
    await invoke('growth-claim', continuing, { id: combo.id }, 422)
    await finish(continuing, '请使用当前会话的工具 "quartz_note" 完成交付复核。')
    await readUntil(continuing, value => value.quest?.completed !== undefined)
    const afterCompletion = await continuation(continuing, enhanced.presetId)
    assert.equal((await view(afterCompletion)).questOffer, undefined)
    const comboClaim = await invoke('growth-claim', continuing, { id: combo.id })
    assert.equal(comboClaim.flag.title, combo.title)
    const archivedCombo = (await journal()).completed.find(item => item.id === combo.id)
    assert.equal(archivedCombo.previousSessionId, blankChild)
    assert.equal(archivedCombo.sessionId, continuing)
    assert.deepEqual(archivedCombo.awards.map(item => item.xp), [24, 16, 16])

    const pause = preview.choices.find(item => item.id === 'evidence').trialActions.find(move => move.name === '暂缓提交')
    const actionLaunch = { ...launch, launchId: '23456789abcdef01'.repeat(2),
      quest: { mode: 'trial', title: '材料不足时暂缓提交', gearId: 'evidence', trialActionKey: pause.key } }
    await invoke('growth-open', undefined, { ...actionLaunch, quest: { ...actionLaunch.quest, trialActionKey: 'unknown' } }, 422)
    const actionMatch = await invoke('growth-open', undefined, actionLaunch)
    assert.equal(actionMatch.questError, undefined)
    const actionSession = actionMatch.sessionId
    const actionQuest = (await view(actionSession)).quest
    assert.deepEqual(actionQuest.trialAction, pause)
    const move = { equipmentId: 'evidence', moveId: 'pause', input: '原始材料尚未齐备。' }
    const plain = await invoke('match-prompt', actionSession, move)
    const send = async (sessionId, fields, transform = text => text, recordedIn = sessionId) => {
      const requestId = randomUUID()
      const { text } = await invoke('match-record', recordedIn, { ...fields, requestId })
      await host.request(turnEndpoint, { sessionId, requestId, text: transform(text) })
    }
    const checkAttempt = async (turn, action = false, missing = []) => {
      const result = await readUntil(actionSession, value => value.quest?.progress?.turn === turn)
      assert.equal(result.quest.completed, undefined)
      assert.equal(result.quest.progress.action, action)
      assert.deepEqual(result.quest.progress.missing, missing)
      if (!action) assert.ok(!result.recent[0].awards.some(item => item.id === 'evidence' && item.activity?.some(event => event.name === '暂缓提交')))
    }
    await finish(actionSession, plain.text)
    await checkAttempt(1)
    await send(actionSession, { ...move, moveId: 'qualify' })
    await checkAttempt(2)
    await send(actionSession, move, text => text + '\n这是编辑后的消息。')
    await checkAttempt(3)
    await send(actionSession, move, text => text, blankChild)
    await checkAttempt(4)
    await invoke('growth-claim', actionSession, { id: actionQuest.id }, 422)
    const priorRequest = randomUUID()
    const priorReceipt = join(env.DSH_HOME, 'agent-loadout', 'match-actions', priorRequest + '.json')
    const recorded = await invoke('match-record', actionSession, { ...move, requestId: priorRequest })
    const { questId, proofKey, ...olderProof } = JSON.parse(await readFile(priorReceipt, 'utf8'))
    await writeFile(priorReceipt, JSON.stringify({ ...olderProof, trialId: questId, trialKey: proofKey }))
    await host.request(turnEndpoint, { sessionId: actionSession, requestId: priorRequest, text: recorded.text })
    const finishedAction = await readUntil(actionSession, value => value.quest?.completed === 5)
    const evidenceAward = finishedAction.recent[0].awards.find(item => item.id === 'evidence')
    assert.equal(evidenceAward?.xp, 4)
    assert.deepEqual(evidenceAward.activity, [{ kind: 'action', name: '暂缓提交', proofKey: pause.key }])
    await invoke('growth-claim', actionSession, { id: actionQuest.id })
    const [actionReceipt] = await invoke('match-settlements', actionSession)
    assert.deepEqual(actionReceipt.trialAction, { name: '暂缓提交', turn: 5 })
    assert.deepEqual(actionReceipt.awards.map(award => [award.id, award.xp]), [['evidence', 32]])
    assert.deepEqual((await journal()).completed.find(item => item.id === actionQuest.id).trialAction, actionReceipt.trialAction)
    await invoke('growth-claim', actionSession, { id: actionQuest.id }, 422)

    const useTool = preview.choices.find(item => item.id === quartz.id).trialActions.find(move => move.name === '用工具完成任务')
    const toolLaunch = { ...launch, launchId: '456789abcdef0123'.repeat(2),
      quest: { mode: 'trial', title: '用档案工具核对证据', gearId: quartz.id, trialActionKey: useTool.key } }
    const toolMatch = await invoke('growth-open', undefined, toolLaunch)
    assert.equal(toolMatch.questError, undefined)
    const toolSession = toolMatch.sessionId
    const useQuartz = { targetKind: 'gear', targetId: quartz.id, moveId: 'gear:task' }
    const toolQuest = (await view(toolSession)).quest
    assert.deepEqual(toolQuest.trialAction, useTool)
    await send(toolSession, { ...useQuartz, input: '测试工具出错' })
    const failedUse = await readUntil(toolSession, value => value.quest?.progress?.action === true)
    assert.deepEqual(failedUse.quest.progress.missing, [quartz.id])
    assert.equal(failedUse.quest.completed, undefined)
    assert.ok(!failedUse.recent[0].awards.some(item => item.id === quartz.id || item.id === quartzProvider.id))
    await finish(toolSession, '请使用当前会话的工具 "quartz_note" 核对档案。')
    const unmarked = await readUntil(toolSession, value => value.quest?.progress?.turn === 2)
    assert.deepEqual(unmarked.quest.progress.missing, [])
    assert.equal(unmarked.quest.progress.action, false)
    await send(toolSession, { ...useQuartz, input: '核对档案里的依据。' })
    await readUntil(toolSession, value => value.quest?.completed === 3)
    await invoke('growth-claim', toolSession, { id: toolQuest.id })
    const [toolReceipt] = await invoke('match-settlements', toolSession)
    assert.deepEqual(toolReceipt.trialAction, { name: '用工具完成任务', turn: 3 })
    assert.deepEqual(toolReceipt.awards.map(item => [item.id, item.xp]), [[quartz.id, 32]])
    assert.deepEqual(toolReceipt.followUpGear.map(item => item.id), [quartz.id, quartzProvider.id])
    const followUp = await invoke('match-follow-up', toolSession, { receiptId: toolReceipt.id, gearIds: [quartz.id] })
    assert.deepEqual(followUp.quest, { mode: 'trial', gearId: quartz.id, trialActionKey: useTool.key })
    assert.equal(followUp.turn, 3)
    assert.equal(followUp.gear[0].sourceId, quartz.sourceId)
    assert.ok(followUp.gear[0].sourceName)
    await invoke('match-follow-up', actionSession, { receiptId: toolReceipt.id, gearIds: [quartz.id] }, 422)
    await invoke('match-follow-up', toolSession, { receiptId: toolReceipt.id, gearIds: [quartz.id, quartz.id] }, 422)
    await invoke('match-follow-up', toolSession, { receiptId: toolReceipt.id, gearIds: ['evidence'] }, 422)
    const followMatch = await invoke('growth-open', undefined, { ...launch, launchId: '6789abcdef012345'.repeat(2),
      quest: { ...followUp.quest, title: '用原工具核对下一份材料', brief: '核对档案 A-033 的原件。' } })
    assert.equal(followMatch.questError, undefined)
    const followQuest = await view(followMatch.sessionId)
    assert.deepEqual(followQuest.quest.trialAction, useTool)
    assert.equal(followQuest.quest.completed, undefined)
    assert.deepEqual(followQuest.recent, [])
    await send(followMatch.sessionId, { ...useQuartz, questId: followQuest.quest.id, input: followQuest.task.input })
    await readUntil(followMatch.sessionId, value => value.quest?.completed === 1)
    await invoke('growth-claim', followMatch.sessionId, { id: followQuest.quest.id })

    const { presets } = (await host.request(endpoint)).value
    for (const [id, name] of [['standard', '核对后交付'], ['minimal', '完成最小交付'], ['ptc', '编排批量处理'],
      ['cordis', '核对插件接入'], ['recruiting-advisor', '区分证据与判断'], ['fixture-foreign', '按当前预设交付']]) {
      assert.ok(presets.find(preset => preset.id === id).heroMoves.some(([label]) => label === name))
    }
    const heroDraft = { presetId: 'recruiting-advisor', equipmentIds: [] }
    const heroPreview = await invoke('growth-opening-choices', undefined, { draft: heroDraft })
    const specialty = heroPreview.heroActions.find(move => move.name === '区分证据与判断')
    const heroLaunch = { ...launch, draft: heroDraft, launchId: '3456789abcdef012'.repeat(2),
      quest: { mode: 'delivery', title: '交付可核对的评估', heroActionKey: specialty.key, brief: '复核候选人项目经历。' } }
    await invoke('growth-open', undefined, { ...heroLaunch, draft }, 422)
    const { sessionId: heroSession, questError } = await invoke('growth-open', undefined, heroLaunch)
    assert.equal(questError, undefined)
    const heroQuest = (await view(heroSession)).quest
    assert.deepEqual(heroQuest.heroAction, specialty)
    assert.deepEqual((await equipmentIn(host, heroSession)).questTask.target, { kind: 'hero', id: heroDraft.presetId, key: specialty.key })
    const specialtyMove = { targetKind: 'hero', targetId: heroDraft.presetId, moveId: 'hero:specialty',
      input: '复核候选人项目经历。' }
    await invoke('match-prompt', heroSession, { ...specialtyMove, targetId: 'standard' }, 422)
    await invoke('match-prompt', heroSession, { ...specialtyMove, input: '' }, 422)
    await send(heroSession, { ...specialtyMove, moveId: 'hero:delivery' })
    const generic = await readUntil(heroSession, value => value.quest?.progress?.turn === 1)
    assert.equal(generic.quest.completed, undefined)
    const newHeroBuild = (await host.request(endpoint, { ...heroDraft, equipmentIds: ['evidence'] })).value
    const heroContinued = await continuation(heroSession, newHeroBuild.presetId)
    assert.deepEqual((await view(heroContinued)).questOffer.heroAction, specialty)
    await invoke('growth-handoff', heroContinued, { id: heroQuest.id })
    const heroTask = (await view(heroContinued)).task
    assert.equal(heroTask.input, heroLaunch.quest.brief)
    await invoke('match-prompt', heroContinued, { questId: heroTask.id, input: heroTask.input }, 422)
    await invoke('match-prompt', heroContinued, { ...specialtyMove, questId: heroTask.id, moveId: 'hero:delivery' }, 422)
    const copied = await invoke('match-prompt', heroContinued, specialtyMove)
    assert.match(copied.text, /^【招聘顾问】区分证据与判断/)
    await finish(heroContinued, copied.text)
    const copiedAttempt = await readUntil(heroContinued, value => value.quest?.progress?.sessionId === heroContinued)
    assert.equal(copiedAttempt.quest.progress.action, false)
    assert.equal(copiedAttempt.quest.completed, undefined)
    await send(heroContinued, { ...specialtyMove, questId: heroTask.id, input: heroTask.input })
    await readUntil(heroContinued, value => value.quest?.completed !== undefined)
    await invoke('growth-claim', heroContinued, { id: heroQuest.id })
    const [heroReceipt] = await invoke('match-settlements', heroContinued)
    assert.equal(heroReceipt.heroAction.name, specialty.name)
    assert.deepEqual(heroReceipt.awards.map(award => [award.id, award.xp]), [[heroDraft.presetId, 40]])
    assert.deepEqual((await journal()).completed.find(item => item.id === heroQuest.id).heroAction, heroReceipt.heroAction)

    const reviewDraft = { ...draft, equipmentIds: ['review'] }
    const reviewPreview = await invoke('growth-opening-choices', undefined, { draft: reviewDraft })
    const review = reviewPreview.choices.find(item => item.id === 'review').trialActions.find(move => move.name === '复核交付草稿')
    const reviewCombo = { mode: 'combo', title: '先查档再复核交付', gearIds: ['review', quartz.id], comboActionKey: review.key }
    const reviewLaunch = { ...launch, draft: reviewDraft, launchId: '56789abcdef01234'.repeat(2), quest: reviewCombo }
    await invoke('growth-open', undefined, { ...reviewLaunch, quest: { ...reviewCombo, comboActionKey: useTool.key } }, 422)
    assert.equal(reviewPreview.flags.find(flag => flag.id === comboClaim.flag.id).upgraded, false)
    const reviewMatch = await invoke('growth-open', undefined, reviewLaunch)
    assert.equal(reviewMatch.questError, undefined)
    assert.deepEqual(await invoke('growth-open', undefined, reviewLaunch), reviewMatch)
    const activeCombo = (await view(reviewMatch.sessionId)).quest
    assert.deepEqual(activeCombo.comboAction, { ...review, gearId: 'review' })
    const reviewMove = { equipmentId: 'review', moveId: 'preview', input: '复核档案草稿。' }
    const reviewPrompt = await invoke('match-prompt', reviewMatch.sessionId, reviewMove)
    assert.match(reviewPrompt.text, /连携目标\n先查档再复核交付\n请先使用当前会话的工具 "quartz_note"/)
    await finish(reviewMatch.sessionId, reviewPrompt.text)
    const noAction = await readUntil(reviewMatch.sessionId, value => value.quest?.progress?.turn === 1)
    assert.deepEqual(noAction.quest.progress.missing, [])
    assert.equal(noAction.quest.progress.action, false)
    await send(reviewMatch.sessionId, { ...reviewMove, input: '测试工具出错' })
    const noEvidence = await readUntil(reviewMatch.sessionId, value => value.quest?.progress?.turn === 2)
    assert.deepEqual(noEvidence.quest.progress.missing, [quartz.id])
    assert.equal(noEvidence.quest.progress.action, true)
    await invoke('growth-claim', reviewMatch.sessionId, { id: activeCombo.id }, 422)

    const reviewContinued = await continuation(reviewMatch.sessionId, enhanced.presetId)
    assert.deepEqual((await view(reviewContinued)).questOffer.comboAction, activeCombo.comboAction)
    await invoke('growth-handoff', reviewContinued, { id: activeCombo.id })
    assert.deepEqual((await view(reviewContinued)).quest.progress, noEvidence.quest.progress)
    await send(reviewContinued, reviewMove)
    const beforeUpgrade = await readUntil(reviewContinued, value => value.quest?.completed !== undefined)
    const upgraded = await invoke('growth-claim', reviewContinued, { id: activeCombo.id })
    assert.equal(upgraded.flagUpgrade, true)
    assert.equal(upgraded.flag.id, comboClaim.flag.id)
    assert.equal(upgraded.flag.sessionId, continuing)
    assert.equal(upgraded.flag.comboAction.sessionId, reviewContinued)
    assert.equal((await view(reviewContinued)).hero.xp, beforeUpgrade.hero.xp)
    const [upgradeReceipt] = await invoke('match-settlements', reviewContinued)
    assert.deepEqual(upgradeReceipt.awards.map(item => [item.id, item.xp]), [['review', 8], [quartz.id, 8]])
    assert.equal(upgradeReceipt.flagUpgrade, true)
    const upgradeJournal = (await journal()).completed.find(item => item.id === activeCombo.id)
    assert.deepEqual(upgradeJournal.comboAction, upgradeReceipt.comboAction)
    assert.equal(upgradeJournal.previousSessionId, reviewMatch.sessionId)
    assert.equal(upgradeJournal.flagUpgrade, true)
    await invoke('growth-accept', reviewContinued, reviewCombo, 422)

    const orderedMatch = await host.request('/api/loadout-fixture-session', { presetId: 'fixture-foreign' })
    const orderedId = orderedMatch.sessionId
    const indexTool = (await invoke('match-growth', orderedId, { includeChoices: true })).choices.find(item => item.name === 'serpentine_index')
    const indexMove = indexTool.trialActions.find(move => move.name === '用工具完成任务')
    const orderedCombo = await invoke('growth-accept', orderedId, { mode: 'combo', title: '查档后核对索引',
      gearIds: [indexTool.id, quartz.id], comboActionKey: indexMove.key })
    const indexCommand = { targetKind: 'gear', targetId: indexTool.id, moveId: 'gear:task' }
    await send(orderedId, { ...indexCommand, input: '测试逆序' })
    const reverse = await readUntil(orderedId, value => value.quest?.progress?.turn === 1)
    assert.equal(reverse.quest.progress.action, true)
    assert.deepEqual(reverse.quest.progress.missing, [])
    assert.equal(reverse.quest.progress.ordered, false)
    assert.equal(reverse.quest.completed, undefined)
    await send(orderedId, { ...indexCommand, input: '按档案依据核对索引。' })
    await readUntil(orderedId, value => value.quest?.completed === 2)
    const orderedClaim = await invoke('growth-claim', orderedId, { id: orderedCombo.id })
    assert.equal(orderedClaim.flagUpgrade, false)
    assert.equal(orderedClaim.flag.comboAction.name, indexMove.name)
    assert.deepEqual((await invoke('match-settlements', orderedId))[0].awards.map(item => item.xp), [24, 24, 24])
    const nextCombo = await invoke('match-follow-up', orderedId, { receiptId: orderedCombo.id, gearIds: [quartz.id, indexTool.id] })
    assert.deepEqual(nextCombo.quest, { mode: 'combo', gearIds: [quartz.id, indexTool.id], comboActionKey: indexMove.key })
    assert.equal(nextCombo.turn, 2)
    const followUpPair = { receiptId: orderedCombo.id, gearIds: [quartz.id, indexTool.id] }
    const nextPreview = await invoke('match-follow-up-preview', orderedId, followUpPair)
    const recordedSources = Object.fromEntries(nextCombo.gear.map(item => [item.id, item.sourceId]))
    assert.deepEqual(nextPreview.combo, await invoke('growth-combo-preview', orderedId, {
      gearIds: followUpPair.gearIds, questSources: recordedSources,
    }))
    await invoke('match-follow-up-preview', actionSession, followUpPair, 422)
    await invoke('match-follow-up', orderedId, { ...followUpPair, combo: { mode: 'action', actionKey: 'missing-action' } }, 422)
    const eligible = nextPreview.combo.modes.find(mode => !mode.reason)
    if (eligible) {
      const mode = eligible.id
      const actionKey = eligible.move?.key ?? (mode === 'staged' ? nextPreview.combo.moveKeys.staged[0] : undefined)
      const configured = await invoke('match-follow-up', orderedId, { ...followUpPair, combo: { mode, actionKey } })
      assert.deepEqual(configured.quest.questSources, recordedSources)
      assert.equal(configured.quest.comboActionKey, actionKey)
    }

    const stagedLaunch = { ...reviewLaunch, quest: { ...reviewCombo, staged: true } }
    await invoke('growth-open', undefined, stagedLaunch, 422)
    const rehearsal = await invoke('growth-accept', reviewContinued, {
      mode: 'trial', title: '练习复核交付草稿', gearId: 'review', trialActionKey: review.key,
    })
    await send(reviewContinued, { ...reviewMove, questId: rehearsal.id })
    await readUntil(reviewContinued, value => value.quest?.completed !== undefined)
    await invoke('growth-claim', reviewContinued, { id: rehearsal.id })
    const ready = await invoke('growth-opening-choices', undefined, { draft: reviewDraft })
    assert.equal(ready.stagedLevel, 3)
    assert.ok(ready.hero.level >= ready.stagedLevel)
    assert.ok(ready.choices.filter(item => reviewCombo.gearIds.includes(item.id)).every(item => item.level >= ready.stagedLevel))
    const stagePreview = () => invoke('equipment-fitting-preview', undefined, { heroId: ready.hero.id, id: 'review',
      partner: { id: quartz.id, sourceId: ready.choices.find(item => item.id === quartz.id).sourceId }, againstDraft: reviewDraft })
    const stageFitting = await stagePreview()
    const beforeStage = stageFitting.combo
    assert.ok(stageFitting.slots[0].trialActions.some(move => move.key === review.key))
    assert.ok(stageFitting.slots[1].trialActions.some(move => move.name === '用工具完成任务'))
    assert.ok(beforeStage.moveKeys.staged.includes(review.key))
    assert.deepEqual(beforeStage.levelGaps, [])
    assert.deepEqual(beforeStage.modes.find(mode => mode.id === 'staged'), { id: 'staged', flag: 'upgrade', heroXp: 0, gearXp: 16 })
    const checkCombo = { gearIds: reviewCombo.gearIds,
      questSources: { [quartz.id]: ready.choices.find(item => item.id === quartz.id).sourceId } }
    assert.deepEqual(await invoke('growth-combo-preview', undefined, { ...checkCombo, draft: reviewDraft }), beforeStage)
    assert.deepEqual(await invoke('growth-combo-preview', reviewContinued, checkCombo), beforeStage)
    await invoke('growth-combo-preview', reviewContinued, { ...checkCombo, questSources: {} }, 422)
    await invoke('growth-combo-preview', reviewContinued, { ...checkCombo, draft: reviewDraft }, 422)

    const flagUpgradePreview = await invoke('growth-flag-loadout', undefined, { id: upgraded.flag.id })
    assert.deepEqual(flagUpgradePreview.upgrade.modes.find(mode => mode.id === 'staged'),
      { id: 'staged', flag: 'upgrade', heroXp: 0, gearXp: 16 })
    const stagedUpgrade = { ...stagedLaunch, draft: flagUpgradePreview.draft, quest: { ...stagedLaunch.quest,
      upgradeFlagId: upgraded.flag.id, questSources: checkCombo.questSources } }
    await invoke('growth-open', undefined, { ...stagedUpgrade, quest: { ...stagedUpgrade.quest, upgradeFlagId: flag.id } }, 422)
    const stagedMatch = await invoke('growth-open', undefined, stagedUpgrade)
    assert.equal(stagedMatch.questError, undefined)
    assert.notEqual(stagedMatch.sessionId, reviewMatch.sessionId)
    assert.deepEqual(await invoke('growth-open', undefined, stagedUpgrade), stagedMatch)
    const stagedId = stagedMatch.sessionId
    const stagedView = await view(stagedId)
    const stagedQuestId = stagedView.quest.id
    assert.equal(stagedView.task.support, 'quartz_note')
    assert.equal(stagedView.quest.pair.find(item => item.id === quartz.id).sourceId,
      (await equipmentIn(host, stagedId)).tools.find(item => item.id === quartz.id).artSourceId)
    assert.equal(stagedView.task.target, undefined)
    const scout = { questId: stagedQuestId, input: '查找档案 A-035 的原件。' }
    await invoke('match-prompt', stagedId, { ...reviewMove, questId: stagedQuestId }, 422)
    await finish(stagedId, (await invoke('match-prompt', stagedId, scout)).text)
    assert.equal((await readUntil(stagedId, value => value.recent[0]?.turn === 1)).quest.comboFirst, undefined)
    await send(stagedId, { ...scout, input: '测试工具出错' })
    assert.deepEqual((await readUntil(stagedId, value => value.quest?.progress?.turn === 2)).quest.progress.missing, [quartz.id])
    await send(stagedId, scout)
    const { comboFirst } = (await readUntil(stagedId, value => value.quest?.comboFirst)).quest
    assert.equal(comboFirst.turn, 3)
    assert.equal((await equipmentIn(host, stagedId)).openingQuest, undefined)
    await invoke('growth-claim', stagedId, { id: stagedQuestId }, 422)

    const stagedChild = await continuation(stagedId, enhanced.presetId)
    await invoke('growth-handoff', stagedChild, { id: stagedQuestId })
    const afterScout = await view(stagedChild)
    assert.deepEqual(afterScout.quest.comboFirst, comboFirst)
    assert.equal(afterScout.task.support, undefined)
    assert.deepEqual(afterScout.task.target, { kind: 'gear', id: 'review', key: review.key })
    await invoke('match-prompt', stagedChild, scout, 422)
    const activate = { ...reviewMove, questId: stagedQuestId, input: '只复核刚刚确认的档案依据。' }
    const actionPrompt = await invoke('match-prompt', stagedChild, activate)
    assert.match(actionPrompt.text, /基于第一阶段已经取得的结果/)
    assert.ok(!actionPrompt.text.includes('请先使用当前会话的工具'))
    await send(stagedChild, activate)
    const verified = await readUntil(stagedChild, value => value.quest?.completed !== undefined)
    assert.ok(!verified.recent[0].awards.some(item => item.id === quartz.id))
    const mastered = await invoke('growth-claim', stagedChild, { id: stagedQuestId })
    assert.equal(mastered.flag.id, upgraded.flag.id)
    assert.deepEqual(mastered.flag.comboAction, upgraded.flag.comboAction)
    assert.deepEqual(mastered.flag.stagedAction.first, comboFirst)
    assert.equal(mastered.flag.stagedAction.sessionId, stagedChild)
    const [stagedReceipt] = await invoke('match-settlements', stagedChild)
    assert.deepEqual(stagedReceipt.awards.map(item => [item.id, item.xp]), [['review', 16], [quartz.id, 16]])
    assert.ok(stagedReceipt.provenLoadout)
    const provenStage = await invoke('match-proven-loadout', stagedChild, { receiptId: stagedReceipt.id })
    assert.equal(provenStage.kind, 'staged')
    assert.deepEqual(new Set(provenStage.gear.map(item => item.id)), new Set(['review', quartz.id]))
    assert.equal(provenStage.gear.find(item => item.id === quartz.id).sourceId,
      stagedView.quest.pair.find(item => item.id === quartz.id).sourceId)
    assert.ok(provenStage.draft)
    assert.match((await stagePreview()).combo.modes.find(mode => mode.id === 'staged').reason, /已经记录了分回合连携/)
    assert.deepEqual((await journal()).completed.find(item => item.id === stagedQuestId).comboAction, stagedReceipt.comboAction)
    await invoke('growth-accept', stagedChild, stagedLaunch.quest, 422)
    const practicePreview = await invoke('growth-flag-loadout', undefined, { id: mastered.flag.id })
    assert.equal(practicePreview.practice.comboActionKey, review.key)
    assert.equal(practicePreview.practice.practiceFlagId, mastered.flag.id)
    assert.equal(practicePreview.practice.staged, true)
    const practiceModes = await invoke('growth-combo-preview', undefined, { draft: practicePreview.draft,
      gearIds: practicePreview.practice.gearIds, questSources: practicePreview.practice.questSources, practiceFlagId: mastered.flag.id })
    assert.deepEqual(practiceModes.modes.find(mode => !mode.reason), { id: 'staged', flag: 'record', heroXp: 0, gearXp: 0 })
    const practiceLaunch = { draft: practicePreview.draft, workspaceId: launch.workspaceId,
      launchId: '90123456789abcde'.repeat(2), quest: { ...practicePreview.practice, title: '复练档案取证与复核' } }
    await invoke('growth-open', undefined, { ...practiceLaunch, quest: { ...practiceLaunch.quest, staged: undefined } }, 422)
    const repeated = await invoke('growth-open', undefined, practiceLaunch)
    assert.equal(repeated.questError, undefined)
    const repeatedId = repeated.sessionId
    const repeatedQuest = (await view(repeatedId)).quest
    assert.equal(repeatedQuest.comboReward.flag, 'record')
    assert.equal(repeatedQuest.comboFirst, undefined)
    await invoke('growth-claim', repeatedId, { id: repeatedQuest.id }, 422)
    await send(repeatedId, { ...scout, questId: repeatedQuest.id })
    await readUntil(repeatedId, value => value.quest?.comboFirst)
    await send(repeatedId, { ...activate, questId: repeatedQuest.id })
    await readUntil(repeatedId, value => value.quest?.completed !== undefined)
    const practiceClaim = await invoke('growth-claim', repeatedId, { id: repeatedQuest.id })
    assert.equal(practiceClaim.flag, undefined)
    assert.equal(practiceClaim.comboRepeat.id, mastered.flag.id)
    const [practiceReceipt] = await invoke('match-settlements', repeatedId)
    assert.equal(practiceReceipt.practiceFlagId, mastered.flag.id)
    assert.deepEqual(practiceReceipt.awards, [])
    assert.equal((await journal()).completed.find(item => item.id === repeatedQuest.id).practiceFlagId, mastered.flag.id)

    const providerChoice = ready.choices.find(item => item.id === quartzProvider.id)
    const prepareMove = providerChoice.trialActions.find(move => move.name === '核验装备作用')
    const audit = { targetKind: 'gear', targetId: providerChoice.id, moveId: 'gear:task', input: '列出档案插件适用的材料和待确认条件。' }
    const practice = await invoke('growth-accept', stagedChild, { mode: 'trial', title: '练习核验档案插件',
      gearId: providerChoice.id, trialActionKey: prepareMove.key })
    await send(stagedChild, { ...audit, questId: practice.id })
    await readUntil(stagedChild, value => value.quest?.completed !== undefined)
    await invoke('growth-claim', stagedChild, { id: practice.id })

    const bothPlugins = { ...stagedLaunch, launchId: '789abcdef0123456'.repeat(2), quest: { ...stagedLaunch.quest,
      title: '核验插件作用后复核交付', gearIds: [providerChoice.id, 'review'], prepareActionKey: prepareMove.key } }
    const pluginFitting = await invoke('equipment-fitting-preview', undefined, { heroId: ready.hero.id, id: providerChoice.id,
      partner: { id: 'review' }, againstDraft: reviewDraft })
    assert.ok(pluginFitting.slots[0].trialActions.some(move => move.key === bothPlugins.quest.prepareActionKey))
    assert.ok(pluginFitting.combo.moveKeys.staged.includes(bothPlugins.quest.comboActionKey))
    await invoke('growth-open', undefined, { ...bothPlugins, quest: { ...bothPlugins.quest, staged: undefined } }, 422)
    await invoke('growth-open', undefined, { ...bothPlugins, quest: { ...bothPlugins.quest, prepareActionKey: undefined } }, 422)
    await invoke('growth-open', undefined, { ...bothPlugins, quest: { ...bothPlugins.quest, prepareActionKey: review.key } }, 422)
    const { sessionId: pluginsId, questError: pluginsError } = await invoke('growth-open', undefined, bothPlugins)
    assert.equal(pluginsError, undefined)
    const plugins = await view(pluginsId)
    const pluginsQuest = plugins.quest.id
    assert.equal(plugins.task.preparing, true)
    assert.deepEqual(plugins.task.target, { kind: 'gear', id: providerChoice.id, key: prepareMove.key })
    await invoke('match-prompt', pluginsId, { ...reviewMove, questId: pluginsQuest }, 422)
    const prepareSelection = { ...audit, questId: pluginsQuest }
    assert.match((await invoke('match-prompt', pluginsId, prepareSelection)).text, /停在这里等我查看/)
    await send(pluginsId, prepareSelection, text => text + '\n（已修改）')
    assert.equal((await readUntil(pluginsId, value => value.recent[0]?.turn === 1)).quest.comboFirst, undefined)
    await send(pluginsId, prepareSelection)
    const prepared = await readUntil(pluginsId, value => value.quest?.comboFirst)
    assert.equal(prepared.quest.comboFirst.turn, 2)
    assert.deepEqual(prepared.recent[0].awards.filter(item => item.kind).map(item => [item.id, item.xp]), [[providerChoice.id, 4]])
    assert.deepEqual(prepared.task.target, { kind: 'gear', id: 'review', key: review.key })
    await invoke('match-prompt', pluginsId, prepareSelection, 422)
    await invoke('growth-claim', pluginsId, { id: pluginsQuest }, 422)
    await send(pluginsId, { ...reviewMove, questId: pluginsQuest })
    const dispatchedReview = await readUntil(pluginsId, value => value.quest?.completed === 3)
    assert.deepEqual(dispatchedReview.recent[0].awards.filter(item => item.kind).map(item => [item.id, item.xp]), [['review', 4]])
    const result = await invoke('growth-claim', pluginsId, { id: pluginsQuest })
    const [bothReceipt] = await invoke('match-settlements', pluginsId)
    assert.deepEqual(bothReceipt.awards.map(item => [item.id, item.xp]), [['fixture-foreign', 24], [providerChoice.id, 32], ['review', 32]])
    assert.deepEqual(result.flag.stagedAction.prepare, { name: prepareMove.name, gearId: providerChoice.id })
    assert.equal(result.flag.stagedAction.first.turn, 2)
    assert.equal(result.flag.stagedAction.turn, 3)
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('traced providers equip third-party, MCP and session tools on real DSH agents', { timeout: 360_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-loadout-regression-'))
  const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_LOADOUT_TEST_NODE: process.execPath }
  const patch = join(directory, 'fixture.yml')
  let host
  try {
    const external = join(directory, 'fixtures')
    await cp(fixtures, external, { recursive: true })
    const localPackage = join(external, 'node_modules', 'local-contributor')
    await mkdir(localPackage, { recursive: true })
    await writeFile(join(localPackage, 'package.json'), JSON.stringify({
      name: 'local-contributor', type: 'module', exports: { '.': './tools.mjs', './package.json': './package.json' },
      icon: './gear.svg', dsh: { loadout: { toolArt: { serpentine_index: './index.webp' },
        roles: { heroes: { 'fixture-foreign': ['guard', 'scout'] }, tools: { serpentine_index: ['scout'] } }, portraits: {
        'fixture-foreign': './hero.webp', 'fixture-native-kit': '../outside.webp',
      }, actions: {
        heroes: {
          'fixture-foreign': [
            { id: 'gather', name: '补齐档案证据', detail: '先确认档案缺哪些材料。', instruction: '列出需要补齐的档案证据。' },
            { id: 'hold', name: '暂缓移交', detail: '写清暂缓原因。', instruction: '记录暂缓移交的理由。', requiresInput: true },
          ],
          'recruiting-advisor': [{ id: 'foreign-hero', name: '外部英雄操作', instruction: '列出档案内容。' }],
        },
        equipment: [
          { id: 'audit', name: '复核档案索引', detail: '复核索引与原文的对应关系。', instruction: '检查档案索引的记录。' },
          { id: 'malformed', name: '无效操作', instruction: false },
        ],
        tools: {
          serpentine_index: [
            { id: 'cross-check', name: '核对索引出处', instruction: '使用索引核对给定出处。', requiresInput: true },
          ],
          fixture_orchard_selection: [
            { id: 'branch-evidence', name: '核对果园出处', instruction: '使用果园记录核对补充材料的来源。', requiresInput: true },
          ],
        },
      } } },
    }))
    await cp(join(external, 'local-module.mjs'), join(localPackage, 'tools.mjs'))
    await cp(join(external, 'profile-orchard.mjs'), join(localPackage, 'profile-orchard.mjs'))
    await writeFile(join(localPackage, 'profile-actions.mjs'), 'export function apply() {}\n')
    await cp(new URL('../art/guest-heroes.webp', import.meta.url), join(localPackage, 'hero.webp'))
    await cp(new URL('../art/equipment.webp', import.meta.url), join(localPackage, 'index.webp'))
    await cp(new URL('../art/heroes.webp', import.meta.url), join(external, 'node_modules', 'outside.webp'))
    await writeFile(join(localPackage, 'gear.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#9ad9e7" d="M16 2L29 15 16 30 3 15z"/></svg>')
    const groupedName = 'fixture_grouped_orchard'
    const groupedBranches = [['north', '核对北区原始记录'], ['south', '核对南区原始记录']]
    const groupedProviders = await Promise.all(groupedBranches.map(async ([branch, label]) => {
      const path = join(external, 'orchard-' + branch)
      await mkdir(path)
      await cp(join(external, 'profile-orchard.mjs'), join(path, 'orchard.mjs'))
      if (branch === 'north') await cp(new URL('../art/equipment.webp', import.meta.url), join(path, 'orchard.webp'))
      await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'orchard-' + branch, type: 'module',
        dsh: { loadout: { ...(branch === 'north' && { toolArt: { [groupedName]: './orchard.webp' } }), actions: { tools: { [groupedName]: [
          { id: 'source-audit', name: label, instruction: label + '。', requiresInput: true },
        ] } } } } }))
      return { id: branch, name: './orchard-' + branch + '/orchard.mjs',
        config: { branch, names: [groupedName], trigger: 'fixture grouped orchard ' + branch } }
    }))
    const groupIdForOrchard = 'fixture-orchard-pair'
    const groupedPresetId = 'fixture-orchard-custodian'
    await writeFile(join(external, 'grouped-preset.mjs'), `
      export const inject = ['agentPresets']
      export async function apply(ctx) {
        const declaring = ctx.extend({ baseUrl: new URL('.', import.meta.url).href })
        const dispose = await declaring.agentPresets.register(${JSON.stringify({
        id: groupedPresetId, name: '果园档案员', plugins: [
          { id: groupIdForOrchard, name: 'cordis:group', group: true, config: groupedProviders },
        ],
      })})
        ctx.effect(() => dispose)
      }
    `)
    await writeFile(patch, JSON.stringify([{ insert: [
      { id: 'loadout-fixture', name: join(external, 'preset.mjs') },
      { id: 'fixture-publisher-profile', name: join(localPackage, 'profile-actions.mjs') },
      { id: 'fixture-grouped-preset', name: join(external, 'grouped-preset.mjs') },
      ...['north', 'south'].map(branch => ({
        id: 'fixture-orchard-' + branch, name: join(localPackage, 'profile-orchard.mjs'), config: { branch },
      })),
    ] }]))
    await exec(binary, ['plugin', '--profile', 'web', 'add', '-w', packagePath], { env, cwd: directory })
    const standalone = join(directory, 'standalone')
    const standaloneName = 'dsh-loadout-standalone-fixture'
    await mkdir(standalone)
    await writeFile(join(standalone, 'package.json'), JSON.stringify({
      name: standaloneName, version: '1.0.0', type: 'module', exports: './index.mjs',
    }))
    await cp(join(external, 'standalone-tool.mjs'), join(standalone, 'index.mjs'))
    await exec(binary, ['plugin', '--profile', 'web', 'add', '-w', 'file:' + standalone], { env, cwd: directory })
    const growthDirectory = join(env.DSH_HOME, 'profiles', 'web', 'agent-loadouts')
    await mkdir(growthDirectory, { recursive: true })
    await writeFile(join(growthDirectory, 'progress.json'), JSON.stringify({ version: 1, heroes: {
      'fixture-foreign': { id: 'fixture-foreign', name: '外部预设', xp: 24 },
    }, gear: {}, sessions: {}, recent: [{ id: 'legacy:7', sessionId: 'legacy-growth-receipt', turn: 1,
      awards: [{ id: 'fixture-foreign', name: '外部预设', xp: 12, level: 2, leveled: true }] }] }))
    host = await startHost(env, patch)
    const initial = (await host.request(endpoint)).value
    const source = initial.presets.find(preset => preset.id === 'fixture-foreign')
    assert.ok(source && !source.broken, source?.broken)
    assert.equal(source.rank.level, 2)
    assert.deepEqual(source.roles, ['guard', 'scout'])
    assert.deepEqual(source.packageMoves.map(([name]) => name), ['补齐档案证据', '暂缓移交'])
    assert.match(source.art, /\?portrait=/)
    const publishedPortrait = await host.requestRaw(source.art)
    assert.equal(publishedPortrait.status, 200)
    assert.equal(publishedPortrait.headers.get('content-type'), 'image/webp')
    assert.equal(initial.presets.find(preset => preset.id === 'fixture-native-kit').art, undefined)
    const odd = initial.equipment.find(item => item.name === 'quartz_note')
    const target = initial.presets.find(preset => preset.id === 'recruiting-advisor')
    const compare = async (presetId, equipmentIds, options) =>
      (await host.request(endpoint, { action: 'compare', presetId, equipmentIds, ...options })).value
    const readActions = async (kind, id) => (await host.request(endpoint, { action: 'actions-read', kind, id })).value
    const addAction = async (kind, id, name, extra = {}) => (await host.request(endpoint, {
      action: 'actions-save', kind, id, revision: '',
      actions: [{ name, detail: '检查示例来源。', instruction: '列出两条可核查的来源。', ...extra }],
    })).value
    const importedGroup = initial.equipment.find(item => item.name === 'fixture-isolated-group')
    const hostPlugin = initial.equipment.find(item => item.kind === 'host' && item.module.endsWith('/preset.mjs'))
    const enabledBundle = initial.equipment.find(item => item.kind === 'bundle' && item.enabled)
    const heroAction = await addAction('hero', source.id, '检查工作依据', { requiresInput: true })
    const pluginAction = await addAction('gear', importedGroup.id, '复核插件记录')
    const toolAction = await addAction('gear', odd.id, '查询记录来源')
    await addAction('gear', hostPlugin.id, '检查 Profile 记录')
    await addAction('gear', enabledBundle.id, '检查组合包')
    await host.request(endpoint, { action: 'actions-save', kind: 'hero', id: source.id, revision: '', actions: [] }, 422)
    const actionPreview = await compare(source.id, [], { againstPresetId: target.id })
    assert.ok(actionPreview.gained.some(card => card.decisions?.some(([name]) => name === '检查工作依据')))
    assert.ok(actionPreview.gained.some(card => card.decisions?.some(([name]) => name === '复核插件记录')))
    assert.ok(actionPreview.gained.some(card => card.decisions?.some(([name]) => name === '补齐档案证据')))
    assert.ok(actionPreview.lost.some(card => card.decisions?.some(([name]) => name === '区分证据与判断')))
    const heroOpening = (await host.request(endpoint, { action: 'growth-opening-choices', draft: { presetId: source.id, equipmentIds: [] } })).value
    const describedOpening = (await host.request(endpoint, { action: 'growth-opening-choices',
      draft: { presetId: source.id, equipmentIds: [] }, describe: true })).value
    const describedHeroMove = describedOpening.heroActions.find(move => move.name === '检查工作依据')
    assert.equal(describedHeroMove.detail, '检查示例来源。')
    assert.equal(describedHeroMove.requiresInput, true)
    assert.equal(describedHeroMove.key, heroOpening.heroActions.find(move => move.name === describedHeroMove.name).key)
    assert.equal(Object.hasOwn(describedHeroMove, 'instruction'), false)
    const updatedHero = (await host.request(endpoint)).value.presets.find(item => item.id === source.id)
    for (const name of ['补齐档案证据', '检查工作依据']) {
      const card = actionPreview.gained.find(item => item.decisions?.some(([label]) => label === name))
      const index = card.decisions.findIndex(([label]) => label === name)
      const rosterIndex = [...updatedHero.heroMoves, ...updatedHero.packageMoves].findIndex(([label]) => label === name)
      const key = heroOpening.heroActions.find(item => item.name === name).key
      assert.equal(card.deliveryHero.id, source.id)
      assert.equal(card.decisionDeliveries[index], key)
      assert.equal(updatedHero.heroActionKeys[rosterIndex], key)
    }
    assert.ok(actionPreview.lost.every(card => card.decisionDeliveries === undefined))
    const peerTool = initial.equipment.find(item => item.name === 'peer_ledger_marker')
    const uploadArt = (kind, id, body) => host.requestRaw(endpoint + '/art/upload?' + new URLSearchParams({ kind, id }), {
      method: 'POST', headers: { 'content-type': 'image/webp' }, body,
    })
    const portrait = await readFile(new URL('../art/guest-heroes.webp', import.meta.url))
    const icon = await readFile(new URL('../art/gear-collection.webp', import.meta.url))
    assert.equal((await uploadArt('hero', 'unknown-hero', portrait)).status, 422)
    assert.equal((await uploadArt('hero', target.id, Buffer.from('<svg/>'))).status, 422)
    for (const [kind, id, bytes] of [['hero', target.id, portrait], ['gear', peerTool.id, icon]]) {
      const upload = await uploadArt(kind, id, bytes)
      assert.equal(upload.status, 200, await upload.text())
    }
    const customArt = (await host.request(endpoint)).value
    const heroArt = customArt.presets.find(preset => preset.id === target.id).art
    const toolArt = customArt.equipment.find(item => item.id === peerTool.id).art
    for (const ref of [heroArt, toolArt]) {
      assert.match(ref, /^\/api\/agent-loadout\/art\?key=/)
      const image = await host.requestRaw(ref)
      assert.equal(image.status, 200)
      assert.equal(image.headers.get('content-type'), 'image/webp')
      assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(Buffer.from(await image.arrayBuffer()).toString('ascii', 8, 12), 'WEBP')
    }
    assert.deepEqual(target.tools[peerTool.id].dependencies, ['peer-ledger', 'peer-seed'],
      JSON.stringify({ status: target.tools[peerTool.id], source: initial.presets.find(preset => preset.id === 'fixture-peers')?.broken }))
    const peerPreview = await compare(target.id, [peerTool.id, 'evidence'])
    const evidencePreview = peerPreview.gained.find(card => card.id === 'evidence')
    assert.deepEqual(evidencePreview.decisions.map(([decision]) => decision), ['继续补证', '降级推荐', '暂缓提交'])
    const evidenceOpening = (await host.request(endpoint, { action: 'growth-opening-choices', draft: { presetId: target.id, equipmentIds: [peerTool.id, 'evidence'] } })).value
    const evidenceChoices = evidenceOpening.choices.find(item => item.id === 'evidence').trialActions
    assert.deepEqual(evidencePreview.decisionTrials, evidencePreview.decisions.map(([name]) => evidenceChoices.find(move => move.name === name).key))
    assert.ok(peerPreview.gained.some(card => card.name === 'peer_ledger_marker' && card.art === toolArt))
    for (const dependency of ['peer-ledger', 'peer-seed']) {
      assert.ok(peerPreview.gained.some(card => card.kind === 'plugin' && card.name === dependency))
    }
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), initial.saved.map(item => item.id))
    const peerBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [peerTool.id] })).value
    const peerSource = await host.request('/api/loadout-fixture-session', { presetId: 'fixture-peers', runtimePlugin: 'parent-peer' })
    const peerTarget = await host.request('/api/loadout-fixture-session', { presetId: peerBuild.presetId })
    const peerAppearance = await equipmentIn(host, peerTarget.sessionId)
    assert.equal(peerAppearance.heroArt, heroArt)
    assert.equal(peerAppearance.tools.find(tool => tool.id === peerTool.id).art, toolArt)
    const readLedger = ({ sessionId }, tool = peerTool.name) => host.request('/api/loadout-fixture-session-key', { sessionId, tool })
    const [sourceLedger, targetLedger] = await Promise.all([readLedger(peerSource), readLedger(peerTarget)])
    assert.match(sourceLedger.value, /^[a-f0-9-]{36}$/)
    assert.match(targetLedger.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(sourceLedger.value, targetLedger.value)
    const peerClone = (await host.request(endpoint, { presetId: 'fixture-peers', equipmentIds: ['evidence'] })).value
    const cloneSession = await host.request('/api/loadout-fixture-session', { presetId: peerClone.presetId })
    const clonedLedger = await readLedger(cloneSession)
    assert.match(clonedLedger.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(clonedLedger.value, sourceLedger.value)
    assert.notEqual(clonedLedger.value, targetLedger.value)
    assert.equal(target.tools[odd.id].state, 'available')
    assert.equal(target.tools[odd.id].equipId, initial.equipment.find(item => item.name === 'fixture-isolated-group').id)
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + source.id)).includes('standing_annotation'))
    const contextTools = ['first_context_marker', 'second_context_marker'].map(name => initial.equipment.find(item => item.name === name))
    const contextProviders = contextTools.map(tool => initial.equipment.find(item => item.id === target.tools[tool.id].equipId))
    assert.notEqual(contextProviders[0].id, contextProviders[1].id)
    assert.deepEqual(contextProviders.map(item => item.name), [
      '外部预设 · fixture-context-resource', '第二个 MCP 预设 · fixture-context-resource',
    ])
    const fromBothBases = (await host.request(endpoint, { presetId: target.id, equipmentIds: contextTools.map(tool => tool.id) })).value
    const bothMarkers = await host.request('/api/loadout-fixture-tools?id=' + fromBothBases.presetId)
    for (const tool of contextTools) assert.ok(bothMarkers.includes(tool.name))

    const customInput = { title: '星轨注释仪', directory: external, text: `
- insert:
    - name: cordis:group
      group: true
      isolate:
        fixtureCompass: true
      config:
        - name: ./compass.mjs
        - name: ./session-addon.mjs
          config:
            resource: ./session-note.txt
            toolName: armory_annotation
` }
    const customReview = (await host.request(endpoint, { action: 'equipment-review', ...customInput })).value
    assert.deepEqual(customReview.modules, ['./compass.mjs', './session-addon.mjs'])
    assert.equal(customReview.title, customInput.title)
    assert.ok(!(await host.request(endpoint)).value.equipment.some(item => item.id === customReview.id))
    await host.request(endpoint, { action: 'equipment-save', ...customInput, reviewedId: odd.id }, 422)
    await host.request(endpoint, { action: 'equipment-save', ...customInput, reviewedId: customReview.id })
    const armed = (await host.request(endpoint, { presetId: target.id, equipmentIds: [customReview.id] })).value
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + armed.presetId)).includes('armory_annotation'))
    assert.ok(!(await host.request('/api/loadout-fixture-tools?id=' + target.id)).includes('armory_annotation'))
    const armedSession = await host.request('/api/loadout-fixture-session', { presetId: armed.presetId })
    const armedEquipment = await equipmentIn(host, armedSession.sessionId)
    const armedPlugin = armedEquipment.plugins.find(plugin => plugin.id === customReview.id)
    const armedTool = armedEquipment.tools.find(tool => tool.name === 'armory_annotation')
    assert.equal(armedPlugin?.state, 'ready')
    assert.equal(armedTool?.state, 'ready')
    assert.deepEqual(armedTool.roles, ['scout'])
    assert.deepEqual(armedPlugin.roles, armedTool.roles)
    const armoryCatalog = (await host.request(endpoint)).value
    const armoryTool = armoryCatalog.equipment.find(item => item.name === 'armory_annotation')
    const standardWithArmory = armoryCatalog.presets.find(preset => preset.id === 'standard')
    assert.deepEqual(armoryTool.roles, armedTool.roles)
    assert.deepEqual(armoryCatalog.equipment.find(item => item.id === customReview.id).roles, armedTool.roles)
    assert.equal(standardWithArmory.tools[armoryTool.id].equipId, customReview.id)
    const crossHero = (await host.request(endpoint, { presetId: standardWithArmory.id, equipmentIds: [armoryTool.id] })).value
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + crossHero.presetId)).includes('armory_annotation'))

    const standaloneInput = { title: '星标', text: JSON.stringify({ name: standaloneName, config: { marker: 'sky' } }) }
    const standaloneReview = (await host.request(endpoint, { action: 'equipment-review', ...standaloneInput })).value
    await host.request(endpoint, { action: 'equipment-save', ...standaloneInput, reviewedId: standaloneReview.id })
    const standaloneBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [standaloneReview.id] })).value
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + standaloneBuild.presetId)).includes('standalone_skymark'))
    const unresolvedInput = { title: '待安装模块', directory: external, text: './uninstalled-fixture.mjs' }
    const unresolved = (await host.request(endpoint, { action: 'equipment-review', ...unresolvedInput })).value
    await host.request(endpoint, { action: 'equipment-save', ...unresolvedInput, reviewedId: unresolved.id })
    await host.request(endpoint, { presetId: target.id, equipmentIds: [unresolved.id] }, 422)
    assert.ok(!(await host.request(endpoint)).value.saved.some(build => build.equipmentIds.includes(unresolved.id)))

    const composed = (await host.request(endpoint, { presetId: target.id, equipmentIds: [odd.id] })).value
    const staticTools = await host.request('/api/loadout-fixture-tools?id=' + composed.presetId)
    assert.ok(staticTools.includes('quartz_note'))
    assert.ok(staticTools.includes('standing_annotation'))
    assert.ok(!staticTools.includes('celestial_ledger'))

    const local = initial.equipment.find(item => item.name === 'serpentine_index')
    assert.equal(target.tools[local.id].state, 'available')
    assert.equal(target.tools[local.id].packageMoves[0][0], '核对索引出处')
    const publisher = initial.equipment.find(item => item.kind === 'host' && item.module.endsWith('/profile-actions.mjs'))
    assert.equal(publisher.packageMoves[0][0], '复核档案索引')
    const localGear = initial.equipment.find(item => item.kind === 'plugin' && item.name === 'local-contributor')
    assert.deepEqual(localGear.packageMoves.map(([name]) => name), ['复核档案索引'])
    assert.match(local.art, /\?equipment=/)
    assert.equal(target.tools[local.id].art, local.art)
    const toolImage = await host.requestRaw(local.art)
    assert.equal(toolImage.status, 200)
    assert.equal(toolImage.headers.get('content-type'), 'image/webp')
    assert.notEqual(local.art, localGear.art)
    const packagedIcon = await host.requestRaw(localGear.art)
    assert.equal(packagedIcon.headers.get('content-type'), 'image/svg+xml')
    assert.match(packagedIcon.headers.get('content-security-policy'), /^sandbox;/)
    assert.match(await packagedIcon.text(), /#9ad9e7/)
    assert.equal((await host.requestRaw(endpoint + '/art?portrait=..%2Foutside.webp')).status, 404)
    const externalBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [local.id] })).value
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + externalBuild.presetId)).includes('serpentine_index'))
    const artSession = await host.request('/api/loadout-fixture-session', { presetId: source.id })
    const artSnapshot = await equipmentIn(host, artSession.sessionId)
    assert.equal(artSnapshot.heroArt, source.art)
    assert.equal(artSnapshot.tools.find(item => item.id === local.id).art, local.art)
    assert.deepEqual(artSnapshot.heroRoles, source.roles)
    assert.deepEqual(artSnapshot.tools.find(item => item.id === local.id).roles, ['scout'])
    const packagedDraft = await compare(source.id, [])
    assert.equal(packagedDraft.after.art, source.art)
    const packagedGear = await compare(target.id, [local.id])
    assert.equal(packagedGear.gained.find(item => item.id === local.id).art, local.art)
    assert.equal((await uploadArt('hero', source.id, portrait)).status, 200)
    assert.match((await equipmentIn(host, artSession.sessionId)).heroArt, /\?key=/)
    await host.request(endpoint, { action: 'art-reset', kind: 'hero', id: source.id })
    assert.equal((await equipmentIn(host, artSession.sessionId)).heroArt, source.art)
    await host.request(turnEndpoint, { sessionId: artSession.sessionId, text: '请使用当前会话的工具 "serpentine_index" 读取示例档案' })
    const nativeGear = artSnapshot.tools.find(item => item.id === local.id)
    const artReport = (await host.request(endpoint, { action: 'match-report', sessionId: artSession.sessionId })).value
    const artCall = artReport.turns[0].entries.find(item => item.id === local.id)
    assert.equal(artCall.art, local.art)
    assert.equal(artCall.sourceId, nativeGear.artSourceId)
    const artSettlement = (await host.request(endpoint, { action: 'match-settlements', sessionId: artSession.sessionId })).value[0]
    assert.equal(artSettlement.awards.find(item => item.id === local.id).art, local.art)
    assert.equal(artSettlement.awards.find(item => item.id === source.id).art, source.art)

    const archive = initial.equipment.find(item => item.name === 'mcp__archive__read_marker')
    assert.equal(source.tools[archive.id].state, 'available')
    assert.equal(source.tools[archive.id].replaceId, undefined)
    assert.deepEqual(archive.roles, ['scout'])
    assert.deepEqual(source.tools[archive.id].roles, archive.roles)
    const archiveHero = initial.presets.find(item => item.id === 'fixture-mcp')
    assert.ok(archiveHero.roles.includes('scout'))
    const dual = (await host.request(endpoint, { presetId: source.id, equipmentIds: [archive.id] })).value
    const mcpTools = await host.request('/api/loadout-fixture-tools?id=' + dual.presetId)
    assert.ok(mcpTools.includes('mcp__archive__read_marker'))
    assert.ok(mcpTools.includes('mcp__observatory__read_marker'))
    assert.ok(mcpTools.includes('standing_annotation'))
    const switchMcp = await compare('fixture-mcp', [], { againstPresetId: source.id })
    assert.equal(switchMcp.before.id, source.id)
    assert.equal(switchMcp.after.id, 'fixture-mcp')
    assert.ok(switchMcp.gained.some(card => card.name === 'mcp__archive__read_marker'))
    assert.ok(switchMcp.lost.some(card => card.name === 'mcp__observatory__read_marker'))
    const bothMcp = await compare(source.id, [archive.id])
    assert.ok(bothMcp.gained.some(card => card.id === archive.id))
    assert.ok(!bothMcp.lost.some(card => card.name === 'mcp__observatory__read_marker'))
    const own = (hero, name) => Object.entries(hero.builtIn).find(([, item]) => item.name === name)
    const [groupId] = own(source, 'fixture-isolated-group')
    assert.equal(source.tools[odd.id].includedBy, groupId)
    const removedSelection = { presetId: source.id, equipmentIds: [archive.id], removedEquipmentIds: [groupId] }
    const withoutGroup = await compare(source.id, [archive.id], { removedEquipmentIds: [groupId] })
    assert.equal(withoutGroup.before.id, withoutGroup.after.id)
    assert.ok(withoutGroup.gained.some(card => card.id === archive.id))
    assert.ok(withoutGroup.lost.some(card => card.id === groupId))
    assert.ok(withoutGroup.lost.some(card => card.id === odd.id))
    const beforeDraftComparison = (await host.request(endpoint)).value.saved.map(item => item.id)
    const switchFromDraft = await compare('fixture-mcp', [], { againstDraft: removedSelection })
    assert.equal(switchFromDraft.before.id, source.id)
    assert.equal(switchFromDraft.after.id, 'fixture-mcp')
    assert.ok(!switchFromDraft.gained.some(card => card.id === archive.id))
    assert.ok(!switchFromDraft.lost.some(card => card.id === groupId || card.id === odd.id))
    assert.ok(switchFromDraft.lost.some(card => card.name === 'mcp__observatory__read_marker'))
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), beforeDraftComparison)
    const editedBuild = (await host.request(endpoint, removedSelection)).value
    const reducedSession = await host.request('/api/loadout-fixture-session', { presetId: editedBuild.presetId })
    const editedGear = await equipmentIn(host, reducedSession.sessionId)
    assert.equal(editedGear.heroId, source.id)
    assert.deepEqual(editedGear.removedEquipmentLabels, { [groupId]: 'fixture-isolated-group' })
    assert.deepEqual(editedGear.tools.find(tool => tool.id === archive.id)?.roles, archive.roles)
    assert.ok(editedGear.tools.some(tool => tool.name === 'serpentine_index'))
    assert.ok(editedGear.tools.some(tool => tool.name === 'mcp__observatory__read_marker'))
    assert.ok(!editedGear.tools.some(tool => tool.id === odd.id || tool.name === 'standing_annotation'))
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + source.id)).includes('standing_annotation'))
    await host.request(endpoint, { ...removedSelection, removedEquipmentIds: [archive.id] }, 422)
    const [personaId, persona] = Object.entries(target.builtIn).find(([id]) =>
      initial.equipment.find(item => item.id === id)?.modules.includes('@deepseek-ai/dsh-persona'))
    assert.match(persona.locked, /身份指引/)
    await host.request(endpoint, { presetId: target.id, equipmentIds: [], removedEquipmentIds: [personaId] }, 422)

    const standardHero = initial.presets.find(hero => hero.id === 'standard')
    const featuredWeb = standardHero.tools.web
    const [stockWebId] = featuredWeb.availableAfterRemoving
    assert.equal(featuredWeb.state, 'available')
    assert.deepEqual(featuredWeb.replacement.remove, [stockWebId])
    const fitting = fields => host.request(endpoint, { action: 'equipment-fitting-preview', ...fields })
    const { value: webFitting } = await fitting({ id: 'web', heroId: standardHero.id,
      againstDraft: { presetId: standardHero.id, equipmentIds: ['evidence'] } })
    assert.deepEqual(webFitting.draft, { presetId: standardHero.id, equipmentIds: ['evidence', 'web'],
      equipmentSources: {}, removedEquipmentIds: [stockWebId] })
    assert.deepEqual(webFitting.removed, [standardHero.builtIn[stockWebId].name])
    assert.ok(webFitting.comparison.gained.some(item => item.id === 'web' && item.kind === 'effect'))
    assert.ok(!webFitting.comparison.lost.some(item => item.id === 'evidence'))
    await host.request(endpoint, { presetId: 'standard', equipmentIds: ['web'] }, 422)
    const withoutWeb = { presetId: 'standard', equipmentIds: [], removedEquipmentIds: [stockWebId] }
    const removeWeb = (await host.request(endpoint, withoutWeb)).value
    const webDraft = { ...withoutWeb, equipmentIds: ['web'] }
    const replacementWeb = (await host.request(endpoint, webDraft)).value
    const removedTools = await host.request('/api/loadout-fixture-tools?id=' + removeWeb.presetId)
    const restoredTools = await host.request('/api/loadout-fixture-tools?id=' + replacementWeb.presetId)
    assert.ok(!removedTools.includes('web_search'))
    assert.ok(restoredTools.includes('web_search'))
    const { sessionId: webSession } = await host.request('/api/loadout-fixture-session', { presetId: replacementWeb.presetId })
    const webRequest = randomUUID()
    const { value: flaggedWeb } = await host.request(endpoint, { action: 'match-record', sessionId: webSession,
      requestId: webRequest, equipmentId: 'web', moveId: 'flag', input: '标注待核实出处。' })
    await host.request(turnEndpoint, { sessionId: webSession, text: flaggedWeb.text, requestId: webRequest })
    const savedBeforeWebPreview = (await host.request(endpoint)).value.saved.map(item => item.id)
    const { value: webPairing } = await host.request(endpoint, { action: 'equipment-pairing-preview',
      id: 'web', heroId: standardHero.id, againstDraft: { presetId: standardHero.id, equipmentIds: [] } })
    assert.equal(webPairing.placement, 'selected')
    assert.deepEqual(webPairing.draft, { ...webDraft, equipmentSources: {} })
    assert.ok(webPairing.removed.includes(standardHero.builtIn[stockWebId].name))
    assert.ok(webPairing.comparison.gained.some(item => item.id === 'web' && item.kind === 'effect'))
    const webOpening = { action: 'growth-opening-choices', restoreGear: [{ id: 'web' }] }
    const { value: webChoices } = await host.request(endpoint, { ...webOpening,
      draft: { presetId: standardHero.id, equipmentIds: ['evidence'] } })
    const webRepair = webChoices.repairs[0].repair
    assert.deepEqual(webRepair.draft, { ...webDraft, equipmentIds: ['evidence', 'web'], equipmentSources: {} })
    assert.deepEqual(webRepair.removed, [standardHero.builtIn[stockWebId].name])
    assert.deepEqual(webRepair.restored, [])
    const { value: webReady } = await host.request(endpoint, { ...webOpening, draft: webRepair.draft })
    assert.deepEqual(webReady.repairs, [{ id: 'web' }])
    assert.ok(webReady.choices.some(item => item.id === 'web' && item.trialActions.some(action => action.name === '标记待核实')))
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), savedBeforeWebPreview)

    const nativeKit = initial.presets.find(hero => hero.id === 'fixture-native-kit')
    const [nativeKitId, nativeKitEntry] = own(nativeKit, 'fixture-native-equipment')
    const [dependentKitId] = own(nativeKit, 'peer-tool')
    assert.deepEqual(nativeKitEntry.linked, [dependentKitId])
    const alternateNote = initial.equipment.find(item => item.name === 'fixture_standing_note')
    assert.ok(alternateNote && nativeKit.tools[alternateNote.id].state === 'included')
    const [spareNote] = nativeKit.tools[alternateNote.id].sourceChoices
    assert.equal(spareNote.sourceName, 'standing-variant')
    assert.deepEqual(spareNote.replacement, { tools: [alternateNote.name], remove: [nativeKitId] })
    assert.deepEqual(nativeKit.tools[spareNote.equipId].replacement, spareNote.replacement)
    assert.ok(initial.standingClaims[nativeKitId].some(claim => claim.name === alternateNote.name && claim.provider === nativeKitId))
    assert.deepEqual(initial.standingClaims[spareNote.equipId], [{ name: alternateNote.name, provider: spareNote.equipId }])
    const replaceNote = { presetId: nativeKit.id, equipmentIds: [alternateNote.id],
      equipmentSources: { [alternateNote.id]: spareNote.sourceId } }
    const confirmReplacement = { ...replaceNote, removedEquipmentIds: [nativeKitId] }
    assert.deepEqual((await host.request(endpoint, { action: 'equipment-field-heroes', id: alternateNote.id })).value.heroes, [])
    const savedBeforeFitting = (await host.request(endpoint)).value.saved.map(item => item.id)
    const noteFitting = { id: alternateNote.id, heroId: nativeKit.id, sourceId: spareNote.sourceId }
    const { value: newFitting } = await fitting({ ...noteFitting, againstDraft: { presetId: standardHero.id, equipmentIds: [] } })
    assert.deepEqual(newFitting.draft, confirmReplacement)
    assert.equal(newFitting.placement, 'selected')
    assert.deepEqual(newFitting.removed, ['fixture-native-equipment', 'peer-tool'])
    assert.equal(newFitting.item.sourceName, spareNote.sourceName)
    const { value: comboFitting } = await fitting({ ...noteFitting, partner: { id: 'review' },
      againstDraft: { presetId: nativeKit.id, equipmentIds: ['evidence'] } })
    assert.deepEqual(comboFitting.draft.equipmentIds, ['evidence', alternateNote.id, 'review'])
    assert.deepEqual(comboFitting.draft.equipmentSources, { [alternateNote.id]: spareNote.sourceId })
    assert.deepEqual(comboFitting.removed, newFitting.removed)
    assert.deepEqual(comboFitting.slots.map(slot => [slot.item.id, slot.item.sourceId, slot.placement]),
      [[alternateNote.id, spareNote.sourceId, 'selected'], ['review', undefined, 'selected']])
    const auxiliary = initial.equipment.find(item => item.name === 'fixture_standing_aux')
    const { value: conflictFitting } = await fitting({ ...noteFitting, partner: { id: auxiliary.id, sourceId: nativeKitId } })
    assert.equal(conflictFitting.draft, undefined)
    assert.match(conflictFitting.unavailable, /fixture_standing_aux|fixture_standing_note/)
    await host.request(endpoint, { action: 'equipment-fitting-preview', ...noteFitting,
      partner: { id: alternateNote.id, sourceId: nativeKitId } }, 422)
    const { value: pluginFitting } = await fitting({ id: spareNote.equipId, heroId: nativeKit.id })
    assert.deepEqual(pluginFitting.draft.equipmentIds, [spareNote.equipId])
    assert.deepEqual(pluginFitting.removed, newFitting.removed)
    const originalDraft = { presetId: target.id, equipmentIds: ['evidence', nativeKitId], equipmentSources: {} }
    const { value: draftFitting } = await fitting({ id: spareNote.equipId, heroId: target.id, againstDraft: originalDraft })
    assert.deepEqual(draftFitting.draft.equipmentIds, ['evidence', spareNote.equipId])
    assert.deepEqual(draftFitting.draft.removedEquipmentIds, [])
    assert.deepEqual(draftFitting.removed, ['fixture-native-equipment'])
    assert.ok(draftFitting.comparison.sourceChanges.some(item => item.name === alternateNote.name && item.sourceId === spareNote.sourceId))
    assert.ok(draftFitting.comparison.lost.some(item => item.name === auxiliary.name))
    const pinnedDraft = { presetId: target.id, equipmentIds: ['evidence', alternateNote.id],
      equipmentSources: { [alternateNote.id]: nativeKitId } }
    const { value: pinnedFitting } = await fitting({ id: spareNote.equipId, heroId: target.id, againstDraft: pinnedDraft })
    assert.deepEqual(pinnedFitting.draft.equipmentIds, draftFitting.draft.equipmentIds)
    assert.deepEqual(pinnedFitting.draft.equipmentSources, {})
    assert.deepEqual(pinnedFitting.removed, [alternateNote.name])
    const implicitDraft = { presetId: target.id, equipmentIds: ['evidence', auxiliary.id] }
    const { value: implicitFitting } = await fitting({ id: spareNote.equipId, heroId: target.id, againstDraft: implicitDraft })
    assert.deepEqual(implicitFitting.draft.equipmentIds, draftFitting.draft.equipmentIds)
    assert.deepEqual(implicitFitting.removed, [auxiliary.name])
    const { value: sameToolFitting } = await fitting({ ...noteFitting, heroId: target.id, againstDraft: pinnedDraft })
    assert.deepEqual(sameToolFitting.draft.equipmentIds, pinnedDraft.equipmentIds)
    assert.deepEqual(sameToolFitting.draft.equipmentSources, { [alternateNote.id]: spareNote.sourceId })
    assert.deepEqual(sameToolFitting.removed, [])
    assert.ok(sameToolFitting.comparison.lost.some(item => item.name === auxiliary.name))
    const portraitTool = hero => hero.outfit.find(item => item.id === alternateNote.id)
    assert.equal(portraitTool(sameToolFitting.comparison.before).sourceId, nativeKitId)
    assert.equal(portraitTool(sameToolFitting.comparison.after).sourceId, spareNote.sourceId)
    assert.equal(portraitTool(sameToolFitting.comparison.after).sourceName, spareNote.sourceName)
    assert.deepEqual(portraitTool(sameToolFitting.comparison.after).roles,
      target.tools[alternateNote.id].sourceChoices.find(option => option.sourceId === spareNote.sourceId).roles)
    const { value: conflictingPair } = await fitting({ id: spareNote.equipId, heroId: target.id,
      partner: { id: auxiliary.id, sourceId: nativeKitId }, againstDraft: originalDraft })
    assert.equal(conflictingPair.draft, undefined)
    assert.match(conflictingPair.unavailable, /fixture_standing_aux|standing-variant/)
    const { value: originalFitting } = await fitting({ ...noteFitting, sourceId: nativeKitId, againstDraft: confirmReplacement })
    assert.equal(originalFitting.placement, 'included')
    assert.deepEqual(originalFitting.draft.equipmentIds, [])
    assert.deepEqual(originalFitting.restored, ['fixture-native-equipment', 'peer-tool'])
    const { value: missingFitting } = await fitting({ ...noteFitting, sourceId: 'plugin:000000000000000000000000' })
    assert.equal(missingFitting.draft, undefined)
    assert.ok(missingFitting.unavailable)
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), savedBeforeFitting)
    assert.match((await host.request(endpoint, replaceNote, 422)).error.message, /fixture_standing_note.*fixture-native-equipment/)
    await host.request(endpoint, { presetId: nativeKit.id, equipmentIds: [spareNote.equipId] }, 422)
    await host.request(endpoint, { action: 'compare', ...replaceNote }, 422)
    assert.match((await host.request(endpoint, { presetId: target.id, equipmentIds: [nativeKitId, spareNote.equipId] }, 422))
      .error.message, /都会注册/)
    const replacementPreview = (await host.request(endpoint, { action: 'compare', ...confirmReplacement })).value
    assert.ok(replacementPreview.sourceChanges.some(item => item.id === alternateNote.id && item.sourceId === spareNote.sourceId))
    assert.ok(replacementPreview.lost.some(item => item.name === 'fixture_standing_aux'))
    assert.ok(replacementPreview.lost.some(item => item.name === 'fixture_standing_dependent'))
    assert.deepEqual(replacementPreview.before.outfit, [])
    assert.deepEqual([...replacementPreview.after.removedIds].sort(), [nativeKitId, dependentKitId].sort())
    const { value: restoreStanding } = await host.request(endpoint, { action: 'growth-opening-choices',
      draft: confirmReplacement, restoreGear: [{ id: alternateNote.id, sourceId: nativeKitId }] })
    const { value: describedReplacement } = await host.request(endpoint, { action: 'growth-opening-choices',
      draft: confirmReplacement, describe: true })
    const describedNote = describedReplacement.choices.find(item => item.id === alternateNote.id)
    assert.equal(describedNote.sourceId, spareNote.sourceId)
    assert.ok(describedNote.trialActions.every(move => !Object.hasOwn(move, 'instruction')))
    assert.deepEqual(describedNote.trialActions.map(move => move.key),
      restoreStanding.choices.find(item => item.id === alternateNote.id).trialActions.map(move => move.key))
    assert.ok(!describedReplacement.choices.some(item => item.name === 'fixture_standing_aux'))
    const standingRepair = restoreStanding.repairs[0].repair
    assert.equal(restoreStanding.choices.find(item => item.id === alternateNote.id).sourceId, spareNote.sourceId)
    assert.deepEqual(standingRepair.draft, { presetId: nativeKit.id, equipmentIds: [], equipmentSources: {}, removedEquipmentIds: [] })
    assert.deepEqual(standingRepair.restored, ['fixture-native-equipment', 'peer-tool'])
    const { value: standingReady } = await host.request(endpoint, { action: 'growth-opening-choices',
      draft: standingRepair.draft, restoreGear: [{ id: alternateNote.id, sourceId: nativeKitId }] })
    assert.deepEqual(standingReady.repairs, [{ id: alternateNote.id }])
    assert.equal(standingReady.choices.find(item => item.id === alternateNote.id).sourceId, nativeKitId)
    const nativeStandingBuild = (await host.request(endpoint, confirmReplacement)).value
    const nativeStandingSession = await host.request('/api/loadout-fixture-session', {
      presetId: nativeStandingBuild.presetId, workspacePath: directory,
    })
    await host.request(endpoint, { action: 'verify-live', ...nativeStandingSession, presetId: nativeStandingBuild.presetId })
    const changedKit = await equipmentIn(host, nativeStandingSession.sessionId)
    assert.equal(changedKit.outfit.find(item => item.id === alternateNote.id)?.sourceId, spareNote.sourceId)
    assert.deepEqual(Object.keys(changedKit.removedEquipmentLabels).sort(), [nativeKitId, dependentKitId].sort())
    assert.ok(!changedKit.tools.some(item => ['fixture_standing_aux', 'fixture_standing_dependent'].includes(item.name)))
    assert.ok(changedKit.tools.some(item => item.name === 'serpentine_index'))
    const runNote = session => host.request('/api/loadout-fixture-session-key', { sessionId: session.sessionId, tool: alternateNote.name })
    assert.equal((await runNote(nativeStandingSession)).value, 'spare')
    const originalKit = await host.request('/api/loadout-fixture-session', { presetId: nativeKit.id })
    assert.match((await runNote(originalKit)).value, /^[a-f0-9-]{36}$/)
    assert.ok((await equipmentIn(host, originalKit.sessionId)).tools.some(item => item.name === 'fixture_standing_aux'))
    for (const session of [nativeStandingSession, originalKit]) {
      await host.request(turnEndpoint, { sessionId: session.sessionId, text: '核对实战搭配档案' })
    }
    const savedBeforePreview = (await host.request(endpoint)).value.saved.map(item => item.id)
    const pair = { action: 'equipment-pairing-preview', id: alternateNote.id, heroId: nativeKit.id, sourceId: spareNote.sourceId,
      againstDraft: { presetId: nativeKit.id, equipmentIds: [] } }
    const { value: exact } = await host.request(endpoint, pair)
    assert.deepEqual(exact.draft, confirmReplacement)
    assert.equal(exact.placement, 'selected')
    assert.ok(exact.removed.includes('fixture-native-equipment'))
    assert.ok(exact.comparison.lost.some(item => item.name === 'fixture_standing_dependent'))
    assert.equal(exact.comparison.sourceChanges.find(item => item.id === alternateNote.id).sourceId, spareNote.sourceId)
    const { value: ownSource } = await host.request(endpoint, { ...pair, sourceId: nativeKitId })
    assert.equal(ownSource.placement, 'included')
    assert.deepEqual(ownSource.draft.equipmentIds, [])
    await host.request(endpoint, { ...pair, sourceId: 'plugin:000000000000000000000000' }, 422)
    assert.deepEqual((await host.request(endpoint)).value.saved.map(item => item.id), savedBeforePreview)

    const trialQuest = { mode: 'trial', title: '用替换后的来源核对档案', gearId: alternateNote.id,
      questSources: { [alternateNote.id]: spareNote.sourceId } }
    const trialLaunch = { action: 'growth-open', workspaceId: nativeStandingSession.workspaceId,
      launchId: 'a'.repeat(32), draft: exact.draft, quest: trialQuest }
    const wrongTrial = await host.request(endpoint, { ...trialLaunch, draft: ownSource.draft }, 422)
    assert.match(wrongTrial.error.message, /工具来源已变化/)
    const { value: trialMatch } = await host.request(endpoint, trialLaunch)
    assert.equal(trialMatch.questError, undefined)
    const trialStart = { action: 'match-growth', sessionId: trialMatch.sessionId }
    const { quest: sourceTrial } = (await host.request(endpoint, trialStart)).value
    assert.equal(sourceTrial.gear.sourceId, spareNote.sourceId)
    await host.request(endpoint, { ...trialStart, action: 'growth-claim', id: sourceTrial.id }, 422)
    await host.request(turnEndpoint, { sessionId: trialMatch.sessionId, text: '核对实战搭配档案' })
    await host.request(endpoint, { ...trialStart, action: 'growth-claim', id: sourceTrial.id })
    const [trialReceipt] = (await host.request(endpoint, { ...trialStart, action: 'match-settlements' })).value
    assert.deepEqual(trialReceipt.awards.map(({ id, sourceId, xp }) => [id, sourceId, xp]),
      [[alternateNote.id, spareNote.sourceId, 24]])

    const alternateLayer = await host.request('/api/loadout-fixture-session', { presetId: 'standard', runtimePlugin: 'spare-note-session' })
    const optionsForKit = (await host.request(endpoint)).value.presets.find(hero => hero.id === nativeKit.id).tools[alternateNote.id]
    const sessionSpare = optionsForKit.sourceChoices.find(option => option.collection?.sessionId === alternateLayer.sessionId)
    assert.equal(sessionSpare.replacement, undefined)
    const layerBuild = (await host.request(endpoint, { ...replaceNote, equipmentSources: { [alternateNote.id]: sessionSpare.sourceId } })).value
    const layerMatch = await host.request('/api/loadout-fixture-session', { presetId: layerBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...layerMatch, presetId: layerBuild.presetId })
    assert.equal((await runNote(layerMatch)).value, 'spare')
    assert.ok((await equipmentIn(host, layerMatch.sessionId)).tools.some(item => item.name === 'fixture_standing_aux'))

    const guild = initial.presets.find(hero => hero.id === 'fixture-peers')
    const [seedId, seed] = own(guild, 'peer-seed')
    const [ledgerId] = own(guild, 'peer-ledger')
    const [peerToolId] = own(guild, 'peer-tool')
    assert.deepEqual(new Set(seed.linked), new Set([ledgerId, peerToolId]))
    const droppedGuild = (await host.request(endpoint, { presetId: guild.id, equipmentIds: [], removedEquipmentIds: [seedId] })).value
    const emptyGuild = await host.request('/api/loadout-fixture-session', { presetId: droppedGuild.presetId })
    const emptyGuildGear = await equipmentIn(host, emptyGuild.sessionId)
    assert.equal(emptyGuildGear.heroId, guild.id)
    assert.equal(Object.keys(emptyGuildGear.removedEquipmentLabels).length, 3)
    assert.ok(!emptyGuildGear.tools.some(tool => tool.name === 'peer_ledger_marker'))
    const foreignFeatured = (await host.request(endpoint, { presetId: source.id, equipmentIds: ['evidence'] })).value
    const featuredTools = await host.request('/api/loadout-fixture-tools?id=' + foreignFeatured.presetId)
    assert.ok(featuredTools.includes('ask_user_question'))
    assert.ok(featuredTools.includes('standing_annotation'))
    const equippedMatch = await host.request('/api/loadout-fixture-session', { presetId: foreignFeatured.presetId })
    const equippedSnapshot = await equipmentIn(host, equippedMatch.sessionId)
    assert.ok(equippedSnapshot.outfit.some(item => item.id === 'evidence' && item.state === 'ready' && item.name === '证据核验'))
    assert.equal(equippedSnapshot.skills[0].ready, true)
    assert.deepEqual(equippedSnapshot.skills[0].actions.map(action => action.name),
      ['核对关键证据', '继续补证', '降级推荐', '暂缓提交'])
    const matchAction = (sessionId, selection, status) =>
      host.request(endpoint, { action: 'match-prompt', sessionId, input: '', ...selection }, status)
    const customMove = (targetKind, targetId, action, input = '') =>
      ({ targetKind, targetId, revision: action.revision, moveId: action.actions[0].id, input })
    function publishedMove(snapshot, kind, targetId, name, input = '') {
      const target = snapshot.skills.find(item => item.kind === kind && item.id === targetId)
      const move = target?.actions.find(item => item.name === name)
      assert.equal(move?.publisher, 'local-contributor', JSON.stringify(snapshot.skills))
      return { targetKind: kind, targetId, revision: move.revision, moveId: move.id, input }
    }
    const suppliedHero = publishedMove(equippedSnapshot, 'hero', source.id, '补齐档案证据')
    assert.match((await matchAction(equippedMatch.sessionId, suppliedHero)).value.text, /列出需要补齐的档案证据/)
    const hold = publishedMove(equippedSnapshot, 'hero', source.id, '暂缓移交')
    await matchAction(equippedMatch.sessionId, hold, 422)
    assert.match((await matchAction(equippedMatch.sessionId, { ...hold, input: '等待原始签章' })).value.text, /等待原始签章/)
    const suppliedTool = publishedMove(equippedSnapshot, 'gear', local.id, '核对索引出处', '档案号 01')
    assert.match(equippedSnapshot.tools.find(item => item.id === local.id).shortcutKey, /^scoped:/)
    assert.match((await matchAction(equippedMatch.sessionId, suppliedTool)).value.text, /"serpentine_index"/)
    await matchAction(equippedMatch.sessionId, { ...suppliedTool, revision: 'stale' }, 422)
    const suppliedGear = publishedMove(equippedSnapshot, 'gear', localGear.id, '复核档案索引')
    await matchAction(equippedMatch.sessionId, suppliedGear)
    await matchAction(equippedMatch.sessionId, publishedMove(equippedSnapshot, 'gear', publisher.id, '复核档案索引'))
    const secondHero = await host.request('/api/loadout-fixture-session', { presetId: externalBuild.presetId })
    const secondHeroGear = await equipmentIn(host, secondHero.sessionId)
    assert.ok(!secondHeroGear.skills.some(skill => skill.kind === 'hero' && skill.actions.some(move => move.publisher)))
    const transferred = publishedMove(secondHeroGear, 'gear', local.id, '核对索引出处', '档案号 01')
    await matchAction(secondHero.sessionId, transferred)
    await matchAction(secondHero.sessionId, suppliedTool, 422)
    const noTool = await host.request('/api/loadout-fixture-session', { presetId: target.id })
    await matchAction(noTool.sessionId, transferred, 422)
    for (const id of [source.id, importedGroup.id, odd.id, hostPlugin.id, enabledBundle.id]) {
      assert.ok(equippedSnapshot.skills.some(skill => skill.id === id), JSON.stringify(equippedSnapshot.skills.map(skill => skill.id)))
    }
    const heroMove = customMove('hero', source.id, heroAction)
    await matchAction(equippedMatch.sessionId, heroMove, 422)
    const preparedMove = (await matchAction(equippedMatch.sessionId, { ...heroMove, input: '候选人的项目经历' })).value.text
    assert.match(preparedMove, /^【外部预设】检查工作依据/)
    assert.match(preparedMove, /候选人的项目经历/)
    await matchAction(equippedMatch.sessionId, { ...heroMove, revision: 'stale', input: '候选人的项目经历' }, 422)
    const toolMove = (await matchAction(equippedMatch.sessionId, customMove('gear', odd.id, toolAction))).value.text
    assert.match(toolMove, /"quartz_note"/)
    const pause = (await matchAction(equippedMatch.sessionId, {
      equipmentId: 'evidence', moveId: 'pause', input: '候选人尚未提供项目材料。',
    })).value.text
    assert.match(pause, /^【证据核验】暂缓提交\n/)
    assert.match(pause, /候选人尚未提供项目材料。/)
    const thirdParty = equippedSnapshot.tools.find(tool => tool.name === 'quartz_note')
    await matchAction(equippedMatch.sessionId, { toolId: thirdParty.id }, 422)
    const call = (await matchAction(equippedMatch.sessionId, { toolId: thirdParty.id, input: '读取示例记录' })).value.text
    assert.match(call, /"quartz_note".*\n\n读取示例记录/)
    await matchAction(equippedMatch.sessionId, { toolId: 'tool:unknown', input: '读取记录' }, 422)
    const inspectHistory = sessionId => host.request('/api/loadout-fixture-history?' + new URLSearchParams({ sessionId }))
    const reportFor = async (sessionId, before) =>
      (await host.request(endpoint, { action: 'match-report', sessionId, before })).value
    const fixedBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [odd.id] })).value
    assert.equal(fixedBuild.verifyLive, true)
    const fixed = await host.request('/api/loadout-fixture-session', { presetId: fixedBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...fixed, presetId: fixedBuild.presetId })
    const changeSource = (sessionId, mode) => host.request('/api/loadout-fixture-shadow', { sessionId, mode })
    const fixedState = async () => (await equipmentIn(host, fixed.sessionId)).outfit.find(item => item.id === odd.id)?.state
    await changeSource(fixed.sessionId, 'open')
    try {
      assert.equal(await fixedState(), 'conflict')
      await matchAction(fixed.sessionId, { toolId: odd.id, input: '检查记录' }, 422)
      await host.request(turnEndpoint, { sessionId: fixed.sessionId, text: call })
      assert.ok((await reportFor(fixed.sessionId)).turns[0].entries.some(item => item.name === odd.name && item.state === 'conflict'))
    } finally {
      assert.equal((await changeSource(fixed.sessionId, 'close')).calls, 0)
    }
    assert.equal(await fixedState(), 'ready')
    await changeSource(fixed.sessionId, 'different-schema')
    try {
      const visible = (await equipmentIn(host, fixed.sessionId)).tools.filter(tool => tool.name === odd.name)
      assert.deepEqual(visible.map(tool => [tool.id, tool.state]), [[odd.id, 'conflict']])
    } finally {
      await changeSource(fixed.sessionId, 'close')
    }
    await changeSource(fixed.sessionId, 'late')
    const lateConflict = await readLedger(fixed, odd.name)
    assert.equal(lateConflict.code, 'LOADOUT_SOURCE_CHANGED')
    assert.equal((await changeSource(fixed.sessionId, 'stats')).calls, 0)
    assert.equal((await readLedger(fixed, odd.name)).value, 'ready')
    const trackedShadow = await host.request('/api/loadout-fixture-session', {
      presetId: fixedBuild.presetId, runtimePlugin: 'shadow-provider',
    })
    const shadowedGear = (await equipmentIn(host, trackedShadow.sessionId)).outfit.find(tool => tool.id === odd.id)
    assert.equal(shadowedGear.state, 'conflict')
    assert.equal(shadowedGear.sourceName, 'fixture-isolated-group')
    assert.equal(shadowedGear.registeredSourceName, 'fixture-shadow-provider')
    assert.equal((await readLedger(trackedShadow, odd.name)).code, 'LOADOUT_SOURCE_CHANGED')
    await host.request(turnEndpoint, { sessionId: trackedShadow.sessionId, text: call })
    const blockedCall = (await reportFor(trackedShadow.sessionId)).turns[0].entries.find(item => item.name === odd.name)
    assert.equal(blockedCall.state, 'conflict')
    assert.equal(blockedCall.expectedSourceName, 'fixture-isolated-group')
    assert.equal(blockedCall.blockedSourceName, 'fixture-shadow-provider')
    assert.equal(blockedCall.sourceNames, undefined)
    await changeSource(equippedMatch.sessionId, 'open')
    try {
      assert.equal((await readLedger(equippedMatch, odd.name)).value, 'shadow')
    } finally {
      assert.equal((await changeSource(equippedMatch.sessionId, 'close')).calls, 1)
    }
    const receipt = { action: 'match-record', sessionId: equippedMatch.sessionId, requestId: randomUUID(),
      toolId: thirdParty.id, input: '读取示例记录' }
    assert.equal((await host.request(endpoint, receipt)).value.text, call)
    assert.equal((await host.request(endpoint, receipt)).value.text, call)
    await host.request(endpoint, { ...receipt, input: '另一项任务' }, 422)
    assert.ok(!(await inspectHistory(equippedMatch.sessionId)).events.some(event => event.type === 'user/message'))
    assert.deepEqual(await reportFor(equippedMatch.sessionId), { turns: [] })
    await host.request(turnEndpoint, { sessionId: equippedMatch.sessionId, text: call, requestId: receipt.requestId })
    const equippedHistory = await inspectHistory(equippedMatch.sessionId)
    const nativeCall = equippedHistory.events.find(event => event.type === 'tool/call' && event.data.name === thirdParty.name)
    assert.ok(nativeCall)
    const loggedSource = equippedHistory.events.find(event => event.type === 'plugin:dsh-agent-loadout/tool-source')
    assert.equal(loggedSource.ignorable, true)
    assert.deepEqual(loggedSource.data, { callSeq: nativeCall.seq, id: odd.id, sourceId: thirdParty.artSourceId,
      sourceName: 'fixture-isolated-group' })
    const toolReply = equippedHistory.events.findLast(event => event.type === 'assistant/message')
    assert.equal(toolReply.data.message.content[0].text, '对局结果 ready')
    const result = await reportFor(equippedMatch.sessionId)
    assert.equal(result.turns[0].status, 'completed')
    assert.deepEqual(result.turns[0].entries.map(item => [item.type, item.label ?? item.name]),
      [['action', '使用工具'], ['tool', 'quartz_note']])
    assert.equal(result.turns[0].entries[0].edited, false)
    assert.equal(result.turns[0].entries[1].state, 'completed')
    assert.deepEqual(result.turns[0].entries[1].sourceNames, ['fixture-isolated-group'])
    assert.equal(result.turns[0].entries[1].id, odd.id)
    const edited = { ...receipt, requestId: randomUUID() }
    await host.request(endpoint, edited)
    await host.request(turnEndpoint, { sessionId: equippedMatch.sessionId, requestId: edited.requestId,
      text: call + '\n测试工具出错' })
    const last = (await reportFor(equippedMatch.sessionId)).turns[0]
    assert.equal(last.entries[0].edited, true)
    assert.equal(last.entries[1].state, 'failed')
    assert.deepEqual(last.entries[1].sourceNames, ['fixture-isolated-group'])
    const reportBranch = (await host.request(endpoint, {
      action: 'continue', sourceSessionId: equippedMatch.sessionId, presetId: target.id,
    })).value
    const inheritedReport = await reportFor(reportBranch.sessionId)
    assert.ok(inheritedReport.turns.every(turn => turn.inherited))
    assert.equal(inheritedReport.turns.at(-1).entries[0].title, 'quartz_note')
    assert.deepEqual(inheritedReport.turns.at(-1).entries[1].sourceNames, ['fixture-isolated-group'])
    for (let turn = 0; turn < 7; turn++) {
      await host.request(turnEndpoint, { sessionId: equippedMatch.sessionId, text: call })
    }
    const page = await reportFor(equippedMatch.sessionId)
    assert.equal(page.turns.length, 8)
    assert.equal(page.turns[0].entries.length, 1)
    assert.equal(page.turns[0].entries[0].type, 'tool')
    assert.equal((await reportFor(equippedMatch.sessionId, page.nextBefore)).turns[0].entries[0].label, '使用工具')

    const programCard = initial.equipment.find(item => item.name === 'run_code')
    const ptc = initial.presets.find(item => item.id === 'ptc')
    const ptcExecutor = ptc.tools[programCard.id].includedBy
    assert.equal(ptc.tools[programCard.id].state, 'included')
    assert.ok(ptc.builtIn[ptcExecutor].tools.includes('run_code'))
    assert.equal(target.tools[programCard.id].sourceId, ptcExecutor)
    const removedExecutor = await compare('ptc', [], { removedEquipmentIds: [ptcExecutor] })
    assert.ok(removedExecutor.lost.some(item => item.id === programCard.id))
    const programDraft = { presetId: target.id, equipmentIds: [programCard.id, odd.id] }
    const programChanges = await compare(programDraft.presetId, programDraft.equipmentIds)
    assert.equal(programChanges.gained.find(item => item.id === programCard.id)?.sourceId, ptcExecutor)
    const programOpening = (await host.request(endpoint, { action: 'growth-opening-choices', draft: programDraft })).value
    const programChoice = programOpening.choices.find(item => item.id === programCard.id)
    assert.equal(programChoice.sourceId, ptcExecutor)
    assert.equal(programChoice.trialActions[0].name, '用工具完成任务')
    const programBuild = (await host.request(endpoint, programDraft)).value
    const programMatch = await host.request('/api/loadout-fixture-session', { presetId: programBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...programMatch, presetId: programBuild.presetId })
    const liveProgram = (await equipmentIn(host, programMatch.sessionId)).outfit.find(item => item.id === programCard.id)
    assert.equal(liveProgram.state, 'ready')
    assert.equal(liveProgram.artSourceId, ptcExecutor)
    await changeSource(programMatch.sessionId, 'hold-result')
    const programTurn = host.request(turnEndpoint, { sessionId: programMatch.sessionId, text: 'fixture ptc report' })
    void programTurn.catch(() => {})
    try {
      let snapshot
      for (let attempt = 0; attempt < 80; attempt++) {
        snapshot = await equipmentIn(host, programMatch.sessionId)
        if (snapshot.activity?.some(item => item.id === odd.id && item.state === 'running')) break
        await delay(50)
      }
      assert.equal(snapshot.running, true)
      assert.equal(snapshot.activeToolCount, 2)
      assert.equal(snapshot.activity.find(item => item.id === programCard.id)?.state, 'running')
      const tool = snapshot.activity.find(item => item.id === odd.id)
      assert.equal(tool.state, 'running')
      assert.ok(tool.sourceId)
      assert.ok(tool.providers.some(item => item.id === tool.sourceId))
    } finally {
      await host.request(turnEndpoint, { sessionId: programMatch.sessionId, finish: true })
      await programTurn
    }
    assert.equal((await equipmentIn(host, programMatch.sessionId)).activity, undefined)
    const programReport = async () => (await reportFor(programMatch.sessionId)).turns[0]?.entries
    const programCalls = await programReport()
    assert.deepEqual(programCalls?.map(item => [item.name, item.state, item.nested]),
      [['run_code', 'completed', undefined], [odd.name, 'completed', true]], JSON.stringify(programCalls))
    assert.equal(programCalls[0].id, programCard.id)
    if (programCard.transport) assert.equal(programCalls[0].sourceId, ptcExecutor)
    assert.deepEqual(programCalls[1].sourceNames, ['fixture-isolated-group'])
    assert.equal(programCalls[1].id, odd.id)

    const partialProgram = await host.request('/api/loadout-fixture-session', { presetId: programBuild.presetId })
    const partialSession = partialProgram.sessionId
    const rejectNextToolResult = sessionId => host.request('/api/loadout-fixture-shadow', { sessionId, mode: 'reject-result' })
    const toolReceipts = async sessionId => (await host.request(endpoint, { action: 'match-settlements', sessionId })).value
    await rejectNextToolResult(partialSession)
    await host.request(turnEndpoint, { sessionId: partialSession, text: 'fixture ptc partial' })
    const partialCalls = (await reportFor(partialSession)).turns[0].entries
    assert.deepEqual(partialCalls.map(item => [item.name, item.state, item.nested]), [
      ['run_code', 'completed', undefined], ['glob', 'completed', true], ['glob', 'completed', true], [odd.name, 'failed', true],
    ])
    assert.deepEqual(partialCalls.at(-1).sourceNames, ['fixture-isolated-group'])
    const [partialReceipt] = await toolReceipts(partialSession)
    assert.deepEqual(partialReceipt.awards.filter(item => item.kind === 'tool').map(item => [item.name, item.xp]).sort(), [
      ['glob', 8], ['run_code', 8],
    ])
    assert.ok(!partialReceipt.awards.some(item => item.activity?.some(activity => activity.name === odd.name)))
    const { sessionId: directMatch } = await host.request('/api/loadout-fixture-session', { presetId: fixedBuild.presetId })
    await rejectNextToolResult(directMatch)
    await host.request(turnEndpoint, { sessionId: directMatch, text: '请使用当前会话的工具 "quartz_note" 读取档案。' })
    const [rejectedDirectCall] = (await reportFor(directMatch)).turns[0].entries
    assert.equal(rejectedDirectCall.name, odd.name)
    assert.equal(rejectedDirectCall.state, 'failed')
    assert.ok((await toolReceipts(directMatch))[0].awards.every(item => !item.kind))

    const programWorkspace = join(directory, 'program-inventory')
    await mkdir(programWorkspace)
    await writeFile(join(programWorkspace, 'inventory.txt'), 'workspace inventory\n')
    const runtimeProgram = await host.request('/api/loadout-fixture-session', {
      presetId: 'standard', runtimePlugin: 'session-ptc', workspacePath: programWorkspace,
    })
    const runtimeProgramTool = (await equipmentIn(host, runtimeProgram.sessionId)).tools.find(item => item.id === programCard.id)
    const runtimeExecutor = runtimeProgramTool.artSourceId
    assert.ok(runtimeExecutor && runtimeExecutor !== ptcExecutor)
    const changedProgram = await host.request('/api/loadout-fixture-session', {
      presetId: programBuild.presetId, runtimePlugin: 'session-ptc', workspacePath: programWorkspace,
    })
    assert.equal((await equipmentIn(host, changedProgram.sessionId)).outfit.find(item => item.id === programCard.id).state, 'conflict')
    await host.request(turnEndpoint, { sessionId: changedProgram.sessionId, text: 'fixture session ptc' })
    const changedCall = (await reportFor(changedProgram.sessionId)).turns[0].entries.find(item => item.name === 'run_code')
    assert.equal(changedCall.state, 'conflict')
    await host.request(turnEndpoint, { sessionId: runtimeProgram.sessionId, text: 'fixture session ptc' })
    const programSettlements = async () => (await host.request(endpoint, {
      action: 'match-settlements', sessionId: runtimeProgram.sessionId,
    })).value
    const [runtimeProgramReceipt] = await programSettlements()
    const programAward = runtimeProgramReceipt.awards.find(item => item.id === programCard.id)
    assert.equal(programAward.xp, 8)
    assert.equal(programAward.discovered, true)
    assert.equal(programAward.sourceId, runtimeExecutor)
    assert.deepEqual(programAward.collection, { id: runtimeExecutor, sessionId: runtimeProgram.sessionId })
    assert.equal(runtimeProgramReceipt.awards.find(item => item.id === runtimeExecutor)?.xp, 4)
    const programEvidence = (await reportFor(runtimeProgram.sessionId)).turns[0].entries
    assert.ok(programEvidence.some(item => item.name === 'glob' && item.state === 'completed'))
    assert.match(JSON.stringify((await inspectHistory(runtimeProgram.sessionId)).events), /inventory\.txt/)
    const carryProgram = (await host.request(endpoint, { action: 'match-follow-up',
      sessionId: runtimeProgram.sessionId, receiptId: runtimeProgramReceipt.id, gearIds: [programCard.id] })).value
    assert.equal(carryProgram.gear[0].sourceId, runtimeExecutor)
    const collectRuntimeExecutor = (sessionId, status) => host.request(endpoint, {
      action: 'equipment-collection', itemId: runtimeExecutor, sessionId, remove: false,
    }, status)
    await collectRuntimeExecutor(programMatch.sessionId, 422)
    assert.equal((await collectRuntimeExecutor(runtimeProgram.sessionId)).value.saved, true)
    assert.deepEqual((await programSettlements())[0].awards.find(item => item.id === programCard.id).collection,
      { id: runtimeExecutor, saved: true })

    const sourceSession = await host.request('/api/loadout-fixture-session', { presetId: source.id, sessionOnly: true, runtimePlugin: true })
    await matchAction(sourceSession.sessionId, { equipmentId: 'evidence', moveId: 'pause' }, 422)
    assert.deepEqual(await equipmentIn(host, 'inactive-fixture-session'), { active: false })
    const beforeTurn = await equipmentIn(host, sourceSession.sessionId)
    assert.equal(beforeTurn.presetId, source.id)
    assert.equal(beforeTurn.heroName, source.name)
    assert.equal(beforeTurn.tools.find(tool => tool.id === odd.id).sourceName, 'fixture-isolated-group')
    assert.ok(beforeTurn.skills.some(skill => skill.id === importedGroup.id))
    assert.ok(beforeTurn.tools.some(tool => tool.name === 'celestial_ledger' && tool.state === 'ready'))
    assert.ok(!beforeTurn.tools.some(tool => tool.name === 'meridian_beacon'))
    await host.request(turnEndpoint, { sessionId: sourceSession.sessionId })
    await waitForTool(host, sourceSession.sessionId, 'meridian_beacon')
    assert.ok(!(await equipmentIn(host, sourceSession.sessionId)).tools.some(tool => tool.name === 'fixture_fading_signal'))
    const current = (await host.request(endpoint)).value
    const targetTools = current.presets.find(item => item.id === target.id).tools
    const fading = current.equipment.find(item => item.name === 'fixture_fading_signal')
    assert.ok(fading, 'brief registration should be discovered before it vanishes')
    assert.equal(targetTools[fading.id].state, 'available')
    assert.equal(targetTools[fading.id].deferred, true)
    const fadingProvider = current.equipment.find(item => item.id === targetTools[fading.id].equipId)
    assert.ok(fadingProvider.providedTools.some(link => link.id === fading.id && link.timing === 'turn' &&
      link.sourceId === targetTools[fading.id].sourceId))
    assert.ok(fading.providerGear.some(link => link.id === fadingProvider.id && link.sourceId === targetTools[fading.id].sourceId))
    const sessionPeerTool = current.equipment.find(item => item.name === 'session_peer_marker')
    assert.deepEqual(targetTools[sessionPeerTool.id].dependencies, ['peer-ledger', 'peer-seed'])
    const sessionPeerBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [sessionPeerTool.id] })).value
    const peerMatch = await host.request('/api/loadout-fixture-session', { presetId: sessionPeerBuild.presetId })
    const nextPeerMatch = await host.request('/api/loadout-fixture-session', { presetId: sessionPeerBuild.presetId })
    for (const session of [peerMatch, nextPeerMatch]) {
      await host.request(endpoint, { action: 'verify-live', ...session, presetId: sessionPeerBuild.presetId })
    }
    const [firstPeerMatch, secondPeerMatch, originalPeerMatch] = await Promise.all(
      [peerMatch, nextPeerMatch, sourceSession].map(session => readLedger(session, sessionPeerTool.name)))
    assert.match(firstPeerMatch.value, /^[a-f0-9-]{36}$/)
    assert.match(secondPeerMatch.value, /^[a-f0-9-]{36}$/)
    assert.match(originalPeerMatch.value, /^[a-f0-9-]{36}$/)
    assert.equal(new Set([firstPeerMatch.value, secondPeerMatch.value, originalPeerMatch.value]).size, 3)
    const parentPeerTool = current.equipment.find(item => item.name === 'parent_peer_marker')
    assert.deepEqual(targetTools[parentPeerTool.id].dependencies, ['peer-ledger', 'peer-seed'])
    const parentPeerBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [parentPeerTool.id] })).value
    const parentPeerMatch = await host.request('/api/loadout-fixture-session', { presetId: parentPeerBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...parentPeerMatch, presetId: parentPeerBuild.presetId })
    const parentMarker = await readLedger(parentPeerMatch, parentPeerTool.name)
    assert.match(parentMarker.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(parentMarker.value, sourceLedger.value)
    const runtimePlugin = current.equipment.find(item => item.name === 'fixture-session-addon')
    const runtimeAction = await addAction('gear', runtimePlugin.id, '复核会话插件')
    const passive = current.equipment.find(item => item.kind === 'plugin' && item.name === 'compass' && !item.provides)
    const annotation = current.equipment.find(item => item.name === 'runtime_annotation')
    assert.ok(annotation, JSON.stringify(beforeTurn))
    assert.ok(runtimePlugin, JSON.stringify(beforeTurn.plugins))
    assert.ok(passive, JSON.stringify(beforeTurn.plugins))
    assert.equal(targetTools[annotation.id].equipId, runtimePlugin.id)
    assert.equal(targetTools[passive.id].state, 'available')
    const runtime = (await host.request(endpoint, { presetId: target.id, equipmentIds: [annotation.id, passive.id] })).value
    assert.equal(runtime.verifyLive, true)
    assert.ok(!(await host.request('/api/loadout-fixture-tools?id=' + runtime.presetId)).includes(annotation.name))
    const equippedSession = await host.request('/api/loadout-fixture-session', { presetId: runtime.presetId })
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...equippedSession, presetId: runtime.presetId })).ok, true)
    const equipped = await equipmentIn(host, equippedSession.sessionId)
    assert.equal(equipped.presetId, runtime.presetId)
    assert.ok(equipped.plugins.some(plugin => plugin.id === runtimePlugin.id && plugin.state === 'ready'))
    assert.ok(equipped.plugins.some(plugin => plugin.id === passive.id && plugin.state === 'ready'))
    assert.ok(equipped.tools.some(tool => tool.id === annotation.id && tool.selected && tool.state === 'ready'))
    const importedHero = (await host.request(endpoint, { presetId: 'fixture-mcp', equipmentIds: [annotation.id] })).value
    const importedSession = await host.request('/api/loadout-fixture-session', { presetId: importedHero.presetId })
    await host.request(endpoint, { action: 'verify-live', ...importedSession, presetId: importedHero.presetId })
    const unmodified = await host.request('/api/loadout-fixture-session', { presetId: target.id })
    assert.ok(!(await equipmentIn(host, unmodified.sessionId)).tools.some(tool => tool.id === annotation.id))
    const sessionOnly = current.equipment.find(item => item.name === 'local_session_key')
    assert.equal(targetTools[sessionOnly.id].state, 'unavailable')
    assert.equal(targetTools[sessionOnly.id].sourceSessionId, sourceSession.sessionId)
    assert.equal(targetTools[sessionOnly.id].canConfigureSource, true)
    const bindSessionKey = async ({ wrongSchema = false, deferred = false } = {}) => {
      const input = {
        title: '会话钥匙', directory: external, toolId: sessionOnly.id, deferred,
        text: JSON.stringify({ name: './session-key.mjs', config: { wrongSchema, deferred } }),
      }
      const binding = (await host.request(endpoint, { action: 'equipment-review', ...input })).value
      assert.equal(binding.boundTool.id, sessionOnly.id)
      await host.request(endpoint, { action: 'equipment-save', ...input, reviewedId: binding.id })
      const updated = (await host.request(endpoint)).value
      const status = updated.presets.find(preset => preset.id === target.id).tools[sessionOnly.id]
      assert.equal(status.state, 'available')
      assert.equal(status.equipId, binding.id)
      assert.ok(!updated.equipment.some(item => item.id === binding.id))
      const build = (await host.request(endpoint, { presetId: target.id, equipmentIds: [sessionOnly.id] })).value
      assert.equal(build.verifyLive, true)
      return build
    }
    const wrongBinding = await bindSessionKey({ wrongSchema: true })
    const wrongSession = await host.request('/api/loadout-fixture-session', { presetId: wrongBinding.presetId })
    await host.request(endpoint, { action: 'verify-live', ...wrongSession, presetId: wrongBinding.presetId }, 422)
    const rightBinding = await bindSessionKey()
    const rebound = await host.request('/api/loadout-fixture-session', { presetId: rightBinding.presetId })
    await host.request(endpoint, { action: 'verify-live', ...rebound, presetId: rightBinding.presetId })
    const reboundTools = (await equipmentIn(host, rebound.sessionId)).tools
    assert.ok(reboundTools.some(tool => tool.id === sessionOnly.id && tool.selected && tool.state === 'ready'))
    const reboundResult = await host.request('/api/loadout-fixture-session-key', { sessionId: rebound.sessionId })
    assert.equal(reboundResult.value, rebound.sessionId)
    assert.notEqual(reboundResult.value, sourceSession.sessionId)
    const delayedBinding = await bindSessionKey({ deferred: true })
    const delayed = await host.request('/api/loadout-fixture-session', { presetId: delayedBinding.presetId })
    const reboundState = async () => (await equipmentIn(host, delayed.sessionId)).tools.find(tool => tool.id === sessionOnly.id)?.state
    await host.request(endpoint, { action: 'verify-live', ...delayed, presetId: delayedBinding.presetId })
    assert.equal(await reboundState(), 'waiting')
    await host.request(turnEndpoint, { sessionId: delayed.sessionId })
    await waitForTool(host, delayed.sessionId, sessionOnly.name)
    assert.equal(await reboundState(), 'ready')
    await host.request(turnEndpoint, { sessionId: delayed.sessionId, finish: true })
    assert.equal(await reboundState(), 'waiting')
    const late = current.equipment.find(item => item.name === 'celestial_ledger')
    assert.equal(late.live, true)
    assert.equal(targetTools[late.id].live, true)
    const selected = (await host.request(endpoint, { presetId: target.id, equipmentIds: [late.id] })).value
    assert.equal(selected.verifyLive, true)
    await host.request(endpoint, { action: 'verify-live', ...sourceSession, presetId: selected.presetId }, 422)
    const session = await host.request('/api/loadout-fixture-session', { presetId: selected.presetId })
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...session, presetId: selected.presetId })).ok, true)

    const continueWith = (sourceSessionId, status) =>
      host.request(endpoint, { action: 'continue', sourceSessionId, presetId: selected.presetId }, status)
    const premature = await continueWith(sourceSession.sessionId, 422)
    assert.match(premature.error.message, /首个回合尚未结束/)
    const blank = await host.request('/api/loadout-fixture-session', { presetId: source.id })
    const blankBuild = (await continueWith(blank.sessionId)).value
    assert.notEqual(blankBuild.sessionId, blank.sessionId)
    assert.equal((await inspectHistory(blankBuild.sessionId)).inherited, 0)

    const workspacePath = join(directory, 'match')
    await mkdir(workspacePath)
    const match = await host.request('/api/loadout-fixture-session', {
      presetId: source.id, initialPresetId: target.id, workspacePath,
    })
    await host.request(turnEndpoint, { sessionId: match.sessionId, text: '候选人已有两项可核验证据' })
    const completed = await inspectHistory(match.sessionId)
    assert.ok(completed.events.some(event => event.type === 'assistant/message'))
    assert.ok(completed.events.some(event => event.type === 'agent-preset/selected'))
    await host.request(turnEndpoint, { sessionId: match.sessionId })
    await waitForTool(host, match.sessionId, 'meridian_beacon')
    const continued = (await continueWith(match.sessionId)).value
    assert.notEqual(continued.sessionId, match.sessionId)
    const history = await inspectHistory(continued.sessionId)
    const original = await inspectHistory(match.sessionId)
    assert.equal(history.workspaceId, match.workspaceId)
    assert.equal(original.presetId, source.id)
    assert.equal(history.presetId, selected.presetId)
    const openTail = original.events.slice(history.inherited)
    assert.ok(openTail.some(event => event.type === 'turn/start'))
    assert.ok(!openTail.some(event => event.type === 'turn/end'))
    assert.deepEqual(history.events.slice(0, history.inherited), original.events.slice(0, history.inherited))
    assert.equal(history.events[history.inherited - 1].type, 'turn/end')
    await host.request(endpoint, { action: 'verify-live', ...continued, presetId: selected.presetId })
    assert.deepEqual((await continueWith(continued.sessionId)).value, continued)
    const arrange = (presetId = selected.presetId, status) => host.request(endpoint, {
      action: 'continue-queue', sourceSessionId: match.sessionId, presetId,
    }, status)
    const cancel = id => host.request(endpoint, { action: 'continue-cancel', sourceSessionId: match.sessionId, id })
    const waiting = (await arrange()).value
    assert.equal(waiting.state, 'waiting')
    assert.equal(waiting.turn, openTail.find(event => event.type === 'turn/start').data.turn)
    assert.equal(waiting.sessionId, undefined)
    assert.equal((await arrange()).value.id, waiting.id)
    await arrange(target.id, 422)
    assert.equal((await cancel(randomUUID())).value.id, waiting.id)
    await cancel(waiting.id)
    assert.equal((await equipmentIn(host, match.sessionId)).continuation, undefined)
    assert.equal((await equipmentIn(host, match.sessionId)).running, true)
    const scheduled = (await host.request(endpoint, { action: 'continue-queue', sourceSessionId: match.sessionId,
      presetId: target.id, equipmentIds: [late.id] })).value
    assert.equal(scheduled.presetId, selected.presetId)
    assert.notEqual(scheduled.id, waiting.id)
    await host.request(turnEndpoint, { sessionId: match.sessionId, finish: true })
    await host.request(turnEndpoint, { sessionId: match.sessionId, text: '此消息属于原会话下一回合' })
    const ready = await waitForContinuation(host, match.sessionId, 'ready')
    assert.equal(ready.id, scheduled.id)
    const afterWaiting = await inspectHistory(ready.sessionId)
    const sourceAfterWaiting = await inspectHistory(match.sessionId)
    const exactEnd = sourceAfterWaiting.events.find(event => event.type === 'turn/end' && event.data.turn === waiting.turn)
    assert.equal(afterWaiting.inherited, exactEnd.seq + 1)
    assert.deepEqual(afterWaiting.events.slice(0, afterWaiting.inherited), sourceAfterWaiting.events.slice(0, exactEnd.seq + 1))
    assert.ok(sourceAfterWaiting.events.slice(exactEnd.seq + 1).some(event => event.type === 'turn/start'))
    assert.equal(afterWaiting.workspaceId, match.workspaceId)
    assert.equal(afterWaiting.presetId, selected.presetId)
    assert.equal((await arrange()).value.sessionId, ready.sessionId)
    await host.request(endpoint, { action: 'verify-live', presetId: selected.presetId, sessionId: ready.sessionId })

    const beacon = current.equipment.find(item => item.name === 'meridian_beacon')
    const beaconAction = await addAction('gear', beacon.id, '查看回合记录')
    assert.equal(targetTools[beacon.id].deferred, true)
    assert.match((await matchAction(sourceSession.sessionId, { toolId: beacon.id, input: '检查记录' })).value.text, /"meridian_beacon"/)
    const nextTurn = await compare(target.id, [late.id, beacon.id], { sourceSessionId: sourceSession.sessionId })
    assert.equal(nextTurn.live, true)
    assert.equal(nextTurn.before.id, source.id)
    assert.equal(nextTurn.after.id, target.id)
    assert.ok(nextTurn.lost.some(card => card.name === 'mcp__observatory__read_marker'))
    assert.equal(nextTurn.timingChanges.find(card => card.id === late.id)?.timing, 'startup')
    assert.equal(nextTurn.timingChanges.find(card => card.id === beacon.id)?.timing, 'turn')
    const mixed = (await host.request(endpoint, { presetId: target.id, equipmentIds: [late.id, beacon.id] })).value
    const mixedSession = await host.request('/api/loadout-fixture-session', { presetId: mixed.presetId })
    await matchAction(mixedSession.sessionId, { ...heroMove, input: '材料' }, 422)
    assert.ok((await equipmentIn(host, mixedSession.sessionId)).skills.some(skill => skill.id === importedGroup.id))
    const turnMove = customMove('gear', beacon.id, beaconAction)
    assert.match((await matchAction(mixedSession.sessionId, turnMove)).value.text, /"meridian_beacon"/)
    await matchAction(mixedSession.sessionId, customMove('gear', importedGroup.id, pluginAction))
    const gear = async () => Object.fromEntries((await equipmentIn(host, mixedSession.sessionId)).outfit
      .map(tool => [tool.name, tool.state]))
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...mixedSession, presetId: mixed.presetId })).ok, true)
    assert.deepEqual(await gear(), { celestial_ledger: 'ready', meridian_beacon: 'waiting' })
    const eventStream = await host.requestRaw(endpoint + '/session-events?' + new URLSearchParams(mixedSession), {
      signal: AbortSignal.timeout(8000),
    })
    assert.equal(eventStream.headers.get('content-type'), 'text/event-stream')
    const events = eventStream.body.getReader()
    async function expectRefresh() {
      const frame = await events.read()
      assert.match(Buffer.from(frame.value ?? '').toString(), /data: changed\n\n/)
    }
    try {
      await expectRefresh()
      await host.request(turnEndpoint, { sessionId: mixedSession.sessionId })
      await expectRefresh()
      await waitForTool(host, mixedSession.sessionId, beacon.name)
      assert.deepEqual(await gear(), { celestial_ledger: 'ready', meridian_beacon: 'ready' })
      assert.match((await matchAction(mixedSession.sessionId, turnMove)).value.text, /"meridian_beacon"/)
      await host.request(turnEndpoint, { sessionId: mixedSession.sessionId, finish: true })
      await expectRefresh()
    } finally {
      await events.cancel()
    }
    assert.deepEqual(await gear(), { celestial_ledger: 'ready', meridian_beacon: 'waiting' })
    assert.match((await matchAction(mixedSession.sessionId, turnMove)).value.text, /"meridian_beacon"/)
    await host.request(turnEndpoint, { sessionId: sourceSession.sessionId, finish: true })
    assert.ok(!(await equipmentIn(host, sourceSession.sessionId)).tools.some(tool => tool.name === beacon.name))
    await matchAction(sourceSession.sessionId, { toolId: beacon.id, input: '检查记录' }, 422)

    const hostTool = current.equipment.find(item => item.name === 'orchard_recipe')
    assert.equal(targetTools[hostTool.id].live, true)
    assert.match(targetTools[hostTool.id].sourceId, /^profile:[a-f0-9]{24}$/)
    const hostBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [hostTool.id] })).value
    assert.equal((await host.request(endpoint, {
      presetId: target.id, equipmentIds: [hostTool.id], equipmentSources: { [hostTool.id]: 'profile' },
    })).value.presetId, hostBuild.presetId)
    const hostSession = await host.request('/api/loadout-fixture-session', { presetId: hostBuild.presetId })
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...hostSession, presetId: hostBuild.presetId })).ok, true)

    const orchardName = 'fixture_orchard_selection'
    const playOrchard = async (sessionId, profileBranch, state, callback) => {
      try {
        await host.request(turnEndpoint, { sessionId, profileBranch })
        await waitForTool(host, sessionId, orchardName, state)
        await callback()
      } finally {
        await host.request(turnEndpoint, { sessionId, finish: true })
      }
    }
    for (const branch of ['north', 'south']) {
      const discoveryMatch = await host.request('/api/loadout-fixture-session', { presetId: 'standard' })
      await playOrchard(discoveryMatch.sessionId, branch, 'ready', async () => {
        assert.equal((await readLedger(discoveryMatch, orchardName)).value, branch)
      })
      assert.ok(!(await equipmentIn(host, discoveryMatch.sessionId)).tools.some(tool => tool.name === orchardName))
    }
    for (const [groupedBranch] of groupedBranches) {
      const groupedMatch = await host.request('/api/loadout-fixture-session', { presetId: groupedPresetId })
      await host.request(turnEndpoint, { sessionId: groupedMatch.sessionId,
        text: '请使用当前会话的工具 "' + groupedName + '"。\nfixture grouped orchard ' + groupedBranch })
      assert.ok(!(await equipmentIn(host, groupedMatch.sessionId)).tools.some(tool => tool.name === groupedName))
    }
    const orchardCatalog = (await host.request(endpoint)).value
    const groupedCard = orchardCatalog.equipment.find(item => item.name === groupedName)
    assert.ok(groupedCard)
    const groupedSource = orchardCatalog.presets.find(item => item.id === target.id).tools[groupedCard.id]
    assert.equal(groupedSource.sourceName, groupIdForOrchard)
    assert.equal(groupedSource.deferred, true)
    assert.deepEqual(groupedSource.packageMoves.map(([name]) => name).sort(), groupedBranches.map(([, name]) => name).sort())
    const orchardCard = orchardCatalog.equipment.find(item => item.name === orchardName)
    assert.ok(orchardCard, 'Profile tool registered during a turn should persist after disposal')
    const orchardChoices = orchardCatalog.presets.find(item => item.id === target.id).tools[orchardCard.id].sourceChoices
    assert.equal(orchardChoices.length, 2)
    assert.ok(orchardChoices.every(source => source.deferred && /^profile:[a-f0-9]{24}$/.test(source.sourceId)))
    const orchardSource = branch => orchardChoices.find(source => source.sourceName.endsWith('fixture-orchard-' + branch))
    const orchardSelection = branch => ({
      presetId: 'recruiting-advisor', equipmentIds: [orchardCard.id],
      equipmentSources: { [orchardCard.id]: orchardSource(branch).sourceId },
    })
    const { value: waitingFitting } = await fitting({ id: orchardCard.id, heroId: 'recruiting-advisor',
      sourceId: orchardSource('north').sourceId })
    assert.equal(waitingFitting.timing, 'turn')
    assert.deepEqual(waitingFitting.draft.equipmentSources, orchardSelection('north').equipmentSources)
    const { value: waitingPair } = await fitting({ id: 'evidence', heroId: 'recruiting-advisor',
      partner: { id: orchardCard.id, sourceId: orchardSource('north').sourceId } })
    assert.deepEqual(waitingPair.slots.map(slot => [slot.item.id, slot.item.sourceId, slot.timing]),
      [['evidence', undefined, undefined], [orchardCard.id, orchardSource('north').sourceId, 'turn']])
    assert.deepEqual(waitingPair.draft.equipmentSources, orchardSelection('north').equipmentSources)
    const savePlan = async (options, status) =>
      (await host.request(endpoint, { action: 'plan-save', ...options }, status)).value
    const northPlan = await savePlan({ name: '北区补证', note: '优先查核北区材料。', draft: orchardSelection('north') })
    const northBuild = { presetId: northPlan.presetId }
    assert.equal(northPlan.heroId, 'recruiting-advisor')
    assert.match(northPlan.presetId, /^loadout-/)
    await savePlan({ name: ' 北区补证 ', draft: orchardSelection('south') }, 422)
    const barePlan = await savePlan({ name: '待复核', draft: { presetId: target.id, equipmentIds: [] } })
    assert.equal(barePlan.presetId, target.id)
    const southPlan = await savePlan({ id: barePlan.id, revision: barePlan.revision, name: '南区交付',
      note: '南区材料齐备时使用。', draft: orchardSelection('south') })
    assert.equal(southPlan.id, barePlan.id)
    assert.notEqual(southPlan.revision, barePlan.revision)
    assert.notEqual(southPlan.presetId, northPlan.presetId)
    await savePlan({ id: southPlan.id, revision: barePlan.revision, name: '过期编辑' }, 422)
    await savePlan({ id: southPlan.id, revision: southPlan.revision, name: southPlan.name,
      draft: { presetId: 'standard', equipmentIds: [] } }, 422)
    const orchardComparison = (await host.request(endpoint, { action: 'compare', ...orchardSelection('south'),
      againstPresetId: northBuild.presetId })).value
    assert.equal(orchardComparison.sourceChanges.find(item => item.id === orchardCard.id)?.sourceId, orchardSource('south').sourceId)

    const growthMatch = await host.request('/api/loadout-fixture-session', { presetId: source.id, workspacePath })
    const matchActionApi = async (action, payload, status, sessionId = growthMatch.sessionId) =>
      (await host.request(endpoint, { action, sessionId, ...payload }, status)).value
    const waitGrowth = async (sessionId, check) => {
      let result
      for (let attempt = 0; attempt < 100; attempt++) {
        result = await matchActionApi('match-growth', {}, undefined, sessionId)
        if (check(result)) return result
        await delay(50)
      }
      assert.ok(check(result), JSON.stringify({ hero: result.hero, quest: result.quest, recent: result.recent }))
    }
    const initialGrowth = await matchActionApi('match-growth')
    const settlements = (sessionId = growthMatch.sessionId) => matchActionApi('match-settlements', {}, undefined, sessionId)
    assert.deepEqual(await settlements(), [])
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).settlement, undefined)
    const [legacyReceipt] = await settlements('legacy-growth-receipt')
    assert.equal(legacyReceipt.awards[0].level, 2)
    assert.equal(legacyReceipt.awards[0].before, undefined)
    const mission = await matchActionApi('growth-accept', { mode: 'delivery', title: '复核两项材料' })
    await matchActionApi('growth-claim', { id: mission.id }, 422)
    await matchActionApi('growth-accept', { mode: 'delivery', title: '重复领取' }, 422)
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, text: '这两项材料已经核实' })
    const readyToClaim = await waitGrowth(growthMatch.sessionId, value => value.quest?.completed !== undefined)
    assert.equal(readyToClaim.hero.xp, initialGrowth.hero.xp + 12)
    const firstNotice = (await equipmentIn(host, growthMatch.sessionId)).settlement
    assert.equal(firstNotice.ready.id, mission.id)
    assert.equal(firstNotice.receipt.hero.xp, 12)
    assert.equal(firstNotice.receipt.dismissed, false)
    const [firstReceipt] = await settlements()
    assert.equal(firstReceipt.id, firstNotice.receipt.id)
    assert.equal(firstReceipt.awards[0].before.xp, initialGrowth.hero.xp)
    assert.equal(firstReceipt.awards[0].after.xp, readyToClaim.hero.xp)
    assert.equal(await matchActionApi('settlement-dismiss', { id: randomUUID() }), undefined)
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).settlement.receipt.dismissed, false)
    assert.equal(await matchActionApi('settlement-dismiss', { id: firstReceipt.id }), true)
    const dismissed = (await equipmentIn(host, growthMatch.sessionId)).settlement
    assert.equal(dismissed.receipt.dismissed, true)
    assert.equal(dismissed.ready.id, mission.id)
    await matchActionApi('growth-claim', { id: mission.id })
    await matchActionApi('growth-claim', { id: mission.id }, 422)
    const claimed = await matchActionApi('match-growth')
    assert.equal(claimed.hero.xp, initialGrowth.hero.xp + 42)
    assert.equal(claimed.recent[0].title, mission.title)
    const frame = (kind, id, choice, status) => matchActionApi('growth-frame', { kind, id, frame: choice }, status)
    await frame('hero', source.id, '6', 422)
    await frame('gear', 'missing-tool', '3', 422)
    await frame('hero', source.id, 'classic')
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).heroRank.frame, 'classic')
    assert.equal((await matchActionApi('match-growth')).hero.xp, claimed.hero.xp)
    assert.equal(await matchActionApi('settlement-dismiss', { id: firstReceipt.id }), undefined)
    const claimedNotice = (await equipmentIn(host, growthMatch.sessionId)).settlement
    assert.equal(claimedNotice.ready, undefined)
    assert.equal(claimedNotice.receipt.id, mission.id)
    assert.equal(claimedNotice.receipt.dismissed, false)
    assert.equal(claimedNotice.receipt.hero.xp, 30)

    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId })
    await waitForTool(host, growthMatch.sessionId, 'meridian_beacon')
    const inTurn = await matchActionApi('match-growth', { includeChoices: true })
    const trialTool = inTurn.choices.find(item => item.name === 'quartz_note')
    assert.equal(trialTool.kind, 'tool')
    const trial = await matchActionApi('growth-accept', { mode: 'trial', gearId: trialTool.id, title: '复核档案笔记' })
    const listedPlans = await matchActionApi('match-plans')
    const northPlanGear = listedPlans.find(item => item.id === northPlan.id).items[0]
    assert.equal(northPlanGear.id, orchardCard.id)
    assert.equal(northPlanGear.sourceId, orchardSource('north').sourceId)
    assert.deepEqual(northPlanGear.roles, orchardCard.roles)
    await matchActionApi('match-plan-preview', { id: northPlan.id, revision: randomUUID() }, 422)
    await matchActionApi('match-plan-continue', { id: northPlan.id, revision: randomUUID() }, 422)
    const fastPreview = await matchActionApi('match-plan-preview', northPlan)
    assert.equal(fastPreview.live, true)
    assert.ok(fastPreview.lost.some(item => item.name === 'meridian_beacon'))
    const quickWait = await matchActionApi('match-plan-continue', northPlan)
    assert.equal(quickWait.state, 'waiting')
    assert.equal(quickWait.title, northPlan.name)
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, finish: true })
    const quickReady = await waitForContinuation(host, growthMatch.sessionId, 'ready')
    const quickHistory = await inspectHistory(quickReady.sessionId)
    assert.equal(quickHistory.presetId, northPlan.presetId)
    assert.equal(quickHistory.workspaceId, growthMatch.workspaceId)
    assert.equal(quickHistory.events[quickHistory.inherited - 1].data.turn, quickWait.turn)
    const afterOldTurn = await matchActionApi('match-growth')
    assert.equal(quickHistory.events[quickHistory.inherited - 1].data.reason.kind, 'blocked')
    assert.equal(afterOldTurn.hero.xp, claimed.hero.xp)
    assert.equal(afterOldTurn.quest.completed, undefined)
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).settlement.receipt.id, mission.id)
    const firstToolXp = afterOldTurn.gear.find(item => item.id === trialTool.id)?.xp ?? 0
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, text: '请使用当前会话的工具 "quartz_note" 测试工具出错' })
    const afterFailure = await waitGrowth(growthMatch.sessionId, value => value.recent.length === 3)
    assert.equal(afterFailure.gear.find(item => item.id === trialTool.id)?.xp ?? 0, firstToolXp)
    assert.equal(afterFailure.quest.completed, undefined)
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, text: '请使用当前会话的工具 "quartz_note" 复核档案' })
    await waitGrowth(growthMatch.sessionId, value => value.quest?.completed !== undefined)
    await matchActionApi('growth-claim', { id: trial.id })
    const afterTrial = await matchActionApi('match-growth')
    assert.equal(afterTrial.gear.find(item => item.id === trialTool.id).xp, firstToolXp + 8 + 24)
    assert.equal((await matchActionApi('match-growth', {}, undefined, quickReady.sessionId)).recent.length, 0)
    assert.deepEqual(await settlements(quickReady.sessionId), [])
    assert.equal(await matchActionApi('settlement-dismiss', { id: mission.id }, undefined, quickReady.sessionId), undefined)
    await matchActionApi('match-plan-continue', northPlan, 422, quickReady.sessionId)

    const flagList = () => matchActionApi('growth-flags')
    assert.deepEqual(await flagList(), [])
    const scopedPartner = inTurn.choices.find(item => item.name === 'fixture-context-resource')
    assert.equal(scopedPartner.kind, 'plugin')
    const comboDraft = { mode: 'combo', title: '档案核验与上下文连携', gearIds: [trialTool.id, scopedPartner.id] }
    await matchActionApi('growth-accept', { ...comboDraft, gearIds: [trialTool.id, trialTool.id] }, 422)
    const combo = await matchActionApi('growth-accept', comboDraft)
    assert.deepEqual(combo.pair.map(item => item.id), comboDraft.gearIds)
    await matchActionApi('growth-claim', { id: combo.id }, 422)
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, text: '请使用当前会话的工具 "quartz_note" 测试工具出错' })
    const comboPartial = await waitGrowth(growthMatch.sessionId, value => value.quest?.progress)
    assert.deepEqual(comboPartial.quest.progress.missing, [trialTool.id])
    assert.equal(comboPartial.quest.completed, undefined)
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, text: '请使用当前会话的工具 "quartz_note" 核对档案' })
    const comboReady = await waitGrowth(growthMatch.sessionId, value => value.quest?.completed !== undefined)
    assert.ok(!comboReady.recent[0].awards.some(item => item.id === scopedPartner.id))
    const { flag } = await matchActionApi('growth-claim', { id: combo.id })
    assert.equal(flag.turn, comboReady.quest.completed)
    const comboClaimed = await matchActionApi('match-growth')
    assert.equal(comboClaimed.hero.xp, comboReady.hero.xp + 24)
    assert.equal(comboClaimed.hero.frame, 'classic')
    const [comboReceipt] = await settlements()
    assert.equal(comboReceipt.flag.id, flag.id)
    assert.deepEqual(comboReceipt.awards.map(item => item.xp), [24, 16, 16])
    for (const item of flag.pair) {
      const xp = view => view.gear.find(gear => gear.id === item.id)?.xp ?? 0
      assert.equal(xp(comboClaimed), xp(comboReady) + 16)
    }
    await matchActionApi('growth-claim', { id: combo.id }, 422)
    await matchActionApi('growth-accept', { ...comboDraft, gearIds: [...comboDraft.gearIds].reverse() }, 422)
    await matchActionApi('growth-display', { heroId: target.id, id: flag.id }, 422)
    await matchActionApi('growth-display', { heroId: source.id, id: flag.id })
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).heroFlag.id, flag.id)
    assert.equal((await flagList()).find(item => item.id === flag.id).displayed, true)
    await matchActionApi('growth-display', { heroId: source.id, id: null })
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).heroFlag, undefined)

    const profilePartner = inTurn.choices.find(item => item.id === hostPlugin.id)
    assert.equal(profilePartner.profile, true)
    const profileCombo = await matchActionApi('growth-accept', { ...comboDraft, title: '联合 Profile 插件复核', gearIds: [trialTool.id, profilePartner.id] })
    await host.request(turnEndpoint, { sessionId: growthMatch.sessionId, text: '请使用当前会话的工具 "quartz_note" 核对 Profile 资料' })
    await waitGrowth(growthMatch.sessionId, value => value.quest?.completed !== undefined)
    const { flag: profileFlag } = await matchActionApi('growth-claim', { id: profileCombo.id })
    await frame('gear', trialTool.id, 'classic')
    await frame('gear', trialTool.id, 'auto')
    assert.equal((await matchActionApi('match-growth')).gear.find(item => item.id === trialTool.id).frame, undefined)
    await frame('gear', trialTool.id, '3')
    const liveFrames = (await equipmentIn(host, growthMatch.sessionId)).gearRanks
    assert.equal(liveFrames[trialTool.id].frame, '3')
    const appearanceCatalog = (await host.request(endpoint)).value
    assert.equal(appearanceCatalog.presets.find(item => item.id === source.id).rank.frame, 'classic')
    assert.equal(appearanceCatalog.equipment.find(item => item.id === trialTool.id).rank.frame, '3')
    await matchActionApi('growth-display', { heroId: source.id, id: flag.id })
    await matchActionApi('growth-display', { heroId: source.id, id: profileFlag.id })
    assert.equal((await flagList()).filter(item => item.hero.id === source.id && item.displayed).length, 1)
    assert.equal((await equipmentIn(host, growthMatch.sessionId)).heroFlag.id, profileFlag.id)
    const profileReceipt = (await settlements())[0]
    assert.equal(await matchActionApi('settlement-dismiss', { id: profileReceipt.id }), true)

    const programComboMatch = await host.request('/api/loadout-fixture-session', { presetId: programBuild.presetId })
    const programGear = (await matchActionApi('match-growth', { includeChoices: true }, undefined, programComboMatch.sessionId)).choices
    const programTool = programGear.find(item => item.name === 'run_code')
    assert.ok(programTool, 'native program execution must be selectable for a challenge')
    const programCombo = await matchActionApi('growth-accept', { ...comboDraft, gearIds: [programTool.id, trialTool.id] }, undefined, programComboMatch.sessionId)
    await host.request(turnEndpoint, { sessionId: programComboMatch.sessionId, text: 'fixture ptc report' })
    await waitGrowth(programComboMatch.sessionId, value => value.quest?.completed !== undefined)
    assert.ok((await matchActionApi('growth-claim', { id: programCombo.id }, undefined, programComboMatch.sessionId)).flag)
    const programTask = programTool.trialActions.find(item => item.name === '用工具完成任务')
    const programTrial = await matchActionApi('growth-accept', { mode: 'trial', title: '运行程序完成核验',
      gearId: programTool.id, trialActionKey: programTask.key }, undefined, programComboMatch.sessionId)
    const programRequest = randomUUID()
    const programPrompt = await matchActionApi('match-record', { targetKind: 'gear', targetId: programTool.id, moveId: 'gear:task',
      input: '核对档案。', requestId: programRequest }, undefined, programComboMatch.sessionId)
    assert.match(programPrompt.text, /当前会话的工具 "run_code"/)
    await host.request(turnEndpoint, { sessionId: programComboMatch.sessionId, text: programPrompt.text, requestId: programRequest })
    await waitGrowth(programComboMatch.sessionId, value => value.quest?.completed !== undefined)
    await matchActionApi('growth-claim', { id: programTrial.id }, undefined, programComboMatch.sessionId)

    const { sessionId: actionPractice } = await host.request('/api/loadout-fixture-session', { presetId: foreignFeatured.presetId })
    const practice = (action, payload) => matchActionApi(action, payload, undefined, actionPractice)
    const actionChoices = (await practice('match-growth', { includeChoices: true })).choices
    const customGoal = actionChoices.find(item => item.id === importedGroup.id).trialActions.find(move => move.name === '复核插件记录')
    const customTrial = await practice('growth-accept', { mode: 'trial', title: '复核插件记录的试炼',
      gearId: importedGroup.id, trialActionKey: customGoal.key })
    const sendTrialMove = async move => {
      const requestId = randomUUID()
      const { text } = await practice('match-record', { ...move, requestId })
      await host.request(turnEndpoint, { sessionId: actionPractice, text, requestId })
    }
    await sendTrialMove(customMove('gear', importedGroup.id, pluginAction))
    await waitGrowth(actionPractice, value => value.quest?.completed !== undefined)
    await practice('growth-claim', { id: customTrial.id })
    assert.deepEqual((await settlements(actionPractice))[0].awards.map(item => [item.id, item.xp]), [[importedGroup.id, 32]])
    const packageGoal = actionChoices.find(item => item.id === local.id).trialActions.find(move => move.name === '核对索引出处')
    const packageTrial = await practice('growth-accept', { mode: 'trial', title: '验证索引出处的试炼',
      gearId: local.id, trialActionKey: packageGoal.key })
    const liveMove = publishedMove(await equipmentIn(host, actionPractice), 'gear', local.id, packageGoal.name)
    await sendTrialMove({ ...liveMove, input: '先检查操作入口' })
    const unmet = await waitGrowth(actionPractice, value => value.quest?.progress?.action === true)
    assert.deepEqual(unmet.quest.progress.missing, [local.id])
    assert.equal(unmet.quest.completed, undefined)
    await sendTrialMove({ ...liveMove, input: '实际核对档案号 01' })
    await waitGrowth(actionPractice, value => value.quest?.completed !== undefined)
    await practice('growth-claim', { id: packageTrial.id })
    assert.deepEqual((await settlements(actionPractice))[0].awards.map(item => [item.id, item.xp]), [[local.id, 32]])

    const heroGoals = (await practice('match-growth', { includeChoices: true })).heroActions
    const nativeActions = await equipmentIn(host, actionPractice)
    for (const [name, move] of [
      ['补齐档案证据', publishedMove(nativeActions, 'hero', source.id, '补齐档案证据')],
      ['检查工作依据', customMove('hero', source.id, heroAction, '逐项核对原始材料')],
    ]) {
      const goal = heroGoals.find(item => item.name === name)
      const delivery = await practice('growth-accept', { mode: 'delivery', title: name + '后交付', heroActionKey: goal.key })
      await sendTrialMove(move)
      await waitGrowth(actionPractice, value => value.quest?.completed !== undefined)
      await practice('growth-claim', { id: delivery.id })
      const [completed] = await settlements(actionPractice)
      assert.equal(completed.heroAction.name, name)
      assert.deepEqual(completed.awards.map(item => [item.id, item.xp]), [[source.id, 40]])
    }

    const shortcut = async (sessionId, item, remove = false, status) =>
      (await host.request(endpoint, { action: 'match-shortcut', sessionId,
        itemId: item.id, shortcutKey: item.shortcutKey, remove }, status)).value
    const pinMatch = await host.request('/api/loadout-fixture-session', { presetId: 'standard', sessionOnly: true })
    const pinSnapshot = () => equipmentIn(host, pinMatch.sessionId)
    const privateTool = (await pinSnapshot()).tools.find(item => item.name === 'local_session_key')
    assert.match(privateTool.shortcutKey, /^registration:/)
    const pinState = async () => (await pinSnapshot()).pinned.find(item => item.id === privateTool.id)?.state
    await shortcut(pinMatch.sessionId, privateTool)
    await shortcut(pinMatch.sessionId, privateTool)
    assert.equal((await pinSnapshot()).pinned.length, 1)
    assert.equal(await pinState(), 'ready')
    const standingPlugin = (await pinSnapshot()).plugins.find(item => item.state === 'ready')
    await shortcut(pinMatch.sessionId, standingPlugin)
    assert.ok((await pinSnapshot()).pinned.some(item => item.id === standingPlugin.id && item.kind === 'plugin'))
    await shortcut(pinMatch.sessionId, standingPlugin, true)
    const privateMove = { toolId: privateTool.id, shortcutKey: privateTool.shortcutKey, input: '读取当前会话的示例标记' }
    const privateReceipt = { ...privateMove, action: 'match-record', sessionId: pinMatch.sessionId, requestId: randomUUID() }
    const privateText = (await host.request(endpoint, privateReceipt)).value.text
    await host.request(turnEndpoint, { sessionId: pinMatch.sessionId, requestId: privateReceipt.requestId, text: privateText })
    assert.deepEqual((await reportFor(pinMatch.sessionId)).turns[0].entries.map(item => item.label ?? item.state),
      ['使用快捷装备', 'completed'])
    const queued = { ...privateReceipt, requestId: randomUUID() }
    await host.request(endpoint, queued)
    const togglePrivate = enabled => host.request('/api/loadout-fixture-private-tool', { sessionId: pinMatch.sessionId, enabled })
    await togglePrivate(false)
    assert.equal(await pinState(), 'missing')
    await togglePrivate(true)
    assert.equal(await pinState(), 'conflict')
    await matchAction(pinMatch.sessionId, privateMove, 422)
    const replacement = (await pinSnapshot()).tools.find(item => item.id === privateTool.id)
    await shortcut(pinMatch.sessionId, replacement, false, 422)
    await host.request(turnEndpoint, { sessionId: pinMatch.sessionId, requestId: queued.requestId, text: privateText })
    assert.deepEqual((await reportFor(pinMatch.sessionId)).turns[0].entries.map(item => item.label ?? item.state),
      ['使用快捷装备', 'conflict'])
    await host.request(turnEndpoint, { sessionId: pinMatch.sessionId, text: privateText })
    assert.equal((await reportFor(pinMatch.sessionId)).turns[0].entries[0].state, 'completed')
    const portableProfile = (await pinSnapshot()).profileEquipment.find(item => item.id.endsWith('fixture-orchard-north'))
    await shortcut(pinMatch.sessionId, portableProfile)
    const shortcutChild = (await host.request(endpoint, { action: 'continue', sourceSessionId: pinMatch.sessionId, presetId: target.id })).value
    const childShortcuts = await equipmentIn(host, shortcutChild.sessionId)
    assert.deepEqual(childShortcuts.shortcutCarry.map(({ id, state, canCarry }) => [id, state, canCarry]),
      [[privateTool.id, 'missing', false], [portableProfile.id, 'ready', true]])
    const adoptShortcuts = { action: 'match-shortcut-carry', sessionId: shortcutChild.sessionId }
    await host.request(endpoint, { ...adoptShortcuts, selected: [privateTool.id, portableProfile.id] }, 422)
    assert.equal((await equipmentIn(host, shortcutChild.sessionId)).pinned.length, 0)
    const { value: copiedShortcut } = await host.request(endpoint, { ...adoptShortcuts, selected: [portableProfile.id] })
    assert.deepEqual(copiedShortcut.pinned.map(({ id, shortcutKey }) => [id, shortcutKey]), [[portableProfile.id, portableProfile.shortcutKey]])
    assert.equal(copiedShortcut.shortcutCarry, undefined)
    assert.equal((await pinSnapshot()).pinned.length, 2)
    await shortcut(pinMatch.sessionId, portableProfile, true)
    await host.request(turnEndpoint, { sessionId: pinMatch.sessionId, checkpoint: true })
    const dynamicPin = await host.request('/api/loadout-fixture-session', { presetId: 'standard' })
    const pinnedOrchard = async () => (await equipmentIn(host, dynamicPin.sessionId)).pinned.find(item => item.id === orchardCard.id)
    const orchardReceiptName = 'fixture_orchard_receipt'
    await playOrchard(dynamicPin.sessionId, 'north', 'ready', async () => {
      const { tools } = await equipmentIn(host, dynamicPin.sessionId)
      await shortcut(dynamicPin.sessionId, tools.find(item => item.id === orchardCard.id))
      await shortcut(dynamicPin.sessionId, tools.find(item => item.name === orchardReceiptName))
    })
    assert.equal((await pinnedOrchard()).state, 'waiting')
    await playOrchard(dynamicPin.sessionId, 'south', 'ready', async () => assert.equal((await pinnedOrchard()).state, 'conflict'))
    await playOrchard(dynamicPin.sessionId, 'north', 'ready', async () => assert.equal((await pinnedOrchard()).state, 'ready'))
    const shortcutQueue = await host.request(endpoint, { action: 'continue-queue', sourceSessionId: dynamicPin.sessionId, presetId: target.id })
    const carriedWait = await waitForContinuation(host, dynamicPin.sessionId, 'ready')
    assert.equal(carriedWait.id, shortcutQueue.value.id)
    const waitingCarry = (await equipmentIn(host, carriedWait.sessionId)).shortcutCarry.find(item => item.id === orchardCard.id)
    assert.equal(waitingCarry.state, 'waiting')
    assert.equal(waitingCarry.canCarry, true)
    const { value: waitingPin } = await host.request(endpoint, { action: 'match-shortcut-carry',
      sessionId: carriedWait.sessionId, selected: [orchardCard.id] })
    assert.equal(waitingPin.pinned[0].state, 'waiting')
    assert.equal(waitingPin.pinned[0].shortcutKey, waitingCarry.shortcutKey)
    async function runCarriedShortcut(branch) {
      const sessionId = carriedWait.sessionId
      const requestId = randomUUID()
      const { value: scheduled } = await host.request(endpoint, { action: 'match-record', sessionId, requestId,
        toolId: orchardCard.id, shortcutKey: waitingCarry.shortcutKey, input: 'fixture orchard ' + branch })
      await host.request(turnEndpoint, { sessionId, requestId, text: scheduled.text })
      const { entries } = (await reportFor(sessionId)).turns[0]
      assert.ok(entries.some(item => item.type === 'action' && item.label === '安排快捷装备'))
      const { value: [settlement] } = await host.request(endpoint, { action: 'match-settlements', sessionId })
      return { call: entries.find(item => item.name === orchardName), award: settlement.awards.find(item => item.id === orchardCard.id) }
    }
    const untriggeredShortcut = await runCarriedShortcut('none')
    assert.equal(untriggeredShortcut.call, undefined)
    assert.equal(untriggeredShortcut.award, undefined)
    const mismatchedShortcut = await runCarriedShortcut('south')
    assert.equal(mismatchedShortcut.call?.state, 'conflict')
    assert.equal(mismatchedShortcut.award, undefined)
    const completedShortcut = await runCarriedShortcut('north')
    assert.equal(completedShortcut.call?.state, 'completed')
    assert.equal(completedShortcut.call.sourceId, orchardSource('north').sourceId)
    assert.equal(completedShortcut.award?.xp, 8)
    assert.equal(completedShortcut.award.sourceId, orchardSource('north').sourceId)
    const waitingQuest = (action, fields = {}, status) => host.request(endpoint, { action, sessionId: carriedWait.sessionId, ...fields }, status)
    const { value: waitingGrowth } = await waitingQuest('match-growth', { includeChoices: true })
    const pinnedChoice = waitingGrowth.choices.find(item => item.id === orchardCard.id)
    assert.equal(pinnedChoice.timing, 'turn')
    assert.equal(pinnedChoice.sourceId, orchardSource('north').sourceId)
    const trialSelection = { mode: 'trial', title: '核对回合工具来源', gearId: pinnedChoice.id,
      questSources: { [pinnedChoice.id]: pinnedChoice.sourceId } }
    await waitingQuest('growth-accept', { ...trialSelection, questSources: { [pinnedChoice.id]: orchardSource('south').sourceId } }, 422)
    async function playWaitingTrial(questId, branch) {
      const requestId = randomUUID()
      const { value: scheduled } = await waitingQuest('match-record', { requestId, questId, input: 'fixture orchard ' + branch })
      await host.request(turnEndpoint, { sessionId: carriedWait.sessionId, requestId, text: scheduled.text })
      const { entries } = (await reportFor(carriedWait.sessionId)).turns[0]
      return entries.find(item => item.name === orchardName)
    }
    const { value: basicWaitingTrial } = await waitingQuest('growth-accept', trialSelection)
    assert.equal((await playWaitingTrial(basicWaitingTrial.id, 'south')).state, 'conflict')
    await waitingQuest('growth-claim', { id: basicWaitingTrial.id }, 422)
    assert.equal((await playWaitingTrial(basicWaitingTrial.id, 'north')).sourceId, pinnedChoice.sourceId)
    await waitingQuest('growth-claim', { id: basicWaitingTrial.id })
    const { value: [basicWaitingAward] } = await waitingQuest('match-settlements')
    assert.equal(basicWaitingAward.awards.find(item => item.id === orchardCard.id).xp, waitingGrowth.rewards.trial)
    const pinnedActionKey = pinnedChoice.trialActions.find(item => item.name === '用工具完成任务').key
    const { value: actionWaitingTrial } = await waitingQuest('growth-accept', { ...trialSelection, trialActionKey: pinnedActionKey })
    await shortcut(carriedWait.sessionId, waitingPin.pinned[0], true)
    assert.equal((await waitingQuest('match-growth')).value.task.shortcut.ready, true)
    assert.equal((await playWaitingTrial(actionWaitingTrial.id, 'south')).state, 'conflict')
    await waitingQuest('growth-claim', { id: actionWaitingTrial.id }, 422)
    assert.equal((await playWaitingTrial(actionWaitingTrial.id, 'north')).sourceId, pinnedChoice.sourceId)
    await waitingQuest('growth-claim', { id: actionWaitingTrial.id })
    const { value: [actionWaitingAward] } = await waitingQuest('match-settlements')
    assert.equal(actionWaitingAward.trialAction.name, '用工具完成任务')
    assert.equal(actionWaitingAward.awards.find(item => item.id === orchardCard.id).xp, waitingGrowth.rewards.actionTrial)

    const deferredQuest = (sessionId, action, fields = {}, status) => host.request(endpoint, { action, sessionId, ...fields }, status)
    const { value: deferredGrowth } = await deferredQuest(dynamicPin.sessionId, 'match-growth', { includeChoices: true })
    const deferredPair = [orchardName, orchardReceiptName].map(name => deferredGrowth.choices.find(item => item.name === name))
    const deferredSources = Object.fromEntries(deferredPair.map(item => [item.id, item.sourceId]))
    async function playDeferredQuest(sessionId, questId, branch) {
      const requestId = randomUUID()
      const { value: scheduled } = await deferredQuest(sessionId, 'match-record', { requestId, questId, input: 'fixture orchard ' + branch })
      await host.request(turnEndpoint, { sessionId, requestId, text: scheduled.text })
      const { entries } = (await reportFor(sessionId)).turns[0]
      return entries.filter(item => deferredPair.some(gear => gear.name === item.name))
    }
    const deferredActionKey = deferredPair[0].trialActions.find(item => item.name === '用工具完成任务').key
    for (const comboActionKey of [undefined, deferredActionKey]) {
      const sessionId = dynamicPin.sessionId
      const { value: deferredCombo } = await deferredQuest(sessionId, 'growth-accept', {
        mode: 'combo', title: '核对记录再完成交付', gearIds: deferredPair.map(item => item.id), questSources: deferredSources, comboActionKey,
      })
      assert.equal((await deferredQuest(sessionId, 'match-growth')).value.task.sourcesReady, true)
      if (!comboActionKey) {
        await host.request('/api/loadout-fixture-profile', { branch: 'north', disabled: true })
        assert.equal((await deferredQuest(sessionId, 'match-growth')).value.task.sourcesReady, false)
        await deferredQuest(sessionId, 'match-prompt', { questId: deferredCombo.id, input: '核对材料' }, 422)
        await host.request('/api/loadout-fixture-profile', { branch: 'north', disabled: false })
      }
      assert.deepEqual((await playDeferredQuest(sessionId, deferredCombo.id, 'south')).map(item => item.state), ['conflict', 'conflict'])
      await deferredQuest(sessionId, 'growth-claim', { id: deferredCombo.id }, 422)
      assert.deepEqual((await playDeferredQuest(sessionId, deferredCombo.id, 'north')).map(item => [item.name, item.sourceId]),
        [deferredPair[1], deferredPair[0]].map(item => [item.name, item.sourceId]))
      await deferredQuest(sessionId, 'growth-claim', { id: deferredCombo.id })
    }
    const { value: deferredRelay } = await deferredQuest(dynamicPin.sessionId, 'growth-accept', {
      mode: 'relay', title: '接力核对回合工具', gearId: orchardCard.id, questSources: { [orchardCard.id]: deferredPair[0].sourceId },
    })
    assert.equal((await playDeferredQuest(dynamicPin.sessionId, deferredRelay.id, 'north'))[0].state, 'completed')
    const { value: relayChild } = await host.request(endpoint, { action: 'continue', sourceSessionId: dynamicPin.sessionId, presetId: target.id })
    const previewRelay = async (state, includeChoices = false) => {
      const { value } = await deferredQuest(relayChild.sessionId, 'match-growth', { includeChoices })
      assert.equal(value.relayOffer.id, deferredRelay.id)
      assert.deepEqual(value.relayOffer.toolStates, { [orchardCard.id]: state })
      return value
    }
    const waitingRelay = await previewRelay('waiting', true)
    assert.equal(waitingRelay.choices.some(item => item.id === orchardCard.id), false)
    assert.equal(waitingRelay.relayOffer.gear[0].shortcut, undefined)
    const relayEquipment = await equipmentIn(host, relayChild.sessionId)
    assert.deepEqual(relayEquipment.relayOffer.toolStates, waitingRelay.relayOffer.toolStates)
    assert.equal(relayEquipment.pinned.some(item => item.id === orchardCard.id), false)
    await playOrchard(relayChild.sessionId, 'south', 'ready', () => previewRelay('conflict'))
    await playOrchard(relayChild.sessionId, 'north', 'ready', () => previewRelay('ready'))
    await previewRelay('waiting')
    const relayFeed = await host.requestRaw(endpoint + '/session-events?' + new URLSearchParams({ sessionId: relayChild.sessionId }),
      { signal: AbortSignal.timeout(5000) })
    const relayEvents = relayFeed.body.getReader()
    try {
      await relayEvents.read()
      await host.request('/api/loadout-fixture-profile', { branch: 'north', disabled: true })
      assert.match(new TextDecoder().decode((await relayEvents.read()).value), /data: changed/)
      await previewRelay('missing')
    } finally {
      try {
        await host.request('/api/loadout-fixture-profile', { branch: 'north', disabled: false })
      } finally {
        await relayEvents.cancel()
      }
    }
    await deferredQuest(relayChild.sessionId, 'growth-handoff', { id: deferredRelay.id })
    assert.equal((await deferredQuest(relayChild.sessionId, 'match-growth')).value.task.sourcesReady, true)
    assert.equal((await playDeferredQuest(relayChild.sessionId, deferredRelay.id, 'south'))[0].state, 'conflict')
    await deferredQuest(relayChild.sessionId, 'growth-claim', { id: deferredRelay.id }, 422)
    assert.equal((await playDeferredQuest(relayChild.sessionId, deferredRelay.id, 'north'))[0].sourceId, deferredPair[0].sourceId)
    await deferredQuest(relayChild.sessionId, 'growth-claim', { id: deferredRelay.id })
    const scopedPin = await host.request('/api/loadout-fixture-session', { presetId: source.id })
    await host.request(turnEndpoint, { sessionId: scopedPin.sessionId })
    try {
      await waitForTool(host, scopedPin.sessionId, 'meridian_beacon')
      const item = (await equipmentIn(host, scopedPin.sessionId)).tools.find(tool => tool.name === 'meridian_beacon')
      assert.match(item.shortcutKey, /^scoped:/)
      await shortcut(scopedPin.sessionId, item)
    } finally {
      await host.request(turnEndpoint, { sessionId: scopedPin.sessionId, finish: true })
    }
    const scopedWaitingPin = (await equipmentIn(host, scopedPin.sessionId)).pinned[0]
    assert.equal(scopedWaitingPin.state, 'waiting')
    const { value: scopedWaitingPrompt } = await matchAction(scopedPin.sessionId, {
      toolId: scopedWaitingPin.id, shortcutKey: scopedWaitingPin.shortcutKey, input: '核对回合标记',
    })
    assert.match(scopedWaitingPrompt.text, /"meridian_beacon".*\n工具会按自身条件在回合中注册/)

    const vaultSource = await host.request('/api/loadout-fixture-session', { presetId: 'standard', runtimePlugin: 'vault' })
    const vaultNames = ['fixture_vault_ledger', 'fixture_vault_seal']
    const beforeVaultBuild = (await host.request(endpoint)).value
    const ledger = beforeVaultBuild.equipment.find(item => item.name === vaultNames[0])
    const vaultGearId = beforeVaultBuild.presets.find(item => item.id === target.id).tools[ledger.id].equipId
    assert.ok(vaultGearId && !beforeVaultBuild.equipment.some(item => item.name === vaultNames[1]))
    const vaultBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [vaultGearId] })).value
    const vaultMatch = await host.request('/api/loadout-fixture-session', { presetId: vaultBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...vaultMatch, presetId: vaultBuild.presetId })
    const originalVaultLedger = await readLedger(vaultMatch, vaultNames[0])
    assert.match(originalVaultLedger.value, /^[a-f0-9-]{36}$/)
    await host.request(turnEndpoint, { sessionId: vaultMatch.sessionId, text: 'fixture inspect vault' })
    assert.ok(!(await equipmentIn(host, vaultMatch.sessionId)).tools.some(tool => tool.name === vaultNames[1]))

    const foundrySession = await host.request('/api/loadout-fixture-session', { presetId: 'standard', runtimePlugin: 'discovery-mcp' })
    const foundryName = 'mcp__foundry__read_marker'
    const findFoundry = async () => (await host.request(endpoint)).value.equipment.find(item => item.name === foundryName)
    const foundryCard = await findFoundry()
    assert.ok(foundryCard)
    const foundryMove = await addAction('gear', foundryCard.id, '核对本地材料清单')
    const foundryTask = '【' + foundryName + '】用工具完成任务\n核对材料清单。'
    const playFoundry = (sessionId, text = foundryTask) => host.request(turnEndpoint, { sessionId, text })
    await playFoundry(foundrySession.sessionId, foundryTask + '测试工具出错')
    assert.equal((await reportFor(foundrySession.sessionId)).turns[0].entries[0].state, 'failed')
    assert.equal((await findFoundry()).discovery, undefined)
    const foundryRequest = randomUUID()
    const { value: foundryPrompt } = await host.request(endpoint, { action: 'match-record', sessionId: foundrySession.sessionId,
      ...customMove('gear', foundryCard.id, foundryMove), requestId: foundryRequest })
    await host.request(turnEndpoint, { sessionId: foundrySession.sessionId, requestId: foundryRequest, text: foundryPrompt.text })
    const { discovery: firstFoundryUse } = await findFoundry()
    assert.equal(firstFoundryUse.sessionId, foundrySession.sessionId)
    assert.equal(firstFoundryUse.heroId, 'standard')
    const foundryReceipt = (await settlements(foundrySession.sessionId))[0]
    const proofOfUse = foundryReceipt.awards.find(item => item.id === foundryCard.id)
    assert.equal(proofOfUse.discovered, true)
    assert.equal(proofOfUse.xp, 8)
    const [foundryDiscovery] = (await findFoundry()).discoverySources
    assert.equal(foundryDiscovery.sourceId, proofOfUse.sourceId)
    assert.equal(foundryDiscovery.sessionId, firstFoundryUse.sessionId)
    assert.equal(foundryDiscovery.collection.toolId, foundryCard.id)
    assert.equal(Object.hasOwn(foundryDiscovery, 'snapshot'), false)
    assert.match(JSON.stringify((await inspectHistory(foundrySession.sessionId)).events), /Local inventory marker/)

    const collectionSource = await host.request('/api/loadout-fixture-session', { presetId: 'standard', runtimePlugin: 'collectible' })
    const collectedToolName = 'collected_peer_marker'
    const originalCollectionTool = await readLedger(collectionSource, collectedToolName)
    assert.match(originalCollectionTool.value, /^[a-f0-9-]{36}$/)
    await host.request(turnEndpoint, { sessionId: collectionSource.sessionId, text: 'fixture collect' })
    assert.ok(!(await equipmentIn(host, collectionSource.sessionId)).tools.some(tool => tool.name === 'collected_turn_marker'))
    const beforeCollection = (await host.request(endpoint)).value
    const collectedTool = beforeCollection.equipment.find(item => item.name === collectedToolName)
    const collectedTurn = beforeCollection.equipment.find(item => item.name === 'collected_turn_marker')
    const collectionStatuses = beforeCollection.presets.find(item => item.id === target.id).tools
    const choice = collectionStatuses[collectedTool.id].collection
    assert.equal(choice.sessionId, collectionSource.sessionId)
    assert.equal(collectionStatuses[collectedTurn.id].collection.id, choice.id)
    assert.equal(collectionStatuses[collectedTurn.id].deferred, true)
    const collect = (sessionId, remove, status) => host.request(endpoint, {
      action: 'equipment-collection', itemId: choice.id, sessionId, remove,
    }, status)
    await collect(sourceSession.sessionId, false, 422)
    assert.equal((await collect(choice.sessionId, false)).value.saved, true)
    assert.equal((await collect(choice.sessionId, false)).value.saved, true)

    const parentCollectionSource = await host.request('/api/loadout-fixture-session', {
      presetId: 'fixture-collection-source', runtimePlugin: 'collectible-parent',
    })
    const parentCollectionName = 'collected_parent_marker'
    const originalParentTool = await readLedger(parentCollectionSource, parentCollectionName)
    assert.match(originalParentTool.value, /^[a-f0-9-]{36}$/)
    const parentCatalog = (await host.request(endpoint)).value
    const parentCollectionTool = parentCatalog.equipment.find(item => item.name === parentCollectionName)
    const parentChoice = parentCatalog.presets.find(item => item.id === target.id).tools[parentCollectionTool.id].collection
    assert.equal(parentChoice.sessionId, parentCollectionSource.sessionId)
    await host.request(endpoint, { action: 'equipment-collection', itemId: parentChoice.id, sessionId: parentChoice.sessionId, remove: false })

    const providerSession = name => host.request('/api/loadout-fixture-session', { presetId: 'standard', runtimePlugin: 'provider-' + name })
    const harborSource = await providerSession('harbor')
    const forestSource = await providerSession('forest')
    const mountainSource = await providerSession('mountain')
    const sharedName = 'fixture_shared_marker'
    const providerCatalog = async () => {
      const value = (await host.request(endpoint)).value
      const cards = value.equipment.filter(item => item.name === sharedName)
      assert.equal(cards.length, 1)
      return { card: cards[0], status: value.presets.find(item => item.id === target.id).tools[cards[0].id] }
    }
    const { card: shared, status: sharedStatus } = await providerCatalog()
    const findSource = session => sharedStatus.sourceChoices.find(option => option.collection?.sessionId === session.sessionId)
    const harbor = findSource(harborSource)
    const forest = findSource(forestSource)
    const mountain = findSource(mountainSource)
    assert.equal(new Set([harbor.sourceName, forest.sourceName, mountain.sourceName]).size, 3)
    await host.request(turnEndpoint, { sessionId: harborSource.sessionId, text: 'fixture shared source' })
    const [liveSettlement] = await settlements(harborSource.sessionId)
    const harborAward = liveSettlement.awards.find(item => item.id === harbor.sourceId)
    assert.equal(harborAward?.xp, 4)
    assert.deepEqual(harborAward.activity, [{ kind: 'provider', name: sharedName }])
    assert.ok(!liveSettlement.awards.some(item => item.id === forest.sourceId || item.id === mountain.sourceId))
    const harborToolAward = liveSettlement.awards.find(item => item.id === shared.id)
    assert.equal(harborToolAward.xp, 8)
    assert.deepEqual(harborToolAward.sourceMastery, { sourceId: harbor.sourceId,
      sourceName: harbor.sourceName, level: 1, totalXp: 8 })
    const harborRank = (await providerCatalog()).card
    assert.equal(harborRank.rank.xp, 8)
    assert.equal(harborRank.sourceRanks[harbor.sourceId].xp, 8)
    assert.equal(harborRank.sourceRanks[forest.sourceId], undefined)
    assert.deepEqual(harborRank.discoverySources.map(item => [item.sourceId, item.sessionId]),
      [[harbor.sourceId, harborSource.sessionId]])
    const pairings = (await host.request(endpoint, { action: 'equipment-field-heroes', id: shared.id })).value
    assert.deepEqual(pairings.heroes.map(row => [row.hero.id, row.rounds]), [['standard', 1]])
    assert.deepEqual(pairings.sources, [{ id: harbor.sourceId, name: harbor.sourceName }])
    const review = { action: 'equipment-field-review', id: shared.id, heroId: 'standard', sourceId: harbor.sourceId }
    assert.equal((await host.request(endpoint, review)).value.sessionId, harborSource.sessionId)
    await host.request(endpoint, { ...review, sourceId: forest.sourceId }, 422)
    const pluginPairings = (await host.request(endpoint, { action: 'equipment-field-heroes', id: harbor.sourceId })).value
    assert.deepEqual(pluginPairings.heroes.map(row => [row.hero.id, row.rounds, row.sources.length]), [['standard', 1, 0]])
    assert.equal((await uploadArt('gear', harbor.sourceId, icon)).status, 200)
    assert.equal((await uploadArt('gear', forest.sourceId, portrait)).status, 200)
    const artChoices = (await providerCatalog()).status.sourceChoices
    const harborArt = artChoices.find(choice => choice.sourceId === harbor.sourceId).art
    const forestArt = artChoices.find(choice => choice.sourceId === forest.sourceId).art
    assert.match(harborArt, /\?key=/)
    assert.match(forestArt, /\?key=/)
    assert.notEqual(harborArt, forestArt)
    await host.request(endpoint, { action: 'equipment-collection', itemId: forest.sourceId, sessionId: forestSource.sessionId, remove: false })
    assert.equal((await providerCatalog()).status.sourceId, forest.sourceId)
    const withSource = option => ({ presetId: target.id, equipmentIds: [shared.id],
      equipmentSources: { [shared.id]: option.sourceId } })
    const harborBuild = (await host.request(endpoint, withSource(harbor))).value
    const defaultBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [shared.id] })).value
    const forestBuild = (await host.request(endpoint, withSource(forest))).value
    assert.notEqual(harborBuild.presetId, forestBuild.presetId)
    assert.equal(defaultBuild.presetId, forestBuild.presetId)
    const preview = await compare(target.id, [shared.id], { equipmentSources: { [shared.id]: harbor.sourceId } })
    assert.equal(preview.gained.find(item => item.id === shared.id).sourceName, harbor.sourceName)
    const sourcePreview = value => {
      assert.ok(!value.gained.some(item => item.id === shared.id))
      assert.ok(!value.lost.some(item => item.id === shared.id))
      const change = value.sourceChanges.find(item => item.id === shared.id)
      assert.equal(change.fromSourceId, harbor.sourceId)
      assert.equal(change.sourceId, forest.sourceId)
      assert.equal(change.sourceName, forest.sourceName)
      return change
    }
    const savedSourceChange = sourcePreview(await compare(forestBuild.presetId, [], { againstPresetId: harborBuild.presetId }))
    assert.equal(savedSourceChange.fromSourceName, harbor.sourceName)
    assert.equal(savedSourceChange.art, forestArt)
    const draftSourceChange = sourcePreview(await compare(target.id, [shared.id], {
      equipmentSources: { [shared.id]: forest.sourceId }, againstDraft: withSource(harbor),
    }))
    assert.equal(draftSourceChange.fromSourceName, harbor.sourceName)
    assert.equal(sourcePreview(await compare(target.id, [shared.id], { sourceSessionId: harborSource.sessionId,
      equipmentSources: { [shared.id]: forest.sourceId } })).fromSourceName, 'peer-tool')
    assert.ok(!(await compare(forestBuild.presetId, [], { againstPresetId: forestBuild.presetId })).sourceChanges.length)
    for (const [build, option, expectedSource] of [[harborBuild, harbor, 'harbor'], [forestBuild, forest, 'forest']]) {
      const selectedSession = await host.request('/api/loadout-fixture-session', { presetId: build.presetId })
      await host.request(endpoint, { action: 'verify-live', ...selectedSession, presetId: build.presetId })
      const tool = (await equipmentIn(host, selectedSession.sessionId)).tools.find(item => item.id === shared.id)
      assert.equal(tool.state, 'ready')
      assert.equal(tool.sourceName, option.sourceName)
      assert.equal(tool.artSourceId, option.sourceId)
      assert.equal(tool.art, expectedSource === 'harbor' ? harborArt : forestArt)
      const output = await readLedger(selectedSession, sharedName)
      assert.match(output.value, new RegExp('^' + expectedSource + '/[a-f0-9-]{36}$'))
    }
    const sourceMatch = await host.request('/api/loadout-fixture-session', { presetId: harborBuild.presetId })
    await host.request(turnEndpoint, { sessionId: sourceMatch.sessionId, text: 'fixture shared source' })
    const sourceBranch = (await host.request(endpoint, { action: 'continue', sourceSessionId: sourceMatch.sessionId,
      presetId: forestBuild.presetId })).value
    await host.request(turnEndpoint, { sessionId: sourceBranch.sessionId, text: 'fixture shared source' })
    const sourceHistory = async () => (await reportFor(sourceBranch.sessionId)).turns.map(turn => {
      const item = turn.entries.find(item => item.name === sharedName)
      return [turn.inherited, item?.sourceNames, item?.sourceId, item?.art]
    })
    const expectedSourceHistory = [[false, [forest.sourceName], forest.sourceId, forestArt],
      [true, [harbor.sourceName], harbor.sourceId, harborArt]]
    assert.deepEqual(await sourceHistory(), expectedSourceHistory)
    const [forestReceipt] = (await host.request(endpoint, { action: 'match-settlements', sessionId: sourceBranch.sessionId })).value
    const forestAward = forestReceipt.awards.find(item => item.id === shared.id)
    assert.equal(forestAward.sourceId, forest.sourceId)
    assert.equal(forestAward.art, forestArt)
    assert.deepEqual(forestAward.sourceMastery, { sourceId: forest.sourceId,
      sourceName: forest.sourceName, level: 1, totalXp: 8 })
    const sharedRanks = (await providerCatalog()).card
    assert.equal(sharedRanks.rank.xp, 24)
    assert.equal(sharedRanks.sourceRanks[harbor.sourceId].xp, 16)
    assert.equal(sharedRanks.sourceRanks[forest.sourceId].xp, 8)
    const fieldUse = async heroId => (await host.request(endpoint, { action: 'hero-field-equipment', heroId })).value
      .find(item => item.id === shared.id)
    const recruiterUse = await fieldUse(target.id)
    assert.equal(recruiterUse.rounds, 2)
    assert.deepEqual(recruiterUse.sources.map(item => [item.id, item.rounds]), [[forest.sourceId, 1], [harbor.sourceId, 1]])
    assert.equal(recruiterUse.last.sessionId, sourceBranch.sessionId)
    const standardUse = await fieldUse('standard')
    assert.equal(standardUse.rounds, 1)
    assert.deepEqual(standardUse.sources.map(item => item.id), [harbor.sourceId])
    const liveForest = (await equipmentIn(host, sourceBranch.sessionId)).tools.find(item => item.id === shared.id)
    assert.equal(liveForest.sourceRank.xp, 8)
    const recordedSource = (await host.request(endpoint, { action: 'match-follow-up', sessionId: sourceBranch.sessionId,
      receiptId: forestReceipt.id, gearIds: [shared.id] })).value.gear[0]
    assert.equal(recordedSource.sourceId, forest.sourceId)
    assert.equal(recordedSource.sourceName, forest.sourceName)

    const pendingSource = await host.request('/api/loadout-fixture-session', { presetId: source.id, workspacePath })
    await host.request(turnEndpoint, { sessionId: pendingSource.sessionId })
    await waitForTool(host, pendingSource.sessionId, 'meridian_beacon')
    await host.request(turnEndpoint, { sessionId: pendingSource.sessionId, checkpoint: true })
    const pendingQueue = (await host.request(endpoint, { action: 'continue-queue', sourceSessionId: pendingSource.sessionId,
      presetId: foreignFeatured.presetId })).value
    assert.equal(pendingQueue.state, 'waiting')

    const finishedQueue = await host.request(endpoint, { action: 'continue-queue', sourceSessionId: equippedMatch.sessionId, presetId: selected.presetId })
    assert.ok(finishedQueue.value.id)
    const readyBeforeRestart = await waitForContinuation(host, equippedMatch.sessionId, 'ready')
    await host.stop()
    const queuePath = sessionId => join(env.DSH_HOME, 'profiles', 'web', 'agent-loadouts', 'continuations',
      createHash('sha256').update(sessionId).digest('hex') + '.json')
    const partial = JSON.parse(await readFile(queuePath(match.sessionId), 'utf8'))
    assert.equal(partial.sessionId, ready.sessionId)
    assert.equal(partial.state, 'ready')
    // Simulate stopping after the native branch committed and before its ready state was saved.
    partial.state = 'starting'
    delete partial.sessionId
    await writeFile(queuePath(match.sessionId), JSON.stringify(partial))
    const legacyPath = join(env.DSH_HOME, 'profiles', 'web', 'agent-loadouts', fixedBuild.presetId + '.json')
    const legacy = JSON.parse(await readFile(legacyPath, 'utf8'))
    assert.ok(legacy.standingTools.some(tool => tool.id === odd.id))
    delete legacy.standingTools
    await writeFile(legacyPath, JSON.stringify(legacy))
    const reopenedHome = join(directory, 'reopened-home')
    await symlink(env.DSH_HOME, reopenedHome, 'dir')
    host = await startHost({ ...env, DSH_HOME: reopenedHome, DSH_LOADOUT_TEST_HIDE_PEERS: '1' }, patch)
    const reopenedGrowth = await host.request('/api/loadout-fixture-session', { presetId: source.id })
    const restoredGrowth = await matchActionApi('match-growth', {}, undefined, reopenedGrowth.sessionId)
    assert.deepEqual((await providerCatalog()).card.sourceRanks, sharedRanks.sourceRanks)
    assert.equal(restoredGrowth.gear.find(item => item.id === trialTool.id).xp >= firstToolXp + 8 + 24, true)
    assert.equal(restoredGrowth.gear.find(item => item.id === trialTool.id).frame, '3')
    assert.equal(restoredGrowth.hero.frame, 'classic')
    assert.equal(restoredGrowth.hero.flag.id, profileFlag.id)
    assert.equal((await settlements())[0].id, profileReceipt.id)
    assert.equal(JSON.parse(await readFile(join(growthDirectory, 'progress.json'), 'utf8')).sessions[growthMatch.sessionId].seenReceipt, profileReceipt.id)
    assert.equal((await flagList()).find(item => item.id === flag.id).displayed, false)
    const reopenedFeatured = (await host.request(endpoint, { presetId: source.id, equipmentIds: ['evidence'] })).value
    assert.equal(reopenedFeatured.presetId, foreignFeatured.presetId)
    const recovered = await waitForContinuation(host, match.sessionId, 'ready')
    assert.equal(recovered.id, ready.id)
    assert.equal(recovered.sessionId, ready.sessionId)
    assert.equal((await inspectHistory(recovered.sessionId)).inherited, exactEnd.seq + 1)
    assert.equal((await inspectHistory(recovered.sessionId)).workspaceId, match.workspaceId)
    assert.equal((await equipmentIn(host, equippedMatch.sessionId)).continuation.sessionId, readyBeforeRestart.sessionId)
    await cancel(recovered.id)
    await assert.rejects(readFile(queuePath(match.sessionId)), { code: 'ENOENT' })
    const interrupted = await waitForContinuation(host, pendingSource.sessionId, 'interrupted')
    assert.equal(interrupted.id, pendingQueue.id)
    assert.equal(interrupted.presetId, foreignFeatured.presetId)
    assert.equal(interrupted.sessionId, undefined)
    const requeued = (await host.request(endpoint, { action: 'continue-requeue', sourceSessionId: pendingSource.sessionId,
      id: interrupted.id })).value
    assert.equal(requeued.state, 'waiting')
    assert.equal(requeued.next, true)
    assert.notEqual(requeued.id, interrupted.id)
    await host.request(turnEndpoint, { sessionId: pendingSource.sessionId, text: '恢复后核对候选人材料' })
    const afterRecovery = await waitForContinuation(host, pendingSource.sessionId, 'ready')
    assert.equal(afterRecovery.id, requeued.id)
    const recoveredHistory = await inspectHistory(afterRecovery.sessionId)
    assert.equal(recoveredHistory.presetId, foreignFeatured.presetId)
    assert.ok((await equipmentIn(host, afterRecovery.sessionId)).outfit.some(item =>
      item.id === 'evidence' && item.state === 'ready'))
    assert.ok(recoveredHistory.events.slice(0, recoveredHistory.inherited).some(event => event.type === 'user/message' &&
      event.data.content[0]?.text === '恢复后核对候选人材料'))
    const legacyMatch = await host.request('/api/loadout-fixture-session', { presetId: fixedBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...legacyMatch, presetId: fixedBuild.presetId })
    await changeSource(legacyMatch.sessionId, 'open')
    try {
      assert.equal((await readLedger(legacyMatch, odd.name)).code, 'LOADOUT_SOURCE_CHANGED')
    } finally {
      assert.equal((await changeSource(legacyMatch.sessionId, 'close')).calls, 0)
    }
    const coldReport = await reportFor(reportBranch.sessionId)
    assert.ok(coldReport.turns.every(turn => turn.inherited))
    assert.equal(coldReport.turns.at(-1).entries[0].label, '使用工具')
    assert.deepEqual(coldReport.turns.at(-1).entries[1].sourceNames, ['fixture-isolated-group'])
    assert.deepEqual(await sourceHistory(), expectedSourceHistory)
    assert.deepEqual(await programReport(), programCalls)
    assert.deepEqual(await readActions('hero', source.id), heroAction)
    await host.request(turnEndpoint, { sessionId: continued.sessionId, text: '请继续补证' })
    const resumed = await inspectHistory(continued.sessionId)
    assert.equal(resumed.presetId, selected.presetId)
    assert.equal(resumed.workspaceId, match.workspaceId)
    const reply = resumed.events.findLast(event => event.type === 'assistant/message')
    assert.equal(reply.data.message.content[0].text, '候选人已有两项可核验证据 | 请继续补证')
    await host.request(endpoint, { action: 'verify-live', ...continued, presetId: selected.presetId })
    const afterRestart = (await host.request(endpoint)).value
    await host.request(turnEndpoint, { sessionId: pinMatch.sessionId, selectOnly: true })
    assert.equal(await pinState(), 'missing')
    await shortcut(pinMatch.sessionId, privateTool, true)
    assert.equal((await pinSnapshot()).pinned.length, 0)
    const storedPlans = new Map(afterRestart.plans.map(plan => [plan.id, plan]))
    for (const [branch, savedPlan] of [['north', northPlan], ['south', southPlan]]) {
      const restored = storedPlans.get(savedPlan.id)
      assert.equal(restored.name, savedPlan.name)
      assert.equal(restored.note, savedPlan.note)
      assert.equal(restored.presetId, savedPlan.presetId)
      assert.equal(restored.broken, undefined)
      const build = afterRestart.saved.find(item => item.id === restored.presetId)
      assert.equal(build.equipmentSources[orchardCard.id], orchardSource(branch).sourceId)
    }
    await host.request(endpoint, { action: 'plan-remove', id: southPlan.id, revision: barePlan.revision }, 422)
    await host.request(endpoint, { action: 'plan-remove', id: southPlan.id, revision: southPlan.revision })
    const afterRemovingPlan = (await host.request(endpoint)).value
    assert.ok(!afterRemovingPlan.plans.some(plan => plan.id === southPlan.id))
    assert.ok(afterRemovingPlan.saved.some(build => build.id === southPlan.presetId))
    const orchardAfterRestart = afterRestart.presets.find(item => item.id === 'recruiting-advisor').tools[orchardCard.id]
    assert.deepEqual(new Set(orchardAfterRestart.sourceChoices.map(source => source.sourceId)),
      new Set(orchardChoices.map(source => source.sourceId)))
    assert.equal((await host.request(endpoint, orchardSelection('north'))).value.presetId, northBuild.presetId)
    const orchardMatch = await host.request('/api/loadout-fixture-session', { presetId: northBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...orchardMatch, presetId: northBuild.presetId })
    const orchardState = async () => (await equipmentIn(host, orchardMatch.sessionId)).outfit.find(item => item.id === orchardCard.id)
    const waitingOrchard = await orchardState()
    assert.equal(waitingOrchard.state, 'waiting')
    assert.deepEqual(waitingOrchard.roles, orchardCard.roles)
    const scheduleOrchard = { sessionId: orchardMatch.sessionId, targetKind: 'gear', targetId: orchardCard.id,
      moveId: 'gear:task', input: '核对北区材料。' }
    assert.match((await host.request(endpoint, { action: 'match-prompt', ...scheduleOrchard })).value.text,
      /当前会话的工具 "fixture_orchard_selection"/)
    const orchardTrial = (await host.request(endpoint, { action: 'match-growth', sessionId: orchardMatch.sessionId,
      includeChoices: true })).value.choices.find(item => item.id === orchardCard.id)
    assert.equal(orchardTrial.timing, 'turn')
    assert.ok(orchardTrial.trialActions.some(move => move.name === '用工具完成任务'))
    await playOrchard(orchardMatch.sessionId, 'south', 'conflict', async () => {
      assert.equal((await readLedger(orchardMatch, orchardName)).code, 'LOADOUT_SOURCE_CHANGED')
      assert.match((await orchardState()).registeredSourceName, /fixture-orchard-south/)
      await host.request(endpoint, { action: 'match-prompt', ...scheduleOrchard }, 422)
    })
    await playOrchard(orchardMatch.sessionId, 'north', 'ready', async () => {
      assert.equal((await readLedger(orchardMatch, orchardName)).value, 'north')
    })
    const orchardPlugin = (await equipmentIn(host, orchardMatch.sessionId)).profileEquipment
      .find(item => item.id.endsWith('fixture-orchard-north'))
    const orchardPin = { sessionId: orchardMatch.sessionId, itemId: orchardPlugin.id, shortcutKey: orchardPlugin.shortcutKey }
    await host.request(endpoint, { action: 'match-shortcut', ...orchardPin, remove: false })
    const orchardPluginPin = async () => (await equipmentIn(host, orchardMatch.sessionId)).pinned.find(item => item.id === orchardPlugin.id)
    assert.equal((await orchardPluginPin()).state, 'ready')
    const pinnedAudit = { sessionId: orchardMatch.sessionId, targetKind: 'gear', targetId: orchardPlugin.id,
      shortcutKey: orchardPlugin.shortcutKey, moveId: 'gear:task', input: '说明这件装备适用的工作条件。' }
    const disableOrchard = disabled => host.request('/api/loadout-fixture-profile', { branch: 'north', disabled })
    assert.equal((await disableOrchard(true)).disabled, true)
    assert.equal((await orchardState()).state, 'missing')
    assert.equal((await orchardPluginPin()).state, 'missing')
    await host.request(endpoint, { action: 'match-prompt', ...scheduleOrchard }, 422)
    const disabledOrchard = (await host.request(endpoint)).value
    assert.match(disabledOrchard.plans.find(plan => plan.id === northPlan.id).broken, /Profile.*fixture_orchard_selection/)
    assert.match(disabledOrchard.saved.find(item => item.id === northBuild.presetId).broken, /Profile.*fixture_orchard_selection/)
    assert.equal(disabledOrchard.presets.find(item => item.id === 'recruiting-advisor').tools[orchardCard.id].sourceId,
      orchardSource('south').sourceId)
    await host.request(endpoint, { presetId: northBuild.presetId, equipmentIds: [] }, 422)
    await host.request(endpoint, { action: 'verify-live', ...orchardMatch, presetId: northBuild.presetId }, 422)
    assert.equal((await disableOrchard(false)).disabled, false)
    await host.request(endpoint, { action: 'verify-live', ...orchardMatch, presetId: northBuild.presetId })
    assert.equal((await orchardState()).state, 'waiting')
    assert.equal((await orchardPluginPin()).state, 'ready')
    const pinnedRequest = randomUUID()
    const { value: pinnedSubmission } = await host.request(endpoint, { action: 'match-record', ...pinnedAudit, requestId: pinnedRequest })
    const changeOrchard = revision => host.request('/api/loadout-fixture-profile', { branch: 'north', disabled: false, revision })
    await changeOrchard('changed')
    assert.equal((await orchardState()).state, 'missing')
    assert.equal((await orchardPluginPin()).state, 'conflict')
    await host.request(endpoint, { action: 'match-prompt', ...pinnedAudit }, 422)
    await host.request(turnEndpoint, { sessionId: orchardMatch.sessionId, requestId: pinnedRequest, text: pinnedSubmission.text })
    const { value: [staleShortcutTurn] } = await host.request(endpoint, { action: 'match-settlements', sessionId: orchardMatch.sessionId })
    assert.ok(!staleShortcutTurn.awards.some(item => item.id === orchardPlugin.id))
    await host.request(endpoint, orchardSelection('north'), 422)
    await changeOrchard(null)
    await host.request(endpoint, { action: 'verify-live', ...orchardMatch, presetId: northBuild.presetId })
    assert.equal((await orchardPluginPin()).state, 'ready')
    await host.request(endpoint, { action: 'match-shortcut', ...orchardPin, remove: true })

    const orchardDraft = orchardSelection('north')
    await addAction('gear', orchardCard.id, '记录果园证据缺口')
    const { value: deferredOpening } = await host.request(endpoint, { action: 'growth-opening-choices', draft: orchardDraft, describe: true })
    const deferredChoice = deferredOpening.choices.find(item => item.id === orchardCard.id)
    assert.equal(deferredChoice.timing, 'turn')
    const deferredMove = deferredChoice.trialActions.find(item => item.name === '核对果园出处')
    assert.ok(deferredMove?.requiresInput)
    const { value: deferredMatch } = await host.request(endpoint, { action: 'growth-open', draft: orchardDraft, workspaceId: match.workspaceId,
      launchId: randomUUID().replaceAll('-', ''), quest: { mode: 'trial', title: '按果园出处核对开局材料',
        gearId: orchardCard.id, trialActionKey: deferredMove.key, questSources: { [orchardCard.id]: orchardSource('north').sourceId } } })
    assert.equal(deferredMatch.questError, undefined)
    const deferredSession = deferredMatch.sessionId
    const deferredSnapshot = await equipmentIn(host, deferredSession)
    const deferredSkill = deferredSnapshot.skills.find(item => item.id === orchardCard.id)
    assert.equal(deferredSkill.waiting, true)
    const publishedOrchardMove = deferredSkill.actions.find(item => item.proofKey === deferredMove.key)
    assert.equal(publishedOrchardMove.publisher, 'local-contributor')
    const localOrchardMove = deferredSkill.actions.find(item => item.name === '记录果园证据缺口')
    const deferredAction = { targetKind: 'gear', targetId: orchardCard.id, moveId: publishedOrchardMove.id,
      revision: publishedOrchardMove.revision, questId: deferredSnapshot.questTask.id }
    const playDeferredAction = async branch => {
      const requestId = randomUUID()
      const { value: scheduled } = await deferredQuest(deferredSession, 'match-record',
        { ...deferredAction, requestId, input: 'fixture orchard ' + branch })
      assert.match(scheduled.text, /当前会话的工具 "fixture_orchard_selection"/)
      await host.request(turnEndpoint, { sessionId: deferredSession, requestId, text: scheduled.text })
      return (await reportFor(deferredSession)).turns[0].entries.find(item => item.name === orchardName)
    }
    const { value: localOrchardPrompt } = await deferredQuest(deferredSession, 'match-prompt', {
      targetKind: 'gear', targetId: orchardCard.id, moveId: localOrchardMove.id, revision: deferredSkill.revision, input: '',
    })
    assert.match(localOrchardPrompt.text, /当前会话的工具 "fixture_orchard_selection"/)
    assert.equal((await playDeferredAction('south')).state, 'conflict')
    await deferredQuest(deferredSession, 'growth-claim', { id: deferredAction.questId }, 422)
    await disableOrchard(true)
    try {
      await deferredQuest(deferredSession, 'match-prompt', { ...deferredAction, input: 'fixture orchard north' }, 422)
    } finally {
      await disableOrchard(false)
    }
    const verifiedOrchard = await playDeferredAction('north')
    assert.equal(verifiedOrchard.state, 'completed')
    assert.equal(verifiedOrchard.sourceId, orchardSource('north').sourceId)
    await deferredQuest(deferredSession, 'growth-claim', { id: deferredAction.questId })
    const { value: [deferredAward] } = await deferredQuest(deferredSession, 'match-settlements')
    assert.equal(deferredAward.trialAction.name, deferredMove.name)
    assert.equal(deferredAward.awards.find(item => item.id === orchardCard.id).xp, 32)

    const groupedDraft = { presetId: target.id, equipmentIds: [groupedCard.id],
      equipmentSources: { [groupedCard.id]: groupedSource.sourceId } }
    const { value: groupedOpening } = await host.request(endpoint, { action: 'growth-opening-choices', draft: groupedDraft })
    const groupedChoice = groupedOpening.choices.find(item => item.id === groupedCard.id)
    const northAction = groupedChoice.trialActions.find(item => item.name === groupedBranches[0][1])
    assert.ok(northAction)
    assert.ok(groupedChoice.trialActions.some(item => item.name === groupedBranches[1][1]))
    const groupedRestoredSource = afterRestart.presets.find(item => item.id === target.id).tools[groupedCard.id]
    assert.deepEqual(groupedRestoredSource.packageMoves, groupedSource.packageMoves)
    assert.match(groupedRestoredSource.art, /\?equipment=/)
    assert.equal((await host.requestRaw(groupedRestoredSource.art)).status, 200)
    const { value: groupedOpen } = await host.request(endpoint, { action: 'growth-open', draft: groupedDraft, workspaceId: match.workspaceId,
      launchId: randomUUID().replaceAll('-', ''), quest: { mode: 'trial', title: '复核北区原始记录',
        gearId: groupedCard.id, trialActionKey: northAction.key, questSources: { [groupedCard.id]: groupedSource.sourceId } } })
    assert.equal(groupedOpen.questError, undefined)
    const groupedSnapshot = await equipmentIn(host, groupedOpen.sessionId)
    const groupedSkill = groupedSnapshot.skills.find(item => item.id === groupedCard.id)
    assert.equal(groupedSkill.waiting, true)
    const northMove = groupedSkill.actions.find(item => item.proofKey === northAction.key)
    assert.equal(northMove.publisher, 'orchard-north')
    const sendGroupedMove = async branch => {
      const requestId = randomUUID()
      const { value: prompt } = await deferredQuest(groupedOpen.sessionId, 'match-record', {
        requestId, targetKind: 'gear', targetId: groupedCard.id, moveId: northMove.id, revision: northMove.revision,
        questId: groupedSnapshot.questTask.id, input: 'fixture grouped orchard ' + branch,
      })
      await host.request(turnEndpoint, { sessionId: groupedOpen.sessionId, requestId, text: prompt.text })
      return (await reportFor(groupedOpen.sessionId)).turns[0].entries.find(item => item.id === groupedCard.id && item.type === 'tool')
    }
    assert.equal((await sendGroupedMove('south')).state, 'conflict')
    await deferredQuest(groupedOpen.sessionId, 'growth-claim', { id: groupedSnapshot.questTask.id }, 422)
    assert.equal((await sendGroupedMove('north')).state, 'completed')
    await deferredQuest(groupedOpen.sessionId, 'growth-claim', { id: groupedSnapshot.questTask.id })

    assert.equal((await equipmentIn(host, vaultSource.sessionId)).active, false)
    assert.equal((await equipmentIn(host, vaultMatch.sessionId)).active, false)
    const vaultCards = vaultNames.map(name => afterRestart.equipment.find(item => item.name === name))
    assert.ok(vaultCards.every(Boolean), 'Tools observed before and after locking a plugin should survive restart')
    const vaultTarget = afterRestart.presets.find(item => item.id === 'recruiting-advisor')
    for (const [index, card] of vaultCards.entries()) {
      const status = vaultTarget.tools[card.id]
      assert.equal(status.state, 'available')
      assert.equal(status.equipId, vaultGearId)
      assert.equal(status.deferred, index === 1)
      assert.deepEqual(status.dependencies, ['peer-ledger', 'peer-seed'])
    }
    const vaultRebuild = (await host.request(endpoint, {
      presetId: vaultTarget.id, equipmentIds: vaultCards.map(card => card.id),
    })).value
    const rebuiltVault = await host.request('/api/loadout-fixture-session', { presetId: vaultRebuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...rebuiltVault, presetId: vaultRebuild.presetId })
    const vaultOutfit = (await equipmentIn(host, rebuiltVault.sessionId)).outfit
    assert.equal(vaultOutfit.find(item => item.id === vaultCards[0].id)?.state, 'ready')
    assert.equal(vaultOutfit.find(item => item.id === vaultCards[1].id)?.state, 'waiting')
    const newVaultLedger = await readLedger(rebuiltVault, vaultNames[0])
    assert.match(newVaultLedger.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(newVaultLedger.value, originalVaultLedger.value)
    const savedReplacement = afterRestart.saved.find(item => item.id === nativeStandingBuild.presetId)
    assert.deepEqual(savedReplacement.removedEquipmentIds, [nativeKitId])
    assert.equal((await host.request(endpoint, confirmReplacement)).value.presetId, nativeStandingBuild.presetId)
    const restoredRemoval = afterRestart.saved.find(item => item.id === editedBuild.presetId)
    assert.deepEqual(restoredRemoval.removedEquipmentIds, [groupId])
    assert.deepEqual(restoredRemoval.removedEquipmentLabels, editedGear.removedEquipmentLabels)
    assert.equal((await host.request(endpoint, { presetId: editedBuild.presetId, equipmentIds: [] })).value.presetId, editedBuild.presetId)
    assert.ok(!(await host.request('/api/loadout-fixture-tools?id=' + editedBuild.presetId)).includes('standing_annotation'))
    const restoredProvider = afterRestart.saved.find(item => item.id === harborBuild.presetId)
    assert.equal(restoredProvider.equipmentSources[shared.id], harbor.sourceId)
    assert.equal(restoredProvider.equipmentSourceLabels[shared.id], harbor.sourceName)
    assert.equal((await host.request(endpoint, { ...withSource(harbor), equipmentSources: restoredProvider.equipmentSources })).value.presetId,
      harborBuild.presetId)
    const adjusted = (await host.request(endpoint, { presetId: target.id, equipmentIds: [shared.id, 'evidence'],
      equipmentSources: restoredProvider.equipmentSources })).value
    assert.notEqual(adjusted.presetId, harborBuild.presetId)
    const adjustedSession = await host.request('/api/loadout-fixture-session', { presetId: adjusted.presetId })
    await host.request(endpoint, { action: 'verify-live', ...adjustedSession, presetId: adjusted.presetId })
    assert.match((await readLedger(adjustedSession, sharedName)).value, /^harbor\/[a-f0-9-]{36}$/)
    const missingProvider = await host.request(endpoint, withSource(mountain), 422)
    assert.match(missingProvider.error.message, /已选来源当前不可用/)
    await host.request(endpoint, { action: 'compare', ...withSource(mountain) }, 422)
    const archivedFoundry = afterRestart.equipment.find(item => item.id === foundryCard.id)
    assert.deepEqual(archivedFoundry.discovery, firstFoundryUse)
    assert.equal(archivedFoundry.rank.xp, 8)
    const archivedState = afterRestart.presets.find(item => item.id === target.id).tools[foundryCard.id]
    assert.equal(archivedState.state, 'unavailable')
    assert.equal(archivedState.sourceSessionId, undefined)
    assert.equal(archivedState.canConfigureSource, true)
    const [archivedDiscovery] = archivedFoundry.discoverySources
    assert.equal(archivedDiscovery.providerId, undefined)
    assert.deepEqual(archivedDiscovery.collection, foundryDiscovery.collection)
    const archivedReport = await reportFor(foundrySession.sessionId)
    const replayEntry = archivedReport.turns.find(item => item.followUp?.id === foundryReceipt.id)
    assert.equal(replayEntry.followUp.followUpGear.find(item => item.id === foundryCard.id).sourceId, archivedDiscovery.sourceId)
    assert.ok(replayEntry.followUp.provenLoadout)
    const archivedProof = { action: 'match-proven-loadout', sessionId: foundrySession.sessionId,
      receiptId: foundryReceipt.id, gearIds: [foundryCard.id] }
    const unavailableProof = (await host.request(endpoint, archivedProof)).value
    assert.equal(unavailableProof.kind, 'round')
    const historicalGear = unavailableProof.gear.find(item => item.id === foundryCard.id)
    assert.equal(historicalGear.sourceId, archivedDiscovery.sourceId)
    assert.equal(historicalGear.available, false)
    assert.equal(unavailableProof.draft, undefined)
    const archivedProviderAward = (await settlements(foundrySession.sessionId))[0].awards.find(item => item.id === archivedDiscovery.sourceId)
    assert.deepEqual(archivedProviderAward.collection, archivedDiscovery.collection)
    const originalSource = { action: 'equipment-collection', itemId: archivedDiscovery.sourceId,
      sessionId: archivedDiscovery.sessionId, toolId: foundryCard.id, remove: false }
    await host.request(endpoint, { ...originalSource, sessionId: forestSource.sessionId }, 422)
    const foundryFollowUp = (await host.request(endpoint, { action: 'match-follow-up', sessionId: foundrySession.sessionId,
      receiptId: foundryReceipt.id, gearIds: [foundryCard.id] })).value
    assert.equal(foundryFollowUp.gear[0].sourceId, archivedDiscovery.sourceId)
    assert.equal(foundryFollowUp.quest.trialActionKey, proofOfUse.activity.find(item => item.kind === 'action').proofKey)
    const restoreFoundry = { action: 'growth-opening-choices', draft: { presetId: target.id, equipmentIds: [] }, restoreGear: foundryFollowUp.gear }
    const { value: restoredFoundry } = await host.request(endpoint, restoreFoundry)
    const [{ repair: restore }] = restoredFoundry.repairs
    assert.deepEqual(restore.collection, { id: originalSource.itemId, sessionId: originalSource.sessionId, toolId: originalSource.toolId })
    assert.deepEqual(restore.draft.equipmentSources, { [foundryCard.id]: archivedDiscovery.sourceId })
    assert.equal((await findFoundry()).discoverySources[0].collection.saved, undefined)
    const { value: restoreProvider } = await host.request(endpoint, { ...restoreFoundry, restoreGear: [{ id: originalSource.itemId }] })
    assert.deepEqual(restoreProvider.repairs[0].repair.collection, restore.collection)
    assert.equal((await host.request(endpoint, { ...originalSource,
      itemId: restore.collection.id, sessionId: restore.collection.sessionId, toolId: restore.collection.toolId,
    })).value.saved, true)
    await host.request(endpoint, { ...originalSource, toolId: shared.id }, 422)
    const recoveredFoundry = await findFoundry()
    assert.equal(recoveredFoundry.discoverySources[0].collection.saved, true)
    const availableProof = (await host.request(endpoint, archivedProof)).value
    assert.equal(availableProof.gear.find(item => item.id === foundryCard.id).available, true)
    assert.deepEqual(availableProof.draft?.equipmentSources, { [foundryCard.id]: archivedDiscovery.sourceId })
    const recoveredOpening = (await host.request(endpoint, { action: 'growth-opening-choices', draft: restore.draft })).value
    const recoveredChoice = recoveredOpening.choices.find(item => item.id === foundryCard.id)
    assert.ok(recoveredChoice.trialActions.some(item => item.key === foundryFollowUp.quest.trialActionKey))
    const recoveredMatch = (await host.request(endpoint, { action: 'growth-open', draft: restore.draft,
      workspaceId: match.workspaceId, launchId: randomUUID().replaceAll('-', ''), quest: {
        ...foundryFollowUp.quest, title: '用原工具复核材料清单', questSources: restore.draft.equipmentSources,
      } })).value
    assert.equal(recoveredMatch.questError, undefined)
    const recoveredQuest = (await equipmentIn(host, recoveredMatch.sessionId)).questTask
    const replayRequest = randomUUID()
    const { value: replayPrompt } = await host.request(endpoint, { action: 'match-record', sessionId: recoveredMatch.sessionId,
      ...customMove('gear', foundryCard.id, foundryMove), questId: recoveredQuest.id, requestId: replayRequest })
    await host.request(turnEndpoint, { sessionId: recoveredMatch.sessionId, requestId: replayRequest, text: replayPrompt.text })
    await host.request(endpoint, { action: 'growth-claim', sessionId: recoveredMatch.sessionId, id: recoveredQuest.id })
    assert.match(JSON.stringify((await inspectHistory(recoveredMatch.sessionId)).events), /Local inventory marker/)
    await host.request(endpoint, { ...originalSource, remove: true })
    const foundryRecipe = { toolId: foundryCard.id, title: '档案标记来源', text: JSON.stringify({
      name: '@deepseek-ai/dsh-mcp-client', config: {
        serverName: 'foundry', transport: 'stdio', command: process.execPath,
        args: [join(external, 'mcp-server.mjs')], failOnStartupError: true,
      },
    }) }
    const reviewedFoundry = (await host.request(endpoint, { action: 'equipment-review', ...foundryRecipe })).value
    await host.request(endpoint, { action: 'equipment-save', ...foundryRecipe, reviewedId: reviewedFoundry.id })
    const foundryBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [foundryCard.id],
      equipmentSources: { [foundryCard.id]: reviewedFoundry.id } })).value
    const newFoundry = await host.request('/api/loadout-fixture-session', { presetId: foundryBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...newFoundry, presetId: foundryBuild.presetId })
    await playFoundry(newFoundry.sessionId)
    assert.match(JSON.stringify((await inspectHistory(newFoundry.sessionId)).events), /Local inventory marker/)
    assert.deepEqual((await findFoundry()).discovery, firstFoundryUse)

    const collectedProgram = afterRestart.presets.find(preset => preset.id === target.id).tools[programCard.id]
    const originalExecutor = collectedProgram.sourceChoices.find(choice => choice.sourceId === runtimeExecutor)
    assert.deepEqual(originalExecutor.collection, { id: runtimeExecutor, saved: true })
    const carryDraft = { presetId: target.id, equipmentIds: [programCard.id], equipmentSources: { [programCard.id]: runtimeExecutor } }
    const carryChoices = (await host.request(endpoint, { action: 'growth-opening-choices', draft: carryDraft })).value
    assert.equal(carryChoices.choices.find(item => item.id === programCard.id)?.sourceId, runtimeExecutor)
    const carriedProgram = (await host.request(endpoint, carryDraft)).value
    const carriedMatch = await host.request('/api/loadout-fixture-session', { presetId: carriedProgram.presetId, workspacePath: programWorkspace })
    await host.request(endpoint, { action: 'verify-live', ...carriedMatch, presetId: carriedProgram.presetId })
    await host.request(turnEndpoint, { sessionId: carriedMatch.sessionId, text: 'fixture session ptc' })
    assert.match(JSON.stringify((await inspectHistory(carriedMatch.sessionId)).events), /inventory\.txt/)
    const carriedReport = (await reportFor(carriedMatch.sessionId)).turns[0].entries.find(item => item.name === 'run_code')
    assert.equal(carriedReport.sourceId, runtimeExecutor)

    assert.ok(!afterRestart.presets.some(item => item.id === 'fixture-collection-source'))
    const fromRemovedHero = (await host.request(endpoint, { presetId: target.id, equipmentIds: [parentCollectionTool.id] })).value
    const parentCollectionMatch = await host.request('/api/loadout-fixture-session', { presetId: fromRemovedHero.presetId })
    await host.request(endpoint, { action: 'verify-live', ...parentCollectionMatch, presetId: fromRemovedHero.presetId })
    const parentCollectionResult = await readLedger(parentCollectionMatch, parentCollectionName)
    assert.match(parentCollectionResult.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(parentCollectionResult.value, originalParentTool.value)
    assert.equal((await equipmentIn(host, collectionSource.sessionId)).active, false)
    const restoredCollection = afterRestart.equipment.find(item => item.id === choice.id)
    assert.deepEqual(restoredCollection.collection, { id: choice.id, saved: true })
    const collectionAfterRestart = afterRestart.presets.find(item => item.id === target.id).tools
    assert.deepEqual(collectionAfterRestart[collectedTool.id].dependencies, ['peer-ledger', 'peer-seed'])
    assert.equal(collectionAfterRestart[collectedTurn.id].deferred, true)
    const collectedBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [collectedTool.id, collectedTurn.id] })).value
    const collectedSession = await host.request('/api/loadout-fixture-session', { presetId: collectedBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...collectedSession, presetId: collectedBuild.presetId })
    const collectedResult = await readLedger(collectedSession, collectedToolName)
    assert.match(collectedResult.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(collectedResult.value, originalCollectionTool.value)
    const collectedMatch = await equipmentIn(host, collectedSession.sessionId)
    assert.ok(collectedMatch.tools.some(tool => tool.id === collectedTurn.id && tool.state === 'waiting'))
    assert.equal((await collect(undefined, true)).value.saved, false)
    assert.equal((await collect(undefined, true)).value.saved, false)
    const afterRemoval = (await host.request(endpoint)).value
    assert.equal(afterRemoval.equipment.find(item => item.id === choice.id)?.collection?.saved, undefined)
    await host.request(endpoint, { action: 'verify-live', ...collectedSession, presetId: collectedBuild.presetId })
    assert.ok(afterRestart.equipment.some(item => item.id === fading.id))
    const signalBuild = (await host.request(endpoint, { presetId: target.id, equipmentIds: [fading.id] })).value
    const signalSession = await host.request('/api/loadout-fixture-session', { presetId: signalBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...signalSession, presetId: signalBuild.presetId })
    const signalState = async () => (await equipmentIn(host, signalSession.sessionId)).tools.find(tool => tool.id === fading.id)?.state
    assert.equal(await signalState(), 'waiting')
    try {
      await host.request(turnEndpoint, { sessionId: signalSession.sessionId, signalTool: true })
      await waitForTool(host, signalSession.sessionId, fading.name)
      assert.equal(await signalState(), 'ready')
      const result = await host.request('/api/loadout-fixture-session-key', { sessionId: signalSession.sessionId, tool: fading.name })
      assert.equal(result.value, 'ready')
    } finally {
      await host.request(turnEndpoint, { sessionId: signalSession.sessionId, finish: true })
    }
    assert.equal(await signalState(), 'waiting')
    assert.equal(afterRestart.presets.find(preset => preset.id === target.id).art, heroArt)
    assert.equal(afterRestart.equipment.find(item => item.id === peerTool.id).art, toolArt)
    await host.request(endpoint, { action: 'art-reset', kind: 'gear', id: peerTool.id })
    assert.equal((await host.requestRaw(toolArt)).status, 404)
    assert.ok(!afterRestart.presets.some(preset => preset.id === 'fixture-peers'))
    const restoredPeers = await host.request('/api/loadout-fixture-session', { presetId: peerBuild.presetId })
    const restoredLedger = await readLedger(restoredPeers)
    assert.match(restoredLedger.value, /^[a-f0-9-]{36}$/)
    assert.notEqual(restoredLedger.value, targetLedger.value)
    const restoredSessionPeers = await host.request('/api/loadout-fixture-session', { presetId: sessionPeerBuild.presetId })
    await host.request(endpoint, { action: 'verify-live', ...restoredSessionPeers, presetId: sessionPeerBuild.presetId })
    assert.match((await readLedger(restoredSessionPeers, sessionPeerTool.name)).value, /^[a-f0-9-]{36}$/)
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + dual.presetId)).includes('standing_annotation'))
    const restoredMarkers = await host.request('/api/loadout-fixture-tools?id=' + fromBothBases.presetId)
    for (const tool of contextTools) assert.ok(restoredMarkers.includes(tool.name))
    assert.equal(afterRestart.presets.find(preset => preset.id === target.id).tools[sessionOnly.id].state, 'available')
    assert.equal(afterRestart.presets.find(preset => preset.id === target.id).tools[sessionOnly.id].deferred, true)
    const restoredBinding = await host.request('/api/loadout-fixture-session', { presetId: rightBinding.presetId })
    await host.request(endpoint, { action: 'verify-live', ...restoredBinding, presetId: rightBinding.presetId })
    assert.ok(afterRestart.equipment.some(item => item.id === customReview.id && item.name === customInput.title))
    assert.ok((await host.request('/api/loadout-fixture-tools?id=' + armed.presetId)).includes('armory_annotation'))
    const standard = afterRestart.presets.find(item => item.id === 'standard')
    assert.equal(standard.tools[late.id].live, true)
    assert.equal(standard.tools[beacon.id].deferred, true)
    assert.equal(standard.tools[annotation.id].equipId, runtimePlugin.id)
    const pluginBuild = (await host.request(endpoint, { presetId: standard.id, equipmentIds: [runtimePlugin.id, passive.id] })).value
    const pluginSession = await host.request('/api/loadout-fixture-session', { presetId: pluginBuild.presetId })
    assert.ok((await equipmentIn(host, pluginSession.sessionId)).outfit.some(item => item.id === runtimePlugin.id && item.state === 'ready'))
    await matchAction(pluginSession.sessionId, customMove('gear', runtimePlugin.id, runtimeAction))
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...pluginSession, presetId: pluginBuild.presetId })).ok, true)
    assert.ok((await equipmentIn(host, pluginSession.sessionId)).tools.some(tool => tool.id === annotation.id && tool.state === 'ready'))
    const newHero = (await host.request(endpoint, { presetId: standard.id, equipmentIds: [late.id] })).value
    const newSession = await host.request('/api/loadout-fixture-session', { presetId: newHero.presetId })
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...newSession, presetId: newHero.presetId })).ok, true)

    const restored = (await host.request(endpoint, { presetId: selected.presetId, equipmentIds: [] })).value
    assert.equal(restored.verifyLive, true)
    const fresh = await host.request('/api/loadout-fixture-session', { presetId: restored.presetId })
    assert.equal((await host.request(endpoint, { action: 'verify-live', ...fresh, presetId: restored.presetId })).ok, true)

    await host.stop()
    const otherProfile = 'loadout-report-reader'
    await exec(binary, [otherProfile, '--from-default-profile', 'web', '--help'], { env, cwd: directory })
    await exec(binary, ['plugin', '--profile', otherProfile, 'add', '-w', packagePath], { env, cwd: directory })
    host = await startHost(env, patch, otherProfile)
    const sharedReport = await reportFor(reportBranch.sessionId)
    assert.ok(sharedReport.turns.every(turn => turn.inherited))
    assert.equal(sharedReport.turns.at(-1).entries[0].label, '使用工具')
    assert.deepEqual(sharedReport.turns.at(-1).entries[1].sourceNames, ['fixture-isolated-group'])
  } finally {
    await host?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
