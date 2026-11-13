const encoder = new TextEncoder()
const update = encoder.encode('data: changed\n\n')
const report = encoder.encode('event: report\ndata: changed\n\n')
const both = new Uint8Array([...update, ...report])
const keepAlive = encoder.encode(': heartbeat\n\n')

export function matchEvents() {
  const clients = new Set()
  const changed = new Set()
  const reports = new Set()
  let all = false
  let flush
  let closed = false

  function notify(sessionId, topic) {
    if (!clients.size || closed) return
    if (topic === 'report') reports.add(sessionId)
    else if (sessionId) changed.add(sessionId)
    else all = true
    flush ??= setTimeout(() => {
      flush = undefined
      for (const client of clients) {
        const gearChanged = all || changed.has(client.id)
        const reportChanged = reports.has(client.id)
        if (gearChanged && reportChanged) client.write(both)
        else if (gearChanged) client.write(update)
        else if (reportChanged) client.write(report)
      }
      changed.clear()
      reports.clear()
      all = false
    }, 35)
  }

  function connect(request) {
    const id = new URL(request.url).searchParams.get('sessionId')
    if (!id || id.length > 512) return new Response(null, { status: 400 })
    if (closed) return new Response(null, { status: 503 })
    const signal = request.signal
    let cancel
    const body = new ReadableStream({
      start(controller) {
        if (signal.aborted) { controller.close(); return }
        function write(bytes) {
          if (controller.desiredSize > 0) controller.enqueue(bytes)
        }
        const client = { id, write, close: () => cancel(true) }
        const heartbeat = setInterval(() => write(keepAlive), 20_000)
        cancel = finish => {
          if (!clients.delete(client)) return
          clearInterval(heartbeat)
          signal.removeEventListener('abort', client.close)
          if (finish) controller.close()
        }
        clients.add(client)
        signal.addEventListener('abort', client.close, { once: true })
        write(update)
      },
      cancel() { cancel?.(false) },
    })
    return new Response(body, { headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    } })
  }

  function close() {
    closed = true
    clearTimeout(flush)
    changed.clear()
    reports.clear()
    for (const client of clients) client.close()
  }
  return { connect, notify, close }
}
