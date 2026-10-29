/**
 * dsh-ofttold-memory — keep your memory in front of the model, every session.
 *
 * The problem this solves is not storage, it is *retrieval without a trigger*.
 * A note that lives in a file is only useful if something puts it in front of the
 * model at the moment it is needed. Asking the model to remember to look is a
 * request to behave reliably under a full attention budget, which is exactly the
 * condition where such requests fail.
 *
 * So: pick a memory folder, and the sections you care about are read out of its
 * markdown and injected into the conversation as standing context. Once per
 * session by default — after that the injected message sits in history and every
 * later turn can see it, which is the whole point.
 *
 * The configuration is deliberately small: a folder, an optional list of section
 * headings, and a size budget. Everything else has a default that works, because
 * a plugin nobody can configure is a plugin nobody installs.
 *
 * What this deliberately does NOT do: score memories, decay them, tag emotions,
 * or decide what matters. Those need judgement, and judgement is the thing that
 * fails when attention is full. This plugin only makes a human-curated list
 * visible. The human stays the author of what is important.
 */

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";

import { configValue } from "./lib/config.js";
import { scaffoldMemory } from "./lib/scaffold.js";
import { DEFAULT_SECTIONS, expandPath, renderSources } from "./lib/sources.js";

export const name = "ofttold-memory";

export const inject = ["agents", "sessionProjections"];

/**
 * One configured section.
 *
 * Two forms on purpose. A bare string is the common case — "show me the
 * `常被提起` section of my memory file" — and must stay short enough to type
 * without reading the docs. The object form exists only for the cases the
 * string cannot express: a second file in the same folder, or a different budget
 * for one noisy section.
 *
 * Every field is human-authored config, never a model tool parameter: the model
 * must not be able to widen its own standing context.
 */
const Section = z.union([
  z.string().description(
    "Section heading to lift from your memory file, without the leading `#`. This is the form most people want.",
  ),
  z
    .object({
      file: z
        .string()
        .default("MEMORY.md")
        .description(
          "Markdown file inside your memory folder. Defaults to `MEMORY.md`. Absolute and `~/`-prefixed paths also work, for notes kept elsewhere.",
        ),
      heading: z
        .string()
        .required()
        .description(
          "Exact heading text to lift, without the leading `#`. Matching is exact, so a renamed heading stops resolving rather than silently grabbing a neighbour.",
        ),
      maxChars: z
        .natural()
        .min(1)
        .max(Number.MAX_SAFE_INTEGER)
        .required(false)
        .description(
          "Character budget for this section; over-budget bodies are cut on a line boundary with a marker. Defaults to the plugin's own maxChars.",
        ),
      label: z
        .string()
        .default("")
        .description(
          "Short name shown as the heading inside the injected block. Defaults to the section heading.",
        ),
    })
    .description(
      "A section that needs its own file, budget, or display name. Most setups never need this form.",
    ),
]);

