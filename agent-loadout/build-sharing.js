import { lighthouseHeroArms, lighthouseHeroDelivery, lighthouseHeroNeeds } from './lighthouse.js'

const prefix = 'DSHH1.'
const codeLimit = 16_384
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
const packagePattern = /^(?:@[a-z0-9][a-z0-9_.-]*\/)?[a-z0-9][a-z0-9_.-]*$/
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const toolSchemaPattern = /^tool:[a-f0-9]{12}$/
const featuredIds = new Set(['evidence', 'web', 'review', 'present'])

function shape(value, keys) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function matches(value, pattern) {
  return typeof value === 'string' && value.length <= 214 && pattern.test(value)
}

export const shareId = value => matches(value, idPattern)
export const shareVersion = value => matches(value, versionPattern)
export const sharePackageName = value => matches(value, packagePattern)

export function shareModuleName(value, packageName) {
  return typeof value === 'string' && value.length <= 214 && sharePackageName(packageName) &&
    (value === packageName || (value.startsWith(packageName + '/') &&
      value.slice(packageName.length + 1).split('/').every(shareId)))
}

function packageRef(value) {
  return shape(value, ['package', 'version']) && sharePackageName(value.package) && shareVersion(value.version)
}

function heroRef(value) {
  return shape(value, ['id', 'owner']) && shareId(value.id) && packageRef(value.owner)
}

function sourceRef(value) {
  if (value?.kind === 'preset') {
    return shape(value, ['kind', 'hero', 'entry']) && heroRef(value.hero) && shareId(value.entry)
  }
  if (value?.kind === 'profile') {
    return shape(value, ['kind', 'owner', 'module', 'entry']) && packageRef(value.owner)
      && shareModuleName(value.module, value.owner.package) && shareId(value.entry)
  }
  return false
}

function gearRef(value) {
  if (value?.kind === 'featured') {
    return shape(value, ['kind', 'operation', 'id']) && value.operation === 'equip' && featuredIds.has(value.id)
  }
  if (value?.kind === 'plugin') {
    return shape(value, ['kind', 'operation', 'source']) && ['equip', 'remove'].includes(value.operation)
      && sourceRef(value.source) && value.source.kind === 'preset'
  }
  if (value?.kind === 'tool') {
    return shape(value, ['kind', 'operation', 'source', 'tool', 'schema']) && value.operation === 'equip' &&
      shareId(value.tool) && matches(value.schema, toolSchemaPattern) && sourceRef(value.source)
  }
  return false
}

function unique(items, identity) {
  return new Set(items.map(identity)).size === items.length
}

function gearIdentity(item) {
  if (item.kind === 'featured') return item.id
  if (item.kind === 'tool') return item.schema
  const { hero, entry } = item.source
  return JSON.stringify([item.operation, hero.id, hero.owner.package, entry])
}

function slotIdentity(source) {
  return JSON.stringify([source.hero.id, source.hero.owner.package, source.entry])
}

function validRecipe(value) {
  return shape(value, ['name', 'host', 'hero', 'gear', 'dependencies', 'companions']) &&
    typeof value.name === 'string' && value.name.trim() === value.name && value.name.length > 0 &&
    value.name.length <= 48 && !/\p{Cc}/u.test(value.name) &&
    shareVersion(value.host) && heroRef(value.hero) &&
    Array.isArray(value.gear) && value.gear.length <= 48 && value.gear.every(gearRef) && unique(value.gear, gearIdentity) &&
    Array.isArray(value.dependencies) && value.dependencies.length <= 48 && value.dependencies.every(packageRef) &&
    unique(value.dependencies, item => item.package) &&
    Array.isArray(value.companions) && value.companions.length <= 48 &&
    value.companions.every(item => item?.kind === 'preset' && sourceRef(item)) && unique(value.companions, slotIdentity) &&
    value.gear.every(item => item.operation !== 'remove' ||
      item.source.hero.id === value.hero.id && item.source.hero.owner.package === value.hero.owner.package
      && item.source.hero.owner.version === value.hero.owner.version)
}

export function encodeBuildShare(recipe) {
  if (!validRecipe(recipe)) throw new Error('这套出装超出分享码的支持范围。')
  const code = prefix + Buffer.from(JSON.stringify(recipe)).toString('base64url')
  if (code.length > codeLimit) throw new Error('这套出装超出分享码的支持范围。')
  return code
}

export function decodeBuildShare(value) {
  if (typeof value !== 'string' || value.length > codeLimit || !value.trim().startsWith(prefix)) {
    throw new Error('分享码无效或版本不受支持。')
  }
  const payload = value.trim().slice(prefix.length)
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('分享码无效或版本不受支持。')
  try {
    const bytes = Buffer.from(payload, 'base64url')
    const recipe = JSON.parse(bytes.toString('utf8'))
    if (bytes.toString('base64url') === payload && validRecipe(recipe) &&
      bytes.equals(Buffer.from(JSON.stringify(recipe)))) return recipe
  } catch {
    // The sharing format contains only versioned, validated JSON.
  }
  throw new Error('分享码无效或版本不受支持。')
}

