import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { latestEntryDay, pendingDiaryNudge } from "../lib/diary.js";

import { checkEntry, clockOf, diaryIssueLine, lastSectionMinute, minutesOf, strayTags, summaryState, tagsOf } from "../lib/diarycheck.js";

const DAY = `# 2026-10-30

## 今天（21:10 更新）

一天的总结，外加吐槽。

## 09:50 发上 npm

情绪：松

## 21:10 加班又写了一节

情绪：定
`;

test("cadence decides how often the folder is expected to grow", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-cadence-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "diary", "2026-10-28.md"), "# 28\n", "utf8");
  const now = new Date(2026, 9, 30, 12, 0);
  assert.match(pendingDiaryNudge(dir, now, "daily"), /no diary entry for today|no diary entry for \d{4}-\d{2}-\d{2} yet/);
  assert.equal(pendingDiaryNudge(dir, now, "weekly"), undefined, "written three days ago is recent");
  const later = new Date(2026, 10, 8, 12, 0);
  assert.match(pendingDiaryNudge(dir, later, "weekly"), /no diary entry in the past 7 days/);
  assert.equal(pendingDiaryNudge(dir, now, "off"), undefined, "off never speaks");
  assert.equal(pendingDiaryNudge(join(dir, "nope"), now, "daily"), undefined, "no diary folder is silent under every cadence");
  assert.equal(latestEntryDay(dir, now), "2026-10-28");
  rmSync(dir, { recursive: true, force: true });
});

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

test("the lesson list under the summary needs no tag either", () => {
  const text = "## 今天\n\n摘要\n\n## 今天长了什么\n\n1. 一条\n\n## 09:00 a\n\n情绪：松\n";
  const state = checkEntry({ text });
  assert.equal(state.sections, 1, "only the real section counts");
  assert.equal(state.untagged, 0);
});

test("a section without an emotion line is counted", () => {
  const text = "## 09:00 开头\n\n没有标签\n\n## 10:00 另一节\n\n情绪：松\n";
  assert.equal(checkEntry({ text }).untagged, 1);
});

test("tags are lifted out in order, and the strays are the ones the cache can never reach", () => {
  const tags = tagsOf("## a\n\n情绪：松\n\n## b\n\n情绪：烦躁\n\n## c\n\n情绪：松\n");
  assert.deepEqual(tags, ["松", "烦躁", "松"]);
  assert.deepEqual(strayTags(tags, ["松", "定"]), ["烦躁"], "deduped, and only the words outside the vocabulary");
});

test("a tag outside the vocabulary is named, because that day becomes unreachable", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-vocab-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "relationship.md"), "## 情绪词表\n\n- `松` — 卸下来\n\n- `定` — 落定\n", "utf8");
  writeFileSync(join(dir, "diary", "2026-10-30.md"), "## 09:00 a\n\n情绪：烦躁\n", "utf8");
  const line = diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 600, summaryFrom: 1050 });
  assert.match(line, /烦躁 not in the vocabulary/);
  rmSync(dir, { recursive: true, force: true });
});

test("tagging with no vocabulary section at all is named too", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-novocab-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "relationship.md"), "## 我是谁\n\n- 我是小拾\n", "utf8");
  writeFileSync(join(dir, "diary", "2026-10-30.md"), "## 09:00 a\n\n情绪：松\n", "utf8");
  const line = diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 600 });
  assert.match(line, /has no `情绪词表` section/);
  rmSync(dir, { recursive: true, force: true });
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
  assert.equal(early, "Diary check — 1 without an `情绪：` line.", "an untagged section is reported even early");
  const late = diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 18 * 60, summaryFrom: 1050 });
  assert.match(late, /no `## 今天` summary at the top/);
  rmSync(dir, { recursive: true, force: true });
});

test("a missing day and a disabled check say nothing at all", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-nod-"));
  assert.equal(diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 1300 }), undefined);
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "diary", "2026-10-30.md"), "## 今天\n\n## 09:00 a\n\n情绪：松\n", "utf8");
  assert.match(diaryIssueLine({ memoryDir: dir, day: "2026-10-30", nowMinute: 1300, summaryFrom: 1050 }), /summary is empty/);
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
  assert.match(line, /9 sections, over the 8-per-day bar/);
});

test("a summary with no stamp is present but never claimed stale", () => {
  const state = summaryState("## 今天\n\n说明\n");
  assert.equal(state.present, true);
  assert.equal(state.minute, undefined);
});
