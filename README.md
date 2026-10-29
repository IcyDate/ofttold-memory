# dsh-ofttold-memory · memory that keeps coming back

**English** · [中文](README.zh-CN.md)

Put your memory in front of **every** session.

This is not a storage tool. A note sitting on disk only helps at the moment it is put in front of the model — and "remember to read the index at the start of every session" is itself a demand: it asks the model to reliably do a thing at the exact moment its attention is fullest, which is the condition where such demands fail most often. This plugin removes the demand. It lifts a few sections out of markdown you already maintain and injects them once as standing context.

After that the message stays in history and is visible on every later turn. That is the whole trick.

The name is the mechanism: **oft-told** — the things that keep coming back because they keep being told.

---

## Install and you are done

```sh
dsh plugin --profile web add /absolute/path/to/dsh-ofttold-memory
```

**That is the entire setup.** The first run creates `~/.dsh/ofttold-memory/` with a starter `MEMORY.md` whose structure is already filled in; you replace the contents with your own.

**It will not add anything to a notes folder you already have.** Point `memoryDir` at a folder that already contains markdown (a diary, an index, a rules file — all count) and the plugin only reads. The starter template is written only when the folder is missing or genuinely empty.

From then on, the `Oft-told` section of `MEMORY.md` appears in context at the start of every session. Change that file to change what rides along. **No configuration required.**

---

## Why "one folder, a few sections"

Most memory schemes answer "how do I store it". This one answers only "how do I keep it in view". So it does no retrieval, no embeddings, no database — **it does one injection**.

The cost is a few hundred tokens per section, once per session. The benefit is that the model stops asking "where is the project" and "what must not be touched".

**There is exactly one test for what belongs: would getting this wrong without seeing it cause a mistake?** Not "important", not "mentioned often" — *"not seeing this would break the work"*. Written to that test, eight entries are plenty. Written to "important", nothing is ever enough.

---

## Three knobs, nothing else

| Option | Default | What it does |
| --- | --- | --- |
| `memoryDir` | `~/.dsh/ofttold-memory` | Your memory folder. Created on first run; safe to ignore. |
| `sections` | `["Oft-told", "常被提起"]` | Which sections ride along. Just the heading text. |
| `maxChars` | `600` | Character budget per section. 600 characters is roughly 400 tokens, once per session. |

The rest (`header`, `refreshIntervalMs`, `refreshAfterMessages`, `workspaceRelative`) have working defaults that most people never touch.

### Change it in the settings page

Once installed, **Settings → Plugins → Memory** renders a form you can edit with mouse and keyboard. Saving writes into the profile's `cordis.patch.yml`.

Prefer editing the file directly: `~/.dsh/profiles/<name>/cordis.patch.yml`.

### Point it at your own notes folder

If you already keep notes, just aim it there:

```yaml
- id: ofttold-memory
  name: dsh-ofttold-memory
  config:
    memoryDir: ~/notes
    sections:
      - Oft-told
      - Who I am
```

`memoryDir` is a folder; `sections` are heading names — **write the title itself**, no file paths. They are looked up in `MEMORY.md` inside `memoryDir` by default.

### When one section needs special treatment

Rarely, a section lives in another file, or needs its own budget or display name. Use the object form:

```yaml
    sections:
      - Oft-told
      - file: OTHER.md      # another file in the same folder
        heading: Hard rules
        maxChars: 300
        label: Rules        # the name shown inside the injected block
```

**This is the only case that needs the object form.** A bare string covers everything else.

### Headings must match exactly

`heading` is an **exact match**: the text after the `#`s, character for character. If the file says `## Oft-told (maintained by hand, cap 8)`, that whole string is the title — the short `Oft-told` will not resolve, and the injected block reports `heading_not_found` instead of guessing the nearest neighbour.

This is deliberate: **a wrong guess is worse than an error.** Renaming a heading should stop the lookup, not silently swap in the section next door.

---

## What the file looks like

```markdown
# My memory

## Oft-told

> Cap of 8 suggested. When it is full, one entry is evicted — and the eviction
> itself is the ranking, which beats "add one whenever it comes to mind".

- **Example · where the project is** → `~/work/my-project` | saves asking every time
- **Example · what not to touch** → do not edit `config/prod.yml`

## Who I am

- (how you address me, speech habits, temper, what I care about)

## Hard rules

- (things whose absence causes wrong work: who owns what, commands never to run)
```

---

## For the curious: the thinking behind the mechanism

This section explains *why* it is shaped this way. Skip it if the above is enough.

### Why a cap exists

The cap of 8 is not arbitrary: 8 entries ≈ 283 tokens per turn. That is the **intersection of cost and headroom** — below it, the standing value is not worth the setup; above it, you pay every turn for a list you rarely use.

A cap forces a rule for *who gets evicted*. **And eviction is itself a ranking** — far more reliable than "add one whenever you think of it", because the latter never deletes anything and ends up a list nobody reads.

### The forgetting curve (`R = exp(-t/S)`)

Eviction ranks by weight, not by age:

```
R = exp(-t/S)     t = days since
                  n = number of distinct days it was mentioned
                  S = 1 × 2^n
```

