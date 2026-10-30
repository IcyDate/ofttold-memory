/**
 * Tests for the two halves a fresh install has to get right beyond injection:
 * the skeleton it lays down, and the skills it publishes.
 *
 * Why these exist: the plugin's reading side can be perfect and still leave a
 * new user stuck, because "here is what I know" does not answer "how do I add to
 * it". That gap used to be closed by a README the user may never open. Closing it
 * with files and a skill catalog entry means two new failure modes worth testing —
 * a skeleton that writes into somebody's existing notes, and a skill that is
 * declared but never actually registered.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

import { scaffoldMemory } from "../lib/scaffold.js";
import { renderSources } from "../lib/sources.js";
import { loadSkills, parseFrontmatter, registerSkills } from "../lib/skills.js";

/** A fake plugin context whose `get("skills")` returns a recording registry. */
function skillContext(available = true) {
  const registered = [];
  const ctx = {
    get(name) {
      if (name !== "skills" || !available) return undefined;
      return {
        register(skill) {
          registered.push(skill);
        },
      };
    },
  };
  return { ctx, registered };
}

test("the skeleton lays down all four files in an empty folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-skeleton-"));
  const result = scaffoldMemory(dir);
  assert.equal(result.skipped, false);
  assert.deepEqual(result.createdFiles, ["MEMORY.md", "INDEX.md", "relationship.md", "diary/README.md"]);
  assert.ok(existsSync(join(dir, "MEMORY.md")));
  assert.ok(existsSync(join(dir, "INDEX.md")));
  assert.ok(existsSync(join(dir, "relationship.md")));
  assert.ok(existsSync(join(dir, "diary", "README.md")));
});

test("the skeleton pre-fills no memory, only empty shells", () => {
  // The point of the skeleton is to show the shape, not to decide what is worth
  // remembering. Pre-filled entries would be exactly the thing "no automatic
  // writes" forbids, just done by the installer instead of by a model.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-shell-"));
  scaffoldMemory(dir);
  const relationship = readFileSync(join(dir, "relationship.md"), "utf8");
  const index = readFileSync(join(dir, "INDEX.md"), "utf8");
  // The emotion cache exists but holds no value: `未填` is a placeholder, not a tag.
  assert.match(relationship, /\*\*现在\*\*：`（未填）`/);
  // The index has the section the plugin reads, and no dated line yet. The
  // example format lives inside an HTML comment on purpose, so a real entry is
  // recognizable as a line that starts with a dated bullet.
  assert.match(index, /## 常被提起/);
  // Comments are stripped first: the format example lives inside one, and a
  // commented-out sample is documentation, not a memory the user has to delete.
  const visible = index.replace(/<!--[\s\S]*?-->/g, "");
  assert.equal(/^- \*\*\d{2}-\d{2}\*\*/m.test(visible), false, "no dated entry may be pre-filled");
});

test("an existing notes folder gains only the files it is missing", () => {
  // 「已经有笔记就不动」曾经意味着这种文件夹永远长不出 relationship.md 和 diary/，
  // 于是写的那一半没有家、块尾的提醒也永远不会出现。把 memoryDir 指过来本身就是
  // 邀请；文件夹里「我已经有笔记」不是让机制缺一半的理由。已有的那个文件不动。
  const dir = mkdtempSync(join(tmpdir(), "ofttold-hasnotes-"));
  const mine = "# 索引\n\n- 真的一条\n";
  writeFileSync(join(dir, "INDEX.md"), mine, "utf8");
  const result = scaffoldMemory(dir);
  assert.equal(result.skipped, false);
  assert.deepEqual(result.createdFiles, ["MEMORY.md", "relationship.md", "diary/README.md"]);
  assert.equal(readFileSync(join(dir, "INDEX.md"), "utf8"), mine, "the file that was already there must be untouched");
});

test("a folder that already has the whole skeleton reports nothing created", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-full-"));
  scaffoldMemory(dir);
  const result = scaffoldMemory(dir);
  assert.deepEqual(result.createdFiles, []);
  assert.equal(result.skipped, true);
});

test("a file where the folder should be is reported, not written around", () => {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-notdir-"));
  const file = join(dir, "memory");
  writeFileSync(file, "not a folder\n", "utf8");
  const result = scaffoldMemory(file);
  assert.equal(result.error, "NOT_A_DIRECTORY");
  assert.deepEqual(result.createdFiles, []);
});

test("the skeleton never overwrites a file that already exists", () => {
  // Half-scaffolded folders are normal: someone deletes INDEX.md and keeps the
  // rest. The missing file is created; the kept one is not touched.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-partial-"));
  scaffoldMemory(dir);
  writeFileSync(join(dir, "MEMORY.md"), "## 常被提起\n\n- mine\n", "utf8");
  scaffoldMemory(dir);
  assert.equal(readFileSync(join(dir, "MEMORY.md"), "utf8"), "## 常被提起\n\n- mine\n");
});

