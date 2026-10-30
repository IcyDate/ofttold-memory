/**
 * The nudge that says today's diary entry is not written yet.
 *
 * Two ways to get this wrong, both of which make it useless rather than broken:
 * naming the UTC day (so it is wrong for most of the planet east of Greenwich), and
 * firing in a folder that never had a diary to begin with (so it reads as nagging
 * from a plugin the user pointed somewhere else on purpose).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { localDay, pendingDiaryNudge } from "../lib/diary.js";

function folder({ diary = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nudge-"));
  if (diary) mkdirSync(join(dir, "diary"));
  return dir;
}

test("the day is the local one, not the UTC one", () => {
  // 本地 00:30 往东的时区里，UTC 还停在昨天。用 toISOString 取日期就会指着
  // 用户已经写过的那一天，然后在该提醒的日子闭嘴。
  const localMidnight = new Date(2026, 9, 30, 0, 30);
  assert.equal(localDay(localMidnight), "2026-10-30");
  if (localMidnight.getTimezoneOffset() < 0) {
    assert.notEqual(
      localMidnight.toISOString().slice(0, 10),
      "2026-10-30",
      "this test only has teeth east of UTC; the assertion above is the real one",
    );
  }
});

test("an unwritten day is named, with the file it expects", () => {
  const dir = folder();
  try {
    const line = pendingDiaryNudge(dir, new Date(2026, 9, 30, 9, 0));
    assert.ok(line !== undefined);
    assert.match(line, /diary\/2026-10-30\.md/);
    // 这一行是状态，不是指令：它只说「今天没有」，把「怎么写」留给注入块开头那句和 skill。
    // 指令语气会和同一块尾的体检报告抢注意力，两边都变得可跳过。
    assert.doesNotMatch(line, /ofttold-ritual|must|should/, "the status line must not read as an instruction");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a written day says nothing at all", () => {
  const dir = folder();
  try {
    writeFileSync(join(dir, "diary", "2026-10-30.md"), "# 2026-10-30\n", "utf8");
    assert.equal(pendingDiaryNudge(dir, new Date(2026, 9, 30, 9, 0)), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a folder without a diary directory is not nagged", () => {
  // 用户完全可以把 memoryDir 指向一个只有笔记的文件夹；那种文件夹没有「日记」
  // 这件事，提醒它就成了噪音。
  const dir = folder({ diary: false });
  try {
    assert.equal(pendingDiaryNudge(dir, new Date(2026, 9, 30, 9, 0)), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing or empty memoryDir is not an error", () => {
  assert.equal(pendingDiaryNudge(undefined), undefined);
  assert.equal(pendingDiaryNudge(""), undefined);
  assert.equal(pendingDiaryNudge("/nonexistent-folder-for-this-test"), undefined);
});
