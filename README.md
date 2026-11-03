# ofttold-memory · 拾光

<p align="center"><a href="./README.md">中文</a> | <a href="./README.en.md">English</a></p>

<p align="center"><strong>它是给 AI 的一个小本子。</strong></p>

<p align="center"><sub>每天它往里写 · 每次开口前先翻一遍 · 所以它记得的，是它自己想过的</sub></p>

<p align="center"><sub><strong>DSH 插件</strong> · 其他 harness：规划中</sub></p>

<p align="center">
<a href="https://www.npmjs.com/package/ofttold-memory"><img src="https://img.shields.io/npm/v/ofttold-memory.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/IcyDate/ofttold-memory/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
<a href="https://github.com/IcyDate/ofttold-memory"><img src="https://img.shields.io/badge/GitHub-IcyDate%2Fofttold--memory-181717?style=flat-square&logo=github" alt="GitHub"></a>
</p>

<p align="center">
<code>dsh plugin --profile web add ofttold-memory@latest</code>
</p>

<p align="center">
<a href="https://www.deepseek.com" title="deepseek-harness (dsh)"><img src="https://cdn.simpleicons.org/deepseek/5786FE" height="26" alt="deepseek-harness"></a>&nbsp;
<a href="https://nodejs.org" title="Node.js 22+"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E" height="26" alt="Node.js"></a>&nbsp;
<a href="https://www.apple.com/macos" title="macOS"><img src="https://cdn.simpleicons.org/apple/000000" height="26" alt="macOS"></a>&nbsp;
<a href="https://www.microsoft.com/windows" title="Windows"><img src="https://api.iconify.design/logos/microsoft-windows.svg" height="26" alt="Windows"></a>&nbsp;
<a href="https://www.linux.org" title="Linux"><img src="https://cdn.simpleicons.org/linux/FCC624" height="26" alt="Linux"></a>
</p>

---

每天它往里写：今天你们做了什么、它怎么看、它自己在哪一步老出错。下次开口之前，它先把本子翻一遍——**所以它记得的不只是你说过什么，还有它自己想过的。**

你也可以告诉它「我希望你是什么样的人」。这句话会被写进本子里，**不用每次重新嘱咐**。

装完第一天，本子是空的。这不是坏了——它得先跟你过几天日子。

慢慢你会养出自己那一只大肥鱼——**和别人的不太一样。**

---

## 装上之后，第几天会有什么变化

| | 你会看到什么 |
|---|---|
| 第 1 天 | 本子是空的。它开始往里写，你可能只会在回答的边角看到它提一句「今天还没写」。 |
| 第 3 天 | 它开始接得上上次的事——「你上次说的那个……」——而且那是它自己记下的版本，不是你把话重复一遍。 |
| 第 10 天 | 它开始有自己的一套说法：对你的判断、它老在哪一步出错、它今天什么情绪。你可以直接问它「你记的我什么」。 |
| 一个月后 | 本子有几百行，但它只挑八条摆在眼前——**写满不会让它变慢**。 |

这个延迟是设计的一部分。**它不是一个装完就生效的东西，是一个每天长一点的东西。**

---

## 它做什么，不做什么

**会做的**都是「每次都应该发生、但靠自觉一定漏」的那类：

- 把清单摆到眼前（每会话一次）
- 清单满了，按 `exp(-t / 2^n)` 算谁该沉底
- 没有日期的锚点，就地补上「从哪天起算」
- 文件夹缺东西时补上（缺哪个补哪个），提醒今天日记没写，读不到时说明试过什么
- 今天那篇日记的**体检**：缺 `情绪：` 行、标签不在词表里、摘要落后于正文（节数只在你自己设了上限时才管）

**不做的**恰好是需要判断的那一半：

- **不替你决定记什么。** 清单里写什么、允许它沉谁，都是写的人的事——插件只负责算。
- **不替你判断现在是什么情绪。** 值由写的人定；但**写这一下**插件管——`remember_emotion` 工具会校验词表、带上时间戳，词不在表里就拒绝并列出有哪些。
- **不自动写日记。** 没写就提醒一句，不会替你补。

分界线是「失败了看不看得见」：**看不见的必须交给代码，看得见的留给写的人。** 上限、权重、词表的推导在 **[设计说明](docs/design.md)**。

---

## 快速开始

```sh
dsh plugin --profile web add ofttold-memory@latest
```

