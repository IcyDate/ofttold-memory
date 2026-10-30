/**
 * The one line that turns "I should write today's diary" into something the model
 * cannot fail to notice.
 *
 * Every other part of the writing side is a judgement the model has to remember to
 * make. This is the cheapest possible exception: one `existsSync` at injection time,
 * and the block ends by saying the day is unwritten. It costs a filesystem call and
 * removes the remembering.
 *
 * Deliberately not configurable. The signal for "I do not want a diary" is a folder
 * without `diary/` in it — the plugin is already looking at the folder, so the layout
 * itself can answer the question. A toggle would just be a way to drift back to
 * silence on the days it mattered.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Same name `scaffold.js` creates, repeated here rather than imported: the two
 *  halves must agree on the layout, and a shared constant would hide that. */
export const DIARY_DIR = "diary";

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
export function pendingDiaryNudge(memoryDir, now = new Date()) {
  if (typeof memoryDir !== "string" || memoryDir === "") return undefined;
  const diaryDir = join(memoryDir, DIARY_DIR);
  if (!existsSync(diaryDir)) return undefined;

  const day = localDay(now);
  if (existsSync(join(diaryDir, `${day}.md`))) return undefined;

  return (
    `No entry for today yet — \`${DIARY_DIR}/${day}.md\` does not exist. ` +
    "Writing it is the `ofttold-ritual` skill; the folder is meant to grow daily, and a " +
    "skipped day is a visible gap rather than a quiet one."
  );
}
