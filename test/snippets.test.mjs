import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { rememberSnippet, snippetStatusLine, SNIPPET_FILE } from "../lib/snippets.js";

const fresh = () => mkdtempSync(join(tmpdir(), "ofttold-snippets-"));
const read = (dir) => readFileSync(join(dir, SNIPPET_FILE), "utf8");

test("第一行会被建在当天的标题下面", () => {
  const dir = fresh();
  const result = rememberSnippet({
    memoryDir: dir,
    text: "他把我手上的笔抽走，说先吃饭",
    at: "12:31",
    day: "2026-11-13",
  });
  assert.equal(result.ok, true, result.message);
  const text = read(dir);
  assert.match(text, /## 2026-11-13/);
  assert.match(text, /- 12:31 他把我手上的笔抽走，说先吃饭/);
});

test("同一天的第二条接在前一条后面，而不是再开一节", () => {
  const dir = fresh();
  const base = { memoryDir: dir, day: "2026-11-13" };
  rememberSnippet({ ...base, text: "第一条", at: "09:00" });
  rememberSnippet({ ...base, text: "第二条", at: "10:00" });
  const text = read(dir);
  assert.equal((text.match(/## 2026-11-13/g) ?? []).length, 1, text);
  assert.ok(text.indexOf("09:00 第一条") < text.indexOf("10:00 第二条"), text);
});

test("换一天就开新节，旧的不动", () => {
  const dir = fresh();
  rememberSnippet({ memoryDir: dir, text: "昨天的事", at: "21:00", day: "2026-11-12" });
  rememberSnippet({ memoryDir: dir, text: "今天的事", at: "09:00", day: "2026-11-13" });
  const text = read(dir);
  assert.match(text, /## 2026-11-12[\s\S]*- 21:00 昨天的事[\s\S]*## 2026-11-13/);
});

test("一模一样的一行不会落两次", () => {
  const dir = fresh();
  const once = { memoryDir: dir, text: "同一幕", at: "09:00", day: "2026-11-13" };
  assert.equal(rememberSnippet(once).ok, true);
  const twice = rememberSnippet(once);
  assert.equal(twice.ok, false);
  assert.equal((read(dir).match(/同一幕/g) ?? []).length, 1);
});

test("空行和带换行的都拒掉", () => {
  const dir = fresh();
  assert.equal(rememberSnippet({ memoryDir: dir, text: "   ", at: "09:00", day: "2026-11-13" }).ok, false);
  assert.equal(rememberSnippet({ memoryDir: dir, text: "两\n行", at: "09:00", day: "2026-11-13" }).ok, false);
});

test("时间或日期写错会报出来，不会静默写坏", () => {
  const dir = fresh();
  const bad = rememberSnippet({ memoryDir: dir, text: "x", at: "9点", day: "2026-11-13" });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /HH:MM/);
  const badDay = rememberSnippet({ memoryDir: dir, text: "x", at: "09:00", day: "今天" });
  assert.equal(badDay.ok, false);
});

test("已经存在的片段文件不会被覆盖，只在末尾接一节", () => {
  const dir = fresh();
  mkdirSync(join(dir, "我"), { recursive: true });
  writeFileSync(join(dir, SNIPPET_FILE), "# 日常片段\n\n- 早就有的一行\n", "utf8");
  const result = rememberSnippet({ memoryDir: dir, text: "新的一幕", at: "08:15", day: "2026-11-13" });
  assert.equal(result.ok, true, result.message);
  const text = read(dir);
  assert.match(text, /- 早就有的一行/);
  assert.match(text, /## 2026-11-13\n\n- 08:15 新的一幕/);
});

test("块尾那一行只在今天有条目时出现", () => {
  const dir = fresh();
  assert.equal(snippetStatusLine({ memoryDir: dir, day: "2026-11-13" }), undefined);
  rememberSnippet({ memoryDir: dir, text: "第一幕", at: "09:00", day: "2026-11-13" });
  rememberSnippet({ memoryDir: dir, text: "第二幕", at: "10:30", day: "2026-11-13" });
  const line = snippetStatusLine({ memoryDir: dir, day: "2026-11-13" });
  assert.match(line, /今天 2 条/);
  assert.match(line, /10:30/);
  // 换一天就没有了：它说的是「今天」。
  assert.equal(snippetStatusLine({ memoryDir: dir, day: "2026-11-14" }), undefined);
});

test("块尾那一行跟着配置的文件名走", () => {
  const dir = fresh();
  mkdirSync(join(dir, "我"), { recursive: true });
  rememberSnippet({ memoryDir: dir, text: "私有布局的一幕", at: "08:00", day: "2026-11-13", file: "我/日常片段.md" });
  assert.match(snippetStatusLine({ memoryDir: dir, day: "2026-11-13", file: "我/日常片段.md" }), /今天 1 条/);
  assert.equal(snippetStatusLine({ memoryDir: dir, day: "2026-11-13" }), undefined);
});