**这就是全部安装步骤。** 装的是 npm 上的预构建产物，没有构建步骤，不需要额外授权；想跟仓库最新代码走，把包名换成 `github:IcyDate/ofttold-memory` 即可。 第一次运行会在**当前工作区里**创建 `.ofttold/`，并铺一份五文件骨架：`memory.md`（注入源）、`index.md`（日记索引）、`relationship.md`（我是谁 + 情绪缓存区）、`detours.md`（我总在哪一步拐错）、`diary/`（一天一个文件）。**全是空壳加注释，一条记忆都不预填**——写什么只能由你决定。把 `memoryDir` 指向你已有的文件夹——日记、索引、规则文件都算——插件**只补缺的那几个文件，已有文件一个字都不动**：它会补上 `relationship.md`（情绪词表与缓存区住在那里）和 `diary/`（块尾那句提醒靠它），否则写的那一半会缺一块。

然后打开 **设置 → 拾光** 用鼠标调整，或者直接改 profile 的 `cordis.patch.yml`。

---

## Windows 上装不上？先看这一节

### 第一条：`pnpm` 不是内部或外部命令

`dsh plugin` 只是把参数转发给 **pnpm**，而**装 dsh 不会顺带装 pnpm**。全新机器上第一条命令就会停在这儿：

```
'pnpm' 不是内部或外部命令，也不是可运行的程序或批处理文件。
```

先装它：

```powershell
npm install -g pnpm
pnpm --version
```

`pnpm --version` 打出版本号才算通了。

---

### 第二条：`.ps1` 被执行策略拦下

真实测出来的，不是猜的。**在全新 Windows 上第一次跑 `dsh` 命令，十个里有九个会撞这一条**：

```
dsh : 无法加载文件 C:\Users\<你>\AppData\Roaming\npm\dsh.ps1，因为在此系统上禁止运行脚本。
    + FullyQualifiedErrorId : UnauthorizedAccess
```

**这不是插件坏，是 Windows 客户端 PowerShell 默认的执行策略（`Restricted`）不允许运行任何 `.ps1` 脚本**，而 npm 给 `dsh` 生成的启动器正好是一个 `.ps1`。

**别去改执行策略**（那是整台机器的持久设置）。npm 在 Windows 上同时生成了 `dsh.cmd`，`.cmd` 不受执行策略管：

```powershell
# PowerShell 里，推荐这条
cmd /c "dsh plugin --profile web add ofttold-memory"

# 或者直接开一个 cmd 窗口（不是 PowerShell）
dsh plugin --profile web add ofttold-memory
```

### 第三条：镜像比包慢

如果报

```
ERR_PNPM_NO_MATCHING_VERSION  No matching version found for ofttold-memory@0.1.x
while fetching it from https://registry.npmmirror.com/
```

**是国内的 npmmirror 还没同步到最新版本**，不是包没发出去。等十几分钟重试，或者临时指定官方源：

```powershell
dsh plugin --profile web add ofttold-memory@latest --registry=https://registry.npmjs.org/
```

### 第四条：如果你在让 AI 代你装

`dsh` 的 agent 有文件沙箱，而插件**必须装进 `~\.dsh\profiles\`**——那个位置在沙箱外，agent 会报

```
EPERM: operation not permitted, open 'C:\Users\<你>\.dsh\profiles\web\package.json.lock'
```

**这条命令请自己在终端里敲。** 装完之后插件运行时写记忆是 DSH 自己的进程，不受那个沙箱限制。

---

## 文件长什么样

```markdown
# 我的记忆

## 常被提起

> 建议上限 8 条。满了按权重沉底——挤掉这个动作本身就是一次排序，
> 比「想起就随手加一条」可靠。

- **项目在哪** → `~/work/my-project`｜省掉每次都要问
- **什么不能动** → 不要改 `config/prod.yml`

## 我是谁

- （怎么称呼我、说话习惯、脾气、在意什么）

## 硬约定

