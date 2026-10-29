/**
 * Runtime skills: the ritual, published where the model can find it.
 *
 * The injected block answers "what do I already know". This answers the harder
 * question — "how do I add to it" — which no injection can carry: it is ~4600
 * characters of judgement, and paying for it on every turn would be paying for
 * text that is read once and forgotten.
 *
 * A skill is the right shape for that. Only its one-line description rides in the
 * system prompt; the body is loaded when a pen is actually picked up.
 *
 * Why register at runtime instead of shipping `skills/` for the filesystem
 * provider to find: that provider looks in `projectRoot/.dsh/skills`, and
 * `projectRoot` comes from walking up to a `.git`. A plugin installed under
 * `node_modules/` has no `.git` above it, so a shipped directory would be
 * **never discovered** — silently, which is the failure this plugin exists to
 * avoid. Registering from code bypasses discovery entirely.
 *
 * The files under `skills/` are the source of truth, not a build artefact: they
 * are read as-is at load time, so the shipped package and the repo never drift.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of this package's directory, used to locate the skill files. */
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Directory holding one subdirectory per skill. */
export const SKILLS_DIR = "skills";

/**
 * `source` stamped on every skill this package publishes.
 *
 * Providers use it to tell the model where a skill came from ("bundled",
 * "project-dsh", "custom"…). For a skill that exists only because this plugin is
 * loaded, the plugin name is the honest answer.
 */
export const SOURCE = "ofttold-memory";

/**
 * Parse the YAML frontmatter this plugin's own skill files use.
 *
 * Deliberately not a YAML parser. The contract these files must satisfy is the
 * harness's: a `name` matching `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` and a non-empty
 * `description`. Everything else is body text. Supporting anchors, flow
 * collections or multi-line folding would mean a dependency for a format this
 * package writes itself.
 *
 * @param {string} source - Full file text, frontmatter first.
 * @returns {{ fields: Record<string, string>, body: string } | undefined}
 *   Undefined when the file has no closed frontmatter block.
 */
export function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (match === null) return undefined;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (pair === null) continue;
    let value = pair[2].trim();
    // A quoted value is quoted because it contains punctuation the harness would
    // otherwise split on; unquoting is the only unescaping this format needs.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[pair[1]] = value;
  }
  return { fields, body: source.slice(match[0].length) };
}

/**
 * Load every skill shipped under `skills/`.
 *
 * A malformed file is skipped rather than thrown on: one bad skill must not stop
 * the plugin from loading, for the same reason a renamed heading must not stop a
 * session. The skip is returned so the caller can log it instead of guessing.
 *
 * @param {string} [root] - Package root; defaults to this package.
 * @returns {{ skills: Array<{ name: string, description: string, content: string }>, skipped: string[] }}
 *   Ready-to-register definitions plus the names of files that did not qualify.
 */
export function loadSkills(root = PACKAGE_ROOT) {
  const skills = [];
  const skipped = [];
  let entries;
  try {
    entries = readdirSync(join(root, SKILLS_DIR), { withFileTypes: true });
  } catch {
    // No skills directory is a valid package shape: a fork that only wants the
    // injection should be able to delete it without the plugin refusing to load.
    return { skills, skipped };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let source;
    try {
      source = readFileSync(join(root, SKILLS_DIR, entry.name, "SKILL.md"), "utf8");
    } catch {
      skipped.push(entry.name);
      continue;
    }
    const parsed = parseFrontmatter(source);
    if (parsed === undefined) {
      skipped.push(entry.name);
      continue;
    }
    const { fields, body } = parsed;
    const name = fields.name;
    const description = fields.description;
    // The same rules `ctx.skills.register()` enforces. Checking here turns a
    // thrown plugin into one skipped file with a name to report.
    if (name === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || description === undefined || description === "") {
      skipped.push(entry.name);
      continue;
    }
    skills.push({
      name,
      description,
      content: body.trim(),
      // `source` is load-bearing, not decoration. The registry's register-time
      // check ignores it; its load-time check (`validateDefinition`) throws
      // without it. Omitting it registers cleanly and then fails the first time a
      // model actually opens the skill — a half-working state with no symptom at
      // startup, which is the failure shape this package keeps running into.
      source: SOURCE,
      // No `path`: these are virtual skills. Pointing at the file inside the
      // installed package would invite edits that the next update silently
      // overwrites.
    });
  }
  return { skills, skipped };
}

/**
 * Publish the ritual into the session skill catalog.
 *
 * Called once from `apply`, because skills belong to the plugin context rather
 * than to any one session. A harness without the skill service simply gets the
 * injection and no catalog entry — the reading side still works, and the writing
 * side falls back to whatever else documents it.
 *
 * @param {any} ctx - Plugin context.
 * @param {boolean} enabled - False skips registration entirely.
 * @param {(message: string) => void} [warn] - Logger for skipped files.
 * @returns {string[]} Names registered, for diagnostics and tests.
 */
export function registerSkills(ctx, enabled, warn) {
  if (!enabled) return [];
  // `ctx.get` reads a service without an inject requirement, which is how an
  // optional dependency is expressed here: `skills` is not in `inject`, so a
  // harness that does not mount it must not be an error.
  const registry = typeof ctx?.get === "function" ? ctx.get("skills") : undefined;
  if (registry === undefined || typeof registry.register !== "function") return [];
  const { skills, skipped } = loadSkills();
  for (const name of skipped) warn?.(`skill "${name}" skipped: missing or invalid SKILL.md`);
  const registered = [];
  for (const skill of skills) {
    try {
      registry.register(skill);
      registered.push(skill.name);
    } catch (error) {
      // A duplicate name is already warned about by the registry; anything else
      // is a contract change worth seeing, and neither may fail the plugin.
      warn?.(`skill "${skill.name}" not registered: ${error?.message ?? error}`);
    }
  }
  return registered;
}
