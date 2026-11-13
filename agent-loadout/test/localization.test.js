import assert from 'node:assert/strict'
import test from 'node:test'
import { englishText, localizeDisplay } from '../localization.js'
import { actionPrompt, equipmentPrompt, heroActions } from '../match-actions.js'
import { englishShortcutPromptPrefix } from '../match-shortcuts.js'

test('English display preserves source identities, proof keys, and user instructions', () => {
  const instruction = '继续补证'
  const item = {
    id: 'evidence', name: '证据核验', roles: ['guard'],
    decisions: [['继续补证', '列出待补材料、来源和需要核实的问题。']],
    sourceId: 'profile:example', proofKey: 'action:example', instruction, note: instruction,
  }
  const localized = localizeDisplay({ equipment: [item], roles: { guard: '核验' } })
  assert.deepEqual(localized.roles, { guard: 'Verify' })
  assert.deepEqual(localized.equipment[0], {
    ...item, name: 'Evidence Check', decisions: [['Gather more evidence', 'List missing materials, possible sources, and questions to verify.']],
  })
  assert.equal(englishText('not in the dictionary'), 'not in the dictionary')
})

test('built-in English actions retain the same proof and leave submitted materials intact', () => {
  const action = { equipmentId: 'evidence', moveId: 'check', input: '请保留这段材料' }
  const record = { equipmentIds: ['evidence'] }
  const schemas = [{ name: 'ask_user_question' }]
  const zh = equipmentPrompt(record, schemas, action)
  const en = equipmentPrompt(record, schemas, { ...action, language: 'en' })
  assert.match(en.text, /^【Evidence Check】Check key evidence/)
  assert.match(en.text, /Pause submission/)
  assert.ok(en.text.endsWith(action.input))
  assert.deepEqual(en.move, zh.move)
  const tool = equipmentPrompt(record, [], { toolId: 'tool:fixture', input: 'Inspect it', language: 'en' },
    { id: 'tool:fixture', name: 'read_file', deferred: true })
  assert.ok(tool.text.startsWith(englishShortcutPromptPrefix + '"read_file"'))
  assert.match(tool.text, /registers during the turn/)

  const hero = { id: 'recruiting-advisor', title: '招聘顾问', kind: 'hero', builtIn: true, actions: heroActions('recruiting-advisor') }
  const moveId = hero.actions[0].id
  const english = actionPrompt(hero, [], { moveId, input: 'Inspect the evidence', language: 'en' })
  assert.match(english.text, /^【Recruiting Advisor】Deliver with this preset/)
  assert.equal(english.move.proofKey, hero.actions[0].proofKey)
})
