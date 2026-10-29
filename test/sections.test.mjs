import assert from "node:assert/strict";
import { test } from "node:test";
import z from "@deepseek-ai/schemastery";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractSection, parseHeadings, truncateBody } from "../lib/sections.js";
import { scaffoldMemory } from "../lib/scaffold.js";
import { configValue, deref } from "../lib/config.js";
import { DIAGNOSTICS_DIR, DIAGNOSTICS_FILE, Diagnostics } from "../lib/diagnostics.js";
import { expandPath, loadSource, renderSources, resolveSections } from "../lib/sources.js";

const DOC = [
  "# 索引",
  "",
  "intro line",
  "",
  "## 常被提起",
  "",
  "- first note",
  "- second note",
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
  assert.equal(body.trim(), "- first note\n- second note");
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
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
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
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
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
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
  writeFileSync(join(dir, "long.md"), `## one\n\n${"a".repeat(80)}\n`, "utf8");
  const result = loadSource({ file: "long.md", heading: "one", maxChars: 10, label: "one" }, dir);
  assert.equal(result.ok, true);
  assert.match(result.text, /cut mid-line at maxChars=10/);
});

test("renderSources joins loaded sections and names the failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
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
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
  scaffoldMemory(dir);
  const rendered = renderSources({}, dir);
  assert.ok(rendered !== undefined, "default config must load the scaffolded MEMORY.md");
  assert.equal(rendered.loaded, 1);
  assert.match(rendered.text, /### 常被提起/);
});

test("the fallback list is alternatives, not a set: one spelling wins", () => {
  // DEFAULT_SECTIONS carries both language spellings of one idea. A file with
  // both headings must not inject the same text twice, and the spelling the file
  // does NOT use must not become a permanent `Unavailable` line -- that would
  // train users to ignore the only diagnostic this plugin has.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-alt-"));
  writeFileSync(
    join(dir, "MEMORY.md"),
    "## 常被提起\n\n- 中文那条\n\n## Oft-told\n\n- english line\n",
    "utf8",
  );
  const rendered = renderSources({}, dir);
  assert.equal(rendered.loaded, 1, "only the first resolving spelling is injected");
  assert.equal(rendered.failed.length, 0, "the unused spelling must stay quiet");
  assert.match(rendered.text, /中文那条/);
  assert.equal(/english line/.test(rendered.text), false, "the second spelling must not also inject");
});

test("a heading the user named is still reported when it is missing", () => {
  // The silence above applies only to the built-in fallback. If a user asked for
  // a specific heading, its absence is news and must reach the injected block.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-named-"));
  writeFileSync(join(dir, "MEMORY.md"), "## 常被提起\n\n- one\n", "utf8");
  const rendered = renderSources({ sections: ["常被提起", "nope"] }, dir);
  assert.equal(rendered.loaded, 1);
  assert.equal(rendered.failed.length, 1);
  assert.match(rendered.text, /Unavailable: nope: heading_not_found/);
});

test("scaffoldMemory leaves an existing notes folder alone", () => {
  // Pointing at a folder that already holds someone's notes must not drop a
  // starter file next to their files. The template exists to answer "what do I
  // write", and a folder with markdown in it has already answered that.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-notes-"));
  writeFileSync(join(dir, "INDEX.md"), "# 索引\n\n## 常被提起\n\n- 真的一条\n", "utf8");
  const result = scaffoldMemory(dir);
  assert.equal(result.skipped, true);
  assert.equal(result.createdFile, false);
  assert.equal(existsSync(join(dir, "MEMORY.md")), false, "must not add a file to a notes folder");
});

test("scaffoldMemory still writes into a genuinely empty folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-empty-"));
  const result = scaffoldMemory(dir);
  assert.equal(result.skipped, false);
  assert.equal(result.createdFile, true);
  assert.ok(existsSync(join(dir, "MEMORY.md")));
});

