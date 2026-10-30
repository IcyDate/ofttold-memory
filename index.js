/**
 * ofttold-memory — keep your memory in front of the model, every session.
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
import { homedir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { z as zod } from "zod";

import { configValue } from "./lib/config.js";
import { Diagnostics } from "./lib/diagnostics.js";
import { scaffoldMemory } from "./lib/scaffold.js";
import { registerSkills } from "./lib/skills.js";
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
    "A heading in your notes to keep visible, written without the leading `#`. This is the form most people want.",
  ),
  z
    .object({
      file: z
        .string()
        .default("MEMORY.md")
        .description(
          "Which file inside your notes folder this section lives in. Defaults to `MEMORY.md`. Absolute and `~/` paths also work, for notes kept elsewhere.",
        ),
      heading: z
        .string()
        .required()
        .description(
          "The heading text exactly as it appears in your notes, without the leading `#`. Matching is exact, so renaming a heading stops it resolving rather than silently pulling in the section next door.",
        ),
      maxChars: z
        .natural()
        .min(1)
        .max(Number.MAX_SAFE_INTEGER)
        .required(false)
        .description(
          "How much of this section to read. Longer text is cut at a line break with a marker. Defaults to the plugin-wide maxChars.",
        ),
      label: z
        .string()
        .default("")
        .description(
          "The name this section appears under inside the injected block. Defaults to the heading itself.",
        ),
    })
    .description(
      "A section that needs its own file, its own length limit, or a different display name. Most setups never need this.",
    ),
]);

export const Config = z.object({
  memoryDir: z
    .string()
    .default("~/.dsh/ofttold-memory")
    .volatile()
    .description(
      "Where your notes live. Created with a starter `MEMORY.md` on first run, so you can leave this alone. Point it at a folder you already keep and the plugin only reads it.",
    ),
  sections: z
    .array(Section)
    .default([...DEFAULT_SECTIONS])
    .volatile()
    .description(
      "Which parts of your notes it should remember. Bare strings are headings in your memory file. The default lifts the `Oft-told` section (or `常被提起` in a Chinese file). Leaving this empty turns the plugin off without failing the load.",
    ),
  maxChars: z
    .natural()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(600)
    .volatile()
    .description(
      "How much of each section to read, when a section does not set its own. 600 characters is about 400 tokens, charged once per session, so raising this raises what every session pays.",
    ),
  header: z
    .string()
    .default(
      "Standing context for this session: human-curated sections of a memory folder. " +
        "Writing and maintaining it — index, self-description, diary — is the `ofttold-ritual` skill.",
    )
    .volatile()
    .description(
      "The line that opens the block. It tells the model this is background, not something you said, so it must not read like a message from the user.",
    ),
  refreshIntervalMs: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .volatile()
    .description(
      "How long to wait before injecting again within one session, in milliseconds. 0 means inject once and never refresh. Only worth raising if old messages are getting compacted away.",
    ),
  refreshAfterMessages: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .volatile()
    .description(
      "Inject again after this many new messages. 0 means never. Needed only in long sessions: when old messages are compacted into summaries, the injected block is one of them and gets folded away with them.",
    ),
  workspaceRelative: z
    .boolean()
    .default(true)
    .volatile()
    .description(
      "What a relative folder path is resolved against. On: this session's working folder. Off: the folder the process started in. Usually no need to change it.",
    ),
  skills: z
    .boolean()
    .default(true)
    .volatile()
    .description(
      "Publish the writing-side skills (diary entry, index line, emotion tag, relationship.md) into the session skill catalog. On by default: the reading side alone tells a new user what they already know but not how to add to it. Off removes them without affecting injection.",
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
 * Where the plugin keeps its own files.
 *
 * Resolved from `DSH_HOME` when the harness sets it, else `~/.dsh` — the same
 * root the plugin's default memory folder lives under. Kept separate from
 * `memoryDirectory` on purpose: the memory folder is read-only input, and the
 * diagnostics file must not land among the user's notes.
 *
 * @returns {string} Absolute storage root.
 */
function storageDirectory() {
  const configured = process.env.DSH_HOME;
  return configured !== undefined && configured !== "" ? expandPath(configured, process.cwd()) : join(homedir(), ".dsh");
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

  // The writing side is published once, here, because skills belong to the
  // plugin rather than to any one session. It is best-effort in both directions:
  // a harness without the skill service gets the injection and no catalog entry,
  // and a service that is not yet served at load time is retried on the first
  // session rather than silently skipped — that silent-skip is exactly how a
  // client half failed to apply once, and it took a live harness to notice.
  const skillsEnabled = configValue(config, "skills") !== false;
  const warn = (message) => ctx.logger?.warn?.(`ofttold-memory: ${message}`);
  let skillsPending = registerSkills(ctx, skillsEnabled, warn).length === 0 && skillsEnabled;

  // Directories already prepared in this process. Scaffolding runs lazily from
  // the pre-step listener, because a relative `memoryDir` resolves against the
  // *session* cwd — at `apply` time there is no session yet, so preparing here
  // would create the starter file in the process directory instead of where the
  // user's notes actually live. The set keeps that one stat out of every step.
  const prepared = new Set();
  // One recorder per plugin instance: it sees every session, so a symptom that
  // spans sessions stays in one history instead of fragmenting per session.
  const diagnostics = new Diagnostics();

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

    // Retry the skill registration once, at the first session that actually
    // exists. `skills` may be served later than this plugin is loaded, and a
    // one-shot attempt at `apply` time would then lose the catalog entry for the
    // whole process — the same failure mode the client half had.
    if (skillsPending) skillsPending = registerSkills(ctx, skillsEnabled, warn).length === 0;

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
    if (rendered === undefined) {
      // The most common "it does nothing" report: the folder exists, the heading
      // does not match. Recording it is the whole point of the diagnostic file.
      diagnostics.record("nothing-loaded", { memoryDir, reason: "no configured section resolved" });
      diagnostics.flush(storageDirectory());
      return decision;
    }
    diagnostics.record("injected", {
      memoryDir,
      loaded: rendered.loaded,
      failed: rendered.failed,
      chars: rendered.text.length,
    });
    diagnostics.flush(storageDirectory());

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
