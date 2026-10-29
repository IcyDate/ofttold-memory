import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractSection, parseHeadings, truncateBody } from "../lib/sections.js";
import { scaffoldMemory } from "../lib/scaffold.js";
import { expandPath, loadSource, renderSources, resolveSections } from "../lib/sources.js";

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

test("a longer fence is not closed by a shorter inner one", () => {
  // A four-backtick fence exists so a three-backtick fence can live inside it.
  // Tracking only the first three characters would close the outer fence on the
  // inner one and turn the rest of the block into headings.
  const doc = ["````md", "# inside", "```", "still inside", "````", "", "## real", ""].join("\n");
  assert.deepEqual(parseHeadings(doc).map((entry) => entry.title), ["real"]);
});

test("a tilde fence is not closed by a backtick fence", () => {
  const doc = ["~~~", "# inside", "```", "still inside", "~~~", "", "## real", ""].join("\n");
  assert.deepEqual(parseHeadings(doc).map((entry) => entry.title), ["real"]);
});

test("a hash glued to the title is text, a spaced closing sequence is not", () => {
  // `## C#` names C#; stripping that hash would make the heading unreachable by
  // the exact title the user wrote. `## Foo ##` closes, and the hashes are not
  // part of the name.
  assert.equal(parseHeadings("## C#\n")[0].title, "C#");
  assert.equal(parseHeadings("## Foo ##\n")[0].title, "Foo");
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
    partial: false,
  });
});

test("truncateBody cuts on a line boundary and counts what it dropped", () => {
  const result = truncateBody("aaaa\nbbbb\ncccc", 9);
  assert.equal(result.text, "aaaa\nbbbb");
  assert.equal(result.truncated, true);
  assert.equal(result.droppedLines, 1);
  assert.equal(result.partial, false);
});

