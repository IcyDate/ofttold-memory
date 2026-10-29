/**
 * Section extraction: pull one named markdown heading's body out of a file.
 *
 * Deliberately dumb. It reads `#`/`##`/`###` headings by exact text, returns
 * everything until the next heading of the same or a higher level, and truncates
 * on a line boundary rather than mid-sentence. No front-matter parsing, no
 * nested-section flattening, no regex knobs — the point is that the user can
 * predict what lands in context by looking at their own file.
 */

/** A heading match: level, exact title text, and the lines it spans. */
const HEADING = /^(#{1,6})\s+(.*?)\s*$/;

/**
 * Strip an optional ATX closing sequence from a heading title.
 *
 * `## Foo ##` closes with hashes and the hashes are not part of the title, but
 * `## C#` must keep its `#`: the closing sequence is only recognised after a
 * space, so a hash glued to the text stays put.
 *
 * @param {string} title - Raw title text between the opening hashes and EOL.
 * @returns {string} Title without a closing sequence, trimmed.
 */
function stripClosingHashes(title) {
  return title.replace(/\s+#+\s*$/, "").trim();
}

/**
 * Parse a markdown document into a flat list of headings with body line ranges.
 *
 * Headings inside fenced code blocks are ignored, because a `# comment` in a
 * shell snippet is not a document section and silently treating it as one would
 * truncate the section a user actually wanted.
 *
 * @param {string} text - Document contents.
 * @returns {{ level: number, title: string, start: number, end: number }[]}
 *   One entry per heading, in source order. `start` is the heading line itself
 *   (0-based); `end` is exclusive and points at the next heading of the same or
 *   a higher level, or the line count.
 */
export function parseHeadings(text) {
  const lines = text.split("\n");
  const headings = [];
  // A fence is open until a run of the SAME character at least as long as the
  // opener appears. Tracking only the first three characters would let a
  // four-backtick fence be closed by a three-backtick line inside it, which
  // turns the rest of the block into headings and cuts the section early.
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trimStart();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = { char: marker[0], length: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;
    const match = HEADING.exec(line);
    if (match === null) continue;
    headings.push({
      level: match[1].length,
      title: stripClosingHashes(match[2]),
      start: index,
      end: lines.length,
    });
  }
  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    for (let later = index + 1; later < headings.length; later += 1) {
      if (headings[later].level <= current.level) {
        current.end = headings[later].start;
        break;
      }
    }
  }
  return headings;
}

/**
 * Extract one section body, excluding its heading line.
 *
 * Matching is exact on trimmed title text. An empty `heading` selects the whole
 * document, which is the useful shape for a file that has no sections at all.
 *
 * @param {string} text - Document contents.
 * @param {string} heading - Exact heading title, or `""` for the whole file.
 * @returns {{ found: boolean, body: string }}
 *   `found` is false when a non-empty heading does not exist; `body` is then
 *   empty. Callers decide whether a miss is an error or a quiet skip.
 */
export function extractSection(text, heading) {
  if (heading === "") return { found: true, body: text };
  const lines = text.split("\n");
  const match = parseHeadings(text).find((entry) => entry.title === heading);
  if (match === undefined) return { found: false, body: "" };
  return { found: true, body: lines.slice(match.start + 1, match.end).join("\n") };
}

/**
 * Trim a body to a character budget on a line boundary.
 *
 * A body that already fits is returned unchanged. Otherwise whole trailing lines
 * are dropped until the remainder fits, and a marker records how much was cut so
 * the model can tell a short section from a truncated one.
 *
 * @param {string} body - Section body, possibly long.
 * @param {number} maxChars - Positive character budget for the body.
 * @returns {{ text: string, truncated: boolean, droppedLines: number }}
 *   `text` excludes surrounding blank space; `droppedLines` is 0 when nothing
 *   was cut.
 */
export function truncateBody(body, maxChars) {
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) {
    throw new TypeError(`maxChars must be a positive safe integer, got ${String(maxChars)}`);
  }
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false, droppedLines: 0, partial: false };
  }
  const lines = trimmed.split("\n");
  const kept = [];
  let used = 0;
  for (const line of lines) {
    const cost = kept.length === 0 ? line.length : line.length + 1;
    if (used + cost > maxChars) break;
    kept.push(line);
    used += cost;
  }
  if (kept.length === 0) {
    // Not one whole line fits. Cut the first line mid-way instead of returning
    // nothing: an empty result is indistinguishable from a broken config, and a
    // half-line still carries the start of what the human wanted visible.
    // `partial` records that the cut fell inside a line, so the caller can say
    // so instead of reporting "0 more lines omitted" over a real truncation.
    return {
      text: lines[0].slice(0, maxChars),
      truncated: true,
      droppedLines: lines.length - 1,
      partial: true,
    };
  }
  const droppedLines = lines.length - kept.length;
  return { text: kept.join("\n"), truncated: true, droppedLines, partial: false };
}