- （不写就会干错活的：谁归谁管、哪些命令不能跑）
```

**判断什么该进来，只有一个标准：** 不看见它会不会干错活？不是「重要」，不是「经常提到」，而是**「不看见就会出错」**。按这个标准写，八条足够；按「重要」写，永远不够。

## 清单满了不会越写越长

写满 8 条之后，插件**按权重挑谁沉底**，而不是靠谁记得去删一条：常被翻出来的留下，久没被提过的沉下去。**沉底不是删除**——还在文件里，日记里再提一次就浮回来。

公式和推导在 **[设计说明 § 沉底机制](docs/design.md#沉底机制libanchorsjs)**。

## 一天的摘要在顶部

一天的文件开头是 `## 今天（17:40 更新）`——两三句：这天是什么日子、什么感觉，**吐槽就写这儿**。细节在下面，想翻再翻。

摘要是**随写随新**的：写一节的同时顺手改它，不是晚上补。插件会把 `（HH:mm 更新）` 和正文最后一个 `## HH:mm` 比一比，**正文跑过摘要就点名**——所以「加班到 21:00 又写了一节」这件事不会让摘要悄悄过期。

`summaryFrom`（默认 `17:30`）之前不催摘要：上午写的那半截本来还不是一天。

## 日记体检

同一行还管三件事，都是**只报不改**：

| 看到什么 | 会说什么 |
|---|---|
| 一天超过 `diarySections` 节（**默认关掉**，设了数才检查） | `9 sections, over the 8-per-day bar` |
| 有节没写 `情绪：` 行 | `2 without an \`情绪：\` line` |
| 标签的词不在词表里 | `烦躁 not in the vocabulary` |
| 用了标签但没有词表节 | `tags used, but relationship.md has no \`情绪词表\` section` |
| 过了 `summaryFrom` 还没有摘要 | `no \`## 今天\` summary at the top` |
| 摘要落后于正文 | `summary stopped at 17:40, body runs to 21:10` |

整句长这样：`Diary check — 9 sections, over the 8-per-day bar; …`

**「标签必须来自词表」不是口味，是结构**：值只能取词表里的词，所以表外的标签永远匹配不上——不报错，只是那天从此不能被情绪找到。

