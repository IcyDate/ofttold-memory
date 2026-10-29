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

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { extractSection, truncateBody } from "./sections.js";

/** The one file a memory folder is expected to contain by default. */
export const DEFAULT_MEMORY_FILE = "MEMORY.md";

/** Sections injected when the user names none. */
export const DEFAULT_SECTIONS = ["常被提起"];

/**
 * Expand a leading `~` and resolve a configured path against a base directory.
 *
 * Only a bare `~/` or `~` prefix expands; `~user/` is left alone, because
 * resolving another user's home would need a passwd lookup this plugin has no
 * business doing.
 *
 * @param {string} path - Configured path, possibly `~`-prefixed.
 * @param {string} base - Absolute directory for relative paths.
 * @returns {string} Absolute path.
 */
export function expandPath(path, base) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
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
  const defaultMaxChars = config.maxChars ?? 600;
  const header = config.header ?? "Standing context for this session";
  // Same trap as `workspaceRelative` in index.js: the Config schema supplies this
  // default only after validation, so an unvalidated config would mean "no
  // sections" and silently inject nothing. State the documented default here.
  const sections = config.sections ?? DEFAULT_SECTIONS;
  const sources = resolveSections(sections, defaultMaxChars);
  const parts = [];
  const failed = [];
  let loaded = 0;
  for (const source of sources) {
    const result = loadSource(source, memoryDir);
    if (result.ok) {
      loaded += 1;
      parts.push(`### ${result.label}\n\n${result.text}`);
    } else {
      failed.push(`${result.label}: ${result.reason}`);
    }
  }
  if (loaded === 0) return undefined;
  const missing = failed.length === 0 ? "" : `\n\nUnavailable: ${failed.join("; ")}`;
  return { text: `${header}\n\n${parts.join("\n\n")}${missing}`, loaded, failed };
}
