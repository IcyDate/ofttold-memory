import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  countRecalls,
  dayOf,
  isoOf,
  parseAnchors,
  readDiaries,
  readFirstSeen,
  rememberFirstSeen,
  scoreAnchors,
  today,
} from "../lib/anchors.js";

const NOW = new Date("2026-10-30T09:00:00Z");
const NOW_DAY = today(NOW);

test("a dated bullet is an anchor, guidance and comments are not", () => {
  const text = [
    "> 上限是算出来的",
    "- **枪·大肥鱼** → `2026-10-28` 补记｜读错过一次",
    "- **大肥鱼·是蓝鲸** → `relationship.md`｜名字由来",
    "<!-- - **示例·别动** → 不要改 config -->",
  ].join("\n");
  const anchors = parseAnchors(text);
  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].title, "枪·大肥鱼");
  assert.equal(isoOf(anchors[0].date), "2026-10-28");
  assert.equal(anchors[1].date, undefined, "a line pointing at a non-diary has no date of its own");
});

test("counting is per day, not per mention", () => {
  // 同一天提十次是一次「被想起」，不是十次。这是权重规则里最容易算错的一格。
  const anchor = { title: "x", date: dayOf("2026-10-28"), dayString: "2026-10-28" };
  const diaries = {
    "2026-10-28": "2026-10-28 2026-10-28 2026-10-28",
    "2026-10-29": "01:00 提了一次，02:00 又提了一次 2026-10-28",
    "2026-10-30": "无关内容",
  };
  assert.equal(countRecalls(anchor, diaries), 1, "two mentions on one day are one day");
});

test("the entry that introduced the fact is its birth, not a recall", () => {
  const anchor = { title: "x", date: dayOf("2026-10-28"), dayString: "2026-10-28" };
  assert.equal(countRecalls(anchor, { "2026-10-28": "2026-10-28" }), 0);
});

test("recall doubles the interval, so an old line everyone touches outlives a new one", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-score-"));
  // 三次被想起才追平六天的年龄：S 从 1 变到 8，才把 exp(-7/8)=0.42 抬过 exp(-1)=0.37。
  // 少一次（S=4）就还是新的那条赢——所以「老但常想起」不是自动的，得有次数。
  const diaries = {
    "2026-10-26": "提过 2026-10-23",
    "2026-10-27": "提过 2026-10-23",
    "2026-10-28": "提过 2026-10-23",
  };
  const text = [
    "- **旧但常被想起** → `2026-10-23`",
    "- **新但没人碰** → `2026-10-29`",
  ].join("\n");
  const { anchors } = scoreAnchors({
    text,
    memoryDir: dir,
    diaries,
    todayIso: isoOf(NOW_DAY),
    nowDay: NOW_DAY,
  });
  assert.equal(anchors[0].title, "旧但常被想起", "age alone must not decide");
  assert.ok(anchors[0].R > anchors[1].R);
  rmSync(dir, { recursive: true, force: true });
});

test("a line with no date of its own is dated the day it first appeared", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-seen-"));
  const text = "- **大肥鱼·是蓝鲸** → `relationship.md`";
  const first = scoreAnchors({ text, memoryDir: dir, diaries: {}, todayIso: "2026-10-01", nowDay: NOW_DAY });
  assert.equal(first.anchors[0].date, "2026-10-01", "first appearance becomes its date");
  // 第二天再跑：还是那天，不会跟着今天漂。
  const second = scoreAnchors({ text, memoryDir: dir, diaries: {}, todayIso: "2026-10-30", nowDay: NOW_DAY });
  assert.equal(second.anchors[0].date, "2026-10-01", "the date must not drift forward");
  assert.equal(second.anchors[0].age, 29);
  rmSync(dir, { recursive: true, force: true });
});

test("a line that leaves the list and comes back is new again", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-return-"));
  rememberFirstSeen(dir, ["甲"], "2026-10-01");
  rememberFirstSeen(dir, ["乙"], "2026-10-20");
  assert.deepEqual(Object.keys(readFirstSeen(dir)), ["乙"], "a title no longer present is forgotten");
  rmSync(dir, { recursive: true, force: true });
});

test("a corrupt or missing state file costs a migration, not a session", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-corrupt-"));
  mkdirSync(join(dir, ".ofttold"), { recursive: true });
  writeFileSync(join(dir, ".ofttold", "anchors.json"), "{not json", "utf8");
  assert.deepEqual(readFirstSeen(dir), {});
  const { anchors } = scoreAnchors({
    text: "- **甲** → `relationship.md`",
    memoryDir: dir,
    diaries: {},
    todayIso: "2026-10-30",
    nowDay: NOW_DAY,
  });
  assert.equal(anchors[0].date, "2026-10-30");
  rmSync(dir, { recursive: true, force: true });
});

test("reading diaries ignores anything that is not a dated entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-diaries-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "diary", "2026-10-29.md"), "x", "utf8");
  writeFileSync(join(dir, "diary", "README.md"), "命名约定", "utf8");
  const entries = readDiaries(dir);
  assert.deepEqual(Object.keys(entries), ["2026-10-29"]);
  rmSync(dir, { recursive: true, force: true });
});

test("the cap keeps the most recalled and names what sank", async () => {
  const { capAnchors } = await import("../lib/sources.js");
  const dir = mkdtempSync(join(tmpdir(), "ofttold-cap-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  for (const day of ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]) {
    writeFileSync(join(dir, "diary", `${day}.md`), "又提到 2026-10-01 这一天", "utf8");
  }
  const text = [
    "- **老但天天被想起** → `2026-10-01`",
    "- **昨天才写** → `2026-10-29`",
    "- **前天写的** → `2026-10-28`",
  ].join("\n");
  const capped = capAnchors(text, dir, 1);
  assert.match(capped, /沉底 2 条/);
  assert.match(capped, /\*\*老但天天被想起\*\*/, "the recalled one stays");
  // 沉底的仍然在原文里——忘的是视线，不是记录。
  assert.match(text, /\*\*昨天才写\*\*/);
  rmSync(dir, { recursive: true, force: true });
});

test("nothing to do means the text comes back byte-identical", async () => {
  const { capAnchors } = await import("../lib/sources.js");
  const dir = mkdtempSync(join(tmpdir(), "ofttold-nocap-"));
  const text = "> 说明\n\n- **甲** → `2026-10-01`\n- **乙** → `2026-10-02`";
  assert.equal(capAnchors(text, dir, 8), text);
  assert.equal(capAnchors(text, dir, 0), text);
  rmSync(dir, { recursive: true, force: true });
});