test("both shipped skills parse and satisfy the registry contract", () => {
  const { skills, skipped } = loadSkills();
  assert.deepEqual(skipped, []);
  assert.deepEqual(
    skills.map((skill) => skill.name).sort(),
    ["ofttold-memory", "ofttold-ritual"],
  );
  for (const skill of skills) {
    // The same two rules `ctx.skills.register()` throws on, checked here so a
    // typo fails a test instead of a live session.
    assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(skill.description.length > 0);
    // The catalog truncates at 500 by default; a description longer than that
    // would be silently cut, so it must fit.
    assert.ok(skill.description.length <= 500, `${skill.name} description is too long for the catalog`);
    assert.ok(skill.content.length > 200, `${skill.name} has no body worth loading`);
    // `register()` does NOT check this; the registry's load-time
    // `validateDefinition` does, and throws only when a model opens the skill.
    // Asserted here because the register-time contract is the misleading one:
    // omitting it passes every registration test and fails in a live session.
    assert.equal(typeof skill.source, "string", `${skill.name} needs a source or it cannot be loaded`);
    assert.ok(skill.source.length > 0, `${skill.name} source must not be empty`);
  }
});

test("the ritual skill covers the four things injection cannot teach", () => {
  const { skills } = loadSkills();
  const ritual = skills.find((skill) => skill.name === "ofttold-ritual");
  assert.ok(ritual !== undefined, "the writing side must ship");
  const body = ritual.content;
  // 指路：词表和上限写在骨架文件里，skill 必须说清去哪儿读，否则读者只会
  // 知道「有个封闭词表」而不知道它在哪。
  for (const pointer of ["情绪词表", "常被提起", "INDEX.md", "diary/README.md"]) {
    assert.ok(body.includes(pointer), `ritual skill must point at ${pointer}`);
  }
  for (const topic of ["diary", "index", "emotion", "relationship.md"]) {
    assert.ok(body.toLowerCase().includes(topic), `ritual skill must cover ${topic}`);
  }
});

test("a malformed skill file is skipped, not thrown on", () => {
  // One bad skill must not stop the plugin from loading, for the same reason a
  // renamed heading must not stop a session.
  const root = mkdtempSync(join(tmpdir(), "ofttold-badskill-"));
  mkdirSync(join(root, "skills", "Bad_Name"), { recursive: true });
  writeFileSync(join(root, "skills", "Bad_Name", "SKILL.md"), "---\nname: Bad_Name\ndescription: x\n---\nbody\n", "utf8");
  const { skills, skipped } = loadSkills(root);
  assert.deepEqual(skills, []);
  assert.deepEqual(skipped, ["Bad_Name"]);
});

test("a package with no skills directory loads nothing and does not throw", () => {
  const root = mkdtempSync(join(tmpdir(), "ofttold-noskills-"));
  const { skills, skipped } = loadSkills(root);
  assert.deepEqual(skills, []);
  assert.deepEqual(skipped, []);
});

test("frontmatter parsing keeps quoted descriptions intact", () => {
  // A description containing a colon would otherwise be cut at the first one.
  const parsed = parseFrontmatter('---\nname: x\ndescription: "Use when: writing"\n---\nbody\n');
  assert.equal(parsed.fields.name, "x");
  assert.equal(parsed.fields.description, "Use when: writing");
  assert.equal(parsed.body, "body\n");
});

test("registerSkills publishes both skills when the service is present", () => {
  const { ctx, registered } = skillContext(true);
  const names = registerSkills(ctx, true, () => {});
  assert.deepEqual(names.sort(), ["ofttold-memory", "ofttold-ritual"]);
  assert.equal(registered.length, 2);
});

test("registerSkills is a no-op when the config turns it off", () => {
  const { ctx, registered } = skillContext(true);
  assert.deepEqual(registerSkills(ctx, false, () => {}), []);
  assert.deepEqual(registered, []);
});

test("registerSkills survives a harness without the skill service", () => {
  // `skills` is deliberately not in `inject`: a harness that does not mount it
  // must get the injection and no catalog entry, not a failed plugin load.
  const { ctx } = skillContext(false);
  assert.deepEqual(registerSkills(ctx, true, () => {}), []);
});

test("the injected block says what it is and where the writing protocol lives", async () => {
  // 默认 header 是唯一一处「每会话都会出现在模型眼前」的说明。它必须同时交代
  // 两件事：这些字是背景资料，以及维护方法去哪找。少了后半句，「装完就能写」
  // 就退化成靠自觉。
  const dir = mkdtempSync(join(tmpdir(), "header-"));
  try {
    writeFileSync(join(dir, "MEMORY.md"), "## 常被提起\n\n- one\n", "utf8");
    const rendered = renderSources({}, dir);
    assert.ok(rendered !== undefined, "a section with content must render");
    const firstLine = rendered.text.split("\n")[0];
    assert.match(firstLine, /^Standing context/, "the block still opens by naming itself");
    assert.match(firstLine, /ofttold-ritual/, "the block must name the skill that maintains it");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the shipped skills are the only place their sizes live", () => {
  // 这两个数字曾经散在 docs/skill.md 里，过期过三次（4625 → 5584 → 6475 → 7257），
  // 后来靠一条测试盯着。现在那份文档挪进 drafts/ 不进仓库了，数字只住在 SKILL.md
  // 自己身上——没有副本就没有过期。这条测试守的是「别再长出副本」。
  const { skills } = loadSkills();
  assert.equal(skills.length, 2);
  for (const skill of skills) {
    assert.ok(skill.description.length <= 500, `${skill.name}: description over the catalog limit`);
    assert.ok(skill.content.length > 200, `${skill.name}: body too short to teach anything`);
  }
});
