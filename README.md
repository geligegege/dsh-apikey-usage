# dsh-apikey-usage

DSH（DeepSeek Harness）Web UI 插件：在**左侧栏**加一个入口，点开就能看到**每个 API Key 每天的 Token 用量与预估花费**。

> 纯 JavaScript，无依赖、无构建步骤；Host 半端读会话日志，Client 半端用 React 渲染面板。

---

## ✨ 功能

| 能力 | 说明 |
| --- | --- |
| 左侧栏入口 | 注册到 `sidebar.panellist`，图标排在「插件」「日程」之后 |
| 独立面板 | 注册到 `main` 槽位，点侧栏图标切换到全宽视图 |
| 每日统计 | 每个 Key 一张卡片：每日柱状图 + 明细表（日期 / 调用数 / 输入 / 缓存读 / 输出 / Tokens / 花费） |
| 汇总卡片 | 今日 Tokens、今日花费、近 7 天花费、近 30 天花费 |
| 时间范围 | 7 / 30 / 90 天切换 |
| Key 归因 | 按 provider 路由 → 凭据名（`DEEPSEEK_API_KEY`、`KSYUN_API_KEY` …）自动归属 |
| 模型明细 | 每个 Key 下按模型列出 Tokens 与花费 |
| 价目可编辑 | 面板底部按模型改「元 / 百万 tokens」价目，保存后**立即重算全部历史** |
| 实时 + 增量 | 监听 `session/event` 实时累加；面板每 60 秒自动刷新，也可手动刷新 |
| 本地优先 | 完全本地计算，不发任何网络请求，不读取 Key 明文 |

## 🖼 界面预览

> 下面两张是**占位图**。拿到真实截图后，按同名覆盖 `docs/images/sidebar.png`、`docs/images/panel.png` 即可自动显示，**不用改本文档**。拍摄清单与建议尺寸见 [docs/images/README.md](docs/images/README.md)。

### 左侧栏入口

<img width="259" height="298" alt="image" src="https://github.com/user-attachments/assets/34fdd46e-5af7-434b-8a2f-92bae0fa8cb8" />


### 用量面板

<img width="1066" height="1011" alt="image" src="https://github.com/user-attachments/assets/696b4da2-49c7-4eb1-9fe0-25288b76d72e" />


<details>
<summary>没有截图时，先看文字版布局</summary>

```text
┌──────────────┬─────────────────────────────────────────────────────────┐
│ 侧栏          │  API Key 用量                 [7天][30天][90天] [刷新]  │
│              │  按 API Key 统计每天的 Token 用量与预估花费              │
│  💬 会话      │  ┌────────┬────────┬────────┬────────┐                 │
│  🧩 插件      │  │今日Token│今日花费 │近7天    │近30天   │                │
│  🗓 日程      │  └────────┴────────┴────────┴────────┘                 │
│  📊 用量 ←新  │  ┌─────────────────────────────────────┐                │
│              │  │ KSYUN_API_KEY       123.8M · ¥82.49 │                │
│              │  │ ▁▂▃▅▂▁▃▅▇▅▃▂▁▂▃▅▇▅▃▂▁▂▃▅ 柱状图    │                │
│              │  │ 日期  调用  输入  缓存读  输出  花费 │                │
│              │  │ ...                                │                │
│              │  └─────────────────────────────────────┘                │
│              │  ▶ 价目设置（元 / 百万 tokens）                          │
└──────────────┴─────────────────────────────────────────────────────────┘
```

</details>


## 📥 安装

安装会把本目录作为 bundle 链接进当前 profile（开发态 `link:`），并自动开启。

**方式一：Web 界面（推荐）**

1. 侧栏进入 **插件（Plugins）**。
2. 点 **Add plugin**，填入本仓库的**绝对路径**（也可以填 GitHub 地址，见方式三）。
3. **Install**，装完刷新页面，侧栏出现 📊 图标。

**方式二：让 Agent 装**

在 DSH 里直接说：

> 把 `C:\path\to\dsh-apikey-usage` 这个目录作为 bundle 安装到当前 profile。

Agent 会调用 `plugin_manager` 的 `install_bundle`（等同于方式一）。

**方式三：从 GitHub 装**

把仓库推上去后，在 **Add plugin** 里填：

```text
github:<你的用户名>/dsh-apikey-usage
```

> `dsh plugin --profile desktop add <spec>` 只会加依赖，不会自动选中 bundle；要用插件页或 `plugin_manager`。

部署细节、验证清单、升级/卸载、故障排查见 **[docs/deployment.md](docs/deployment.md)**。

## 🚀 使用

- 点左侧栏 📊 图标 → 打开用量面板。
- 顶部切 7 / 30 / 90 天；右上「刷新」会重新扫描会话日志（增量）。
- 每个 Key 卡片：柱状图看趋势，表格看每天明细，底部列出该 Key 用过的模型。
- 面板底部「价目设置」：改完点「保存价目」，历史花费立即重算；「恢复默认」清空自定义价目。

