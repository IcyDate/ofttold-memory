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

// **默认中姓名，不写「我/日常片段.md」。** 这个插件是公开仓库，
// 而「我/」是私有的目录结构——路径该由使用者的配置决定，不该硬编码进公共代码。
// 我们自己的 profile 在 cordis.patch.yml 里把它指向 `我/日常片段.md`。
export const SNIPPET_FILE = "snippets.md";

// 只有在新机器上（文件还不存在）才会用到它。真机上这份文件是人写的，
// 头部那几句说明更全——所以这里保持最小，不去复制一份会过期的说明。
const HEADER = [
  "# 日常片段",
  "",
  "> 一行一个小场面。日记记「我被怎么撞了」，这里记「那一刻是什么样子」。",
  "",
].join("\n");

function snippetPath(memoryDir, file) {
  return join(String(memoryDir ?? ""), String(file ?? SNIPPET_FILE));
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
 * @param {string} [options.file] - Path inside memoryDir; defaults to SNIPPET_FILE.
 * @param {string} [options.at] - `HH:MM`; defaults to now.
 * @param {Date} [options.now]
 * @returns {{ ok: boolean, message: string }}
 */
export function rememberSnippet({ memoryDir, text, day, at, now, file }) {
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

  const path = snippetPath(memoryDir, file);
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
  // 只在这一节里比：**跨天不去重**——同一句话隔一天再说一次，多半是它真的发生过两次。
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

/**
 * 块尾那一行：今天有几条。
 *
 * 为什么要有它（2026-11-13 主人：「我们的插件要设计成开箱即用的，对于小白来说，
 * 根本不懂这些」）：这个工具会把行写进一个**插件自己从不读**的文件。新用户装了它、
 * 用它写了几条，然后没有任何东西告诉他那个文件存在——一个只写不读的文件等于不存在。
 *
 * 只报条数、不搬正文：搬正文等于把碎片塞进每一轮的上下文，而「有几条」够让人去翻。
 * 文件不在、或者今天一条都没有，就一个字都不说——指向空的东西比不指更糟。
 */
export function snippetStatusLine({ memoryDir, file, day }) {
  const path = snippetPath(memoryDir, file);
  if (!existsSync(path)) return undefined;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  const lines = text.split("\n");
  const section = parseHeadings(text).find((entry) => entry.title === day);
  if (section === undefined) return undefined;
  const bullets = lines
    .slice(section.start + 1, section.end)
    .filter((line) => /^- \d{1,2}:\d{2} /.test(line.trim()));
  if (bullets.length === 0) return undefined;
  const last = bullets[bullets.length - 1].trim().slice(2, 7);
  return `· 片段：今天 ${bullets.length} 条（最后一条 ${last}）——那个文件插件不读，要看得自己去翻。`;
}