export const Config = z.object({
  memoryDir: z
    .string()
    .default("~/.dsh/ofttold-memory")
    .volatile()
    .description(
      "Folder holding your memory notes. The plugin creates it with a starter `MEMORY.md` on first run, so this can be left alone. Point it at an existing notes folder to reuse what you already keep.",
    ),
  sections: z
    .array(Section)
    .default([...DEFAULT_SECTIONS])
    .volatile()
    .description(
      "Which sections to keep visible. Bare strings are headings inside your memory file. The default lifts the `Oft-told` section (or `常被提起` in a Chinese file) -- the one that pays for itself. Empty disables the plugin without failing the load.",
    ),
  maxChars: z
    .natural()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(600)
    .volatile()
    .description(
      "Default character budget per section, when a section does not set its own. Raise it only after checking what it costs per session: 600 characters is roughly 400 tokens, once per session.",
    ),
  header: z
    .string()
    .default("Standing context for this session (human-curated, not a user request)")
    .volatile()
    .description(
      "First line of the injected block. Worth stating plainly: this arrives as a user-role message, so it must not read like something the human just said.",
    ),
  refreshIntervalMs: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .volatile()
    .description(
      "Minimum milliseconds between injections in one session. 0 means never refresh, so the block is injected once. Raise it only if a compactor is dropping old messages.",
    ),
  refreshAfterMessages: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .volatile()
    .description(
      "Re-inject after this many new conversation messages since the last injection. 0 means never. This is the practical defence against a compactor folding the injected message away: folding removes old messages, so a block injected once and folded is gone.",
    ),
  workspaceRelative: z
    .boolean()
    .default(true)
    .volatile()
    .description(
      "Resolve a relative memory folder against the session workspace. Turn off to resolve it against the process directory instead.",
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
 * Resolve the absolute memory folder.
 *
 * The session header carries the absolute `cwd` the session was created in, and
 * that is the right base for a relative folder: a relative memory path should
 * mean the same thing in a resumed session as it did in the original one.
 *
 * @param {any} agent - Live agent whose session is being prepared.
 * @param {any} config - Validated plugin config.
 * @returns {string} Absolute memory directory.
 */
function memoryDirectory(agent, config) {
  // The Config schema defaults this to true, but that default only exists after
  // validation. Testing truthiness would silently mean "false" for any caller
  // that hands `apply` an unvalidated object, so the code states the documented
  // default itself and only an explicit `false` turns it off.
  const base =
    configValue(config, "workspaceRelative") !== false && typeof agent?.session?.header?.cwd === "string"
      ? agent.session.header.cwd
      : process.cwd();
  return expandPath(configValue(config, "memoryDir") ?? "~/.dsh/ofttold-memory", base);
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
  // Same trap as `workspaceRelative`: the Config schema supplies this default
  // only after validation, so an unvalidated config would mean "no sections" and
  // the plugin would silently register nothing. State the documented default.
  const sections = configValue(config, "sections") ?? DEFAULT_SECTIONS;
  if (sections.length === 0) return;

  // Directories already prepared in this process. Scaffolding runs lazily from
  // the pre-step listener, because a relative `memoryDir` resolves against the
  // *session* cwd — at `apply` time there is no session yet, so preparing here
  // would create the starter file in the process directory instead of where the
  // user's notes actually live. The set keeps that one stat out of every step.
  const prepared = new Set();

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
    const refreshIntervalMs = configValue(config, "refreshIntervalMs") ?? 0;
    const refreshAfterMessages = configValue(config, "refreshAfterMessages") ?? 0;
    const intervalDue =
      refreshIntervalMs > 0 &&
      bookkeeping.lastInjectedAt !== null &&
      now - bookkeeping.lastInjectedAt >= refreshIntervalMs;
    const messagesDue =
      refreshAfterMessages > 0 &&
      bookkeeping.lastInjectedMessageCount !== null &&
      bookkeeping.messageCount - bookkeeping.lastInjectedMessageCount >= refreshAfterMessages;
    if (!neverInjected && !intervalDue && !messagesDue) return decision;

    const memoryDir = memoryDirectory(agent, config);
    // Prepare the folder before reading it, so a first-run session finds a
    // starter file instead of injecting nothing. Once per directory per process
    // is enough; failures are logged once and then treated as "nothing to do",
    // because a read-only home directory is not a reason to fail a turn.
    if (!prepared.has(memoryDir)) {
      prepared.add(memoryDir);
      const scaffold = scaffoldMemory(memoryDir);
      if (scaffold.error !== undefined) {
        ctx.logger?.warn?.("ofttold-memory: could not prepare memory folder %s (%s)", memoryDir, scaffold.error);
      } else if (scaffold.createdFile) {
        ctx.logger?.info?.("ofttold-memory: created a starter memory file in %s", memoryDir);
      }
    }

    const rendered = renderSources(config, memoryDir);
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
