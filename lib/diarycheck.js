/**
 * Today's diary, checked but never rewritten.
 *
 * Three things go wrong with a diary that nothing tells you about: a section is written
 * without the `情绪：` line, one day quietly grows to thirty sections, and the summary at
 * the top stops matching the body once work continues after it was written. All three are
 * mechanical to see and expensive to miss — the first breaks the emotion cache loop, the
 * second is why the cap exists at all, and the third is what the reader opens the file for.
 *
 * So this reads one file and reports. It does not merge, shorten, or repair: consolidation
 * would delete the only evidence of "which days recalled this", which is the input to the
 * weight that decides what sinks. The diary costs nothing unless read — it is never
 * injected — so compressing it trades a real loss for no gain.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { RELATIONSHIP_FILE, readVocabulary } from "./emotion.js";

/** `## 09:50 …` — the sections a day is written in. */
const TIME_HEADING = /^## (\d{1,2}):(\d{2})\b/m;
const ANY_SECTION = /^## /gm;
/** `## 今天` and `## 今天（17:40 更新）`, but not `## 今天长了什么`. */
const SUMMARY = /^## 今天(?!长了什么)(.*)$/m;
const SUMMARY_STAMP = /(\d{1,2}):(\d{2})/;

/** Minutes past midnight for `"17:30"`, or `undefined` when unparseable. */
export function minutesOf(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (match === null) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/** The latest `## HH:mm` heading in the file, as minutes past midnight. */
export function lastSectionMinute(text) {
  let latest;
  for (const match of String(text ?? "").matchAll(/^## (\d{1,2}):(\d{2})\b/gm)) {
    const minute = Number(match[1]) * 60 + Number(match[2]);
    if (latest === undefined || minute > latest) latest = minute;
  }
  return latest;
}

/** How many sections a `## 今天` block covers, and the time it claims. */
export function summaryState(text) {
  const source = String(text ?? "");
  const match = SUMMARY.exec(source);
  if (match === null) return { present: false };
  const stamp = SUMMARY_STAMP.exec(match[1] ?? "");
  const start = match.index;
  const rest = source.slice(start + match[0].length);
  const next = rest.search(/^## /m);
  const body = next < 0 ? rest : rest.slice(0, next);
  return {
    present: true,
    minute: stamp === null ? undefined : Number(stamp[1]) * 60 + Number(stamp[2]),
    body: body.trim(),
  };
}

/** Every `情绪：<word>` tag in the file, in order. */
export function tagsOf(text) {
  return [...String(text ?? "").matchAll(/^情绪：\s*(\S+)/gm)].map((match) => match[1]);
}

/**
 * Tags that are not in the vocabulary.
 *
 * This is the structural half of the rule, and the reason it cannot be left to taste:
 * the live value can only ever be a vocabulary word, so a tag outside the vocabulary
 * can never be matched by it. The section still reads fine — it just stops being
 * reachable through the emotion path, quietly, which is the failure mode this plugin
 * exists to remove.
 */
export function strayTags(tags, vocabulary) {
  const known = new Set(vocabulary);
  return [...new Set(tags.filter((tag) => !known.has(tag)))];
}

/**
 * Check one day's entry.
 *
 * Only today is checked. Older entries are history: their missing tags cannot be repaired
 * without rewriting what a person actually wrote, and a permanent report about them would
 * train the reader to ignore the report.
 *
 * @param {{ text: string, cap?: number }} input
 * @returns {{ sections: number, untagged: number, summary: ReturnType<typeof summaryState>,
 *   staleBy?: number }} `staleBy` is minutes the body runs past the summary.
 */
export function checkEntry({ text, cap = 8 }) {
  const source = String(text ?? "");
  const starts = [...source.matchAll(ANY_SECTION)].map((match) => match.index);
  let untagged = 0;
  let sections = 0;
  for (const [index, start] of starts.entries()) {
    const heading = source.slice(start, source.indexOf("\n", start) + 1 || undefined);
    // The summary block and its lesson list are prose, not sections that need a tag;
    // counting them would make the check fire on every well-formed day.
    if (/^## 今天/.test(heading)) continue;
    sections += 1;
    const end = starts[index + 1] ?? source.length;
    if (!source.slice(start, end).includes("情绪：")) untagged += 1;
  }
  const summary = summaryState(source);
  const latest = lastSectionMinute(source);
  const staleBy =
    summary.present && summary.minute !== undefined && latest !== undefined && latest > summary.minute
      ? latest - summary.minute
      : undefined;
  return { sections, untagged, tags: tagsOf(source), summary, staleBy, cap };
}

/** `HH:mm` for minutes past midnight. */
export function clockOf(minutes) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Read today's file and turn the check into one line for the block.
 *
 * @param {{ memoryDir: string, day: string, nowMinute: number, summaryFrom?: number,
 *   cap?: number, enabled?: boolean }} input
 * @returns {string | undefined} A sentence, or nothing when the day looks fine.
 */
export function diaryIssueLine({ memoryDir, day, nowMinute, summaryFrom, cap = 8, enabled = true }) {
  if (!enabled) return undefined;
  const file = join(memoryDir, "diary", `${day}.md`);
  if (!existsSync(file)) return undefined;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const state = checkEntry({ text, cap });
  const problems = [];
  const relationshipFile = join(memoryDir, RELATIONSHIP_FILE);
  let vocabulary = [];
  if (existsSync(relationshipFile)) {
    try {
      vocabulary = readVocabulary(readFileSync(relationshipFile, "utf8"));
    } catch {
      vocabulary = [];
    }
  }
  if (vocabulary.length === 0 && state.tags.length > 0) {
    problems.push(`tags used, but ${RELATIONSHIP_FILE} has no \`情绪词表\` section — those days cannot be found by emotion`);
  } else if (vocabulary.length > 0) {
    const strays = strayTags(state.tags, vocabulary);
    if (strays.length > 0) problems.push(`${strays.join(", ")} not in the vocabulary`);
  }
  if (state.sections > cap) problems.push(`${state.sections} sections, over the ${cap}-per-day bar`);
  if (state.untagged > 0) problems.push(`${state.untagged} without an \`情绪：\` line`);
  if (state.summary.present === false) {
    if (summaryFrom !== undefined && nowMinute >= summaryFrom) problems.push("no `## 今天` summary at the top");
  } else if (state.staleBy !== undefined) {
    problems.push(`summary stopped at ${clockOf(state.summary.minute)}, body runs to ${clockOf(state.summary.minute + state.staleBy)}`);
  } else if (state.summary.body === "") {
    problems.push("the `## 今天` summary is empty");
  }
  if (problems.length === 0) return undefined;
  // 明确标成「检查」，与块尾那行状态区分开：一个在报事实，一个在报问题。
  return `Diary check — ${problems.join("; ")}.`;
}
