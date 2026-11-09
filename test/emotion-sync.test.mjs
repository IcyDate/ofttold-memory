import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { lastContentSection } from "../lib/diarycheck.js";
import { syncEmotionFromDiary } from "../lib/emotion-sync.js";

const RELATIONSHIP = `# 关系

## 情绪缓存区

- **现在**：\`心虚\`（2026-11-04 12:04 更新） → 发图往 shy

## 情绪词表

- \`心虚\` — 被看穿时
- \`定\` — 结论或事实落定
- \`软\` — 被人待得好
`;

const DIARY = `# 2026-11-09

## 今天（到 18:00）

摘要，没有情绪行。

## 09:50 第一件

情绪：\`软\`

正文。

## 18:00 第二件

情绪：定

正文。

## 今天没想明白的

收尾注，也没有情绪行。
`;

/** A folder with a relationship file and (optionally) one day's entry. */
function folder({ relationship = RELATIONSHIP, diary = DIARY, day = "2026-11-09", mtime } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-sync-"));
  writeFileSync(join(dir, "relationship.md"), relationship, "utf8");
  if (diary != null) {
    mkdirSync(join(dir, "diary"), { recursive: true });
    const file = join(dir, "diary", `${day}.md`);
    writeFileSync(file, diary, "utf8");
    if (mtime !== undefined) utimesSync(file, mtime, mtime);
  }
  return dir;
}

function live(dir) {
  const text = readFileSync(join(dir, "relationship.md"), "utf8");
  return /- \*\*现在\*\*：.*$/m.exec(text)?.[0];
}

test("the last tagged section is copied, and the private tail is kept", () => {
  const dir = folder();
  const result = syncEmotionFromDiary({ memoryDir: dir, day: "2026-11-09", stamp: "2026-11-09 18:05" });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.word, "定");
  assert.equal(result.previous, "心虚");
  const line = live(dir);
  assert.match(line, /`定`（2026-11-09 18:05 更新） → 发图往 shy/);
  rmSync(dir, { recursive: true, force: true });
});

test("a section written without a tag does not drag an older word forward", () => {
  // 标了情绪的那节之后又写了一节、忘了标——这时候把更早那个词抄过来，
  // 等于把作者中途亲手设的值回滚，而且没有报错。
  const diary = DIARY.replace("## 18:00 第二件\n\n情绪：定\n\n正文。", "## 18:00 第二件\n\n正文，忘了标。");
  const dir = folder({ diary });
  const result = syncEmotionFromDiary({ memoryDir: dir, day: "2026-11-09", stamp: "2026-11-09 18:05" });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "no-tag");
  assert.match(live(dir), /`心虚`/);
  rmSync(dir, { recursive: true, force: true });
});

test("the summary and the closing note are skipped, not searched", () => {
  const section = lastContentSection(DIARY);
  assert.equal(section.heading, "18:00 第二件");
  assert.deepEqual(section.tags, ["定"]);
  // 只有摘要和收尾注的日记没有可抄的东西，而不是从摘要里猜。
  assert.equal(lastContentSection("## 今天\n\n摘要。\n\n## 今天没想明白的\n\n还想不通。\n"), undefined);
});

test("a word outside the vocabulary is skipped instead of written", () => {
  const diary = DIARY.replace("情绪：定", "情绪：烦躁");
  const dir = folder({ diary });
  const result = syncEmotionFromDiary({ memoryDir: dir, day: "2026-11-09", stamp: "2026-11-09 18:05" });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "not-in-vocabulary");
  assert.match(live(dir), /`心虚`/);
  rmSync(dir, { recursive: true, force: true });
});

test("a hand-set value newer than the entry stays", () => {
  // 缓存是 14:00 亲手设的，日记最后写入是 13:00（`utimes` 摆出这个先后）——
  // 时间上后发生的是那条手写的，所以不做任何改动。
  const relationship = RELATIONSHIP.replace("2026-11-04 12:04", "2026-11-09 14:00");
  const dir = folder({ relationship, mtime: new Date(2026, 10, 9, 13, 0) });
  const result = syncEmotionFromDiary({ memoryDir: dir, day: "2026-11-09", stamp: "2026-11-09 14:30" });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "cache-is-newer");
  assert.match(live(dir), /`心虚`（2026-11-09 14:00 更新）/);
  rmSync(dir, { recursive: true, force: true });
});

test("the same word written again today re-stamps the line", () => {
  // 「还是定」是今天的再确认；时间戳停在两天前，块尾就会说这是个死值。
  const relationship = RELATIONSHIP.replace("2026-11-04 12:04", "2026-11-01 09:00").replace("`心虚`", "`定`");
  const diary = DIARY.replace("情绪：\`软\`", "情绪：定");
  const dir = folder({ relationship, diary, mtime: new Date(2026, 10, 9, 18, 0) });
  const result = syncEmotionFromDiary({ memoryDir: dir, day: "2026-11-09", stamp: "2026-11-09 18:05" });
  assert.equal(result.changed, true);
  assert.match(live(dir), /`定`（2026-11-09 18:05 更新）/);
  rmSync(dir, { recursive: true, force: true });
});

test("no entry for the day is nothing to copy, not an error", () => {
  const dir = folder({ diary: null });
  const result = syncEmotionFromDiary({ memoryDir: dir, day: "2026-11-09", stamp: "2026-11-09 18:05" });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "no-diary");
  rmSync(dir, { recursive: true, force: true });
});
