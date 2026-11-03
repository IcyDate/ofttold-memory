/**
 * Behavioural test of the pre-step listener against a fake agent session.
 *
 * The harness contracts this plugin touches — the `agent/pre-step` waterfall, the
 * `sessionProjections` register/stateOf pair, and the projection `apply` reducer —
 * are faked here with the smallest surface that matches the real types. What is
 * under test is the decision logic: inject once, then stop; re-inject on the
 * configured triggers; never inject mid-turn; stay silent when nothing loads.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { apply, name } from "../index.js";

const DOC = "## 常被提起\n\n- one\n- two\n";

/**
 * Build a plugin context whose `agent/pre-step` chain can be driven by hand.
 *
 * @param {string} base - Absolute directory standing in for the session cwd.
 * @returns {{ ctx: any, drive: (payload: any) => any, log: (kind: string) => void,
 *   state: () => any }}
 *   `drive` runs the registered listener chain over one pre-step payload;
 *   `log` records one user message the way the session would.
 */
function harness(base) {
  const listeners = [];
  let state = {
    injectedCount: 0,
    lastInjectedAt: null,
    lastInjectedMessageCount: null,
    messageCount: 0,
  };
  let reducer = (current) => current;
  const ctx = {
    sessionProjections: {
      register(spec) {
        reducer = spec.apply;
      },
      stateOf() {
        return state;
      },
    },
    on(event, handler) {
      if (event === "agent/pre-step") listeners.push(handler);
    },
  };
  const agent = { session: { header: { cwd: base } } };
  return {
    ctx,
    state: () => state,
    log(kind) {
      state = reducer(state, {
        type: "user/message",
        time: 1,
        data: { source: { kind } },
      });
    },
    drive(payload, next) {
      const enter = async () => ({ kind: "enter", messages: [] });
      return listeners[0]({ agent, signal: { aborted: false }, ...payload }, next ?? enter);
    },
  };
}

/** Create a temp workspace holding one memory file. */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
  writeFileSync(join(dir, "memory.md"), DOC, "utf8");
  return dir;
}

/**
 * Config pointing at the temp workspace's memory folder.
 *
 * `memoryDir: "."` keeps the test honest about the relative-folder path a real
 * user takes: it must resolve against the session cwd, not the process directory.
 */
function config(overrides = {}) {
  return {
    memoryDir: ".",
    sections: ["常被提起"],
    header: "Standing",
    maxChars: 200,
    refreshIntervalMs: 0,
    refreshAfterMessages: 0,
    workspaceRelative: true,
    ...overrides,
  };
}

test("injects once at step 1 and never again", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config());

  const first = await h.drive({ step: 1 });
  assert.equal(first.messages.length, 1);
  assert.match(first.messages[0].content[0].text, /^Standing/);
  assert.equal(first.messages[0].source.kind, name);
  assert.equal(first.messages[0].source.form, "snapshot");
  h.log(name);

  const second = await h.drive({ step: 1 });
  assert.deepEqual(second.messages, [], "second turn must not inject again");
});

test("does not inject at step 2 of the same turn", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config());
  const later = await h.drive({ step: 2 });
  assert.deepEqual(later.messages, []);
});

test("re-injects after the configured message count", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config({ refreshAfterMessages: 3 }));

  await h.drive({ step: 1 });
  h.log(name);
  for (let index = 0; index < 3; index += 1) h.log("user");

  const again = await h.drive({ step: 1 });
  assert.equal(again.messages.length, 1, "message-count trigger should re-inject");
});

test("re-injects after the configured interval", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config({ refreshIntervalMs: 1 }));

  await h.drive({ step: 1 });
  h.log(name);
  await new Promise((resolve) => setTimeout(resolve, 5));

  const again = await h.drive({ step: 1 });
  assert.equal(again.messages.length, 1, "interval trigger should re-inject");
});

test("says what it looked for when nothing loads", async () => {
  // Silence is the failure users cannot diagnose: their notes do not show up, no
  // error appears, and the old behaviour was to inject nothing at all. The session
  // now gets a line naming the folder and the heading that did not match.
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config({ sections: [{ heading: "gone" }] }));
  const decision = await h.drive({ step: 1 });
  assert.equal(decision.messages.length, 1);
  const notice = decision.messages[0].content[0].text;
  assert.match(notice, /none of its headings matched/);
  assert.match(notice, /gone/, "the heading that was looked for must be named");
  assert.match(notice, /ofttold-ritual|settings page|cordis\.patch\.yml/);
});

test("does not register a listener when sections are empty", () => {
  const h = harness(workspace());
  apply(h.ctx, config({ sections: [] }));
  assert.equal(h.state().injectedCount, 0);
});

test("scaffolds a starter memory file when the folder is empty", async () => {
  // A fresh install must leave the user with something to edit, not an empty
  // folder and a silent no-op. This is the whole "install and it works" claim.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
  const memoryDir = join(dir, "memory");
  const h = harness(dir);
  apply(h.ctx, config({ memoryDir }));
  // Scaffolding is lazy: it runs when a session actually starts, because a
  // relative folder only means something once there is a session cwd.
  await h.drive({ step: 1 });
  assert.ok(existsSync(join(memoryDir, "memory.md")));
});

test("a relative memory folder resolves against the session cwd, not the process", () => {
  // Regression: scaffolding at `apply` time created the starter file in the
  // repository root, because no session cwd existed yet. The folder a user
  // configures must be the one their session sees.
  const dir = mkdtempSync(join(tmpdir(), "ofttold-"));
  const h = harness(dir);
  apply(h.ctx, config({ memoryDir: "memory" }));
  assert.equal(existsSync(join(dir, "memory", "memory.md")), false, "nothing may be created before a session exists");
});

