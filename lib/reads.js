/**
 * Which day a memory file was last opened through the harness file tools.
 *
 * The gap this fills: `relationship.md` never enters the injected block — it is read
 * on purpose or not at all — and "read it at the start of every session" is a rule the
 * model has to remember, which is the same failure this plugin exists to remove. A
 * block-tail line is a cheaper trigger than a rule, but only if it can tell the
 * difference between "already open" and "still closed".
 *
 * What it can see: `fs/observed`, which the harness file tools emit on every read.
 * What it cannot see: a file read through a shell (`cat`, `grep`) leaves no event, so a
 * day that opened the file only that way still reads as closed here. That is the honest
 * limit of the signal, and it errs toward asking again rather than assuming.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where the per-file "last opened on" record lives, under the storage root. */
export const READS_DIR = "ofttold-memory";
export const READS_FILE = "reads.json";

function readsPath(storageDir) {
  return join(storageDir, READS_DIR, READS_FILE);
}

function readAll(storageDir) {
  const file = readsPath(storageDir);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The day a file was last opened, or `undefined` when it never was.
 *
 * @param {string} storageDir - Storage root (`DSH_HOME` or `~/.dsh`).
 * @param {string} key - File name the record is kept under.
 * @returns {string|undefined} `YYYY-MM-DD`.
 */
export function readDayOf(storageDir, key) {
  const day = readAll(storageDir)[key];
  return typeof day === "string" ? day : undefined;
}

/**
 * Record that a file was opened today. Writes only when the day actually changes,
 * because this runs on every file read in the session.
 *
 * @param {string} storageDir - Storage root.
 * @param {string} key - File name the record is kept under.
 * @param {string} day - Local calendar day, `YYYY-MM-DD`.
 * @returns {boolean} Whether anything was written.
 */
export function recordReadAt(storageDir, key, day) {
  if (readDayOf(storageDir, key) === day) return false;
  try {
    const dir = join(storageDir, READS_DIR);
    mkdirSync(dir, { recursive: true });
    const all = readAll(storageDir);
    all[key] = day;
    writeFileSync(readsPath(storageDir), `${JSON.stringify(all, null, 2)}\n`, "utf8");
    return true;
  } catch {
    // A storage root we cannot write is not a reason to fail a read. The cost of
    // silence here is one extra reminder, not a wrong answer.
    return false;
  }
}

/**
 * The tail line for a file that has not been opened today, or `undefined`.
 *
 * Deliberately a status, not an instruction: the same rule as the diary line — a tail
 * that also tells you what to do makes every line in it skippable.
 *
 * @param {{storageDir: string, key: string, day: string, note?: string}} options
 * @returns {string|undefined}
 */
export function unreadLine({ storageDir, key, day, note } = {}) {
  if (readDayOf(storageDir, key) === day) return undefined;
  const suffix = note === undefined ? "" : ` (${note})`;
  return `- \`${key}\` has not been opened today${suffix}`;
}
