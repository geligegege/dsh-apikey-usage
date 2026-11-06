# 部署细节（Deployment）

本文记录 `dsh-apikey-usage` 的安装、激活、验证、升级与排错。命令均在 **Windows + DSH Desktop** 验证过；Linux/macOS 只需替换路径写法。

---

## 1. 环境要求

| 项 | 要求 |
| --- | --- |
| DSH | 带 **Web GUI** 的 DSH（Desktop 或 `dsh web`），Host 需提供 `webServer` 与 `clientModules` 服务 |
| Profile | 任意（本文以 `desktop` 为例；`DSH_PROFILE` 决定当前 profile） |
| Node | 无需单独安装依赖；插件是纯 ESM JavaScript，无构建步骤 |
| 权限 | 安装/开关 bundle 属于 profile 级变更，需要 `danger-full-access` 或单次审批 |

确认环境：

```powershell
echo $env:DSH_PROFILE          # 例如 desktop
echo $env:DSH_PROFILE_DIR      # 例如 C:\Users\<you>\.dsh\profiles\desktop
```

---

## 2. 安装

### 2.1 从本地目录（开发/自用，推荐）

**Web 界面**：侧栏 **插件（Plugins）** → **Add plugin** → 填入本目录的**绝对路径** → **Install**。

**让 Agent 装**（等价）：

> 把 `C:\path\to\dsh-apikey-usage` 作为 bundle 安装到当前 profile。

Agent 内部调用 `plugin_manager`：

```jsonc
// action: install_bundle
{ "target": "C:\\path\\to\\dsh-apikey-usage" }
```

安装结果里关注三个字段：

| 字段 | 期望 | 含义 |
| --- | --- | --- |
| `application` | `applied` | 已生效；`failed` / `restart-required` 需处理 |
| `enabled` | `true` | bundle 已被选中（`dsh.profile.bundles`） |
| `warnings` | `[]` | 非空时按提示处理 |

安装会把本目录以 `link:` 形式写入 profile 依赖，**不会**复制代码；之后改源码只需重新加载（见 §6）。

> ⚠️ 不要手工改 profile 的 `package.json` / `cordis.patch.yml`，也不要手写 `dsh.profile.bundles`。用插件页或 `plugin_manager`，它负责依赖、bundle 选择、补丁层三件事。

### 2.2 从 GitHub

仓库推上去后，**Add plugin** 里填：

```text
github:<owner>/dsh-apikey-usage
```

或完整 Git 地址（tarball 也可）：

```text
https://github.com/<owner>/dsh-apikey-usage
```

Host 会在安装前做一次 `git ls-remote` 连通性检查（默认 5s 超时），再用 pnpm 拉取。私有仓库需要本机 Git 凭据已配置。

### 2.3 CLI 说明

`dsh plugin --profile desktop add <spec>` 只是把参数转给 profile 目录里的 pnpm，**不会自动选中 bundle**。只走 CLI 时，装完还要在插件页把 bundle 打开。

---

## 3. 激活后应看到什么

1. **侧栏**：图标列表末尾（`order: 20`，插件与日程之后）出现柱状图图标，tooltip/标题为「API Key 用量 / API Key Usage」。
2. **主区**：点图标切换到用量面板，标题、范围切换、汇总卡片、按 Key 的卡片、价目设置。
3. **插件页**：`dsh-apikey-usage` 卡片显示本仓库 `locale/*.json` 的标题与描述，以及 `icon.svg`。

如果只在插件页看到卡片、侧栏没图标：刷新一次页面（Client bundle 在页面加载时注册）。

---

## 4. 验证（不依赖截图）

### 4.1 路由自检

面板数据全部来自两个私有路由；直接请求即可验证 Host 半端：

```powershell
# 端口取当前 Web GUI 的 URL，例如 http://127.0.0.1:55342
$body = '{"days":7}'
Invoke-RestMethod -Uri 'http://127.0.0.1:55342/dsh-apikey-usage/api/summary' `
  -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 4
```

```bash
curl -s -X POST http://127.0.0.1:55342/dsh-apikey-usage/api/summary \
  -H 'Content-Type: application/json' -d '{"days":7}' | head -c 800