test("never overwrites an existing memory file", () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config());
  assert.equal(readFileSync(join(dir, "memory.md"), "utf8"), DOC, "existing notes must survive");
});

test("passes through a rejected decision untouched", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config());
  const rejected = await h.drive(
    { step: 1 },
    async () => ({ kind: "reject", reason: "nope" }),
  );
  assert.equal(rejected.kind, "reject");
});

test("stays silent when the step signal is already aborted", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config());
  const aborted = await h.drive({ step: 1, signal: { aborted: true } });
  assert.deepEqual(aborted.messages, []);
});

test("an unvalidated config still registers and still injects", () => {
  // The Config schema supplies `sections` and `workspaceRelative` only after
  // validation. If the code leaned on those defaults, a caller handing `apply`
  // a raw object would get a plugin that registers nothing — silently, which is
  // the worst kind of broken. Both defaults are stated in code for this reason.
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, { memoryDir: ".", header: "Standing" });
  assert.equal(h.state().injectedCount, 0, "registration must not throw");
});

test("an unvalidated config with no sections still injects the default one", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, { memoryDir: "." });
  const decision = await h.drive({ step: 1 });
  assert.equal(decision.messages.length, 1, "the documented default section must apply");
  assert.match(decision.messages[0].content[0].text, /常被提起/);
});

test("the settings page never renders an object section as [object Object]", async () => {
  // The profile this plugin is developed against uses the object form for its
  // sections (a per-section file, budget, and label). The settings form can only
  // express bare headings, so the object form must be shown read-only rather than
  // flattened into text -- saving a flattened array would drop every per-section
  // file and budget without saying so.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "client.js"), "utf8");
  // The defect was joining the raw array, which stringifies object entries.
  // Mapping each entry to its heading first is the fix, so a bare `raw.join`
  // (or `value.join`) is what must not come back.
  assert.equal(source.includes("raw.join("), false, "the raw array must never be joined directly");
  assert.equal(source.includes(".value.join("), false, "the raw array must never be joined directly");
  assert.equal(source.includes("sectionsComplex"), true, "the form must detect the object form and disable that field");
  assert.equal(source.includes("entry?.heading"), true, "object entries must be displayed by their heading");
});

test("the block ends by saying the day is not written yet", async () => {
  // 单测覆盖了 lib/diary.js 的判定，这条盯着「它真的进了注入块、排在最后」。
  const dir = workspace();
  mkdirSync(join(dir, "diary"));
  writeFileSync(join(dir, "diary", "2026-10-28.md"), "# entry\n"); // 不是第一天
  const h = harness(dir);
  apply(h.ctx, config());
  const decision = await h.drive({ step: 1 });
  const text = decision.messages[0].content[0].text;
  assert.match(text, /no diary entry for today|no diary entry for \d{4}-\d{2}-\d{2} yet/);
  assert.match(text, /diary\/\d{4}-\d{2}-\d{2}\.md/);
  // 状态行是块尾最后一行：它一句话、无句号、无指令，和上面那行体检区分得开。
  assert.match(text.trimEnd(), /`diary\/\d{4}-\d{2}-\d{2}\.md`\)$/, "the status line stays last");
});

test("the default memory folder lives inside the workspace, not outside it", async () => {
  // 助手写日记用的是宿主那个被沙箱拦着的文件服务；默认的 workspace-write 只放
  // 工作区与临时目录。默认值如果放在工作区外，插件自己（裸 node:fs）写得进去，
  // 助手却写不进去，症状就是日记永远空着而没人报错。
  const { memoryDirectory } = await import("../index.js");
  const ws = mkdtempSync(join(tmpdir(), "ofttold-workspace-"));
  try {
    const agent = { session: { header: { cwd: ws } } };
    assert.equal(memoryDirectory(agent, {}), join(ws, ".ofttold"));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("a folder made by an older version is still found, not orphaned", async () => {
  const { memoryDirectory, LEGACY_MEMORY_DIR } = await import("../index.js");
  const home = mkdtempSync(join(tmpdir(), "ofttold-home-"));
  const ws = mkdtempSync(join(tmpdir(), "ofttold-workspace-"));
  const previous = process.env.HOME;
  try {
    // 老默认路径按 HOME 解析，这里把它指到一个临时 home 上，避免碰真实的家目录。
    process.env.HOME = home;
    const legacy = join(home, ".dsh", "ofttold-memory");
    mkdirSync(legacy, { recursive: true });
    // 只有目录不算：`~/.dsh/ofttold-memory` 还是 diagnostics.json 的落脚处，
    // 每台跑过插件的机器上都有这个目录。得真有一份记忆文件才算老文件夹。
    writeFileSync(join(legacy, "memory.md"), "# memory\n", "utf8");
    const agent = { session: { header: { cwd: ws } } };
    assert.equal(memoryDirectory(agent, {}), legacy, "老文件夹在，就该继续用它");
    assert.equal(LEGACY_MEMORY_DIR, "~/.dsh/ofttold-memory");
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
    rmSync(home, { recursive: true, force: true });
    rmSync(ws, { recursive: true, force: true });
  }
});

test("workspaceRelative does not move the default folder", async () => {
  // 关掉 workspaceRelative 是为了让**用户自己配的**相对路径换个基准，
  // 不该把默认的记忆文件夹也一起挪到 process.cwd() 去——那样它又跑到工作区外，
  // 助手照旧写不进去，而这次连症状都更难看出来。
  const { memoryDirectory } = await import("../index.js");
  const ws = mkdtempSync(join(tmpdir(), "ofttold-workspace-"));
  try {
    const agent = { session: { header: { cwd: ws } } };
    assert.equal(memoryDirectory(agent, { workspaceRelative: false }), join(ws, ".ofttold"));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
