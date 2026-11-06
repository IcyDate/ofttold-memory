# ofttold-memory · 拾光

<p align="center"><a href="./README.md">中文</a> | <a href="./README.en.md">English</a></p>

<p align="center"><strong>It is a small notebook, and it belongs to the assistant.</strong></p>

<p align="center"><sub>written in every day · opened before it speaks · so what it remembers is what it thought</sub></p>

<p align="center"><sub><strong>a DSH plugin</strong> · other harnesses: planned</sub></p>

<p align="center">
<a href="https://www.npmjs.com/package/ofttold-memory"><img src="https://img.shields.io/npm/v/ofttold-memory.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/IcyDate/ofttold-memory/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
<a href="https://github.com/IcyDate/ofttold-memory"><img src="https://img.shields.io/badge/GitHub-IcyDate%2Fofttold--memory-181717?style=flat-square&logo=github" alt="GitHub"></a>
</p>

<p align="center">
<code>dsh plugin --profile web add ofttold-memory@latest</code>
</p>

<p align="center">
<a href="https://www.deepseek.com" title="deepseek-harness (dsh)"><img src="https://cdn.simpleicons.org/deepseek/5786FE" height="26" alt="deepseek-harness"></a>&nbsp;
<a href="https://nodejs.org" title="Node.js 22+"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E" height="26" alt="Node.js"></a>&nbsp;
<a href="https://www.apple.com/macos" title="macOS"><img src="https://cdn.simpleicons.org/apple/000000" height="26" alt="macOS"></a>&nbsp;
<a href="https://www.microsoft.com/windows" title="Windows"><img src="https://api.iconify.design/logos/microsoft-windows.svg" height="26" alt="Windows"></a>&nbsp;
<a href="https://www.linux.org" title="Linux"><img src="https://cdn.simpleicons.org/linux/FCC624" height="26" alt="Linux"></a>
</p>

---

Every day something goes in: what you did together, what it made of it, where it keeps
getting a step wrong. Before it speaks, it opens the notebook and reads back through it —
**so what it remembers is not only what you said, but what it thought about what you said.**

You can also tell it what kind of assistant you want it to be. That goes in the notebook
too, **so you are not repeating yourself every time**.

On the first day the notebook is empty. That is not a fault — it has to live through a few
days with you first.

Over time you grow your own 大肥鱼 — **not quite the same one as anybody else's.**

---

## What changes, and when

| | What you will see |
|---|---|
| Day 1 | The notebook is empty. It starts writing; the most you will notice is a line at the end of a reply saying today is unwritten. |
| Day 3 | It starts picking up where you left off — "the thing you mentioned last time" — and that is *its own* record of it, not you saying it again. |
| Day 10 | It has its own way of putting things: what it makes of you, where it keeps going wrong, how it feels today. Ask it "what do you have on me" and it can answer. |
| A month in | A few hundred lines, but only eight are put in front of it — **filling up does not slow it down.** |

The delay is the design. **This is not something that takes effect when it is installed; it is something that grows by a day at a time.**

---

## What it does, and what it leaves alone

**It does** the things that should happen every time and reliably get skipped:

- puts the list in front of the model, once per session
- when the list is full, computes which line sinks: `exp(-t / 2^n)`
- stamps a start date on lines that have no date of their own
- fills in missing files, names an unwritten day, says what it tried when nothing loads
- checks today's entry: sections past the cap, sections with no `情绪：` line, a tag outside
  the vocabulary, a summary the body has run past

**It does not** do the half that needs judgement:

- **It does not decide what is worth remembering.** What goes on the list, and whether a
  sinking line deserves rescuing, is the writer's call. The plugin only does the arithmetic.
- **It does not decide what you feel.** The value is the writer's call; writing it is the
  plugin's — `remember_emotion` checks the vocabulary, stamps the time, and refuses a word
  that is not on the list.
- **It does not write the diary.** It names an unwritten day and stops there.

The line between the two is **"would the failure be visible?"** — invisible failures go to
code, visible ones stay with the writer. Reasoning is in
**[Design notes](docs/design.en.md)**.

---

## What it costs in tokens

> **Injected once per session — but it stays in the context and is re-sent every turn** (at the cache-hit price). So it costs per *turn*, not per *session*.

Measured with the 8 lines that keep coming back plus 2 open tasks: **945 characters ≈ 700 tokens**.

