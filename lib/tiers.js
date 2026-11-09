/**
 * The index's three layers: counted, pointed at, and moved — never rewritten.
 *
 * `index.md` is one line per day, and the design says what to do once it grows: keep the
 * last fourteen days whole, merge older days four at a time into the warm layer, and keep
 * the originals verbatim in the cold one so a grep still finds them. For a year that rule
 * lived only in the design document, which means it stayed a rule and never became a shape
 * of the file: measured on 2026-11-09, the index held 24 entries in a hot layer whose
 * heading said "last 14 days", and one of them was seventeen days old.
 *
 * Why this file does not merge by itself: **what the merged line says is a judgement.**
 * Four days become one sentence by picking which of forty things mattered, and that is the
 * one step no counter can take. What the counter *can* do is say "this is over the line, and
 * here are the days that are past it", which is the half that fails silently: nobody notices
 * an index getting heavy, because a heavy index still reads fine.
 *
 * `moveToWarm` is the other half — the surgery, not the sentence. Given the days and the
 * line somebody wrote, it deletes those entries from the hot layer, files their originals
 * into the cold layer verbatim, and appends the new line to the warm layer. The failure it
 * removes is the quiet one: forgetting to delete the originals, so the same day exists twice
 * and one of the copies is already stale.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const INDEX_FILE = "index.md";
/** The hot layer is "the last fourteen days" — past that, an entry belongs in warm. */
export const HOT_DAYS = 14;
/**
 * Measured trigger from `docs/design.md`: ~9436 characters ≈ 6300 tokens.
 *
 * Characters, not entries. The document said "twenty lines ≈ 9436 characters" when a line
 * ran to 472 characters; the house rule has since capped a line at 150, so twenty entries
 * is now six thousand characters and counting entries would fire at a size nobody minds.
 * The number that costs the reader is the characters.
 */
export const TRIGGER_CHARS = 9436;

const ENTRY = /^- \*\*(\d{4}-\d{2}-\d{2})\*\*/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Which layer a `##` heading starts, or `undefined` for a heading that is not a layer.
 *
 * Both languages are accepted because the headings come from the user's own document, and
 * the template ships Chinese: a file that says `## Hot layer` should not be invisible to a
 * line that says "your hot layer is over its limit".
 */
function layerOf(title) {
  if (/^热层/.test(title) || /^hot\b/i.test(title)) return "hot";
  if (/^温层/.test(title) || /^warm\b/i.test(title)) return "warm";
  if (/^冷层/.test(title) || /^cold\b/i.test(title)) return "cold";
  return undefined;
}

