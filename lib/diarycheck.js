/**
 * Today's diary, checked but never rewritten.
 *
 * Three things go wrong with a diary that nothing tells you about: a section is written
 * without the `情绪：` line, one day quietly grows to thirty sections, and the summary at
 * the top stops matching the body once work continues after it was written. All three are
 * mechanical to see and expensive to miss — the first breaks the emotion cache loop, the
 * second is why the cap exists at all, and the third is what the reader opens the file for.
 *
 * A fourth one is newer: a section can be complete in every mechanical way and still have
 * lost the thing that makes it evidence — the `岔路：` line saying what the writer believed
 * before being corrected. Conclusions are interchangeable; the wrong path is not. Nothing
 * about a missing line looks wrong, which is exactly the class this file exists for.
 *
 * So this reads one file and reports. It does not merge, shorten, or repair: consolidation
 * would delete the only evidence of "which days recalled this", which is the input to the
 * weight that decides what sinks. The diary costs nothing unless read — it is never
 * injected — so compressing it trades a real loss for no gain.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { entryPath } from "./diary.js";
import { readDayOf } from "./reads.js";

import { RELATIONSHIP_FILE, readVocabulary, sectionOf } from "./emotion.js";

/** `## 09:50 …` — the sections a day is written in. */
const TIME_HEADING = /^## (\d{1,2}):(\d{2})\b/m;
const ANY_SECTION = /^## /gm;
/**
 * `## 今天` and `## 今天（17:40 更新）` — the summary block, which is prose.
 *
 * Anchored to the end of the line on purpose. A prefix test would also swallow `## 今天很累`,
 * a real section that then escapes the tag check silently — the one failure mode a checker
 * must not have. Only the two shapes above are summary.
 */
const SUMMARY = /^## 今天(?:（([^）]*)）)?\s*$/m;
/** The optional closing note. Named, not prefix-matched, for the same reason. */
const CLOSING = /^## 今天(?:没想明白的|长了什么)\s*$/m;
const SUMMARY_STAMP = /(\d{1,2}):(\d{2})/;
/** `岔路：` — the line that keeps the wrong path, not just the conclusion. */
const DETOUR = /^岔路[：:]/m;
/**
 * The rule starts on a date, not retroactively. Backfilling a `岔路：` line means inventing
 * what a past self believed, and a fabricated detour is worse than a missing one.
 */
export const DETOUR_FROM = "2026-11-01";
/** The file the detours end up in. */
export const DETOURS_FILE = "detours.md";

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
 * The last section that is supposed to carry an `情绪：` tag, with its tags in order.
 *
 * The two exemptions are the same ones `checkEntry` makes: the summary at the top and the
 * closing note at the bottom are prose. Scanning stops at the first non-exempt section
 * from the bottom on purpose — if *that* section has no tag, there is no fresh judgement
 * to copy, and reaching further back would present an older emotion as the current one.
 *
 * @param {string} text - One day's entry.
 * @returns {{ heading: string, body: string, tags: string[] } | undefined}
 */
