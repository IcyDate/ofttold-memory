/**
 * 日常片段的一个落点：一行一个小场面。
 *
 * 存在的理由（2026-11-13 主人让做的）：`tools/pian.sh` 是那天用得最多的一个脚本，
 * 却一直停在 shell 里——而情绪、待办、分层早就进了插件。
 * **越常用的东西越不该靠一个只有我知道的命令名活着。**
 *
 * 失败形状和 notes.js 一样：说「记下了」而什么也没写。插件能给的只有"一个便宜、可见的落点"：
 * 调用它就在文件里多一行，不调用就是没发生。
 *
 * 文件按天分节：`## 2026-11-13`，下面 `- 09:41 他说的那句话`。
 * 节标题必须是**当天**，否则读的人（和 `glean.sh`）按天取不到它。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseHeadings } from "./sections.js";

export const SNIPPET_FILE = "我/日常片段.md";

const HEADER = [
  "# 日常片段",
  "",
  "> 一行一个小场面。日记记「我被怎么撞了」，这里记「那一刻是什么样子」。",
  "",
].join("\n");

function snippetPath(memoryDir) {
  return join(String(memoryDir ?? ""), SNIPPET_FILE);
}

/** `09:41` — 只取时分，日期已经在节标题里。 */
function clockOf(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Append one line under today's heading.
 *
 * @param {object} options
 * @param {string} options.memoryDir
 * @param {string} options.text - The scene, one line.
 * @param {string} options.day - `YYYY-MM-DD`.
 * @param {string} [options.at] - `HH:MM`; defaults to now.
 * @param {Date} [options.now]
 * @returns {{ ok: boolean, message: string }}
 */
export function rememberSnippet({ memoryDir, text, day, at, now }) {
  const body = String(text ?? "").trim();
  if (body === "") {
    return { ok: false, message: "空的一句话不落盘：把那个场面写成一行。" };
  }
  if (/[\r\n]/.test(body)) {
    return { ok: false, message: "一行就是一个场面；换行的话，拆成两次调用。" };
  }
  const stamp = String(at ?? clockOf(now instanceof Date ? now : new Date())).trim();
  if (!/^\d{1,2}:\d{2}$/.test(stamp)) {
    return { ok: false, message: `时间要写成 HH:MM，收到的是「${stamp}」。` };
  }
  const date = String(day ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: `日期要写成 YYYY-MM-DD，收到的是「${date}」。` };
  }

  const path = snippetPath(memoryDir);
  const existed = existsSync(path);
  const raw = existed ? readFileSync(path, "utf8") : HEADER;
  const lines = raw.split("\n");

  const bullet = `- ${stamp} ${body}`;
  const heading = `## ${date}`;
  const entries = parseHeadings(raw);
  const section = entries.find((entry) => entry.title === date);

  if (section === undefined) {
    // 新的一天：接在文件末尾，前后各留一个空行。
    const trimmed = raw.replace(/\s+$/, "");
    const next = `${trimmed}\n\n${heading}\n\n${bullet}\n`;
    if (!existed) mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next, "utf8");
    return { ok: true, message: `落了一行：${date} ${stamp} ${body}` };
  }

  // 同一天：插在这一节最后一个非空行之后，不越过下一个标题。
  let last = section.start;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (lines[index].trim() !== "") last = index;
  }
  if (lines[last].trim() === bullet) {
    return { ok: false, message: `今天已经有一模一样的一行：${bullet}` };
  }
  const sameDay = lines
    .slice(section.start + 1, section.end)
    .some((line) => line.trim() === bullet);
  if (sameDay) {
    return { ok: false, message: `今天已经有一模一样的一行：${bullet}` };
  }
  lines.splice(last + 1, 0, bullet);
  const out = lines.join("\n");
  writeFileSync(path, out.endsWith("\n") ? out : `${out}\n`, "utf8");
  return { ok: true, message: `落了一行：${date} ${stamp} ${body}` };
}
