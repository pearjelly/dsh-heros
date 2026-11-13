export const compactionActivity = {
  id: 'compact-context',
  name: '压缩上下文',
  detail: '在本局积累对话后，可用 /compact 发起压缩。启用了自动压缩时，成功生成的摘要也可计入。',
}

export function observeCompaction() {
  const pending = new WeakMap()
  return (session, event, source) => {
    const { compactionId } = event.data
    if (event.type === 'compaction/start') {
      if (source && typeof compactionId === 'string') pending.set(session, { compactionId, source, summarized: false })
      else pending.delete(session)
      return
    }
    const active = pending.get(session)
    if (!active || active.compactionId !== compactionId) return
    if (event.type === 'compaction/summary') {
      active.summarized = Array.isArray(event.data.shadowedSeqs) && event.data.shadowedSeqs.length > 0
      return
    }
    pending.delete(session)
    if (active.summarized && event.data.error === undefined && active.source.sourceId === source?.sourceId) return source
  }
}
