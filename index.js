/**
 * dsh-anchor-context — keep a slice of your own notes in every session's context.
 *
 * The problem this solves is not storage, it is *retrieval without a trigger*.
 * A note that lives in a file is only useful if something puts it in front of the
 * model at the moment it is needed. Asking the model to remember to look is a
 * request to behave reliably under a full attention budget, which is exactly the
 * condition where such requests fail.
 *
 * So: read named sections out of markdown files the human already maintains, and
 * inject them into the conversation as standing context. Once per session by
 * default — after that the injected message sits in history and every later turn
 * can see it, which is the whole point.
 *
 * What this deliberately does NOT do: score memories, decay them, tag emotions,
 * or decide what matters. Those need judgement, and judgement is the thing that
 * fails when attention is full. This plugin only makes a human-curated list
 * visible. The human stays the author of what is important.
 */

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";

import { renderSources } from "./lib/sources.js";

export const name = "anchor-context";

export const inject = ["agents", "sessionProjections"];

/**
 * One configured slice of a file to keep visible.
 *
 * Every field is human-authored config, never a model tool parameter: the model
 * must not be able to widen its own standing context.
 */
const Source = z.object({
  path: z
    .string()
    .required()
    .description(
      "Path to a markdown file, absolute or `~/`-prefixed, or relative to the session workspace. Human config only.",
    ),
  heading: z
    .string()
    .default("")
    .description(
      'Exact heading text to lift, without the leading `#`. Empty means the whole file. Matching is exact, so a renamed heading stops resolving rather than silently grabbing a neighbour.',
    ),
  maxChars: z
    .natural()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .required(false)
    .description(
      "Character budget for this section; over-budget bodies are cut on a line boundary with a marker. Defaults to the top-level maxChars.",
    ),
  label: z
    .string()
    .default("")
    .description(
      "Short name shown as the section heading inside the injected block. Defaults to the path.",
    ),
});

export const Config = z.object({
  sources: z
    .array(Source)
    .default([])
    .description(
      "Files and sections to keep visible. Empty disables the plugin without failing the load.",
    ),
  header: z
    .string()
    .default("Standing context for this session (human-curated, not a user request)")
    .description(
      "First line of the injected block. Worth stating plainly: this arrives as a user-role message, so it must not read like something the human just said.",
    ),
  maxChars: z
    .natural()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(1200)
    .description(
      "Per-section character budget when a source omits its own maxChars. Raise it only after checking what it costs per session.",
    ),
  refreshIntervalMs: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .description(
      "Minimum milliseconds between injections in one session. 0 means never refresh, so the block is injected once. Raise it only if a compactor is dropping old messages.",
    ),
  refreshAfterMessages: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .description(
      "Re-inject after this many new conversation messages since the last injection. 0 means never. This is the practical defence against a compactor folding the injected message away: folding removes old messages, so a block injected once and folded is gone.",
    ),
  workspaceRelative: z
    .boolean()
    .default(true)
    .description(
      "Resolve relative source paths against the session workspace. Turn off to resolve them against the process directory instead.",
    ),
});

/**
 * Durable per-session injection bookkeeping.
 *
 * Kept in the session projection rather than in a process-local Map so a reload
 * does not silently re-inject: after a restart the earlier message is still in
 * the replayed log, and injecting again would pay twice for the same text.
 */
const stateSchema = zod.object({
  injectedCount: zod.number(),
  lastInjectedAt: zod.number().nullable(),
  lastInjectedMessageCount: zod.number().nullable(),
  messageCount: zod.number(),
});

/**
 * Resolve the base directory for relative source paths.
 *
 * The session header carries the absolute `cwd` the session was created in, and
 * that is the right base: a relative note path should mean the same thing in a
 * resumed session as it did in the original one.
 *
 * @param {any} agent - Live agent whose session is being prepared.
 * @param {any} config - Validated plugin config.
 * @returns {string} Absolute directory used to resolve relative paths.
 */
function baseDirectory(agent, config) {
  if (config.workspaceRelative) {
    const cwd = agent?.session?.header?.cwd;
    if (typeof cwd === "string" && cwd !== "") return cwd;
  }
  return process.cwd();
}

/**
 * Register the pre-step listener for the lifetime of `ctx`.
 *
 * Injection happens only at step 1 of a turn. Later steps in the same turn share
 * one request assembly, so injecting mid-turn buys nothing and costs tokens on
 * every remaining step.
 *
 * @param {any} ctx - Plugin context; the listener is disposed with it.
 * @param {any} config - Validated plugin config.
 */
export function apply(ctx, config) {
  const sources = config.sources ?? [];
  if (sources.length === 0) return;

  ctx.sessionProjections.register({
    key: name,
    stateVersion: 1,
    stateSchema,
    init: () => ({
      injectedCount: 0,
      lastInjectedAt: null,
      lastInjectedMessageCount: null,
      messageCount: 0,
    }),
    apply: (state, event) => {
      if (event.type !== "user/message") return state;
      // The counter increments unconditionally: `apply` folds each event exactly
      // once from `init`, so no dedupe key is needed. Using `event.time` as one
      // would be wrong — two events in the same millisecond are still two
      // messages, and a shared timestamp would freeze the counter.
      const counted = { ...state, messageCount: state.messageCount + 1 };
      if (event.data.source.kind !== name) return counted;
      return {
        ...counted,
        injectedCount: counted.injectedCount + 1,
        lastInjectedAt: event.time,
        lastInjectedMessageCount: counted.messageCount,
      };
    },
  });

  ctx.on("agent/pre-step", async ({ agent, step, signal }, next) => {
    const decision = await next();
    if (decision.kind === "reject" || signal.aborted) return decision;
    if (step !== 1) return decision;

    const state = ctx.sessionProjections.stateOf(agent.session, name);
    // `stateOf` is typed `| undefined`: it returns undefined when this key is not
    // registered for that session. That should not happen here — the key is
    // registered above and the listener is added after — but a throw inside
    // pre-step fails the whole session, so an absent state falls back to "never
    // injected" instead of taking the turn down with it.
    const bookkeeping = state ?? {
      injectedCount: 0,
      lastInjectedAt: null,
      lastInjectedMessageCount: null,
      messageCount: 0,
    };
    const now = Date.now();
    const neverInjected = bookkeeping.injectedCount === 0;
    const intervalDue =
      config.refreshIntervalMs > 0 &&
      bookkeeping.lastInjectedAt !== null &&
      now - bookkeeping.lastInjectedAt >= config.refreshIntervalMs;
    const messagesDue =
      config.refreshAfterMessages > 0 &&
      bookkeeping.lastInjectedMessageCount !== null &&
      bookkeeping.messageCount - bookkeeping.lastInjectedMessageCount >= config.refreshAfterMessages;
    if (!neverInjected && !intervalDue && !messagesDue) return decision;

    const rendered = renderSources(config, baseDirectory(agent, config));
    if (rendered === undefined) return decision;

    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: "text", text: rendered.text }],
          source: {
            kind: name,
            form: "snapshot",
            sections: [{ name, text: rendered.text }],
          },
        }),
      ],
    };
  }, { prepend: true });
}
