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
 * The scaffold fills gaps, never overwrites. It used to act only on an empty
 * folder, on the reasoning that a folder holding notes is somebody's actual
 * memory. That reasoning was half right: it kept the notes safe and left the
 * writing half of the scheme missing for exactly the users who already had a
 * folder — no `relationship.md`, no `diary/`, so no emotion cache and no daily
 * nudge. Pointing `memoryDir` at a folder is the invitation; the folder already
 * containing markdown is not a reason to install only half the mechanism.
 *
 * Every step is best-effort: a read-only home directory must not fail a session.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MEMORY_FILE } from "./sources.js";

/** Absolute path of this package's directory, used to locate the template. */
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Files the skeleton lays down: template name → destination name in the folder. */
const SKELETON = [
  { template: DEFAULT_MEMORY_FILE, target: DEFAULT_MEMORY_FILE },
  { template: "INDEX.md", target: "INDEX.md" },
  { template: "relationship.md", target: "relationship.md" },
  { template: "弯路.md", target: "弯路.md" },
];

/** Directory for dated entries, created empty with a README naming the convention. */
const DIARY_DIR = "diary";

/**
 * Ensure `memoryDir` holds the skeleton, filling in only what is missing.
 *
 * It used to bail out entirely when the folder already held any `.md`, which meant the
 * recommended usage — point it at the folder you already keep — produced a folder with
 * no `relationship.md` and no `diary/`, so the writing side had nowhere to live and the
 * nudge never fired. Pointing `memoryDir` here is the invitation; the folder answering
 * "I already have notes" is not a reason to leave half the mechanism missing.
 *
 * What stays true is the part that matters: **existing files are never touched**. Every
 * write uses the `wx` flag, so a file that appeared between the check and the write
 * loses the race rather than being truncated, and a file with the same name but the
 * user's own content is simply left alone.
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
    } else if (!statSync(memoryDir).isDirectory()) {
      // A file where the folder should be: report it instead of half-writing
      // a skeleton beside it.
      return {
        createdDir: false,
        createdFile: false,
        createdFiles,
        skipped: false,
        error: "NOT_A_DIRECTORY",
      };
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
  return { createdDir, createdFile: createdFiles.length > 0, createdFiles, skipped: createdFiles.length === 0 };
}
