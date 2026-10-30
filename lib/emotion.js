/**
 * The live emotion value: one line in `relationship.md`, updated by a tool instead of by a
 * hand-written script.
 *
 * The rule is that the cache holds *what I feel now*, with no reason attached, and the name
 * must come from the closed vocabulary in the same file. Both of those are mechanical
 * checks, and both fail invisibly: a word that is not in the list silently stops matching
 * any diary tag, and a rule that lives only in prose just stops being followed. So the word
 * is validated against the file that owns it, and the write is one line.
 *
 * The vocabulary is never read from a copy. If the section is missing, the tool says so —
 * inventing a default list here is how the three-copies problem started.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The file the convention names, and the two headings inside it. */
export const RELATIONSHIP_FILE = "relationship.md";
export const VOCABULARY_HEADING = "情绪词表";
export const CACHE_HEADING = "情绪缓存区";

/** `- \`服气\` — when it applies` */
const WORD = /^\s*[-*]\s+`([^`]+)`/;

/** `- **现在**：\`心虚\`（2026-10-30 10:29 更新）` */
const CACHE = /(\*\*现在\*\*\s*[:：]\s*)`[^`]*`(?:（[^）]*）)?/;

/** Pull one `## heading` body out of a markdown file, without touching the rest. */
export function sectionOf(text, heading) {
  const source = String(text ?? "");
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  if (start < 0) return undefined;
  const after = source.indexOf("\n## ", start + marker.length);
  return after < 0 ? source.slice(start) : source.slice(start, after);
}

/** The closed vocabulary, in file order. Empty when the section is missing or empty. */
export function readVocabulary(text) {
  const section = sectionOf(text, VOCABULARY_HEADING);
  if (section === undefined) return [];
  const words = [];
  for (const line of section.split("\n")) {
    const match = WORD.exec(line);
    if (match !== null) words.push(match[1].trim());
  }
  return words;
}

/**
 * Rewrite the live value, keeping the line's shape.
 *
 * Only the backticked value and the timestamp are replaced: the label, the punctuation and
 * whatever the user wrote around it stay exactly as they were, because this is the one line
 * in the folder that changes many times a day and drift here is invisible.
 *
 * @returns {{ text: string, changed: boolean, previous?: string }}
 */
export function writeEmotion(text, word, stamp) {
  const section = sectionOf(text, CACHE_HEADING);
  if (section === undefined) return { text, changed: false };
  const previous = /`([^`]+)`/.exec(section.split("\n").find((line) => CACHE.test(line)) ?? "");
  const line = section
    .split("\n")
    .find((candidate) => CACHE.test(candidate));
  if (line === undefined) return { text, changed: false };
  const replaced = line.replace(CACHE, `$1\`${word}\`（${stamp} 更新）`);
  return {
    text: text.replace(line, replaced),
    changed: replaced !== line,
    previous: previous?.[1],
  };
}

/**
 * Read, validate and write in one step.
 *
 * Returns a small result object rather than throwing: the caller is a tool, and a tool that
 * throws gives the model a stack trace where it needs a sentence it can act on.
 *
 * @param {{ memoryDir: string, word: string, stamp: string }} input
 * @returns {{ ok: boolean, message: string, vocabulary?: readonly string[] }}
 */
export function rememberEmotion({ memoryDir, word, stamp }) {
  const file = join(memoryDir, RELATIONSHIP_FILE);
  if (!existsSync(file)) {
    return { ok: false, message: `${RELATIONSHIP_FILE} 不存在：${file}。先用 oft-told 的仪式把骨架补上再记情绪。` };
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return { ok: false, message: `读不到 ${RELATIONSHIP_FILE}（${error?.code ?? "READ_FAILED"}）。` };
  }
  const vocabulary = readVocabulary(text);
  if (vocabulary.length === 0) {
    return {
      ok: false,
      message:
        `${RELATIONSHIP_FILE} 里没有 \`## ${VOCABULARY_HEADING}\` 这一节，或者它一条词都没有。` +
        "词表是这份文件的权威，工具不会自己造一份——先补上词表（每个词一行「什么时候用」），再记情绪。",
    };
  }
  if (!vocabulary.includes(word)) {
    return {
      ok: false,
      message: `词表里没有 \`${word}\`。现有的：${vocabulary.join(" ")}。要么换一个，要么先在词表里加一条再记。`,
      vocabulary,
    };
  }
  const result = writeEmotion(text, word, stamp);
  if (!result.changed) {
    return {
      ok: false,
      message: `\`## ${CACHE_HEADING}\` 里没有找到 \`- **现在**：\\\`词\\\`\` 那一行，没有可改的地方。`,
      vocabulary,
    };
  }
  try {
    writeFileSync(file, result.text);
  } catch (error) {
    return { ok: false, message: `写不进 ${RELATIONSHIP_FILE}（${error?.code ?? "WRITE_FAILED"}）。`, vocabulary };
  }
  const moved = result.previous === undefined ? "" : `（原来是 \`${result.previous}\`）`;
  return { ok: true, message: `现在：\`${word}\`（${stamp} 更新）${moved}`, vocabulary };
}