test("a Windows-editor file loads: BOM stripped, CRLF normalized", () => {
  // Both artefacts come from the editors Windows users actually have, and both
  // used to break a file that looks perfectly fine on screen: the BOM glues
  // itself to the first heading so exact matching fails, and CRLF leaves `\r`
  // in the injected text.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-win-"));
  const file = join(dir, "MEMORY.md");
  writeFileSync(file, "\uFEFF# 我的记忆\r\n\r\n## 常被提起\r\n\r\n- 一\r\n- 二\r\n", "utf8");
  const loaded = loadSource({ file, heading: "常被提起", maxChars: 100, label: "x" }, dir);
  assert.equal(loaded.ok, true, "a BOM+CRLF file must still resolve its section");
  assert.equal(loaded.text, "- 一\n- 二");
  assert.equal(loaded.text.includes("\r"), false, "no carriage returns may survive into the injected text");
});

test("a backslash tilde path expands on every platform", () => {
  // `~\notes` is as natural to type on Windows as `~/notes`, and a config copied
  // from a Windows example must not resolve to a literal directory named `~`.
  const base = join(tmpdir(), "ofttold-base");
  assert.equal(expandPath("~/notes", base), join(homedir(), "notes"));
  assert.equal(expandPath("~\\notes", base), join(homedir(), "notes"));
});

// ---------------------------------------------------------------------------
// Volatile references
//
// schemastery's `.volatile()` makes `Schema.resolve` wrap each marked field in a
// reference object whose snapshot the runtime can replace. The plugin marks its
// fields volatile so `dsh-settings` keeps them in the editable form, which means
// the values it reads are wrappers, not strings and numbers. Reading one as if it
// were the value failed a real session with
// `TypeError: path.startsWith is not a function`.
// ---------------------------------------------------------------------------

/**
 * A config whose fields are REAL volatile references.
 *
 * The wrappers come from schemastery's own `Schema.resolve`, not from a
 * hand-written stand-in: the first version of this test built the wrapper by hand
 * and would have passed against a wrapper that only resembled the real one, which
 * is the exact mistake that let the original defect through.
 */
function resolvedConfig(patch) {
  const Config = z.object({
    memoryDir: z.string().default("~/.dsh/ofttold-memory").volatile(),
    sections: z.array(z.any()).default(["Oft-told"]).volatile(),
    maxChars: z.natural().default(600).volatile(),
    header: z.string().default("Standing context").volatile(),
    workspaceRelative: z.boolean().default(true).volatile(),
  });
  const [value] = z.resolve(patch, Config);
  return value;
}

test("deref unwraps a volatile reference and leaves plain values alone", () => {
  assert.equal(deref(resolvedConfig({ memoryDir: "~/notes" }).memoryDir), "~/notes");
  assert.equal(deref("plain"), "plain");
  assert.equal(deref(42), 42);
  assert.equal(deref(undefined), undefined);
  assert.equal(deref(null), null);
});

test("deref does not mistake a plain object with a get method for a reference", () => {
  // Duck-typing `get` alone would unwrap this and silently lose the object.
  const plain = { get: () => "not a reference", other: 1 };
  assert.equal(deref(plain), plain);
});

test("deref follows the current snapshot, not the value captured at validation", () => {
  const ref = resolvedConfig({ memoryDir: "first" }).memoryDir;
  assert.equal(deref(ref), "first");
  // The write symbol is what the runtime uses to swap a live value in place.
  ref[Symbol.for("cosmokit.volatile.write")]("second");
  assert.equal(deref(ref), "second");
});

test("configValue reads fields of a config whose values are references", () => {
  const config = resolvedConfig({
    memoryDir: "~/Desktop/拾光",
    maxChars: 600,
    sections: [{ file: "INDEX.md", heading: "常被提起", maxChars: 600, label: "L" }],
  });
  assert.equal(configValue(config, "memoryDir"), "~/Desktop/拾光");
  assert.equal(configValue(config, "maxChars"), 600);
  assert.equal(configValue(config, "sections").length, 1);
  // A field the schema defaults is present after validation, so the value comes
  // back rather than a wrapper's undefined.
  assert.equal(configValue(config, "workspaceRelative"), true);
  // A field that genuinely is absent stays absent. Plain objects are the case
  // that matters: `apply` can be handed an unvalidated config.
  assert.equal(configValue({}, "workspaceRelative"), undefined);
  assert.equal(configValue({}, "memoryDir"), undefined);
});

