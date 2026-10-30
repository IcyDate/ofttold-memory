import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  countRecalls,
  dayOf,
  isoOf,
  parseAnchors,
  readDiaries,
  scoreAnchors,
  stampUndated,
  today,
} from "../lib/anchors.js";

const NOW_DAY = today(new Date("2026-10-30T09:00:00Z"));

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
  // 同一天提十次是一次「被想起」，不是十次——权重规则里最容易算错的一格。
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
  // 三次被想起才追平六天的年龄：S 从 1 变到 8，才把 exp(-7/8)=0.42 抬过 exp(-1)=0.37。
  // 少一次（S=4）就还是新的那条赢——「老但常想起」不是自动的，得有次数。
  const diaries = {
    "2026-10-26": "提过 2026-10-23",
    "2026-10-27": "提过 2026-10-23",
    "2026-10-28": "提过 2026-10-23",
  };
  const text = ["- **旧但常被想起** → `2026-10-23`", "- **新但没人碰** → `2026-10-29`"].join("\n");
  const { anchors } = scoreAnchors({ text, diaries, nowDay: NOW_DAY });
  assert.equal(anchors[0].title, "旧但常被想起", "age alone must not decide");
  assert.ok(anchors[0].R > anchors[1].R);
});

test("a line with no date of its own gets stamped in the line, not in a sidecar", () => {
  const text = [
    "> 上限 8 条",
    "- **大肥鱼·是蓝鲸** → `relationship.md`｜名字由来",
    "- **枪** → `2026-10-28` 补记｜读错过",
  ].join("\n");
  const { text: stamped, stamped: titles } = stampUndated(text, "2026-10-30");
  assert.deepEqual(titles, ["大肥鱼·是蓝鲸"], "only the undated line is touched");
  assert.match(stamped, /→ `2026-10-30` 起｜`relationship.md`/);
  assert.match(stamped, /- \*\*枪\*\* → `2026-10-28` 补记/, "a dated line is left byte-identical");
  assert.match(stamped, /> 上限 8 条/, "guidance is untouched");
  assert.deepEqual(stampUndated(stamped, "2026-10-31").stamped, [], "stamping is idempotent");
});

test("a stamped line is scored from its stamp, and ages from there", () => {
  const { text: stamped } = stampUndated("- **甲** → `relationship.md`", "2026-10-01");
  const { anchors } = scoreAnchors({ text: stamped, diaries: {}, nowDay: NOW_DAY });
  assert.equal(anchors[0].date, "2026-10-01");
  assert.equal(anchors[0].age, 29);
});

test("reading diaries ignores anything that is not a dated entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-diaries-"));
  mkdirSync(join(dir, "diary"), { recursive: true });
  writeFileSync(join(dir, "diary", "2026-10-29.md"), "x", "utf8");
  writeFileSync(join(dir, "diary", "README.md"), "命名约定", "utf8");
  assert.deepEqual(Object.keys(readDiaries(dir)), ["2026-10-29"]);
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