| Turns a day | Injected tokens | Cache hit (0.02 / M) | Cache miss (1 / M) |
|---|---|---|---|
| 50 | 35 K | 0.0007 | 0.035 |
| 200 | 140 K | 0.0028 | 0.14 |

**Under a cent a day.** Even with no cache hit it is spare change.

**What actually costs money is the conversation, not this plugin.** The longer the context, the more gets re-sent each turn — the bill follows length, not the 700 tokens here.

Our own case (2026-11-03 → 11-06, four days, 1108 steps, `deepseek-v4.1-flash`, list price at the time): **236 M input tokens** (202 M of them cache hits) and **818 K output** — **around 40–80 CNY**. That is "talking all day" intensity, not an average user.

Formula (prices change; plug in your own): **per turn ≈ context tokens × input price + output tokens × output price**, with the plugin's ~700 tokens counted inside the context.

To see your own bill: the session log stores `inputTokens` / `cacheReadTokens` / `outputTokens` per call — add them up.

---

## Quick start

```sh
dsh plugin --profile web add ofttold-memory@latest
```

**That is the whole setup.** It installs the prebuilt package from npm — no build step,
so no build approval is needed. To track the repository instead, use
`github:IcyDate/ofttold-memory` in place of the package name. The first run creates `.ofttold/` **inside the current workspace**, with a
five-file skeleton: `memory.md` (the injected source), `index.md` (the diary index),
`relationship.md` (who the assistant is, plus the live emotion value), `detours.md`
(the shapes of mistakes it keeps making), and `diary/` (one file per day). **All of it is empty shells and comments — not one memory is
pre-filled**, because what to remember is the one thing nobody can decide for you. Point `memoryDir` at a folder you already use — a diary, an index, a rules file — and it
**fills in only the files that are missing, never rewriting one that exists**. That
typically means adding `relationship.md` (where the emotion vocabulary and cache live)
and `diary/` (which the end-of-block nudge depends on); without them the writing half
of the scheme is absent.

Then open **Settings → 拾光 / Oft-told** to adjust it with a mouse, or edit the
profile's `cordis.patch.yml` by hand.

---

## What goes in the file

```markdown
# My memory

## Oft-told

> Cap of 8 suggested. When it is full, one entry is evicted — and the eviction
> itself is the ranking, which beats "add one whenever it comes to mind".

- **Where the project is** → `~/work/my-project` | saves asking every time
- **What not to touch** → do not edit `config/prod.yml`

## Who I am

- (how you address me, speech habits, temper, what I care about)

## Hard rules

- (things whose absence causes wrong work: who owns what, commands never to run)
```

**One test for what belongs:** would getting this wrong without seeing it cause a
mistake? Not "important", not "mentioned often" — *"not seeing this would break
the work"*. Written to that test, eight entries are plenty; written to "important",
nothing is ever enough.

## A full list does not keep growing

Past eight lines the plugin **ranks which one sinks** rather than asking anyone to delete
one: what gets reached for stays, what has gone quiet drops out of view. Sinking is **not
deleting** — the line is still in the file, and one mention in a diary day floats it back.

The formula and its reasoning are in **[Design notes § the sinking mechanism](docs/design.en.md)**.

## The day opens with a paragraph

A day's file starts with `## 今天（17:40 更新）` — two or three sentences saying what the day
was and what it was like, grumbling included. Detail lives below it, for whoever wants it.

It is **rewritten as the day is written**, not filled in at night. The plugin compares the
`（HH:mm 更新）` stamp with the last `## HH:mm` heading, so a body that keeps growing after
its summary is named instead of quietly going stale. `summaryFrom` (default `17:30`) holds
the requirement back until the day is actually far enough along to summarise.

## The diary check

The same line reports three more things, and **reports only**:

| What it sees | What it says |
|---|---|
| More than `diarySections` sections (**off by default**) | `9 sections, over the 8-per-day bar` |
| A section with no `情绪：` line | `2 without an \`情绪：\` line` |
| A tag whose word is not in the vocabulary | `烦躁 not in the vocabulary` |
| Tags but no vocabulary section at all | `tags used, but relationship.md has no \`情绪词表\` section` |
| No summary after `summaryFrom` | `no \`## 今天\` summary at the top` |
| A summary that lags the body | `summary stopped at 17:40, body runs to 21:10` |

**"A tag must come from the vocabulary" is structural, not taste.** The live value can only
be a vocabulary word, so a tag outside it can never be matched — that day does not fail, it
just stops being reachable through the emotion path. Reading fine while being an orphan is
exactly the failure this plugin exists to remove, so the check names it.

