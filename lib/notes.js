/**
 * "I've noted it" as an action instead of a sentence.
 *
 * The failure this exists for: an assistant says 记下了 / 记住了 / 放心上了 and writes
 * nothing. Nothing in the transcript disagrees, the user believes it is kept, and the
 * thing is gone. That is the same shape as the five silent failures in 0.1.5 — a
 * plausible return value over an empty result — and it cannot be fixed by listing
 * the phrases, because the next one is a synonym nobody thought of.
 *
 * So the fix is not a word list, it is an action: one call, one visible line in the
 * file. A claim with no call is then visibly a claim with no call.
 *
 * Two kinds, because the folder had a home for facts and none for work:
 *   anchor → a bullet in `常被提起`, in the shape `parseAnchors` already reads
 *   task   → `- [ ]` under `待办`, created on first use
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MEMORY_FILE } from "./sources.js";

export const NOTE_FILE = DEFAULT_MEMORY_FILE;
export const ANCHOR_HEADING = "常被提起";
export const TASK_HEADING = "待办";

/** A heading line owns everything up to the next `## `. */
function sectionBounds(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start < 0) return undefined;
  const after = text.indexOf("\n## ", start + marker.length);
  return { start, end: after < 0 ? text.length : after };
}

/**
 * The title is the handle you will scan for later, so it comes from the text rather
 * than from a second required argument: a tool with two mandatory fields is a tool
 * that gets called with one of them empty.
 */
export function titleOf(text) {
  const first = String(text ?? "")
    .split(/[\n。！？!?；;，,：:]/)[0]
    .trim();
  const trimmed = first === "" ? String(text ?? "").trim() : first;
  return trimmed.length <= 24 ? trimmed : `${trimmed.slice(0, 24)}…`;
}

/** Does this exact line already exist, ignoring surrounding whitespace? */
function alreadyThere(body, line) {
  const wanted = line.trim();
  return body.split("\n").some((row) => row.trim() === wanted);
}

/**
 * Append one note. Returns `{ok, message}` and never throws — the tool layer turns
 * that into a reply the model can act on, and a thrown error would lose the reason.
 */
export function rememberNote({ memoryDir, text, title, kind = "anchor" } = {}) {
  const body = String(text ?? "").trim();
  if (body === "") return { ok: false, message: "nothing to write — the text was empty" };
  if (kind !== "anchor" && kind !== "task") {
    return { ok: false, message: `unknown kind "${kind}" — use "anchor" or "task"` };
  }

  const file = join(String(memoryDir ?? ""), NOTE_FILE);
  if (!existsSync(file)) {
    return { ok: false, message: `no ${NOTE_FILE} in that folder — run the plugin once to scaffold it` };
  }
  const original = readFileSync(file, "utf8");
  const heading = kind === "anchor" ? ANCHOR_HEADING : TASK_HEADING;
  const line =
    kind === "anchor"
      ? `- **${String(title ?? "").trim() || titleOf(body)}** → ${body}`
      : `- [ ] ${body}`;

  const bounds = sectionBounds(original, heading);
  let next;

  if (bounds === undefined) {
    // A task list may be born; an anchor section may not. `常被提起` is what the
    // injected block reads — inventing a second one here would be the
    // "point at something that does not exist" bug in reverse.
    if (kind === "anchor") {
      return {
        ok: false,
        message: `${NOTE_FILE} has no \`## ${ANCHOR_HEADING}\` section — write this into the section the plugin actually reads, or add it first`,
      };
    }
    next = `${original.replace(/\s*$/, "")}\n\n## ${TASK_HEADING}\n\n${line}\n`;
  } else {
    const section = original.slice(bounds.start, bounds.end);
    if (alreadyThere(section, line)) {
      return { ok: false, message: "already there — the same line is in that section" };
    }
    const insertAt = bounds.start + section.replace(/\s*$/, "").length;
    next = `${original.slice(0, insertAt)}\n${line}${original.slice(insertAt)}`;
  }

  writeFileSync(file, next, "utf8");
  return { ok: true, message: `added to ${NOTE_FILE} · ${heading}: ${line}` };
}

/** Open tasks, for the block tail. Checked boxes are done and stay as history. */
export function openTasks(text) {
  const bounds = sectionBounds(String(text ?? ""), TASK_HEADING);
  if (bounds === undefined) return [];
  const section = String(text).slice(bounds.start, bounds.end);
  return section
    .split("\n")
    .filter((row) => /^\s*[-*]\s+\[ \]\s+/.test(row))
    .map((row) => row.replace(/^\s*[-*]\s+\[ \]\s+/, "").trim());
}
