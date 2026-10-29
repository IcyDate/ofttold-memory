# dsh-anchor-context

Keep a chosen slice of your own notes in **every** session's context.

The problem it solves is not storage — it's retrieval without a trigger. A note
sitting in a file is only useful if something puts it in front of the model at the
moment it's needed. "Remember to read the index at the start of every session" is
a request to behave reliably under a full attention budget, which is exactly the
condition where such requests fail. This plugin removes the request: it reads
named sections out of markdown files you already maintain and injects them as
standing context, once per session.

After that one injection the message stays in history, so every later turn can
see it. That's the whole trick.

## Install

```sh
dsh plugin --profile web add /absolute/path/to/dsh-anchor-context
```

The bundle's own `cordis.patch.yml` registers the row, so it activates without a
second edit. To point it at *your* files, add a row with the **same id** to the
profile's `cordis.patch.yml` — a profile row overrides the bundle row's config by
id, which is how every other DSH plugin is configured:

```yaml
- id: anchor-context
  name: dsh-anchor-context
  config:
    sources:
      - path: ~/notes/INDEX.md
        heading: "常被提起"
        maxChars: 600
        label: anchors
      - path: ~/.dsh/AGENTS.md
        heading: "意见与分歧"
        maxChars: 300
```

Nothing is hardcoded in the bundle patch on purpose: a patch pointing at one
machine's notes would make the plugin fail to start for everyone else.

Reload the session. Nothing else to configure.

## Config

| key | default | meaning |
| --- | --- | --- |
| `sources` | `[]` | Files and sections to keep visible. Empty disables the plugin without failing the load. |
| `header` | see below | First line of the injected block. |
| `maxChars` | `1200` | Per-section budget when a source omits its own. |
| `refreshIntervalMs` | `0` | Minimum milliseconds between injections. `0` = never refresh, inject once. |
| `refreshAfterMessages` | `0` | Re-inject after this many new messages. `0` = never. |
| `workspaceRelative` | `true` | Resolve relative `path`s against the session workspace. |

Each source takes `path` (absolute, `~/`-prefixed, or workspace-relative),
`heading` (exact heading text without the `#`; empty = whole file), `maxChars`,
and `label` (shown as the section heading in the block).

## Why `refreshAfterMessages` exists

A context compactor folds old messages into summaries. The injected block is an
old message, so a session that folds aggressively will eventually lose it. A
plugin that injects once and trusts that is fine until it isn't.

`refreshAfterMessages` re-injects when the conversation has grown past a
threshold. It's an approximation — folding rewrites the payload without adding
messages, so message count doesn't measure folding directly — but folding and
message growth correlate, and the cost of being wrong is one extra injection.

## What this deliberately does not do

No scoring, no decay curves, no emotion tags, no "importance" heuristic. Those
need judgement, and judgement is the thing that fails when attention is full.
This plugin only makes a **human-curated** list visible. You stay the author of
what matters; the plugin just stops the list from being invisible.

It also doesn't write anything back. Sources are read-only, and every field is
human config — the model cannot widen its own standing context.

## Behaviour on failure

A missing file, a renamed heading, or an unreadable directory is reported inside
the block as `Unavailable: <label>: <reason>` rather than thrown. The cost of a
silent skip is one absent reminder; the cost of a thrown plugin is the harness
refusing to boot. If **nothing** loads, the injection is skipped entirely instead
of spending tokens on a block that says only "nothing".

## Tests

```sh
npm test
```

Covers heading parsing (including fenced code blocks that contain `#`), exact-match
section extraction, line-boundary truncation, `~` expansion, missing files, and
the mixed success/failure rendering path.

## License

MIT.
