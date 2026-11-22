/**
 * Copy the emotion the writer already wrote down into the live value.
 *
 * The two halves of the loop were both written, and the second half still froze: a diary
 * section carries `情绪：定` the moment it is written, but the `**现在**` line in
 * `relationship.md` only changed if someone remembered to run a command afterwards. Measured
 * on the folder this was built from: the cache sat untouched for two days while twelve
 * sections were written, every one of them tagged. The judgement was never missing — only
 * the copy was.
 *
 * So this is the copy, and only the copy. It does not decide what the emotion is: the word
 * comes from the entry, and if the last section has no tag, nothing is written and the diary
 * check says why. A word outside the vocabulary is skipped for the same reason the tool
 * refuses one — it would never be matched again.
 *
 * Two guards keep it from undoing a newer decision:
 *
 * - **The last non-exempt section must carry the tag.** If prose was appended after the tag
 *   and the tag was forgotten, copying the older word would revert a value the writer set by
 *   hand in the meantime.
 * - **The entry must have been written after the cache was.** A hand-set value with no diary
 *   write behind it is the newer decision, and it stays. Minutes are the resolution on both
 *   sides, so a sync that runs in the same minute as the write still counts as newer.
 *
 * The filesystem is the only source of truth here; there is no sidecar recording "already
 * synced". A copy that needs its own memory is one more thing that can drift.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DIARY_DIR, entryPath } from "./diary.js";
import { lastContentSection } from "./diarycheck.js";
import { RELATIONSHIP_FILE, readLiveEmotion, readVocabulary, writeEmotion } from "./emotion.js";

/** `2026-11-09 09:49` → epoch ms, local; `undefined` when the string has no clock time. */
export function minuteOfStamp(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (match === null) return undefined;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  ).getTime();
}

/**
 * Whether the day's entry was written after the live value was last set.
 *
 * A cache line with only a date (older format) cannot outrank anything by time, so the
 * entry wins — the alternative is never syncing a folder whose stamp predates the format.
 *
 * @param {string} diaryFile
 * @param {{ at?: string }} live
 * @returns {boolean}
 */
export function diaryIsNewer(diaryFile, live) {
  const at = minuteOfStamp(live?.at);
  if (at === undefined) return true;
  try {
    const modified = Math.floor(statSync(diaryFile).mtimeMs / 60000) * 60000;
    return modified >= at;
  } catch {
    return true;
  }
}

/**
 * @param {{ memoryDir: string, day: string, stamp: string }} input
 *   `day` is the local calendar day (`YYYY-MM-DD`) whose entry to read; `stamp` is the
 *   minute to write into the cache line.
 * @returns {{ ok: boolean, changed: boolean, reason: string, word?: string, previous?: string }}
 *   `ok` is "nothing went wrong", not "something changed" — most calls change nothing,
 *   and the caller only logs the ones that do.
 */
export function syncEmotionFromDiary({ memoryDir, day, stamp }) {
  if (typeof memoryDir !== "string" || memoryDir === "") return { ok: false, changed: false, reason: "no-memory-dir" };
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, changed: false, reason: "no-day" };

  const file = join(memoryDir, RELATIONSHIP_FILE);
  if (!existsSync(file)) return { ok: false, changed: false, reason: "no-relationship" };
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { ok: false, changed: false, reason: "unreadable-relationship" };
  }
  const live = readLiveEmotion(text, day);
  if (live === undefined) return { ok: false, changed: false, reason: "no-live-line" };

  const diaryFile = entryPath(memoryDir, day);
  if (!existsSync(diaryFile)) return { ok: false, changed: false, reason: "no-diary" };
  let diary;
  try {
    diary = readFileSync(diaryFile, "utf8");
  } catch {
    return { ok: false, changed: false, reason: "unreadable-diary" };
  }

  const section = lastContentSection(diary);
  const word = section?.tags?.at(-1);
  if (word === undefined) return { ok: true, changed: false, reason: "no-tag", section: section?.heading };

  if (!readVocabulary(text).includes(word)) return { ok: false, changed: false, reason: "not-in-vocabulary", word };
  if (!diaryIsNewer(diaryFile, live)) return { ok: true, changed: false, reason: "cache-is-newer", word };

  // The same word still gets re-stamped when the entry is newer: `还是定` written at 22:00
  // is a re-affirmation, and leaving the stamp at two days ago would make the block call a
  // live value stale. When nothing at all changed the line is byte-identical and no write
  // happens.
  const result = writeEmotion(text, word, stamp);
  if (!result.changed) return { ok: true, changed: false, reason: "unchanged", word };
  try {
    writeFileSync(file, result.text);
  } catch {
    return { ok: false, changed: false, reason: "write-failed", word };
  }
  return { ok: true, changed: true, reason: "synced", word, previous: result.previous };
}