test("truncateBody marks a mid-line cut instead of reporting zero dropped lines", () => {
  // One line longer than the whole budget: the old result was truncated with
  // droppedLines 0, which rendered as "(0 more line(s) omitted)" over text that
  // had in fact been cut. `partial` distinguishes the two.
  const result = truncateBody("a".repeat(50), 10);
  assert.equal(result.text, "a".repeat(10));
  assert.equal(result.truncated, true);
  assert.equal(result.droppedLines, 0);
  assert.equal(result.partial, true);
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

test("resolveSections turns a bare heading into a file-backed section", () => {
  // The whole point of the string form: someone who has never read the docs
  // types a heading and it resolves inside the default memory file.
  const [section] = resolveSections(["常被提起"], 600);
  assert.equal(section.file, "MEMORY.md");
  assert.equal(section.heading, "常被提起");
  assert.equal(section.maxChars, 600);
  assert.equal(section.label, "常被提起");
});

test("resolveSections accepts the object form and fills in its blanks", () => {
  const [section] = resolveSections([{ heading: "我是谁" }], 600);
  assert.equal(section.file, "MEMORY.md");
  assert.equal(section.label, "我是谁", "label must fall back to the heading");
  const [custom] = resolveSections([{ file: "OTHER.md", heading: "硬约定", maxChars: 50, label: "约定" }], 600);
  assert.equal(custom.file, "OTHER.md");
  assert.equal(custom.maxChars, 50);
  assert.equal(custom.label, "约定");
});

test("resolveSections skips entries that cannot resolve", () => {
  // A stray blank string or a heading-less object is a typo, not a section: it
  // must not become a source that can never load and only adds noise.
  assert.deepEqual(resolveSections(["", "   "], 600), []);
  assert.deepEqual(resolveSections([{ file: "MEMORY.md" }], 600), []);
  assert.deepEqual(resolveSections([{ heading: "  " }], 600), []);
});

test("resolveSections keeps a blank label from rendering a bare heading", () => {
  // The schema defaults `label` to "", so `??` alone would keep the empty string
  // and render `### ` with no name.
  for (const label of ["", "   "]) {
    const [section] = resolveSections([{ heading: "常被提起", label }], 600);
    assert.equal(section.label, "常被提起");
  }
});

test("loadSource renders a section and truncates it", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  writeFileSync(join(dir, "notes.md"), DOC, "utf8");
  // The two bullets are 13 characters each; 20 fits the first and drops the
  // second whole line, which is the line-boundary path rather than a mid-line cut.
  const result = loadSource(
    { file: "notes.md", heading: "常被提起", maxChars: 20, label: "常被提起" },
    dir,
  );
  assert.equal(result.ok, true);
  assert.match(result.text, /omitted; maxChars=20/);
});

test("loadSource resolves a relative file inside the memory folder", () => {
  // This is the contract the string form depends on: `MEMORY.md` means the one
  // in the configured folder, not one next to the process.
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  writeFileSync(join(dir, "MEMORY.md"), DOC, "utf8");
  const result = loadSource({ file: "MEMORY.md", heading: "常被提起", maxChars: 100, label: "x" }, dir);
  assert.equal(result.ok, true);
});

test("loadSource reports a missing file without throwing", () => {
  const result = loadSource(
    { file: "/definitely/not/here.md", heading: "x", maxChars: 100, label: "x" },
    "/",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing");
});

test("loadSource says a mid-line cut was a cut", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  writeFileSync(join(dir, "long.md"), `## one\n\n${"a".repeat(80)}\n`, "utf8");
  const result = loadSource({ file: "long.md", heading: "one", maxChars: 10, label: "one" }, dir);
  assert.equal(result.ok, true);
  assert.match(result.text, /cut mid-line at maxChars=10/);
});

test("renderSources joins loaded sections and names the failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  writeFileSync(join(dir, "MEMORY.md"), DOC, "utf8");
  const rendered = renderSources(
    {
      header: "Standing",
      maxChars: 200,
      sections: ["常被提起", { heading: "nope", label: "stale" }],
    },
    dir,
  );
  assert.ok(rendered !== undefined);
  assert.equal(rendered.loaded, 1);
  assert.deepEqual(rendered.failed, ["stale: heading_not_found"]);
  assert.match(rendered.text, /^Standing/);
  assert.match(rendered.text, /### 常被提起/);
  assert.match(rendered.text, /Unavailable: stale: heading_not_found/);
});

test("renderSources returns undefined when nothing loads", () => {
  assert.equal(renderSources({ sections: ["x"] }, "/nonexistent-folder"), undefined);
});

test("renderSources with the default config loads the scaffolded template", () => {
  // The out-of-the-box path a new user actually walks: install, do nothing else,
  // and the default section must resolve against the starter file.
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  scaffoldMemory(dir);
  const rendered = renderSources({}, dir);
  assert.ok(rendered !== undefined, "default config must load the scaffolded MEMORY.md");
  assert.equal(rendered.loaded, 1);
  assert.match(rendered.text, /### 常被提起/);
});

test("scaffoldMemory leaves an existing notes folder alone", () => {
  // Pointing at a folder that already holds someone's notes must not drop a
  // starter file next to their files. The template exists to answer "what do I
  // write", and a folder with markdown in it has already answered that.
  const dir = mkdtempSync(join(tmpdir(), "anchor-notes-"));
  writeFileSync(join(dir, "INDEX.md"), "# 索引\n\n## 常被提起\n\n- 真的一条\n", "utf8");
  const result = scaffoldMemory(dir);
  assert.equal(result.skipped, true);
  assert.equal(result.createdFile, false);
  assert.equal(existsSync(join(dir, "MEMORY.md")), false, "must not add a file to a notes folder");
});

test("scaffoldMemory still writes into a genuinely empty folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-empty-"));
  const result = scaffoldMemory(dir);
  assert.equal(result.skipped, false);
  assert.equal(result.createdFile, true);
  assert.ok(existsSync(join(dir, "MEMORY.md")));
});
