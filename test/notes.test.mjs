import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scaffoldMemory } from "../lib/scaffold.js";
import { parseAnchors } from "../lib/anchors.js";
import { completeTask, daysOpen, openTasks, rememberNote, staleTasks, taskStatusLine, titleOf } from "../lib/notes.js";
import { NOTE_FILE } from "../lib/notes.js";

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-notes-"));
  scaffoldMemory(dir);
  return dir;
};

test("an anchor note lands in the section the plugin actually reads", () => {
  const dir = fresh();
  const result = rememberNote({
    memoryDir: dir,
    text: "主人喜欢一条溪穿街的古镇，黄龙溪那种",
    title: "主人喜欢古镇",
  });
  assert.equal(result.ok, true, result.message);
  const text = readFileSync(join(dir, NOTE_FILE), "utf8");
  assert.match(text, /- \*\*主人喜欢古镇\*\* → 主人喜欢一条溪穿街的古镇/);
  // 写进去的必须能被锚点解析认出来，否则它不进权重、也不会沉底。
  const titles = parseAnchors(text).map((a) => a.title);
  assert.ok(titles.includes("主人喜欢古镇"), `parseAnchors 没认出：${titles}`);
});

test("the same line twice is refused, not duplicated", () => {
  const dir = fresh();
  // 别动配置 is a phrase the template comment already uses as a sample — picking
  // it here made the count assertion count the sample too.
  const once = { memoryDir: dir, text: "主人不吃香菜", title: "主人不吃香菜" };
  assert.equal(rememberNote(once).ok, true);
  const twice = rememberNote(once);
  assert.equal(twice.ok, false);
  assert.match(twice.message, /already there/);
  const text = readFileSync(join(dir, NOTE_FILE), "utf8");
  assert.equal(text.split("- **主人不吃香菜**").length - 1, 1);
});

test("a task opens the 待办 section and reads back", () => {
  const dir = fresh();
  assert.equal(openTasks(readFileSync(join(dir, NOTE_FILE), "utf8")).length, 0);
  const added = rememberNote({
    memoryDir: dir,
    text: "剥掉 spm_id_from 再匹配白名单",
    kind: "task",
    stampText: "2026-11-02",
  });
  assert.equal(added.ok, true, added.message);
  const open = openTasks(readFileSync(join(dir, NOTE_FILE), "utf8"));
  assert.deepEqual(open, [
    { text: "剥掉 spm_id_from 再匹配白名单", opened: "2026-11-02", due: undefined },
  ]);
});

test("a missing anchor section is refused rather than invented", () => {
  const dir = fresh();
  const file = join(dir, NOTE_FILE);
  writeFileSync(file, "# 我的笔记\n\n随便写点什么。\n", "utf8");
  const result = rememberNote({ memoryDir: dir, text: "随便一条" });
  assert.equal(result.ok, false);
  assert.match(result.message, /no `## 常被提起` section/);
  // 一个字的文件都不该被改
  assert.equal(readFileSync(file, "utf8"), "# 我的笔记\n\n随便写点什么。\n");
});

test("empty text, unknown kind and a missing file all fail loudly", () => {
  const dir = fresh();
  assert.equal(rememberNote({ memoryDir: dir, text: "   " }).ok, false);
  assert.match(rememberNote({ memoryDir: dir, text: "x", kind: "someday" }).message, /unknown kind/);
  assert.match(
    rememberNote({ memoryDir: join(dir, "nope"), text: "x" }).message,
    /no memory\.md in that folder/,
  );
});

test("the title is derived from the text when it is not given", () => {
  assert.equal(titleOf("主人喜欢古镇，天气冷没下水。"), "主人喜欢古镇");
  assert.equal(titleOf("一条很长的、" + "字".repeat(40)).length <= 25, true);
});

