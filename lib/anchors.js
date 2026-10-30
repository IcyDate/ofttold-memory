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
export function scoreAnchors({ text, diaries, nowDay }) {
  const anchors = parseAnchors(text);
  const scored = anchors.map((anchor) => {
    const date = anchor.date === undefined ? undefined : isoOf(anchor.date);
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

/**
 * Stamp the day a line entered the list, for lines with no date of their own.
 *
 * A line pointing at `relationship.md` has no event date: nothing happened on a day, it is
 * a fact about who the assistant is. Undated it behaved as permanent, which let it squat on
 * a slot forever. A sidecar file fixes the accounting and creates a second copy of one
 * fact — the drift this folder keeps getting bitten by — so the date goes **into the line**,
 * where a diary anchor already keeps its own:
 *
 *     - **label** → `relationship.md`｜why   →   - **label** → `2026-10-30` 起｜`relationship.md`｜why
 *
 * The stamp reads "counting starts here", which is honest: for lines written before this
 * existed the real date is unknowable, and today is the first day anyone can vouch for.
 */
export function stampUndated(text, todayIso) {
  const stamped = [];
  const lines = String(text ?? "").split("\n").map((line) => {
    const match = ANCHOR.exec(line);
    if (match === null || dayOf(line) !== undefined) return line;
    stamped.push(match[1].trim());
    const note = `\`${todayIso}\` 起`;
    if (line.includes("→")) return line.replace(/→\s*/, `→ ${note}｜`);
    return `${line.replace(/\s+$/, "")} → ${note}`;
  });
  return { text: lines.join("\n"), stamped };
}
