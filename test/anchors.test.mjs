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
  const anchor = { title: "片子·枪", date: dayOf("2026-10-28"), dayString: "2026-10-28" };
  const diaries = {
    "2026-10-28": "片子 片子 片子",
    "2026-10-29": "01:00 提了一次，02:00 又提了一次 片子",
    "2026-10-30": "无关内容",
  };
  assert.equal(countRecalls(anchor, diaries), 1, "two mentions on one day are one day");
});

test("an anchor is recalled when the anchor is discussed, not when its birth date is written", () => {
  // 真撞上的一格：四条锚点同一天出生，于是「10-30」出现在哪篇日记里，四条一起加分。
  // 那条日记里根本没提其中三件，可它们照样挤掉了别的位置。
  const anchor = { title: "反例·修订 N·被纠正", date: dayOf("2026-10-30"), dayString: "2026-10-30" };
  const diaries = {
    "2026-10-31": "今天读 2026-10-30 那天的日记，发现写错了",  // 只提日期
    "2026-11-01": "又踩了一次：反例要带上修订号",              // 提了 handle
  };
  assert.equal(countRecalls(anchor, diaries), 1, "only the handle is a recall");
});

test("a one-character handle is not a handle — it falls back to the whole title", () => {
  // 「拾」会命中每篇日记里的「拾光」，那等于每条都加分。宁可少数，不要虚高。
  const anchor = { title: "拾·从字里拾回来", date: dayOf("2026-10-30"), dayString: "2026-10-30" };
  const diaries = {
    "2026-10-31": "今天在用拾光这个文件夹，拾光很好",
    "2026-11-01": "拾·从字里拾回来 这句我今天又想了想",
  };
  assert.equal(countRecalls(anchor, diaries), 1, "only the full title counts");
});

test("the entry that introduced the fact is its birth, not a recall", () => {
  const anchor = { title: "x", date: dayOf("2026-10-28"), dayString: "2026-10-28" };
  assert.equal(countRecalls(anchor, { "2026-10-28": "2026-10-28" }), 0);
});

test("recall doubles the interval, so an old line everyone touches outlives a new one", () => {
  // 三次被想起才追平六天的年龄：S 从 1 变到 8，才把 exp(-7/8)=0.42 抬过 exp(-1)=0.37。
  // 少一次（S=4）就还是新的那条赢——「老但常想起」不是自动的，得有次数。
  const diaries = {
    "2026-10-26": "又提到 旧但常被想起",
    "2026-10-27": "又提到 旧但常被想起",
    "2026-10-28": "又提到 旧但常被想起",
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

test("the skeleton's sample lines are illustrations, not memories", () => {
  const text = [
    "- **示例·项目在哪** → `~/work/my-project`｜省得每次问",
    "- **Example · where the project is** → `~/work/my-project` | saves asking",
    "- **真的一条** → `relationship.md`",
  ].join("\n");
  const { stamped, text: out } = stampUndated(text, "2026-10-30");
  assert.deepEqual(stamped, ["真的一条"], "only the real line is stamped");
  assert.match(out, /- \*\*示例·项目在哪\*\* → `~\/work\/my-project`/);
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
    writeFileSync(join(dir, "diary", `${day}.md`), "又提到 老但天天被想起 这件事", "utf8");
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

test("the same local date scores the same at midnight and at noon", () => {
  // 实测过的 bug：`today()` 原来用 UTC 日期，东八区凌晨 00:30 算出来是前一天，
  // 于是同一个北京日期，凌晨算一遍、中午再算一遍，权重能差一倍（0.607 对 0.472）。
  const night = new Date(2026, 10, 2, 0, 30); // 本地 11-02 00:30
  const noon = new Date(2026, 10, 2, 12, 0);
  assert.equal(today(night), today(noon), "同一个本地日期必须是同一个 day 数字");
  // 而且必须和 dayOf() 用同一套算法，否则两者算出来的日子会错一天。
  assert.equal(today(night), dayOf(isoOf(today(night))));
  assert.equal(isoOf(today(night)), "2026-11-02");
});

test("a one-character handle falls back to the longest segment, not the full title", () => {
  // 实测过的 bug：`拾·从字里拾回来` 的 handle 是「拾」，一个字不是 handle（会匹配
  // 拾光，每个日记里都有），于是退回**全标题**——但全标题带着 `·` 分隔符，日记从不
  // 那样写，这条锚点就永远 0 次被提起，被当成没人记得的东西沉掉。
  const anchor = { title: "拾·从字里拾回来", date: 5, dayString: "2026-10-28" };
  const diaries = { "2026-10-29": "今天想明白从字里拾回来是什么意思" };
  assert.equal(countRecalls(anchor, diaries), 1, "最长段「从字里拾回来」应当命中");
});

test("the template's examples live in comments, so stamping leaves the file alone", () => {
  // 第一版只看 `示例·` 前缀，可模板把中英两组示例都放在 <!-- --> 里，标题是
  // `项目的规矩` / `Project rules` 这种正常词，照样被盖上日期——第一次运行就改
  // 用户刚拿到的文件。
  const template = readFileSync(new URL("../templates/memory.md", import.meta.url), "utf8");
  const result = stampUndated(template, "2026-11-02");
  assert.deepEqual(result.stamped, []);
  assert.equal(result.text, template, "盖章不该动模板一个字");
});