test("a task carries the day it was opened, and that day is readable back", () => {
  const dir = fresh();
  rememberNote({ memoryDir: dir, text: "等上游合并", kind: "task", stampText: "2026-11-01" });
  const text = readFileSync(join(dir, NOTE_FILE), "utf8");
  assert.match(text, /- \[ \] 2026-11-01 起 ｜ 等上游合并/);
  const [task] = openTasks(text);
  assert.equal(task.opened, "2026-11-01");
  // 「挂了多久」是待办唯一有用的信息，所以这个数必须真的算得出来。
  assert.equal(daysOpen(task, "2026-11-03"), 2);
  assert.equal(daysOpen({ text: "no date" }, "2026-11-03"), undefined);
});

test("completing a task ticks it instead of deleting it", () => {
  const dir = fresh();
  rememberNote({ memoryDir: dir, text: "修白名单", kind: "task", stampText: "2026-11-02" });
  const done = completeTask({ memoryDir: dir, text: "修白名单", stampText: "2026-11-04" });
  assert.equal(done.ok, true, done.message);
  const text = readFileSync(join(dir, NOTE_FILE), "utf8");
  // 留着，不是删掉：它是「这件事做过」的唯一证据。
  assert.match(text, /- \[x\] 2026-11-02 起 ｜ 修白名单（2026-11-04 完成）/);
  // 勾掉之后不再计入未完成，块尾那条数会自己少一条。
  assert.equal(openTasks(text).length, 0);
  // 再勾一次要拒绝，不能默默成功。
  assert.equal(completeTask({ memoryDir: dir, text: "修白名单" }).ok, false);
});

test("completion matches the text exactly, and names what is actually open", () => {
  const dir = fresh();
  rememberNote({ memoryDir: dir, text: "修白名单和缓存", kind: "task", stampText: "2026-11-02" });
  const wrong = completeTask({ memoryDir: dir, text: "修白名单", stampText: "2026-11-04" });
  // 模糊匹配会勾掉错的那一条，而"悄悄完成了错的"比"什么都完不成"更糟。
  assert.equal(wrong.ok, false);
  assert.match(wrong.message, /no open task reads exactly "修白名单"/);
  assert.match(wrong.message, /修白名单和缓存/);
  assert.equal(readFileSync(join(dir, NOTE_FILE), "utf8").includes("[x]"), false);
});

test("a task nobody does for months stops counting and starts asking", () => {
  const dir = fresh();
  rememberNote({ memoryDir: dir, text: "新的一条", kind: "task", stampText: "2026-11-02" });
  rememberNote({ memoryDir: dir, text: "挂了 40 天的", kind: "task", stampText: "2026-09-23" });
  rememberNote({ memoryDir: dir, text: "挂了 10 天的", kind: "task", stampText: "2026-10-23" });
  const text = readFileSync(join(dir, NOTE_FILE), "utf8");
  // 默认 30 天：只有那条超龄的被挑出来。
  const stale = staleTasks(text, "2026-11-02");
  assert.equal(stale.length, 1);
  assert.equal(stale[0].age, 40);
  // 阈值可调，也能关掉——关掉之后一句都不提。
  assert.equal(staleTasks(text, "2026-11-02", 7).length, 2);
  assert.deepEqual(staleTasks(text, "2026-11-02", 0), []);
  // 没有日期的任务算不出年龄，不猜。
  assert.deepEqual(staleTasks("- [ ] no date here", "2026-11-02"), []);
});

