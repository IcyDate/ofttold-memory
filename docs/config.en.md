# Configuration reference

<p align="center"><a href="./config.md">中文</a> | <a href="./config.en.md">English</a></p>

The three fields most people use are on the main page. This page covers the rest.

## Every field

| Field | Default | Purpose |
|---|---|---|
| `memoryDir` | `.ofttold` (inside the workspace) | The memory folder. **The default sits inside the session's workspace** — the assistant writes the diary, the index and `relationship.md` with its own file tools, and those can only write the workspace under the default file policy. Outside it the write is refused, and the symptom is a diary that is never written. Point it elsewhere and that folder must be writable too. Created on first run with a five-file skeleton (`memory.md` / `index.md` / `relationship.md` / `detours.md` / `diary/`). A folder that already holds notes gets nothing added. |
| `sections` | unset = the `Oft-told` / `常被提起` heading (whichever appears first) + `我是谁` + `硬约定` | Which sections to lift. Strings or objects (see below). Once set, only what you name. |
| `maxChars` | `600` | Per-section character budget. 600 characters ≈ 400 tokens. |
| `anchorCap` | `8` | How many bold bullets a section keeps in view. The rest sink — ranked by `exp(-t / 2^n)`, kept in the file, no longer injected. `0` turns it off. **The character budget is derived from it** (cap × longest line × 1.25 + the sinking note), so `maxChars` does not need to be raised alongside it; an explicit per-section `maxChars` still wins. |
| `summaryFrom` | `"17:30"` | When the day's `## 今天` summary starts being expected. Before this hour the check stays quiet. |
| `diaryCadence` | `"daily"` | `daily` names today when unwritten, `weekly` stays quiet while anything was written in the last 7 days, `off` never speaks. |
| `diarySections` | `0` | Sections per day before the check names it. **`0` is the default: off.** A busy day has more sections than a quiet one, so the count says nothing about whether the entry is a transcript. |
| `diaryCheck` | `true` | Report sections past the cap, sections with no `情绪：` line, a missing summary, or a summary the body has run past. Reports only — consolidating deletes the evidence the weight counts. |
| `detourChars` | `3000` | How large `detours.md` may grow. It is meant to hold the *shapes* of recurring mistakes — a few hundred characters. Past two or three thousand it is a second diary. `0` turns it off. |
| `taskStaleDays` | 30 | How long a task may stay open before the block stops counting it and asks whether to keep it. `0` keeps it quiet. |
| `header` | `Standing context for this session: notes you wrote, for the person you work with. Read them as your own memory, not as background documentation. Maintaining the folder — index, self-description, diary — is the `ofttold-ritual` skill; when the tail of this block says today is unwritten, that skill says what to write.` | First line of the injected block. |
| `refreshIntervalMs` | `0` | Minimum milliseconds between injections in one session. `0` injects once. |
| `refreshAfterMessages` | `0` | Re-inject after this many messages. `0` never. See [design](design.en.md#refreshaftermessages). |
| `workspaceRelative` | `true` | Resolve a relative `memoryDir` against the session working directory. `false` resolves against the process directory. |
| `skills` | `true` | Publish the two writing-side skills (`ofttold-memory` for which sections, `ofttold-ritual` for how to write) into the session skill catalog. Off does not affect injection. |

## The object form of `sections`

A bare string names a heading in `memory.md`, which covers almost every case. Use
the object form when a section lives in another file, needs its own budget, or
should display under a different name:

```yaml
sections:
  - Oft-told
  - file: OTHER.md      # another file in the same folder
    heading: Hard rules
    maxChars: 300
    label: Rules        # the name shown inside the injected block
```

`heading` is required and is an **exact match** against the text after the `#`s.
`file`, `maxChars`, and `label` are optional.

### Exact matching is deliberate

If the file says `## Oft-told (maintained by hand, cap 8)`, that entire string is
the heading. The short `Oft-told` will not resolve, and the injected block reports
`heading_not_found` rather than guessing the nearest neighbour.

A wrong guess is worse than an error. A renamed heading should stop the lookup, not
silently swap in the section next door.

## Editing the profile directly

The settings page writes to the profile's patch file. Editing it by hand is
equivalent:

```yaml
# ~/.dsh/profiles/<name>/cordis.patch.yml
- id: ofttold-memory
  name: ofttold-memory
  config:
    memoryDir: ~/notes
    sections:
      - Oft-told
      - Who I am
```

The settings page reflects whatever the Host serves, so a hand edit shows up there
after a restart.

## Cross-platform notes

| Situation | Handling |
|---|---|
| UTF-8 BOM (Notepad, some VS Code setups) | Stripped. Otherwise it glues to the first heading, exact matching fails, and the section disappears |
| CRLF line endings | Normalized to `\n`; otherwise `\r` survives into the injected text |
| `~\notes` backslash paths | Expand like `~/notes`; otherwise they resolve to a literal folder named `~` beside the process directory |
| Drive-letter paths `C:\...` | Recognized as absolute; used as-is |
| Read-only home directory | No throw, one warning — an unreadable home must not stop a session |

`package.json` declares `engines.node` as `>=22.0.0` on all platforms.

These are the cases where the three platforms genuinely differ. Each one is
covered by a test, and `package.json` pins the same Node floor everywhere.

## How it is tested

```sh
npm test
```

Four suites, in increasing order of realism:

| File | What it proves |
|---|---|
| `test/sections.test.mjs` | Heading parsing (including `#` inside fenced code blocks and a four-backtick fence that a three-backtick line must not close), exact-match extraction, line-boundary truncation, `~` expansion, missing files, BOM/CRLF, mixed success and failure rendering, volatile config references, diagnostics |
| `test/plugin.test.mjs` | Decision logic against a fake harness: inject once, re-inject per config, never mid-turn, stay silent when nothing loaded; the first run creates the starter file, and **a relative folder is not created in the process directory** |
| `test/contract.test.mjs` | The same projection driven by a real `Session` and a real `createUserMessage`; a change to the `user/message` or `MessageSource` contract turns it red |
| `test/registry.test.mjs` | The plugin mounted on a real Cordis `Context` and a real `SessionProjectionRegistry` |
| `test/client.test.mjs` | The browser half loaded the way the module loader does: what it registers, that it does not hard-depend on `configForms`, that the settings section and the plugin card share one form, and that every key the panel asks for exists in both inline dictionaries |
| `test/form-model.test.mjs` | The real `SettingsFormModel` from the shipped frontend bundle, driven by the real `client.js` |

**To judge a test, ask one question: is the ctx it holds real?** A fake harness
tests decision logic; it cannot test contracts.
