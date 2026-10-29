/**
 * Source loading: turn configured `sources` into the text one injection carries.
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
 * Read one configured source and render its section.
 *
 * @param {{ path: string, heading?: string, maxChars?: number, label?: string }} source
 *   One entry from the plugin config.
 * @param {string} base - Absolute directory for relative paths.
 * @param {number} defaultMaxChars - Budget when the source omits `maxChars`.
 * @returns {{ ok: true, label: string, text: string, truncated: boolean }
 *   | { ok: false, label: string, reason: string }}
 *   On success `text` is the trimmed body, possibly with a truncation marker;
 *   on failure `reason` is a short machine-readable cause for the log.
 */
export function loadSource(source, base, defaultMaxChars) {
  const label = source.label ?? source.path;
  const heading = source.heading ?? "";
  const maxChars = source.maxChars ?? defaultMaxChars;
  let text;
  try {
    text = readFileSync(expandPath(source.path, base), "utf8");
  } catch (error) {
    const code = error?.code ?? "READ_FAILED";
    return { ok: false, label, reason: code === "ENOENT" ? "missing" : code };
  }
  const section = extractSection(text, heading);
  if (!section.found) return { ok: false, label, reason: "heading_not_found" };
  const truncated = truncateBody(section.body, maxChars);
  if (truncated.text === "") return { ok: false, label, reason: "empty_section" };
  return {
    ok: true,
    label,
    text: truncated.truncated
      ? `${truncated.text}\n\n(${truncated.droppedLines} more line(s) omitted; maxChars=${maxChars})`
      : truncated.text,
    truncated: truncated.truncated,
  };
}

/**
 * Render every configured source into one block of model-facing text.
 *
 * Sources are joined under a caller-supplied header. A source that fails is
 * reported in the same block as a one-line note rather than dropped silently,
 * so a stale path is visible in context instead of mysteriously absent.
 *
 * @param {{ sources?: readonly any[], header?: string, maxChars?: number }} config
 *   Validated plugin config.
 * @param {string} base - Absolute directory for relative paths.
 * @returns {{ text: string, loaded: number, failed: readonly string[] }
 *   | undefined}
 *   `undefined` when nothing at all could be loaded — the caller then skips the
 *   injection instead of spending tokens on a block that says only "nothing".
 */
export function renderSources(config, base) {
  const sources = config.sources ?? [];
  const defaultMaxChars = config.maxChars ?? 1200;
  const header = config.header ?? "Standing context for this session";
  const parts = [];
  const failed = [];
  let loaded = 0;
  for (const source of sources) {
    const result = loadSource(source, base, defaultMaxChars);
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
