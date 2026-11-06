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

import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { buildNotice } from "./lib/notice.js";
import { DIARY_CADENCES, localDay, pendingDiaryNudge } from "./lib/diary.js";
import { detourSizeLine, diaryIssueLine, minutesOf } from "./lib/diarycheck.js";
import { completeTask, rememberNote, taskStatusLine, ANCHOR_HEADING, NOTE_FILE, TASK_HEADING } from "./lib/notes.js";
import { recordReadAt, unreadLine } from "./lib/reads.js";
import { RELATIONSHIP_FILE, readLiveEmotion } from "./lib/emotion.js";
import { rememberEmotion } from "./lib/emotion.js";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";

import { configValue } from "./lib/config.js";
import { Diagnostics } from "./lib/diagnostics.js";
import { scaffoldMemory } from "./lib/scaffold.js";
import { registerSkills } from "./lib/skills.js";
import { DEFAULT_MEMORY_FILE, DEFAULT_SECTIONS, LEGACY_MEMORY_FILE, expandPath, renderSources, stampSourceDates } from "./lib/sources.js";

export const name = "ofttold-memory";

/** Where the memory folder lives when nobody configured one: inside the workspace. */
export const DEFAULT_MEMORY_DIR = ".ofttold";

/** Where 0.1.15 and earlier put it. Still read, so nobody's memory goes missing. */
export const LEGACY_MEMORY_DIR = "~/.dsh/ofttold-memory";

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
        .default("memory.md")
        .description(
          "Which file inside your notes folder this section lives in. Defaults to `memory.md`. Absolute and `~/` paths also work, for notes kept elsewhere.",
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
    .default(".ofttold")
    .volatile()
    .description(
      "Where the memory folder lives. The default sits inside the current workspace, because the assistant writes the diary and the index with its own file tools and those cannot write outside the workspace under the default file policy. Point it elsewhere and that folder must be writable too.",
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
  diaryCadence: z
    .string()
    .default("daily")
    .volatile()
    .description(
      "How often the folder is expected to grow. `daily` names today when it is unwritten; `weekly` stays quiet as long as something was written in the last 7 days; `off` never says anything. A folder without `diary/` is silent under every setting — that is the layout answering, not the config.",
    ),
  diaryStaleHours: z
    .natural()
    .min(0)
    .default(2)
    .volatile()
    .description(
      "Once today's entry exists and is this session's own, how many hours of silence before the tail line says when it was last written. This is the third case the other signals miss: the file is there, the check is green, and three hours of the day never went in. It states the hour and the gap and says nothing about whether to write — and it does not count minutes upward, so it reads as a fact rather than a ticking clock. 0 turns it off. The default is a guess, which is why it is a setting.",
    ),
  summaryFrom: z
    .string()
    .default("17:30")
    .volatile()
    .description(
      "When to start expecting the `## 今天` summary at the top of the day's entry, as HH:mm. Before this hour the check stays quiet — a summary written at 10:00 is just a stale summary. After it, an entry whose body runs past its summary is reported.",
    ),
  diarySections: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .volatile()
    .description(
      "How many `##` sections a single day's entry may hold before the check names it. 0 turns this off, and off is the default: counting sections does not measure what it looks like it measures. A busy day produces more sections than a quiet one, and the sections get longer, not shorter, when the day was real. Whether a section belongs on its own or folds into the one before it is a judgment, not a count.",
    ),
  diaryCheck: z
    .boolean()
    .default(true)
    .volatile()
    .description(
      "Report what is wrong with today's entry: sections past the cap, sections without an `情绪：` line, a summary that is missing after summaryFrom or stale against the body. Report only — nothing is rewritten, because consolidating an entry deletes the evidence the weight counts.",
    ),
  detourChars: z
    .natural()
    .min(0)
    .default(3000)
    .volatile()
    .description(
      "How large `detours.md` may grow before the block says so. The file is meant to hold the *shapes* of recurring mistakes — a few hundred characters — not the incidents, which belong in each day's `岔路：` line. Past two or three thousand characters it reads as a second diary, which is the thing it exists to avoid. 0 keeps it quiet.",
    ),
  taskStaleDays: z
    .natural()
    .min(0)
    .default(30)
    .volatile()
    .description(
      "How long a task may stay open before the block stops counting it and asks whether to keep it. Past this age a task named every session becomes background noise — asking whether it still exists is a real question, chasing it is not. 0 keeps it quiet.",
    ),
  anchorCap: z
    .natural()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(8)
    .volatile()
    .description(
      "How many lines of a list section stay in view. The rest stay in the file but stop being injected, ranked by exp(-t / 2^n): t is days since the line is dated, n is how many distinct diary days have recalled it. 0 turns the cap off. Untouched when the section holds no bold-bullet list.",
    ),
  header: z
    .string()
    .default(
      "Standing context for this session: notes you wrote, for the person you work with. " +
        "Read them as your own memory, not as background documentation. " +
        "Maintaining the folder — index, self-description, diary — is the `ofttold-ritual` skill; " +
        "when the tail of this block says today is unwritten, that skill says what to write.",
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
const stateSchema = {
  /**
   * 手写而不是 zod：这是包里**唯一**用到 zod 的地方，而它只需要 `parse()`。
   *
   * 保留 zod 的代价不是体积，是**供应链审查**——DSH STORE 的自动准入要求
   * 「零运行期依赖」，有依赖就得再单独审一遍锁文件。为了五个数字字段带一个
   * 依赖进来，不划算。宿主在 `.parse()` 抛错时跳过这一行（`try { ... } catch { continue }`），
   * 所以契约只有一条：**形状不对就抛**。
   */
  parse(row) {
    const value = row ?? {};
    const check = (field, allowNull) => {
      const current = value[field];
      if (current === null && allowNull) return null;
      if (typeof current !== "number" || !Number.isFinite(current)) {
        throw new TypeError(`projection state ${field} must be a finite number`);
      }
      return current;
    };
    return {
      injectedCount: check("injectedCount", false),
      lastInjectedAt: check("lastInjectedAt", true),
      lastInjectedMessageCount: check("lastInjectedMessageCount", true),
      messageCount: check("messageCount", false),
    };
  },
};

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
export function memoryDirectory(agent, config) {
  // The Config schema defaults this to true, but that default only exists after
  // validation. Testing truthiness would silently mean "false" for any caller
  // that hands `apply` an unvalidated object, so the code states the documented
  // default itself and only an explicit `false` turns it off.
  const sessionCwd = typeof agent?.session?.header?.cwd === "string" ? agent.session.header.cwd : undefined;
  const configured = configValue(config, "memoryDir");
  if (configured != null) {
    // `workspaceRelative` exists to decide what *the user's* relative paths are
    // resolved against. It was never meant to move the default folder, so it
    // only applies here, to a path somebody actually configured.
    const base = configValue(config, "workspaceRelative") !== false && sessionCwd ? sessionCwd : process.cwd();
    return expandPath(configured, base);
  }

  // The default is not a user path, so it does not consult `workspaceRelative`:
  // it has to land in the session's workspace by definition, because that is
  // the only place the assistant's own file tools are allowed to write.
  const base = sessionCwd ?? process.cwd();

  // The default is *inside* the workspace on purpose. The assistant writes the
  // diary, the index and relationship.md with its own file tools, and those go
  // through the host's sandboxed filesystem service — which under the default
  // `workspace-write` policy allows the workspace root and temp dirs and
  // nothing else. A memory folder outside the workspace is therefore readable
  // by the plugin (it uses plain `node:fs`) but unwritable by the assistant
  // (it uses `ctx.fs`), and the visible symptom is a diary that never gets
  // written for no stated reason.
  const local = expandPath(DEFAULT_MEMORY_DIR, base);
  if (existsSync(local)) return local;

  // Folders created by 0.1.15 and earlier live outside the workspace. If one is
  // there, keep reading it rather than silently starting an empty memory
  // somewhere else — the whole point of this folder is that it is not thrown
  // away. Moving it is the user's call, and the docs say how.
  //
  // The check has to look for a memory file, not just the directory:
  // `~/.dsh/ofttold-memory` is *also* where diagnostics.json is written, so it
  // exists on every machine that has ever run the plugin. Treating that as a
  // memory folder would keep everyone on the old broken default forever.
  const legacy = expandPath(LEGACY_MEMORY_DIR, base);
  if (existsSync(join(legacy, DEFAULT_MEMORY_FILE)) || existsSync(join(legacy, LEGACY_MEMORY_FILE))) {
    return legacy;
  }

  return local;
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
/**
 * Remember the day `relationship.md` was opened through the harness file tools.
 *
 * The event fires for reads, writes and edits alike — any of them means the file was
 * in front of the model, which is the only thing this signal is for. A shell `cat`
 * emits nothing; that limit is documented in `lib/reads.js` and is why the tail line
 * says "not opened today" rather than anything stronger.
 *
 * Never throws: a failure here would take down an unrelated tool call.
 */
function watchRelationshipReads(ctx, config) {
  ctx.on("fs/observed", (target, _observation, exec) => {
    try {
      const shown = String(target?.displayPath ?? "");
      if (!shown.endsWith(RELATIONSHIP_FILE)) return;
      const memoryDir = memoryDirectory(exec?.agent, config);
      // 相对路径要按**会话工作区**解析，不是按插件进程的工作目录——`displayPath` 是
      // 相对会话根说的，而进程 cwd 可能是任何地方（实测插件目录、DSH 安装目录都出现过）。
      const base = exec?.agent?.session?.header?.cwd ?? process.cwd();
      const full = isAbsolute(shown) ? shown : resolve(base, shown);
      if (resolve(join(memoryDir, RELATIONSHIP_FILE)) !== resolve(full)) return;
      recordReadAt(storageDirectory(), RELATIONSHIP_FILE, localDay());
    } catch {
      // ignore: the record is a convenience, not a correctness requirement
    }
  });
}

export function apply(ctx, config) {
  watchRelationshipReads(ctx, config);
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


/**
 * Register a tool without failing the plugin load.
 *
 * `tools` is an optional service like `skills`, and on a host that has not served it yet a
 * thrown error here would take down the injection too — a plugin that stops being useful
 * because one affordance is missing is worse than a plugin with one less affordance.
 */
function registerTool(ctx, tool) {
  try {
    const registry = typeof ctx.get === "function" ? ctx.get("tools") : undefined;
    if (registry === undefined || typeof registry.register !== "function") return false;
    registry.register(tool);
    return true;
  } catch (error) {
    ctx.logger?.warn?.(`ofttold-memory: could not register ${tool?.name ?? "tool"}: ${error?.message ?? error}`);
    return false;
  }
}

/** `2026-10-30 11:20` — local, because the writer reads it, not a logger. */
function localStamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${localDay(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

  // The emotion cache is one line that changes many times a day, and the two ways to get
  // it wrong — a word outside the vocabulary, a stamp the writer has to remember — are both
  // silent. A tool makes the check and the write one action, which is the whole reason the
  // hand-written script existed and stayed on one machine.
  registerTool(ctx, defineTool({
    name: "remember_emotion",
    description:
      "Set the live emotion value in the memory folder's relationship.md. Use when the feeling actually changes, not to label a diary section you are about to write (that line is copied from the entry afterwards). The word must already be in that file's 情绪词表 section.",
    parameters: {
      word: { type: "string", description: "One word, exactly as it appears in the 情绪词表 section. Not a description, not a sentence." },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: value.message }],
    },
    // `exec` 是这次调用的上下文；记忆文件夹要从它里面的 agent 算，不能用
    // pre-step 里那个局部变量——工具跑在另一处作用域，那个名字根本不存在。
    // 真实撞上的一次：Windows 机器上调用报 `memoryDir is not defined`，
    // 而所有单测都在测 lib/emotion.js，没一条走到这条接线。
    execute(args, exec) {
      const word = typeof args.word === "string" ? args.word.trim() : "";
      if (word === "") return { ok: false, message: "需要一个词，不是一句话。" };
      const dir = memoryDirectory(exec?.agent, config);
      const result = rememberEmotion({ memoryDir: dir, word, stamp: localStamp() });
      return { ok: result.ok, message: result.message };
    },
  }));

  // 「记下了」得是一个动作，不能是一句话。措辞千变万化（记下了/记住了/放心上了），
  // 所以这里不认词，只提供一个便宜的落点：调用它就有可见的一行，没调用就是没发生。
  registerTool(ctx, defineTool({
    name: "remember_note",
    description:
      `Write one thing into the memory folder's ${NOTE_FILE}. Use it whenever the user asks you to keep something — a fact that should still hold later (kind \"anchor\", stored under ${ANCHOR_HEADING}) or a piece of work still owed (kind \"task\", stored under ${TASK_HEADING}). Saying you noted something without calling this is a claim with no action behind it.`,
    parameters: {
      text: { type: "string", description: "The fact, or the task, in one line. What you would want to read back later." },
      title: { type: "string", description: "Optional handle for an anchor, the bold part you will scan for. Defaults to the start of the text." },
      kind: { type: "string", description: "\"anchor\" (default) for a fact, \"task\" for work still owed." },
      due: {
        type: "string",
        description:
          "Optional due date for a task, YYYY-MM-DD. With one, the task is named in the block tail once that day arrives; without one it only ever ages. Use it whenever the sentence contains a when — \"过两天\", \"下周\", \"before Friday\" all resolve to a date.",
      },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: value.message }],
    },
    execute(args, exec) {
      const dir = memoryDirectory(exec?.agent, config);
      const kind = typeof args.kind === "string" && args.kind.trim() !== "" ? args.kind.trim() : "anchor";
      const result = rememberNote({
        memoryDir: dir,
        text: typeof args.text === "string" ? args.text : "",
        title: typeof args.title === "string" ? args.title : undefined,
        kind,
        stampText: localDay(),
        due: typeof args.due === "string" ? args.due : undefined,
      });
      return { ok: result.ok, message: result.message };
    },
  }));

  // 勾掉，不是删掉：删了就没有「这件事做过」的证据，而 `openTasks` 本来就不数
  // 已勾的行——块尾自己会少一条，文件里还留着。
  registerTool(ctx, defineTool({
    name: "complete_task",
    description:
      `Tick off one open task in ${NOTE_FILE} under ${TASK_HEADING}. The line stays in the file as history; it just stops being counted. Use the task text exactly as it appears in the file.`,
    parameters: {
      text: { type: "string", description: "The task text, exactly as written after the `- [ ] date 起 ｜` prefix." },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: value.message }],
    },
    execute(args, exec) {
      const dir = memoryDirectory(exec?.agent, config);
      const result = completeTask({
        memoryDir: dir,
        text: typeof args.text === "string" ? args.text : "",
        stampText: localDay(),
      });
      return { ok: result.ok, message: result.message };
    },
  }));

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
        // 用户在自己的文件夹里被写入了东西，就该能看见是哪些——「只补缺的」这件事
        // 只有说清楚才让人放心。
        ctx.logger?.info?.(
          "ofttold-memory: filled in %s in %s (existing files untouched)",
          scaffold.createdFiles.join(", "),
          memoryDir,
        );
      } else if (scaffold.error !== undefined) {
        ctx.logger?.warn?.("ofttold-memory: could not prepare %s (%s)", memoryDir, scaffold.error);
      }
    }

    const rendered = renderSources(config, memoryDir);
    // 先给没有自己日期的锚点盖一个「从这天起算」——写进文件而不是藏在 sidecar 里，
    // 因为一个事实有两个家就会漂。
    stampSourceDates(config, memoryDir, localDay());

    if (rendered.loaded === 0) {
      // The most common "it does nothing" report: the folder exists, the heading
      // does not match. Recording it is the whole point of the diagnostic file --
      // but a file nobody opens cannot be the only answer, so the session gets a
      // line saying what was looked for.
      diagnostics.record("nothing-loaded", { memoryDir, reason: "no configured section resolved" });
      diagnostics.flush(storageDirectory());
      return {
        ...decision,
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [{ type: "text", text: buildNotice({ attempts: rendered.attempts, memoryDir, header: rendered.header }) }],
            source: { kind: name, form: "snapshot", sections: [] },
          }),
        ],
      };
    }
    diagnostics.record("injected", {
      memoryDir,
      loaded: rendered.loaded,
      failed: rendered.failed,
      chars: rendered.text.length,
    });
    diagnostics.flush(storageDirectory());

    // 块尾的一句话：今天的日记还没写。别的部分都要求模型想起来去做判断，这一行
    // 只需要它看一眼——一个 stat 的代价，换掉「靠自觉」。
    // schemastery 没有 z.enum；也不是拿它当校验——写错的值当 daily 处理，宁可多提醒一次，
    // 不要因为拼错一个词就安静下来（安静正是这套机制要消灭的失败）。
    const cadence = DIARY_CADENCES.includes(configValue(config, "diaryCadence"))
      ? configValue(config, "diaryCadence")
      : "daily";
    // 会话开始时间：用来分辨「今天这一篇是这个会话写的」还是「别的会话写的，
    // 而这个会话什么都没放进去」。取不到就退回旧行为（只看文件在不在）。
    const sessionStartedAt = Number(agent?.session?.header?.createdAt);
    const staleHours = Number(configValue(config, "diaryStaleHours") ?? 2);
    const nudge = pendingDiaryNudge(memoryDir, new Date(), cadence, { sessionStartedAt, staleHours });
    // 体检跟提醒拼在一起：都在块尾，都只在「今天这一篇有问题」时才出现，都对模型说而不是
    // 对用户说——用户没义务转告。
    const issue = diaryIssueLine({
      memoryDir,
      day: localDay(),
      nowMinute: new Date().getHours() * 60 + new Date().getMinutes(),
      summaryFrom: minutesOf(configValue(config, "summaryFrom") ?? "17:30"),
      cap: Number(configValue(config, "diarySections") ?? 0),
      enabled: configValue(config, "diaryCheck") !== false,
    });
    // 当初设计这个文件时真正想问的那一件事：**它会不会长大**。
    const oversized = detourSizeLine({
      memoryDir,
      limit: Number(configValue(config, "detourChars") ?? 3000),
    });
    // 待办写进文件也不算「有家」——它不注入就没人读。这里只报条数，不搬正文：
    // 搬正文等于把任务塞进每一轮的上下文，而「有几条」就足够让人去翻那一段。
    const tasks = (() => {
      try {
        return taskStatusLine({
          text: readFileSync(join(memoryDir, NOTE_FILE), "utf8"),
          todayIso: localDay(),
          staleDays: Number(configValue(config, "taskStaleDays") ?? 30),
        });
      } catch {
        return undefined;
      }
    })();
    // 排在待办前面：读到一句话的代价，比翻一个文件的代价低得多，但它指向的正是那个
    // 从不进注入块的文件。文件不在时不说——指向一个不存在的东西比不指更糟。
    const unread = existsSync(join(memoryDir, RELATIONSHIP_FILE))
      ? unreadLine({ storageDir: storageDirectory(), key: RELATIONSHIP_FILE, day: localDay() })
      : undefined;
    // 情绪的活值：一行，和「今天的日记还没写」同一层——**它必须在我眼前，否则等于没有。**
    // 11-06 量的：那一节冻了两天、十二节日记一次没抄，因为缓存区只活在文件里，
    // 而文件要人自己打开才在场。这一行把这个状态搬进每一轮的上下文。
    // 超过两天就自己说一句：活值一旦不更新，就不再是「现在」，而是一个死值。
    const emotion = (() => {
      try {
        const live = readLiveEmotion(readFileSync(join(memoryDir, RELATIONSHIP_FILE), "utf8"), localDay());
        if (live === undefined) return undefined;
        const when = live.stamp === undefined ? "" : `（${live.stamp}）`;
        const stale = live.days !== undefined && live.days >= 2 ? `——${live.days} 天没更新了，它可能已经不是现在的样子` : "";
        const extra = live.extra === undefined ? "" : ` ${live.extra}`;
        return `- 现在的情绪：\`${live.word}\`${when}${extra}${stale}`;
      } catch {
        return undefined;
      }
    })();
    const tail = [emotion, nudge, issue, oversized, unread, tasks].filter((part) => part !== undefined).join("\n\n");
    if (tail !== "") {
      // 块尾那句也是「注入出去的东西」，README 里写的是「每一次注入决策都在里面」——
      // 它要算决策的一部分，否则那句话生效与否在诊断文件里查不到。
      diagnostics.record("tail", {
        memoryDir,
        nudged: nudge !== undefined,
        checked: issue !== undefined,
        issue: issue === undefined ? undefined : issue.slice(0, 200),
      });
      diagnostics.flush(storageDirectory());
    }
    // 日期锚：会话可能跨天，所以这一行**自带过期说明**——写清它是「注入那一刻」的日子，
    // 并当场告诉模型怎么核对。一个会过期的锚比没有锚更糟：今天刚栽过（没有今天的日记，
    // 我就把今天的事全对到了昨天那一篇上）。所以它不假装自己是「现在」。
    const stampedAt = new Date();
    const dateAnchor = `Written on ${localDay(stampedAt)} ${String(stampedAt.getHours()).padStart(2, "0")}:${String(stampedAt.getMinutes()).padStart(2, "0")} — the day this block was made, not necessarily today. Run \`date\` before saying "today" or "yesterday"; a session can outlive its own date.`;
    // 放在正文之后、块尾之前：正文第一行仍是以 "Standing" 开头的那句身份说明
    // （测试和读者的第一眼都靠它），日期锚紧跟着自己的正文走，不抢开头。
    const body = `${rendered.text}\n\n${dateAnchor}`;
    const text = tail === "" ? body : `${body}\n\n${tail}`;

    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: "text", text }],
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
