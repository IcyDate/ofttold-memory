/**
 * End-to-end test against the real harness objects, not fakes.
 *
 * `plugin.test.mjs` fakes the harness so the decision logic can be driven step
 * by step; `contract.test.mjs` uses real messages and events but captures the
 * projection definition by hand. Neither proves the plugin *registers* against a
 * real `SessionProjectionRegistry` and that the registry then drives it.
 *
 * This test mounts the real registry on a real Cordis context, applies the
 * plugin, appends real events to a real Session, and reads the resulting state
 * through `ctx.sessionProjections.stateOf`. If the key, the state schema, or the
 * reducer contract were wrong, this is where it shows.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SESSION_FORMAT_VERSION, Session, SessionId } from "@deepseek-ai/dsh-session";
import SessionProjections from "@deepseek-ai/dsh-session-projection";

import { apply, name } from "../index.js";

/** A real session with a real header. */
function realSession(cwd) {
  const id = `e2e-${Math.random().toString(36).slice(2)}`;
  return new Session(SessionId(id), undefined, {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: Date.now(),
    cwd,
    isSeeded: false,
  });
}

/** A real user message produced by the real factory. */
function message(kind, text) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind, form: "snapshot", sections: [{ name: kind, text }] },
  });
}

/** Mount a real Cordis context carrying the real projection registry. */
async function mounted() {
  const ctx = new Context();
  ctx.plugin(SessionProjections);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(ctx.sessionProjections, "the registry service must be installed");
  return ctx;
}

test("the real registry accepts the projection and drives it from real events", async () => {
  const ctx = await mounted();
  const dir = mkdtempSync(join(tmpdir(), "anchor-e2e-"));
  writeFileSync(join(dir, "notes.md"), "## anchors\n\n- one\n", "utf8");

  apply(ctx, { sources: [{ path: "notes.md", heading: "anchors" }], header: "Standing", maxChars: 100 });

  const session = realSession(dir);
  // `stateOf` folds lazily from the log, so it is valid before any drive.
  const before = ctx.sessionProjections.stateOf(session, name);
  assert.ok(before, "the key must be registered for a live session");
  assert.equal(before.injectedCount, 0);

  session.append("user/message", message("user", "hello"), { surfaceOp: "append" });
  session.append("user/message", message(name, "standing"), { surfaceOp: "append" });

  const after = ctx.sessionProjections.stateOf(session, name);
  assert.equal(after.messageCount, 2);
  assert.equal(after.injectedCount, 1);
  assert.equal(after.lastInjectedAt, session.snapshotEvents().at(-1).time);
});

test("the registered state schema accepts what init produces", async () => {
  const ctx = await mounted();
  apply(ctx, { sources: [{ path: "/tmp/x.md" }], header: "Standing", maxChars: 100 });
  const session = realSession("/tmp");
  // Reading the state runs it through the registered schema; a schema that
  // disagreed with `init` would throw here instead of at some later restart.
  const state = ctx.sessionProjections.stateOf(session, name);
  assert.deepEqual(state, {
    injectedCount: 0,
    lastInjectedAt: null,
    lastInjectedMessageCount: null,
    messageCount: 0,
  });
});
