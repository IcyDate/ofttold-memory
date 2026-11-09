/**
 * The index's layers: counted, pointed at, moved — and the refusals that keep a move from
 * eating something a person wrote.
 *
 * The rule this file tests lived only in the design document for a year, so the interesting
 * assertions are the negative ones: a day that is not where you said, a day that appears
 * twice, a hot layer with no cold layer under it. Those are the cases where "just do it"
 * would quietly destroy an entry, and the entry is the only copy of that day's line.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { moveToWarm, tierIndexFile, tierLine, tierStatus } from "../lib/tiers.js";

const TODAY = new Date("2026-11-09T10:00:00");

function index({ hot = "", warm = "", cold = "" } = {}) {
  return [
    "# 日记索引",
    "",
    "## 热层 · 最近 14 天（保留全文）",
    "",
    hot,
    "## 温层 · 14 天以前（四天并一条）",
    "",
    warm,
    "## 冷层（原文不动，仍然 grep 得到）",
    "",
    cold,
    "",
  ].join("\n");
}

const TWO_DAYS = [
  "- **2026-11-08** — 今天的事",
  "  - 值得回看：`10:00`（为什么）",
  "",
  "- **2026-10-23** — 旧事",
  "  - 值得回看：`11:00`（为什么）",
  "",
].join("\n");

test("counts the hot layer and names the days past fourteen", () => {
  const status = tierStatus(index({ hot: TWO_DAYS }), { today: TODAY });
  assert.equal(status.hotCount, 2);
  assert.deepEqual(status.stale, ["2026-10-23"], "17 days old is past the line, 1 day is not");
  assert.equal(status.triggered, true);
  const line = tierLine(status);
  assert.match(line, /索引热层 2 条/);
  assert.match(line, /2026-10-23/);
  assert.match(line, /tier_index/, "the line has to name the thing that does the moving");
});

test("stays silent while the hot layer is recent and small", () => {
  const status = tierStatus(index({ hot: "- **2026-11-08** — 今天的事\n" }), { today: TODAY });
  assert.equal(status.triggered, false);
  assert.equal(tierLine(status), undefined);
});

test("an index without layer headings is not a problem to report", () => {
  assert.equal(tierStatus("# 索引\n\n- **2026-10-23** — 旧事\n", { today: TODAY }), undefined);
});

test("moves the day: out of hot, verbatim into cold, one line into warm", () => {
  const before = index({ hot: TWO_DAYS });
  const result = moveToWarm(before, { days: ["2026-10-23"], merged: "10-20–10-23 四天并一条：那几件事" });
  assert.equal(result.ok, true, result.message);

  const after = result.text;
  assert.doesNotMatch(after.split("## 温层")[0], /2026-10-23 —/, "the entry left the hot layer");
  assert.match(after, /## 温层 · 14 天以前（四天并一条）\n\n- 10-20–10-23 四天并一条：那几件事\n/);
  assert.match(after, /## 冷层（原文不动，仍然 grep 得到）\n\n- \*\*2026-10-23\*\* — 旧事\n {2}- 值得回看：`11:00`（为什么）\n/);
  assert.match(after, /2026-11-08/, "the untouched day is still there");
  assert.match(result.message, /1 条原件进了冷层/);
});

test("a day written in two passes still counts, and can still be moved", () => {
  // `- **2026-11-02（补九）** — …` is a real shape; requiring `**` right after the date
  // skipped eight of these on the first index this ran against.
  const hot = "- **2026-11-02（补九）** — 收工前定下的那件事\n";
  const status = tierStatus(index({ hot }), { today: new Date("2026-11-09T10:00:00") });
  assert.equal(status.hotCount, 1);
  const moved = moveToWarm(index({ hot }), { days: ["2026-11-02"], merged: "11-02 四天一条" });
  assert.equal(moved.ok, true, moved.message);
  assert.match(moved.text, /## 冷层（原文不动，仍然 grep 得到）\n\n- \*\*2026-11-02（补九）\*\* — 收工前定下的那件事/);
});

test("a merged line already written with a bullet does not get a second one", () => {
  const result = moveToWarm(index({ hot: TWO_DAYS }), { days: ["2026-10-23"], merged: "- 四天一条" });
  assert.equal(result.ok, true, result.message);
  assert.doesNotMatch(result.text, /- - 四天一条/);
});

test("refuses a day that is not in the hot layer, and says what is", () => {
  const result = moveToWarm(index({ hot: TWO_DAYS }), { days: ["2026-10-01"], merged: "一句" });
  assert.equal(result.ok, false);
  assert.match(result.message, /热层里没有：2026-10-01/);
  assert.match(result.message, /2026-10-23/, "the refusal lists what does exist");
});

test("refuses a day that appears twice instead of guessing", () => {
  const twice = TWO_DAYS + "- **2026-10-23** — 同一天的另一条\n";
  const result = moveToWarm(index({ hot: twice }), { days: ["2026-10-23"], merged: "一句" });
  assert.equal(result.ok, false);
  assert.match(result.message, /出现了 2 次/);
});

test("refuses an empty merged line — moving is not the judgement", () => {
  const result = moveToWarm(index({ hot: TWO_DAYS }), { days: ["2026-10-23"], merged: "   " });
  assert.equal(result.ok, false);
  assert.match(result.message, /判断/);
});

test("refuses when the warm or cold layer is missing rather than inventing structure", () => {
  const noCold = "# 索引\n\n## 热层\n\n- **2026-10-23** — 旧事\n\n## 温层\n\n";
  const result = moveToWarm(noCold, { days: ["2026-10-23"], merged: "一句" });
  assert.equal(result.ok, false);
  assert.match(result.message, /冷层/);
});

test("English headings count as the same layers", () => {
  const english = "# Index\n\n## Hot layer\n\n- **2026-10-23** — old\n\n## Warm layer\n\n## Cold layer\n";
  const status = tierStatus(english, { today: TODAY });
  assert.equal(status.hotCount, 1);
  assert.deepEqual(status.stale, ["2026-10-23"]);
  const moved = moveToWarm(english, { days: ["2026-10-23"], merged: "four days, one line" });
  assert.equal(moved.ok, true, moved.message);
  assert.match(moved.text, /## Warm layer\n\n- four days, one line/);
});

test("tierIndexFile writes the file and reports what is left", () => {
  const dir = mkdtempSync(join(tmpdir(), "tiers-"));
  try {
    const file = join(dir, "index.md");
    writeFileSync(file, index({ hot: TWO_DAYS }));
    const result = tierIndexFile({ memoryDir: dir, days: ["2026-10-23"], merged: "四天一条" });
    assert.equal(result.ok, true, result.message);
    const after = readFileSync(file, "utf8");
    assert.match(after, /- 四天一条/);
    assert.match(result.message, /热层现在 1 条/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tierIndexFile says so when there is no index at all", () => {
  const dir = mkdtempSync(join(tmpdir(), "tiers-"));
  try {
    const result = tierIndexFile({ memoryDir: dir, days: ["2026-10-23"], merged: "一句" });
    assert.equal(result.ok, false);
    assert.match(result.message, /没有 index\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
