/**
 * The one line that turns "I should write today's diary" into something the model
 * cannot fail to notice.
 *
 * Every other part of the writing side is a judgement the model has to remember to
 * make. This is the cheapest possible exception: one `existsSync` at injection time,
 * and the block ends by saying the day is unwritten. It costs a filesystem call and
 * removes the remembering.
 *
 * The line is deliberately flat — a dash and a fact, no verdict and no instruction. It sits
 * in the same block tail as the diary check, and that check is the one that carries bad news;
 * if the reminder reads like a complaint too, the whole tail becomes noise and the check gets
 * skipped along with it. A status line stays legible on the day the folder reports a problem.
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

import { existsSync, readdirSync, statSync } from "node:fs";
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
 * @param {"daily"|"weekly"|"off"} [cadence]
 * @param {{ sessionStartedAt?: number, staleHours?: number }} [options]
 *   `sessionStartedAt` separates "written by another session today" from "written by
 *   this one"; `staleHours` catches the third case neither of those sees — written
 *   today, by this session, and then untouched for hours.
 * @returns {string|undefined} the line to append, or undefined when there is nothing
 *   to say: no diary folder (this is not a ritual-shaped folder), or today is written.
 */
export function pendingDiaryNudge(memoryDir, now = new Date(), cadence = "daily", options = {}) {
  if (typeof memoryDir !== "string" || memoryDir === "") return undefined;
  if (cadence === "off") return undefined;
  const diaryDir = join(memoryDir, DIARY_DIR);
  if (!existsSync(diaryDir)) return undefined;

  // Nothing written at all is a different message from "today is unwritten": on the
  // first day the flat line reads like a complaint about a folder that has not had a
  // chance yet. The whole reason a new install looks like it did nothing is that this
  // state is silent about what it is — the folder is empty because nothing has happened
  // in it yet, which is not a fault.
  if (!hasAnyEntry(memoryDir)) {
    return `- ${DIARY_DIR}/ has no entries yet. That is the expected state, not a fault.`;
  }

  const day = localDay(now);
  const written = existsSync(join(diaryDir, `${day}.md`));
  if (cadence === "weekly") {
    // Weekly means "something recent", not "seven days from the last one": a fixed
    // interval would nag on the wrong day after any skip.
    const recent = latestEntryDay(memoryDir, now, WEEK);
    if (recent !== undefined) return undefined;
    return `- no diary entry in the past ${WEEK} days`;
  }
  if (written) {
    // 「今天的文件在」不等于「今天这个会话写的东西在里面」。
    //
    // 同一天开两个会话时，第二个看到的是一份已经存在的文件，于是整段沉默——而它做
    // 了几个小时的事，一个字都没进那篇。判据取了一个被别的会话满足过的代理值。
    //
    // 文件最后写入早于本会话开始，就说明这一篇不是这个会话写的；它还没往里放东西。
    const startedAt = Number(options.sessionStartedAt);
    if (Number.isFinite(startedAt) && startedAt > 0) {
      try {
        const { mtimeMs } = statSync(join(diaryDir, `${day}.md`));
        if (mtimeMs < startedAt) {
          const at = clockOf(mtimeMs);
          return `- today's entry was last written at ${at}, before this session started`;
        }
      } catch {
        // 读不到修改时间就当它已经写过：宁可少说一句，也不要在能写的时候说错。
      }
    }

    // 文件在、也确实是这个会话写的——但已经很久没动了。这是第三种状态，前两句都
    // 看不见它：一句只问「今天有没有这个文件」，一句只问「是不是别的会话写的」。
    //
    // 而它才是最常见的失败：一天里同一篇写了十次，然后三个小时没再碰过，中间发生的
    // 事一件都没进去。这段时间里每一轮都是绿的，因为文件确实存在。
    //
    // 说的是事实，不是催促：报出最后写入的时刻和「超过几小时」，不评价该不该写。
    // 时刻不随分钟变化，所以这一行是稳定的，不会变成每轮都在跳的表。
    const staleHours = Number(options.staleHours);
    if (Number.isFinite(staleHours) && staleHours > 0) {
      try {
        const { mtimeMs } = statSync(join(diaryDir, `${day}.md`));
        if (now.getTime() - mtimeMs > staleHours * 3600 * 1000) {
          return `- today's entry was last written at ${clockOf(mtimeMs)}, more than ${staleHours}h ago`;
        }
      } catch {
        // 同上：读不到 mtime 就闭嘴，别把「读不出」说成「很久没写」。
      }
    }
    return undefined;
  }
  return `- no diary entry for ${day} yet (\`${DIARY_DIR}/${day}.md\`)`;
}

/** `HH:MM` in local time, for a status line that has to name an hour. */
export function clockOf(epochMs) {
  const date = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Whether any diary entry exists at all.
 * @param {string} memoryDir
 * @returns {boolean}
 */
export function hasAnyEntry(memoryDir) {
  try {
    return readdirSync(join(memoryDir, DIARY_DIR)).some((entry) => /^\d{4}-\d{2}-\d{2}\.md$/.test(entry));
  } catch {
    return false;
  }
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