test("expandPath accepts a volatile reference, because it is exported", () => {
  // Callers outside the plugin can hand it a validated config's field directly.
  assert.equal(expandPath(resolvedConfig({ memoryDir: "~/x.md" }).memoryDir, "/base"), join(homedir(), "x.md"));
  assert.equal(expandPath(resolvedConfig({ memoryDir: "rel.md" }).memoryDir, "/base"), "/base/rel.md");
  assert.equal(expandPath(resolvedConfig({ memoryDir: "/abs.md" }).memoryDir, "/base"), "/abs.md");
});

test("renderSources reads a config whose values are references", () => {
  const folder = mkdtempSync(join(tmpdir(), "ofttold-volatile-"));
  try {
    writeFileSync(join(folder, "MEMORY.md"), "# 常被提起\n\n一条要记住的事。\n");
    const rendered = renderSources(
      resolvedConfig({ sections: ["常被提起"], maxChars: 600, header: "Standing context" }),
      folder,
    );
    assert.ok(rendered, "a volatile config must still load its section");
    assert.equal(rendered.loaded, 1);
    assert.match(rendered.text, /Standing context/);
    assert.match(rendered.text, /一条要记住的事/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Diagnostics
//
// The plugin never fails a session to report a problem, so a broken setup is
// silent by design. The diagnostic file is the only surface that says why
// nothing was injected, and someone pasting it into an issue is the reason it
// holds paths but never file contents.
// ---------------------------------------------------------------------------

test("diagnostics records decisions and writes them beside the memory folder", () => {
  const folder = mkdtempSync(join(tmpdir(), "ofttold-diag-"));
  try {
    const diagnostics = new Diagnostics();
    diagnostics.record("injected", { loaded: 2, chars: 700 });
    diagnostics.record("nothing-loaded", { reason: "no configured section resolved" });
    const file = diagnostics.flush(folder);
    assert.equal(file, join(folder, DIAGNOSTICS_DIR, DIAGNOSTICS_FILE));
    const written = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(written.plugin, "dsh-ofttold-memory");
    assert.equal(written.entries.length, 2);
    assert.equal(written.entries[0].event, "injected");
    assert.equal(written.entries[0].loaded, 2);
    // Every entry carries a timestamp, or the file cannot order a symptom.
    assert.match(written.entries[1].at, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("diagnostics keeps a bounded history rather than growing without limit", () => {
  const diagnostics = new Diagnostics();
  for (let index = 0; index < 80; index += 1) diagnostics.record("injected", { index });
  // The oldest are dropped, so a user pasting the file pastes the recent story.
  assert.equal(diagnostics.entries.length, 50);
  assert.equal(diagnostics.entries[0].index, 30);
  assert.equal(diagnostics.entries[49].index, 79);
});

test("diagnostics never throws when the folder cannot be written", () => {
  const diagnostics = new Diagnostics();
  diagnostics.record("injected", {});
  // A read-only home is a normal deployment: the diagnostic must not become the
  // failure it was meant to explain.
  assert.equal(diagnostics.flush("/nonexistent-root-that-cannot-be-created/deep"), undefined);
});

test("diagnostics records no file contents, only the facts about them", () => {
  const folder = mkdtempSync(join(tmpdir(), "ofttold-diag2-"));
  try {
    writeFileSync(join(folder, "MEMORY.md"), "# 常被提起\n\n这是不该出现在诊断里的正文。\n");
    const diagnostics = new Diagnostics();
    const rendered = renderSources({ sections: ["常被提起"] }, folder);
    diagnostics.record("injected", { loaded: rendered.loaded, failed: rendered.failed, chars: rendered.text.length });
    const written = readFileSync(diagnostics.flush(folder), "utf8");
    assert.ok(!written.includes("这是不该出现在诊断里的正文"), "diagnostics leaked file contents");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