export function lastContentSection(text) {
  const source = String(text ?? "");
  const starts = [...source.matchAll(ANY_SECTION)].map((match) => match.index);
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const start = starts[index];
    const end = starts[index + 1] ?? source.length;
    const eol = source.indexOf("\n", start);
    const heading = source.slice(start, eol < 0 ? source.length : eol);
    if (SUMMARY.test(heading) || CLOSING.test(heading)) continue;
    const body = source.slice(start, end);
    return { heading: heading.replace(/^##\s*/, "").trim(), body, tags: tagsOf(body) };
  }
  return undefined;
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
    if (SUMMARY.test(heading) || CLOSING.test(heading)) continue;
    sections += 1;
    const end = starts[index + 1] ?? source.length;
    if (!source.slice(start, end).includes("情绪：")) untagged += 1;
  }
  const sectionsWithoutDetour = (source.match(/^## \d{1,2}:\d{2}/gm) ?? [])
    .filter((heading) => {
      const start = source.indexOf(heading);
      const next = source.slice(start + heading.length).search(/^## /m);
      const body = next < 0 ? source.slice(start) : source.slice(start, start + heading.length + next);
      return !DETOUR.test(body);
    }).length;
  const summary = summaryState(source);
  const latest = lastSectionMinute(source);
  const staleBy =
    summary.present && summary.minute !== undefined && latest !== undefined && latest > summary.minute
      ? latest - summary.minute
      : undefined;
  return { sections, untagged, sectionsWithoutDetour, tags: tagsOf(source), summary, staleBy, cap };
}

function readFileSyncOrEmpty(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}


/**
 * Is the file of wrong turns still alive?
 *
 * The plan was "write into it by hand for two weeks, then decide whether it earns an
 * automatic reminder". Nothing was ever going to make us check back in two weeks: a
 * session-bound reminder dies when the session stops, and "remember to look" is the exact
 * shape of rule that this project exists to stop relying on.
 *
 * So the file reports on itself, and the sentence it produces is not a nag: it points at
 * deletion. If nothing has been worth adding, keeping a file that only says it once
 * existed is the worse outcome — which is the experiment result either way.
 */

/**
 * Has the file of wrong turns outgrown what it is for?
 *
 * This is the question the file was designed around. Its older companion asked
 * whether the file had gone untouched: that made sense when it was a log of
 * incidents — silence meant you had stopped writing. Now that it holds the *shapes*
 * of recurring mistakes, silence means something else entirely: no new kind of
 * mistake. **A stable file is the good outcome, not a stale one.** So that check is
 * gone and this one stays — a list of shapes stays small, a list of incidents grows
 * without bound.
 *
 * Measured on the first real file: eleven entries in three days, 2591 characters —
 * eight to ten times the monthly budget it was designed for, and a second diary.
 */
export function detourSizeLine({ memoryDir, limit = 3000 }) {
  if (!(limit > 0)) return undefined;
  const file = join(memoryDir, DETOURS_FILE);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  if (text.length <= limit) return undefined;
  const shapes = (text.match(/^## /gm) ?? []).length;
  return `${DETOURS_FILE} is ${text.length} characters across ${shapes} shape${shapes === 1 ? "" : "s"} — past the ${limit} it was designed to stay under. At this size it records incidents instead of shapes, which makes it a second diary.`;
}

/** `HH:mm` for minutes past midnight. */
export function clockOf(minutes) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Yesterday's entry, asked the one question that can no longer be asked of it today.
 *
 * 2026-11-17 漏的那一次：日记写完、摘要没写，18:31 块尾明明报了「no `## 今天` summary
 * at the top」，人没动；过了零点，`diaryIssueLine` 只读「今天」那个文件，昨天那篇就
 * 永久没人检查了。**一个只在当天有效、而且只在会话还活着时有效的提醒，等于把「会不会
 * 漏」交给了作息。**
 *
 * 所以这里补一件事：**昨天有正文、却没有 `## 今天` 摘要**，今天说一句。晚一天补也
 * 比永远没有好——摘要的价值就是「打开文件第一眼看到的那段」。
 *
 * 只问这一个问题，不重跑整套检查：昨天缺 `岔路：`、节数超了，那些都已经是既成事实，
 * 今天报出来也改不了；**摘要能补，所以值得说。**
 *
 * @param {{ memoryDir: string, day: string, enabled?: boolean }} input
 * @returns {string|undefined}
 */
export function yesterdaySummaryLine({ memoryDir, day, enabled = true }) {
  if (!enabled) return undefined;
  const stamp = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ""));
  if (stamp === null) return undefined;
  const previous = new Date(Number(stamp[1]), Number(stamp[2]) - 1, Number(stamp[3]));
  previous.setDate(previous.getDate() - 1);
  const name = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
  let text;
  try {
    text = readFileSync(entryPath(memoryDir, name), "utf8");
  } catch {
    return undefined;
  }
  const state = checkEntry({ text });
  // 只有标题、没有正文的日子不算：那天本来就没发生什么，不该被要求一段摘要。
  if (state.sections === 0) return undefined;
  if (state.summary.present) return undefined;
  return `- ${name} still has no \`## 今天\` summary at the top — yesterday's reminder only lives while the session does, so this is the one chance to fix it.`;
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
  const file = entryPath(memoryDir, day);
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
    // 「没有这一节」和「这一节还是空的」要分开说：后者是第一天，前者是走错了地方。
    // 说成前一种，新用户会去改标题，而他要做的其实只是先写下第一个词。
    const hasSection =
      existsSync(relationshipFile) &&
      sectionOf(readFileSyncOrEmpty(relationshipFile), "情绪词表") !== undefined;
    problems.push(
      hasSection
        ? `tags used, but \`情绪词表\` is still empty — write the words you actually use, or the cache can never match a day`
        : `tags used, but ${RELATIONSHIP_FILE} has no \`情绪词表\` section — those days cannot be found by emotion`,
    );
  } else if (vocabulary.length > 0) {
    const strays = strayTags(state.tags, vocabulary);
    if (strays.length > 0) problems.push(`${strays.join(", ")} not in the vocabulary`);
  }
  if (cap > 0 && state.sections > cap) problems.push(`${state.sections} sections, over the ${cap}-per-day bar`);
  if (state.untagged > 0) problems.push(`${state.untagged} without an \`情绪：\` line`);
  if (day >= DETOUR_FROM && state.sectionsWithoutDetour > 0) {
    problems.push(
      `${state.sectionsWithoutDetour} without a \`岔路：\` line — the conclusion is kept, the road that got there is not`,
    );
  }
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

/**
 * 岔路文件的「只写不读」那一行（2026-11-13）。
 *
 * 由来：主人问「只写不读的文件感觉没啥意义，特别是对小白用户」。`detours.md` 正是这种：
 * 插件只在它超过 3000 字时提醒一句，**平时它的正文一个字都不会回到眼前**——
 * 而新用户根本不知道有这个文件，更不会自己去指定路径读它。
 *
 * 这一行不搬正文（那是把事故塞进每轮上下文），只报一件事：
 * **它里面有东西，而你今天还没打开过它。** 打开过就不说——`fs/observed` 会记账。
 *
 * @param {{memoryDir: string, storageDir: string, day: string, readDay?: string}} input
 * @returns {string|undefined}
 */
export function detourUnreadLine({ memoryDir, storageDir, day, readDay }) {
  const file = join(memoryDir, DETOURS_FILE);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  // 只有标题和注释的文件不算「有东西」：新装的骨架就是那样，不该第一天就报。
  // 注释块要先整段去掉：模板里的说明是多行 `<!-- ... -->`，逐行过滤只能滤掉第一行，
  // 于是「新装的文件」被算成有 293 字符内容，第一天就报一次（实测踩到）。
  const body = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("#") && !trimmed.startsWith(">");
    })
    .join("")
    .trim();
  if (body === "") return undefined;
  const seen = readDay ?? readDayOf(storageDir, DETOURS_FILE);
  if (seen === day) return undefined;
  return `· 岔路：${body.length} 字符，今天还没打开过——插件不读它的正文，写日记时翻一眼，同类的第几次要落在日记里。`;
}
