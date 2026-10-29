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
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { apply, name } from "../index.js";

const DOC = "## anchors\n\n- one\n- two\n";

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

/** Create a temp workspace holding one notes file. */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "anchor-"));
  writeFileSync(join(dir, "notes.md"), DOC, "utf8");
  return dir;
}

/** Config pointing at the temp workspace's notes file. */
function config(overrides = {}) {
  return {
    sources: [{ path: "notes.md", heading: "anchors", label: "anchors" }],
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

test("stays silent when nothing loads", async () => {
  const dir = workspace();
  const h = harness(dir);
  apply(h.ctx, config({ sources: [{ path: "gone.md" }] }));
  const decision = await h.drive({ step: 1 });
  assert.deepEqual(decision.messages, []);
});

test("does not register a listener when sources are empty", () => {
  const h = harness(workspace());
  apply(h.ctx, config({ sources: [] }));
  assert.equal(h.state().injectedCount, 0);
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