```

期望：

- `ok: true`
- `keys[]` 里每个元素带 `key`（provider 路由）、`label`（凭据名）、`totals`、`days[]`、`models[]`
- `meta.scannedSessions > 0`（没有会话时为 0，属正常）
- `meta.error` 为 `null`

### 4.2 槽位自检

在 DSH 里（或让 Agent）查询 Client 槽位：

- `sidebar.panellist` 的 occupants 应包含 `{ id: "apikey-usage", active: true }`
- `main` 的 occupants 应包含 `{ key: "apikey-usage", active: true }`

用 `cordis_inspect_query`：`platform: client`、`provider: Slots`、`method: listSubTree`、`input: { "root": "sidebar.panellist" }`（`main` 同理）。

### 4.3 功能自检

| 检查 | 方法 | 期望 |
| --- | --- | --- |
| 数据正确 | §4.1 返回的 `today.tokens` 与最近一次对话规模同量级 | 非 0 |
| 实时更新 | 发一轮新对话后等 ≤60s（或点刷新） | 数字增长 |
| 价目生效 | 面板改单价保存 | 该模型花费立即变化；配置文件写入 |
| 价目恢复 | 点「恢复默认」 | 自定义价目清空，回到内置价目 |
| 切换范围 | 7/30/90 天 | 表格与柱状图长度随之变化 |

---

## 5. 配置文件

位置：**插件目录**下的 `apikey-usage-config.json`（随安装目录，不入库）。

```json
{
  "prices": { "deepseek-v4.1-flash-1017": { "input": 2, "output": 8, "cacheRead": 0.5, "cacheWrite": 0 } },
  "keyLabels": { "deepseek-official": "DEEPSEEK_API_KEY" },
  "currency": "CNY"
}
```

- 文件不存在时使用内置默认价目，`keyLabels` 走自动解析。
- 面板保存价目时**整体重写**该文件（保留 `keyLabels` / `currency`）。
- 想给新 provider 起名或合并显示名，直接编辑 `keyLabels` 后刷新面板。
- 注意：文件里**不要**写 API Key 明文——插件只需要凭据名（如 `DEEPSEEK_API_KEY`）。

---

## 6. 升级与热加载

| 场景 | 做法 |
| --- | --- |
| 改了 `index.js`（Host） | 插件页把 bundle **关掉再打开**（或 `plugin_manager` `set_plugin` false→true），新代码随新 fiber 载入；无需重启 DSH |
| 改了 `client.js`（Client） | 重新加载 bundle 后**刷新页面**；只有 `pnpm run dev:web` 同时在跑时才会自动热更 |
| 改了 `package.json`（名称/入口） | 需要 `remove_bundle` → `install_bundle`（更换包名等于重装） |
| 换版本（GitHub 安装） | 插件页 Remove 后重新 Add，或对官方渠道用 Update |

> 实测：改动 Host 代码后不重载不会生效；关→开即可，且注册的路由会随 fiber 正常注销（本插件用 `ctx.effect` 托管路由）。

---

## 7. 卸载

插件页 → 该 bundle → **Remove**（或 `plugin_manager` `remove_bundle`，`target: "dsh-apikey-usage"`）。

- 移除 profile 依赖与 bundle 选择；**源码目录与配置文件保留**。
- 想彻底清理：删掉源码目录，并删除 profile 的 `node_modules/dsh-apikey-usage` 链接（Remove 已处理）。

---

## 8. 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 侧栏没有图标 | 页面没刷新 / bundle 未启用 / 注册被顶掉 | 刷新页面；插件页确认已开启；查 `sidebar.panellist` occupants |
| 面板空白但路由有数据 | Client bundle 旧版本（改了 `client.js` 未刷新） | 刷新页面 |
| 面板报「无法加载用量」 | 端口变了 / Host 未激活 / 路由被别的插件占用 | 用当前 Web URL 重试 §4.1；确认插件页状态 |
| `duplicate exact route "/dsh-apikey-usage/api/..."` | 旧 fiber 的路由没注销（早期版本未用 `ctx.effect` 托管） | 关→开 bundle；仍冲突则重启 DSH |
| 所有数字为 0 | 该 profile 没有会话日志，或会话超过 180 天 / 200 个上限 | 正常现象；调大 `scan` 参数需改代码 |
| 花费为 0 或明显偏低 | 模型不在价目表里，命中 `*` 兜底或 0 | 面板「价目设置」补该模型单价 |
| 两个 Key 显示成一行？ | 不会——归因按 provider 路由，同 Key 多 provider 会显示多行 | 用 `keyLabels` 统一显示名 |
| 显示 `noKey` 类原始键名 | 语言字典未注册 / 旧 bundle | 刷新页面；确认 UI 语言为 `zh` 或 `en` |
| 安装报权限错误 | 安装是 profile 级变更 | 给 `danger-full-access` 或批准该次操作 |

抓日志：

```powershell
# Host 侧插件加载/报错
Get-ChildItem "$env:DSH_HOME\profiles\$env:DSH_PROFILE\.plugin-manager\logs" -Recurse -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName
```

---

## 9. 打包与发布到 GitHub

```powershell
cd C:\Users\EDY\Documents\deepseek-harness\default-workspace\dsh-apikey-usage

# 首次提交前先配置身份（本机 git 未配置时会提交失败）
git config --global user.name  "<你的名字>"
git config --global user.email "<你的邮箱>"

