import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkEntry, clockOf, diaryIssueLine, lastSectionMinute, minutesOf, summaryState } from "../lib/diarycheck.js";

const DAY = `# 2026-10-30

## 今天（21:10 更新）

一天的总结，外加吐槽。

## 09:50 发上 npm

情绪：松

## 21:10 加班又写了一节

情绪：定
`;

test("HH:mm parses to minutes, and nonsense is undefined", () => {
  assert.equal(minutesOf("17:30"), 1050);
  assert.equal(minutesOf("7:05"), 425);
  assert.equal(minutesOf("24:00"), undefined);
  assert.equal(minutesOf("evening"), undefined);
  assert.equal(clockOf(1270), "21:10");
});

test("the summary is prose, not a section that needs a tag", () => {
  const state = checkEntry({ text: DAY });
  assert.equal(state.sections, 2, "the summary must not be counted as a section");
  assert.equal(state.untagged, 0);
  assert.equal(state.summary.present, true);
  assert.equal(state.summary.minute, 21 * 60 + 10);
});

test("a body that runs past the summary is stale, and the gap is named", () => {
  const text = DAY.replace("（21:10 更新）", "（17:40 更新）");
  const state = checkEntry({ text });
  assert.equal(state.staleBy, 21 * 60 + 10 - (17 * 60 + 40));
});

test("a section without an emotion line is counted", () => {
  const text = "## 09:00 开头\n\n没有标签\n\n## 10:00 另一节\n\n情绪：松\n";
  assert.equal(checkEntry({ text }).untagged, 1);
});

test("the last section time ignores prose", () => {
  assert.equal(lastSectionMinute("## 09:05 a\n\n## 23:59 b\n"), 23 * 60 + 59);
  assert.equal(lastSectionMinute("没有时间标题"), undefined);
});

test("nothing is reported before summaryFrom, everything after", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-check-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "diary", "2026-10-30.md"), "# x\n\n## 09:00 a\n\n没有标签\n", "utf8");
  const early = diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 9 * 60, summaryFrom: 1050 });
  assert.equal(early, "今天那篇日记：1 节没有 `情绪：` 行。", "an untagged section is reported even early");
  const late = diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 18 * 60, summaryFrom: 1050 });
  assert.match(late, /顶部没有 `## 今天` 摘要/);
  rmSync(dir, { recursive: true, force: true });
});

test("a missing day and a disabled check say nothing at all", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-nod-"));
  assert.equal(diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 1300 }), undefined);
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "diary", "2026-10-30.md"), "## 今天\n\n## 09:00 a\n\n情绪：松\n", "utf8");
  assert.match(diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 1300, summaryFrom: 1050 }), /摘要.*空/);
  assert.equal(diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 1300, enabled: false }), undefined);
  rmSync(dir, { recursive: true, force: true });
});

test("over the section cap is named with both numbers", () => {
  const text = Array.from({ length: 9 }, (_, i) => `## ${String(9 + i).padStart(2, "0")}:00 s\n\n情绪：定\n`).join("\n");
  const line = (() => {
    const dir = mkdtempSync(join(tmpdir(), "ofttold-cap-"));
    mkdirSync(join(dir, "diary"), { recursive: true });
    writeFileSync(join(dir, "diary", "2026-10-30.md"), text, "utf8");
    const out = diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 1300, cap: 8 });
    rmSync(dir, { recursive: true, force: true });
    return out;
  })();
  assert.match(line, /9 节，超过每天 8 节/);
});

test("a summary with no stamp is present but never claimed stale", () => {
  const state = summaryState("## 今天\n\n说明\n");
  assert.equal(state.present, true);
  assert.equal(state.minute, undefined);
});
