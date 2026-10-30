/**
 * The forgetting half of the mechanism: score the standing list so the ones that
 * stopped being recalled leave the *view*, not the record.
 *
 * The list is the assistant's own memory, not the user's setting, so the decision
 * "what do I still need" has to be made by the mechanism and the assistant — never
 * by asking a person to pick. What a person cannot do is arithmetic over a year of
 * diary files, and that is exactly the part a model does badly too: it is slow, it
 * is unrepeatable, and two runs of "how many days recalled this" give two answers.
 *
 * So: counting, decay and ordering are code. Whether a mention counts, and whether
 * the list is right at all, stay with the assistant that writes the file.
 *
 * `R = exp(-t / S)` with `S = 1 * 2^n` — see `docs/design.md`. `t` is days since the
 * entry is dated, `n` is how many distinct days reached for it. A recall doubles the
 * interval, so an old entry everyone keeps touching outlives a fresh one nobody does.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where the "when did this line first appear" memory lives, inside the folder. */
const STATE_DIR = ".ofttold";
const STATE_FILE = "anchors.json";

/** A dated diary file, which is what a recall is measured against. */
const DIARY = /^\d{4}-\d{2}-\d{2}\.md$/;

/** `- **title** → date ...` — the shape the skeleton writes and the plugin reads. */
const ANCHOR = /^\s*[-*]\s+\*\*(.+?)\*\*/;
const DATE = /(\d{4}-\d{2}-\d{2})/;

/** Day number for a `YYYY-MM-DD`, or `undefined` for anything else. */
export function dayOf(text) {
  const match = DATE.exec(String(text ?? ""));
  if (match === null) return undefined;
  const parsed = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : undefined;
}

/** Today as a day number, in UTC — the whole file works in whole days. */
export function today(now = new Date()) {
  return Math.floor(Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) / 86_400_000);
}

/**
 * Pull the anchor lines out of one section body.
 *
 * Only bullet lines whose title is bold are anchors: the skeleton documents the cap
 * in a blockquote and writes the format in a comment, and neither of those is an
 * entry. Returning `line` unchanged is deliberate — the caller may need to rewrite
 * the section without touching a single byte of someone's wording.
 */
export function parseAnchors(text) {
  const anchors = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = ANCHOR.exec(line);
    if (match === null) continue;
    anchors.push({
      title: match[1].trim(),
      date: dayOf(line),
      line,
    });
  }
  return anchors;
}

/**
 * When each title was first seen in the folder.
 *
 * A dated line carries its own date. A line pointing at something that is not a diary
 * entry — `relationship.md`, a folder, a name — has no date of its own, and pretending
 * it is permanent would let it squat on a slot forever. Its date is **the day the line
 * first appeared**, which only a file like this can remember: the folder's own mtime
 * changes on every edit, and git is not guaranteed to be there.
 *
 * Missing or corrupt state is not an error. It costs one migration and then the list
 * scores itself again.
 *
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {Record<string, string>} Title → `YYYY-MM-DD` first seen.
 */
export function readFirstSeen(memoryDir) {
  try {
    const file = join(memoryDir, STATE_DIR, STATE_FILE);
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const first = parsed?.firstSeen;
    return first !== null && typeof first === "object" && !Array.isArray(first) ? first : {};
  } catch {
    return {};
  }
}

/**
 * Record first-seen dates for titles that are new, and drop titles no longer present.
 *
 * Dropping matters: a title that leaves the list and comes back later is a new
 * appearance, not a resurrection, and keeping the old date would make it look older
 * than it is.
 *
 * @returns {Record<string, string>} The state after the merge.
 */
export function rememberFirstSeen(memoryDir, titles, todayIso) {
  const previous = readFirstSeen(memoryDir);
  const next = {};
  for (const title of titles) {
    next[title] = previous[title] ?? todayIso;
  }
  if (JSON.stringify(next) === JSON.stringify(previous)) return next;
  try {
    mkdirSync(join(memoryDir, STATE_DIR), { recursive: true });
    writeFileSync(join(memoryDir, STATE_DIR, STATE_FILE), `${JSON.stringify({ version: 1, firstSeen: next }, null, 2)}\n`);
  } catch {
    // A read-only folder must not fail a session; the next run tries again.
  }
  return next;
}

/**
 * How many distinct days reached for this anchor.
 *
 * The unit is the day, because "that day was recalled" is one fact however many turns
 * of it reached back. An anchor without a date of its own is counted by its headline —
 * the part before the first `·` — which is the only searchable thing it has.
 */
export function countRecalls(anchor, diaries) {
  // A dated anchor is recalled when a later day writes that date. A dateless one has
  // no date to look for, so its headline stands in — the text before the first `·`,
  // which is the part a diary would repeat.
  const probe = anchor.date === undefined ? anchor.title.split("·")[0].trim() : anchor.dayString;
  if (typeof probe !== "string" || probe === "") return 0;
  let days = 0;
  for (const [day, body] of Object.entries(diaries)) {
    if (!String(body).includes(probe)) continue;
    // The entry that introduced the fact is its birth, not a recall of itself.
    if (anchor.date !== undefined && day === anchor.dayString) continue;
    days += 1;
  }
  return days;
}

/**
 * Score every anchor and order them by how much they still earn their slot.
 *
 * @param {{ text: string, memoryDir: string, diaries: Record<string,string>,
 *   todayIso: string, nowDay: number }} input
 * @returns {{ anchors: Array<{title:string, date?:string, R:number, recalls:number,
 *   age:number, line:string}>, dated: boolean }}
 */
export function scoreAnchors({ text, memoryDir, diaries, todayIso, nowDay }) {
  const anchors = parseAnchors(text);
  const firstSeen = rememberFirstSeen(
    memoryDir,
    anchors.map((anchor) => anchor.title),
    todayIso,
  );
  const scored = anchors.map((anchor) => {
    const own = anchor.date === undefined ? undefined : isoOf(anchor.date);
    const date = own ?? firstSeen[anchor.title];
    const stamped = { ...anchor, dayString: date };
    const day = date === undefined ? undefined : dayOf(date);
    const age = day === undefined ? 0 : Math.max(0, nowDay - day);
    const recalls = countRecalls(stamped, diaries);
    const stability = 2 ** recalls;
    return {
      title: anchor.title,
      date,
      age,
      recalls,
      R: Math.exp(-age / stability),
      line: anchor.line,
    };
  });
  return { anchors: scored.sort((left, right) => right.R - left.R || left.age - right.age) };
}

/** `YYYY-MM-DD` for a day number. */
export function isoOf(day) {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Diary entries as `{ "YYYY-MM-DD": text }`, for counting recalls. */
export function readDiaries(memoryDir, limit = 4000) {
  const dir = join(memoryDir, "diary");
  if (!existsSync(dir)) return {};
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => DIARY.test(name)).sort();
  } catch {
    return {};
  }
  // Oldest first so a `limit` keeps the recent ones, which are the ones that can
  // still recall something.
  const kept = names.slice(Math.max(0, names.length - limit));
  const entries = {};
  for (const name of kept) {
    try {
      entries[name.slice(0, 10)] = readFileSync(join(dir, name), "utf8");
    } catch {
      // An unreadable day is not a recall; skip it.
    }
  }
  return entries;
}
