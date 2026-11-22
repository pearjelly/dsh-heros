window.__ModuleLoader__.load({
  id: 'dsh-agent-loadout',
  factory(require) {
    const { createElement: h, createContext, useContext, Fragment, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } = require('react')
    const WorkspaceSetupContext = createContext(null)
    const panelId = 'agent-loadout'
    let activeLanguage = { getSnapshot: () => 'zh', subscribe: () => () => {} }
    let english = Object.create(null)
    const t = (text, key = text) => activeLanguage.getSnapshot() === 'en' && Object.hasOwn(english, key) ? english[key] : text
    const panelLabel = () => t('深度荣耀')

    function useLanguage() {
      return useSyncExternalStore(activeLanguage.subscribe, activeLanguage.getSnapshot)
    }
    const asset = name => 'url("api/agent-loadout/' + name + '.webp")'
    const heroes = new Map([
      ['standard', [0, '先锋']],
      ['ptc', [1, '编排师']],
      ['minimal', [2, '游侠']],
      ['cordis', [3, '铸造师']],
      ['recruiting-advisor', [4, '鉴证官']],
    ])
    const featured = new Map([['evidence', 0], ['web', 1], ['review', 2], ['present', 3]])
    const categories = [
      ['featured', '精选装备'],
      ['built-in', '英雄自带'],
      ['plugin', '会话插件'],
      ['module', '独立模块'],
      ['tool', '工具'],
      ['discovered', '实战发现'],
      ['collection', '收藏'],
      ['profile', 'Profile 插件'],
      ['market', '装备市场'],
    ]
    const empty = []
    const emptyMap = Object.freeze({})
    const imageTypes = ['image/png', 'image/jpeg', 'image/webp']
    const sealColors = ['#f0c37e', '#e8a5ad', '#aed7a5', '#98d8d1', '#b5b5ee', '#a8cbe9', '#f1b29b', '#ddd39b']
    const sealAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    const frameTiers = [[3, '熟练'], [5, '精通'], [6, '大师']]

    function hash(value) {
      let result = 0
      for (const letter of value) result = (Math.imul(result, 31) + letter.codePointAt(0)) >>> 0
      return result
    }

    function portrait(id) {
      const builtIn = heroes.get(id)
      return builtIn ? [builtIn[0], t(builtIn[1])] : [hash(id) % 12, null]
    }

    function artStyle(name, index, columns, rows) {
      return {
        backgroundImage: asset(name),
        backgroundSize: columns * 100 + '% ' + rows * 100 + '%',
        backgroundPosition: (index % columns) / (columns - 1) * 100 + '% ' +
          Math.floor(index / columns) / (rows - 1) * 100 + '%',
      }
    }

    function artSeal(id, sourceId) {
      let seed = hash(sourceId ? JSON.stringify([id, sourceId]) : id)
      seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b)
      seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35)
      seed = (seed ^ (seed >>> 16)) >>> 0
      const code = [0, 5, 10].map(shift => sealAlphabet[(seed >>> shift) & 31]).join('')
      return { code, color: sealColors[(seed >>> 15) & 7], shape: (seed >>> 18) & 3, hue: ((seed >>> 20) & 7) * 12 - 42 }
    }

    function Glyph({ kind, size = 18 }) {
      const paths = {
        crest: 'M12 2l8 5v8l-8 7-8-7V7z M12 7l4 5-4 5-4-5z',
        plus: 'M12 5v14 M5 12h14',
        pin: 'M9 3h6l-1 5 4 4v2H6v-2l4-4-1-5z M12 14v7',
        close: 'M6 6l12 12 M18 6L6 18',
        arrow: 'M4 12h16 M13 5l7 7-7 7',
        back: 'M20 12H4 M11 5l-7 7 7 7',
        swap: 'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4',
        team: 'M13 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M11 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M16 14a4 4 0 0 1 4 4v2 M15 4a3 3 0 0 1 0 6',
        mastery: 'M12 2l7 4v8l-7 4-7-4V6z M9 10l2 2 4-4 M8 16l-2 6 6-2 6 2-2-6',
        flag: 'M5 22V3h14v12l-7-3-7 3 M9 7h6',
        image: 'M3 4h18v16H3z M3 16l5-5 4 4 4-5 5 6 M15 8h.01',
        action: 'M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z M19 17v4 M17 19h4',
        report: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',
        folder: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 2h7',
        search: 'M14.5 14.5l5 5 M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
        lock: 'M6 10h12v10H6z M9 10V7a3 3 0 0 1 6 0v3',
        fullscreen: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
        volume: 'M4 9h4l4-4v14l-4-4H4z M16 9c2 2 2 4 0 6 M19 6c4 4 4 8 0 12',
      }
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[kind] }))
    }

    function frameTier(rank) {
      return frameTiers.findLast(([level]) => level <= rank?.level)
    }

    function FrameDecoration({ rank, wide }) {
      if (rank?.frame === 'classic') return null
      const level = rank?.frame && rank.frame !== 'auto' ? rank.frame : frameTier(rank)?.[0]
      if (!level) return null
      return h('span', { className: 'moba-frame', 'data-frame-level': level, 'data-wide': wide, 'aria-hidden': true })
    }

    function FramePicker({ name, rank, disabled, value = rank.frame ?? 'auto', onChange }) {
      return h('label', { className: 'moba-frame-picker' }, t('熟练度边框'),
        h('select', { value, disabled, 'aria-label': name + t('的熟练度边框'), onChange: event => onChange(event.target.value) },
          h('option', { value: 'auto' }, t('自动 · 最高已解锁')),
          h('option', { value: 'classic' }, t('经典')),
          frameTiers.map(([level, label]) => h('option', { key: level, value: String(level), disabled: rank.level < level },
            t(label) + (rank.level < level ? ' · Lv.' + level + t(' 解锁') : '')))))
    }

    function Art({ src, className, fallback, seal, rank }) {
      const [failed, setFailed] = useState(null)
      const framed = rank?.frame !== 'classic' && Boolean(frameTier(rank))
      const showSeal = seal && (!src || failed === src || seal.inheritedIcon)
      const badge = showSeal && h('span', { className: 'moba-art-seal', style: { color: seal.color }, 'data-shape': seal.shape }, seal.code)
      if (src && src !== failed) {
        const wrap = framed || showSeal
        const img = h('img', { src, className: wrap ? 'moba-image moba-framed-image' : className + ' moba-image',
          alt: '', draggable: false, onError: () => setFailed(src) })
        return wrap ? h('span', { className: className + ' moba-framed-art', 'aria-hidden': true },
          img, badge, framed && h(FrameDecoration, { rank })) : img
      }
      return h('span', { className: className + (seal ? ' moba-illustrated-fallback' : '') + (framed ? ' moba-framed-art' : ''),
        style: seal ? undefined : fallback, 'aria-hidden': true },
        seal && h('span', { className: 'moba-atlas-sprite', style: { ...fallback, filter: 'hue-rotate(' + seal.hue + 'deg)' } }),
        badge,
        framed && h(FrameDecoration, { rank }))
    }

    function HeroArt({ id, art, className, rank }) {
      const [index] = portrait(id)
      const fallback = heroes.has(id) ? artStyle('heroes', index, 3, 2) : artStyle('guest-heroes', index, 4, 3)
      return h(Art, { src: art, className, fallback, rank, seal: heroes.has(id) ? undefined : artSeal(id) })
    }

    function ItemArt({ item, className = '', rank = item.rank }) {
      const index = featured.get(item.id)
      const fallback = index === undefined
        ? artStyle('gear-collection', hash(item.id) % 16, 4, 4) : artStyle('equipment', index, 4, 3)
      const source = item.artSourceId ?? item.sourceId
      const tool = item.id.startsWith('tool:')
      const sourceId = tool && source !== 'profile' ? source : undefined
      const seal = index === undefined ? { ...artSeal(item.id, sourceId),
        inheritedIcon: tool && (item.art?.startsWith('/api/agent-loadout/art?icon=') || item.art?.endsWith('&provider=1')) } : undefined
      return h(Art, { src: item.art, className: 'moba-item-art ' + className, fallback, rank,
        seal })
    }

    function MasteryBadge({ rank, className = '' }) {
      if (!rank || rank.level === 1) return null
      return h('small', { className: 'moba-mastery-badge ' + className, 'data-level': rank.level },
        rank.badge && h(Glyph, { kind: 'mastery', size: 13 }), 'Lv.' + rank.level, rank.badge && ' · ' + rank.badge)
    }

    function FlagInsignia({ flag }) {
      if (!flag) return null
      const title = [flag.partner && t('协作搭档 ') + flag.partner, ...flag.pair.map(item => [item.name, item.sourceName].filter(Boolean).join(' · ')), flag.comboAction,
        flag.stagedAction && t('分回合 · ') + flag.stagedAction].filter(Boolean).join(' · ')
      return h('span', { className: 'moba-flag-insignia', title },
        h(Glyph, { kind: 'flag', size: 14 }), h('span', null, flag.title),
        (flag.comboAction || flag.stagedAction) && h(Glyph, { kind: 'mastery', size: 13 }))
    }

    function SignatureInsignia({ item, compact = false }) {
      if (!item) return null
      const label = t('招牌装备 · ') + item.name + (item.sourceName ? ' · ' + item.sourceName : '')
      return h('span', { className: compact ? 'moba-signature moba-signature-compact' : 'moba-signature',
        role: 'img', 'aria-label': label, title: label },
        h(ItemArt, { item }), !compact && h('span', null, item.name))
    }

    function RoleFilter({ roles, used, value, onChange, label }) {
      return h('div', { className: 'moba-role-filter', role: 'group', 'aria-label': label },
        h('button', { type: 'button', 'aria-pressed': !value, onClick: () => onChange('') }, t('全部职能')),
        Object.entries(roles).filter(([id]) => used.has(id)).map(([id, name]) => h('button', { key: id,
          type: 'button', 'data-role': id, 'aria-pressed': value === id, onClick: () => onChange(id) }, name)))
    }

    function outfitAppearance(heroId, items, removed) {
      if (!items.length && !removed.length) return null
      const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id, 'en'))
      const equipment = sorted.map(item => [item.id, item.sourceId ?? item.artSourceId ?? ''])
      const identity = JSON.stringify([heroId, equipment, [...removed].sort()])
      const seed = hash(identity)
      const colors = [...new Set(sorted.flatMap(item => [...(item.roles ?? empty)].sort()))]
      const first = colors[0] ?? 'specialist'
      const last = colors.at(-1) ?? first
      const accent = artSeal(identity).color
      return { identity, style: {
        '--outfit-first': 'var(--role-' + first + ', #d6b3d9)',
        '--outfit-last': 'var(--role-' + last + ', #d6b3d9)',
        '--outfit-angle': 28 + (seed % 244) + 'deg',
        '--outfit-cut': 12 + ((seed >>> 8) % 29) + '%',
        '--outfit-inset': 30 + ((seed >>> 16) % 29) + '%',
        '--outfit-light-x': 16 + (seed % 69) + '%',
        '--outfit-light-y': 45 + ((seed >>> 8) % 51) + '%',
        '--outfit-accent': accent,
      } }
    }

    function OutfitTrim({ appearance }) {
      return appearance && h('span', { className: 'moba-outfit-trim', style: appearance.style, 'aria-hidden': true },
        h('span', { className: 'moba-outfit-light' }), h('span', { className: 'moba-outfit-edge' }), h('span', { className: 'moba-outfit-edge' }))
    }

    function StageEquipment({ heroId, items, removed, roles, onInspect, disabled }) {
      const appearance = outfitAppearance(heroId, items, removed)
      const identity = appearance?.identity ?? ''
      const previous = useRef({ identity: '', items: [] })
      const [role, setRole] = useState()
      useEffect(() => {
        if (previous.current.identity === identity) return
        const prior = previous.current.items
        const changed = items.findLast(item => !prior.some(entry => entry.id === item.id && entry.sourceId === item.sourceId))
          ?? prior.find(item => !items.some(entry => entry.id === item.id))
        const role = changed?.roles?.[0] ?? 'specialist'
        previous.current = { identity, items }
        setRole({ identity, role })
      }, [identity, items])
      return h(Fragment, null,
        items.length > 0 && h('div', { className: 'moba-stage-gear', role: 'group', 'aria-label': t('立绘装备') },
          items.slice(0, 4).map(item => h('button', { key: item.id, type: 'button', disabled, 'data-role': item.roles?.[0] ?? 'specialist',
            'aria-label': [t('查看立绘装备 ') + item.name, item.sourceName].filter(Boolean).join(' · '),
            title: [item.name, item.sourceName, roles[item.roles?.[0]]].filter(Boolean).join(' · '),
            onClick: () => onInspect(item) }, h(ItemArt, { item }))),
          items.length > 4 && h('span', { 'aria-label': t('另有 ') + (items.length - 4) + t(' 件装备') }, '+' + (items.length - 4))),
        h(OutfitTrim, { appearance }),
        role?.identity === identity && h('div', { key: identity, className: 'moba-stage-effect', 'data-role': role.role,
          style: appearance?.style, 'aria-hidden': true }))
    }

    function HeroStage({ preset, presets, selections, removed, roles, onInspect, onSelect, onBrowse, onAppearance, onActions, disabled }) {
      const epithet = preset && portrait(preset.id)[1]
      const rosterRef = useRef(null)
      const rosterTitle = useId()
      useEffect(() => {
        const row = rosterRef.current
        const selected = row?.querySelector('[data-picked="true"]')
        if (!selected) return
        const reveal = () => {
          const bounds = row.getBoundingClientRect()
          const card = selected.getBoundingClientRect()
          if (card.right > bounds.right) row.scrollLeft += card.right - bounds.right + 3
          if (card.left < bounds.left) row.scrollLeft -= bounds.left - card.left + 3
        }
        const observer = new ResizeObserver(reveal)
        observer.observe(row)
        reveal()
        return () => observer.disconnect()
      }, [preset?.id])
      return h('section', { className: 'moba-draft', 'aria-label': t('选择英雄') },
        h('div', { className: 'moba-stage', key: preset?.id ?? 'empty' },
          preset && h(HeroArt, { id: preset.id, art: preset.art, className: 'moba-splash' }),
          h('div', { className: 'moba-stage-shade' }),
          preset && h(StageEquipment, { heroId: preset.id, items: selections, removed, roles, onInspect, disabled }),
          h(FrameDecoration, { rank: preset?.rank, wide: true }),
          preset && h('div', { className: 'moba-portrait-controls' },
            h('button', { type: 'button', className: 'moba-portrait-action', disabled,
              onClick: () => onActions('hero', preset) }, h(Glyph, { kind: 'action', size: 15 }), t('设置英雄操作')),
            h('button', { type: 'button', className: 'moba-portrait-action', disabled,
              onClick: () => onAppearance('hero', preset) }, h(Glyph, { kind: 'image', size: 15 }), t('英雄外观'))),
          h('div', { className: 'moba-hero-title' },
            h('h2', null, preset?.name ?? t('没有可用英雄')),
            preset && h('p', { className: 'moba-hero-role' }, [epithet, ...(preset.roles ?? []).map(role => roles[role])].filter(Boolean).join(' · ')),
            h(MasteryBadge, { rank: preset?.rank }),
            h(FlagInsignia, { flag: preset?.flag }),
            h(SignatureInsignia, { item: preset?.signature }),
            preset?.description && h('p', null, preset.description),
            preset?.gearCompatibility?.length > 0 && h('p', { className: 'moba-hero-compatibility' },
              preset.gearCompatibility.length + t(' 件自带装备受版本限制')))),
        h('div', { className: 'moba-roster' },
          h('div', { className: 'moba-roster-heading' },
            h('h3', { id: rosterTitle }, t('英雄阵容')),
            h('button', { className: 'moba-roster-open', type: 'button', disabled: disabled || !presets.length,
              'aria-haspopup': 'dialog', onClick: onBrowse }, h(Glyph, { kind: 'search', size: 15 }), t('英雄图鉴'))),
          h('fieldset', { className: 'moba-portraits', ref: rosterRef, 'aria-labelledby': rosterTitle, disabled },
            presets.map(hero => h('label', { className: 'moba-hero', key: hero.id,
              'data-picked': hero.id === preset?.id, 'data-broken': Boolean(hero.broken), title: hero.broken ?? hero.name },
            h('input', { type: 'radio', name: 'moba-hero', value: hero.id, disabled: Boolean(hero.broken),
              checked: hero.id === preset?.id, onChange: () => onSelect(hero.id) }),
            h(HeroArt, { ...hero, className: 'moba-avatar' }),
            hero.rank?.badge && h('small', { className: 'moba-roster-medal', 'data-level': hero.rank.level, title: hero.rank.badge },
              h(Glyph, { kind: 'mastery', size: 14 })),
            h('span', null, hero.name))))))
    }

    function statusWithSource(status, sourceId) {
      if (!sourceId || status?.sourceId === sourceId) return status
      return status?.sourceChoices?.find(option => option.sourceId === sourceId)
        ?? { state: 'unavailable', reason: t('所选装备来源当前不可用，请重新选择。') }
    }

    function gearAfterHeroChange(gear, hero, sources) {
      const kept = []
      const replaced = []
      const removed = []
      for (const item of gear) {
        const status = statusWithSource(hero.tools[item.id], sources[item.id])
        if (status?.state !== 'available') removed.push(item)
        else if (status.replacement?.remove.length) replaced.push(item)
        else kept.push(item)
      }
      return { kept, replaced, removed }
    }

    function DecisionList({ moves, actionKeys, onAction, actionLabel = t('筹备试炼') }) {
      if (!moves?.length) return null
      return h('ul', { className: 'moba-decisions' }, moves.map(([title, detail], index) => {
        const key = onAction && actionKeys?.[index]
        return h('li', { key: title + ':' + index }, h('strong', null, title), (detail || key) && h('span', null, detail && h('span', null, detail),
          key && h('button', { type: 'button', className: 'moba-text moba-decision-action',
            'aria-label': actionLabel + ' · ' + title, onClick: () => onAction(key, title) }, actionLabel)))
      }))
    }

    function fieldAddress(proof) {
      return proof.delegation ? { childSessionId: proof.sessionId, parentSessionId: proof.delegation.ancestors[0],
        mode: proof.delegation.mode } : proof.sessionId
    }

    function HeroFieldEquipment({ hero, rules, catalog, request, onInspect, onReview, onSignature, focusItem }) {
      const { id: heroId, signature } = hero
      const [open, setOpen] = useState(Boolean(focusItem))
      const [only, setOnly] = useState(focusItem)
      const [equipment, setEquipment] = useState(null)
      const [error, setError] = useState('')
      const [pending, setPending] = useState(false)
      const [actionError, setActionError] = useState('')
      const [attempt, retry] = useState(0)
      const [shown, show] = useState(6)
      useEffect(() => {
        if (!open) return
        const abort = new AbortController()
        request('hero-field-equipment', { action: 'hero-field-equipment', heroId }, abort.signal)
          .then(items => {
            if (!abort.signal.aborted) { setEquipment(items); setError('') }
          })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [open, request, heroId, attempt])

      async function display(item) {
        setPending(true)
        setActionError('')
        try {
          const selected = await request('growth-signature', { action: 'growth-signature', heroId,
            id: item?.historyId ?? null, sourceId: item?.sourceId })
          onSignature(heroId, selected)
        } catch (reason) {
          setActionError(reason.message)
        } finally {
          setPending(false)
        }
      }

      const visible = only ? equipment?.filter(item => item.id === only) : equipment
      return h('details', { className: 'moba-gallery-kit moba-field-equipment', open, onToggle: event => setOpen(event.currentTarget.open) },
        h('summary', null, t('实战装备'), equipment?.length > 0 && ' · ' + equipment.length + t(' 件')),
        only && h('button', { type: 'button', className: 'moba-text moba-field-all', onClick: () => setOnly(undefined) }, t('查看全部实战装备')),
        rules && h('p', null,
          t('英雄和装备都达到 Lv.') + rules.level + t('，且一起累计 ') + rules.uses + t(' 次实战结算，即可设为招牌。')),
        signature && h('p', { className: 'moba-field-current', role: 'status' },
          h('span', null, t('当前招牌 · ') + signature.name),
          h('button', { className: 'moba-text', type: 'button', disabled: pending, onClick: () => display(null) }, t('收起徽记'))),
        actionError && h('p', { role: 'alert' }, actionError),
        error ? h('p', { role: 'alert' }, error, ' ', h('button', { className: 'moba-text', type: 'button',
          onClick: () => { setError(''); retry(value => value + 1) } }, t('重试')))
          : !equipment ? h('p', { role: 'status' }, t('正在读取实战装备…'))
            : visible.length === 0 ? h('p', null, only ? t('这位英雄没有这件装备的实战结算。') : t('这位英雄还没有装备结算记录。')) :
              h('ul', { className: 'moba-field-list' }, visible.slice(0, shown).map(item => {
                const { last, sources } = item
                const progress = item.signatureProgress
                const displayed = signature?.id === item.historyId
                const counts = [item.rounds > 0 && item.rounds + t(' 个回合'), item.actions > 0 && item.actions + t(' 次原生操作结算')].filter(Boolean)
                const kind = item.kind === 'tool' ? t('工具') : item.kind === 'featured' ? t('精选装备') : profileEquipmentKind(item.id) ?? t('插件')
                const sourceName = source => source.name ?? source.id.slice(-6)
                return h('li', { key: item.historyId }, h(ItemArt, { item }),
                  h('div', { className: 'moba-field-detail' }, h('strong', null, item.name),
                    h('small', null, [kind, ...counts].join(' · ')),
                    rules && progress && !progress.ready && h('small', null,
                      t('装备 Lv.') + progress.gearLevel + t(' · 实战 ') + Math.min(progress.uses, rules.uses) + '/' + rules.uses),
                    sources.length === 1 && h('small', null, t('来源 ') + sourceName(sources[0])),
                    sources.length > 1 && h('details', { className: 'moba-field-sources' },
                      h('summary', null, sourceName(sources[0]) + t(' · 共 ') + sources.length + t(' 个来源')),
                      sources.map(source => h('small', { key: source.id }, sourceName(source) + ' · ' + source.rounds + t(' 个回合')))),
                    h('div', { className: 'moba-field-actions' },
                      displayed ? h('small', { className: 'moba-field-displayed' }, t('展示中'))
                        : progress?.ready && h('button', { className: 'moba-text moba-signature-pick', type: 'button', disabled: pending,
                          'aria-label': t('将 ') + item.name + t(' 设为招牌'), onClick: () => display(item) }, t('设为招牌')),
                      catalog.has(item.id) && h('button', { className: 'moba-text', type: 'button',
                        'aria-label': t('在装备库查看 ') + item.name, onClick: () => onInspect(item.id) }, t('查看装备')),
                      last.sessionId && h('button', { className: 'moba-text', type: 'button',
                        'aria-label': t('回看 ') + item.name + t(' 的最近对局'), onClick: () => onReview(fieldAddress(last)) }, t('回看最近对局')))))
              })),
        visible?.length > shown && h('button', { className: 'moba-text', type: 'button', onClick: () => show(value => value + 6) }, t('查看更多装备')))
    }

    function HeroRoundHistory({ hero, request, onReview, onPrepare }) {
      const [open, setOpen] = useState(false)
      const [page, setPage] = useState(null)
      const [cursor, setCursor] = useState(undefined)
      const [pending, setPending] = useState(false)
      const [error, setError] = useState('')
      const [attempt, retry] = useState(0)
      const [selected, setSelected] = useState(null)
      useEffect(() => {
        if (!open) return
        const abort = new AbortController()
        setPending(true)
        setError('')
        request('hero-round-history', { action: 'hero-round-history', heroId: hero.id, before: cursor }, abort.signal)
          .then(next => {
            if (!abort.signal.aborted) setPage(current => ({ ...next,
              rounds: cursor ? [...(current?.rounds ?? empty), ...next.rounds] : next.rounds }))
          })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
          .finally(() => { if (!abort.signal.aborted) setPending(false) })
        return () => abort.abort()
      }, [open, hero.id, cursor, attempt, request])

      function toggle(event) {
        const expanded = event.currentTarget.open
        setOpen(expanded)
        if (!expanded) { setCursor(undefined); setPage(null); setSelected(null) }
      }

      return h('details', { className: 'moba-gallery-kit moba-hero-rounds', onToggle: toggle },
        h('summary', null, t('实战记录')),
        selected ? h(SettlementFollowUp, { key: selected.id, sessionId: selected.sessionId, receipt: selected, request,
          onPrepare, onBack: () => setSelected(null), backLabel: t('返回实战记录') })
          : h(Fragment, null,
            error && h('p', { role: 'alert' }, error, ' ', h('button', { className: 'moba-text', type: 'button',
              onClick: () => retry(value => value + 1) }, t('重试'))),
            !page && !error && h('p', { role: 'status' }, t('正在读取实战记录…')),
            page?.rounds.length === 0 && h('p', null, t('这位英雄还没有已结算的回合。')),
            page?.rounds.length > 0 && h('ol', { className: 'moba-hero-round-list' }, page.rounds.map(round => {
              return h('li', { key: round.id },
                h('div', { className: 'moba-hero-round-heading' },
                  h('strong', null, t('第 ') + round.turn + t(' 回合')),
                  h('span', null, t('英雄 +') + round.xp + ' XP')),
                h('small', null, [round.workspace, Number.isFinite(round.time) && reportTime(round.time),
                  round.delegation && t('队友回合')].filter(Boolean).join(' · ')),
                round.gear.length > 0 && h('details', { className: 'moba-hero-round-items' },
                  h('summary', null, h('span', { className: 'moba-hero-round-icons', 'aria-hidden': true },
                    round.gear.slice(0, 5).map(item => h(ItemArt, { key: item.id, item }))),
                  round.gear.length + t(' 件装备获得经验')),
                  h('ul', { className: 'moba-hero-round-gear', 'aria-label': t('获得经验的装备') },
                    round.gear.map(item => h('li', { key: item.id }, h(ItemArt, { item }),
                      h('div', null, h('strong', null, item.name),
                        h('small', null, [item.sourceName, ...(item.actions ?? empty), '+' + item.xp + ' XP'].filter(Boolean).join(' · '))))))),
                h('div', { className: 'moba-field-actions' },
                  h('button', { type: 'button', className: 'moba-text', onClick: () => onReview(fieldAddress(round)) }, t('回看对局')),
                  !hero.broken && round.followUpGear.length > 0 && h('button', { type: 'button', className: 'moba-text',
                    onClick: () => setSelected(round) }, t('用本回合打法备战'))))
            })),
            page?.before !== undefined && h('button', { type: 'button', className: 'moba-text', disabled: pending || Boolean(error),
              onClick: () => setCursor(page.before) }, pending ? t('正在读取…') : t('更早的回合'))))
    }

    function HeroSwitchPreview({ hero, currentDraft, baseOnly, change, sources, request }) {
      const [scope, setScope] = useState('carry')
      const [loaded, setLoaded] = useState(null)
      const [attempt, retry] = useState(0)
      const [activeDelta, setActiveDelta] = useState('')
      const id = useId()
      const kept = change?.kept ?? empty
      const replacements = change?.replaced ?? empty
      const replace = scope === 'replace'
      const equipmentIds = (scope === 'base' ? empty : [...kept, ...(replace ? replacements : empty)]).map(item => item.id)
      const removals = replace ? [...new Set(replacements.flatMap(item =>
        statusWithSource(hero.tools[item.id], sources[item.id])?.replacement?.remove ?? []))] : empty
      const removedNames = removals.length ? [...removedBuiltIns(removals, hero.builtIn)].map(id => hero.builtIn[id]?.name ?? id) : empty
      const key = JSON.stringify({ action: 'compare', presetId: hero.id, equipmentIds,
        equipmentSources: sourcesFor(equipmentIds, sources), removedEquipmentIds: removals, againstDraft: currentDraft })
      const checked = loaded?.key === key ? loaded : undefined

      useEffect(() => {
        if (!currentDraft) return
        const abort = new AbortController()
        const timer = setTimeout(() => {
          request('compare', JSON.parse(key), abort.signal)
            .then(result => { if (!abort.signal.aborted) setLoaded({ key, result }) })
            .catch(reason => { if (!abort.signal.aborted) setLoaded({ key, error: reason.message }) })
        }, 140)
        return () => { clearTimeout(timer); abort.abort() }
      }, [key, request, attempt])

      return h('section', { className: 'moba-gallery-comparison', 'aria-labelledby': id },
        h('h4', { id }, t('切换英雄对照')),
        currentDraft && (kept.length > 0 || replacements.length > 0) && h('label', null, t('对照范围'),
          h('select', { value: scope, onChange: event => setScope(event.target.value) },
            h('option', { value: 'carry' }, t('保留可直接装配的装备')),
            replacements.length > 0 && h('option', { value: 'replace' }, t('预览确认替换后')),
            h('option', { value: 'base' }, t('只看自带能力')))),
        baseOnly && h('p', null, t('当前出装有待处理的装备，先与当前英雄的基础阵容对照。')),
        scope === 'carry' && replacements.length > 0 && h('p', null, t('需确认替换的装备可在上方切换预览。')),
        removedNames.length > 0 && h('p', null, t('这套出装会卸下 ') + removedNames.join('、') + '。'),
        !currentDraft ? h('p', { role: 'status' }, t('当前英雄的阵容暂不可用。'))
          : checked?.error ? h('p', { className: 'moba-alert', role: 'alert' }, checked.error, ' ',
            h('button', { className: 'moba-text', type: 'button', onClick: () => { setLoaded(null); retry(value => value + 1) } }, t('重试')))
            : checked?.result ? h(Fragment, null,
              h('p', { className: 'moba-gallery-compare-names' }, checked.result.before.name, h(Glyph, { kind: 'arrow', size: 13 }), checked.result.after.name),
              h(CapabilityDifferences, { result: checked.result, activeDelta, setActiveDelta }),
              h('p', null, t('按 DSH 当前登记的能力预览，开局时核验实际状态。')))
              : h('p', { role: 'status' }, t('正在比对阵容…')))
    }

    function HeroGallery({ presets, items, roles, current, initialHero, initialEquipment, gear, sources, currentDraft, baseOnly, request, signatureRules, onSignature,
      onRegistered, onClose, onSelect, onInspectGear, onOpenMatch, onPrepareRound, onPrepareDelivery, trialHeroes, onOpenTrial, workspaces }) {
      const [query, setQuery] = useState('')
      const [role, setRole] = useState('')
      const [choice, setChoice] = useState(initialHero ?? current)
      const [importId, setImportId] = useState(null)
      const [trialOpen, setTrialOpen] = useState(false)
      const importOpen = importId !== null
      const pick = event => setChoice(event.currentTarget.value)
      const dialog = useRef(null)
      const search = useRef(null)
      const pickedCard = useRef(null)
      const trialButton = useRef(null)
      const titleId = useId()
      const groupId = useId()
      const catalog = useMemo(() => new Set(items.map(item => item.id)), [items])
      const roster = useMemo(() => {
        const toolNames = new Map(items.filter(item => item.kind === 'tool').map(item => [item.id, item.name]))
        return presets.map(hero => {
          const builtIn = Object.values(hero.builtIn)
          const tools = new Set(builtIn.flatMap(item => item.tools))
          for (const [id, status] of Object.entries(hero.tools)) {
            if (status.state === 'included' && toolNames.has(id)) tools.add(toolNames.get(id))
          }
          const names = [...new Set(builtIn.map(item => item.name))]
          const moves = [...(hero.heroMoves ?? empty), ...(hero.packageMoves ?? empty)]
          return { hero, names, tools: [...tools], moves,
            search: [hero.name, hero.id, hero.description, ...(hero.roles ?? []).map(role => roles[role]),
              ...names, ...tools, ...moves.map(([name]) => name)].join('\n').toLowerCase() }
        })
      }, [presets, items, roles])
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const visible = roster.filter(entry => (!role || entry.hero.roles?.includes(role)) && terms.every(term => entry.search.includes(term)))
      const preview = visible.find(entry => entry.hero.id === choice) ?? visible[0]
      const hero = preview?.hero
      const change = hero && hero.id !== current && !hero.broken && gear.length > 0
        ? gearAfterHeroChange(gear, hero, sources) : null

      useEffect(() => {
        const modal = dialog.current
        modal.showModal()
        search.current.focus()
        pickedCard.current?.scrollIntoView({ block: 'nearest' })
        return () => modal.close()
      }, [])

      function close() {
        dialog.current.close()
        onClose()
      }

      return h(Fragment, null, h('dialog', { ref: dialog, className: 'moba-gallery', 'aria-labelledby': titleId,
        onCancel: event => { event.preventDefault(); close() } },
        h('header', { className: 'moba-gallery-heading' },
          h('h2', { id: titleId }, importOpen ? importId ? t('核对旧预设更新') : t('接入旧预设') : t('英雄图鉴')),
          h('div', { className: 'moba-gallery-heading-actions' },
            !importOpen && h('button', { className: 'moba-text', type: 'button', onClick: () => setImportId('') }, t('接入旧预设')),
            h('button', { className: 'moba-icon-action', type: 'button', 'aria-label': t('关闭图鉴'), onClick: close },
              h(Glyph, { kind: 'close' })))),
        importOpen ? h(LegacyPresetImport, { initialId: importId, request, onRegistered,
          onBack: id => {
            if (id) { setChoice(id); setQuery(''); setRole('') }
            setImportId(null)
            requestAnimationFrame(() => search.current?.focus())
          } }) : h(Fragment, null, h('div', { className: 'moba-gallery-body' },
          h('div', { className: 'moba-gallery-roster' },
            h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 17 }),
              h('input', { type: 'search', ref: search, value: query, 'aria-label': t('搜索英雄'),
                placeholder: t('搜索英雄、预设 ID、能力或操作'),
                onChange: event => setQuery(event.target.value) })),
            h(RoleFilter, { roles, used: new Set(presets.flatMap(hero => hero.roles ?? [])), value: role, onChange: setRole, label: t('英雄职能') }),
            visible.length === 0 ? h('p', { className: 'moba-empty', role: 'status' }, t('未找到匹配的英雄。')) :
              h('fieldset', { className: 'moba-gallery-grid', 'aria-label': t('预览英雄') },
                visible.map(({ hero: option }) => h('label', { key: option.id, className: 'moba-hero',
                  ref: option.id === hero.id ? pickedCard : undefined,
                  'data-picked': option.id === hero.id, title: option.name },
                  h('input', { type: 'radio', name: groupId, value: option.id, checked: option.id === hero.id,
                    onChange: pick, onClick: pick }),
                  h(HeroArt, { ...option, className: 'moba-avatar' }),
                  h('span', { className: 'moba-gallery-card-name' }, option.name),
                  option.broken ? h('small', { className: 'moba-gallery-unavailable' }, t('不可用')) :
                    option.id === current && h('small', null, t('当前英雄')))))),
          hero && h('div', { className: 'moba-gallery-preview', key: hero.id },
            h('div', { className: 'moba-gallery-portrait' },
              h(HeroArt, { id: hero.id, art: hero.art, className: 'moba-splash' }),
              h('div', { className: 'moba-stage-shade' }),
              h(FrameDecoration, { rank: hero.rank, wide: true }),
              h('div', { className: 'moba-hero-title' }, h('h3', null, hero.name), h(MasteryBadge, { rank: hero.rank }),
                h('p', { className: 'moba-hero-role' }, (hero.roles ?? []).map(role => roles[role]).join(' · ')),
                h(FlagInsignia, { flag: hero.flag }), h(SignatureInsignia, { item: hero.signature }))),
            h('div', { className: 'moba-gallery-facts' },
              hero.name !== hero.id && h('code', null, hero.id),
              hero.description && h('p', null, hero.description),
              h(HeroRoundHistory, { hero, request, onReview: address => { close(); onOpenMatch(address) },
                onPrepare: followUp => { onPrepareRound(followUp); close() } }),
              h(HeroFieldEquipment, { hero, rules: signatureRules, catalog, request, onSignature,
                focusItem: hero.id === initialHero ? initialEquipment : undefined,
                onInspect: id => { close(); onInspectGear(id) }, onReview: address => { close(); onOpenMatch(address) } }),
              hero.legacyManaged && h('button', { className: 'moba-text moba-legacy-review', type: 'button',
                onClick: () => setImportId(hero.id) }, t('核对旧预设更新')),
              hero.broken ? h('p', { className: 'moba-alert', role: 'status' }, hero.broken) :
                h(Fragment, null,
                  change && h('dl', { className: 'moba-gallery-gear' },
                    [[t('保留装备'), change.kept], [t('需确认替换'), change.replaced], [t('卸下装备'), change.removed]]
                      .filter(([, group]) => group.length).map(([label, group]) =>
                        h(Fragment, { key: label }, h('dt', null, label),
                          h('dd', null, h('ul', null, group.map(item =>
                            h('li', { key: item.id }, h(ItemArt, { item }), h('span', null, item.name)))))))),
                  hero.id !== current && h(HeroSwitchPreview, { hero, currentDraft, baseOnly, change, sources, request }),
                  trialHeroes.length === 2 && trialHeroes.some(item => item.id === hero.id) && h('div', { className: 'moba-gallery-comparison' },
                    h('button', { ref: trialButton, className: 'moba-roster-open', type: 'button', 'aria-haspopup': 'dialog',
                      onClick: () => setTrialOpen(true) }, t(heroTrialTitle)),
                    h('p', null, t('让标准模式和极简模式处理同一张补给卡，看看哪种交付适合接班人。'))),
                  hero.gearCompatibility?.length > 0 && h('details', { className: 'moba-gallery-kit', open: true },
                    h('summary', null, t('受版本限制的自带装备')), hero.gearCompatibility.map(item => h('div', {
                      key: item.id, className: 'moba-compatibility-gear',
                    }, h(ItemArt, { item }), h(CompatibilityDetails, { issues: item.compatibility })))),
                  hero.legacySkipped?.length > 0 && h('details', { className: 'moba-gallery-kit' },
                    h('summary', null, t('接入时跳过的插件 · ') + hero.legacySkipped.length),
                    h('ul', { className: 'moba-legacy-modules' }, hero.legacySkipped.map(name => h('li', { key: name }, name)))),
                  preview.moves.length > 0 && h('details', { className: 'moba-gallery-kit', open: true },
                    h('summary', null, t('英雄操作')), h(DecisionList, { moves: preview.moves, actionKeys: hero.heroActionKeys,
                      actionLabel: hero.id === current ? t('筹备交付') : t('选用并筹备交付'), onAction: onPrepareDelivery && ((key, title) => {
                        close()
                        onPrepareDelivery(hero, key, title)
                      }) })),
                  (preview.names.length > 0 || preview.tools.length > 0) &&
                    h('details', { className: 'moba-gallery-kit' }, h('summary', null, t('自带能力')),
                      preview.names.length > 0 && h('p', null, preview.names.join('、')),
                      preview.tools.length > 0 && h('p', null, preview.tools.join('、'))))))),
        h('footer', { className: 'moba-gallery-footer' },
          h('button', { type: 'button', className: 'moba-start', disabled: !hero || Boolean(hero.broken),
            onClick: () => {
              close()
              if (hero.id !== current) onSelect(hero.id)
            } }, hero?.id === current ? t('返回当前阵容') : t('选择英雄'), h(Glyph, { kind: 'arrow', size: 17 }))))),
        trialOpen && h(HeroTrial, { request, workspaces, firstHeroes: trialHeroes, onClose: () => {
          setTrialOpen(false)
          requestAnimationFrame(() => trialButton.current?.focus())
        }, onVisit: (sessionId, task) => { close(); onOpenTrial(sessionId, task) } }))
    }

    function LegacyPresetImport({ initialId, request, onRegistered, onBack }) {
      const [candidates, setCandidates] = useState(null)
      const [picked, setPicked] = useState('')
      const [preview, setPreview] = useState(null)
      const [result, setResult] = useState(null)
      const [pending, setPending] = useState(false)
      const [failure, setFailure] = useState('')
      const [attempt, retry] = useState(0)
      const focus = useRef(null)
      const groupId = useId()
      const current = candidates?.find(item => item.id === picked)
      const update = preview?.managed
      const nativePreset = (current?.registered && !current.managed) || (preview?.registered && !update)
      const replacements = preview?.replacements ?? empty
      const replacementTargets = new Set(replacements.map(item => item.to))
      const differences = preview?.changes && [
        [t('待恢复'), preview.changes.restoring], [t('新增'), preview.changes.added.filter(name => !replacementTargets.has(name))],
        [t('配置有变化'), preview.changes.changed], [t('移除'), preview.changes.removed],
      ].filter(([, names]) => names.length)

      useEffect(() => { focus.current?.focus() }, [])
      useEffect(() => {
        if (candidates) return
        const abort = new AbortController()
        request('legacy-presets', { action: 'legacy-presets' }, abort.signal).then(items => {
          if (abort.signal.aborted) return
          setCandidates(items)
          setPicked((items.find(item => item.id === initialId) ?? items.find(item => !item.registered)
            ?? items.find(item => item.managed) ?? items[0])?.id ?? '')
        }).catch(error => { if (!abort.signal.aborted) setFailure(error.message) })
        return () => abort.abort()
      }, [attempt, candidates, initialId, request])

      useEffect(() => {
        if (!picked || (current?.registered && !current.managed) || result) return
        const abort = new AbortController()
        request('legacy-preset-preview', { action: 'legacy-preset-preview', id: picked }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setPreview(value) })
          .catch(error => { if (!abort.signal.aborted) setFailure(error.message) })
        return () => abort.abort()
      }, [attempt, current?.managed, current?.registered, picked, request, result])

      async function attach() {
        if (!preview || pending || preview.id !== picked) return
        setPending(true)
        setFailure('')
        try {
          const action = update ? 'legacy-preset-refresh' : 'legacy-preset-attach'
          const attached = await request(action, { action, id: picked,
            revision: preview.revision, skipMissing: preview.missing.length > 0 })
          setResult(attached)
          onRegistered()
        } catch (error) {
          setFailure(error.message)
          setPreview(null)
        } finally {
          setPending(false)
        }
      }

      return h(Fragment, null,
        h('div', { className: 'moba-gallery-body' },
          h('div', { className: 'moba-gallery-roster' },
            candidates?.length ? h('fieldset', { className: 'moba-plan-list', 'aria-label': t('本机旧预设'), disabled: pending || Boolean(result) },
              candidates.map(item => h('label', { key: item.id, className: 'moba-plan-option', 'data-picked': item.id === picked },
                h('input', { type: 'radio', name: groupId, value: item.id, checked: item.id === picked,
                  onChange: () => { setPreview(null); setFailure(''); setPicked(item.id) } }),
                h(HeroArt, { id: item.id, className: 'moba-avatar' }),
                h('span', null, h('strong', null, item.name), h('small', null, item.id)),
                item.registered && h('small', null, item.managed ? t('可核对更新') : t('已在图鉴')))))
              : !failure && h('p', { className: 'moba-empty', role: 'status' }, candidates ? t('此 DSH 数据目录没有旧预设。') : t('正在读取本机预设…'))),
          h('div', { className: 'moba-gallery-preview moba-legacy-preview' },
            failure && h('p', { className: 'moba-alert', role: 'alert' }, failure, ' ',
              h('button', { type: 'button', className: 'moba-text', onClick: () => { setFailure(''); retry(value => value + 1) } }, t('重新读取'))),
            result ? h(Fragment, null,
              h('h3', null, result.name ?? current?.name ?? picked),
              h('p', { role: 'status' }, result.updated ? t('已更新英雄阵容。') : result.broken
                ? t('已接入图鉴，DSH 报告装备加载失败。') : t('此预设已在英雄图鉴。')),
              result.restored?.length > 0 && h('div', { className: 'moba-legacy-restored' },
                h('strong', null, t('恢复 ') + result.restored.length + t(' 项')),
                h('ul', { className: 'moba-legacy-modules' }, result.restored.map(name => h('li', { key: name }, name)))),
              result.skipped?.length > 0 && h('p', null, t('已停用 ') + result.skipped.length + t(' 个缺少模块或依赖的插件。')),
              result.broken && h('p', { className: 'moba-alert moba-legacy-error' }, result.broken))
              : nativePreset ? h('p', { role: 'status' }, t('这位英雄已在图鉴。'))
                : preview?.id === picked ? h(Fragment, null,
                  h('h3', null, preview.name),
                  preview.description && h('p', null, preview.description),
                  h('code', null, preview.folder),
                  replacements.length > 0 && h('div', { className: 'moba-legacy-replacements' },
                    h('strong', null, t('由当前 DSH 接替')),
                    h('ul', { className: 'moba-legacy-modules' }, replacements.map(item => h('li', { key: item.from },
                      h('span', null, item.from), h('span', null, (item.included ? t('已并入 ') : t('改用 ')) + item.to))))),
                  differences?.length > 0 && h('dl', { className: 'moba-legacy-diff' }, differences.map(([label, names]) =>
                    h(Fragment, { key: label }, h('dt', null, label),
                      h('dd', null, h('ul', { className: 'moba-legacy-modules' }, names.map(name => h('li', { key: name }, name))))))),
                  preview.missing.length > 0 && h('div', { className: 'moba-alert' },
                    h('strong', null, t('本机找不到 ') + preview.missing.length + t(' 个插件')),
                    h('ul', { className: 'moba-legacy-modules' }, preview.missing.map(name => h('li', { key: name }, name))),
                    h('p', null, t('确认后，当前 Profile 的副本会停用这些插件，以及缺少依赖的插件。'))),
                  h('details', { className: 'moba-gallery-kit', open: !update && !preview.missing.length && !replacements.length },
                    h('summary', null, t('自带插件 · ') + preview.modules.length),
                    h('ul', { className: 'moba-legacy-modules' }, preview.modules.map(name => h('li', { key: name }, name)))),
                  h('p', null, update ? t('正在运行的会话沿用开局阵容，新开局使用更新后的配置。')
                    : t('确认后，DSH 会从此来源加载预设，并在当前 Profile 保留它。')))
                : current && !failure && h('p', { role: 'status' }, t('正在读取预设…')))),
        h('footer', { className: 'moba-gallery-footer' },
          h('button', { className: 'moba-roster-open', type: 'button', ref: focus, disabled: pending,
            onClick: () => onBack(result?.id ?? (current?.registered || preview?.registered ? picked : undefined)) }, result ? t('查看图鉴') : t('返回图鉴')),
          !result && !nativePreset && h('button', { className: 'moba-start', type: 'button',
            disabled: pending || preview?.id !== picked, onClick: attach },
            pending ? t('正在加载…') : update ? preview?.missing.length ? t('更新为可用配置') : t('确认更新阵容')
              : preview?.missing.length ? t('接入可用配置') : t('确认接入'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function draftEquipmentStatus(status, removed, sourceId) {
      const selected = statusWithSource(status, sourceId)
      if (removed.has(selected?.equipId) || removed.has(selected?.sourceId)) {
        return { state: 'unavailable', reason: t('已卸下提供此工具的自带装备。') }
      }
      if (removed.has(selected?.includedBy)) return { state: 'removed', reason: t('已卸下提供此工具的自带装备。') }
      if (selected?.availableAfterRemoving?.every(id => removed.has(id))) return { state: 'available' }
      if (selected?.replacement?.remove.length) {
        const remove = selected.replacement.remove.filter(id => !removed.has(id))
        return { ...selected, replacement: remove.length ? { ...selected.replacement, remove } : undefined }
      }
      return selected
    }

    function standingConflicts(id, status, selected, draftStatus, claims) {
      if (status?.state !== 'available') return empty
      const target = claims[status.equipId ?? id]
      if (!target?.length) return empty
      return selected.flatMap(idInDraft => {
        if (idInDraft === id) return []
        const current = draftStatus(idInDraft)
        if (current?.state !== 'available') return []
        const tools = (claims[current.equipId ?? idInDraft] ?? empty)
          .filter(({ name, provider }) => target.some(claim => claim.name === name && claim.provider !== provider))
          .map(({ name }) => name)
        return tools.length ? [{ id: idInDraft, tools: [...new Set(tools)] }] : []
      })
    }

    function sourcesFor(ids, sources) {
      return Object.fromEntries(ids.filter(id => sources[id]).map(id => [id, sources[id]]))
    }

    function labelSavedBuilds(builds) {
      const labeled = builds.map(build => {
        const sources = new Set(Object.values(build.equipmentSourceLabels ?? emptyMap))
        const prefix = build.baseName + ' · '
        const label = sources.size && build.name.startsWith(prefix)
          ? [build.baseName, ...sources, build.name.slice(prefix.length)].join(' · ')
          : [build.name, ...sources].join(' · ')
        return { ...build, label }
      })
      const counts = new Map()
      for (const build of labeled) counts.set(build.label, (counts.get(build.label) ?? 0) + 1)
      return labeled.map(build => counts.get(build.label) === 1 ? build
        : { ...build, label: build.label + ' · ' + build.id.slice(-6) })
    }

    function removedBuiltIns(ids, builtIn) {
      return new Set(ids.flatMap(id => [id, ...(builtIn[id]?.linked ?? [])]))
    }

    function restoringBuiltIn(id, roots, builtIn) {
      return roots.filter(key => key !== id && !builtIn[key]?.linked.includes(id))
    }

    function cardState(item, status, equipped) {
      if (equipped && status?.state === 'unavailable') return t('来源待选')
      if (status?.draftConflicts?.length) return equipped ? t('来源冲突') : t('可替换')
      if (item.compatibility?.length && (status?.state === 'unavailable' || status?.state === 'profile' && !item.enabled)) return t('版本受限')
      if (status?.state === 'configure') return item.compatibility?.length ? t('版本受限') : t('已安装')
      if (status?.replacement?.remove.length) return equipped ? t('待替换来源') : t('可替换')
      if (equipped) return status?.conditional ? t('已装备 · 按条件启用') : status?.deferred ? t('已装备 · 回合触发') : t('已装备')
      if (status?.state === 'removed') return t('已卸下')
      if (status?.state === 'included') {
        const label = status.includedSourceName ? t('随 Profile 提供') : t('英雄自带')
        return status.conditional ? label + t(' · 按条件启用') : label
      }
      if (status?.state === 'profile') return item.enabled ? t('已启用') : t('可管理')
      if (status?.state === 'unavailable') return item.discovery && status.canConfigureSource ? t('待配置来源') : t('当前不可装备')
      return status?.conditional ? t('可装备 · 按条件启用') : status?.deferred ? t('可装备 · 回合触发') : t('可装备')
    }

    function CompatibilityDetails({ issues }) {
      return issues?.length > 0 && h('ul', { className: 'moba-compatibility', 'aria-label': t('版本要求') }, issues.map(issue =>
        h('li', { key: issue.name + '@' + issue.version },
          h('strong', null, issue.name + '@' + issue.version),
          h('span', null, t('当前 DSH ') + issue.runtimeVersion + t(' · 需要更新插件或更换宿主版本')),
          Object.entries(issue.requirements).map(([name, range]) => h('small', { key: name }, t('要求 ') + name + ' ' + range)))))
    }

    function masteryText({ level, xp }) {
      return 'Lv.' + level + ' · ' + xp + ' XP'
    }

    function EquipmentPairings({ item, presets, request, onShowHero, onOpenSource, onPreview }) {
      const { id } = item
      const [open, setOpen] = useState(false)
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [attempt, retry] = useState(0)
      const [shown, setShown] = useState(5)
      const [filter, setFilter] = useState('')
      const [reviewing, setReviewing] = useState('')
      const [reviewError, setReviewError] = useState('')
      const reviewRequest = useRef(null)
      useEffect(() => () => reviewRequest.current?.abort(), [])
      useEffect(() => {
        if (!open) return
        const abort = new AbortController()
        request('equipment-field-heroes', { action: 'equipment-field-heroes', id }, abort.signal)
          .then(value => { if (!abort.signal.aborted) { setData(value); setError('') } })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [open, request, id, attempt])

      const filtered = data?.heroes.flatMap(row => {
        if (!filter) return [row]
        const source = row.sources.find(item => item.id === filter)
        return source ? [{ ...row, rounds: source.rounds, actions: 0, last: source.last, time: source.time }] : []
      }) ?? empty
      if (filter) filtered.sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.rounds - a.rounds)
      const sourceName = source => source.name ?? source.id.slice(-6)

      async function review(heroId, proof) {
        if (proof) return onOpenSource(fieldAddress(proof))
        if (reviewRequest.current) return
        const abort = new AbortController()
        reviewRequest.current = abort
        setReviewing(heroId)
        setReviewError('')
        try {
          const last = await request('equipment-field-review', { action: 'equipment-field-review', id, heroId, sourceId: filter }, abort.signal)
          if (!abort.signal.aborted) onOpenSource(fieldAddress(last))
        } catch (reason) {
          if (!abort.signal.aborted) setReviewError(reason.message)
        } finally {
          reviewRequest.current = null
          if (!abort.signal.aborted) setReviewing('')
        }
      }

      return h('details', { className: 'moba-pairings', onToggle: event => {
        const expanded = event.currentTarget.open
        setOpen(expanded)
        if (!expanded && reviewRequest.current) { reviewRequest.current.abort(); setReviewing('') }
      } },
        h('summary', null, t('实战搭配'), data?.heroes.length > 0 && ' · ' + data.heroes.length + t(' 位英雄')),
        error ? h('p', { role: 'alert' }, error, ' ', h('button', { className: 'moba-text', type: 'button',
          onClick: () => { setError(''); retry(value => value + 1) } }, t('重试')))
          : !data ? h('p', { role: 'status' }, t('正在读取实战搭配…'))
            : !data.heroes.length ? h('p', null, t('这件装备还没有实战结算。')) : h(Fragment, null,
              data.sources.length > 0 && h('label', { className: 'moba-tool-source' }, t('实战来源'),
                h('select', { value: filter, disabled: Boolean(reviewing), onChange: event => {
                  setFilter(event.target.value); setShown(5); setReviewError('')
                } },
                  h('option', { value: '' }, t('全部来源')),
                  data.sources.map(source => h('option', { key: source.id, value: source.id }, sourceName(source))))),
              h('ul', { className: 'moba-pairings-list' }, filtered.slice(0, shown).map(({ hero, last, rounds, actions, sources }) => {
                const preset = presets.find(item => item.id === hero.id)
                const original = preset?.tools[id]
                const status = filter && original?.includedBy !== filter ? statusWithSource(original, filter) : original
                const available = !preset || preset.broken ? t('英雄当前不可用')
                  : status?.replacement?.remove.length ? t('需换下 ') + status.replacement.remove.map(id => preset.builtIn[id]?.name ?? id).join('、')
                    : status?.state === 'included' ? status.includedSourceName ? t('随 Profile 提供') : t('基础阵容自带')
                      : status?.state === 'available' ? t('基础阵容可装配')
                        : status?.state === 'unavailable' ? t('当前来源不可装配') : undefined
                const counts = [rounds > 0 && rounds + t(' 个回合'), actions > 0 && actions + t(' 次原生操作结算')].filter(Boolean)
                return h('li', { key: hero.id },
                  h(HeroArt, { ...hero, className: 'moba-pairing-portrait' }),
                  h('div', { className: 'moba-pairing-facts' },
                    h('strong', null, hero.name),
                    h('small', null, [...counts, available].filter(Boolean).join(' · ')),
                    !filter && sources.length === 1 && h('small', null, sourceName(sources[0]) + ' · ' + sources[0].rounds + t(' 个回合')),
                    !filter && sources.length > 1 && h('details', { className: 'moba-field-sources' },
                      h('summary', null, sources.length + t(' 个已核验来源')),
                      sources.map(source => h('small', { key: source.id }, sourceName(source) + ' · ' + source.rounds + t(' 个回合')))),
                    h('div', { className: 'moba-field-actions' },
                      preset && !preset.broken && (item.kind !== 'tool' || sources.length > 0) &&
                        h('button', { type: 'button', className: 'moba-text moba-pairing-preview-link', disabled: Boolean(reviewing),
                          'aria-label': t('预览 ') + hero.name + t(' 的实战搭配'),
                          onClick: () => onPreview({ item, hero, sources, sourceId: filter || (sources.length === 1 ? sources[0].id : '') }) },
                          t('预览试装')),
                      preset && h('button', { type: 'button', className: 'moba-text', disabled: Boolean(reviewing),
                        'aria-label': t('查看英雄 ') + hero.name, onClick: () => onShowHero(hero.id, id) }, t('查看英雄')),
                      (last || filter) && h('button', { type: 'button', className: 'moba-text', disabled: Boolean(reviewing),
                        'aria-label': t('回看 ') + hero.name + (filter ? t(' 使用此来源的对局') : t(' 的最近装备对局')),
                        onClick: () => review(hero.id, last) }, reviewing === hero.id ? t('正在查找…') : filter ? t('回看该来源') : t('回看最近对局')))))
              })),
              reviewError && h('p', { role: 'alert' }, reviewError),
              filtered.length > shown && h('button', { type: 'button', className: 'moba-text', onClick: () => setShown(value => value + 5) },
                t('查看更多英雄'))))
    }

    function EquipmentLinks({ title, action, links, onOpen }) {
      if (!links.length) return null
      return h('details', { className: 'moba-equipment-links', open: links.length <= 4 },
        h('summary', null, title, ' · ' + links.length),
        h('ul', { className: 'moba-field-list' }, links.map(({ item, link, label, active, description }) =>
          h('li', { key: link.id + '/' + (link.sourceId ?? ''), 'data-active': active },
            h(ItemArt, { item }),
            h('div', { className: 'moba-field-detail' }, h('strong', null, item.name),
              label && h('small', null, label), description && h('small', null, description)),
            h('button', { className: 'moba-text', type: 'button', 'aria-label': [action, item.name, label].filter(Boolean).join(' '),
              onClick: () => onOpen(link) }, action)))))
    }

    function DiscoverySources({ item, heroNames, onOpenSource, onFit, onCollection, disabled }) {
      const [limit, setLimit] = useState(4)
      return h('details', { className: 'moba-pairings moba-discovery-sources' },
        h('summary', null, t('实战发现来源 · ') + item.discoverySources.length),
        h('ul', { className: 'moba-field-list', 'aria-label': t('已发现的工具来源') },
          item.discoverySources.slice(0, limit).map(source => {
            const { sourceId, sourceName, sessionId, heroId, time, collection, providerId } = source
            const player = heroNames.get(heroId)
            const rank = item.sourceRanks?.[sourceId]
            const status = collection?.saved ? t('已收藏') : providerId ? t('来源已登记')
              : collection ? t('可恢复装备配置') : t('保留实战记录')
            return h('li', { key: sourceId },
              h(ItemArt, { item: { ...item, sourceId, art: source.art } }),
              h('div', { className: 'moba-field-detail' },
                h('strong', null, sourceName),
                h('small', null, [player, new Date(time).toLocaleDateString('zh-CN'), rank && masteryText(rank)].filter(Boolean).join(' · ')),
                h('small', null, status),
                h('div', { className: 'moba-discovery-actions' },
                  h('button', { type: 'button', className: 'moba-text', disabled, onClick: () => onOpenSource(sessionId),
                    'aria-label': t('回看 ') + sourceName + t(' 的发现会话') }, t('回看发现会话')),
                  providerId && onFit && h('button', { type: 'button', className: 'moba-text moba-trial-link', disabled,
                    'aria-label': t('试装 ') + sourceName, onClick: () => onFit({ ...item, sourceId, sourceName }) }, t('试装此来源')),
                  collection && !collection.saved && h('button', { type: 'button', className: 'moba-text', disabled,
                    'aria-label': t('收藏 ') + sourceName, onClick: () => onCollection(collection) }, t('收藏原来源')))))
          })),
        item.discoverySources.length > limit && h('button', { type: 'button', className: 'moba-text',
          onClick: () => setLimit(value => value + 4) }, t('查看更多来源')))
    }

    function EvidenceDetailActions({ request, revision, onPractice, onHistory, disabled }) {
      const practiceButton = useRef(null)
      const historyButton = useRef(null)
      const [available, setAvailable] = useState(false)
      const canCheck = Boolean(onHistory)

      useEffect(() => {
        if (!canCheck) return
        const abort = new AbortController()
        const action = 'comparison-history'
        request(action, { action, scope: evidenceReplayScope, probe: true }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setAvailable(value.available === true) })
          .catch(() => { if (!abort.signal.aborted) setAvailable(false) })
        return () => abort.abort()
      }, [canCheck, request, revision])

      return h('div', { className: 'moba-detail-actions' },
        onPractice && h('button', { type: 'button', className: 'moba-roster-open', ref: practiceButton, disabled,
          'aria-haspopup': 'dialog', onClick: () => onPractice(practiceButton) },
          h(Glyph, { kind: 'flag', size: 16 }), t('试一次证据取舍')),
        available && onHistory && h('button', { type: 'button', className: 'moba-roster-open', ref: historyButton, disabled,
          'aria-haspopup': 'dialog', onClick: () => onHistory(historyButton) },
          h(Glyph, { kind: 'report', size: 16 }), t('查看证据换装记录')))
    }

    function ItemDetail({ item, status, equipped, heroNames, presets, roles, request, onShowHero, onPreviewPairing, onFit, onPrepareTrial, onToggle, onManage, onEnable, onOpenSource, onConfigureSource,
      onAppearance, onActions, onCollection, onConfigureModule, sourceOptions, sourceChoice, onSource, builtIn, onBuiltIn, replacement,
      disabled, appearanceDisabled, toolLinks, providerLinks, moduleLinks, linkedSource, onInspectRelated,
      onPracticeEvidence, onEvidenceHistory, revision }) {
      if (!item) return h('p', { className: 'moba-empty' }, t('没有找到符合条件的装备。'))
      if (status?.state === 'configure') return h('div', { className: 'moba-detail', id: 'moba-item-detail', 'aria-live': 'polite' },
        h('div', { className: 'moba-detail-head' },
          h(ItemArt, { item }),
          h('div', null, h('h3', { tabIndex: -1 }, item.name), h('span', null, cardState(item, status, equipped))),
          h('button', { className: 'moba-equip', type: 'button', disabled: disabled || Boolean(item.compatibility?.length),
            onClick: () => onConfigureModule(item.module) }, h(Glyph, { kind: 'plus', size: 14 }),
            moduleLinks.length ? t('新建配置') : t('配置装备'))),
        h('p', { className: 'moba-condition' }, [item.module, item.version].filter(Boolean).join(' · ')),
        item.roles?.length > 0 && h('p', { className: 'moba-condition' }, t('职能 · ') + item.roles.map(role => roles[role]).filter(Boolean).join(' · ')),
        item.summary && h('p', null, item.summary),
        h(CompatibilityDetails, { issues: item.compatibility }),
        h(EquipmentLinks, { title: t('已有配置'), action: t('查看配置'), links: moduleLinks, onOpen: onInspectRelated }),
        !moduleLinks.length && h('p', { className: 'moba-condition' }, status.reason))
      const profile = status?.state === 'profile'
      const draftConflict = status?.draftConflicts?.length > 0
      const canEnable = profile && item.manageable && !item.enabled && !item.compatibility?.length
      const builtInAction = builtIn && !builtIn.locked
      const removed = status?.state === 'removed'
      const action = canEnable ? () => onEnable(item.id)
        : profile ? () => onManage(item.bundle)
          : builtInAction ? () => onBuiltIn(item.id)
            : equipped || status?.state === 'available' ? () => onToggle(item, false, draftConflict ? status : undefined)
              : status?.sourceSessionId ? () => onOpenSource(status.sourceSessionId) : null
      const actionLabel = canEnable ? t('启用到 Profile') : profile ? t('管理插件')
        : builtInAction ? removed ? t('恢复自带装备') : t('卸下自带装备')
        : replacement ? item.kind === 'tool' ? t('替换来源') : t('替换并装备') : equipped ? t('卸下')
        : status?.sourceSessionId ? t('打开来源会话') : status?.replaceId ? t('换装') : t('装备')
      const sources = item.kind === 'plugin' ? item.sources?.map(id => heroNames.get(id)).filter(Boolean) : null
      const collection = status?.collection ?? item.collection
      const sourceName = item.sourceName ?? status?.sourceName ?? status?.includedSourceName
      const sourceId = item.sourceId || sourceChoice || (status?.includedSourceName && status.includedBy)
      const sourceRank = item.kind === 'tool' && sourceId && sourceId !== 'profile' &&
        (item.sourceRanks?.[sourceId] ?? { level: 1, xp: 0 })
      const trialEquip = status?.state === 'available' && !equipped && !replacement && !status.replaceId
      const canPrepareTrial = onPrepareTrial && !replacement && status?.state !== 'unavailable' && (
        trialEquip || equipped || (status?.state === 'included' && item.kind !== 'featured' && !builtIn?.locked) || (profile && item.enabled))
      return h('div', { className: 'moba-detail', id: 'moba-item-detail', 'aria-live': 'polite' },
        h('div', { className: 'moba-detail-head' },
          h(ItemArt, { item }),
          h('div', null, h('h3', { tabIndex: -1 }, item.name), h('span', null, cardState(item, status, equipped))),
          action && h('button', { className: 'moba-equip', type: 'button', onClick: action, disabled },
            h(Glyph, { kind: replacement ? 'arrow' : equipped || (builtInAction && !removed) ? 'close'
              : profile || status?.sourceSessionId ? 'arrow' : 'plus', size: 14 }), actionLabel)),
        item.roles?.length > 0 && h('p', { className: 'moba-condition' }, t('职能 · ') + item.roles.map(role => roles[role]).filter(Boolean).join(' · ')),
        item.summary && h('p', null, item.summary),
        sourceOptions?.length > 0 ? h('label', { className: 'moba-tool-source' }, t('装备来源'),
          h('select', { value: sourceChoice ?? '', disabled, onChange: event => onSource(item.id, event.target.value) },
            sourceOptions.map(option => h('option', { key: option.id, value: option.id, disabled: option.unavailable }, option.label))))
          : sourceName && h('p', { className: 'moba-condition' }, t('来源 ') + sourceName),
        linkedSource && h('p', { className: 'moba-linked-source' }, h('span', null, t('关联来源 ') + linkedSource.name),
          linkedSource.available ? h('button', { type: 'button', className: 'moba-text', disabled,
            onClick: () => onSource(item.id, linkedSource.id) }, t('选择此来源')) : h('small', null, t('当前阵容不可选择'))),
        sourceRank && h('p', { className: 'moba-condition' }, t('来源熟练度 · ') + masteryText(sourceRank)),
        item.kind === 'tool' && item.rank && h('p', { className: 'moba-condition' }, t('工具熟练度 · ') + masteryText(item.rank)),
        sources?.length > 0 && h('p', { className: 'moba-condition' }, t('来源英雄 ') + sources.join('、')),
        item.discovery && h('p', { className: 'moba-condition' },
          heroNames.get(item.discovery.heroId) ? t('由 ') + heroNames.get(item.discovery.heroId) + t(' 首次发现') : t('在对局中发现'),
          ' · ', new Date(item.discovery.time).toLocaleDateString('zh-CN'),
          item.kind !== 'tool' && item.rank && ' · ' + masteryText(item.rank)),
        status?.reason && h('p', { className: 'moba-condition' }, status.reason),
        h(CompatibilityDetails, { issues: item.compatibility }),
        replacement && h('div', { className: 'moba-replacement' },
          replacement.tools.length > 0 && h('p', null, t('同名工具 ') + replacement.tools.join('、')),
          h('p', null, t('将换下 ') + replacement.names.join('、')),
          replacement.otherTools.length > 0 && h('p', null, t('原装备还提供 ') + replacement.otherTools.join('、'))),
        builtIn?.locked && h('p', { className: 'moba-condition' }, builtIn.locked),
        builtIn?.affected?.length > 0 && !builtIn.locked && h('p', { className: 'moba-condition' },
          (removed ? t('同时恢复 ') : t('同时卸下依赖此装备的 ')) + builtIn.affected.join('、') + '。'),
        status?.dependencies?.length > 0 && h('p', { className: 'moba-condition' },
          t('随装备加载 ') + status.dependencies.join('、')),
        item.trigger && h('p', { className: 'moba-condition' }, item.trigger),
        item.id === 'evidence' && (onPracticeEvidence || onEvidenceHistory) && h(EvidenceDetailActions, {
          request, revision, onPractice: onPracticeEvidence, onHistory: onEvidenceHistory, disabled,
        }),
        item.modules?.length > 1 && h('p', { className: 'moba-condition' }, t('成套装配 ') + item.modules.join(' · ')),
        toolLinks.length ? h(EquipmentLinks, { title: t('提供的工具'), action: t('查看工具'), links: toolLinks, onOpen: onInspectRelated })
          : item.provides?.length > 0 && h('p', { className: 'moba-condition' }, t('提供工具 ') + item.provides.join(' · ')),
        h(EquipmentLinks, { title: t('来源插件'), action: t('查看插件'), links: providerLinks, onOpen: onInspectRelated }),
        h(EquipmentLinks, { title: t('来自独立模块'), action: t('查看模块'), links: moduleLinks, onOpen: onInspectRelated }),
        h(EquipmentActivities, { activities: item.panelActivities, label: t('面板操作') }),
        h(EquipmentActivities, { activities: item.compactionActivities, label: t('上下文管理') }),
        h('div', { className: 'moba-detail-actions' },
          onFit && h('button', { type: 'button', className: 'moba-text moba-trial-link', disabled,
            onClick: () => onFit({ ...item, sourceId: sourceId || status?.includedBy, sourceName }) }, t('给英雄试装')),
          canPrepareTrial && h('button', { type: 'button', className: 'moba-text moba-trial-link',
            onClick: () => onPrepareTrial({ ...item, sourceId: sourceId || status?.includedBy, sourceName }, trialEquip ? status : undefined) },
            trialEquip ? t('装备并筹备试炼') : t('筹备试炼')),
          item.discovery && !item.discoverySources?.some(source => source.sessionId === item.discovery.sessionId)
            && item.discovery.sessionId !== status?.sourceSessionId && h('button', {
            type: 'button', className: 'moba-text', disabled, onClick: () => onOpenSource(item.discovery.sessionId),
          }, t('回看发现会话')),
          collection && h('button', { className: 'moba-text', type: 'button', disabled,
            title: collection.saved ? t('从收藏中移除') : t('保留来源插件及随装依赖'),
            onClick: () => onCollection(collection) }, collection.saved ? t('取消收藏') : t('收藏装备')),
          status?.canConfigureSource && h('button', { className: 'moba-text', type: 'button', disabled,
            onClick: () => onConfigureSource(item, status.deferred) },
          status.state === 'available' ? t('修改装备来源') : t('配置装备来源')),
          h('button', { className: 'moba-text', type: 'button', disabled: appearanceDisabled,
            onClick: () => onAppearance('gear', item) }, t('装备外观')),
          h('button', { className: 'moba-text', type: 'button', disabled: appearanceDisabled,
            onClick: () => onActions('gear', item) }, t('设置装备操作'))),
        h(DecisionList, { moves: [...(item.decisions ?? status?.packageMoves ?? item.packageMoves ?? empty),
          ...(item.taskMove ? [item.taskMove] : [])] }),
        item.discoverySources?.length > 0 && h(DiscoverySources, { key: 'discovery:' + item.id, item, heroNames, onOpenSource, onFit, onCollection, disabled }),
        h(EquipmentPairings, { key: item.id, item, presets, request, onShowHero, onOpenSource, onPreview: onPreviewPairing }))
    }

    function InstallDialog({ title, children, busy, onCancel, className = '', initialFocus, onKeyDown }) {
      const ref = useRef(null)
      const titleId = useId()
      useEffect(() => {
        if (!ref.current.open) ref.current.showModal()
        if (initialFocus) ref.current.querySelector(initialFocus)?.focus()
      }, [initialFocus])
      return h('dialog', { ref, className: 'moba-market-dialog ' + className, 'aria-labelledby': titleId, onKeyDown,
        onCancel: event => { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel() } },
        h('h2', { id: titleId }, title), children)
    }

    function InstallFacts({ facts }) {
      return h('dl', null, facts.filter(([, value]) => value).map(([label, value]) =>
        h(Fragment, { key: label }, h('dt', null, label), h('dd', null, value))))
    }

    const starterRoutes = [
      { id: 'recon', icon: 'search', name: '侦察路线', tools: 'glob', outcome: '带回补给卡的路径，由你决定要不要继续。' },
      { id: 'delivery', icon: 'report', name: '交付路线', tools: 'glob → present', outcome: '把补给卡交到对话里，你可以点开核对内容。' },
    ]

    function LighthouseStarter({ hero, request, launchIds, onCancel, onOpen, onEquip, onCompare, onLesson,
      lessonButton, evidenceButton, onJoinChallenge, challengeButton }) {
      const [route, setRoute] = useState('delivery')
      const [busy, setBusy] = useState(false)
      const [problem, setProblem] = useState(null)
      const starting = useRef(false)
      const group = useId()

      async function start(event) {
        event.preventDefault()
        if (starting.current) return
        starting.current = true
        setBusy(true)
        setProblem(null)
        try {
          const action = 'growth-starter-open'
          const launchId = launchIds.current[route] ??=
            Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
          const result = await request(action, { action, route, launchId })
          if (result.questError) {
            setProblem({ message: t('新对局已创建，委托未能接下。') + result.questError, sessionId: result.sessionId })
            return
          }
          delete launchIds.current[route]
          onOpen(result.sessionId)
        } catch (reason) {
          setProblem({ message: reason.message })
        } finally {
          starting.current = false
          setBusy(false)
        }
      }

      return h(InstallDialog, { title: t('灯塔补给行动'), busy, onCancel, className: 'moba-starter-dialog',
        initialFocus: 'input:checked', onKeyDown: event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (!busy) onCancel()
        } },
        h('div', { className: 'moba-starter-brief' },
          h(HeroArt, { id: 'standard', art: hero?.art, className: 'moba-starter-hero' }),
          h('div', null, h('strong', null, t('标准模式')),
            h('p', null, t('北岸灯塔的补给卡混在几份文件里。选一套装备，决定带回什么。')))),
        h('form', { onSubmit: start },
          h('fieldset', { className: 'moba-starter-routes', disabled: busy },
            h('legend', null, t('选择路线')),
            starterRoutes.map(choice => h('label', { className: 'moba-starter-route', key: choice.id, 'data-picked': choice.id === route },
              h('input', { type: 'radio', name: group, value: choice.id, checked: choice.id === route, onChange: () => {
                setRoute(choice.id)
                setProblem(null)
                onEquip()
              } }),
              h('span', null, h('strong', null, h(Glyph, { kind: choice.icon, size: 16 }), t(choice.name)),
                h('code', null, choice.tools), h('small', null, t(choice.outcome)))))),
          h('p', { className: 'moba-starter-note' }, t('使用独立的示例工作区。进入会话后，打开首回合任务并手动发送。')),
          problem && h('p', { className: 'moba-alert', role: 'alert' }, problem.message),
          h('div', { className: 'moba-market-actions moba-starter-actions' },
            h('button', { type: 'button', className: 'moba-roster-open', disabled: busy, onClick: onCancel }, t('返回大厅')),
            h('button', { type: 'button', className: 'moba-roster-open', disabled: busy, onClick: onCompare }, t('同题对照')),
            h('button', { ref: lessonButton, type: 'button', className: 'moba-roster-open', disabled: busy,
              onClick: () => onLesson(lighthouseRematchLesson) },
              t('灯塔换装练习')),
            h('button', { ref: evidenceButton, type: 'button', className: 'moba-roster-open', disabled: busy,
              onClick: () => onLesson(lighthouseEvidenceLesson) }, t('灯塔证据取舍')),
            h('button', { ref: challengeButton, type: 'button', className: 'moba-roster-open', disabled: busy,
              'aria-haspopup': 'dialog', onClick: onJoinChallenge }, t('加入灯塔挑战')),
            problem?.sessionId && h('button', { type: 'button', className: 'moba-roster-open',
              onClick: () => onOpen(problem.sessionId) }, t('进入已建对局')),
            h('button', { type: 'submit', className: 'moba-start', disabled: busy },
              busy ? t('正在准备对局…') : problem ? t('重试') : t('锁定路线并开局'),
              h(Glyph, { kind: 'arrow', size: 16 })))))
    }

    const lighthouseRematchLesson = 'lighthouse-rematch'
    const lighthouseEvidenceLesson = 'lighthouse-evidence'
    const evidenceScenarios = [
      { id: 'gap', icon: 'search', name: '关键证据缺失', note: '调度消息说给下一班备了两节电池。交接稿里能写这句话吗？' },
      { id: 'confirmed', icon: 'report', name: '证据齐全', note: '关键结论有可核对的依据。看看材料足够时，这局会怎么交付。' },
    ]
    const evidenceOpeningChoices = { gather: '继续补证', qualify: '降级推荐', pause: '暂缓提交' }
    const evidenceArm = { id: 'evidence', icon: 'search', name: '证据核验' }

    function EvidenceOpeningChoice({ value, disabled, onChange }) {
      return h('div', { className: 'moba-rematch-fields' },
        h('label', null, t('开局选择（可跳过）'),
          h('select', { value, disabled, onChange: event => onChange(event.target.value) },
            h('option', { value: '' }, t('暂不选择')),
            Object.entries(evidenceOpeningChoices).map(([id, label]) => h('option', { key: id, value: id }, t(label))))),
        h('p', { className: 'moba-starter-note' }, t('先选你会怎么处理，发送任务后再在会话中作决定。')))
    }

    function LighthouseLessonLaunch({ request, onCancel, onOpen, lesson = lighthouseRematchLesson }) {
      const language = useLanguage()
      const evidence = lesson === lighthouseEvidenceLesson
      const [scenario, setScenario] = useState(evidenceScenarios[0].id)
      const [openingChoice, setOpeningChoice] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const starting = useRef(false)
      const launch = useRef(new Map())
      const group = useId()
      const showOpeningChoice = evidence && scenario === 'gap'
      async function start(event) {
        event.preventDefault()
        if (starting.current) return
        starting.current = true
        setBusy(true)
        setError('')
        try {
          const action = evidence ? 'lighthouse-evidence-open' : 'lighthouse-rematch-open'
          const choice = showOpeningChoice ? openingChoice : ''
          const key = evidence ? JSON.stringify([scenario, choice]) : lesson
          if (!launch.current.has(key)) launch.current.set(key, Array.from(crypto.getRandomValues(new Uint8Array(16)),
            byte => byte.toString(16).padStart(2, '0')).join(''))
          const result = await request(action, { action, launchId: launch.current.get(key), ...(evidence && { scenario }),
            ...(choice && { openingChoice: choice }) }, undefined, language)
          onOpen(result.sessionId, result.task)
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setBusy(false)
        }
      }
      return h(InstallDialog, { title: t(evidence ? '灯塔证据取舍' : '灯塔换装练习'), className: 'moba-starter-dialog', busy, onCancel,
        initialFocus: evidence ? 'input:checked' : '.moba-start',
        onKeyDown: event => closeDialogOnEscape(event, () => { if (!starting.current) onCancel() }) },
        h('form', { onSubmit: start },
          evidence ? h('fieldset', { className: 'moba-starter-routes', disabled: busy },
            h('legend', null, t('选择证据场景')),
            evidenceScenarios.map(option => h('label', { className: 'moba-starter-route', key: option.id, 'data-picked': option.id === scenario },
              h('input', { type: 'radio', name: group, value: option.id, checked: option.id === scenario,
                onChange: () => { setScenario(option.id); setError('') } }),
              h('span', null, h('strong', null, h(Glyph, { kind: option.icon, size: 16 }), t(option.name)),
                h('small', null, t(option.note))))))
            : h('ol', { className: 'moba-lesson-steps' },
              h('li', null, t('先用标准模式直接交付灯塔补给卡。')),
              h('li', null, t('再装上「交付前复核」跑同一任务，看看能否确认交付或退回修改。'))),
          showOpeningChoice && h(EvidenceOpeningChoice, { value: openingChoice, disabled: busy,
            onChange: value => { setOpeningChoice(value); setError('') } }),
          h('p', { className: 'moba-starter-note' }, t('练习自带示例材料，无需保存方案。每一局都由你在会话中手动发送。')),
          error && h('p', { className: 'moba-alert', role: 'alert' }, error),
          h('div', { className: 'moba-market-actions moba-starter-actions' },
            h('button', { type: 'button', className: 'moba-roster-open', onClick: onCancel, disabled: busy }, t('返回')),
            h('button', { type: 'submit', className: 'moba-start', disabled: busy },
              t(busy ? '正在准备对局…' : error ? '重试' : evidence ? '开始证据取舍' : '开始换装练习'), h(Glyph, { kind: 'arrow', size: 16 })))))
    }

    function LighthouseChallengeShare({ comparisonId, request, onBack, heroTrial = false, playedHero }) {
      const language = useLanguage()
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [showInvitation, setShowInvitation] = useState(false)
      const field = useRef(null)
      const invitationField = useRef(null)
      const action = heroTrial ? 'hero-trial-challenge-share' : 'lighthouse-challenge-share'
      const heroHook = {
        standard: '我用标准模式打了一局。同一张补给卡，你会选谁？',
        minimal: '我用极简模式打了一局。同一张补给卡，你会选谁？',
      }[playedHero]
      const guide = 'https://github.com/pearjelly/dsh-heros/blob/main/' +
        (language === 'en' ? 'README.md#install' : 'README.zh.md#%E5%AE%89%E8%A3%85')
      const invitation = result?.code && [
        ...(heroHook ? [t(heroHook)] : []),
        t(heroTrial ? '来玩一局深度荣耀的灯塔英雄挑战。打开大厅，点「加入灯塔挑战」，粘贴这整段并核对，选你的首发英雄。'
          : '补给卡没有记录两节备用电池。你会补证、降级推荐，还是暂缓提交？打开深度荣耀大厅，点「加入灯塔挑战」，粘贴这整段邀请。'),
        t('深度荣耀安装指南') + '\n' + guide,
        result.code,
      ].join('\n\n')
      useEffect(() => {
        const abort = new AbortController()
        setResult(null)
        setError('')
        setNotice('')
        setShowInvitation(false)
        request(action, { action, comparisonId }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setResult(value) })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [action, comparisonId, request, language])

      useEffect(() => {
        if (showInvitation) {
          invitationField.current?.focus()
          invitationField.current?.select()
        }
      }, [showInvitation])

      async function copy(includeInvitation = false) {
        const value = includeInvitation ? invitation : result?.code
        if (!value) return
        try {
          await navigator.clipboard.writeText(value)
          setNotice(t(includeInvitation ? '挑战邀请已复制。' : '挑战码已复制。'))
        } catch {
          if (includeInvitation) setShowInvitation(true)
          const target = includeInvitation ? invitationField : field
          target.current?.focus()
          target.current?.select()
          setNotice(t(includeInvitation ? '挑战邀请已选中，可以手动复制。' : '挑战码已选中，可以手动复制。'))
        }
      }

      return h(InstallDialog, { title: t(heroTrial ? '分享英雄试玩' : '分享灯塔挑战'),
        className: heroTrial ? 'moba-lighthouse-comparison moba-starter-dialog' : 'moba-starter-dialog',
        onCancel: onBack, initialFocus: '.moba-challenge-back', onKeyDown: event => closeDialogOnEscape(event, onBack) },
        h('div', { className: 'moba-plan-fields moba-share-fields' },
          h('p', { className: 'moba-starter-note' }, t(heroTrial ? '挑战码包含公开样例、任务语言和接班需求。接收者自己选首发英雄。'
            : '挑战码指定公开缺证样例和出装要求。接收者会在新会话里自己选择。')),
          error ? h('p', { className: 'moba-alert', role: 'alert' }, error)
            : result?.code ? h('label', null, t('挑战码'),
              h('textarea', { className: 'moba-share-code', ref: field, readOnly: true, value: result.code, rows: 3,
                spellCheck: false, onFocus: event => event.currentTarget.select() }))
              : h('p', { className: 'moba-empty', role: 'status' }, t('正在核对挑战要求…')),
          showInvitation && invitation && h('label', null, t('挑战邀请'),
            h('textarea', { className: 'moba-share-code', ref: invitationField, readOnly: true, value: invitation, rows: 5,
              spellCheck: false, onFocus: event => event.currentTarget.select() })),
          notice && h('p', { className: 'moba-empty', role: 'status' }, notice)),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-roster-open moba-challenge-back', onClick: onBack }, t('返回')),
          result?.code && h('button', { type: 'button', className: invitation ? 'moba-roster-open' : 'moba-start', onClick: () => copy() }, t('复制挑战码')),
          invitation && h('button', { type: 'button', className: 'moba-start', onClick: () => copy(true) }, t('复制挑战邀请'))))
    }

    function pastedLighthouseChallenge(text) {
      if (text.length > lighthouseInvitationLimit) return { problem: '这段消息太长，请只粘贴挑战邀请或挑战码。' }
      let code
      for (const [candidate] of text.matchAll(/(?<![A-Za-z0-9_.-])DSHC[12]\.[A-Za-z0-9_-]+/g)) {
        if (code && code !== candidate) return { problem: '找到多个不同的挑战码，请只保留想玩的那一个。' }
        code = candidate
      }
      return code ? { code } : { problem: '没有找到灯塔挑战码。请粘贴邀请或挑战码。' }
    }

    function LighthouseChallengeJoin({ request, onCancel, onOpen, firstHeroes }) {
      const language = useLanguage()
      const [input, setInput] = useState('')
      const [checked, setChecked] = useState(null)
      const [openingChoice, setOpeningChoice] = useState('')
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const pending = useRef(null)
      const launchIds = useRef(new Map())
      const heading = useRef(null)
      const field = useRef(null)
      const { code, problem } = useMemo(() => pastedLighthouseChallenge(input), [input])
      const preview = code && checked?.code === code && checked.language === language ? checked.value : undefined
      const heroTrial = preview?.kind === 'hero-trial'
      const canOpen = !preview?.blocked && preview?.token
      const canReviewLocal = !heroTrial && preview?.blocked && preview.canUseLocalLoadout === true
      const localLoadout = !heroTrial && preview?.localLoadout === true
      const need = heroTrial && heroTrialNeeds.find(item => item.id === preview.need)
      const sampleLanguage = heroTrial && ({ en: '英文', zh: '中文' })[preview.sampleLanguage]
      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => { if (preview) heading.current?.focus() }, [preview])

      async function check(useLocal = false) {
        if (pending.current || (useLocal && !canReviewLocal)) return
        if (!code) {
          setError(t(problem))
          field.current?.focus()
          return
        }
        const abort = new AbortController()
        pending.current = abort
        setBusy('check')
        setError('')
        if (!useLocal) setChecked(null)
        try {
          const action = 'lighthouse-challenge-preview'
          const value = await request(action, { action, code, ...(useLocal && { useLocal: true }) }, abort.signal, language)
          if (!abort.signal.aborted) setChecked({ value, code, language })
        } catch (reason) {
          if (!abort.signal.aborted) setError(reason.message)
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setBusy('')
        }
      }

      async function start(arm) {
        if (!canOpen || pending.current || (heroTrial && !heroTrialHeroes.some(hero => hero.id === arm))) return
        const abort = new AbortController()
        pending.current = abort
        setBusy('start')
        setError('')
        try {
          const action = 'lighthouse-challenge-open'
          const key = JSON.stringify(heroTrial ? [code, preview.token, arm] : [code, preview.token, localLoadout, openingChoice, language])
          if (!launchIds.current.has(key)) launchIds.current.set(key, Array.from(crypto.getRandomValues(new Uint8Array(16)),
            byte => byte.toString(16).padStart(2, '0')).join(''))
          const result = await request(action, { action, code, token: preview.token, launchId: launchIds.current.get(key),
            ...(heroTrial ? { arm } : { ...(localLoadout && { useLocal: true }), ...(openingChoice && { openingChoice }) }) }, abort.signal, language)
          if (!abort.signal.aborted) onOpen(result.sessionId, result.task)
        } catch (reason) {
          if (!abort.signal.aborted) {
            setError(reason.message)
            setChecked(null)
            field.current?.focus()
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setBusy('')
        }
      }

      return h(InstallDialog, { title: t('加入灯塔挑战'), className: 'moba-starter-dialog',
        busy: Boolean(busy), onCancel, initialFocus: '.moba-share-code',
        onKeyDown: event => closeDialogOnEscape(event, () => { if (!pending.current) onCancel() }) },
        h('form', { onSubmit: event => { event.preventDefault(); void check() } },
          h('div', { className: 'moba-plan-fields moba-share-fields' },
            h('label', null, t('挑战邀请或挑战码'),
              h('textarea', { className: 'moba-share-code', ref: field, required: true, value: input, rows: 3, maxLength: lighthouseInvitationLimit + 1,
                readOnly: Boolean(busy), spellCheck: false, autoComplete: 'off', autoCapitalize: 'off',
                onChange: event => { setInput(event.target.value); setChecked(null); setError(''); setOpeningChoice('') } })),
            error && h('p', { className: 'moba-alert', role: 'alert' }, error),
            busy === 'check' && h('p', { className: 'moba-empty', role: 'status' }, t('正在核对挑战要求…')),
            preview && h('div', { className: 'moba-share-review' },
              h('h3', { ref: heading, tabIndex: -1 }, t(heroTrial ? heroTrialTitle : localLoadout ? '本机标准出装' : '关键证据缺失')),
              localLoadout && h(InstallFacts, { facts: [[t('原挑战的 DSH 版本'), preview.originalHost],
                [t('本机 DSH 版本'), preview.host?.current ?? preview.host?.version]] }),
              heroTrial ? h(Fragment, null,
                h(InstallFacts, { facts: [[t('挑战样例'), preview.sample && t('北岸灯塔补给卡')],
                  [t('接班需求'), need && t(need.name)], [t('任务语言'), sampleLanguage && t(sampleLanguage)]] }),
                preview.task && h('label', { className: 'moba-lighthouse-task' }, t('两边共用的任务'),
                  h('textarea', { readOnly: true, rows: 4, value: preview.task })))
                : h(Fragment, null, h(PlanShareRequirements, { value: preview, showHost: !localLoadout }),
                  h(SharedPlanCapabilities, { comparison: preview.comparison })),
              preview.blocked && h('p', { className: 'moba-alert', role: 'status' },
                t(preview.reason ?? '请处理上方的装备或版本要求，再重新核对。')),
              canOpen && !heroTrial && h(Fragment, null,
                h('p', { className: 'moba-lighthouse-note' }, t(evidenceScenarios[0].note)),
                h(EvidenceOpeningChoice, { value: openingChoice, disabled: Boolean(busy), onChange: setOpeningChoice }))),
            canOpen && (heroTrial ? h(Fragment, null,
              h(HeroTrialFirstHero, { heroes: firstHeroes, need: need?.id, disabled: Boolean(busy), onChoose: start }),
              h('p', { className: 'moba-starter-note', role: busy === 'start' ? 'status' : undefined },
                t(busy === 'start' ? '正在打开试玩会话…' : '打开会话后，请手动发送任务。')))
              : h('p', { className: 'moba-starter-note' }, t('手动发送练习任务。如果出现证据取舍卡，请在会话里选择。')))),
          h('div', { className: 'moba-market-actions moba-starter-actions' },
            h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(busy), onClick: onCancel }, t('返回')),
            h('button', { type: 'submit', className: canOpen || canReviewLocal ? 'moba-roster-open' : 'moba-start',
              disabled: Boolean(busy) || !input.trim() }, t('核对挑战码')),
            canReviewLocal && h('button', { type: 'button', className: 'moba-start', disabled: Boolean(busy),
              onClick: () => void check(true) }, t('核对本机标准出装')),
            canOpen && !heroTrial && h('button', { type: 'button', className: 'moba-start', disabled: Boolean(busy), onClick: () => start() },
              t(busy === 'start' ? '正在准备对局…' : '开始灯塔挑战'), h(Glyph, { kind: 'arrow', size: 16 })))))
    }

    const fieldPlaybooks = [
      { id: 'direct', icon: 'report', name: '直接交付', gear: '交付物预览', note: '把生成的文件放进对话，打开即可查看。' },
      { id: 'review', icon: 'lock', name: '复核后交付', gear: '交付物预览 + 交付前复核', note: '有明确的交接事项时，提示助手先用 DSH 确认卡请你确认交付或退回修改。' },
    ]
    const comparisonKinds = {
      lighthouse: {
        action: 'lighthouse-comparison', title: '灯塔同题对照', entry: '同题对照',
        arms: starterRoutes.map(route => ({ ...route, name: route.id === 'recon' ? '侦察阵容' : '交付阵容',
          open: route.id === 'recon' ? '打开侦察会话' : '打开交付会话' })),
      },
      workspace: {
        action: 'workspace-comparison', title: '实战同题对照', entry: '实战同题对照',
        arms: fieldPlaybooks.map(playbook => playbook.id === 'direct'
          ? { ...playbook, note: '把交付文件放进对话，打开即可查看。', open: '打开直接交付会话' }
          : { ...playbook, open: '打开复核会话' }),
      },
      plans: {
        action: 'plan-comparison', title: '方案同题对照', entry: '方案同题对照',
        arms: [
          { id: 'left', icon: 'report', name: '方案 A', open: '打开方案 A 会话' },
          { id: 'right', icon: 'report', name: '方案 B', open: '打开方案 B 会话' },
        ],
      },
      rematch: {
        action: 'rematch-comparison', title: '单件换装对照', entry: '单件换装对照',
        arms: [
          { id: 'baseline', icon: 'report', name: '原局' },
          { id: 'rematch', icon: 'swap', name: '换装局' },
        ],
      },
    }
    function comparisonTitle(kind, lesson, evidenceReplay, publicEvidenceReplay) {
      if (kind === 'rematch' && publicEvidenceReplay) return '灯塔证据换装对照'
      if (kind === 'rematch' && evidenceReplay) return '证据换装对照'
      if (lesson === lighthouseEvidenceLesson) return '灯塔证据取舍'
      if (lesson !== lighthouseRematchLesson) return comparisonKinds[kind].title
      return kind === 'rematch' ? '灯塔练习 · 换装对照' : '灯塔换装练习'
    }
    function comparisonArmConfig(kind, arm, evidenceReplay) {
      if (kind === 'workspace' && arm === evidenceArm.id) return evidenceArm
      const config = comparisonKinds[kind]?.arms.find(item => item.id === arm)
      if (kind === 'rematch' && evidenceReplay && config) {
        return { ...config, name: arm === 'baseline' ? '原局 · 装有证据核验' : '换装局 · 已卸下证据核验' }
      }
      return config
    }
    const comparisonArmStates = { unopened: '待开局', ready: '已核对', waiting: '等待发送任务', running: '任务进行中',
      'waiting-choice': '等待你的选择', complete: '已完成', unavailable: '暂不可对照' }
    const comparisonArmReasons = {
      'changed-task': '任务文字已改动。用同一段文字重新试一组。',
      'changed-loadout': '实际出装已变更。请用对照指定的阵容重新尝试。',
      'changed-material': '发送任务时，材料与这组对照记录的版本不同。',
      'unverified-material': '这次尝试无法核对材料版本。',
      interrupted: '这次尝试已中断。',
      'session-unavailable': '暂时无法读取这次尝试的会话。',
    }
    const comparisonDraftNotices = {
      applied: '同题任务已填入输入栏。请在会话中手动发送。',
      preserved: '已保留输入栏原有草稿。可复制同题任务后手动粘贴。',
      blocked: '可复制同题任务，粘贴到会话输入栏。',
    }
    const evidenceDraftNotices = {
      applied: '练习任务已填入输入栏。请在会话中手动发送。',
      preserved: '已保留输入栏原有草稿。可复制练习任务后手动粘贴。',
      blocked: '可复制练习任务，粘贴到会话输入栏。',
    }
    const runHistoryLabel = () => t('实战记录', '实战记录（同题对照）')
    const backToRunHistoryLabel = () => t('返回实战记录', '返回实战记录（同题对照）')
    const evidenceReplayScope = 'evidence-replays'

    function closeDialogOnEscape(event, close) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }

    function ObservedComparisonCalls({ entries }) {
      const tools = entries?.filter(entry => entry.type === 'tool') ?? empty
      if (!tools.length) return null
      return h('ul', { className: 'moba-lighthouse-results', 'aria-label': t('实测工具调用') },
        tools.map((entry, index) => h('li', { key: index },
          h('div', null, h('strong', null, entry.name),
            entry.sourceNames?.length > 0 && h('small', null, t('调用来源 ') + entry.sourceNames.join(' / ')),
            entry.choices?.length > 0 && h('small', null, t('你实际选择了 ') + entry.choices.join(' / '))),
          h('span', { 'data-state': entry.state }, t(reportToolStates[entry.state] ?? entry.state)))))
    }

    function comparisonArmName(config, arm) {
      const label = t(config?.name ?? arm.arm ?? arm.id)
      return arm.planName ? label + ' · ' + arm.planName : label
    }

    function canRematchComparisonArm(kind, arm) {
      return arm.id !== evidenceArm.id && arm.canRematch &&
        (kind === 'workspace' || kind === 'plans' || kind === 'rematch' && arm.id === 'rematch')
    }

    const lessonTaskLabel = '用这套出装做自己的任务'
    const rebaselineTaskLabel = '以当前材料重跑原局'
    const lighthouseEvidenceReplayLabel = '卸下证据核验再试一局'

    function ComparisonArm({ arm, config, task, sessionId, busy, onStart, onVisit, putTask, onNotice, canStart, onReuse, onRematch, onLessonTask, outfit,
      evidenceReplay, testedSource, onLighthouseEvidenceReplay, result, fillOnVisit = true, lessonTaskAction = lessonTaskLabel }) {
      const files = arm.deliverables ?? empty
      const pendingQuestions = arm.pendingQuestions ?? empty
      return h('section', { className: 'moba-lighthouse-arm', 'data-state': arm.status, 'data-comparison-arm': arm.id, tabIndex: -1,
        'aria-label': comparisonArmName(config, arm) },
        h('header', null, h(Glyph, { kind: config.icon, size: 20 }),
          h('div', null, h('h3', null, comparisonArmName(config, arm)),
            arm.heroName ? h('small', { className: 'moba-lighthouse-arm-hero' }, arm.heroName)
              : (config.tools || config.gear) && h('code', null, config.tools ?? t(config.gear))),
          h('strong', { className: 'moba-lighthouse-arm-state', role: 'status' }, t(comparisonArmStates[arm.status] ?? arm.status))),
        testedSource && h('p', { className: 'moba-lighthouse-note' }, h('strong', null, t('此方案保存自这局'))),
        outfit ? h(PlanEquipment, { items: outfit, removed: arm.removed ?? empty })
          : arm.removed?.length > 0 && h(RemovedEquipment, { labels: arm.removed }),
        config.note && h('p', { className: 'moba-lighthouse-note' }, t(config.note)),
        arm.reason && h('p', { className: 'moba-lighthouse-note' }, t(comparisonArmReasons[arm.reason] ?? arm.reason)),
        arm.continuationReason && h('p', { className: 'moba-lighthouse-note' }, t('续答后的材料或阵容无法核对。请到原会话查看后续结果。')),
        arm.models?.length > 0 && h('p', { className: 'moba-lighthouse-note' }, t('实际使用的模型') + ' · ' + arm.models.join(' / ')),
        pendingQuestions.length > 0 && h('div', { className: 'moba-comparison-pending', role: 'status' },
          h('strong', null, t(arm.id === 'review' ? '等待你的复核选择' : '等待你的选择')),
          pendingQuestions.map((question, index) => h('div', { key: index }, h('p', null, question.question),
            question.options?.length > 0 && h('p', null, question.options.join(' / ')))),
          h('p', null, t('请在原会话的 DSH 确认卡上选择。'))),
        onLighthouseEvidenceReplay && h('div', { className: 'moba-comparison-previous' },
          h('button', { type: 'button', className: 'moba-roster-open', disabled: busy, 'aria-haspopup': 'dialog',
            'data-rematch-arm': arm.id, onClick: onLighthouseEvidenceReplay }, t(lighthouseEvidenceReplayLabel))),
        h(ObservedComparisonCalls, { entries: arm.entries }),
        result,
        evidenceReplay && arm.status === 'complete' && !arm.entries?.some(entry => entry.type === 'tool' && entry.choices?.length) &&
          h('p', { className: 'moba-lighthouse-note' }, t('本局没有记录提问卡选择。')),
        (arm.status === 'complete' || files.length > 0) && h('div', { className: 'moba-lighthouse-artifacts' },
          h('h4', null, t('交付文件') + ' · ' + files.length),
          files.length > 0 && h('ul', null, files.map((file, index) => h('li', { key: index }, file.name)))),
        h('footer', null,
          arm.lessonTaskSource && onLessonTask && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
            'aria-haspopup': 'dialog', 'data-lesson-task-arm': arm.id,
            onClick: event => onLessonTask(arm, event.currentTarget) }, t(lessonTaskAction)),
          arm.canRematch && onRematch && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
            'data-rematch-arm': arm.id, onClick: () => onRematch(arm) }, t('换一件再试')),
          arm.canReuse && onReuse && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
            'data-reuse-arm': arm.id, onClick: () => onReuse(arm.id) }, t('核对并复用出装')),
          arm.sessionId ? h(Fragment, null,
            task && typeof putTask === 'function' && arm.sessionId === sessionId && arm.status === 'waiting' && h('button', {
              type: 'button', className: 'moba-roster-open', disabled: busy, onClick: () => onNotice(putTask(task)),
            }, t('填入任务')),
            h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
              onClick: () => onVisit(arm.sessionId, fillOnVisit && arm.status === 'waiting' ? task : undefined) },
            t(config.visit ?? '查看原会话')))
            : arm.status === 'unopened' && onStart && h('button', { type: 'button', className: 'moba-start', disabled: busy || !canStart,
              onClick: () => onStart(arm.id) }, t(config.open),
              h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    const heroTrialTitle = '英雄同题试玩'
    const heroTrialView = '查看试玩对照'
    const stockTrialTaskLabels = { standard: '用标准模式做自己的任务', minimal: '用极简模式做自己的任务' }
    const minimalDeliveryReplayLabel = '给极简模式装上交付物预览'
    const heroTrialNeeds = [
      { id: 'original', icon: 'report', name: '可打开的原件', note: '接班人要在会话里打开原件核对。',
        heroHints: { standard: '可附上原件', minimal: '先交文字。可在复赛加装交付物预览。' } },
      { id: 'summary', icon: 'report', name: '可核对的文字摘要', note: '接班人只要拿到补给卡的要点。',
        heroHints: { standard: '可写摘要，也可附上原件', minimal: '可从终端读取并写摘要' } },
    ]
    const heroTrialHeroes = [
      { id: 'standard', icon: 'report', name: '标准模式', open: '打开标准模式会话', visit: '查看标准模式原会话',
        note: '自带原生读取和文件交付工具。', choiceNote: '原生工具读取和附文件' },
      { id: 'minimal', icon: 'action', name: '极简模式', open: '打开极简模式会话', visit: '查看极简模式原会话',
        note: '可用终端读取材料并用文字回应。', choiceNote: '终端读取和文字交接' },
    ]
    const minimalDeliveryReplayArm = {
      id: 'minimal-present', icon: 'report', name: '极简模式 + 交付物预览', visit: '查看加装后的会话',
      note: '同一位英雄，只加一件交付物预览。',
    }

    function HeroTrialFirstHero({ heroes = heroTrialHeroes, need, disabled, onChoose }) {
      const heroHints = heroTrialNeeds.find(item => item.id === need)?.heroHints
      return h('fieldset', { className: 'moba-hero-trial-picks', disabled },
        h('legend', null, t('选一位英雄先开局')),
        heroes.map(hero => {
          const hint = t(heroHints?.[hero.id] ?? hero.choiceNote)
          return h('button', { key: hero.id, type: 'button', className: 'moba-hero-trial-pick',
            'aria-label': t(hero.open), 'aria-description': hint, onClick: () => onChoose(hero.id) },
            h(HeroArt, { id: hero.id, art: hero.art, className: 'moba-starter-hero' }),
            h('span', null, h('strong', null, t(hero.name)), h('small', null, hint)))
        }))
    }

    function HeroTrialResult({ arm }) {
      const materialNote = { changed: '这局的试玩材料已修改。', unavailable: '暂时无法读取这局的试玩材料。' }[arm.materialState]
      if (!arm.summary && arm.status !== 'complete') return materialNote ? h('p', { role: 'status', className: 'moba-alert' }, t(materialNote)) : null
      return h('div', { className: 'moba-lighthouse-artifacts' },
        h('h4', null, t('本局交接记录')),
        materialNote && h('p', { role: 'status', className: 'moba-alert' }, t(materialNote)),
        h('ul', null,
          typeof arm.meetsNeed === 'boolean' && h('li', null, h('strong', null, t(arm.meetsNeed
            ? '这局的交付记录符合接班需求' : '这局未记录到符合接班需求的交付'))),
          typeof arm.materialRead === 'boolean' && h('li', null, t(arm.materialRead
            ? '记录到读取补给卡' : '未核对到补给卡读取记录')),
          !materialNote && typeof arm.originalAttached === 'boolean' && h('li', null, t(arm.originalAttached
            ? '补给卡原件已附到会话' : '这局未核对到补给卡原件附件'))),
        arm.summary && h('details', { open: true }, h('summary', null, t('助手实际回复')),
          h('p', { className: 'moba-lighthouse-note', style: { whiteSpace: 'pre-wrap' } }, arm.summary)))
    }

    function HeroDeliveryReplayResult({ outcome: { sessionId, originalFile }, onVisit }) {
      const heading = useId()
      const { hostAvailable, opening, failed, openFile } = usePresentedFileOpener(
        Boolean(originalFile && presentedFileHasCoordinates(originalFile)))
      return h('section', { className: 'moba-handoff-outcome moba-hero-replay-result', 'aria-labelledby': heading },
        h('h3', { id: heading, tabIndex: -1, 'data-hero-delivery-recap': true }, t('极简模式换装战报')),
        h('p', { className: 'moba-lighthouse-note' }, t('同一段任务。第二局给极简模式加了交付物预览。')),
        h('dl', { className: 'moba-handoff-report-facts' },
          h('dt', null, t('加装前')), h('dd', null, t('已交文字摘要，缺少补给卡原件')),
          h('dt', null, t('加装后')), h('dd', null, t('已附原件，符合接班需求'))),
        h('div', { className: 'moba-detail-actions' },
          hostAvailable && h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(opening),
            onClick: () => openFile(sessionId, originalFile, 'original') },
          t(opening ? '正在打开文件…' : '打开补给卡原件')),
          (!hostAvailable || failed) && h('button', { type: 'button', className: 'moba-roster-open',
            onClick: () => onVisit(sessionId) }, t('去会话看补给卡原件'))),
        failed && h('p', { className: 'moba-match-action-error', role: 'alert' }, t('暂时无法打开这份交付文件。可在原会话查看。')))
    }

    function canReportHeroHandoff(arm) {
      return arm.status === 'complete' && arm.materialState === 'verified' &&
        arm.materialRead === true && Boolean(arm.summary) && typeof arm.originalAttached === 'boolean'
    }

    const lighthouseHandoffReportCodeLimit = 192

    function LighthouseHandoffReport({ report, comparisonId, request, onBack, onOpenRepeat }) {
      const language = useLanguage()
      const [input, setInput] = useState('')
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [replyCodeVisible, setReplyCodeVisible] = useState(false)
      const [busy, setBusy] = useState(false)
      const [openingRepeat, setOpeningRepeat] = useState(false)
      const pending = useRef(null)
      const repeatLaunchId = useRef(null)
      const field = useRef(null)
      const replyField = useRef(null)
      const heading = useRef(null)
      const share = report.mode === 'share'
      const evidence = report.evidence === true
      const shareAction = evidence ? 'lighthouse-evidence-report' : 'hero-trial-handoff-report'
      const compareAction = evidence ? 'lighthouse-evidence-report-compare' : 'hero-trial-handoff-compare'
      const codePattern = evidence ? /^DSHR2\.[A-Za-z0-9_-]+$/ : /^DSHR1\.[A-Za-z0-9_-]+$/
      const invalidCode = evidence ? '灯塔取舍战报码无效或版本不受支持。' : '英雄战报码无效或版本不受支持。'

      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => {
        if (!share) return
        const abort = new AbortController()
        setResult(null)
        setError('')
        request(shareAction, { action: shareAction, comparisonId, arm: report.arm }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setResult(value) })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [share, shareAction, request, comparisonId, report.arm, language])
      useEffect(() => { if (!share && result) heading.current?.focus() }, [share, result])
      useEffect(() => {
        if (replyCodeVisible) {
          replyField.current?.focus()
          replyField.current?.select()
        }
      }, [replyCodeVisible])

      async function check(event) {
        event.preventDefault()
        const code = input.trim()
        if (pending.current || !code) return
        setResult(null)
        setNotice('')
        setReplyCodeVisible(false)
        if (input.length > lighthouseHandoffReportCodeLimit || !codePattern.test(code)) {
          setError(t(invalidCode))
          field.current?.focus()
          return
        }
        const abort = new AbortController()
        pending.current = abort
        setBusy(true)
        setError('')
        try {
          const value = await request(compareAction, { action: compareAction, comparisonId, arm: report.arm, code },
            abort.signal, language)
          if (!abort.signal.aborted) setResult(value)
        } catch (reason) {
          if (!abort.signal.aborted) setError(reason.message)
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setBusy(false)
        }
      }

      async function copy() {
        if (!result?.code) return
        try {
          await navigator.clipboard.writeText(result.code)
          setNotice(t('战报码已复制。'))
        } catch {
          if (share || replyCodeVisible) {
            const target = share ? field.current : replyField.current
            target?.focus()
            target?.select()
          } else {
            setReplyCodeVisible(true)
          }
          setNotice(t('战报码已选中，可以手动复制。'))
        }
      }

      async function openRepeat() {
        if (pending.current || !result?.friend || !onOpenRepeat) return
        if (repeatLaunchId.current === null) {
          const bytes = crypto.getRandomValues(new Uint8Array(16))
          repeatLaunchId.current = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
        }
        const abort = pending.current = new AbortController()
        setOpeningRepeat(true)
        setError('')
        let opened
        try {
          const action = 'lighthouse-evidence-repeat'
          opened = await request(action, { action, comparisonId, code: input.trim(), launchId: repeatLaunchId.current },
            abort.signal, language)
        } catch (reason) {
          if (!abort.signal.aborted) setError(reason.message)
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setOpeningRepeat(false)
        }
        if (!abort.signal.aborted && opened) onOpenRepeat(opened.sessionId, opened.task)
      }

      function changeInput(event) {
        setInput(event.target.value)
        setResult(null)
        setError('')
        setNotice('')
        setReplyCodeVisible(false)
      }

      function renderSide(side, title) {
        if (evidence) return h('article', { className: 'moba-lighthouse-arm moba-handoff-report-side' },
          h('header', null, h(ItemArt, { item: { id: 'evidence' } }), h('h4', null, t(title))),
          h('dl', { className: 'moba-handoff-report-facts' },
            h('dt', null, t('提问卡选择')), h('dd', null, t(evidenceOpeningChoices[side.choice])),
            h('dt', null, t('交付文件')), h('dd', null, t(side.delivered ? '有交付记录' : '没有交付记录'))))
        const hero = side.arm === minimalDeliveryReplayArm.id ? minimalDeliveryReplayArm : heroTrialHeroes.find(item => item.id === side.arm)
        return h('article', { className: 'moba-lighthouse-arm moba-handoff-report-side', 'data-met': side.meetsNeed },
          h('header', null, h(HeroArt, { id: side.arm === minimalDeliveryReplayArm.id ? 'minimal' : side.arm, art: hero.art,
            className: 'moba-starter-hero' }), h('h4', null, t(title), h('span', null, t(hero.name)))),
          h('dl', { className: 'moba-handoff-report-facts' },
            h('dt', null, t('补给卡原件')), h('dd', null, t(side.originalAttached ? '已附上' : '未附上')),
            h('dt', null, t('接班需求')), h('dd', null, t(side.meetsNeed ? '符合' : '未满足'))))
      }

      const title = evidence ? (share ? '分享本局取舍' : '对照好友取舍') : (share ? '分享这局战报' : '对照好友战报')
      const comparison = result?.friend
      const need = !evidence && result && heroTrialNeeds.find(item => item.id === result.need)
      const note = evidence ? (share ? '取舍码包含公开样例版本、实际选择和是否交付。'
        : '粘贴好友的灯塔取舍码，对照同一份缺证样例里各自的选择和交付。') : (share
        ? '战报码只包含公开题目版本、接班需求、出装和是否附上原件。'
        : '粘贴同一题、同一接班需求的战报码，看看两套出装交接得怎么样。')
      function back() {
        if (!openingRepeat) onBack()
      }

      return h(InstallDialog, { title: t(title), className: 'moba-lighthouse-comparison moba-starter-dialog',
        onCancel: back, busy: openingRepeat, initialFocus: share ? '.moba-challenge-back' : '.moba-share-code',
        onKeyDown: event => closeDialogOnEscape(event, back) },
        h('form', { onSubmit: check },
          h('div', { className: 'moba-plan-fields moba-share-fields' },
            h('p', { className: 'moba-starter-note' }, t(note)),
            share && result?.code && h('label', null, t('战报码'),
              h('textarea', { ref: field, readOnly: true, className: 'moba-share-code', value: result.code, rows: 3,
                spellCheck: false, onFocus: event => event.currentTarget.select() })),
            !share && h('label', null, t('好友战报码'),
              h('textarea', { className: 'moba-share-code', ref: field, value: input, rows: 3, maxLength: lighthouseHandoffReportCodeLimit + 1,
                readOnly: busy || openingRepeat, spellCheck: false,
                autoComplete: 'off', autoCapitalize: 'off', onChange: changeInput })),
            (busy || share && !result && !error) && h('p', { role: 'status' }, t('正在核对战报…')),
            error && h('p', { className: 'moba-alert', role: 'alert' }, error),
            result && h('section', { className: 'moba-handoff-outcome' },
              h('h3', { ref: heading, tabIndex: -1 }, evidence ? t('缺证时，你们怎么选？') :
                h(Fragment, null, t('接班人需要什么？'), ' ', t(need.name))),
              evidence && comparison && result.code && h('div', { className: 'moba-detail-actions' },
                h('button', { type: 'button', className: 'moba-roster-open', disabled: openingRepeat, onClick: copy }, t('复制我的取舍码')),
                onOpenRepeat && h('button', { type: 'button', className: 'moba-roster-open', disabled: openingRepeat, onClick: openRepeat },
                  t(openingRepeat ? '正在打开同题会话…' : '用同一出装再试一局'))),
              replyCodeVisible && result.code && h('label', null, t('我的取舍码'),
                h('textarea', { ref: replyField, readOnly: true, className: 'moba-share-code', value: result.code, rows: 3,
                  spellCheck: false, onFocus: event => event.currentTarget.select() })),
              h('div', { className: 'moba-lighthouse-arms moba-handoff-report-grid' },
                renderSide(result.local, evidence ? '本机核对的取舍' : '本机核对的交接'),
                comparison && renderSide(comparison, evidence ? '好友分享的取舍' : '好友分享的交接')),
              comparison && h('p', { className: 'moba-lighthouse-note' }, t('可以打开自己的原会话核对细节。好友的交接来自对方提供的战报码。'))),
            notice && h('p', { role: 'status', className: 'moba-empty' }, notice)),
          h('div', { className: 'moba-market-actions moba-starter-actions' },
            h('button', { type: 'button', className: 'moba-roster-open moba-challenge-back', disabled: openingRepeat, onClick: back }, t('返回')),
            share ? result?.code && h('button', { type: 'button', className: 'moba-start', onClick: copy }, t('复制战报码'))
              : h('button', { type: 'submit', className: 'moba-start', disabled: busy || openingRepeat || !input.trim() }, t('对照这两局')))))
    }

    function MinimalDeliveryReplay({ request, comparisonId, onBack, onVisit, backLabel = '返回试玩对照' }) {
      const language = useLanguage()
      const [checked, setChecked] = useState(null)
      const [attempt, retry] = useState(0)
      const [activeDelta, setActiveDelta] = useState('')
      const [opening, setOpening] = useState(false)
      const [openError, setOpenError] = useState('')
      const pending = useRef(false)
      const state = checked?.attempt === attempt && checked?.language === language ? checked : null
      const preview = state?.value

      useEffect(() => {
        const abort = new AbortController()
        const action = 'hero-trial-replay-preview'
        request(action, { action, comparisonId }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setChecked({ attempt, language, value }) })
          .catch(reason => { if (!abort.signal.aborted) setChecked({ attempt, language, error: reason.message }) })
        return () => abort.abort()
      }, [request, comparisonId, attempt, language])

      async function open() {
        if (pending.current || !preview?.token || openError) return
        pending.current = true
        setOpening(true)
        try {
          const action = 'hero-trial-replay-open'
          const opened = await request(action, { action, comparisonId, token: preview.token }, undefined, language)
          onVisit(opened.sessionId, opened.task)
        } catch (reason) {
          setOpenError(reason.message)
        } finally {
          pending.current = false
          setOpening(false)
        }
      }

      const source = preview?.source && [preview.source.name, preview.source.version].filter(Boolean).join(' · ')
      return h(InstallDialog, { title: t('核对极简模式加装'),
        className: 'moba-lighthouse-comparison moba-playbook-dialog', busy: opening, onCancel: onBack,
        initialFocus: '[data-minimal-replay-intro]', onKeyDown: event => closeDialogOnEscape(event, () => { if (!opening) onBack() }) },
        h('p', { tabIndex: -1, 'data-minimal-replay-intro': true }, t('沿用极简模式和原有终端，只加一件装备。')),
        preview && h(Fragment, null,
          h('section', { className: 'moba-minimal-replay-gear' },
            h(ItemArt, { item: { id: 'present' } }),
            h('div', null, h('h3', null, t('交付物预览')),
              h('p', null, t('让接班人从会话打开补给卡原件。')))),
          h('details', { className: 'moba-minimal-replay-detail' },
            h('summary', null, t('查看工具和来源')),
            h(InstallFacts, { facts: [[t('装备来源'), source]] }),
            preview.comparison && h('section', { className: 'moba-gallery-comparison', 'aria-label': t('对照结果') },
              h(CapabilityDifferences, { result: preview.comparison, activeDelta, setActiveDelta }))),
          h('details', { className: 'moba-minimal-replay-detail' },
            h('summary', null, t('查看复赛使用的任务')),
            h(InstallFacts, { facts: [[t('材料文件'), preview.material]] }),
            h('label', { className: 'moba-lighthouse-task' }, t('两边共用的任务'),
              h('textarea', { readOnly: true, rows: 3, value: preview.task }))),
          h('p', { className: 'moba-lighthouse-note' }, t('打开加装会话后，请手动发送同一段任务。'))),
        !state && h('p', { role: 'status' }, t('正在核对极简模式加装…')),
        (state?.error || openError) && h('p', { role: 'alert', className: 'moba-alert' }, state?.error || openError),
        h('div', { className: 'moba-install-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-text', disabled: opening, onClick: onBack }, t(backLabel)),
          (state?.error || openError) && h('button', { type: 'button', className: 'moba-roster-open', disabled: opening,
            onClick: () => { setOpenError(''); retry(count => count + 1) } }, t('重新核对')),
          preview?.token && h('button', { type: 'button', className: 'moba-start', disabled: opening || Boolean(openError),
            onClick: open }, t(opening ? '正在打开加装会话…' : '打开加装会话'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function HeroTrial({ request, comparisonId, sessionId, onClose, onVisit, putTask, workspaces, focusReplay, firstHeroes, backLabel = '返回英雄图鉴' }) {
      const language = useLanguage()
      const [need, setNeed] = useState('')
      const [activeId, setActiveId] = useState(comparisonId ?? '')
      const [latest, setLatest] = useState(null)
      const [board, setBoard] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [attempt, retry] = useState(0)
      const [replayOpen, setReplayOpen] = useState(false)
      const [personalSource, setPersonalSource] = useState(null)
      const [sharing, setSharing] = useState(false)
      const [handoffReport, setHandoffReport] = useState(null)
      const mutation = useRef(false)
      const launchIds = useRef(new Map())
      const taskField = useRef(null)
      const replayButton = useRef(null)
      const personalButton = useRef(null)
      const shareButton = useRef(null)
      const heading = useRef(null)
      const group = useId()
      const setup = !activeId
      const value = board?.id === activeId ? board : undefined
      const minimalReplay = value?.minimalReplay
      const deliveryReplay = value?.deliveryReplay

      useEffect(() => {
        const abort = new AbortController()
        let timer
        async function refresh() {
          try {
            const action = 'hero-trial'
            const result = await request(action, { action, ...(activeId && { comparisonId: activeId }) }, abort.signal, language)
            if (abort.signal.aborted) return
            if (!activeId) {
              setLatest(result?.id ? result : null)
              return
            }
            if (result?.id !== activeId) {
              setError(t('无法读取这组英雄试玩。'))
              return
            }
            setBoard(result)
            if ([...result.arms, result.minimalReplay].some(arm => ['waiting', 'running', 'waiting-choice'].includes(arm?.status))) {
              timer = setTimeout(refresh, 1600)
            }
          } catch (reason) {
            if (!abort.signal.aborted && activeId) setError(reason.message)
          }
        }
        refresh()
        return () => { abort.abort(); clearTimeout(timer) }
      }, [request, activeId, language, attempt])

      async function launch(action) {
        if (mutation.current) return
        mutation.current = true
        setBusy(true)
        setError('')
        try {
          await action()
        } catch (reason) {
          setError(reason.message)
        } finally {
          mutation.current = false
          setBusy(false)
        }
      }

      async function openArm(id, arm) {
        const action = 'hero-trial-open'
        const opened = await request(action, { action, comparisonId: id, arm }, undefined, language)
        onVisit(opened.sessionId, opened.task)
      }

      function start(firstArm) {
        if (!need || !firstHeroes?.some(hero => hero.id === firstArm)) return
        return launch(async () => {
          const action = 'hero-trial-create'
          if (!launchIds.current.has(need)) {
            const bytes = crypto.getRandomValues(new Uint8Array(16))
            launchIds.current.set(need, Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''))
          }
          const created = await request(action, { action, need, launchId: launchIds.current.get(need) }, undefined, language)
          launchIds.current.delete(need)
          setBoard(created)
          try {
            await openArm(created.id, firstArm)
          } finally {
            setActiveId(created.id)
          }
        })
      }

      function open(arm) {
        if (value) return launch(() => openArm(value.id, arm))
      }

      async function copy() {
        try {
          await navigator.clipboard.writeText(value.task)
          setNotice(t('同题任务已复制。'))
        } catch {
          taskField.current?.focus()
          taskField.current?.select()
          setNotice(t('已选中任务文字，可以手动复制。'))
        }
      }

      function reset() {
        setNeed('')
        setActiveId('')
        setError('')
        setNotice('')
      }

      function closeReplay() {
        setReplayOpen(false)
        requestAnimationFrame(() => (replayButton.current ?? heading.current)?.focus())
      }

      function closePersonalTask() {
        setPersonalSource(null)
        requestAnimationFrame(() => {
          const opener = personalButton.current
          const target = opener?.isConnected ? opener : heading.current
          target?.focus()
        })
      }

      function closeSharing() {
        setSharing(false)
        requestAnimationFrame(() => (shareButton.current ?? heading.current)?.focus())
      }

      function closeHandoffReport() {
        setHandoffReport(null)
        requestAnimationFrame(() => {
          const opener = handoffReport?.opener
          const target = opener?.isConnected ? opener : heading.current
          target?.focus()
        })
      }

      function renderArm(arm, config, extraResult) {
        const equipped = arm.id === minimalDeliveryReplayArm.id
        const reportable = canReportHeroHandoff(arm)
        return h(ComparisonArm, { key: arm.id, arm, config, busy, canStart: true,
          onStart: equipped ? undefined : open, task: value.task, sessionId, putTask, onVisit, fillOnVisit: false,
          onLessonTask: (item, opener) => {
            personalButton.current = opener
            setPersonalSource(item.lessonTaskSource)
          },
          lessonTaskAction: stockTrialTaskLabels[arm.id] ?? lessonTaskLabel,
          onNotice: status => setNotice(t(comparisonDraftNotices[status])), result: h(Fragment, null, h(HeroTrialResult, { arm }), extraResult,
            reportable && h('div', { className: 'moba-comparison-previous' },
              h('button', { type: 'button', className: 'moba-roster-open', 'aria-haspopup': 'dialog', disabled: busy,
                onClick: event => setHandoffReport({ mode: 'share', arm: arm.id, opener: event.currentTarget }) }, t('分享这局战报')),
              h('button', { type: 'button', className: 'moba-roster-open', 'aria-haspopup': 'dialog', disabled: busy,
                onClick: event => setHandoffReport({ mode: 'compare', arm: arm.id, opener: event.currentTarget }) }, t('对照好友战报')))) })
      }

      const finished = value?.arms.length > 0 && value.arms.every(arm => arm.status === 'complete')
      const verifiedHeroes = value?.arms.filter(canReportHeroHandoff) ?? []
      const focusSelector = focusReplay && deliveryReplay ? '[data-hero-delivery-recap]'
        : focusReplay && minimalReplay ? '[data-comparison-arm="minimal-present"]' : '[data-hero-trial-results]'
      return h(Fragment, null, h(InstallDialog, { title: t(heroTrialTitle), busy, onCancel: onClose,
        className: setup ? 'moba-starter-dialog' : 'moba-lighthouse-comparison',
        initialFocus: setup ? 'input[type="radio"]' : value ? focusSelector : 'h2',
        onKeyDown: event => closeDialogOnEscape(event, () => { if (!busy) onClose() }) },
        setup ? h(Fragment, null,
          h('p', null, t('同一张内置补给卡，两种交接。先为接班人选好交付要求。')),
          h('fieldset', { className: 'moba-starter-routes', disabled: busy },
            h('legend', null, t('接班人需要什么？')),
            heroTrialNeeds.map(item => h('label', { key: item.id, className: 'moba-starter-route', 'data-picked': need === item.id },
              h('input', { type: 'radio', name: group, required: true, value: item.id, checked: need === item.id,
                onChange: event => setNeed(event.currentTarget.value) }),
              h('span', null, h('strong', null, h(Glyph, { kind: item.icon, size: 16 }), t(item.name)), h('small', null, t(item.note)))))),
          h(HeroTrialFirstHero, { heroes: firstHeroes, need, disabled: busy || !need, onChoose: start }),
          busy && h('p', { role: 'status' }, t('正在打开试玩会话…')),
          error && h('p', { role: 'alert', className: 'moba-alert' }, error),
          h('div', { className: 'moba-install-actions moba-starter-actions' },
            h('button', { type: 'button', className: 'moba-text', disabled: busy, onClick: onClose }, t(backLabel)),
            latest?.id && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
              onClick: () => { setBoard(latest); setError(''); setActiveId(latest.id) } }, t('继续上一次试玩'))))
          : h(Fragment, null,
            value ? h(Fragment, null,
              h('p', { ref: heading, tabIndex: -1, 'data-hero-trial-results': true }, h('strong', null, t('接班人需要什么？')), ' ',
                t(heroTrialNeeds.find(item => item.id === value.need)?.name ?? value.need)),
              deliveryReplay ? h(HeroDeliveryReplayResult, { outcome: deliveryReplay, onVisit }) :
                h('p', { className: 'moba-lighthouse-note' }, t(finished
                  ? '交付是否符合需求依据工具、回复和附件记录。摘要内容可打开原会话核对。'
                  : '每位英雄有自己的会话。请分别手动发送同一段任务，再回来看结果。')),
              value.canShareHeroChallenge && h('div', { className: 'moba-comparison-previous' },
                h('button', { type: 'button', ref: shareButton, className: 'moba-roster-open', 'aria-haspopup': 'dialog', disabled: busy,
                  onClick: () => setSharing(true) }, t('分享英雄试玩')),
                verifiedHeroes.length === 1 && h('p', { className: 'moba-lighthouse-note' }, t('玩完这一局就能邀请朋友选英雄。打完再交换战报。'))),
              error && h('p', { role: 'alert', className: 'moba-alert' }, error),
              h('div', { className: 'moba-lighthouse-arms' }, value.arms.map(arm => {
                const config = heroTrialHeroes.find(item => item.id === arm.id)
                return config && renderArm(arm, config, arm.id === 'minimal' && value.canReplayMinimalDelivery && !minimalReplay &&
                  h('div', { className: 'moba-comparison-previous' },
                    h('button', { ref: replayButton, type: 'button', className: 'moba-roster-open', disabled: busy, 'aria-haspopup': 'dialog',
                      onClick: () => setReplayOpen(true) }, t(minimalDeliveryReplayLabel))))
              })),
              minimalReplay && h('section', { className: 'moba-handoff-outcome', 'aria-label': t('极简模式加装前后') },
                h('h3', null, t('极简模式加装前后')),
                h('p', { className: 'moba-lighthouse-note' }, t('原极简模式交付了文字摘要。下面是一件装备加装后的独立实测。')),
                renderArm(minimalReplay, minimalDeliveryReplayArm)),
              h('label', { className: 'moba-lighthouse-task' }, t('两边共用的任务'),
                h('textarea', { ref: taskField, readOnly: true, rows: 3, value: value.task })),
              h('button', { type: 'button', className: 'moba-roster-open', onClick: copy }, t('复制任务')))
              : !error && h('p', { role: 'status' }, t('正在读取英雄试玩…')),
            !value && error && h('p', { role: 'alert', className: 'moba-alert' }, error),
            notice && h('p', { role: 'status', className: 'moba-lighthouse-note' }, notice),
            h('div', { className: 'moba-install-actions moba-starter-actions' },
              h('button', { type: 'button', className: 'moba-text', disabled: busy, onClick: onClose }, t(backLabel)),
              error && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
                onClick: () => { setError(''); retry(count => count + 1) } }, t('重试')),
              !comparisonId && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy, onClick: reset }, t('另开一组试玩'))))),
        replayOpen && h(MinimalDeliveryReplay, { request, comparisonId: activeId, onBack: closeReplay,
          onVisit: (next, task) => { setReplayOpen(false); onVisit(next, task) } }),
        sharing && h(LighthouseChallengeShare, { comparisonId: activeId, request, heroTrial: true,
          playedHero: verifiedHeroes.length === 1 ? verifiedHeroes[0].id : undefined, onBack: closeSharing }),
        handoffReport && h(LighthouseHandoffReport, { report: handoffReport, comparisonId: activeId, request, onBack: closeHandoffReport }),
        personalSource && h(LessonLoadoutTask, { source: personalSource, workspaces, request, backLabel: '返回试玩对照',
          onBack: closePersonalTask, onVisit: (next, task) => { setPersonalSource(null); onVisit(next, task) } }))
    }

    function HeroTrialAnchor({ member, sessionId, request, onVisit, consumeDraft, putTask, draftStore, hasTurn, workspaces }) {
      const { items } = useSyncExternalStore(workspaces.subscribe.bind(workspaces), workspaces.getSnapshot.bind(workspaces))
      const [open, setOpen] = useState(false)
      const [draftStatus, setDraftStatus] = useState('')
      const [personalSource, setPersonalSource] = useState(null)
      const [replayOpen, setReplayOpen] = useState(false)
      const trigger = useRef(null)
      const personalTrigger = useRef(null)
      const replayTrigger = useRef(null)
      const availablePersonalTask = member.lessonTaskSource
      const availableReplay = member.arm === 'minimal' && member.canReplayMinimalDelivery === true
      const verifiedDeliveryReplay = member.verifiedDeliveryReplay === true
      const taskPending = member.firstTaskPending && !hasTurn
      const hero = member.arm === minimalDeliveryReplayArm.id ? minimalDeliveryReplayArm : heroTrialHeroes.find(item => item.id === member.arm)
      useEffect(() => {
        const status = consumeDraft(sessionId)
        if (status) setDraftStatus(status)
      }, [member.id, sessionId, consumeDraft])

      function close() {
        setOpen(false)
        requestAnimationFrame(() => trigger.current?.focus())
      }

      function closePersonalTask() {
        setPersonalSource(null)
        requestAnimationFrame(() => (personalTrigger.current ?? trigger.current)?.focus())
      }

      function closeReplay() {
        setReplayOpen(false)
        requestAnimationFrame(() => (replayTrigger.current ?? trigger.current)?.focus())
      }

      return h(Fragment, null,
        h('div', { className: 'moba-lighthouse-anchor', 'data-task-pending': taskPending || undefined },
          h('div', null, h('strong', null, t(heroTrialTitle)), hero && h('span', null, t(hero.name))),
          h('div', { className: 'moba-lighthouse-anchor-actions' },
            h('button', { ref: trigger, type: 'button', 'aria-haspopup': 'dialog', className: 'moba-settlement-button',
              onClick: () => setOpen(true) }, t(verifiedDeliveryReplay ? '查看换装战报' : heroTrialView)),
            availablePersonalTask && h('button', { ref: personalTrigger, type: 'button', 'aria-haspopup': 'dialog',
              className: 'moba-settlement-button', onClick: () => setPersonalSource(availablePersonalTask) },
              t(stockTrialTaskLabels[member.arm] ?? lessonTaskLabel)),
            availableReplay && h('button', { ref: replayTrigger, type: 'button', 'aria-haspopup': 'dialog',
              className: 'moba-settlement-button', onClick: () => setReplayOpen(true) }, t(minimalDeliveryReplayLabel))),
          taskPending ? h(ChallengeTaskDraft, { task: member.task, presetChanged: member.presetChanged,
            sessionId, draftStore, putTask, backLabel: '返回试玩会话' })
            : verifiedDeliveryReplay ? h('p', { role: 'status' }, t('加装后已附上补给卡原件，符合接班需求。'))
            : availableReplay ? h('p', { role: 'status' }, t('这局交接了文字，接班人还需要可打开的原件。'))
            : !hasTurn && !availablePersonalTask && draftStatus && h('p', { role: 'status' }, t(comparisonDraftNotices[draftStatus]))),
        replayOpen && h(MinimalDeliveryReplay, { request, comparisonId: member.id, onBack: closeReplay,
          backLabel: '返回试玩会话', onVisit: (next, task) => { setReplayOpen(false); onVisit(next, task) } }),
        personalSource && h(LessonLoadoutTask, { source: personalSource, workspaces: items, request,
          backLabel: '返回试玩会话', onBack: closePersonalTask,
          onVisit: (next, task) => { setPersonalSource(null); onVisit(next, task) } }),
        open && h(HeroTrial, { request, comparisonId: member.id, sessionId, onClose: close, workspaces: items,
          focusReplay: member.arm === minimalDeliveryReplayArm.id,
          backLabel: '返回试玩会话', putTask: task => putTask(sessionId, task),
          onVisit: (next, task) => { if (next === sessionId) close(); else { setOpen(false); onVisit(next, task) } } }))
    }

    function rematchGearName(item) {
      return item && [item.name, item.sourceName].filter(Boolean).join(' · ')
    }

    function rematchChangeSummary(change) {
      if (!change) return ''
      return [
        change.removed && t('已卸下 ', '已卸下（换装摘要）') + rematchGearName(change.removed),
        change.added && t('已装上 ') + rematchGearName(change.added),
      ].filter(Boolean).join(' / ')
    }

    function RematchChangeFacts({ change }) {
      if (!change) return null
      return h(InstallFacts, { facts: [[t('卸下的装备'), rematchGearName(change.removed)], [t('装上的装备'), rematchGearName(change.added)]] })
    }

    function ObservedChoiceSummary({ choices }) {
      return h('p', { className: 'moba-lighthouse-note' }, choices.length
        ? t('你实际选择了 ') + choices.join(' / ') : t('本局没有记录提问卡选择。'))
    }

    function EvidenceOpeningOutcome({ outcome }) {
      const heading = useId()
      const choice = evidenceOpeningChoices[outcome.choice]
      if (!choice) return null
      return h('section', { className: 'moba-handoff-outcome moba-lighthouse-artifacts', 'aria-labelledby': heading },
        h('h3', { id: heading }, t('开局想法与实战选择')),
        h(InstallFacts, { facts: [[t('开局选择'), t(choice)]] }),
        h(ObservedChoiceSummary, { choices: outcome.actualChoices ?? empty }))
    }

    function HandoffOutcomeSummary({ outcome, onPreserve, onVisit, onLessonTask, busy }) {
      const heading = useId()
      return h('section', { className: 'moba-handoff-outcome', 'aria-labelledby': heading },
        h('h3', { id: heading, tabIndex: onVisit ? -1 : undefined, 'data-public-review-outcome': Boolean(onVisit) || undefined },
          t('两局实测结果')),
        h('div', { className: 'moba-lighthouse-arms' }, outcome.arms.map(arm => {
          const style = t(arm.style === 'review' ? '复核后交付' : '直接交付')
          const files = arm.deliverables ?? empty
          const useLabel = t('用这套出装')
          return h('section', { key: arm.id, className: 'moba-lighthouse-arm', 'aria-label': style },
            h('div', null, h('h4', null, style), !onVisit && h('small', { className: 'moba-lighthouse-arm-hero' },
              t(arm.id === 'baseline' ? '原局' : '换装复赛'))),
            h(ObservedChoiceSummary, { choices: arm.choices }),
            onVisit && files.length > 0
              ? h(Fragment, null, !arm.materialDelivered && h('p', { className: 'moba-lighthouse-note' }, t('其他交付文件')),
                h(LessonTaskFiles, { files, sessionId: arm.sessionId, materialDelivered: arm.materialDelivered, headingTag: 'h5' }))
              : h('p', { className: 'moba-lighthouse-note' }, arm.materialDelivered
                ? h(Fragment, null, t('所选材料已交付') + ' · ', h('strong', null, outcome.material))
                : arm.deliveredCount > 0 ? t('其他交付文件') + ' · ' + arm.deliveredCount : t('本局没有交付文件。')),
            onVisit && h('footer', null,
              h('button', { type: 'button', className: 'moba-text', disabled: busy,
                'aria-label': t('查看原会话') + ' · ' + style, onClick: () => onVisit(arm.sessionId) }, t('查看原会话')),
              arm.lessonTaskSource && onLessonTask && h('button', { type: 'button', className: 'moba-roster-open', disabled: busy,
                'aria-label': useLabel + ' · ' + style, 'aria-haspopup': 'dialog',
                'data-lesson-task-arm': arm.id, onClick: () => onLessonTask(arm) }, useLabel)),
            arm.canPreserve && onPreserve && h('footer', null,
              h('button', { type: 'button', className: 'moba-roster-open', disabled: busy, 'data-handoff-preserve': arm.id,
                'aria-label': t('保留这套出装') + ' · ' + style, onClick: () => onPreserve(arm.id) }, t('保留这套出装'))))
        })))
    }

    function ReviewChoiceComparison({ comparison, onVisit, busy }) {
      const heading = useId()
      const rounds = [['本次复核', comparison.current], ['另一次复核', comparison.other]]
      return h('section', { className: 'moba-handoff-outcome', 'aria-labelledby': heading },
        h('h3', { id: heading }, t('同一出装的两种取舍')),
        h('div', { className: 'moba-lighthouse-arms' }, rounds.map(([name, round]) => {
          const label = t(name)
          const files = round.deliverables ?? empty
          return h('section', { key: round.sessionId, className: 'moba-lighthouse-arm', 'aria-label': label },
            h('h4', null, label), h(ObservedChoiceSummary, { choices: round.choices }),
            files.length > 0 ? h(LessonTaskFiles, { files, sessionId: round.sessionId,
              materialDelivered: round.materialDelivered, headingTag: 'h5' })
              : h('p', { className: 'moba-lighthouse-note' }, t('本局没有交付文件。')),
            h('footer', null, h('button', { type: 'button', className: 'moba-text', disabled: busy,
              'aria-label': t('查看原会话') + ' · ' + label, onClick: () => onVisit(round.sessionId) }, t('查看原会话'))))
        })))
    }

    function EvidenceOutcomeSummary({ outcome, onPreserve, publicReplay, onLessonTask, onVisit, busy }) {
      const heading = useId()
      return h('section', { className: 'moba-handoff-outcome', 'aria-labelledby': heading },
        h('h3', { id: heading, tabIndex: publicReplay ? -1 : undefined, 'data-public-evidence-outcome': publicReplay || undefined },
          t(publicReplay ? '两局实测结果' : '挑一套留到下次')),
        h('div', { className: 'moba-lighthouse-arms' }, outcome.arms.map(arm => {
          const label = comparisonArmName(comparisonArmConfig('rematch', arm.id, true), arm)
          const name = t(arm.id === 'baseline' ? '带证据核验做自己的任务' : '用直接交付出装做自己的任务')
          return h('section', { key: arm.id, className: 'moba-lighthouse-arm', 'aria-label': label },
            h('h4', null, label),
            h(ObservedChoiceSummary, { choices: arm.choices }),
            arm.deliverables.length > 0 ? publicReplay
              ? h(LessonTaskFiles, { files: arm.deliverables, sessionId: arm.sessionId, headingTag: 'h5' })
              : h('div', { className: 'moba-lighthouse-artifacts' },
                h('h5', null, t('交付文件') + ' · ' + arm.deliverables.length),
                h('ul', null, arm.deliverables.map((file, index) => h('li', { key: index }, file.name))))
              : h('p', { className: 'moba-lighthouse-note' }, t('本局没有交付文件。')),
            publicReplay && h('footer', null,
              arm.sessionId && onVisit && h('button', { type: 'button', className: 'moba-text', disabled: busy,
                'aria-label': t('查看原会话') + ' · ' + label, onClick: () => onVisit(arm.sessionId) }, t('查看原会话')),
              arm.lessonTaskSource && onLessonTask &&
              h('button', { type: 'button', className: 'moba-roster-open', disabled: busy, 'aria-haspopup': 'dialog',
                'data-lesson-task-arm': arm.id, onClick: () => onLessonTask(arm) }, name)),
            arm.canPreserve && onPreserve && h('footer', null,
              h('button', { type: 'button', className: 'moba-roster-open', 'data-evidence-preserve': arm.id,
                'aria-label': t('保留这套出装') + ' · ' + label, onClick: () => onPreserve(arm.id) }, t('保留这套出装'))))
        })))
    }

    function EvidenceRetestRun({ label, run }) {
      const heading = useId()
      return h('section', { className: 'moba-lighthouse-artifacts', 'aria-labelledby': heading },
        h('h5', { id: heading }, t(label)),
        h(ObservedChoiceSummary, { choices: run.choices }),
        run.deliverables.length > 0 ? h(Fragment, null,
          h('p', { className: 'moba-lighthouse-note' }, t('交付文件') + ' · ' + run.deliverables.length),
          h('ul', null, run.deliverables.map((file, index) => h('li', { key: index }, file.name))))
          : h('p', { className: 'moba-lighthouse-note' }, t('本局没有交付文件。')))
    }

    const evidenceRetestNoteLabel = '记下适用情形'

    function EvidenceRetestOutcome({ outcome, arms, onViewSource, onEditNote, savedNoteArm }) {
      const heading = useId()
      return h('section', { className: 'moba-handoff-outcome', 'aria-labelledby': heading },
        h('h3', { id: heading }, t('这次复测有什么变化')),
        h('div', { className: 'moba-lighthouse-arms' }, outcome.arms.map(arm => {
          const label = comparisonArmName(comparisonArmConfig('plans', arm.id), arms.find(item => item.id === arm.id) ?? arm)
          return h('section', { key: arm.id, className: 'moba-lighthouse-arm', 'aria-label': label },
            h('h4', null, label),
            h(EvidenceRetestRun, { label: '原实战', run: arm.original }),
            h(EvidenceRetestRun, { label: '本次复测', run: arm.retest }),
            savedNoteArm === arm.id && h('p', { className: 'moba-lighthouse-note', role: 'status' }, t('已保存方案备注。')),
            arm.canEditPlanNote && h('footer', null,
              h('button', { type: 'button', className: 'moba-roster-open', 'data-retest-note': arm.id,
                'aria-label': t(evidenceRetestNoteLabel) + ' · ' + label, 'aria-haspopup': 'dialog',
                onClick: () => onEditNote(arm.id) }, t(evidenceRetestNoteLabel))))
        })),
        onViewSource && h('div', { className: 'moba-comparison-previous' },
          h('button', { type: 'button', className: 'moba-roster-open', 'data-comparison-previous': '',
            onClick: onViewSource }, h(Glyph, { kind: 'back', size: 15 }), t('查看原实战对照'))))
    }

    function EvidenceRetestNote({ comparisonId, arm, request, onCancel, onSaved }) {
      const [plan, setPlan] = useState(null)
      const [note, setNote] = useState('')
      const [error, setError] = useState('')
      const [saving, setSaving] = useState(false)
      const pending = useRef(null)

      useEffect(() => {
        const abort = new AbortController()
        const action = 'evidence-retest-note'
        request(action, { action, comparisonId, arm }, abort.signal)
          .then(value => {
            if (abort.signal.aborted) return
            setNote(value.note)
            setPlan(value)
          })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => {
          abort.abort()
          pending.current?.abort()
        }
      }, [request, comparisonId, arm])

      function close() {
        if (!pending.current) onCancel()
      }

      async function save(event) {
        event.preventDefault()
        if (!plan || pending.current || note === plan.note) return
        const abort = pending.current = new AbortController()
        const action = 'evidence-retest-note-save'
        setSaving(true)
        setError('')
        try {
          const result = await request(action, { action, comparisonId, arm, revision: plan.revision, note }, abort.signal)
          if (!abort.signal.aborted) onSaved(result)
        } catch (reason) {
          if (!abort.signal.aborted) setError(reason.message)
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setSaving(false)
        }
      }

      return h(InstallDialog, { title: t(evidenceRetestNoteLabel), className: 'moba-lighthouse-comparison', busy: saving,
        onCancel: close, initialFocus: plan ? '.moba-retest-note-field' : '.moba-retest-note-cancel',
        onKeyDown: event => closeDialogOnEscape(event, close) },
        h('form', { className: 'moba-plan-form', onSubmit: save },
          h('div', { className: 'moba-plan-fields' },
            !plan && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取方案备注…')),
            plan && h(Fragment, null,
              h('p', { className: 'moba-plan-note' }, h('strong', null, plan.name)),
              h('label', null, t('方案备注'), h('textarea', { className: 'moba-retest-note-field', rows: 4,
                maxLength: 240, value: note, disabled: saving, onChange: event => setNote(event.target.value) }))),
            error && h('p', { className: 'moba-alert', role: 'alert' }, error)),
          h('footer', { className: 'moba-market-actions moba-starter-actions' },
            h('button', { type: 'button', className: 'moba-roster-open moba-retest-note-cancel', disabled: saving, onClick: close }, t('取消')),
            h('button', { type: 'submit', className: 'moba-start', disabled: !plan || saving || note === plan.note },
              t(saving ? '正在保存…' : '保存备注')))))
    }

    function previousComparisonIsValid(reference) {
      if (!reference?.comparisonId || typeof reference.comparisonId !== 'string') return false
      const { kind, arm } = reference
      if (kind === 'rematch') return arm === 'rematch'
      return (kind === 'workspace' || kind === 'plans') && comparisonKinds[kind].arms.some(side => side.id === arm)
    }

    function sameComparison(first, second) {
      return first.kind === second.kind && first.comparisonId === second.comparisonId
    }

    function PreviousComparisonLink({ reference, onOpen, buttonRef, disabled }) {
      return h('div', { className: 'moba-comparison-previous' },
        h('button', { ref: buttonRef, type: 'button', className: 'moba-roster-open', 'data-comparison-previous': '',
          onClick: () => onOpen(reference), disabled }, h(Glyph, { kind: 'back', size: 15 }), t('查看上一组对照')),
        h('p', { className: 'moba-lighthouse-note' }, rematchChangeSummary(reference.change) || t(comparisonTitle(reference.kind, reference.lesson))))
    }

    function MaterialBreadcrumb({ directory, onBrowse }) {
      const parts = directory ? directory.split('/') : empty
      const crumbs = [{ path: '', name: t('工作区根目录') }, ...parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }))]
      return h('nav', { className: 'moba-material-crumbs', 'aria-label': t('当前文件夹') }, h('ol', null,
        crumbs.map(({ path, name }) => h('li', { key: path }, path === directory
          ? h('span', { 'aria-current': 'location' }, name)
          : h('button', { type: 'button', className: 'moba-text', onClick: () => onBrowse(path) }, name)))))
    }

    function WorkspaceMaterialPicker({ workspace, workspaceLabel, request, onCancel, onSelect, materialAction = 'workspace-materials' }) {
      const language = useLanguage()
      const [directory, setDirectory] = useState('')
      const [query, setQuery] = useState('')
      const [loaded, setLoaded] = useState(null)
      const [page, setPage] = useState(null)
      const [attempt, retry] = useState(0)
      const searchInput = useRef(null)
      const search = query.trim()
      const key = JSON.stringify([materialAction, workspace.workspaceId, directory, search, language])
      const cursor = page?.key === key ? page.cursor : undefined
      const current = loaded?.key === key ? loaded : undefined
      const working = !current || current.cursor !== cursor || current.attempt !== attempt
      const listing = current?.entries ?? empty

      useEffect(() => {
        const abort = new AbortController()
        const action = materialAction
        const timer = setTimeout(async () => {
          try {
            const value = await request(action, { action, workspaceId: workspace.workspaceId,
              directory, query: search || undefined, cursor }, abort.signal, language)
            if (abort.signal.aborted) return
            setLoaded(previous => {
              const preceding = cursor && previous?.key === key ? previous.entries : empty
              const byPath = new Map([...preceding, ...value.entries].map(entry => [entry.path, entry]))
              return { key, cursor, attempt, directory: value.directory, entries: [...byPath.values()], next: value.next }
            })
          } catch (reason) {
            if (!abort.signal.aborted) setLoaded(previous => ({ key, cursor, attempt, error: reason.message,
              entries: previous?.key === key ? previous.entries : empty }))
          }
        }, search && !cursor ? 180 : 0)
        return () => { abort.abort(); clearTimeout(timer) }
      }, [request, workspace.workspaceId, directory, search, cursor, attempt, language, key, materialAction])

      function browse(path, clearQuery = false) {
        setDirectory(path)
        setPage(null)
        if (clearQuery) setQuery('')
        searchInput.current?.focus()
      }

      return h(InstallDialog, { title: t('选择材料文件'), className: 'moba-lighthouse-comparison moba-material-dialog',
        onCancel, initialFocus: '.moba-material-search input', onKeyDown: event => {
          if (event.key === 'Enter' && event.target === searchInput.current) event.preventDefault()
          closeDialogOnEscape(event, onCancel)
        } },
        h('p', { className: 'moba-lighthouse-note' }, workspaceLabel),
        h(MaterialBreadcrumb, { directory: current?.directory ?? directory, onBrowse: browse }),
        h('label', { className: 'moba-search moba-material-search' }, h(Glyph, { kind: 'search', size: 17 }),
          h('input', { ref: searchInput, type: 'search', value: query, maxLength: 160,
            'aria-label': t('按文件名或相对路径搜索'), placeholder: t('按文件名或相对路径搜索'),
            onChange: event => { setQuery(event.target.value); setPage(null) } })),
        listing.length > 0 && h('ul', { className: 'moba-material-entries' }, listing.map(entry => {
          const folder = entry.kind === 'directory'
          return h('li', { key: entry.path }, h('button', { type: 'button',
            'aria-label': t(folder ? '打开文件夹 ' : '选择文件 ') + entry.path,
            onClick: () => folder ? browse(entry.path, true) : onSelect(entry.path) },
          h(Glyph, { kind: folder ? 'folder' : 'report', size: 20 }),
          h('span', null, h('strong', null, entry.name), entry.path !== entry.name && h('small', null, entry.path)),
          folder ? h(Glyph, { kind: 'arrow', size: 15 }) : h('span', { className: 'moba-material-choose' }, t('选用'))))
        })),
        working ? h('p', { className: 'moba-empty', role: 'status' }, t('正在读取工作区文件…'))
          : current.error ? h('p', { className: 'moba-alert', role: 'alert' }, current.error, ' ',
            h('button', { type: 'button', className: 'moba-text', onClick: () => {
              if (cursor) setPage(null)
              retry(value => value + 1)
            } }, t(cursor ? '从第一页重新读取' : '重试')))
            : !listing.length && h('p', { className: 'moba-empty', role: 'status' }, t(current.next
              ? '这页没有匹配文件，可以继续查找。' : search ? '当前文件夹内没有找到匹配文件。' : '此文件夹没有可选材料。')),
        h('footer', { className: 'moba-market-actions moba-starter-actions' },
          current?.next && (working || current.next !== cursor) && h('button', { type: 'button', className: 'moba-roster-open',
            disabled: working, onClick: () => setPage({ key, cursor: current.next }) }, t(search ? '继续查找文件' : '加载更多文件')),
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onCancel }, t('关闭'))))
    }

    function WorkspaceFolderPicker({ list, adding, error, onCancel, onSelect, onPickNative }) {
      const [target, setTarget] = useState({})
      const [loaded, setLoaded] = useState(null)
      const [path, setPath] = useState('')
      const pathInput = useRef(null)
      const current = loaded?.target === target ? loaded : null
      const directory = current?.directory
      const canPickNative = Boolean(onPickNative)

      useEffect(() => {
        const abort = new AbortController()
        async function read() {
          try {
            const directory = await list(target.path, abort.signal)
            if (abort.signal.aborted) return
            setLoaded({ target, directory })
            setPath(draft => draft === (target.path ?? '') ? directory.path : draft)
          } catch (reason) {
            if (abort.signal.aborted) return
            const needsNative = canPickNative && target.path === undefined && reason.rpcError?.code === 'directory-picker/unavailable'
            setLoaded(needsNative ? { target, needsNative } : { target, error: reason.message })
          }
        }
        void read()
        return () => abort.abort()
      }, [list, target, canPickNative])

      function browse(next) {
        setTarget({ path: next })
        setPath(next)
        pathInput.current?.focus()
      }

      const dialog = { title: t('选择材料所在的文件夹'), className: 'moba-lighthouse-comparison moba-material-dialog',
        busy: adding, onCancel, initialFocus: current?.needsNative ? '.moba-start' : '.moba-material-search input',
        onKeyDown: event => closeDialogOnEscape(event, () => { if (!adding) onCancel() }) }
      if (current?.needsNative) return h(InstallDialog, dialog,
        h('p', { className: 'moba-lighthouse-note' }, t('此连接使用系统文件夹选择器。')),
        error && h('p', { className: 'moba-alert', role: 'alert' }, t(error)),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onCancel, disabled: adding }, t('关闭')),
          h('button', { type: 'button', className: 'moba-start', disabled: adding, onClick: onPickNative },
            t(adding ? '正在添加材料文件夹…' : '打开系统文件夹选择器'))))

      return h(InstallDialog, dialog,
        h('div', { className: 'moba-material-input' },
          h('label', { className: 'moba-search moba-material-search' }, h(Glyph, { kind: 'folder', size: 17 }),
            h('input', { ref: pathInput, type: 'text', value: path, disabled: adding, autoComplete: 'off', spellCheck: false,
              'aria-label': t('文件夹路径'), placeholder: t('文件夹路径'),
              onChange: event => setPath(event.target.value), onKeyDown: event => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                if (path.trim()) browse(path.trim())
              } })),
          h('button', { type: 'button', className: 'moba-roster-open', disabled: adding || !path.trim(),
            onClick: () => browse(path.trim()) }, t('前往文件夹'))),
        directory && h(Fragment, null,
          h('nav', { className: 'moba-material-crumbs', 'aria-label': t('文件夹路径') }, h('ol', null,
            directory.crumbs.map(crumb => h('li', { key: crumb.path }, crumb.path === directory.path
              ? h('span', { 'aria-current': 'location' }, crumb.name)
              : h('button', { type: 'button', className: 'moba-text', disabled: adding,
                onClick: () => browse(crumb.path) }, crumb.name))))),
          h('ul', { className: 'moba-material-entries', 'aria-label': t('子文件夹') },
            directory.entries.filter(entry => !entry.hidden).map(entry => h('li', { key: entry.path },
              h('button', { type: 'button', disabled: adding, 'aria-label': t('打开文件夹 ') + entry.name,
                onClick: () => browse(entry.path) }, h(Glyph, { kind: 'folder', size: 20 }),
              h('span', null, h('strong', null, entry.name)), h(Glyph, { kind: 'arrow', size: 15 }))))),
          directory.truncated && h('p', { className: 'moba-lighthouse-note' }, t('只显示部分文件夹。也可以输入路径。'))),
        !current && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取文件夹…')),
        current?.error && h('p', { className: 'moba-alert', role: 'alert' }, t(current.error)),
        error && h('p', { className: 'moba-alert', role: 'alert' }, t(error)),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onCancel, disabled: adding }, t('关闭')),
          h('button', { type: 'button', className: 'moba-start', disabled: adding || !directory || path.trim() !== directory.path,
            onClick: () => onSelect(directory.path) }, t(adding ? '正在添加材料文件夹…' : '使用此文件夹'))))
    }

    function AddMaterialsFolder({ setup, disabled, onAdded }) {
      const [pickerOpen, setPickerOpen] = useState(false)
      const [adding, setAdding] = useState(false)
      const [error, setError] = useState('')
      const trigger = useRef(null)
      const pending = useRef(null)
      useEffect(() => () => { pending.current = null }, [])

      function close() {
        setPickerOpen(false)
        setError('')
        requestAnimationFrame(() => trigger.current?.focus())
      }

      async function add(path, pick = setup.pick) {
        if (pending.current) return
        const operation = {}
        pending.current = operation
        setAdding(true)
        setError('')
        try {
          const directory = path ?? await pick()
          if (pending.current !== operation) return
          if (!directory) {
            close()
            return
          }
          const { workspaceId } = await setup.add(directory)
          if (pending.current !== operation) return
          onAdded(workspaceId)
          close()
        } catch (reason) {
          if (pending.current === operation) setError(reason.message)
        } finally {
          if (pending.current === operation) {
            pending.current = null
            setAdding(false)
            if (!path) requestAnimationFrame(() => trigger.current?.focus())
          }
        }
      }

      return h(Fragment, null,
        h('button', { ref: trigger, type: 'button', className: 'moba-roster-open', 'aria-haspopup': 'dialog',
          disabled: disabled || adding, onClick: () => setup.pick ? void add() : setPickerOpen(true) },
        t(adding && !pickerOpen ? '正在添加材料文件夹…' : '添加材料文件夹')),
        pickerOpen ? h(WorkspaceFolderPicker, { list: setup.list, adding, error, onCancel: close, onSelect: add,
          onPickNative: setup.pickHost ? () => void add(undefined, setup.pickHost) : undefined })
          : error && h('p', { className: 'moba-alert', role: 'alert' }, t(error)))
    }

    function WorkspaceFileFields({ workspaces, workspaceId, setWorkspaceId, material, setMaterial, busy, workspaceField, materialField, request, materialAction,
      workspaceSetup, onWorkspaceAdded }) {
      const helpId = useId()
      const [pickerFor, setPickerFor] = useState('')
      const defaultMaterialField = useRef(null)
      const pathInput = materialField ?? defaultMaterialField
      const browseButton = useRef(null)
      const workspace = workspaces.find(item => item.workspaceId === workspaceId)

      useEffect(() => { if (pickerFor && pickerFor !== workspace?.workspaceId) setPickerFor('') }, [pickerFor, workspace?.workspaceId])

      function closePicker(target) {
        setPickerFor('')
        requestAnimationFrame(() => target.current?.focus())
      }

      function selectMaterial(path) {
        pathInput.current?.setCustomValidity('')
        setMaterial(path)
        closePicker(pathInput)
      }

      const workspaceSelect = h('label', null, t('工作区'), h('select', { ref: workspaceField, value: workspaceId, disabled: busy || !workspaces.length,
          required: true, onChange: event => setWorkspaceId(event.target.value) },
        h('option', { value: '' }, t(workspaces.length ? '选择材料所在的工作区' : '请先添加工作区')),
        workspaces.map(item => h('option', { key: item.workspaceId, value: item.workspaceId }, workspaceFileLabel(item, workspaces)))))
      return h(Fragment, null,
        workspaceSetup ? h('div', { className: 'moba-material-input' }, workspaceSelect,
          h(AddMaterialsFolder, { setup: workspaceSetup, disabled: busy, onAdded: onWorkspaceAdded })) : workspaceSelect,
        h('div', { className: 'moba-material-input' },
          h('label', null, t('材料文件相对路径'),
            h('input', { ref: pathInput, required: true, disabled: busy, 'aria-describedby': helpId, value: material, maxLength: 1024,
              placeholder: 'docs/brief.md', autoComplete: 'off', spellCheck: false,
              onChange: event => { event.target.setCustomValidity(''); setMaterial(event.target.value) } })),
          h('button', { ref: browseButton, type: 'button', className: 'moba-roster-open', 'aria-haspopup': 'dialog',
            disabled: busy || !workspace, onClick: () => setPickerFor(workspace.workspaceId) }, t('浏览文件'))),
        h('p', { id: helpId, className: 'moba-lighthouse-note' }, t('填入一个相对于工作区根目录的文件路径，例如 docs/brief.md。')),
        workspace && pickerFor === workspaceId && h(WorkspaceMaterialPicker, { workspace, workspaceLabel: workspaceFileLabel(workspace, workspaces),
          request, materialAction, onCancel: () => closePicker(browseButton), onSelect: selectMaterial }))
    }

    function workspaceMaterialIsRelative(path) {
      return !/[\p{Cc}:]/u.test(path) && path.split(/[\\/]/).every(part => part && part !== '.' && part !== '..')
    }

    function WorkspaceComparisonForm({ form, brief, defaultBrief, setBrief, ...fileFields }) {
      return h('form', { ref: form, className: 'moba-lighthouse-task moba-workspace-comparison-form',
        onSubmit: event => event.preventDefault() },
        h(WorkspaceFileFields, fileFields),
        h('label', null, t('两边共用的任务'),
          h('textarea', { disabled: fileFields.busy, rows: 3, value: brief, placeholder: defaultBrief, maxLength: 1200,
            onChange: event => setBrief(event.target.value) })))
    }

    function workspaceTitle(item) {
      return item.title === 'default-workspace' ? t('默认工作区') : item.title
    }

    function workspaceFileLabel(item, workspaces) {
      const title = workspaceTitle(item)
      const duplicate = workspaces.some(other => other.workspaceId !== item.workspaceId && workspaceTitle(other) === title)
      return item.path && duplicate ? title + ' · ' + item.path : title
    }

    function RunComparison({ kind = 'lighthouse', comparisonId, initialPrevious, lessonHint, evidenceReplayHint, publicEvidenceReplayHint,
      testedSourceArm, onBack, backLabel, ...props }) {
      const origin = { kind, comparisonId, arm: testedSourceArm }
      const [path, setPath] = useState(() => previousComparisonIsValid(initialPrevious) && !sameComparison(origin, initialPrevious) ? [initialPrevious] : [])
      const [returning, setReturning] = useState(false)
      const current = path.at(-1) ?? origin
      const navigatingFromRetest = kind === 'plans' && path.length === 1 && current.evidenceReplay

      function canView(reference) {
        return previousComparisonIsValid(reference) && !sameComparison(origin, reference) && !path.some(item => sameComparison(item, reference))
      }

      function viewPrevious(reference) {
        if (!canView(reference)) return
        setReturning(false)
        setPath(items => items.some(item => sameComparison(item, reference)) ? items : [...items, reference])
      }

      function returnToNewer() {
        setReturning(true)
        setPath(items => items.at(-1) === current ? items.slice(0, -1) : items)
      }

      return h(ComparisonBoard, { ...props, key: current.kind + ':' + current.comparisonId,
        kind: current.kind, comparisonId: current.comparisonId, lessonHint: path.length ? current.lesson : lessonHint,
        evidenceReplayHint: path.length ? current.evidenceReplay : evidenceReplayHint,
        publicEvidenceReplayHint: path.length ? current.publicEvidenceReplay : publicEvidenceReplayHint,
        focusArm: returning ? undefined : current.arm,
        testedSourceArm: path.length ? undefined : testedSourceArm,
        focusPrevious: returning, canViewPrevious: canView, onPrevious: viewPrevious,
        backLabel: path.length ? t(navigatingFromRetest ? '返回本次复测' : '返回后一组对照') : backLabel,
        onBack: path.length ? returnToNewer : onBack })
    }

    function ComparisonBoard({ kind, request, comparisonId, sessionId, onClose, onVisit, putTask, canViewPrevious, lessonHint, evidenceReplayHint, publicEvidenceReplayHint,
      workspaces = empty, initialWorkspaceId, onUse, onEvidenceSaved, onEvidenceNoteSaved, onHistory, onBack, backLabel, onPrevious,
      focusArm, focusPrevious, testedSourceArm }) {
      const language = useLanguage()
      const config = comparisonKinds[kind]
      const personal = kind !== 'lighthouse'
      const [prototype, setPrototype] = useState(false)
      const [view, setView] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [attempt, retry] = useState(0)
      const [launch, setLaunch] = useState('')
      const [reuse, setReuse] = useState(null)
      const [rematch, setRematch] = useState(null)
      const [noteTarget, setNoteTarget] = useState(null)
      const [savedNoteArm, setSavedNoteArm] = useState('')
      const [lessonTask, setLessonTask] = useState(null)
      const [lessonLaunchOpen, setLessonLaunchOpen] = useState(false)
      const [challengeShareId, setChallengeShareId] = useState('')
      const [evidenceReport, setEvidenceReport] = useState('')
      const starting = useRef(false)
      const launchIds = useRef(new Map())
      const returnFocus = useRef('')
      const taskField = useRef(null)
      const workspaceForm = useRef(null)
      const [selectedWorkspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? '')
      const [material, setMaterial] = useState('')
      const [customBrief, setBrief] = useState()
      const scope = useMemo(() => prototype ? { prototype: true } : comparisonId ? { comparisonId }
        : sessionId ? { sessionId } : {}, [prototype, comparisonId, sessionId])

      useEffect(() => {
        const abort = new AbortController()
        const action = config.action
        let timer
        async function update() {
          try {
            const result = await request(action, { action, ...scope }, abort.signal, language)
            if (abort.signal.aborted) return
            setView({ scope, result })
            if (result?.arms.some(arm => ['running', 'waiting', 'waiting-choice'].includes(arm.status))) {
              timer = setTimeout(update, 1600)
            }
          } catch (reason) {
            if (!abort.signal.aborted) setError(reason.message)
          }
        }
        update()
        return () => { abort.abort(); clearTimeout(timer) }
      }, [request, scope, language, attempt, config.action])

      const value = view?.scope === scope ? view.result : undefined
      const publicEvidenceReplay = kind === 'rematch' && (value?.publicEvidenceReplay ?? publicEvidenceReplayHint) === true
      const evidenceReplay = publicEvidenceReplay || kind === 'rematch' && (value?.evidenceReplay ?? evidenceReplayHint)
      const handoff = kind === 'rematch' && !evidenceReplay ? value?.handoffOutcome : undefined
      const publicReviewOutcome = kind === 'rematch' ? value?.publicReviewOutcome : undefined
      const canRepeatLighthouseReview = kind === 'rematch' && value?.canRepeatLighthouseReview === true
      const reviewChoiceComparison = kind === 'rematch' && value?.reviewChoiceComparison
      const evidenceOutcome = evidenceReplay && !testedSourceArm ? value?.evidenceOutcome : undefined
      const evidenceSummary = evidenceOutcome && h(EvidenceOutcomeSummary, { outcome: evidenceOutcome, publicReplay: publicEvidenceReplay,
        busy: Boolean(launch), onVisit, onLessonTask: publicEvidenceReplay ? arm => setLessonTask({ id: arm.id,
          lessonTaskSource: arm.lessonTaskSource, fromSummary: true }) : undefined,
        onPreserve: publicEvidenceReplay ? undefined : arm => setReuse({ id: value.id, arm, evidence: true }) })
      const retestOutcome = kind === 'plans' ? value?.evidenceRetestOutcome : undefined
      const task = value?.task
      const lessonMarker = value?.lesson ?? lessonHint
      const lesson = lessonMarker === lighthouseRematchLesson
      const evidence = lessonMarker === lighthouseEvidenceLesson
      const canShareEvidenceReport = evidence && value?.canShareEvidenceReport === true
      const practice = lesson || evidence
      const scenario = evidenceScenarios.find(item => item.id === value?.scenario)
      const draftNotices = evidence ? evidenceDraftNotices : comparisonDraftNotices
      const directLesson = kind === 'workspace' && lesson
      const finished = !directLesson && !evidence && value?.arms.every(arm => arm.status === 'complete')
      const setup = kind === 'workspace' && value && !value.id
      const previous = kind === 'rematch' && canViewPrevious(value?.previous) ? value.previous : null
      const retestSource = retestOutcome && canViewPrevious(retestOutcome.source) ? retestOutcome.source : undefined
      const focusSelector = focusPrevious && (previous || retestSource) ? '[data-comparison-previous]'
        : value?.arms.some(arm => arm.id === focusArm) ? `[data-comparison-arm="${focusArm}"]`
          : publicEvidenceReplay && evidenceOutcome ? '[data-public-evidence-outcome]'
            : publicReviewOutcome ? '[data-public-review-outcome]'
              : canShareEvidenceReport ? '[data-evidence-report="share"]' : ''
      const workspaceId = workspaces.some(item => item.workspaceId === selectedWorkspaceId) ? selectedWorkspaceId : ''
      const defaultBrief = value?.defaultTask ?? t('根据这份材料准备一份可交接的成果，简要说明重点，并按当前交付流程处理。')
      const brief = customBrief ?? defaultBrief
      const materialPath = material.trim()
      const linkedWorkspace = workspaces.find(item => item.workspaceId === value?.workspaceId)
      const materialWarning = personal && ({ changed: evidence ? '练习材料已修改。可以回看记录，或开始新的证据取舍。'
        : lesson ? '练习材料已修改。可以回看记录，或另开一局领取新的补给卡。'
        : kind === 'rematch' ? '原材料已修改，仍可回看两局记录。'
        : '材料已修改。可以回看历史结果，也可以用当前材料另开一组。',
        unavailable: '暂时无法读取材料。可以回看历史结果。' })[value?.materialState]

      async function start(arm) {
        if (starting.current || !value) return
        if (setup && workspaceForm.current) {
          const pathInput = workspaceForm.current.querySelector('input')
          pathInput.setCustomValidity(workspaceMaterialIsRelative(materialPath) ? '' : t('请输入工作区内的相对文件路径。'))
          if (!workspaceForm.current.reportValidity()) return
        }
        starting.current = true
        setLaunch(arm)
        setError('')
        const first = setup ? { workspaceId, material: materialPath, task: brief.trim() || undefined } : undefined
        const key = JSON.stringify([value.id, arm, first])
        const action = config.action + '-open'
        try {
          if (kind !== 'plans' && !launchIds.current.has(key)) {
            const bytes = crypto.getRandomValues(new Uint8Array(16))
            launchIds.current.set(key, Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''))
          }
          const opened = await request(action, { action, comparisonId: value.id, arm,
            ...(kind !== 'plans' && { launchId: launchIds.current.get(key) }), ...first }, undefined, language)
          launchIds.current.delete(key)
          onVisit(opened.sessionId, opened.task)
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setLaunch('')
        }
      }

      async function repeatLighthouseReview() {
        if (starting.current || !canRepeatLighthouseReview || !value.id) return
        const action = 'lighthouse-review-repeat'
        const key = JSON.stringify([action, value.id])
        if (!launchIds.current.has(key)) {
          const bytes = crypto.getRandomValues(new Uint8Array(16))
          launchIds.current.set(key, Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''))
        }
        starting.current = true
        setLaunch(action)
        setError('')
        try {
          const opened = await request(action, { action, comparisonId: value.id, launchId: launchIds.current.get(key) }, undefined, language)
          launchIds.current.delete(key)
          onVisit(opened.sessionId, opened.task)
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setLaunch('')
        }
      }

      async function copy() {
        try {
          await navigator.clipboard.writeText(task)
          setNotice(t(evidence ? '练习任务已复制。' : '同题任务已复制。'))
        } catch {
          taskField.current?.focus()
          taskField.current?.select()
          setNotice(t('已选中任务文字，可以手动复制。'))
        }
      }

      function switchPreview(next) {
        setError('')
        setNotice('')
        if (next && personal) {
          setWorkspaceId(value?.workspaceId ?? initialWorkspaceId ?? '')
          setMaterial('')
          setBrief(undefined)
        }
        setPrototype(next)
      }

      function refresh() {
        setError('')
        retry(value => value + 1)
      }

      function closeRetestNote() {
        returnFocus.current = `[data-retest-note="${noteTarget.arm}"]`
        setNoteTarget(null)
      }

      if (noteTarget) return h(EvidenceRetestNote, { ...noteTarget, request,
        onCancel: closeRetestNote, onSaved: plan => {
          setSavedNoteArm(noteTarget.arm)
          closeRetestNote()
          void onEvidenceNoteSaved?.(plan)
        } })
      if (reuse) return h(ComparisonLoadoutReview, { kind, comparisonId: reuse.id, arm: reuse.arm, request,
        onBack: () => {
          const preserve = reuse.evidence ? 'data-evidence-preserve' : reuse.handoff ? 'data-handoff-preserve' : undefined
          const preserveButton = preserve ? `[${preserve}="${reuse.arm}"], ` : ''
          returnFocus.current = preserveButton + `[data-reuse-arm="${reuse.arm}"], .moba-lighthouse-close`
          setReuse(null)
        }, onClose, onUse, keepEvidence: reuse.evidence, onEvidenceSaved })
      if (rematch) return h(RematchEditor, { kind, comparisonId: rematch.id, arm: rematch.arm, sourceSessionId: rematch.sessionId, request,
        lesson, evidenceReplayHint: rematch.publicEvidenceReplay, publicEvidenceReplayHint: rematch.publicEvidenceReplay,
        onBack: () => { returnFocus.current = `[data-rematch-arm="${rematch.arm}"]`; setRematch(null) }, onVisit, onClose })
      if (lessonTask) return h(LessonLoadoutTask, { source: lessonTask.lessonTaskSource, workspaces, initialWorkspaceId, request, onVisit,
        backLabel: lessonTask.fromSummary ? '返回两局实测结果' : undefined,
        onBack: () => { returnFocus.current = `[data-lesson-task-arm="${lessonTask.id}"], .moba-lighthouse-close`; setLessonTask(null) } })
      if (lessonLaunchOpen) return h(LighthouseLessonLaunch, { request, lesson: lessonMarker, onOpen: onVisit, onCancel: () => {
        returnFocus.current = '.moba-new-lesson'
        setLessonLaunchOpen(false)
      } })
      if (challengeShareId) return h(LighthouseChallengeShare, { comparisonId: challengeShareId, request, onBack: () => {
        returnFocus.current = '.moba-lighthouse-challenge-share'
        setChallengeShareId('')
      } })
      if (evidenceReport) return h(LighthouseHandoffReport, { report: { mode: evidenceReport, evidence: true },
        comparisonId: value.id, request, onOpenRepeat: (next, task) => { setEvidenceReport(''); onVisit(next, task) }, onBack: () => {
          returnFocus.current = `[data-evidence-report="${evidenceReport}"]`
          setEvidenceReport('')
        } })

      const freshLesson = practice && value?.id && h('button', { type: 'button', className: 'moba-roster-open moba-new-lesson',
        disabled: canRepeatLighthouseReview && Boolean(launch), onClick: () => setLessonLaunchOpen(true) },
        t(evidence ? '开始新的证据取舍' : '开始新的换装练习'))
      return h(InstallDialog, { title: t(comparisonTitle(kind, lessonMarker, evidenceReplay, publicEvidenceReplay)),
        className: 'moba-lighthouse-comparison' + (publicEvidenceReplay || canShareEvidenceReport ? ' moba-public-evidence-comparison' : ''),
        busy: Boolean(launch),
        onCancel: onBack ?? onClose, initialFocus: returnFocus.current || focusSelector || '.moba-lighthouse-close',
        onKeyDown: event => closeDialogOnEscape(event, () => { if (!starting.current) (onBack ?? onClose)() }) },
        !publicReviewOutcome && h('p', { className: 'moba-lighthouse-note' }, t(publicEvidenceReplay
          ? '换装局在独立的练习工作区使用同一份内置灯塔样例，只卸下证据核验。'
          : evidence
          ? '如果出现证据取舍卡，请回原会话做出选择。这里会显示实际选择和交付文件。'
          : directLesson ? '直接交付补给卡后，点「换一件再试」。把交付前复核装上，再用同一任务跑一局。'
          : kind === 'workspace'
          ? '用同一份材料试两种交付方式。进入各自会话后，用输入栏手动发送任务。'
          : evidenceReplay ? '换装局沿用原局的任务和材料，只卸下证据核验。查看两局各自记录的选择和交付文件。'
            : kind === 'rematch' ? '用原局作为基准。换装局沿用同一份材料和任务。'
            : '两边用同一段任务。进入各自会话后，用输入栏手动发送。')),
        error && h('p', { className: 'moba-alert', role: 'alert' }, error, ' ',
          h('button', { type: 'button', className: 'moba-text', disabled: Boolean(launch), onClick: refresh }, t('刷新对照'))),
        !error && value === undefined && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取对照…')),
        value === null && h('p', { className: 'moba-empty', role: 'status' }, t('找不到此会话的对照。')),
        value && h(Fragment, null,
          setup && h(WorkspaceComparisonForm, { form: workspaceForm, workspaces, workspaceId, setWorkspaceId, request,
            material, setMaterial, brief, defaultBrief, setBrief, busy: Boolean(launch) }),
          personal && value.id && h(InstallFacts, { facts: [
            ['工作区', linkedWorkspace ? workspaceTitle(linkedWorkspace) : value.workspaceTitle], ['材料文件相对路径', value.material],
            ...(evidence && scenario ? [['证据场景', t(scenario.name)]] : []),
          ].map(([label, text]) => [t(label), text]) }),
          kind === 'rematch' && h(RematchChangeFacts, { change: value.change }),
          publicReviewOutcome && h(HandoffOutcomeSummary, { outcome: publicReviewOutcome, onVisit, busy: Boolean(launch),
            onLessonTask: arm => setLessonTask({ id: arm.id, lessonTaskSource: arm.lessonTaskSource, fromSummary: true }) }),
          reviewChoiceComparison && h(ReviewChoiceComparison, { comparison: reviewChoiceComparison, onVisit, busy: Boolean(launch) }),
          previous && h(PreviousComparisonLink, { reference: previous, onOpen: onPrevious, disabled: Boolean(launch) }),
          personal && value.materialState === 'verified' && h('p', { className: 'moba-lighthouse-note' }, t('材料与本组记录的版本一致。')),
          materialWarning && h('p', { className: 'moba-alert', role: 'status' }, t(materialWarning), ' ',
            !error && h('button', { type: 'button', className: 'moba-text', onClick: refresh }, t('刷新对照'))),
          publicEvidenceReplay && evidenceSummary,
          canShareEvidenceReport && h('div', { className: 'moba-detail-actions' },
            h('button', { type: 'button', className: 'moba-roster-open', 'data-evidence-report': 'share', 'aria-haspopup': 'dialog',
              onClick: () => setEvidenceReport('share') }, t('分享本局取舍')),
            h('button', { type: 'button', className: 'moba-roster-open', 'data-evidence-report': 'compare', 'aria-haspopup': 'dialog',
              onClick: () => setEvidenceReport('compare') }, t('对照好友取舍'))),
          !setup && task && h('div', { className: 'moba-lighthouse-task' },
            h('label', null, t(evidence ? '练习任务' : lesson ? '练习共用的任务' : '两边共用的任务'),
              h('textarea', { ref: taskField, readOnly: true, value: task, rows: 4 })),
            h('button', { type: 'button', className: 'moba-roster-open', onClick: copy }, t('复制任务')),
            notice && h('p', { className: 'moba-lighthouse-note', role: 'status' }, notice)),
          evidence && value.evidenceOpeningChoice && h(EvidenceOpeningOutcome, { outcome: value.evidenceOpeningChoice }),
          handoff && h(HandoffOutcomeSummary, { outcome: handoff, busy: Boolean(launch),
            onPreserve: onUse && value.id ? arm => setReuse({ id: value.id, arm, handoff: true }) : undefined }),
          !publicEvidenceReplay && evidenceSummary,
          retestOutcome && h(EvidenceRetestOutcome, { outcome: retestOutcome, arms: value.arms,
            onViewSource: retestSource ? () => onPrevious(retestSource) : undefined,
            onEditNote: arm => setNoteTarget({ comparisonId: value.id, arm }), savedNoteArm }),
          h('div', { className: 'moba-lighthouse-arms' }, value.arms.map(arm =>
            h(ComparisonArm, { key: arm.id, arm, config: comparisonArmConfig(kind, arm.id, evidenceReplay), evidenceReplay,
              testedSource: testedSourceArm === arm.id,
              task: materialWarning ? undefined : task, sessionId,
              busy: Boolean(launch), canStart: !materialWarning && (!setup || Boolean(workspaces.length)),
              onStart: directLesson || evidence || kind === 'rematch' ? undefined : start, onVisit, putTask,
              onReuse: onUse && !publicEvidenceReplay && value.id && !evidenceOutcome?.arms.some(item => item.id === arm.id && item.canPreserve)
                ? arm => setReuse({ id: value.id, arm }) : undefined,
              onLessonTask: practice && !publicEvidenceReplay && !publicReviewOutcome?.arms.some(item => item.id === arm.id && item.lessonTaskSource)
                ? setLessonTask : undefined,
              onLighthouseEvidenceReplay: kind === 'workspace' && evidence && scenario?.id === 'gap' && value.id &&
                arm.id === evidenceArm.id && arm.status === 'complete' && arm.canReplayLighthouseEvidence === true
                ? () => setRematch({ id: value.id, arm: arm.id, sessionId: arm.sessionId, publicEvidenceReplay: true }) : undefined,
              onRematch: !evidenceReplay && canRematchComparisonArm(kind, arm) && value.id && !(lesson && materialWarning)
                ? arm => setRematch({ id: value.id, arm: arm.id, sessionId: arm.sessionId }) : undefined,
              onNotice: outcome => setNotice(t(draftNotices[outcome] ?? draftNotices.blocked)) }))),
          finished && !publicReviewOutcome && h('p', { className: 'moba-lighthouse-note', role: 'status' }, t('两次尝试已完成，可以回看实际调用和交付。')),
          canRepeatLighthouseReview && freshLesson && h('div', { className: 'moba-detail-actions' }, freshLesson)),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          canRepeatLighthouseReview && h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(launch),
            title: t('用同一套复核出装再试一局'), onClick: repeatLighthouseReview },
            t(launch === 'lighthouse-review-repeat' ? '正在准备对局…' : '复核再试一局')),
          (onBack || onHistory) && h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(launch),
            onClick: onBack ?? onHistory }, onBack ? backLabel ?? backToRunHistoryLabel() : runHistoryLabel()),
          kind === 'workspace' && evidence && value?.canShareChallenge && h('button', { type: 'button',
            className: 'moba-roster-open moba-lighthouse-challenge-share', 'aria-haspopup': 'dialog',
            onClick: () => setChallengeShareId(value.id) }, t('分享灯塔挑战')),
          !canRepeatLighthouseReview && freshLesson,
          !practice && (kind === 'workspace' || kind === 'lighthouse') && value?.id && !prototype && h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(launch),
            onClick: () => switchPreview(true) }, t('开始新的对照')),
          prototype && h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(launch),
            onClick: () => switchPreview(false) }, t('返回上次对照')),
          h('button', { type: 'button', className: 'moba-roster-open moba-lighthouse-close', disabled: Boolean(launch),
            onClick: onClose }, t(evidence ? '关闭取舍记录' : '关闭同题对照'))))
    }

    function ComparisonHistoryEntry({ item, onOpen, onSource, onReuse, onRematch, onLessonTask, onPrevious, storeFocus }) {
      const config = comparisonKinds[item.kind]
      const evidence = item.lesson === lighthouseEvidenceLesson
      const publicEvidenceReplay = item.publicEvidenceReplay === true
      const evidenceReplay = publicEvidenceReplay || item.evidenceReplay === true
      const title = item.lesson === lighthouseRematchLesson || evidence || evidenceReplay
        ? t(comparisonTitle(item.kind, item.lesson, evidenceReplay, publicEvidenceReplay))
        : item.kind === 'lighthouse' ? t('灯塔补给行动') : !item.title || item.title === config.title ? t(config.title) : item.title
      const workspace = item.workspaceTitle && workspaceTitle({ title: item.workspaceTitle })
      const scenario = evidence ? evidenceScenarios.find(option => option.id === item.scenario)?.name : config.title
      const subtitle = [scenario && t(scenario), workspace, item.material].filter(text => text && text !== title).join(' · ')
      const time = new Date(item.createdAt)
      const previous = item.kind === 'rematch' && previousComparisonIsValid(item.previous) &&
        !sameComparison({ kind: item.kind, comparisonId: item.id }, item.previous) ? item.previous : null
      return h('li', { className: 'moba-history-entry' },
        h('header', null,
          h('div', null, h('h3', null, title),
            subtitle && h('p', null, subtitle)),
          Number.isFinite(time.getTime()) && h('time', { dateTime: time.toISOString() }, reportTime(time))),
        item.kind === 'rematch' && h(RematchChangeFacts, { change: item.change }),
        h('ul', { className: 'moba-history-arms' }, item.arms.map(arm => {
          const setup = comparisonArmConfig(item.kind, arm.id, evidenceReplay)
          const label = comparisonArmName(setup, arm)
          const state = arm.pending ? 'waiting-choice' : arm.status
          const files = arm.deliverables ?? empty
          return h('li', { key: arm.id },
            h('strong', null, label),
            h('span', { className: 'moba-history-state', 'data-state': state }, t(comparisonArmStates[state] ?? state)),
            arm.heroName && h('p', null, arm.heroName),
            arm.reason && h('p', null, t(comparisonArmReasons[arm.reason] ?? arm.reason)),
            arm.continuationReason && h('p', null, t('续答后的材料或阵容无法核对。请到原会话查看后续结果。')),
            arm.choices?.length > 0 && h('p', null, t('你实际选择了 ') + arm.choices.join(' / ')),
            files.length > 0 && h('p', null, t('交付文件') + ' · ' + files.map(file => file.name).join(' / ')),
            h('div', { className: 'moba-history-actions' },
              arm.lessonTaskSource && h('button', {
                type: 'button', className: 'moba-text', ref: node => storeFocus('lesson-task:' + arm.id, node),
                onClick: () => onLessonTask(item, arm), 'aria-label': t(lessonTaskLabel) + ' · ' + label }, t(lessonTaskLabel)),
              arm.sessionId && h('button', { type: 'button', className: 'moba-text', onClick: () => onSource(arm.sessionId),
                'aria-label': t('查看原会话') + ' · ' + label }, t('查看原会话')),
              !evidenceReplay && canRematchComparisonArm(item.kind, arm) && h('button', {
                type: 'button', className: 'moba-text', ref: node => storeFocus('rematch:' + arm.id, node),
                onClick: () => onRematch(item, arm), 'aria-label': t('换一件再试') + ' · ' + label }, t('换一件再试')),
              !publicEvidenceReplay && arm.canReuse && h('button', { type: 'button', className: 'moba-text', ref: node => storeFocus(arm.id, node),
                onClick: () => onReuse(item, arm.id), 'aria-label': t('核对并复用出装') + ' · ' + label }, t('核对并复用出装'))))
        })),
        h('div', { className: 'moba-history-card-actions' },
          previous && h(PreviousComparisonLink, { reference: previous, onOpen: () => onPrevious(item), buttonRef: node => storeFocus('previous', node) }),
          h('button', { type: 'button', className: 'moba-roster-open', ref: node => storeFocus('board', node),
            onClick: () => onOpen(item) }, t(evidence ? '查看取舍记录' : '查看对照'), h(Glyph, { kind: 'arrow', size: 15 }))))
    }

    function ComparisonHistory({ request, workspaces, initialWorkspaceId, onClose, onSource, onVisit, onUse, onEvidenceSaved, onEvidenceNoteSaved,
      initialKind = 'all', scope }) {
      const language = useLanguage()
      const [query, setQuery] = useState('')
      const [kind, setKind] = useState(initialKind)
      const [outcome, setOutcome] = useState('all')
      const [state, setState] = useState(null)
      const [page, setPage] = useState(null)
      const [attempt, retry] = useState(0)
      const [selection, setSelection] = useState(null)
      const focus = useRef(new Map())
      const term = query.trim()
      const evidenceHistory = scope === evidenceReplayScope
      const key = JSON.stringify([term, kind, outcome, scope, language])
      const before = page?.key === key ? page.before : undefined
      const current = state?.key === key ? state : undefined
      const loading = !current || current.cursor !== before || current.attempt !== attempt
      const filters = {
        kind: [['all', '全部对照'], ['rematch', comparisonKinds.rematch.title], ['plans', comparisonKinds.plans.title], ['workspace', comparisonKinds.workspace.title],
          ['lighthouse', comparisonKinds.lighthouse.title]],
        outcome: [['all', '全部结果'], ['delivered', '有交付文件'], ['decisions', '有用户选择']],
      }

      useEffect(() => {
        const abort = new AbortController()
        const action = 'comparison-history'
        const timer = setTimeout(async () => {
          try {
            const value = await request(action, { action, query: term, before,
              ...(evidenceHistory ? { scope } : { kind, outcome }) }, abort.signal, language)
            if (abort.signal.aborted) return
            setState(previous => {
              const rows = before && previous?.key === key ? previous.items : empty
              const byId = new Map([...rows, ...value.items].map(item => [item.kind + ':' + item.id, item]))
              return { key, items: [...byId.values()], before: value.before, cursor: before, attempt }
            })
          } catch (reason) {
            if (!abort.signal.aborted) setState(previous => ({ key, items: previous?.key === key ? previous.items : empty,
              before: previous?.key === key ? previous.before : undefined, cursor: before, attempt, error: reason.message }))
          }
        }, term && !before ? 180 : 0)
        return () => { abort.abort(); clearTimeout(timer) }
      }, [request, key, term, kind, outcome, scope, evidenceHistory, before, attempt, language])

      function select(item, arm) {
        setSelection({ id: item.id, kind: item.kind, arm, lesson: item.lesson, evidenceReplay: item.evidenceReplay,
          publicEvidenceReplay: item.publicEvidenceReplay })
      }

      function selectRematch(item, arm) {
        setSelection({ id: item.id, kind: item.kind, arm: arm.id, sessionId: arm.sessionId, rematch: true, lesson: item.lesson })
      }

      function selectLessonTask(item, arm) {
        setSelection({ id: item.id, kind: item.kind, arm: arm.id, lessonTaskSource: arm.lessonTaskSource })
      }

      function selectPrevious(item) {
        setSelection({ id: item.id, kind: item.kind, previous: item.previous, lesson: item.lesson,
          evidenceReplay: item.evidenceReplay, publicEvidenceReplay: item.publicEvidenceReplay })
      }

      function back() {
        const action = selection.lessonTaskSource ? 'lesson-task:' + selection.arm
          : selection.rematch ? 'rematch:' + selection.arm : selection.previous ? 'previous' : selection.arm ?? 'board'
        const target = [selection.kind, selection.id, action].join(':')
        setSelection(null)
        requestAnimationFrame(() => focus.current.get(target)?.focus())
      }

      if (selection?.rematch) return h(RematchEditor, { kind: selection.kind, comparisonId: selection.id, arm: selection.arm,
        sourceSessionId: selection.sessionId, request, lesson: selection.lesson === lighthouseRematchLesson, onBack: back, onClose, onVisit })
      if (selection?.lessonTaskSource) return h(LessonLoadoutTask, { source: selection.lessonTaskSource, workspaces,
        initialWorkspaceId, request, onBack: back, onVisit })
      if (selection?.arm) return h(ComparisonLoadoutReview, { kind: selection.kind, comparisonId: selection.id,
        arm: selection.arm, request, onBack: back, onClose, onUse })
      if (selection) return h(RunComparison, { kind: selection.kind, comparisonId: selection.id, request,
        workspaces, initialWorkspaceId, initialPrevious: selection.previous, lessonHint: selection.lesson,
        evidenceReplayHint: selection.evidenceReplay, publicEvidenceReplayHint: selection.publicEvidenceReplay, onBack: back,
        backLabel: evidenceHistory ? t('返回证据换装记录') : undefined, onClose, onVisit, onUse, onEvidenceSaved, onEvidenceNoteSaved })

      return h(InstallDialog, { title: evidenceHistory ? t('证据换装记录') : runHistoryLabel(),
        className: 'moba-lighthouse-comparison moba-comparison-history',
        onCancel: onClose, initialFocus: '.moba-comparison-history-query', onKeyDown: event => closeDialogOnEscape(event, onClose) },
        h('div', { className: 'moba-history-filters' },
          h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 17 }),
            h('input', { className: 'moba-comparison-history-query', type: 'search', maxLength: 200, value: query,
              'aria-label': t(evidenceHistory ? '搜索证据换装记录' : '搜索实战记录'), placeholder: t('搜索任务、材料或工作区'),
              onChange: event => { setQuery(event.target.value); setPage(null) } })),
          !evidenceHistory && h('label', null, t('对照类型'), h('select', { value: kind,
            onChange: event => { setKind(event.target.value); setPage(null) } },
            filters.kind.map(([id, name]) => h('option', { key: id, value: id }, t(name))))),
          !evidenceHistory && h('label', null, t('结果筛选'), h('select', { value: outcome,
            onChange: event => { setOutcome(event.target.value); setPage(null) } },
            filters.outcome.map(([id, name]) => h('option', { key: id, value: id }, t(name)))))),
        current?.items.length > 0 && h('ul', { className: 'moba-history-list' }, current.items.map(item =>
          h(ComparisonHistoryEntry, { key: item.kind + ':' + item.id, item, onOpen: select, onReuse: select, onRematch: selectRematch,
            onPrevious: selectPrevious, onLessonTask: selectLessonTask,
            onSource, storeFocus: (arm, node) => {
              const id = [item.kind, item.id, arm].join(':')
              if (node) focus.current.set(id, node)
              else focus.current.delete(id)
            } }))),
        loading ? h('p', { className: 'moba-empty', role: 'status' }, t('正在读取同题对照记录…'))
          : current.error ? h('p', { className: 'moba-alert', role: 'alert' }, current.error, ' ',
            h('button', { type: 'button', className: 'moba-text', onClick: () => retry(value => value + 1) }, t('重试')))
            : !current.items.length && h('p', { className: 'moba-empty', role: 'status' }, t(current.before
              ? '这页没有匹配项，仍有更早的记录可查。'
              : evidenceHistory && !term ? '还没有已完成的证据换装对照。'
                : term || kind !== 'all' || outcome !== 'all' ? '没有符合条件的对照。' : '还没有同题对照记录。')),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          current?.before && (loading || current.before !== before) && h('button', { type: 'button', className: 'moba-roster-open',
            disabled: loading || Boolean(current.error), onClick: () => setPage({ key, before: current.before }) }, t('加载更多记录')),
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onClose }, t('关闭'))))
    }

    const lighthouseDraftsLabel = '继续未发送的灯塔对局'

    function LighthousePendingRuns({ request, onClose, onOpen }) {
      const language = useLanguage()
      const [page, setPage] = useState({})
      const [loaded, setLoaded] = useState(null)
      const rows = loaded?.items ?? empty
      const loading = loaded?.page !== page || loaded?.language !== language
      const error = !loading && loaded.error
      const invalidCursor = page.before && error === t('找不到这页待发送的灯塔对局。')
      const before = loaded?.before
      const canLoadOlder = Boolean(before && before !== page.before)
      const listRef = useRef(null)

      useEffect(() => {
        const abort = new AbortController()
        const action = 'lighthouse-pending-runs'
        request(action, { action, ...(page.before && { before: page.before }) }, abort.signal, language)
          .then(value => {
            if (abort.signal.aborted) return
            setLoaded(previous => {
              const existing = page.before ? previous?.items ?? empty : empty
              const items = new Map([...existing, ...value.items].map(item => [item.sessionId, item]))
              return { page, language, items: [...items.values()], before: value.before }
            })
          })
          .catch(reason => {
            if (!abort.signal.aborted) setLoaded(previous => ({
              ...previous, page, language, error: reason.message || t('暂时无法读取灯塔草稿。'),
            }))
          })
        return () => abort.abort()
      }, [page, language, request])

      function loadOlder() {
        if (loading || error || !canLoadOlder) return
        listRef.current?.focus()
        setPage({ before })
      }

      return h(InstallDialog, { title: t(lighthouseDraftsLabel), className: 'moba-lighthouse-comparison',
        onCancel: onClose, initialFocus: '.moba-pending-runs-list', onKeyDown: event => closeDialogOnEscape(event, onClose) },
        h('div', { className: 'moba-pending-runs-list', tabIndex: -1, ref: listRef },
          rows.length > 0 && h('ul', { className: 'moba-history-list' }, rows.map(item => {
            const evidence = item.kind === 'evidence'
            const hero = evidence ? undefined : heroTrialHeroes.find(option => option.id === item.arm)
            const detail = evidence ? evidenceScenarios.find(option => option.id === item.scenario)
              : heroTrialNeeds.find(option => option.id === item.need)
            const title = evidence ? t('灯塔证据取舍') : [t(heroTrialTitle), hero && t(hero.name)].filter(Boolean).join(' · ')
            const time = new Date(item.createdAt)
            const timeLabel = Number.isFinite(time.getTime()) ? reportTime(time) : ''
            const detailLabel = [detail && t(detail.name), item.presetChanged && t('原出装已变化')].filter(Boolean).join(' · ')
            const openLabel = t('打开草稿')
            return h('li', { className: 'moba-history-entry', key: item.sessionId },
              h('header', null, h('div', null, h('h3', null, title), detailLabel && h('p', null, detailLabel)),
                timeLabel && h('time', { dateTime: time.toISOString() }, timeLabel)),
              h('div', { className: 'moba-history-card-actions' },
                h('button', { type: 'button', className: 'moba-roster-open',
                  'aria-label': [openLabel, title, detailLabel, timeLabel].filter(Boolean).join(' · '),
                  onClick: () => onOpen(item.sessionId) }, openLabel)))
          })),
          loading ? h('p', { className: 'moba-empty', role: 'status' }, t('正在读取灯塔草稿…'))
            : error ? h('p', { className: 'moba-alert', role: 'alert' }, error, ' ',
              h('button', { type: 'button', className: 'moba-text', onClick: () => {
                listRef.current?.focus()
                setPage(invalidCursor ? {} : { ...page })
              } }, t(invalidCursor ? '从第一页重新读取' : '重试')))
              : !rows.length && h('p', { className: 'moba-empty', role: 'status' }, t(canLoadOlder
                ? '这页没有匹配项，仍有更早的记录可查。' : '没有未发送的灯塔对局。'))),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          canLoadOlder && !error && h('button', { type: 'button', className: 'moba-roster-open', disabled: loading,
            onClick: loadOlder }, t('加载更多记录')),
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onClose }, t('关闭'))))
    }

    function RematchEditor({ kind, comparisonId, arm, sourceSessionId, request, lesson, evidenceReplayHint, publicEvidenceReplayHint, guidedReview,
      backLabel = '返回记录', onBack, onClose, onVisit }) {
      const language = useLanguage()
      const [loaded, setLoaded] = useState(null)
      const [attempt, retry] = useState(0)
      const [mode, setMode] = useState('')
      const [removeId, setRemoveId] = useState('')
      const [addId, setAddId] = useState()
      const [sourceId, setSourceId] = useState('')
      const [gearQuery, setGearQuery] = useState('')
      const [checked, setChecked] = useState(null)
      const [working, setWorking] = useState('')
      const [error, setError] = useState('')
      const [needsRefresh, setNeedsRefresh] = useState(false)
      const pending = useRef(null)
      const launch = useRef(null)
      const modeField = useRef(null)
      const suggestionButton = useRef(null)
      const returnToSuggestion = useRef(false)
      const reviewHeading = useRef(null)
      const options = loaded?.value
      const preview = checked?.value
      const evidenceReplay = options?.evidenceReplay ?? evidenceReplayHint
      const publicEvidenceReplay = preview?.publicEvidenceReplay ?? options?.publicEvidenceReplay ?? publicEvidenceReplayHint
      const reading = !loaded || loaded.attempt !== attempt || loaded.language !== language
      const equipped = options?.equipped ?? empty
      const available = options?.available ?? empty
      const equippedById = new Map(equipped.map(item => [item.id, item]))
      const additions = available.filter(item => !equippedById.has(item.id))
      const suggested = additions.find(item => item.id === options?.suggestedGearId)
      const guidedGearReady = suggested?.id === 'review'
      const { addId: suggestedAddition, removeId: suggestedRemoval } = options?.personalSuggestedChange ?? emptyMap
      const originalChoices = options?.baseline?.choices ?? empty
      const addReview = !evidenceReplay && kind === 'personal' && suggestedAddition === 'review' && suggestedRemoval === undefined &&
        additions.some(item => item.id === 'review')
      const removeReview = !evidenceReplay && (kind === 'personal' || kind === 'rematch' && arm === 'rematch') && suggestedRemoval === 'review' &&
        suggestedAddition === undefined && equippedById.has('review') && originalChoices.length > 0 && Boolean(options?.material)
      const suggestionLabel = addReview ? '试试交付前复核' : removeReview ? '试试直接交付' : undefined
      const swaps = equipped.length > 0 && (additions.length > 0 || available.some(item =>
        equippedById.has(item.id) && item.sources?.some(source => source.id !== equippedById.get(item.id).sourceId)))
      const operation = mode || (additions.length > 0 ? 'add' : equipped.length > 0 ? 'remove' : 'add')
      const removed = operation !== 'add' ? equippedById.get(removeId) : undefined
      const addChoices = operation === 'swap' && removed ? available.filter(item => !equippedById.has(item.id) ||
        item.id === removed.id && item.sources?.some(source => source.id !== removed.sourceId)) : additions
      const requestedAddId = addId ?? (operation === 'add' ? suggested?.id : undefined)
      const added = operation !== 'remove' ? addChoices.find(item => item.id === requestedAddId) : undefined
      const canChooseAddition = operation === 'add' || operation === 'swap' && Boolean(removed)
      const words = gearQuery.normalize('NFKC').toLowerCase().trim().split(/\s+/u).filter(Boolean)
      const matchingAddChoices = words.length ? addChoices.filter(item => {
        const searchable = [item.name, item.summary, ...(item.searchTerms ?? empty)].join(' ').normalize('NFKC').toLowerCase()
        return words.every(word => searchable.includes(word))
      }) : addChoices
      const visibleAddChoices = added && !matchingAddChoices.includes(added) ? [added, ...matchingAddChoices] : matchingAddChoices
      const sources = (added?.sources ?? empty).filter(source => added.id !== removed?.id || source.id !== removed.sourceId)
      const selectedSource = sources.find(source => source.id === sourceId) ?? (sources.length === 1 ? sources[0] : undefined)
      const readyToReview = options && !reading && !loaded?.error && !working && !needsRefresh
      const canReview = Boolean(readyToReview && (guidedReview ? guidedGearReady : evidenceReplay ? options.evidenceReplay === true
        : (operation === 'add' || removed) && (operation === 'remove' || added && (!sources.length || selectedSource))))
      const source = options?.baseline?.sessionId ?? sourceSessionId
      const baseline = preview?.baseline ?? options?.baseline
      const originalArm = comparisonKinds[kind]?.arms.find(item => item.id === arm)
      const baselineName = [baseline?.planName ?? t(originalArm?.name ?? '原局'), baseline?.heroName].filter(Boolean).join(' · ')
      const baselineChange = rematchChangeSummary(baseline?.change)
      const originalItem = preview?.change.removed && equippedById.get(preview.change.removed.id)
      const changeFacts = preview && { ...preview.change, removed: preview.change.removed &&
        { ...preview.change.removed, sourceName: preview.change.removed.sourceName ?? originalItem?.sourceName } }
      const originalFiles = options?.baseline?.deliverables ?? empty
      const retainedPreview = equippedById.get('present')

      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => {
        const abort = new AbortController()
        const action = 'rematch-comparison-options'
        request(action, { action, kind, comparisonId, arm }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setLoaded({ value, attempt, language }) })
          .catch(reason => {
            if (!abort.signal.aborted) setLoaded(current => ({ value: current?.value, error: reason.message, attempt, language }))
          })
        return () => abort.abort()
      }, [request, kind, comparisonId, arm, attempt, language])
      useEffect(() => {
        if (preview) reviewHeading.current?.focus()
        else if (options) {
          const suggestion = (evidenceReplay || guidedReview || returnToSuggestion.current) && suggestionButton.current
          const target = suggestion && !suggestion.disabled ? suggestion : modeField.current
          target?.focus()
          returnToSuggestion.current = false
        }
      }, [preview, options, evidenceReplay, guidedReview])

      function edit() {
        if (pending.current) return
        returnToSuggestion.current = checked?.viaSuggestion === true
        setChecked(null)
        if (!needsRefresh) setError('')
      }

      function refresh() {
        if (pending.current) return
        edit()
        setError('')
        setNeedsRefresh(false)
        retry(value => value + 1)
      }

      async function previewChange(change, viaSuggestion = false) {
        if (pending.current) return
        const abort = pending.current = new AbortController()
        const action = 'rematch-comparison-preview'
        setWorking('review')
        setError('')
        try {
          const value = await request(action, { action, kind, comparisonId, arm, change }, abort.signal, language)
          if (!abort.signal.aborted) setChecked({ value, change, language, viaSuggestion })
        } catch (reason) {
          if (!abort.signal.aborted) {
            setError(reason.message)
            if (viaSuggestion) setNeedsRefresh(true)
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setWorking('')
        }
      }

      function review() {
        if (!canReview) return
        if (guidedReview) return previewChange({ addId: 'review' }, true)
        if (evidenceReplay) return previewChange({ removeId: 'evidence' }, true)
        return previewChange({ ...(removed && { removeId: removed.id }), ...(added && { addId: added.id }),
          ...(selectedSource && { sourceId: selectedSource.id }) })
      }

      function previewSuggestion() {
        if (!suggestionLabel || !readyToReview || pending.current) return
        if (removeReview) {
          setMode('remove')
          setRemoveId('review')
          return previewChange({ removeId: 'review' }, true)
        }
        setMode('add')
        setRemoveId('')
        setAddId('review')
        setSourceId('')
        return previewChange({ addId: 'review' }, true)
      }

      async function open() {
        if (pending.current || !preview?.token || needsRefresh || reading || loaded?.error) return
        const action = 'rematch-comparison-open'
        const { change, language: reviewLanguage } = checked
        const key = JSON.stringify(change)
        if (launch.current?.key !== key) {
          const bytes = crypto.getRandomValues(new Uint8Array(16))
          launch.current = { key, id: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') }
        }
        const abort = pending.current = new AbortController()
        setWorking('open')
        setError('')
        let opened
        try {
          opened = await request(action, { action, kind, comparisonId, arm, change, token: preview.token,
            launchId: launch.current.id }, abort.signal, reviewLanguage)
        } catch (reason) {
          if (!abort.signal.aborted) {
            setError(reason.message)
            setNeedsRefresh(true)
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setWorking('')
        }
        if (!abort.signal.aborted && opened) onVisit(opened.sessionId, opened.task)
      }

      const failed = !reading && loaded?.error || error ||
        (!reading && guidedReview && !guidedGearReady ? t('这局暂时无法加装交付前复核。') : '')
      const recoveryFocus = failed && kind === 'personal' && !evidenceReplay ? 'rebaseline' : undefined
      const returnStep = () => { if (working !== 'open') preview ? edit() : onBack(recoveryFocus) }
      return h(InstallDialog, { title: t(guidedReview ? '试试交付前复核' : publicEvidenceReplay ? lighthouseEvidenceReplayLabel : '换一件再试'),
        className: 'moba-lighthouse-comparison moba-rematch-editor',
        busy: working === 'open', onCancel: returnStep, initialFocus: '.moba-rematch-back', onKeyDown: event => closeDialogOnEscape(event, returnStep) },
        guidedReview && !preview && h('p', { className: 'moba-lighthouse-note' },
          t('同一份材料、同一段任务，只加装交付前复核。试试确认交付或退回修改。')),
        options && h(Fragment, null,
          h(InstallFacts, { facts: [[t('原局'), baselineName], [t(publicEvidenceReplay ? '原局工作区' : '工作区'),
            options.workspaceTitle === 'default-workspace' ? t('默认工作区') : options.workspaceTitle],
            [t('材料文件相对路径'), options.material], [t('基准局的换装'), baselineChange]] }),
          publicEvidenceReplay && h('p', { className: 'moba-lighthouse-note' }, t('换装局在独立的练习工作区使用同一份内置灯塔样例，只卸下证据核验。')),
          (!guidedReview || preview) && h('div', { className: 'moba-lighthouse-task' },
            h('label', null, t('两边共用的任务'), h('textarea', { readOnly: true, rows: 4, value: preview?.task ?? options.task }))),
          evidenceReplay && h('div', { className: 'moba-lighthouse-arm' },
            h(InstallFacts, { facts: [
              [t('原局实际选择'), originalChoices.join(' / ')],
              [t('原局交付文件'), originalFiles.map(file => file.name).join(' / ')],
              !preview && [t('卸下的装备'), t('证据核验')],
              [t('保留的装备'), rematchGearName(retainedPreview) ?? t('交付物预览')],
            ].filter(Boolean) })),
          !preview && !reading && !loaded?.error && !needsRefresh && suggestionLabel &&
            h('aside', { className: 'moba-lighthouse-arm', 'aria-label': t(suggestionLabel) },
              h('p', { className: 'moba-lighthouse-note' }, h('strong', null, t('原局已交付') + ' · ' + options.material), ' ',
                removeReview ? t('你实际选择了 ') + originalChoices.join(' / ') : t('可以先看草稿，再决定确认交付或退回修改。')),
              removeReview && h('p', { className: 'moba-lighthouse-note' }, t('卸下交付前复核，用同一任务试试直接交付。')),
              h('div', null, h('button', { type: 'button', ref: suggestionButton, className: 'moba-roster-open',
                disabled: !readyToReview, onClick: previewSuggestion }, t(suggestionLabel), h(Glyph, { kind: 'arrow', size: 15 })))),
          preview ? h(Fragment, null,
            h('h3', { ref: reviewHeading, tabIndex: -1 }, t('核对换装')),
            h(RematchChangeFacts, { change: changeFacts }),
            h(SharedPlanCapabilities, { comparison: preview.comparison, title: '从原局到换装局的变化', showEmpty: true }),
            h('p', { className: 'moba-lighthouse-note' }, t('打开新会话后，由你检查并手动发送这段任务。')))
            : !evidenceReplay && !guidedReview && h('fieldset', { className: 'moba-rematch-fields', disabled: reading || Boolean(working) || Boolean(loaded?.error) },
              h('legend', null, t('只调整一个装备位')),
              h('label', null, t('调整方式'), h('select', { ref: modeField, value: operation, onChange: event => setMode(event.target.value) },
                h('option', { value: 'add', disabled: !additions.length }, t('加装一件装备')),
                h('option', { value: 'remove', disabled: !equipped.length }, t('卸下一件装备')),
                h('option', { value: 'swap', disabled: !swaps }, t('替换一件装备')))),
              operation !== 'add' && h('label', null, t('卸下的装备'), h('select', { value: removed?.id ?? '', onChange: event => setRemoveId(event.target.value) },
                h('option', { value: '' }, t('选择要卸下的装备')),
                equipped.map(item => h('option', { key: item.id, value: item.id },
                  [item.name, item.sourceName, item.included && t('自带装备')].filter(Boolean).join(' · '))))),
              canChooseAddition && addChoices.length > 0 && h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 15 }),
                h('input', { type: 'search', value: gearQuery, maxLength: 96, placeholder: t('按名称或用途搜索装备'),
                  'aria-label': t('按名称或用途搜索装备'), onChange: event => setGearQuery(event.target.value),
                  onKeyDown: event => {
                    if (event.key !== 'Escape' || !gearQuery && !event.nativeEvent.isComposing) return
                    event.stopPropagation()
                    if (event.nativeEvent.isComposing) return
                    event.preventDefault()
                    setGearQuery('')
                  } })),
              canChooseAddition && words.length > 0 && addChoices.length > 0 && !matchingAddChoices.length &&
                h('p', { className: 'moba-lighthouse-note', role: 'status' },
                  t(added ? '没有匹配的装备。已保留当前选择。' : '没有匹配的装备。')),
              canChooseAddition && !addChoices.length && equipped.length > 0 &&
                h('p', { className: 'moba-lighthouse-note', role: 'status' }, t('这次换装没有可加装的装备。')),
              operation !== 'remove' && h('label', null, t('装上的装备'), h('select', { value: added?.id ?? '',
                disabled: !canChooseAddition || !visibleAddChoices.length, onChange: event => { setAddId(event.target.value); setSourceId('') } },
                h('option', { value: '' }, t('选择要装上的装备')),
                visibleAddChoices.map(item => h('option', { key: item.id, value: item.id }, item === suggested
                  ? item.name + ' · ' + t('练习推荐') : item.name)))),
              sources.length > 0 && h('label', null, t('装备来源'), h('select', { value: selectedSource?.id ?? '',
                onChange: event => setSourceId(event.target.value) },
              sources.length > 1 && h('option', { value: '' }, t('选择一个明确的装备来源')),
              sources.map(item => h('option', { key: item.id, value: item.id }, item.name ?? item.id)))),
              added?.summary && h('p', { className: 'moba-lighthouse-note' }, added.summary),
              !additions.length && !equipped.length && h('p', { className: 'moba-lighthouse-note' }, t('当前没有可调整的装备。')))),
        (reading || working) && h('p', { className: 'moba-empty', role: 'status' }, t(working === 'open' ? '正在准备对局…'
          : working === 'review' ? '正在核对换装…' : '正在读取换装选项…')),
        failed && h(Fragment, null, h('p', { className: 'moba-alert', role: 'alert' }, failed),
          !guidedReview && h('p', { className: 'moba-lighthouse-note' }, t(publicEvidenceReplay
            ? '可以回到练习记录，另开一局缺证练习。'
            : evidenceReplay
            ? '如果原材料已变化，可恢复原文件后重试，或用当前文件开启新的证据核验任务。'
            : kind === 'personal'
            ? '如果材料已移动或修改，可返回任务结果，用当前材料重跑原局。'
            : lesson ? '若练习材料已移动或修改，返回记录后可以另开一局。'
              : '若材料已移动或修改，可恢复原文件后重试，也可用新材料建立新对照。'))),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-roster-open moba-rematch-back', disabled: Boolean(working),
            onClick: returnStep }, t(preview ? guidedReview ? '返回交付前复核' : evidenceReplay ? '返回单件换装' : '返回修改换装' : backLabel)),
          source && !guidedReview && h('button', { type: 'button', className: 'moba-roster-open', disabled: working === 'open',
            onClick: () => onVisit(source) }, t('查看原会话')),
          failed && h('button', { type: 'button', className: 'moba-roster-open', disabled: Boolean(working) || reading,
            onClick: refresh }, t('重新读取换装选项')),
          preview ? h('button', { type: 'button', className: 'moba-start', disabled: !preview.token || Boolean(working) || needsRefresh || reading || Boolean(loaded?.error),
            onClick: open }, t('打开换装会话'), h(Glyph, { kind: 'arrow', size: 16 }))
            : h('button', { type: 'button', ref: evidenceReplay || guidedReview ? suggestionButton : undefined, className: 'moba-start',
              disabled: !canReview, onClick: review },
            t(guidedReview ? '预览交付前复核' : evidenceReplay ? '核对卸下证据核验' : '核对换装'), h(Glyph, { kind: 'arrow', size: 16 })),
          preview && h('button', { type: 'button', className: 'moba-roster-open', disabled: working === 'open',
            onClick: () => onClose(recoveryFocus) }, t('关闭'))))
    }

    function ComparisonLoadoutReview({ kind, comparisonId, arm, request, onBack, onClose, onUse, keepEvidence, onEvidenceSaved }) {
      const language = useLanguage()
      const [state, setState] = useState(null)
      const [attempt, retry] = useState(0)
      const [naming, setNaming] = useState(false)
      const [savedName, setSavedName] = useState('')
      const saveButton = useRef(null)
      const action = 'comparison-loadout-preview'
      const config = comparisonArmConfig(kind, arm, keepEvidence)
      const key = JSON.stringify([kind, comparisonId, arm, language, attempt])
      const current = state?.key === key ? state : undefined
      const value = current?.value
      const recordedChoices = new Set(value?.entries?.flatMap(entry => entry.choices ?? empty))
      const otherChoices = value?.choices?.filter(choice => !recordedChoices.has(choice)) ?? empty
      const gearTitle = t(value?.draft ? '已验证的原出装' : '原出装记录')

      useEffect(() => {
        const abort = new AbortController()
        request(action, { action, kind, comparisonId, arm }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setState({ key, value }) })
          .catch(reason => { if (!abort.signal.aborted) setState({ key, error: reason.message }) })
        return () => abort.abort()
      }, [request, key, kind, comparisonId, arm, language])

      function closeNaming() {
        setNaming(false)
        requestAnimationFrame(() => saveButton.current?.focus())
      }

      async function evidenceSaved(_mode, plan) {
        setSavedName(plan.name)
        await onEvidenceSaved?.(plan)
      }

      return h(Fragment, null, h(InstallDialog, { title: t(keepEvidence ? '核对要保留的出装' : '核对并复用出装'),
        className: 'moba-lighthouse-comparison moba-history-reuse',
        onCancel: onBack, initialFocus: '.moba-history-reuse-back', onKeyDown: event => closeDialogOnEscape(event, onBack) },
        !current && h('p', { className: 'moba-empty', role: 'status' }, t('正在核对本回合出装…')),
        current?.error && h('p', { className: 'moba-alert', role: 'alert' }, current.error, ' ',
          h('button', { type: 'button', className: 'moba-text', onClick: () => retry(attempt => attempt + 1) }, t('重试'))),
        value && h(Fragment, null,
          value.hero && h('div', { className: 'moba-proven-hero' },
            h(HeroArt, { ...value.hero, className: 'moba-match-plan-portrait' }),
            h('div', null, h('strong', null, value.hero.name), h('p', null, comparisonArmName(config, value)))),
          value.gear?.length > 0 && h('section', { className: 'moba-history-gear', 'aria-label': gearTitle },
            h('h3', null, gearTitle),
            h('ul', null, value.gear.map(item => h('li', { key: item.id }, h(ItemArt, { item }),
              h('div', null, h('strong', null, item.name),
                item.sourceName && h('small', null, t('原来源 ') + item.sourceName)))))),
          h(ObservedComparisonCalls, { entries: value.entries }),
          otherChoices.length > 0 && h('p', { className: 'moba-lighthouse-note' }, t('你实际选择了 ') + otherChoices.join(' / ')),
          value.deliverables?.length > 0 && h('div', { className: 'moba-lighthouse-artifacts' },
            h('h4', null, t('已交付的文件')), h('ul', null, value.deliverables.map((item, index) => h('li', { key: index }, item.name)))),
          value.reason && h('p', { className: 'moba-alert', role: 'status' }, t(value.reason)),
          value.draft && h(Fragment, null,
            h(SharedPlanCapabilities, { comparison: value.comparison }),
            h('p', { className: 'moba-lighthouse-note' }, t(keepEvidence ? '给这套出装命名，之后可从出装方案用它开新任务。'
              : '复用会替换大厅的出装草稿。你可以在开局前检查或调整。')))),
        savedName && h('p', { className: 'moba-lighthouse-note', role: 'status' },
          t('已保存为出装方案「%s」。').replace('%s', () => savedName)),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-roster-open moba-history-reuse-back', onClick: onBack }, t('返回')),
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onClose }, t('关闭')),
          !keepEvidence && h('button', { type: 'button', className: 'moba-roster-open', disabled: !value?.draft,
            onClick: () => onUse(value, false) }, t('试装复练')),
          h('button', { type: 'button', ref: saveButton, className: 'moba-start', disabled: !value?.draft,
            onClick: () => keepEvidence ? setNaming(true) : onUse(value, true) }, t('保存为方案')))),
        keepEvidence && naming && value?.draft && h(BuildPlans, { initialMode: 'create', request, draft: value.draft, canSave: true,
          plans: empty, current: { hero: value.hero, items: value.gear ?? empty, removed: value.removed ?? empty },
          evidenceSave: { comparisonId, arm }, onChanged: evidenceSaved, onClose: closeNaming }))
    }

    function LocalCopyButton({ text, label, fieldLabel, copiedNotice, manualNotice, backLabel }) {
      const [copied, setCopied] = useState(false)
      const [showCode, setShowCode] = useState(false)
      const trigger = useRef(null)

      async function copy() {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          setCopied(false)
          setShowCode(true)
        }
      }

      function close() {
        setShowCode(false)
        requestAnimationFrame(() => trigger.current?.focus())
      }

      return h(Fragment, null,
        h('button', { ref: trigger, type: 'button', className: 'moba-settlement-button',
          onClick: copy }, t(label)),
        copied && h('span', { role: 'status' }, t(copiedNotice)),
        showCode && h(InstallDialog, { title: t(label), className: 'moba-lighthouse-comparison moba-starter-dialog',
          onCancel: close, initialFocus: '.moba-share-code', onKeyDown: event => closeDialogOnEscape(event, close) },
          h('div', { className: 'moba-plan-fields moba-share-fields' },
            h('label', null, t(fieldLabel), h('textarea', { className: 'moba-share-code', readOnly: true,
              value: text, rows: 3, spellCheck: false, onFocus: event => event.currentTarget.select() })),
            h('p', { role: 'status' }, t(manualNotice))),
          h('div', { className: 'moba-market-actions' },
            h('button', { type: 'button', className: 'moba-roster-open', onClick: close }, t(backLabel)))))
    }

    const unavailableDraftStore = { subscribe: () => () => {}, getSnapshot: () => null }

    function ChallengeTaskDraft({ task, sessionId, draftStore, putTask, backLabel, presetChanged }) {
      const store = useMemo(() => {
        const state = draftStore(sessionId)
        return state ? { subscribe: state.subscribe.bind(state), getSnapshot: state.getSnapshot.bind(state) } : unavailableDraftStore
      }, [draftStore, sessionId])
      const draft = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const [fillBlocked, setFillBlocked] = useState(false)
      if (draft && ['adjudicating', 'submitting', 'sending'].includes(draft.phase)) return null
      const changed = draft && (draft.attachmentIds?.length || draft.occurrences?.length || draft.phase === 'claimed')
      const presetNotice = presetChanged && t('原出装已变化。这局无法按原挑战核验。')
      if (!changed && draft?.draft === task) return h('p', { role: 'status' }, presetNotice || t('原任务已就绪。请手动发送以记录本局。'))
      if (!changed && draft?.draft === '' && !fillBlocked) return h('div', { className: 'moba-task-pending' },
        h('p', { role: 'status' }, t('填入原任务后，再手动发送。'), presetNotice && ' ' + presetNotice),
        h('button', { type: 'button', className: 'moba-settlement-button',
          onClick: () => setFillBlocked(putTask(sessionId, task) === 'blocked') }, t('填入原任务')))
      return h('div', { className: 'moba-task-pending' },
        h('p', { role: 'status' }, t(draft && (changed || draft.draft)
          ? '草稿已改动。请恢复原任务并移除额外附件，再手动发送。'
          : '请复制原任务，粘贴后手动发送以记录本局。'), presetNotice && ' ' + presetNotice),
        h(LocalCopyButton, { text: task, label: '复制原任务', fieldLabel: '原任务', copiedNotice: '已复制原任务。',
          manualNotice: '已选中任务文字，可以手动复制。', backLabel }))
    }

    function RunComparisonAnchor({ kind, member, sessionId, request, onVisit, consumeDraft, putTask, draftStore, hasTurn, workspaces, onUse }) {
      const config = comparisonKinds[kind]
      const lesson = member?.lesson === lighthouseRematchLesson
      const evidence = member?.lesson === lighthouseEvidenceLesson
      const evidenceReplay = member?.evidenceReplay === true
      const publicEvidenceReplay = evidenceReplay && member?.publicEvidenceReplay === true
      const scenario = evidence ? evidenceScenarios.find(item => item.id === member.scenario) : undefined
      const draftNotices = evidence ? evidenceDraftNotices : comparisonDraftNotices
      const title = comparisonTitle(kind, member?.lesson, evidenceReplay, publicEvidenceReplay)
      const [open, setOpen] = useState(false)
      const [lessonTaskSource, setLessonTaskSource] = useState(null)
      const [openEvidenceReplay, setOpenEvidenceReplay] = useState(false)
      const [openDeliveryReview, setOpenDeliveryReview] = useState(false)
      const [draftStatus, setDraftStatus] = useState('')
      const trigger = useRef(null)
      const lessonTaskTrigger = useRef(null)
      const evidenceReplayTrigger = useRef(null)
      const deliveryReviewTrigger = useRef(null)
      const availableLessonTask = evidence && member.lessonTaskSource
      const availableEvidenceReplay = evidence && member.canReplayLighthouseEvidence === true
      const availableDeliveryReview = lesson && kind === 'workspace' && member.canTryDeliveryReview === true
      const evidenceReportCode = evidence && member.evidenceReportCode
      const taskPending = evidence && member.firstTaskPending && !hasTurn
      useEffect(() => {
        if (!member?.id) return
        const outcome = consumeDraft(sessionId)
        if (outcome) setDraftStatus(outcome)
      }, [member?.id, sessionId, consumeDraft])
      useEffect(() => { if (hasTurn || availableLessonTask) setDraftStatus('') }, [hasTurn, availableLessonTask])

      if (!member) return null
      function close() {
        setOpen(false)
        requestAnimationFrame(() => trigger.current?.focus())
      }

      function closeLessonTask() {
        setLessonTaskSource(null)
        requestAnimationFrame(() => (lessonTaskTrigger.current ?? trigger.current)?.focus())
      }

      function closeEvidenceReplay() {
        setOpenEvidenceReplay(false)
        requestAnimationFrame(() => (evidenceReplayTrigger.current ?? trigger.current)?.focus())
      }

      function closeDeliveryReview() {
        setOpenDeliveryReview(false)
        requestAnimationFrame(() => (deliveryReviewTrigger.current ?? trigger.current)?.focus())
      }

      return h(Fragment, null,
        h('div', { className: 'moba-lighthouse-anchor', 'data-evidence-result': availableEvidenceReplay || undefined,
          'data-delivery-review-result': availableDeliveryReview || undefined, 'data-task-pending': taskPending || undefined },
          h('div', null, h('strong', null, t(title)),
            h('span', null, scenario ? t(scenario.name) : comparisonArmName(comparisonArmConfig(kind, member.arm, evidenceReplay), member))),
          h('div', { className: 'moba-lighthouse-anchor-actions' },
            h('button', { ref: trigger, type: 'button', 'aria-haspopup': 'dialog', className: 'moba-settlement-button',
              onClick: () => setOpen(true) }, t(evidenceReplay ? title : evidence ? '查看取舍记录' : lesson ? '查看练习记录' : config.entry)),
            evidenceReportCode && h(LocalCopyButton, { key: evidenceReportCode, text: evidenceReportCode, label: '复制取舍码回给好友',
              fieldLabel: '我的取舍码', copiedNotice: '战报码已复制。', manualNotice: '战报码已选中，可以手动复制。', backLabel: '返回练习会话' }),
            availableEvidenceReplay && h('button', { ref: evidenceReplayTrigger, type: 'button', 'aria-haspopup': 'dialog',
              className: 'moba-settlement-button', onClick: () => setOpenEvidenceReplay(true) }, t(lighthouseEvidenceReplayLabel)),
            availableDeliveryReview && h('button', { ref: deliveryReviewTrigger, type: 'button', 'aria-haspopup': 'dialog',
              className: 'moba-settlement-button', onClick: () => setOpenDeliveryReview(true) }, t('试试交付前复核')),
            availableLessonTask && h('button', { ref: lessonTaskTrigger, type: 'button', 'aria-haspopup': 'dialog', className: 'moba-settlement-button',
              onClick: () => setLessonTaskSource(availableLessonTask) }, t(lessonTaskLabel))),
          taskPending && h(ChallengeTaskDraft, { task: member.task, presetChanged: member.presetChanged,
            sessionId, draftStore, putTask, backLabel: '返回练习会话' }),
          !taskPending && draftStatus && h('p', { role: 'status' }, t(draftNotices[draftStatus])),
          publicEvidenceReplay && !hasTurn && h('p', null, t('这局使用同一份内置样例和新的练习工作区。')),
          evidence && !taskPending && !publicEvidenceReplay && !availableLessonTask && h('p', null, t(hasTurn
            ? '可以在取舍记录里回看本局的实际选择和交付。'
            : '手动发送练习任务。如果出现证据取舍卡，请在会话里选择。')),
          lesson && kind === 'workspace' && h('p', null, t(availableDeliveryReview
            ? '补给卡已直接交付。下一局试试确认交付或退回修改。'
            : hasTurn
            ? '首局交付补给卡后，可在练习记录里换一件再试。'
            : '请手动发送补给卡任务。完成首局后，在练习记录里换一件再试。'))),
        lessonTaskSource && h(LessonLoadoutTask, { source: lessonTaskSource, workspaces, request, onBack: closeLessonTask,
          backLabel: '返回练习会话', onVisit: (next, task) => { setLessonTaskSource(null); onVisit(next, task) } }),
        openEvidenceReplay && h(RematchEditor, { kind, comparisonId: member.id, arm: member.arm, sourceSessionId: sessionId, request,
          lesson: true, evidenceReplayHint: true, publicEvidenceReplayHint: true, backLabel: '返回练习会话',
          onBack: closeEvidenceReplay, onClose: closeEvidenceReplay,
          onVisit: (next, task) => { if (next === sessionId) closeEvidenceReplay(); else { setOpenEvidenceReplay(false); onVisit(next, task) } } }),
        openDeliveryReview && h(RematchEditor, { kind, comparisonId: member.id, arm: member.arm, sourceSessionId: sessionId, request,
          lesson: true, guidedReview: true, backLabel: '返回练习会话', onBack: closeDeliveryReview, onClose: closeDeliveryReview,
          onVisit: (next, task) => { if (next === sessionId) closeDeliveryReview(); else { setOpenDeliveryReview(false); onVisit(next, task) } } }),
        open && h(RunComparison, { kind, request, comparisonId: member.id, sessionId, onClose: close, workspaces, lessonHint: member.lesson,
          evidenceReplayHint: evidenceReplay, publicEvidenceReplayHint: publicEvidenceReplay,
          putTask: task => putTask(sessionId, task),
          onUse: (preview, save) => { setOpen(false); onUse(preview, save) },
          onVisit: (next, task) => {
            if (next === sessionId) {
              if (task) setDraftStatus(putTask(sessionId, task))
              close()
            } else {
              setOpen(false)
              onVisit(next, task)
            }
          } }))
    }

    function WorkspaceComparisonAnchor({ kind = 'workspace', workspaces, ...props }) {
      const { items } = useSyncExternalStore(workspaces.subscribe.bind(workspaces), workspaces.getSnapshot.bind(workspaces))
      return h(RunComparisonAnchor, { ...props, kind, workspaces: items })
    }

    const planTaskDraftNotices = {
      applied: '任务已填入输入栏。请检查后手动发送。',
      preserved: '已保留原有草稿。你可以复制这次的任务后手动粘贴。',
      blocked: '可以复制任务，再粘贴到会话输入栏。',
    }

    function PlanTaskDraftAnchor({ plan, sessionId, request, consumeDraft, putTask }) {
      const [notice, setNotice] = useState('')
      const [showText, setShowText] = useState(false)
      const [restoring, setRestoring] = useState('')
      const [error, setError] = useState('')
      const field = useRef(null)
      const fillButton = useRef(null)
      const pending = useRef(null)
      const observedMismatch = useRef(false)
      const presetChanged = plan.presetChanged === true

      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => {
        if (presetChanged) {
          observedMismatch.current = true
          setNotice('')
          return
        }
        if (observedMismatch.current) return
        const outcome = consumeDraft(sessionId)
        if (outcome) setNotice(planTaskDraftNotices[outcome] ?? planTaskDraftNotices.blocked)
      }, [presetChanged, sessionId, consumeDraft])
      useEffect(() => {
        if (restoring !== 'checking') return
        if (!presetChanged) {
          setRestoring('')
          setNotice('已恢复核对过的出装。填入任务后，请手动发送。')
          fillButton.current?.focus()
          return
        }
        const timer = setTimeout(() => {
          setRestoring('')
          setError('暂时无法确认出装已恢复，可以重试。')
        }, 5000)
        return () => clearTimeout(timer)
      }, [presetChanged, restoring])
      useEffect(() => {
        if (!showText) return
        field.current?.focus()
        field.current?.select()
      }, [showText])

      function fillTask() {
        if (presetChanged || restoring) return
        const outcome = consumeDraft(sessionId) ?? putTask(sessionId, plan.task)
        setNotice(planTaskDraftNotices[outcome] ?? planTaskDraftNotices.blocked)
      }

      async function restore() {
        if (!presetChanged || pending.current || restoring) return
        const abort = pending.current = new AbortController()
        const action = 'plan-task-draft-restore'
        setRestoring('requesting')
        setError('')
        try {
          await request(action, { action, sessionId }, abort.signal)
          if (!abort.signal.aborted) setRestoring('checking')
        } catch (reason) {
          if (!abort.signal.aborted) {
            setError(reason.message)
            setRestoring('')
          }
        } finally {
          pending.current = null
        }
      }

      async function copy() {
        try {
          await navigator.clipboard.writeText(plan.task)
          setNotice('任务已复制。')
        } catch {
          setShowText(true)
          setNotice('已选中任务文字，可以手动复制。')
        }
      }

      return h('div', { className: 'moba-lighthouse-anchor moba-plan-task-draft' },
          h('div', null, h('strong', null, t(plan.source ? '练习出装新任务' : '出装方案新任务')), h('span', null, plan.planName),
          plan.material && h('span', null, plan.material)),
        h('div', null,
          presetChanged ? h('button', { type: 'button', className: 'moba-settlement-button', disabled: Boolean(restoring),
            onClick: restore }, t('恢复核对过的出装'))
            : h('button', { ref: fillButton, type: 'button', className: 'moba-settlement-button', disabled: restoring === 'requesting',
              onClick: fillTask }, t('填入任务')),
          h('button', { type: 'button', className: 'moba-settlement-button', onClick: copy }, t('复制任务'))),
        presetChanged && h('p', null, t('当前出装和你核对过的出装不同。恢复后可以填入任务。')),
        restoring && h('p', { role: 'status' }, t('正在恢复核对过的出装…')),
        error && h('p', { className: 'moba-alert', role: 'alert' }, t(error)),
        notice && h('p', { role: 'status' }, t(notice)),
        showText && h('textarea', { ref: field, readOnly: true, rows: 4, value: plan.task, 'aria-label': t('即将填入会话的任务') }))
    }

    function ActionEditor({ target, request, onClose, onSaved }) {
      const [revision, setRevision] = useState(null)
      const [draft, setDraft] = useState([])
      const [selected, setSelected] = useState(null)
      const [error, setError] = useState('')
      const [attempt, reload] = useState(0)
      const [saving, setSaving] = useState(false)
      const next = useRef(0)
      const action = draft.find(item => item.key === selected)

      useEffect(() => {
        const abort = new AbortController()
        setRevision(null)
        setError('')
        request('actions-read', { action: 'actions-read', kind: target.kind, id: target.id }, abort.signal)
          .then(value => {
            if (abort.signal.aborted) return
            setRevision(value.revision)
            setDraft(value.actions.map(item => ({ ...item, key: item.id })))
            setSelected(value.actions[0]?.id ?? null)
          })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [target, attempt, request])

      function add() {
        const key = 'new-' + (++next.current)
        setDraft(items => [...items, { key, name: '', detail: '', instruction: '', requiresInput: false }])
        setSelected(key)
      }

      function change(values) {
        setDraft(items => items.map(item => item.key === selected ? { ...item, ...values } : item))
      }

      function remove() {
        const remaining = draft.filter(item => item.key !== selected)
        setDraft(remaining)
        setSelected(remaining[0]?.key ?? null)
      }

      async function save(event) {
        event.preventDefault()
        if (saving || revision === null) return
        const invalid = draft.find(item => !item.name.trim() || !item.instruction.trim())
        if (invalid) {
          setSelected(invalid.key)
          setError(t('请填写这项操作的名称和会话指令。'))
          return
        }
        setSaving(true)
        setError('')
        try {
          await request('actions-save', { action: 'actions-save', kind: target.kind, id: target.id,
            actions: draft.map(({ key, ...item }) => item), revision })
          onSaved()
        } catch (reason) {
          setError(reason.message)
          setSaving(false)
        }
      }

      return h(InstallDialog, { title: target.kind === 'hero' ? t('设置英雄操作') : t('设置装备操作'), busy: saving, onCancel: onClose },
        h('div', { className: 'moba-action-target' },
          target.kind === 'hero' ? h(HeroArt, { id: target.id, art: target.art, className: 'moba-action-avatar' })
            : h(ItemArt, { item: target, className: 'moba-action-avatar' }),
          h('strong', null, target.name)),
        h('p', { className: 'moba-condition' }, t('操作就绪后可从「对局装备」把指令发给当前助手。')),
        h('form', { className: 'moba-direct-form moba-action-editor', onSubmit: save, noValidate: true },
          revision === null ? !error && h('p', { role: 'status' }, t('正在读取操作…'))
            : h(Fragment, null,
              h('div', { className: 'moba-action-options', role: 'group', 'aria-label': t('选择要编辑的操作') },
                draft.map(item => h('button', { type: 'button', key: item.key, disabled: saving,
                  'aria-pressed': item.key === selected, onClick: () => setSelected(item.key) }, item.name || t('新操作'))),
                h('button', { type: 'button', onClick: add, disabled: saving }, h(Glyph, { kind: 'plus', size: 14 }), t('添加操作'))),
              action && h('div', { className: 'moba-action-fields', key: action.key },
                h('label', null, t('操作名称'), h('input', { autoFocus: action.key.startsWith('new-'), value: action.name,
                  maxLength: 48, disabled: saving,
                  onChange: event => change({ name: event.target.value }) })),
                h('label', null, t('操作说明（选填）'), h('input', { value: action.detail, maxLength: 160, disabled: saving,
                  onChange: event => change({ detail: event.target.value }) })),
                h('label', null, t('会话指令'), h('textarea', { rows: 4, maxLength: 4000, value: action.instruction, disabled: saving,
                  onChange: event => change({ instruction: event.target.value }) })),
                h('label', { className: 'moba-action-requires' }, h('input', { type: 'checkbox', checked: action.requiresInput,
                  disabled: saving, onChange: event => change({ requiresInput: event.target.checked }) }), t('使用时要求填写补充材料')),
                h('button', { type: 'button', className: 'moba-text', disabled: saving, onClick: remove }, t('删除此操作')))),
          error && h('p', { className: 'moba-alert', role: 'alert' }, error),
          h('div', { className: 'moba-market-actions' },
            error && h('button', { type: 'button', className: 'moba-text', disabled: saving,
              onClick: () => reload(value => value + 1) }, t('重新读取')),
            h('button', { type: 'button', className: 'moba-text', disabled: saving, onClick: onClose }, t('取消')),
            h('button', { type: 'submit', className: 'moba-equip', disabled: saving || revision === null },
              saving ? t('正在保存…') : t('保存操作')))))
    }

    function AppearanceEditor({ target, request, onClose, onChanged }) {
      const [file, setFile] = useState(null)
      const [preview, setPreview] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const currentFrame = target.rank?.frame ?? 'auto'
      const [frame, setFrame] = useState(currentFrame)
      const hint = useId()
      const hero = target.kind === 'hero'
      useEffect(() => {
        if (!file) return
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => setPreview(url)
        image.onerror = () => setError(t('无法预览这张图片，请选择其他文件。'))
        image.src = url
        return () => {
          image.onload = image.onerror = null
          URL.revokeObjectURL(url)
        }
      }, [file])

      function choose(event) {
        const selected = event.target.files?.[0]
        setPreview(null)
        setFile(null)
        setError('')
        if (!selected) return
        if (!imageTypes.includes(selected.type) || selected.size > 4 * 1024 * 1024) {
          setError(t('请选择 4 MB 以内的 PNG、JPEG 或 WebP 图片。'))
          return
        }
        setFile(selected)
      }

      async function change(action) {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await request(action, { action, kind: target.kind, id: target.id,
            ...(action === 'art-upload' && { file }), ...(action === 'growth-frame' && { frame }) })
          onChanged(action === 'growth-frame' ? t('已应用熟练度边框')
            : action === 'art-reset' ? t('已恢复默认图片') : t('已保存') + (hero ? t('立绘') : t('图标')))
        } catch (reason) {
          setError(reason.message)
          setBusy(false)
        }
      }

      const art = preview ?? target.art
      const rank = { ...target.rank, frame }
      return h(InstallDialog, { title: hero ? t('英雄外观') : t('装备外观'), busy, onCancel: onClose },
        h('p', { className: 'moba-appearance-name' }, target.name),
        h('div', { className: 'moba-art-preview', 'data-hero': hero },
          hero ? h(HeroArt, { id: target.id, art, rank, className: 'moba-art-preview-image' })
            : h(ItemArt, { item: { id: target.id, art, sourceId: target.sourceId }, rank, className: 'moba-art-preview-image' })),
        frameTier(rank) ? h('div', { className: 'moba-frame-actions' },
          h(FramePicker, { name: target.name, rank, value: frame, disabled: busy, onChange: setFrame }),
          h('button', { className: 'moba-equip', type: 'button', disabled: busy || frame === currentFrame,
            onClick: () => change('growth-frame') }, t('应用边框')))
          : h('p', { className: 'moba-condition' }, t('Lv.3 解锁熟练度边框')),
        h('form', { className: 'moba-direct-form', onSubmit: event => {
          event.preventDefault()
          if (preview) change('art-upload')
        } },
        h('label', null, t('选择图片'), h('input', { type: 'file', accept: imageTypes.join(','), disabled: busy,
          'aria-describedby': hint, onChange: choose })),
        h('p', { id: hint, className: 'moba-condition' }, t('PNG、JPEG 或 WebP，4 MB 以内。')),
        error && h('p', { className: 'moba-alert', role: 'alert' }, error),
        h('div', { className: 'moba-market-actions' },
          target.art && h('button', { className: 'moba-text', type: 'button', disabled: busy,
            onClick: () => change('art-reset') }, t('恢复默认图片')),
          h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: onClose }, t('取消')),
          h('button', { className: 'moba-equip', type: 'submit', disabled: busy || !preview },
            busy ? t('正在保存…') : t('保存图片')))))
    }

    function InstallActions({ busy, error, builds, standalone, identifyPackage, onCancel, onConfirm }) {
      const [approved, setApproved] = useState([])
      const pending = builds?.length > 0
      const selected = builds?.filter(name => approved.includes(name)) ?? empty
      return h(Fragment, null,
        h('p', null, standalone
          ? t('模块会安装到当前 Profile。装配后随所选阵容加载。')
          : identifyPackage
            ? t('DSH 会在当前 Profile 启用组合包。独立模块安装后可配置为会话装备。')
            : t('此操作会在当前 Profile 安装并启用插件。')),
        pending && h('fieldset', { className: 'moba-build-permissions', disabled: busy },
          h('legend', null, t('安装脚本')),
          h('p', null, t('当前 Profile 会保存你选择的许可。')),
          builds.map(name => h('label', { key: name },
            h('input', { type: 'checkbox', checked: selected.includes(name), onChange: event => {
              setApproved(current => event.target.checked ? [...current, name] : current.filter(item => item !== name))
            } }), name))),
        error && h('p', { className: 'moba-alert', role: 'alert' }, error),
        h('div', { className: 'moba-market-actions' },
          h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: onCancel }, t('取消')),
          h('button', { className: 'moba-equip', type: 'button', disabled: busy || pending && !selected.length,
            onClick: () => onConfirm(pending ? selected : undefined) },
            busy ? t('正在安装…') : pending ? t('允许选中脚本并重试') : t('确认安装'))))
    }

    function DirectInstall({ request, onClose, onInstalled, onConfigure }) {
      const [spec, setSpec] = useState('')
      const [registry, setRegistry] = useState('')
      const [review, setReview] = useState(null)
      const [result, setResult] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [builds, setBuilds] = useState(empty)

      async function check(event) {
        event.preventDefault()
        if (busy || !spec.trim() || event.nativeEvent.isComposing) return
        setBusy(true)
        setError('')
        try {
          setReview(await request('plugin-review', { action: 'plugin-review', spec, registry: registry.trim() || undefined }))
        } catch (reason) {
          setError(reason.message)
        } finally {
          setBusy(false)
        }
      }

      async function install(approvedBuilds) {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          const installed = await request('plugin-import', { action: 'plugin-import', source: review, approvedBuilds })
          if (installed.application === 'approval-required') {
            setBuilds(installed.pendingBuilds)
          } else {
            setResult(installed)
            onInstalled()
          }
        } catch (reason) {
          setError(reason.message)
        } finally {
          setBusy(false)
        }
      }

      if (result) return h(InstallDialog, { title: result.module ? t('模块已安装') : t('装备已安装'), onCancel: onClose },
        h('p', { role: 'status' }, [result.module ?? result.bundle ?? review.name, result.version ?? review.version].filter(Boolean).join(' ')),
        result.application === 'restart-required' && h('p', null, t('重启当前 DSH 后可加载。')),
        result.module && h('p', null, t('填写模块配置后，即可把它保存为一件装备。')),
        !result.module && result.application !== 'restart-required' && h('p', null, t('可以在装备库查看插件带来的英雄和工具。')),
        h('div', { className: 'moba-market-actions' },
          h('button', { className: result.module ? 'moba-text' : 'moba-equip', type: 'button', onClick: onClose }, t('返回装备库')),
          result.module && h('button', { className: 'moba-equip', type: 'button',
            onClick: () => onConfigure(result.module) }, t('配置装备'))))
      if (review) {
        const kind = { registry: t('软件源'), path: t('本机目录'), git: t('Git 仓库'), tarball: t('安装包') }[review.kind]
        return h(InstallDialog, { title: t('核对插件安装来源'), busy, onCancel: onClose },
          h(InstallFacts, { facts: [
            [t('来源类型'), kind], [t('插件类型'), review.standalone && t('独立模块')],
            [t('安装来源'), review.spec], [t('包名'), review.name], [t('版本'), review.version],
            [t('首选软件源'), (review.kind === 'registry' || review.requestedRegistry) && (review.registry ?? t('当前 Profile 设置'))],
            [t('下载地址'), review.archive?.url],
            [t('下载主机'), review.host],
          ] }),
          review.description && h('p', null, review.description),
          !review.name && h('p', null, t('DSH 会在读取安装包时核验包名、版本和兼容性。')),
          h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: () => {
            setReview(null); setError(''); setBuilds(empty)
          } }, t('修改来源')),
          h(InstallActions, { busy, error, builds, standalone: review.standalone, identifyPackage: !review.name,
            onCancel: onClose, onConfirm: install }))
      }
      return h(InstallDialog, { title: t('导入插件'), busy, onCancel: onClose },
        h('form', { className: 'moba-direct-form', onSubmit: check },
          h('label', null, t('插件安装来源'), h('input', { type: 'text', value: spec, required: true, disabled: busy,
            autoCapitalize: 'off', spellCheck: false, onChange: event => setSpec(event.target.value),
            placeholder: t('包名、Git 地址、.tgz 或本机绝对路径') })),
          h('details', null, h('summary', null, t('指定软件源')),
            h('label', null, t('软件源网址'), h('input', { type: 'url', value: registry, disabled: busy,
              placeholder: 'https://registry.npmjs.org', onChange: event => setRegistry(event.target.value) }))),
          error && h('p', { className: 'moba-alert', role: 'alert' }, error),
          h('div', { className: 'moba-market-actions' },
            h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: onClose }, t('取消')),
            h('button', { className: 'moba-equip', type: 'submit', disabled: busy || !spec.trim() },
              busy ? t('正在核对…') : t('核对来源')))))
    }

    function CustomEquipment({ request, onClose, onAdded, initialModule, targetTool, initiallyDeferred }) {
      const [title, setTitle] = useState('')
      const [text, setText] = useState(() => initialModule ? JSON.stringify({ name: initialModule, config: {} }, null, 2) : '')
      const [directory, setDirectory] = useState('')
      const [deferred, setDeferred] = useState(Boolean(initiallyDeferred))
      const [review, setReview] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      async function submit(action) {
        if (busy || !text.trim()) return
        setBusy(true)
        setError('')
        try {
          const result = await request(action, { action, title, text, directory, reviewedId: review?.id,
            ...(targetTool ? { toolId: targetTool.id, deferred } : {}) })
          if (action === 'equipment-save') onAdded(result)
          else setReview(result)
        } catch (reason) {
          setError(reason.message)
        } finally {
          setBusy(false)
        }
      }

      const alert = error && h('p', { className: 'moba-alert', role: 'alert' }, error)
      if (review) return h(InstallDialog, { title: t('核对装备配置'), busy, onCancel: onClose },
        h(InstallFacts, { facts: [
          [t('目标工具'), review.boundTool?.name], [review.boundTool ? t('来源配置名称') : t('装备'), review.title],
          [t('模块'), review.modules.join('、')], [t('加载目录'), review.baseDirectory],
        ] }),
        h('p', null, review.boundTool
          ? review.boundTool.deferred ? t('工具出现后，可在对局装备中核验。') : t('开局时会核验工具名称、参数和来源插件。')
          : t('装配后，DSH 会在开局时加载这些模块并检查依赖。')),
        alert,
        h('div', { className: 'moba-market-actions' },
          h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: () => {
            setReview(null); setError('')
          } }, t('修改配置')),
          h('button', { className: 'moba-equip', type: 'button', disabled: busy,
            onClick: () => submit('equipment-save') }, busy ? t('正在保存…') : t('加入装备库'))))
      return h(InstallDialog, { title: targetTool ? t('配置装备来源') : t('自定义装备'), busy, onCancel: onClose },
        h('form', { className: 'moba-direct-form', onSubmit: event => {
          event.preventDefault()
          if (!event.nativeEvent.isComposing) submit('equipment-review')
        } },
        targetTool && h('p', null, t('为 ') + targetTool.name + t(' 指定可在新会话加载的模块及配置。')),
        h('label', null, targetTool ? t('来源配置名称（可选）') : t('装备名称（可选）'), h('input', { value: title, disabled: busy,
          onChange: event => setTitle(event.target.value) })),
        h('label', null, t('模块名或 Cordis 配置'), h('textarea', { value: text, required: true, disabled: busy,
          rows: 7, spellCheck: false, placeholder: '@deepseek-ai/dsh-tool-present',
          onChange: event => setText(event.target.value) })),
        h('details', null, h('summary', null, t('指定加载目录')),
          h('label', null, t('相对路径所在的本机目录'), h('input', { value: directory, disabled: busy,
            placeholder: '/path/to/plugin', onChange: event => setDirectory(event.target.value) }))),
        targetTool && h('label', null, t('工具注册时机'),
          h('select', { value: deferred ? 'turn' : 'opening', disabled: busy,
            onChange: event => setDeferred(event.target.value === 'turn') },
          h('option', { value: 'opening' }, t('开局时')),
          h('option', { value: 'turn' }, t('回合触发后')))),
        alert,
        h('div', { className: 'moba-market-actions' },
          h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: onClose }, t('取消')),
          h('button', { className: 'moba-equip', type: 'submit', disabled: busy || !text.trim() },
            busy ? t('正在核对…') : t('核对配置')))))
    }

    function MarketShop({ request, revision, onManage, onEnable, onInstalled, disabled, bundleArt }) {
      const [indexes, setIndexes] = useState(null)
      const [listing, setListing] = useState(null)
      const [sourceChoice, setSourceChoice] = useState('')
      const [query, setQuery] = useState('')
      const [offset, setOffset] = useState(0)
      const [retry, setRetry] = useState(0)
      const [sourceForm, setSourceForm] = useState(false)
      const [url, setUrl] = useState('')
      const [error, setError] = useState('')
      const [sourceError, setSourceError] = useState('')
      const [busy, setBusy] = useState(false)
      const [activeName, setActiveName] = useState('')
      const [chosenVersion, setChosenVersion] = useState('')
      const [confirmation, setConfirmation] = useState(null)
      const [installError, setInstallError] = useState('')
      const [builds, setBuilds] = useState(empty)
      const [notice, setNotice] = useState('')
      const sources = indexes?.sources ?? empty
      const source = sources.find(item => item.url === sourceChoice) ?? sources[0]
      const sourceUrl = source?.url
      const page = listing?.url === sourceUrl && listing?.query === query && listing?.offset === offset ? listing.value : null
      const active = page?.entries.find(item => item.name === activeName) ?? page?.entries[0]
      const version = active?.versions.find(item => item.version === (chosenVersion || active.defaultVersion))
        ?? active?.versions.find(item => item.compatible)
        ?? active?.versions[0]

      useEffect(() => {
        const abort = new AbortController()
        request('market-indexes', { action: 'market-indexes' }, abort.signal).then(value => {
          if (!abort.signal.aborted) { setIndexes(value); setSourceError('') }
        }).catch(reason => {
          if (!abort.signal.aborted) setSourceError(reason.message)
        })
        return () => abort.abort()
      }, [request, revision, retry])

      useEffect(() => {
        if (!sourceUrl) return
        const abort = new AbortController()
        setListing(null)
        setError('')
        const timer = setTimeout(async () => {
          try {
            const value = await request('market-search', { action: 'market-search', url: sourceUrl, query, offset }, abort.signal)
            if (!abort.signal.aborted) {
              setListing({ url: sourceUrl, query, offset, value })
              setIndexes(current => ({
                ...current, sources: current.sources.map(item => item.url === sourceUrl ? { ...item, title: value.title } : item),
              }))
            }
          } catch (reason) {
            if (!abort.signal.aborted) setError(reason.message)
          }
        }, query ? 200 : 0)
        return () => { abort.abort(); clearTimeout(timer) }
      }, [request, sourceUrl, query, offset, revision, retry])

      async function addSource(event) {
        event.preventDefault()
        if (busy || !url.trim()) return
        setBusy(true)
        setSourceError('')
        try {
          const value = await request('market-add', { action: 'market-add', url: url.trim() })
          setIndexes(value)
          setSourceChoice(value.sources.find(item => item.url === url.trim())?.url ?? value.sources.at(-1)?.url)
          setOffset(0)
          setSourceForm(false)
          setUrl('')
        } catch (reason) {
          setSourceError(reason.message)
        } finally {
          setBusy(false)
        }
      }

      async function install(approvedBuilds) {
        if (busy) return
        setBusy(true)
        setInstallError('')
        const { entry, version, url } = confirmation
        try {
          const result = await request('market-install', {
            action: 'market-install', url, name: entry.name, version: version.version, spec: version.spec, registry: version.registry, approvedBuilds,
          })
          if (result.application === 'approval-required') {
            setBuilds(result.pendingBuilds)
            return
          }
          setConfirmation(null)
          setNotice(result.application === 'restart-required' ? t('装备已安装。重启当前 DSH 后生效。')
            : result.application === 'already-installed' ? t('当前 Profile 已有此插件，可查看它的版本。')
              : t('装备已安装，可在 Profile 插件中查看。'))
          onInstalled()
        } catch (reason) {
          setInstallError(reason.message)
        } finally {
          setBusy(false)
        }
      }

      const retryButton = h('button', { className: 'moba-text', type: 'button', onClick: () => setRetry(value => value + 1) }, t('重试'))
      if (!indexes) return h('p', { className: 'moba-empty', role: 'status' }, sourceError
        ? h(Fragment, null, sourceError, retryButton) : t('正在读取装备市场…'))
      if (!indexes.available) return h('div', { className: 'moba-market-setup' },
        h('p', { className: 'moba-empty' }, t('启用 DSH 的自定义插件索引后可浏览社区装备。')),
        h('button', { className: 'moba-equip', type: 'button', disabled,
          onClick: () => indexes.enableId ? onEnable(indexes.enableId) : onManage() },
          indexes.enableId ? t('启用装备市场') : t('打开插件管理')))

      const installed = active && active.installation !== 'not-installed'
      return h(Fragment, null,
        h('div', { className: 'moba-market-toolbar' },
          sources.length > 0 && h('select', { 'aria-label': t('插件索引'), value: sourceUrl ?? '',
            onChange: event => { setSourceChoice(event.target.value); setOffset(0); setActiveName(''); setChosenVersion('') } },
          sources.map(item => h('option', { key: item.url, value: item.url }, item.title ?? item.url))),
          sources.length > 0 && h('button', { className: 'moba-text', type: 'button', onClick: () => setSourceForm(!sourceForm) },
            sourceForm ? t('收起') : t('添加索引'))),
        (sourceForm || !sources.length) && h('form', { className: 'moba-market-source', onSubmit: addSource },
          h('label', null, t('插件索引网址'), h('input', { type: 'url', value: url, onChange: event => setUrl(event.target.value),
            placeholder: 'https://…/index.json', required: true })),
          h('div', { className: 'moba-market-actions' },
            h('button', { className: 'moba-text', type: 'button', onClick: () => setUrl(indexes.communityIndex) }, t('填写社区索引')),
            h('button', { className: 'moba-equip', type: 'submit', disabled: disabled || busy || !url.trim() }, t('添加索引')))),
        sourceError && h('p', { className: 'moba-alert', role: 'alert' }, sourceError),
        sourceUrl && h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 15 }),
          h('input', { type: 'search', value: query, placeholder: t('搜索此索引的装备'), 'aria-label': t('搜索市场装备'),
            onChange: event => { setQuery(event.target.value); setOffset(0); setActiveName(''); setChosenVersion('') } })),
        notice && h('p', { className: 'moba-empty', role: 'status' }, notice),
        error && h('p', { className: 'moba-alert', role: 'alert' }, error, retryButton),
        sourceUrl && !page && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在搜索市场…')),
        page && !active && h('p', { className: 'moba-empty', role: 'status' }, t('此索引没有符合条件的装备。')),
        active && h('div', { className: 'moba-shop-grid moba-market-grid' }, page.entries.map(entry => {
          const installed = entry.installation !== 'not-installed'
          return h('button', { key: entry.name, className: 'moba-item', type: 'button',
            title: entry.title, 'aria-label': entry.title + (installed ? t(' · 已有插件') : ''),
            'aria-pressed': active.name === entry.name,
            onClick: () => { setActiveName(entry.name); setChosenVersion('') } },
          h(ItemArt, { item: { id: 'bundle:' + entry.name, art: bundleArt.get('bundle:' + entry.name) } }),
          h('span', { className: 'moba-item-name' }, entry.title))
        })),
        page && (offset > 0 || page.nextOffset !== null) && h('div', { className: 'moba-pager', 'aria-label': t('市场分页') },
          h('button', { type: 'button', disabled: offset === 0,
            onClick: () => { setOffset(Math.max(0, offset - 8)); setChosenVersion('') } }, t('上一页')),
          h('span', null, Math.floor(offset / 8) + 1 + ' / ' + Math.max(1, Math.ceil(page.total / 8))),
          h('button', { type: 'button', disabled: page.nextOffset === null,
            onClick: () => { setOffset(page.nextOffset); setChosenVersion('') } }, t('下一页'))),
        active && h('div', { className: 'moba-detail' },
          h('div', { className: 'moba-detail-head' },
            h(ItemArt, { item: { id: 'bundle:' + active.name, art: bundleArt.get('bundle:' + active.name) } }),
            h('div', null, h('h3', null, active.title), h('span', null, active.name)),
            installed ? h('button', { className: 'moba-equip', type: 'button', onClick: () => onManage(active.name) }, t('查看已有插件'))
              : h('button', { className: 'moba-equip', type: 'button', disabled: disabled || busy || !version?.compatible,
                onClick: () => { setInstallError(''); setBuilds(empty); setConfirmation({ entry: active, version, url: sourceUrl }) } }, t('安装装备'))),
          active.summary && h('p', null, active.summary),
          active.author && h('p', { className: 'moba-condition' }, t('作者 ') + active.author),
          installed && h('p', { className: 'moba-condition' },
            (active.installation === 'provided' ? t('DSH 随附') : t('已安装')) + (active.installedVersion ? ' ' + active.installedVersion : '')),
          h('label', { className: 'moba-market-version' }, t('索引版本'),
            h('select', { 'aria-label': t('装备版本'), value: version?.version ?? '', onChange: event => setChosenVersion(event.target.value) },
              active.versions.map(item => h('option', { key: item.version, value: item.version },
                [item.version, item.version === active.installedVersion && (active.installation === 'provided' ? t('随附') : t('已安装')),
                  item.version === active.defaultVersion && t('推荐'), item.exemption && t('已豁免'), !item.compatible && t('不兼容')]
                  .filter(Boolean).join(' · '))))),
          version?.runtimeVersion && h('p', { className: 'moba-condition' },
            t('当前 DSH ') + version.runtimeVersion + (version.exemption ? t(' · 使用已保存的兼容性豁免') : t(' · 此版本不兼容'))),
          version?.requirements && h('p', { className: 'moba-market-requirements' },
            Object.entries(version.requirements).map(([name, range]) => h('span', { key: name },
              t('要求 ') + (name === 'engines.dsh' ? 'DSH' : name) + ' ' + range)))),
        confirmation && h(InstallDialog, { title: t('安装 ') + confirmation.entry.title, busy, onCancel: () => setConfirmation(null) },
          h(InstallFacts, { facts: [
            [t('包名'), confirmation.entry.name], [t('版本'), confirmation.version.version], [t('索引'), confirmation.url],
            [t('安装来源'), confirmation.version.spec],
            [t('首选软件源'), confirmation.version.source.type === 'npm' && (confirmation.version.registry ?? t('当前 Profile 设置'))],
          ] }),
          confirmation.version.exemption && h('p', null, t('此版本使用当前 Profile 已保存的兼容性豁免。')),
          h(InstallActions, { busy, error: installError, builds, onCancel: () => setConfirmation(null), onConfirm: install })))
    }

    function Shop({ items, roles, activeId, statuses, selected, heroNames, presets, onShowHero, onPreviewPairing, onFit, onPrepareTrial, onInspect, onToggle, onManage, onEnable, onRefresh,
      onOpenSource, onEditSaved, onAppearance, onActions, onCollection, equipmentSources, onSource,
      builtIn, removed, removalRoots, onBuiltIn, standingClaims, request, revision, disabled, saved, profileError, requestedItem,
      onPracticeEvidence, onEvidenceHistory }) {
      const [category, setCategory] = useState('featured')
      const [role, setRole] = useState('')
      const [query, setQuery] = useState('')
      const [page, setPage] = useState(0)
      const [dialog, setDialog] = useState(null)
      const [linkedItem, setLinkedItem] = useState(null)
      useEffect(() => {
        if (!requestedItem || saved) return
        setLinkedItem(requestedItem)
        setCategory(requestedItem.discovered ? 'discovered' : 'featured')
        setRole('')
        setQuery(requestedItem.name)
        setPage(0)
      }, [requestedItem, saved])
      useEffect(() => {
        if (!linkedItem) return
        const frame = requestAnimationFrame(() => {
          const heading = document.querySelector('#moba-item-detail h3')
          heading?.scrollIntoView({ block: 'nearest' })
          heading?.focus({ preventScroll: true })
        })
        return () => cancelAnimationFrame(frame)
      }, [linkedItem])
      const rawStatus = id => draftEquipmentStatus(statuses?.[id], removed, equipmentSources[id])
      function status(item) {
        if (saved) return { state: 'saved' }
        if (builtIn[item.id] && removed.has(item.id)) return { state: 'removed' }
        const current = rawStatus(item.id) ?? { state: 'unavailable' }
        const draftConflicts = standingConflicts(item.id, current, selected, rawStatus, standingClaims)
        if (draftConflicts.length) return { ...current, draftConflicts }
        if (current.state !== 'available' || current.live || selected.includes(item.id)) return current
        const provider = current.equipId ?? item.id
        if (!selected.some(id => (draftEquipmentStatus(statuses[id], removed, equipmentSources[id])?.equipId ?? id) === provider)) return current
        return { ...current, state: 'included', reason: t('已随出装中的同一插件加载。') }
      }
      const itemRoles = item => (!saved && rawStatus(item.id)?.roles) || item.roles || empty
      const market = category === 'market' && !saved
      const hasModules = items.some(item => item.kind === 'module')
      const tabs = (hasModules ? categories : categories.filter(([id]) => id !== 'module')).map(([id, title]) => [id, t(title)])
      const queryWords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      const shown = saved ? items.filter(item => selected.includes(item.id)) : items.filter(item => {
        const classes = itemRoles(item)
        if (role && !classes.includes(role)) return false
        if (!queryWords.length) {
          if (role && category === 'featured') return true
          if (category === 'collection') return Boolean((statuses?.[item.id]?.collection ?? item.collection)?.saved)
          if (category === 'discovered') return Boolean(item.discovery)
          if (category === 'built-in') return Boolean(builtIn[item.id])
          return category === 'profile' ? item.kind === 'host' || item.kind === 'bundle' : item.kind === category
        }
        const search = [item.name, item.summary, item.module, item.bundle, ...(item.modules ?? []), ...(item.sources ?? []),
          ...classes.map(role => roles[role]),
          ...(item.panelActivities ?? empty).map(activity => activity.name), ...(item.compactionActivities ?? empty).map(activity => activity.name)]
          .filter(Boolean).join(' ').toLocaleLowerCase()
        return queryWords.every(word => search.includes(word))
      })
      if (!queryWords.length && category === 'discovered') shown.sort((a, b) => b.discovery.time - a.discovery.time)
      const pageSize = 8
      const pages = Math.ceil(shown.length / pageSize)
      const linkedIndex = linkedItem ? shown.findIndex(item => item.id === linkedItem.id) : -1
      const visiblePage = linkedIndex >= 0 ? Math.floor(linkedIndex / pageSize) : Math.min(page, Math.max(0, pages - 1))
      const pageItems = shown.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize)
      const active = pageItems.find(item => item.id === activeId) ?? pageItems[0]
      const isEquipped = item => selected.includes(item.id)
      const original = !saved && active && statuses?.[active.id]
      const inspectedStatus = active && status(active)
      const catalog = new Map(items.map(item => [item.id, item]))
      let replacement
      if (inspectedStatus?.replacement?.remove.length || inspectedStatus?.draftConflicts?.length) {
        const affected = [...removedBuiltIns(inspectedStatus.replacement?.remove ?? empty, builtIn)].filter(id => !removed.has(id))
        const conflicts = inspectedStatus.draftConflicts ?? empty
        const tools = [...new Set([...(inspectedStatus.replacement?.tools ?? empty), ...conflicts.flatMap(item => item.tools)])]
        const names = [...affected.map(id => builtIn[id]?.name ?? id), ...conflicts.map(({ id }) => catalog.get(id)?.name ?? id)]
        const originalClaims = conflicts.flatMap(({ id }) => standingClaims[rawStatus(id)?.equipId ?? id] ?? empty)
        const keep = selected.filter(id => !conflicts.some(item => item.id === id)).concat(active.id)
        const remaining = new Set([
          ...Object.entries(builtIn).flatMap(([id, item]) => removed.has(id) || affected.includes(id) ? [] : item.tools),
          ...keep.flatMap(id => (standingClaims[rawStatus(id)?.equipId ?? id] ?? empty).map(item => item.name)),
        ])
        replacement = { names, tools, otherTools: [...new Set([
          ...affected.flatMap(id => builtIn[id]?.tools ?? []), ...originalClaims.map(item => item.name),
        ])].filter(name => !tools.includes(name) && !remaining.has(name)) }
      }
      let activeBuiltIn
      if (!saved && active && builtIn[active.id]) {
        const item = builtIn[active.id]
        const remaining = removed.has(active.id) && removedBuiltIns(restoringBuiltIn(active.id, removalRoots, builtIn), builtIn)
        const affected = remaining ? [...removed].filter(id => id !== active.id && !remaining.has(id)) : item.linked
        activeBuiltIn = { ...item, affected: affected.map(id => builtIn[id]?.name ?? id) }
      }
      const sourceChoice = !saved && active ? equipmentSources[active.id] ?? original?.sourceId ?? '' : ''
      const choices = original?.sourceChoices ?? (original?.sourceId ? [original] : empty)
      const sourceOptions = choices.length > 1 || (choices.length && (original.state === 'included' || sourceChoice !== choices[0].sourceId))
        ? [...(original.state === 'included' ? [{ id: '', label: removed.has(original.includedBy) ? t('原来源已卸下')
          : original.includedSourceName ? t('沿用 · ') + original.includedSourceName : t('英雄自带') }] : []),
          ...(sourceChoice && !choices.some(choice => choice.sourceId === sourceChoice)
            ? [{ id: sourceChoice, label: t('原来源当前不可用'), unavailable: true }] : []),
          ...choices.map(choice => ({ id: choice.sourceId,
            label: choice.sourceName + (choice.collection?.saved ? t(' · 已收藏') : '') }))] : empty
      const selectedSource = inspectedStatus?.sourceId ?? inspectedStatus?.includedBy
      const toolLinks = saved ? empty : (active?.providedTools ?? empty).flatMap(link => {
        const tool = catalog.get(link.id)
        if (!tool) return []
        const original = statuses?.[tool.id]
        const option = original?.includedBy === link.sourceId && !removed.has(link.sourceId) ? original
          : draftEquipmentStatus(original, removed, link.sourceId) ?? { state: 'unavailable' }
        const equipped = selected.includes(tool.id) && draftEquipmentStatus(original, removed, equipmentSources[tool.id])?.sourceId === link.sourceId
        const statusLabel = cardState(tool, option, equipped)
        const timingLabel = { turn: t('回合触发'), condition: t('按条件启用') }[link.timing]
        const label = [active.kind === 'bundle' && catalog.get(link.providerId)?.name, statusLabel,
          timingLabel && !statusLabel.includes(timingLabel) && timingLabel].filter(Boolean).join(' · ')
        return [{ item: { ...tool, art: option.art ?? tool.art, sourceId: link.sourceId }, label, link }]
      }).sort((a, b) => a.item.name.localeCompare(b.item.name, activeLanguage.getSnapshot()))
      const providerLinks = saved ? empty : (active?.providerGear ?? empty).flatMap(link => {
        const item = catalog.get(link.id)
        if (!item) return []
        const active = selectedSource === link.sourceId
        const label = [item.kind === 'host' ? t('Profile 插件') : t('会话插件'), active && t('当前来源')].filter(Boolean).join(' · ')
        return [{ item, link, label, active }]
      }).sort((a, b) => Number(b.active) - Number(a.active) || a.item.name.localeCompare(b.item.name, activeLanguage.getSnapshot()))
      const moduleLinks = saved ? empty : (active?.moduleConfigurations ?? active?.installedModules ?? empty).flatMap(id => {
        const item = catalog.get(id)
        if (!item) return []
        const current = isEquipped(item)
        const names = [...new Set((item.providedTools ?? empty).map(link => catalog.get(link.id)?.name).filter(Boolean))]
        const description = names.length > 3 ? names.slice(0, 3).join('、') + t(' 等 ') + names.length + t(' 个工具') : names.join('、')
        return [{ item, link: { id }, active: current, label: item.kind === 'module' ? item.version
          : cardState(item, status(item), current), description }]
      }).sort((a, b) => Number(b.active) - Number(a.active) || a.item.name.localeCompare(b.item.name, activeLanguage.getSnapshot()))
      const incomingId = active?.id === linkedItem?.id && linkedItem?.sourceId !== selectedSource ? linkedItem?.sourceId : undefined
      const incomingOption = incomingId && choices.find(choice => choice.sourceId === incomingId)
      const incoming = incomingId && providerLinks.find(row => row.link.sourceId === incomingId)
      const linkedSource = incomingId && { id: incomingId,
        name: incomingOption?.sourceName ?? incoming?.item.name ?? linkedItem.sourceName ?? incomingId.slice(-6),
        available: incomingOption?.state === 'available' }

      function inspectRelated({ id, sourceId }) {
        const card = catalog.get(id)
        if (!card) return
        setLinkedItem({ id, sourceId: card.kind === 'tool' ? sourceId : undefined })
        setRole('')
        setQuery(card.name)
        setCategory('featured')
        setPage(0)
        onInspect(id)
      }

      function changeSource(id, sourceId) {
        const item = catalog.get(id)
        const next = draftEquipmentStatus(statuses?.[id], removed, sourceId)
        if (role && !(next?.roles ?? item?.roles)?.includes(role)) setRole('')
        onSource(id, sourceId)
      }

      return h('section', { className: 'moba-shop', 'aria-labelledby': 'moba-shop-title' },
        h('div', { className: 'moba-shop-title' },
          h('h2', { id: 'moba-shop-title' }, saved ? t('已装配装备') : t('装备库')),
          saved && h('button', { className: 'moba-text', type: 'button', disabled: disabled || !onEditSaved, onClick: onEditSaved }, t('复制并调整')),
          !saved && h('div', { className: 'moba-shop-actions' },
            h('button', { className: 'moba-text', type: 'button', disabled, onClick: onRefresh }, t('刷新装备')),
            h('button', { className: 'moba-text', type: 'button', disabled, onClick: () => setDialog({ kind: 'import' }) }, t('导入插件')),
            h('button', { className: 'moba-text', type: 'button', disabled, onClick: () => setDialog({ kind: 'custom' }) }, t('自定义装备')),
            h('button', { className: 'moba-text', type: 'button', disabled, onClick: () => onManage() }, t('管理装备来源')))),
        dialog?.kind === 'import' && h(DirectInstall, {
          request, onClose: () => setDialog(null), onInstalled: onRefresh,
          onConfigure: initialModule => setDialog({ kind: 'custom', initialModule }),
        }),
        dialog?.kind === 'custom' && h(CustomEquipment, {
          request, initialModule: dialog.initialModule, targetTool: dialog.tool, initiallyDeferred: dialog.deferred,
          onClose: () => setDialog(null), onAdded: item => {
          setDialog(null)
          setLinkedItem(null)
          setRole('')
          setCategory(item.boundTool ? 'tool' : 'plugin')
          setQuery(item.boundTool?.name ?? item.title)
          setPage(0)
          onInspect(item.boundTool?.id ?? item.id)
          onRefresh()
        } }),
        !saved && h('div', { className: 'moba-controls' },
          h('div', { className: 'moba-tabs', 'data-modules': hasModules, 'aria-label': t('装备分类') }, tabs.map(([id, title]) =>
            h('button', { key: id, type: 'button', 'aria-pressed': category === id && !queryWords.length,
              onClick: () => { setLinkedItem(null); setCategory(id); setRole(''); setQuery(''); setPage(0) } }, title))),
          !market && h(RoleFilter, { roles, used: new Set(items.flatMap(itemRoles)), value: role, label: t('装备职能'),
            onChange: value => { setLinkedItem(null); setRole(value); setPage(0) } }),
          !market && h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 15 }),
            h('input', { type: 'search', value: query, placeholder: t('搜索全部装备'), 'aria-label': t('搜索全部装备'),
              onChange: event => { setLinkedItem(null); setQuery(event.target.value); setPage(0) } }))),
        market ? h(MarketShop, { request, revision, onManage, onEnable, onInstalled: onRefresh, disabled,
          bundleArt: new Map(items.filter(item => item.kind === 'bundle' && item.art).map(item => [item.id, item.art])) })
          : h(Fragment, null,
        category === 'profile' && profileError && h('p', { className: 'moba-empty', role: 'status' }, profileError),
        h('div', { className: 'moba-shop-grid' }, pageItems.map(item => {
          const equipped = isEquipped(item)
          const current = status(item)
          const ready = current.state === 'available' && !current.replacement?.remove.length && !current.draftConflicts?.length
          return h('button', { type: 'button', key: item.id, className: 'moba-item',
            'aria-label': item.name + ' · ' + cardState(item, current, equipped),
            'aria-pressed': active?.id === item.id, 'aria-controls': 'moba-item-detail',
            'data-equipped': equipped, 'data-locked': current.state === 'unavailable', 'data-removed': current.state === 'removed',
            title: item.name, onClick: () => { setLinkedItem(null); onInspect(item.id) },
            draggable: !saved && ready && !equipped && !disabled,
            onDragStart: event => {
              if (!ready || equipped || saved || disabled) return event.preventDefault()
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData('application/x-dsh-equipment', item.id)
            } },
          h(ItemArt, { item: { ...item, sourceId: current.sourceId ?? current.includedBy ?? item.sourceId, art: current.art ?? item.art } }),
          item.rank?.badge && h('span', { className: 'moba-roster-medal', 'data-level': item.rank.level, title: item.rank.badge, 'aria-hidden': true },
            h(Glyph, { kind: 'mastery', size: 14 })),
          h('span', { className: 'moba-item-name' }, item.name))
        })),
        pages > 1 && h('div', { className: 'moba-pager', 'aria-label': t('装备分页') },
          h('button', { type: 'button', disabled: visiblePage === 0, onClick: () => { setLinkedItem(null); setPage(visiblePage - 1) } }, t('上一页')),
          h('span', null, visiblePage + 1 + ' / ' + pages),
          h('button', { type: 'button', disabled: visiblePage + 1 === pages, onClick: () => { setLinkedItem(null); setPage(visiblePage + 1) } }, t('下一页'))),
        !active && category === 'collection' && !queryWords.length
          ? h('p', { className: 'moba-empty' }, t('在会话插件或工具详情中选择「收藏装备」。'))
          : !active && category === 'discovered' && !queryWords.length
            ? h('p', { className: 'moba-empty' }, t('在对局中成功使用临时加载的工具后，就能在这里找到它。'))
          : h(ItemDetail, { item: active && { ...active, sourceId: selectedSource ?? active.sourceId,
            art: inspectedStatus?.art ?? active.art, roles: inspectedStatus?.roles ?? active.roles },
          status: inspectedStatus, equipped: active && isEquipped(active), replacement,
          heroNames, presets, roles, request, onShowHero, onPreviewPairing, onFit: !saved && onFit, onPrepareTrial, onToggle, onManage, onEnable, onOpenSource, disabled: disabled || saved,
          builtIn: activeBuiltIn, onBuiltIn, onPracticeEvidence: !saved && onPracticeEvidence,
          onEvidenceHistory: !saved && onEvidenceHistory, revision,
          onAppearance, onActions, onCollection, sourceOptions, sourceChoice, onSource: changeSource, appearanceDisabled: disabled,
          toolLinks, providerLinks, moduleLinks, linkedSource, onInspectRelated: inspectRelated,
          onConfigureModule: initialModule => setDialog({ kind: 'custom', initialModule }),
          onConfigureSource: (tool, deferred) => setDialog({ kind: 'custom', tool, deferred }) })))
    }

    function CapabilityList({ heading, cards, emptyText, tone, showTiming, active, disclosure, onTrial, onDelivery }) {
      const kinds = { effect: t('工作流程'), plugin: t('会话插件'), tool: t('工具') }
      const timing = { startup: t('开局核验'), turn: t('按条件触发'), condition: t('按条件启用') }
      return h(disclosure ? 'details' : 'div', { className: 'moba-delta', 'data-tone': tone, 'data-active': active },
        h(disclosure ? 'summary' : 'h3', null, heading, h('span', null, cards.length)),
        cards.length === 0
          ? h('p', { className: 'moba-empty' }, emptyText)
          : h('ul', { className: 'moba-delta-list' }, cards.map(card => {
            const prepare = onTrial && card.trialGear && ((key, title) => onTrial(card.trialGear, key, title))
            const deliver = onDelivery && card.deliveryHero && ((key, title) => onDelivery(card.deliveryHero, key, title))
            return h('li', { key: card.id },
              h(ItemArt, { item: card }),
              h('div', null,
                h('strong', null, card.name),
                h('span', { className: 'moba-capability-kind' }, card.transport ? t('执行器工具') : kinds[card.kind],
                  !showTiming && card.timing && ' · ' + timing[card.timing]),
                showTiming && h('dl', { className: 'moba-source-change' },
                  h('dt', null, t('原时机')), h('dd', null, timing[card.fromTiming] ?? t('随阵容加载')),
                  h('dt', null, t('新时机')), h('dd', null, timing[card.timing] ?? t('随阵容加载'))),
                card.fromSourceName ? h('dl', { className: 'moba-source-change' },
                  h('dt', null, t('原来源')), h('dd', null, card.fromSourceName),
                  h('dt', null, t('新来源')), h('dd', null, card.sourceName))
                  : card.sourceName && h('p', null, t('来源 ') + card.sourceName),
                card.summary && h('p', null, card.summary),
                card.toolNames?.length > 0 && h('p', { className: 'moba-condition' }, t('使用 ') + card.toolNames.join('、')),
                (tone === 'gain' || tone === 'loss') && h(DecisionList, { moves: card.decisions,
                  actionKeys: tone === 'gain' ? card.decisionDeliveries ?? card.decisionTrials : undefined,
                  actionLabel: card.deliveryHero ? t('筹备交付') : undefined, onAction: deliver || prepare }),
                card.gainedDecisions?.length > 0 && h('div', { className: 'moba-source-decisions', 'data-change': 'gain' },
                  h('h4', null, t('换源后可用')), h(DecisionList, { moves: card.gainedDecisions, actionKeys: card.gainedDecisionTrials, onAction: prepare })),
                card.lostDecisions?.length > 0 && h('div', { className: 'moba-source-decisions', 'data-change': 'loss' },
                  h('h4', null, t('换源后失去')), h(DecisionList, { moves: card.lostDecisions }))))
          })))
    }

    function capabilityChanges(result) {
      return [
        { heading: t('工具来源变化'), cards: result.sourceChanges, tone: 'source' },
        { heading: t('预计新增'), cards: result.gained, emptyText: t('这套出装没有新增已知能力。'), tone: 'gain' },
        { heading: t('预计移除'), cards: result.lost, emptyText: t('当前已知能力均可沿用。'), tone: 'loss' },
        { heading: t('就绪时机变化'), cards: result.timingChanges, tone: 'timing', showTiming: true },
      ]
    }

    function CapabilityDifferences({ result, activeDelta, setActiveDelta, onTrial, onDelivery }) {
      const groups = capabilityChanges(result).filter(group => group.cards.length || group.emptyText)
      const visible = groups.some(group => group.tone === activeDelta) ? activeDelta : groups[0].tone
      return h(Fragment, null,
        h('div', { className: 'moba-comparison-switcher', role: 'group', 'aria-label': t('对照结果') },
          groups.map(group => h('button', { key: group.tone, type: 'button', 'aria-pressed': visible === group.tone,
            onClick: () => setActiveDelta(group.tone) }, group.heading + ' ' + group.cards.length))),
        h('div', { className: 'moba-deltas' },
          groups.map(group => h(CapabilityList, { key: group.tone, ...group, onTrial, onDelivery, active: group.tone === visible }))))
    }

    function FieldPlaybookComparison({ result, draft, baseline }) {
      const deliveryGear = result.gained.find(item => item.id === 'present')
      const replaced = deliveryGear ? result.lost.filter(item =>
        item.kind === 'plugin' && draft.removedEquipmentIds.includes(item.id)) : empty
      const groups = capabilityChanges(result).map(group => {
        if (!replaced.length) return group
        const cards = group.cards.filter(item => item !== deliveryGear && !replaced.includes(item))
        return { ...group, cards }
      }).filter(group => group.cards.length)
      return h('section', { className: 'moba-playbook-comparison', 'aria-label': t('打法对照') },
        h('div', { className: 'moba-playbook-lineup' },
          h('div', null, h('small', null, baseline), h('strong', null, result.before.name)),
          h(Glyph, { kind: 'arrow', size: 18 }),
          h('div', null, h('small', null, t('推荐出装')), h('strong', null, result.after.name))),
        replaced.length > 0 && h('div', { className: 'moba-playbook-swap' }, h('strong', null, t('交付工具换装')),
          h('p', null, replaced.map(item => item.name).join(' / ') + ' → ' + deliveryGear.name)),
        groups.map(group => h(CapabilityList, { ...group, key: group.tone, disclosure: true,
          heading: group.heading + ' · ' + group.cards.slice(0, 2).map(item => item.name).join(' / ') + ' ' })),
        !replaced.length && !groups.length && h('p', { className: 'moba-empty' }, t('已知能力、工具来源和就绪时机均一致。')))
    }

    function FieldPlaybooks({ request, draftKey, sourceSessionId, hasOpening, onClose, onAdopt }) {
      const language = useLanguage()
      const [selected, setSelected] = useState(fieldPlaybooks[0].id)
      const [checked, setChecked] = useState(null)
      const [attempt, retry] = useState(0)
      const group = useId()
      const choice = fieldPlaybooks.find(item => item.id === selected)
      const key = JSON.stringify([selected, draftKey, sourceSessionId, language, attempt])
      const preview = checked?.key === key ? checked : null
      const baseline = draftKey ? t('现有出装') : sourceSessionId ? t('当前会话') : t('标准模式基础出装')

      useEffect(() => {
        const abort = new AbortController()
        const action = 'field-playbook-preview'
        request(action, { action, id: selected, againstDraft: draftKey ? JSON.parse(draftKey) : undefined,
          sourceSessionId: draftKey ? undefined : sourceSessionId }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setChecked({ key, value }) })
          .catch(reason => { if (!abort.signal.aborted) setChecked({ key, error: reason.message }) })
        return () => abort.abort()
      }, [request, selected, draftKey, sourceSessionId, language, key])

      return h(InstallDialog, { title: t('实战打法'), className: 'moba-playbook-dialog', onCancel: onClose,
        initialFocus: 'input:checked', onKeyDown: event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        } },
        h('fieldset', { className: 'moba-starter-routes' },
          h('legend', null, t('选择交付方式')),
          fieldPlaybooks.map(item => h('label', { className: 'moba-starter-route', key: item.id, 'data-picked': item.id === selected },
            h('input', { type: 'radio', name: group, value: item.id, checked: item.id === selected,
              onChange: () => { setChecked(null); setSelected(item.id) } }),
            h('span', null, h('strong', null, h(Glyph, { kind: item.icon, size: 16 }), t(item.name)),
              h('span', { className: 'moba-playbook-gear' }, t(item.gear)), h('small', null, t(item.note)))))),
        !draftKey && h('p', { className: 'moba-empty' }, t('当前出装暂时无法对照，预览改用下方标出的基准。')),
        !preview && h('p', { className: 'moba-empty', role: 'status' }, t('正在比较出装…')),
        preview?.error && h('p', { className: 'moba-alert', role: 'alert' }, preview.error, ' ',
          h('button', { type: 'button', className: 'moba-text', onClick: () => retry(value => value + 1) }, t('重试'))),
        preview?.value && h(FieldPlaybookComparison, { result: preview.value.comparison, draft: preview.value.draft, baseline }),
        h('p', { className: 'moba-starter-note' }, t('确认后替换大厅中的出装草稿。'),
          hasOpening && ' ' + t('当前筹备的开局委托也会清空。')),
        h('div', { className: 'moba-market-actions moba-starter-actions' },
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onClose }, t('返回大厅')),
          h('button', { type: 'button', className: 'moba-start', disabled: !preview?.value,
            onClick: () => onAdopt(choice.id, t(choice.name), preview.value.draft) },
          t('确认采用打法'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function ComparisonHero({ hero, label, planName }) {
      const build = hero.buildName?.startsWith(hero.name + ' · ') ? hero.buildName.slice(hero.name.length + 3) : hero.buildName
      const outfit = hero.outfit ?? empty
      const appearance = outfitAppearance(hero.id, outfit, hero.removedIds ?? empty)
      return h('div', { className: 'moba-comparison-hero' },
        h(HeroArt, { ...hero, className: 'moba-comparison-portrait' }),
        h(OutfitTrim, { appearance }),
        h('div', { className: 'moba-comparison-identity' }, h('span', null, label), h('strong', null, hero.name),
          (planName || build) && h('span', null, planName || build),
          outfit.length > 0 && h('ul', { className: 'moba-comparison-kit', 'aria-label': label + t('的装备') },
            outfit.slice(0, 4).map(item => {
              const name = [item.name, item.sourceName].filter(Boolean).join(' · ')
              return h('li', { key: item.id, title: name, 'aria-label': name }, h(ItemArt, { item }))
            }), outfit.length > 4 && h('li', { 'aria-label': t('另有 ') + (outfit.length - 4) + t(' 件装备') }, '+' + (outfit.length - 4)))))
    }

    function fittingToolSources(item, presets) {
      const sources = new Map()
      for (const hero of presets) {
        const status = hero.tools[item.id]
        if (status?.state === 'included' && status.includedBy) {
          sources.set(status.includedBy, status.includedSourceName ?? hero.builtIn[status.includedBy]?.name ?? hero.name + t('自带'))
        }
        for (const choice of status?.sourceChoices ?? (status?.sourceId ? [status] : empty)) {
          if (choice.sourceId) sources.set(choice.sourceId, choice.sourceName)
        }
      }
      sources.delete('profile')
      if (item.sourceId && item.sourceId !== 'profile' && !sources.has(item.sourceId)) sources.set(item.sourceId, item.sourceName)
      const labels = [...sources.values()]
      return [...sources].map(([id, name]) => ({ id,
        name: name && labels.indexOf(name) !== labels.lastIndexOf(name) ? name + ' · ' + id.slice(-6) : name }))
    }

    function FittingHeroes({ item, presets, selected, sourceId, onSelect }) {
      const [query, setQuery] = useState('')
      const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      const visible = presets.filter(hero => words.every(word =>
        [hero.name, hero.id, hero.description].filter(Boolean).join(' ').toLocaleLowerCase().includes(word)))
      return h('div', { className: 'moba-fitting-picker' },
        presets.length > 6 && h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 15 }),
          h('input', { type: 'search', value: query, placeholder: t('搜索英雄'), 'aria-label': t('搜索试装英雄'),
            onChange: event => setQuery(event.target.value) })),
        visible.length ? h('div', { className: 'moba-fitting-roster', role: 'group', 'aria-label': t('选择试装英雄') },
          visible.map(hero => {
            const base = hero.tools[item.id]
            const status = base?.includedBy === sourceId ? base : statusWithSource(base, sourceId)
            return h('button', { key: hero.id, type: 'button', 'aria-pressed': selected === hero.id, disabled: Boolean(hero.broken),
              title: hero.broken, onClick: () => onSelect(hero.id) },
              h(HeroArt, { ...hero, className: 'moba-pairing-portrait' }),
              h('span', null, h('strong', null, hero.name),
                h('small', null, hero.broken ? t('英雄不可用')
                  : item.kind === 'tool' && !sourceId ? t('待选来源')
                    : cardState(item, status ?? { state: 'unavailable' }, false))))
          })) : h('p', { className: 'moba-empty' }, t('没有找到符合条件的英雄。')))
    }

    function FittingPartner({ items, partner, onSelect, sources, sourceId, onSource }) {
      const [query, setQuery] = useState('')
      const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      const matches = items.filter(item => item.id === partner?.id || words.every(word =>
        [item.name, item.summary, item.module].filter(Boolean).join(' ').toLocaleLowerCase().includes(word)))
      return h('details', { className: 'moba-fitting-partner', open: Boolean(partner) },
        h('summary', null, partner ? t('第二件装备 · ') + partner.name : t('加入第二件装备')),
        h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 15 }),
          h('input', { type: 'search', value: query, placeholder: t('搜索装备'), 'aria-label': t('搜索第二件装备'),
            onChange: event => setQuery(event.target.value) })),
        h('label', { className: 'moba-tool-source' }, t('第二件试装装备'),
          h('select', { value: partner?.id ?? '', onChange: event => onSelect(event.target.value) },
            h('option', { value: '' }, t('单件试装')), matches.map(item => h('option', { key: item.id, value: item.id }, item.name)))),
        partner?.kind === 'tool' && (sources.length > 0
          ? h('label', { className: 'moba-tool-source' }, t('第二件装备来源'),
            h('select', { value: sourceId, onChange: event => onSource(event.target.value) },
              h('option', { value: '', disabled: true }, t('选择工具来源')),
              sources.map(source => h('option', { key: source.id, value: source.id }, source.name ?? source.id.slice(-6)))))
          : h('p', { role: 'status' }, t('这件工具还没有可复用的来源。可以回装备库配置来源。'))))
    }

    function ComboModes({ combo, selected, onSelect, disabled, fitting, upgrade }) {
      if (combo.reason) return h('p', { role: 'status' }, combo.reason)
      const titles = { basic: t('同回合基础连携'), action: t('同回合指定操作'), staged: t('分阶段连携') }
      return h(Fragment, null,
        !upgrade && combo.flagName && h('p', { className: 'moba-pairing-placement' }, t('当前来源战旗 · ') + combo.flagName),
        h('div', { className: 'moba-fitting-modes', role: 'group',
          'aria-label': upgrade ? t('选择战旗升级方式') : fitting ? t('选择试装连携方式') : t('选择连携方式') },
          combo.modes.map(mode => {
            const belowLevel = mode.id === 'staged' && combo.levelGaps.length > 0
            const reason = belowLevel ? t('达到 Lv.') + combo.stagedLevel + t(' 解锁 · ') +
              combo.levelGaps.map(item => item.name + ' Lv.' + item.level +
                (Number.isSafeInteger(item.xpNeeded) ? t('（差 ') + item.xpNeeded + ' XP）' : '')).join('、') : mode.reason
            const reward = mode.reason ? undefined : mode.flag === 'record' ? t('复练 · 验收后记录本局成果') : [mode.flag === 'upgrade' ? t('升级战旗') : t('解锁战旗'),
              mode.heroXp > 0 && t('英雄 +') + mode.heroXp + ' XP',
              mode.gearXp > 0 && t('两件装备各 +') + mode.gearXp + ' XP',
              mode.heroXp === 0 && mode.gearXp === 0 && t('本项经验已领')].filter(Boolean).join(' · ')
            const detail = mode.id === 'basic' ? t('工具须成功调用，插件须加载。')
              : mode.id === 'staged' ? t('查看准备结果后，再发动主装备。')
                : t('先用辅助工具取证，再发动指定操作。')
            return h('button', { type: 'button', key: mode.id, disabled: disabled || Boolean(mode.reason),
              'aria-pressed': upgrade ? undefined : mode.id === selected,
              onClick: () => onSelect(mode.id) },
              h('strong', null, upgrade && !mode.reason ? t('筹备') + titles[mode.id] : titles[mode.id]),
              h('span', null, h('small', null, reason ?? detail), reward && h('small', { className: 'moba-fitting-reward' }, reward)))
          })))
    }

    function comboSteps(pair, preview, mode, actionKey, prepareKey) {
      const staged = mode === 'staged'
      const hasAction = staged || mode === 'action'
      const keys = new Set(preview?.moveKeys?.[mode])
      const groups = hasAction ? pair.map(item => ({ item, moves: comboActions(item, staged).filter(move => keys.has(move.key)) }))
        .filter(group => group.moves.length) : empty
      const group = groups.find(group => group.moves.some(move => move.key === actionKey))
      const action = group?.moves.find(move => move.key === actionKey)
      const support = group && pair.find(item => item !== group.item)
      const preparations = staged ? comboActions(support, true).filter(move => !move.operation || move.operation !== action?.operation) : empty
      const prepare = preparations.find(move => move.key === prepareKey)
      const needsPrepare = staged && support && support.kind !== 'tool'
      return { staged, hasAction, groups, action, support, preparations, prepare, needsPrepare,
        ready: !hasAction || Boolean(action && ((!prepareKey && !needsPrepare) || prepare)) }
    }

    function ComboStepFields({ steps, actionKey, prepareKey, onAction, onPrepare, disabled }) {
      const { staged, groups, action, support, preparations, prepare, needsPrepare } = steps
      return h(Fragment, null,
        h('label', null, staged ? t('发动操作') : t('连携操作'),
          h('select', { value: actionKey, disabled, onChange: event => onAction(event.target.value) },
            h('option', { value: '', disabled: true }, staged ? t('选择主装备的操作') : t('选择同回合操作')),
            actionKey && !action && h('option', { value: actionKey, disabled: true }, t('上次选择的操作当前不可用')),
            groups.map(({ item, moves }) => h('optgroup', { key: item.id, label: item.name },
              moves.map(move => h('option', { key: move.key, value: move.key }, actionLabel(move))))))),
        staged && support && (preparations.length > 0 || needsPrepare) && h('label', null, t('准备操作'),
          h('select', { value: prepareKey, disabled, onChange: event => onPrepare(event.target.value) },
            h('option', { value: '', disabled: needsPrepare }, needsPrepare ? t('选择「') + support.name + t('」的操作') : t('用 ') + support.name + t(' 取证')),
            prepareKey && !prepare && h('option', { value: prepareKey, disabled: true }, t('上次选择的操作当前不可用')),
            preparations.map(move => h('option', { key: move.key, value: move.key }, actionLabel(move))))))
    }

    function comboStepHint({ staged, action, support, prepare, needsPrepare }) {
      if (!action) return staged ? t('选择发动操作。另一件装备负责准备。') : t('选择要在同一回合发动的装备操作。')
      if (!staged) return t('先用 ') + support.name + t(' 取得依据，再执行「') + action.name + '」。'
      if (needsPrepare && !prepare) return t('为 ') + support.name + t(' 选择准备操作。')
      return (prepare ? t('先执行「') + actionLabel(prepare) + '」。' : t('用 ') + support.name + t(' 取证。'))
        + t('查看结果后，') + (action.kind ? t('完成「') : t('在新回合发动「')) + actionLabel(action) + '」。'
    }

    function PairingPreview({ pairing, request, onClose, onAdopt }) {
      const { item, presets, catalogItems, againstDraft, baselineLabel, hasOpening, fitting } = pairing
      const tool = item.kind === 'tool'
      const sources = fitting && tool ? fittingToolSources(item, presets) : pairing.sources
      const [heroId, setHeroId] = useState(pairing.hero.id)
      const hero = fitting ? presets.find(item => item.id === heroId) : pairing.hero
      const [sourceId, setSourceId] = useState(pairing.sourceId || (fitting && sources?.length === 1 ? sources[0].id : ''))
      const [partnerId, setPartnerId] = useState('')
      const [partnerSourceId, setPartnerSourceId] = useState('')
      const partner = catalogItems?.find(item => item.id === partnerId)
      const partnerSources = partner?.kind === 'tool' ? fittingToolSources(partner, presets) : empty
      const [checked, setChecked] = useState(null)
      const [chosenMode, setChosenMode] = useState(null)
      const [chosenSteps, setChosenSteps] = useState(null)
      const [attempt, retry] = useState(0)
      const [activeDelta, setActiveDelta] = useState('')
      const ready = (!tool || Boolean(sourceId)) && (partner?.kind !== 'tool' || Boolean(partnerSourceId))
      const key = JSON.stringify([heroId, sourceId, partnerId, partnerSourceId])
      const current = checked?.key === key ? checked : undefined
      const result = current?.value
      const error = current?.error
      const action = fitting ? 'equipment-fitting-preview' : 'equipment-pairing-preview'
      useEffect(() => {
        if (!ready) return
        const abort = new AbortController()
        request(action, { action, id: item.id, heroId,
          sourceId: sourceId || undefined, againstDraft,
          ...(partnerId && { partner: { id: partnerId, sourceId: partnerSourceId || undefined } }) }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setChecked({ key, value }) })
          .catch(reason => { if (!abort.signal.aborted) setChecked({ key, error: reason.message }) })
        return () => abort.abort()
      }, [attempt, request, action, item.id, heroId, sourceId, partnerId, partnerSourceId, ready, key, againstDraft])

      function selectPartner(id) {
        if (id === partnerId) return
        const selected = catalogItems.find(item => item.id === id)
        const options = selected?.kind === 'tool' ? fittingToolSources(selected, presets) : empty
        const status = hero.tools[id]
        const equippedSource = againstDraft?.presetId === heroId ? againstDraft.equipmentSources?.[id] : undefined
        const preferred = equippedSource ?? status?.sourceId ?? status?.includedBy
        const defaultSource = options.find(option => option.id === preferred)?.id ?? (options.length === 1 ? options[0].id : '')
        setChecked(null)
        setActiveDelta('')
        setPartnerId(id)
        setPartnerSourceId(defaultSource)
      }

      const keepDraft = fitting && pairing.withDraft && againstDraft?.presetId === heroId
      const placement = { included: keepDraft ? t('当前出装已提供') : t('基础阵容自带'), profile: t('Profile 已加载'), selected: t('加入出装') }
      const timing = { turn: t('回合触发'), condition: t('按条件启用'), startup: t('开局核验') }
      const fittedPair = result?.slots
      const modes = result?.combo?.modes.filter(mode => !mode.reason)
      const comboMode = modes?.find(mode => chosenMode?.key === key && chosenMode.id === mode.id) ?? modes?.[0]
      const currentSteps = chosenSteps?.key === key && chosenSteps.mode === comboMode?.id ? chosenSteps : undefined
      const actionKey = currentSteps?.action ?? comboMode?.move?.key ?? ''
      const prepareKey = currentSteps?.prepare ?? ''
      const fittedGear = fittedPair?.map(slot => ({ ...slot.item, trialActions: slot.trialActions })) ?? empty
      const steps = comboSteps(fittedGear, result?.combo, comboMode?.id, actionKey, prepareKey)
      const canPrepare = comboMode && steps.ready
      return h(InstallDialog, { title: fitting ? t('英雄试装') : t('实战搭配试装'),
        className: fitting ? 'moba-pairing-dialog moba-fitting-dialog' : 'moba-pairing-dialog', onCancel: onClose },
        h('div', { className: 'moba-pairing-target' },
          h(ItemArt, { item: result?.item ?? item }),
          h('div', null, h('strong', null, item.name), h('small', null, hero.name))),
        tool && sources.length > 0 && h('label', { className: 'moba-tool-source' }, fitting ? t('试装来源') : t('原工具来源'),
          h('select', { value: sourceId, onChange: event => {
            setChecked(null); setActiveDelta(''); setSourceId(event.target.value)
          } }, h('option', { value: '', disabled: true }, fitting ? t('选择工具来源') : t('选择这位英雄用过的来源')),
          sources.map(source => h('option', { key: source.id, value: source.id }, source.name ?? source.id.slice(-6))))),
        fitting && h(FittingHeroes, { item, presets, selected: heroId, sourceId, onSelect: id => {
          if (id === heroId) return
          setChecked(null); setActiveDelta(''); setHeroId(id)
        } }),
        fitting && catalogItems.length > 1 && h(FittingPartner, { items: catalogItems.filter(other => other.id !== item.id),
          partner, sources: partnerSources, sourceId: partnerSourceId, onSelect: selectPartner, onSource: id => {
            setChecked(null); setActiveDelta(''); setPartnerSourceId(id)
          } }),
        fitting && tool && !sources.length && h('p', { className: 'moba-alert', role: 'status' },
          t('这件工具还没有可复用的来源。可以回装备库配置来源。')),
        error && h('p', { className: 'moba-alert', role: 'alert' }, error, ' ',
          h('button', { type: 'button', className: 'moba-text', onClick: () => { setChecked(null); retry(value => value + 1) } }, t('重试'))),
        !result && !error && ready && h('p', { role: 'status' }, fitting ? t('正在核对试装阵容…') : t('正在核对原装备和阵容…')),
        result?.unavailable && h('p', { className: 'moba-alert', role: 'status' }, result.unavailable),
        result?.comparison && h(Fragment, null,
          fittedPair ? h('section', { className: 'moba-fitting-combo', 'aria-label': t('连携试装') },
            h('ul', { className: 'moba-opening-gear' }, fittedPair.map(slot => h('li', { key: slot.item.id },
              h(ItemArt, { item: slot.item }), h('div', null, h('strong', null, slot.item.name),
                slot.item.sourceName && h('span', null, slot.item.sourceName),
                h('span', null, [slot.placement === 'included' ? t('由试装阵容提供') : placement[slot.placement],
                  timing[slot.timing]].filter(Boolean).join(' · ')))))),
            h(ComboModes, { combo: result.combo, selected: comboMode?.id, fitting: true,
              onSelect: id => {
                if (id !== comboMode?.id) setChosenSteps(null)
                setChosenMode({ key, id })
              } }),
            steps.hasAction && h('div', { className: 'moba-quest-form moba-fitting-steps' },
              h(ComboStepFields, { steps, actionKey, prepareKey,
                onAction: action => setChosenSteps({ key, mode: comboMode.id, action }),
                onPrepare: prepare => setChosenSteps({ key, mode: comboMode.id, action: actionKey, prepare }) }),
              h('p', { className: 'moba-match-action-note' }, comboStepHint(steps))))
            : h('p', { className: 'moba-pairing-placement' }, [placement[result.placement], timing[result.timing]].filter(Boolean).join(' · ')),
          result.removed.length > 0 && h('p', { className: 'moba-pairing-removals' }, t('采用时将卸下 ') + result.removed.join('、') + '。'),
          result.restored?.length > 0 && h('p', { className: 'moba-pairing-placement' }, t('采用时将恢复 ') + result.restored.join('、') + '。'),
          h('div', { className: 'moba-comparison-roster' },
            h(ComparisonHero, { hero: result.comparison.before, label: baselineLabel }),
            h(Glyph, { kind: 'arrow', size: 23 }),
            h(ComparisonHero, { hero: result.comparison.after, label: t('试装阵容') })),
          h(CapabilityDifferences, { result: result.comparison, activeDelta, setActiveDelta }),
          h('p', { className: 'moba-comparison-note' },
            (keepDraft ? t('采用后更新当前出装。') : t('采用后载入这位英雄的基础阵容和试装装备。')) +
            (hasOpening ? fitting ? t('已有开局委托可在采用后重新核对。') : t('当前开局委托会随出装重置。') : ''))),
        h('div', { className: 'moba-market-actions moba-pairing-actions' },
          h('button', { type: 'button', className: 'moba-roster-open', onClick: onClose }, t('返回装备库')),
          h('button', { type: 'button', className: 'moba-roster-open', disabled: !result?.draft || (partner && !canPrepare),
            onClick: () => onAdopt(result, true, comboMode && { id: comboMode.id, actionKey: steps.action?.key, prepareKey: steps.prepare?.key }) },
            partner ? t('试装并筹备连携') : t('试装并筹备试炼')),
          h('button', { type: 'button', className: 'moba-start', disabled: !result?.draft,
            onClick: () => onAdopt(result) }, t('采用试装'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function LoadoutMoves({ draftKey, revision, request, onTrial, onDelivery }) {
      const [open, setOpen] = useState(false)
      const [query, setQuery] = useState('')
      const [limit, setLimit] = useState(6)
      const [attempt, retry] = useState(0)
      const [loaded, setLoaded] = useState(null)
      const search = useRef(null)
      const key = JSON.stringify([draftKey, revision, attempt])
      useEffect(() => {
        if (!open) return
        const abort = new AbortController()
        const action = 'growth-opening-choices'
        request(action, { action, draft: JSON.parse(draftKey), describe: true }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setLoaded({ key, value }) })
          .catch(reason => { if (!abort.signal.aborted) setLoaded({ key, error: reason.message }) })
        return () => abort.abort()
      }, [open, key, draftKey, request])
      const state = loaded?.key === key ? loaded : undefined
      const { hero, heroActions, choices } = state?.value ?? emptyMap
      useEffect(() => {
        if (open && search.current && document.activeElement === search.current.closest('details')?.firstElementChild) {
          search.current.focus()
        }
      }, [open, state])
      const picked = useMemo(() => new Set(JSON.parse(draftKey).equipmentIds), [draftKey])
      const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
      const gearOrder = { effect: 0, tool: 1, plugin: 2 }
      const kindLabel = { effect: t('工作流程'), tool: t('工具'), plugin: t('会话插件') }
      const timingLabel = { startup: t('开局核验'), turn: t('回合触发'), condition: t('按条件启用') }
      const gear = choices?.slice().sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id))
        || Number(a.profile) - Number(b.profile) || (gearOrder[a.kind] ?? 2) - (gearOrder[b.kind] ?? 2)
        || a.name.localeCompare(b.name, activeLanguage.getSnapshot())) ?? empty
      const groups = [
        ...(heroActions?.length ? [{ item: hero, moves: heroActions, hero: true }] : []),
        ...gear.map(item => ({ item, moves: item.trialActions })),
      ].flatMap(group => {
        const { item } = group
        const metadata = [group.hero ? t('英雄操作')
          : item.profile ? t('Profile 插件') : item.transport ? t('执行器工具')
            : kindLabel[item.kind], item.sourceName, timingLabel[item.timing]].filter(Boolean)
        const moves = group.moves.filter(move => {
          const text = [item.name, ...metadata, actionLabel(move), move.detail].filter(Boolean).join(' ').toLocaleLowerCase()
          return terms.every(term => text.includes(term))
        })
        return moves.length ? [{ ...group, moves, metadata }] : []
      })
      return h('details', { className: 'moba-loadout-moves', onToggle: event => setOpen(event.currentTarget.open) },
        h('summary', null, h(Glyph, { kind: 'action', size: 16 }), t('当前阵容打法')),
        open && h(Fragment, null,
          state?.error ? h('p', { className: 'moba-alert', role: 'alert' }, state.error, ' ',
            h('button', { type: 'button', className: 'moba-text', onClick: () => retry(value => value + 1) }, t('重试')))
            : !state ? h('p', { className: 'moba-empty', role: 'status' }, t('正在核对可用操作…'))
              : h(Fragment, null,
                h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 16 }),
                  h('input', { ref: search, type: 'search', value: query, placeholder: t('搜索装备、来源或操作'), 'aria-label': t('搜索当前阵容打法'),
                    onChange: event => { setQuery(event.target.value); setLimit(6) } })),
                groups.length ? h('ul', { className: 'moba-delta-list' }, groups.slice(0, limit).map(group => {
                  const { item, moves, metadata } = group
                  const prepare = group.hero ? onDelivery : onTrial
                  return h('li', { key: (group.hero ? 'hero:' : 'gear:') + item.id },
                    group.hero ? h(HeroArt, { ...item, className: 'moba-loadout-portrait' }) : h(ItemArt, { item }),
                    h('div', null, h('strong', null, item.name),
                      h('span', { className: 'moba-capability-kind' }, metadata.join(' · ')),
                      h(DecisionList, { moves: moves.map(move => [actionLabel(move),
                        [move.detail, move.mastered ? t('试炼奖励已领取') : move.requiresInput && t('发动时需填写任务或材料')].filter(Boolean).join(' ')]),
                        actionKeys: moves.map(move => move.mastered ? null : move.key),
                        actionLabel: group.hero ? t('筹备交付') : t('筹备试炼'),
                        onAction: prepare && ((moveKey, title) => prepare(item, moveKey, title.slice(0, 80))) })))
                })) : h('p', { className: 'moba-empty', role: 'status' }, t('没有符合搜索的操作。')),
                groups.length > limit && h('button', { type: 'button', className: 'moba-text moba-loadout-more',
                  onClick: () => setLimit(value => value + 6) }, t('查看更多装备操作')))))
    }

    function LoadoutComparison({ id, presets, savedBuilds, plans, against, onAgainst, presetId, equipmentIds, equipmentSources, removedEquipmentIds,
      source, request, revision, enabled, close, onTrial, onDelivery }) {
      const plan = plans.find(item => 'plan:' + item.id === against && !item.broken)
      const againstValue = plan || !against.startsWith('plan:') ? against : ''
      const againstId = plan?.presetId ?? againstValue
      const [attempt, retry] = useState(0)
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [activeDelta, setActiveDelta] = useState('')
      const heading = useRef(null)
      const draftKey = JSON.stringify({ presetId, equipmentIds, equipmentSources: sourcesFor(equipmentIds, equipmentSources), removedEquipmentIds })
      useEffect(() => {
        heading.current?.focus({ preventScroll: true })
        heading.current?.scrollIntoView({ block: 'nearest' })
      }, [])
      useEffect(() => {
        setResult(null)
        setError('')
        if (!enabled) return
        const abort = new AbortController()
        const timer = setTimeout(() => {
          request('compare', { action: 'compare', presetId, equipmentIds, againstPresetId: againstId || undefined,
            equipmentSources: sourcesFor(equipmentIds, equipmentSources), removedEquipmentIds,
            sourceSessionId: source?.sessionId, sourcePresetId: source?.presetId }, abort.signal)
            .then(value => { if (!abort.signal.aborted) setResult(value) })
            .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        }, 180)
        return () => { clearTimeout(timer); abort.abort() }
      }, [againstId, attempt, enabled, equipmentIds, equipmentSources, removedEquipmentIds, presetId, request, revision, source])

      return h('section', { className: 'moba-comparison', id, 'aria-labelledby': id + '-heading' },
        h('header', { className: 'moba-comparison-header' },
          h('h2', { ref: heading, tabIndex: -1, id: id + '-heading' }, t('阵容对照')),
          h('label', null, t('对照对象'), h('select', { value: againstValue, title: plan?.name ?? savedBuilds.find(build => build.id === against)?.label,
            onChange: event => onAgainst(event.target.value) },
            h('option', { value: '' }, source?.sessionId ? t('原会话阵容') : t('当前英雄基础阵容')),
            presets.filter(hero => !hero.broken).map(hero => h('option', { value: hero.id, key: hero.id }, hero.name)),
            plans.some(item => !item.broken) && h('optgroup', { label: t('出装方案') }, plans.filter(item => !item.broken)
              .map(item => h('option', { value: 'plan:' + item.id, key: item.id }, item.name + ' · ' + item.heroName))),
            savedBuilds.length > 0 && h('optgroup', { label: t('已保存阵容') }, savedBuilds.filter(build => !build.broken)
              .map(build => h('option', { value: build.id, key: build.id }, build.label))))),
          h('button', { className: 'moba-icon-action', type: 'button', 'aria-label': t('收起对照'), onClick: close },
            h(Glyph, { kind: 'close' }))),
        !enabled ? h('p', { className: 'moba-empty', role: 'status' }, t('请先处理当前阵容中无法装配的装备。'))
          : error ? h('div', { className: 'moba-alert', role: 'alert' }, error,
            h('button', { type: 'button', onClick: () => retry(value => value + 1) }, t('重试')))
          : !result ? h('p', { className: 'moba-empty', role: 'status' }, t('正在比对阵容…'))
          : h(Fragment, null,
            h('div', { className: 'moba-comparison-roster' },
              h(ComparisonHero, { hero: result.before, label: result.live ? t('原会话') : t('对照阵容'), planName: plan?.name }),
              h(Glyph, { kind: 'arrow', size: 23 }),
              h(ComparisonHero, { hero: result.after, label: t('待锁定阵容') })),
            h('p', { className: 'moba-comparison-note' }, t('根据已登记的能力推算。以开局后「对局装备」的实际状态为准。'))),
        enabled && h(LoadoutMoves, { draftKey, revision, request, onTrial, onDelivery }),
        enabled && result && !error && h(CapabilityDifferences, { result, activeDelta, setActiveDelta, onTrial, onDelivery }))
    }

    function RemovedEquipment({ labels }) {
      if (!labels.length) return null
      return h('details', { className: 'moba-removed-equipment' },
        h('summary', null, t('已卸下 ') + labels.length + t(' 件自带装备')),
        h('p', null, labels.join('、')))
    }

    function PlanEquipment({ items, removed }) {
      return h(Fragment, null,
        items.length > 0 ? h('ul', { className: 'moba-plan-gear' }, items.map(item =>
          h('li', { key: item.id }, h(ItemArt, { item }),
            h('span', null, item.name, item.sourceName && h('small', null, item.sourceName)))))
          : h('p', { className: 'moba-empty' }, removed.length ? t('调整英雄自带装备。') : t('沿用英雄自带装备。')),
        h(RemovedEquipment, { labels: removed }))
    }

    const planShareLimit = 16 * 1024
    const lighthouseChallengeLimit = Math.ceil(planShareLimit * 4 / 3) + 100
    const lighthouseInvitationLimit = lighthouseChallengeLimit + 2048
    const planShareStates = { ready: '已核对', missing: '本机缺失', different: '与分享要求不同', unavailable: '不可用' }

    function PlanShareRows({ title, items }) {
      if (!items?.length) return null
      return h('section', { className: 'moba-share-section' }, h('h3', null, title),
        h('ul', { className: 'moba-share-rows' }, items.map((item, index) => {
          const metadata = [item.sourceName, item.version].filter(Boolean).join(' · ')
          return h('li', { key: index, 'data-state': item.state },
            h('div', null, h('strong', null, item.name), metadata && h('span', null, metadata),
              item.reason && h('p', null, item.reason)),
            item.state && h('small', null, t(planShareStates[item.state] ?? '不可用')))
        })))
    }

    function PlanShareRequirements({ value, showHost = true }) {
      const { host, hero, gear, dependencies } = value
      return h(Fragment, null,
        showHost && host && h('dl', { className: 'moba-share-host', 'data-state': host.state },
          h('dt', null, t('分享码的 DSH 版本')), h('dd', null, host.version),
          host.current && h(Fragment, null, h('dt', null, t('当前 DSH 版本')), h('dd', null, host.current)),
          host.state && h(Fragment, null, h('dt', null, t('版本核对')), h('dd', null, t(planShareStates[host.state] ?? '不可用')))),
        hero && h(PlanShareRows, { title: t('英雄'), items: [hero] }),
        h(PlanShareRows, { title: t('要装备'), items: gear?.filter(item => item.operation !== 'remove') }),
        h(PlanShareRows, { title: t('要卸下的自带装备'), items: gear?.filter(item => item.operation === 'remove') }),
        h(PlanShareRows, { title: t('所需依赖'), items: dependencies }))
    }

    function ExportPlanShare({ plan, request, onBack }) {
      const language = useLanguage()
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const heading = useRef(null)
      const field = useRef(null)
      useEffect(() => heading.current?.focus(), [])
      useEffect(() => {
        const abort = new AbortController()
        const action = 'plan-share-export'
        setError('')
        setResult(null)
        request(action, { action, id: plan.id, revision: plan.revision }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setResult(value) })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [request, plan.id, plan.revision, language])

      async function copy() {
        try {
          await navigator.clipboard.writeText(result.code)
          setNotice(t('分享码已复制。'))
        } catch {
          field.current?.focus()
          field.current?.select()
          setNotice(t('分享码已选中，可以手动复制。'))
        }
      }

      return h(Fragment, null,
        h('div', { className: 'moba-plan-fields moba-share-fields' },
          h('h3', { ref: heading, tabIndex: -1 }, plan.name),
          error ? h('p', { className: 'moba-alert', role: 'alert' }, error)
            : !result ? h('p', { className: 'moba-empty', role: 'status' }, t('正在核对分享要求…'))
              : h(Fragment, null,
                h(PlanShareRequirements, { value: result }),
                h(PlanShareRows, { title: t('暂时无法分享'), items: result.blockers }),
                result.reason && h('p', { className: 'moba-alert', role: 'status' }, result.reason),
                result.code && h('label', null, t('出装分享码'),
                  h('textarea', { className: 'moba-share-code', ref: field, readOnly: true, value: result.code, rows: 3,
                    spellCheck: false, onFocus: event => event.currentTarget.select() }),
                  h('span', null, t('分享码包含方案名称和装备要求。'))),
                notice && h('p', { className: 'moba-empty', role: 'status' }, notice))),
        h('footer', { className: 'moba-gallery-footer' },
          h('button', { className: 'moba-roster-open', type: 'button', onClick: onBack }, t('返回方案库')),
          result?.code && h('button', { className: 'moba-start', type: 'button', onClick: copy }, t('复制分享码'))))
    }

    function SharedPlanCapabilities({ comparison, title = '相比英雄基础出装的变化', showEmpty = false }) {
      const groups = comparison ? capabilityChanges(comparison).filter(group => group.cards.length) : empty
      return comparison && (groups.length > 0 || showEmpty) && h('section', { className: 'moba-share-section moba-playbook-comparison' },
        h('h3', null, t(title)),
        !groups.length && h('p', { className: 'moba-lighthouse-note' }, t('已知能力、工具来源和就绪时机均一致。')),
        groups.map(group => h(CapabilityList, { ...group, key: group.tone, disclosure: true,
          heading: group.heading + ' · ' + group.cards.slice(0, 2).map(item => item.name).join(' / ') + ' ' })))
    }

    function sharedGearName(item) {
      return [item?.name, item?.sourceName, item?.version].filter(Boolean).join(' · ')
    }

    function ShareReplacementOptions({ code, row, request, selected, disabled, onChoose }) {
      const language = useLanguage()
      const [term, setTerm] = useState('')
      const [search, setSearch] = useState({ query: '' })
      const [result, setResult] = useState(null)
      const group = useId()
      const key = choice => JSON.stringify([choice.id, choice.sourceId])
      const skipLabel = row.operation === 'remove' ? t('保留这件自带装备') : t('略过这件装备')

      useEffect(() => {
        const abort = new AbortController()
        const action = 'plan-share-options'
        setResult(null)
        request(action, { action, code, slot: row.slot, query: search.query || undefined }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setResult(value) })
          .catch(reason => { if (!abort.signal.aborted) setResult({ error: reason.message }) })
        return () => abort.abort()
      }, [request, code, row.slot, search, language])

      function find() {
        setSearch({ query: term.trim() })
      }

      return h('div', { className: 'moba-share-options' },
        row.operation !== 'remove' && h('div', { className: 'moba-share-search' },
          h('label', null, t('搜索本机装备'),
            h('input', { type: 'search', value: term, maxLength: 80, disabled, onChange: event => setTerm(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); find() } } })),
          h('button', { type: 'button', className: 'moba-roster-open', disabled, onClick: find }, t('搜索'))),
        !result ? h('p', { className: 'moba-empty', role: 'status' }, t('正在核对本机装备…'))
          : result.error ? h('p', { className: 'moba-alert', role: 'alert' }, result.error, ' ',
            h('button', { type: 'button', className: 'moba-text', disabled, onClick: find }, t('重试')))
            : h('fieldset', { className: 'moba-share-option-list', disabled },
              h('legend', null, t('本机选择')),
              h('label', { className: 'moba-starter-route', 'data-picked': !selected },
                h('input', { type: 'radio', name: group, value: '', checked: !selected, onChange: () => onChoose(row.slot) }),
                h('strong', null, row.required ? t('暂未选择替代') : t('沿用原装备要求'))),
              result.choices.map(choice => {
                const picked = selected && !selected.skip && key(selected) === key(choice)
                return h('label', { className: 'moba-starter-route', key: key(choice), 'data-picked': Boolean(picked) },
                  h('input', { type: 'radio', name: group, value: key(choice), checked: Boolean(picked),
                    onChange: () => onChoose(row.slot, choice) }),
                  h('span', null, h('strong', null, choice.name),
                    h('small', null, [choice.sourceName, choice.version].filter(Boolean).join(' · ')),
                    choice.note && h('small', null, choice.note),
                    choice.decisions?.length > 0 && h('small', null, choice.decisions.map(([title]) => title).join(' / '))))
              }),
              !result.choices.length && h('p', { className: 'moba-empty' }, t('没有找到可选的本机装备。')),
              result.more && h('p', { className: 'moba-empty' }, t('缩小搜索范围，查看更多匹配。')),
              result.canSkip && h('label', { className: 'moba-starter-route', 'data-picked': Boolean(selected?.skip) },
                h('input', { type: 'radio', name: group, value: 'skip', checked: Boolean(selected?.skip),
                  onChange: () => onChoose(row.slot, { skip: true, name: skipLabel }) }),
                h('strong', null, skipLabel))))
    }

    function ShareAdaptation({ code, value, request, choices, disabled, onChoose, onCompare }) {
      const [open, setOpen] = useState(null)
      const slots = [...value.slots].sort((left, right) => Number(right.required) - Number(left.required))
      return h('section', { className: 'moba-share-adaptation' },
        h('h3', null, t('比较本机换装')),
        value.hero && h('p', null, sharedGearName(value.hero),
          value.hero.previousVersion && value.hero.previousVersion !== value.hero.version &&
            ' · ' + t('分享版本') + ' ' + value.hero.previousVersion),
        slots.map(row => h('details', { key: row.slot, open: open === row.slot,
          onToggle: event => {
            if (event.currentTarget.open) setOpen(row.slot)
            else setOpen(current => current === row.slot ? null : current)
          } },
          h('summary', null, h('strong', null, row.name),
            h('span', null, choices[row.slot] ? sharedGearName(choices[row.slot]) : row.required ? t('需要选择') : t('可以调整'))),
          h('div', { className: 'moba-share-original' },
            h('strong', null, t('分享要求')), h('p', null, sharedGearName(row)),
            row.reason && h('p', null, row.reason),
            h(DecisionList, { moves: row.decisions })),
          open === row.slot && h(ShareReplacementOptions, { code, row, request, selected: choices[row.slot], disabled, onChoose }))),
        h('button', { type: 'button', className: 'moba-roster-open', disabled, onClick: onCompare },
          h(Glyph, { kind: 'swap', size: 16 }), t('核对本机换装')))
    }

    function SharedAdaptationReview({ result, adaptation, heading, choices }) {
      const dependencyStates = { added: '新增依赖', removed: '移除依赖', changed: '版本或来源变化' }
      const unresolved = result.unresolved?.map(slot => adaptation.slots.find(row => row.slot === slot)?.name).filter(Boolean)
      const companions = [[t('原分享随装组件'), result.beforeCompanions], [t('本机随装组件'), result.afterCompanions]]
      return h('section', { className: 'moba-share-review moba-adapted-review' },
        h('h3', { ref: heading, tabIndex: -1 }, t('本机换装核对')),
        result.changes?.map(change => {
          const original = change.before
          const replacement = change.after
          const selected = choices[change.slot]
          return h('div', { className: 'moba-share-change', key: change.slot },
            h('strong', null, sharedGearName(original)),
            h('p', null, replacement ? '→ ' + sharedGearName(replacement) : selected?.name ?? t('已略过')),
            change.note && h('p', null, change.note),
            original.decisions?.length > 0 && h('p', null, t('原装备提供的工作选择') + ' · ' +
              original.decisions.map(([title]) => title).join(' / ')),
            h(DecisionList, { moves: replacement?.decisions }))
        }),
        result.dependencyChanges?.length > 0 && h(PlanShareRows, { title: t('依赖变动'),
          items: result.dependencyChanges.map(item => ({ name: item.name, sourceName: t(dependencyStates[item.state]),
            version: [item.previousVersion, item.version].filter(Boolean).join(' → ') })) }),
        h(PlanShareRows, { title: t('还会卸下的自带装备'), items: result.additionalRemovals }),
        companions.map(([title, items]) => items && (items.length ? h(PlanShareRows, { key: title, title, items })
          : h('section', { className: 'moba-share-section', key: title },
            h('h3', null, title), h('p', { className: 'moba-empty' }, t('无随装组件'))))),
        unresolved?.length > 0 && h('p', { className: 'moba-alert', role: 'status' },
          t('仍需选择替代') + ' · ' + unresolved.join(' / ')),
        result.reason && h('p', { className: 'moba-alert', role: 'status' }, result.reason),
        h(PlanShareRequirements, { value: result }),
        h(SharedPlanCapabilities, { comparison: result.comparison }))
    }

    function ImportPlanShare({ request, hasOpening, onBack, onImport }) {
      const language = useLanguage()
      const [code, setCode] = useState('')
      const [preview, setPreview] = useState(null)
      const [adapted, setAdapted] = useState(null)
      const [choices, setChoices] = useState({})
      const [error, setError] = useState('')
      const [checking, setChecking] = useState(false)
      const field = useRef(null)
      const previewHeading = useRef(null)
      const adaptedHeading = useRef(null)
      const pending = useRef(null)
      useEffect(() => {
        field.current?.focus()
        return () => pending.current?.abort()
      }, [])
      useEffect(() => previewHeading.current?.focus(), [preview])
      useEffect(() => adaptedHeading.current?.focus(), [adapted])

      async function check(adapt = false) {
        if (pending.current || !code.trim()) return
        const abort = new AbortController()
        pending.current = abort
        setChecking(true)
        setAdapted(null)
        if (!adapt) { setPreview(null); setChoices({}) }
        setError('')
        const action = adapt ? 'plan-share-adapt' : 'plan-share-preview'
        const selected = Object.entries(choices).map(([slot, choice]) => choice.skip ? { slot: Number(slot), skip: true }
          : { slot: Number(slot), id: choice.id, sourceId: choice.sourceId })
        try {
          const value = await request(action, { action, code: code.trim(), ...(adapt && { choices: selected }) }, abort.signal, language)
          if (!abort.signal.aborted) (adapt ? setAdapted : setPreview)(value)
        } catch (reason) {
          if (!abort.signal.aborted) setError(reason.message)
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setChecking(false)
        }
      }

      function choose(slot, choice) {
        setChoices(current => {
          const next = { ...current }
          if (choice) next[slot] = choice
          else delete next[slot]
          return next
        })
        setAdapted(null)
        setError('')
      }

      const current = adapted ?? preview
      const canAdopt = current && !current.blocked && current.draft
      return h('form', { className: 'moba-plan-form', onSubmit: event => { event.preventDefault(); check() } },
        h('div', { className: 'moba-plan-fields moba-share-fields' },
          h('label', null, t('出装分享码'),
            h('textarea', { className: 'moba-share-code', ref: field, required: true, value: code, rows: 3, maxLength: planShareLimit,
              readOnly: checking, spellCheck: false, autoComplete: 'off', autoCapitalize: 'off',
              onChange: event => { setCode(event.target.value); setPreview(null); setAdapted(null); setChoices({}); setError('') } })),
          error && h('p', { className: 'moba-alert', role: 'alert' }, error),
          checking && h('p', { className: 'moba-empty', role: 'status' }, t('正在核对分享要求…')),
          preview && h('div', { className: 'moba-share-review' },
            h('h3', { ref: previewHeading, tabIndex: -1 }, preview.name),
            preview.note && h('p', { className: 'moba-plan-note' }, preview.note),
            preview.adaptation ? h('details', { className: 'moba-share-exact' },
              h('summary', null, t('原分享要求')), h(PlanShareRequirements, { value: preview }))
              : h(PlanShareRequirements, { value: preview }),
            h(SharedPlanCapabilities, { comparison: preview.comparison }),
            preview.blocked && h('p', { className: 'moba-alert', role: 'status' },
              preview.reason ?? (preview.adaptation ? t('原分享要求尚未满足。可以比较本机换装。')
                : t('请处理上方的装备或版本要求，再重新核对。'))),
            preview.adaptation && h(ShareAdaptation, { code: code.trim(), value: preview.adaptation, request,
              choices, disabled: checking, onChoose: choose, onCompare: () => check(true) }),
            adapted && h(SharedAdaptationReview, { result: adapted, adaptation: preview.adaptation, heading: adaptedHeading, choices }),
            canAdopt && h('p', { className: 'moba-starter-note' }, t('确认后替换大厅中的出装草稿。'),
              hasOpening && ' ' + t('当前筹备的开局委托也会清空。')))),
        h('footer', { className: 'moba-gallery-footer' },
          h('button', { className: 'moba-roster-open', type: 'button', onClick: onBack }, t('返回方案库')),
          h('button', { className: canAdopt ? 'moba-roster-open' : 'moba-start', type: 'submit',
            disabled: checking || !code.trim() }, preview ? t('重新核对分享码') : t('核对分享码')),
          canAdopt && h('button', { className: 'moba-start', type: 'button', onClick: () => onImport(current) },
            adapted ? t('采用换装草稿') : t('采用分享出装'), h(Glyph, { kind: 'arrow', size: 17 }))))
    }

    function LessonLoadoutTask({ source, workspaces, initialWorkspaceId, rebaseline, request, onBack, onVisit,
      backLabel = rebaseline ? '返回任务结果' : '返回记录' }) {
      const language = useLanguage()
      const workspaceSetup = useContext(WorkspaceSetupContext)
      const [loaded, setLoaded] = useState(null)
      const [attempt, retry] = useState(0)
      const [opening, setOpening] = useState(false)
      const [addedWorkspace, setAddedWorkspace] = useState(null)
      const { kind, comparisonId, arm } = source
      const reference = JSON.stringify([kind, comparisonId, arm])
      const membership = JSON.stringify(workspaces.map(item => item.workspaceId).sort())
      const current = loaded?.reference === reference ? loaded : null
      const refreshed = current?.membership === membership && current?.attempt === attempt
      const options = current?.value
      const allowed = options ? workspaces.filter(item => options.workspaceIds.includes(item.workspaceId)) : empty
      const addedVisible = addedWorkspace && workspaces.some(item => item.workspaceId === addedWorkspace.id)
      const addedAllowed = refreshed && !current.error && addedWorkspace && allowed.some(item => item.workspaceId === addedWorkspace.id)
      const waitingForWorkspace = addedWorkspace && !addedAllowed && (!refreshed || !addedVisible)
      const unavailableWorkspace = addedWorkspace && !addedAllowed && refreshed && addedVisible && !current.error
      const setup = workspaceSetup?.add && (workspaceSetup.pick || workspaceSetup.list) ? workspaceSetup : null

      useEffect(() => {
        const action = 'lesson-task-options'
        const abort = new AbortController()
        request(action, { action, kind, comparisonId, arm }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setLoaded({ value, reference, membership, attempt }) })
          .catch(reason => {
            if (!abort.signal.aborted) setLoaded(previous => ({
              value: previous?.reference === reference ? previous.value : undefined,
              error: reason.message, reference, membership, attempt,
            }))
          })
        return () => abort.abort()
      }, [request, kind, comparisonId, arm, attempt, language, reference, membership])

      const stockTaskLabel = kind === 'hero-trial' && stockTrialTaskLabels[arm]
      return h(InstallDialog, { title: t(rebaseline ? rebaselineTaskLabel : stockTaskLabel || lessonTaskLabel), busy: opening,
        className: stockTaskLabel ? 'moba-lighthouse-comparison moba-stock-trial-task' : 'moba-lighthouse-comparison',
        onCancel: onBack, initialFocus: '.moba-task-back', onKeyDown: event => closeDialogOnEscape(event, () => { if (!opening) onBack() }) },
        rebaseline && h('p', { className: 'moba-lighthouse-note' }, t('用原局出装核对当前材料，打开新会话后手动发送，完成后再比较换装。')),
        options ? h(LoadoutTaskForm, { lessonSource: options.source, workspaces: allowed, request,
          initialWorkspaceId: rebaseline?.workspaceId ?? initialWorkspaceId, initialMaterial: rebaseline?.material, initialBrief: rebaseline?.brief, backLabel,
          workspaceSetup: setup, addedWorkspace: addedAllowed ? addedWorkspace : undefined,
          onWorkspaceAdded: id => { setAddedWorkspace({ id }); retry(value => value + 1) },
          onWorkspaceApplied: applied => setAddedWorkspace(current => current === applied ? null : current),
          workspaceStatus: !current?.error && (waitingForWorkspace ? '正在核对新增的工作区…'
            : unavailableWorkspace ? '无法用新添加的文件夹开启此任务。' : ''),
          workspaceError: refreshed ? current?.error : undefined, retryWorkspaces: () => retry(value => value + 1),
          onBack, onOpened: ({ sessionId, task }) => onVisit(sessionId, task), onOpeningChange: setOpening })
          : h(Fragment, null, refreshed && current?.error
            ? h('p', { className: 'moba-alert', role: 'alert' }, current.error)
            : h('p', { className: 'moba-empty', role: 'status' }, t('正在核对练习出装…')),
          h('div', { className: 'moba-market-actions moba-starter-actions' },
            h('button', { className: 'moba-roster-open moba-task-back', type: 'button', onClick: onBack }, t(backLabel)),
            refreshed && current?.error && h('button', { className: 'moba-roster-open', type: 'button',
              onClick: () => retry(value => value + 1) }, t('重试')))))
    }

    function PersonalBaselineTask({ workspaces, ...props }) {
      const { items } = useSyncExternalStore(workspaces.subscribe.bind(workspaces), workspaces.getSnapshot.bind(workspaces))
      return h(LessonLoadoutTask, { ...props, workspaces: items })
    }

    function LoadoutTaskForm({ plan, testedAlternatives = empty, planCatalog, lessonSource, workspaces, initialWorkspaceId,
      initialMaterial = '', initialBrief = '', backLabel = '返回方案库', request, onBack, onOpened, onOpeningChange,
      workspaceSetup, addedWorkspace, onWorkspaceAdded, onWorkspaceApplied, workspaceStatus, workspaceError, retryWorkspaces }) {
      const language = useLanguage()
      const [choices, setChoices] = useState(() => plan ? [plan, ...testedAlternatives] : empty)
      const [selectedPlanId, setSelectedPlanId] = useState(plan?.id)
      const planGroup = useId()
      const version = choices.find(item => item.id === selectedPlanId)
      const [chosenWorkspaceId, setWorkspace] = useState(() => {
        if (!lessonSource || workspaces.some(item => item.workspaceId === initialWorkspaceId)) return initialWorkspaceId ?? ''
        return !initialMaterial && workspaces.length === 1 ? workspaces[0].workspaceId : ''
      })
      const [material, setMaterial] = useState(initialMaterial)
      const [brief, setBrief] = useState(initialBrief)
      const [reviewed, setReviewed] = useState(null)
      const [working, setWorking] = useState('')
      const [error, setError] = useState('')
      const [needsRefresh, setNeedsRefresh] = useState(false)
      const pending = useRef(null)
      const launch = useRef(null)
      const appliedWorkspace = useRef(null)
      const workspaceField = useRef(null)
      const materialField = useRef(null)
      const briefField = useRef(null)
      const reviewHeading = useRef(null)
      const workspace = workspaces.find(item => item.workspaceId === chosenWorkspaceId)
      const preview = reviewed?.value
      const origin = preview?.source ?? lessonSource
      const originArm = origin && comparisonArmConfig(origin.kind, origin.arm, origin.publicEvidenceReplay === true)
      const heroTrialOrigin = origin?.heroDeliveryTrial === true
      const stockTrialHero = origin?.kind === 'hero-trial' && heroTrialHeroes.find(item => item.id === origin.arm)
      const sourceLabel = stockTrialHero ? (origin.heroName ?? t(stockTrialHero.name)) : heroTrialOrigin ? t(minimalDeliveryReplayArm.name)
        : origin && [comparisonArmName(originArm, origin), origin.heroName].filter(Boolean).join(' · ')
      const gearSource = stockTrialHero
        ? origin.gearSources?.map(item => [item.tool, item.name, item.version].filter(Boolean).join(' · ')).join(' / ')
        : heroTrialOrigin && origin.gearSource && [origin.gearSource.name, origin.gearSource.version].filter(Boolean).join(' · ')
      const actionPrefix = lessonSource ? 'lesson-task' : 'plan-task'

      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => {
        if (addedWorkspace && appliedWorkspace.current !== addedWorkspace) {
          appliedWorkspace.current = addedWorkspace
          setWorkspace(addedWorkspace.id)
          setError('')
          onWorkspaceApplied(addedWorkspace)
        }
      }, [addedWorkspace, onWorkspaceApplied])
      useEffect(() => {
        if (!planCatalog) return
        const abort = new AbortController()
        const action = 'evidence-retest-options'
        request(action, { action, id: plan.id, revision: plan.revision }, abort.signal, language)
          .then(options => {
            if (abort.signal.aborted) return
            const alternatives = matchingTaskPlans(planCatalog, options)
            if (alternatives.length) setChoices(current => current[0] === plan ? [plan, ...alternatives] : current)
          })
          .catch(() => {})
        return () => abort.abort()
      }, [planCatalog, plan, request, language])
      useEffect(() => {
        if (preview) reviewHeading.current?.focus()
        else (workspaceField.current?.disabled ? materialField.current : workspaceField.current)?.focus()
      }, [preview])

      function editTask() {
        if (pending.current) return
        setReviewed(null)
        setError('')
      }

      async function review(refresh = false) {
        if (!workspace || !brief.trim() || (!lessonSource && !version) || pending.current) return
        const abort = pending.current = new AbortController()
        setWorking('review')
        setError('')
        try {
          let selected = version
          if (refresh && !lessonSource) {
            const latest = await request('list', null, abort.signal, language)
            if (abort.signal.aborted) return
            const primary = latest.plans.find(item => item.id === plan.id && !item.broken)
            let alternatives = empty
            if (primary?.hasEvidenceOrigin) {
              const action = 'evidence-retest-options'
              const options = await request(action, { action, id: primary.id, revision: primary.revision }, abort.signal, language)
              if (abort.signal.aborted) return
              alternatives = matchingTaskPlans(latest.plans, options)
            }
            const current = primary ? [primary, ...alternatives] : empty
            setChoices(current)
            selected = current.find(item => item.id === selectedPlanId)
            if (!selected) {
              setReviewed(null)
              setNeedsRefresh(false)
              setSelectedPlanId(undefined)
              setError(t(current.length ? '刚选的实战出装已变化，请再选一套。' : '这份出装方案已不可用。'))
              return
            }
          }
          const selector = lessonSource ? { kind: lessonSource.kind, comparisonId: lessonSource.comparisonId, arm: lessonSource.arm }
            : { id: selected.id, revision: selected.revision }
          const input = { ...selector, workspaceId: workspace.workspaceId,
            material: material.trim(), task: brief.trim() }
          const action = actionPrefix + '-preview'
          const value = await request(action, { action, ...input }, abort.signal, language)
          if (!abort.signal.aborted) {
            setReviewed({ value, input, language })
            setNeedsRefresh(false)
          }
        } catch (reason) {
          if (!abort.signal.aborted) {
            setError(reason.message)
            setNeedsRefresh(true)
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setWorking('')
        }
      }

      function submit(event) {
        event.preventDefault()
        materialField.current.setCustomValidity(workspaceMaterialIsRelative(material.trim()) ? '' : t('请输入工作区内的相对文件路径。'))
        briefField.current.setCustomValidity(brief.trim() ? '' : t('请填写新任务说明。'))
        if (event.currentTarget.reportValidity()) void review(needsRefresh)
      }

      async function open() {
        if (pending.current || !preview?.token || needsRefresh) return
        const abort = pending.current = new AbortController()
        const { input, language: reviewLanguage } = reviewed
        const key = JSON.stringify([input, reviewLanguage])
        if (launch.current?.key !== key) {
          const bytes = crypto.getRandomValues(new Uint8Array(16))
          launch.current = { key, id: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') }
        }
        setWorking('open')
        setError('')
        onOpeningChange(true)
        const action = actionPrefix + '-open'
        let result
        try {
          result = await request(action, { action, ...input, token: preview.token, launchId: launch.current.id }, abort.signal, reviewLanguage)
        } catch (reason) {
          if (!abort.signal.aborted) {
            setError(reason.message)
            setNeedsRefresh(true)
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) {
            onOpeningChange(false)
            setWorking('')
          }
        }
        if (!abort.signal.aborted && result) onOpened(result)
      }

      const messages = h(Fragment, null,
        error && h('p', { className: 'moba-alert', role: 'alert' }, error),
        working && h('p', { className: 'moba-empty', role: 'status' }, t(working === 'review' ? '正在核对材料和出装…' : '正在准备对局…')))

      return !preview ? h('form', { className: 'moba-plan-form moba-plan-task', onSubmit: submit },
        h('div', { className: 'moba-plan-fields' },
          origin ? h(Fragment, null, h(InstallFacts, { facts: [[t('练习出装'), sourceLabel], [t('装备来源'), gearSource]] }),
            stockTrialHero?.id === 'minimal' && h('p', { className: 'moba-lighthouse-note' }, t('这套出装适合在对话里交接文字。')),
            h(RematchChangeFacts, { change: origin.change }))
            : choices.length > 0 && (choices.length > 1 || !version) ? h('fieldset', {
              className: 'moba-plan-list moba-task-plan-choices', disabled: Boolean(working),
            }, h('legend', null, t('临场换装')),
              choices.map(item => h('label', { key: item.id, className: 'moba-plan-option', 'data-picked': item.id === selectedPlanId },
                h('input', { type: 'radio', name: planGroup, value: item.id, checked: item.id === selectedPlanId,
                  onChange: () => { setSelectedPlanId(item.id); setError('') } }),
                h(HeroArt, { id: item.heroId, art: item.heroArt, className: 'moba-avatar' }),
                h('span', null, h('strong', null, item.name),
                  typeof item.evidenceEquipped === 'boolean' &&
                    h('small', null, t(item.evidenceEquipped ? '已装备证据核验' : '未装备证据核验')),
                  item.note && h('small', { className: 'moba-plan-note' }, item.note)))))
              : version && h('div', { className: 'moba-plan-save-preview' }, h('strong', null, version.name),
                version.note && h('p', { className: 'moba-plan-note' }, version.note)),
          lessonSource && !workspaces.length &&
            h('p', { className: 'moba-plan-note', role: 'status' }, t(workspaceSetup
              ? '选择含有任务材料的文件夹，即可继续。' : '请先在 DeepSeek Harness 中添加自己的工作区。')),
          h(WorkspaceFileFields, { workspaces, workspaceId: workspace?.workspaceId ?? '', setWorkspaceId: setWorkspace,
            material, setMaterial, workspaceField, materialField, request, busy: Boolean(working),
            materialAction: lessonSource ? 'lesson-task-materials' : undefined, workspaceSetup, onWorkspaceAdded }),
          workspaceStatus && h('p', { className: 'moba-lighthouse-note', role: 'status' }, t(workspaceStatus)),
          workspaceError && h('p', { className: 'moba-alert', role: 'alert' }, t(workspaceError), ' ',
            h('button', { type: 'button', className: 'moba-text', onClick: retryWorkspaces }, t('重试'))),
          h('label', null, t('新任务说明'),
            h('textarea', { ref: briefField, required: true, disabled: Boolean(working), value: brief, rows: 4, maxLength: 1200,
              onChange: event => { event.target.setCustomValidity(''); setBrief(event.target.value) } })), messages),
        h('footer', { className: 'moba-gallery-footer' },
          h('button', { className: 'moba-roster-open moba-task-back', type: 'button', onClick: onBack }, t(backLabel)),
          h('button', { className: 'moba-start', type: 'submit', disabled: Boolean(working) || !workspace || (!lessonSource && !version) },
            t('核对材料和出装'), h(Glyph, { kind: 'arrow', size: 16 }))))
        : h('section', { className: 'moba-plan-form moba-plan-task', onKeyDown: event => closeDialogOnEscape(event, editTask) },
          h('div', { className: 'moba-plan-fields' },
            h('h3', { ref: reviewHeading, tabIndex: -1 }, t('核对材料和出装')),
            h(InstallFacts, { facts: [
              [t(origin ? '练习出装' : '出装方案'), sourceLabel ?? preview.planName ?? version?.name],
              [t('装备来源'), gearSource],
              [t('工作区'), workspace ? workspaceFileLabel(workspace, workspaces) : preview.workspaceTitle],
              [t('材料文件相对路径'), preview.material],
            ] }),
            origin && h(RematchChangeFacts, { change: origin.change }),
            preview.planNote && h('p', { className: 'moba-plan-note' }, preview.planNote),
            (preview.gear?.length || preview.token) && h(PlanEquipment, {
              items: preview.gear ?? version?.items ?? empty, removed: preview.removed ?? version?.removed }),
            h(SharedPlanCapabilities, { comparison: preview.comparison }),
            preview.task && h('label', null, t('即将填入会话的任务'), h('textarea', { readOnly: true, rows: 5, value: preview.task })),
            h('p', { className: 'moba-plan-note' }, t('确认后打开新会话。检查输入栏的任务，再手动发送。')),
            preview.reason && h('p', { className: 'moba-alert', role: 'status' }, preview.reason), messages),
          h('footer', { className: 'moba-gallery-footer' },
            h('button', { className: 'moba-roster-open', type: 'button', disabled: Boolean(working), onClick: editTask }, t('返回编辑任务')),
            (needsRefresh || !preview.token) && h('button', { className: 'moba-roster-open', type: 'button', disabled: Boolean(working) || !workspace,
              onClick: () => review(true) }, t('重新核对材料和出装')),
            h('button', { className: 'moba-start', type: 'button', disabled: Boolean(working) || needsRefresh || !preview.token,
              onClick: open }, t('确认并打开会话'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    const evidenceRetestLabel = '用新材料再试这两套'
    const evidenceRetestStale = '实战出装或工作区已变化。请关闭并重新打开出装方案，再选择。'

    function planMatchesRevision(plan, reference) {
      return plan.id === reference.id && plan.revision === reference.revision
    }

    function matchingTaskPlans(catalog, options) {
      return catalog.filter(item => !item.broken &&
        options.alternatives.some(reference => planMatchesRevision(item, reference)))
    }

    function SavedPlanComparison({ plan, plans, workspaces, initialWorkspaceId, request, onBack, onOpened, onOpeningChange,
      evidenceRetest }) {
      const language = useLanguage()
      const [updatedPlans, setUpdatedPlans] = useState(null)
      const [otherId, setOtherId] = useState(() => evidenceRetest?.alternatives.length === 1 ? evidenceRetest.alternatives[0].id : '')
      const [chosenWorkspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? '')
      const [material, setMaterial] = useState('')
      const [brief, setBrief] = useState('')
      const [checked, setChecked] = useState(null)
      const [working, setWorking] = useState('')
      const [error, setError] = useState('')
      const [needsRefresh, setNeedsRefresh] = useState(false)
      const pending = useRef(null)
      const launch = useRef(null)
      const otherField = useRef(null)
      const materialField = useRef(null)
      const briefField = useRef(null)
      const reviewHeading = useRef(null)
      const catalog = updatedPlans ?? plans
      const left = catalog.find(item => evidenceRetest ? planMatchesRevision(item, plan) : item.id === plan.id)
      const alternatives = catalog.filter(item => item.id !== plan.id)
      const right = alternatives.find(item => item.id === otherId)
      const workspace = workspaces.find(item => item.workspaceId === chosenWorkspaceId)
      const canReview = Boolean(left && !left.broken && right && !right.broken && workspace)
      const preview = checked?.value

      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => {
        if (preview) reviewHeading.current?.focus()
        else otherField.current?.focus()
      }, [preview])

      function edit() {
        if (pending.current) return
        setChecked(null)
        setError('')
      }

      async function review(refresh = false) {
        if (pending.current || !workspace || !brief.trim()) return
        const abort = pending.current = new AbortController()
        setWorking('review')
        setError('')
        try {
          let current = catalog
          if (refresh && evidenceRetest) {
            const action = 'evidence-retest-options'
            const options = await request(action, { action, id: plan.id, revision: plan.revision }, abort.signal, language)
            if (abort.signal.aborted) return
            if (!left || !right || !options.workspaceIds.includes(workspace.workspaceId) ||
              !options.alternatives.some(item => planMatchesRevision(right, item))) throw new Error(t(evidenceRetestStale))
          } else if (refresh) {
            const latest = await request('list', null, abort.signal, language)
            if (abort.signal.aborted) return
            current = latest.plans
            setUpdatedPlans(current)
          }
          const choose = id => {
            const selected = current.find(item => item.id === id)
            if (!selected) throw new Error(t('这份出装方案已不可用。'))
            return { id, revision: selected.revision }
          }
          const input = { plans: { left: choose(plan.id), right: choose(otherId) }, workspaceId: workspace.workspaceId,
            material: material.trim(), task: brief.trim(), ...(evidenceRetest && { evidenceRetest: true }) }
          const action = 'plan-comparison-preview'
          const value = await request(action, { action, ...input }, abort.signal, language)
          if (!abort.signal.aborted) {
            setChecked({ value, input, language })
            setNeedsRefresh(false)
          }
        } catch (reason) {
          if (!abort.signal.aborted) {
            setNeedsRefresh(true)
            setError(reason.message)
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setWorking('')
        }
      }

      function submit(event) {
        event.preventDefault()
        materialField.current.setCustomValidity(workspaceMaterialIsRelative(material.trim()) ? '' : t('请输入工作区内的相对文件路径。'))
        briefField.current.setCustomValidity(brief.trim() ? '' : t('请填写新任务说明。'))
        if (canReview && event.currentTarget.reportValidity()) void review(needsRefresh)
      }

      async function open(arm) {
        if (pending.current || !preview?.token || needsRefresh) return
        const { input, language: reviewLanguage } = checked
        const key = JSON.stringify([input, reviewLanguage])
        if (launch.current?.key !== key) {
          const bytes = crypto.getRandomValues(new Uint8Array(16))
          launch.current = { key, id: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') }
        }
        const abort = pending.current = new AbortController()
        setWorking('open')
        setError('')
        onOpeningChange(true)
        const action = 'plan-comparison-open'
        let result
        try {
          result = await request(action, { action, ...input, token: preview.token, launchId: launch.current.id, arm }, abort.signal, reviewLanguage)
        } catch (reason) {
          if (!abort.signal.aborted) {
            setNeedsRefresh(true)
            setError(reason.message)
          }
        } finally {
          pending.current = null
          if (!abort.signal.aborted) {
            onOpeningChange(false)
            setWorking('')
          }
        }
        if (!abort.signal.aborted && result) onOpened(result)
      }

      const messages = h(Fragment, null,
        error && h('p', { className: 'moba-alert', role: 'alert' }, error),
        working && h('p', { className: 'moba-empty', role: 'status' }, t(working === 'review' ? '正在核对材料和出装…' : '正在准备对局…')))

      return !preview ? h('form', { className: 'moba-plan-form moba-plan-task', onSubmit: submit },
        h('div', { className: 'moba-plan-fields' },
          h(InstallFacts, { facts: [[t('方案 A'), [left?.name ?? plan.name, left?.heroName ?? plan.heroName].filter(Boolean).join(' · ')]] }),
          (!left || left.broken) && h('p', { className: 'moba-alert', role: 'status' }, left?.broken ?? t('这份出装方案已不可用。')),
          h('label', null, t('方案 B'), h('select', { ref: otherField, value: right?.id ?? '', required: true, disabled: Boolean(working),
            onChange: event => setOtherId(event.target.value) },
          h('option', { value: '' }, t(evidenceRetest ? '选择同一组实战的另一套方案' : '选择另一份已保存方案')),
          alternatives.map(item => h('option', { key: item.id, value: item.id, disabled: Boolean(item.broken) },
            [item.name, item.heroName].filter(Boolean).join(' · '))))),
          evidenceRetest && !alternatives.length && h('p', { className: 'moba-alert', role: 'status' }, t(evidenceRetestStale)),
          evidenceRetest && !workspaces.length &&
            h('p', { className: 'moba-plan-note', role: 'status' }, t('请先在 DeepSeek Harness 中添加自己的工作区。')),
          h(WorkspaceFileFields, { workspaces, workspaceId: workspace?.workspaceId ?? '', setWorkspaceId,
            material, setMaterial, materialField, request, busy: Boolean(working) }),
          h('label', null, t('新任务说明'), h('textarea', { ref: briefField, required: true, disabled: Boolean(working), value: brief, rows: 4,
            maxLength: 1200, onChange: event => { event.target.setCustomValidity(''); setBrief(event.target.value) } })), messages),
        h('footer', { className: 'moba-gallery-footer' },
          h('button', { className: 'moba-roster-open', type: 'button', onClick: onBack }, t('返回方案库')),
          h('button', { className: 'moba-start', type: 'submit', disabled: Boolean(working) || !canReview }, t('核对两套方案'),
            h(Glyph, { kind: 'arrow', size: 16 }))))
        : h('section', { className: 'moba-plan-form moba-plan-task', onKeyDown: event => closeDialogOnEscape(event, edit) },
          h('div', { className: 'moba-plan-fields' },
            h('h3', { ref: reviewHeading, tabIndex: -1 }, t('核对两套方案')),
            h(InstallFacts, { facts: [
              [t('工作区'), workspace ? workspaceFileLabel(workspace, workspaces) : preview.workspaceTitle],
              [t('材料文件相对路径'), preview.material],
            ] }),
            h('div', { className: 'moba-lighthouse-arms' }, preview.arms.map(arm => {
              const isLeft = arm.id === 'left'
              const selected = isLeft ? left ?? plan : right
              const card = { planName: selected?.name, heroName: selected?.heroName, ...arm }
              return h(ComparisonArm, { key: arm.id, arm: { ...card, status: arm.reason ? 'unavailable' : 'ready' },
                config: comparisonKinds.plans.arms.find(item => item.id === arm.id),
                outfit: (isLeft ? preview.comparison?.before : preview.comparison?.after)?.outfit })
            })),
            h(SharedPlanCapabilities, { comparison: preview.comparison, title: '从方案 A 到方案 B 的变化', showEmpty: true }),
            preview.task && h('label', null, t('两边共用的任务'), h('textarea', { readOnly: true, rows: 4, value: preview.task })),
            h('p', { className: 'moba-plan-note' }, t('两边用同一段任务。进入各自会话后，用输入栏手动发送。')),
            preview.reason && h('p', { className: 'moba-alert', role: 'status' }, preview.reason), messages),
          h('footer', { className: 'moba-gallery-footer' },
            h('button', { className: 'moba-roster-open', type: 'button', disabled: Boolean(working), onClick: edit }, t('返回编辑任务')),
            (needsRefresh || !preview.token) && h('button', { className: 'moba-roster-open', type: 'button', disabled: Boolean(working) || !workspace,
              onClick: () => review(true) }, t('重新核对两套方案')),
            preview.token && !needsRefresh && comparisonKinds.plans.arms.map(side => h('button', {
              key: side.id, className: 'moba-start', type: 'button', disabled: Boolean(working), onClick: () => open(side.id),
            }, t(side.open), h(Glyph, { kind: 'arrow', size: 16 })))))
    }

    function PlanTestedSource({ plan, request, onVisit }) {
      const language = useLanguage()
      const [state, setState] = useState(null)
      const trigger = useRef(null)
      const pending = useRef(null)

      useEffect(() => () => pending.current?.abort(), [])

      async function open() {
        if (pending.current) return
        const abort = pending.current = new AbortController()
        const action = 'plan-evidence-origin'
        setState({ loading: true })
        try {
          const source = await request(action, { action, id: plan.id, revision: plan.revision }, abort.signal, language)
          if (abort.signal.aborted) return
          if (!source?.comparisonId || !['baseline', 'rematch'].includes(source.arm) || !source.sessionId) {
            throw new Error(t('这份方案的实测来源已不可查看。'))
          }
          setState({ source })
        } catch (reason) {
          if (!abort.signal.aborted) setState({ error: reason.message })
        } finally {
          pending.current = null
        }
      }

      function back() {
        setState(null)
        requestAnimationFrame(() => trigger.current?.focus())
      }

      const source = state?.source
      return h(Fragment, null,
        h('button', { type: 'button', className: 'moba-roster-open', ref: trigger, disabled: Boolean(state?.loading),
          'aria-haspopup': 'dialog', onClick: open }, t('查看实战来源')),
        state?.loading && h('p', { className: 'moba-plan-note', role: 'status' }, t('正在核对实战来源…')),
        state?.error && h('p', { className: 'moba-alert', role: 'alert' }, state.error),
        source && h(RunComparison, { kind: 'rematch', comparisonId: source.comparisonId, testedSourceArm: source.arm, evidenceReplayHint: true,
          request, onVisit, onClose: back, onBack: back, backLabel: t('返回方案库') }))
    }

    function BuildPlans({ plans, initialMode, draft, current, canSave, request, hasOpening, onClose, onChanged, onApply, onCompare, onImport,
      workspaces, workspaceId, onOpenTask, onOpenSource, evidenceSave }) {
      const [editor, setEditor] = useState(initialMode === 'create' ? { mode: 'create' } : null)
      const [sharing, setSharing] = useState(null)
      const [taskPlan, setTaskPlan] = useState(null)
      const [pairPlan, setPairPlan] = useState(null)
      const [retest, setRetest] = useState(null)
      const [taskOpening, setTaskOpening] = useState(false)
      const [name, setName] = useState('')
      const [note, setNote] = useState('')
      const [query, setQuery] = useState('')
      const [picked, setPicked] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const dialog = useRef(null)
      const saving = useRef(false)
      const openingTask = useRef(false)
      const focus = useRef(null)
      const shareButton = useRef(null)
      const importButton = useRef(null)
      const taskButton = useRef(null)
      const pairButton = useRef(null)
      const retestButton = useRef(null)
      const title = useId()
      const group = useId()
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const visible = plans.filter(item => terms.every(term =>
        [item.name, item.heroName, item.note].some(text => text.toLowerCase().includes(term))))
      const plan = visible.find(item => item.id === picked)
        ?? visible.find(item => item.heroId === current.hero?.id) ?? visible[0]
      const hasAlternative = plans.some(item => item.id !== plan?.id && !item.broken)
      const retestId = plan?.hasEvidenceOrigin && !plan.broken ? plan.id : undefined
      const retestRevision = retestId ? plan.revision : undefined
      const options = retest && retest.id === retestId && retest.revision === retestRevision ? retest.options : undefined
      const canRetest = options?.alternatives.some(reference =>
        plans.some(item => item.id !== plan.id && !item.broken && planMatchesRevision(item, reference)))
      const evidenceRetest = pairPlan?.evidenceRetest
      const comparisonPlans = evidenceRetest ? plans.filter(item => planMatchesRevision(item, pairPlan.plan) ||
        evidenceRetest.alternatives.some(reference => planMatchesRevision(item, reference))) : plans
      const comparisonWorkspaces = evidenceRetest ? workspaces.filter(item => evidenceRetest.workspaceIds.includes(item.workspaceId)) : workspaces

      useEffect(() => {
        const element = dialog.current
        element.showModal()
        return () => element.close()
      }, [])
      useEffect(() => focus.current?.focus(), [editor?.mode])
      useEffect(() => {
        if (!retestId) return
        const abort = new AbortController()
        const action = 'evidence-retest-options'
        request(action, { action, id: retestId, revision: retestRevision }, abort.signal)
          .then(options => {
            if (!abort.signal.aborted) setRetest({ id: retestId, revision: retestRevision, options })
          })
          .catch(() => { if (!abort.signal.aborted) setRetest(null) })
        return () => abort.abort()
      }, [request, retestId, retestRevision])

      function edit(mode, target) {
        setEditor({ mode, target })
        setName(target?.name ?? '')
        setNote(target?.note ?? '')
        setError('')
      }

      function close() {
        if (saving.current || openingTask.current) return
        dialog.current.close()
        onClose()
      }

      function closeSharing() {
        const button = sharing.mode === 'import' ? importButton : shareButton
        setSharing(null)
        requestAnimationFrame(() => button.current?.focus())
      }

      function taskOpeningChanged(value) {
        openingTask.current = value
        setTaskOpening(value)
      }

      function closeTask() {
        if (openingTask.current) return
        setTaskPlan(null)
        requestAnimationFrame(() => taskButton.current?.focus())
      }

      function closePair() {
        if (openingTask.current) return
        const trigger = pairPlan.evidenceRetest ? retestButton : pairButton
        setPairPlan(null)
        requestAnimationFrame(() => (trigger.current ?? focus.current)?.focus())
      }

      function taskOpened(result) {
        close()
        onOpenTask(result)
      }

      async function submit(event) {
        event.preventDefault()
        if (saving.current) return
        const { mode, target } = editor
        if ((mode === 'create' || mode === 'replace') && !canSave) return
        if (mode !== 'remove' && !name.trim()) return
        saving.current = true
        setBusy(true)
        setError('')
        const tested = mode === 'create' && evidenceSave
        const action = tested ? 'evidence-replay-plan-save' : mode === 'remove' ? 'plan-remove' : 'plan-save'
        try {
          const result = await request(action, tested ? { action, ...tested, name, note } : { action, id: target?.id, revision: target?.revision,
            ...(mode !== 'remove' && { name, note, ...((mode === 'create' || mode === 'replace') && { draft }) }) })
          await onChanged(mode, result)
          saving.current = false
          if (mode === 'create' || mode === 'replace') close()
          else setEditor(null)
        } catch (reason) {
          setError(reason.message)
        } finally {
          saving.current = false
          setBusy(false)
        }
      }

      const mode = editor?.mode
      const subject = mode === 'create' ? current.hero?.name : editor?.target?.name
      const cannotSaveDraft = (mode === 'create' || mode === 'replace') && !canSave
      return h('dialog', { ref: dialog, className: 'moba-gallery moba-plans',
        'data-editing': Boolean(editor), 'data-sharing': Boolean(sharing || taskPlan || pairPlan), 'aria-labelledby': title,
        onCancel: event => { event.preventDefault(); if (pairPlan) closePair(); else if (taskPlan) closeTask(); else if (sharing) closeSharing(); else close() },
        onKeyDown: event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (pairPlan) closePair()
          else if (taskPlan) closeTask()
          else if (sharing) closeSharing()
          else close()
        } },
        h('header', { className: 'moba-gallery-heading' },
          h('h2', { id: title }, pairPlan ? t(evidenceRetest ? evidenceRetestLabel : '方案同题对照') : taskPlan ? t('用这套出装开新任务')
            : sharing?.mode === 'export' ? t('分享出装方案') : sharing?.mode === 'import' ? t('导入分享码')
            : mode === 'create' ? t('保存出装方案') : mode === 'edit' ? t('编辑方案')
            : mode === 'replace' ? t('更新方案出装')
            : mode === 'remove' ? t('移除方案') : t('出装方案')),
          h('button', { className: 'moba-icon-action', type: 'button', 'aria-label': t('关闭出装方案'), disabled: busy || taskOpening, onClick: close },
            h(Glyph, { kind: 'close' }))),
        pairPlan ? h(SavedPlanComparison, { plan: pairPlan.plan, plans: comparisonPlans, workspaces: comparisonWorkspaces,
          initialWorkspaceId: workspaceId, request, evidenceRetest,
          onBack: closePair, onOpeningChange: taskOpeningChanged, onOpened: taskOpened })
          : taskPlan ? h(LoadoutTaskForm, { plan: taskPlan.plan, testedAlternatives: taskPlan.alternatives, planCatalog: taskPlan.catalog,
            workspaces, initialWorkspaceId: workspaceId, request, onBack: closeTask, onOpeningChange: taskOpeningChanged, onOpened: taskOpened })
          : sharing?.mode === 'export' ? h(ExportPlanShare, { plan: sharing.plan, request, onBack: closeSharing })
          : sharing?.mode === 'import' ? h(ImportPlanShare, { request, hasOpening, onBack: closeSharing,
            onImport: value => { close(); onImport(value) } })
          : editor ? h('form', { className: 'moba-plan-form', onSubmit: submit },
          h('div', { className: 'moba-plan-fields' },
            mode === 'remove' ? h('p', { className: 'moba-plan-note' }, t('移除「') + subject + t('」的方案入口。历史对局仍可打开。')) :
              h(Fragment, null,
                (mode === 'create' || mode === 'replace') && h('div', { className: 'moba-plan-save-preview' },
                  h('strong', null, subject), h(PlanEquipment, { items: current.items, removed: current.removed })),
                h('label', null, t('方案名称'), h('input', { type: 'text', ref: focus, required: true, maxLength: 48,
                  value: name, disabled: busy, onChange: event => setName(event.target.value) })),
                h('label', null, t('适用情形（选填）'), h('textarea', { value: note, rows: 3, maxLength: 240,
                  disabled: busy, onChange: event => setNote(event.target.value) }))),
            cannotSaveDraft && h('p', { className: 'moba-alert', role: 'status' }, t('请先处理当前阵容中无法装配的装备。')),
            error && h('p', { className: 'moba-alert', role: 'alert' }, error)),
          h('footer', { className: 'moba-gallery-footer' },
            h('button', { className: 'moba-text', type: 'button', disabled: busy,
              ref: mode === 'remove' ? focus : undefined,
              onClick: () => mode === 'create' && initialMode === 'create' ? close() : setEditor(null) }, t('取消')),
            h('button', { className: 'moba-start', type: 'submit', disabled: busy || cannotSaveDraft || (mode !== 'remove' && !name.trim()) },
              busy ? t('正在保存…') : mode === 'remove' ? t('确认移除方案') : t('保存方案')))) :
          h(Fragment, null,
            h('div', { className: 'moba-plan-library' },
              h('div', { className: 'moba-plan-roster' },
                plans.length > 0 && h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 17 }),
                  h('input', { ref: focus, type: 'search', 'aria-label': t('搜索方案'), placeholder: t('搜索方案、英雄或适用情形'),
                    value: query, onChange: event => setQuery(event.target.value) })),
                visible.length > 0 ? h('fieldset', { className: 'moba-plan-list', 'aria-label': t('预览出装方案') },
                  visible.map(item => h('label', { key: item.id, className: 'moba-plan-option', 'data-picked': item.id === plan.id },
                    h('input', { type: 'radio', name: group, value: item.id, checked: item.id === plan.id,
                      onClick: () => setPicked(item.id), onChange: () => setPicked(item.id) }),
                    h(HeroArt, { id: item.heroId, art: item.heroArt, className: 'moba-avatar' }),
                    h('span', null, h('strong', null, item.name), h('small', null, item.heroName)),
                    item.broken && h('small', { className: 'moba-gallery-unavailable' }, t('不可用')))))
                  : h('p', { className: 'moba-empty', role: 'status' }, plans.length ? t('未找到匹配的方案。') : t('还没有出装方案。'))),
              plan && h('div', { className: 'moba-plan-preview' },
                h('div', { className: 'moba-plan-hero' },
                  h(HeroArt, { id: plan.heroId, art: plan.heroArt, className: 'moba-splash' }),
                  h('div', { className: 'moba-stage-shade' }),
                  h(OutfitTrim, { appearance: outfitAppearance(plan.heroId, plan.items, plan.removedIds) }),
                  h('div', { className: 'moba-hero-title' }, h('h3', null, plan.name), h('p', null, plan.heroName))),
                h('div', { className: 'moba-plan-details' },
                  plan.note && h('p', { className: 'moba-plan-note' }, plan.note),
                  plan.broken && h('p', { className: 'moba-alert', role: 'status' }, plan.broken),
                  (plan.items.length || plan.removed.length || !plan.broken) &&
                    h(PlanEquipment, { items: plan.items, removed: plan.removed }),
                  h('div', { className: 'moba-plan-launches' },
                    h('button', { className: 'moba-start moba-plan-task-start', type: 'button', ref: taskButton, disabled: Boolean(plan.broken),
                      onClick: () => setTaskPlan(options ? { plan, alternatives: matchingTaskPlans(plans, options) }
                        : { plan, catalog: retestId ? plans : undefined }),
                    }, t('用这套出装开新任务'), h(Glyph, { kind: 'arrow', size: 16 })),
                    h('button', { className: 'moba-roster-open', type: 'button', ref: pairButton, disabled: Boolean(plan.broken) || !hasAlternative,
                      onClick: () => setPairPlan({ plan }) }, t('与另一份方案同题对照')),
                    canRetest && h('button', { className: 'moba-roster-open', type: 'button', ref: retestButton,
                      onClick: () => setPairPlan({ plan, evidenceRetest: options }) }, t(evidenceRetestLabel))),
                  plan.hasEvidenceOrigin && onOpenSource && h(PlanTestedSource, { key: plan.id + ':' + plan.revision, plan, request,
                    onVisit: sessionId => { close(); onOpenSource(sessionId) } }),
                  !plan.broken && !hasAlternative && h('p', { className: 'moba-lighthouse-note' }, t('再保存一套可用出装方案，就能做同题对照。')),
                  h('div', { className: 'moba-plan-manage' },
                    h('button', { className: 'moba-text', type: 'button', ref: shareButton,
                      onClick: () => setSharing({ mode: 'export', plan }) }, t('分享方案')),
                    h('button', { className: 'moba-text', type: 'button', onClick: () => edit('edit', plan) }, t('编辑方案')),
                    plan.heroId === current.hero?.id && h('button', { className: 'moba-text', type: 'button', disabled: !canSave,
                      onClick: () => edit('replace', plan) }, t('用当前出装更新')),
                    h('button', { className: 'moba-text', type: 'button', onClick: () => edit('remove', plan) }, t('移除方案')))))),
            h('footer', { className: 'moba-gallery-footer' },
              h('button', { className: 'moba-roster-open', type: 'button', ref: importButton,
                onClick: () => setSharing({ mode: 'import' }) }, t('导入分享码')),
              plan ? h(Fragment, null,
                h('button', { className: 'moba-roster-open', type: 'button', disabled: Boolean(plan.broken) || !canSave,
                  onClick: () => { close(); onCompare(plan) } }, t('与当前对照')),
                h('button', { className: 'moba-start', type: 'button', disabled: Boolean(plan.broken),
                  onClick: () => { close(); onApply(plan) } }, t('采用方案'), h(Glyph, { kind: 'arrow', size: 17 })))
                : !plans.length && h('button', { className: 'moba-start', type: 'button', disabled: !canSave,
                  onClick: () => edit('create') }, t('保存当前出装')))))
    }

    function OpeningQuestEditor({ id, draftKey, hero, initial, followUp, trialTarget, deliveryTarget, request, enabled, pending, onSave, onClear, onClose, inspectGear, onRepair }) {
      const panel = useRef(null)
      const [loaded, setLoaded] = useState(null)
      const [failure, setFailure] = useState(null)
      const [attempt, retry] = useState(0)
      const [acceptedSources, setAcceptedSources] = useState(() => initial?.quest?.questSources ?? {})
      const titleId = useId()
      const info = loaded?.key === draftKey ? loaded.value : undefined
      const error = failure?.key === draftKey && failure.message
      const trialSource = questToolSource(trialTarget)
      const trialChoice = trialTarget && info?.choices.find(item => item.id === trialTarget.id &&
        (!trialSource || questToolSource(item) === trialSource))
      const heroActions = info?.heroActions ?? empty
      const selectedHeroChanged = deliveryTarget && info && deliveryTarget.heroId !== info.hero.id
      const openingQuest = trialTarget ? { mode: 'trial', gearId: trialTarget.id, trialActionKey: trialTarget.trialActionKey, title: trialTarget.title }
        : deliveryTarget ?? initial?.quest
      const originalSources = new Map(followUp?.gear.map(item => [item.id, questToolSource(item)]))
      const originalChanged = item => {
        const source = originalSources.get(item.id)
        return source && source !== questToolSource(item)
      }
      const acceptedSource = item => acceptedSources[item.id] === (item.sourceId ?? '')
      const choices = info?.choices.filter(item => !(trialTarget?.id === item.id && !trialChoice) &&
        (!originalChanged(item) || acceptedSource(item)))

      useEffect(() => {
        const frame = requestAnimationFrame(() => {
          panel.current?.scrollIntoView({ block: 'nearest' })
          if (trialTarget || deliveryTarget) panel.current?.focus({ preventScroll: true })
        })
        return () => cancelAnimationFrame(frame)
      }, [trialTarget, deliveryTarget])
      useEffect(() => {
        if (!enabled) return
        const abort = new AbortController()
        const restoreGear = followUp?.gear.map(item => ({ id: item.id, sourceId: questToolSource(item) }))
        request('growth-opening-choices', { action: 'growth-opening-choices', draft: JSON.parse(draftKey), restoreGear }, abort.signal)
          .then(value => {
            if (abort.signal.aborted) return
            setFailure(null)
            setLoaded({ key: draftKey, value })
          })
          .catch(reason => { if (!abort.signal.aborted) setFailure({ key: draftKey, message: reason.message }) })
        return () => abort.abort()
      }, [draftKey, enabled, attempt, request, followUp])

      return h('section', { ref: panel, className: 'moba-opening-editor', id, tabIndex: -1, 'aria-labelledby': titleId },
        h('header', { className: 'moba-opening-heading' }, h('h3', { id: titleId }, t('开局委托')),
          h('button', { className: 'moba-icon-action', type: 'button', 'aria-label': t('收起开局委托'), disabled: pending, onClick: onClose },
            h(Glyph, { kind: 'close' }))),
        h('div', { className: 'moba-opening-content' },
          h('div', { className: 'moba-opening-hero' },
            hero && h(HeroArt, { ...hero, className: 'moba-match-plan-portrait' }),
            h('div', null, h('strong', null, hero?.name), h('p', null, t('锁定阵容时接下委托，进入对局后按目标推进。')))),
          h('div', { className: 'moba-opening-fields' },
            followUp && h('section', { className: 'moba-opening-follow-up', 'aria-label': followUp.flagLabel ?? (followUp.fitting ? t('试装所选装备') : t('来自上局结算')) },
              h('h4', null, followUp.flagLabel ?? (followUp.fitting ? t('试装连携') : [followUp.hero, t('第 ') + followUp.turn + t(' 回合')].filter(Boolean).join(' · '))),
              h('ul', { className: 'moba-opening-gear' }, followUp.gear.map(item => {
                const current = info?.choices.find(choice => choice.id === item.id)
                const changedSource = current && originalChanged(current)
                const sameLabel = changedSource && current.sourceId && current.sourceName && current.sourceName === item.sourceName
                const currentLabel = current?.sourceName ?? current?.sourceId?.slice(-6)
                const original = sameLabel ? item.sourceName + ' · ' + item.sourceId.slice(-6) : item.sourceName ?? questToolSource(item)?.slice(-6)
                const accepted = changedSource && acceptedSource(current)
                const state = !info ? t('等待核对')
                  : !current ? t('当前阵容缺少此装备')
                    : changedSource ? current.sourceId
                      ? (accepted ? t('已选 ') : '') + t('当前来源 ') + currentLabel + (sameLabel ? ' · ' + current.sourceId.slice(-6) : '')
                      : accepted ? t('已选当前工具 · 来源待核验') : t('当前来源待核验')
                      : current.timing === 'turn' ? t('待回合触发') : current.timing === 'condition' ? t('按条件启用') : t('可加入委托')
                const check = info?.repairs?.find(row => row.id === item.id)
                const repair = check?.repair
                const source = questToolSource(item)
                const action = repair?.collection ? t('收藏并装上原来源')
                  : repair?.removed.length || repair?.restored.length ? t('采用换装') : source ? t('装上原来源') : t('装上装备')
                return h('li', { key: item.id }, h(ItemArt, { item }), h('div', null,
                  h('strong', null, item.name), h('span', null, state),
                  original && h('span', null, (followUp.fitting ? t('试装来源 ') : t('原来源 ')) + original),
                  repair?.removed.length > 0 && h('span', null, t('将换下 ') + repair.removed.join('、')),
                  repair?.restored.length > 0 && h('span', null, t('将恢复 ') + repair.restored.join('、')),
                  check?.reason && h('span', null, check.reason),
                  info && (!current || changedSource) && h('div', { className: 'moba-field-actions' },
                    repair ? h('button', { type: 'button', className: 'moba-text', disabled: pending,
                      'aria-label': repair.collection ? t('收藏并装上 ') + item.name + t(' 的原来源')
                        : action === t('采用换装') ? t('为 ') + item.name + t(' 采用换装')
                        : t('装上 ') + item.name + (source ? t(' 的原来源') : ''),
                      onClick: () => {
                        setAcceptedSources(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== item.id)))
                        onRepair(repair)
                      } }, action) : inspectGear?.(item),
                    changedSource && !accepted && !followUp.flagLabel && h('button', { type: 'button', className: 'moba-text', disabled: pending,
                      'aria-label': t('为 ') + item.name + t(' 改用当前来源'),
                      onClick: () => setAcceptedSources(previous => ({ ...previous, [item.id]: current.sourceId ?? '' })) }, t('改用当前来源')))))
              }))),
            !enabled ? h('p', { className: 'moba-empty', role: 'status' }, t('处理当前阵容后可选择委托装备。'))
              : error ? h('p', { className: 'moba-alert', role: 'alert' }, error, ' ',
                h('button', { type: 'button', className: 'moba-text', onClick: () => {
                  setFailure(null)
                  retry(value => value + 1)
                } }, t('重试')))
              : !info && h('p', { className: 'moba-empty', role: 'status' }, t('正在核对阵容…')),
            trialTarget && info && !trialChoice && h('p', { className: 'moba-alert', role: 'status' },
              t('当前阵容无法使用 ') + [trialTarget.name, trialSource && (trialTarget.sourceName ?? trialSource.slice(-6))]
                .filter(Boolean).join(' · ') + (trialSource ? t('。请恢复该来源，或选择其他装备。') : t('。请重新装配，或选择其他装备。'))),
            selectedHeroChanged && h('p', { className: 'moba-alert', role: 'status' },
              t('当前阵容已换英雄。请重新选择交付方式，或换回 ') + deliveryTarget.heroName + '。'),
            loaded && h(QuestForm, { key: trialTarget ? JSON.stringify([trialTarget.id, trialSource, trialTarget.trialActionKey]) : deliveryTarget?.heroActionKey,
              initial: openingQuest, rewards: loaded.value.rewards, heroActions, relayGearLevel: loaded.value.relayGearLevel,
              choices: choices ?? empty, request, comboDraft: draftKey,
              busy: pending || !enabled || !info || Boolean(error),
              submitLabel: t('确认开局委托'), showGear: true, onSubmit: onSave }),
            (initial || trialTarget || deliveryTarget) && h('button', { className: 'moba-text', type: 'button', disabled: pending,
              onClick: trialTarget || deliveryTarget ? onClose : onClear }, trialTarget ? t('放弃筹备试炼') : deliveryTarget ? t('放弃筹备交付') : t('取消开局委托')))))
    }

    function BuildBar({ selections, removedLabels, workspace, workspaces, onWorkspace, onRemove, onDropItem, onStart,
      pending, canStart, saved, matchMode, onMatchMode, comparison, onSavePlan, opening }) {
      const slots = Array.from({ length: Math.max(6, selections.length + (saved ? 0 : 1)) }, (_, i) => selections[i])
      return h('footer', { className: 'moba-build' },
        h('div', { className: 'moba-build-bag' },
          h('div', { className: 'moba-build-caption' },
            h('h2', null, t('出装'), h('span', { 'aria-live': 'polite' }, t('已装配 ') + selections.length + t(' 件'))),
            h('button', { className: 'moba-text', type: 'button', ref: comparison.button, onClick: comparison.toggle,
              'aria-expanded': comparison.open, 'aria-controls': comparison.open ? comparison.id : undefined,
              disabled: pending || (!comparison.open && !comparison.enabled) }, t('阵容对照')),
            h('button', { className: 'moba-text', type: 'button', 'aria-haspopup': 'dialog',
              disabled: pending || !comparison.enabled, onClick: onSavePlan }, t('保存为方案')),
            opening && h('button', { className: 'moba-text moba-opening-toggle', type: 'button', disabled: pending || !opening.enabled,
              ref: opening.button, 'aria-expanded': opening.open, 'aria-controls': opening.open ? opening.id : undefined, onClick: opening.toggle },
              h(Glyph, { kind: 'report', size: 15 }), t('开局委托'))),
          opening?.selection && h('div', { className: 'moba-opening-summary', role: 'status', 'data-stale': opening.stale },
            h(Glyph, { kind: 'report', size: 17 }),
            h('div', null, h('strong', null, opening.selection.quest.title),
              h('span', null, opening.stale ? t('阵容已调整，请重新确认委托。')
                : [opening.selection.quest.staged ? t('分阶段连携') : t(journalModes[opening.selection.quest.mode]), ...opening.selection.labels,
                  ...(opening.selection.quest.brief ? [t('已准备首回合任务')] : [])].join(' · ')))),
          h('div', { className: 'moba-slots' }, slots.map((item, index) => h('div', {
            className: 'moba-slot', key: item?.id ?? index, 'data-filled': Boolean(item),
            role: 'group', 'aria-label': item ? t('装备槽 ') + item.name : t('空装备槽 ') + (index + 1),
            onDragOver: event => {
              if (!saved && !pending && event.dataTransfer.types.includes('application/x-dsh-equipment')) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
              }
            },
            onDrop: event => {
              event.preventDefault()
              if (!saved && !pending) onDropItem(event.dataTransfer.getData('application/x-dsh-equipment'))
            },
          }, item ? saved
            ? h('span', { title: [item.name, item.sourceName].filter(Boolean).join(' · ') }, h(ItemArt, { item }))
            : h('button', { type: 'button', title: [item.name, item.sourceName].filter(Boolean).join(' · '),
              'aria-label': t('卸下') + item.name, disabled: pending,
              onClick: () => onRemove(item.id) }, h(ItemArt, { item }), h('span', null, h(Glyph, { kind: 'close', size: 12 })))
            : h(Glyph, { kind: 'plus', size: 15 })))),
          h(RemovedEquipment, { labels: removedLabels })),
        h('div', { className: 'moba-start-controls' },
          matchMode && h('label', null, t('战局'),
            h('select', { value: matchMode, disabled: pending, onChange: event => onMatchMode(event.target.value) },
              h('option', { value: 'after-turn' }, t('本回合结束后续战')),
              h('option', { value: 'continue' }, t('沿用已完成对话')),
              h('option', { value: 'fresh' }, t('另开新局')))),
          (!matchMode || matchMode === 'fresh') && h('label', null, t('工作区'),
            h('select', { value: workspace?.workspaceId ?? '', disabled: pending || !workspace,
              onChange: event => onWorkspace(event.target.value) },
            !workspaces.length && h('option', { value: '' }, t('请先添加工作区')),
            workspaces.map(item => h('option', { key: item.workspaceId, value: item.workspaceId },
              workspaceTitle(item))))),
          h('button', { className: 'moba-start', type: 'button', disabled: !canStart, onClick: onStart },
            h(Glyph, { kind: 'lock' }),
            pending ? t('正在处理…') : matchMode === 'after-turn' ? t('锁定阵容并排队')
              : matchMode === 'continue' ? t('锁定阵容并续战') : t('锁定阵容并开局'),
            h(Glyph, { kind: 'arrow' }))))
    }

    function Continuation({ entry, pending, onOpen, onCancel, onRequeue }) {
      const stopped = entry.state === 'interrupted' || entry.state === 'failed'
      const labels = {
        waiting: entry.next ? t('等待下一回合开始') : entry.turn === undefined ? t('等待本回合结束') : t('等待第 ') + entry.turn + t(' 回合结束'),
        starting: t('正在准备续战会话'), ready: t('新阵容已就绪'), failed: t('续战未能准备好'),
        interrupted: t('原回合已中断'),
      }
      return h('section', { className: 'moba-continuation', 'aria-label': t('续战安排') },
        h('div', { role: 'status' }, h('strong', null, labels[entry.state]), h('span', null, entry.title),
          entry.error && h('p', null, entry.error)),
        h('div', { className: 'moba-continuation-actions' },
          entry.state === 'ready' && h('button', { type: 'button', className: 'moba-equip', disabled: pending,
            onClick: () => onOpen(entry.sessionId) }, t('进入续战'), h(Glyph, { kind: 'arrow', size: 15 })),
          stopped && h('button', { type: 'button', className: 'moba-equip', disabled: pending,
            onClick: onRequeue }, t('重新排队'), h(Glyph, { kind: 'lock', size: 15 })),
          entry.state !== 'starting' && h('button', { type: 'button', className: 'moba-text', disabled: pending,
            onClick: onCancel }, entry.state === 'waiting' ? t('取消等待') : t('清除安排'))))
    }

    function InteractionReturn({ sessionId, status, openLobby }) {
      useLanguage()
      const snapshot = useSyncExternalStore(status.subscribe.bind(status), status.getSnapshot.bind(status))
      if (!snapshot.get(sessionId)?.pendingInteraction) return null
      return h('button', { type: 'button', className: 'moba-interaction-return', title: t('回城换装'), 'aria-label': t('回城换装'),
        onClick: () => openLobby(sessionId, { running: true }) }, h(Glyph, { kind: 'back', size: 17 }))
    }

    function FlagCollection({ request, heroId, initialFlagId, onClose, onDisplay, onOpenMatch, onPrepare }) {
      const dialog = useRef(null)
      const title = useId()
      const group = useId()
      const [flags, setFlags] = useState(null)
      const [selected, setSelected] = useState(initialFlagId ?? '')
      const [displayHero, setDisplayHero] = useState('')
      const [query, setQuery] = useState('')
      const [error, setError] = useState('')
      const [attempt, retry] = useState(0)
      const [operation, setOperation] = useState('')
      const [checked, setChecked] = useState(null)
      const pending = Boolean(operation)
      const upgradeHeading = useRef(null)

      useEffect(() => {
        const element = dialog.current
        element.showModal()
        return () => element.close()
      }, [])
      useEffect(() => {
        const abort = new AbortController()
        request('growth-flags', { action: 'growth-flags' }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setFlags(value) })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [attempt, request])
      useEffect(() => {
        if (!initialFlagId) return
        const abort = new AbortController()
        void checkLoadout(initialFlagId, abort.signal)
        return () => abort.abort()
      }, [initialFlagId, request])

      const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      const visible = flags?.filter(flag => terms.every(term =>
        [flag.title, flag.hero.name, flag.teamwork?.hero.name, flag.teamwork && t('协作战旗'),
          flag.comboAction?.name, flag.stagedAction?.name, flag.stagedAction?.prepare?.name, ...flag.pair.flatMap(item => [item.name, item.sourceName])]
          .some(text => text?.toLocaleLowerCase().includes(term)))) ?? empty
      const shownBy = item => item.displayedFor ?? (item.displayed ? [item.hero.id] : empty)
      const flag = visible.find(item => item.id === selected) ?? visible.find(item => shownBy(item).includes(heroId))
        ?? visible.find(item => item.hero.id === heroId || item.teamwork?.hero.id === heroId) ?? visible[0]
      const members = flag?.teamwork ? [flag.hero, flag.teamwork.hero] : flag ? [flag.hero] : empty
      const bearer = members.find(item => item.id === displayHero) ?? members.find(item => item.id === heroId) ?? members[0]
      const displayed = flag && shownBy(flag).includes(bearer.id)
      const checkedFlag = checked?.id === flag?.id ? checked : undefined
      const preview = checkedFlag?.value
      useEffect(() => {
        if (initialFlagId && flag?.id === initialFlagId && preview?.upgrade) upgradeHeading.current?.focus()
      }, [initialFlagId, flag?.id, preview])

      function close() {
        if (pending) return
        dialog.current.close()
        onClose()
      }

      async function display() {
        const target = displayed ? null : flag.id
        setOperation('display')
        setError('')
        try {
          await request('growth-display', { action: 'growth-display', id: target, heroId: bearer.id })
          setSelected(flag.id)
          setFlags(current => current.map(item => {
            const shown = shownBy(item).filter(id => id !== bearer.id)
            if (item.id === target) shown.push(bearer.id)
            return { ...item, displayed: shown.includes(item.hero.id), ...(item.teamwork && { displayedFor: shown }) }
          }))
          onDisplay()
        } catch (reason) {
          setError(reason.message)
        } finally {
          setOperation('')
        }
      }

      async function checkLoadout(id, signal) {
        setOperation('preview')
        setChecked(null)
        try {
          const value = await request('growth-flag-loadout', { action: 'growth-flag-loadout', id }, signal)
          if (!signal?.aborted) setChecked({ id, value })
        } catch (reason) {
          if (!signal?.aborted) setChecked({ id, error: reason.message })
        } finally {
          if (!signal?.aborted) setOperation('')
        }
      }

      return h('dialog', { ref: dialog, className: 'moba-gallery moba-flag-collection', 'aria-labelledby': title,
        onCancel: event => { event.preventDefault(); close() } },
        h('header', { className: 'moba-gallery-heading' }, h('h2', { id: title }, t('战旗收藏')),
          h('button', { type: 'button', className: 'moba-icon-action', disabled: pending, 'aria-label': t('关闭战旗收藏'), onClick: close },
            h(Glyph, { kind: 'close' }))),
        h('div', { className: 'moba-flag-library', 'data-preview': Boolean(flag) },
          h('section', { className: 'moba-flag-roster', 'aria-label': t('已解锁战旗') },
            error && h('p', { className: 'moba-alert', role: 'alert' }, error, ' ',
              h('button', { type: 'button', className: 'moba-text', onClick: () => { setError(''); retry(value => value + 1) } }, t('重新读取'))),
            !flags && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取战旗…')),
            flags?.length === 0 && h('div', { className: 'moba-flag-empty' }, h(Glyph, { kind: 'flag', size: 34 }),
              h('h3', null, t('第一面战旗')),
              h('p', null, t('在对局的「成长」里完成装备连携，或让另一位英雄完成共享任务后验收交付。'))),
            flags?.length > 0 && h(Fragment, null,
              h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 16 }),
                h('input', { type: 'search', value: query, 'aria-label': t('搜索战旗'), placeholder: t('搜索战旗、英雄或装备'),
                  onChange: event => setQuery(event.target.value) })),
              visible.length ? h('fieldset', { className: 'moba-plan-list', 'aria-label': t('预览战旗'), disabled: pending },
                visible.map(item => h('label', { className: 'moba-plan-option', key: item.id, 'data-picked': item.id === flag?.id },
                  h('input', { type: 'radio', name: group, checked: item.id === flag?.id, onChange: () => {
                    setSelected(item.id); setDisplayHero('')
                  } }),
                  h(HeroArt, { ...item.hero, className: 'moba-match-plan-portrait' }),
                  h('span', null, h('strong', null, item.title), h('small', null, item.teamwork
                    ? item.hero.name + ' · ' + item.teamwork.hero.name
                    : [item.hero.name, ...item.pair.filter(questToolSource).map(gear => gear.sourceName)].filter(Boolean).join(' · '))),
                  shownBy(item).length > 0 && h(Glyph, { kind: 'flag', size: 16 }))))
                : h('p', { className: 'moba-empty', role: 'status' }, t('没有符合搜索的战旗。')))),
          flag && h('section', { className: 'moba-flag-preview', 'aria-label': t('战旗详情'), key: flag.id },
            h('div', { className: 'moba-flag-splash' },
              h(HeroArt, { ...flag.hero, className: 'moba-splash' }),
              h('div', { className: 'moba-stage-shade' }),
              h('div', { className: 'moba-flag-seal', 'aria-hidden': true }, h(Glyph, { kind: 'flag', size: 26 })),
              h('div', { className: 'moba-hero-title' },
                h('h3', null, flag.title), h('p', null, flag.teamwork ? t('协作战旗') : flag.hero.name))),
            flag.teamwork ? h(TeamworkRoles, { leader: flag.hero, leaderSessionId: flag.sessionId, teamwork: flag.teamwork,
              onOpen: address => { close(); onOpenMatch(address) } })
              : h('ul', { className: 'moba-flag-pair', 'aria-label': t('连携装备') }, flag.pair.map((item, index) => {
                const slot = preview?.slots[index]
                const placement = { profile: t('Profile 已加载'), selected: t('加入出装'), included: t('随阵容加载') }
                const timing = { turn: t('回合触发'), condition: t('按条件启用'), startup: t('开局核验') }
                return h('li', { key: item.id }, h(ItemArt, { item }), h('div', null, h('strong', null, item.name),
                  item.sourceName && h('small', null, item.sourceName),
                  slot && h('small', { className: 'moba-flag-slot', 'data-ready': slot.available }, slot.available
                    ? [placement[slot.placement], timing[slot.timing], slot.sourceUnverified && t('原来源未核验'),
                      slot.sourceUnverified && slot.currentSource].filter(Boolean).join(' · ')
                    : [slot.reason ?? (questToolSource(item) ? t('原来源当前不可用') : t('当前无法装配')),
                      slot.currentSource && t('当前来源 ') + slot.currentSource].filter(Boolean).join(' · '))))
              })),
            (preview || checkedFlag?.error || operation === 'preview') && h('div', { className: 'moba-flag-loadout',
              role: checkedFlag?.error ? 'alert' : 'status' },
              operation === 'preview' ? t('正在核对连携出装…') : checkedFlag?.error ? checkedFlag.error :
                h(Fragment, null,
                  h('p', null, preview.count === 2 ? t('两件连携装备可用于新阵容。')
                    : preview.count ? t('可先采用已就绪的装备，再到装备库补齐。') : t('请在装备库核对原装备或选择新的来源。')),
                  preview.removed.length > 0 && h('p', null, t('采用时将卸下 ') + preview.removed.join('、') + '。'),
                  preview.conflict && h('p', null, preview.conflict),
                  preview.practiceUnavailable && h('p', null, preview.practiceUnavailable),
                  preview.upgradeUnavailable && h('p', null, preview.upgradeUnavailable))),
            preview?.upgrade && h('section', { className: 'moba-flag-upgrade', 'aria-label': t('战旗升级') },
              h('h4', { ref: upgradeHeading, tabIndex: -1 }, t('战旗升级')),
              h(ComboModes, { combo: preview.upgrade, upgrade: true, disabled: pending, onSelect: mode => {
                close()
                onPrepare(flag, preview, mode)
              } })),
            flag.comboAction && h('div', { className: 'moba-flag-record' },
              h('span', { className: 'moba-trial-action-note' }, h(Glyph, { kind: 'action', size: 16 }), flag.comboAction.name),
              h('button', { className: 'moba-text', type: 'button', disabled: pending,
                onClick: () => { close(); onOpenMatch(flag.comboAction.sessionId) } }, t('回看连携操作'))),
            flag.stagedAction && h('div', { className: 'moba-flag-record' },
              h('span', { className: 'moba-trial-action-note' }, h(Glyph, { kind: 'mastery', size: 16 }),
                [flag.stagedAction.prepare?.name, flag.stagedAction.name].filter(Boolean).join(' → ')),
              h('button', { className: 'moba-text', type: 'button', disabled: pending,
                onClick: () => { close(); onOpenMatch(flag.stagedAction.first.sessionId) } }, flag.stagedAction.prepare ? t('回看准备') : t('回看取证')),
              h('button', { className: 'moba-text', type: 'button', disabled: pending,
                onClick: () => { close(); onOpenMatch(flag.stagedAction.sessionId) } }, t('回看发动'))),
            h('div', { className: 'moba-flag-record' },
              h('span', null, [new Date(flag.earnedAt).toLocaleDateString('zh-CN'), flag.teamwork ? t('交付验收')
                : flag.turn !== undefined ? t('第 ') + flag.turn + t(' 回合达成') : t('原生操作达成')].join(' · ')),
              displayed && h('strong', { role: 'status' }, t('展示中'))))),
        flag && h('footer', { className: 'moba-gallery-footer moba-flag-footer' },
          flag.teamwork ? h('label', { className: 'moba-flag-bearer' }, t('展示英雄'),
            h('select', { value: bearer.id, disabled: pending, onChange: event => setDisplayHero(event.target.value) }, members.map(hero =>
              h('option', { key: hero.id, value: hero.id }, hero.name + (shownBy(flag).includes(hero.id) ? t(' · 展示中') : '')))))
            : h('button', { type: 'button', className: 'moba-text', disabled: pending,
              onClick: () => { close(); onOpenMatch(flag.sessionId) } }, t('回看达成会话')),
          h('div', { className: 'moba-flag-actions' },
            !flag.teamwork && h('button', { type: 'button', className: 'moba-roster-open', disabled: pending,
              onClick: () => checkLoadout(flag.id) }, checkedFlag ? t('重新核对出装') : t('预览出装')),
            h('button', { type: 'button', className: displayed || preview ? 'moba-roster-open' : 'moba-start', disabled: pending, onClick: display },
              displayed ? t('收起战旗') : t('设为展示战旗'), h(Glyph, { kind: 'flag', size: 16 })),
            preview && h('button', { type: 'button', className: preview.practice ? 'moba-roster-open' : 'moba-start', disabled: pending, onClick: () => {
              close()
              onPrepare(flag, preview)
            } }, preview.count === 2 ? t('采用出装') : preview.count ? t('采用可用装备') : t('用原英雄备战'), h(Glyph, { kind: 'arrow', size: 16 })),
            preview?.practice && h('button', { type: 'button', className: 'moba-start', disabled: pending, onClick: () => {
              close()
              onPrepare(flag, preview, 'practice')
            } }, t('复练原连携'), h(Glyph, { kind: 'arrow', size: 16 })))))
    }

    const journalModes = { delivery: '交付委托', trial: '装备试炼', combo: '连携挑战', relay: '接力委托' }
    const journalFilters = [['ready', '待验收'], ['active', '进行中'], ['completed', '已完成']]
    const teamTaskStates = { pending: '等待开始', in_progress: '任务进行中', completed: '队伍任务已完成', deleted: '队伍任务已删除' }

    function journalReady(entry) {
      return !entry.mastered && (entry.completed !== undefined || Boolean(entry.teamTask?.proof ?? entry.trialAction?.proof ?? entry.comboAction?.proof))
    }

    function actionCompletion(action) {
      if (action?.kind === 'team') return t(teamTaskStates[action.status])
      if (action?.kind === 'compaction' && action.proof) return t('上下文压缩成功')
      if (action?.proof) return action.kind === 'command' ? t('命令执行成功') : t('面板操作已确认')
      if (action?.turn !== undefined) return t('第 ') + action.turn + t(' 回合达成')
    }

    function comboRhythm(action) {
      return action?.kind || action?.prepare?.kind ? t('分阶段连携') : t('分回合连携')
    }

    function preparationLink(action) {
      const step = action.first.kind ? t('准备操作') : t('第 ') + action.first.turn + t(' 回合')
      return t('回看') + step + ' · ' + (action.prepare ? actionLabel(action.prepare) : t('取证'))
    }

    function journalStatus(entry) {
      if (entry.settledAt !== undefined) return t('已完成')
      if (entry.mastered) return t('奖励已领取')
      if (journalReady(entry)) return t('待验收')
      if (entry.teamTask) return t(teamTaskStates[entry.teamTask.status])
      if (entry.relay) {
        if (!entry.relay.first) return t('等待第一棒')
        return entry.relay.runner.id === entry.relay.starter.id ? t('待交棒') : t('等待第二棒')
      }
      if (entry.heroAction) return t('待执行英雄操作')
      if (entry.comboAction?.staged) return entry.comboAction.first ? t('待发动主装备') : entry.comboAction.prepare ? t('待执行准备操作') : t('待辅助工具取证')
      if (entry.comboAction && entry.progress?.ordered === false) return t('待按顺序调用工具')
      if (entry.trialAction || entry.comboAction) return entry.progress?.action ? t('待达成装备条件') : t('待执行操作')
      if (entry.progress) return (entry.gear.length - entry.progress.missing.length) + '/' + entry.gear.length + t(' 件达成')
      return t('进行中')
    }

    function JournalQuestDetail({ entry, onOpenMatch }) {
      const { hero, relay, gear, awards, settledAt } = entry
      const action = entry.teamTask ?? entry.heroAction ?? entry.trialAction ?? entry.comboAction
      const complete = settledAt !== undefined
      return h('section', { className: 'moba-flag-preview moba-journal-detail', 'aria-label': t('委托详情') },
        h('div', { className: 'moba-flag-splash' },
          hero && h(HeroArt, { ...hero, className: 'moba-splash' }),
          h('div', { className: 'moba-stage-shade' }),
          h('div', { className: 'moba-hero-title' },
            h('h3', null, entry.title),
            h('p', null, [hero?.name, entry.workspace].filter(Boolean).join(' · ')))),
        h('div', { className: 'moba-flag-record moba-journal-state' },
          h('span', null, action?.staged ? comboRhythm(action) : entry.relayGear || relay && gear?.length ? t('装备接力') : t(journalModes[entry.mode]),
            complete && ' · ' + new Date(settledAt).toLocaleDateString('zh-CN')),
          h('strong', null, journalStatus(entry))),
        relay && h(RelayLegs, { ...relay, onOpen: onOpenMatch }),
        entry.relayGear && h(RelayGearCard, { gear: entry.relayGear, reached: true }),
        action && h('div', { className: 'moba-journal-action' }, h(Glyph, { kind: 'action', size: 17 }),
          (action.kind !== 'team' || action.name !== entry.title) && h('strong', null, action.name),
          actionCompletion(action) && h('span', null, actionCompletion(action))),
        entry.teamwork && h(TeamworkRoles, { leader: hero, teamwork: entry.teamwork, onOpen: onOpenMatch }),
        action?.first && h('button', { type: 'button', className: 'moba-text',
          onClick: () => onOpenMatch(action.first.sessionId) }, preparationLink(action)),
        gear?.length > 0 && h('ul', { className: 'moba-combo-proof moba-journal-gear', 'aria-label': t('委托装备') }, gear.map(item => {
          const reached = complete || journalReady(entry) || (action?.staged ? action.first && item.id !== action.gearId
            : entry.progress && !entry.progress.missing.includes(item.id))
          return h('li', { key: item.id, 'data-reached': Boolean(reached) }, h(ItemArt, { item }),
            h('div', null, h('strong', null, item.name), item.sourceName && h('span', null, item.sourceName),
              h('span', null, reached ? t('已达成') : item.kind === 'tool' ? t('待成功调用') : t('待加载'))))
        })),
        complete && awards.length > 0 && h('ul', { className: 'moba-journal-awards', 'aria-label': t('验收奖励') }, awards.map(item =>
          h('li', { key: item.id },
            item.kind ? h(ItemArt, { item }) : h(HeroArt, { ...item, className: 'moba-match-plan-portrait' }),
            h('div', null, h('strong', null, item.name), item.leveled && h('small', null, t('升至 Lv.') + item.level)),
            h('strong', null, '+' + item.xp + ' XP')))),
        h('footer', { className: 'moba-gallery-footer moba-journal-footer' },
          entry.comboRepeat && h('span', { className: 'moba-flag-insignia' },
            h(Glyph, { kind: 'mastery', size: 15 }), t('已验收 · 战旗奖励已领取')),
          entry.comboRepeat?.sessionId && h('button', { type: 'button', className: 'moba-text',
            onClick: () => onOpenMatch(entry.comboRepeat.sessionId) }, t('回看战旗结算会话')),
          entry.flagId && h('span', { className: 'moba-flag-insignia' },
            h(Glyph, { kind: 'flag', size: 15 }), entry.teamwork ? t('已解锁协作战旗') : entry.flagUpgrade ? t('已升级战旗') : t('已解锁战旗')),
          entry.previousSessionId && h('button', { type: 'button', className: 'moba-text',
            onClick: () => onOpenMatch(entry.previousSessionId) }, t('回看换装前对局')),
          h('button', { type: 'button', className: 'moba-start', onClick: () => onOpenMatch(entry.sessionId) },
            complete ? t('回看会话') : t('进入对局'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function QuestJournal({ request, onClose, onOpenMatch }) {
      const dialog = useRef(null)
      const title = useId()
      const group = useId()
      const [journal, setJournal] = useState(null)
      const [filter, setFilter] = useState('')
      const [selected, setSelected] = useState('')
      const [query, setQuery] = useState('')
      const [error, setError] = useState('')
      const [attempt, retry] = useState(0)

      useEffect(() => {
        const element = dialog.current
        element.showModal()
        return () => element.close()
      }, [])
      useEffect(() => {
        const abort = new AbortController()
        request('growth-journal', { action: 'growth-journal' }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setJournal(value) })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [attempt, request])

      const hasEntries = Boolean(journal?.active.length || journal?.completed.length)
      const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
      const matches = entry => {
        if (!terms.length) return true
        const names = [entry.title, entry.hero?.name, entry.teamwork?.hero.name, entry.workspace, t(journalModes[entry.mode]),
          (entry.teamTask ?? entry.heroAction ?? entry.trialAction ?? entry.comboAction)?.name,
          entry.relay?.first?.hero.name, entry.relay?.second?.hero.name,
          ...(entry.gear ?? entry.awards ?? empty).map(item => item.name)].filter(Boolean)
        return terms.every(term => names.some(name => name.toLocaleLowerCase().includes(term)))
      }
      const active = journal?.active.filter(matches) ?? empty
      const rows = {
        ready: active.filter(journalReady),
        active: active.filter(entry => !journalReady(entry)),
        completed: journal?.completed.filter(matches) ?? empty,
      }
      const current = filter || journalFilters.find(([key]) => rows[key].length)?.[0] || 'active'
      const visible = rows[current]
      const entry = visible.find(item => item.id === selected) ?? visible[0]

      function close() {
        dialog.current.close()
        onClose()
      }

      return h('dialog', { ref: dialog, className: 'moba-gallery moba-flag-collection moba-journal', 'aria-labelledby': title,
        onCancel: event => { event.preventDefault(); close() } },
        h('header', { className: 'moba-gallery-heading' }, h('h2', { id: title }, t('委托簿')),
          h('button', { type: 'button', className: 'moba-icon-action', 'aria-label': t('关闭委托簿'), onClick: close },
            h(Glyph, { kind: 'close' }))),
        h('div', { className: 'moba-flag-library', 'data-preview': Boolean(entry) },
          h('section', { className: 'moba-flag-roster', 'aria-label': t('委托列表') },
            error && h('p', { className: 'moba-alert', role: 'alert' }, error, ' ',
              h('button', { type: 'button', className: 'moba-text', onClick: () => { setError(''); retry(value => value + 1) } }, t('重新读取'))),
            !journal && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取委托…')),
            journal && !hasEntries && h('div', { className: 'moba-flag-empty' }, h(Glyph, { kind: 'report', size: 30 }),
              h('h3', null, t('还没有委托')),
              h('p', null, t('开局后，在输入栏上方的「成长与委托」里为手头的工作接一项委托。'))),
            hasEntries && h(Fragment, null,
              h('div', { className: 'moba-journal-filters', role: 'group', 'aria-label': t('委托状态') },
                journalFilters.map(([key, name]) => h('button', { type: 'button', key, 'aria-pressed': key === current,
                  onClick: () => { setFilter(key); setSelected('') } }, t(name), ' ', h('span', null, rows[key].length)))),
              h('label', { className: 'moba-search' }, h(Glyph, { kind: 'search', size: 16 }),
                h('input', { type: 'search', value: query, 'aria-label': t('搜索委托'), placeholder: t('搜索委托、英雄、装备或工作区'),
                  onChange: event => setQuery(event.target.value) })),
              visible.length ? h('fieldset', { className: 'moba-plan-list', 'aria-label': t('预览委托') },
                visible.map(item => h('label', { className: 'moba-plan-option', key: item.id, 'data-picked': item.id === entry.id },
                  h('input', { type: 'radio', name: group, checked: item.id === entry.id, onChange: () => setSelected(item.id) }),
                  item.hero ? h(HeroArt, { ...item.hero, className: 'moba-match-plan-portrait' })
                    : h(Glyph, { kind: 'mastery', size: 24 }),
                  h('span', null, h('strong', null, item.title),
                    h('small', null, [t(journalModes[item.mode]), item.workspace].filter(Boolean).join(' · '))))))
                : h('p', { className: 'moba-empty', role: 'status' }, terms.length ? t('没有符合搜索条件的委托。') : t('这里暂时没有委托。')))),
          entry && h(JournalQuestDetail, { key: entry.id, entry, onOpenMatch: id => { close(); onOpenMatch(id) } })))
    }

    function RelayLoadoutCheck({ sessionId, relay, draftKey, revision, request, pending, onRepair, onReturn }) {
      const [checked, setChecked] = useState(null)
      const [attempt, retry] = useState(0)
      const key = JSON.stringify([sessionId, relay.questId, draftKey, revision, attempt])
      const result = checked?.key === key ? checked : undefined
      const value = result?.value
      const item = value?.item ?? relay.gear
      const timing = { condition: t('按条件启用'), turn: t('待回合触发') }
      const status = value?.ready ? timing[value.timing] ?? t('阵容可用')
        : value?.wrongSource ? t('当前来源与接力不同') : value ? t('阵容尚缺接力装备') : undefined
      useEffect(() => {
        const abort = new AbortController()
        request('relay-loadout-preview', { action: 'relay-loadout-preview', sessionId, questId: relay.questId,
          draft: JSON.parse(draftKey) }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setChecked({ key, value }) })
          .catch(reason => { if (!abort.signal.aborted) setChecked({ key, error: reason.message }) })
        return () => abort.abort()
      }, [key, draftKey, relay.questId, request, sessionId])

      return h('section', { className: 'moba-relay-check', 'aria-label': t('接力阵容核对') },
        h('div', { className: 'moba-relay-check-target' }, h(ItemArt, { item }),
          h('div', null, h('h2', null, t('接力阵容核对')), h('strong', null, item.name),
            item.sourceName && h('small', null, t('接力来源 ') + item.sourceName), value?.title && h('small', null, value.title))),
        h('div', { className: 'moba-relay-check-result' },
          !result ? h('p', { role: 'status' }, t('正在核对当前阵容…')) : result.error
            ? h('p', { role: 'alert' }, result.error, ' ', h('button', { type: 'button', className: 'moba-text',
              disabled: pending, onClick: () => retry(value => value + 1) }, t('重试')))
            : h(Fragment, null,
              h('p', { role: 'status', 'data-ready': value.ready }, value.hero.name, ' · ', status),
              value.wrongSource && value.currentSource && h('p', null, t('当前来源 ') + value.currentSource),
              value.firstHero?.id === value.hero.id && h('p', null, t('当前仍是第一棒英雄，可换另一位英雄接棒。')),
              value.repair?.removed.length > 0 && h('p', null, t('采用时将卸下 ') + value.repair.removed.join('、') + '。'),
              value.repair?.restored.length > 0 && h('p', null, t('采用时将恢复 ') + value.repair.restored.join('、') + '。'),
              value.repair?.timing && timing[value.repair.timing] && h('p', null, t('采用后') + timing[value.repair.timing] + '。'),
              value.reason && h('p', null, value.reason))),
        h('div', { className: 'moba-relay-check-actions' },
          value?.repair && h('button', { type: 'button', className: 'moba-equip', disabled: pending,
            onClick: () => onRepair(value.repair.draft) }, item.sourceId ? t('采用接力来源') : t('装上接力装备')),
          h('button', { type: 'button', className: 'moba-text', disabled: pending, onClick: onReturn }, t('回原对局'))))
    }

    function Lobby({ request, workspaces, open, manage, openSource, openDraftSession, getReturnDraft, consumeReturnDraft }) {
      const language = useLanguage()
      const workspaceList = useSyncExternalStore(workspaces.subscribe.bind(workspaces), workspaces.getSnapshot.bind(workspaces))
      const [returning] = useState(getReturnDraft)
      const pendingReturn = useRef(returning)
      const proven = returning?.proven
      const [matchMode, setMatchMode] = useState(returning?.followUp || proven ? 'fresh'
        : returning?.sessionId ? returning.running ? 'after-turn' : 'continue' : undefined)
      const choseMatchMode = useRef(Boolean(returning?.followUp || proven))
      const [continuation, setContinuation] = useState(returning?.continuation)
      const [workspaceChoice, setWorkspaceChoice] = useState(returning?.workspaceId ?? '')
      const [data, setData] = useState(null)
      const [loadAttempt, setLoadAttempt] = useState(0)
      const [presetChoice, setPresetChoice] = useState(proven?.draft.presetId ?? '')
      const [equipmentIds, setEquipmentIds] = useState(proven?.draft.equipmentIds ?? [])
      const [equipmentSources, setEquipmentSources] = useState(proven?.draft.equipmentSources ?? {})
      const [removedEquipmentIds, setRemovedEquipmentIds] = useState(proven?.draft.removedEquipmentIds ?? [])
      const [draftLabels, setDraftLabels] = useState(() => Object.fromEntries(proven?.gear?.map(item => [item.id, item.name]) ?? empty))
      const [savedId, setSavedId] = useState('')
      const [inspected, setInspected] = useState(proven?.draft.equipmentIds[0] ?? 'evidence')
      const [requestedGear, setRequestedGear] = useState(null)
      const [error, setError] = useState('')
      const [pending, setPending] = useState(false)
      const [starterOpen, setStarterOpen] = useState(false)
      const starterLaunchIds = useRef({})
      const starterButton = useRef(null)
      const [heroTrialOpen, setHeroTrialOpen] = useState(null)
      const heroTrialButton = useRef(null)
      const resumeHeroTrialButton = useRef(null)
      const [lessonOpen, setLessonOpen] = useState(null)
      const lessonButton = useRef(null)
      const starterLessonButton = useRef(null)
      const evidenceButton = useRef(null)
      const starterEvidenceButton = useRef(null)
      const [challengeTrigger, setChallengeTrigger] = useState(null)
      const challengeButton = useRef(null)
      const starterChallengeButton = useRef(null)
      const [pendingLighthouseOpen, setPendingLighthouseOpen] = useState(false)
      const pendingLighthouseButton = useRef(null)
      const [lighthouseCompareOpen, setLighthouseCompareOpen] = useState(false)
      const lighthouseCompareButton = useRef(null)
      const [playbooksOpen, setPlaybooksOpen] = useState(false)
      const playbooksButton = useRef(null)
      const [workspaceCompareOpen, setWorkspaceCompareOpen] = useState(false)
      const workspaceCompareButton = useRef(null)
      const [runHistory, setRunHistory] = useState('')
      const runHistoryButton = useRef(null)
      const runHistoryTrigger = useRef(null)
      const [notice, setNotice] = useState(proven ? t('已载入实战出装草稿。') : '')
      const [appearance, setAppearance] = useState(null)
      const [actionTarget, setActionTarget] = useState(null)
      const [galleryOpen, setGalleryOpen] = useState(false)
      const [pairingPreview, setPairingPreview] = useState(null)
      const [flagsOpen, setFlagsOpen] = useState(() => returning?.flagId ? { id: returning.flagId } : null)
      const [historicalHero, setHistoricalHero] = useState(proven?.draft.presetId ?? returning?.followUp?.heroId ?? '')
      const [journalOpen, setJournalOpen] = useState(false)
      const [planMode, setPlanMode] = useState(proven?.save ? 'create' : '')
      const [followUp, setFollowUp] = useState(returning?.followUp)
      const [trialTarget, setTrialTarget] = useState(null)
      const [deliveryTarget, setDeliveryTarget] = useState(null)
      const [openingOpen, setOpeningOpen] = useState(Boolean(returning?.followUp))
      const [opening, setOpening] = useState(null)
      const [openingProblem, setOpeningProblem] = useState(null)
      const openingId = useId()
      const openingButton = useRef(null)
      const [comparisonOpen, setComparisonOpen] = useState(false)
      const [comparisonAgainst, setComparisonAgainst] = useState('')
      const [comparisonJump, setComparisonJump] = useState(0)
      const comparisonId = useId()
      const comparisonButton = useRef(null)
      const starting = useRef(false)
      const lobby = useRef(null)
      const audio = useRef(null)
      const [sound, setSound] = useState(false)
      const [fullscreen, setFullscreen] = useState(false)

      useEffect(() => {
        consumeReturnDraft(returning)
      }, [consumeReturnDraft, returning])

      useEffect(() => {
        if (!returning?.sessionId) return
        return observeMatch(returning.sessionId, request, value => {
          setContinuation(value.continuation)
          if (!choseMatchMode.current && value.active) {
            const queued = value.continuation?.state === 'waiting' || value.continuation?.state === 'starting'
            setMatchMode(value.running || queued ? 'after-turn' : 'continue')
          }
        }, () => {}, () => {})
      }, [request, returning?.sessionId])

      useEffect(() => {
        const sync = () => setFullscreen(document.fullscreenElement === lobby.current)
        document.addEventListener('fullscreenchange', sync)
        return () => {
          document.removeEventListener('fullscreenchange', sync)
          audio.current?.close().catch(() => {})
        }
      }, [])

      async function toggleFullscreen() {
        try {
          if (document.fullscreenElement === lobby.current) await document.exitFullscreen()
          else await lobby.current.requestFullscreen()
        } catch {
          setNotice(t('当前窗口无法进入全屏。'))
        }
      }

      async function toggleSound() {
        if (sound) return setSound(false)
        try {
          audio.current ??= new AudioContext()
          await audio.current.resume()
          setSound(true)
        } catch {
          setNotice(t('当前设备无法播放音效。'))
        }
      }

      function cue(type) {
        if (!sound || audio.current?.state !== 'running') return
        const context = audio.current
        const notes = type === 'lock' ? [330, 440, 660] : type === 'equip' ? [440, 660] : [293.7, 440]
        notes.forEach((frequency, index) => {
          const at = context.currentTime + index * .042
          const oscillator = context.createOscillator()
          const volume = context.createGain()
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          volume.gain.setValueAtTime(.0001, at)
          volume.gain.exponentialRampToValueAtTime(.075, at + .015)
          volume.gain.exponentialRampToValueAtTime(.0001, at + .16)
          oscillator.connect(volume).connect(context.destination)
          oscillator.start(at)
          oscillator.stop(at + .17)
        })
      }

      useEffect(() => {
        const abort = new AbortController()
        request('list', null, abort.signal).then(value => {
          if (abort.signal.aborted) return
          const draft = pendingReturn.current
          pendingReturn.current = null
          const selectedPreset = !draft?.proven && (draft?.selectionPresetId ?? draft?.presetId)
          if (selectedPreset) {
            const saved = value.saved.find(item => item.id === selectedPreset)
            if (saved && value.presets.some(item => item.id === saved.baseId && !item.broken)) {
              setPresetChoice(saved.baseId)
              setEquipmentIds(saved.equipmentIds)
              setEquipmentSources(saved.equipmentSources ?? {})
              setRemovedEquipmentIds(saved.removedEquipmentIds ?? [])
              setDraftLabels(saved.equipmentLabels ?? {})
              setInspected(saved.equipmentIds[0] ?? 'evidence')
            } else if (saved) {
              setSavedId(saved.id)
            } else {
              setPresetChoice(selectedPreset)
            }
          }
          if (draft?.inspect) {
            const { id, sourceId, sourceName } = draft.inspect
            const item = value.equipment.find(item => item.id === id)
            if (item) {
              setInspected(item.id)
              setRequestedGear({ id: item.id, name: item.name, discovered: Boolean(item.discovery), sourceId, sourceName })
            } else {
              setNotice('「' + draft.inspect.name + t('」当前未出现在装备库。'))
            }
          }
          setData(value)
        }).catch(reason => {
          if (!abort.signal.aborted) setError(reason.message)
        })
        return () => abort.abort()
      }, [request, loadAttempt, language])

      const presets = data?.presets ?? empty
      const roles = data?.roles ?? emptyMap
      const savedBuilds = labelSavedBuilds(data?.saved ?? empty)
      const plans = data?.plans ?? empty
      const saved = savedBuilds.find(item => item.id === savedId)
      const preset = presets.find(item => item.id === (saved?.baseId ?? presetChoice) && !item.broken)
        ?? presets.find(item => item.isDefault && !item.broken)
        ?? presets.find(item => !item.broken)
      const stagePreset = saved && saved.baseId !== preset?.id
        ? { id: saved.baseId, name: saved.baseName, art: saved.heroArt, rank: saved.heroRank, signature: saved.heroSignature }
        : preset
      const items = data?.equipment ?? empty
      const catalog = new Map(items.map(item => [item.id, item]))
      const selected = saved?.equipmentIds ?? equipmentIds
      const builtIn = preset?.builtIn ?? emptyMap
      const removed = removedBuiltIns(removedEquipmentIds, builtIn)
      const removedLabels = saved ? Object.values(saved.removedEquipmentLabels ?? emptyMap)
        : [...removed].map(id => builtIn[id]?.name ?? draftLabels[id] ?? id)
      const removedIds = saved ? Object.keys(saved.removedEquipmentLabels ?? emptyMap) : [...removed]
      const sourceChoices = saved?.equipmentSources ?? equipmentSources
      const standingClaims = data?.standingClaims ?? emptyMap
      const draftStatus = id => draftEquipmentStatus(preset?.tools[id], removed, equipmentSources[id])
      const conflictsFor = (id, status) => standingConflicts(id, status, selected, draftStatus, standingClaims)
      const selections = selected.map(id => ({
        ...(catalog.get(id) ?? { id, name: saved?.equipmentLabels?.[id] ?? draftLabels[id] ?? id,
          summary: t('装配记录保存在此阵容中。') }),
        art: (saved ? saved.equipmentArt?.[id] : draftStatus(id)?.art) ?? catalog.get(id)?.art,
        roles: (saved ? saved.equipmentRoles?.[id] : draftStatus(id)?.roles) ?? catalog.get(id)?.roles,
        sourceId: saved ? saved.equipmentSources?.[id] : draftStatus(id)?.sourceId,
        sourceName: saved ? saved.equipmentSourceLabels?.[id] : draftStatus(id)?.sourceName,
      }))
      const unavailable = saved ? empty : selections.filter(item => {
        const status = draftStatus(item.id)
        return status?.state !== 'available' || status.replacement?.remove.length
      })
      const draftConflicts = saved ? empty : selections.filter(item => conflictsFor(item.id, draftStatus(item.id)).length)
      const workspace = workspaceList.items.find(item => item.workspaceId === workspaceChoice)
        ?? workspaceList.items.find(item => item.workspaceId !== data?.lighthouseWorkspaceId) ?? workspaceList.items[0]
      const comparableWorkspaces = workspaceList.items.filter(item => item.workspaceId !== data?.lighthouseWorkspaceId)
      const trialHeroes = data?.heroTrialAvailable ? heroTrialHeroes.flatMap(option => {
        const hero = presets.find(item => item.id === option.id && !item.broken)
        return hero ? [{ ...option, art: hero.art }] : empty
      }) : empty
      const lastTrialNeed = heroTrialNeeds.find(item => item.id === data?.lastHeroTrial?.need)
      const historicalHeroMissing = !saved && historicalHero && presetChoice === historicalHero && preset?.id !== historicalHero
      const canCompare = saved ? !saved.broken : Boolean(preset) && !historicalHeroMissing && !unavailable.length && !draftConflicts.length
      const galleryBase = !canCompare && presets.some(item => item.id === stagePreset?.id && !item.broken)
        ? { presetId: stagePreset.id, equipmentIds: [] } : undefined
      const queued = continuation?.state === 'waiting' || continuation?.state === 'starting'
      const canOpenWithQuest = !matchMode || matchMode === 'fresh'
      const draftKey = JSON.stringify(loadoutDraft())
      const openingStale = Boolean(opening && opening.draftKey !== draftKey)
      const canStart = !pending && ((matchMode && matchMode !== 'fresh') || Boolean(workspace)) && canCompare
        && !(matchMode === 'after-turn' && queued) && !(canOpenWithQuest && (openingOpen || openingStale))
      const canEditSaved = saved && presets.some(item => item.id === saved.baseId && !item.broken)
      const editAppearance = (kind, item) => setAppearance({ kind, id: item.id, name: item.name, art: item.art,
        sourceId: item.sourceId, rank: item.rank })
      const editActions = (kind, item) => setActionTarget({ kind, id: item.id, name: item.name, art: item.art, sourceId: item.sourceId })

      function loadoutDraft() {
        return { presetId: saved?.id ?? preset?.id, equipmentIds: saved ? [] : equipmentIds,
          equipmentSources: saved ? undefined : sourcesFor(equipmentIds, equipmentSources),
          removedEquipmentIds: saved ? undefined : removedEquipmentIds }
      }

      function setOpeningQuest(quest, labels) {
        const same = opening?.draftKey === draftKey && JSON.stringify(opening.quest) === JSON.stringify(quest)
        const launchId = same ? opening.launchId
          : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
        setOpening({ quest, labels, draftKey, launchId })
        closeOpening()
      }

      function closeOpening() {
        setOpeningOpen(false)
        setTrialTarget(null)
        setDeliveryTarget(null)
        openingButton.current?.focus()
      }

      function inspectFollowUpGear(item) {
        const card = catalog.get(item.id)
        if (saved || !card) return
        return h('button', { type: 'button', className: 'moba-text', disabled: pending,
          'aria-label': t('在装备库查看 ') + item.name, onClick: () => {
            setInspected(item.id)
            setRequestedGear({ id: item.id, name: card.name, discovered: Boolean(card.discovery),
              sourceId: questToolSource(item), sourceName: item.sourceName })
            setOpeningOpen(false)
          } }, t('查看装备'))
      }

      function inspectGalleryEquipment(id) {
        const card = catalog.get(id)
        if (!card) return
        if (saved) {
          if (canEditSaved) editSaved()
          else selectSavedBuild('')
        }
        setInspected(id)
        setRequestedGear({ id, name: card.name, discovered: Boolean(card.discovery) })
      }

      function selectSavedBuild(id) {
        setSavedId(id)
        setInspected(savedBuilds.find(item => item.id === id)?.equipmentIds[0] ?? 'evidence')
        setError('')
        setNotice('')
      }

      function applyPlan(plan) {
        selectSavedBuild(plan.presetId === plan.heroId ? '' : plan.presetId)
        if (plan.presetId === plan.heroId) {
          setPresetChoice(plan.heroId)
          setEquipmentIds([])
          setEquipmentSources({})
          setRemovedEquipmentIds([])
          setDraftLabels({})
        }
        cue('hero')
        setNotice(t('已采用「') + plan.name + '」。')
      }

      function applyHistoricalDraft(draft, labels, inspectId, notice, { preserveMatchMode = false } = {}) {
        cue('hero')
        setHistoricalHero(draft.presetId)
        setPresetChoice(draft.presetId)
        setSavedId('')
        setEquipmentIds(draft.equipmentIds)
        setEquipmentSources(draft.equipmentSources)
        setRemovedEquipmentIds(draft.removedEquipmentIds)
        setDraftLabels(labels)
        setOpening(null)
        setOpeningOpen(false)
        setOpeningProblem(null)
        setFollowUp(undefined)
        setTrialTarget(null)
        setDeliveryTarget(null)
        setComparisonOpen(false)
        choseMatchMode.current = true
        if (!preserveMatchMode) setMatchMode(returning?.sessionId ? 'fresh' : undefined)
        const card = catalog.get(inspectId)
        setInspected(inspectId)
        setRequestedGear(card ? { id: card.id, name: card.name, discovered: Boolean(card.discovery) } : null)
        setError('')
        setNotice(notice)
        setLoadAttempt(attempt => attempt + 1)
      }

      function closePlaybooks() {
        setPlaybooksOpen(false)
        requestAnimationFrame(() => playbooksButton.current?.focus())
      }

      function adoptPlaybook(id, name, draft) {
        const labels = Object.fromEntries(draft.equipmentIds.map(item => [item, catalog.get(item)?.name ?? item]))
        const preferred = id === 'review' ? 'review' : 'present'
        const inspectId = draft.equipmentIds.includes(preferred) ? preferred : draft.equipmentIds[0] ?? preferred
        applyHistoricalDraft(draft, labels, inspectId, t('已采用「%s」打法。').replace('%s', name), { preserveMatchMode: true })
        closePlaybooks()
      }

      function adoptSharedPlan({ name, draft, adapted }) {
        const labels = Object.fromEntries(draft.equipmentIds.map(id => [id, catalog.get(id)?.name ?? id]))
        applyHistoricalDraft(draft, labels, draft.equipmentIds[0] ?? 'evidence',
          t(adapted ? '已采用「%s」的换装草稿。' : '已采用「%s」的分享出装。').replace('%s', () => name), { preserveMatchMode: true })
      }

      function showRunHistory(kind = 'all', trigger = runHistoryButton) {
        setLighthouseCompareOpen(false)
        setWorkspaceCompareOpen(false)
        runHistoryTrigger.current = trigger
        setRunHistory(kind)
      }

      function closeRunHistory() {
        const trigger = runHistoryTrigger.current
        setRunHistory('')
        requestAnimationFrame(() => (trigger?.current ?? runHistoryButton.current)?.focus())
      }

      function adoptComparisonLoadout({ draft, gear, workspaceId }, save) {
        const labels = Object.fromEntries((gear ?? empty).map(item => [item.id, item.name]))
        applyHistoricalDraft(draft, labels, draft.equipmentIds[0] ?? 'evidence', t('已载入实战出装草稿。'))
        setMatchMode('fresh')
        if (workspaceList.items.some(item => item.workspaceId === workspaceId)) setWorkspaceChoice(workspaceId)
        setLighthouseCompareOpen(false)
        setWorkspaceCompareOpen(false)
        setRunHistory('')
        if (save) setPlanMode('create')
      }

      function applyFlagLoadout(flag, { draft, slots, practice }, mode) {
        const slot = slots.find(item => !item.available) ?? slots.find(item => item.placement === 'selected') ?? slots[0]
        applyHistoricalDraft(draft, Object.fromEntries(slots.map((entry, index) => [entry.id, flag.pair[index].name])),
          slot.id, t('已载入「') + flag.title + t('」的连携出装。'))
        if (mode) {
          const gear = slots.map((slot, index) => ({ ...flag.pair[index], id: slot.id }))
          const quest = mode === 'practice' ? practice : { mode: 'combo', gearIds: gear.map(item => item.id),
            upgradeFlagId: flag.id, staged: mode === 'staged', title: '' }
          setFollowUp({ id: flag.id, flagLabel: mode === 'practice' ? t('战旗复练') : t('战旗升级'), heroId: flag.hero.id, quest, gear })
          setOpeningOpen(true)
        }
      }

      function previewPairing(pairing) {
        setPairingPreview({ ...pairing, againstDraft: canCompare ? loadoutDraft() : galleryBase,
          withDraft: canCompare,
          baselineLabel: canCompare ? t('当前出装') : galleryBase ? t('当前英雄基础阵容') : t('所选英雄基础阵容'),
          hasOpening: Boolean(opening || followUp || trialTarget || deliveryTarget) })
      }

      function fitEquipment(item) {
        const hero = stagePreset && !stagePreset.broken ? stagePreset : presets.find(hero => !hero.broken)
        if (!hero) return
        previewPairing({ fitting: true, item, hero, presets, catalogItems: items,
          sourceId: item.kind === 'tool' && item.sourceId !== 'profile' ? item.sourceId : undefined })
      }

      function applyGearRepair(draft, notice) {
        cue('equip')
        setPresetChoice(draft.presetId)
        setSavedId('')
        setEquipmentIds(draft.equipmentIds)
        setEquipmentSources(draft.equipmentSources)
        setRemovedEquipmentIds(draft.removedEquipmentIds)
        setDraftLabels(saved?.equipmentLabels ?? draftLabels)
        setError('')
        setNotice(notice)
      }

      async function applyOpeningRepair({ draft, collection }) {
        if (!collection) return applyGearRepair(draft, t('已调整开局阵容。'))
        if (starting.current) return
        starting.current = true
        setPending(true)
        setError('')
        try {
          const { id, sessionId, toolId } = collection
          await request('equipment-collection', { action: 'equipment-collection', itemId: id, sessionId, toolId, remove: false })
          setData(await request('list', null))
          applyGearRepair(draft, t('已收藏原来源并加入开局阵容。'))
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setPending(false)
        }
      }

      function prepareEquipmentTrial(item, equip) {
        if (equip) toggle(item, false, equip)
        setFollowUp(undefined)
        setDeliveryTarget(null)
        setTrialTarget(item)
        setOpeningOpen(true)
        choseMatchMode.current = true
        setMatchMode(returning?.sessionId ? 'fresh' : undefined)
      }

      function prepareHeroDelivery(hero, heroActionKey, title) {
        if (hero.id !== stagePreset?.id) changePreset(hero.id)
        setComparisonOpen(false)
        setFollowUp(undefined)
        setTrialTarget(null)
        setDeliveryTarget({ mode: 'delivery', heroId: hero.id, heroName: hero.name, heroActionKey, title })
        setOpeningOpen(true)
        choseMatchMode.current = true
        setMatchMode(returning?.sessionId ? 'fresh' : undefined)
      }

      function prepareFittingCombo(draft, slots, mode) {
        const gear = slots.map(slot => slot.item)
        setOpening(null)
        setOpeningProblem(null)
        setTrialTarget(null)
        setDeliveryTarget(null)
        setFollowUp({ id: 'equipment-fitting', fitting: true, heroId: draft.presetId, gear,
          quest: { mode: 'combo', gearIds: gear.map(item => item.id),
            ...(mode.id === 'staged' && { staged: true }), comboActionKey: mode.actionKey, prepareActionKey: mode.prepareKey } })
        setOpeningOpen(true)
        choseMatchMode.current = true
        setMatchMode(returning?.sessionId ? 'fresh' : undefined)
      }

      function prepareHeroRound(followUp) {
        const hero = presets.find(item => item.id === followUp.heroId && !item.broken)
        if (!hero) throw new Error(t('这位英雄当前不可用。'))
        if (saved?.baseId === hero.id) editSaved()
        else if (stagePreset?.id !== hero.id) changePreset(hero.id)
        setOpening(null)
        setOpeningProblem(null)
        setComparisonOpen(false)
        setHistoricalHero(hero.id)
        setTrialTarget(null)
        setDeliveryTarget(null)
        setFollowUp(followUp)
        setOpeningOpen(true)
        choseMatchMode.current = true
        setMatchMode(returning?.sessionId ? 'fresh' : undefined)
      }

      async function planChanged(mode, result) {
        if (mode === 'remove' && comparisonAgainst === 'plan:' + result.id) setComparisonAgainst('')
        try {
          setData(await request('list', null))
        } catch {
          setLoadAttempt(attempt => attempt + 1)
        }
        if (mode === 'create' || mode === 'replace') {
          setNotice(t('已保存出装方案「') + result.name + '」。')
        }
      }

      function showPlanComparison(plan) {
        setComparisonAgainst('plan:' + plan.id)
        setComparisonJump(value => value + 1)
        setComparisonOpen(true)
      }

      function editSaved() {
        if (!canEditSaved) return
        setPresetChoice(saved.baseId)
        setEquipmentIds(saved.equipmentIds)
        setEquipmentSources(saved.equipmentSources ?? {})
        setRemovedEquipmentIds(saved.removedEquipmentIds ?? [])
        setDraftLabels(saved.equipmentLabels ?? {})
        setInspected(saved.equipmentIds[0] ?? 'evidence')
        setSavedId('')
        setError('')
      }

      function changePreset(id) {
        const next = presets.find(item => item.id === id)
        if (!next || next.broken) return
        const { removed } = gearAfterHeroChange(selections, next, sourceChoices)
        const dropped = new Set(removed.map(item => item.id))
        const carried = selected.filter(id => !dropped.has(id))
        cue('hero')
        setSavedId('')
        setPresetChoice(id)
        setEquipmentIds(carried)
        setEquipmentSources(sourcesFor(carried, sourceChoices))
        setRemovedEquipmentIds([])
        setDraftLabels({})
        setNotice(removed.length ? t('切换英雄后已卸下 ') + removed.map(item => item.name).join('、') + '。' : '')
        setError('')
      }

      function toggle(item, removeOnly = false, preferredStatus) {
        const id = item.id
        const status = preferredStatus ?? draftStatus(id)
        if (pending || saved) return
        const alreadyEquipped = equipmentIds.includes(id)
        const replace = !removeOnly && status?.state === 'available' && status.replacement?.remove.length
        if (alreadyEquipped && !replace && !preferredStatus) {
          cue('equip')
          setError('')
          setEquipmentIds(current => current.filter(picked => picked !== id))
          return
        }
        if (removeOnly || status?.state !== 'available') return
        const provider = status.equipId ?? id
        const conflicts = conflictsFor(id, status)
        if (conflicts.length && !preferredStatus?.draftConflicts?.length) return
        const retained = equipmentIds.filter(picked => !conflicts.some(conflict => conflict.id === picked))
        if (!alreadyEquipped && !status.live && retained.some(picked => (draftStatus(picked)?.equipId ?? picked) === provider)) return
        cue('equip')
        setError('')
        if (replace) setRemovedEquipmentIds(current => [...new Set([...current, ...status.replacement.remove])])
        const next = alreadyEquipped ? retained : [...retained, id]
        if (conflicts.length) setEquipmentSources(current => sourcesFor(next, { ...current, ...(status.sourceId && { [id]: status.sourceId }) }))
        else if (status.sourceId) setEquipmentSources(current => ({ ...current, [id]: status.sourceId }))
        if (!alreadyEquipped || conflicts.length) setEquipmentIds(next)
      }

      function toggleBuiltIn(id) {
        if (pending || saved || !builtIn[id] || builtIn[id].locked) return
        cue('equip')
        setError('')
        setRemovedEquipmentIds(current => removed.has(id)
          ? restoringBuiltIn(id, current, builtIn) : [...current, id])
      }

      function chooseSource(id, sourceId) {
        setError('')
        setEquipmentSources(current => {
          const next = { ...current }
          if (sourceId) next[id] = sourceId
          else delete next[id]
          return next
        })
        if (!sourceId) setEquipmentIds(current => current.filter(picked => picked !== id))
      }

      function onDropItem(id) {
        const item = catalog.get(id)
        const status = draftStatus(id)
        if (!item || selected.includes(id) || status?.replacement?.remove.length || conflictsFor(id, status).length) return
        setInspected(id)
        toggle(item)
      }

      async function enableProfileItem(itemId) {
        if (starting.current) return
        starting.current = true
        setError('')
        setNotice('')
        setPending(true)
        try {
          const result = await request('enable-profile', { action: 'enable-profile', itemId })
          setNotice(result.application === 'restart-required'
            ? t('插件已保存，重启当前 DSH 后生效。') : t('插件已在当前 Profile 生效。'))
          setLoadAttempt(attempt => attempt + 1)
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setPending(false)
        }
      }

      async function updateCollection(collection) {
        if (starting.current) return
        starting.current = true
        setPending(true)
        setError('')
        setNotice('')
        try {
          const result = await request('equipment-collection', { action: 'equipment-collection',
            itemId: collection.id, sessionId: collection.sessionId, toolId: collection.toolId, remove: collection.saved === true })
          setNotice(result.saved ? t('已收入装备库收藏。') : t('已取消收藏。'))
          setLoadAttempt(attempt => attempt + 1)
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setPending(false)
        }
      }

      async function start() {
        if (!canStart || starting.current) return
        starting.current = true
        setError('')
        setOpeningProblem(null)
        setPending(true)
        try {
          const draft = loadoutDraft()
          if (canOpenWithQuest && opening) {
            const result = await request('growth-open', { action: 'growth-open', workspaceId: workspace.workspaceId,
              draft, quest: opening.quest, launchId: opening.launchId })
            if (result.questError) {
              setOpeningProblem(result)
              return
            }
            cue('lock')
            openSource(result.sessionId)
          } else if (matchMode === 'after-turn') {
            const entry = await request('continue-queue', { ...draft, action: 'continue-queue', sourceSessionId: returning.sessionId })
            cue('lock')
            if (entry) setContinuation(current => current?.id === entry.id ? current : entry)
          } else {
            const result = await request('prepare', draft)
            cue('lock')
            await open(workspace?.workspaceId, result, matchMode, returning?.sessionId)
          }
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setPending(false)
        }
      }

      async function updateContinuation(action) {
        if (starting.current || !continuation) return
        starting.current = true
        setError('')
        setPending(true)
        try {
          const entry = await request(action, { action,
            sourceSessionId: returning.sessionId, id: continuation.id })
          setContinuation(entry)
        } catch (reason) {
          setError(reason.message)
        } finally {
          starting.current = false
          setPending(false)
        }
      }

      return h('main', { className: 'moba-lobby', lang: language, 'aria-labelledby': 'moba-title', ref: lobby },
        h('div', { className: 'moba-inner' },
          h('header', { className: 'moba-header' },
            h('div', { className: 'moba-heading' }, h(Glyph, { kind: 'crest', size: 37 }),
              h('h1', { id: 'moba-title' }, panelLabel())),
            h('div', { className: 'moba-header-tools' },
              returning?.sessionId && h('button', { className: 'moba-text', type: 'button', disabled: pending,
                onClick: () => openSource(returning.sessionId) }, t('回原会话')),
              data && h('button', { className: 'moba-roster-open moba-playbook-button', type: 'button', disabled: pending,
                ref: playbooksButton, 'aria-haspopup': 'dialog', onClick: () => setPlaybooksOpen(true) },
              h(Glyph, { kind: 'action', size: 15 }), t('实战打法')),
              data && h('button', { className: 'moba-roster-open', type: 'button', disabled: pending,
                ref: workspaceCompareButton, 'aria-haspopup': 'dialog', onClick: () => setWorkspaceCompareOpen(true) },
              h(Glyph, { kind: 'swap', size: 15 }), t('实战同题对照')),
              data && h('button', { className: 'moba-roster-open', type: 'button', disabled: pending,
                ref: runHistoryButton, 'aria-haspopup': 'dialog', onClick: () => showRunHistory() },
              h(Glyph, { kind: 'report', size: 15 }), runHistoryLabel()),
              data && h('button', { className: 'moba-roster-open', type: 'button', disabled: pending,
                'aria-haspopup': 'dialog', onClick: () => {
                  setLoadAttempt(attempt => attempt + 1)
                  setPlanMode('library')
                } }, h(Glyph, { kind: 'report', size: 15 }), t('出装方案')),
              data && h('button', { className: 'moba-roster-open', type: 'button', disabled: pending,
                'aria-haspopup': 'dialog', onClick: () => setFlagsOpen({}) }, h(Glyph, { kind: 'flag', size: 15 }), t('战旗收藏')),
              h('button', { className: 'moba-roster-open', type: 'button', disabled: pending,
                'aria-haspopup': 'dialog', onClick: () => setJournalOpen(true) }, h(Glyph, { kind: 'report', size: 15 }), t('委托簿')),
              data?.saved.length > 0 && h('label', { className: 'moba-saved' }, t('已保存阵容'),
                h('select', { value: savedId, disabled: pending, onChange: event => selectSavedBuild(event.target.value) },
                  h('option', { value: '' }, t('新阵容')), savedBuilds.map(item =>
                  h('option', { key: item.id, value: item.id }, item.label)))),
              typeof AudioContext === 'function' && h('button', { type: 'button', className: 'moba-icon-action',
                onClick: toggleSound, 'aria-label': t('游戏音效'), 'aria-pressed': sound,
                title: sound ? t('关闭游戏音效') : t('开启游戏音效') }, h(Glyph, { kind: 'volume' })),
              document.fullscreenEnabled && h('button', { type: 'button', className: 'moba-icon-action',
                onClick: toggleFullscreen, 'aria-label': fullscreen ? t('退出全屏') : t('全屏备战'),
                'aria-pressed': fullscreen, title: fullscreen ? t('退出全屏') : t('全屏备战') }, h(Glyph, { kind: 'fullscreen' })))),
          data && h('div', { className: 'moba-lighthouse-entry' },
            trialHeroes.length === 2 && h('button', { type: 'button', ref: heroTrialButton, disabled: pending,
              className: 'moba-starter-entry moba-hero-trial-entry', 'aria-haspopup': 'dialog', 'aria-label': t(heroTrialTitle),
              onClick: () => setHeroTrialOpen({ trigger: heroTrialButton }) },
              h('span', { className: 'moba-hero-trial-emblems' }, trialHeroes.map(hero =>
                h(HeroArt, { key: hero.id, id: hero.id, art: hero.art, className: 'moba-starter-hero' }))),
              h('span', { className: 'moba-starter-entry-copy' }, h('strong', null, t(heroTrialTitle)),
                h('span', null, t('同一张补给卡，两种交接'))),
              h(Glyph, { kind: 'arrow', size: 19 })),
            h('button', { type: 'button', className: 'moba-starter-entry', disabled: pending, ref: starterButton,
              'aria-haspopup': 'dialog', onClick: () => setStarterOpen(true) },
              h('span', { className: 'moba-starter-symbol' }, h(Glyph, { kind: 'flag', size: 23 })),
              h('span', { className: 'moba-starter-entry-copy' }, h('strong', null, t('灯塔补给行动')),
                h('span', null, t('找到补给卡就撤，还是带着交付物回来？'))),
              h('span', { className: 'moba-starter-entry-action' }, t('选择路线'), h(Glyph, { kind: 'arrow', size: 18 }))),
            h('div', { className: 'moba-lighthouse-entry-actions' },
              data.lastHeroTrial && h('button', { type: 'button', className: 'moba-roster-open moba-lighthouse-entry-button', disabled: pending,
                ref: resumeHeroTrialButton, 'aria-haspopup': 'dialog', 'aria-description': lastTrialNeed && t(lastTrialNeed.name),
                onClick: () => setHeroTrialOpen({ trigger: resumeHeroTrialButton, comparisonId: data.lastHeroTrial.id }) },
              h(Glyph, { kind: 'back', size: 17 }), t('继续上一次试玩')),
              h('button', { type: 'button', className: 'moba-roster-open moba-lighthouse-entry-button', disabled: pending,
                ref: challengeButton, 'aria-haspopup': 'dialog', onClick: () => setChallengeTrigger(challengeButton) },
              h(Glyph, { kind: 'arrow', size: 17 }), t('加入灯塔挑战')),
              data.hasLighthouseRuns === true && h('button', {
                type: 'button', className: 'moba-roster-open moba-lighthouse-entry-button', disabled: pending,
                ref: pendingLighthouseButton, 'aria-haspopup': 'dialog', onClick: () => setPendingLighthouseOpen(true),
              }, h(Glyph, { kind: 'back', size: 17 }), t(lighthouseDraftsLabel)),
              h('button', { type: 'button', className: 'moba-roster-open moba-lighthouse-entry-button', disabled: pending,
                ref: lighthouseCompareButton, 'aria-haspopup': 'dialog', onClick: () => setLighthouseCompareOpen(true) },
              h(Glyph, { kind: 'swap', size: 17 }), t('同题对照')),
              h('button', { type: 'button', className: 'moba-roster-open moba-lighthouse-entry-button', disabled: pending,
                ref: lessonButton, 'aria-haspopup': 'dialog', onClick: () => setLessonOpen({ lesson: lighthouseRematchLesson, trigger: lessonButton }) },
              h(Glyph, { kind: 'flag', size: 17 }), t('灯塔换装练习')),
              h('button', { type: 'button', className: 'moba-roster-open moba-lighthouse-entry-button', disabled: pending,
                ref: evidenceButton, 'aria-haspopup': 'dialog', onClick: () => setLessonOpen({ lesson: lighthouseEvidenceLesson, trigger: evidenceButton }) },
              h(Glyph, { kind: 'search', size: 17 }), t('灯塔证据取舍')))),
          heroTrialOpen && h(HeroTrial, { request, comparisonId: heroTrialOpen.comparisonId, workspaces: comparableWorkspaces,
            firstHeroes: trialHeroes, backLabel: '返回大厅', onClose: () => {
              setHeroTrialOpen(null)
              requestAnimationFrame(() => (heroTrialOpen.trigger.current ?? heroTrialButton.current)?.focus())
            }, onVisit: (sessionId, task) => { setHeroTrialOpen(null); openDraftSession(sessionId, task) } }),
          starterOpen && h(LighthouseStarter, { hero: presets.find(item => item.id === 'standard' && !item.broken),
            request, launchIds: starterLaunchIds, onCancel: () => {
              setStarterOpen(false)
              requestAnimationFrame(() => starterButton.current?.focus())
            }, onEquip: () => cue('equip'),
            onCompare: () => { setStarterOpen(false); setLighthouseCompareOpen(true) },
            onLesson: lesson => setLessonOpen({ lesson, trigger: lesson === lighthouseEvidenceLesson ? starterEvidenceButton : starterLessonButton }),
            lessonButton: starterLessonButton, evidenceButton: starterEvidenceButton,
            challengeButton: starterChallengeButton, onJoinChallenge: () => setChallengeTrigger(starterChallengeButton),
            onOpen: sessionId => { cue('lock'); setStarterOpen(false); openSource(sessionId) } }),
          lessonOpen && h(LighthouseLessonLaunch, { request, lesson: lessonOpen.lesson, onCancel: () => {
            const { trigger } = lessonOpen
            setLessonOpen(null)
            requestAnimationFrame(() => trigger.current?.focus())
          }, onOpen: (sessionId, task) => {
            cue('lock')
            setLessonOpen(null)
            setStarterOpen(false)
            openDraftSession(sessionId, task)
          } }),
          challengeTrigger && h(LighthouseChallengeJoin, { request, firstHeroes: trialHeroes.length === 2 ? trialHeroes : undefined, onCancel: () => {
            setChallengeTrigger(null)
            requestAnimationFrame(() => challengeTrigger.current?.focus())
          }, onOpen: (sessionId, task) => {
            cue('lock')
            setChallengeTrigger(null)
            setStarterOpen(false)
            openDraftSession(sessionId, task)
          } }),
          pendingLighthouseOpen && h(LighthousePendingRuns, { request, onClose: () => {
            setPendingLighthouseOpen(false)
            requestAnimationFrame(() => (pendingLighthouseButton.current ?? challengeButton.current)?.focus())
          }, onOpen: sessionId => {
            setPendingLighthouseOpen(false)
            openSource(sessionId)
          } }),
          lighthouseCompareOpen && h(RunComparison, { request, onUse: adoptComparisonLoadout,
            onHistory: () => showRunHistory('lighthouse'), onClose: () => {
            setLighthouseCompareOpen(false)
            requestAnimationFrame(() => lighthouseCompareButton.current?.focus())
          }, onVisit: (sessionId, task) => {
            setLighthouseCompareOpen(false)
            openDraftSession(sessionId, task)
          } }),
          playbooksOpen && h(FieldPlaybooks, { request, draftKey: canCompare ? draftKey : '', sourceSessionId: returning?.sessionId,
            hasOpening: Boolean(opening || openingOpen || followUp || trialTarget || deliveryTarget),
            onClose: closePlaybooks, onAdopt: adoptPlaybook }),
          workspaceCompareOpen && h(RunComparison, { kind: 'workspace', request, workspaces: comparableWorkspaces,
            initialWorkspaceId: workspace?.workspaceId, onUse: adoptComparisonLoadout,
            onHistory: () => showRunHistory('workspace'), onClose: () => {
              setWorkspaceCompareOpen(false)
              requestAnimationFrame(() => workspaceCompareButton.current?.focus())
            }, onVisit: (sessionId, task) => {
              setWorkspaceCompareOpen(false)
              openDraftSession(sessionId, task)
            } }),
          runHistory && h(ComparisonHistory, { request, workspaces: comparableWorkspaces, initialWorkspaceId: workspace?.workspaceId,
            initialKind: runHistory === evidenceReplayScope ? 'rematch' : runHistory,
            scope: runHistory === evidenceReplayScope ? evidenceReplayScope : undefined,
            onEvidenceSaved: plan => planChanged('create', plan),
            onEvidenceNoteSaved: plan => planChanged('edit', plan),
            onClose: closeRunHistory, onUse: adoptComparisonLoadout, onSource: sessionId => {
              setRunHistory('')
              openSource(sessionId)
            }, onVisit: (sessionId, task) => {
              setRunHistory('')
              openDraftSession(sessionId, task)
            } }),
          error && h('div', { className: 'moba-alert', role: 'alert' }, error,
            !data && h('button', { type: 'button', onClick: () => {
              setError('')
              setLoadAttempt(attempt => attempt + 1)
            } }, t('重试'))),
          notice && h('p', { className: 'moba-empty', role: 'status' }, notice),
          openingProblem && h('div', { className: 'moba-alert', role: 'alert' },
            t('新对局已创建，委托未能接下。') + openingProblem.questError,
            h('button', { type: 'button', className: 'moba-text', disabled: pending,
              onClick: () => openSource(openingProblem.sessionId) }, t('进入已建对局'))),
          continuation && h(Continuation, { entry: continuation, pending, onOpen: openSource,
            onCancel: () => updateContinuation('continue-cancel'), onRequeue: () => updateContinuation('continue-requeue') }),
          appearance && h(AppearanceEditor, { target: appearance, request, onClose: () => setAppearance(null),
            onChanged: message => {
              setAppearance(null)
              setNotice(message)
              setLoadAttempt(attempt => attempt + 1)
            } }),
          actionTarget && h(ActionEditor, { target: actionTarget, request, onClose: () => setActionTarget(null),
            onSaved: () => {
              setActionTarget(null)
              setNotice(t('操作已保存。'))
              setLoadAttempt(attempt => attempt + 1)
            } }),
          !data && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取英雄与装备…')),
          data?.warnings > 0 && h('p', { className: 'moba-alert', role: 'status' }, t('有 ') + data.warnings + t(' 条保存记录无法读取。')),
          saved?.broken && h('p', { className: 'moba-alert', role: 'alert' }, saved.broken),
          historicalHeroMissing && h('p', { className: 'moba-alert', role: 'alert' }, t('出装对应的英雄当前不可用，请重新选择英雄。')),
          unavailable.length > 0 && h('p', { className: 'moba-alert', role: 'status' },
            t('请处理当前阵容中不可用的装备 ') + unavailable.map(item => item.name).join('、') + '。'),
          draftConflicts.length > 0 && h('p', { className: 'moba-alert', role: 'status' },
            t('出装中有同名工具冲突。请选择保留的装备 ') + draftConflicts.map(item => item.name).join('、') + '。'),
          data && stagePreset && returning?.relaySetup && !canOpenWithQuest && h(RelayLoadoutCheck, {
            sessionId: returning.sessionId, relay: returning.relaySetup, draftKey, revision: loadAttempt, request, pending,
            onRepair: draft => applyGearRepair(draft, t('已调整接力阵容。')), onReturn: () => openSource(returning.sessionId) }),
          galleryOpen && h(HeroGallery, { presets, items, roles, current: stagePreset?.id, initialHero: galleryOpen.heroId,
            initialEquipment: galleryOpen.equipmentId, gear: selections,
            currentDraft: canCompare ? loadoutDraft() : galleryBase, baseOnly: Boolean(galleryBase),
            sources: sourceChoices, request, onRegistered: () => setLoadAttempt(attempt => attempt + 1),
            signatureRules: data?.signatureRules, onSignature: (id, signature) => setData(value => ({ ...value,
              presets: value.presets.map(item => item.id === id ? { ...item, signature } : item),
              saved: value.saved.map(item => item.baseId === id ? { ...item, heroSignature: signature } : item) })),
            onClose: () => setGalleryOpen(false), onSelect: changePreset, onInspectGear: inspectGalleryEquipment,
            onOpenMatch: openSource, onPrepareRound: prepareHeroRound,
            trialHeroes, onOpenTrial: openDraftSession, workspaces: comparableWorkspaces,
            onPrepareDelivery: pending || !canCompare ? undefined : prepareHeroDelivery }),
          flagsOpen && h(FlagCollection, { request, heroId: stagePreset?.id, initialFlagId: flagsOpen.id, onClose: () => setFlagsOpen(null),
            onDisplay: () => setLoadAttempt(attempt => attempt + 1), onOpenMatch: openSource, onPrepare: applyFlagLoadout }),
          pairingPreview && h(PairingPreview, { pairing: pairingPreview, request, onClose: () => setPairingPreview(null),
            onAdopt: ({ draft, item, slots }, prepare, comboMode) => {
              setPairingPreview(null)
              if (pairingPreview.fitting) {
                const names = slots ? slots.map(slot => slot.item.name).join('、') : item.name
                applyGearRepair(draft, t('已采用「') + names + t('」的试装阵容。'))
                setInspected(item.id)
              } else {
                applyHistoricalDraft(draft, { [item.id]: item.name }, item.id, t('已采用「') + item.name + t('」的实战搭配。'))
              }
              if (prepare && slots) prepareFittingCombo(draft, slots, comboMode)
              else if (prepare) prepareEquipmentTrial(item)
            } }),
          journalOpen && h(QuestJournal, { request, onClose: () => setJournalOpen(false), onOpenMatch: openSource }),
          data && planMode && h(BuildPlans, { initialMode: planMode, request, draft: loadoutDraft(), canSave: canCompare,
            workspaces: comparableWorkspaces, workspaceId: workspace?.workspaceId,
            onOpenTask: ({ sessionId, task }) => openDraftSession(sessionId, task), onOpenSource: openSource,
            hasOpening: Boolean(opening || openingOpen || followUp || trialTarget || deliveryTarget),
            current: { hero: stagePreset, items: selections, removed: removedLabels },
            plans: plans.map(plan => {
              const build = savedBuilds.find(item => item.id === plan.presetId)
              return { ...plan, items: (build?.equipmentIds ?? empty).map(id => ({
                id, name: build.equipmentLabels?.[id] ?? catalog.get(id)?.name ?? id,
                art: build.equipmentArt?.[id] ?? catalog.get(id)?.art, sourceId: build.equipmentSources?.[id],
                sourceName: build.equipmentSourceLabels?.[id], roles: build.equipmentRoles?.[id] ?? catalog.get(id)?.roles,
              })), removed: Object.values(build?.removedEquipmentLabels ?? emptyMap),
              removedIds: Object.keys(build?.removedEquipmentLabels ?? emptyMap) }
            }),
            onClose: () => setPlanMode(''), onChanged: planChanged, onApply: applyPlan, onCompare: showPlanComparison,
            onImport: adoptSharedPlan }),
          data && h('div', { className: 'moba-grid' },
            h(HeroStage, { preset: stagePreset, presets, selections, removed: removedIds, roles,
              onInspect: item => {
                setInspected(item.id)
                setRequestedGear({ id: item.id, name: item.name, discovered: Boolean(item.discovery), sourceId: item.sourceId, sourceName: item.sourceName })
              }, onSelect: changePreset, onAppearance: editAppearance,
              onBrowse: () => setGalleryOpen({}), onActions: editActions, disabled: pending }),
            h(Shop, { key: saved ? saved.id : 'new', items: saved ? selections : items, roles,
              activeId: inspected, statuses: saved ? {} : preset?.tools,
              presets, onShowHero: (heroId, equipmentId) => setGalleryOpen({ heroId, equipmentId }), onPreviewPairing: previewPairing,
              onFit: presets.some(hero => !hero.broken) ? fitEquipment : undefined,
              onPrepareTrial: !pending && canCompare ? prepareEquipmentTrial : undefined,
              onPracticeEvidence: presets.some(hero => hero.id === 'standard' && !hero.broken)
                ? trigger => setLessonOpen({ lesson: lighthouseEvidenceLesson, trigger }) : undefined,
              onEvidenceHistory: trigger => showRunHistory(evidenceReplayScope, trigger),
              heroNames: new Map(presets.map(hero => [hero.id, hero.name])),
              selected, onInspect: setInspected, onToggle: toggle, onManage: manage, onEnable: enableProfileItem,
              onOpenSource: openSource, onAppearance: editAppearance, onActions: editActions, onCollection: updateCollection,
              equipmentSources, onSource: chooseSource, builtIn, removed, removalRoots: removedEquipmentIds, onBuiltIn: toggleBuiltIn, standingClaims,
              onEditSaved: canEditSaved ? editSaved : undefined,
              request, revision: loadAttempt,
              onRefresh: () => { setError(''); setLoadAttempt(attempt => attempt + 1) }, disabled: pending,
              saved: Boolean(saved), profileError: data.profileError, requestedItem: requestedGear }),
            h(BuildBar, { selections, removedLabels, workspace, workspaces: workspaceList.items, onWorkspace: setWorkspaceChoice,
              onRemove: id => toggle({ id }, true), onDropItem, onStart: start, pending, canStart, saved: Boolean(saved),
              onSavePlan: () => setPlanMode('create'),
              opening: canOpenWithQuest ? { id: openingId, button: openingButton, selection: opening, stale: openingStale, open: openingOpen,
                enabled: openingOpen || canCompare || Boolean(opening), toggle: () => openingOpen ? closeOpening() : setOpeningOpen(true) } : undefined,
              matchMode, onMatchMode: mode => { choseMatchMode.current = true; setMatchMode(mode) },
              comparison: { id: comparisonId, open: comparisonOpen, button: comparisonButton, enabled: canCompare,
                toggle: () => {
                  if (!comparisonOpen) setComparisonAgainst('')
                  setComparisonOpen(!comparisonOpen)
                } } }),
            canOpenWithQuest && openingOpen && h(OpeningQuestEditor, {
              key: followUp && JSON.stringify([followUp.id, followUp.gear.map(item => [item.id, questToolSource(item)])]),
              id: openingId, draftKey, hero: stagePreset, trialTarget, deliveryTarget,
              initial: opening ?? followUp, followUp, inspectGear: inspectFollowUpGear,
              request, enabled: canCompare, pending, onSave: setOpeningQuest, onClose: closeOpening,
              onRepair: applyOpeningRepair,
              onClear: () => { setOpening(null); setFollowUp(undefined); closeOpening() } }),
            comparisonOpen && h(LoadoutComparison, {
              key: comparisonJump, id: comparisonId, presets, savedBuilds, plans, against: comparisonAgainst,
              onAgainst: setComparisonAgainst, presetId: saved?.id ?? preset?.id, equipmentIds: saved ? empty : equipmentIds,
              equipmentSources, removedEquipmentIds: saved ? empty : removedEquipmentIds,
              source: returning, request, revision: loadAttempt, enabled: canCompare,
              onTrial: pending ? undefined : (item, trialActionKey, title) => {
                setComparisonOpen(false)
                prepareEquipmentTrial({ ...item, trialActionKey, title })
              },
              onDelivery: pending ? undefined : prepareHeroDelivery,
              close: () => { setComparisonOpen(false); comparisonButton.current?.focus() },
            }))))
    }

    function MatchAction({ item, kind, running, ready, questId, questKey, questMode, preparing, shortcutKey, initialInput = '', onSend }) {
      const [input, setInput] = useState(initialInput)
      const [sending, setSending] = useState(false)
      const [error, setError] = useState('')
      const pending = useRef(false)
      const inputId = useId()
      const isTool = kind === 'tool'
      const isTask = kind === 'task'
      const schedulesTool = item.waiting || ((isTool || isTask) && item.deferred)
      const direct = isTool || isTask
      const moves = questKey ? item.actions.filter(move => move.proofKey === questKey) : item.actions ?? empty
      const submit = async move => {
        if (pending.current || !ready) return
        pending.current = true
        setSending(true)
        setError('')
        try {
          const target = isTask ? {} : isTool ? { toolId: item.id, ...(item.pinned && { shortcutKey: item.shortcutKey }) }
            : move.custom || item.kind === 'hero' ? { targetKind: item.kind, targetId: item.id, revision: move.revision ?? item.revision, moveId: move.id }
              : { equipmentId: item.id, moveId: move.id }
          await onSend({ input, ...target, ...(shortcutKey && { shortcutKey }), questId })
        } catch (reason) {
          setError(reason.message)
        } finally {
          pending.current = false
          setSending(false)
        }
      }
      return h('form', { className: 'moba-match-body moba-match-action', onSubmit: event => {
        event.preventDefault()
        if (direct && input.trim()) submit()
      } },
        item.summary && h('p', { className: 'moba-match-action-description' }, item.summary),
        questKey && h('p', { className: 'moba-trial-action-note' }, h(Glyph, { kind: 'action', size: 15 }),
          preparing ? t('连携准备操作') : item.kind === 'hero' ? t('交付指定操作') : questMode === 'combo' ? t('连携指定操作') : t('试炼指定操作')),
        item.sourceName && h('p', { className: 'moba-match-action-note' }, t('装备来源 ') + item.sourceName),
        schedulesTool && h('p', { className: 'moba-match-action-note' }, t('工具会按自身条件在回合中注册，调用时核对所选来源。')),
        h('label', { htmlFor: inputId }, isTask ? t('任务内容') : isTool ? t('要用此工具完成的任务')
          : t('补充材料或要求') + (moves.some(move => move.requiresInput) ? '' : t('（选填）'))),
        h('textarea', { id: inputId, rows: isTask ? 4 : 2, maxLength: 4000, required: direct, value: input,
          disabled: sending, onChange: event => setInput(event.target.value) }),
        h('p', { className: 'moba-match-action-note', role: 'status' },
          !ready ? questId ? t('当前任务或指定操作已变化。') : t('当前会话里的装备尚未就绪。') : sending ? t('正在发送…') : running
            ? t('当前回合进行中，指令会排到下一回合。') : t('指令会发到当前会话。')),
        error && h('p', { className: 'moba-match-action-error', role: 'alert' }, error),
        direct ? h('button', { type: 'submit', className: 'moba-match-move',
          disabled: !ready || sending || !input.trim() }, h('strong', null, schedulesTool ? t('安排回合任务') : isTask ? t('发送任务') : t('发送给助手')),
          h(Glyph, { kind: 'arrow', size: 16 }))
          : h('div', { className: 'moba-match-moves' }, moves.map(move => h(Fragment, { key: move.id }, h('button', {
            className: 'moba-match-move', type: 'button', key: move.id, onClick: () => submit(move),
            'aria-label': move.name, 'aria-describedby': inputId + '-' + move.id,
            disabled: !ready || sending || (move.requiresInput && !input.trim()),
          }, h('span', null, h('strong', null, move.name),
            h('small', { id: inputId + '-' + move.id },
              [move.detail, move.requiresInput && t('需填写补充材料')].filter(Boolean).join(' · '))),
            h(Glyph, { kind: 'arrow', size: 16 })),
          move.publisher && h('details', { className: 'moba-match-instruction' },
            h('summary', null, t('查看「') + move.name + t('」的指令')),
            h('p', { className: 'moba-match-action-note' }, t('由 ') + move.publisher + t(' 提供')),
            h('p', null, move.instruction))))))
    }

    const matchStates = { ready: '已就绪', waiting: '待触发', missing: '当前缺失', conflict: '来源冲突' }

    function matchGearState(item, labels = matchStates) {
      if (item.state === 'ready' && item.conditional) {
        if (item.activation === 'disabled') return t('需开启队伍模式')
        if (item.activation !== 'enabled') return t('按条件启用')
      }
      return t(labels[item.state])
    }

    function matchAvailability(item) {
      if (item.state !== 'ready' || !item.conditional || item.activation === 'enabled') return item.state
      return item.activation === 'disabled' ? 'disabled' : 'conditional'
    }

    function observeMatch(sessionId, request, update, fail, refreshReport) {
      const abort = new AbortController()
      let stream
      let polling
      let timer
      let fetching = false
      let queued = false
      let live = false

      function refreshSoon() {
        if (document.hidden || abort.signal.aborted) return
        queued = true
        if (fetching || timer) return
        timer = setTimeout(async () => {
          timer = undefined
          fetching = true
          queued = false
          try {
            const value = await request('session', { sessionId }, abort.signal)
            if (!abort.signal.aborted) {
              if (live) stopPolling()
              else refreshReport()
              update(value)
            }
          } catch (error) {
            if (!abort.signal.aborted && !document.hidden) {
              fail(error.message)
              startPolling()
            }
          } finally {
            fetching = false
            if (queued) refreshSoon()
          }
        }, 55)
      }

      function startPolling() {
        if (!polling) polling = setInterval(refreshSoon, 1250)
      }
      function stopPolling() {
        clearInterval(polling)
        polling = undefined
      }
      function pause() {
        stream?.close()
        stream = undefined
        live = false
        stopPolling()
        clearTimeout(timer)
        timer = undefined
      }
      function syncVisibility() {
        if (document.hidden) { pause(); return }
        refreshSoon()
        startPolling()
        if (stream || typeof EventSource !== 'function') return
        let watcher
        try {
          watcher = new EventSource('api/' + panelId + '/session-events?' + new URLSearchParams({ sessionId }))
        } catch {
          return
        }
        stream = watcher
        watcher.onmessage = () => {
          if (stream !== watcher) return
          if (!live) refreshReport()
          live = true
          refreshSoon()
        }
        watcher.onerror = () => {
          if (stream !== watcher) return
          live = false
          startPolling()
        }
        watcher.addEventListener('report', () => {
          if (stream === watcher) refreshReport()
        })
      }
      document.addEventListener('visibilitychange', syncVisibility)
      syncVisibility()
      return () => {
        abort.abort()
        pause()
        document.removeEventListener('visibilitychange', syncVisibility)
      }
    }

    const reportTurnStates = {
      completed: '已完成', running: '进行中', aborted: '已停止', blocked: '受阻', error: '出错',
      'max-tokens': '达到输出上限', interrupted: '已中断', forked: '已分支', ended: '已结束',
    }
    const reportToolStates = { completed: '完成', running: '调用中', failed: '失败', unfinished: '结果未确认', conflict: '来源冲突' }
    const reportClocks = Object.fromEntries(['zh', 'en'].map(locale => [
      locale, new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    ]))
    const reportTime = time => reportClocks[activeLanguage.getSnapshot()].format(time)

    function ProvenLoadout({ sessionId, receiptId, request, onBack, onUse }) {
      const language = useLanguage()
      const [picked, setPicked] = useState(null)
      const [state, setState] = useState(null)
      const [attempt, retry] = useState(0)
      const heading = useRef(null)
      const key = JSON.stringify([picked, attempt, language])
      const preview = state?.key === key && !state.error ? state.value : undefined
      const shown = preview ?? state?.value
      const error = state?.key === key ? state.error : undefined
      const gear = shown?.gear ?? empty
      const selected = picked ?? gear.filter(item => item.selected).map(item => item.id)
      const lost = preview?.removed ?? empty
      const canUse = Boolean(preview?.draft)
      const kinds = { round: '回合出装', combo: '已验收连携', staged: '已验收分阶段连携' }
      const evidence = { tool: '工具调用成功', action: '本回合有操作记录', ready: '验收时已就绪', provider: '记录为工具来源' }

      useEffect(() => heading.current?.focus(), [])
      useEffect(() => {
        if (picked?.length === 0) return
        const abort = new AbortController()
        const action = 'match-proven-loadout'
        request(action, { action, sessionId, receiptId, gearIds: picked ?? undefined }, abort.signal, language)
          .then(value => { if (!abort.signal.aborted) setState({ key, value }) })
          .catch(reason => {
            if (!abort.signal.aborted) setState(current => ({ key, value: current?.value, error: reason.message }))
          })
        return () => abort.abort()
      }, [request, sessionId, receiptId, picked, key, language])

      function toggle(id, checked) {
        setState(current => current && { value: current.value })
        setPicked(current => {
          const values = new Set(current ?? selected)
          if (checked) values.add(id)
          else values.delete(id)
          return [...values]
        })
      }

      return h('section', { className: 'moba-match-body moba-match-plan moba-proven-loadout',
        onKeyDown: event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onBack()
        } },
        h('h3', { className: 'moba-follow-up-title', ref: heading, tabIndex: -1 }, t('核对已验证出装')),
        shown && h(Fragment, null,
          h('div', { className: 'moba-proven-hero' },
            h(HeroArt, { ...shown.hero, className: 'moba-match-plan-portrait' }),
            h('div', null, h('strong', null, shown.hero.name),
              h('p', { className: 'moba-match-action-note' }, [t(kinds[shown.kind]),
                shown.turn && t('第 ') + shown.turn + t(' 回合'), shown.title].filter(Boolean).join(' · ')))),
          shown.deliverables?.length > 0 && h('section', { className: 'moba-proven-files' },
            h('h4', null, t('已交付的文件')),
            h('ul', null, shown.deliverables.map((file, index) => h('li', { key: index },
              h('strong', null, file.name), file.turn && h('small', null, t('第 ') + file.turn + t(' 回合'))))),
            h('p', { className: 'moba-match-action-note' }, t('在原会话中查看文件内容。'))),
          h('fieldset', { className: 'moba-proven-gear' },
            h('legend', null, t('选择要复用的装备')),
            gear.map(item => h('label', { key: item.id, 'data-available': item.available },
              h('input', { type: 'checkbox', checked: selected.includes(item.id), disabled: item.evidence === 'provider' && !item.available,
                onChange: event => toggle(item.id, event.target.checked) }),
              h(ItemArt, { item }),
              h('span', null,
                h('strong', null, item.name),
                item.evidence && h('small', null, t(evidence[item.evidence])),
                item.sourceName && h('small', null, t('原来源 ') + item.sourceName),
                item.currentSource && item.currentSource !== item.sourceName && h('small', null, t('当前来源 ') + item.currentSource),
                item.activity?.length > 0 && h('small', null, item.activity.map(entry => actionLabel(entry)).join(' / ')),
                item.reason ? h('small', { className: 'moba-proven-blocker' }, item.reason)
                  : item.available && h('small', null, t('原来源已核对'))))))),
        picked?.length === 0 ? h('p', { className: 'moba-match-action-note', role: 'status' }, t('至少选一件已验证的装备。'))
          : error ? h('p', { className: 'moba-match-action-error', role: 'alert' }, error, ' ',
            h('button', { type: 'button', className: 'moba-text', onClick: () => retry(value => value + 1) }, t('重试')))
          : !preview ? h('p', { className: 'moba-match-action-note', role: 'status' }, t('正在核对本回合出装…'))
            : preview.reason && h('p', { className: 'moba-match-action-note', role: 'status' }, preview.reason),
        lost.length > 0 && h('p', { className: 'moba-match-action-note' }, t('要卸下的自带装备') + ' · ' + lost.join(' / ')),
        canUse && h(SharedPlanCapabilities, { comparison: preview.comparison }),
        h('div', { className: 'moba-proven-actions' },
          h('button', { type: 'button', className: 'moba-text', onClick: onBack }, t('返回记录')),
          h('button', { type: 'button', className: 'moba-match-move', disabled: !canUse,
            onClick: () => onUse(preview, true) }, t('保存为方案')),
          h('button', { type: 'button', className: 'moba-match-move', disabled: !canUse,
            onClick: () => onUse(preview, false) }, t('试装复练'), h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function MatchReport({ sessionId, request, refresh, onPrepare, onUse }) {
      const [before, setBefore] = useState(undefined)
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [revision, setRevision] = useState(0)
      const [selected, setSelected] = useState(null)
      const previewButtons = useRef(new Map())
      useEffect(() => {
        if (before !== undefined) return
        let timer
        refresh.current = () => {
          if (!timer) timer = setTimeout(() => {
            timer = undefined
            setRevision(current => current + 1)
          }, 90)
        }
        return () => { refresh.current = null; clearTimeout(timer) }
      }, [before, refresh])

      useEffect(() => {
        const abort = new AbortController()
        request('match-report', { action: 'match-report', sessionId, before }, abort.signal)
          .then(value => {
            if (abort.signal.aborted) return
            setResult(value)
            setError('')
          })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [before, request, revision, sessionId])

      function openPage(cursor) {
        setBefore(cursor)
        setResult(null)
        setError('')
      }

      function returnToReport() {
        const key = selected.mode + ':' + selected.item.seq
        setSelected(null)
        requestAnimationFrame(() => previewButtons.current.get(key)?.focus())
      }

      function previewButton(item, mode, label) {
        const key = mode + ':' + item.seq
        return h('button', { className: 'moba-text', type: 'button',
          ref: button => {
            if (button) previewButtons.current.set(key, button)
            else previewButtons.current.delete(key)
          }, onClick: () => setSelected({ item, mode }) }, label)
      }

      function eventRow(entry) {
        const action = entry.type === 'action'
        return h('li', { key: entry.seq, className: 'moba-report-row', 'data-type': entry.type, 'data-nested': entry.nested },
          entry.kind === 'quest' ? h(Glyph, { kind: 'report', size: 21 })
            : entry.kind === 'hero' ? h(HeroArt, { ...entry, className: 'moba-report-art' })
            : h(ItemArt, { item: entry }),
          h('div', { className: 'moba-report-event' },
            h('strong', null, action ? entry.label : entry.name),
            action && h('small', null, entry.title + (entry.edited ? t(' · 指令内容已调整') : '')),
            entry.nested && h('small', null, t('程序子调用')),
            entry.sourceNames?.length > 0 && h('small', null, t('调用来源 ') + entry.sourceNames.join('、')),
            entry.expectedSourceName && h('small', null, t('所选来源 ') + entry.expectedSourceName),
            entry.blockedSourceName && h('small', null, t('拦截来源 ') + entry.blockedSourceName),
            !action && entry.choices?.length > 0 && h('small', null, t('已选 ') + entry.choices.join('、'))),
          h('div', { className: 'moba-report-event-status', 'data-state': action ? 'action' : entry.state },
            h('span', null, action ? entry.kind === 'quest' ? t('任务') : t('操作') : t(reportToolStates[entry.state])),
            !action && entry.duration !== undefined &&
              h('small', null, entry.duration < 100 ? t('<0.1 秒') : (entry.duration / 1000).toFixed(1) + t(' 秒'))))
      }

      const report = result && [
        ...result.turns.map(turn => ({ ...turn, heading: t('第 ') + turn.turn + t(' 回合'), label: t(reportTurnStates[turn.status]) })),
        ...(result.commands ?? empty).map(command => ({ ...command, heading: '/' + command.name, status: command.state,
          label: t(reportToolStates[command.state]) })),
        ...(result.panelActivities ?? empty).map(activity => ({ ...activity, heading: activity.name, status: 'completed', label: t('面板已确认') })),
        ...(result.compactions ?? empty).map(activity => ({ ...activity, heading: t('压缩上下文'), status: activity.state,
          label: t(reportToolStates[activity.state]) })),
      ].sort((a, b) => b.seq - a.seq)
      if (selected?.mode === 'proven') return h(ProvenLoadout, { key: selected.item.followUp.id, sessionId,
        receiptId: selected.item.followUp.id, request, onUse, onBack: returnToReport })
      if (selected) return h(SettlementFollowUp, { key: selected.item.followUp.id, sessionId, receipt: selected.item.followUp,
        request, onPrepare, backLabel: t('返回对局战报'), onBack: returnToReport })
      return h('div', { className: 'moba-match-body moba-report' },
        error && h('p', { className: 'moba-match-action-error', role: 'alert' }, error,
          h('button', { type: 'button', onClick: () => setRevision(value => value + 1) }, t('重试'))),
        !result && !error && h('p', { className: 'moba-match-action-note', role: 'status' }, t('正在读取对局战报…')),
        report?.length === 0 && h('p', { className: 'moba-match-action-note' }, t('装备操作、工具调用和原生命令会出现在这里。')),
        report?.length > 0 && h('ol', { className: 'moba-report-rounds' }, report.map(item =>
          h('li', { key: item.seq, className: 'moba-report-round' },
            h('div', { className: 'moba-report-turn' },
              h('h3', null, item.heading),
              h('span', { className: 'moba-report-meta' },
                (item.inherited ? t('继承记录 · ') : '') + reportTime(item.time)),
              h('span', { className: 'moba-report-turn-state', 'data-state': item.status }, item.label)),
            item.source && h('small', { className: 'moba-report-meta' }, item.source),
            item.entries && h('ul', { className: 'moba-report-entries' }, item.entries.map(eventRow)),
            item.followUp && h('div', { className: 'moba-report-actions' },
              item.followUp.provenLoadout && previewButton(item, 'proven', t('核对已验证出装')),
              item.followUp.followUpGear?.length > 0 && previewButton(item, 'follow-up', t('用本回合打法备战')))))),
        (before !== undefined || result?.nextBefore !== undefined) && h('footer', { className: 'moba-report-pages' },
          before !== undefined && h('button', { type: 'button', onClick: () => openPage(undefined) }, t('最新记录')),
          result?.nextBefore !== undefined && h('button', { type: 'button', onClick: () => openPage(result.nextBefore) },
            t('更早记录'), h(Glyph, { kind: 'arrow', size: 14 }))))
    }

    function MatchPlanSwitch({ sessionId, snapshot, request, onContinuation, onOpen, onLobby }) {
      const group = useId()
      const [attempt, retry] = useState(0)
      const [catalog, setCatalog] = useState(null)
      const [picked, setPicked] = useState('')
      const [preview, setPreview] = useState(null)
      const [pending, setPending] = useState(false)
      const [error, setError] = useState('')
      const { heroId, running, continuation } = snapshot
      const plans = catalog?.attempt === attempt ? catalog.plans : undefined
      const plan = plans?.find(item => item.id === picked) ?? plans?.find(item => !item.broken && !item.current && item.heroId === heroId)
        ?? plans?.find(item => !item.broken && !item.current) ?? plans?.[0]
      const review = preview?.plan === plan && preview?.running === running ? preview : null
      const canPreview = plan && !plan.broken && !plan.current
      const waiting = continuation?.state === 'waiting' || continuation?.state === 'starting'
      const arranged = plan?.presetId === continuation?.presetId

      useEffect(() => {
        const abort = new AbortController()
        request('match-plans', { action: 'match-plans', sessionId }, abort.signal)
          .then(plans => { if (!abort.signal.aborted) setCatalog({ attempt, plans }) })
          .catch(reason => { if (!abort.signal.aborted) setCatalog({ attempt, error: reason.message }) })
        return () => abort.abort()
      }, [attempt, request, sessionId])

      useEffect(() => {
        if (!canPreview) return
        const abort = new AbortController()
        const payload = { action: 'match-plan-preview', sessionId, id: plan.id, revision: plan.revision }
        request(payload.action, payload, abort.signal)
          .then(result => { if (!abort.signal.aborted) setPreview({ plan, running, result }) })
          .catch(reason => { if (!abort.signal.aborted) setPreview({ plan, running, error: reason.message }) })
        return () => abort.abort()
      }, [canPreview, plan, request, running, sessionId])

      async function update(action) {
        setPending(true)
        setError('')
        try {
          const payload = action === 'match-plan-continue'
            ? { sessionId, id: plan.id, revision: plan.revision }
            : { sourceSessionId: sessionId, id: continuation.id }
          const entry = await request(action, { action, ...payload })
          onContinuation(entry, continuation)
        } catch (reason) {
          setError(reason.message)
        } finally {
          setPending(false)
        }
      }

      function refresh() {
        setError('')
        retry(value => value + 1)
      }

      const changes = review?.result && capabilityChanges(review.result).filter(group => group.cards.length)
      const problem = error || review?.error || (catalog?.attempt === attempt && catalog.error)
      return h('div', { className: 'moba-match-body moba-match-plan' },
        continuation && h(Continuation, { entry: continuation, pending, onOpen,
          onCancel: () => update('continue-cancel'), onRequeue: () => update('continue-requeue') }),
        problem && h('div', { className: 'moba-match-plan-error', role: 'alert' },
          h('p', { className: 'moba-match-action-error' }, problem),
          h('button', { className: 'moba-text', type: 'button', disabled: pending, onClick: refresh }, t('刷新方案'))),
        !plans && !problem && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取出装方案…')),
        plans?.length === 0 && h('p', { className: 'moba-empty' }, t('在备战大厅保存出装后，就能在这里切换。')),
        plans?.length > 0 && h('fieldset', { className: 'moba-match-plan-choices', disabled: pending },
          h('legend', null, t('已保存出装')),
          h('div', { className: 'moba-match-plan-roster' }, plans.map(item => h('label', {
            key: item.id, className: 'moba-match-plan-pick', 'data-picked': item.id === plan.id,
          },
          h('input', { type: 'radio', name: group, checked: item.id === plan.id, onChange: () => {
            setError('')
            setPicked(item.id)
          } }),
          h('span', { className: 'moba-dock-emblem' },
            h(HeroArt, { id: item.heroId, art: item.heroArt, className: 'moba-match-plan-portrait' }),
            h(OutfitTrim, { appearance: outfitAppearance(item.heroId, item.items, item.removedIds ?? empty) })),
          h('span', null, h('strong', null, item.name), h('small', null, item.heroName)),
          (item.broken || item.current) && h('span', { className: 'moba-match-plan-state' }, item.broken ? t('不可用') : t('当前阵容')))))),
        plan && h('div', { className: 'moba-match-plan-preview' },
          plan.note && h('p', { className: 'moba-match-action-description' }, plan.note),
          h(PlanEquipment, { items: plan.items, removed: plan.removed }),
          plan.broken ? h('p', { className: 'moba-match-action-error' }, plan.broken)
            : plan.current ? h('p', { className: 'moba-match-action-note' }, t('当前会话已使用这套阵容。'))
            : changes ? h('section', { key: plan.revision, className: 'moba-match-plan-changes', 'aria-label': t('相对当前对局的能力变化') },
              changes.length ? changes.map(change => h(CapabilityList, { key: change.tone, ...change, disclosure: true }))
                : h('p', { className: 'moba-match-action-note' }, t('已登记的能力、来源和就绪时机一致。')))
            : !review?.error && h('p', { className: 'moba-match-action-note', role: 'status' }, t('正在对照当前对局…'))),
        h('div', { className: 'moba-match-plan-actions' },
          h('button', { className: 'moba-text', type: 'button', onClick: onLobby }, t('回城编辑出装')),
          plan && h('button', { type: 'button', className: 'moba-match-move moba-match-plan-commit',
            disabled: pending || Boolean(error) || !canPreview || !review?.result || waiting || arranged,
            onClick: () => update('match-plan-continue') },
          running ? t('本回合结束后续战') : t('准备续战'), h(Glyph, { kind: running ? 'lock' : 'arrow', size: 16 }))))
    }

    function profileEquipmentKind(id) {
      if (id.startsWith('bundle:')) return t('组合包')
      if (id.startsWith('host:')) return t('插件')
    }

    function TeammateDispatch({ sessionId, request, teamTasks = empty, initialTask, flagChallenge, onOpen }) {
      const group = useId()
      const [heroes, setHeroes] = useState(null)
      const [query, setQuery] = useState('')
      const [picked, setPicked] = useState('')
      const [presetId, setPresetId] = useState('')
      const [boardPick, setBoardPick] = useState(initialTask)
      const [title, setTitle] = useState('')
      const [task, setTask] = useState('')
      const [attempt, retry] = useState(0)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [started, setStarted] = useState(null)
      const launchId = useRef(null)
      const sending = useRef(false)

      useEffect(() => {
        const abort = new AbortController()
        request('teammate-roster', { action: 'teammate-roster', sessionId }, abort.signal)
          .then(value => { if (!abort.signal.aborted) { setHeroes(value); setError('') } })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [attempt, request, sessionId])

      const hero = heroes?.find(item => item.id === picked)
      const build = hero?.builds.find(item => item.id === presetId)
      const choiceKey = item => item.id + ':' + item.revision
      const boardKey = boardPick ? choiceKey(boardPick) : ''
      const boardTask = teamTasks.find(item => choiceKey(item) === boardKey)
      const canSend = Boolean(build && !build.broken && (boardPick ? boardTask?.available : title.trim() && task.trim()))
      const flagHint = boardTask?.available && flagChallenge?.taskId === boardTask.id && hero && (hero.id === flagChallenge.leaderId
        ? t('协作战旗需要两位不同的英雄。') : flagChallenge.partners.includes(hero.id)
          ? t('这组英雄的协作战旗已收藏。') : t('首次协作验收可解锁战旗。'))
      const needle = query.trim().toLocaleLowerCase()
      const visible = heroes?.filter(item => [item.name, item.id, ...item.builds.map(build => build.name)]
        .some(label => label.toLocaleLowerCase().includes(needle))) ?? empty

      function pick(item) {
        setPicked(item.id)
        setPresetId(item.builds.find(build => !build.broken)?.id ?? item.builds[0]?.id ?? '')
        setError('')
      }

      async function submit(event) {
        event.preventDefault()
        if (!canSend || sending.current) return
        sending.current = true
        setBusy(true)
        setError('')
        launchId.current ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
        try {
          const address = await request('teammate-launch', { action: 'teammate-launch', sessionId,
            presetId, title, task, launchId: launchId.current,
            ...(boardTask && { teamTask: { id: boardTask.id, revision: boardTask.revision } }) })
          setStarted({ address, hero, title: boardTask?.name ?? title.trim() })
        } catch (reason) {
          setError(reason.message)
        } finally {
          sending.current = false
          setBusy(false)
        }
      }

      if (started) return h('div', { className: 'moba-match-body moba-match-plan' },
        h('div', { className: 'moba-relay-offer', role: 'status' },
          h(HeroArt, { ...started.hero, className: 'moba-match-plan-portrait' }),
          h('div', null, h('strong', null, t('已派遣 ') + started.hero.name), h('p', null, started.title))),
        h('button', { className: 'moba-match-move moba-match-plan-commit', type: 'button', onClick: () => onOpen(started.address) },
          t('查看队友对话'), h(Glyph, { kind: 'arrow', size: 16 })))

      return h('form', { className: 'moba-match-dispatch', onSubmit: submit },
        h('div', { className: 'moba-match-body moba-match-plan moba-quest-form' },
          !heroes && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取英雄阵容…')),
          error && h('div', { className: 'moba-match-plan-error', role: 'alert' },
            h('p', { className: 'moba-match-action-error' }, error),
            h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: () => {
              setError(''); retry(value => value + 1)
            } }, t('刷新'))),
          (teamTasks.length > 0 || boardPick) && h('label', null, t('工作来源'),
            h('select', { value: boardKey, disabled: busy, onChange: event => {
              setBoardPick(teamTasks.find(item => choiceKey(item) === event.target.value))
              setError('')
            } }, h('option', { value: '' }, t('填写独立任务')),
            boardPick && !boardTask && h('option', { value: boardKey, disabled: true }, boardPick.name + t(' · 已更新')),
            h('optgroup', { label: t('本局共享任务') }, teamTasks.map(item => h('option', {
              key: choiceKey(item), value: choiceKey(item), disabled: !item.available,
            }, item.name + (item.reason ? ' · ' + item.reason : '')))))),
          boardPick && !boardTask?.available && h('p', { className: 'moba-match-action-note', role: 'status' },
            t('任务板已更新，请重新选择可派遣的任务。')),
          heroes && h(Fragment, null,
            h('label', null, t('搜索队友'), h('input', { type: 'search', value: query, disabled: busy,
              placeholder: t('英雄名或出装'), onChange: event => setQuery(event.target.value) })),
            visible.length > 0 ? h('fieldset', { className: 'moba-match-plan-choices', disabled: busy },
              h('legend', null, t('选择英雄')),
              h('div', { className: 'moba-match-plan-roster' }, visible.map(item => h('label', {
                key: item.id, className: 'moba-match-plan-pick', 'data-picked': item.id === picked,
              }, h('input', { type: 'radio', name: group, checked: item.id === picked, onChange: () => pick(item) }),
              h(HeroArt, { ...item, className: 'moba-match-plan-portrait' }),
              h('span', null, h('strong', null, item.name), item.description && h('small', null, item.description)),
              h('span', { className: 'moba-match-plan-state' }, item.builds.some(build => !build.broken) ? 'Lv.' + item.rank.level : t('不可用'))))))
              : h('p', { className: 'moba-empty' }, t('没有符合搜索条件的英雄。'))),
          hero && h(Fragment, null,
            h('label', null, t('队友出装'), h('select', { value: presetId, disabled: busy,
              onChange: event => { setPresetId(event.target.value); setError('') } }, hero.builds.map(item =>
                h('option', { key: item.id, value: item.id, disabled: Boolean(item.broken) }, item.name + (item.broken ? t(' · 不可用') : ''))))),
            build?.broken ? h('p', { className: 'moba-match-action-error' }, build.broken)
              : build && h(PlanEquipment, { items: build.gear ?? empty, removed: build.removed ?? empty }),
            !boardPick && h('label', null, t('任务名称'), h('input', { value: title, required: true, maxLength: 80, disabled: busy,
              placeholder: t('例如：核对交付清单'), onChange: event => setTitle(event.target.value) })),
            h('label', null, boardPick ? t('补充要求（选填）') : t('工作要求'), h('textarea', { value: task, required: !boardPick, maxLength: 12_000, rows: 3, disabled: busy,
              placeholder: t('写清任务、材料路径和期望成果'), onChange: event => setTask(event.target.value) })))),
        hero && h('footer', { className: 'moba-dispatch-footer' },
          flagHint && h('p', { className: 'moba-trial-action-note' }, h(Glyph, { kind: 'flag', size: 15 }), flagHint),
          h('p', { className: 'moba-match-action-note' }, boardPick ? t('所选队友会成为任务板负责人，使用本局的模型和工作目录。')
            : t('队友会在独立会话中收到这份工作要求，使用本局的模型和工作目录。')),
          h('button', { className: 'moba-match-move moba-match-plan-commit', type: 'submit',
            disabled: busy || !canSend },
          busy ? t('正在派遣…') : t('派遣 ') + hero.name, h(Glyph, { kind: 'arrow', size: 16 }))))
    }

    function EquipmentCommands({ commands }) {
      const [notice, setNotice] = useState('')
      if (!commands?.length) return null
      return h('details', { className: 'moba-equipment-native moba-equipment-commands' },
        h('summary', null, t('原生命令 · ') + commands.length),
        commands.map(({ name, description, hint }) => h('div', { key: name },
          h('code', null, '/' + name),
          h('small', null, description, hint && h(Fragment, null, h('br'), hint)),
          navigator.clipboard && h('button', { type: 'button', className: 'moba-text',
            'aria-label': t('复制命令 /') + name, onClick: async () => {
              try {
                await navigator.clipboard.writeText('/' + name + (hint ? ' ' : ''))
                setNotice(t('已复制 /') + name + t('，可在 DSH 输入栏使用。'))
              } catch {
                setNotice(t('可在 DSH 输入栏输入 /') + name + '。')
              }
            } }, t('复制命令')))),
        notice && h('small', { role: 'status' }, notice))
    }

    function EquipmentActivities({ activities, label }) {
      if (!activities?.length) return null
      return h('details', { className: 'moba-equipment-native' },
        h('summary', null, label + ' · ' + activities.length),
        activities.map(({ id, name, detail }) => h('div', { key: id }, h('strong', null, name),
          detail && h('small', null, detail))))
    }

    function MasteryRank({ rank, name, art, hero, award, onFrame, onInspect, collectionAction, busy, focusRef }) {
      const total = rank.next ?? rank.floor
      const level = 'Lv.' + rank.level
      const previousLevel = award?.before?.level
      const change = previousLevel && previousLevel < rank.level ? 'Lv.' + previousLevel + ' → ' + level : level
      const tier = frameTier(rank)
      const unlocked = award?.before && tier && frameTier(award.before)?.[0] !== tier[0]
      const profileKind = award?.kind && profileEquipmentKind(award.id)
      const source = award?.sourceMastery
      return h('div', { className: 'moba-mastery-rank', 'data-level': rank.level, 'data-promoted': award?.leveled,
        ...(focusRef && { ref: focusRef, tabIndex: -1, role: 'group', 'aria-label': name + t('的装备结算') }) },
        hero ? h(HeroArt, { ...hero, rank, className: 'moba-mastery-portrait' })
          : h(ItemArt, { item: { id: rank.id, art, sourceId: award?.sourceId }, rank }),
        h('div', { className: 'moba-mastery-meter' },
          h('div', null, h('strong', null, name), h('span', null, change, rank.badge && ' · ' + rank.badge)),
          Number.isSafeInteger(rank.xp) && h('progress', { value: rank.next ? rank.xp - rank.floor : 1,
            max: rank.next ? total - rank.floor : 1, 'aria-label': name + t('的经验') }),
          h('div', { className: 'moba-mastery-caption' },
            award && h('b', null, '+' + award.xp + ' XP'),
            profileKind && h('small', null, 'Profile ' + profileKind),
            onInspect && h('button', { type: 'button', className: 'moba-text',
              'aria-label': t('在装备库查看 ') + name, onClick: onInspect }, t('查看实战装备')),
            collectionAction,
            Number.isSafeInteger(rank.xp) && h('small', null, rank.next ? rank.xp + ' / ' + rank.next + ' XP' : rank.xp + t(' XP · 已满级'))),
          source && h('div', { className: 'moba-mastery-activity' },
            h('span', null, t('来源熟练度 · '), source.sourceName ?? t('已核验来源')),
            h('span', null, source.previousLevel && 'Lv.' + source.previousLevel + ' → ',
              masteryText({ level: source.level, xp: source.totalXp }))),
          award?.usedSources?.length > 0 && h('div', { className: 'moba-mastery-activity' },
            h('span', null, t('实战来源 · '), award.usedSources.map(item => item.sourceName ?? t('已核验来源')).join('、'))),
          award?.activity?.length > 0 && h('ul', { className: 'moba-mastery-activity', 'aria-label': t('经验来源') },
            award.activity.map(({ kind, name, proofKey }) => h('li', { key: kind + ':' + (proofKey ?? name) },
              (kind === 'command' ? t('执行命令 /') : kind === 'panel' ? t('面板完成 ') :
                kind === 'action' ? t('使用操作 ') : kind === 'compaction' ? t('已完成 ') : t('提供工具 ')) + name))),
          unlocked && h('p', { className: 'moba-frame-unlocked' }, h(Glyph, { kind: 'mastery', size: 14 }), t('解锁') + tier[1] + t('边框')),
          onFrame && tier && h(FramePicker, { name, rank, disabled: busy, onChange: onFrame })))
    }

    function settlementLabel(receipt) {
      if (receipt.teamFlag || receipt.flag?.teamwork) return t('协作战旗解锁')
      if (receipt.flag) return receipt.flagUpgrade ? t('战旗升级') : t('战旗解锁')
      if (receipt.comboRepeat) return t('连携验收')
      if (receipt.relay) return receipt.relayGear ? t('装备接力结算') : t('接力结算')
      const prefix = receipt.teammate ? t('队友 · ') : ''
      if (receipt.command) return prefix + '/' + receipt.command + t(' · 命令结算')
      if (receipt.panelAction) return prefix + receipt.panelAction + t(' · 面板结算')
      if (receipt.compaction) return prefix + receipt.compaction + t(' · 装备结算')
      return prefix + (receipt.title ? t('委托结算') : t('第 ') + receipt.turn + t(' 回合结算'))
    }

    function TeamworkRoles({ leader, leaderSessionId, teamwork, onOpen }) {
      const roles = [
        { label: t('接下委托并验收'), hero: leader, address: leaderSessionId, openLabel: t('回看验收会话') },
        { label: t('完成共享任务'), hero: teamwork.hero, address: teamwork.address, openLabel: t('回看队友工作') },
      ]
      return h('ol', { className: 'moba-relay-legs moba-teamwork-roles', 'aria-label': t('协作分工') }, roles.map(role =>
        h('li', { key: role.hero.id, 'data-complete': true },
          h(HeroArt, { ...role.hero, className: 'moba-relay-avatar' }),
          h('div', { className: 'moba-relay-stage' }, h('small', null, role.label), h('strong', null, role.hero.name)),
          role.address && h('button', { type: 'button', className: 'moba-text', onClick: () => onOpen(role.address) }, role.openLabel))))
    }

    function RelayLegs({ first, second, starter, runner, onOpen }) {
      const stages = [
        { label: t('第一棒'), proof: first, hero: first?.hero ?? starter },
        { label: t('第二棒'), proof: second, hero: second?.hero ?? (runner?.id !== starter?.id ? runner : undefined) },
      ]
      return h('ol', { className: 'moba-relay-legs', 'aria-label': t('接力进度') }, stages.map(({ label, proof, hero }) => {
        const gear = proof?.gear?.filter(item => onOpen || item.kind === 'tool') ?? empty
        return h('li', { key: label, 'data-complete': Boolean(proof) },
          hero ? h(HeroArt, { ...hero, className: 'moba-relay-avatar' })
            : h('span', { className: 'moba-relay-avatar moba-relay-empty' }, h(Glyph, { kind: 'swap', size: 20 })),
          h('div', { className: 'moba-relay-stage' }, h('small', null, label),
            h('strong', null, hero?.name ?? t('待交棒')),
            h('span', null, proof ? t('第 ') + proof.turn + t(' 回合已完成') : hero ? t('等待完成回合') : t('换阵容后接棒'))),
          gear.length > 0 && h('div', { className: 'moba-relay-gear', role: 'group', 'aria-label': label + t('的装备贡献') },
            gear.slice(0, 3).map(item => h('span', { key: item.id, title: item.name }, h(ItemArt, { item }), h('span', null, item.name))),
            gear.length > 3 && h('span', null, t('另 ') + (gear.length - 3) + t(' 件'))),
          proof && onOpen && h('button', { type: 'button', className: 'moba-text', 'aria-label': t('回看') + label + t('会话'),
            onClick: () => onOpen(proof.sessionId) }, t('回看')))
      }))
    }

    function RelayGearCard({ gear, reached, status }) {
      return h('ul', { className: 'moba-combo-proof moba-relay-target', 'aria-label': t('接力装备') },
        h('li', { 'data-reached': reached }, h(ItemArt, { item: gear }),
          h('div', null, h('strong', null, gear.name), gear.sourceName && h('span', null, gear.sourceName),
            h('span', null, gear.xp ? (gear.first ? t('首次搭档 · ') : '') + '+' + gear.xp + ' XP' : status))))
    }

    function ActiveComboReward({ reward, practice }) {
      const rewards = [reward.heroXp > 0 && t('英雄 +') + reward.heroXp + ' XP',
        reward.gearXp > 0 && t('两件装备各 +') + reward.gearXp + ' XP'].filter(Boolean)
      const outcome = reward.flag === 'record' ? practice ? t('战旗复练 · 验收后记录本局成果。') : t('战旗奖励已在另一局领取，本局仍可验收。')
        : (reward.flag === 'upgrade' ? t('升级战旗') : t('解锁战旗')) + ' · ' + (rewards.join(' · ') || t('本项经验已领'))
      return h('p', { className: 'moba-combo-reward', role: 'status', 'aria-label': t('当前连携奖励') },
        h(Glyph, { kind: 'flag', size: 16 }), h('span', null, outcome))
    }

    function SettlementRibbon({ receipt, quest, snapshot, controls, onDetails, onGear, onQuest, onDismiss, pending, error }) {
      return h('div', { className: 'moba-settlement-ribbon', role: 'group', 'aria-label': t('本局结算提示'),
        'data-highlight': Boolean(receipt.flag || receipt.comboRepeat || receipt.relay || receipt.promotion || receipt.signatures || quest) },
        receipt.hero ? h(HeroArt, { id: receipt.hero.id, art: receipt.hero.id === snapshot.heroId ? snapshot.heroArt : undefined,
          className: 'moba-settlement-avatar' }) : h(Glyph, { kind: receipt.flag ? 'flag' : receipt.relay ? 'swap' : 'mastery', size: 22 }),
        h('div', { className: 'moba-settlement-body' },
          h('div', { className: 'moba-settlement-copy', role: 'status' },
            h('strong', null, settlementLabel(receipt)),
            receipt.hero && h('span', null, receipt.hero.name + ' +' + receipt.hero.xp + ' XP'),
            receipt.relay && h('span', null, receipt.relay.count + t(' 位英雄 +') + receipt.relay.xp + ' XP'),
            receipt.gearXp > 0 && (!receipt.usedGear?.length || receipt.usedGear.length > 2) &&
              h('span', null, t('装备 +') + receipt.gearXp + ' XP'),
            receipt.promotion && h('span', { className: 'moba-settlement-promotion' }, receipt.promotion.count === 1
              ? receipt.promotion.name + t(' 升至 Lv.') + receipt.promotion.level : receipt.promotion.count + t(' 项升级')),
            receipt.signatures > 0 && h('span', { className: 'moba-settlement-promotion' }, t('解锁 ') + receipt.signatures + t(' 件招牌装备'))),
          receipt.usedGear?.length > 0 && h('div', { className: 'moba-settlement-used', role: 'group', 'aria-label': t('本次出手装备') },
            receipt.usedGear.slice(0, 2).map(item => {
              const xp = '+' + item.xp + ' XP'
              const label = t('查看 ') + item.name + t(' 的结算 · ') + xp
              const sources = item.usedSources?.map(source => source.sourceName).filter(Boolean).join('、') || item.sourceName
              return h('button', { key: item.id, type: 'button', 'aria-controls': controls,
                'aria-label': label, 'aria-description': sources, title: [label, sources].filter(Boolean).join(' · '),
                onClick: event => onGear(event, item.id) },
                h(ItemArt, { item }), h('span', null, item.name), h('b', null, xp))
            }))),
        h('div', { className: 'moba-settlement-commands' },
          h('button', { type: 'button', className: 'moba-settlement-button', 'aria-controls': controls, onClick: onDetails },
            t(snapshot.lessonTaskResult ? '查看任务结果' : '查看结算')),
          quest && h('button', { type: 'button', className: 'moba-settlement-button moba-settlement-review',
            'aria-controls': controls, title: quest.title, onClick: onQuest }, t('验收委托')),
          h('button', { type: 'button', className: 'moba-settlement-hide', 'aria-label': t('隐藏结算提示'), title: t('隐藏结算提示'),
            disabled: pending, onClick: onDismiss }, h(Glyph, { kind: 'close', size: 14 }))),
        error && h('p', { className: 'moba-match-action-error', role: 'alert' }, error))
    }

    function SettlementFollowUp({ sessionId, receipt, request, onPrepare, onBack, version, backLabel = t('返回结算') }) {
      const [selected, setSelected] = useState(() => receipt.followUpGear.length === 1 ? [receipt.followUpGear[0].id] : [])
      const [pending, setPending] = useState(false)
      const [error, setError] = useState('')
      const [checked, setChecked] = useState(null)
      const [selection, setSelection] = useState(null)
      const heading = useRef(null)
      useEffect(() => { heading.current?.focus() }, [])
      const gear = receipt.followUpGear
      const native = receipt.followUpAction
      const pairKey = !native && selected.length === 2 ? JSON.stringify(selected) : ''
      const previewKey = JSON.stringify([receipt.id, pairKey, version])
      useEffect(() => {
        if (!pairKey) return
        const abort = new AbortController()
        const action = 'match-follow-up-preview'
        request(action, { action, sessionId, receiptId: receipt.id, gearIds: JSON.parse(pairKey) }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setChecked({ key: previewKey, value }) })
          .catch(error => { if (!abort.signal.aborted) setChecked({ key: previewKey, reason: error.message }) })
        return () => abort.abort()
      }, [pairKey, previewKey, receipt.id, request, sessionId])
      const result = checked?.key === previewKey ? checked : undefined
      const preview = result?.value?.combo
      const reason = result?.reason ?? result?.value?.reason ?? preview?.reason
      const pair = preview ? selected.map(id => ({ ...gear.find(item => item.id === id),
        trialActions: result.value.gear.find(item => item.id === id)?.trialActions })) : empty
      const chosen = selection?.key === pairKey ? selection : undefined
      const recorded = pair.flatMap(item => {
        const award = receipt.awards?.find(award => award.id === item.id)
        return award?.activity?.filter(event => event.kind === 'action' && preview.moveKeys.action.includes(event.proofKey)) ?? []
      })
      const defaultMode = recorded.length === 1 ? preview?.modes.find(mode => mode.id === 'action' && !mode.reason) : undefined
      const mode = preview?.modes.find(mode => mode.id === chosen?.mode && !mode.reason)
        ?? defaultMode ?? preview?.modes.find(mode => !mode.reason)
      const actionKey = chosen?.mode === mode?.id ? chosen?.actionKey ?? ''
        : mode?.id === 'action' ? (defaultMode ? recorded[0].proofKey : mode.move?.key ?? '') : ''
      const prepareKey = chosen?.mode === mode?.id ? chosen?.prepareKey ?? '' : ''
      const steps = comboSteps(pair, preview, mode?.id, actionKey, prepareKey)
      const canPrepare = selected.length > 0 && (!pairKey || Boolean(result && (reason || mode && steps.ready)))
      async function prepare(event) {
        event.preventDefault()
        if (!canPrepare || pending) return
        setError('')
        setPending(true)
        try {
          const followUp = await request('match-follow-up', { action: 'match-follow-up', sessionId,
            receiptId: receipt.id, gearIds: selected, ...(mode && !reason && { combo: { mode: mode.id,
              actionKey: steps.action?.key, prepareKey: steps.prepare?.key } }) })
          onPrepare(followUp)
        } catch (reason) {
          setError(reason.message)
        } finally {
          setPending(false)
        }
      }

      return h('form', { className: 'moba-match-body moba-match-plan', onSubmit: prepare },
        h('h3', { className: 'moba-follow-up-title', ref: heading, tabIndex: -1 }, native ? t('本局装备试炼') : t('下一局挑战')),
        h('p', { className: 'moba-match-action-note' },
          native ? t('选择一件装备，接下委托后再次完成「') + actionLabel(native) + '」。'
            : t('选一件装备做试炼，或选两件做连携。两件插件可以筹备分阶段连携。')),
        h('fieldset', { className: 'moba-follow-up-gear', 'aria-label': native ? t('完成操作的装备') : t('本回合参与装备') }, gear.map(item => {
          const checked = selected.includes(item.id)
          const unavailable = !checked && selected.length === 2
          const kind = native && profileEquipmentKind(item.id)
          const source = [kind && 'Profile ' + kind, item.sourceName].filter(Boolean).join(' · ')
          return h('label', { key: item.id, 'data-picked': checked },
            h('input', { type: native ? 'radio' : 'checkbox', name: native ? 'trial-gear' : undefined, checked, disabled: pending || unavailable,
              onChange: () => setSelected(current => native ? [item.id] : checked ? current.filter(id => id !== item.id) : [...current, item.id]) }),
            h(ItemArt, { item }),
            h('span', null, h('strong', null, item.name), source && h('small', null, source)))
        })),
        pairKey && !result && h('p', { className: 'moba-match-action-note', role: 'status' }, t('正在核对连携与熟练度…')),
        reason && h('p', { className: 'moba-match-action-note', role: 'status' }, reason),
        preview && h(ComboModes, { combo: preview, selected: mode?.id, disabled: pending,
          onSelect: id => setSelection({ key: pairKey, mode: id, actionKey: preview.modes.find(mode => mode.id === id)?.move?.key }) }),
        steps.hasAction && h('div', { className: 'moba-quest-form moba-fitting-steps' },
          h(ComboStepFields, { steps, actionKey, prepareKey, disabled: pending,
            onAction: key => setSelection({ key: pairKey, mode: mode.id, actionKey: key }),
            onPrepare: key => setSelection({ key: pairKey, mode: mode.id, actionKey, prepareKey: key }) }),
          h('p', { className: 'moba-match-action-note' }, comboStepHint(steps))),
        error && h('p', { className: 'moba-match-action-error', role: 'alert' }, error),
        h('div', { className: 'moba-match-plan-actions' },
          h('button', { className: 'moba-text', type: 'button', disabled: pending, onClick: onBack }, backLabel),
          h('button', { className: 'moba-match-move moba-match-plan-commit', type: 'submit', disabled: pending || !canPrepare },
            pending ? t('正在准备…') : native ? t('核对试炼') : selected.length === 2 ? t('回城筹备连携') : selected.length === 1 ? t('回城筹备试炼') : t('回城筹备'),
            h(Glyph, { kind: native ? 'arrow' : 'swap', size: 16 }))))
    }

    function SettlementSignatures({ items, request, onSignature }) {
      const [pending, setPending] = useState(null)
      const [error, setError] = useState('')
      const [shown, setShown] = useState({})
      const feedback = useRef(null)
      async function display(item) {
        setPending(item.hero.id + ':' + item.id)
        setError('')
        try {
          const signature = await request('growth-signature', { action: 'growth-signature', heroId: item.hero.id,
            id: item.id, sourceId: item.sourceId })
          setShown(current => ({ ...current, [item.hero.id]: signature }))
          onSignature(item.hero.id, signature)
          feedback.current?.focus()
        } catch (reason) {
          setError(reason.message)
        } finally {
          setPending(null)
        }
      }
      return h('section', { ref: feedback, tabIndex: -1, className: 'moba-settlement-signatures', 'aria-label': t('新解锁的招牌装备') },
        h('h3', null, h(Glyph, { kind: 'mastery', size: 16 }), t('招牌装备解锁')),
        h('ul', null, items.map(item => {
          const current = shown[item.hero.id]
          const displayed = current ? current.id === item.id && current.sourceId === item.sourceId : item.displayed
          return h('li', { key: item.hero.id + ':' + item.id }, h(ItemArt, { item }),
            h('div', null, h('strong', null, item.name), h('small', null, [item.hero.name, item.sourceName].filter(Boolean).join(' · '))),
            displayed ? h('small', { role: 'status' }, t('已展示')) : h('button', { type: 'button', className: 'moba-text', disabled: pending !== null,
              'aria-label': t('将 ') + item.name + t(' 设为 ') + item.hero.name + t(' 的招牌'), onClick: () => display(item) },
              pending === item.hero.id + ':' + item.id ? t('正在保存…') : t('设为招牌')))
        })),
        error && h('p', { className: 'moba-match-action-error', role: 'alert' }, error))
    }

    function presentedFileHasCoordinates({ seq, index }) {
      return Number.isSafeInteger(seq) && seq >= 0 && Number.isSafeInteger(index) && index >= 0
    }

    function usePresentedFileOpener(addressable) {
      const [hostAvailable, setHostAvailable] = useState(false)
      const [opening, setOpening] = useState('')
      const [failed, setFailed] = useState(false)
      const pending = useRef(null)
      useEffect(() => () => pending.current?.abort(), [])
      useEffect(() => {
        if (!addressable) return
        const abort = new AbortController()
        fetch('api/present.host', { signal: abort.signal })
          .then(response => response.ok ? response.json() : undefined)
          .then(host => { if (!abort.signal.aborted) setHostAvailable(host?.available === true) })
          .catch(() => {})
        return () => abort.abort()
      }, [addressable])

      async function openFile(sessionId, file, key) {
        if (pending.current || !hostAvailable || !presentedFileHasCoordinates(file)) return
        const abort = pending.current = new AbortController()
        setOpening(key)
        setFailed(false)
        const query = new URLSearchParams({ sessionId, seq: String(file.seq), index: String(file.index) })
        try {
          const response = await fetch('api/present.open?' + query, { method: 'POST', signal: abort.signal })
          if (!abort.signal.aborted && !response.ok) setFailed(true)
        } catch {
          if (!abort.signal.aborted) setFailed(true)
        } finally {
          pending.current = null
          if (!abort.signal.aborted) setOpening('')
        }
      }
      return { hostAvailable: addressable && hostAvailable, opening, failed, openFile }
    }

    function LessonTaskFiles({ files, sessionId, complete, materialDelivered, headingTag = 'h4' }) {
      const { hostAvailable, opening, failed, openFile } = usePresentedFileOpener(files.some(presentedFileHasCoordinates))
      if (!files.length && !complete) return null
      return h('section', { className: 'moba-proven-files moba-lesson-result-files' },
        h(headingTag, null, t('已交付的文件') + ' · ' + files.length),
        materialDelivered && h('p', { className: 'moba-match-action-note' }, t('已交付所选材料。')),
        files.length > 0 && h('ul', null, files.map((file, index) => {
          const key = String(index)
          return h('li', { key },
            h('div', null, h('strong', null, file.name),
              file.turn && h('small', null, t('第 ') + file.turn + t(' 回合'))),
            hostAvailable && presentedFileHasCoordinates(file) && h('button', { type: 'button', className: 'moba-text',
              'aria-label': t('打开交付文件') + ' · ' + file.name, disabled: opening.length > 0,
              onClick: () => openFile(sessionId, file, key) }, t(opening === key ? '正在打开文件…' : '打开交付文件')))
        })),
        failed && h('p', { className: 'moba-match-action-error', role: 'alert' }, t('暂时无法打开这份交付文件。可在原会话查看。')))
    }

    const lessonTaskReasons = {
      'changed-task': '发送的任务文字已改动。可到原会话查看处理过程。',
      'changed-loadout': '任务使用的出装已变更。可到原会话查看处理过程。',
      'changed-material': '发送任务时，所选材料已变更。',
    }

    function LessonTaskAwards({ awards }) {
      if (!awards?.length) return null
      return h('section', { className: 'moba-lesson-result-awards', 'aria-label': t('本次任务经验') },
        h('h4', null, t('本次任务经验')),
        h('ul', null, awards.map((award, index) => h('li', { key: index },
          h('div', null, h('strong', null, award.name), award.sourceName && h('small', null, award.sourceName)),
          h('span', null, '+' + award.xp + ' XP')))))
    }

    function LessonTaskResult({ sessionId, version, request, onSource, onUse, onPersonalFlow, initialPersonalFocus }) {
      const language = useLanguage()
      const headingId = useId()
      const [review, setReview] = useState(false)
      const [state, setState] = useState({})
      const [retry, setRetry] = useState(0)
      const reviewHeading = useRef(null)
      const reviewButton = useRef(null)
      const returnFocus = useRef(false)
      const rematchButton = useRef(null)
      const rebaselineButton = useRef(null)
      const restoredPersonalFocus = useRef(false)
      const action = 'lesson-task-result'
      const pane = review ? 'review' : 'result'
      const cached = state[pane]
      const current = cached && cached.version === version && cached.retry === retry && cached.language === language ? cached : null
      const result = current?.result
      const source = result?.source
      const sourceArm = source && comparisonArmConfig(source.kind, source.arm)
      const sourceLabel = source && [comparisonArmName(sourceArm, source), source.heroName].filter(Boolean).join(' · ')

      useEffect(() => {
        const abort = new AbortController()
        let timer
        function remember(value) {
          if (!abort.signal.aborted) setState(previous => ({ ...previous, [pane]: { version, retry, language, ...value } }))
        }
        async function load() {
          try {
            const result = await request(action, { action, sessionId, ...(review && { review: true }) }, abort.signal, language)
            if (abort.signal.aborted) return
            remember(result ? { result } : { error: t('找不到本次任务的结果。') })
            if (!review && (result?.status === 'running' || result?.status === 'waiting-choice')) timer = setTimeout(load, 1500)
          } catch (reason) {
            remember({ error: reason.message })
          }
        }
        load()
        return () => { abort.abort(); clearTimeout(timer) }
      }, [request, sessionId, review, pane, version, retry, language])
      useEffect(() => { if (review) reviewHeading.current?.focus() }, [review])
      useEffect(() => {
        if (review || !returnFocus.current || !current) return
        returnFocus.current = false
        const target = reviewButton.current ?? reviewHeading.current
        target?.focus()
      }, [review, current])
      useEffect(() => {
        if (review || !current || !initialPersonalFocus || restoredPersonalFocus.current) return
        restoredPersonalFocus.current = true
        const button = initialPersonalFocus === 'rebaseline' ? rebaselineButton.current : rematchButton.current
        const target = button ?? rebaselineButton.current ?? reviewHeading.current
        target?.focus()
      }, [review, current, initialPersonalFocus])

      function returnToResult() {
        returnFocus.current = true
        setReview(false)
      }

      const issue = current?.error ?? result?.reason
      return h('section', { className: 'moba-lesson-result', 'aria-labelledby': headingId,
        onKeyDown: event => { if (review) closeDialogOnEscape(event, returnToResult) } },
        h('h3', { id: headingId, ref: reviewHeading, tabIndex: -1 }, t(review ? '核对本次出装' : '本次任务结果')),
        issue && h('p', { className: 'moba-match-action-error', role: 'alert' },
          t(lessonTaskReasons[issue] ?? comparisonArmReasons[issue] ?? issue), current?.error && ' ',
          current?.error && h('button', { type: 'button', className: 'moba-text', onClick: () => setRetry(value => value + 1) }, t('重试'))),
        !current && h('p', { className: 'moba-match-action-note', role: 'status' }, t(review ? '正在核对本回合出装…' : '正在读取任务结果…')),
        result && h(Fragment, null,
          sourceLabel && h('p', { className: 'moba-match-action-note' }, t('练习出装') + ' · ' + sourceLabel),
          review ? result.draft && h(Fragment, null,
            h(PlanEquipment, { items: result.gear ?? empty, removed: result.removed ?? empty }),
            h(SharedPlanCapabilities, { comparison: result.comparison }))
            : h(Fragment, null,
              h('p', { className: 'moba-match-action-note', role: 'status' }, [
                t(result.status === 'unavailable' ? '暂不可核对' : comparisonArmStates[result.status] ?? result.status),
                result.turn && t('第 ') + result.turn + t(' 回合'),
              ].filter(Boolean).join(' · ')),
              result.textHandoff && h('p', { className: 'moba-match-action-note' }, t('已记录终端工具完成和助手文字回复。')),
              h(ObservedComparisonCalls, { entries: result.entries }),
              h(LessonTaskFiles, { sessionId, files: result.deliverables ?? empty,
                complete: result.status === 'complete', materialDelivered: result.materialDelivered }),
              h(LessonTaskAwards, { awards: result.awards }))),
        h('div', { className: 'moba-settlement-footer' },
          review ? h(Fragment, null,
            h('button', { type: 'button', className: 'moba-text', onClick: returnToResult }, t('返回任务结果')),
            h('button', { type: 'button', className: 'moba-match-move', disabled: !result?.draft,
              onClick: () => onUse(result, true) }, t('保存为方案')))
            : h(Fragment, null,
              h('button', { type: 'button', className: 'moba-text', onClick: onSource }, t('查看原会话')),
              result?.rebaseline && h('button', { ref: rebaselineButton, type: 'button',
                className: result.rematchSource ? 'moba-text' : 'moba-match-move', 'aria-haspopup': 'dialog',
                onClick: () => onPersonalFlow({ mode: 'rebaseline', source: result.source, rebaseline: result.rebaseline }) }, t(rebaselineTaskLabel)),
              result?.canReview && h('button', { ref: reviewButton, type: 'button', className: 'moba-match-move',
                onClick: () => setReview(true) }, t('核对本次出装'), h(Glyph, { kind: 'arrow', size: 16 })),
              result?.rematchSource && h('button', { ref: rematchButton, type: 'button', className: 'moba-match-move',
                'aria-haspopup': 'dialog', onClick: () => onPersonalFlow({ mode: 'rematch', source: result.rematchSource,
                  evidenceReplay: source?.lesson === lighthouseEvidenceLesson }) },
                t('换一件再试'), h(Glyph, { kind: 'arrow', size: 16 })))))
    }

    function MatchSettlement({ sessionId, version, request, initialId, initialCursors = empty, focusGearId, quest, equipped, lessonTaskResult,
      onQuest, onReport, onOpenMatch, onOpenFlag, onPrepare, onUse, onInspect, onSignature, onPersonalFlow, initialPersonalFocus }) {
      const [history, setHistory] = useState(null)
      const [cursors, setCursors] = useState(initialCursors)
      const [picked, setPicked] = useState(initialId ?? '')
      const [preparing, setPreparing] = useState(false)
      const [provenId, setProvenId] = useState('')
      const followUpButton = useRef(null)
      const provenButton = useRef(null)
      const focusedAward = useRef(null)
      const awardFocused = useRef(false)
      const [attempt, retry] = useState(0)
      const [error, setError] = useState('')
      const [collecting, setCollecting] = useState('')
      const [collectionError, setCollectionError] = useState('')
      const [collected, setCollected] = useState(() => new Set())
      const cursor = cursors.at(-1)
      const liveVersion = cursor === undefined ? version : undefined
      useEffect(() => {
        const abort = new AbortController()
        request('match-settlements-page', { action: 'match-settlements-page', sessionId, before: cursor }, abort.signal)
          .then(value => { if (!abort.signal.aborted) { setHistory({ ...value, cursor }); setError('') } })
          .catch(reason => { if (!abort.signal.aborted) setError(reason.message) })
        return () => abort.abort()
      }, [attempt, request, sessionId, liveVersion, cursor])
      const receipts = history?.cursor === cursor ? history?.receipts : undefined
      const receipt = receipts?.find(item => item.id === picked) ?? receipts?.[0]
      useEffect(() => {
        if (!focusedAward.current || awardFocused.current) return
        awardFocused.current = true
        focusedAward.current.focus()
      }, [receipt])
      function changePage(older) {
        setPicked('')
        setError('')
        setCursors(current => older ? [...current, history.before] : current.slice(0, -1))
      }
      if (provenId) {
        return h(ProvenLoadout, { key: provenId, sessionId, receiptId: provenId, request, onUse,
          onBack: () => {
            setProvenId('')
            requestAnimationFrame(() => provenButton.current?.focus())
          } })
      }
      if (preparing && receipt?.followUpGear?.length) {
        return h(SettlementFollowUp, { key: receipt.id, sessionId, receipt, request,
          version,
          onPrepare: followUp => onPrepare(followUp, cursors),
          onBack: () => {
            setPreparing(false)
            requestAnimationFrame(() => followUpButton.current?.focus())
          } })
      }
      const action = receipt?.teamTask ?? receipt?.heroAction ?? receipt?.trialAction ?? receipt?.comboAction
      const displayedSources = new Set()
      async function collect(source) {
        if (collecting) return
        setCollecting(source.id)
        setCollectionError('')
        try {
          await request('equipment-collection', { action: 'equipment-collection', itemId: source.id,
            sessionId: source.sessionId, toolId: source.toolId, remove: false })
          setCollected(current => new Set([...current, source.id]))
        } catch (reason) {
          setCollectionError(reason.message)
        } finally {
          setCollecting('')
        }
      }
      function collectionAction(item) {
        const source = item.collection
        if (!source || displayedSources.has(source.id)) return
        displayedSources.add(source.id)
        return source.saved || collected.has(source.id)
          ? h('small', { role: 'status' }, t('原来源已收藏'))
          : h('button', { type: 'button', className: 'moba-text', disabled: Boolean(collecting),
            'aria-label': t('收藏 ') + item.name + t(' 的原来源'), onClick: () => collect(source) },
          collecting === source.id ? t('正在收藏…') : t('收藏原来源'))
      }
      const awardCard = item => h(MasteryRank, { key: item.id, rank: { id: item.id, level: item.level, ...item.after },
        name: item.name, art: item.art, hero: item.kind ? undefined : item, award: item,
        focusRef: receipt.id === initialId && item.id === focusGearId ? focusedAward : undefined,
        onInspect: item.kind ? () => onInspect({ id: item.id, name: item.name, sourceId: questToolSource(item), sourceName: item.sourceName })
          : undefined, collectionAction: collectionAction(item) })
      const heroes = receipt?.awards.filter(item => !item.kind) ?? empty
      const gear = receipt?.awards.filter(item => item.kind) ?? empty
      const featured = item => receipt.quest || item.kind === 'tool' || item.kind === 'featured' || item.activity?.length
        || item.leveled || equipped.has(item.id) || profileEquipmentKind(item.id)
      const mainGear = gear.filter(featured)
      if (receipt && !receipt.quest) mainGear.sort((a, b) => Number(b.kind === 'tool') - Number(a.kind === 'tool'))
      const supportingGear = gear.filter(item => !featured(item))
      const totalXp = receipt?.awards.reduce((sum, item) => sum + item.xp, 0)
      const review = quest && !receipts?.some(item => item.id === quest.id) ? quest : undefined
      return h('div', { className: 'moba-match-body moba-match-plan moba-settlement' },
        lessonTaskResult && h(LessonTaskResult, { key: sessionId, sessionId, version, request, onSource: () => onOpenMatch(sessionId), onUse,
          initialPersonalFocus, onPersonalFlow: flow => onPersonalFlow(flow, receipt?.id, cursors) }),
        lessonTaskResult && h('h3', { className: 'moba-session-settlement-title' }, t('会话结算记录')),
        collectionError && h('p', { className: 'moba-match-action-error', role: 'alert' }, collectionError),
        error && h('div', { className: 'moba-match-plan-error', role: 'alert' }, h('p', { className: 'moba-match-action-error' }, error),
          h('button', { type: 'button', className: 'moba-text', onClick: () => { setError(''); retry(value => value + 1) } }, t('重试'))),
        !receipts && !error && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取本局结算…')),
        receipts?.length === 0 && h('p', { className: 'moba-empty' }, t('完成回合、原生命令或面板操作后，可在这里查看结算。')),
        receipts?.length > 1 && h('label', { className: 'moba-settlement-history' }, t('结算记录'),
          h('select', { value: receipt.id, onChange: event => setPicked(event.target.value) }, receipts.map(item =>
            h('option', { key: item.id, value: item.id }, [settlementLabel(item), item.title ?? (item.teammate && item.delegation?.label),
              Number.isFinite(item.time) && reportTime(item.time)]
              .filter(Boolean).join(' · '))))),
        history && (cursors.length > 0 || history.before !== undefined) && h('nav', { className: 'moba-settlement-pages', 'aria-label': t('结算记录分页') },
          h('button', { type: 'button', className: 'moba-text', disabled: !cursors.length, onClick: () => changePage(false) }, t('较新记录')),
          h('span', { 'aria-live': 'polite' }, t('第 ') + (cursors.length + 1) + t(' 页')),
          h('button', { type: 'button', className: 'moba-text', disabled: !receipts || history.before === undefined,
            onClick: () => changePage(true) }, t('更早记录'))),
        receipt && h(Fragment, null,
          h('header', { className: 'moba-settlement-total' },
            h(Glyph, { kind: receipt.flag ? 'flag' : receipt.relay ? 'swap' : 'mastery', size: 24 }),
            h('div', null, h('h3', null, receipt.title ?? settlementLabel(receipt)),
              receipt.teammate && receipt.delegation?.label && h('p', null, receipt.delegation.label),
              receipt.flag && h('p', null, receipt.flag.teamwork ? t('协作战旗已加入收藏') : receipt.flagUpgrade ? t('战旗已升级') : t('战旗已加入收藏')),
              receipt.comboRepeat && h('p', null, receipt.practiceFlagId ? t('本局复练已验收。') : t('本局成果已验收。战旗奖励已在另一局领取。')),
              receipt.followUpAction && !receipt.followUpGear.length && h('p', null, t('试炼奖励已领取')),
              action && h('p', null, [action.kind === 'team' && action.name === receipt.title ? undefined : action.name,
                actionCompletion(action)].filter(Boolean).join(' · ')),
              action?.first && h('button', { type: 'button', className: 'moba-text',
                onClick: () => onOpenMatch(action.first.sessionId) }, preparationLink(action)),
              receipt.relay && h('p', null, receipt.relayGear ? t('两位英雄均已使用接力装备') : t('接力委托已完成'))),
            totalXp > 0 && h('strong', null, '+' + totalXp + ' XP')),
          receipt.signatures?.length > 0 && h(SettlementSignatures, { key: receipt.id, items: receipt.signatures, request, onSignature }),
          receipt.relay && h(RelayLegs, { first: receipt.relay[0], second: receipt.relay[1], onOpen: onOpenMatch }),
          receipt.comboRepeat && receipt.pair && h('ul', { className: 'moba-combo-proof', 'aria-label': t('已验收的连携装备') },
            receipt.pair.map(item => h('li', { key: item.id, 'data-reached': true }, h(ItemArt, { item }),
              h('div', null, h('strong', null, item.name), item.sourceName && h('span', null, item.sourceName))))),
          receipt.relayGear && h(RelayGearCard, { gear: receipt.relayGear, reached: true }),
          receipt.teamwork && h(TeamworkRoles, { leader: heroes[0], teamwork: receipt.teamwork, onOpen: onOpenMatch }),
          heroes.map(awardCard),
          review && h('button', { type: 'button', className: 'moba-match-move moba-match-plan-commit', onClick: onQuest },
            h('span', null, h('strong', null, t('验收委托')), h('small', null, review.title)), h(Glyph, { kind: 'arrow', size: 16 })),
          gear.length > 0 && h('section', { className: 'moba-settlement-gear', 'aria-label': t('装备经验') },
            h('h3', null, t('装备经验')), mainGear.map(awardCard),
            supportingGear.length > 0 && h('details', { className: 'moba-mastery-archive' },
              h('summary', null, t('其他装备 · ') + supportingGear.length + t(' 件')), supportingGear.map(awardCard))),
          h('div', { className: 'moba-settlement-footer' },
            receipt.flag && !receipt.flag.teamwork && h('button', { type: 'button', className: 'moba-text',
              onClick: () => onOpenFlag(receipt.flag.id) }, t('查看战旗与升级')),
            receipt.teammate ? h('button', { type: 'button', className: 'moba-text', onClick: () => onOpenMatch({
              parentSessionId: receipt.delegation.ancestors[0], childSessionId: receipt.sessionId, mode: receipt.delegation.mode,
            }) }, t('回看队友工作'))
              : h('button', { type: 'button', className: 'moba-text', onClick: onReport }, t('查看对局战报')),
            receipt.provenLoadout && h('button', { ref: provenButton, type: 'button', className: 'moba-text',
              onClick: () => { setPicked(receipt.id); setProvenId(receipt.id) } }, t('核对已验证出装')),
            receipt.followUpGear?.length > 0 && h('button', { ref: followUpButton, type: 'button', className: 'moba-text', onClick: () => {
              setPicked(receipt.id)
              setPreparing(true)
            } }, receipt.followUpAction ? t('筹备本局试炼') : t('用本回合打法备战')))))
    }

    function QuestGear({ label, options, value, onChange, disabled, emptyLabel, missingLabel }) {
      return h('label', null, label, h('select', { value, disabled, onChange: event => onChange(event.target.value), required: !emptyLabel },
        h('option', { value: '', disabled: !emptyLabel }, emptyLabel ?? t('请选择装备')),
        missingLabel && h('option', { value, disabled: true }, missingLabel),
        options.filter(item => !item.profile).map(item => h('option', { key: item.id, value: item.id },
          [item.name, item.sourceName, item.transport ? t('执行器工具') : item.timing === 'turn' ? t('回合触发')
            : item.timing === 'condition' ? t('按条件启用') : undefined]
            .filter(Boolean).join(' · '))),
        options.some(item => item.profile) && h('optgroup', { label: t('已加载的 Profile 插件') },
          options.filter(item => item.profile).map(item => h('option', { key: item.id, value: item.id }, item.name)))))
    }

    function questToolSource(item) {
      if (item?.kind === 'tool' && item.sourceId && item.sourceId !== 'profile') return item.sourceId
    }

    function questRule(item) {
      return item?.kind === 'tool' ? t('在同一回合中成功调用') + (questToolSource(item) ? t('所选来源的工具') : t('该工具')) + t('并完成回合。')
        : t('装备加载期间完成一个回合。')
    }

    function nativeTrialInstruction(action) {
      return action.kind === 'command' ? t('在本局输入栏执行 /') + action.name + '。'
        : action.detail || t('在插件原生面板中完成「') + action.name + '」。'
    }

    function comboActions(item, staged) {
      const actions = item?.trialActions ?? empty
      return staged ? actions : actions.filter(move => !move.kind)
    }

    function actionLabel(action) {
      return (action.kind === 'command' ? '/' : '') + action.name
    }

    function QuestForm({ choices = empty, heroActions = empty, teamTasks = empty, teamMode, relayGearLevel, rewards, initial,
      busy, onSubmit, submitLabel, showGear, request, comboDraft, sessionId, comboRevision }) {
      const [mode, setMode] = useState(initial?.mode ?? 'delivery')
      const [title, setTitle] = useState(initial?.title ?? '')
      const [brief, setBrief] = useState(initial?.brief ?? '')
      const [gearId, setGearId] = useState(initial?.gearId ?? initial?.gearIds?.[0] ?? '')
      const [relayGearId, setRelayGearId] = useState(initial?.mode === 'relay' ? initial.gearId ?? '' : '')
      const [partnerId, setPartnerId] = useState(initial?.gearIds?.[1] ?? '')
      const [trialKey, setTrialKey] = useState(initial?.trialActionKey ?? '')
      const [heroKey, setHeroKey] = useState(initial?.heroActionKey ?? '')
      const [comboKey, setComboKey] = useState(initial?.comboActionKey ?? '')
      const [prepareKey, setPrepareKey] = useState(initial?.prepareActionKey ?? '')
      const [chosenComboMode, setComboMode] = useState(initial?.staged ? 'staged' : initial?.comboActionKey || initial?.upgradeFlagId ? 'action' : '')
      const [comboCheck, setComboCheck] = useState(null)
      const [comboAttempt, retryCombo] = useState(0)
      const practiceFlagId = initial?.practiceFlagId
      const upgradeFlagId = initial?.upgradeFlagId
      const fixedPair = Boolean(practiceFlagId || upgradeFlagId)
      const pick = choices.find(item => item.id === gearId)
      const delivery = mode === 'delivery'
      const relay = mode === 'relay'
      const relayChoices = relay ? choices.filter(item => (item.level ?? 1) >= relayGearLevel &&
        (item.kind !== 'tool' || questToolSource(item))) : empty
      const relayGear = relayChoices.find(item => item.id === relayGearId)
      const hasActionChoice = delivery || mode === 'trial'
      const teamOptions = teamTasks.map(task => ({ ...task, key: 'team:' + task.id }))
      const actionChoices = delivery ? [...heroActions, ...teamOptions] : pick?.trialActions ?? empty
      const goalKey = delivery ? heroKey : trialKey
      const goal = hasActionChoice && actionChoices.find(item => item.key === goalKey)
      const teamGoal = goal?.kind === 'team' && goal
      const deliveryReward = teamGoal ? rewards.teamDelivery : delivery && goal ? rewards.heroDelivery : rewards.delivery
      const canCombo = (choices.length > 1 && choices.some(item => item.kind === 'tool'))
        || choices.filter(item => comboActions(item, true).length).length > 1
      const partners = choices.filter(item => item.id !== gearId && (pick?.kind === 'tool' || item.kind === 'tool'
        || (comboActions(pick, true).length && comboActions(item, true).length)))
      const partner = partners.find(item => item.id === partnerId)
      const pair = pick && partner ? [pick, partner] : empty
      const singlePair = pair.some(item => item.kind === 'tool')
      const comboPair = mode === 'combo' && pair.length === 2 ? JSON.stringify({
        gearIds: pair.map(item => item.id),
        questSources: Object.fromEntries(pair.filter(questToolSource).map(item => [item.id, item.sourceId])),
        practiceFlagId, upgradeFlagId,
      }) : ''
      const comboCheckKey = JSON.stringify([comboPair, sessionId, comboDraft, comboRevision, comboAttempt])
      const comboResult = comboCheck?.key === comboCheckKey ? comboCheck : undefined
      useEffect(() => {
        if (!comboPair || !comboDraft) return
        const refresh = () => { if (!document.hidden) retryCombo(value => value + 1) }
        window.addEventListener('focus', refresh)
        document.addEventListener('visibilitychange', refresh)
        return () => {
          window.removeEventListener('focus', refresh)
          document.removeEventListener('visibilitychange', refresh)
        }
      }, [comboPair, comboDraft])
      useEffect(() => {
        if (!comboPair) return
        const abort = new AbortController()
        const action = 'growth-combo-preview'
        const context = sessionId ? { sessionId } : { draft: JSON.parse(comboDraft) }
        request(action, { action, ...context, ...JSON.parse(comboPair) }, abort.signal)
          .then(value => { if (!abort.signal.aborted) setComboCheck({ key: comboCheckKey, value }) })
          .catch(reason => { if (!abort.signal.aborted) setComboCheck({ key: comboCheckKey, error: reason.message }) })
        return () => abort.abort()
      }, [comboPair, comboCheckKey, comboDraft, sessionId, request])

      const preview = comboResult?.value
      const selectedMode = chosenComboMode || preview?.modes.find(mode => !mode.reason)?.id || (singlePair ? 'basic' : 'staged')
      const comboMode = preview?.modes.find(mode => mode.id === selectedMode)
      const steps = comboSteps(pair, preview, selectedMode, comboKey, prepareKey)
      const { staged, hasAction: showComboAction, action: comboGoal, support, prepare, needsPrepare } = steps
      const comboGear = support && pair.find(item => item !== support)
      const canAcceptCombo = comboMode && !comboMode.reason && steps.ready
      const comboHint = !comboPair ? t('选择两件装备后可核对连携方式。')
        : !comboMode || comboMode.reason ? undefined
          : showComboAction ? comboStepHint(steps) : undefined
      const selected = mode === 'combo' ? [pick, partner].filter(Boolean) : mode === 'trial' && pick ? [pick] : relayGear ? [relayGear] : empty
      const selectedGoal = mode === 'combo' ? comboGoal : goal
      const nativeOpening = Boolean(goal?.kind || mode === 'combo' && prepare?.kind)
      const resetCombo = () => { setComboKey(''); setPrepareKey(''); setComboMode(''); setComboCheck(null) }
      const canAccept = Boolean(title.trim()) && (!hasActionChoice || !goalKey || goal && !goal.mastered)
        && (delivery || (relay && (!relayGearId || relayGear)) || (mode === 'trial' && pick) || (mode === 'combo' && canAcceptCombo))
      return h('form', { className: 'moba-quest-form', onSubmit: event => {
        event.preventDefault()
        if (busy || !canAccept) return
        const questSources = Object.fromEntries(selected.filter(questToolSource).map(item => [item.id, item.sourceId]))
        onSubmit({ title: title.trim(), mode, gearId: mode === 'trial' ? gearId : relayGear?.id,
          gearIds: mode === 'combo' ? [gearId, partnerId] : undefined, trialActionKey: mode === 'trial' ? goal?.key : undefined,
          practiceFlagId, upgradeFlagId,
          ...(Object.keys(questSources).length > 0 && { questSources }),
          heroActionKey: delivery && !teamGoal ? goal?.key : undefined, teamTaskId: teamGoal ? teamGoal.id : undefined,
          comboActionKey: mode === 'combo' ? comboGoal?.key : undefined,
          staged: mode === 'combo' && staged ? true : undefined,
          prepareActionKey: mode === 'combo' && staged ? prepare?.key : undefined,
          brief: showGear && !nativeOpening ? brief.trim() || undefined : undefined },
          [...selected.map(item => item.name), ...(mode === 'combo' && prepare ? [prepare.name] : []), ...(selectedGoal ? [selectedGoal.name] : [])])
      } },
        h('label', null, t('委托类型'), h('select', { value: mode, disabled: busy || fixedPair, onChange: event => setMode(event.target.value) },
          h('option', { value: 'delivery' }, t('交付委托 · +') + deliveryReward + t(' 英雄 XP')),
          h('option', { value: 'trial', disabled: !choices.length }, t('装备试炼 · +') +
            (mode === 'trial' && goal ? rewards.actionTrial : rewards.trial) + t(' 装备 XP')),
          h('option', { value: 'combo', disabled: !canCombo }, t('连携挑战 · 解锁战旗')),
          h('option', { value: 'relay' }, t('接力委托 · 两位英雄')))),
        relay && h(QuestGear, { label: t('接力装备（选填）'), options: relayChoices, value: relayGearId,
          disabled: busy || (!relayChoices.length && !relayGearId), emptyLabel: t('普通接力'), onChange: setRelayGearId,
          missingLabel: relayGearId && !relayGear ? t('原接力装备当前不可选') : undefined }),
        (mode === 'trial' || mode === 'combo') && h('div', { className: mode === 'combo' ? 'moba-combo-picker' : undefined },
          h(QuestGear, { label: mode === 'combo' ? t('第一件装备') : t('试炼装备'), options: choices,
            value: pick?.id ?? '', disabled: busy || fixedPair, onChange: id => { setGearId(id); setPartnerId(''); setTrialKey(''); resetCombo() } }),
          mode === 'combo' && h(QuestGear, { label: t('第二件装备'), options: partners,
            value: partner?.id ?? '', disabled: busy || !pick || fixedPair, onChange: id => { setPartnerId(id); resetCombo() } })),
        comboPair && (comboResult?.error ? h('p', { className: 'moba-alert', role: 'alert' }, comboResult.error, ' ',
          h('button', { type: 'button', className: 'moba-text', disabled: busy,
            onClick: () => { setComboCheck(null); retryCombo(value => value + 1) } }, t('重试')))
          : !preview ? h('p', { role: 'status' }, t('正在核对连携方式…'))
            : preview.reason ? h('p', { role: 'status' }, preview.reason)
              : h(ComboModes, { combo: preview, selected: selectedMode, disabled: busy, onSelect: id => {
                if (id === selectedMode) return
                setComboMode(id)
                setComboKey('')
                setPrepareKey('')
              } })),
        mode === 'combo' && showComboAction && comboMode && !comboMode.reason && h(ComboStepFields, {
          steps, actionKey: comboKey, prepareKey, disabled: busy || Boolean(practiceFlagId), onPrepare: setPrepareKey,
          onAction: key => { setComboKey(key); setPrepareKey('') } }),
        hasActionChoice && (actionChoices.length > 0 || goalKey) && h('label', null, delivery ? t('交付方式') : t('试炼目标'),
          h('select', { value: goalKey, disabled: busy, onChange: event => {
            const key = event.target.value
            if (delivery) setHeroKey(key)
            else setTrialKey(key)
            const task = delivery && teamOptions.find(item => item.key === key)
            if (task && !title.trim()) setTitle(task.name.slice(0, 80))
          } },
            h('option', { value: '' }, (delivery ? t('常规交付 · +') + rewards.delivery : t('基础试炼 · +') + rewards.trial) + ' XP'),
            goalKey && !goal && h('option', { value: goalKey, disabled: true }, t('上次选择的操作当前不可用')),
            actionChoices.filter(item => item.kind !== 'team').map(item => h('option', { key: item.key, value: item.key, disabled: item.mastered },
              actionLabel(item) + ' · ' +
              (item.mastered ? t('已领取') : '+' + (delivery ? rewards.heroDelivery : rewards.actionTrial) + ' XP'))),
            delivery && teamOptions.length > 0 && h('optgroup', { label: t('本局队伍任务') }, teamOptions.map(task =>
              h('option', { key: task.key, value: task.key }, task.name + ' · +' + rewards.teamDelivery + ' XP' +
                (task.blocked ? t(' · 等待依赖') : ' · ' + t(teamTaskStates[task.status]))))))),
        (showGear || mode === 'combo') && selected.length > 0 && h('ul', { className: 'moba-opening-gear', 'aria-label': t('委托所选装备') },
          (mode === 'combo' && comboGoal ? [support, comboGear] : selected).map(item => h('li', { key: item.id }, h(ItemArt, { item }),
            h('div', null, h('strong', null, item.name),
              item.sourceName && h('span', null, item.sourceName),
              h('span', null, mode === 'trial' && goal ? actionLabel(goal) : mode === 'combo' && comboGoal
                ? item === support ? prepare ? t('准备 · ') + actionLabel(prepare) : needsPrepare ? t('待选准备操作') : t('先用工具取证')
                  : (staged ? t('发动 · ') : '') + actionLabel(comboGoal) : relay ? t('两棒均须使用') : item.kind === 'tool' ? t('成功调用') : t('加载就绪')))))),
        h('label', null, t('任务目标'), h('input', { value: title, maxLength: 80, required: true, disabled: busy,
          placeholder: t('例如：补齐推荐报告的关键证据'), onChange: event => setTitle(event.target.value) })),
        showGear && !nativeOpening && h('label', null, t('首回合任务（选填）'),
          h('textarea', { rows: 3, value: brief, maxLength: 4000, disabled: busy,
            placeholder: t('填写需要助手执行的工作和材料，进入对局后确认发送。'),
            onChange: event => setBrief(event.target.value) })),
        (mode !== 'combo' || comboHint) && h('p', { className: 'moba-match-action-note' }, delivery
          ? teamGoal ? t('在对话中推进任务，在 DSH 任务板查看进度。验收经验归接下委托的英雄。')
            : goal ? t('从英雄入口发送指定操作，完成回合后由你验收成果。')
              : teamMode && !teamOptions.length ? t('完成一个新回合后验收，或先在对话中创建共享任务，再把它选作交付目标。')
                : t('完成一个新回合后，由你确认任务已经交付。')
          : relay ? relayGear ? t('两位英雄都须在各自的回合使用这件装备。工具须使用所选来源。首次用这件装备完成此英雄组合，验收可得 ')
              + rewards.firstRelayGear + t(' 装备 XP。再次完成可得 ') + rewards.relayGear + t(' 装备 XP。')
            : relayGearId ? t('原接力装备当前不可选，请恢复其来源或重新选择。')
              : t('完成第一棒后，换另一位英雄续战。验收时可嘉奖一件实战装备。装备达到 Lv.') + relayGearLevel + t(' 后可指定为两棒共用装备。')
          : mode === 'combo' ? comboHint
            : goal?.kind ? nativeTrialInstruction(goal) + t(' 接下后完成操作即可验收，此项奖励在当前配置中限领一次。')
              : goal ? t('从装备入口发送指定操作，并完成该回合。') +
              (pick.kind === 'tool' ? t('工具还须成功调用。') : t('装备须加载就绪。')) : questRule(pick)),
        h('button', { type: 'submit', className: 'moba-match-move moba-match-plan-commit',
          disabled: busy || !canAccept }, submitLabel, h(Glyph, { kind: 'arrow', size: 16 })))
    }

    function QuestContinuation({ offer, hero, heroSkill, choices, busy, onAccept, onOpenMatch }) {
      const relay = offer.mode === 'relay'
      const combo = offer.comboAction
      const action = offer.heroAction ?? offer.trialAction ?? (combo?.staged && !offer.comboFirst ? combo.prepare : combo)
      const actionGear = action && offer.gear?.find(item => item.id === (action.gearId ?? offer.gear[0]?.id))
      const actionSource = questToolSource(actionGear)
      const actionChoice = actionGear && choices?.find(item => item.id === actionGear.id &&
        (!actionSource || questToolSource(item) === actionSource))
      const matching = offer.heroAction ? heroSkill?.actions.some(move => move.proofKey === action.key)
        : offer.shortcutActionReady ?? actionChoice?.trialActions?.some(item => item.key === action.key)
      const sourceLabels = {
        ready: t('已就绪'), waiting: t('待回合触发'), conflict: t('当前来源与委托不符'), missing: t('原来源当前不可用'),
        condition: t('按条件启用'), unavailable: t('当前未就绪'), checking: t('正在核对'),
      }
      return h('aside', { className: 'moba-relay-offer', 'aria-label': relay ? t('待接续的接力委托') : t('待接续的委托') },
        h(Glyph, { kind: 'swap', size: 23 }),
        h('div', null, h('strong', null, offer.title),
          h('p', { className: 'moba-match-action-note' }, relay ? offer.from.name + ' → ' + hero.name
            : combo?.staged ? comboRhythm(combo) : t(journalModes[offer.mode]),
            offer.firstTurn !== undefined && t(' · 第一棒已完成'))),
        h('button', { type: 'button', className: 'moba-equip', disabled: busy, onClick: onAccept },
          offer.nextLeg ? t('接棒') : t('接续委托')),
        offer.gear?.length > 0 && h('ul', { className: 'moba-combo-proof moba-quest-transfer-gear', 'aria-label': t('新阵容中的委托装备') },
          offer.gear.map(item => {
            const available = choices?.find(choice => choice.id === item.id)
            const source = questToolSource(item)
            const changed = available && source && source !== questToolSource(available)
            const state = offer.toolStates?.[item.id] ?? (changed ? 'conflict' : available
              ? available.timing === 'turn' ? 'waiting' : available.timing ?? 'ready' : choices ? 'unavailable' : 'checking')
            const phase = offer.stepGearId && (offer.stepGearId === item.id ? t('当前阶段')
              : offer.comboFirst ? t('准备阶段已完成') : t('后续阶段'))
            return h('li', { key: item.id, 'data-reached': state === 'ready' },
              h(ItemArt, { item }), h('div', null, h('strong', null, item.name), source && item.sourceName && h('span', null, item.sourceName),
                h('span', null, [phase, sourceLabels[state]].filter(Boolean).join(' · '))))
          })),
        action && h('p', { className: 'moba-quest-transfer-note moba-trial-action-note' }, h(Glyph, { kind: 'action', size: 15 }),
          action.name, (offer.heroAction || choices || offer.shortcutActionReady !== undefined) &&
            (matching ? t(' · 操作可用') : t(' · 当前不可用'))),
        !relay && h('div', { className: 'moba-quest-transfer-note' },
          h('span', null, action?.kind ? t('接续后，请在这场对局完成指定操作。') : t('接续后，从这场对局的新回合开始判定。')),
          h('button', { type: 'button', className: 'moba-text', onClick: () => onOpenMatch(offer.parentId) }, t('回原对局'))))
    }

    function MatchGrowth({ sessionId, version, toolChoiceRevision, teamBoardVersion, teamDispatchTasks = empty, request, onSettlement, onReport, onQuestClosed,
      onLobby, onOpenMatch, heroSkill, gearSkills, onQuestAction, onDispatch, initialQuest }) {
      const [view, setView] = useState(null)
      const [loadedChoices, setChoices] = useState(null)
      const [questDraft, setQuestDraft] = useState(initialQuest)
      const [relayReward, setRelayReward] = useState('')
      const [unlocked, setUnlocked] = useState(null)
      const [attempt, retry] = useState(0)
      const [busy, setBusy] = useState(false)
      const [readError, setReadError] = useState('')
      const [writeError, setWriteError] = useState('')
      const needsChoices = loadedChoices?.revision !== toolChoiceRevision
      const choices = loadedChoices?.value

      useEffect(() => {
        const abort = new AbortController()
        request('match-growth', { action: 'match-growth', sessionId, includeChoices: needsChoices }, abort.signal)
          .then(result => {
            if (abort.signal.aborted) return
            setView(result)
            if (result.choices) setChoices({ revision: toolChoiceRevision, value: result.choices })
            setReadError('')
          })
          .catch(reason => { if (!abort.signal.aborted) setReadError(reason.message) })
        return () => abort.abort()
      }, [attempt, needsChoices, request, sessionId, version, toolChoiceRevision, teamBoardVersion])

      async function act(action, payload) {
        setBusy(true)
        setWriteError('')
        try {
          const settlement = await request(action, { action, sessionId, ...payload })
          if (action === 'growth-accept') setQuestDraft(undefined)
          if (action === 'growth-accept' || action === 'growth-handoff') { setUnlocked(null); setRelayReward('') }
          if (action === 'growth-claim' || action === 'growth-abandon') onQuestClosed(payload.id)
          if (action === 'growth-claim' && view?.quest?.nativeProof) setChoices(null)
          if (settlement?.flag) setUnlocked({ ...settlement.flag, upgraded: settlement.flagUpgrade })
          const result = await request('match-growth', { action: 'match-growth', sessionId })
          setView(result)
        } catch (reason) {
          if (action === 'growth-accept') setChoices(null)
          setWriteError(reason.message)
        } finally {
          setBusy(false)
        }
      }

      const quest = view?.quest
      const relay = quest?.relay
      const relayGear = relay && quest.gear
      const trial = quest?.trialAction
      const heroAction = quest?.heroAction
      const teamTask = quest?.teamTask
      const dispatchTask = teamTask && teamDispatchTasks.find(item => item.id === teamTask.id && item.available)
      const comboAction = quest?.comboAction
      const staged = comboAction?.staged
      const first = quest?.comboFirst
      const prepare = comboAction?.prepare
      const support = comboAction && quest.pair.find(item => item.id !== comboAction.gearId)
      const pair = comboAction ? [support, quest.pair.find(item => item.id === comboAction.gearId)] : quest?.pair
      const selectedAction = heroAction ?? trial ?? (staged && !first ? prepare : comboAction)
      const actionSkill = heroAction ? heroSkill : selectedAction && gearSkills.get(selectedAction.gearId ?? quest.gear.id)
      const actionReady = view?.task?.shortcut?.ready ?? (actionSkill?.ready && actionSkill.actions.some(move => move.proofKey === selectedAction.key))
      const offer = view?.questOffer ?? view?.relayOffer
      const moved = view?.questTo ?? view?.relayTo
      const earned = !quest?.mastered && (teamTask ? Boolean(teamTask.proof && view.teamAvailable)
        : quest?.completed !== undefined || Boolean(quest?.nativeProof))
      const teamStatus = teamTask && (!view.teamAvailable ? t('暂时无法核对原生队伍任务。')
        : earned ? t('DSH 队伍任务已完成，确认交付成果后结算。')
          : teamTask.status === 'deleted' ? t('任务已从任务板删除，可以放弃委托。')
            : view.teamMode === false ? t('在 DSH 模型菜单开启智能体团队协作后，可继续本局任务。')
              : t('在对话中推进这项任务，在 DSH 任务板查看进度。'))
      const nativeAction = selectedAction?.kind && selectedAction
      const nativeReady = nativeAction && choices?.find(item => item.id === (nativeAction.gearId ?? quest.gear?.id))
        ?.trialActions?.some(move => move.key === nativeAction.key)
      const gearLevels = new Map(view?.gear.map(item => [item.id, item.level]))
      const runner = relay && (relay.runner.id === view.hero.id ? view.hero : relay.runner)
      const canPass = relay?.first && !earned && relay.runner.id === quest.hero.id
      const relayGearReady = relayGear && (view.task?.sourcesReady ?? choices?.some(item => item.id === relayGear.id &&
        questToolSource(item) === questToolSource(relayGear)))
      const needsRelayGear = relayGear && !earned && relayGearReady === false
      const relayInstruction = relayGear?.kind === 'tool' ? t('成功调用所选来源的工具。') : t('从装备入口使用插件操作，或成功调用它提供的工具。')
      const relayStatus = earned ? t('两棒都已完成。验收成果后为两位英雄结算。')
        : canPass ? t('第一棒已完成。换另一位英雄续战，在新对局接棒。')
          : needsRelayGear ? t('当前阵容缺少指定装备或工具来源，可回城换装。')
            : relayGear ? (quest.progress?.sourceMismatch ? t('上回合调用了其他来源。') : quest.progress ? t('上回合没有使用指定装备。') : '')
              + (relay.first ? t('完成第二棒时，') : t('完成第一棒时，')) + relayInstruction
              : relay?.first ? t('用接棒英雄完成一个新回合。') : t('用当前英雄完成第一棒。')
      const comboStatus = comboAction && (!actionReady ? t('指定连携操作当前不可用。')
        : quest.progress?.ordered === false ? t('上一回合两件工具都已调用。请先让 ') + support.name + t(' 成功返回，再完成指定操作。')
          : t('在同一回合先用 ') + support.name + t(' 取得依据，再执行指定的装备操作。'))
      const nativeStatus = nativeAction && (choices && !nativeReady ? t('指定操作当前不可用。')
        : (first ? t('核对准备结果后，') : '') + nativeTrialInstruction(nativeAction))
      const stagedStatus = first ? !actionReady ? t('主装备操作当前不可用。') : t('核对上一步结果后，可打开主装备操作，补充本次要求。')
        : prepare ? !actionReady ? t('准备操作当前不可用。') : quest.progress ? t('上回合未达到辅助装备条件。可以重新执行准备操作。')
          : t('先完成准备操作，再核对结果。') : quest?.progress ? t('上次取证未成功调用辅助工具。可以重新安排取证。') : t('先安排辅助工具取证。')
      const flagUnlock = unlocked?.teamwork ? t('协作战旗解锁') : unlocked?.upgraded ? t('战旗升级') : t('战旗解锁')
      return h('div', { className: 'moba-match-body moba-match-plan moba-mastery' },
        (writeError || readError) && h('div', { className: 'moba-match-plan-error', role: 'alert' },
          h('p', { className: 'moba-match-action-error' }, writeError || readError),
          h('button', { className: 'moba-text', type: 'button', disabled: busy, onClick: () => {
            setWriteError(''); setChoices(null); retry(value => value + 1)
          } }, t('刷新'))),
        !view && !readError && h('p', { className: 'moba-empty', role: 'status' }, t('正在读取成长记录…')),
        view && h(Fragment, null,
          h(MasteryRank, { hero: view.hero, name: view.hero.name, rank: view.hero, busy,
            onFrame: frame => act('growth-frame', { kind: 'hero', id: view.hero.id, frame }) }),
          unlocked?.id !== view.hero.flag?.id && h(FlagInsignia, { flag: view.hero.flag }),
          h('button', { type: 'button', className: 'moba-match-move moba-growth-history', onClick: onSettlement },
            t('查看本局结算'), h(Glyph, { kind: 'arrow', size: 16 })),
          unlocked && h('aside', { className: 'moba-flag-earned', 'aria-label': flagUnlock },
            h(Glyph, { kind: 'flag', size: 25 }),
            h('div', { role: 'status' }, h('strong', null, flagUnlock),
              h('span', null, unlocked.stagedAction?.title ?? unlocked.comboAction?.name ?? unlocked.title)),
            view.hero.flag?.id === unlocked.id ? h('span', null, t('展示中'))
              : h('button', { type: 'button', className: 'moba-equip', disabled: busy,
                onClick: () => act('growth-display', { id: unlocked.id, heroId: unlocked.hero.id }) }, t('展示战旗'))),
          offer && h(QuestContinuation, { offer, hero: view.hero, heroSkill, choices, busy, onOpenMatch,
            onAccept: () => act('growth-handoff', { id: offer.id }) }),
          !quest && moved && h('aside', { className: 'moba-relay-offer', 'aria-label': view.relayTo ? t('已交棒的接力委托') : t('已接续的委托') },
            h(Glyph, { kind: 'swap', size: 23 }),
            h('div', null, h('strong', null, moved.title),
              h('p', { className: 'moba-match-action-note' }, view.relayTo ? t('已交棒给') + moved.hero.name : t('已转到续战对局'))),
            h('button', { type: 'button', className: 'moba-text', onClick: () => onOpenMatch(moved.sessionId) },
              view.relayTo ? t('进入接力对局') : t('进入续战对局'))),
          h('section', { className: 'moba-quest', 'aria-label': t('当前委托') },
            h('h3', null, quest ? t('当前委托') : t('接一项委托')),
            quest ? h(Fragment, null,
              h('strong', { className: 'moba-quest-title' }, quest.title),
              h('p', { className: 'moba-match-action-note' }, relay ? (relayGear ? t('装备接力') : t('接力委托')) + t(' · 两位英雄各 +') + view.rewards.relayHero + ' XP'
                : quest.mode === 'combo' ? staged ? comboRhythm(comboAction) : comboAction ? t('连携挑战 · 指定操作') : t('同回合基础连携')
                : teamTask ? t('队伍任务交付 · +') + view.rewards.teamDelivery + t(' 英雄 XP')
                  : quest.mode === 'delivery' ? t('交付委托 · +') + (heroAction ? view.rewards.heroDelivery : view.rewards.delivery) + t(' 英雄 XP')
                  : quest.gear.name + ' · +' + (trial ? view.rewards.actionTrial : view.rewards.trial) + t(' 装备 XP')),
              teamTask && h('div', { className: 'moba-journal-action' }, h(Glyph, { kind: 'action', size: 17 }),
                teamTask.name !== quest.title && h('strong', null, teamTask.name), h('span', null, t(teamTaskStates[teamTask.status]))),
              quest.mode === 'trial' && h('ul', { className: 'moba-combo-proof', 'aria-label': t('试炼装备') },
                h('li', { 'data-reached': earned }, h(ItemArt, { item: quest.gear }),
                  h('div', null, h('strong', null, quest.gear.name),
                    questToolSource(quest.gear) && quest.gear.sourceName && h('span', null, quest.gear.sourceName),
                    h('span', null, earned ? t('已达成') : quest.progress?.sourceMismatch?.includes(quest.gear.id) ? t('上回合调用了其他来源')
                      : trial && !quest.progress?.action ? t('待执行指定操作')
                      : quest.gear.kind === 'tool' ? t('待成功调用') : t('待加载'))))),
              selectedAction && !staged && h('p', { className: 'moba-trial-action-note' }, h(Glyph, { kind: 'action', size: 16 }), selectedAction.name),
              pair && h('ul', { className: 'moba-combo-proof', 'aria-label': staged ? t('连携阶段') : t('装备达成条件') }, pair.map(item => {
                const firstStep = item.id === support?.id
                const needsAction = item.id === comboAction?.gearId && !quest.progress?.action
                const wrongOrder = item.id === comboAction?.gearId && quest.progress?.ordered === false
                const wrongSource = quest.progress?.sourceMismatch?.includes(item.id)
                const reached = earned || Boolean(staged ? firstStep && first
                  : quest.progress && !needsAction && !wrongOrder && !quest.progress.missing.includes(item.id))
                return h('li', { key: item.id, 'data-reached': reached },
                  h(ItemArt, { item }), h('div', null, h('strong', null, item.name),
                    questToolSource(item) && item.sourceName && h('span', null, item.sourceName),
                    wrongSource && h('span', null, t('上回合调用了其他来源')),
                    h('span', null, staged ? firstStep ? (prepare ? t('准备 · ') + actionLabel(prepare) : t('取证'))
                      + (first ? ' · ' + actionCompletion({ kind: prepare?.kind, proof: first.kind && first, turn: first.turn }) : '')
                      : t('发动 · ') + actionLabel(comboAction) + (earned ? ' · ' + actionCompletion({
                        kind: comboAction.kind, proof: quest.nativeProof, turn: quest.completed }) : '')
                      : reached ? t('已达成') : needsAction ? t('待执行指定操作')
                        : wrongOrder ? t('待按顺序调用') : item.kind === 'tool' ? t('待成功调用') : t('待加载'))))
              })),
              quest.comboReward && h(ActiveComboReward, { reward: quest.comboReward, practice: quest.practiceFlagId }),
              staged && first && h('button', { type: 'button', className: 'moba-text',
                onClick: first.sessionId === sessionId ? onReport : () => onOpenMatch(first.sessionId) },
                first.sessionId === sessionId ? t('查看对局战报') : prepare ? t('回看准备对局') : t('回看取证对局')),
              view.task && h('button', { type: 'button', className: 'moba-match-move moba-match-plan-commit',
                disabled: busy || view.task.sourcesReady === false || Boolean(view.task.target && !actionReady), onClick: () => onQuestAction(view.task) },
                view.task.support ? t('安排「') + view.task.support + t('」取证')
                  : selectedAction ? t('打开「') + selectedAction.name + '」' : t('打开任务'), h(Glyph, { kind: 'arrow', size: 16 })),
              relay && h(RelayLegs, { first: relay.first, second: relay.second,
                starter: quest.hero.id === view.hero.id ? view.hero : quest.hero, runner }),
              relayGear && h(RelayGearCard, { gear: relayGear, reached: earned, status: earned ? t('两棒均已使用 · +') + quest.relayGearXp + ' XP'
                : relay.first ? t('第一棒已核验') : t('等待第一棒使用') }),
              h('p', { className: 'moba-match-action-note', role: 'status' }, relay ? relayStatus : quest.mastered
                ? t('此项奖励已在另一局领取，可以放弃这项委托。')
                : teamStatus || (earned ? quest.nativeProof ? t('DSH 已确认操作成功，可以验收。') : t('第 ') + quest.completed + t(' 回合已达成条件。确认任务成果后结算。')
                : view.task?.sourcesReady === false ? t('本阶段所选工具来源当前不可用。')
                : nativeStatus || (staged ? stagedStatus : quest.mode === 'combo' ? (quest.progress ? t('以上是') + (quest.progress.sessionId && quest.progress.sessionId !== sessionId
                  ? t('换装前对局的') : '') + t('第 ') + quest.progress.turn + t(' 回合的结果。') : '') + (comboStatus || t('两件装备需在同一回合达成条件。'))
                  : selectedAction ? !actionReady ? t('指定操作当前不可用。')
                    : heroAction ? t('从英雄入口发送指定操作，并完成一个新回合。')
                    : quest.progress?.action ? t('上一尝试已发送指定操作，装备条件尚未达成。')
                      : t('从装备入口发送指定操作，在同一回合达成装备条件。')
                    : quest.mode === 'delivery' ? t('用当前英雄完成一个新回合，再确认交付。') : questRule(quest.gear)))),
              relay?.second && !relayGear && [relay.first, relay.second].some(leg => leg.gear.length) &&
                h('label', { className: 'moba-relay-reward' }, t('嘉奖一件装备 · +') + view.rewards.relayGear + ' XP',
                  h('select', { value: relayReward, disabled: busy, onChange: event => setRelayReward(event.target.value) },
                    h('option', { value: '' }, t('只结算英雄经验')),
                    [relay.first, relay.second].map((leg, index) => leg.gear.length > 0 && h('optgroup', {
                      key: index, label: (index ? t('第二棒 · ') : t('第一棒 · ')) + leg.hero.name,
                    }, [...leg.gear].sort((a, b) => Number(b.kind === 'tool') - Number(a.kind === 'tool'))
                      .map(item => h('option', { key: item.id, value: index + ':' + item.id }, item.name)))))),
              h('div', { className: 'moba-quest-actions' },
                h('button', { type: 'button', className: 'moba-text', disabled: busy,
                  onClick: () => act('growth-abandon', { id: quest.id }) }, t('放弃委托')),
                dispatchTask && onDispatch ? h('button', { type: 'button', className: 'moba-match-move moba-match-plan-commit', disabled: busy,
                  onClick: () => onDispatch(dispatchTask) }, t('为此任务派遣队友'), h(Glyph, { kind: 'team', size: 16 }))
                : !quest.mastered && ((canPass || needsRelayGear || !teamTask && !relay && !earned) ? h('button', { type: 'button', className: 'moba-match-move moba-match-plan-commit', disabled: busy,
                  onClick: () => onLobby(relayGear && { questId: quest.id, gear: relayGear }) },
                  canPass ? t('回城交棒') : t('回城换装'), h(Glyph, { kind: 'swap', size: 16 }))
                  : h('button', { type: 'button', className: 'moba-match-move moba-match-plan-commit', disabled: busy || !earned,
                    onClick: () => act('growth-claim', { id: quest.id, rewardGear: relay && !relayGear && relayReward
                      ? { leg: Number(relayReward[0]), id: relayReward.slice(2) } : undefined }) },
                  quest.comboReward?.flag === 'record' ? t('确认验收并记录') : t('确认完成并结算'), h(Glyph, { kind: 'mastery', size: 16 })))))
              : h(QuestForm, { initial: questDraft, choices: choices?.map(item => ({ ...item, level: gearLevels.get(item.id) ?? 1 })),
                request, sessionId, comboRevision: JSON.stringify([version, toolChoiceRevision]),
                rewards: view.rewards, relayGearLevel: view.relayGearLevel, busy: busy || needsChoices,
                teamTasks: view.teamTasks, teamMode: view.teamMode,
                heroActions: heroSkill?.actions.map(move => ({ key: move.proofKey, name: move.name })),
                submitLabel: t('接下委托'), onSubmit: selection => act('growth-accept', selection) })),
          view.gear.length > 0 && h('details', { className: 'moba-mastery-archive' },
            h('summary', null, t('装备熟练度')),
            view.gear.map(item => h(MasteryRank, { key: item.id, rank: item, name: item.name, art: item.art, busy,
              onFrame: frame => act('growth-frame', { kind: 'gear', id: item.id, frame }) }))),
          h('details', { className: 'moba-mastery-archive' }, h('summary', null, t('成长规则')),
            h('p', null, t('完成一个有效回合，英雄 +') + view.rewards.hero + t(' XP，成功调用的工具 +') + view.rewards.tool + t(' XP，随阵容加载的插件和工作流装备 +') + view.rewards.plugin + t(' XP。同一回合每件装备只计一次。')),
            h('p', null, t('英雄和两件装备都达到 Lv.') + view.stagedLevel + t(' 后，可以分阶段连携。等级 3、5、6 解锁熟练、精通、大师边框。每位英雄的同一组装备共享一面战旗。')))))
    }

    function ShortcutCarry({ items, pending, onResolve }) {
      const [skipped, setSkipped] = useState([])
      const available = items.filter(item => item.canCarry)
      const selected = available.filter(item => !skipped.includes(item.id)).map(item => item.id)
      return h('details', { className: 'moba-match-profile moba-shortcut-carry', open: true },
        h('summary', null, t('原对局快捷槽 · ') + available.length + t(' 件可沿用')),
        h('ul', { className: 'moba-match-tools', 'aria-label': t('原对局快捷槽') }, items.map(item => {
          const state = item.state === 'ready' || item.state === 'waiting'
            ? ({ outfit: t('已在当前出装'), pinned: t('快捷栏已有此装备') }[item.placement] ?? matchGearState(item))
            : matchGearState(item)
          return h('li', { key: item.id, 'data-state': item.state },
            h(ItemArt, { item }),
            h('div', { className: 'moba-match-name' }, item.name,
              item.sourceName && h('small', null, t('原来源 ') + item.sourceName),
              item.registeredSourceName && h('small', null, t('当前来源 ') + item.registeredSourceName)),
            h('div', { className: 'moba-match-tool-controls' },
              h('span', { className: 'moba-match-state' }, state),
              item.canCarry && h('input', { type: 'checkbox', checked: selected.includes(item.id), disabled: pending,
                'aria-label': t('沿用 ') + item.name, onChange: event => {
                  const keep = event.currentTarget.checked
                  setSkipped(current => keep ? current.filter(id => id !== item.id) : [...current, item.id])
                } })))
        })),
        h('div', { className: 'moba-shortcut-carry-actions' },
          h('button', { type: 'button', className: 'moba-text', disabled: pending, onClick: () => onResolve([]) }, t('略过')),
          h('button', { type: 'button', className: 'moba-match-move', disabled: pending || !selected.length,
            onClick: () => onResolve(selected) }, t('沿用所选快捷槽'), h(Glyph, { kind: 'arrow', size: 15 }))))
    }

    function TeammateActivity({ teammates = empty, onOpen }) {
      return h('div', { className: 'moba-teammate-activity', 'aria-live': 'polite' },
        teammates.map(({ hero, address, tool, count }) => {
          const label = [t('查看队友 ') + hero.name, t('正在调用 ') + tool.name, tool.sourceName,
            count > 1 ? count + t(' 项调用进行中') : undefined].filter(Boolean).join(' · ')
          return h('button', { key: address.childSessionId, className: 'moba-teammate-call', type: 'button',
            title: label, 'aria-label': label, onClick: () => onOpen(address) },
            h(HeroArt, { ...hero, className: 'moba-teammate-avatar' }),
            h('span', { className: 'moba-teammate-copy' },
              h('strong', null, hero.name),
              h('span', null, t('队友正在调用'), count > 1 && ' · ' + count + t(' 项'))),
            h(ItemArt, { item: tool, className: 'moba-teammate-gear' }),
            h('span', { className: 'moba-teammate-copy' },
              h('strong', null, tool.name), tool.sourceName && h('span', null, tool.sourceName)),
            h(Glyph, { kind: 'arrow', size: 13 }))
        }))
    }

    function MatchEquipment({ sessionId, request, openLobby, openContinuation, openDraftSession,
      consumeTaskDraft, putTaskDraft, draftStore, send, workspaces }) {
      const language = useLanguage()
      const id = useId()
      const anchor = '--moba-match-' + id.replace(/[^a-zA-Z0-9-]/g, '')
      const popover = useRef(null)
      const opener = useRef(null)
      const [open, setOpen] = useState(false)
      const [snapshot, setSnapshot] = useState(null)
      const [expiredCall, setExpiredCall] = useState(null)
      const [error, setError] = useState('')
      const [query, setQuery] = useState('')
      const [role, setRole] = useState('')
      const [profileOpen, setProfileOpen] = useState(false)
      const [action, setAction] = useState(null)
      const [personalFlow, setPersonalFlow] = useState(null)
      const [pinPending, setPinPending] = useState('')
      const [pinError, setPinError] = useState('')
      const [receiptPending, setReceiptPending] = useState(false)
      const [dismissedReceipt, setDismissedReceipt] = useState('')
      const [closedQuest, setClosedQuest] = useState('')
      const [receiptError, setReceiptError] = useState(null)
      const actionHeading = useRef(null)
      const growthTrigger = useRef(null)
      const lastAction = useRef('')
      const refreshReport = useRef(null)

      useEffect(() => {
        const element = popover.current
        function toggle(event) {
          setOpen(event.newState === 'open')
          if (event.newState === 'closed') {
            setQuery('')
            setRole('')
            setAction(null)
            setPinError('')
          }
        }
        element.addEventListener('toggle', toggle)
        return () => element.removeEventListener('toggle', toggle)
      }, [])

      useEffect(() => observeMatch(sessionId, request, value => {
        setSnapshot(value)
        setError('')
      }, setError, () => refreshReport.current?.()), [sessionId, request, language])
      const completedCall = snapshot?.activity?.find(call => call.state !== 'running')
      const completedSeq = completedCall?.seq
      useEffect(() => {
        if (completedSeq === undefined) return
        const timer = setTimeout(() => setExpiredCall(completedSeq), 1500)
        return () => clearTimeout(timer)
      }, [completedSeq])

      useEffect(() => {
        if (action && open) actionHeading.current?.focus()
        else if (open) {
          const buttons = popover.current?.querySelectorAll('[data-action-key]') ?? []
          Array.from(buttons).find(button => button.dataset.actionKey === lastAction.current)?.focus()
        }
      }, [action, open])

      function selectAction(kind, item, key) {
        lastAction.current = key
        setAction({ kind, item })
      }

      function reuseProvenLoadout(preview, save) {
        popover.current.hidePopover()
        openLobby(sessionId, snapshot, { proven: { ...preview, save } })
      }

      function reuseComparisonLoadout(preview, save) {
        openLobby(preview.sessionId, undefined, { proven: { ...preview, save } })
      }

      function beginPersonalFlow(flow, receiptId, cursors) {
        const returnAction = { ...action, item: { ...action.item, id: receiptId ?? action.item.id }, cursors }
        popover.current.hidePopover()
        setPersonalFlow({ ...flow, returnAction })
      }

      function closePersonalFlow(focus = personalFlow.mode) {
        const { returnAction } = personalFlow
        setPersonalFlow(null)
        requestAnimationFrame(() => {
          const element = popover.current
          if (!element) return
          const source = opener.current?.isConnected ? opener.current : undefined
          setAction({ ...returnAction, initialPersonalFocus: focus })
          if (!element.matches(':popover-open')) element.showPopover(source ? { source } : undefined)
        })
      }

      function visitPersonalFlow(nextSessionId, task) {
        setPersonalFlow(null)
        openDraftSession(nextSessionId, task)
      }

      function show(event, target) {
        const element = popover.current
        const panel = ['report', 'plan', 'growth', 'settlement', 'teammate'].includes(target?.kind)
        const samePanel = panel && action?.kind === target.kind && action.item.id === target.item.id &&
          action.focusGearId === target.focusGearId
        if (element.matches(':popover-open') && ((!target && !action) || samePanel)) {
          element.hidePopover()
          return
        }
        opener.current = event.currentTarget
        lastAction.current = ''
        setAction(target)
        if (!element.matches(':popover-open')) element.showPopover({ source: event.currentTarget })
      }

      function closePopover() {
        popover.current.hidePopover()
        const target = opener.current?.isConnected ? opener.current : growthTrigger.current
        target?.focus()
      }

      const tools = snapshot?.tools ?? empty
      const roles = snapshot?.roles ?? emptyMap
      const roleNames = item => item?.roles?.map(id => roles[id]).filter(Boolean).join(' · ')
      const ready = tools.filter(tool => tool.state === 'ready').length
      const plugins = snapshot?.plugins ?? empty
      const skills = snapshot?.skills ?? empty
      const outfit = snapshot?.outfit ?? empty
      const pinned = snapshot?.pinned ?? empty
      const shortcutCarry = snapshot?.shortcutCarry ?? empty
      const pinnedById = new Map(pinned.map(item => [item.id, item]))
      const outfitIds = new Set(outfit.map(item => item.id))
      const gearSkills = new Map(skills.filter(item => item.kind === 'gear').map(item => [item.id, item]))
      const namedSkills = skills.filter(item => item.actions.some(move => !move.builtIn))
      const namedGearIds = new Set(namedSkills.filter(item => item.kind === 'gear').map(item => item.id))
      const profileById = new Map((snapshot?.profileEquipment ?? empty).map(item => [item.id, item]))
      for (const pin of pinned.filter(item => profileEquipmentKind(item.id))) {
        profileById.set(pin.id, pin.state === 'ready' ? { ...profileById.get(pin.id), ...pin } : pin)
      }
      const profileGear = [...profileById.values()].sort((a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || snapshot.gearRanks[b.id].xp - snapshot.gearRanks[a.id].xp
        || Number(namedGearIds.has(b.id)) - Number(namedGearIds.has(a.id))
        || a.name.localeCompare(b.name, activeLanguage.getSnapshot()))
      const heroSkill = skills.find(item => item.kind === 'hero' && item.ready)
      const heroRoleNames = roleNames({ roles: snapshot?.heroRoles })
      const outfitRole = outfit.at(-1)?.roles?.[0] ?? snapshot?.heroRoles?.[0]
      const loaded = plugins.filter(plugin => plugin.state === 'ready').length
      const equipmentById = new Map([...plugins, ...tools].map(item => [item.id, item]))
      const pluginAliases = new Set(plugins.map(item => item.actionId).filter(Boolean))
      for (const item of outfit) {
        if (!equipmentById.has(item.id) && !pluginAliases.has(item.id)) equipmentById.set(item.id, item)
      }
      const equipmentForAction = new Map([...plugins, ...profileGear, ...tools, ...outfit].map(item => [item.actionId ?? item.id, item]))
      const shortcuts = [...outfit, ...pinned.filter(item => !outfitIds.has(item.id)), ...namedSkills
        .filter(item => item.kind === 'gear' && !outfitIds.has(item.id) && !pinnedById.has(item.id))
        .map(item => ({ ...item, state: item.ready ? 'ready' : 'missing', ...equipmentForAction.get(item.id), id: item.id }))]
      for (const item of pinned) {
        if (!profileEquipmentKind(item.id)) equipmentById.set(item.id, { ...equipmentById.get(item.id), ...item })
      }
      const equipment = [...equipmentById.values()].sort((a, b) =>
        Number(Boolean(b.selected || b.pinned)) - Number(Boolean(a.selected || a.pinned)))
      const unavailable = equipment.filter(item => item.state !== 'ready').length
      const term = query.trim().toLocaleLowerCase()
      const usedRoles = new Set([...equipment, ...profileGear].flatMap(item => item.roles ?? empty))
      const selectedRole = usedRoles.has(role) ? role : ''
      const matchesRole = (item, value) => !value || item.roles?.includes(value)
      const matchesEquipment = (item, needle) => [item.name, item.sourceName, item.registeredSourceName, roleNames(item)]
        .some(value => value?.toLocaleLowerCase().includes(needle))
        || item.commands?.some(command => ('/' + command.name).includes(needle))
        || item.panelActivities?.some(activity => activity.name.toLocaleLowerCase().includes(needle))
        || item.compactionActivities?.some(activity => activity.name.toLocaleLowerCase().includes(needle))
      const visible = equipment.filter(item => matchesRole(item, selectedRole) && matchesEquipment(item, term))
      const visibleProfile = profileGear.filter(item => matchesRole(item, selectedRole) && matchesEquipment(item, term))
      const activePin = (action?.item.pinned || action?.shortcutKey) && pinnedById.get(action.item.id)
      const currentSkill = action?.kind === 'skill' && skills.find(item => item.id === action.item.id && item.kind === action.item.kind)
      const actionItem = currentSkill || action?.item
      const questTask = snapshot?.questTask
      function isActionReady() {
        if (!action || (action.questId !== undefined && (questTask?.id !== action.questId || questTask.sourcesReady === false))) return false
        if (action.item.id && tools.some(item => item.id === action.item.id && item.activation === 'disabled')) return false
        if (action.kind === 'task') return true
        if (action.shortcutKey && (activePin?.state !== 'ready' || activePin.shortcutKey !== action.shortcutKey)) return false
        if (action.kind === 'skill') return currentSkill?.ready
          && (!action.questKey || currentSkill.actions.some(move => move.proofKey === action.questKey))
        if (action.item.pinned) return activePin?.shortcutKey === action.item.shortcutKey &&
          (activePin.state === 'ready' || (activePin.state === 'waiting' && action.item.deferred))
        return tools.some(item => item.id === action.item.id && item.state === 'ready')
      }
      const actionReady = isActionReady()
      const inspecting = action?.kind === 'inspect' && (shortcuts.find(item => item.id === action.item.id) ?? action.item)
      const reporting = action?.kind === 'report'
      const switching = action?.kind === 'plan'
      const growing = action?.kind === 'growth'
      const settling = action?.kind === 'settlement'
      const dispatching = action?.kind === 'teammate'
      const panelIcon = { report: 'report', task: 'report', plan: 'swap', growth: 'mastery', settlement: 'mastery', teammate: 'team' }[action?.kind]
      const receipt = snapshot?.settlement?.receipt
      const readiness = snapshot?.settlement?.ready
      const questReady = readiness?.id !== closedQuest ? readiness : undefined
      const offer = snapshot?.questOffer ?? snapshot?.relayOffer
      const recentReceipt = receipt && !receipt.dismissed && receipt.id !== dismissedReceipt ? receipt : undefined
      const showReceipt = recentReceipt && (!snapshot.running || questReady)
      const activity = snapshot?.activity ?? empty
      const liveCalls = activity.filter(call => call.state === 'running')
      const lastCall = completedSeq !== expiredCall ? completedCall : undefined
      const activeCall = liveCalls.at(-1) ?? lastCall
      const activityText = activeCall && (activeCall.state === 'running' ? t('正在调用')
        : activeCall.state === 'failed' ? t('调用失败') : t('调用完成'))
      function callMatchesSlot(call, item) {
        if (item.state === 'conflict' || item.state === 'missing') return false
        if (item.id.startsWith('tool:')) {
          if (call.id !== item.id) return false
          if (item.pinned || (!call.sourceId && call.shortcutKey)) return call.shortcutKey === item.shortcutKey
          if (call.sourceId) return call.sourceId === (item.artSourceId ?? item.sourceId)
          return !item.selected
        }
        return call.providers.some(provider => provider.id === (item.actionId ?? item.id) &&
          (!profileEquipmentKind(item.id) || provider.shortcutKey === item.shortcutKey))
      }
      const usedGear = new Map((recentReceipt?.usedGear ?? empty).map(item => [item.id, item]))
      function usedShortcut(item) {
        const award = usedGear.get(item.actionId ?? item.id)
        if (!award || item.state === 'conflict') return false
        if (award.kind !== 'tool') return true
        const sourceId = item.artSourceId ?? item.sourceId
        return Boolean(sourceId && sourceId !== 'profile' &&
          (sourceId === award.sourceId || award.usedSources?.some(source => source.sourceId === sourceId)))
      }
      const openingQuest = snapshot?.openingQuest?.id !== closedQuest ? snapshot?.openingQuest : undefined
      const openingAction = openingQuest && openingQuest.id === questTask?.id && taskAction(questTask)
      const growthAction = { kind: 'growth', item: { name: t('成长与委托') } }
      const settlementAction = { kind: 'settlement', item: { name: t('回合结算'), id: receipt?.id } }
      const continuation = snapshot?.continuation
      const continuationReady = continuation?.state === 'ready'
      const continuationStopped = continuation?.state === 'failed' || continuation?.state === 'interrupted'
      const continuationLabel = continuationReady ? t('进入续战')
        : continuationStopped ? t('查看续战结果') : t('查看排队续战')
      const states = { ...matchStates, ready: t('已注册') }
      function taskAction(task, fromGrowth = false) {
        if (!task) return
        const context = { questId: task.id, initialInput: task.input, fromGrowth }
        if (task.shortcut) return { ...context, kind: 'task', item: { id: task.id, name: task.title, deferred: true,
          sourceName: task.shortcut.sourceName, summary: t('用 ') + task.shortcut.name + t(' 完成本次任务。') } }
        if (!task.target) return { ...context, kind: 'task', item: { id: task.id, name: task.title,
          summary: task.support && t('用 ') + task.support + t(' 取证。这个回合结束后可以先看结果，再发动主装备。') } }
        const item = task.target.kind === 'hero' ? heroSkill : gearSkills.get(task.target.id)
        if (item?.id === task.target.id && item.ready && item.actions.some(move => move.proofKey === task.target.key)) {
          return { ...context, kind: 'skill', item, questKey: task.target.key, questMode: task.mode, preparing: task.preparing }
        }
      }

      function useGear(item) {
        if (item.activation === 'disabled') return null
        const skill = gearSkills.get(item.actionId ?? item.id)
        if (item.state === 'waiting' && item.pinned && item.deferred) return { kind: 'tool', item }
        if (item.state === 'waiting' && !item.pinned && skill?.ready) return { kind: 'skill', item: skill }
        if (item.state !== 'ready') return null
        if (item.pinned && item.kind === 'tool') return { kind: 'tool', item }
        if (skill?.ready) return { kind: 'skill', item: skill,
          ...(item.pinned && profileEquipmentKind(item.id) && { shortcutKey: item.shortcutKey }) }
        const tool = tools.find(tool => tool.id === item.id && tool.state === 'ready')
        return tool ? { kind: 'tool', item: tool } : null
      }

      async function changePin(item) {
        if (pinPending) return
        setPinPending(item.id)
        setPinError('')
        try {
          const result = await request('match-shortcut', { action: 'match-shortcut', sessionId,
            itemId: item.id, shortcutKey: item.shortcutKey, remove: Boolean(item.pinned) })
          setSnapshot(result)
          if (item.pinned && action?.item.id === item.id) setAction(null)
        } catch (reason) {
          setPinError(reason.message)
        } finally {
          setPinPending('')
        }
      }

      async function resolveCarry(selected) {
        if (pinPending) return
        setPinPending('carry')
        setPinError('')
        try {
          setSnapshot(await request('match-shortcut-carry', { action: 'match-shortcut-carry', sessionId, selected }))
        } catch (reason) {
          setPinError(reason.message)
        } finally {
          setPinPending('')
        }
      }

      function pinButton(item) {
        if (!item.pinned && (item.state !== 'ready' || !item.shortcutKey || outfitIds.has(item.id))) return
        const label = item.pinned ? t('从快捷栏移除') : t('加入快捷栏')
        return h('button', { type: 'button', 'aria-label': label + ' ' + item.name, title: label,
          'aria-pressed': Boolean(item.pinned), className: 'moba-match-pin-button', disabled: Boolean(pinPending),
          onClick: () => changePin(item) }, h(Glyph, { kind: 'pin', size: 13 }))
      }

      async function dismissReceipt(event) {
        if (receiptPending || !receipt) return
        const id = receipt.id
        const button = event.currentTarget
        const hadFocus = document.activeElement === button
        setReceiptPending(true)
        setReceiptError(null)
        try {
          const dismissed = await request('settlement-dismiss', { action: 'settlement-dismiss', sessionId, id })
          if (dismissed) {
            if (hadFocus && (document.activeElement === button || document.activeElement === document.body)) growthTrigger.current?.focus()
            setDismissedReceipt(id)
          }
        } catch (reason) {
          setReceiptError({ id, message: reason.message })
        } finally {
          setReceiptPending(false)
        }
      }
      const hero = snapshot?.heroId && h(Fragment, null,
        h('span', { className: 'moba-dock-emblem' },
          h(HeroArt, { id: snapshot.heroId, art: snapshot.heroArt, rank: snapshot.heroRank, className: 'moba-dock-avatar' }),
          h(OutfitTrim, { appearance: outfitAppearance(snapshot.heroId, outfit, Object.keys(snapshot.removedEquipmentLabels ?? emptyMap)) }),
          h(SignatureInsignia, { item: snapshot.heroSignature, compact: true })),
        snapshot.heroFlag && h('span', { className: 'moba-dock-flag', title: t('战旗 · ') + snapshot.heroFlag.title },
          h(Glyph, { kind: 'flag', size: 14 })),
        snapshot.heroRank?.level > 1 && h('small', { key: snapshot.heroRank.level, className: 'moba-dock-level', title: snapshot.heroRank.badge,
          'data-level': snapshot.heroRank.level }, 'Lv.' + snapshot.heroRank.level),
        h('span', null, snapshot.heroName))
      return h(Fragment, null,
        personalFlow?.mode === 'rematch' && h(RematchEditor, { ...personalFlow.source, sourceSessionId: sessionId, request,
          evidenceReplayHint: personalFlow.evidenceReplay, backLabel: '返回任务结果',
          onBack: closePersonalFlow, onClose: closePersonalFlow, onVisit: visitPersonalFlow }),
        personalFlow?.mode === 'rebaseline' && h(PersonalBaselineTask, { source: personalFlow.source, rebaseline: personalFlow.rebaseline,
          workspaces, request, onBack: () => closePersonalFlow(), onVisit: visitPersonalFlow }),
        h('div', { className: 'moba-match-strip', style: { anchorName: anchor } },
        snapshot?.planTask && h(PlanTaskDraftAnchor, { key: sessionId, plan: snapshot.planTask, sessionId, request,
          consumeDraft: consumeTaskDraft, putTask: putTaskDraft }),
        snapshot?.heroTrial && h(HeroTrialAnchor, { key: sessionId, member: snapshot.heroTrial, sessionId, request, onVisit: openDraftSession,
          consumeDraft: consumeTaskDraft, putTask: putTaskDraft, draftStore, hasTurn: Boolean(snapshot.running || receipt), workspaces }),
        snapshot?.lighthouseComparison && h(RunComparisonAnchor, {
          kind: 'lighthouse', member: snapshot.lighthouseComparison, sessionId, request, onVisit: openDraftSession,
          consumeDraft: consumeTaskDraft, putTask: putTaskDraft, hasTurn: Boolean(snapshot.running || receipt), onUse: reuseComparisonLoadout,
        }),
        snapshot?.workspaceComparison && h(WorkspaceComparisonAnchor, {
          member: snapshot.workspaceComparison, sessionId, request, onVisit: openDraftSession,
          consumeDraft: consumeTaskDraft, putTask: putTaskDraft, draftStore,
          hasTurn: Boolean(snapshot.running || receipt), workspaces, onUse: reuseComparisonLoadout,
        }),
        snapshot?.planComparison && h(WorkspaceComparisonAnchor, {
          kind: 'plans', member: snapshot.planComparison, sessionId, request, onVisit: openDraftSession,
          consumeDraft: consumeTaskDraft, putTask: putTaskDraft, hasTurn: Boolean(snapshot.running || receipt), workspaces, onUse: reuseComparisonLoadout,
        }),
        snapshot?.rematchComparison && h(WorkspaceComparisonAnchor, {
          kind: 'rematch', member: snapshot.rematchComparison, sessionId, request, onVisit: openDraftSession,
          consumeDraft: consumeTaskDraft, putTask: putTaskDraft, hasTurn: Boolean(snapshot.running || receipt), workspaces, onUse: reuseComparisonLoadout,
        }),
        showReceipt && h(SettlementRibbon, { key: receipt.id, receipt, quest: questReady, snapshot, controls: id,
          onDetails: event => show(event, settlementAction), onQuest: event => show(event, growthAction),
          onGear: (event, focusGearId) => show(event, { ...settlementAction, focusGearId }),
          onDismiss: dismissReceipt, pending: receiptPending, error: receiptError?.id === receipt.id ? receiptError.message : undefined }),
        !showReceipt && snapshot?.lessonTaskResult && h('div', { className: 'moba-settlement-commands moba-lesson-result-entry' },
          h('button', { type: 'button', className: 'moba-settlement-button', 'aria-controls': id,
            onClick: event => show(event, settlementAction) }, t('查看任务结果'))),
        !showReceipt && openingQuest && h('div', { className: 'moba-settlement-ribbon', role: 'group', 'aria-label': t('本局开局委托') },
          h(Glyph, { kind: 'report', size: 19 }),
          h('div', { className: 'moba-settlement-copy' }, h('strong', null, openingQuest.title),
            h('span', null, openingQuest.nativeAction ?? t(journalModes[openingQuest.mode]))),
          h('div', { className: 'moba-settlement-commands' },
            h('button', { className: 'moba-settlement-button', type: 'button', 'aria-controls': id,
              onClick: event => show(event, openingAction || growthAction) }, openingAction ? t('打开首回合任务') : t('查看委托')))),
        h('div', { className: 'moba-live-activity', role: 'status', 'data-state': activeCall?.state },
          activeCall && h(Fragment, null, h(Glyph, { kind: 'action', size: 13 }),
            h('span', null, activityText, snapshot.activeToolCount > 1 && ' · ' + snapshot.activeToolCount + t(' 项')),
            h('strong', { title: [activeCall.name, activeCall.sourceName].filter(Boolean).join(' · ') }, activeCall.name))),
        h(TeammateActivity, { teammates: snapshot?.teammateActivity, onOpen: openContinuation }),
        h('div', { className: 'moba-match-dock', role: 'group', 'aria-label': t('对局快捷栏'),
          'data-active': Boolean(hero) },
          hero && (heroSkill ? h('button', { type: 'button', className: 'moba-dock-hero', 'data-role': outfitRole,
            'aria-label': t('打开') + snapshot.heroName + t('的操作'), 'aria-description': heroRoleNames,
            title: [snapshot.heroName, heroRoleNames].filter(Boolean).join(' · '),
            'aria-controls': id, 'aria-expanded': open && action?.item.kind === 'hero',
            onClick: event => show(event, { kind: 'skill', item: heroSkill }) }, hero)
            : h('div', { className: 'moba-dock-hero', 'data-role': outfitRole, title: snapshot.heroName }, hero)),
          shortcuts.length > 0 && h('div', { className: 'moba-dock-slots', role: 'group', 'aria-label': t('装备快捷入口') },
            shortcuts.map(item => {
              const used = usedShortcut(item)
              const showUse = Boolean(used && showReceipt)
              const call = liveCalls.findLast(call => callMatchesSlot(call, item))
                ?? (lastCall && callMatchesSlot(lastCall, item) ? lastCall : undefined)
              const status = call ? call.state === 'running' ? t('正在出手') : call.state === 'failed' ? t('调用失败') : t('调用完成')
                : showUse && t('本次已出手')
              return h('button', { type: 'button', className: 'moba-dock-slot',
                key: item.id, 'data-state': item.state, 'data-availability': matchAvailability(item), 'data-role': item.roles?.[0],
                'data-pinned': Boolean(item.pinned), 'data-used': showUse, 'data-activity': call?.state,
                title: [item.name, roleNames(item), item.sourceName, matchGearState(item), status].filter(Boolean).join(' · '),
                'aria-description': [roleNames(item), status].filter(Boolean).join(' · '),
                'aria-label': item.name + ' · ' + matchGearState(item),
                'aria-controls': id, 'aria-expanded': open && action?.item.id === item.id && action?.item.kind !== 'hero',
                onClick: event => show(event, useGear(item) ?? { kind: 'inspect', item }) },
                h(ItemArt, { item, rank: snapshot.gearRanks?.[item.id] }),
                matchAvailability(item) === 'ready' && h('span', { key: sessionId + ':' + (item.shortcutKey ?? item.artSourceId ?? item.id),
                  className: 'moba-dock-ready', 'aria-hidden': true }),
                call && h('span', { key: call.seq + ':' + call.state, className: 'moba-dock-activity', 'aria-hidden': true }),
                used && h('span', { key: receipt.id, className: 'moba-dock-used', 'aria-hidden': true }),
                item.pinned && h('span', { className: 'moba-dock-pin' }, h(Glyph, { kind: 'pin', size: 10 })),
                snapshot.gearRanks?.[item.id]?.badge && h('span', { className: 'moba-dock-gear-badge', title: snapshot.gearRanks[item.id].badge,
                  'data-level': snapshot.gearRanks[item.id].level, 'aria-hidden': true }, h(Glyph, { kind: 'mastery', size: 11 })),
                h('span', { className: 'moba-dock-state', 'aria-hidden': true }))
            })),
          h('div', { className: 'moba-dock-controls' },
            continuation && h('button', { type: 'button', className: 'moba-match-trigger moba-dock-continuation',
              'data-state': continuation.state, title: continuationLabel, 'aria-label': continuationLabel,
              onClick: () => continuationReady ? openContinuation(continuation.sessionId)
                : openLobby(sessionId, snapshot, { selectionPresetId: continuation.presetId }) },
              h(Glyph, { kind: continuationReady ? 'arrow' : 'lock', size: 16 }),
              h('span', null, continuationReady ? t('续战就绪') : continuationStopped ? t('续战结果') : t('续战排队'))),
            snapshot?.active && h('button', { ref: growthTrigger, type: 'button', className: 'moba-match-trigger moba-dock-swap', 'aria-controls': id,
              'aria-expanded': open && growing, 'aria-label': t('成长与委托'), 'data-quest-ready': Boolean(questReady && !showReceipt || offer),
              'aria-description': questReady ? t('委托待验收 · ') + questReady.title : offer ? t('委托待接续 · ') + offer.title : undefined,
              title: questReady ? t('委托待验收 · ') + questReady.title : offer ? t('委托待接续 · ') + offer.title : t('成长与委托'),
              onClick: event => show(event, growthAction) },
              h(Glyph, { kind: offer ? 'swap' : 'mastery', size: 16 }),
              h('span', null, questReady && !showReceipt ? t('待验收') : offer ? offer.nextLeg ? t('接棒') : t('续接') : t('成长'))),
            h('button', { type: 'button', className: 'moba-match-trigger', 'aria-controls': id,
              'aria-expanded': open && reporting, 'aria-label': t('对局战报'), title: t('对局战报'),
              onClick: event => show(event, { kind: 'report', item: { name: t('对局战报') } }) },
              h(Glyph, { kind: 'report', size: 16 }), h('span', null, t('战报'))),
            snapshot?.canDispatchTeammate && h('button', { type: 'button', className: 'moba-match-trigger', 'aria-controls': id,
              'aria-expanded': open && dispatching, 'aria-label': t('派遣队友'), title: t('派遣队友'),
              onClick: event => show(event, { kind: 'teammate', item: { name: t('派遣队友') } }) },
              h(Glyph, { kind: 'team', size: 16 }), h('span', null, t('组队'))),
            snapshot?.hasPlans && h('button', { type: 'button', className: 'moba-match-trigger moba-dock-swap', 'aria-controls': id,
              'aria-expanded': open && switching, 'aria-label': t('切换出装'), title: t('切换出装'),
              onClick: event => show(event, { kind: 'plan', item: { name: t('切换出装') } }) },
              h(Glyph, { kind: 'swap', size: 16 }), h('span', null, t('换装'))),
            h('button', { type: 'button', className: 'moba-match-trigger', 'aria-controls': id,
              'aria-expanded': open && !action, 'aria-label': t('对局装备'), title: t('对局装备'),
              'data-carry': shortcutCarry.length > 0, 'aria-description': shortcutCarry.length > 0 ? t('可核对原对局快捷槽') : undefined,
              onClick: event => show(event, null) },
              h(Glyph, { kind: 'crest', size: 17 }), h('span', null, t('对局装备'))),
            h('button', { type: 'button', className: 'moba-dock-return', title: t('回城换装'), 'aria-label': t('回城换装'),
              onClick: () => {
                popover.current.hidePopover()
                openLobby(sessionId, snapshot)
              } }, h(Glyph, { kind: 'back', size: 15 }), h('span', null, t('回城')))))),
        h('section', {
          className: 'moba-match', popover: 'auto', id, ref: popover, 'aria-labelledby': id + '-title',
          style: { positionAnchor: anchor },
          'data-action': Boolean(action),
          onKeyDown: event => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            if (action && lastAction.current) setAction(null)
            else closePopover()
          },
        },
          h('header', { className: 'moba-match-header' },
            h('div', { className: 'moba-match-identity' },
              panelIcon ? h(Glyph, { kind: panelIcon, size: 22 })
                : actionItem ? actionItem.kind === 'hero'
                ? h(HeroArt, { ...actionItem, rank: snapshot?.heroRank, className: 'moba-match-avatar' })
                : h(ItemArt, { item: actionItem, rank: snapshot?.gearRanks?.[actionItem.id], className: 'moba-match-avatar' })
                : snapshot?.heroId && h(HeroArt, { id: snapshot.heroId, art: snapshot.heroArt,
                  rank: snapshot.heroRank, className: 'moba-match-avatar' }),
              h('div', null, h('h2', { id: id + '-title', ref: actionHeading, tabIndex: -1 }, actionItem?.name ?? t('对局装备')),
                snapshot?.heroName && h('p', null, [snapshot.heroName, !action && heroRoleNames].filter(Boolean).join(' · ')))),
            settling && !action.fromGrowth ? h('button', { type: 'button', 'aria-label': t('关闭回合结算'), onClick: closePopover },
              h(Glyph, { kind: 'close', size: 17 }))
              : action ? h('button', { type: 'button', 'aria-label': action.fromSettlement ? t('返回结算') : action.fromGrowth ? t('返回成长与委托') : t('返回对局装备'),
              onClick: event => {
                event.preventDefault()
                setAction(action.fromSettlement ?? (action.fromGrowth ? growthAction : null))
              } },
              h(Glyph, { kind: 'back', size: 17 }))
              : h('button', { type: 'button', 'aria-label': t('关闭对局装备'), popoverTarget: id, popoverTargetAction: 'hide' },
                h(Glyph, { kind: 'close', size: 17 }))),
          pinError && h('p', { className: 'moba-match-action-error moba-match-pin-error', role: 'alert' }, pinError),
          reporting ? h(MatchReport, { sessionId, request, refresh: refreshReport, onUse: reuseProvenLoadout, onPrepare: followUp => {
            popover.current.hidePopover()
            openLobby(sessionId, snapshot, { followUp,
              selectionPresetId: followUp.heroId === snapshot?.heroId ? undefined : followUp.heroId })
          } })
          : growing ? h(MatchGrowth, { sessionId, request, initialQuest: action.initialQuest,
            version: snapshot?.growthVersion, teamBoardVersion: snapshot?.teamBoardVersion,
            toolChoiceRevision: JSON.stringify([sessionId, tools.map(item => [item.id, item.state, item.artSourceId, item.activation]),
              pinned.filter(item => item.deferred).map(item => [item.id, item.state, item.shortcutKey]),
              snapshot?.questOffer?.toolStates, snapshot?.relayOffer?.toolStates, snapshot?.questTask?.sourcesReady,
              skills.flatMap(item => item.actions.filter(move => move.publisher).map(move => [item.id, move.revision]))]),
            teamDispatchTasks: snapshot?.teamDispatchTasks,
            onDispatch: snapshot?.canDispatchTeammate ? task => setAction({ kind: 'teammate', item: { name: t('派遣队友') },
              initialTask: task, fromGrowth: true }) : undefined,
            onSettlement: () => setAction({ kind: 'settlement', item: { name: t('回合结算') }, fromGrowth: true }),
            onReport: () => setAction({ kind: 'report', item: { name: t('对局战报') }, fromGrowth: true }),
            onQuestClosed: setClosedQuest,
            heroSkill, gearSkills, onQuestAction: task => {
              const next = taskAction(task, true)
              if (next) setAction(next)
            },
            onLobby: relaySetup => { popover.current.hidePopover(); openLobby(sessionId, snapshot, { inspect: relaySetup?.gear, relaySetup }) },
            onOpenMatch: nextId => { popover.current.hidePopover(); openContinuation(nextId) } })
          : settling ? h(MatchSettlement, { key: JSON.stringify([action.item.id, action.focusGearId]), sessionId, request, version: snapshot?.growthVersion,
            initialId: action.item.id, initialCursors: action.cursors, focusGearId: action.focusGearId, quest: questReady,
            lessonTaskResult: snapshot?.lessonTaskResult,
            onPersonalFlow: beginPersonalFlow, initialPersonalFocus: action.initialPersonalFocus,
            equipped: new Set(shortcuts.map(item => item.id)), onQuest: () => setAction(growthAction),
            onUse: reuseProvenLoadout,
            onReport: () => setAction({ kind: 'report', item: { name: t('对局战报') } }),
            onOpenFlag: flagId => { popover.current.hidePopover(); openLobby(sessionId, snapshot, { flagId }) },
            onSignature: (heroId, heroSignature) => setSnapshot(current => current?.heroId === heroId ? { ...current, heroSignature } : current),
            onPrepare: (followUp, cursors) => {
              if (followUp.activity) {
                setAction({ ...growthAction, fromSettlement: { ...action, cursors, item: { ...action.item, id: followUp.id } },
                  initialQuest: { ...followUp.quest, title: actionLabel(followUp.activity).slice(0, 80) } })
                return
              }
              popover.current.hidePopover()
              openLobby(sessionId, snapshot, { followUp,
                selectionPresetId: followUp.heroId === snapshot?.heroId ? undefined : followUp.heroId })
            },
            onInspect: inspect => { popover.current.hidePopover(); openLobby(sessionId, snapshot, { inspect }) },
            onOpenMatch: nextId => { popover.current.hidePopover(); openContinuation(nextId) } })
          : dispatching ? h(TeammateDispatch, { sessionId, request, initialTask: action.initialTask, teamTasks: snapshot?.teamDispatchTasks,
            flagChallenge: snapshot?.teamFlagChallenge,
            onOpen: address => { popover.current.hidePopover(); openContinuation(address) } })
          : switching && snapshot ? h(MatchPlanSwitch, { sessionId, snapshot, request,
            onOpen: nextId => { popover.current.hidePopover(); openContinuation(nextId) },
            onLobby: () => { popover.current.hidePopover(); openLobby(sessionId, snapshot) },
            onContinuation: (entry, previous) => setSnapshot(current => {
              const live = current?.continuation
              return current && live?.id === previous?.id && live?.state === previous?.state
                ? { ...current, continuation: entry } : current
            }) })
          : inspecting ? h('div', { className: 'moba-match-body moba-match-action' },
            h('p', { className: 'moba-match-action-note', role: 'status' }, matchGearState(inspecting)),
            roleNames(inspecting) && h('p', { className: 'moba-match-action-note' }, roleNames(inspecting)),
            inspecting.activation === 'disabled' && h('p', { className: 'moba-match-action-note' }, inspecting.activationHint),
            inspecting.sourceName && h('p', { className: 'moba-match-action-note' },
              (inspecting.state === 'ready' ? t('当前来源 ') : t('所选来源 ')) + inspecting.sourceName),
            inspecting.sourceRank && h('p', { className: 'moba-match-action-note' },
              t('来源熟练度 · ') + masteryText(inspecting.sourceRank)),
            inspecting.state === 'conflict' && h('p', { className: 'moba-match-action-note' },
              profileEquipmentKind(inspecting.id) ? t('当前 Profile 装备配置已变化。')
                : inspecting.registeredSourceName ? t('当前注册来源 ') + inspecting.registeredSourceName : t('当前注册来源未识别。')),
            inspecting.state === 'conflict' && h('p', { className: 'moba-match-action-note' }, inspecting.pinned
              ? t('可等待原来源恢复，或移除槽位后选择当前来源。') : t('可等待原来源恢复，或回城换装。')),
            inspecting.summary && h('p', { className: 'moba-match-action-description' }, inspecting.summary),
            useGear(inspecting) && h('button', { type: 'button', className: 'moba-match-move',
              onClick: () => setAction(useGear(inspecting)) }, t('打开操作'), h(Glyph, { kind: 'arrow', size: 16 })),
            inspecting.pinned && h('button', { type: 'button', className: 'moba-match-move', disabled: Boolean(pinPending),
              onClick: () => changePin(inspecting) }, t('从快捷栏移除'), h(Glyph, { kind: 'pin', size: 16 })))
          : action ? h(MatchAction, { ...action, item: actionItem, ready: actionReady, running: snapshot?.running,
            onSend: async selection => {
              const language = activeLanguage.getSnapshot()
              const { text } = await request('match-prompt', { action: 'match-prompt', sessionId, ...selection }, undefined, language)
              await send(sessionId, text, selection, language)
              popover.current?.hidePopover()
            } })
          : h('div', { className: 'moba-match-body' },
          h('div', { className: 'moba-match-status' },
            h('span', { role: 'status' }, error || (!snapshot ? t('读取装备中…') : snapshot.active
              ? ready + t(' 件工具已注册') + (plugins.length ? ' · ' + loaded + t(' 件插件装备已加载') : '')
                + (unavailable ? ' · ' + unavailable + t(' 件未就绪') : '')
              : t('会话启动后显示装备。')))),
          h(RemovedEquipment, { labels: Object.values(snapshot?.removedEquipmentLabels ?? emptyMap) }),
          shortcutCarry.length > 0 && h(ShortcutCarry, { key: sessionId, items: shortcutCarry, pending: Boolean(pinPending), onResolve: resolveCarry }),
          namedSkills.length > 0 && h('div', { className: 'moba-match-skills', role: 'group', 'aria-label': t('英雄和装备操作') },
            namedSkills.map(item => {
              const key = item.kind + ':' + item.id
              const gear = item.kind === 'gear' && equipmentForAction.get(item.id)
              const enabled = item.ready && gear?.activation !== 'disabled'
              return h('button', { key, type: 'button', title: enabled ? item.summary : matchGearState(gear || item) ?? t('装备尚未就绪'),
                'aria-description': roleNames(item), 'data-action-key': key, disabled: !enabled, onClick: () => selectAction('skill', item, key) },
                item.kind === 'hero' ? h(HeroArt, { ...item, className: 'moba-match-skill-portrait' }) : h(ItemArt, { item }),
                h('span', null, item.name))
            })),
          (equipment.length > 0 || profileGear.length > 0) && h('label', { className: 'moba-match-search' },
            h(Glyph, { kind: 'search', size: 15 }),
            h('input', { type: 'search', value: query, placeholder: t('搜索对局装备'), 'aria-label': t('搜索对局装备'),
              onChange: event => {
                const value = event.target.value
                const needle = value.trim().toLocaleLowerCase()
                setQuery(value)
                if (needle && profileGear.some(item => matchesRole(item, selectedRole) && matchesEquipment(item, needle))) setProfileOpen(true)
              } })),
          usedRoles.size > 0 && h(RoleFilter, { roles, used: usedRoles, value: selectedRole, label: t('对局装备职能'), onChange: value => {
            setRole(value)
            if (value && profileGear.some(item => matchesRole(item, value) && matchesEquipment(item, term))) setProfileOpen(true)
          } }),
          visibleProfile.length > 0 && h('details', { className: 'moba-match-profile', open: profileOpen,
            onToggle: event => setProfileOpen(event.currentTarget.open) },
            h('summary', null, t('Profile 装备')),
            h('p', null, t('成功使用工具、装备操作、原生命令或登记的面板操作可获得经验。')),
            h('ul', { className: 'moba-match-tools' }, visibleProfile.map(item => {
              const rank = snapshot.gearRanks[item.id]
              const operation = useGear(item)
              const key = 'profile-action:' + item.id
              return h('li', { key: item.id, 'data-state': item.state, 'data-role': item.roles?.[0] },
                h(ItemArt, { item, rank }),
                h('div', { className: 'moba-match-name' }, item.name,
                  h('small', null, [roleNames(item), profileEquipmentKind(item.id), t('等级 ') + rank.level, rank.xp + ' XP'].filter(Boolean).join(' · ')),
                  h(EquipmentCommands, { commands: item.commands }),
                  h(EquipmentActivities, { activities: item.panelActivities, label: t('面板操作') }),
                  h(EquipmentActivities, { activities: item.compactionActivities, label: t('上下文管理') })),
                h('div', { className: 'moba-match-tool-controls' },
                  item.state !== 'ready' && h('span', { className: 'moba-match-state' }, matchGearState(item)),
                  pinButton(item),
                  operation && h('button', { type: 'button', 'aria-label': t('打开 ') + item.name + t(' 的操作'), 'data-action-key': key,
                    onClick: () => { lastAction.current = key; setAction(operation) } }, t('操作'))))
            }))),
          visible.length ? h('ul', { className: 'moba-match-tools' }, visible.map(item => {
            const operation = useGear(item)
            const tool = item.id.startsWith('tool:')
            return h('li', { key: item.id, 'data-state': item.state, 'data-availability': matchAvailability(item),
              'data-role': item.roles?.[0], 'data-selected': item.selected, title: item.summary },
              h(ItemArt, { item, rank: snapshot?.gearRanks?.[item.id] }),
              h('div', { className: 'moba-match-name' }, item.name,
                roleNames(item) && h('small', null, roleNames(item)),
                item.sourceName && h('small', null, (item.state === 'ready' ? '' : t('所选来源 ')) + item.sourceName),
                item.sourceRank?.xp > 0 && h('small', null, t('来源熟练度 · ') + masteryText(item.sourceRank)),
                item.registeredSourceName && h('small', null, t('当前注册来源 ') + item.registeredSourceName),
                item.activation === 'disabled' && h('small', null, item.activationHint),
                h(EquipmentCommands, { commands: item.commands }),
                h(EquipmentActivities, { activities: item.compactionActivities, label: t('上下文管理') })),
              h('div', { className: 'moba-match-tool-controls' },
                h('span', { className: 'moba-match-state' },
                item.state === 'ready' && item.id.startsWith('plugin:')
                  ? item.configured ? t('配置已加载') : t('插件已加载') : matchGearState(item, tool ? states : matchStates)),
                pinButton(item),
                operation && h('button', {
                  type: 'button', 'aria-label': (item.state === 'waiting' ? t('安排 ') : tool ? t('使用 ') : t('打开操作 ')) + item.name,
                  'data-action-key': item.id, onClick: () => selectAction(operation.kind, operation.item, item.id),
                }, item.state === 'waiting' ? t('安排') : tool ? t('使用') : t('操作'))))
          }))
            : snapshot?.active && !visibleProfile.length && h('p', { className: 'moba-match-empty' },
              term || selectedRole ? t('没有符合条件的装备。') : t('当前会话没有加载装备。')))))
    }

    const styles = `
      .moba-illustrated-fallback { position: relative; }
      .moba-atlas-sprite { position: absolute; inset: 0; background-repeat: no-repeat; }
      .moba-framed-art { position: relative; display: block; }
      .moba-framed-image { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
      .moba-frame { --metal: #e5ac81; --corner: 23%; --stroke: 2px; position: absolute; inset: 0; pointer-events: none; }
      .moba-frame[data-wide="true"] { --corner: 36px; --stroke: 3px; inset: 5px; }
      .moba-frame[data-frame-level="5"] { --metal: #a1def0; }
      .moba-frame[data-frame-level="6"] { --metal: #ffda84; }
      .moba-frame::after {
        content: ""; position: absolute; inset: 0; background:
          linear-gradient(var(--metal), var(--metal)) left top / var(--corner) var(--stroke),
          linear-gradient(var(--metal), var(--metal)) left top / var(--stroke) var(--corner),
          linear-gradient(var(--metal), var(--metal)) right top / var(--corner) var(--stroke),
          linear-gradient(var(--metal), var(--metal)) right top / var(--stroke) var(--corner),
          linear-gradient(var(--metal), var(--metal)) left bottom / var(--corner) var(--stroke),
          linear-gradient(var(--metal), var(--metal)) left bottom / var(--stroke) var(--corner),
          linear-gradient(var(--metal), var(--metal)) right bottom / var(--corner) var(--stroke),
          linear-gradient(var(--metal), var(--metal)) right bottom / var(--stroke) var(--corner);
        background-repeat: no-repeat;
      }
      .moba-frame[data-frame-level="5"]::before, .moba-frame[data-frame-level="6"]::before {
        content: ""; position: absolute; inset: 2px; border: 1px solid color-mix(in srgb, var(--metal) 72%, transparent);
      }
      .moba-frame[data-frame-level="6"]::before { box-shadow: 0 0 0 1px #1e1720, inset 0 0 0 1px #1e1720; }
      .moba-frame[data-wide="true"]::before { inset: 4px; }
      .moba-frame-picker { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 7px; min-width: 0; color: var(--muted); font-size: 12px; }
      .moba-frame-picker select { width: 100%; min-width: 0; min-height: 32px; padding: 4px 5px; color: var(--ink); border: 1px solid #6c5a43; background: #111722; font: inherit; }
      .moba-frame-actions { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 6px; margin-top: 9px; }
      .moba-frame-actions label { flex: 1 1 185px; }
      .moba-frame-unlocked { display: flex; align-items: center; gap: 4px; margin: 1px 0 0; color: var(--medal); font-size: 12px; }
      .moba-art-seal { position: absolute; display: grid; place-items: center; inset: auto auto 0 0; min-width: 14px; min-height: 9px; padding: 1px 2px 0; border-top: 1px solid currentColor; border-right: 1px solid currentColor; background: #101725; font: 700 7px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; letter-spacing: .015em; white-space: nowrap; pointer-events: none; }
      .moba-art-seal[data-shape="1"] { border-radius: 0 4px 0 0; }
      .moba-art-seal[data-shape="2"] { border-radius: 4px 0 0 0; }
      .moba-art-seal[data-shape="3"] { border-radius: 0 4px 0 4px; }
      .moba-avatar > .moba-art-seal, .moba-item > .moba-item-art > .moba-art-seal { min-width: 18px; min-height: 11px; font-size: 8px; }
      .moba-splash > .moba-art-seal, .moba-comparison-portrait > .moba-art-seal { inset: 9px auto auto 9px; min-width: 35px; min-height: 22px; padding: 3px 6px; border: 1px solid currentColor; font-size: 11px; }
      .moba-comparison-portrait > .moba-art-seal { min-height: 16px; min-width: 25px; padding: 2px 4px; font-size: 9px; }
      .moba-match-strip { width: calc(100% - 2 * var(--dsh-composer-side-clearance, 16px)); max-width: var(--dsh-composer-card-max-width, 952px); min-width: 0; margin-inline: auto; }
      .moba-match-dock, .moba-settlement-ribbon { box-sizing: border-box; min-width: 0; width: 100%; border: 1px solid #775f40; border-radius: 5px; color: #f3e4c8; background: #151a25; font: inherit; font-size: 12px; color-scheme: dark; }
      .moba-match-dock { display: flex; align-items: center; gap: 7px; padding: 4px 6px; }
      .moba-settlement-ribbon { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px 9px; padding: 5px 7px; margin-bottom: 4px; }
      .moba-settlement-ribbon[data-highlight="true"] { border-color: #b6935a; background: #29221f; }
      .moba-settlement-ribbon > svg { color: #f2d294; }
      .moba-settlement-avatar { width: 29px; height: 29px; display: block; border: 1px solid #917143; background-repeat: no-repeat; }
      .moba-settlement-body { display: grid; min-width: 0; gap: 4px; }
      .moba-settlement-copy { min-width: 0; display: flex; flex-wrap: wrap; gap: 2px 9px; align-items: baseline; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
      .moba-settlement-copy strong { color: #f4cd86; }
      .moba-settlement-copy span { color: #e1d2b5; }
      .moba-settlement-copy .moba-settlement-promotion { color: #b9e0c6; font-weight: 600; }
      .moba-settlement-used { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
      .moba-settlement-used button { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; gap: 5px; padding: 2px 6px 2px 2px; border: 1px solid #806749; border-radius: 3px; color: #f2e1be; background: #201f29; font: inherit; cursor: pointer; }
      .moba-settlement-used .moba-item-art { width: 24px; flex: none; }
      .moba-settlement-used button > span:not(.moba-item-art) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-settlement-used b { flex: none; color: #f4cd86; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .moba-settlement-used button:hover { border-color: #ebbe72; }
      .moba-settlement-used button:focus-visible, .moba-settlement .moba-mastery-rank:focus { outline: 2px solid #a0d5ed; outline-offset: -2px; }
      .moba-settlement-commands { display: flex; gap: 4px; align-items: center; }
      .moba-settlement-commands button { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 3px 7px; border: 1px solid #6c563a; border-radius: 3px; color: #f1d7a6; background: #232633; font: inherit; white-space: nowrap; cursor: pointer; }
      .moba-settlement-commands button:hover { border-color: #ebbe72; }
      .moba-settlement-commands button:focus-visible { outline: 2px solid #a0d5ed; outline-offset: -2px; }
      .moba-settlement-commands .moba-settlement-review { border-color: #a7834c; background: #473322; color: #ffe1a4; }
      .moba-settlement-commands .moba-settlement-hide { min-width: 31px; padding-inline: 5px; }
      .moba-settlement-ribbon > p { grid-column: 2 / -1; }
      .moba-dock-swap[data-quest-ready="true"], .moba-match-trigger[data-carry="true"] { border-color: #d0a263; background: #443222; color: #ffe1a4; }
      @media (prefers-reduced-motion: no-preference) {
        .moba-settlement-ribbon[data-highlight="true"] { animation: moba-receipt-reveal 420ms cubic-bezier(.15,.75,.3,1) both; }
        @keyframes moba-receipt-reveal { from { background: #463322; } to { background: #29221f; } }
      }
      .moba-match-dock *, .moba-match-dock *::before, .moba-match-dock *::after { box-sizing: border-box; }
      .moba-match-dock button { font: inherit; cursor: pointer; }
      .moba-match-dock button:focus-visible { outline: 2px solid #a0d5ed; outline-offset: -2px; }
      .moba-dock-hero { display: inline-flex; align-items: center; min-width: 0; max-width: min(36%, 205px); gap: 6px; padding: 2px 5px 2px 2px; color: inherit; border: 1px solid transparent; border-radius: 3px; background: transparent; }
      button.moba-dock-hero { border-color: #504533; }
      .moba-dock-hero > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-dock-avatar { width: 30px; height: 30px; flex: none; background-repeat: no-repeat; border: 1px solid var(--role-light, #9b7a4b); }
      .moba-dock-slots { display: flex; flex: 1; min-width: 0; gap: 4px; overflow-x: auto; padding: 2px 0; scrollbar-width: thin; scrollbar-color: #9b7a4b #151a25; }
      .moba-dock-slot { position: relative; display: grid; place-items: center; flex: 0 0 34px; height: 34px; padding: 1px; background: #0d131d; border: 1px solid color-mix(in srgb, var(--role-light, #c7a575) 60%, #191a26); border-radius: 3px; }
      .moba-dock-slot .moba-item-art { width: 29px; }
      .moba-live-activity { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 3px 7px; margin-bottom: 3px; border: 1px solid #594c3b; border-radius: 4px; background: #151a25; color: #efd5a6; font-size: 11px; }
      .moba-live-activity:empty, .moba-teammate-activity:empty { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); }
      .moba-live-activity > span, .moba-live-activity > svg { flex: none; }
      .moba-live-activity strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-live-activity[data-state="failed"] { color: #ffc0b4; }
      .moba-teammate-activity { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 3px; max-height: 108px; overflow-y: auto; margin-bottom: 3px; }
      .moba-teammate-call { display: grid; grid-template-columns: auto minmax(0, .85fr) auto minmax(0, 1.15fr) auto; align-items: center; gap: 6px; min-width: 0; min-height: 42px; padding: 4px 7px; text-align: left; font: inherit; font-size: 11px; color: #e2edf2; background: #182735; border: 1px solid #4b6f81; border-radius: 4px; cursor: pointer; }
      .moba-teammate-call:hover { background: #20394a; }
      .moba-teammate-call:focus-visible { outline: 2px solid #a0d5ed; outline-offset: -2px; }
      .moba-teammate-avatar, .moba-teammate-call .moba-teammate-gear { width: 28px; height: 28px; box-sizing: border-box; border: 1px solid #7fadc4; object-fit: cover; background-repeat: no-repeat; }
      .moba-teammate-copy { display: grid; min-width: 0; line-height: 1.25; }
      .moba-teammate-copy > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-teammate-copy > span { color: #acd1e3; }
      @media (prefers-reduced-motion: no-preference) {
        .moba-teammate-call { animation: moba-teammate-reveal 360ms cubic-bezier(.15,.75,.3,1); }
        @keyframes moba-teammate-reveal { from { background: #2f4c5b; } to { background: #182735; } }
      }
      .moba-dock-activity { position: absolute; inset: 0; pointer-events: none; border: 2px solid var(--role-light, #f4cc85); border-radius: inherit; }
      .moba-dock-activity::before { content: ''; position: absolute; inset: 0; opacity: 0; background: var(--role-wash, #ecd19a36); }
      .moba-dock-slot[data-activity="failed"] .moba-dock-activity { border-color: #ed9988; }
      .moba-dock-slot[data-activity="completed"] .moba-dock-activity { border-color: #a9d5b6; }
      .moba-dock-slot[data-activity="running"] .moba-item-art { opacity: 1; filter: none; }
      .moba-dock-pin { position: absolute; inset: 1px auto auto 1px; display: grid; place-items: center; background: #121722; color: #f4cd8d; }
      .moba-dock-slot[data-availability]:not([data-availability="ready"]) .moba-item-art { opacity: .6; filter: saturate(.45); }
      .moba-dock-ready { position: absolute; inset: 0; pointer-events: none; }
      .moba-dock-used { position: absolute; inset: 0; border: 2px solid #f4cc85; border-radius: inherit; pointer-events: none; }
      .moba-dock-slot[data-used="false"] .moba-dock-used { visibility: hidden; }
      .moba-dock-state { position: absolute; right: 2px; bottom: 2px; width: 7px; height: 7px; border: 1px solid #111520; border-radius: 50%; background: #95d6aa; }
      :is([data-availability="waiting"], [data-availability="conditional"]) > .moba-dock-state { background: #efbb6d; }
      :is([data-availability="missing"], [data-availability="conflict"], [data-availability="disabled"]) > .moba-dock-state { background: #ed9988; }
      .moba-dock-controls { display: flex; gap: 4px; margin-inline-start: auto; flex: none; }
      .moba-match-trigger, .moba-dock-return { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 33px; min-height: 33px; padding: 0 6px; border: 1px solid #504533; border-radius: 3px; color: #f1d7a6; background: #20232e; white-space: nowrap; }
      .moba-dock-continuation[data-state="ready"] { background: #4b3924; border-color: #c49b5f; color: #ffe1a6; }
      .moba-dock-swap { color: #f3d095; }
      .moba-dock-level { color: #ead0a3; font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .moba-dock-flag { display: grid; place-items: center; flex: none; color: #f2cc87; }
      .moba-dock-emblem { position: relative; flex: none; }
      .moba-dock-emblem > .moba-outfit-trim { --outfit-width: 2px; --outfit-opacity: .92; }
      .moba-dock-emblem .moba-signature-compact { position: absolute; inset: auto -3px -2px auto; }
      @media (prefers-reduced-motion: no-preference) {
        .moba-dock-slot[data-activity="running"] .moba-dock-activity::before { animation: moba-equip-reveal 430ms cubic-bezier(.16,1,.3,1); }
        .moba-dock-slot[data-activity="running"][data-role="scout"] .moba-dock-activity::before { animation-name: moba-equip-scan; }
        .moba-dock-slot[data-activity="running"][data-role="orchestration"] .moba-dock-activity::before { animation-name: moba-equip-weave; }
        .moba-dock-slot[data-activity="running"]:is([data-role="craft"], [data-role="support"]) .moba-dock-activity::before { animation-name: moba-equip-rise; }
        .moba-dock-level { animation: moba-level-up 480ms cubic-bezier(.15,.75,.3,1) both; }
        @keyframes moba-level-up { from { transform: translateY(3px) scale(1.2); color: #fff1bf; } to { transform: none; } }
        .moba-dock-ready { background: var(--role-wash, #ecd19a36); animation: moba-gear-ready 360ms ease-out both; }
        @keyframes moba-gear-ready { from { opacity: 1; } to { opacity: 0; } }
        .moba-dock-used { animation: moba-gear-used 500ms cubic-bezier(.15,.75,.3,1) both; }
        @keyframes moba-gear-used { from { background: #ffe3a88c; } to { background: transparent; } }
      }
      .moba-dock-gear-badge { position: absolute; top: 1px; right: 1px; display: grid; place-items: center; background: #111722; color: #cfa17a; }
      .moba-dock-level[data-level="5"], .moba-dock-gear-badge[data-level="5"] { color: #9ad8ec; }
      .moba-dock-level[data-level="6"], .moba-dock-gear-badge[data-level="6"] { color: #f7d489; }
      .moba-interaction-return { display: inline-grid; place-items: center; width: 30px; height: 30px; color: #805a2c; border: 1px solid currentColor; background: transparent; border-radius: 3px; }
      .moba-interaction-return:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
      @media (prefers-color-scheme: dark) { .moba-interaction-return { color: #e8c38b; } }
      .moba-match-dock button:hover, .moba-match-dock button[aria-expanded="true"] { border-color: #e6bc70; background-color: #2b261f; }
      .moba-match[popover] {
        position: fixed; inset: 55px 14px auto auto; margin: 0; padding: 0;
        width: min(420px, calc(100vw - 28px)); max-height: min(380px, calc(100dvh - 75px)); overflow: hidden;
        color: #f3e9d2; background: #121721; color-scheme: dark; border: 1px solid #755b37;
        box-shadow: 0 18px 44px #0007; border-radius: 6px; font-size: 13px; line-height: 1.4;
      }
      .moba-match:popover-open { display: grid; grid-template-rows: auto minmax(0, 1fr); }
      .moba-match[popover][data-action="true"] { max-height: min(500px, calc(100dvh - 75px)); }
      .moba-match[popover]:has(.moba-match-dispatch) { max-height: min(590px, calc(100dvh - 75px)); }
      .moba-match-body { overflow: auto; min-height: 0; }
      @supports (position-area: top span-left) {
        .moba-match[popover] { inset: auto; position-area: top span-left; position-try-fallbacks: flip-block; margin-bottom: 7px; }
      }
      .moba-match *, .moba-match *::before, .moba-match *::after { box-sizing: border-box; }
      .moba-match :focus-visible, .moba-match-trigger:focus-visible { outline: 2px solid #9ed4ec; outline-offset: 2px; }
      .moba-match button { cursor: pointer; }
      .moba-match-header, .moba-match-status { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; }
      .moba-match-header { border-bottom: 1px solid #51412e; background: #191d27; }
      .moba-match-identity { display: flex; align-items: center; gap: 9px; }
      .moba-match-avatar { width: 37px; height: 37px; border: 1px solid #967344; flex: none; background-repeat: no-repeat; }
      .moba-image { object-fit: cover; object-position: center; }
      .moba-match-header h2 { font-family: "STIX Two Text", "Songti SC", serif; font-size: 20px; line-height: 1.2; color: #e6bc70; margin: 0; overflow-wrap: anywhere; }
      .moba-match-header p { color: #d4c7b3; font-size: 12px; margin: 2px 0 0; }
      .moba-match-header button { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid #5b4a35; border-radius: 3px; background: #242834; color: #f3e9d2; }
      .moba-match-header button:hover { border-color: #e6bc70; }
      .moba-match-status { color: #c2bec6; font-size: 12px; }
      .moba-match-search { display: flex; align-items: center; gap: 7px; margin: 0 14px 8px; padding: 5px 8px; color: #c2bec6; border: 1px solid #4e4439; border-radius: 3px; }
      .moba-match-search input { flex: 1; min-width: 0; padding: 2px 0; border: 0; background: transparent; color: #f3e9d2; font-size: 13px; }
      .moba-match .moba-role-filter { --line: #4e4439; --muted: #d4c7b3; --gold: #e6bc70; margin: 0 14px 8px; }
      .moba-match-tools { display: grid; gap: 3px; padding: 0 14px 12px; margin: 0; list-style: none; }
      .moba-match-tools li { display: grid; grid-template-columns: 29px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 3px 7px 3px 3px; border: 1px solid #333845; background: #171e2b; }
      .moba-match-tools li[data-selected="true"] { border-color: #876941; }
      .moba-match-tools .moba-item-art { width: 29px; }
      .moba-match-tools li:is([data-state]:not([data-state="ready"]), [data-availability="disabled"]) .moba-item-art { filter: saturate(.35); opacity: .65; }
      .moba-match-name { font-size: 12px; overflow-wrap: anywhere; }
      .moba-match-name small { display: block; color: #c2bec6; font-size: 11px; margin-top: 2px; }
      .moba-equipment-native { margin-top: 5px; color: #e6bc70; font-size: 12px; overflow-wrap: anywhere; }
      .moba-equipment-native summary { cursor: pointer; }
      .moba-equipment-native > div { padding-block: 5px; color: #f3e9d2; }
      .moba-equipment-native > div + div { border-top: 1px solid #564532; }
      .moba-equipment-native small { display: block; margin-top: 2px; color: #c2bec6; font-size: 11px; }
      .moba-match-state { color: #a8d1b5; font-size: 11px; white-space: nowrap; }
      .moba-match-profile { margin: 0 14px 8px; border: 1px solid #51412e; border-radius: 3px; }
      .moba-match-profile summary { padding: 7px 8px; color: #ecd2a1; font-size: 12px; cursor: pointer; }
      .moba-match-profile p { margin: 0 8px 8px; color: #d4c7b3; font-size: 12px; }
      .moba-match-profile .moba-match-tools { padding: 0 8px 8px; }
      .moba-shortcut-carry input { margin: 0 2px; accent-color: #ebc27b; }
      .moba-shortcut-carry-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px; padding: 0 8px 8px; }
      .moba-shortcut-carry-actions .moba-match-move { width: auto; min-height: 32px; }
      .moba-match-tools li:is([data-state="waiting"], [data-availability="conditional"]) .moba-match-state { color: #e6bc70; }
      .moba-match-tools li:is([data-state="missing"], [data-state="conflict"], [data-availability="disabled"]) .moba-match-state { color: #efa597; }
      .moba-match-empty { color: #c2bec6; margin: 0; padding: 4px 14px 14px; font-size: 12px; }
      .moba-match-skills { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 14px 9px; }
      .moba-match-skills button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px 4px 4px; color: #f3ddb3; border: 1px solid #81623d; background: #28231f; font: inherit; font-size: 12px; }
      .moba-match-skills .moba-item-art { width: 25px; flex: none; }
      .moba-match-skill-portrait { width: 25px; height: 25px; flex: none; background-repeat: no-repeat; }
      .moba-match-skills span { overflow-wrap: anywhere; }
      .moba-match-skills button:hover, .moba-match-tool-controls button:hover { border-color: #e6bc70; }
      .moba-match-skills button:disabled, .moba-match-move:disabled { opacity: .5; cursor: default; }
      .moba-match-tool-controls { display: flex; gap: 7px; align-items: center; justify-content: end; }
      .moba-match-tool-controls button { color: #ecd2a1; border: 1px solid #5b4a35; background: #25262d; min-height: 25px; padding: 2px 6px; font: inherit; font-size: 11px; white-space: nowrap; }
      .moba-match-tool-controls .moba-match-pin-button { display: grid; place-items: center; min-height: 28px; min-width: 28px; }
      .moba-match-pin-button[aria-pressed="true"] { border-color: #d5a965; color: #f6dba7; background: #433326; }
      .moba-match-pin-error { margin: 8px 14px; }
      .moba-match-action { display: grid; align-content: start; gap: 5px; padding: 10px 14px 14px; }
      .moba-match-action-description, .moba-match-action-note { margin: 0 0 4px; color: #cbc3b7; font-size: 12px; overflow-wrap: anywhere; }
      .moba-match-action label { color: #e8d6b5; font-size: 12px; }
      .moba-match-action textarea { width: 100%; min-height: 48px; resize: vertical; padding: 5px 8px; background: #0c1019; color: #f3e9d2; font: inherit; border: 1px solid #665437; border-radius: 2px; }
      .moba-match-action-error { margin: 0; color: #ffb6ac; overflow-wrap: anywhere; }
      .moba-match-moves { display: grid; gap: 5px; }
      .moba-match-instruction { padding: 2px 7px 6px; color: #c2bfca; font-size: 12px; }
      .moba-match-instruction summary { color: #9ed4ec; cursor: pointer; }
      .moba-match-instruction p { margin: 5px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .moba-match-move { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; min-height: 38px; padding: 5px 8px; background: #22232d; color: #f3dcb0; border: 1px solid #645236; font: inherit; }
      .moba-match-move:not(:disabled):hover { border-color: #e6bc70; background: #30291f; }
      .moba-match-move svg { flex: none; }
      .moba-match-move strong, .moba-match-move small { display: block; overflow-wrap: anywhere; }
      .moba-match-move small { color: #ccc3b4; font-size: 11px; }
      .moba-match-plan { --line: #564738; --gold: #ecc784; --muted: #cdc4b7; --blue: #a3d5e7; display: grid; align-content: start; gap: 10px; padding: 11px 14px 14px; scrollbar-width: thin; scrollbar-color: #826645 #121721; }
      .moba-match-plan .moba-empty, .moba-match-plan .moba-continuation { margin: 0; }
      .moba-match-plan-choices { min-width: 0; padding: 0; margin: 0; border: 0; }
      .moba-match-plan-choices legend { padding: 0; margin-bottom: 5px; color: var(--gold); font-size: 12px; }
      .moba-match-plan-roster { display: grid; gap: 4px; max-height: 157px; overflow: auto; scrollbar-width: thin; scrollbar-color: #826645 #121721; }
      .moba-match-plan-pick { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 44px; padding: 3px 8px 3px 3px; background: #1a202d; border: 1px solid #41404a; cursor: pointer; }
      .moba-match-plan-pick:hover, .moba-match-plan-pick[data-picked="true"] { border-color: #c6a064; background: #30271f; }
      .moba-match-plan-pick:has(input:focus-visible) { outline: 2px solid #9ed4ec; outline-offset: -2px; }
      .moba-match-plan-pick input { position: absolute; inset: 0; width: 1px; height: 1px; opacity: 0; }
      .moba-match-plan-portrait { width: 36px; height: 36px; border: 1px solid #987748; background-repeat: no-repeat; }
      .moba-match-plan-pick strong, .moba-match-plan-pick small { display: block; overflow-wrap: anywhere; }
      .moba-match-plan-pick small, .moba-match-plan-state { color: var(--muted); font-size: 11px; }
      .moba-match-plan-preview { display: grid; gap: 7px; min-width: 0; }
      .moba-match-plan-preview .moba-plan-gear { max-height: 112px; overflow: auto; scrollbar-width: thin; }
      .moba-match-plan-changes { border-block: 1px solid var(--line); }
      .moba-match-plan-changes .moba-delta + .moba-delta { border-top: 1px solid #363542; }
      .moba-match-plan-changes summary { min-height: 30px; padding: 6px 1px; cursor: pointer; color: var(--gold); font-weight: 600; }
      .moba-match-plan-changes summary span { float: inline-end; font-variant-numeric: tabular-nums; }
      .moba-match-plan-changes [data-tone="gain"] summary { color: #a6d5bc; }
      .moba-match-plan-changes [data-tone="loss"] summary { color: #f0b4b6; }
      .moba-match-plan-changes .moba-match-action-note { margin: 5px 0; }
      .moba-match-plan-actions, .moba-match-plan-error, .moba-quest-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; align-items: center; }
      .moba-match-dispatch { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
      .moba-dispatch-footer { display: grid; gap: 4px; justify-items: end; padding: 8px 14px 10px; border-top: 1px solid #564738; }
      .moba-match-plan .moba-match-plan-commit, .moba-dispatch-footer .moba-match-plan-commit { background: #443221; border-color: #a88049; color: #ffe2a7; }
      .moba-mastery-rank { --medal: #d5b17d; display: grid; grid-template-columns: 49px minmax(0, 1fr); gap: 9px; align-items: center; min-width: 0; padding: 6px; border: 1px solid #574a3d; background: #1b202c; }
      .moba-mastery-rank[data-level="3"], .moba-mastery-rank[data-level="4"] { --medal: #e5ac81; }
      .moba-mastery-rank[data-level="5"] { --medal: #a1def0; }
      .moba-mastery-rank[data-level="6"] { --medal: #ffda84; }
      .moba-mastery-portrait, .moba-mastery-rank .moba-item-art { width: 49px; height: 49px; border: 1px solid var(--medal); background-repeat: no-repeat; }
      .moba-mastery-meter { display: grid; gap: 3px; }
      .moba-mastery-meter > div { display: flex; align-items: baseline; justify-content: space-between; gap: 5px; overflow-wrap: anywhere; }
      .moba-mastery-meter .moba-mastery-caption { justify-content: flex-start; gap: 8px; }
      .moba-mastery-caption b { color: #f2cd8a; font-size: 11px; }
      .moba-mastery-activity { display: grid; gap: 2px; list-style: none; padding: 0; margin: 0; color: #d4c7b3; font-size: 11px; overflow-wrap: anywhere; }
      .moba-mastery-meter span { color: var(--medal); font-weight: 600; white-space: nowrap; }
      .moba-mastery-meter small { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
      .moba-mastery-meter progress { appearance: none; width: 100%; height: 5px; background: #0d141f; border: 0; color: var(--medal); }
      .moba-mastery-meter progress::-webkit-progress-bar { background: #0d141f; }
      .moba-mastery-meter progress::-webkit-progress-value { background: var(--medal); }
      .moba-mastery-meter progress::-moz-progress-bar { background: var(--medal); }
      .moba-quest { display: grid; gap: 6px; border-block: 1px solid var(--line); padding-block: 9px; }
      .moba-quest h3 { margin: 0; color: var(--gold); font-size: 14px; }
      .moba-quest-title { overflow-wrap: anywhere; }
      .moba-quest-form { display: grid; gap: 7px; }
      .moba-quest-form label { display: grid; gap: 3px; color: var(--muted); font-size: 12px; }
      .moba-quest-form input, .moba-quest-form select, .moba-quest-form textarea { width: 100%; min-width: 0; min-height: 33px; padding: 4px 7px; border: 1px solid var(--line); background: #0f1520; color: #f3e9d2; font: inherit; }
      .moba-quest-form textarea { resize: vertical; }
      .moba-quest-form input::placeholder, .moba-quest-form textarea::placeholder { color: #bdb3a4; }
      .moba-quest-form > button { justify-self: end; }
      .moba-relay-offer { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid #a08050; background: #2b241e; color: #f2d29b; }
      .moba-relay-offer strong { display: block; overflow-wrap: anywhere; }
      .moba-relay-offer p { margin: 3px 0 0; }
      .moba-relay-check { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: start; gap: 10px; margin-bottom: 12px; padding: 9px 11px; border: 1px solid #7e633f; background: #211c20; overflow-wrap: anywhere; }
      .moba-relay-check-target { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .moba-relay-check-target .moba-item-art { width: 36px; flex: none; border: 1px solid var(--line); }
      .moba-relay-check-target h2 { color: var(--gold); font-size: 13px; }
      .moba-relay-check-target strong, .moba-relay-check-target small { display: block; }
      .moba-relay-check-target small, .moba-relay-check-result p { color: var(--muted); font-size: 12px; }
      .moba-relay-check-result p { margin: 2px 0; }
      .moba-relay-check-result [data-ready="true"] { color: #b0dabc; }
      .moba-relay-check-result [data-ready="false"], .moba-relay-check-result [role="alert"] { color: #efbb92; }
      .moba-relay-check-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      @container (max-width: 620px) {
        .moba-relay-check { grid-template-columns: minmax(0, 1fr); }
      }
      .moba-quest-transfer-gear, .moba-quest-transfer-note { grid-column: 1 / -1; }
      .moba-quest-transfer-gear li:only-child { grid-column: 1 / -1; }
      .moba-quest-transfer-note { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; font-size: 12px; color: var(--muted); }
      .moba-quest-transfer-note button { padding-block: 2px; }
      .moba-trial-action-note, .moba-combo-reward { display: flex; justify-content: flex-start; align-items: center; gap: 5px; margin: 2px 0; color: var(--gold); font-size: 12px; overflow-wrap: anywhere; }
      .moba-trial-action-note svg, .moba-combo-reward svg, .moba-journal-action svg { flex: none; }
      .moba-combo-reward { padding: 6px 8px; border: 1px solid var(--line); background: #191e2b; }
      .moba-relay-legs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; list-style: none; padding: 0; margin: 2px 0; }
      .moba-relay-legs li { display: grid; grid-template-columns: 33px minmax(0, 1fr); align-content: start; gap: 5px 7px; min-width: 0; padding: 6px; border: 1px solid var(--line); background: #171e2b; }
      .moba-relay-legs li[data-complete="true"] { border-color: #658a71; }
      .moba-relay-avatar { display: block; width: 33px; height: 33px; background-repeat: no-repeat; border: 1px solid #826944; }
      .moba-relay-empty { display: grid; place-items: center; color: #dbbd89; background: #201d21; }
      .moba-relay-stage { display: grid; min-width: 0; gap: 2px; overflow-wrap: anywhere; }
      .moba-relay-stage small { color: var(--gold); font-size: 11px; }
      .moba-relay-stage span { color: var(--muted); font-size: 11px; }
      .moba-relay-legs li[data-complete="true"] .moba-relay-stage span { color: #b0dabc; }
      .moba-relay-gear { grid-column: 1 / -1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--muted); font-size: 11px; }
      .moba-relay-gear > span { display: inline-flex; gap: 4px; align-items: center; max-width: 100%; }
      .moba-relay-gear > span > span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .moba-relay-gear .moba-item-art { width: 21px; flex: none; }
      .moba-relay-legs .moba-text { grid-column: 1 / -1; justify-self: end; padding-block: 2px; }
      .moba-relay-reward { display: grid; gap: 3px; color: var(--muted); font-size: 12px; }
      .moba-relay-reward select { width: 100%; min-height: 33px; padding: 4px 7px; border: 1px solid var(--line); background: #0f1520; color: #f3e9d2; font: inherit; }
      .moba-combo-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .moba-combo-proof { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 0; margin: 2px 0; list-style: none; }
      .moba-combo-proof.moba-relay-target { grid-template-columns: minmax(0, 1fr); }
      .moba-combo-proof li { display: grid; grid-template-columns: 27px minmax(0, 1fr); align-items: start; gap: 6px; padding: 5px 7px; border: 1px solid var(--line); background: #151c29; overflow-wrap: anywhere; }
      .moba-combo-proof .moba-item-art { width: 27px; }
      .moba-combo-proof li div span { display: block; color: var(--muted); font-size: 11px; }
      .moba-combo-proof li[data-reached="true"] { border-color: #55816a; }
      .moba-combo-proof li[data-reached="true"] span { color: #a9d9ba; }
      .moba-flag-earned { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; padding: 7px; border: 1px solid #a07b49; color: #f3d59c; background: #30251c; }
      .moba-flag-earned div { display: grid; overflow-wrap: anywhere; }
      .moba-flag-earned span { font-size: 12px; }
      @media (prefers-reduced-motion: no-preference) {
        .moba-flag-earned { animation: moba-flag-reveal 520ms cubic-bezier(.15,.75,.3,1) both; }
        @keyframes moba-flag-reveal { from { transform: translateY(5px); background: #4a3622; } to { transform: none; } }
      }
      .moba-mastery-archive summary { cursor: pointer; color: var(--blue); }
      .moba-mastery-archive p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
      .moba-mastery-archive .moba-mastery-rank { margin-top: 5px; }
      .moba-growth-history { min-height: 33px; color: var(--blue); }
      .moba-settlement-history { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
      .moba-settlement-history select { min-width: 0; min-height: 33px; padding: 4px 7px; border: 1px solid var(--line); background: #0f1520; color: #f3e9d2; font: inherit; }
      .moba-settlement-pages { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 10px; color: var(--muted); font-size: 12px; }
      .moba-settlement-pages button { min-height: 29px; }
      .moba-settlement-pages button:disabled { opacity: .55; cursor: default; text-decoration: none; }
      .moba-settlement-total { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 8px; border: 1px solid #947344; background: #28211d; color: #f4d297; }
      .moba-settlement-total h3, .moba-settlement-gear h3 { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
      .moba-settlement-total p { margin: 2px 0 0; color: #ddd0b8; font-size: 11px; }
      .moba-settlement-total > strong { white-space: nowrap; font-size: 16px; font-variant-numeric: tabular-nums; }
      .moba-settlement .moba-mastery-rank[data-promoted="true"] { border-color: #ae8a55; }
      .moba-settlement-gear { display: grid; gap: 5px; }
      .moba-settlement-gear h3 { color: var(--gold); margin: 2px 0; }
      .moba-settlement-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px 12px; }
      .moba-settlement-signatures { display: grid; gap: 6px; padding: 8px; border: 1px solid #947344; background: #221e1f; }
      .moba-settlement-signatures h3 { display: flex; align-items: center; gap: 5px; margin: 0; color: #f4cd86; font-size: 13px; }
      .moba-settlement-signatures ul { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
      .moba-settlement-signatures li { display: grid; grid-template-columns: 29px minmax(0, 1fr) max-content; align-items: center; gap: 7px; overflow-wrap: anywhere; }
      .moba-settlement-signatures li + li { border-top: 1px solid #5d4a32; padding-top: 5px; }
      .moba-settlement-signatures .moba-item-art { width: 29px; }
      .moba-settlement-signatures strong, .moba-settlement-signatures small { display: block; }
      .moba-settlement-signatures small { color: #e1cdb2; }
      .moba-settlement-signatures button { min-height: 30px; color: #f7dba3; white-space: nowrap; }
      .moba-follow-up-title { margin: 0; color: var(--gold); font-size: 16px; }
      .moba-proven-hero { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
      .moba-proven-hero p { margin: 2px 0 0; }
      .moba-proven-files :is(h4, h5), .moba-proven-gear legend { margin: 0 0 5px; color: var(--gold); font-size: 13px; }
      .moba-proven-files ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      .moba-proven-files li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 3px 8px;
        padding: 5px 7px; background: #171c27; border: 1px solid var(--line); font-size: 12px; overflow-wrap: anywhere; }
      .moba-proven-files li small { color: var(--muted); }
      .moba-lesson-result { display: grid; gap: 8px; min-width: 0; padding: 8px; border: 1px solid #705a3c; background: #201d26; }
      .moba-lesson-result > h3 { margin: 0; color: var(--gold); font-size: 15px; overflow-wrap: anywhere; }
      .moba-lesson-result .moba-lighthouse-results { margin: 0; }
      .moba-lesson-result .moba-settlement-footer button { max-inline-size: 100%; white-space: normal; overflow-wrap: anywhere; }
      .moba-lesson-result-files li > div { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; gap: 3px 8px; }
      .moba-lesson-result-awards h4, .moba-session-settlement-title { margin: 0 0 5px; color: var(--gold); font-size: 13px; }
      .moba-lesson-result-awards ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      .moba-lesson-result-awards li { display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
        padding: 5px 7px; border: 1px solid var(--line); overflow-wrap: anywhere; }
      .moba-lesson-result-awards small { display: block; color: var(--muted); }
      .moba-lesson-result-awards li > span { flex: none; color: #f4cd86; font-variant-numeric: tabular-nums; }
      .moba-lesson-result-entry { justify-content: flex-end; margin-block-end: 5px; }
      .moba-proven-gear { display: grid; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; }
      .moba-proven-gear label { display: grid; grid-template-columns: auto 30px minmax(0, 1fr); gap: 7px; align-items: start;
        padding: 6px; border: 1px solid var(--line); background: #161c28; overflow-wrap: anywhere; cursor: pointer; }
      .moba-proven-gear label:has(input:checked) { border-color: #a27c48; }
      .moba-proven-gear label:has(input:disabled) { cursor: default; }
      .moba-proven-gear label:focus-within { outline: 1px solid var(--gold); }
      .moba-proven-gear input { accent-color: var(--gold); margin: 3px 0 0; }
      .moba-proven-gear .moba-item-art { width: 30px; }
      .moba-proven-gear strong, .moba-proven-gear small { display: block; }
      .moba-proven-gear small { color: var(--muted); font-size: 11px; }
      .moba-proven-gear .moba-proven-blocker { color: #ffccd4; }
      .moba-proven-actions { position: sticky; inset-block-end: 0; z-index: 1; display: flex; flex-wrap: wrap;
        justify-content: flex-end; align-items: center; gap: 6px; padding: 6px 0 1px; background: #121721; }
      .moba-proven-actions .moba-match-move { flex: 1; min-height: 40px; }
      .moba-follow-up-gear { display: grid; gap: 5px; min-width: 0; padding: 0; margin: 0; border: 0; }
      .moba-follow-up-gear label { display: grid; grid-template-columns: auto 32px minmax(0, 1fr); align-items: center; gap: 8px; padding: 5px 7px; border: 1px solid #41434b; background: #182131; overflow-wrap: anywhere; }
      .moba-follow-up-gear label[data-picked="true"] { border-color: #a6814f; background: #2d2721; }
      .moba-follow-up-gear input { accent-color: #ecc784; }
      .moba-follow-up-gear .moba-item-art { width: 32px; }
      .moba-follow-up-gear strong, .moba-follow-up-gear small { display: block; font-size: 12px; }
      .moba-follow-up-gear small { color: var(--muted); font-size: 11px; }
      .moba-report { padding: 10px 14px 14px; }
      .moba-report-rounds, .moba-report-entries { list-style: none; padding: 0; margin: 0; }
      .moba-report-round + .moba-report-round { margin-top: 13px; }
      .moba-report-actions { display: flex; flex-wrap: wrap; gap: 4px 9px; }
      .moba-report-turn { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; padding-bottom: 6px; border-bottom: 1px solid #675439; }
      .moba-report-turn h3 { margin: 0; color: #f2d8a8; font-size: 13px; }
      .moba-report-meta { color: #bbb7b3; font-size: 11px; }
      .moba-report-turn-state { margin-inline-start: auto; color: #bbdac5; font-size: 11px; white-space: nowrap; }
      .moba-report-turn-state[data-state="running"] { color: #efbf73; }
      .moba-report-turn-state[data-state="error"], .moba-report-turn-state[data-state="blocked"],
      .moba-report-turn-state[data-state="failed"] { color: #f0aca2; }
      .moba-report-turn-state[data-state="unfinished"] { color: #c2bec6; }
      .moba-report-row { display: grid; grid-template-columns: 27px minmax(0, 1fr) auto; gap: 7px; align-items: center; padding: 6px 0; border-bottom: 1px solid #353944; overflow-wrap: anywhere; }
      .moba-report-row[data-nested="true"] { margin-inline-start: 8px; padding-inline-start: 7px; border-inline-start: 1px solid #6c5c45; }
      .moba-report-row .moba-item-art, .moba-report-art { width: 27px; height: 27px; border: 1px solid #604d36; background-repeat: no-repeat; }
      .moba-report-event { display: grid; gap: 1px; font-size: 12px; }
      .moba-report-row[data-type="action"] strong { color: #f0d6a5; }
      .moba-report-row small { color: #c2bcb3; font-size: 11px; }
      .moba-report-event-status { display: grid; justify-items: end; gap: 1px; color: #bbdac5; font-size: 11px; white-space: nowrap; }
      .moba-report-event-status[data-state="running"], .moba-report-event-status[data-state="action"] { color: #efbf73; }
      .moba-report-event-status[data-state="failed"], .moba-report-event-status[data-state="unfinished"],
      .moba-report-event-status[data-state="conflict"] { color: #f0aca2; }
      .moba-report-pages { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; padding-top: 9px; }
      .moba-report-pages button, .moba-report .moba-match-action-error button { display: inline-flex; align-items: center; gap: 4px; padding: 5px 7px; border: 1px solid #665437; color: #efc987; background: #1b202b; font: inherit; }
      @media (max-width: 600px) {
        .moba-match-dock { gap: 4px; padding: 4px; }
        .moba-settlement-ribbon { grid-template-columns: auto minmax(0, 1fr); column-gap: 7px; }
        .moba-settlement-commands { grid-column: 2; justify-self: end; }
        .moba-dock-hero { max-width: 32%; }
        .moba-dock-avatar { width: 28px; height: 28px; }
        .moba-dock-return span, .moba-match-trigger span { display: none; }
      }
      .moba-lobby {
        --ink: #f3e9d2; --muted: #b6b4bc; --gold: #e6bc70; --line: #564532;
        --blue: #9ed4ec; --paper: #121721; --deep: #0a0e17;
        flex: 1; min-width: 0; min-height: 0; height: 100%; overflow: auto;
        container-type: inline-size; color-scheme: dark; color: var(--ink); background: var(--deep);
      }
      .moba-lobby *, .moba-lobby *::before, .moba-lobby *::after { box-sizing: border-box; }
      .moba-lobby ::selection { color: #10131c; background: var(--gold); }
      .moba-lobby :focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
      .moba-lobby button, .moba-lobby select, .moba-lobby input { color: inherit; font: inherit; }
      .moba-lobby button { cursor: pointer; }
      .moba-lobby button:disabled { cursor: default; }
      .moba-inner { max-width: 1400px; margin: auto; padding: 21px clamp(14px, 3cqi, 45px) 24px; }
      .moba-header, .moba-heading { display: flex; align-items: center; gap: 13px; }
      .moba-header { justify-content: space-between; min-height: 53px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
      .moba-heading { color: var(--gold); }
      .moba-heading h1 { font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(26px, 4cqi, 41px); margin: 0; letter-spacing: .035em;
        font-weight: 700; line-height: 1.16; white-space: nowrap; }
      .moba-header-tools { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; align-items: end; min-width: 0; }
      .moba-icon-action { width: 33px; height: 33px; flex: 0 0 auto; display: grid; place-items: center; padding: 0; border: 1px solid var(--line); background: #151c28; color: var(--muted) !important; }
      .moba-icon-action:hover, .moba-icon-action[aria-pressed="true"] { color: var(--gold) !important; border-color: var(--gold); }
      .moba-saved { width: min(210px, 25cqi); min-width: 62px; display: grid; gap: 3px; font-size: 11px; color: var(--muted); }
      .moba-lobby select { width: 100%; min-width: 0; padding: 5px 7px; min-height: 31px; border: 1px solid var(--line); background: #151c28; border-radius: 3px; }
      .moba-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; gap: 15px; }
      .moba-grid > * { min-width: 0; }
      .moba-starter-entry { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center;
        gap: clamp(7px, 2cqi, 15px); width: 100%; margin-block-end: 15px; padding: 8px 11px;
        border: 1px solid #8a754d; background: linear-gradient(115deg, #1b2d34, #17202b 62%, #272315);
        text-align: start; }
      .moba-lighthouse-entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; margin-block-end: 15px; }
      .moba-lighthouse-entry .moba-starter-entry { margin: 0; }
      .moba-lighthouse-entry .moba-hero-trial-entry { grid-column: 1 / -1; grid-template-columns: auto minmax(0, 1fr) auto;
        min-height: 61px; border-color: #a38757; }
      .moba-hero-trial-entry > svg { color: var(--gold); }
      .moba-hero-trial-emblems { display: flex; gap: 3px; }
      .moba-hero-trial-emblems .moba-starter-hero { width: clamp(30px, 9cqi, 42px); }
      .moba-lighthouse-entry-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
      .moba-lighthouse-entry .moba-lighthouse-entry-button { align-self: stretch; border-color: #607d78; background: #192c33;
        max-inline-size: 12em; text-align: start; }
      .moba-lighthouse-entry-button svg { flex: none; }
      @container (max-width: 620px) {
        .moba-lighthouse-entry { grid-template-columns: minmax(0, 1fr); }
        .moba-lighthouse-entry-actions { display: flex; flex-wrap: wrap; }
      }
      @container (max-width: 390px) {
        .moba-lighthouse-entry .moba-starter-entry:not(.moba-hero-trial-entry) { grid-template-columns: auto minmax(0, 1fr); }
        .moba-lighthouse-entry .moba-starter-entry-action { display: none; }
      }
      .moba-starter-entry:hover:not(:disabled) { border-color: var(--gold); background: linear-gradient(115deg, #26414a, #1e2a37 62%, #332b19); }
      .moba-starter-entry:disabled { opacity: .6; }
      .moba-starter-symbol { display: grid; place-items: center; width: 39px; height: 39px;
        border: 1px solid #607d78; background: #12262b; color: #a5d9d1; }
      .moba-starter-entry-copy { display: grid; gap: 2px; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; }
      .moba-starter-entry-copy strong { color: var(--ink); font-size: 15px; }
      .moba-starter-entry-action { display: flex; align-items: center; gap: 5px; color: var(--gold); font-size: 12px; }
      .moba-starter-entry-action svg { flex: none; }
      .moba-draft { border: 1px solid var(--line); background: #111521; }
      .moba-stage { position: relative; min-height: 300px; height: clamp(288px, 35cqi, 480px); isolation: isolate; overflow: hidden; background: #131926; }
      .moba-splash { position: absolute; inset: 0 0 auto; width: 100%; height: auto; aspect-ratio: 1; background-repeat: no-repeat; animation: moba-reveal .37s ease-out both; }
      .moba-splash.moba-image { inset: 0; height: 100%; object-position: center top; }
      .moba-stage-shade { position: absolute; inset: 0; background: linear-gradient(0deg, #090d17 3%, #090d17d9 19%, transparent 62%); }
      .moba-role-filter { display: flex; flex-wrap: wrap; gap: 4px; }
      :is(.moba-lobby, .moba-match-dock, .moba-match, .moba-comparison-hero) {
        --role-general: #e8be7d; --role-scout: #79dfdf; --role-craft: #f6ae79; --role-orchestration: #bfb3ff;
        --role-guard: #f3cb81; --role-support: #a2dfae; --role-specialist: #d6b3d9;
      }
      .moba-role-filter button { padding: 4px 8px; min-height: 30px; border: 1px solid var(--line); background: #171d2a;
        color: var(--muted); font-size: 12px; }
      .moba-role-filter button[aria-pressed="true"] { border-color: var(--role-light, var(--gold)); background: #332b26; color: #ffe9c6; }
      :is(.moba-role-filter, .moba-stage, .moba-match-dock) [data-role="scout"] { --role-light: var(--role-scout); --role-wash: #60c8d23b; }
      :is(.moba-role-filter, .moba-stage, .moba-match-dock) [data-role="craft"] { --role-light: var(--role-craft); --role-wash: #e8894e40; }
      :is(.moba-role-filter, .moba-stage, .moba-match-dock) [data-role="orchestration"] { --role-light: var(--role-orchestration); --role-wash: #a192ed3d; }
      :is(.moba-role-filter, .moba-stage, .moba-match-dock) [data-role="guard"] { --role-light: var(--role-guard); --role-wash: #ddad6240; }
      :is(.moba-role-filter, .moba-stage, .moba-match-dock) [data-role="support"] { --role-light: var(--role-support); --role-wash: #72c29b3e; }
      :is(.moba-role-filter, .moba-stage, .moba-match-dock) [data-role="specialist"] { --role-light: var(--role-specialist); --role-wash: #b68bc13b; }
      .moba-stage .moba-hero-role, .moba-gallery-portrait .moba-hero-role { color: #f1d6a2; font-size: 12px; }
      .moba-stage-gear { position: absolute; top: 52px; inset-inline-start: 14px; z-index: 2;
        display: flex; flex-wrap: wrap; align-items: center; gap: 4px; width: min(154px, calc(100% - 28px)); }
      .moba-stage-gear button { display: grid; padding: 2px; background: #101625; border: 1px solid var(--role-light, var(--gold)); }
      .moba-stage-gear button:focus-visible { outline: 2px solid #fff1cd; outline-offset: 2px; }
      .moba-stage-gear .moba-item-art { width: 29px; }
      .moba-stage-gear > span { color: #ffe6b7; background: #101625; padding: 3px 5px; font-size: 11px; }
      .moba-outfit-trim { --outfit-width: 4px; position: absolute; inset: 0; pointer-events: none;
        opacity: var(--outfit-opacity, .9); }
      .moba-outfit-light { position: absolute; inset: 0; display: none;
        background: radial-gradient(ellipse at var(--outfit-light-x) var(--outfit-light-y),
          color-mix(in srgb, var(--outfit-first) 34%, transparent), transparent 68%),
          linear-gradient(var(--outfit-angle), transparent 36%, color-mix(in srgb, var(--outfit-last) 28%, transparent) 100%); }
      :is(.moba-stage, .moba-plan-hero, .moba-comparison-hero) .moba-outfit-light { display: block; }
      .moba-comparison-hero .moba-outfit-light { background:
        radial-gradient(ellipse at var(--outfit-light-x) var(--outfit-light-y),
          color-mix(in srgb, var(--outfit-accent) 29%, transparent), transparent 72%),
        linear-gradient(var(--outfit-angle), transparent 35%, color-mix(in srgb, var(--outfit-last) 18%, transparent)); }
      .moba-outfit-edge { position: absolute; inset: 0; background: var(--outfit-first);
        clip-path: polygon(0 0, var(--outfit-inset) 0, var(--outfit-cut) var(--outfit-width), var(--outfit-width) var(--outfit-width),
          var(--outfit-width) var(--outfit-cut), 0 var(--outfit-inset)); }
      .moba-outfit-edge:last-child { transform: rotate(180deg); background: var(--outfit-last); }
      .moba-stage-effect { position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(var(--outfit-angle, 112deg), var(--role-wash, #ddad6233) var(--outfit-cut, 12%), transparent 72%); }
      .moba-stage-effect { opacity: 0; animation: moba-equip-reveal .48s cubic-bezier(.16, 1, .3, 1); }
      .moba-stage-effect[data-role="scout"] { animation-name: moba-equip-scan; }
      .moba-stage-effect[data-role="orchestration"] { animation-name: moba-equip-weave; }
      .moba-stage-effect[data-role="craft"], .moba-stage-effect[data-role="support"] { animation-name: moba-equip-rise; }
      @keyframes moba-equip-reveal { from { opacity: 1; clip-path: inset(0 0 92%); } to { opacity: 0; clip-path: inset(0); } }
      @keyframes moba-equip-scan { from { opacity: 1; clip-path: inset(0 100% 0 0); } to { opacity: 0; clip-path: inset(0); } }
      @keyframes moba-equip-weave { from { opacity: 1; clip-path: inset(0 34% 0 34%); } to { opacity: 0; clip-path: inset(0); } }
      @keyframes moba-equip-rise { from { opacity: 1; clip-path: inset(84% 0 0); } to { opacity: 0; clip-path: inset(0); } }
      @media (prefers-reduced-motion: reduce) { .moba-stage-effect { animation: none !important; } }
      .moba-portrait-controls { position: absolute; top: 10px; inset-inline: 10px; z-index: 1; display: flex; flex-wrap: wrap; gap: 5px; justify-content: end; }
      .moba-portrait-action { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 6px 9px; background: #111726e8; border: 1px solid #92754f; color: #f3e2bf !important; font-size: 12px !important; }
      .moba-portrait-action:hover { border-color: var(--gold); }
      .moba-hero-title { position: absolute; inset: auto 17px 16px; }
      .moba-hero-title > span { color: var(--gold); font-size: 12px; letter-spacing: .18em; }
      .moba-hero-title h2 { margin: 2px 0 5px; font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(26px, 4.5cqi, 46px); line-height: 1.14; text-wrap: balance; overflow-wrap: anywhere; }
      .moba-hero-title p { color: #e0dbce; font-size: 13px; line-height: 1.55; margin: 0; max-width: 44ch; }
      .moba-mastery-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 5px; margin: 2px 0 5px; border: 1px solid #886846; background: #1a1b25; color: #f3c6a4; font-size: 11px; }
      .moba-flag-insignia { display: inline-flex; width: fit-content; max-width: 100%; align-items: center; gap: 4px; padding: 3px 6px; border: 1px solid #916d3c; background: #251e19; color: #f5d497; font-size: 12px; letter-spacing: normal; }
      .moba-flag-insignia svg { flex: none; }
      .moba-flag-insignia > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-hero-title > .moba-flag-insignia { max-width: min(100%, 30ch); margin: 2px 4px 5px 0; vertical-align: middle; letter-spacing: normal; }
      .moba-signature { display: inline-flex; align-items: center; gap: 4px; background: #251e19; border: 1px solid #916d3c; }
      .moba-hero-title > .moba-signature { max-width: min(100%, 30ch); padding: 1px 5px 1px 1px; margin: 2px 4px 5px 0; color: #f5d497; vertical-align: middle; letter-spacing: normal; }
      .moba-signature .moba-item-art { width: 17px; flex: none; }
      .moba-signature > span:last-child:not(.moba-item-art) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-signature-compact .moba-item-art { width: 13px; }
      .moba-signature-compact .moba-art-seal { display: none; }
      .moba-roster-medal { position: absolute; top: 3px; right: 3px; display: grid; place-items: center; color: #f3c6a4; background: #171923; }
      .moba-mastery-badge[data-level="5"], .moba-roster-medal[data-level="5"] { color: #9ad8ec; }
      .moba-mastery-badge[data-level="6"], .moba-roster-medal[data-level="6"] { color: #f7d489; }
      .moba-roster { min-width: 0; padding: 5px 11px 11px; margin: 2px 0 0; border: 0; }
      .moba-roster-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
      .moba-roster-heading h3, .moba-build h2, .moba-shop h2 { margin: 0; color: var(--gold); font-size: 15px; font-weight: 680; }
      .moba-roster-open { display: inline-flex; align-items: center; gap: 5px; min-height: 36px; padding: 5px 8px; border: 1px solid var(--line); background: #1b202d; color: var(--ink); font-size: 12px !important; }
      .moba-roster-open:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
      .moba-portraits { display: flex; gap: 6px; min-width: 0; margin: 0; border: 0; overflow-x: auto; padding: 3px; }
      .moba-hero { position: relative; flex: 0 0 clamp(49px, 6.3cqi, 78px); display: grid; align-content: start; gap: 3px; border: 1px solid #534d48; padding: 2px; font-size: 11px; color: #d3cabe; text-align: center; cursor: pointer; }
      .moba-hero input { position: absolute; opacity: 0; width: 1px; height: 1px; }
      .moba-hero:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 1px; }
      .moba-hero[data-picked="true"] { border-color: var(--gold); background: #503b24; color: #fff0c8; }
      .moba-hero[data-broken="true"] { cursor: default; opacity: .55; }
      .moba-hero span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-avatar { display: block; width: 100%; aspect-ratio: 1; background-repeat: no-repeat; }
      .moba-gallery { width: min(960px, calc(100% - 32px)); max-height: min(740px, calc(100dvh - 32px)); padding: 0; overflow: hidden; color: var(--ink); background: #111521; border: 1px solid #967749; box-shadow: 0 18px 64px #000b; }
      .moba-gallery[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
      .moba-gallery::backdrop { background: #03050bc7; }
      .moba-gallery-heading, .moba-gallery-footer { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
      .moba-gallery-heading { justify-content: space-between; border-bottom: 1px solid var(--line); }
      .moba-gallery-heading h2 { margin: 0; color: var(--gold); font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(23px, 3.5vw, 34px); line-height: 1.15; }
      .moba-gallery-body { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr); min-height: 0; overflow: auto; scrollbar-color: #69573e #111521; }
      .moba-gallery-roster { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; padding: 16px; }
      .moba-gallery-roster input[type="search"] { min-height: 38px; font-size: 13px; }
      .moba-gallery-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-content: start; gap: 8px; min-width: 0; margin: 0 -3px; padding: 3px; border: 0; overflow: auto; scrollbar-color: #69573e #111521; }
      .moba-gallery-grid .moba-hero { min-width: 0; gap: 4px; padding: 3px 3px 5px; }
      .moba-gallery-grid .moba-hero:hover { border-color: var(--gold); }
      .moba-gallery-grid .moba-hero .moba-gallery-card-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; line-height: 1.3; white-space: normal; overflow-wrap: anywhere; }
      .moba-gallery-grid small { color: #f4d5a1; font-size: 10px; }
      .moba-gallery-grid .moba-gallery-unavailable { color: #ffcbcf; }
      .moba-gallery-preview { min-width: 0; min-height: 0; overflow: auto; border-inline-start: 1px solid var(--line); background: #171c27; scrollbar-color: #69573e #171c27; }
      .moba-gallery-portrait { position: relative; isolation: isolate; height: clamp(175px, 30dvh, 290px); overflow: hidden; background: var(--deep); }
      .moba-gallery-portrait .moba-hero-title { inset: auto 16px 12px; }
      .moba-gallery-portrait h3 { margin: 0; font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(23px, 3.5vw, 38px); line-height: 1.15; overflow-wrap: anywhere; }
      .moba-gallery-facts { display: grid; align-content: start; gap: 9px; padding: 12px 16px 16px; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
      .moba-gallery-facts code { color: var(--blue); font-size: 12px; }
      .moba-gallery-facts p { margin: 0; color: var(--muted); }
      .moba-gallery-facts .moba-alert { color: #ffdade; }
      .moba-gallery-comparison { display: grid; gap: 7px; border-block: 1px solid var(--line); padding-block: 8px; }
      .moba-gallery-comparison h4 { margin: 0; color: var(--gold); font-size: 14px; }
      .moba-gallery-comparison > label { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 7px; align-items: center; color: var(--muted); font-size: 12px; }
      .moba-gallery-compare-names { display: flex; align-items: center; gap: 7px; }
      .moba-gallery-compare-names svg { flex: none; color: var(--gold); }
      :is(.moba-gallery-comparison, .moba-fitting-dialog) .moba-comparison-switcher { display: flex; }
      :is(.moba-gallery-comparison, .moba-fitting-dialog) .moba-deltas { grid-template-columns: minmax(0, 1fr); }
      :is(.moba-gallery-comparison, .moba-fitting-dialog) :is(.moba-delta[data-active="false"], .moba-delta h3) { display: none; }
      .moba-gallery-comparison .moba-delta-list { max-height: 216px; overflow: auto; scrollbar-color: #69573e #171c27; }
      .moba-gallery-gear { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 7px 12px; margin: 0; padding-block: 9px; border-block: 1px solid var(--line); }
      .moba-gallery-gear dt { padding-block: 3px; color: var(--gold); }
      .moba-gallery-gear dd { margin: 0; }
      .moba-gallery-gear ul { display: flex; flex-wrap: wrap; gap: 5px 10px; margin: 0; padding: 0; list-style: none; }
      .moba-gallery-gear li { display: flex; align-items: center; gap: 5px; min-width: 0; }
      .moba-gallery-gear .moba-item-art { width: 24px; flex: none; border: 1px solid var(--line); }
      .moba-gallery-kit summary { color: var(--gold); cursor: pointer; }
      .moba-gallery-kit p { margin-top: 6px; }
      .moba-gallery-kit .moba-decisions li { grid-template-columns: minmax(0, 8em) minmax(0, 1fr); }
      .moba-field-list { display: grid; margin: 5px 0 0; padding: 0; list-style: none; }
      .moba-field-list > li { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 8px; padding: 7px 0; border-block-start: 1px solid var(--line); }
      .moba-field-list .moba-item-art { width: 36px; border: 1px solid var(--line); }
      .moba-field-detail strong, .moba-field-detail small { display: block; overflow-wrap: anywhere; }
      .moba-field-detail small, .moba-field-sources summary { color: var(--muted); font-size: 11px; }
      .moba-field-actions { display: flex; flex-wrap: wrap; gap: 2px 8px; }
      .moba-field-actions .moba-text { padding-inline: 0; min-height: 24px; }
      .moba-field-current { display: flex; flex-wrap: wrap; align-items: center; gap: 0 8px; }
      .moba-field-current > span { overflow-wrap: anywhere; color: var(--gold); }
      .moba-field-current .moba-text { padding-inline: 0; }
      .moba-field-actions .moba-signature-pick, .moba-field-actions .moba-field-displayed { color: var(--gold); }
      .moba-field-displayed { align-self: center; }
      .moba-field-all { padding-inline: 0; }
      .moba-hero-round-list, .moba-hero-round-gear { list-style: none; margin: 5px 0 0; padding: 0; }
      .moba-hero-round-list > li { padding: 8px 0; border-block-start: 1px solid var(--line); }
      .moba-hero-round-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 3px 8px; }
      .moba-hero-round-heading span { color: var(--gold); font-size: 11px; font-variant-numeric: tabular-nums; }
      .moba-hero-round-list small { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
      .moba-hero-round-items { margin-top: 5px; }
      .moba-hero-round-items summary { font-size: 11px; }
      .moba-hero-round-icons { display: inline-flex; gap: 3px; margin-inline: 4px 6px; vertical-align: middle; }
      .moba-hero-round-items .moba-item-art { width: 25px; border: 1px solid var(--line); }
      .moba-hero-round-gear li { display: grid; grid-template-columns: 25px minmax(0, 1fr); gap: 5px; margin-block: 4px; overflow-wrap: anywhere; }
      .moba-hero-round-gear strong, .moba-hero-round-gear small { display: block; }
      .moba-hero-rounds .moba-match-body { min-width: 0; margin-top: 6px; padding: 9px 0; }
      .moba-gallery-heading-actions { display: flex; align-items: center; gap: 12px; }
      .moba-legacy-preview { display: grid; align-content: start; gap: 9px; padding: 14px 16px; overflow-wrap: anywhere; font-size: 13px; }
      .moba-legacy-preview h3, .moba-legacy-preview p { margin: 0; }
      .moba-legacy-preview code { color: var(--blue); font-size: 12px; }
      .moba-legacy-modules { display: grid; gap: 4px; margin: 8px 0 0; padding-inline-start: 18px; color: var(--muted); }
      .moba-legacy-error { white-space: pre-line; }
      .moba-legacy-review { justify-self: start; }
      .moba-legacy-replacements, .moba-legacy-restored { border: 1px solid var(--line); padding: 9px 11px; }
      .moba-legacy-replacements strong, .moba-legacy-restored strong { color: var(--gold); }
      .moba-legacy-replacements li span { display: block; }
      .moba-legacy-replacements li span + span { color: var(--blue); }
      .moba-legacy-diff { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 5px 12px; margin: 0; }
      .moba-legacy-diff dt { color: var(--gold); }
      .moba-legacy-diff dd { margin: 0; }
      .moba-legacy-diff .moba-legacy-modules { margin: 0; }
      .moba-hero-title .moba-hero-compatibility { color: #ffd6ae; }
      .moba-compatibility-gear { display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: start; gap: 8px; margin-top: 8px; }
      .moba-compatibility-gear .moba-item-art { width: 36px; }
      .moba-compatibility { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; overflow-wrap: anywhere; }
      .moba-compatibility li { display: grid; gap: 3px; padding: 6px 8px; border: 1px solid var(--line); color: #f6d5b7; font-size: 12px; }
      .moba-compatibility small { color: var(--muted); font-size: 11px; }
      .moba-gallery-footer { justify-content: flex-end; border-top: 1px solid var(--line); background: #111521; }
      @media (max-width: 650px) {
        .moba-gallery { width: calc(100% - 16px); max-height: calc(100dvh - 16px); }
        .moba-gallery-body { display: block; }
        .moba-gallery-roster { padding: 12px; gap: 8px; }
        .moba-gallery-grid { max-height: max(100px, 23dvh); gap: 6px; }
        .moba-gallery-preview { border-inline-start: 0; border-top: 1px solid var(--line); }
        .moba-gallery-portrait { height: clamp(142px, 22dvh, 215px); }
        .moba-gallery-heading, .moba-gallery-footer { padding: 9px 12px; }
      }
      @media (max-width: 330px) {
        .moba-gallery-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      .moba-plans { width: min(816px, calc(100% - 24px)); }
      .moba-plans[data-editing="true"] { width: min(474px, calc(100% - 24px)); }
      .moba-plans[data-sharing="true"] { width: min(602px, calc(100% - 24px)); }
      .moba-plan-library { display: grid; grid-template-columns: minmax(208px, .72fr) minmax(0, 1fr); min-height: 0; overflow: auto; scrollbar-color: #69573e #111521; }
      .moba-plan-roster { min-height: 0; min-width: 0; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
      .moba-plan-roster input[type="search"] { min-height: 38px; }
      .moba-plan-list { display: grid; align-content: start; gap: 4px; min-width: 0; padding: 3px; margin: 0 -3px; border: 0; overflow: auto; scrollbar-color: #69573e #111521; }
      .moba-plan-option { position: relative; min-width: 0; min-height: 55px; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px; border: 1px solid #423a3a; background: #151a27; cursor: pointer; }
      .moba-plan-option:hover, .moba-plan-option[data-picked="true"] { border-color: var(--gold); background: #392d23; }
      .moba-plan-option:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 1px; }
      .moba-plan-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
      .moba-plan-option strong, .moba-plan-option small { display: block; overflow-wrap: anywhere; }
      .moba-plan-option strong { font-size: 13px; line-height: 1.3; }
      .moba-plan-option small { margin-top: 2px; color: var(--muted); font-size: 11px; }
      .moba-plan-option .moba-gallery-unavailable { color: #ffcbcf; }
      .moba-plan-preview { min-width: 0; min-height: 0; overflow: auto; background: #171c27; border-inline-start: 1px solid var(--line); scrollbar-color: #69573e #171c27; }
      .moba-plan-hero { position: relative; height: clamp(148px, 24dvh, 218px); isolation: isolate; overflow: hidden; background: var(--deep); }
      .moba-plan-hero h3 { margin: 0 0 4px; color: var(--ink); font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(23px, 4vw, 38px); line-height: 1.1; overflow-wrap: anywhere; }
      .moba-plan-hero .moba-hero-title { inset: auto 14px 11px; }
      .moba-plan-details, .moba-plan-fields { display: grid; gap: 10px; padding: 14px; min-width: 0; }
      .moba-plan-note { margin: 0; color: #e0dbce; font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
      .moba-plan-gear { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 7px; }
      .moba-plan-gear li { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 4px 7px 4px 4px; background: #0e141f; border: 1px solid var(--line); font-size: 12px; overflow-wrap: anywhere; }
      .moba-plan-gear .moba-item-art { flex: none; width: 28px; }
      .moba-plan-gear small { display: block; color: var(--blue); font-size: 11px; }
      .moba-plan-manage { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; padding-top: 4px; border-top: 1px solid var(--line); }
      .moba-plan-manage button { min-height: 36px; }
      .moba-plan-form { min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
      .moba-plan-fields { overflow: auto; align-content: start; }
      .moba-plan-save-preview { display: grid; gap: 6px; margin-bottom: 2px; }
      .moba-plan-save-preview strong { font-size: 13px; color: var(--gold); overflow-wrap: anywhere; }
      .moba-plan-fields label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
      .moba-plan-fields input, .moba-plan-fields textarea, .moba-plan-task select { width: 100%; min-width: 0; min-height: 40px; padding: 8px; border: 1px solid #515666; background: var(--deep); color: var(--ink); font: inherit; font-size: 14px; }
      .moba-plan-fields textarea { resize: vertical; }
      .moba-task-plan-choices legend { padding: 0 0 5px; color: var(--gold); font-size: 13px; }
      .moba-task-plan-choices .moba-plan-option { grid-template-columns: 38px minmax(0, 1fr); gap: 8px; }
      .moba-task-plan-choices input[type="radio"] { inset: 0; width: 1px; min-height: 0; height: 1px; padding: 0; }
      .moba-task-plan-choices .moba-avatar { align-self: start; }
      .moba-task-plan-choices .moba-plan-note { font-size: 12px; }
      .moba-task-plan-choices:disabled .moba-plan-option { cursor: default; }
      .moba-plan-task-start { justify-self: start; max-width: 100%; white-space: normal; }
      .moba-plan-launches { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; }
      .moba-plan-task h3 { margin: 0; color: var(--gold); font-size: 15px; }
      .moba-plan-task dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 9px; margin: 0; font-size: 12px; }
      .moba-plan-task dt { color: var(--muted); }
      .moba-plan-task dd { margin: 0; overflow-wrap: anywhere; }
      .moba-plan-task .moba-lighthouse-note { margin: 0; }
      .moba-stock-trial-task .moba-plan-task,
      .moba-stock-trial-task .moba-plan-fields { grid-template-columns: minmax(0, 1fr); }
      .moba-stock-trial-task .moba-plan-fields :is(input, select, textarea) { box-sizing: border-box; }
      .moba-stock-trial-task .moba-gallery-footer { flex-wrap: wrap; }
      .moba-stock-trial-task .moba-gallery-footer button { white-space: normal; }
      .moba-plan-fields .moba-share-code { font: 12px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
      .moba-share-fields > h3, .moba-share-review > h3, .moba-share-section h3 { margin: 0; overflow-wrap: anywhere; }
      .moba-share-fields > h3, .moba-share-review > h3 { color: var(--gold); font-size: 17px; }
      .moba-share-section h3 { padding-block: 4px; font-size: 13px; color: var(--gold); }
      .moba-share-review { display: grid; align-items: start; gap: 8px; min-width: 0; }
      .moba-share-host { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr);
        gap: 4px 8px; margin: 0; padding: 7px 8px; border: 1px solid var(--line); background: #161d28;
        color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
      .moba-share-host dd { margin: 0; color: var(--ink); }
      .moba-share-rows { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      .moba-share-rows li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start;
        gap: 6px; padding: 6px 8px; border: 1px solid var(--line); background: #161d28; overflow-wrap: anywhere; }
      .moba-share-rows strong { display: block; font-size: 13px; }
      .moba-share-rows span, .moba-share-rows p { display: block; margin: 2px 0 0; color: var(--muted); font-size: 12px; }
      .moba-share-rows small { max-width: 105px; color: #dfc38d; font-size: 11px; text-align: end; }
      .moba-share-rows [data-state="ready"] small { color: #b7daba; }
      .moba-share-rows [data-state="missing"] small, .moba-share-rows [data-state="unavailable"] small { color: #ffbcc4; }
      .moba-share-adaptation { display: grid; gap: 7px; align-items: start; }
      .moba-share-adaptation h3 { margin: 0; color: var(--gold); font-size: 15px; }
      .moba-share-adaptation > button { justify-self: start; }
      .moba-share-exact, .moba-share-adaptation details, .moba-share-change {
        min-width: 0; padding: 7px 8px; border: 1px solid var(--line); background: #161d28; overflow-wrap: anywhere; }
      .moba-share-exact > summary, .moba-share-adaptation summary { min-height: 30px; padding-block: 5px;
        font-size: 13px; cursor: pointer; }
      .moba-share-adaptation summary span { margin-inline-start: 6px; color: var(--gold); font-size: 12px; }
      .moba-share-adaptation p, .moba-share-change p { margin: 2px 0; color: var(--muted); font-size: 12px; line-height: 1.4; }
      .moba-share-original { padding-block: 7px; border-top: 1px solid var(--line); font-size: 12px; }
      .moba-share-options { display: grid; gap: 6px; min-width: 0; }
      .moba-share-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 6px; }
      .moba-share-search button { min-height: 40px; }
      .moba-share-option-list { display: grid; gap: 4px; min-width: 0; padding: 0; border: 0; margin: 0; }
      .moba-share-option-list legend { margin-bottom: 5px; color: var(--gold); font-size: 12px; }
      .moba-share-option-list .moba-starter-route { min-height: 40px; }
      .moba-adapted-review { padding-top: 8px; border-top: 1px solid var(--line); }
      .moba-share-change > strong { color: var(--gold); font-size: 13px; }
      .moba-flag-collection { width: min(820px, calc(100% - 24px)); }
      .moba-flag-library { min-height: 0; overflow: auto; scrollbar-color: #69573e #111521; }
      .moba-flag-library[data-preview="true"] { display: grid; grid-template-columns: minmax(196px, .62fr) minmax(0, 1fr); }
      .moba-flag-roster { display: flex; flex-direction: column; min-width: 0; min-height: 0; gap: 8px; padding: 12px; }
      .moba-flag-roster .moba-search input { min-height: 36px; }
      .moba-flag-roster .moba-plan-option svg { color: var(--gold); }
      .moba-flag-empty { padding: 20px 12px; color: var(--gold); }
      .moba-flag-empty h3 { margin: 5px 0; font-size: 18px; }
      .moba-flag-empty p { margin: 0; color: var(--muted); font-size: 13px; }
      .moba-flag-preview { min-width: 0; border-inline-start: 1px solid var(--line); background: #191c26; }
      .moba-flag-splash { position: relative; isolation: isolate; height: clamp(176px, 32dvh, 292px); overflow: hidden; background: #0c121e; }
      .moba-flag-splash h3 { margin: 0 0 3px; color: var(--ink); font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(24px, 3.7vw, 38px); line-height: 1.13; overflow-wrap: anywhere; }
      .moba-flag-seal { position: absolute; inset: 0 14px auto auto; display: grid; place-items: center; width: 46px; height: 59px; padding-bottom: 9px; color: #ffe1a4; background: #70512e; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%); }
      .moba-flag-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0; margin: 0; border-block: 1px solid var(--line); list-style: none; }
      .moba-flag-pair li { display: flex; align-items: center; gap: 8px; padding: 10px; overflow-wrap: anywhere; }
      .moba-flag-pair li + li { border-inline-start: 1px solid var(--line); }
      .moba-flag-pair .moba-item-art { flex: none; width: 40px; }
      .moba-flag-pair strong { min-width: 0; font-size: 13px; }
      .moba-flag-pair small { display: block; color: var(--muted); font-size: 11px; }
      .moba-flag-record { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; padding: 9px 12px; color: var(--muted); font-size: 12px; }
      .moba-flag-record strong { color: #afdabd; }
      .moba-flag-footer { justify-content: space-between; flex-wrap: wrap; }
      .moba-flag-footer .moba-roster-open { min-height: 44px; }
      .moba-flag-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; margin-inline-start: auto; }
      .moba-flag-actions button:disabled { opacity: .55; }
      .moba-flag-loadout { display: grid; gap: 4px; padding: 9px 12px; border-block-end: 1px solid var(--line); color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
      .moba-flag-loadout p { margin: 0; }
      .moba-flag-upgrade { display: grid; gap: 6px; padding: 9px 12px; border-block-end: 1px solid var(--line); }
      .moba-flag-upgrade h4 { margin: 0; color: var(--gold); font-size: 13px; }
      .moba-flag-upgrade h4:focus { outline: 2px solid var(--blue); outline-offset: 2px; }
      .moba-flag-pair .moba-flag-slot[data-ready="true"] { color: #afd9bd; }
      .moba-flag-pair .moba-flag-slot[data-ready="false"] { color: #efc3a4; }
      .moba-flag-preview > .moba-teamwork-roles { margin: 10px 12px; }
      .moba-flag-bearer { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; color: var(--muted); }
      .moba-flag-bearer select { min-height: 36px; max-width: 100%; padding: 4px 7px; border: 1px solid var(--line); background: #0f1520; color: #f3e9d2; font: inherit; }
      .moba-journal-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
      .moba-journal-filters button { min-height: 36px; padding: 4px 5px; border: 1px solid var(--line); color: var(--muted); background: #151a27; font: inherit; font-size: 12px; cursor: pointer; }
      .moba-journal-filters button:hover, .moba-journal-filters button[aria-pressed="true"] { border-color: var(--gold); background: #392d23; color: #ffe1a4; }
      .moba-journal-filters span { font-variant-numeric: tabular-nums; }
      .moba-journal .moba-plan-list { max-height: max(132px, 42dvh); }
      .moba-journal-detail .moba-flag-splash { height: clamp(156px, 25dvh, 232px); }
      .moba-journal-state { border-block-end: 1px solid var(--line); }
      .moba-journal-state strong { color: var(--gold); }
      .moba-journal-action { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 7px; padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--gold); font-size: 13px; }
      .moba-journal-action span { color: var(--muted); font-size: 12px; }
      .moba-journal-detail .moba-relay-legs, .moba-journal-detail .moba-relay-target, .moba-journal-gear { margin: 8px 12px 0; }
      .moba-journal-awards { margin: 0; padding: 0 12px; list-style: none; }
      .moba-journal-awards li { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; overflow-wrap: anywhere; }
      .moba-journal-awards .moba-item-art { width: 36px; }
      .moba-journal-awards li > strong { color: var(--gold); font-variant-numeric: tabular-nums; }
      .moba-journal-awards small { display: block; color: var(--muted); }
      .moba-journal-footer { justify-content: flex-end; flex-wrap: wrap; }
      .moba-journal-footer .moba-flag-insignia { margin-inline-end: auto; }
      .moba-plans .moba-gallery-footer { flex-wrap: wrap; }
      .moba-plans .moba-gallery-footer .moba-roster-open { min-height: 44px; }
      .moba-plans .moba-gallery-footer .moba-roster-open:disabled { opacity: .55; }
      @media (max-width: 580px) {
        .moba-plan-library { display: block; }
        .moba-plan-roster, .moba-plan-details, .moba-plan-fields { padding: 11px; }
        .moba-plan-list { max-height: max(106px, 22dvh); }
        .moba-plan-preview { border-inline-start: 0; border-top: 1px solid var(--line); }
        .moba-flag-library[data-preview="true"] { display: block; }
        .moba-flag-preview { border-inline-start: 0; border-top: 1px solid var(--line); }
        .moba-flag-splash { height: clamp(160px, 28dvh, 232px); }
        .moba-journal .moba-plan-list { max-height: max(106px, 19dvh); }
        .moba-journal-detail .moba-flag-splash { height: clamp(144px, 21dvh, 192px); }
      }
      .moba-shop { min-height: 360px; border: 1px solid var(--line); background: #121721; padding: 12px; }
      .moba-shop-title { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin-bottom: 7px; }
      .moba-shop-title h2 { flex-shrink: 0; white-space: nowrap; }
      .moba-shop-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; }
      .moba-text { padding: 4px; border: 0; color: var(--blue) !important; background: transparent; font-size: 12px !important; text-align: right; }
      .moba-text:hover { text-decoration: underline; text-underline-offset: 3px; }
      .moba-controls { display: grid; gap: 7px; margin-bottom: 9px; }
      .moba-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
      .moba-tabs[data-modules="true"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .moba-tabs button { border: 1px solid #3b404c; background: #1a202c; color: var(--muted); padding: 4px 3px; min-height: 31px; font-size: 12px; border-radius: 2px; }
      .moba-tabs button[aria-pressed="true"] { color: var(--gold); border-color: #9e794a; background: #352c24; }
      .moba-search { display: flex; align-items: center; gap: 6px; border: 1px solid #424a5a; color: var(--muted); padding: 0 7px; background: var(--deep); }
      .moba-search input { border: 0; min-width: 0; width: 100%; min-height: 30px; padding: 3px; color: var(--ink); font-size: 12px; background: transparent; }
      .moba-search input::placeholder { color: #a0a4b1; }
      .moba-shop-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
      .moba-item { display: grid; justify-items: center; align-content: start; gap: 3px; min-width: 0; border: 1px solid #4b4b54; background: #10141f; padding: 4px 2px; }
      .moba-item:hover, .moba-item[aria-pressed="true"] { border-color: var(--gold); background: #2b251f; }
      .moba-item[data-equipped="true"] { border-color: var(--blue); }
      .moba-item[data-removed="true"] .moba-item-art { filter: grayscale(1); opacity: .65; }
      .moba-item[data-removed="true"] .moba-item-name { text-decoration: line-through; }
      .moba-item[data-locked="true"] .moba-item-art { filter: saturate(.5); opacity: .72; }
      .moba-item-art { display: block; width: 46px; aspect-ratio: 1; background-repeat: no-repeat; }
      .moba-item-name { display: block; width: 100%; padding-inline: 2px; color: #e8decc; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .moba-pager { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 5px; color: var(--muted); font-size: 11px; }
      .moba-pager button { color: var(--blue); background: transparent; border: 0; padding: 3px 5px; }
      .moba-pager button:disabled { color: #777e8d; }
      .moba-detail { margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
      .moba-detail-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; }
      .moba-detail-head .moba-item-art { width: 38px; border: 1px solid #634d32; }
      .moba-detail h3 { font-size: 15px; margin: 0 0 2px; line-height: 1.3; }
      .moba-detail-head > div > span { font-size: 11px; color: var(--gold); }
      .moba-detail p { color: #ddd4c4; font-size: 12px; margin: 5px 0; line-height: 1.5; max-height: 5em; overflow: auto; }
      .moba-detail .moba-condition { color: var(--muted); }
      .moba-replacement { margin: 8px 0; padding: 4px 8px; border-inline-start: 2px solid var(--gold); background: #2a241e; }
      .moba-tool-source { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px; margin: 8px 0; color: var(--gold); font-size: 12px; }
      .moba-tool-source select { width: 100%; min-height: 32px; padding: 4px 7px; color: var(--ink); background: var(--deep); border: 1px solid #6c5a43; }
      .moba-detail-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
      .moba-equipment-links { margin-top: 8px; border-block-start: 1px solid var(--line); padding-top: 6px; }
      .moba-equipment-links summary { color: var(--gold); cursor: pointer; }
      .moba-equipment-links .moba-field-list > li { grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; }
      .moba-equipment-links [data-active="true"] small { color: var(--gold); }
      .moba-linked-source { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; padding: 5px 7px; border: 1px solid var(--line); overflow-wrap: anywhere; }
      .moba-linked-source small { color: var(--muted); }
      .moba-trial-link { color: var(--gold) !important; }
      .moba-pairings { margin-top: 9px; padding-top: 7px; border-block-start: 1px solid var(--line); }
      .moba-pairings > summary { color: var(--gold); cursor: pointer; }
      .moba-discovery-actions { display: flex; flex-wrap: wrap; gap: 3px 10px; }
      .moba-discovery-actions button { min-height: 28px; }
      .moba-field-actions .moba-pairing-preview-link { color: var(--gold); }
      .moba-pairings-list { display: grid; list-style: none; padding: 0; margin: 5px 0 0; }
      .moba-pairings-list > li { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 8px; padding: 6px 0; border-block-start: 1px solid var(--line); }
      .moba-pairing-portrait { display: block; width: 38px; aspect-ratio: 1; border: 1px solid #634d32; background-repeat: no-repeat; }
      .moba-pairing-facts strong, .moba-pairing-facts small { display: block; }
      .moba-pairing-facts small { color: var(--muted); font-size: 11px; }
      .moba-equip { display: inline-flex; align-items: center; justify-content: center; gap: 3px; min-height: 31px; border: 1px solid #a47d42; padding: 4px 8px; background: #3d2d20; color: #ffe0a4 !important; font-size: 12px !important; }
      .moba-equip:hover { background: #594025; }
      .moba-equip:disabled { opacity: .55; }
      .moba-market-toolbar, .moba-market-actions { display: flex; align-items: center; gap: 7px; }
      .moba-market-toolbar:not(:empty), .moba-market-source { margin-bottom: 7px; }
      .moba-market-toolbar button { flex: none; }
      .moba-market-toolbar select { font-size: 12px; }
      .moba-market-actions { justify-content: flex-end; }
      .moba-market-source { padding: 8px; border: 1px solid var(--line); background: #191d27; }
      .moba-market-source label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
      .moba-market-source input { width: 100%; min-width: 0; padding: 6px; border: 1px solid #424a5a; background: var(--deep); font-size: 12px; }
      .moba-market-source .moba-market-actions { margin-top: 6px; }
      .moba-market-grid { margin-top: 7px; }
      .moba-market-version { display: flex; align-items: center; gap: 7px; max-width: 260px; margin-top: 6px; white-space: nowrap; font-size: 12px; color: var(--muted); }
      .moba-market-version select { min-width: 0; }
      .moba-market-requirements span { display: block; overflow-wrap: anywhere; }
      .moba-market-dialog { color-scheme: dark; width: min(440px, calc(100vw - 28px)); max-height: calc(100dvh - 32px); padding: 18px; overflow: auto; color: var(--ink); background: #171c27; border: 1px solid #9e794a; border-radius: 5px; box-shadow: 0 12px 44px #0009; }
      .moba-market-dialog::backdrop { background: #03050bb3; }
      .moba-market-dialog h2 { color: var(--gold); }
      .moba-market-dialog dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 10px; font-size: 12px; }
      .moba-market-dialog dt { color: var(--muted); }
      .moba-market-dialog dd { margin: 0; overflow-wrap: anywhere; }
      .moba-market-dialog p { font-size: 12px; line-height: 1.5; }
      .moba-appearance-name { overflow-wrap: anywhere; }
      .moba-art-preview { display: grid; place-items: center; min-height: 100px; padding: 10px; background: var(--deep); }
      .moba-art-preview .moba-art-preview-image { display: block; width: min(88px, 100%); aspect-ratio: 1; background-repeat: no-repeat; border: 1px solid #856943; }
      .moba-art-preview[data-hero="true"] .moba-art-preview-image { width: min(185px, 100%); }
      .moba-direct-form input[type="file"]::file-selector-button { margin-right: 8px; padding: 6px 9px; border: 1px solid #745f40; background: #1b2331; color: var(--ink); cursor: pointer; }
      .moba-market-dialog .moba-market-actions { margin-top: 12px; }
      .moba-starter-dialog { width: min(535px, calc(100vw - 28px)); }
      .moba-lighthouse-comparison { --ink: #f3e9d2; --muted: #b6b4bc; --gold: #e6bc70; --line: #564532;
        --blue: #9ed4ec; --deep: #0a0e17; width: min(700px, calc(100vw - 28px)); }
      .moba-lighthouse-comparison h2 { margin: 0; font-size: 22px; }
      .moba-rematch-editor h3 { margin: 8px 0 4px; color: var(--gold); font-size: 15px; }
      .moba-rematch-fields { display: grid; gap: 7px; min-width: 0; margin: 8px 0; padding: 8px; border: 1px solid var(--line); }
      .moba-rematch-fields legend { color: var(--gold); font-size: 13px; }
      .moba-rematch-fields label { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: 12px; }
      .moba-rematch-fields .moba-search { display: flex; }
      .moba-rematch-fields select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 35px; padding: 5px 7px;
        border: 1px solid #4b655f; background: #111b24; color: var(--ink); font: inherit; }
      .moba-rematch-fields p { margin: 0; }
      .moba-lighthouse-comparison button { font: inherit; }
      .moba-lighthouse-comparison :focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
      .moba-lighthouse-note { margin: 6px 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
      .moba-comparison-previous { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; margin-block: 7px; }
      .moba-comparison-previous p { margin: 0; }
      .moba-lighthouse-task { display: grid; gap: 5px; align-items: start; margin: 10px 0; padding: 8px;
        border: 1px solid #4b655f; background: #16252b; }
      .moba-lighthouse-task label { display: grid; gap: 5px; color: #b8ded4; font-size: 12px; }
      .moba-lighthouse-task textarea { box-sizing: border-box; width: 100%; min-width: 0; resize: vertical; color: var(--ink);
        background: #111b24; border: 1px solid #4b655f; padding: 6px; font: inherit; line-height: 1.4; }
      .moba-lighthouse-task button { justify-self: start; }
      .moba-workspace-comparison-form select, .moba-workspace-comparison-form input { box-sizing: border-box; width: 100%; min-width: 0;
        color: var(--ink); background: #111b24; border: 1px solid #4b655f; padding: 6px; font: inherit; }
      .moba-workspace-comparison-form p { margin: 0 0 3px; }
      .moba-material-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 6px; }
      .moba-material-input button { min-height: 36px; }
      .moba-material-dialog { width: min(570px, calc(100vw - 28px)); }
      .moba-material-crumbs ol { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 6px;
        margin: 8px 0; padding: 0; list-style: none; }
      .moba-material-crumbs li { min-width: 0; max-width: 100%; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
      .moba-material-crumbs li + li::before { content: '/'; margin-inline-end: 6px; color: #8da3b1; }
      .moba-material-crumbs [aria-current] { color: #b8ded4; font-weight: 650; }
      .moba-material-dialog .moba-material-search { display: flex; gap: 6px; }
      .moba-material-dialog .moba-material-search input { min-height: 37px; border: 0; padding: 3px; background: transparent; }
      .moba-material-entries { display: grid; align-content: start; gap: 5px; max-height: min(48dvh, 390px); overflow: auto;
        margin: 9px 0; padding: 2px; list-style: none; scrollbar-color: #69573e #111521; }
      .moba-material-entries button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px;
        width: 100%; min-height: 40px; padding: 5px 8px; border: 1px solid #4b525b; background: #141b27; color: var(--ink);
        text-align: start; cursor: pointer; overflow-wrap: anywhere; }
      .moba-material-entries button:hover { border-color: var(--gold); background: #2b2826; }
      .moba-material-entries strong, .moba-material-entries small { display: block; }
      .moba-material-entries strong { font-size: 13px; }
      .moba-material-entries small { color: var(--muted); font-size: 11px; }
      .moba-material-entries svg, .moba-material-choose { color: #b8ded4; }
      .moba-material-choose { font-size: 12px; }
      .moba-lighthouse-arms { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(245px, 100%), 1fr));
        align-items: start; gap: 7px; }
      .moba-lighthouse-arm { display: grid; gap: 8px; min-width: 0; padding: 8px; border: 1px solid var(--line);
        background: #141b27; overflow-wrap: anywhere; }
      .moba-lighthouse-arm header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 7px; }
      .moba-lighthouse-arm header svg { margin-top: 2px; color: var(--gold); }
      .moba-lighthouse-arm h3 { margin: 0 0 2px; color: var(--ink); font-size: 15px; }
      .moba-lighthouse-arm-hero { color: var(--muted); font-size: 12px; }
      .moba-lighthouse-arm code { color: #a5d9d1; font-size: 12px; }
      .moba-lighthouse-arm-state { min-width: 0; max-width: 8em; text-align: end; color: var(--muted); font-size: 11px; }
      .moba-lighthouse-arm[data-state="complete"] .moba-lighthouse-arm-state { color: #afddc0; }
      .moba-lighthouse-arm[data-state="ready"] .moba-lighthouse-arm-state { color: #afddc0; }
      .moba-lighthouse-arm[data-state="unavailable"] .moba-lighthouse-arm-state { color: #ffc0cf; }
      .moba-lighthouse-results, .moba-lighthouse-artifacts ul { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
      .moba-lighthouse-results li { display: flex; justify-content: space-between; gap: 6px; min-width: 0; padding: 5px;
        border: 1px solid #3d4051; font-size: 12px; }
      .moba-lighthouse-results small { display: block; color: var(--muted); font-size: 11px; }
      .moba-lighthouse-results li > span { flex: none; max-width: 9em; font-size: 11px; color: #f3c592; }
      .moba-lighthouse-results li > span[data-state="completed"] { color: #adceb6; }
      .moba-lighthouse-artifacts { padding: 6px; background: #14252b; }
      .moba-lighthouse-artifacts h4, .moba-lighthouse-artifacts h5 { margin: 0 0 4px; color: #b8ded4; font-size: 12px; }
      .moba-lighthouse-artifacts li { font-size: 12px; }
      .moba-comparison-pending { padding: 6px; border: 1px solid #8c7053; background: #342821; color: #f6dcaf; font-size: 12px; }
      .moba-comparison-pending p { margin: 3px 0 0; }
      .moba-history-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-block: 10px; }
      .moba-history-filters label { min-width: 0; color: var(--muted); font-size: 12px; }
      .moba-history-filters .moba-search { grid-column: 1 / -1; margin: 0; }
      .moba-history-filters select { display: block; width: 100%; margin-top: 3px; padding: 6px; border: 1px solid #4b655f;
        background: #111b24; color: var(--ink); font: inherit; }
      .moba-history-list, .moba-history-arms, .moba-history-gear ul { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
      .moba-history-entry { display: grid; gap: 7px; min-width: 0; padding: 8px; border: 1px solid var(--line);
        background: #141b27; overflow-wrap: anywhere; }
      .moba-history-entry header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 10px; }
      .moba-history-entry h3 { margin: 0; color: var(--ink); font-size: 15px; }
      .moba-history-entry p, .moba-history-entry time { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
      .moba-history-entry time { flex: none; }
      .moba-history-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; }
      .moba-history-card-actions .moba-comparison-previous { margin-block: 0; margin-inline-end: auto; }
      .moba-history-arms { grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); align-items: start; gap: 5px; }
      .moba-history-arms > li { min-width: 0; padding: 5px; border: 1px solid #3d4051; font-size: 12px; }
      .moba-history-state { margin-inline-start: 6px; color: var(--muted); }
      .moba-history-state[data-state="complete"] { color: #afddc0; }
      .moba-history-state[data-state="waiting-choice"] { color: #f6dcaf; }
      .moba-history-actions { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 7px; }
      .moba-history-actions button { margin-top: 4px; }
      .moba-history-gear h3 { margin: 0 0 5px; color: var(--gold); font-size: 13px; }
      .moba-history-gear ul { grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); }
      .moba-history-gear li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 5px; min-width: 0;
        padding: 5px; border: 1px solid #3d4051; font-size: 12px; overflow-wrap: anywhere; }
      .moba-history-gear .moba-item-art { width: 30px; }
      .moba-history-gear small { display: block; color: var(--muted); }
      .moba-history-reuse > .moba-proven-hero { margin-block: 8px; }
      .moba-history-reuse > .moba-history-gear, .moba-history-reuse > .moba-lighthouse-results { margin-block-end: 8px; }
      .moba-lighthouse-arm footer { display: flex; flex-wrap: wrap; gap: 5px; justify-content: end; }
      .moba-handoff-outcome { margin: 10px 0; }
      .moba-handoff-outcome h3, .moba-handoff-outcome h4 { margin: 0; color: var(--ink); font-size: 13px; }
      .moba-handoff-outcome .moba-lighthouse-arms { margin: 6px 0 0; }
      .moba-handoff-outcome .moba-lighthouse-note { margin: 0; }
      .moba-handoff-outcome .moba-lighthouse-arm footer { justify-content: start; align-self: end; }
      .moba-hero-replay-result { display: grid; gap: 6px; min-width: 0; padding: 9px;
        border: 1px solid #59786b; background: #1b2d2b; }
      .moba-hero-replay-result dd:last-child { color: #afddc0; }
      .moba-minimal-replay-gear { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center;
        gap: 10px; margin: 10px 0; padding: 9px; border-block: 1px solid #5e7468; background: #202c2c; }
      .moba-minimal-replay-gear .moba-item-art { width: 44px; height: 44px; }
      .moba-minimal-replay-gear h3 { margin: 0 0 3px; color: var(--gold); font-size: 16px; }
      .moba-minimal-replay-gear p { margin: 0; color: var(--ink); }
      .moba-minimal-replay-detail { min-width: 0; border-block-end: 1px solid var(--line); }
      .moba-minimal-replay-detail > summary { padding: 7px 1px; color: var(--blue); cursor: pointer; }
      .moba-minimal-replay-detail[open] { padding-block-end: 7px; }
      .moba-minimal-replay-detail .moba-lighthouse-task { margin-block-start: 7px; }
      .moba-handoff-report-grid { grid-template-columns: repeat(auto-fit, minmax(min(206px, 100%), 1fr)); }
      .moba-handoff-report-side header { align-items: center; }
      .moba-handoff-report-side header span:not(.moba-starter-hero) { display: block; color: var(--muted); font-weight: 500; }
      .moba-handoff-report-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 8px; margin: 0; }
      .moba-handoff-report-facts dd { margin: 0; overflow-wrap: anywhere; }
      .moba-handoff-report-side[data-met="true"] dd:last-child { color: #afddc0; }
      .moba-handoff-report-side[data-met="false"] dd:last-child { color: #efc3a4; }
      .moba-lighthouse-comparison > .moba-market-actions { position: sticky; inset-block-end: 0; background: #171c27; padding-block: 4px; }
      .moba-public-evidence-comparison { scroll-padding-block-end: 80px; }
      .moba-lighthouse-comparison:has([data-public-review-outcome]) { scroll-padding-block-end: 140px; }
      .moba-lighthouse-anchor { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
        gap: 3px 7px; padding: 6px 8px; margin-block-end: 5px; border: 1px solid #607d78; background: #192c33; color: #f3e9d2; font-size: 12px; }
      .moba-lighthouse-anchor > div { display: flex; flex-wrap: wrap; gap: 1px 7px; overflow-wrap: anywhere; }
      .moba-lighthouse-anchor .moba-lighthouse-anchor-actions { justify-content: flex-end; gap: 4px 7px; }
      .moba-lighthouse-anchor:is([data-evidence-result], [data-task-pending]) { grid-template-columns: minmax(0, 1fr); }
      .moba-lighthouse-anchor:is([data-evidence-result], [data-task-pending]) .moba-lighthouse-anchor-actions { justify-content: flex-start; }
      @media (max-width: 600px) {
        .moba-lighthouse-anchor[data-delivery-review-result] { grid-template-columns: minmax(0, 1fr); }
        .moba-lighthouse-anchor[data-delivery-review-result] .moba-lighthouse-anchor-actions { justify-content: flex-start; }
      }
      .moba-lighthouse-anchor-actions .moba-settlement-button { white-space: normal; }
      .moba-lighthouse-anchor > div > span { color: #b8ded4; }
      .moba-lighthouse-anchor > p, .moba-task-pending > p { margin: 0; color: #ccdcd8; font-size: 11px; }
      .moba-lighthouse-anchor > p { grid-column: 1 / -1; }
      .moba-lighthouse-anchor > .moba-task-pending { align-items: center; gap: 4px 7px; }
      .moba-plan-task-draft textarea { grid-column: 1 / -1; width: 100%; min-width: 0; padding: 5px; resize: vertical;
        border: 1px solid #607d78; background: #111b24; color: inherit; font: inherit; }
      .moba-starter-dialog h2 { margin: 0 0 12px; font-size: 22px; }
      .moba-starter-brief { display: grid; grid-template-columns: 45px minmax(0, 1fr); align-items: center; gap: 9px;
        padding: 8px; background: #16252b; border: 1px solid #4b655f; }
      .moba-starter-hero { display: block; width: 45px; aspect-ratio: 1; background-repeat: no-repeat; border: 1px solid #738477; }
      .moba-starter-brief strong { color: #b8ded4; font-size: 13px; }
      .moba-starter-brief p { margin: 3px 0 0; color: var(--ink); }
      .moba-lesson-steps { display: grid; gap: 7px; padding-inline-start: 22px; margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
      .moba-starter-routes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
        gap: 7px; min-inline-size: 0; margin: 12px 0; padding: 0; border: 0; }
      .moba-starter-routes legend { margin-block-end: 6px; padding: 0; color: var(--gold); font-size: 13px; font-weight: 700; }
      .moba-starter-route { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 7px;
        padding: 8px; border: 1px solid var(--line); background: #121a27; cursor: pointer; }
      .moba-starter-route[data-picked="true"] { border-color: var(--gold); background: #2c251c; }
      .moba-starter-route:focus-within { outline: 2px solid var(--blue); outline-offset: 2px; }
      .moba-starter-route input { margin: 2px 0 0; accent-color: var(--gold); }
      .moba-starter-route:has(input:disabled) { cursor: default; opacity: .65; }
      .moba-starter-route > span { display: grid; gap: 3px; overflow-wrap: anywhere; }
      .moba-starter-route strong { display: flex; align-items: center; gap: 5px; font-size: 14px; }
      .moba-starter-route strong svg { flex: none; color: var(--gold); }
      .moba-starter-route code { color: #a5d9d1; font-size: 12px; }
      .moba-starter-route small, .moba-starter-note { color: var(--muted); font-size: 12px; line-height: 1.5; }
      .moba-hero-trial-picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); min-inline-size: 0;
        gap: 7px; margin: 12px 0; padding: 0; border: 0; }
      .moba-hero-trial-picks legend { margin-block-end: 6px; padding: 0; color: var(--gold); font-size: 13px; font-weight: 700; }
      .moba-hero-trial-pick { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 6px;
        min-height: 65px; padding: 7px; border: 1px solid #8a754d; background: #1b272e; color: var(--ink); text-align: start; }
      .moba-hero-trial-pick .moba-starter-hero { width: clamp(32px, 9cqi, 42px); }
      .moba-hero-trial-pick strong, .moba-hero-trial-pick small { display: block; overflow-wrap: anywhere; }
      .moba-hero-trial-pick strong { font-size: 14px; }
      .moba-hero-trial-pick small { color: var(--muted); font-size: 11px; line-height: 1.35; }
      .moba-hero-trial-pick:hover:not(:disabled) { border-color: var(--gold); background: #273840; }
      .moba-hero-trial-pick:disabled { border-color: var(--line); background: #161c27; opacity: .85; }
      @media (max-width: 360px) {
        .moba-hero-trial-pick { grid-template-columns: minmax(0, 1fr); align-content: start; }
      }
      .moba-starter-actions { flex-wrap: wrap; }
      .moba-starter-actions .moba-roster-open { min-height: 44px; }
      .moba-playbook-button { border-color: #677d70; background: #182c2a; color: #bfe3d5 !important; }
      .moba-playbook-dialog { width: min(550px, calc(100vw - 28px)); }
      .moba-playbook-dialog h2 { margin: 0; font-size: 22px; }
      .moba-playbook-gear { color: #a5d9d1; font-size: 12px; }
      .moba-playbook-comparison { padding: 0 8px; background: #131a25; border: 1px solid var(--line); }
      .moba-playbook-lineup { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center;
        gap: 8px; padding: 7px 0; overflow-wrap: anywhere; }
      .moba-playbook-lineup small, .moba-playbook-lineup strong { display: block; }
      .moba-playbook-lineup small { color: var(--muted); font-size: 11px; }
      .moba-playbook-lineup strong { font-size: 13px; }
      .moba-playbook-lineup svg { color: var(--gold); }
      .moba-playbook-swap { padding-block: 6px; border-top: 1px solid var(--line); font-size: 12px; overflow-wrap: anywhere; }
      .moba-playbook-swap strong { color: var(--gold); }
      .moba-playbook-swap p { margin: 2px 0 0; color: var(--muted); }
      .moba-playbook-comparison .moba-delta { border-top: 1px solid var(--line); }
      .moba-playbook-comparison .moba-delta summary { padding: 6px 0; color: var(--gold); font-size: 12px;
        cursor: pointer; overflow-wrap: anywhere; }
      .moba-playbook-comparison .moba-delta summary span { margin-inline-start: 5px; color: var(--muted); }
      .moba-pairing-dialog { width: min(620px, calc(100vw - 28px)); }
      .moba-pairing-target { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
      .moba-pairing-target .moba-item-art { width: 38px; flex: none; border: 1px solid var(--line); }
      .moba-pairing-target strong, .moba-pairing-target small { display: block; }
      .moba-pairing-target small { color: var(--muted); }
      .moba-fitting-picker { display: grid; gap: 6px; }
      .moba-fitting-roster { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(146px, 100%), 1fr)); gap: 5px;
        max-height: 152px; overflow: auto; padding: 1px 3px 1px 1px; scrollbar-color: #69573e #111521; }
      .moba-fitting-roster button { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 6px;
        min-width: 0; min-height: 46px; padding: 4px 6px; border: 1px solid var(--line); color: var(--ink);
        background: #151b28; text-align: left; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
      .moba-fitting-roster button:hover, .moba-fitting-roster button[aria-pressed="true"] {
        border-color: var(--gold); background: #382d23; color: #ffe1a4; }
      .moba-fitting-roster button:disabled { opacity: .55; cursor: default; }
      .moba-fitting-roster button .moba-pairing-portrait { width: 30px; height: 32px; }
      .moba-fitting-roster strong, .moba-fitting-roster small { display: block; }
      .moba-fitting-roster strong { font-size: 12px; }
      .moba-fitting-roster small { color: var(--muted); font-size: 11px; }
      .moba-fitting-partner { margin-block: 8px; padding: 6px 8px; border: 1px solid var(--line); }
      .moba-fitting-partner summary { color: var(--gold); cursor: pointer; font-size: 13px; overflow-wrap: anywhere; }
      .moba-fitting-partner[open] summary { margin-bottom: 7px; }
      .moba-fitting-partner .moba-tool-source { margin-bottom: 0; }
      .moba-fitting-modes { display: grid; gap: 4px; margin-block: 8px; }
      .moba-fitting-modes button { display: grid; grid-template-columns: minmax(84px, .34fr) minmax(0, 1fr); gap: 6px;
        align-items: start; padding: 6px 8px; border: 1px solid var(--line); background: #151b28; color: var(--ink);
        font: inherit; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
      .moba-fitting-modes button[aria-pressed="true"] { border-color: var(--gold); background: #382d23; }
      .moba-fitting-modes button:disabled { color: var(--muted); cursor: default; }
      .moba-fitting-modes strong { font-size: 12px; }
      .moba-fitting-modes small { display: block; color: var(--muted); font-size: 11px; }
      .moba-fitting-modes .moba-fitting-reward { color: #f1d293; }
      .moba-fitting-steps { margin: 8px 0; }
      .moba-pairing-placement { color: var(--gold); }
      .moba-pairing-removals { color: #efbb92; }
      .moba-pairing-actions { justify-content: flex-end; flex-wrap: wrap; }
      .moba-pairing-actions button:disabled { opacity: .55; }
      .moba-fitting-dialog .moba-pairing-actions { position: sticky; bottom: -18px; z-index: 1; padding: 10px 0 8px;
        border-top: 1px solid var(--line); background: #171c27; }
      .moba-build-permissions { display: grid; gap: 4px; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); font-size: 12px; }
      .moba-build-permissions legend { color: var(--gold); }
      .moba-build-permissions p { margin: 0 0 3px; }
      .moba-build-permissions label { display: flex; align-items: center; gap: 5px; overflow-wrap: anywhere; }
      .moba-direct-form { display: grid; gap: 10px; margin-top: 10px; }
      .moba-direct-form label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; }
      .moba-direct-form input, .moba-direct-form textarea { width: 100%; min-width: 0; padding: 8px; border: 1px solid #424a5a; background: var(--deep); color: var(--ink); }
      .moba-direct-form textarea { resize: vertical; font-family: "IBM Plex Mono", monospace; line-height: 1.45; }
      .moba-direct-form summary { cursor: pointer; font-size: 12px; color: var(--blue); }
      .moba-direct-form details label { margin-top: 6px; }
      .moba-action-target { display: flex; gap: 8px; align-items: center; overflow-wrap: anywhere; }
      .moba-action-avatar { width: 34px; height: 34px; flex: none; background-repeat: no-repeat; border: 1px solid var(--line); }
      .moba-action-options { display: flex; flex-wrap: wrap; gap: 5px; }
      .moba-action-options button { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; overflow-wrap: anywhere; min-height: 31px; background: var(--deep); border: 1px solid var(--line); padding: 4px 7px; font-size: 12px; text-align: start; }
      .moba-action-options button:hover, .moba-action-options button[aria-pressed="true"] { color: var(--gold); border-color: var(--gold); }
      .moba-action-fields { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 8px; }
      .moba-action-fields textarea { font-family: inherit; }
      .moba-action-fields .moba-action-requires { display: flex; gap: 6px; align-items: center; }
      .moba-action-fields .moba-action-requires input { width: auto; accent-color: var(--gold); }
      .moba-action-fields > button { justify-self: start; }
      .moba-decisions { display: grid; gap: 3px; padding: 0; margin: 7px 0 0; list-style: none; }
      .moba-decisions li { display: grid; grid-template-columns: 6em 1fr; gap: 5px; font-size: 11px; color: var(--muted); line-height: 1.5; }
      .moba-lobby[lang="en"] .moba-decisions li { grid-template-columns: minmax(0, 10em) minmax(0, 1fr); }
      .moba-decisions strong { color: #f0d8ac; }
      .moba-build { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 8px 12px; border: 1px solid var(--line); background: var(--paper); }
      .moba-build-bag { min-width: 0; }
      .moba-build-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 12px; }
      .moba-build-caption button { min-height: 28px; }
      .moba-opening-toggle { display: inline-flex; align-items: center; gap: 4px; }
      .moba-opening-toggle[aria-expanded="true"] { color: var(--gold); }
      .moba-opening-summary { display: flex; align-items: center; gap: 7px; margin: 5px 0; color: var(--gold); }
      .moba-opening-summary > svg { flex: none; }
      .moba-opening-summary div { min-width: 0; display: grid; overflow-wrap: anywhere; }
      .moba-opening-summary strong { font-size: 12px; }
      .moba-opening-summary span { color: var(--muted); font-size: 11px; }
      .moba-opening-summary[data-stale="true"] span { color: #ffc591; }
      .moba-opening-editor { grid-column: 1 / -1; padding: 12px; background: var(--paper); border: 1px solid var(--line); }
      .moba-opening-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
      .moba-opening-heading h3 { margin: 0; color: var(--gold); font-size: 17px; }
      .moba-opening-content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: start; gap: 12px 20px; margin-top: 10px; }
      .moba-opening-hero { display: flex; align-items: start; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
      .moba-opening-hero .moba-match-plan-portrait { flex: none; }
      .moba-opening-hero strong { color: var(--gold); font-size: 13px; }
      .moba-opening-hero p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
      .moba-opening-fields { min-width: 0; }
      .moba-opening-fields .moba-match-action-note { margin: 0; }
      .moba-opening-fields .moba-quest-form > button { min-height: 37px; background: #443221; border-color: #a88049; color: #ffe2a7; }
      .moba-opening-gear { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 2px 0; padding: 0; list-style: none; }
      .moba-opening-gear li { display: flex; gap: 7px; align-items: center; min-width: 0; overflow-wrap: anywhere; }
      .moba-opening-gear .moba-item-art { flex: none; width: 30px; }
      .moba-opening-gear strong, .moba-opening-gear span { display: block; font-size: 12px; }
      .moba-opening-gear div > span { color: var(--muted); font-size: 11px; }
      .moba-opening-follow-up { display: grid; gap: 5px; padding: 0 0 9px; margin: 0 0 9px; border-bottom: 1px solid var(--line); }
      .moba-opening-follow-up h4 { margin: 0; color: var(--gold); font-size: 12px; }
      @container (max-width: 520px) {
        .moba-opening-content { grid-template-columns: minmax(0, 1fr); }
      }
      .moba-removed-equipment { color: var(--muted, #c2bec6); font-size: 12px; padding: 4px 0; }
      .moba-removed-equipment summary { cursor: pointer; }
      .moba-removed-equipment p { margin: 4px 0; overflow-wrap: anywhere; }
      .moba-match-body > .moba-removed-equipment { padding: 0 14px 8px; }
      .moba-build h2 span { color: var(--muted); font-size: 11px; font-weight: 400; margin-inline-start: 9px; }
      .moba-slots { display: flex; gap: 5px; padding: 3px; overflow-x: auto; }
      .moba-slot { position: relative; display: grid; place-items: center; flex: 0 0 36px; aspect-ratio: 1; border: 1px dashed #555564; color: #a9a1a2; background: var(--deep); }
      .moba-slot[data-filled="true"] { border: 1px solid var(--gold); animation: moba-equipped .35s ease-out; }
      .moba-slot button { width: 100%; height: 100%; position: relative; padding: 0; background: transparent; border: 0; }
      .moba-slot button > span:last-child { position: absolute; display: grid; place-items: center; inset: 0 0 auto auto; background: #15131b; color: var(--gold); opacity: 0; }
      .moba-slot button:hover > span:last-child, .moba-slot button:focus-visible > span:last-child { opacity: 1; }
      .moba-slot .moba-item-art { width: 34px; }
      .moba-start-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
      .moba-continuation { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; padding: 9px 12px; margin: 0 0 12px; border: 1px solid var(--line); background: #181c26; }
      .moba-continuation strong, .moba-continuation span { display: block; overflow-wrap: anywhere; }
      .moba-continuation strong { color: var(--gold); font-size: 14px; }
      .moba-continuation span, .moba-continuation p { color: var(--muted); font-size: 12px; }
      .moba-continuation p { margin: 4px 0 0; }
      .moba-continuation-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
      .moba-start-controls label { display: grid; gap: 3px; width: min(130px, 29vw); font-size: 11px; color: var(--muted); }
      .moba-start { display: flex; justify-content: space-between; align-items: center; gap: 7px; min-height: 44px; background: #e7bf79; color: #211807 !important; padding: 7px 11px; border: 1px solid #fff1cd; font-weight: 750 !important; white-space: nowrap; clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
      .moba-start:hover { background: #f9d99c; }
      .moba-start:focus-visible { outline-offset: -4px; }
      .moba-start:disabled { opacity: .55; }
      .moba-comparison { grid-column: 1 / -1; padding: 14px; border: 1px solid var(--line); background: var(--paper); }
      .moba-comparison-header { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 280px) auto; align-items: end; gap: 9px; margin-bottom: 12px; }
      .moba-comparison-header h2 { align-self: center; overflow-wrap: anywhere; }
      .moba-comparison-header label { display: grid; min-width: 0; gap: 2px; color: var(--muted); font-size: 11px; }
      .moba-comparison-header .moba-icon-action { height: 31px; width: 31px; }
      .moba-comparison-roster { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; color: var(--gold); }
      .moba-comparison-hero { position: relative; min-height: 112px; overflow: hidden; isolation: isolate; display: flex; align-items: end; border: 1px solid var(--line); background: var(--deep); }
      .moba-comparison-portrait { position: absolute; z-index: -2; inset: 0 auto auto 0; width: min(100%, 375px); aspect-ratio: 1; background-repeat: no-repeat; object-position: top center; mask-image: linear-gradient(90deg, #000 70%, transparent); }
      .moba-comparison-hero::after { position: absolute; z-index: -1; inset: 0; content: ""; background: linear-gradient(0deg, #070a11 2%, transparent 100%); }
      .moba-comparison-hero > .moba-outfit-trim { --outfit-width: 2px; }
      .moba-comparison-hero .moba-outfit-edge:last-child { background: var(--outfit-accent); }
      .moba-comparison-identity { position: relative; display: grid; padding: 8px 10px; line-height: 1.25; overflow-wrap: anywhere; }
      .moba-comparison-identity span { font-size: 11px; color: var(--ink); }
      .moba-comparison-identity strong { font-family: "STIX Two Text", "Songti SC", serif; font-size: clamp(18px, 3.2cqi, 28px); }
      .moba-comparison-kit { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; list-style: none; padding: 0; margin: 5px 0 0; }
      .moba-comparison-kit > li { font-size: 10px; color: var(--ink); }
      .moba-comparison-kit .moba-item-art { display: block; width: 26px; border: 1px solid #9b7a4b; }
      .moba-comparison-kit .moba-art-seal { font-size: 6px; min-width: 14px; min-height: 9px; padding: 0 1px; }
      .moba-comparison-note { margin: 8px 0 12px; color: var(--muted); font-size: 12px; }
      .moba-loadout-moves { margin-bottom: 12px; padding: 0 9px; border: 1px solid var(--line); background: var(--deep); }
      .moba-loadout-moves summary { display: flex; align-items: center; gap: 7px; min-height: 36px; color: var(--gold); font-size: 13px; cursor: pointer; }
      .moba-loadout-moves summary::after { content: ""; width: 6px; height: 6px; margin-inline: auto 3px; border: solid currentColor; border-width: 0 1px 1px 0; transform: rotate(45deg); }
      .moba-loadout-moves[open] summary::after { transform: rotate(225deg); }
      .moba-loadout-moves summary:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
      .moba-loadout-moves .moba-search { margin-bottom: 3px; }
      .moba-loadout-moves .moba-decisions li { grid-template-columns: minmax(0, 10em) minmax(0, 1fr); }
      .moba-loadout-portrait { display: block; width: 35px; height: 35px; border: 1px solid var(--line); background-repeat: no-repeat; }
      .moba-loadout-more { min-height: 36px; }
      .moba-comparison-switcher { display: none; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
      .moba-comparison-switcher button { min-height: 32px; padding: 5px 8px; background: var(--deep); border: 1px solid var(--line); font-size: 12px; }
      .moba-comparison-switcher button[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: #2b251d; }
      .moba-deltas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .moba-delta { min-width: 0; }
      .moba-delta[data-tone="timing"], .moba-delta[data-tone="source"] { grid-column: 1 / -1; }
      .moba-delta h3 { display: flex; justify-content: space-between; margin: 0; padding: 6px 0; border-bottom: 1px solid var(--line); color: var(--gold); font-size: 13px; }
      .moba-delta[data-tone="gain"] h3 { color: #a6d5bc; }
      .moba-delta[data-tone="loss"] h3 { color: #f0b4b6; }
      .moba-delta-list { margin: 0; padding: 0; list-style: none; }
      .moba-delta-list > li { display: grid; grid-template-columns: 35px minmax(0, 1fr); gap: 8px; align-items: start; padding: 7px 0; border-bottom: 1px solid #363542; font-size: 13px; overflow-wrap: anywhere; }
      .moba-delta-list .moba-item-art { width: 35px; }
      .moba-delta-list p { margin: 3px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
      .moba-source-change { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 3px 10px; margin: 6px 0 0; font-size: 12px; }
      .moba-source-change dt { color: var(--muted); }
      .moba-source-change dd { margin: 0; color: #f0d8ac; }
      .moba-source-decisions { margin-top: 9px; }
      .moba-source-decisions h4 { margin: 0; color: #a6d5bc; font-size: 11px; }
      .moba-source-decisions[data-change="loss"] h4 { color: #f0b4b6; }
      .moba-source-decisions .moba-decisions { margin-top: 3px; }
      .moba-decision-action { margin-inline-start: 8px; color: #f2d8a8; min-height: 26px; font-size: inherit; }
      .moba-capability-kind { color: var(--muted); font-size: 11px; margin-inline-start: 7px; }
      .moba-empty { margin: 8px 0; color: var(--muted); font-size: 13px; }
      .moba-alert { border: 1px solid #9d616c; background: #311c26; color: #ffdade; margin: 0 0 9px; padding: 8px; overflow-wrap: anywhere; font-size: 13px; }
      @keyframes moba-reveal { from { opacity: .65; transform: scale(1.035); } to { opacity: 1; transform: scale(1); } }
      @keyframes moba-equipped { from { box-shadow: inset 0 0 0 3px var(--blue); } to { box-shadow: inset 0 0 0 0 transparent; } }
      @media (prefers-reduced-motion: reduce) { .moba-splash, .moba-slot { animation: none !important; } }
      @container (max-width: 720px) {
        .moba-grid { grid-template-columns: minmax(0, 1fr); }
        .moba-stage { min-height: 250px; height: clamp(250px, 64cqi, 365px); }
        .moba-hero { flex-basis: 62px; }
      }
      @container (max-width: 475px) {
        .moba-header { gap: 5px; }
        .moba-heading { gap: 5px; }
        .moba-heading svg { width: 23px; }
        .moba-heading h1 { font-size: clamp(20px, 6cqi, 27px); }
        .moba-icon-action { width: 27px; height: 31px; }
        .moba-icon-action svg { width: 15px; }
        .moba-shop { padding: 8px; }
        .moba-shop-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .moba-shop-grid .moba-item-art { width: min(44px, 14cqi); }
        .moba-build { grid-template-columns: minmax(0, 1fr); }
        .moba-start-controls { justify-content: space-between; }
        .moba-start { padding-inline: 7px; font-size: 12px !important; }
        .moba-comparison { padding: 10px; }
        .moba-comparison-header { grid-template-columns: minmax(0, 1fr) auto; }
        .moba-comparison-header label { grid-row: 2; grid-column: 1 / -1; }
        .moba-comparison-header button { grid-row: 1; grid-column: 2; }
        .moba-comparison-roster { gap: 5px; }
        .moba-comparison-roster > svg { width: 15px; }
        .moba-comparison-hero { min-height: 96px; }
        .moba-deltas { grid-template-columns: minmax(0, 1fr); }
        .moba-comparison-switcher { display: flex; }
        .moba-delta[data-active="false"], .moba-delta h3 { display: none; }
      }
      @container (max-width: 300px) {
        .moba-comparison-roster, .moba-delta-list .moba-decisions li { grid-template-columns: minmax(0, 1fr); }
        .moba-comparison-roster > svg { justify-self: center; transform: rotate(90deg); }
        .moba-delta-list > li { grid-template-columns: minmax(0, 1fr); }
      }
    `

    function observePlanComposers(ctx, request) {
      const slot = 'conversation.composer'
      if (typeof ctx.slots.entries !== 'function' || typeof ctx.slots.subscribe !== 'function') return
      const wrappers = new Map()
      const lifetime = new AbortController()
      let loading

      async function report(pending, answer, action) {
        const question = pending.questions?.[0]
        const item = answer?.answers?.length === 1 && answer.answers[0]
        const callId = question?.intent?.callId
        if (question?.intent?.kind !== 'plan-review' || typeof callId !== 'string' || !item || item.id !== question.id
          || item.selected?.length !== 1 || item.selected[0] === question.intent.approve
          || typeof item.custom !== 'string' || !item.custom.trim() || !globalThis.crypto?.subtle) return
        const bytes = new TextEncoder().encode(JSON.stringify([item.id, item.selected, item.custom]))
        const hash = await crypto.subtle.digest('SHA-256', bytes)
        const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
        for (const delay of [0, 50, 160, 450, 900]) {
          if (delay) await new Promise(resolve => setTimeout(resolve, delay))
          if (lifetime.signal.aborted) return
          const result = await request('plan-review-record', { action: 'plan-review-record', sessionId: pending.sessionId,
            callId, packageName: action.packageName, actionId: action.id, digest }, lifetime.signal)
          if (!result.pending) return
        }
      }

      function wrappedPending(pending, action) {
        if (!action || !pending || typeof pending.answer !== 'function') return pending
        return new Proxy(pending, {
          get(target, key) {
            const value = Reflect.get(target, key, target)
            if (key === 'answer') return async answer => {
              const result = await Reflect.apply(value, target, [answer])
              void report(target, answer, action).catch(() => {})
              return result
            }
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      }

      function restore(entry, row) {
        if (entry.component === row.render) entry.component = row.original
        wrappers.delete(entry)
      }

      function refresh() {
        loading?.abort()
        const controller = loading = new AbortController()
        request('plan-review-activities', { action: 'plan-review-activities' }, controller.signal).then(actions => {
          if (controller.signal.aborted) return
          const entries = new Set(ctx.slots.entries(slot))
          for (const [entry, row] of wrappers) {
            if (!entries.has(entry) || !actions.some(action => action.component === row.original.name)) restore(entry, row)
          }
          for (const entry of entries) {
            const original = wrappers.get(entry)?.original ?? entry.component
            const candidates = actions.filter(action => action.component === original?.name)
            if (!candidates.length || !Object.getOwnPropertyDescriptor(entry, 'component')?.writable) continue
            const current = wrappers.get(entry)
            if (current) {
              current.actions = candidates
              continue
            }
            const row = { original, actions: candidates, render: props => {
              const owner = props.ctx?.fiber?.entry?.options?.name
              const action = row.actions.find(item => item.packageName === owner)
              const matched = useMemo(() => wrappedPending(props.matched, action), [props.matched, action])
              return h(original, { ...props, matched })
            } }
            wrappers.set(entry, row)
            entry.component = row.render
          }
        }).catch(() => {})
      }
      const stop = ctx.slots.subscribe(slot, refresh)
      refresh()
      return () => {
        lifetime.abort()
        loading?.abort()
        stop()
        for (const [entry, row] of wrappers) restore(entry, row)
      }
    }

    return {
      inject: ['slots', 'uiWorkspace', 'uiSession', 'workspaces', 'sessions'],
      async apply(ctx) {
        const locale = ctx.get('locale')
        if (locale) activeLanguage = {
          subscribe: locale.subscribe.bind(locale),
          getSnapshot: () => /^zh(?:-|$)/i.test(locale.getSnapshot().active) ? 'zh' : 'en',
        }
        try {
          const dictionary = await fetch('api/' + panelId + '/locale/en')
          if (dictionary.ok) english = await dictionary.json()
        } catch {
          // The host can still expose the source-language UI while reconnecting.
        }
        const picker = globalThis.__DSH_DIRECTORY_PICKER__
        const workspaceSetup = typeof ctx.workspaces.create === 'function' ? {
          ...(typeof picker?.pick === 'function' && { pick: () => picker.pick() }),
          ...(typeof ctx.uiWorkspace.listDirectory === 'function' && { list: (path, signal) => ctx.uiWorkspace.listDirectory(path, signal) }),
          ...(typeof ctx.uiWorkspace.pickDirectory === 'function' && { pickHost: () => ctx.uiWorkspace.pickDirectory() }),
          add: path => ctx.workspaces.create({ path }),
        } : null
        let returnDraft
        let sessionTaskDraft
        function consumeReturnDraft(draft) {
          if (returnDraft === draft) returnDraft = undefined
        }
        function openLobby(sessionId, snapshot, { selectionPresetId, followUp, inspect, relaySetup, flagId, proven } = {}) {
          const workspaces = ctx.workspaces.list.getSnapshot().items
          const workspace = workspaces.find(item => item.workspaceId === proven?.workspaceId) ?? workspaces.find(item => item.sessionIds.includes(sessionId))
          const projection = ctx.sessions.list.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset
          returnDraft = { sessionId, workspaceId: workspace?.workspaceId, presetId: snapshot?.presetId ?? projection, selectionPresetId,
            running: snapshot?.running, continuation: snapshot?.continuation, followUp, inspect, relaySetup, flagId, proven }
          ctx.get('layout')?.selectPanel(panelId)
        }
        function putTaskDraft(sessionId, task) {
          const binding = ctx.sessions.binding(sessionId)
          const input = ctx.get('conversation')?.input
          if (!binding || typeof input?.requestDraftInitialization !== 'function') return 'blocked'
          try {
            return input.requestDraftInitialization(binding, { prompt: task, whenDraftExists: 'keep' })
          } catch {
            return 'blocked'
          }
        }
        function draftStore(sessionId) {
          const binding = ctx.sessions.binding(sessionId)
          try {
            const state = binding && ctx.get('conversation')?.input?.for?.(binding.ctx)?.state
            if (typeof state?.subscribe === 'function' && typeof state?.getSnapshot === 'function') return state
          } catch {
            // Some hosts do not expose an input store for the current binding.
          }
        }
        function openDraftSession(sessionId, task) {
          sessionTaskDraft = task ? { sessionId, task } : undefined
          ctx.uiWorkspace.openSession(sessionId)
        }
        function consumeTaskDraft(sessionId) {
          if (sessionTaskDraft?.sessionId !== sessionId) return
          const { task } = sessionTaskDraft
          sessionTaskDraft = undefined
          return putTaskDraft(sessionId, task)
        }
        ctx.effect(() => {
          const sheet = document.createElement('style')
          sheet.textContent = styles
          document.head.append(sheet)
          return () => sheet.remove()
        })
        async function request(action, payload, signal, language = activeLanguage.getSnapshot()) {
          const endpoint = 'api/' + panelId
          const session = action === 'session'
          const upload = action === 'art-upload'
          const path = session ? endpoint + '/session?' + new URLSearchParams({ sessionId: payload.sessionId })
            : upload ? endpoint + '/art/upload?' + new URLSearchParams({ kind: payload.kind, id: payload.id }) : endpoint
          const headers = { 'X-DSH-Heros-Language': language }
          const response = await fetch(path, action === 'list' || session ? { headers, signal } : {
            method: 'POST', signal,
            headers: { ...headers, 'Content-Type': upload ? payload.file.type : 'application/json' },
            body: upload ? payload.file : JSON.stringify(payload),
          })
          if (response.status === 401 || response.status === 403) throw new Error(t('请重新连接 DSH 后再试。'))
          if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error(session ? t('暂时无法读取会话装备。') : t('备战大厅暂时不可用，请重试。'))
          }
          const result = await response.json()
          if (!result.ok) throw new Error(t(result.error.message))
          return result.value
        }
        function manage(bundle) {
          const navigation = ctx.get('pluginNavigation')
          if (bundle && navigation?.openBundle) navigation.openBundle(bundle)
          else if (navigation?.openList) navigation.openList()
          else ctx.get('layout')?.selectPanel('plugins')
        }
        async function send(sessionId, text, move, language) {
          const session = ctx.sessions.binding(sessionId)?.session
          if (!session) throw new Error(t('当前会话尚未准备好，请重试。'))
          const models = ctx.get('modelDirectories')
          if (models && !session.getSnapshot().subagent) {
            const selection = await models.directoryFor(sessionId).load()
            if (!selection.routable) throw new Error(t('请先在当前会话选择可用模型。'))
          }
          const submission = session.beginSubmission({ text, mode: 'queue', attachments: [] })
          try {
            const prepared = await request('match-record', { action: 'match-record', sessionId, ...move,
              requestId: submission.requestId }, undefined, language)
            if (prepared.text !== text) throw new Error(t('这项操作刚更新，请重新选择。'))
            const outcome = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
            if (!outcome.ok) throw new Error(outcome.error?.message ?? t('指令发送失败，请重试。'))
          } catch (error) {
            submission.abandon()
            throw error
          }
        }
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: panelId, order: -5, label: panelLabel, locale: panelId },
          ({ size }) => h(Glyph, { kind: 'crest', size })))
        ctx.slots.inject('conversation.composer', () => observePlanComposers(ctx, request))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
          { name: 'conversation.input.dock', id: panelId, order: 5 },
          ({ sessionId, session }) => {
            const id = sessionId ?? session?.sessionId
            return id ? h(WorkspaceSetupContext.Provider, { value: workspaceSetup },
              h(MatchEquipment, { key: id, sessionId: id, request, openLobby, send, openDraftSession,
                consumeTaskDraft, putTaskDraft, draftStore, workspaces: ctx.workspaces.list,
                openContinuation: next => ctx.uiWorkspace.openSession(next) })) : null
          }))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
          { name: 'conversation.session.header.utilities', id: panelId, order: -20 },
          ({ sessionId }) => sessionId ? h(InteractionReturn, { sessionId, status: ctx.uiSession.sessionStatus, openLobby }) : null))
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: panelId, inject: () => ({
            request, workspaces: ctx.workspaces.list, manage, openSource: id => ctx.uiWorkspace.openSession(id), openDraftSession,
            getReturnDraft: () => returnDraft, consumeReturnDraft,
            async open(workspaceId, { presetId: agentPreset, verifyLive }, matchMode, sourceSessionId) {
              if (!matchMode && !verifyLive) return ctx.uiWorkspace.openWorkspace(workspaceId, undefined, { agentPreset })
              const navigation = ctx.get('layout')?.beginNavigation()
              if (matchMode === 'continue') {
                const { sessionId } = await request('continue', { action: 'continue', sourceSessionId, presetId: agentPreset }, navigation)
                if (!navigation?.aborted) ctx.uiWorkspace.openSession(sessionId)
                return
              }
              const sessionId = matchMode === 'fresh'
                ? await ctx.sessions.create({ workspaceId, agentPreset })
                : await ctx.uiWorkspace.connectWorkspace(workspaceId, { agentPreset })
              if (navigation?.aborted) return
              if (verifyLive) await request('verify-live', { action: 'verify-live', presetId: agentPreset, sessionId }, navigation)
              if (!navigation?.aborted) ctx.uiWorkspace.openSession(sessionId)
            },
          }) }, props => h(WorkspaceSetupContext.Provider, { value: workspaceSetup }, h(Lobby, props))))
      },
    }
  },
})
