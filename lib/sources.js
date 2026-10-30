/**
 * Source loading: turn the configured memory folder into the text one injection
 * carries.
 *
 * The shape is deliberately narrow. A user picks a folder and, at most, names a
 * few sections; everything else has a working default. That is the difference
 * between a plugin someone can install and a plugin someone can program.
 *
 * Every failure mode here is non-fatal on purpose. A missing file, an unwritable
 * home directory, or a heading someone renamed must not stop a session from
 * starting — the cost of a silent skip is one absent reminder, while the cost of
 * a thrown plugin is the whole harness refusing to boot.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parseAnchors, readDiaries, scoreAnchors, stampUndated, today } from "./anchors.js";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { configValue, deref } from "./config.js";
import { extractSection, parseHeadings, truncateBody } from "./sections.js";

/** The one file a memory folder is expected to contain by default. */
export const DEFAULT_MEMORY_FILE = "MEMORY.md";

/** Sections injected when the user names none. */
/**
 * Sections lifted when the user names none.
 *
 * Two spellings of the same idea, because the plugin ships to both language
 * communities: whichever heading the user's file actually has gets used and the
 * other is skipped silently. Requiring a config edit just to match a template's
 * language would be a needless first-run stumble.
 */
export const DEFAULT_SECTIONS = ["Oft-told", "常被提起"];

/**
 * Expand a leading `~` and resolve a configured path against a base directory.
 *
 * Only a bare `~/` or `~` prefix expands; `~user/` is left alone, because
 * resolving another user's home would need a passwd lookup this plugin has no
 * business doing.
 *
 * @param {string} rawPath - Configured path, possibly `~`-prefixed, or a
 *   volatile reference holding one.
 * @param {string} base - Absolute directory for relative paths.
 * @returns {string} Absolute path.
 */
export function expandPath(rawPath, base) {
  // Unwrap a volatile reference here as well as at the call sites. `expandPath`
  // is exported, so a caller that hands it a validated config's field would get
  // a reference object instead of a string and fail on the first `startsWith`.
  // Defence in depth: the plugin reads through `configValue`, but the function
  // must not depend on every caller remembering to.
  const value = deref(rawPath);
  if (value === null || value === undefined) return resolve(base, ".");
  const path = String(value);
  // Both separators, not the platform's own: on Windows `~/notes` is just as
  // natural to type as `~\notes`, and a config pasted from a POSIX example must
  // still work there. Expanding only one form silently resolved the other to a
  // literal directory named `~` beside the process cwd.
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return isAbsolute(path) ? path : resolve(base, path);
}

/**
 * Normalize the user-facing `sections` list into explicit source descriptors.
 *
 * Two forms are accepted because they answer two different questions:
 * a bare string names a heading inside the default file (the common case, and
 * the one that must stay typable by someone who has never read the docs), while
 * an object adds a file, a per-section budget, or a display label for the cases
 * where one folder holds more than one document.
 *
 * @param {readonly (string | { file?: string, heading: string, maxChars?: number, label?: string })[]} sections
 *   Raw `sections` from the plugin config.
 * @param {number} defaultMaxChars - Budget when an entry omits `maxChars`.
 * @returns {readonly { file: string, heading: string, maxChars: number, label: string }[]}
 *   One descriptor per configured section, with every field filled in.
 */
export function resolveSections(sections, defaultMaxChars) {
  const resolved = [];
  for (const entry of sections ?? []) {
    // A blank string is the same as "not configured": skipping it keeps a stray
    // comma in the config from producing a section that can never resolve.
    if (typeof entry === "string") {
      const heading = entry.trim();
      if (heading === "") continue;
      resolved.push({
        file: DEFAULT_MEMORY_FILE,
        heading,
        maxChars: defaultMaxChars,
        label: heading,
      });
      continue;
    }
    if (entry === null || typeof entry !== "object") continue;
    const heading = (entry.heading ?? "").trim();
    // A heading-less object is a typo, not a request for the whole file: the
    // whole-file form would inject a document the user never chose.
    if (heading === "") continue;
    resolved.push({
      file: entry.file === undefined || entry.file.trim() === "" ? DEFAULT_MEMORY_FILE : entry.file,
      heading,
      maxChars: entry.maxChars ?? defaultMaxChars,
      // Same trap as in `loadSource`: the schema defaults this to "", so `??`
      // would keep a blank label and render a bare `### ` heading.
      label: entry.label !== undefined && entry.label.trim() !== "" ? entry.label : heading,
    });
  }
  return resolved;
}

