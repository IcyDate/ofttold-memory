/**
 * The notice a session gets when the memory folder answers nothing.
 *
 * The point of these tests is narrow and worth stating: the plugin must never look
 * healthy while having loaded nothing. A wrong heading and a brand-new folder fail
 * the same way from the outside — no notes appear — and they need different words,
 * because one is a mistake to point at and the other is simply day one.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildNotice } from "../lib/notice.js";

const header = "Standing context for this session";

test("a heading that does not match is named, with the folder and the reason", () => {
  const notice = buildNotice({
    header,
    memoryDir: "/somewhere/notes",
    attempts: [{ file: "INDEX.md", heading: "常被提起", label: "拾光", reason: "heading_not_found" }],
  });
  assert.match(notice, /none of its headings matched/);
  assert.match(notice, /INDEX\.md/);
  assert.match(notice, /常被提起/);
  assert.match(notice, /heading_not_found/);
  // 用户那边看不到这些细节，模型得负责转述。
  assert.match(notice, /Tell the user/);
});

test("an empty folder reads as day one, not as a fault", () => {
  const notice = buildNotice({
    header,
    memoryDir: "/somewhere/notes",
    attempts: [{ file: "MEMORY.md", heading: "常被提起", label: "Oft-told", reason: "empty_section" }],
  });
  assert.match(notice, /has nothing to read yet/);
  assert.match(notice, /not a failure/);
  assert.doesNotMatch(notice, /heading_not_found|broken/);
  // 空文件夹不等于可以不说怎么往里写。
  assert.match(notice, /ofttold-ritual/);
});

test("the home directory is shortened so the block stays readable", () => {
  const home = process.env.HOME;
  if (typeof home !== "string" || home.length === 0) return;
  const notice = buildNotice({
    header,
    memoryDir: `${home}/notes`,
    attempts: [{ file: "MEMORY.md", heading: "x", label: "x", reason: "missing" }],
  });
  assert.ok(notice.includes("`~/notes`"), "the folder must print as ~/notes");
  assert.ok(!notice.includes(`${home}/notes`), "the absolute path must not appear");
});

test("a mixed result still points at the heading that failed", () => {
  const notice = buildNotice({
    header,
    memoryDir: "/somewhere/notes",
    attempts: [
      { file: "MEMORY.md", heading: "常被提起", label: "a", reason: "missing" },
      { file: "INDEX.md", heading: "常被提起（手动维护）", label: "b", reason: "heading_not_found" },
    ],
  });
  assert.match(notice, /none of its headings matched/, "one mismatch among several still means misconfigured");
});
