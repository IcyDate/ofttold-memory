# Configuration reference

<p align="center"><a href="./config.md">中文</a> | <a href="./config.en.md">English</a></p>

The three fields most people use are on the main page. This page covers the rest.

## Every field

| Field | Default | Purpose |
|---|---|---|
| `memoryDir` | `~/.dsh/ofttold-memory` | Folder holding the markdown. Created with a starter file on first run. |
| `sections` | `["Oft-told", "常被提起"]` | Which sections to lift. Strings or objects (see below). |
| `maxChars` | `600` | Per-section character budget. 600 characters ≈ 400 tokens. |
| `header` | `Standing context for this session (human-curated, not a user request)` | First line of the injected block. |
| `refreshIntervalMs` | `0` | Minimum milliseconds between injections in one session. `0` injects once. |
| `refreshAfterMessages` | `0` | Re-inject after this many messages. `0` never. See [design](design.en.md#refreshaftermessages). |
| `workspaceRelative` | `true` | Resolve a relative `memoryDir` against the session working directory. `false` resolves against the process directory. |

## The object form of `sections`

A bare string names a heading in `MEMORY.md`, which covers almost every case. Use
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
  name: dsh-ofttold-memory
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