/**
 * Read one resolved source and render its section.
 *
 * @param {{ file: string, heading: string, maxChars: number, label: string }} source
 *   One descriptor from `resolveSections`.
 * @param {string} memoryDir - Absolute memory folder; relative files resolve here.
 * @returns {{ ok: true, label: string, text: string, truncated: boolean }
 *   | { ok: false, label: string, reason: string }}
 *   On success `text` is the trimmed body, possibly with a truncation marker;
 *   on failure `reason` is a short machine-readable cause for the log.
 */
export function loadSource(source, memoryDir) {
  const label = source.label;
  const maxChars = source.maxChars;
  let text;
  try {
    text = readFileSync(expandPath(source.file, memoryDir), "utf8");
    // Two Windows-editor artefacts, both of which make a file the user can see
    // look broken to a parser that only understands POSIX text:
    //
    // A UTF-8 BOM (Notepad, some VS Code setups) glues itself to the first
    // heading, so `# My memory` stops matching exactly and the section silently
    // disappears. CRLF line endings leave a stray `\r` at every line end, which
    // survives into the injected block and can defeat a heading match written
    // with a trailing anchor.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes("\r")) text = text.replace(/\r\n?/g, "\n");
  } catch (error) {
    const code = error?.code ?? "READ_FAILED";
    return { ok: false, label, reason: code === "ENOENT" ? "missing" : code };
  }
  const section = extractSection(text, source.heading);
  if (!section.found) return { ok: false, label, reason: "heading_not_found" };
  const truncated = truncateBody(section.body, maxChars);
  if (truncated.text === "") return { ok: false, label, reason: "empty_section" };
  const marker = truncated.truncated
    ? truncated.partial
      ? `\n\n(cut mid-line at maxChars=${maxChars})`
      : `\n\n(${truncated.droppedLines} more line(s) omitted; maxChars=${maxChars})`
    : "";
  return {
    ok: true,
    label,
    text: `${truncated.text}${marker}`,
    truncated: truncated.truncated,
  };
}

/**
 * Render every configured section into one block of model-facing text.
 *
 * Sections are joined under a caller-supplied header. A section that fails is
 * reported in the same block as a one-line note rather than dropped silently,
 * so a renamed heading or a moved folder is visible in context instead of
 * mysteriously absent — that note is the whole diagnostic surface this plugin
 * has, since it never fails a session to tell you something is wrong.
 *
 * @param {{ sections?: readonly any[], header?: string, maxChars?: number }} config
 *   Validated plugin config.
 * @param {string} memoryDir - Absolute memory folder for relative files.
 * @returns {{ text: string, loaded: number, failed: readonly string[] }
 *   | undefined}
 *   `undefined` when nothing at all could be loaded — the caller then skips the
 *   injection instead of spending tokens on a block that says only "nothing".
 */
export function renderSources(config, memoryDir) {
  const defaultMaxChars = configValue(config, "maxChars") ?? 600;
  // 0 means "no cap" — the list is the assistant's, and a folder with no diaries
  // cannot be scored, so an unfilled cap must never be read as "drop everything".
  const anchorCap = Number(configValue(config, "anchorCap") ?? 8);
  const header =
    configValue(config, "header") ??
    "Standing context for this session: human-curated sections of a memory folder. " +
      "Writing and maintaining it — index, self-description, diary — is the `ofttold-ritual` skill.";
  // Same trap as `workspaceRelative` in index.js: the Config schema supplies this
  // default only after validation, so an unvalidated config would mean "no
  // sections" and silently inject nothing. State the documented default here.
  const configured = configValue(config, "sections") ?? undefined;
  const sources = resolveSections(configured ?? DEFAULT_SECTIONS, defaultMaxChars);
  // The fallback list is alternatives, not a set: pick the one that comes FIRST
  // IN THE FILE, not the first one in the list. A user who writes Chinese above
  // English expects the Chinese section, and ordering by config would inject the
  // other one just because the list happened to name it first.
  const pick = configured === undefined ? firstPresentSource(sources, memoryDir) : undefined;
  const chosen = pick === undefined ? sources : [pick];
  const parts = [];
  const failed = [];
  // Every attempt, whatever the reason, kept for the caller that has to explain an
  // empty session. `failed` is deliberately narrower (see below); this one is the
  // raw history, and it is the only thing that can tell "you pointed at a wrong
  // folder" apart from "this folder is simply new".
  const attempts = [];
  let loaded = 0;
  for (const source of chosen) {
    const result = loadSource(source, memoryDir);
    if (result.ok) {
      loaded += 1;
      const capped = capAnchors(result.text, memoryDir, anchorCap);
      parts.push(`### ${result.label}\n\n${capped}`);
    } else if (configured !== undefined) {
      // A heading the user named is worth reporting: they asked for it, so its
      // absence is news. A heading from the built-in fallback list is not --
      // `DEFAULT_SECTIONS` holds both language spellings of one idea, and a user
      // only ever has one of them. Reporting the other would put an `Unavailable`
      // line in every session forever, which trains people to ignore the one
      // diagnostic this plugin has.
      failed.push(`${result.label}: ${result.reason}`);
    }
    if (!result.ok) {
      attempts.push({ file: source.file, heading: source.heading, label: result.label, reason: result.reason });
    }
  }
  // Nothing loaded is no longer "return undefined" for the caller to mistake for
  // silence: it hands back the attempts so the plugin can say what it looked for.
  if (loaded === 0) return { text: "", header, loaded: 0, failed, attempts };
  const missing = failed.length === 0 ? "" : `\n\nUnavailable: ${failed.join("; ")}`;
  return { text: `${header}\n\n${parts.join("\n\n")}${missing}`, header, loaded, failed, attempts };
}

