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
import { DEFAULT_MEMORY_FILE, existingName } from "./sources.js";
import { parseHeadings } from "./sections.js";

export const NOTE_FILE = DEFAULT_MEMORY_FILE;

/** The memory file that is actually there — new name preferred, old name honoured. */
function noteFileIn(memoryDir) {
  return join(String(memoryDir ?? ""), existingName(NOTE_FILE, String(memoryDir ?? "")));
}
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
export function rememberNote({ memoryDir, text, title, kind = "anchor", stampText, due } = {}) {
  const body = String(text ?? "").trim();
  if (body === "") return { ok: false, message: "nothing to write — the text was empty" };
  if (kind !== "anchor" && kind !== "task") {
    return { ok: false, message: `unknown kind "${kind}" — use "anchor" or "task"` };
  }

  const file = noteFileIn(memoryDir);
  if (!existsSync(file)) {
    return { ok: false, message: `no ${NOTE_FILE} in that folder — run the plugin once to scaffold it` };
  }
  const original = readFileSync(file, "utf8");
  const heading = kind === "anchor" ? ANCHOR_HEADING : TASK_HEADING;
  // 任务带创建日：没有它，「这条挂了多久」永远算不出来，而"挂了多久"才是
  // 待办唯一有用的信息。锚点不需要——它的日期由 `stampUndated` 就地补。
  const stamp = String(stampText ?? "").trim();
  // 到期日是可选的一段，插在创建日后面：`- [ ] 2026-11-03 起 ｜ 2026-11-05 到期 ｜ …`。
  // 没有它，一条待办永远只会「变老」，说不出「今天」。
  const dueText = String(due ?? "").trim();
  const dueIsDate = /^\d{4}-\d{2}-\d{2}$/.test(dueText);
  if (kind === "task" && dueText !== "" && !dueIsDate) {
    return { ok: false, message: `due must be YYYY-MM-DD, got "${dueText}"` };
  }
  const when = [stamp === "" ? "" : `${stamp} 起`, dueIsDate ? `${dueText} 到期` : ""]
    .filter((part) => part !== "")
    .join(" ｜ ");
  const line =
    kind === "anchor"
      ? `- **${String(title ?? "").trim() || titleOf(body)}** → ${body}`
      : when === ""
        ? `- [ ] ${body}`
        : `- [ ] ${when} ｜ ${body}`;

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

/**
 * Open tasks, for the block tail. Checked boxes are done and stay as history.
 *
 * A task carries two dates at most: when it was opened, and optionally when it is due.
 * `起` answers "how long has this been waiting"; `到期` answers "is it time yet". The
 * first was the only one for a while, and that made a task age but never come due —
 * the tail could say "open 9 days" and nothing could ever say "today".
 */
const OPENED = /^(\d{4}-\d{2}-\d{2})\s*起\s*｜\s*/;
const DUE = /^(\d{4}-\d{2}-\d{2})\s*到期\s*｜\s*/;

/** The body of a task line after any date prefix has been peeled off. */
export function bodyOf(row) {
  const open = /^\s*[-*]\s+\[[ xX]\]\s+/.exec(row);
  let rest = open === null ? row.trim() : row.slice(open[0].length).trim();
  const opened = OPENED.exec(rest);
  if (opened !== null) rest = rest.slice(opened[0].length).trim();
  const due = DUE.exec(rest);
  if (due !== null) rest = rest.slice(due[0].length).trim();
  return rest;
}

export function openTasks(text) {
  const bounds = sectionBounds(String(text ?? ""), TASK_HEADING);
  if (bounds === undefined) return [];
  const section = bounds.lines.slice(bounds.start, bounds.end).join("\n");
  return section
    .split("\n")
    .filter((row) => /^\s*[-*]\s+\[ \]\s+/.test(row))
    .map((row) => {
      let rest = row.replace(/^\s*[-*]\s+\[ \]\s+/, "").trim();
      const opened = OPENED.exec(rest);
      if (opened !== null) rest = rest.slice(opened[0].length).trim();
      const due = DUE.exec(rest);
      if (due !== null) rest = rest.slice(due[0].length).trim();
      return {
        text: rest,
        opened: opened === null ? undefined : opened[1],
        due: due === null ? undefined : due[1],
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
  const raw = String(text ?? "").trim();
  if (raw === "") return { ok: false, message: "which task? the text was empty" };
  // 允许把文件里那一行原样贴进来：`- [ ] 2026-11-02 起 ｜ 修白名单` 和 `修白名单`
  // 指同一个任务。**这不是模糊匹配**——前缀是读取端自己认得的那一段，去掉它不是猜，
  // 是同一把尺子。（实测：模型很容易把整行传进来，然后被判「没有这条任务」。）
  const wanted = bodyOf(raw);

  const file = noteFileIn(memoryDir);
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
    if (!/^\s*[-*]\s+\[ \]\s+/.test(rows[i])) continue;
    if (bodyOf(rows[i]) === wanted) {
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

/** Whole days from `todayIso` until a task's due date. Negative means overdue. */
export function daysUntilDue(task, todayIso) {
  if (task.due === undefined || todayIso === undefined) return undefined;
  const to = Date.parse(`${task.due}T00:00:00Z`);
  const now = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(to) || !Number.isFinite(now)) return undefined;
  return Math.floor((to - now) / 86_400_000);
}

/**
 * Open tasks that are due today or already late, earliest first.
 *
 * This is the half the first version was missing: `起` lets a task grow old, and
 * nothing ever made it arrive. A task without a due date still behaves exactly as it
 * did before — it only ever ages.
 */
export function dueTasks(text, todayIso) {
  return openTasks(text)
    .map((task) => ({ ...task, inDays: daysUntilDue(task, todayIso) }))
    .filter((task) => task.inDays !== undefined && task.inDays <= 0)
    .sort((left, right) => left.inDays - right.inDays);
}

/**
 * The one line the block tail says about tasks, or `undefined` when it has nothing to add.
 *
 * Order of what it says, loudest first: something is due or late → say which, by name;
 * otherwise something has been open long enough to question → ask whether it still
 * belongs; otherwise just the count and the age of the oldest.
 */
export function taskStatusLine({ text, todayIso, staleDays = 30 } = {}) {
  const open = openTasks(text);
  if (open.length === 0) return undefined;

  const due = dueTasks(text, todayIso);
  if (due.length > 0) {
    const named = due
      .slice(0, 3)
      .map((task) => {
        const when = task.inDays === 0 ? "今天到期" : `逾期 ${-task.inDays} 天`;
        return `${titleOf(task.text)}（${when}）`;
      })
      .join("、");
    const more = due.length > 3 ? ` 等 ${due.length} 条` : "";
    return `- ${due.length} task${due.length === 1 ? "" : "s"} due now: ${named}${more}`;
  }

  const head = `- ${open.length} open task${open.length === 1 ? "" : "s"} in \`${NOTE_FILE}\` under \`${TASK_HEADING}\``;
  const stale = staleTasks(text, todayIso, staleDays);
  if (stale.length > 0) {
    const named = stale.slice(0, 3).map((task) => `${task.text}（${task.age} 天）`).join("、");
    const more = stale.length > 3 ? ` 等 ${stale.length} 条` : "";
    return `${head}. ${stale.length} of them may not be worth keeping: ${named}${more} — 还要不要，你说一句，我勾掉或删掉`;
  }
  const ages = open.map((task) => daysOpen(task, todayIso)).filter((n) => n !== undefined);
  const oldest = ages.length === 0 ? undefined : Math.max(...ages);
  return oldest === undefined || oldest <= 0 ? head : `${head}, the oldest open ${oldest} day${oldest === 1 ? "" : "s"}`;
}
