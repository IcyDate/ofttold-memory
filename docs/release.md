# 发版流程

一条命令，但前面要做两件事。

## 每次发版

1. **先在 `CHANGELOG.md` 顶部写一节**（`## [0.1.8] — 日期`，下面 `### 新增 / 修复 / 变更`）。
   写的是「装了之后你会感觉到什么」，不是提交标题。
2. 提交干净、在 `main` 上。
3. 跑：

```bash
tools/release.sh 0.1.8
```

它会：改 `package.json` 和 `client.js` 的 `VERSION` → 跑测试 → 提交 → 打 `v0.1.8` tag → 推 → **用 CHANGELOG 那一节建 GitHub Release**。

4. 最后手动发 npm（要浏览器授权，脚本替不了）：

```bash
npm publish --registry=https://registry.npmjs.org/
```

## 为什么版本号不带 `-beta`

`0.x` 本身已经是「随时可能变」的信号（语义化版本第 4 条）。再加 `-beta` 有害无益：

```
^0.1.0 匹配 0.1.1-beta.1 → false
^0.1.0 匹配 0.1.1        → true
```

**预发布版本会被所有普通范围静默排除**——而 `dsh plugin add ofttold-memory` 装的是 `latest` tag，用户不显式写 `@next` 就永远看不到新版本。awesome-dsh-plugin 的 contributing 也专门警告过这条。

**真要分频道，用 dist-tag，不要改版本号**：

```bash
npm publish --tag next      # 版本号照常递增，latest 不动
```

| 频道 | 谁会拿到 |
|---|---|
| `latest` | 普通用户：`add ofttold-memory` |
| `next` | 想尝鲜的人：`add ofttold-memory@next` |

## Release 和 CHANGELOG 的分工

**`CHANGELOG.md` 是唯一源头，Release 是它的投影。**

- 只靠 Release：仓库里搜不到，换平台就没了
- 只靠文档：关注仓库的人不会主动去翻
- 两边各写一份：必然不一致

所以手写 CHANGELOG，发版时原样贴进 Release。
