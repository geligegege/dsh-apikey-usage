// dsh-apikey-usage — Host half.
//
// Derives per-API-key daily token usage from the durable session logs, prices it
// with an editable price table, and exposes the aggregate to the Client half over
// two private JSON routes (POST /apikey-usage/api/<method>).

export const inject = ['webServer']

const API_PREFIX = '/dsh-apikey-usage/api/'
const PACKAGE_ID = 'dsh-apikey-usage'
const SETTINGS_FILE = 'apikey-usage-config.json'
const DAY_MS = 86400000

// Prices are CNY per 1,000,000 tokens. `*` is the fallback for unknown models.
// These are editable at runtime from the panel; the file wins over these defaults.
const DEFAULT_PRICES = {
  'deepseek-chat': { input: 2, cacheRead: 0.5, cacheWrite: 0, output: 8 },
  'deepseek-reasoner': { input: 4, cacheRead: 1, cacheWrite: 0, output: 16 },
  deepseek: { input: 2, cacheRead: 0.5, cacheWrite: 0, output: 8 },
  '*': { input: 2, cacheRead: 0.5, cacheWrite: 0, output: 8 },
}

const BUILTIN_KEY_LABELS = {
  deepseek: 'DEEPSEEK_API_KEY',
  'deepseek-official': 'DEEPSEEK_API_KEY',
  'deepseek-account': 'DeepSeek account',
}

