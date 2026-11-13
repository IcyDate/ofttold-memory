/**
 * The three registered tools, driven through their real `execute`.
 *
 * `remember_emotion` shipped broken for a day because every test called `lib/emotion.js`
 * and none called the tool: the handler referenced a variable from another scope, so the
 * function beneath was perfect and the thing the model actually invokes threw on every
 * call. A source-text assertion did not catch it either — `execute(args, exec)` matched
 * the broken line just as well as the fixed one.
 *
 * So these tests build the plugin the way the host does: a fake `tools` service, `apply`,
 * then call `execute` with a call context. If the wiring is wrong, this file fails.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { apply } from "../index.js";
import { scaffoldMemory } from "../lib/scaffold.js";

function plugin() {
  const dir = mkdtempSync(join(tmpdir(), "tools-"));
  const memoryDir = join(dir, ".ofttold");
  scaffoldMemory(memoryDir);
  const tools = {};
  const ctx = {
    sessionProjections: { register() {}, stateOf() { return undefined; } },
    on() {},
    get(service) {
      return service === "tools" ? { register(tool) { tools[tool.name] = tool; } } : undefined;
    },
    logger: { warn() {}, info() {} },
  };
  apply(ctx, {});
  const exec = { agent: { session: { header: { cwd: dir } } } };
  return {
    dir,
    memoryDir,
    tools,
    run: (name, args) => tools[name].execute(args, exec),
    noteText: () => readFileSync(join(memoryDir, "memory.md"), "utf8"),
    relationshipText: () => readFileSync(join(memoryDir, "relationship.md"), "utf8"),
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("all five tools register", () => {
  const p = plugin();
  try {
    assert.deepEqual(Object.keys(p.tools).sort(), ["complete_task", "remember_emotion", "remember_note", "remember_snippet", "tier_index"]);
  } finally {
    p.done();
  }
});

test("remember_note writes a task with an opened day and a due day", async () => {
  const p = plugin();
  try {
    const r = await p.run("remember_note", { text: "复核接线", kind: "task", due: "2026-11-09" });
    assert.equal(r.ok, true, r.message);
    assert.match(p.noteText(), /- \[ \] \d{4}-\d{2}-\d{2} 起 ｜ 2026-11-09 到期 ｜ 复核接线/);
  } finally {
    p.done();
  }
});

test("complete_task ticks the line instead of deleting it", async () => {
  const p = plugin();
  try {
    await p.run("remember_note", { text: "复核接线", kind: "task" });
    const r = await p.run("complete_task", { text: "复核接线" });
    assert.equal(r.ok, true, r.message);
    assert.match(p.noteText(), /- \[x\] .*复核接线（.*完成）/);
  } finally {
    p.done();
  }
});

test("tier_index moves the day and files the original into the cold layer", async () => {
  const p = plugin();
  try {
    const file = join(p.memoryDir, "index.md");
    writeFileSync(file, "# 索引\n\n## 热层\n\n- **2026-10-23** — 旧事\n\n## 温层\n\n## 冷层\n");
    const result = await p.run("tier_index", { days: ["2026-10-23"], text: "四天一条" });
    assert.equal(result.ok, true, result.message);
    const after = readFileSync(file, "utf8");
    assert.match(after, /## 温层\n\n- 四天一条/);
    assert.match(after, /## 冷层\n\n- \*\*2026-10-23\*\* — 旧事/);
    assert.doesNotMatch(after.split("## 温层")[0], /2026-10-23/);
  } finally {
    p.done();
  }
});

test("remember_emotion refuses an empty vocabulary, then works once words exist", async () => {
  const p = plugin();
  try {
    // 模板里的词表只有占位符，读出来是空的——工具不许自己造一份权威。
    const refused = await p.run("remember_emotion", { word: "定" });
    assert.equal(refused.ok, false);
    assert.match(refused.message, /情绪词表/);

    const file = join(p.memoryDir, "relationship.md");
    writeFileSync(
      file,
      p.relationshipText().replace(
        "- `（词）` — （什么时候用这个词；它和近义词的分工在哪）",
        "- `定` — 结论或事实落定，认知有了结果",
      ),
    );

    const ok = await p.run("remember_emotion", { word: "定" });
    assert.equal(ok.ok, true, ok.message);
    assert.match(p.relationshipText(), /- \*\*现在\*\*：`定`（/);

    const outside = await p.run("remember_emotion", { word: "烦躁" });
    assert.equal(outside.ok, false);
    assert.match(outside.message, /不在词表|词表里没有/);
  } finally {
    p.done();
  }
});
test("remember_snippet writes under today's heading, at the configured path", async () => {
  const p = plugin();
  try {
    const r = await p.run("remember_snippet", { text: "他把笔抽走，说先吃饭", at: "12:31" });
    assert.equal(r.ok, true, r.message);
    // 默认是中性名 `snippets.md`——私有布局（我/日常片段.md）由配置指过去，不进公共默认。
    const text = readFileSync(join(p.memoryDir, "snippets.md"), "utf8");
    assert.match(text, /## \d{4}-\d{2}-\d{2}/);
    assert.match(text, /- 12:31 他把笔抽走，说先吃饭/);
  } finally {
    p.done();
  }
});

