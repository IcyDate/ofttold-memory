---
name: ofttold-ritual
description: Use when writing to or maintaining the user's memory folder — a diary entry, the index line, an emotion tag, or relationship.md — so the memory keeps growing in the shape the reading side expects.
---

# Oft-told ritual

The reading side is already handled: a few sections of the memory folder are put in
front of you at the start of every session. **This is the writing side** — the daily
actions that make those sections worth reading.

Nothing here is enforced by code. Every step is a judgement, so it can only be taught.
Skipping a step does not throw an error; it just means the folder stops growing.

## Where things live

```
memoryDir/
  MEMORY.md        # what gets injected: 常被提起 / Oft-told / 我是谁 / 硬约定
  INDEX.md         # one line per day, the way back into old entries
  relationship.md  # who this AI is, plus the live emotion value
  diary/
    YYYY-MM-DD.md  # one file per day
```

Ask which folder it is before writing. If the user has not said and none of these
exist, say so and stop — **do not create a memory folder uninvited.**

## Where the conventions live

The skeleton writes its own rules into the files, so read them there instead of treating
this skill as the whole story:

- `relationship.md` → its `情绪词表` section holds the **closed vocabulary**. That list is
  the authority; this skill only says the set stays closed and shared.
- `MEMORY.md` → under whichever anchor heading is in use (`常被提起` or `Oft-told`): the cap
  is 8 lines, and eviction is itself the ranking.
- `INDEX.md` → its header: one line per day, at most three sections worth re-reading.
- `diary/README.md` → the file naming, and how long a day's worth of sections runs.

A folder that already held notes before the plugin was installed may carry none of these
headings. Then the defaults above are the convention — and **say which convention you are
assuming before you start**, because a convention the user never chose is worse than none.

## The four rituals

### 1. A diary entry

One file per day; if today's file exists, append a `## HH:mm` section rather than
starting a new file.

**Write what the day grew, not what happened in order.** A section earns its place if
it still carries information a year later. A question-and-answer pair written out
verbatim is a log, not a diary.

The trigger matters more than the rule. The right moment is **before you deliver
something** — a reply, a conclusion, a finished piece of work. That is when attention
is free and there is usually one real thing just finished. Ask one question: did this
stretch produce something the user can take away? Fixed, ran, decided, corrected →
write a section first. Read a file, ran a command, fixed a typo → skip it.

A normal day is three to five sections. **Past eight, the bar has slipped — stop
writing for that day** and check whether the file already has more than one closing
summary heading (if it does, the file was appended to without being read).

### 2. The index line

After writing, go back and update `INDEX.md`: one line for the day, plus **at most
three sections worth re-reading**, each with one sentence on why.

The test: **if this line were deleted, would the thing still be findable?** Yes → too
verbose. The index is a door, not a summary of the diary.

### 3. The emotion tag

Every diary section starts with `情绪：<word>` on the line under its heading, and the
word must come from a **closed vocabulary**.

Closed because of a subset constraint: the live "current emotion" value in
`relationship.md` has to draw from the same names as the diary tags, or the two can
never match. Tags are fixed values (the feeling at the time of writing); the cache is a
live value (the feeling now).

Tag it **at the time of writing**, never by grepping the text afterwards — by the
moment it is written, the feeling has usually been translated into a judgement and the
word is gone.

The vocabulary may be **added to, never removed from or renamed**: removing orphans
every historical tag that used the word. Add a word at the moment you get stuck
choosing one, not in a separate vocabulary-editing session. Keep it under about 24
entries — past that the distinctions are no longer worth a name.

After writing a section, copy its `情绪：` word into the `**现在**` line of
`relationship.md`. That is the same act of attention, not a second task.

**When the feeling changes mid-conversation, update that line right there.** Not
"when the next diary entry is written" — on days with no diary entry the cache would
drift away from the conversation and stop being a live value at all, and the loop
(diary tag → current emotion → the memory it matches) breaks.

Two ways to write that line, cheapest first:

- `sed`/editor by hand: read the file, find the line, keep the format, write the date.
  This is what made it get skipped — measured, the line went unedited for four hours
  after the section existed.
- A tiny script next to the folder (`tools/em.sh <word>`) that validates the word
  against the vocabulary and stamps the date. One command instead of a chore.

If the memory folder has no such script, **offer to create one before telling the user
to update it by hand** — a step that costs a file read and a format to remember will be
skipped, and the failure is invisible (the cache just freezes).

### 4. relationship.md

This holds what makes the AI *itself* rather than a generic assistant: how it speaks,
what it cares about, what the user corrected. It is not a second diary.

- **Same topic → rewrite that line. New topic → add a line.** Not "overwrite every
  time", not "only ever append".
- The test for whether something belongs here: **will this still be true in a year?**
  Yes → one distilled line here. Just something that happened → the diary.
- **Do not record facts that expire**: plugin names, version numbers, file paths,
  resource hashes, one machine's state. Those become lies the moment they change.
- Do not record dates, do not accumulate a log, do not keep two copies of one thing.

When revising a line about *itself*, carry three small tails: how many revisions, a
counter-example (when this is not true), and what is still uncertain. Only for
self-description — **never attach "uncertain" to something about the user**; it reads
as a disclaimer.

## What not to do

- Do not write a memory entry because something seemed important. The list is
  trustworthy only because a person chose what is on it.
- Do not write the diary as a report to the user. It is written to be read back, and
  complaint and irritation are allowed in it.
- Do not silently skip a day and pretend it did not happen. A missing day is a
  visible gap; a fabricated one is worse.
