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
import { parseHeadings } from "./sections.js";

export const NOTE_FILE = DEFAULT_MEMORY_FILE;
export const ANCHOR_HEADING = "常被提起";
export const TASK_HEADING = "待办";

/**
 * Locate a section by its *exact* title, the same way the reader does.
 *
 * 这里原来用 `text.indexOf("## " + heading)`，是子串匹配，于是：
 *   - `## 常被提起（手动维护，上限 8 条）` 被当成 `## 常被提起`，写进去；
 *     而 `sources.js` 用 `extractSection` 精确匹配，读不到——**写得成功、
 *     读不出来，两边都不报错**，正是这个插件反复在修的那种病；
 *   - `## 待办事项` 被当成 `## 待办`，两组待办混在一起；
 *   - `### 待办` 也命中，因为 `"### 待办"` 里确实含有 `"## 待办"` 这个子串。
 *
 * 写入和读取必须用同一把尺子，所以这里直接用 `parseHeadings`。
 */
function sectionBounds(text, heading) {
  const lines = String(text ?? "").split("\n");
  const match = parseHeadings(String(text ?? "")).find((entry) => entry.title === heading);
  if (match === undefined) return undefined;
  return { start: match.start, end: match.end, lines };
}

/** Headings that look like `heading` but are not it — for the error message. */
function nearMisses(text, heading) {
  return parseHeadings(String(text ?? ""))
    .map((entry) => entry.title)
    .filter((title) => title !== heading && title.startsWith(heading));
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
export function rememberNote({ memoryDir, text, title, kind = "anchor", stampText } = {}) {
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
  // 任务带创建日：没有它，「这条挂了多久」永远算不出来，而"挂了多久"才是
  // 待办唯一有用的信息。锚点不需要——它的日期由 `stampUndated` 就地补。
  const stamp = String(stampText ?? "").trim();
  const line =
    kind === "anchor"
      ? `- **${String(title ?? "").trim() || titleOf(body)}** → ${body}`
      : stamp === ""
        ? `- [ ] ${body}`
        : `- [ ] ${stamp} 起 ｜ ${body}`;

  const bounds = sectionBounds(original, heading);
  let next;

  if (bounds === undefined) {
    // A task list may be born; an anchor section may not. `常被提起` is what the
    // injected block reads — inventing a second one here would be the
    // "point at something that does not exist" bug in reverse.
    if (kind === "anchor") {
      const near = nearMisses(original, ANCHOR_HEADING);
      const hint = near.length === 0
        ? ""
        : ` Found ${near.map((t) => `\`## ${t}\``).join("、")} — heading text must match exactly, so the plugin's reader does not see that one.`;
      return {
        ok: false,
        message: `${NOTE_FILE} has no \`## ${ANCHOR_HEADING}\` section — write this into the section the plugin actually reads, or add it first.${hint}`,
      };
    }
    next = `${original.replace(/\s*$/, "")}\n\n## ${TASK_HEADING}\n\n${line}\n`;
  } else {
    const section = bounds.lines.slice(bounds.start, bounds.end).join("\n");
    if (alreadyThere(section, line)) {
      return { ok: false, message: "already there — the same line is in that section" };
    }
    // 追加到节末，但把末尾空行留住，免得每写一条就吃掉一个空行。
    const trimmed = bounds.lines.slice();
    let last = bounds.end - 1;
    while (last > bounds.start && trimmed[last].trim() === "") last -= 1;
    trimmed.splice(last + 1, 0, line);
    next = trimmed.join("\n");
  }

  writeFileSync(file, next, "utf8");
  return { ok: true, message: `added to ${NOTE_FILE} · ${heading}: ${line}` };
}

/** Open tasks, for the block tail. Checked boxes are done and stay as history. */
const OPENED = /^(\d{4}-\d{2}-\d{2})\s*起\s*｜\s*/;

