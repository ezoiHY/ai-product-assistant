# 部署指南（手把手版）

整个流程分 4 步：拿到 API Key → 本地跑通 → 推到 GitHub → 部署到 Vercel。每一步都写了在哪里操作、要输入什么、正常情况下会看到什么。

---

## 第 1 步：获取 Anthropic API Key

网站的 AI 部分需要调用 Claude，必须有一个 API Key。注意：Claude Code / Claude.ai 的登录账号**不能**给网站用，API Key 要单独申请。

1. 浏览器打开 <https://console.anthropic.com>，登录或注册。
2. 左侧菜单 **Billing** → 充值（按量付费，分析一个商品大约 0.2-0.4 美元，用默认的 Opus 模型时）。
3. 左侧菜单 **API Keys** → **Create Key** → 名字随便填，例如 `product-assistant` → 复制生成的 `sk-ant-...`。
   - 这个 Key 只显示一次，先存在安全的地方。**不要**发到聊天里，也不要提交到 GitHub。

---

## 第 2 步：本地跑通

在终端里执行（终端就是 Claude Code 旁边的命令行窗口）：

```bash
cd /Users/harry/ClaudeCodeNEU/Test1/ai-product-assistant
```

```bash
cp .env.example .env.local
```

然后用编辑器打开 `.env.local`，把第一行改成：

```
ANTHROPIC_API_KEY=sk-ant-你的key
```

保存后启动：

```bash
npm run dev
```

浏览器打开 <http://localhost:3000>，点任意一个"试试"示例。正常情况：

- 右上角显示"模型 claude-opus-5-5"（而不是"未配置 API Key"）
- 左边出现商品卡片，右边 4 个板块依次出结果，大约 1 分钟内全部完成

> 本地用的是你自己的网络。如果网络出口在国外但不在美国，Amazon 可能不显示价格（页面会提示"无法配送到当前地区"）。部署到 Vercel 美国机房后就正常了。

---

## 第 3 步：推到 GitHub

需要你同意后才执行。你的 GitHub 账号 `ezoiHY` 已经在本机登录。

```bash
cd /Users/harry/ClaudeCodeNEU/Test1/ai-product-assistant
```

```bash
gh repo create ai-product-assistant --public --source=. --push
```

想设成私有仓库，就把 `--public` 换成 `--private`（之后需要在仓库 Settings → Collaborators 邀请面试官）。

执行成功后会打印仓库地址，例如 `https://github.com/ezoiHY/ai-product-assistant`，这就是要提交的 GitHub 链接。

---

## 第 4 步：部署到 Vercel

### 方式 A：网页操作（推荐）

1. 打开 <https://vercel.com/signup>，选 **Continue with GitHub**，用 GitHub 账号登录。
2. 点 **Add New… → Project**，在列表里找到 `ai-product-assistant`，点 **Import**。
3. Framework 会自动识别为 Next.js，其他保持默认。展开 **Environment Variables**，添加：
   - Name：`ANTHROPIC_API_KEY`
   - Value：你的 `sk-ant-...`
4. 点 **Deploy**，等 1-2 分钟，出现 Congratulations 页面。
5. 点 **Continue to Dashboard**，上方的 `https://ai-product-assistant-xxx.vercel.app` 就是要提交的部署地址。

之后每次 `git push`，Vercel 都会自动重新部署。

### 方式 B：命令行

```bash
npx vercel login
```

（在弹出的浏览器里确认登录）

```bash
npx vercel link
```

```bash
npx vercel env add ANTHROPIC_API_KEY production
```

（提示输入值时粘贴 Key）

```bash
npx vercel --prod
```

---

## 部署后自检

- [ ] 打开部署地址，右上角显示模型名
- [ ] 换 3-5 个不同品类的 Amazon 链接测试（含一个短链接 `a.co/...`）
- [ ] 如果某个链接显示"Amazon 拦截"，看左侧卡片的数据来源是不是自动切到了"Claude 联网获取"；再不行就用"手动粘贴商品信息"
- [ ] Vercel 后台 → 项目 → **Logs** 能看到每个请求的耗时和报错

## 可选配置（Vercel → Settings → Environment Variables）

| 变量 | 作用 |
| --- | --- |
| `ANTHROPIC_MODEL` | 换模型。`claude-sonnet-5-5` 更快更便宜，`claude-haiku-5-5` 最便宜 |
| `ANTHROPIC_FAST_MODE` | 设为 `on` 开启快速输出（更贵） |
| `ANTHROPIC_BASE_URL` | 用 Anthropic 兼容的中转服务时填写 |
| `ANTHROPIC_FALLBACKS` | 中转服务不支持 beta 参数时设为 `off` |

## 注意

- `*.vercel.app` 在中国大陆不翻墙打不开。如果面试官在国内，可以在 Vercel 绑定一个自己的域名，或者提交时说明需要科学上网访问。
- Vercel 免费版的函数最长可以运行 300 秒，本项目每一步都远低于这个时长。
