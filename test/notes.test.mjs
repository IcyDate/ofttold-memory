import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scaffoldMemory } from "../lib/scaffold.js";
import { parseAnchors } from "../lib/anchors.js";
import { openTasks, rememberNote, titleOf } from "../lib/notes.js";
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
  });
  assert.equal(added.ok, true, added.message);
  const open = openTasks(readFileSync(join(dir, NOTE_FILE), "utf8"));
  assert.deepEqual(open, ["剥掉 spm_id_from 再匹配白名单"]);
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
    /no MEMORY\.md in that folder/,
  );
});

test("the title is derived from the text when it is not given", () => {
  assert.equal(titleOf("主人喜欢古镇，天气冷没下水。"), "主人喜欢古镇");
  assert.equal(titleOf("一条很长的、" + "字".repeat(40)).length <= 25, true);
});
