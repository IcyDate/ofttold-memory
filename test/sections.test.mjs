import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractSection, parseHeadings, truncateBody } from "../lib/sections.js";
import { expandPath, loadSource, renderSources } from "../lib/sources.js";

const DOC = [
  "# 索引",
  "",
  "intro line",
  "",
  "## 常被提起",
  "",
  "- 枪·请杀了我这个怪物吧",
  "- 大肥鱼·是蓝鲸只是圆润",
  "",
  "## 别的",
  "",
  "unrelated",
  "",
  "```sh",
  "# not a heading",
  "```",
  "",
].join("\n");

test("parseHeadings records level and body range", () => {
  const headings = parseHeadings(DOC);
  assert.deepEqual(
    headings.map((entry) => [entry.title, entry.level]),
    [
      ["索引", 1],
      ["常被提起", 2],
      ["别的", 2],
    ],
  );
  const top = headings[0];
  assert.equal(top.start, 0);
  // A level-1 section owns its level-2 subsections, so it runs to the end of the
  // document when no later level-1 heading appears.
  assert.equal(top.end, DOC.split("\n").length);
});

test("parseHeadings ignores hashes inside fenced code blocks", () => {
  const titles = parseHeadings(DOC).map((entry) => entry.title);
  assert.ok(!titles.includes("not a heading"));
});

test("extractSection returns the exact body, excluding the heading line", () => {
  const { found, body } = extractSection(DOC, "常被提起");
  assert.equal(found, true);
  assert.equal(body.trim(), "- 枪·请杀了我这个怪物吧\n- 大肥鱼·是蓝鲸只是圆润");
});

test("extractSection with an empty heading returns the whole file", () => {
  const { found, body } = extractSection(DOC, "");
  assert.equal(found, true);
  assert.equal(body, DOC);
});

test("extractSection reports a renamed heading instead of guessing", () => {
  assert.deepEqual(extractSection(DOC, "常被提起过"), { found: false, body: "" });
});

test("truncateBody keeps a fitting body untouched", () => {
  assert.deepEqual(truncateBody("a\nb", 100), {
    text: "a\nb",
    truncated: false,
    droppedLines: 0,
  });
});

test("truncateBody cuts on a line boundary and counts what it dropped", () => {
  const result = truncateBody("aaaa\nbbbb\ncccc", 9);
  assert.equal(result.text, "aaaa\nbbbb");
  assert.equal(result.truncated, true);
  assert.equal(result.droppedLines, 1);
});

test("truncateBody rejects a non-positive budget", () => {
  assert.throws(() => truncateBody("x", 0), TypeError);
});

test("expandPath expands a bare tilde and leaves ~user alone", () => {
  assert.ok(expandPath("~/x.md", "/base").startsWith("/"));
  assert.equal(expandPath("~other/x.md", "/base"), "/base/~other/x.md");
  assert.equal(expandPath("rel.md", "/base"), "/base/rel.md");
  assert.equal(expandPath("/abs.md", "/base"), "/abs.md");
});

test("loadSource renders a section and truncates it", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  const file = join(dir, "notes.md");
  writeFileSync(file, DOC, "utf8");
  const result = loadSource({ path: file, heading: "常被提起", maxChars: 12 }, dir, 100);
  assert.equal(result.ok, true);
  assert.match(result.text, /omitted; maxChars=12/);
});

test("loadSource reports a missing file without throwing", () => {
  const result = loadSource({ path: "/definitely/not/here.md" }, "/", 100);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing");
});

test("renderSources joins loaded sources and names the failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  const file = join(dir, "notes.md");
  writeFileSync(file, DOC, "utf8");
  const rendered = renderSources(
    {
      header: "Standing",
      maxChars: 200,
      sources: [
        { path: file, heading: "常被提起", label: "anchors" },
        { path: file, heading: "nope", label: "stale" },
      ],
    },
    dir,
  );
  assert.ok(rendered !== undefined);
  assert.equal(rendered.loaded, 1);
  assert.deepEqual(rendered.failed, ["stale: heading_not_found"]);
  assert.match(rendered.text, /^Standing/);
  assert.match(rendered.text, /### anchors/);
  assert.match(rendered.text, /Unavailable: stale: heading_not_found/);
});

test("renderSources returns undefined when nothing loads", () => {
  assert.equal(
    renderSources({ sources: [{ path: "/nope.md" }] }, "/"),
    undefined,
  );
});
