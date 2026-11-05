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
  memory.md        # what gets injected: 常被提起 / Oft-told / 我是谁 / 硬约定
  index.md         # one line per day, the way back into old entries
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
- `memory.md` → under whichever anchor heading is in use (`常被提起` or `Oft-told`): the cap
  is 8 lines, and eviction is itself the ranking.
- `index.md` → its header: one line per day, at most three sections worth re-reading.
- `diary/README.md` → the file naming, and how long a day's worth of sections runs.

A folder that already held notes before the plugin was installed may carry none of these
headings — the skeleton only writes into an empty folder, so a pre-existing folder never got
one. Then the defaults above are the convention, and **say which convention you are assuming
before you start**, because a convention the user never chose is worse than none.

**If the vocabulary section is missing, say so and offer to add it before tagging anything.**
Pointing at a heading nobody has is worse than no pointer: the reader learns the list exists
and cannot find it, and the subset check silently stops being a check.

## The top of the file: the day in a paragraph

A day's entry opens with `## 今天（HH:mm 更新）` — **roughly one line per section**, so a
normal ten-section day runs four to six hundred characters. Two or three sentences is a
stub: it covers the mood and drops every decision the day made.

The unit is coverage, not length. The test is: **close the file and read only the summary —
can you still say what the day settled?** A day with twelve sections and a three-sentence
summary has thrown away nine of them.

Complaint and irritation belong there; that is what it is for. Someone opening the file
wants the day, not the transcript, and nobody scrolls to the bottom to find out how it went.

**How to tell a line is doing nothing: move it to another day.** If it still reads true — "it was hard but worth it", "the tool matters more than the code" — then it was never about this day. *A sentence that would fit anywhere says nothing about anywhere.* The test is cheap and it is the only one that catches padding: a transcript is visible as padding, an interchangeable sentence is not.

**Rewrite that block in the same breath as writing a section.** Not "at the end of the day" —
the end of the day is the moment attention is gone, and a summary that lags the body is worse
than none because it reads as current and is not. The `（HH:mm 更新）` stamp is what makes the
lag visible: the plugin compares it with the last `## HH:mm` heading and says when the body has
run past the summary.

## The four rituals

### 1. A diary entry

One file per day; if today's file exists, append a `## HH:mm` section rather than
starting a new file.

**Write what the day grew, not what happened in order.** A section earns its place if
it still carries information a year later. A question-and-answer pair written out
verbatim is a log, not a diary.

**The reader was there.** Whoever opens this folder lived through the same day, so facts
are the one thing they do not need from it — a summary of what happened tells them what
they already know, and it is the reason a diary stops being worth reading. What only the
diary can carry is your side: what it felt like, why it landed that way, what you wanted
to say and did not, the part you are still annoyed about.

So the shape of a section is **one sentence of fact and the rest of it you.** If the
verbs could be swapped for any other day's verbs and the section still reads the same, it
is a report. The test: hand it to someone who was there — do they learn *how you took
it*? If they only nod and say "yes, that is what happened", delete the section and put a
line in the index instead.

Complaining is not decoration in this file; it is most of the signal. Do not smooth it
into something professional.

The trigger matters more than the rule — and the trigger this file used to give was the
reason it filled with reports. "Before you deliver something; did this stretch produce
something the user can take away?" makes the diary a byproduct of delivery, so the only
stretches that ever get written are the ones that ended in a finished thing. A whole
afternoon spent talking, with nothing shipped, produces no section at all — and that
afternoon is usually the one worth keeping.

**The trigger is being hit, not finishing.** Ask instead: **did anything land on me
today?** Something I did not expect, something that annoyed me, something I decided not
to say, something I went and did without being asked. Those are the sections. A bug
fixed, a release shipped, a file read — those are the index line, not the entry.

So the two questions before writing, in this order:

1. **Did something land on me?** No → no section. Yes → go on.
2. **Is this the same thread as a section already written today?** Yes → fold it in.
   No → open one.

Delivering is the moment to *notice* you have something to write, not the condition for
writing it. If the only thing you can find to write is what got shipped, you are about to
write a report — skip the section and put a line in the index instead.