## 📊 数据与计算口径

**Token 来自会话日志，是准的；花费是估算。**

- 数据源：当前 profile 的会话日志（`ctx.sessionQuery`），取 `assistant/message` 事件里的 `usage` 和 `message.source`。
- 归因：`usage` 只带 provider 路由（如 `ksyun`、`deepseek-official`），插件把 provider 映射为凭据名：
  1. 配置文件 `keyLabels` 里的显式映射（优先级最高）
  2. `llm-pi-ai` 的 `providers.<id>.apiKeyEnv`
  3. provider 声明里的 `nativeAuth.env`
  4. 内置映射：`deepseek` / `deepseek-official` → `DEEPSEEK_API_KEY`
- 统计窗口：启动时回溯最近 **180 天**、最多 **200 个会话**；之后按 `session/event` 增量累加。
- 花费：`tokens / 1e6 × 单价`，单价按模型匹配（精确 → 前缀 → `*` 兜底），单位「元 / 百万 tokens」。
- 默认价目（**估算口径**，请按你的渠道改）：

| 模型 | 输入 | 缓存读 | 缓存写 | 输出 |
| --- | --- | --- | --- | --- |
| `deepseek-chat` | 2 | 0.5 | 0 | 8 |
| `deepseek-reasoner` | 4 | 1 | 0 | 16 |
| `*`（兜底） | 2 | 0.5 | 0 | 8 |

## ⚙️ 配置

运行时配置写在插件目录的 `apikey-usage-config.json`（已加入 `.gitignore`，不入库）：

```json
{
  "prices": {
    "deepseek-v4.1-flash-1017": { "input": 2, "output": 8, "cacheRead": 0.5, "cacheWrite": 0 }
  },
  "keyLabels": {
    "deepseek-official": "DEEPSEEK_API_KEY"
  },
  "currency": "CNY"
}
```

| 字段 | 说明 |
| --- | --- |
| `prices` | 模型 → 单价（元 / 百万 tokens）；覆盖默认价目 |
| `keyLabels` | provider 路由 → 显示名；用于合并显示名或给新 provider 命名 |
| `currency` | `CNY`（默认）或 `USD`，只影响符号 |

模板见 [`apikey-usage-config.example.json`](apikey-usage-config.example.json)。

## 🧩 目录结构

```text
dsh-apikey-usage/
├── package.json                  # bundle 清单：dsh.bundle.patch + dsh.client
├── cordis.patch.yml              # 插入 Loader 行 id: apikey-usage
├── index.js                      # Host 半端：扫描会话、聚合、价目、私有路由
├── client.js                     # Client 半端：侧栏图标 + main 面板
├── locale/en.json, zh.json       # 插件管理页显示用的标题/描述
├── icon.svg                      # 插件图标
├── docs/deployment.md            # 部署细节（安装/验证/升级/排错）
├── docs/images/                  # 截图目录（sidebar.png / panel.png 现为占位图）
├── CHANGELOG.md
├── LICENSE
└── .gitignore
```

## 🔌 私有接口

Client 通过 `POST /dsh-apikey-usage/api/<method>` 取数据（路由由 `ctx.effect` 托管，插件卸载自动注销）：

| method | 参数 | 返回 |
| --- | --- | --- |
| `summary` | `{ days }` | 聚合结果（keys / dates / totals / today / last7 / last30 / prices / meta） |
| `scan` | `{ days }` | 重新增量扫描后返回同样的聚合 |
| `prices` | `{ prices }` 或 `{ reset: true }` | 保存/清空价目并返回聚合 |

```bash
# 查看当前聚合（把 55342 换成你 Web UI 的端口）
curl -s -X POST http://127.0.0.1:55342/dsh-apikey-usage/api/summary \
  -H 'Content-Type: application/json' -d '{"days":7}'
```

## ⚠️ 限制

- 归因粒度是 **provider 路由**：同一个 Key 配成两个 provider 会显示两行（可用 `keyLabels` 让显示名一致，但仍是两行）。
- 只统计本 profile 会话日志里还能读到的会话；删除过的会话不计入。
- 花费是估算：第三方渠道（ksyun 等）的实际单价请自行改价目。
- 面板依赖 Web 组合的 `webServer` 与 `clientModules` 服务；无 Web carrier 的环境（纯 CLI）不会显示面板。

## 🛠 开发

- 修改 `client.js` / `index.js` 后，DSH 不会自动重载静态 bundle：在插件页把该 bundle **关掉再打开**（或重启 DSH）即可加载新代码；浏览器侧再刷新一次页面。
- 语法检查：`node --check index.js && node --check client.js`。
- 插件行 id 固定为 `apikey-usage`，侧栏/主区两个槽位的 id/key 都是它；改 id 需要同时改 `cordis.patch.yml` 与 `client.js` 里的 `PANEL_ID`。

## 📄 许可

[MIT](LICENSE)
