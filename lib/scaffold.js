/**
 * First-run scaffolding: make the memory folder exist and give it a starting
 * shape, so installing the plugin is the only step.
 *
 * Without this, a fresh install injects nothing and the failure is silent — the
 * user sees an empty session and has no way to tell "working, nothing configured"
 * from "broken". Writing templates they can edit is cheaper than explaining the
 * folder layout in a README they may not open.
 *
 * The shape is four files, and it is a shape rather than a starter note because
 * the plugin's own reading side is only half of the scheme. A folder holding one
 * list of standing facts answers "what do I already know" and leaves the harder
 * question — "how do I add to it" — entirely to the user, who then has to invent
 * a diary convention, an index convention and an emotion convention from scratch.
 * Empty shells with the conventions written in the comments answer that without
 * pre-filling a single memory: **nothing here is someone's remembered fact.**
 *
 * The scaffold is deliberately shy. It only ever acts on a folder that is missing
 * or holds no markdown at all, because a folder with notes in it is somebody's
 * actual memory: dropping a starter file into `~/Desktop/notes` next to their
 * `INDEX.md` is not help, it is clutter they then have to notice and delete. A
 * user pointing at an existing notes folder has already answered the question the
 * templates exist to answer.
 *
 * Every step is best-effort: a read-only home directory must not fail a session.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MEMORY_FILE } from "./sources.js";

/** Absolute path of this package's directory, used to locate the template. */
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Whether a folder already holds notes this plugin should not add to.
 *
 * Any markdown file counts, not just `MEMORY.md`: a folder full of someone's
 * diary and index files is already a memory folder, whether or not it happens to
 * contain the file name this plugin prefers.
 *
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {boolean} True when the folder exists and contains markdown.
 */
function holdsNotes(memoryDir) {
  if (!existsSync(memoryDir)) return false;
  try {
    const entries = readdirSync(memoryDir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"));
  } catch {
    // Unreadable is not the same as empty. Treating it as empty would write into
    // a folder we could not even list, which is the worst possible guess.
    return true;
  }
}

/** Files the skeleton lays down: template name → destination name in the folder. */
const SKELETON = [
  { template: DEFAULT_MEMORY_FILE, target: DEFAULT_MEMORY_FILE },
  { template: "INDEX.md", target: "INDEX.md" },
  { template: "relationship.md", target: "relationship.md" },
];

/** Directory for dated entries, created empty with a README naming the convention. */
const DIARY_DIR = "diary";

/**
 * Ensure `memoryDir` exists and holds the skeleton to start from.
 *
 * Existing files are never touched: a scaffold that overwrites is worse than no
 * scaffold, because it destroys the notes it was meant to bootstrap. That is why
 * every write uses the `wx` flag — a file that appeared between the check and the
 * write loses the race rather than being truncated.
 *
 * @param {string} memoryDir - Absolute memory folder.
 * @returns {{ createdDir: boolean, createdFile: boolean, createdFiles: string[],
 *   skipped: boolean, error?: string }}
 *   What was actually done, so the caller can log it rather than guess.
 *   `skipped` means the folder already held notes and was left alone on purpose.
 */
export function scaffoldMemory(memoryDir) {
  let createdDir = false;
  const createdFiles = [];
  try {
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
      createdDir = true;
    } else if (holdsNotes(memoryDir)) {
      return { createdDir: false, createdFile: false, createdFiles, skipped: true };
    }
    for (const { template, target } of SKELETON) {
      const file = join(memoryDir, target);
      if (existsSync(file)) continue;
      writeFileSync(file, readFileSync(join(PACKAGE_ROOT, "templates", template), "utf8"), { flag: "wx" });
      createdFiles.push(target);
    }
    const diary = join(memoryDir, DIARY_DIR);
    if (!existsSync(diary)) {
      mkdirSync(diary, { recursive: true });
      // A README rather than an empty directory: an empty folder is a question
      // mark, and this one is a naming convention the user cannot guess.
      writeFileSync(join(diary, "README.md"), readFileSync(join(PACKAGE_ROOT, "templates", "diary-README.md"), "utf8"), {
        flag: "wx",
      });
      createdFiles.push(`${DIARY_DIR}/README.md`);
    }
  } catch (error) {
    return {
      createdDir,
      createdFile: createdFiles.length > 0,
      createdFiles,
      skipped: false,
      error: error?.code ?? "SCAFFOLD_FAILED",
    };
  }
  return { createdDir, createdFile: createdFiles.length > 0, createdFiles, skipped: false };
}