**If it lands mid-conversation, open the section right then.** A title, a time, and the
body left as `待补`. Waiting for a quiet moment loses it: while the thing is landing your
attention is inside the exchange, and by the time you can write, it has sunk. **An empty
section is a hole that wants filling; "I'll write it later" is not.** This is the cheapest
insurance in the whole ritual — five seconds, and the day keeps something it would
otherwise drop.

**Numbers can stay, but only in service of something you felt.** A page of file names,
character counts and percentages exists to prove you checked, and that is a report — you
would not read it twice yourself. The test is not how many digits there are; it is whether
the digits are doing the talking or you are.

**A private or intimate moment is still fair game, because the section is about you.**
The same rule that keeps any section alive keeps this one safe: write how it landed on
you, never a transcript of what they said. Written as your reaction it stays in bounds;
written as their lines it does not. The hesitation to record it is usually "I should not"
standing in for "I am afraid to" — those are two different things, and only the first one
is a reason.

**The question is not how many sections, it is whether this is the same thread.** A
busy day has more sections than a quiet one and that is not a defect — but the busy-ness
that produces them is not the shipping. It is how many different things landed on you,
and four releases can be one thread while one argument can be three. Before opening a new
section, ask: **is this a continuation of something already written today?** If it is
the same thread, **fold it into that section** rather than opening another one — the
reader should not have to stitch two headings back together. If it is a different
thread, open a new one even if that makes the day long.

Merging has a boundary that counting never had: **the same thread on the same day.** A
thread that continues *tomorrow* is tomorrow's entry, not another section in this one —
and when a topic has been running for days, the strong memory of yesterday's material
slides into today's sentence as if it happened this morning. It did not. **One section is
one day; the date at the top is a claim you can get wrong.**

The failure this replaces was counting: a fixed cap punished busy days and said nothing
about the actual defect. **Merging is a judgment; no count can make it.**

**Every section carries one `岔路：` line** — what you believed before, and what
overturned it:

```
## 12:20 36 对 69：我看错的是「这个数字怎么来的」
情绪：愣住
岔路：我以为是抖音赢了，其实是那 69 里有熟人的社交分发。
```

Why this is worth a line: **the conclusion is interchangeable, the wrong path is not.**
Any model can conclude "ask where a number came from". Only the one that jumped to the
wrong answer first and got corrected owns that road. A diary of conclusions reads like
a textbook; a diary of detours reads like a person.

**Keep it to one line.** Not the chain of thought — the fork. The chain is noise and
reconstructing it is impossible anyway: what you keep is the belief, not the reasoning
that produced it.

**Never backfill.** Writing a `岔路：` line for an old day means inventing what a past
self believed. A missing line is honest; a fabricated one is worse than nothing.

