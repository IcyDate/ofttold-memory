/**
 * Integration test: drive the projection reducer with events taken from a real
 * `Session`, not hand-written shapes.
 *
 * `test/plugin.test.mjs` fakes the harness so the decision logic can be driven
 * step by step. That fake is cheap but it cannot catch a contract change: if
 * `user/message` stopped carrying `source.kind`, or if `createUserMessage`
 * stopped accepting a `snapshot` source, the fake would keep passing.
 *
 * Here the events are real. A genuine `Session` appends a genuine
 * `createUserMessage`, and the reducer folds exactly what the log holds. The
 * registry itself is still not instantiated — `register()` is a cordis
 * generator effect that needs a live context — so the reducer is captured
 * directly from the definition the plugin registers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SESSION_FORMAT_VERSION, Session, SessionId } from "@deepseek-ai/dsh-session";

import { apply, name } from "../index.js";

/**
 * A real session with a real header, so `header.cwd` resolves like production.
 *
 * @param {string} cwd - Absolute directory recorded in the header.
 * @returns {any} A live, empty session.
 */
function realSession(cwd) {
  const id = `test-${Math.random().toString(36).slice(2)}`;
  return new Session(SessionId(id), undefined, {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: Date.now(),
    cwd,
    isSeeded: false,
  });
}

/**
 * Build a user message the way this plugin does, through the real factory.
 *
 * @param {string} kind - Producer kind to stamp on the source.
 * @param {string} text - Model-facing body.
 * @returns {any} Frozen user message.
 */
function message(kind, text) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind, form: "snapshot", sections: [{ name: kind, text }] },
  });
}

/**
 * Capture the projection definition the plugin registers.
 *
 * @param {any} ctx - Stand-in context; only `sessionProjections` and `on` are read.
 * @returns {{ state: any, reduce: (event: any) => any }} State holder and folder.
 */
function capture(ctx) {
  const holder = { state: undefined };
  const original = ctx.sessionProjections.register;
  ctx.sessionProjections.register = (definition) => {
    holder.state = definition.init({}, 0);
    holder.reduce = (event) => {
      holder.state = definition.apply(holder.state, event);
      return holder.state;
    };
    return original.call(ctx.sessionProjections, definition);
  };
  return holder;
}

/**
 * A context that records the pre-step listener and the projection definition.
 *
 * @returns {any} Minimal plugin context.
 */
function context() {
  const listeners = [];
  return {
    sessionProjections: {
      register() {
        return () => {};
      },
      stateOf() {
        return undefined;
      },
    },
    on(event, handler) {
      if (event === "agent/pre-step") listeners.push(handler);
    },
    listeners,
  };
}

test("the reducer counts real user messages and recognises its own injection", () => {
  const session = realSession("/tmp");
  const ctx = context();
  const holder = capture(ctx);
  apply(ctx, {
    memoryDir: "/tmp",
    sections: ["常被提起"],
    header: "Standing",
    maxChars: 100,
  });

  // One real message from the human, then one real injected message from us.
  session.append("user/message", message("user", "hello"), { surfaceOp: "append" });
  holder.reduce(session.snapshotEvents().at(-1));

  session.append("user/message", message(name, "standing context"), { surfaceOp: "append" });
  holder.reduce(session.snapshotEvents().at(-1));

  assert.equal(holder.state.messageCount, 2, "both real messages must be counted");
  assert.equal(holder.state.injectedCount, 1, "only the plugin's own kind counts as an injection");
  assert.equal(holder.state.lastInjectedMessageCount, 2);
  assert.equal(holder.state.lastInjectedAt, session.snapshotEvents().at(-1).time);
});

test("a real message from another producer is counted but not treated as an injection", () => {
  const session = realSession("/tmp");
  const ctx = context();
  const holder = capture(ctx);
  apply(ctx, { memoryDir: "/tmp", sections: ["常被提起"], header: "Standing", maxChars: 100 });

  session.append("user/message", message("some-other-plugin", "their context"), { surfaceOp: "append" });
  holder.reduce(session.snapshotEvents().at(-1));

  assert.equal(holder.state.messageCount, 1);
  assert.equal(holder.state.injectedCount, 0);
  assert.equal(holder.state.lastInjectedAt, null);
});

test("folding the same real events twice from init is idempotent", () => {
  const session = realSession("/tmp");
  const ctx = context();
  apply(ctx, { memoryDir: "/tmp", sections: ["常被提起"], header: "Standing", maxChars: 100 });

  session.append("user/message", message("user", "one"), { surfaceOp: "append" });
  session.append("user/message", message(name, "two"), { surfaceOp: "append" });
  const events = session.snapshotEvents();

  // A reload replays the log from seq 0; the same fold must land on the same
  // state, which is why the bookkeeping lives in the projection and not in a
  // process-local Map.
  const first = events.reduce((state, event) => {
    const definition = capturedDefinition(ctx);
    return definition.apply(state, event);
  }, capturedInit(ctx));
  const second = events.reduce((state, event) => {
    const definition = capturedDefinition(ctx);
    return definition.apply(state, event);
  }, capturedInit(ctx));

  assert.deepEqual(first, second);
  assert.equal(first.injectedCount, 1);
  assert.equal(first.messageCount, 2);
});

/** Re-register the plugin and return the definition's init. */
function capturedInit(ctx) {
  let init;
  ctx.sessionProjections.register = (definition) => {
    init = definition.init({}, 0);
  };
  apply(ctx, { memoryDir: "/tmp", sections: ["常被提起"], header: "Standing", maxChars: 100 });
  return init;
}

/** Re-register the plugin and return the definition's apply. */
function capturedDefinition(ctx) {
  let apply_;
  ctx.sessionProjections.register = (definition) => {
    apply_ = definition.apply;
  };
  apply(ctx, { memoryDir: "/tmp", sections: ["常被提起"], header: "Standing", maxChars: 100 });
  return { apply: apply_ };
}

test("a real session's cwd is the base a relative memory folder resolves against", async () => {
  // Positive proof, not a null result: the file exists only under the session's
  // own cwd, so injection can happen only if `session.header.cwd` was actually
  // read instead of falling back to the process directory.
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "anchor-cwd-"));
  writeFileSync(join(dir, "MEMORY.md"), "## 常被提起\n\n- 会话里才有的那条\n", "utf8");

  const session = realSession(dir);
  const ctx = context();
  apply(ctx, {
    memoryDir: ".",
    sections: ["常被提起"],
    header: "Standing",
    maxChars: 100,
    workspaceRelative: true,
  });
  const agent = { session };
  const decision = await ctx.listeners[0](
    { agent, step: 1, signal: { aborted: false } },
    async () => ({ kind: "enter", messages: [] }),
  );
  assert.equal(decision.messages.length, 1, "the session-cwd memory file must be found and injected");
  assert.match(decision.messages[0].content[0].text, /会话里才有的那条/);
});
