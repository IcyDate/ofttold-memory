import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readVocabulary, rememberEmotion, writeEmotion } from "../lib/emotion.js";

const FILE = `# 关系

## 情绪缓存区

> 活值：只写情绪，不写原因。

- **现在**：\`心虚\`（2026-10-30 10:29 更新）

## 情绪词表

> 可加，也可删；不可改名。

- \`服气\` — 被纠正、被证明对方对，我认了
- \`松\` — 压着的东西卸掉那一瞬
- \`定\` — 结论或事实落定

## 情绪记忆

- \`松\` 那次
`;

test("the vocabulary comes from the section that owns it, in file order", () => {
  assert.deepEqual(readVocabulary(FILE), ["服气", "松", "定"]);
});

test("a missing vocabulary section is empty, not a default list", () => {
  // 默认一份词表就是第四份拷贝——那正是这次要修的病。
  assert.deepEqual(readVocabulary("# 关系\n\n## 别的\n"), []);
});

test("only the value and the stamp change", () => {
  const { text, changed, previous } = writeEmotion(FILE, "定", "2026-10-30 11:20");
  assert.equal(changed, true);
  assert.equal(previous, "心虚");
  assert.match(text, /- \*\*现在\*\*：`定`（2026-10-30 11:20 更新）/);
  // 别的一字不动。
  assert.match(text, /> 活值：只写情绪，不写原因。/);
  assert.match(text, /- `服气` — 被纠正/);
});

test("a word outside the vocabulary is refused, and the list is offered", () => {
  const { ok, message } = rememberEmotion({ memoryDir: "/nonexistent", word: "烦躁", stamp: "x" });
  assert.equal(ok, false);
  assert.match(message, /relationship\.md 不存在/);
});

test("writing works end to end, and refuses what the file does not allow", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-emotion-"));
  writeFileSync(join(dir, "relationship.md"), FILE, "utf8");

  const bad = rememberEmotion({ memoryDir: dir, word: "烦躁", stamp: "2026-10-30 11:20" });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /词表里没有/);
  assert.match(bad.message, /服气 松 定/);
  assert.equal(readFileSync(join(dir, "relationship.md"), "utf8"), FILE, "a refused word must not touch the file");

  const good = rememberEmotion({ memoryDir: dir, word: "松", stamp: "2026-10-30 11:20" });
  assert.equal(good.ok, true);
  assert.match(good.message, /原来是 `心虚`/);
  assert.match(readFileSync(join(dir, "relationship.md"), "utf8"), /- \*\*现在\*\*：`松`（2026-10-30 11:20 更新）/);

  rmSync(dir, { recursive: true, force: true });
});

test("a file with a vocabulary but no cache line is refused rather than guessed", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-nocache-"));
  writeFileSync(join(dir, "relationship.md"), "## 情绪词表\n\n- `松` — x\n", "utf8");
  const result = rememberEmotion({ memoryDir: dir, word: "松", stamp: "2026-10-30 11:20" });
  assert.equal(result.ok, false);
  assert.match(result.message, /没有找到/);
  rmSync(dir, { recursive: true, force: true });
});
