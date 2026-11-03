/**
 * The tail line for a file that never enters the injected block.
 *
 * `relationship.md` is read on purpose or not at all, so "read it every session" is a
 * rule that depends on remembering — the failure this plugin exists to remove.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readDayOf, recordReadAt, unreadLine } from "../lib/reads.js";

function store() {
  return mkdtempSync(join(tmpdir(), "reads-"));
}

test("a file that was never opened reads as unopened", () => {
  const dir = store();
  try {
    assert.equal(unreadLine({ storageDir: dir, key: "relationship.md", day: "2026-11-03" }), "- `relationship.md` has not been opened today");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("opening it once silences the line for that day, and only that day", () => {
  const dir = store();
  try {
    assert.equal(recordReadAt(dir, "relationship.md", "2026-11-03"), true);
    assert.equal(readDayOf(dir, "relationship.md"), "2026-11-03");
    assert.equal(unreadLine({ storageDir: dir, key: "relationship.md", day: "2026-11-03" }), undefined);
    // 第二天重新开口：这就是「今天读过没有」，不是「读过没有」。
    assert.match(unreadLine({ storageDir: dir, key: "relationship.md", day: "2026-11-04" }), /has not been opened today/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recording twice in the same day writes once", () => {
  const dir = store();
  try {
    assert.equal(recordReadAt(dir, "relationship.md", "2026-11-03"), true);
    assert.equal(recordReadAt(dir, "relationship.md", "2026-11-03"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the line is a status, not an instruction", () => {
  const dir = store();
  try {
    const line = unreadLine({ storageDir: dir, key: "relationship.md", day: "2026-11-03" });
    assert.doesNotMatch(line, /ofttold-ritual|must|should|please/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreadable store degrades to silence, never to a throw", () => {
  // 存储根写不进去不是让一次工具调用失败的理由。
  assert.equal(recordReadAt("/proc/nonexistent-ofttold", "relationship.md", "2026-11-03"), false);
  assert.equal(readDayOf("/proc/nonexistent-ofttold", "relationship.md"), undefined);
});