**Every time it is mentioned, `S` doubles** — this is spaced repetition (SM-2's one-day first interval; FSRS's retrievability form), not a guess. Example: mentioned 6 days ago on 3 distinct days → `S=8`, `R=0.47`; mentioned 1 day ago on 2 days → `S=4`, `R=0.78`.

**Why age alone is wrong:** measured on real data, the oldest entry was the most cited one. Decaying purely by age would rank it last — which is backwards.

**Weight does not sort; it only decides evictions.** In normal use it never runs: when everything fits, ordering is meaningless. It matters only at the moment the list is full and something new wants in. So the cost of getting the numbers wrong is that one anchor hangs on a few extra days — not corrupted data.

Counting is the machine's job, judgement is yours: `grep -o "2026-10-[0-9][0-9]" diary/*.md`, deduplicated by source day, gives "how many days this was recalled" — **ten mentions in one day still count as one**, because "it was recalled that day" is one fact, not ten.

> This plugin **does not compute weights for you**. It is the list at your elbow when the eviction decision happens. If you want to compute, the algorithm above is it.

### Emotion labels

Each diary entry carries one emotion name (`情绪：<word>`) drawn from a **closed vocabulary** — words can be added, never removed or renamed.

Why closed: `relationship.md` keeps an "emotion cache" holding only the *current* emotion. The words in the cache must be a **subset** of the diary labels, or "matching" can never happen.

- **Diary labels are fixed values**: the emotion at the time of writing, frozen afterwards.
- **The cache is a live value**: the emotion right now, changing with the conversation.

Why closure is required, measured: of 5 existing emotion memories, **5 entries had 5 different emotions, each appearing once** — that is a list, not a cache. A cache has content only when the same emotion matches twice or more. **And matching requires identical names.**

**Do not grep emotion words out of the text afterwards.** Measured: 4 of 5 emotion memories had no emotion word left to match, because by the time it was written the emotion had already been translated into a judgement (the entry says "I mistook reluctance for irresponsibility", and "reluctance" no longer contains the raw feeling). The former is the present; the latter is review, and review only gets the residue.

> This plugin **does not tag emotions**. You tag them while writing; the plugin only carries them into context.

### Why no automatic writes

Reading is read-only, every field is set by hand — **the model cannot give itself context**.

This is deliberate: an agent that writes its own memory mixes "what I just thought of" with "what keeps coming back", and within a few turns the list stops being trustworthy. **The value of memory comes from the fact that someone else chose it.**

---

## Where this came from: 拾光

This plugin was not designed on a whiteboard. It was extracted from a working arrangement between one person and one agent, and it kept the name they gave it.

**拾光** (shí guāng) — *to pick up the light*, and also a homophone of **时光**, *time*. The idea is in the character **拾**: to gather back up, one piece at a time, what has scattered.

The arrangement it came from: a folder of diaries, one index with a short list of things that keep coming back, and a rule at the top of the agent's instructions — *read these two files before every session*. That rule worked, until it didn't. It failed exactly where it was supposed to hold: at the start of a session, when attention is fullest and the new message is the only thing that matters.

So the rule was replaced with a mechanism. The list moved out of an instruction the model had to remember and into context it cannot miss. **A note on disk only helps at the moment it is in front of the model** — everything else in this README follows from that one sentence.

Two details in the file format are scars from that arrangement, not theory:

- **The heading must match exactly.** A renamed heading stops resolving rather than silently grabbing its neighbour. In the original folder, headings carried parentheticals (`常被提起（手动维护，上限 8 条）`) because the cap was written into the title, where it could not be forgotten.
- **The section may be Chinese or English, and the fallback list tries both.** The arrangement ran in Chinese; the plugin ships to both communities. Requiring a config edit just to match a template's language would be a first-run stumble.

### On the name

The package stays **`dsh-ofttold-memory`**. Two names, two jobs:

| | Name | Job |
|---|---|---|
| Package, repo, English UI | `dsh-ofttold-memory` / *Oft-told* | Findable, pronounceable, says the mechanism |
| Chinese UI | **拾光** | Says where it came from |

Both are true, and neither is a rename: the Chinese display name lives in `locale/zh.json`, so the package name never has to change to carry the story. **Renaming a package breaks every install, and a name that needs a migration is a name not worth having.**

