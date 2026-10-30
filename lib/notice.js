/**
 * What a session gets when the memory folder answers nothing.
 *
 * The plugin's worst failure mode is not the error path — it is looking fine while
 * having loaded nothing. The user's notes do not appear, nothing says why, and the
 * only trace is a diagnostics file nobody opens. So when no section resolves we
 * still inject a block: it costs a line, and it turns silence into a sentence.
 *
 * Two shapes, because these are two different problems and fixing them takes
 * different actions:
 *
 * - nothing to read (a new folder, or an empty section): expected, worth greeting
 *   rather than alarming;
 * - headings that do not match: a configuration mistake, worth naming exactly,
 *   because the reader can fix it in one edit once they see what was tried.
 */

const HOME = process.env.HOME;

/** `~/dsh/memory` reads better than `/Users/someone/dsh/memory` in a chat message. */
function shortenHome(path) {
  if (typeof path !== "string" || !HOME || !path.startsWith(HOME)) return path;
  return `~${path.slice(HOME.length)}`;
}

function describeAttempts(attempts) {
  return attempts
    .map((attempt) => `\`${attempt.file}\` → \`${attempt.heading}\` (${attempt.reason})`)
    .join("; ");
}

/**
 * @param {{ attempts: Array<{file: string, heading: string, reason: string}>, memoryDir: string, header: string }} input
 * @returns {string} the notice to inject
 */
export function buildNotice({ attempts, memoryDir, header }) {
  const folder = shortenHome(memoryDir);
  const mismatched = attempts.some((attempt) => attempt.reason === "heading_not_found");

  if (mismatched) {
    return [
      header,
      `The memory folder at \`${folder}\` was read, but none of its headings matched, so this session starts without any of it. Tried: ${describeAttempts(attempts)}.`,
      "Headings match exactly, suffix included — a section titled `常被提起（手动维护，上限 8 条）` does not match `常被提起`.",
      "Tell the user this, with the folder and the heading that was looked for. From their side the plugin simply looks broken, and the fix is one line in the settings page or `cordis.patch.yml`.",
    ].join("\n\n");
  }

  return [
    header,
    `The memory folder at \`${folder}\` has nothing to read yet, so this session starts without it. That is what a fresh install looks like, not a failure.`,
    "It fills up as the user writes into the section the plugin reads (by default `常被提起` or `Oft-told` in `MEMORY.md`), and the writing protocol is the `ofttold-ritual` skill.",
    "If they ask why notes they wrote are not showing up, say what was looked for rather than letting this pass: a silent plugin is indistinguishable from a healthy one.",
  ].join("\n\n");
}
