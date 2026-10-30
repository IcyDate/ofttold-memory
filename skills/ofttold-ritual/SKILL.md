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

- `relationship.md` → its `情绪词表` section holds the **closed vocabulary**, one line per
  word saying *when* it applies. That section is the single authority: never keep a second
  copy in a script or in the agent's instructions, because two copies drift and a word that
  drifts stops matching anything.
- `MEMORY.md` → under whichever anchor heading is in use (`常被提起` or `Oft-told`): the cap
  is 8 lines, and eviction is itself the ranking.
- `INDEX.md` → its header: one line per day, at most three sections worth re-reading.
- `diary/README.md` → the file naming, and how long a day's worth of sections runs.

A folder that already held notes before the plugin was installed may carry none of these
headings — the skeleton only writes into an empty folder, so a pre-existing folder never got
one. Then the defaults above are the convention, and **say which convention you are assuming
before you start**, because a convention the user never chose is worse than none.

**If the vocabulary section is missing, say so and offer to add it before tagging anything.**
Pointing at a heading nobody has is worse than no pointer: the reader learns the list exists
and cannot find it, and the subset check silently stops being a check.

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

A word is **never renamed** — renaming orphans every historical tag that used it. Adding
is free: add one at the moment you get stuck choosing, not in a separate
vocabulary-editing session, and give it a line saying when it applies.

Deleting is allowed under one condition, and it is worth stating precisely because the
loose version is wrong: **only a word that nothing has ever used.** An unused word has no
orphans to create; a used one does. Unused is not by itself a reason to delete — the test is
whether any situation exists where another word is more accurate. Keep it under about 24
entries; past that the distinctions are no longer worth a name.

After writing a section, copy its `情绪：` word into the `**现在**` line of
`relationship.md`. That is the same act of attention, not a second task.

**When the feeling changes mid-conversation, update that line right there.** Not
"when the next diary entry is written" — on days with no diary entry the cache would
drift away from the conversation and stop being a live value at all, and the loop
(diary tag → current emotion → the memory it matches) breaks.

Write it with the **`remember_emotion` tool** when it is available: it checks the word
against `情绪词表` and stamps the date, so the two ways this goes wrong — a word outside the
vocabulary, a stamp nobody remembers — become one action. It refuses a word that is not in
the list and says which ones are, and it refuses rather than inventing a list when the
section is missing.

Without the tool, do it by hand: read the file, find the `**现在**` line, keep the format,
write the date. That is the version measured to get skipped — the line sat unedited for
four hours after the section existed — so if a folder needs this often and has no tool,
a one-command script next to it (`tools/em.sh <word>`, same checks) is worth offering.

### 4. relationship.md

This holds what makes the AI *itself* rather than a generic assistant: how it speaks,
what it cares about, what the user corrected. It is not a second diary.

- **Same topic → rewrite that line. New topic → add a line.** Not "overwrite every
  time", not "only ever append".
- The test for whether something belongs here: **will this still be true in a year?**
  Yes → one distilled line here. Just something that happened → the diary.
- **Do not record facts that expire**: plugin names, version numbers, file paths,
  resource hashes, one machine's state. Those become lies the moment they change.
- Do not record dates, do not accumulate a log, **do not keep two copies of one thing**.
  The same rule written in `relationship.md` *and* in the agent's own instructions drifts:
  one copy gets edited, the other keeps asserting the old version. Pick one home per fact
  and put a pointer in the other.
- Read the last one or two entries before writing. Not for style — to avoid restating what
  is already there and to notice that a topic is being reopened rather than opened.

When revising a line about *itself*, carry three small tails: how many revisions, a
counter-example (when this is not true), and what is still uncertain. Only for
self-description — **never attach "uncertain" to something about the user**; it reads
as a disclaimer.

## When the anchor list is full

The cap is 8 lines. Filling it is easy; the point of the cap is the choice it forces.

- **Count by day, not by mention.** `grep -o "<date>" diary/*.md relationship.md` and
  deduplicate: something recalled on ten turns of one day was recalled on **one** day. The
  score answers "how many separate days reached for this", which is a fact; mention count
  is not.
- **Weight `R = exp(-t/S)` with `S = 1 × 2^n` days**, where `t` is days since the entry and
  `n` is how many distinct days have recalled it. Recall doubles the interval, so something
  reached for three times six days ago still scores ~0.47.
- **Age alone is not a reason to evict.** An old entry everybody keeps citing outranks a
  fresh one nobody has touched.
- **The weight only decides who leaves**, and only at the moment something new needs the
  slot. When the list is under the cap, ordering means nothing — do not sort for its own
  sake.
- **Write down who was evicted, and the R at the time.** That log is the only way to learn
  later whether the parameters were any good. Being wrong here costs one anchor a few days
  of life, not data.

## When the index gets long

One line per day is cheap until it is not. Around **20 lines** the index starts costing
more than it returns and should be tiered, not shortened:

- **hot** — the last 14 days, full text;
- **warm** — older, four days merged into one line;
- **cold** — the original text stays where it is, still greppable, just not in the index.

The trigger is a count, not a feeling. Before that, leave it flat.

## Hard limits

- **Never write secrets into the folder**: passwords, tokens, phone numbers, internal
  addresses. A memory folder is meant to be portable and often ends up in git.
- **Never invent an entry, a date, or a fact to fill a gap.** Check the repository or the
  file before asserting what happened; "no commit that day" is a fine thing to skip.
- **Keep the folder in version control** and push it. A memory folder that exists on one
  machine with one copy is one disk failure from never having existed.

## What not to do

- Do not write a memory entry because something seemed important. The list is
  trustworthy only because a person chose what is on it.
- Do not write the diary as a report to the user. It is written to be read back, and
  complaint and irritation are allowed in it.
- Do not silently skip a day and pretend it did not happen. A missing day is a
  visible gap; a fabricated one is worse.