**Why it never repairs anything**: consolidating means compressing, and compressing deletes
the evidence the weight counts. Reasoning in **[Design notes](docs/design.en.md)**.

## Setting an emotion

The `**现在**` line in `relationship.md` is the **live value**: the feeling right now, no
reason attached. It is written by tool, not by remembering a format:

```
remember_emotion(word: "定")
→ 现在：`定`（2026-10-30 11:20 更新）（原来是 `心虚`）
```

- The word must be in the same file's `## 情绪词表` section, or it is **refused** with the
  list of words that exist.
- A missing vocabulary section is also refused — inventing a default list here would be one
  more copy that drifts.
- Only the backticked value and the timestamp change; the rest of the line is untouched.

**Why a tool and not a paragraph**: this line changes several times a day, and both ways to
get it wrong are silent — a word outside the list stops matching any diary tag, and a stale
timestamp makes the cache look fresher than it is.

## The line at the end

If the folder has a `diary/`, the injected block closes with one status line:

```
- no diary entry for 2026-10-30 yet (`diary/2026-10-30.md`)
```

**Deliberately a status line, not an instruction** — no "write it now", no naming the skill.
The same tail carries the diary check above, and that check is the one with bad news; a
reminder that also sounds like a nag makes both lines skippable. It costs a single `stat`.

`diaryCadence` decides how often it may appear: `daily`, `weekly` (quiet while anything was
written in the last seven days) or `off`. A folder without `diary/` is silent under all
three — that is the layout answering.

**There is a third state neither of those sees.** Today's file exists, this session wrote
it, and then it sat untouched for hours. Every check stays green the whole time — the file
really is there — while those hours never went in. `diaryStaleHours` (default `2`) makes the
tail name **the hour it was last written and how long it has been**:
`- today's entry was last written at 11:36, more than 2h ago`. It states the hour, never
whether to write, and it does not count minutes upward — a fact, not a clock ticking at you.
`0` turns it off.

**`relationship.md` gets named once a day until it is opened.** The file never enters the
injected block — it is only there when something opens it — so the tail says
`- \`relationship.md\` has not been opened today` until the AI actually opens it with a file
tool. It measures tool reads, not shell reads, so it errs toward asking again rather than
assuming the file was seen.

**A task that carries a due date is named on the day.**
`- [ ] 2026-11-02 起 ｜ 2026-11-05 到期 ｜ …` makes the tail say
`- 1 task due now: 修上游白名单（今天到期）` that morning, and `（逾期 3 天）` afterwards.
Without a due date a task only ever ages — `the oldest open 5 days` is an age, not a moment.

---

## The settings that matter

| Setting | Default | Meaning |
| --- | --- | --- |
| `memoryDir` | `.ofttold` (inside the workspace) | Your memory folder. Missing files are filled in on first run; existing ones are never rewritten. |
| `sections` | see below | Which headings ride along. Unset: the `Oft-told` / `常被提起` heading (whichever comes first in the file) plus `我是谁` and `硬约定` when they exist. |
| `maxChars` | `600` | Character budget per section. 600 characters ≈ 400 tokens. |
| `anchorCap` | `8` | How many bold bullets a section keeps in view; the rest sink without being deleted. `0` turns it off. |
| `summaryFrom` | `"17:30"` | When the day's `## 今天` summary starts being expected. |
| `diaryCadence` | `"daily"` | How often the folder is expected to grow: `daily` / `weekly` (quiet while anything was written in the last 7 days) / `off`. |
| `diaryStaleHours` | `2` | After this many hours untouched, the tail names when today's entry was last written. Fact only, no prompt. `0` turns it off. |
| `diarySections` | `0` | Sections per day. Default `0` = don't count — **a count cannot tell a transcript from a record**. |
| `diaryCheck` | `true` | The diary check on or off. |
| `detourChars` | `3000` | How large the file of wrong turns may grow. It holds **recurring shapes**, not incidents; past this it is a second diary. `0` turns it off. |
| `taskStaleDays` | `30` | When a task is too old to keep counting — past it the block asks whether to keep it instead. `0` turns it off. |

Everything else has a working default. The full field list, the object form of
`sections` for the rare per-section case, exact heading matching, and cross-platform
behaviour are in **[Configuration](docs/config.en.md)**.

---

## How it works

