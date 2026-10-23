# Storysong

A lyrics-only workspace that turns a pasted story or poem into a song draft, then helps the author revise it while protecting favorite lines.

**Core loop:** paste text → choose genre and mood → write the song → select a section → lock a line → ask for a rewrite → compare and keep.

## Scope

Build a self-contained Next.js, TypeScript, Tailwind CSS, and shadcn/ui prototype on Vercel Hobby using one text-model provider. A first visit lists two ready sample songs, bundled with the app (written during development, not by the app) and validated like any saved song: one from Isaac Asimov's public-domain "Let's Get Together" (1957) and one from Edgar Allan Poe's public-domain poem **A Dream Within a Dream** (1849). Each carries its story and settings, so interviewers can rewrite it live without supplying text or credentials; the deployed server holds the model key. Every other draft, review, and revision comes from a live model call, and samples never stand in for a failed one.

No Suno integration, audio, accounts, server uploads, collaboration, or text-file export. A story file is read in the browser; only its text is sent. Songs save automatically to the browser's `localStorage`.

## Inputs

| Control | Behavior |
| --- | --- |
| Story file | New songs only. A file input labeled **Load a story from a file** that takes `.txt` or `.md`, checked by extension in code. The browser reads it as UTF-8; Markdown syntax (headings, emphasis, links, list and quote markers, code fences, rules) is stripped and line breaks kept. The text replaces the story, the file name (without its extension) replaces the story title, and the other settings stay. Another file type, an unreadable file, or one over 160,000 bytes shows an inline error and changes nothing. |
| Story title | Optional text input labeled **Story title (optional)**, up to 120 characters. It names the song's story in the song list and is never sent to the model, so it isn't a setting: changing it never shows **Settings changed** or stops a request, and it saves to the open song at once. |
| Story or poem | Large textarea labeled **Story or poem**. Placeholder: **Paste a story or poem you want to turn into lyrics.** Accept at least 100 words (whitespace-separated) and at most 40,000 characters, show a live word count plus the character count past 90% of the limit, and preserve line breaks and stanzas. |
| Genre | Rock (default), metal, pop, hip-hop, R&B, country, folk, jazz, or electronic. |
| Mood | Slider from **Calm** (1) to **Aggressive** (5), step 1, default 4. Show its current label and value. |
| Narrator | First person (default) or third person. |
| Note for the writer | Optional text, up to 600 characters, sent as additional direction. |

Mood controls writing intensity within the chosen genre:

| Value | Label | Direction |
| --- | --- | --- |
| 1 | Calm | Gentle imagery and restrained phrasing. |
| 2 | Gentle | Warm, reflective language. |
| 3 | Balanced | Moderate emphasis and intensity. |
| 4 | Intense | Vivid imagery and emphatic verbs. |
| 5 | Aggressive | Urgent phrasing and confrontational diction. |

Send the numeric mood and corresponding guidance to the model. Moving the slider updates the displayed value; generation requires an explicit click. Adapt a poem's imagery and emotional movement without requiring a plot.

## Generate and refine

