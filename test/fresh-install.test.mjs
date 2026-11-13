/**
 * 新装用户能不能直接用（2026-11-13）。
 *
 * 起因：主人问「不要光看我们的情况，也要看新用户安装后的情况」。我用一个空文件夹跑了一遍，
 * 发现两个「开箱即死」：
 *   1. `tier_index` 在模板上直接报错——模板是 `## 月份`，工具认的是热／温／冷三层；
 *   2. `remember_emotion` 永远拒绝——词表里只有一行占位符，任何词都不在表里。
 *
 * 这两条说明的是同一件事：**测试一直在测「我们自己的文件」，没测「刚装上的空文件夹」。**
 * 所以这个文件不测细节，只测「装完就能走通」这条路径。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scaffoldMemory } from "../lib/scaffold.js";
import { rememberEmotion } from "../lib/emotion.js";
import { rememberNote } from "../lib/notes.js";
import { rememberSnippet, snippetStatusLine } from "../lib/snippets.js";
import { tierIndexFile } from "../lib/tiers.js";

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-fresh-"));
  scaffoldMemory(dir);
  return dir;
};

test("装完就能记情绪：词表里有示例词，工具不会先拒绝", () => {
  const dir = fresh();
  try {
    const result = rememberEmotion({ memoryDir: dir, word: "烦", stamp: "10:30" });
    assert.equal(result.ok, true, result.message);
    assert.ok(result.vocabulary.includes("烦"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("装完就能落待办和片段", () => {
  const dir = fresh();
  try {
    const task = rememberNote({ memoryDir: dir, text: "试一下装完能不能用", kind: "task", stampText: "2026-11-13" });
    assert.equal(task.ok, true, task.message);

    // 新用户没有 `我/` 这种私有目录：默认写 snippets.md。
    const snippet = rememberSnippet({ memoryDir: dir, text: "第一幕", at: "09:00", day: "2026-11-13" });
    assert.equal(snippet.ok, true, snippet.message);
    const text = readFileSync(join(dir, "snippets.md"), "utf8");
    assert.match(text, /## 2026-11-13/, text);
    assert.match(snippetStatusLine({ memoryDir: dir, day: "2026-11-13" }), /今天 1 条/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("装完就能分层：模板里没有三层，工具自己建出来再搬", () => {
  const dir = fresh();
  try {
    const index = join(dir, "index.md");
    const withEntries = readFileSync(index, "utf8").replace(
      "## 月份",
      "## 月份\n\n- **2026-11-01** 第一条\n- **2026-11-02** 第二条",
    );
    writeFileSync(index, withEntries, "utf8");

    const result = tierIndexFile({ memoryDir: dir, days: ["2026-11-01"], merged: "11-01 到 11-02 并成一句" });
    assert.equal(result.ok, true, result.message);

    const after = readFileSync(index, "utf8");
    assert.match(after, /## 热层/);
    assert.match(after, /## 温层/);
    assert.match(after, /## 冷层/);
    // 原来的 `## 月份` 降级成层级标题，否则它会被当成和热层并列的另一层。
    assert.match(after, /### 月份/);
    // 原件要留在冷层里，别搬着搬着就丢了。
    assert.match(after, /2026-11-01/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("已经有热层的文件不会被再套一层", () => {
  const dir = fresh();
  try {
    const index = join(dir, "index.md");
    writeFileSync(
      index,
      "# 索引\n\n## 热层 · 最近 14 天\n\n- **2026-11-12** 一条\n\n## 温层\n\n## 冷层\n",
      "utf8",
    );
    const result = tierIndexFile({ memoryDir: dir, days: ["2026-11-12"], merged: "并一句" });
    assert.equal(result.ok, true, result.message);
    const after = readFileSync(index, "utf8");
    assert.equal((after.match(/## 热层/g) ?? []).length, 1, after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
