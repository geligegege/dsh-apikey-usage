// dsh-apikey-usage — Client half.
//
// A left-sidebar panel icon (sidebar.panellist) plus the matching main panel that
// renders per-API-key daily token usage and estimated cost. Data comes from the
// Host half over the private route /dsh-apikey-usage/api/<method>.

window.__ModuleLoader__.load({
  id: 'dsh-apikey-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const PANEL_ID = 'apikey-usage'
    const NS = 'apikey-usage'
    const API = '/dsh-apikey-usage/api/'

    // ---------- i18n ----------

    const DICTS = {
      en: {
        'title': 'API key usage',
        'subtitle': 'Estimated daily tokens and cost per API key, derived from local session logs.',
        'range.7': '7 days',
        'range.30': '30 days',
        'range.90': '90 days',
        'action.refresh': 'Refresh',
        'action.save': 'Save prices',
        'action.reset': 'Reset',
        'tile.todayTokens': 'Tokens today',
        'tile.todayCost': 'Cost today',
        'tile.weekCost': 'Last 7 days',
        'tile.monthCost': 'Last 30 days',
        'label.date': 'Date',
        'label.requests': 'Calls',
        'label.input': 'Input',
        'label.cacheRead': 'Cache read',
        'label.cacheWrite': 'Cache write',
        'label.output': 'Output',
        'label.tokens': 'Tokens',
        'label.cost': 'Cost',
        'label.total': 'Total',
        'empty.title': 'No usage recorded yet',
        'empty.hint': 'Usage appears here after this profile makes model calls. Messages from every workspace are counted once.',
        'loading': 'Loading usage…',
        'error.title': 'Could not load usage',
        'meta.scanned': 'sessions scanned',
        'meta.updated': 'updated',
        'price.title': 'Pricing (CNY per 1M tokens)',
        'price.hint': 'Costs are estimates. Edit a model price and save; it applies to the whole history immediately.',
        'price.model': 'Model',
        'price.saved': 'Prices saved.',
        'price.failed': 'Could not save prices.',
        'note.estimate': 'Estimated from the price table below.',
        'note.noKey': 'No credential name resolved for this route.',
      },
      zh: {
        'title': 'API Key 用量',
        'subtitle': '按 API Key 统计每天的 Token 用量与预估花费（数据来自本地会话日志）。',
        'range.7': '7 天',
        'range.30': '30 天',
        'range.90': '90 天',
        'action.refresh': '刷新',
        'action.save': '保存价目',
        'action.reset': '恢复默认',
        'tile.todayTokens': '今日 Tokens',
        'tile.todayCost': '今日花费',
        'tile.weekCost': '近 7 天花费',
        'tile.monthCost': '近 30 天花费',
        'label.date': '日期',
        'label.requests': '调用',
        'label.input': '输入',
        'label.cacheRead': '缓存读',
        'label.cacheWrite': '缓存写',
        'label.output': '输出',
        'label.tokens': 'Tokens',
        'label.cost': '花费',
        'label.total': '合计',
        'empty.title': '还没有用量数据',
        'empty.hint': '当前 profile 发起模型调用后，这里就会出现统计。多个工作区的消息只计一次。',
        'loading': '正在加载用量…',
        'error.title': '无法加载用量',
        'meta.scanned': '个会话已扫描',
        'meta.updated': '更新于',
        'price.title': '价目设置（元 / 百万 tokens）',
        'price.hint': '花费为估算值。修改某个模型的价格并保存后，会立即作用于全部历史数据。',
        'price.model': '模型',
        'price.saved': '价目已保存。',
        'price.failed': '价目保存失败。',
        'note.estimate': '按下方价目表估算。',
        'note.noKey': '该路由未解析出凭据名。',
      },
    }

    async function rpc(name, args) {
      const response = await fetch(API + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const payload = await response.json()
      if (payload && payload.ok === false) throw new Error(payload.error || 'request failed')
      return payload
    }

    // ---------- formatting ----------

    const currencySymbol = (code) => (code === 'USD' ? '$' : code === 'CNY' || !code ? '¥' : code + ' ')

    function group(int) {
      return String(Math.round(int)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function compact(int) {
      const value = Number(int) || 0
      if (value >= 1e6) return (value / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
      if (value >= 1e3) return (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
      return String(Math.round(value))
    }

    function money(value, code) {
      const amount = Number(value) || 0
      const digits = amount > 0 && amount < 1 ? 4 : 2
      return currencySymbol(code) + amount.toFixed(digits)
    }

    function clock(time) {
      try {
        const d = new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : String(n))
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
      } catch {
        return '—'
      }
    }

    // ---------- styles ----------

    const CSS = `
.akup-root{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;}
.akup-inner{max-width:1000px;margin:0 auto;padding:26px 30px 72px;}
.akup-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.akup-title{margin:0;font-size:19px;font-weight:600;letter-spacing:.01em;}
.akup-sub{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);max-width:62ch;}
.akup-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.akup-range{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:hidden;}
.akup-range button{border:0;background:transparent;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:6px 11px;cursor:pointer;}
.akup-range button[data-on="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}
.akup-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:9px;font:inherit;font-size:12px;padding:6px 12px;cursor:pointer;}
.akup-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.akup-btn:disabled{opacity:.55;cursor:default;}
.akup-btn.akup-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600;}
.akup-meta{margin-top:10px;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.akup-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-top:18px;}
.akup-tile{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;}
.akup-tile-k{font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.akup-tile-v{margin-top:5px;font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;}
.akup-card{margin-top:16px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:13px;overflow:hidden;}
.akup-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap;}
.akup-key{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.akup-key-name{font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;}
.akup-chip{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}
.akup-key-sum{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;}
.akup-key-sum b{color:var(--dsw-alias-label-primary);font-weight:600;}
.akup-chart{display:flex;align-items:flex-end;gap:2px;height:66px;padding:12px 16px 0;}
.akup-bar{flex:1;min-width:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary);}
.akup-chart-axis{display:flex;justify-content:space-between;padding:4px 16px 10px;font-size:10.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);}
.akup-scroll{overflow:auto;}
.akup-table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;}
.akup-table th{font-weight:500;font-size:11.5px;color:var(--dsw-alias-label-secondary);text-align:right;padding:8px 12px;white-space:nowrap;border-bottom:1px solid var(--dsw-alias-border-l1);}
.akup-table td{text-align:right;padding:7px 12px;white-space:nowrap;border-bottom:1px solid var(--dsw-alias-border-l1);}
.akup-table th:first-child,.akup-table td:first-child{text-align:left;}
.akup-table tr:last-child td{border-bottom:0;}
.akup-table tr[data-total="true"] td{font-weight:600;background:var(--dsw-alias-bg-layer-2);}
.akup-models{display:flex;flex-wrap:wrap;gap:6px 14px;padding:10px 16px 13px;font-size:11.5px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1);}
.akup-model b{color:var(--dsw-alias-label-primary);font-weight:600;}
.akup-empty{margin-top:22px;border:1px dashed var(--dsw-alias-border-l2);border-radius:13px;padding:38px 20px;text-align:center;color:var(--dsw-alias-label-secondary);}
.akup-empty h3{margin:0 0 6px;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);}
.akup-empty p{margin:0;font-size:12.5px;line-height:1.55;}
.akup-error{margin-top:18px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:12px;padding:12px 14px;font-size:12.5px;color:var(--dsw-alias-state-error-primary);}
.akup-prices{margin-top:22px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:13px;padding:0 16px;}
.akup-prices summary{cursor:pointer;padding:13px 0;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);}
.akup-prices-hint{margin:0 0 12px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);}
.akup-price-row{display:grid;grid-template-columns:minmax(120px,1.4fr) repeat(4,minmax(64px,1fr));gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l1);}
.akup-price-row span{font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.akup-price-row input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:4px 7px;text-align:right;}
.akup-price-model{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.akup-price-actions{display:flex;align-items:center;gap:8px;padding:12px 0 14px;}
.akup-price-msg{font-size:11.5px;color:var(--dsw-alias-label-secondary);}
`

    // ---------- hooks ----------

    function useLocaleId(locale) {
      const subscribe = React.useCallback(
        (callback) => (locale && typeof locale.subscribe === 'function' ? locale.subscribe(callback) : () => {}),
        [locale],
      )
      const snapshot = React.useCallback(() => {
        try {
          if (locale && typeof locale.getSnapshot === 'function') return locale.getSnapshot().active
        } catch {
          /* ignore */
        }
        return 'en'
      }, [locale])
      return React.useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    function useSummary(days) {
      const [state, setState] = React.useState({ loading: true, data: null, error: null, busy: false })

      const load = React.useCallback(
        async (mode) => {
          setState((previous) => ({ ...previous, busy: true, error: null }))
          try {
            const data = await rpc(mode === 'scan' ? 'scan' : 'summary', { days })
            setState({ loading: false, data, error: null, busy: false })
          } catch (error) {
            setState((previous) => ({ loading: false, data: previous.data, error: String((error && error.message) || error), busy: false }))
          }
        },
        [days],
      )

      React.useEffect(() => {
        let cancelled = false
        ;(async () => {
          try {
            const data = await rpc('summary', { days })
            if (!cancelled) setState({ loading: false, data, error: null, busy: false })
          } catch (error) {
            if (!cancelled) setState((previous) => ({ loading: false, data: previous.data, error: String((error && error.message) || error), busy: false }))
          }
        })()
        return () => {
          cancelled = true
        }
      }, [days])

      React.useEffect(() => {
        const timer = setInterval(() => {
          load('summary')
        }, 60000)
        return () => clearInterval(timer)
      }, [load])

      return [state, load]
    }

    // ---------- views ----------

    function Chart({ days, max, code, t }) {
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'akup-chart', role: 'img', 'aria-label': t('label.tokens') },
          days.map((day) => {
            const ratio = max > 0 ? day.tokens / max : 0
            const height = day.tokens > 0 ? Math.max(ratio * 100, 4) : 1.5
            return h('div', {
              key: day.date,
              className: 'akup-bar',
              title: day.date + ' · ' + compact(day.tokens) + ' tokens · ' + money(day.cost, code),
              style: { height: height + '%', opacity: day.tokens > 0 ? 0.92 : 0.16 },
            })
          }),
        ),
        h(
          'div',
          { className: 'akup-chart-axis' },
          h('span', null, days.length ? days[0].date.slice(5) : ''),
          h('span', null, days.length ? days[days.length - 1].date.slice(5) : ''),
        ),
      )
    }

    function DayTable({ rows, totals, code, t }) {
      return h(
        'div',
        { className: 'akup-scroll' },
        h(
          'table',
          { className: 'akup-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, t('label.date')),
              h('th', null, t('label.requests')),
              h('th', null, t('label.input')),
              h('th', null, t('label.cacheRead')),
              h('th', null, t('label.output')),
              h('th', null, t('label.tokens')),
              h('th', null, t('label.cost')),
            ),
          ),
          h(
            'tbody',
            null,
            rows.map((day) =>
              h(
                'tr',
                { key: day.date },
                h('td', null, day.date),
                h('td', null, group(day.requests)),
                h('td', null, group(day.input)),
                h('td', null, group(day.cacheRead)),
                h('td', null, group(day.output)),
                h('td', null, group(day.tokens)),
                h('td', null, money(day.cost, code)),
              ),
            ),
            h(
              'tr',
              { 'data-total': 'true' },
              h('td', null, t('label.total')),
              h('td', null, group(totals.requests)),
              h('td', null, group(totals.input)),
              h('td', null, group(totals.cacheRead)),
              h('td', null, group(totals.output)),
              h('td', null, group(totals.tokens)),
              h('td', null, money(totals.cost, code)),
            ),
          ),
        ),
      )
    }

    function KeyCard({ entry, dates, code, t }) {
      const byDate = React.useMemo(() => {
        const map = new Map()
        for (const day of entry.days) map.set(day.date, day)
        return map
      }, [entry])

      const series = React.useMemo(
        () => dates.map((date) => byDate.get(date) || { date, tokens: 0, cost: 0, requests: 0 }),
        [byDate, dates],
      )
      const max = React.useMemo(() => series.reduce((peak, day) => Math.max(peak, day.tokens), 0), [series])
      const activeRows = React.useMemo(() => entry.days.filter((day) => day.requests > 0).slice().reverse(), [entry])

      return h(
        'section',
        { className: 'akup-card' },
        h(
          'div',
          { className: 'akup-card-head' },
          h(
            'div',
            { className: 'akup-key' },
            h('span', { className: 'akup-key-name' }, entry.label),
            entry.key !== entry.label ? h('span', { className: 'akup-chip' }, entry.key) : null,
            entry.providers.length
              ? h('span', { className: 'akup-chip' }, entry.providers.join(', '))
              : null,
          ),
          h(
            'div',
            { className: 'akup-key-sum' },
            h('span', null, compact(entry.totals.tokens), ' tokens'),
            ' · ',
            h('b', null, money(entry.cost, code)),
            ' · ',
            h('span', null, group(entry.totals.requests), ' ', t('label.requests')),
          ),
        ),
        h(Chart, { days: series, max, code, t }),
        activeRows.length ? h(DayTable, { rows: activeRows, totals: entry.totals, code, t }) : null,
        entry.models.length
          ? h(
              'div',
              { className: 'akup-models' },
              entry.models.map((model) =>
                h(
                  'span',
                  { key: model.model, className: 'akup-model' },
                  h('b', null, model.model),
                  ' · ',
                  compact(model.tokens),
                  ' · ',
                  money(model.cost, code),
                ),
              ),
            )
          : null,
      )
    }

    function PriceEditor({ data, code, t, onSaved }) {
      const [draft, setDraft] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState('')

      React.useEffect(() => {
        const next = {}
        for (const model of Object.keys(data.prices || {})) next[model] = { ...data.prices[model] }
        setDraft(next)
      }, [data.generatedAt])

      const models = React.useMemo(() => {
        const list = new Set(Object.keys(draft))
        for (const model of data.models || []) list.add(model)
        return Array.from(list).sort()
      }, [draft, data.models])

      const update = (model, field, value) => {
        const parsed = Number(value)
        setDraft((previous) => {
          const current = previous[model] ? { ...previous[model] } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
          current[field] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
          return { ...previous, [model]: current }
        })
      }

      const save = async (reset) => {
        setBusy(true)
        setMessage('')
        try {
          const result = await rpc('prices', reset ? { reset: true, days: data.rangeDays } : { prices: draft, days: data.rangeDays })
          onSaved(result)
          setMessage(t('price.saved'))
        } catch {
          setMessage(t('price.failed'))
        } finally {
          setBusy(false)
        }
      }

      const fields = ['input', 'output', 'cacheRead', 'cacheWrite']

      return h(
        'details',
        { className: 'akup-prices' },
        h('summary', null, t('price.title')),
        h('p', { className: 'akup-prices-hint' }, t('price.hint')),
        h(
          'div',
          { className: 'akup-price-row' },
          h('span', null, t('price.model')),
          h('span', null, t('label.input')),
          h('span', null, t('label.output')),
          h('span', null, t('label.cacheRead')),
          h('span', null, t('label.cacheWrite')),
        ),
        models.map((model) => {
          const price = draft[model] || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
          return h(
            'div',
            { className: 'akup-price-row', key: model },
            h('span', { className: 'akup-price-model', title: model }, model),
            fields.map((field) =>
              h('input', {
                key: field,
                type: 'number',
                min: '0',
                step: '0.01',
                value: String(price[field] ?? 0),
                'aria-label': model + ' ' + t('label.' + field),
                onChange: (event) => update(model, field, event.target.value),
              }),
            ),
          )
        }),
        h(
          'div',
          { className: 'akup-price-actions' },
          h('button', { className: 'akup-btn akup-primary', type: 'button', disabled: busy, onClick: () => save(false) }, t('action.save')),
          h('button', { className: 'akup-btn', type: 'button', disabled: busy, onClick: () => save(true) }, t('action.reset')),
          h('span', { className: 'akup-price-msg' }, message),
        ),
      )
    }

    function Panel({ locale }) {
      const activeId = useLocaleId(locale)
      const t = React.useCallback((key) => translateFrom(activeId, key), [activeId])

      const [days, setDays] = React.useState(30)
      const [state, load] = useSummary(days)
      const data = state.data
      const code = (data && data.currency) || 'CNY'

      const tiles = [
        { key: 'tile.todayTokens', value: data ? compact(data.today.tokens) : '—' },
        { key: 'tile.todayCost', value: data ? money(data.today.cost, code) : '—' },
        { key: 'tile.weekCost', value: data ? money(data.last7.cost, code) : '—' },
        { key: 'tile.monthCost', value: data ? money(data.last30.cost, code) : '—' },
      ]

      return h(
        'div',
        { className: 'akup-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'akup-inner' },
          h(
            'div',
            { className: 'akup-head' },
            h(
              'div',
              null,
              h('h1', { className: 'akup-title' }, t('title')),
              h('p', { className: 'akup-sub' }, t('subtitle')),
            ),
            h(
              'div',
              { className: 'akup-tools' },
              h(
                'div',
                { className: 'akup-range', role: 'group' },
                [7, 30, 90].map((value) =>
                  h(
                    'button',
                    {
                      key: value,
                      type: 'button',
                      'data-on': String(days === value),
                      'aria-pressed': days === value,
                      onClick: () => setDays(value),
                    },
                    t('range.' + value),
                  ),
                ),
              ),
              h(
                'button',
                { className: 'akup-btn', type: 'button', disabled: state.busy, onClick: () => load('scan') },
                t('action.refresh'),
              ),
            ),
          ),
          data
            ? h(
                'div',
                { className: 'akup-meta' },
                t('meta.updated') + ' ' + clock(data.generatedAt),
                ' · ',
                String(data.meta.scannedSessions) + ' ' + t('meta.scanned'),
                data.meta.scanning ? ' · …' : '',
              )
            : null,
          state.error
            ? h('div', { className: 'akup-error' }, t('error.title') + ': ' + state.error)
            : null,
          h(
            'div',
            { className: 'akup-tiles' },
            tiles.map((tile) =>
              h(
                'div',
                { className: 'akup-tile', key: tile.key },
                h('div', { className: 'akup-tile-k' }, t(tile.key)),
                h('div', { className: 'akup-tile-v' }, tile.value),
              ),
            ),
          ),
          state.loading && !data
            ? h('div', { className: 'akup-empty' }, h('p', null, t('loading')))
            : null,
          data && data.keys.length === 0
            ? h(
                'div',
                { className: 'akup-empty' },
                h('h3', null, t('empty.title')),
                h('p', null, t('empty.hint')),
              )
            : null,
          data
            ? data.keys.map((entry) =>
                h(KeyCard, { key: entry.key, entry, dates: data.dates, code, t }),
              )
            : null,
          data && data.keys.length
            ? h(PriceEditor, {
                data,
                code,
                t,
                onSaved: (result) => {
                  if (result && result.ok) {
                    // Keep the panel in sync without a second Host round trip.
                    load('summary')
                  }
                },
              })
            : null,
          data && data.keys.length ? h('p', { className: 'akup-meta' }, t('note.estimate')) : null,
        ),
      )
    }

    // The locale service is optional; the panel falls back to English without it.
    let localeService = null

    function activeLocaleId() {
      try {
        if (localeService && typeof localeService.getSnapshot === 'function') {
          return String(localeService.getSnapshot().active || 'en')
        }
      } catch {
        /* ignore */
      }
      return 'en'
    }

    function translateFrom(localeId, key) {
      const id = String(localeId || 'en')
      let dict = DICTS[id]
      if (!dict) {
        for (const candidate of Object.keys(DICTS)) {
          if (id === candidate || id.startsWith(candidate + '-')) {
            dict = DICTS[candidate]
            break
          }
        }
      }
      const source = dict || DICTS.en
      return source[key] || DICTS.en[key] || key
    }

    function Icon(props) {
      const size = Number(props && props.size) || 20
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', { d: 'M4 19v-7' }),
        h('path', { d: 'M10 19V6' }),
        h('path', { d: 'M16 19v-4' }),
        h('path', { d: 'M2 21h20' }),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        localeService = locale && typeof locale.getSnapshot === 'function' ? locale : null
        if (locale && typeof locale.register === 'function') {
          for (const id of Object.keys(DICTS)) {
            // One effect per dictionary: an unsupported locale never blocks the others.
            ctx.effect(() => {
              try {
                return locale.register(NS, id, DICTS[id])
              } catch {
                return () => {}
              }
            })
          }
        }

        const label = () => translateFrom(activeLocaleId(), 'title')
        const WithLocale = (props) => h(Panel, { ...props, locale })

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label },
            Icon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, WithLocale),
        )
      },
    }
  },
})