test("writing and reading use the same exact heading match", () => {
  // 真 bug：写入端用子串匹配、读取端用精确匹配，于是
  // `## 常被提起（手动维护，上限 8 条）` 会被写进去却永远读不出来——
  // 写得成功、读不出来，两边都不报错。
  const dir = fresh();
  writeFileSync(
    join(dir, NOTE_FILE),
    "# 记忆\n\n## 常被提起（手动维护，上限 8 条）\n\n> 说明。\n\n## 待办事项\n\n- [ ] 2026-11-01 起 ｜ 邻居的\n",
    "utf8",
  );
  const refused = rememberNote({ memoryDir: dir, text: "新锚点", kind: "anchor" });
  assert.equal(refused.ok, false, "带后缀的标题不能被当作 `常被提起` 写进去");
  // 拒绝的时候要指出来那个几乎一样的标题，否则用户只看到「没有这一节」。
  assert.match(refused.message, /常被提起（手动维护，上限 8 条）/);

  // `## 待办事项` 不能被当成 `## 待办`。
  assert.deepEqual(openTasks(readFileSync(join(dir, NOTE_FILE), "utf8")), []);
  rememberNote({ memoryDir: dir, text: "真正的待办", kind: "task", stampText: "2026-11-02" });
  const open = openTasks(readFileSync(join(dir, NOTE_FILE), "utf8"));
  assert.deepEqual(open.map((t) => t.text), ["真正的待办"]);
});

test("the whole line works as well as the bare text, and nothing else does", () => {
  const dir = fresh();
  rememberNote({ memoryDir: dir, text: "修白名单", kind: "task", stampText: "2026-11-02" });
  rememberNote({ memoryDir: dir, text: "修白名单和缓存", kind: "task", stampText: "2026-11-02" });
  // 把文件里那一行原样贴回来，指的是同一条——前缀不是模糊，是读取端自己认得的那段。
  const full = completeTask({ memoryDir: dir, text: "- [ ] 2026-11-02 起 ｜ 修白名单", stampText: "2026-11-03" });
  assert.equal(full.ok, true);
  // 但「修白名单」仍然不能勾掉「修白名单和缓存」：悄悄完成了错的那条更糟。
  const near = completeTask({ memoryDir: dir, text: "修白名单", stampText: "2026-11-03" });
  assert.equal(near.ok, false);
  assert.match(near.message, /修白名单和缓存/);
});

test("a task with a due date comes due, and one without only ages", () => {
  // 这是「过两天看」那句话的真正缺口：只有 `起` 的那条永远只会变老，说不出「今天」。
  const dir = fresh();
  rememberNote({ memoryDir: dir, text: "看收割效果", kind: "task", stampText: "2026-11-03", due: "2026-11-05" });
  rememberNote({ memoryDir: dir, text: "没有到期日的那条", kind: "task", stampText: "2026-11-03" });
  const text = readFileSync(join(dir, NOTE_FILE), "utf8");

  assert.match(text, /- \[ \] 2026-11-03 起 ｜ 2026-11-05 到期 ｜ 看收割效果/);

  // 还没到：只说条数，不说「到期」
  const before = taskStatusLine({ text, todayIso: "2026-11-04" });
  assert.match(before, /2 open tasks/);
  assert.doesNotMatch(before, /due now/);

  // 到期当天：点名，而且是「今天到期」
  const onDay = taskStatusLine({ text, todayIso: "2026-11-05" });
  assert.match(onDay, /1 task due now/);
  assert.match(onDay, /看收割效果（今天到期）/);

  // 过了：说逾期几天
  const late = taskStatusLine({ text, todayIso: "2026-11-09" });
  assert.match(late, /看收割效果（逾期 4 天）/);

  // 状态行仍然不是指令
  for (const line of [before, onDay, late]) {
    assert.doesNotMatch(line, /ofttold-ritual|must|should/);
  }
});

test("a due date that is not a date is refused", () => {
  const dir = fresh();
  const bad = rememberNote({ memoryDir: dir, text: "x", kind: "task", stampText: "2026-11-03", due: "过两天" });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /YYYY-MM-DD/);
});

test("a due date on an anchor is refused, not silently dropped", () => {
  // 静默忽略是最难查的那种错：调用方以为记下了期限，文件里没有。
  const dir = fresh();
  const r = rememberNote({ memoryDir: dir, text: "一条事实", kind: "anchor", due: "2026-11-09" });
  assert.equal(r.ok, false);
  assert.match(r.message, /only applies to a task/);
});
