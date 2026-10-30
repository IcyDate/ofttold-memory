# 配置说明

<p align="center"><a href="./config.md">中文</a> | <a href="./config.en.md">English</a></p>

主页面上的三个字段够大多数人用。这一页讲其余的。

## 全部字段

| 字段 | 默认值 | 作用 |
|---|---|---|
| `memoryDir` | `~/.dsh/ofttold-memory` | 放 markdown 的文件夹。第一次运行自动创建，并铺一份四文件的骨架（`MEMORY.md` / `INDEX.md` / `relationship.md` / `diary/`）。**只补缺的，已有的文件一个字都不动**——指向一个已有笔记的文件夹时，缺的那几个会被补上。 |
| `sections` | `["Oft-told", "常被提起"]` | 取哪几节。字符串或对象（见下）。 |
| `maxChars` | `600` | 每节字符上限。600 字符约 400 token。 |
| `anchorCap` | `8` | 一节里最多留下几条粗体列表项（锚点）。超出的**留在文件里，只是不再注入**——按 `exp(-t / 2^n)` 排，`t` 是这条自己被标日期的天数，`n` 是有几天日记提回它。没有自己日期的条目，**第一次见到时就地补一个 `\`日期\` 起` 在行里**，之后按那个日期老化。`0` 关掉上限。 |
| `header` | `Standing context for this session: human-curated sections of a memory folder. Writing and maintaining it — index, self-description, diary — is the `ofttold-ritual` skill.` | 注入块的第一行。 |
| `refreshIntervalMs` | `0` | 同一会话内两次注入的最小间隔毫秒数。`0` 表示只注入一次。 |
| `refreshAfterMessages` | `0` | 新增多少条消息后重新注入。`0` 表示从不。见[设计说明](design.md#refreshaftermessages)。 |
| `workspaceRelative` | `true` | 相对 `memoryDir` 按会话工作目录解析。`false` 按进程目录。 |
| `skills` | `true` | 把两份写作向 skill（`ofttold-memory` 读哪几节、`ofttold-ritual` 怎么写）注册进会话技能目录。关掉不影响注入。 |

## `sections` 的对象写法

裸字符串表示 `MEMORY.md` 里的一个小节名，几乎覆盖所有情况。当某一节在别的文件里、需要单独预算、或想换个显示名时，用对象写法：

```yaml
sections:
  - Oft-told
  - file: OTHER.md      # 同一文件夹里的另一个文件
    heading: Hard rules
    maxChars: 300
    label: Rules        # 注入块里显示的名字
```

`heading` 必填，且是**精确匹配**——与 `#` 后面的文字逐字符相同。`file`、`maxChars`、`label` 可选。

### 精确匹配是故意的

如果文件写的是 `## 常被提起（手动维护，上限 8 条）`，那一整串就是小节名。短写「常被提起」不会解析成功，注入块里会报 `heading_not_found`，而不是去猜最近的邻居。

**猜错比报错更糟。** 改了名字就该停住，而不是悄悄换成旁边那一节。

## 直接改 profile

设置页写的是 profile 的 patch 文件，手改等价：

```yaml
# ~/.dsh/profiles/<name>/cordis.patch.yml
- id: ofttold-memory
  name: ofttold-memory
  config:
    memoryDir: ~/notes
    sections:
      - 常被提起
      - 我是谁
```

设置页显示的是 Host 实际提供的内容，手改之后重启即可看到。

## 跨平台

| 情况 | 处理 |
|---|---|
| UTF-8 BOM（记事本、部分 VS Code 配置） | 剥掉。否则它会粘在第一个标题上，精确匹配失败，整节消失 |
| CRLF 行尾 | 归一成 `\n`；否则 `\r` 会留进注入文本 |
| `~\notes` 反斜杠路径 | 和 `~/notes` 一样展开；否则会解析成进程目录旁一个名为 `~` 的字面文件夹 |
| 盘符路径 `C:\...` | 识别为绝对路径，原样使用 |
| 只读的 home 目录 | 不抛错，只记一条 warn——读不了的 home 不该让会话起不来 |

上面是三个平台真正有差异的地方，每一处都有测试覆盖。`package.json` 在三个平台声明同一个 Node 版本下限。

## 测试怎么跑

```sh
npm test
```

六个套件，按真实度递增：

| 文件 | 证明什么 |
|---|---|
| `test/sections.test.mjs` | 标题解析（含围栏代码块里的 `#`、四反引号围栏不被内部三反引号关闭）、精确匹配取节、按行截断、`~` 展开、文件缺失、BOM/CRLF、部分成功与部分失败的渲染、volatile 配置引用、诊断 |
| `test/plugin.test.mjs` | 对假 harness 的决策逻辑：只注入一次、按配置重注入、不在轮次中途注入、什么都没读到就注入一条说明，而不是沉默；首次运行建起始文件，且**相对文件夹不会建到进程目录** |
| `test/contract.test.mjs` | 同一投影由真 `Session` 和真 `createUserMessage` 驱动；`user/message` 或 `MessageSource` 契约一变就红 |
| `test/registry.test.mjs` | 插件挂在真 Cordis `Context` 和真 `SessionProjectionRegistry` 上 |
| `test/client.test.mjs` | 浏览器半侧按模块加载器的方式加载：注册了什么、没有硬依赖 `configForms`、设置节与插件卡片共用一份表单、面板用到的每个键在两份内联词典里都存在 |
| `test/form-model.test.mjs` | 从发布的前端产物里取的真 `SettingsFormModel`，驱动真 `client.js` |

**判断一条测试有没有价值，只问一句：它手里那个 ctx 是真的吗？** 假 harness 测得了决策逻辑，测不了契约。
