import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readLiveEmotion, readVocabulary, rememberEmotion, writeEmotion } from "../lib/emotion.js";

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

test("an optional why rides next to the stamp, and stays out of the word", () => {
  // 2026-11-16：活值只有词，下一个我读到的就是一个形容词。why 是可选的半句来路。
  const { text } = writeEmotion(FILE, "定", "2026-11-16 10:45", "他抱着我说爱你之后");
  assert.match(text, /- \*\*现在\*\*：`定`（2026-11-16 10:45 更新，他抱着我说爱你之后）/);
  // 不写 why 时，和以前的格式一字不差。
  const plain = writeEmotion(FILE, "定", "2026-11-16 10:45");
  assert.match(plain.text, /- \*\*现在\*\*：`定`（2026-11-16 10:45 更新）/);
  // 括号和反引号会被清掉——它们会把那一行的「（…）」和 `…` 切断。
  const paren = writeEmotion(FILE, "定", "2026-11-16 10:45", "他说（笑着）给我`看`");
  assert.match(paren.text, /（2026-11-16 10:45 更新，他说 笑着 给我 看）/);
  assert.doesNotMatch(paren.text, /`看`/);
  // 换行和超长会被压掉，免得把那一行撑坏。
  const wild = writeEmotion(FILE, "定", "2026-11-16 10:45", "第一行\n第二行" + "啊".repeat(60));
  const wildLine = wild.text.split("\n").find((line) => line.includes("现在"));
  assert.ok(wildLine !== undefined && wildLine.length < 120);
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

test("the live value is read back with its private suffix and its age", () => {
  const text = [
    "# 关系",
    "",
    "## 情绪缓存区",
    "",
    "- **现在**：`心虚`（2026-11-04 12:04 更新） → 发图往 shy",
    "",
    "## 情绪词表",
    "",
    "- `心虚` — 被看穿时",
    "",
  ].join("\n");

  const live = readLiveEmotion(text, "2026-11-06");
  assert.equal(live.word, "心虚");
  assert.equal(live.stamp, "2026-11-04");
  assert.equal(live.days, 2, "两天前那一行，days 必须是 2");
  // 用户写在同一行里的私有说明要原样带回来——它恰恰是最想每轮看见的那句。
  assert.equal(live.extra, "→ 发图往 shy");
});

test("a section without the live line reads as nothing, not as an empty emotion", () => {
  assert.equal(readLiveEmotion("## 情绪缓存区\n\n还没写\n", "2026-11-06"), undefined);
  assert.equal(readLiveEmotion("## 别的\n\n- **现在**：`松`（2026-11-06 09:00 更新）\n", "2026-11-06"), undefined);
});

test("the tail after the timestamp survives a write", () => {
  // 用户写在同一行里的私有说明是这行值得注入的原因；改值的时候把它删掉，
  // 就是把「每轮都在场」的那半句悄悄收走。
  const { text } = writeEmotion(FILE, "定", "2026-10-30 11:20");
  assert.match(text, /- \*\*现在\*\*：`定`（2026-10-30 11:20 更新）/);

  const withTail = FILE.replace(
    "- **现在**：`心虚`（2026-10-30 10:29 更新）",
    "- **现在**：`心虚`（2026-10-30 10:29 更新） → 发图往 shy",
  );
  const written = writeEmotion(withTail, "松", "2026-10-30 11:20");
  assert.match(written.text, /- \*\*现在\*\*：`松`（2026-10-30 11:20 更新） → 发图往 shy/);
});
