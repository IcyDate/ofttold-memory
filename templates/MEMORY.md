# 我的记忆 / My memory

> 这是插件第一次运行给你建的起始文件，随便改、随便删。
> 每个会话开头会从这里取几节，注入进上下文——所以这里只放「不在眼前就会做错事」的东西。
> 位置和小节名都能改，见 `README` 的「配置」一节。
>
> The starter file the plugin wrote on first run. Edit or delete freely. A few
> sections from here ride along in every session, so keep only what would cause
> a mistake if it were missing. Folder and section names are configurable.

## 常被提起

> 建议上限 8 条。满了按权重沉底（`exp(-t / 2^n)`）——沉底这个动作本身就是一次排序，比「想起就随手加一条」可靠。没写日期的条目，第一次运行时会就地补一个「起算日」。
> 默认配置同时认 `常被提起` 和 `Oft-told` 两个小节名，用哪个都行，另一个留空会被跳过。

- **示例·项目在哪** → `~/work/my-project`｜省得每次问
- **示例·别动的东西** → 不要改 `config/prod.yml`
- 把这几行换成你自己反复被提起的事，然后删掉这两条示例

## Oft-told

> Cap of 8 suggested. When it is full, the lowest weight sinks (`exp(-t / 2^n)`) — and
> the sinking is itself the ranking, which beats "add one whenever it comes to mind".
> A line with no date gets a "counted from" stamp the first time it is seen.
> The default config accepts both `Oft-told` and `常被提起`; an empty one is skipped.

- **Example · where the project is** → `~/work/my-project` | saves asking every time
- **Example · what not to touch** → do not edit `config/prod.yml`
- Replace these with what keeps coming back for you, then delete the two samples

## 我是谁

- （写你自己：怎么称呼、说话习惯、脾气、在意什么）

## 硬约定

- （写「不记得就会干错活」的规矩：谁是负责人、怎么判断提交归属、哪些命令不能跑）
