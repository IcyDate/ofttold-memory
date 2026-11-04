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
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { localDay, pendingDiaryNudge } from "../lib/diary.js";
import { checkEntry, diaryIssueLine, DETOUR_FROM } from "../lib/diarycheck.js";

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
    // 先有一天旧的：没有这条会走「第一天」那条分支，测不到「今天没写」。
    writeFileSync(join(dir, "diary", "2026-10-28.md"), "# entry\n");
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

test("an empty folder says what it is, not that today is late", () => {
  // 新装的文件夹里一条都没有。这时说「今天还没写」读起来像在催一个还没有机会
  // 开始的人；而「装完没区别」这个最常听到的反馈，根子就是这个状态不说话。
  const dir = folder();
  try {
    const line = pendingDiaryNudge(dir, new Date(2026, 9, 30, 9, 0));
    assert.ok(line !== undefined, "the first day still says something");
    assert.match(line, /has no entries yet/);
    assert.doesNotMatch(line, /no diary entry for/, "it must not read as a missed day");
    assert.doesNotMatch(line, /ofttold-ritual|must|should/);
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

test("today's sections must say what they believed before — but only from the start date", () => {
  const day = (text, date) =>
    diaryIssueLine({ memoryDir: "/tmp", day: date, nowMinute: 600, enabled: true, text });
  // 日期闸门：规则生效前的日子不做回溯补写，补写等于编造当时怎么想的。
  const before = checkEntry({ text: "## 09:00 x\n情绪：定\n正文。\n" });
  assert.equal(before.sectionsWithoutDetour, 1);
  assert.ok(DETOUR_FROM > "2026-10-31", "the rule starts after the day it was decided");
});

test("a section with a 岔路 line stops being counted", () => {
  const withLine = checkEntry({ text: "## 09:00 x\n情绪：定\n岔路：我以为 A，其实是 B。\n正文。\n" });
  const without = checkEntry({ text: "## 09:00 x\n情绪：定\n正文。\n" });
  assert.equal(without.sectionsWithoutDetour, 1);
  assert.equal(withLine.sectionsWithoutDetour, 0);
  // 两行的也算（`岔路：没有，我直接查了文件。` 同样是一行记录）。
  const honest = checkEntry({ text: "## 09:00 x\n情绪：定\n岔路：没有，我直接查了文件。\n" });
  assert.equal(honest.sectionsWithoutDetour, 0);
});

test("an empty vocabulary and a missing one are different stories", () => {
  const dir = mkdtempSync(join(tmpdir(), "vocab-empty-"));
  try {
    mkdirSync(join(dir, "diary"), { recursive: true });
    // 模板里就有 `## 情绪词表`，只是还没写词——这是第一天，不是走错地方。
    writeFileSync(join(dir, "relationship.md"), "## 情绪词表\n\n- `（词）` — 占位\n");
    writeFileSync(join(dir, "diary", "2026-11-02.md"), "## 09:00 x\n情绪：定\n岔路：没有。\n");
    const line = diaryIssueLine({ memoryDir: dir, day: "2026-11-02", nowMinute: 600 });
    assert.match(line ?? "", /still empty/);
    assert.doesNotMatch(line ?? "", /has no `情绪词表` section/);
    // 真没有这一节时，才说「没有这一节」。
    writeFileSync(join(dir, "relationship.md"), "## 我是谁\n\n一句话。\n");
    const missing = diaryIssueLine({ memoryDir: dir, day: "2026-11-02", nowMinute: 600 });
    assert.match(missing ?? "", /has no `情绪词表` section/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("a second session on the same day is told the entry is not its own", () => {
  // 同一天开两个会话：第二个看到的是一份已经存在的文件，于是整段沉默，而它做了几
  // 小时的事一个字都没进去。判据取了一个被别的会话满足过的代理值。
  const dir = folder();
  try {
    const file = join(dir, "diary", "2026-10-30.md");
    writeFileSync(file, "# 早些时候的会话写的\n");
    const writtenAt = new Date(2026, 9, 30, 10, 26).getTime();
    utimesSync(file, new Date(writtenAt), new Date(writtenAt));

    const now = new Date(2026, 9, 30, 16, 0);

    // 文件写在这个会话开始之前 → 要说一句
    const later = pendingDiaryNudge(dir, now, "daily", { sessionStartedAt: now.getTime() - 5 * 3600 * 1000 });
    assert.match(later, /last written at 10:26, before this session started/);

    // 会话开始于写入之前 → 就是它自己写的，闭嘴
    assert.equal(
      pendingDiaryNudge(dir, now, "daily", { sessionStartedAt: writtenAt - 60_000 }),
      undefined,
      "an entry written after this session started is this session's",
    );

    // 没有会话开始时间 → 只看「是不是这个会话写的」这一层，但它已经五个半小时没动，
    // 所以第三种状态（今天写过，然后就不动了）要说一句
    assert.match(
      pendingDiaryNudge(dir, now, "daily", { staleHours: 2 }),
      /last written at 10:26, more than 2h ago/,
      "written today by this session, then untouched for hours, is its own state",
    );

    // 关掉阈值 → 退回只看「在不在」
    assert.equal(pendingDiaryNudge(dir, now, "daily", { staleHours: 0 }), undefined);
    // 不传阈值（库的默认）：沉默，默认值由配置层给，不在库里埋一个看不见的口味
    assert.equal(pendingDiaryNudge(dir, now, "daily"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an entry that exists but has not been touched for hours says when it stopped", () => {
  // 第三种状态：文件在、也确实是这个会话写的、体检全绿——然后三个小时没再动过。
  // 前两句只看「今天有没有这个文件」和「是不是别的会话写的」，都看不见这一段。
  const dir = folder();
  try {
    const file = join(dir, "diary", "2026-10-30.md");
    writeFileSync(file, "# 上午写的\n");
    const writtenAt = new Date(2026, 9, 30, 9, 40).getTime();
    utimesSync(file, new Date(writtenAt), new Date(writtenAt));

    // 半小时后：还没到阈值，不说话
    assert.equal(
      pendingDiaryNudge(dir, new Date(2026, 9, 30, 10, 10), "daily", { staleHours: 2 }),
      undefined,
      "a fresh write is not stale",
    );

    // 两个半小时后：说一句，报时刻和「超过几小时」，不报分钟差
    const line = pendingDiaryNudge(dir, new Date(2026, 9, 30, 12, 10), "daily", { staleHours: 2 });
    assert.match(line, /last written at 09:40, more than 2h ago/);

    // 只是事实，不是催促：不出现任何「该写了」的判断
    assert.doesNotMatch(line, /should|yet|write it/i);

    // 时刻不随分钟滚动——同一小时内反复渲染，这一行是稳定的
    assert.equal(
      line,
      pendingDiaryNudge(dir, new Date(2026, 9, 30, 12, 55), "daily", { staleHours: 2 }),
      "the line names an hour and a threshold, not a live countdown",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