- **Generate:** **Write the song** (new song) or **Rewrite the song** (a song's settings) returns a title and five sections of four nonempty lines each: **Verse 1 → Chorus → Verse 2 → Bridge → Final chorus**.
- **Review:** **Feedback on the whole song**, or **Get feedback** in the selected section, gives up to three notes citing actual lyric lines. Notes are numbered, and each cited line shows its note numbers. Leave the draft unchanged; **Dismiss** clears the notes.
- **Revise:** select a section, lock favorite lines, and describe the change in **What should change?** (up to 600 characters). **Rewrite {section}** shows each changed line in place, original struck through above the proposal, before **Keep changes** or **Discard**. Only unlocked lines in that section may change.
- **Undo:** generation, kept rewrites, and **Restore original** save the draft they replace as the single Undo snapshot. Undo restores its text and locks and uses it up. Lock changes don't replace the snapshot.
- **Copy:** include the title, section labels, and lyric line breaks.

Changing the story text or preferences after generation keeps the settings form open with **Settings changed**, invalidates pending responses, and preserves accepted lyrics. Require **Rewrite the song**, or **Discard changes** to restore the settings that wrote the lyrics, before more feedback or rewrites. Loading a story file and **Discard changes** keep the inputs they replace and offer **Restore your inputs** until the next edit.

**Songs:** until the first save, the song list holds the sample songs, **Machine Oil** (Let's Get Together by Isaac Asimov) then **Golden Sand** (A Dream Within a Dream by Edgar Allan Poe); they open and change like any song but can't be deleted. Their changes save only to this browser's storage; the bundled originals never change, and a changed sample has **Restore original** at the bottom of its page, which brings back its bundled lyrics, locks, and settings as a new draft that **Undo** can take back. A new song joins the list when its first draft arrives, and saves automatically whenever its accepted draft changes: generation, kept rewrites, lock changes, undo, and **Restore original**. Settings edits save only when used to rewrite the song. The list shows each song's title and its story title (or the story's first line when it has none), most recently changed first. Opening a song or starting a **New song** cancels any running request and clears Undo, selection, proposals, and feedback. A song the user wrote has **Delete song** at the bottom of its page. Deleting it starts a new song, whose page offers **Undo** to put it back in the list until another song is opened or started. Saved songs are validated when read and invalid ones are skipped; if storage is full or turned off, the list says so.

Exact text protection and edit boundaries are enforced in code.

## Interface

Use near-black surfaces (`#121212`) with a lighter sidebar (`#1A1A1A`) and borderless filled cards (`#212121`), off-white text (`#F5F5F5`), green for writing actions, locks, and proposed lines (`#5EF25E`), and magenta for feedback (`#F43FF0`). Errors and warnings are pastel fills (salmon `#FFA8A8`, peach `#FFD59E`) with dark text and an icon. Give lyrics the largest area, with readable serif text, bold sans-serif headings, and simple sans-serif controls with uppercase button labels.

Use shadcn/ui only where accessible behavior is hard to hand-roll: `Select` (genre) and `RadioGroup` (narrator), plus `Button`, `Label`, and `Textarea`. Map the palette onto a single dark theme through shadcn's CSS variables (`--background` near-black, `--foreground` off-white, `--primary` green), plus `--sidebar`, `--highlight` (magenta), and `--warning` (peach). The mood slider is a Tailwind-styled `<input type="range">`, not shadcn `Slider`. No form library, dialogs, or toasts; errors render inline.

- **Sidebar:** Storysong, **New song**, and the song list.
- **Header:** the song title (or **New song**), the working status with **Cancel** while a request runs, and **Undo** and **Feedback on the whole song** for an open song.
- **New song:** story file input, story title, story, preferences, note, **Write the song**.
- **Song:** a one-line summary of the settings that wrote the lyrics, with **Edit settings** to open the full form (it closes after a rewrite); **Copy lyrics**; then the sections. Selecting a section, by its heading or a click anywhere in it while no proposal waits, shows its line locks, the request box, **Rewrite {section}**, **Get feedback**, and any proposal or error. Other sections mark locked lines with a lock icon only. Below the lyrics, **Delete song** for songs the user wrote, or **Restore original** for a changed sample.

From 1,024px, show the sidebar beside one left-aligned column for the new-song form or the song; the header shares the column's width, so its buttons end where the content does. Below 1,024px, show either the song list or the open song: **Songs** in the header opens the list, and choosing a song or **New song** returns to it. Provide labeled controls, keyboard access, visible focus, and comfortable touch targets. Use a native mood slider with visible Calm/Aggressive endpoints and an accessible value such as **Intense, 4 out of 5**. Explain changes and errors through text as well as color.

## Engineering boundaries

Use one server endpoint, `POST /api/lyrics`, with `generate`, `review`, and `revise` actions: `{action: "generate", brief}`, `{action: "review", draft, sectionId | null}`, and `{action: "revise", draft, sectionId, request}`. Errors return `{error}` with a matching status. Keep model credentials on the server; no database is required.

Store original `sourceText`, the optional story title, preferences, numeric mood, brief snapshot, draft revision, stable section/line IDs, locks, one pending proposal, one previous accepted snapshot, and the open song's id, assigned when a new song's first generate request starts. Saved songs live under one versioned `localStorage` key as `{id, updatedAt, draft}`; the draft carries the brief that wrote it. Items in the earlier `{id, name, form, draft}` shape are read as songs when they have a draft. Validate input on the server, require an integer mood from 1 to 5, preserve source whitespace, and derive mood guidance from the validated number. Lyric lines are 1–120 characters with no line breaks; titles are 1–80 characters.

Revision operations contain `lineId`, `before`, and `after`. The model returns `lineId` and `after`; the server copies `before` from the request's draft. Validate on arrival and again before accepting:

- Response shape and text lengths are valid.
- Brief and draft revision still match the request.
- Each operation targets a distinct unlocked line in the selected section.
- `before` exactly matches accepted text; `after` is nonempty and contains no line breaks.
- Locks, other sections, IDs, line order, and counts remain unchanged.

Draft, lock, target, or brief changes invalidate pending proposals. Editing while a request runs is allowed and stops the request only if it depends on what changed: a brief change other than the story title stops any request, a lyric, lock, or section change stops a revision, and a lyric change stops a review. The page says what stopped it, and accepted work stays as it was. Accepted edits, lock changes, generation, and undo advance the revision; undo never reuses an old revision number. Clear reviews when the lyric text changes, and reject fabricated line references. Render output as plain text.

Allow one model action at a time. Show loading and explicit retry states. Failures, cancellations, and malformed responses preserve accepted work. Never silently replace a failed live response with sample content.

## Reviewer demo

The **Golden Sand** sample song carries Poe's **A Dream Within a Dream**, stanzas and line breaks kept.

Its settings are **Folk**, **Mood 2 · Gentle**, **First person**, and the note **“End the chorus with this exact line: Is all we see a dream within a dream?”** so the demo line exists in live output. **Let's Get Together** sits behind **Machine Oil** with Electronic, mood 3, third person.

The reviewer opens **Golden Sand**, clicks **Edit settings** and **Rewrite the song**, selects Chorus, locks **“Is all we see a dream within a dream?”**, asks **“Make the chorus more haunting and less literal. Keep the last line.”**, and clicks **Rewrite Chorus**. They compare, keep, and undo. The locked line and other sections stay exact. Every step uses live generation.

## Definition of done

- The sample songs rewrite live from their bundled stories; custom stories, multiline poems, and loaded `.txt` or `.md` files generate valid drafts.
- A first visit lists the two sample songs, ready to open.
- Songs save automatically, survive a reload, and reopen with their locks.
- Source validation and formatting preservation work.
- The accessible slider covers 1–5, defaults to 4, and never submits automatically.
- Calm/Aggressive requests meaningfully influence diction or imagery under human inspection.
- Scoped edits, locks, Keep/Discard, Undo, Copy, and grounded feedback work.
- Stale or invalid responses cannot alter accepted work.
- The deployed workflow supports keyboard input and 390px and 1,024px widths.

Target two hours; stop at the assignment's eight-hour limit. Prioritize generation and controlled revision; simplify Review and optional controls if needed. Submit the hosted prototype, private repository, short rationale with actual time spent, approximately five-minute walkthrough, and AI development transcripts separately from the repository.