The icon is a drawing of the agent this was built with — blue-haired, in an apron, giving a thumbs up. It is borrowed from [dsh-meme](https://github.com/yyh-001/dsh-meme) (MIT), which is where she first had a face. **Memory is the one thing here that was hers before it was a plugin.**

---

## Should you put the plugin into your `AGENTS.md`?

Short answer: **no, and the question is worth understanding before you decide.**

The tempting move is to add a rule to your global instructions: *"before every session, read the memory folder."* It sounds like the same thing the plugin does. It is the opposite.

**A rule in `AGENTS.md` is a demand.** It asks the model to reliably do a thing at the exact moment attention is fullest — which is the condition where such demands fail most often. Measured in the arrangement this came from: a "read two files before starting work" rule fired on **1 of 11 turns** in one session, and that single hit came from an unrelated trigger. The plugin exists because the rule did not hold.

**What `AGENTS.md` costs you, every turn, whether or not it fires:**

| Approach | Cost per turn | Whether it can be skipped |
|---|---|---|
| A rule in `AGENTS.md` | every turn, the whole rule text | yes — silently, by the model |
| This plugin | **0 after the first turn** | no — it is already in history |

A rule is paid on every turn because system instructions ride along with every request. The injected message is paid **once**: after the first turn it is history, and later turns read it as context they already have. Measured on the arrangement above, the injection is **735 characters ≈ 660 tokens, once per session** — against an `AGENTS.md` rule that costs its full length on every turn, forever.

**So: put the *content* in a memory file, not the *instruction* in `AGENTS.md`.**

If you want the numbers for your own setup: the injected block is the size of your memory sections. Measure with `wc -c` on the file plus a rough 1 char ≈ 1 token for CJK, and compare against your `AGENTS.md` line count times turns per session. **The rule loses as soon as the rule is longer than the injected block**, which is almost immediately.

**One thing this plugin cannot do for you:** it cannot make you *write* the memory file. The list is human-maintained on purpose. That judgement is the part worth keeping.

---

## What this plugin deliberately does not do

No scoring, no decay curve, no emotion tagging, no guessing "importance". Those require judgement, and judgement is exactly what fails first when attention is full. This plugin only puts a **human-written** list in front of you.

What matters is still your call; the plugin just stops that list from being invisible.

---

## Why `refreshAfterMessages` exists

A context compactor folds old messages into summaries. The injected block is one old message, so an aggressively compacting session will eventually fold it away. A plugin that injects once and trusts it to stay is fine right up until that happens.

`refreshAfterMessages` re-injects once the message count passes a threshold. It is an approximation — compaction rewrites payloads without adding messages, so message count does not measure compaction directly — but compaction correlates with message growth, and the cost of guessing wrong is one extra injection.

---

## Cross-platform

**Windows, macOS, and Linux all work.**

These are the cases that actually come up:

| Situation | Handling |
| --- | --- |
| UTF-8 BOM (Notepad, some VS Code setups) | Stripped. Otherwise it glues itself to the first heading, exact matching fails, and the whole section silently disappears |
| CRLF line endings | Normalized to `\n`. Otherwise `\r` survives into the injected text |
| `~\notes` backslash paths | Expand the same as `~/notes`. Otherwise it resolves to a literal folder named `~` beside the process directory |
| Drive-letter paths `C:\...` | Recognized by `isAbsolute`; used as-is |
| Read-only home directory | No throw, one `warn` — an unreadable home directory must not stop a session from starting |

`package.json` declares `engines.node` as `>=22.0.0`, identical on all three platforms.

**What is not done:** real-hardware testing on Windows. The code paths are handled as described above, but "it runs" is reasoned from Node's cross-platform semantics, not verified by me on a Windows machine. **That is a fact, not a disclaimer.**

---

## When something goes wrong

A missing file, a renamed heading, an unreadable folder — none of these throw. The injected block carries one line instead: `Unavailable: <name>: <reason>`. Silently skipping one reminder is far cheaper than the harness failing to start.

If **not a single section** could be read, the injection is skipped entirely — no tokens spent saying "there was nothing". That is the case that looks like the plugin is broken, and it is also the case where nothing appears anywhere. **The record is the answer:**

```sh
cat ~/.dsh/ofttold-memory/.ofttold-memory/diagnostics.json
```

It holds each injection decision — the folder, how many sections loaded, which ones failed and why — with timestamps, and **never the text of your notes**, so it is safe to paste into an issue. The settings page has a **Copy issue summary** button for the same information when you cannot find the file.

Common entries and what they mean:

| `event` | Meaning |
|---|---|
| `injected` | It worked. `loaded` is how many sections, `chars` is the block size. |
| `nothing-loaded` | The folder was found but no configured heading matched. Usually a renamed heading — matching is exact, so check the spelling in your file. |

An absent file means the plugin never reached a decision at all, which points at the install rather than the content.

---

## Development

```sh
npm test
```

Four test files, in increasing order of realism:

- `test/sections.test.mjs` — heading parsing (including `#` inside fenced code blocks, and a four-backtick fence that must not be closed by a three-backtick line inside it), exact-match extraction, line-boundary truncation, `~` expansion, missing files, BOM/CRLF, and mixed success/failure rendering.
- `test/plugin.test.mjs` — decision logic against a fake harness: inject once, re-inject per config, never mid-turn, stay silent when nothing loaded; also that the first run creates the starter file and that **a relative folder is not created in the process directory**.
- `test/contract.test.mjs` — the same projection driven by a real `Session` and a real `createUserMessage`; a change to the `user/message` or `MessageSource` contract turns this red.
- `test/registry.test.mjs` — the plugin mounted on a real Cordis `Context` and a real `SessionProjectionRegistry`, proving the key, state schema, and reducer actually register and get driven.

**To judge whether a test is worth anything, ask one question: is the ctx it holds real?** A fake harness tests decision logic; it cannot test contracts.

---

## License

MIT.