/**
 * Pick the fallback section that appears earliest in its file.
 *
 * Returns `undefined` when no candidate resolves, so the caller can report the
 * failures instead of injecting nothing.
 *
 * @param {{ file: string, heading: string }[]} sources - Fallback candidates.
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {any | undefined} The earliest matching candidate, if any.
 */
function firstPresentSource(sources, memoryDir) {
  let best;
  let bestLine = Number.POSITIVE_INFINITY;
  for (const source of sources) {
    let text;
    try {
      text = readFileSync(expandPath(source.file, memoryDir), "utf8");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      if (text.includes("\r")) text = text.replace(/\r\n?/g, "\n");
    } catch {
      continue;
    }
    const heading = parseHeadings(text).find((entry) => entry.title === source.heading);
    if (heading === undefined || heading.start >= bestLine) continue;
    bestLine = heading.start;
    best = source;
  }
  return best;
}

/**
 * Keep the top `cap` anchors by weight, and say which ones sank.
 *
 * The list on disk is not touched: this decides what is worth the tokens *this*
 * session. A line that sinks is still in the file, still greppable, and comes back
 * the moment something recalls it. Forgetting here means "no longer in front of me",
 * not "deleted" — the folder is the only copy of a life, and a parse bug that ate a
 * line would be the one failure this mechanism must never have.
 *
 * Untouched when there is nothing to do: fewer anchors than the cap, a cap of zero,
 * or no diary to count recalls against.
 */
export function capAnchors(text, memoryDir, cap) {
  if (!cap || cap <= 0) return text;
  const anchors = parseAnchors(text);
  if (anchors.length <= cap) return text;
  const nowDay = today();
  const { anchors: ranked } = scoreAnchors({
    text,
    diaries: readDiaries(memoryDir),
    nowDay,
  });
  const guidance = text
    .split("\n")
    .filter((line) => !/^\s*[-*]\s+\*\*/.test(line))
    .join("\n")
    .trimEnd();
  // Rank order, most recalled first: a later truncation by characters should eat the
  // tail of the list rather than a random middle.
  const kept = ranked.slice(0, cap).map((anchor) => anchor.line);
  const sank = ranked.slice(cap);
  const note =
    `> 沉底 ${sank.length} 条（仍在文件里，只是没进这一轮）：` +
    sank.map((anchor) => `${anchor.title}（R=${anchor.R.toFixed(2)}）`).join("、");
  return [guidance, note, kept.join("\n")].filter((part) => part !== "").join("\n\n");
}

/**
 * Write the missing dates into the file, once.
 *
 * This is the only place the plugin writes to a section it did not create, and it is
 * deliberately additive: one `` `date` 起 `` inserted between `→` and the target, nothing
 * else touched. Doing it in the file rather than in a sidecar is the same lesson as the
 * scaffold: a fact with two homes drifts, and a hidden second file is the kind of place
 * nobody looks when the numbers stop making sense.
 *
 * @returns {readonly string[]} Anchors that were stamped (empty when nothing changed).
 */
export function stampSourceDates(config, memoryDir, todayIso) {
  const defaultMaxChars = configValue(config, "maxChars") ?? 600;
  const configured = configValue(config, "sections") ?? undefined;
  const sources = resolveSections(configured ?? DEFAULT_SECTIONS, defaultMaxChars);
  const touched = [];
  for (const source of sources) {
    let file;
    try {
      file = expandPath(source.file, memoryDir);
      const original = readFileSync(file, "utf8");
      const section = extractSection(original, source.heading);
      if (!section.found) continue;
      const { text: stamped, stamped: titles } = stampUndated(section.body, todayIso);
      if (titles.length === 0) continue;
      // Rebuild the file from the exact bytes around the section: the body is replaced,
      // the heading and everything outside it are left as they were.
      const start = original.indexOf(section.body);
      if (start < 0) continue;
      writeFileSync(file, original.slice(0, start) + stamped + original.slice(start + section.body.length));
      touched.push(...titles);
    } catch {
      // A read-only folder must not fail a session; the next run retries.
    }
  }
  return touched;
}