**只报不改**：整理必然压缩，而压缩会删掉权重赖以计算的「被想起」的证据。推导在 **[设计说明 § 一条结构性的规矩](docs/design.md#一条结构性的规矩)**。

## 记一个情绪

`relationship.md` 里的 `**现在**` 那一行是**活值**：只放此刻的情绪，不放原因。改它用工具，不靠记格式：

```
remember_emotion(word: "定")
→ 现在：`定`（2026-10-30 11:20 更新）（原来是 `心虚`）
```

- 词必须在同一份文件的 `## 情绪词表` 节里，否则**拒绝**并列出可用的词
- 词表节不存在时也**拒绝**——不在这里造一份默认词表，那就又多一份会漂的拷贝
- 只改反引号里的词和时间戳，那一行的标点、前后文字一个字节不动

**为什么是工具不是文档**：这一行一天要改好几次，而两种错法都不出声——词不在表里，之后和日记标签永远对不上；时间戳忘了写，缓存看着像新的。

## 让它记住一件事

「我记下了」这句话，如果没有落到文件里，**它和没记是一样的**——而且看不出来。

所以这件事做成了一个工具：

```
remember_note(text: "主人喜欢一条溪穿街的古镇，黄龙溪那种", title: "主人喜欢古镇")
→ added to memory.md · 常被提起: - **主人喜欢古镇** → 主人喜欢一条溪穿街的古镇，黄龙溪那种
```

`kind` 有两种：

| 值 | 写到哪 | 用来记什么 |
|---|---|---|
| `anchor`（默认） | `memory.md` 的 `常被提起` | **以后还该成立的事**——偏好、约定、纠正过的认知 |
| `task` | `memory.md` 的 `待办`（第一次用时建） | **还欠着的活** |

任务是能结算的：

```markdown
- [ ] 2026-11-02 起 ｜ 2026-11-05 到期 ｜ 修上游白名单
- [x] 2026-11-01 起 ｜ 等 #15 合并（2026-11-03 完成）
```

`complete_task` 把框勾上、补一个完成日。**勾掉不是删掉**——已完成的留在文件里当证据，只是不再计数。块尾会报「还有几条、最久那条挂了几天」，**挂了多久比有几条有用**：条数只让你知道有一堆，天数才告诉你该不该现在动手。

**写了到期日的会到点说话**：那天块尾点名 `- 1 task due now: 修上游白名单（今天到期）`，过了就说「逾期 N 天」。没写到期日的永远只会「变老」——`the oldest open 5 days` 不是「今天该做」。

**挂太久的会换一种语气**：超过 `taskStaleDays`（默认 30 天）还没做的，不再计入条数，而是点名问你「还要不要」。一条待办两个月里每会话都被提一次，它就成了背景噪音——**问「要不要删」是真问题，催「怎么还没做」不是。**

**为什么是工具，不是一份措辞清单**：说法太多——记下了、记住了、放心上了、你记着——按词匹配永远漏一个。按**动作**就不会：调用了有痕迹，没调用就是没发生。

`task` 写进去之后，块尾会报「还有几条没做」——**写下来不等于会去读**，所以它得自己露面。

## 块尾那一行

如果记忆文件夹里有 `diary/`，注入的末尾会多一行状态：

```
- no diary entry for 2026-10-30 yet (`diary/2026-10-30.md`)
```

**它刻意写成一行状态，不是一句指令**——没有「快写」，也不点 skill 的名字。因为同一个块尾还装着上面的体检报告，那是真的会坏事的消息；提醒要是也一副催的口气，**两行都会被跳过**。它只花一次 `stat`，作用是让「今天写不写」不靠想起来的。

**多久写一次由 `diaryCadence` 决定**：`daily`（默认）每天催；`weekly` 只在最近 7 天一个字都没写时才开口；`off` 永不提醒。两种情况下它都会闭嘴：**没有 `diary/` 目录**（这说明这个文件夹不走日记这套），或者 **cadence 是 `off`**（那是想停写又不想删历史）。

---

## 真正要调的只有这几个

| 配置项 | 默认值 | 含义 |
| --- | --- | --- |
| `memoryDir` | `.ofttold`（工作区里） | 记忆文件夹。**默认在会话工作区里面**——助手写日记用的是它自己的文件工具，那些在默认策略下只能写工作区。第一次运行自动补齐缺失的文件。 |
| `sections` | 见下 | 取哪几节。不配时：锚点那节取 `Oft-told` / `常被提起` 里**先出现的那一个**，另加 `我是谁`、`硬约定`（有就读）。 |
| `maxChars` | `600` | 每节字符上限。600 字符约 400 token。 |
| `anchorCap` | `8` | 一节的粗体列表最多留几条，超出的沉底但不删。`0` 关掉。 |
| `summaryFrom` | `"17:30"` | 从几点开始要求顶部有 `## 今天` 摘要。 |
| `diaryCadence` | `"daily"` | 多久写一次：`daily` / `weekly`（最近 7 天有写过就不催）/ `off`（永不提醒）。 |
| `diarySections` | `0` | 一天最多几节。默认 `0`＝不数——**节数说明不了是不是流水账**。 |
| `diaryCheck` | `true` | 日记体检开关。 |
| `detourChars` | `3000` | 弯路文件最大多少字。它只该装**重复犯的那几种错**，超了就已经是第二本日记。`0` 关掉。 |
| `taskStaleDays` | `30` | 待办挂多少天算太久。超过就不算进「有几条」，改口问「还要不要」。`0` 关掉。 |

**这 10 项在设置页里都能改**（面板把布尔项画成勾选框，不用手打 true/false）。剩下的 `header`、`workspaceRelative`、`refreshIntervalMs`、`refreshAfterMessages` 也有面板入口，只是平时不用动。完整字段表、`sections` 的对象写法、小节名精确匹配、跨平台行为在 **[配置说明](docs/config.md)**。

---

## 它怎么做到的

> 本子就是几个 markdown 文件，在你自己的电脑上。每个会话开头读一次、注入一次，之后每一轮都在上下文里——**第一轮之后成本为 0**。600 字符约 400 token，一个会话只算一次。

```mermaid
flowchart LR
    A[你的本子<br/>memory.md] -->|按小节名取| B[读取 + 截断]
    B --> C[注入一次<br/>作为用户消息]
    C --> D[会话上下文]
    D -->|留在历史里| E[之后每一轮]
    D -.->|可选<br/>refreshAfterMessages| C
```

一次读取，一次注入。没有索引、没有向量、没有数据库，也没有第二次检索。想调的东西只有几个，都写在 [配置说明](docs/config.md)。

---

## 什么都没注入时

文件不存在、小节名改了，都不会抛错。**一节都没读到时，注入块会照实说它试过什么：**

```
Could not load any section. Tried: index.md → 常被提起 (heading_not_found)
```

`heading_not_found` 只差一个字也算没找到（`常被提起` 匹配不上 `常被提起（手动维护）`）。空文件夹则是另一种说法：**这是第一天，不是坏了。**

完整记录仍然在：

```sh
cat ~/.dsh/ofttold-memory/diagnostics.json
```

每一次注入决策都在里面：文件夹、读到几节、哪几节失败以及为什么。**它从不记录你笔记的正文**，所以可以直接贴进 issue。设置页里有「复制问题摘要」按钮，取的是同一份信息。

| `event` | 意思 |
|---|---|
| `injected` | 成功。`loaded` 是节数，`chars` 是注入块大小。 |
| `nothing-loaded` | 文件夹找到了，但没有配置的小节名对上——通常是改了标题。读到这一条时，会话里也会出现一段说明，写明找过哪个文件、哪个标题。 |
| `tail` | 块尾那句：`nudged`＝提醒了今天没写，`checked`＝体检说了话，`issue` 是它说了什么。 |

文件不存在，说明插件根本没走到决策那一步，问题在安装而不在内容。

---

## 它碰什么，不碰什么

给做供应链审查的人看的——这个插件会读写文件，这一点没法「声明成不碰」，所以把它做什么写清楚：

| | |
|---|---|
| **读** | `memoryDir` 里你指定的那几个 `##` 小节；`diary/` 下今天的文件；`relationship.md` 的词表；`detours.md` 的字数 |
| **写** | 只在 `memoryDir` 内：补缺失的骨架文件、给无日期的锚点补起算日、追加/勾选 `MEMORY.md` 的待办、改 `relationship.md` 的那一行「现在」、把旧文件名改过来 |
| **不写** | `memoryDir` 之外一处都不写。不碰 `~/.dsh`、不碰工作区、不碰会话数据 |
| **网络** | 零。没有任何出站请求 |
| **子进程** | 零。不 exec、不 spawn、不 shell |
| **凭据** | 零。不读环境变量里的任何密钥、不读 keychain |

**运行期依赖：零。** `package.json` 里没有 `dependencies`——`@deepseek-ai/*` 全部走 `peerDependencies`（由宿主提供），用到的 `schemastery` 也来自宿主。

**失败边界**：任何一次读写失败都不抛到宿主，只在注入块末尾用一句话说明（「试过哪里、为什么没读到」）；文件夹不存在时补骨架，路径不可写时保持沉默而不反复重试。

---

## 名字从哪来

这个插件是从一个人和一个 AI 之间真实跑通的一套办法里长出来的，名字也是那套办法给的。

**拾光** —— 也是**时光**的谐音。意思落在「拾」这个字上：把散落的东西，一件一件捡回来。

那套办法是：一个日记文件夹、一份索引（顶上列着几条常被提起的事）、还有一条写在 AI 指令最前面的要求——*每次开工先读这两个文件*。这条要求一直管用，直到它不再管用；而它失效的位置，恰恰是它本该守住的地方——会话开头，新消息最要紧的那一刻。

于是要求换成了机制。**那份清单从「模型得记得去读的东西」变成了「它不可能错过的上下文」。** 整个改动就这一句话。

---

## 为什么不用写进 `AGENTS.md`？

因为一条指令和一条注入的消息，付钱的方式不一样。

| | 每轮成本 | 会不会被跳过 |
|---|---|---|
| `AGENTS.md` 里一条规矩 | 每轮都付，整条规矩的长度 | 会——而且是不声不响地 |
| 这个插件 | **第一轮之后是 0** | 不会——已经在历史里了 |

系统指令跟着每一个请求走；注入的消息只付一次——第一轮之后它就是历史，后面的轮次当已有上下文读。实测一次注入是 **735 字符 ≈ 660 token，每会话一次**；一条规矩则是每轮、永远，付它整条的长度。**只要规矩比注入块长，规矩就输了**，而它几乎立刻就输了。

**所以：内容放进记忆文件，别把指令塞进 `AGENTS.md`。**

---

## 其他 harness

**规划中。** 插件绑死 DSH；同样的办法打算做成 skill 分发，让别的 harness 也能读。还没在第二个 harness 上跑通过，所以这里不写用法。

---

---

## License

MIT。

---

改动记录在 [CHANGELOG.md](CHANGELOG.md)：写的是**装了之后你会感觉到什么**，不是提交列表。