const challengePrefix = 'DSHC1.'
const challengeLimit = Math.ceil(codeLimit * 4 / 3) + 100
const challengeSample = 'lighthouse-evidence-1'
export const lighthouseChallengeName = 'Lighthouse evidence challenge'
const invalidChallenge = '灯塔挑战码无效或版本不受支持。'
const heroChallengePrefix = 'DSHC2.'
const heroChallengeLimit = 128
const heroChallengeSamples = { en: 'lighthouse-hero-handoff-1-en', zh: 'lighthouse-hero-handoff-1-zh' }

function challengeLoadout(code) {
  if (typeof code !== 'string' || code.trim() !== code) throw new Error(invalidChallenge)
  const recipe = decodeBuildShare(code)
  const featured = recipe.gear.filter(item => item.kind === 'featured')
  if (recipe.name !== lighthouseChallengeName || recipe.hero.id !== 'standard' || featured.length !== 2 ||
    !['present', 'evidence'].every(id => featured.some(item => item.id === id)) ||
    recipe.gear.some(item => item.kind !== 'featured' && (item.kind !== 'plugin' || item.operation !== 'remove'))) {
    throw new Error(invalidChallenge)
  }
  return code
}

export function encodeLighthouseChallenge(loadout) {
  const data = { sample: challengeSample, loadout: challengeLoadout(loadout) }
  return challengePrefix + Buffer.from(JSON.stringify(data)).toString('base64url')
}

export function decodeLighthouseChallenge(value) {
  if (typeof value !== 'string' || value.length > challengeLimit || !value.trim().startsWith(challengePrefix)) {
    throw new Error(invalidChallenge)
  }
  const payload = value.trim().slice(challengePrefix.length)
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error(invalidChallenge)
  try {
    const bytes = Buffer.from(payload, 'base64url')
    const data = JSON.parse(bytes.toString('utf8'))
    if (shape(data, ['sample', 'loadout']) && data.sample === challengeSample &&
      bytes.toString('base64url') === payload && bytes.equals(Buffer.from(JSON.stringify(data)))) {
      return challengeLoadout(data.loadout)
    }
  } catch {
    // The public sample and its portable loadout are both versioned.
  }
  throw new Error(invalidChallenge)
}

export function isLighthouseHeroChallenge(value) {
  return typeof value === 'string' && value.trim().startsWith(heroChallengePrefix)
}

export function encodeLighthouseHeroChallenge(language, need) {
  if (!Object.hasOwn(heroChallengeSamples, language) || !lighthouseHeroNeeds.includes(need)) throw new Error(invalidChallenge)
  const sample = heroChallengeSamples[language]
  return heroChallengePrefix + Buffer.from(JSON.stringify({ sample, need })).toString('base64url')
}

export function decodeLighthouseHeroChallenge(value) {
  if (!isLighthouseHeroChallenge(value) || value.length > heroChallengeLimit) throw new Error(invalidChallenge)
  const code = value.trim()
  const payload = code.slice(heroChallengePrefix.length)
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error(invalidChallenge)
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (shape(data, ['sample', 'need'])) {
      const { sample, need } = data
      const language = Object.keys(heroChallengeSamples).find(key => heroChallengeSamples[key] === sample)
      if (language && encodeLighthouseHeroChallenge(language, need) === code) return { sample, need, language }
    }
  } catch {
    // Only canonical recipes for bundled public tasks can be replayed.
  }
  throw new Error(invalidChallenge)
}

const heroReportPrefix = 'DSHR1.'
const heroReportLimit = 192
const invalidHeroReport = '英雄战报码无效或版本不受支持。'

export function encodeLighthouseHeroReport(language, need, arm, originalAttached) {
  if (!Object.hasOwn(heroChallengeSamples, language) || !lighthouseHeroNeeds.includes(need) ||
    (!lighthouseHeroArms.includes(arm) && arm !== lighthouseHeroDelivery) || typeof originalAttached !== 'boolean') {
    throw new Error(invalidHeroReport)
  }
  const sample = heroChallengeSamples[language]
  return heroReportPrefix + Buffer.from(JSON.stringify({ sample, need, arm, originalAttached })).toString('base64url')
}

export function decodeLighthouseHeroReport(code) {
  if (typeof code !== 'string' || code.length > heroReportLimit || !code.startsWith(heroReportPrefix)) {
    throw new Error(invalidHeroReport)
  }
  const payload = code.slice(heroReportPrefix.length)
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error(invalidHeroReport)
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (shape(data, ['sample', 'need', 'arm', 'originalAttached'])) {
      const { sample, need, arm, originalAttached } = data
      const language = Object.keys(heroChallengeSamples).find(key => heroChallengeSamples[key] === sample)
      if (language && encodeLighthouseHeroReport(language, need, arm, originalAttached) === code) {
        return { language, need, arm, originalAttached }
      }
    }
  } catch {
    // Only canonical reports on a versioned public sample can be compared.
  }
  throw new Error(invalidHeroReport)
}
