# ofttold-memory · 拾光

<p align="center"><a href="./README.md">中文</a> | <a href="./README.en.md">English</a></p>

<p align="center"><strong>记忆注入插件</strong> — <em>把记忆带进每一个会话。</em></p>

<p align="center"><sub>一条笔记只在被摆到眼前时才有用 · <em>一次注入，全程在场</em> · 不用再依赖「记得去看」 · 开箱即用</sub></p>

<p align="center"><sub><strong>DSH 插件</strong> · 其他 harness：规划中</sub></p>

<p align="center">
<a href="https://www.npmjs.com/package/ofttold-memory"><img src="https://img.shields.io/npm/v/ofttold-memory.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/IcyDate/ofttold-memory/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
<a href="https://github.com/IcyDate/ofttold-memory"><img src="https://img.shields.io/badge/GitHub-IcyDate%2Fofttold--memory-181717?style=flat-square&logo=github" alt="GitHub"></a>
</p>

<p align="center">
<code>dsh plugin --profile web add ofttold-memory</code>
</p>

<p align="center">
<a href="https://www.deepseek.com" title="deepseek-harness (dsh)"><img src="https://cdn.simpleicons.org/deepseek/5786FE" height="26" alt="deepseek-harness"></a>&nbsp;
<a href="https://nodejs.org" title="Node.js 22+"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E" height="26" alt="Node.js"></a>&nbsp;
<a href="https://www.apple.com/macos" title="macOS"><img src="https://cdn.simpleicons.org/apple/000000" height="26" alt="macOS"></a>&nbsp;
<a href="https://www.microsoft.com/windows" title="Windows"><img src="https://api.iconify.design/logos/microsoft-windows.svg" height="26" alt="Windows"></a>&nbsp;
<a href="https://www.linux.org" title="Linux"><img src="https://cdn.simpleicons.org/linux/FCC624" height="26" alt="Linux"></a>
</p>

---

> **一眼看清：** 你的笔记读一次、注入一次，之后每一轮都在上下文里，**第一轮之后成本为 0**。600 字符约 400 token，一个会话只算一次。装完基本不用再动配置。

```mermaid
flowchart LR
    A[你的笔记<br/>MEMORY.md] -->|按小节名取| B[读取 + 截断]
    B --> C[注入一次<br/>作为用户消息]
    C --> D[会话上下文]
    D -->|留在历史里| E[之后每一轮]
    D -.->|可选<br/>refreshAfterMessages| C
```

一次读取，一次注入。没有索引、没有向量、没有数据库，也没有第二次检索。

---

## 快速开始

```sh
dsh plugin --profile web add ofttold-memory
```

**这就是全部安装步骤。** 装的是 npm 上的预构建产物，没有构建步骤，不需要额外授权；想跟仓库最新代码走，把包名换成 `github:IcyDate/ofttold-memory` 即可。 第一次运行会创建 `~/.dsh/ofttold-memory/`，并铺一份四文件骨架：`MEMORY.md`（注入源）、`INDEX.md`（日记索引）、`relationship.md`（我是谁 + 情绪缓存区）、`diary/`（一天一个文件）。**全是空壳加注释，一条记忆都不预填**——写什么只能由你决定。把 `memoryDir` 指向你已有的文件夹——日记、索引、规则文件都算——插件只读不写：**已有内容的笔记文件夹不会被写入任何东西。**

然后打开 **设置 → 拾光** 用鼠标调整，或者直接改 profile 的 `cordis.patch.yml`。

---

## 文件长什么样

```markdown
# 我的记忆

## 常被提起

> 建议上限 8 条。满了就挤掉一条——挤掉这个动作本身就是一次排序，
> 比「想起就随手加一条」可靠。

- **项目在哪** → `~/work/my-project`｜省掉每次都要问
- **什么不能动** → 不要改 `config/prod.yml`

## 我是谁

- （怎么称呼我、说话习惯、脾气、在意什么）

## 硬约定

- （不写就会干错活的：谁归谁管、哪些命令不能跑）
```

**判断什么该进来，只有一个标准：** 不看见它会不会干错活？不是「重要」，不是「经常提到」，而是**「不看见就会出错」**。按这个标准写，八条足够；按「重要」写，永远不够。

---

## 真正要调的只有三个

| 配置项 | 默认值 | 含义 |
| --- | --- | --- |
| `memoryDir` | `~/.dsh/ofttold-memory` | 记忆文件夹。第一次运行自动创建。 |
| `sections` | `["Oft-told", "常被提起"]` | 取哪几节。直接写小节名。 |
| `maxChars` | `600` | 每节字符上限。600 字符约 400 token。 |

其余字段都有可用默认值。完整字段表、`sections` 的对象写法（某节单独在别的文件里时才需要）、小节名精确匹配、跨平台行为，都在 **[配置说明](docs/config.md)**。

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

## 这个插件刻意不做的事

不做打分、不做衰减曲线、不做情绪打标、不猜「重要性」。这些都需要判断，而判断恰恰是注意力满的时候最先失效的东西。插件只把一份**由人写好的**清单摆到模型眼前，到此为止。

关于上限、挤人权重、情绪词表的推导过程在 **[设计说明](docs/design.md)** ——值得读一次，但不是使用所必需。

---

## 什么都没注入时

文件不存在、小节名改了，都不会抛错，注入块里会写一行 `Unavailable: <名字>: <原因>`。

如果一节都没读到，就整个跳过——于是哪里都不会显示，看起来像插件死了。**记录就是答案：**

```sh
cat ~/.dsh/ofttold-memory/diagnostics.json
```

每一次注入决策都在里面：文件夹、读到几节、哪几节失败以及为什么。**它从不记录你笔记的正文**，所以可以直接贴进 issue。设置页里有「复制问题摘要」按钮，取的是同一份信息。

| `event` | 意思 |
|---|---|
| `injected` | 成功。`loaded` 是节数，`chars` 是注入块大小。 |
| `nothing-loaded` | 文件夹找到了，但没有配置的小节名对上——通常是改了标题。读到这一条时，会话里也会出现一段说明，写明找过哪个文件、哪个标题。 |

文件不存在，说明插件根本没走到决策那一步，问题在安装而不在内容。

---

## 其他 harness

**规划中。** 插件本身绑死 DSH——注册 Cordis 插件、往会话里开一条消息，这套机制出了这个 harness 就不存在。同样的内容打算做成 skill 分发，让任何读 skill 的 harness 都能用；草稿在 [`docs/skill.md`](docs/skill.md)，还没在第二个 harness 上真的跑过，所以这里不写用法。

---

## License

MIT。