export function openTasks(text) {
  const bounds = sectionBounds(String(text ?? ""), TASK_HEADING);
  if (bounds === undefined) return [];
  const section = bounds.lines.slice(bounds.start, bounds.end).join("\n");
  return section
    .split("\n")
    .filter((row) => /^\s*[-*]\s+\[ \]\s+/.test(row))
    .map((row) => {
      const rest = row.replace(/^\s*[-*]\s+\[ \]\s+/, "").trim();
      const opened = OPENED.exec(rest);
      return {
        text: opened === null ? rest : rest.slice(opened[0].length).trim(),
        opened: opened === null ? undefined : opened[1],
      };
    });
}

/** How many days a task has been open, or `undefined` when it carries no date. */
export function daysOpen(task, todayIso) {
  if (task.opened === undefined || todayIso === undefined) return undefined;
  const from = Date.parse(`${task.opened}T00:00:00Z`);
  const to = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  return Math.floor((to - from) / 86_400_000);
}

/**
 * Tick a task off instead of deleting it.
 *
 * Deleting loses the only evidence that it was ever done, and this whole folder is
 * built on not deleting things that happened. A ticked box is that evidence, and
 * `openTasks` already ignores it — the block tail stops counting it, the file keeps it.
 *
 * Matching is by the task text, exact after trimming: fuzzy matching would let
 * "修白名单" tick off "修白名单和缓存", and silently completing the wrong thing is
 * worse than refusing to complete anything.
 */
export function completeTask({ memoryDir, text, stampText } = {}) {
  const wanted = String(text ?? "").trim();
  if (wanted === "") return { ok: false, message: "which task? the text was empty" };

  const file = join(String(memoryDir ?? ""), NOTE_FILE);
  if (!existsSync(file)) {
    return { ok: false, message: `no ${NOTE_FILE} in that folder` };
  }
  const original = readFileSync(file, "utf8");
  const bounds = sectionBounds(original, TASK_HEADING);
  if (bounds === undefined) {
    return { ok: false, message: `no \`## ${TASK_HEADING}\` section — nothing is open` };
  }

  const rows = bounds.lines.slice();
  const stamp = String(stampText ?? "").trim();
  let hit = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const open = /^\s*[-*]\s+\[ \]\s+/.exec(rows[i]);
    if (open === null) continue;
    const rest = rows[i].slice(open[0].length).trim();
    const dated = OPENED.exec(rest);
    const body = dated === null ? rest : rest.slice(dated[0].length).trim();
    if (body === wanted) {
      hit = i;
      break;
    }
  }
  if (hit < 0) {
    const open = openTasks(original);
    return {
      ok: false,
      message:
        open.length === 0
          ? `nothing open under \`${TASK_HEADING}\``
          : `no open task reads exactly "${wanted}". Open: ${open.map((t) => t.text).join(" ／ ")}`,
    };
  }

  // `- [x] 2026-11-02 起 ｜ 修白名单（2026-11-05 完成）` — 完成日跟在正文后面，
  // 创建日留在原位：两件事都查得到，一行里说清。
  const done = stamp === "" ? "完成" : `${stamp} 完成`;
  rows[hit] = rows[hit].replace("[ ]", "[x]").replace(/\s+$/, "") + `（${done}）`;
  const next = rows.join("\n");
  writeFileSync(file, next, "utf8");
  return { ok: true, message: `done: ${rows[hit].trim().replace(/^[-*]\s+/, "")}` };
}

/**
 * Tasks that have been open so long that the real question is whether they still exist.
 *
 * A task that is never done should not sit there forever: if the block tail names it
 * every session for two months, it becomes background noise and stops being read —
 * which is exactly how a reminder turns into nothing. So past this age the line stops
 * counting and starts asking. Same shape as the `detours.md` staleness line: not a
 * nudge to work harder, a question about whether the thing still earns its place.
 */
export function staleTasks(text, todayIso, days = 30) {
  if (!days || days <= 0) return [];
  return openTasks(text)
    .map((task) => ({ ...task, age: daysOpen(task, todayIso) }))
    .filter((task) => task.age !== undefined && task.age > days)
    .sort((left, right) => right.age - left.age);
}