git init -b main
git add .
git commit -m "feat: per-API-key daily token usage and cost panel"

git remote add origin https://github.com/<owner>/dsh-apikey-usage.git
git push -u origin main
```

### 9.1 推送认证

`error: remote origin already exists` 只是重复执行了 `git remote add`，改地址用 `git remote set-url origin <url>` 即可。

`fatal: could not read Username for 'https://github.com'`（或伴随 `failed to execute prompt script`、`WSL ... execvpe(/bin/bash) failed`）说明 **HTTPS 凭据链断了**：本机 `git config --system` 里配了 `credential.helper manager`，但 PATH 上找不到 `git-credential-manager`（MinGit 不捆绑），helper 失败后 git 退化到终端提示，而终端提示又不可用。

**A. SSH（推荐）**

```powershell
# 1) 本地生成专用密钥（无口令；-N '""' 是 PowerShell 传空口令的写法）
ssh-keygen -t ed25519 -C "<你的邮箱>" -f "$env:USERPROFILE\.ssh\id_ed25519_github" -N '""'

# 2) 复制公钥，粘到 https://github.com/settings/ssh/new（Key type: Authentication）
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_github.pub"

# 3) 写 ~/.ssh/config（已有该 Host 块则跳过）
#    Host github.com
#        HostName github.com
#        User git
#        IdentityFile ~/.ssh/id_ed25519_github
#        IdentitiesOnly yes

# 4) 验证：应输出 Hi <user>! You've successfully authenticated...
ssh -T git@github.com

# 5) 远端换成 SSH 并推送
git remote set-url origin git@github.com:<owner>/dsh-apikey-usage.git
git push -u origin main
```

想给私钥加口令：`ssh-keygen -p -f "$env:USERPROFILE\.ssh\id_ed25519_github"`，之后用 ssh-agent 记住（`Start-Service ssh-agent; ssh-add`）。

**B. HTTPS + PAT**

1. GitHub → Settings → Developer settings → Personal access tokens → 生成 fine-grained token，仓库选本仓库，权限 **Contents: Read and write**。
2. 让 git 记住（明文存 `~/.git-credentials`，注意保管）：

```powershell
git config --global credential.helper store
git remote set-url origin https://github.com/<owner>/dsh-apikey-usage.git
git push -u origin main   # Username 填 GitHub 用户名，Password 填 token（不是账号密码）
```

3. 或安装带 GCM 的完整 Git（`winget install Git.Git`）后 `git config --global credential.helper manager`。

**C. 仓库还没建 / 推送被拒**

- 私有仓库与"不存在"在 HTTPS 下都会要求认证，无法从报错区分。没建的话：GitHub → New repository → 名字 `dsh-apikey-usage` → **不要**勾 README（本地已有提交）。
- `! [rejected] ... non-fast-forward`：远端已有提交，先 `git pull --rebase origin main` 再 `git push -u origin main`。


发行压缩包（可选）：

```powershell
# Windows
Compress-Archive -Path * -DestinationPath ..\dsh-apikey-usage-1.0.0.zip -Force
```

```bash
# macOS / Linux
zip -r ../dsh-apikey-usage-1.0.0.zip . -x '.git/*' 'apikey-usage-config.json'
```

发版检查清单：

- [ ] `package.json` 的 `version` 已递增，`CHANGELOG.md` 有对应条目
- [ ] `node --check index.js && node --check client.js` 通过
- [ ] `locale/en.json`、`locale/zh.json` 是有效 JSON，`meta.title` / `meta.description` 描述准确
- [ ] `icon.svg` 是有效图片（≤ 256 KiB，位于包内）
- [ ] `docs/images/sidebar.png`、`docs/images/panel.png` 已换成真实截图（现在是占位图，清单见 [docs/images/README.md](images/README.md)）
- [ ] 不含 `apikey-usage-config.json`、`node_modules`、日志
- [ ] 全新 profile 上从零安装一次并走完 §4

截图位置已经预留好：README 用固定路径引用这两张图，替换同名文件即可，不需要改 Markdown。若要再加图（深色主题、价目特写、空状态），把文件放进 `docs/images/` 后在 README 增加一行 `![说明](docs/images/xxx.png)`。

打 tag：

```bash
git tag v1.0.0 && git push origin v1.0.0
```

---

## 10. 安全说明

- 插件**不读取**凭据值，只读取配置里的 `apiKeyEnv` 名字用于显示。
- 没有任何出站网络请求；全部数据来自本机会话日志。
- 私有路由只监听本机 Web carrier，返回聚合数字，不返回会话正文、提示词或 Key。
- `apikey-usage-config.json` 含价目与显示名，可安全保留；仍建议不入库。