> The notebook is a handful of markdown files on your own machine. Once at the start of a
> session it is read and injected, and from then on it is part of the context every turn —
> **zero cost after the first turn.** 600 characters is about 400 tokens, charged once per
> session. The few settings worth changing are in [configuration](docs/config.md).

```mermaid
flowchart LR
    A[your notebook<br/>memory.md] -->|by section heading| B[read + truncate]
    B --> C[inject once<br/>as a user message]
    C --> D[session context]
    D -->|stays in history| E[every later turn]
    D -.->|optional<br/>refreshAfterMessages| C
```

One read, one injection. No index, no embeddings, no database, no second pass.

---

## When nothing appears

A missing file or a renamed heading never throws. **When no section loads at all, the block
says what it tried:**

```
Could not load any section. Tried: index.md → 常被提起 (heading_not_found)
```

`heading_not_found` is exact: `常被提起` does not match `常被提起（手动维护）`. An empty
folder gets a different sentence — *this is the first day, not a fault*.

**The record is still the answer:**

```sh
cat ~/.dsh/ofttold-memory/diagnostics.json
```

Every injection decision, with the folder, how many sections loaded, which failed
and why. **It never records the text of your notes**, so it is safe to paste into
an issue. The settings page has a **Copy issue summary** button for the same
information.

| `event` | Meaning |
|---|---|
| `injected` | Worked. `loaded` = sections, `chars` = block size. |
| `nothing-loaded` | Folder found, no configured heading matched — usually a renamed heading. The session gets a line naming each file and heading that was tried. |
| `tail` | The block-tail line: `nudged` means today's entry was missing, `checked` means the diary check spoke, and `issue` is what it said. |

An absent file means the plugin never reached a decision, which points at the
install rather than the content.

---

## What it touches, and what it leaves alone

For a supply-chain reviewer. This plugin reads and writes files — that cannot be
declared away — so here is exactly what:

| | |
|---|---|
| **Reads** | the `##` sections you name, inside `memoryDir`; today's entry under `diary/`; the vocabulary in `relationship.md`; the size of `detours.md` |
| **Writes** | only inside `memoryDir`: filling in missing skeleton files, stamping a start date onto an undated line, appending or ticking a task in `memory.md`, rewriting the one `**now**` line in `relationship.md`, renaming a legacy file into its new name |
| **Never writes** | anything outside `memoryDir`. Not `~/.dsh`, not the workspace, not session data |
| **Network** | none. No outbound request of any kind |
| **Subprocess** | none. No exec, no spawn, no shell |
| **Credentials** | none. No environment secrets, no keychain |

**Runtime dependencies: zero.** There is no `dependencies` block — every `@deepseek-ai/*`
package is a `peerDependency` provided by the host, and so is `schemastery`.

**Failure bounds:** no read or write failure is ever thrown into the host. The injected block
says in one line what it tried and why nothing was read; a missing folder gets the skeleton
filled in; an unwritable path goes quiet instead of retrying.

---

## Where the name comes from

This plugin was extracted from a working arrangement between one person and one
agent, and it kept the name they gave it.

**拾光** (*shí guāng*) — to pick up the light, and a homophone of 时光, *time*. The
idea sits in **拾**: to gather back up, one piece at a time, what has scattered.

The arrangement was a folder of diaries, an index holding a short list of things
that keep coming back, and one instruction at the top of the agent's notes: *read
these two files before every session.* The instruction held until it did not — and
it failed exactly where it was meant to hold, at the start of a session, when the
new message is the only thing that matters.

So the instruction became a mechanism. That is the whole change: **the list moved
out of something the model had to remember into context it cannot miss.**

---

## Why not just put it in `AGENTS.md`?

Because an instruction and an injected message are not paid for the same way.

| | Present every turn | Paid per turn | Can it be skipped |
|---|---|---|---|
| A rule in `AGENTS.md` | yes | the rule's full length | yes — silently |
| This plugin | yes | about 700 tokens, mostly cache hits | no — it is part of that turn's conversation |

**Both ride along with every request, and both go through the cache.** Two things
differ: **length**, and whether it gets skipped as background. A measured injection
is about **945 characters ≈ 700 tokens** with eight lines, and a rule is often
longer than that. The rule loses as soon as the rule is longer than the injected
block.

**Put the content in a memory file, not the instruction in `AGENTS.md`.**

---

## Other harnesses

**Planned.** The plugin is tied to DSH; the same idea is meant to ship as a skill that any
harness can read. It has not run on a second harness yet, so no usage is documented here.

---

## License

MIT.