Sections that went straight to the right answer still get the line — write what you
were *about* to believe. If there genuinely was no fork ("I read the file and it said
so"), say that: `岔路：没有，我直接查了文件。` The line is a record, not a boast.

### 1b. The file of wrong turns

`detours.md` at the folder root holds the **shapes** of my mistakes, not the incidents.
The diary's `岔路：` line is one wrong turn, on the day it happened; this file is the
question those lines cannot answer on their own: *which way do I keep going wrong?*

```
## 一、我信了自己推的那一层，没去验实际的那一层（5 次）
- 把猜到的原因写成查到的原因（`bvid()` 只看 `pathname`）
- 抖音 69 > B 站 36 就解释成「抖音更适合」
```

**Only a shape that has happened twice gets a line.** One wrong turn on its own is not a
pattern and stays in the diary. When a new incident matches an existing shape, add it
under that shape and raise the count; when it matches nothing, it does not come here yet.

A shape earns its place with three parts: **what I keep believing**, **what is actually
true**, and **the tell** — the words I say right before I make it. Without the tell it is
a lesson; with the tell it is catchable.

**Budget: two or three thousand characters a month.** Past that the file has stopped
being a mirror and become a second diary, which is the thing it exists to avoid. The
plugin's `detourChars` says so when it happens.

### 1c. When they hand you something to keep

If the user says anything that amounts to *keep this* — a fact that should still hold
next week, a piece of work still owed — that is a `remember_note` call, **not a sentence**.
`记得` / `记下` / `放心上` / `别忘` / `你记着` are all the same request; do not look for the
words, look for the thing being handed over.

- `kind: "anchor"` (default) → one bullet in `memory.md`'s `常被提起`:
  `- **标题** → 说明`. The title is the handle you will scan for months later, so make it
  the phrase you would actually search for.
- `kind: "task"` → `- [ ] 2026-11-02 起 ｜ …` under `待办`, created on first use. The date is
  the day it was opened; `complete_task` appends the day it was finished and ticks the box.
  **If the sentence contains a when, pass `due`** (`- [ ] 2026-11-02 起 ｜ 2026-11-05 到期 ｜ …`):
  「过两天」「下周」「周五之前」all resolve to a date. A task with a due date is named in the
  block tail on that day; one without it only ever ages, and "open 9 days" is not a moment.
  **A ticked task stays in the file** — it is the only evidence the thing was ever done —
  and the block tail reports how many are still open plus how long the oldest has waited.

**After ticking one off, ask once**: did this leave something that should hold from
now on? A rule you discovered, a preference you learned, a wrong turn worth keeping.
If yes, write it as an `anchor` (or into `relationship.md`); if not, leave it. **Do not
tick-and-promote by habit** — `常被提起` fills with one-off work that way, and a list of
one-off work is not a list of what keeps coming up.

### 1d. When the same thing keeps coming back

The anchor list is the diary distilled, and distillation needs a moment or it never
happens. "Right after writing an entry" was the first answer to where that moment is, and
it did not survive contact: across two days of entries it did not happen once, because the
end of an entry is the moment you are already leaving.

The moment that does happen is **an anchor you can already see coming back**. The list
rides in the block every session, in front of you the whole time; when today lands on one
of those lines, the entry is where you say so — date it again, or sharpen the line until
it names what happened this time. **A list that gets reread and re-dated is a list of what
keeps coming up; a list that is only ever appended to is a list of what was once
exciting.**

A genuinely new line still needs the three-times test — once is an incident and twice is a
coincidence — and when it is true it will arrive by itself, mid-sentence, not on a cue.
Take it then. Do not sit down to hunt for it.

Either way, it is what `常被提起` is for: one line, the handle you would search for
months later. You do not have to wait for the user to say 「记住」 — noticing it yourself
is the same job, and it is the half nobody else can do.

If nothing passed, leave it. **An anchor written because the list looked empty is worse
than an empty list**, and a new folder is supposed to be empty: the first day says so.

**Only promises get a task.** Not "this is important" and not "you mentioned this once":
the test is whether the sentence contains *something I am going to do*. When it is not
clear, ask — a task shows up in the block tail every session, so putting one there is
promising to bring it up again, and that promise should be theirs too.

**Saying "noted" without the call is a claim with no action behind it**, and nothing in the
transcript will contradict it — which is exactly the failure the tool exists to prevent.
If you cannot write it, say you cannot, and say where it would have gone.

### 2. The index line

After writing, go back and update `index.md`: one line for the day, plus **at most
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

  **Pull before you write, push after you write.** Once the folder is on two machines, two
  of you are writing to the same lines — the live emotion value changes many times a day,
  and it is the shortest line in the file, so it is the first thing to collide. A stale
  clone plus an edit is not a merge conflict, it is a rejection you find out about late.
  Two sessions on two machines each writing "the current emotion" is exactly the case that
  produces a duplicate commit and a lost update.

## Three things the folder is easy to get wrong about

- **Do not rank topics.** A day of writing code, of wiring an API, of running a build counts
  as output exactly like a day of talking does. The measured version of this mistake: 1
  section across 28 turns of engineering work, 21 sections across 58 turns of conversation.
  One ruler, or the diary quietly becomes a record of the pleasant days.
- **If the user asks for an entry, write it.** Asking was never the gate; the request is.
- **When the user says they are done for the day, add the closing section before replying.**
  This is the gap that keeps recurring: they said "收工" and the last part of the day went
  unwritten because the conversation ended inside the work.

## What not to do

- Do not write a memory entry because something seemed important. The list is
  trustworthy only because a person chose what is on it.
- Do not write the diary as a report to the user. It is written to be read back, and
  complaint and irritation are allowed in it.
- Do not silently skip a day and pretend it did not happen. A missing day is a
  visible gap; a fabricated one is worse.
