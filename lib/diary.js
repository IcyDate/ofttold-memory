/**
 * The one line that turns "I should write today's diary" into something the model
 * cannot fail to notice.
 *
 * Every other part of the writing side is a judgement the model has to remember to
 * make. This is the cheapest possible exception: one `existsSync` at injection time,
 * and the block ends by saying the day is unwritten. It costs a filesystem call and
 * removes the remembering.
 *
 * Two things decide whether it speaks: the folder (no `diary/`, nothing to say) and the
 * cadence. Cadence is a setting because "how often" is not a layout question — a weekly
 * writer and a daily writer keep the same folder, and without the knob the weekly one is
 * nagged six days out of seven. The folder still answers "do I keep a diary at all",
 * which is the one question the layout can answer honestly.
 *
 * `off` is offered for the same reason: turning the ritual off is a decision, and a
 * decision should be expressible without deleting a directory that holds history.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Same name `scaffold.js` creates, repeated here rather than imported: the two
 *  halves must agree on the layout, and a shared constant would hide that. */
export const DIARY_DIR = "diary";

/** How often the folder is expected to grow. */
export const DIARY_CADENCES = ["daily", "weekly", "off"];
/** Days that count as "recently written" when the cadence is weekly. */
const WEEK = 7;

/**
 * The local calendar day, not the UTC one.
 *
 * `toISOString().slice(0, 10)` is the obvious spelling and it is wrong east of
 * Greenwich: at 03:00 in Shanghai it still names yesterday, so the nudge would
 * point at a file the user has already written and stay quiet on the day they
 * have not.
 *
 * @param {Date} [now]
 * @returns {string} `YYYY-MM-DD`
 */
export function localDay(now = new Date()) {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * @param {string} memoryDir
 * @param {Date} [now]
 * @returns {string|undefined} the line to append, or undefined when there is nothing
 *   to say: no diary folder (this is not a ritual-shaped folder), or today is written.
 */
export function pendingDiaryNudge(memoryDir, now = new Date(), cadence = "daily") {
  if (typeof memoryDir !== "string" || memoryDir === "") return undefined;
  if (cadence === "off") return undefined;
  const diaryDir = join(memoryDir, DIARY_DIR);
  if (!existsSync(diaryDir)) return undefined;

  const day = localDay(now);
  const written = existsSync(join(diaryDir, `${day}.md`));
  if (cadence === "weekly") {
    // Weekly means "something recent", not "seven days from the last one": a fixed
    // interval would nag on the wrong day after any skip.
    const recent = latestEntryDay(memoryDir, now, WEEK);
    if (recent !== undefined) return undefined;
    return (
      `No entry in the last ${WEEK} days — \`${DIARY_DIR}/\` has nothing since ` +
      `${recent ?? "the folder was set up"}. Writing it is the \`ofttold-ritual\` skill; ` +
      "the folder is meant to grow, and a skipped week is a visible gap rather than a quiet one."
    );
  }
  if (written) return undefined;
  return (
    `No entry for today yet — \`${DIARY_DIR}/${day}.md\` does not exist. ` +
    "Writing it is the `ofttold-ritual` skill; the folder is meant to grow daily, and a " +
    "skipped day is a visible gap rather than a quiet one."
  );
}

/**
 * The most recent `YYYY-MM-DD.md` in `diary/` within `days` of `now`, or undefined.
 *
 * @param {string} memoryDir
 * @param {Date} now
 * @param {number} days
 * @returns {string|undefined}
 */
export function latestEntryDay(memoryDir, now = new Date(), days = WEEK) {
  const diaryDir = join(memoryDir, DIARY_DIR);
  if (!existsSync(diaryDir)) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best;
  let entries = [];
  try {
    entries = readdirSync(diaryDir);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const match = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(entry);
    if (match === null) continue;
    const when = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const age = Math.round((today - when) / 86400000);
    if (age < 0 || age > days) continue;
    if (best === undefined || age < best.age) best = { age, day: entry.slice(0, 10) };
  }
  return best === undefined ? undefined : best.day;
}