export function apply(ctx) {
  const webServer = ctx.webServer
  const sessionQuery = ctx.get('sessionQuery')
  const configEditor = ctx.get('configEditor')
  const llm = ctx.get('llm')
  const clientModules = ctx.get('clientModules')

  const state = {
    // key -> Map(day -> Map(model -> counters))
    agg: new Map(),
    providersOfKey: new Map(),
    lastSeq: new Map(),
    scannedSessions: 0,
    lastScanAt: 0,
    scanning: false,
    error: null,
    settingsLoaded: false,
    settings: { prices: {}, keyLabels: {}, currency: 'CNY' },
  }

  // ---------- settings file ----------

  function dataDir() {
    try {
      if (clientModules) {
        const entry = clientModules.clientPath(PACKAGE_ID)
        if (entry) return entry.replace(/[\\/][^\\/]+$/, '')
      }
    } catch {
      /* ignore */
    }
    return process.cwd()
  }

  function settingsPath() {
    const sep = process.platform === 'win32' ? '\\' : '/'
    return dataDir() + sep + SETTINGS_FILE
  }

  async function loadSettings() {
    if (state.settingsLoaded) return
    state.settingsLoaded = true
    try {
      const fs = await import('node:fs')
      const file = settingsPath()
      if (!fs.existsSync(file)) return
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        if (parsed.prices && typeof parsed.prices === 'object' && !Array.isArray(parsed.prices)) {
          state.settings.prices = parsed.prices
        }
        if (parsed.keyLabels && typeof parsed.keyLabels === 'object' && !Array.isArray(parsed.keyLabels)) {
          state.settings.keyLabels = parsed.keyLabels
        }
        if (typeof parsed.currency === 'string' && parsed.currency.trim()) {
          state.settings.currency = parsed.currency.trim().slice(0, 8)
        }
      }
    } catch {
      /* a broken settings file falls back to defaults */
    }
  }

  async function saveSettings() {
    try {
      const fs = await import('node:fs')
      const file = settingsPath()
      fs.writeFileSync(file, JSON.stringify(state.settings, null, 2), 'utf8')
      return true
    } catch {
      return false
    }
  }

  // ---------- provider -> API key attribution ----------

  function resolveKeyLabels() {
    const labels = Object.assign({}, BUILTIN_KEY_LABELS, state.settings.keyLabels || {})
    try {
      if (configEditor && typeof configEditor.configuration === 'function') {
        for (const row of configEditor.configuration() || []) {
          if (!row) continue
          const merged = Object.assign({}, row.inherited || {}, row.override || {})
          const providers = merged.providers
          if (!providers || typeof providers !== 'object') continue
          for (const pid of Object.keys(providers)) {
            const entry = providers[pid]
            if (entry && typeof entry.apiKeyEnv === 'string' && entry.apiKeyEnv.trim()) {
              labels[pid] = entry.apiKeyEnv.trim()
            }
          }
        }
      }
    } catch {
      /* attribution stays at the provider route */
    }
    try {
      if (llm && typeof llm.listConfigurableProviders === 'function') {
        for (const entry of llm.listConfigurableProviders() || []) {
          if (!entry || !entry.provider) continue
          const env = entry.nativeAuth && Array.isArray(entry.nativeAuth.env) ? entry.nativeAuth.env : []
          const first = env.find((name) => typeof name === 'string' && name.trim())
          if (!labels[entry.provider] && first) labels[entry.provider] = first.trim()
        }
      }
    } catch {
      /* ignore */
    }
    return labels
  }

  // ---------- aggregation ----------

  function dayKeyOf(time) {
    const d = new Date(time)
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  function emptyCounters() {
    return { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  }

  function ingest(event) {
    const data = event && event.data
    if (!data) return
    const usage = data.usage
    if (!usage) return
    const source = (data.message && data.message.source) || {}
    // The provider route identifies the credential that paid for the call; the
    // human label (apiKeyEnv name) is resolved at read time.
    const provider = String(source.provider || 'unknown')
    const model = String(source.model || 'unknown')
    const keyId = provider

    const day = dayKeyOf(typeof event.time === 'number' ? event.time : Date.now())
    let days = state.agg.get(keyId)
    if (!days) {
      days = new Map()
      state.agg.set(keyId, days)
    }
    let models = days.get(day)
    if (!models) {
      models = new Map()
      days.set(day, models)
    }
    let counters = models.get(model)
    if (!counters) {
      counters = emptyCounters()
      models.set(model, counters)
    }
    counters.requests += 1
    counters.input += Number(usage.inputTokens) || 0
    counters.output += Number(usage.outputTokens) || 0
    counters.cacheRead += Number(usage.cacheReadTokens) || 0
    counters.cacheWrite += Number(usage.cacheWriteTokens) || 0

    let providers = state.providersOfKey.get(keyId)
    if (!providers) {
      providers = new Set()
      state.providersOfKey.set(keyId, providers)
    }
    providers.add(provider)
  }

  ctx.on('session/event', (session, event) => {
    if (!session || !event || typeof event.time !== 'number') return
    const id = String(session.id || '')
    if (!id) return
    const prev = state.lastSeq.get(id) || 0
    if (typeof event.seq === 'number' && event.seq > prev) state.lastSeq.set(id, event.seq)
    if (event.type !== 'assistant/message') return
    ingest(event)
  })

  async function scan(options = {}) {
    if (!sessionQuery) {
      state.scannedSessions = 0
      state.lastScanAt = Date.now()
      return
    }
    if (state.scanning) return
    state.scanning = true
    state.error = null
    const windowDays = Number(options.windowDays) || 180
    const maxSessions = Number(options.maxSessions) || 200
    const cutoff = Date.now() - windowDays * DAY_MS
    try {
      const records = await sessionQuery.listSessions()
      let scanned = 0
      for (const record of records) {
        if (!record || !record.header) continue
        if (typeof record.header.createdAt === 'number' && record.header.createdAt < cutoff) continue
        if (scanned >= maxSessions) break
        const id = String(record.header.id || '')
        if (!id) continue
        try {
          const snapshot = await sessionQuery.readSession(id)
          const events = snapshot && Array.isArray(snapshot.events) ? snapshot.events : []
          const maxSeq = state.lastSeq.get(id) || 0
          for (const event of events) {
            if (!event || typeof event.time !== 'number' || event.time < cutoff) continue
            if (typeof event.seq === 'number' && event.seq <= maxSeq) continue
            if (typeof event.seq === 'number') state.lastSeq.set(id, event.seq)
            if (event.type === 'assistant/message') ingest(event)
          }
          scanned += 1
        } catch {
          /* one unreadable session must not stop the scan */
        }
      }
      state.scannedSessions = scanned
      state.lastScanAt = Date.now()
    } catch (error) {
      state.error = String((error && error.message) || error).slice(0, 300)
    } finally {
      state.scanning = false
    }
  }

  // ---------- pricing ----------

  function effectivePrices() {
    const merged = Object.assign({}, DEFAULT_PRICES)
    for (const model of Object.keys(state.settings.prices || {})) {
      const entry = state.settings.prices[model]
      if (!entry || typeof entry !== 'object') continue
      const price = {}
      for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
        const value = Number(entry[field])
        price[field] = Number.isFinite(value) && value >= 0 ? value : 0
      }
      merged[model] = price
    }
    return merged
  }

  function priceFor(model, prices) {
    if (prices[model]) return prices[model]
    let best = null
    for (const key of Object.keys(prices)) {
      if (key === '*') continue
      if (model.startsWith(key) || key.startsWith(model)) {
        if (!best || key.length > best.length) best = key
      }
    }
    if (best) return prices[best]
    return prices['*'] || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  }

  function costOf(counters, price) {
    return (
      (counters.input / 1e6) * price.input +
      (counters.cacheRead / 1e6) * price.cacheRead +
      (counters.cacheWrite / 1e6) * price.cacheWrite +
      (counters.output / 1e6) * price.output
    )
  }

  // ---------- summary ----------

  function dateListFor(days) {
    const list = []
    const now = Date.now()
    for (let i = days - 1; i >= 0; i -= 1) list.push(dayKeyOf(now - i * DAY_MS))
    return list
  }

  function buildSummary(requestedDays) {
    const labels = resolveKeyLabels()
    const prices = effectivePrices()
    const rangeDays = Math.min(365, Math.max(1, Number(requestedDays) || 30))
    const dates = dateListFor(rangeDays)
    const dateSet = new Set(dates)
    const today = dates[dates.length - 1]

    const keys = []
    const modelSeen = new Set()
    const allTotals = emptyCounters()
    const allCost = { value: 0 }

    for (const [key, daysMap] of state.agg) {
      const keyDays = []
      const keyTotals = emptyCounters()
      let keyCost = 0
      const models = new Map()

      for (const date of dates) {
        const row = { date, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, cost: 0 }
        const modelsOfDay = daysMap.get(date)
        if (modelsOfDay) {
          for (const [model, counters] of modelsOfDay) {
            modelSeen.add(model)
            const price = priceFor(model, prices)
            const cost = costOf(counters, price)
            row.requests += counters.requests
            row.input += counters.input
            row.output += counters.output
            row.cacheRead += counters.cacheRead
            row.cacheWrite += counters.cacheWrite
            row.cost += cost
            let modelRow = models.get(model)
            if (!modelRow) {
              modelRow = { model, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, cost: 0, price }
              models.set(model, modelRow)
            }
            modelRow.requests += counters.requests
            modelRow.input += counters.input
            modelRow.output += counters.output
            modelRow.cacheRead += counters.cacheRead
            modelRow.cacheWrite += counters.cacheWrite
            modelRow.cost += cost
          }
        }
        row.tokens = row.input + row.output + row.cacheRead + row.cacheWrite
        keyDays.push(row)
        keyTotals.requests += row.requests
        keyTotals.input += row.input
        keyTotals.output += row.output
        keyTotals.cacheRead += row.cacheRead
        keyTotals.cacheWrite += row.cacheWrite
        keyCost += row.cost
      }

      for (const modelRow of models.values()) {
        modelRow.tokens = modelRow.input + modelRow.output + modelRow.cacheRead + modelRow.cacheWrite
      }

      // Keep every key that has any lifetime usage, even when the range is empty.
      let lifetime = 0
      for (const [, modelsOfDay] of daysMap) {
        for (const counters of modelsOfDay.values()) lifetime += counters.requests
      }
      if (lifetime === 0) continue

      const providers = Array.from(state.providersOfKey.get(key) || [])
      keys.push({
        key,
        label: labels[key] || key,
        providers,
        days: keyDays,
        totals: Object.assign({}, keyTotals, {
          tokens: keyTotals.input + keyTotals.output + keyTotals.cacheRead + keyTotals.cacheWrite,
        }),
        cost: keyCost,
        lifetimeRequests: lifetime,
        models: Array.from(models.values()).sort((a, b) => b.tokens - a.tokens),
        hasRangeUsage: keyCost > 0 || keyDays.some((day) => day.requests > 0),
      })

      allTotals.requests += keyTotals.requests
      allTotals.input += keyTotals.input
      allTotals.output += keyTotals.output
      allTotals.cacheRead += keyTotals.cacheRead
      allTotals.cacheWrite += keyTotals.cacheWrite
      allCost.value += keyCost
    }

    keys.sort((a, b) => b.cost - a.cost || b.totals.tokens - a.totals.tokens || a.key.localeCompare(b.key))

    const totalsFor = (from, to) => {
      const result = { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, cost: 0 }
      for (const key of keys) {
        for (const day of key.days) {
          if (day.date < from || day.date > to) continue
          result.requests += day.requests
          result.input += day.input
          result.output += day.output
          result.cacheRead += day.cacheRead
          result.cacheWrite += day.cacheWrite
          result.tokens += day.tokens
          result.cost += day.cost
        }
      }
      return result
    }

    const last7From = dates[Math.max(0, dates.length - 7)]
    const last30From = dates[Math.max(0, dates.length - 30)]

    return {
      ok: true,
      generatedAt: Date.now(),
      currency: state.settings.currency,
      rangeDays,
      dates,
      keys,
      totals: Object.assign({}, allTotals, {
        tokens: allTotals.input + allTotals.output + allTotals.cacheRead + allTotals.cacheWrite,
        cost: allCost.value,
      }),
      today: totalsFor(today, today),
      last7: totalsFor(last7From, today),
      last30: totalsFor(last30From, today),
      prices,
      models: Array.from(modelSeen).sort(),
      meta: {
        scannedSessions: state.scannedSessions,
        lastScanAt: state.lastScanAt,
        scanning: state.scanning,
        error: state.error,
        hasSessionQuery: Boolean(sessionQuery),
        dateSetSize: dateSet.size,
        settingsPath: settingsPath(),
      },
    }
  }

  // ---------- private routes ----------

  function registerRoute(name, handler) {
    if (!webServer || typeof webServer.register !== 'function') return
    // Own the registration: the fiber removes these routes when the plugin unloads.
    ctx.effect(() =>
      webServer.register({
        kind: 'exact',
        path: API_PREFIX + name,
        handler: async (req, res) => {
          let body = ''
          try {
            for await (const chunk of req) body += chunk
          } catch {
            /* ignore a broken body */
          }
          let args = {}
          try {
            args = body ? JSON.parse(body) : {}
          } catch {
            args = {}
          }
          let result
          try {
            await loadSettings()
            result = await handler(args && typeof args === 'object' ? args : {})
          } catch (error) {
            result = { ok: false, error: String((error && error.message) || error).slice(0, 500) }
          }
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          res.end(JSON.stringify(result))
        },
      }),
    )
  }

  // A cold page may ask before the activation scan finished; wait for it so the
  // first paint is the real aggregate instead of an empty range.
  async function waitForScan(maxMs = 15000) {
    const started = Date.now()
    while (state.scanning && Date.now() - started < maxMs) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  registerRoute('summary', async (args) => {
    await loadSettings()
    await waitForScan()
    if (!state.lastScanAt && !state.scanning) await scan()
    return buildSummary(args.days)
  })

  registerRoute('scan', async (args) => {
    await loadSettings()
    await scan({ windowDays: args.windowDays, maxSessions: args.maxSessions })
    return buildSummary(args.days)
  })

  registerRoute('prices', async (args) => {
    await loadSettings()
    if (args && args.prices && typeof args.prices === 'object') {
      const next = {}
      for (const model of Object.keys(args.prices)) {
        const entry = args.prices[model]
        if (!entry || typeof entry !== 'object') continue
        const price = {}
        for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
          const value = Number(entry[field])
          if (Number.isFinite(value) && value >= 0) price[field] = value
        }
        next[model] = price
      }
      state.settings.prices = Object.assign({}, state.settings.prices, next)
      await saveSettings()
    }
    if (args && args.reset === true) {
      state.settings.prices = {}
      await saveSettings()
    }
    return buildSummary(args && args.days)
  })

  // Initial scan runs after activation settles; the page may ask for `scan` meanwhile.
  loadSettings().then(() => scan()).catch(() => {})
}