/** Heading positions for the three layers, as `[start, end)` line ranges after the heading. */
function layersOf(lines) {
  const heads = [];
  lines.forEach((line, index) => {
    if (/^##\s/.test(line)) heads.push(index);
  });
  const found = {};
  for (const head of heads) {
    const end = heads.find((other) => other > head) ?? lines.length;
    const key = layerOf(lines[head].replace(/^##\s+/, "").trim());
    // First heading wins: a document that mentions the layers twice is ambiguous, and
    // guessing which one is live is worse than using the one a reader would reach first.
    if (key !== undefined && found[key] === undefined) found[key] = { start: head + 1, end };
  }
  return found;
}

/** One entry, as a line range including its indented follow-up lines. */
function entriesOf(lines, range) {
  if (range === undefined) return [];
  const entries = [];
  for (let index = range.start; index < range.end; index++) {
    const match = lines[index].match(ENTRY);
    if (match === null) continue;
    let end = index + 1;
    while (end < range.end && !/^- /.test(lines[end]) && !/^##\s/.test(lines[end])) end++;
    entries.push({ day: match[1], start: index, end });
    index = end - 1;
  }
  return entries;
}

function dayNumber(day) {
  const match = day.match(DATE);
  if (match === null) return undefined;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

function daysBetween(from, to) {
  const a = dayNumber(from);
  const b = dayNumber(`${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`);
  if (a === undefined || b === undefined) return 0;
  return b - a;
}

/**
 * What the hot layer currently looks like, or `undefined` when the file has no such layer.
 *
 * A file without the headings is not a problem to report — it is an index that never opted
 * into tiers, and a plugin that nags about a structure the user never chose is noise.
 */
export function tierStatus(text, options = {}) {
  const today = options.today ?? new Date();
  const hotDays = options.hotDays ?? HOT_DAYS;
  const lines = String(text).split("\n");
  const layers = layersOf(lines);
  if (layers.hot === undefined) return undefined;
  const entries = entriesOf(lines, layers.hot);
  const chars = entries.reduce((total, entry) => total + lines.slice(entry.start, entry.end).join("\n").trim().length, 0);
  const stale = entries.filter((entry) => daysBetween(entry.day, today) > hotDays).map((entry) => entry.day);
  const overChars = chars > (options.triggerChars ?? TRIGGER_CHARS);
  return {
    hotCount: entries.length,
    hotChars: chars,
    /** Days already past the fourteen-day line, oldest first. */
    stale,
    hotDays,
    triggerChars: options.triggerChars ?? TRIGGER_CHARS,
    overChars,
    triggered: overChars || stale.length > 0,
  };
}

/**
 * The block-tail line, or `undefined` when the index is fine.
 *
 * It names the days rather than only counting them: "3 entries are past 14 days" sends the
 * reader back to count, and counting is the part that gets skipped.
 */
export function tierLine(status) {
  if (status === undefined || !status.triggered) return undefined;
  const size = `${status.hotCount} 条 / ${status.hotChars} 字符`;
  if (status.stale.length > 0) {
    return `- 索引热层 ${size}，其中 ${status.stale.length} 条已经过了 ${status.hotDays} 天：${status.stale.join("、")}。并进温层、四天一条，原件留在冷层——\`tier_index\` 只搬，那一行写什么还是你的判断。`;
  }
  return `- 索引热层 ${size}，到了该分层的量（${status.triggerChars} 字符）。14 天以前的并进温层、四天一条，原件留在冷层。`;
}

/** Drop leading bullets and whitespace so both `- 一行` and `一行` work as input. */
function cleanLine(text) {
  return String(text ?? "").replace(/^\s*-\s*/, "").replace(/\s+$/, "");
}

function trimBlankTail(body) {
  const copy = [...body];
  while (copy.length > 0 && copy[copy.length - 1].trim() === "") copy.pop();
  return copy;
}

/**
 * Move the named days out of the hot layer, verbatim into the cold layer, and add `merged`
 * to the warm layer.
 *
 * Pure: takes the whole document and returns the next one, so the caller decides when it
 * touches the disk. Every refusal is a case where proceeding would have destroyed something
 * a human wrote — a day that is not in the hot layer, a day that appears twice, a line with
 * nothing in it.
 */
export function moveToWarm(text, options) {
  const days = [...new Set((options?.days ?? []).map((day) => String(day).trim()))];
  const merged = cleanLine(options?.merged);
  if (merged === "") return { ok: false, message: "需要一条合并后的文字——搬的是位置，不是判断。" };
  if (days.length === 0) return { ok: false, message: "没说要搬哪几天。" };
  const bad = days.filter((day) => dayNumber(day) === undefined);
  if (bad.length > 0) return { ok: false, message: `${bad.join("、")} 不是 YYYY-MM-DD 的日期。` };

  const lines = String(text).split("\n");
  const layers = layersOf(lines);
  if (layers.hot === undefined) return { ok: false, message: "index.md 里没有「## 热层」这一节。" };
  if (layers.warm === undefined) return { ok: false, message: "index.md 里没有「## 温层」这一节——先建出来，我不替你造结构。" };
  if (layers.cold === undefined) return { ok: false, message: "index.md 里没有「## 冷层」这一节——先建出来，我不替你造结构。" };

  const entries = entriesOf(lines, layers.hot);
  const picked = [];
  const missing = [];
  for (const day of days) {
    const matches = entries.filter((entry) => entry.day === day);
    if (matches.length === 0) missing.push(day);
    else if (matches.length > 1) return { ok: false, message: `${day} 在热层里出现了 ${matches.length} 次，先手动看一眼，我不猜哪条算数。` };
    else picked.push(matches[0]);
  }
  if (missing.length > 0) {
    const present = entries.slice(-5).map((entry) => entry.day).join("、");
    return { ok: false, message: `热层里没有：${missing.join("、")}。最靠后的几条是 ${present}。` };
  }

  const removed = new Set();
  for (const entry of picked) for (let index = entry.start; index < entry.end; index++) removed.add(index);
  const hotBody = trimBlankTail(lines.slice(layers.hot.start, layers.hot.end).filter((_line, offset) => !removed.has(layers.hot.start + offset)));

  const warmBody = trimBlankTail(lines.slice(layers.warm.start, layers.warm.end));
  if (warmBody.length > 0) warmBody.push("");
  warmBody.push(`- ${merged}`, "");

  const coldBody = trimBlankTail(lines.slice(layers.cold.start, layers.cold.end));
  for (const entry of picked) {
    const original = lines.slice(entry.start, entry.end).join("\n").replace(/\s+$/, "");
    if (coldBody.length > 0) coldBody.push("");
    coldBody.push(original);
  }
  if (coldBody.length > 0) coldBody.push("");

  // Every body is one blank line away from its heading and from whatever follows it. An
  // emptied hot layer keeps that blank so the next `##` does not sit right under the
  // heading it belongs to — a file that reads as two headings glued together is the kind
  // of thing a later edit "fixes" by deleting an entry.
  for (const body of [hotBody, warmBody, coldBody]) {
    if (body.length === 0) body.push("");
    else if (body[0].trim() !== "") body.unshift("");
    if (body[body.length - 1].trim() !== "") body.push("");
  }

  const bodies = { hot: hotBody, warm: warmBody, cold: coldBody };
  const ranges = ["hot", "warm", "cold"]
    .map((key) => ({ key, ...layers[key] }))
    .sort((left, right) => left.start - right.start);
  const out = [];
  let cursor = 0;
  for (const range of ranges) {
    out.push(...lines.slice(cursor, range.start));
    out.push(...bodies[range.key]);
    cursor = range.end;
  }
  out.push(...lines.slice(cursor));

  const next = out.join("\n");
  const after = tierStatus(next);
  const size = after === undefined ? "" : `热层现在 ${after.hotCount} 条 / ${after.hotChars} 字符。`;
  return {
    ok: true,
    text: next,
    message: `搬好了：${picked.length} 条原件进了冷层，温层加了一行。${size}`,
  };
}

/**
 * Read, move, write — atomically, so a failed write cannot leave half an index behind.
 *
 * Same division as `emotion-sync.js`: the judgement arrives as an argument, the file
 * surgery happens here.
 */
export function tierIndexFile({ memoryDir, days, merged }) {
  const file = join(memoryDir, INDEX_FILE);
  if (!existsSync(file)) return { ok: false, message: `这个记忆文件夹里没有 ${INDEX_FILE}。` };
  const before = readFileSync(file, "utf8");
  const result = moveToWarm(before, { days, merged });
  if (!result.ok) return result;
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, result.text);
  renameSync(temporary, file);
  return { ok: true, message: result.message };
}
