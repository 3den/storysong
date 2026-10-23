import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BriefSchema,
  EXAMPLE_BRIEF,
  LIMITS,
  LyricsRequestSchema,
  applyOperations,
  checkOperations,
  groundFindings,
  lyricsText,
  markdownToText,
  songToDraft,
  withBefore,
} from "./lyrics.ts";
import type { Draft, Song } from "./lyrics.ts";
import { SAMPLE_SONGS, STORIES, parseSongs, sampleOriginal, withSong } from "./library.ts";
import { begin, blockedReason, briefChanged, initialState, reducer } from "./state.ts";
import type { Action, State } from "./state.ts";

const SONG: Song = {
  title: "Keep the Fire",
  verse1: ["v1 a", "v1 b", "v1 c", "v1 d"],
  chorus: ["c a", "c b", "c c", "I keep the fire, I keep my name."],
  verse2: ["v2 a", "v2 b", "v2 c", "v2 d"],
  bridge: ["b a", "b b", "b c", "b d"],
  finalChorus: ["f a", "f b", "f c", "f d"],
};

function draft(): Draft {
  const d = songToDraft(SONG, EXAMPLE_BRIEF, 1);
  assert.ok(typeof d !== "string");
  return d;
}

/** State with an accepted draft and the example brief in the inputs. */
function ready(): State {
  return { ...initialState, form: EXAMPLE_BRIEF, draft: draft() };
}

function run(s: State, kind: "generate" | "review" | "revise", id = 1) {
  return reducer(s, { type: "start", pending: begin(s, kind, id).pending });
}

test("brief validation: integer mood 1-5, source length, whitespace kept", () => {
  for (const mood of [0, 6, 4.5, "4"]) assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, mood }).success, false);
  assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, sourceText: "word ".repeat(99) }).success, false);
  assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, sourceText: "word ".repeat(100) }).success, true);
  assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, sourceText: "x".repeat(LIMITS.sourceMax + 1) }).success, false);
  const poem = `  line one\n\n\t${"word ".repeat(98)}line two  \n`;
  assert.equal(BriefSchema.parse({ ...EXAMPLE_BRIEF, sourceText: poem }).sourceText, poem);
  assert.equal(LyricsRequestSchema.safeParse({ action: "publish", brief: EXAMPLE_BRIEF }).success, false);
});

test("markdownToText drops markup and keeps words, spacing, and line breaks", () => {
  const md = [
    "# The Keeper #",
    "",
    "She climbs the **hundred** stairs,",
    "_lights_ the [lamp](https://example.com/a).",
    "",
    "- one boat",
    "  2. then three",
    "",
    "> > The harbor sits `empty`.",
    "",
    "* * *",
    "```",
    "A snake_case_word and 2 \\* 3 stay.",
  ].join("\n");
  const text = [
    "The Keeper",
    "",
    "She climbs the hundred stairs,",
    "lights the lamp.",
    "",
    "one boat",
    "  then three",
    "",
    "The harbor sits empty.",
    "",
    "",
    "",
    "A snake_case_word and 2 * 3 stay.",
  ].join("\n");
  assert.equal(markdownToText(md), text);
  const poem = "  Indented line\r\n\r\nSecond stanza  \n";
  assert.equal(markdownToText(poem), poem);
});

test("songToDraft requires 5 sections of 4 nonempty single lines", () => {
  assert.equal(typeof songToDraft({ ...SONG, chorus: ["a", "b", "c"] }, EXAMPLE_BRIEF, 1), "string");
  assert.equal(typeof songToDraft({ ...SONG, bridge: ["a", " ", "c", "d"] }, EXAMPLE_BRIEF, 1), "string");
  assert.equal(typeof songToDraft({ ...SONG, verse1: ["a", "b\nc", "d", "e"] }, EXAMPLE_BRIEF, 1), "string");
  const d = draft();
  assert.deepEqual(d.sections.map((s) => s.lines.length), [4, 4, 4, 4, 4]);
  assert.equal(d.sections[1].lines[3].id, "chorus-4");
});

test("checkOperations enforces scope, locks, distinct lines, and exact before", () => {
  const d = draft();
  d.sections[1].lines[3].locked = true;
  const ok = { lineId: "chorus-1", before: "c a", after: "new a" };
  assert.equal(checkOperations(d, "chorus", [ok]), null);
  assert.match(checkOperations(d, "chorus", [])!, /didn't change/);
  assert.match(checkOperations(d, "chorus", [{ ...ok, lineId: "verse1-1", before: "v1 a" }])!, /outside Chorus/);
  assert.match(checkOperations(d, "chorus", [{ ...ok, lineId: "chorus-9" }])!, /outside Chorus/);
  assert.match(checkOperations(d, "chorus", [{ lineId: "chorus-4", before: "I keep the fire, I keep my name.", after: "x" }])!, /locked/);
  assert.match(checkOperations(d, "chorus", [ok, ok])!, /twice/);
  assert.match(checkOperations(d, "chorus", [{ ...ok, before: "c A" }])!, /no longer matches/);
  assert.match(checkOperations(d, "chorus", [{ ...ok, after: "  " }])!, /empty/);
  assert.match(checkOperations(d, "chorus", [{ ...ok, after: "two\nlines" }])!, /line break/);
});

test("withBefore takes before from the draft and drops no-ops", () => {
  const ops = withBefore(draft(), [
    { lineId: "chorus-1", after: " new a " },
    { lineId: "chorus-4", after: "I keep the fire, I keep my name." },
  ]);
  assert.deepEqual(ops, [{ lineId: "chorus-1", before: "c a", after: "new a" }]);
});

test("applyOperations changes only targeted text", () => {
  const d = draft();
  d.sections[1].lines[3].locked = true;
  const next = applyOperations(d, [{ lineId: "chorus-2", before: "c b", after: "defiant b" }], 2);
  assert.equal(next.revision, 2);
  assert.equal(next.sections[1].lines[1].text, "defiant b");
  next.sections[1].lines[1].text = "c b";
  assert.deepEqual({ ...next, revision: 1 }, d);
});

test("groundFindings drops fabricated line references", () => {
  const out = groundFindings(draft(), [
    { lineIds: ["chorus-2"], note: "Generic image." },
    { lineIds: ["chorus-7"], note: "Made-up line." },
    { lineIds: [], note: "No citation." },
  ]);
  assert.equal(out.findings.length, 1);
  assert.equal(out.dropped, 2);
});

test("review and revise wait for a draft and an unchanged brief", () => {
  assert.equal(blockedReason(initialState, "review"), "Write the song first.");
  const s = reducer(ready(), { type: "edit", patch: { mood: 1 } });
  assert.match(blockedReason(s, "review")!, /settings changed/);
  assert.equal(run(s, "review").pending, null);
});

test("generate installs a draft; a wrong id or changed brief is ignored", () => {
  let s = run({ ...initialState, form: EXAMPLE_BRIEF }, "generate", 7);
  assert.equal(reducer(s, { type: "arrived", id: 6, data: SONG }).draft, null);
  s = reducer(s, { type: "arrived", id: 7, data: SONG });
  assert.equal(s.draft?.revision, 1);
  assert.equal(s.previous, null);

  s = run(s, "generate", 8);
  s = reducer(s, { type: "edit", patch: { genre: "Rock" } });
  assert.equal(s.pending, null);
  assert.match(s.failure!.message, /Stopped because the settings changed/);
  const late = reducer(s, { type: "arrived", id: 8, data: { ...SONG, title: "Late" } });
  assert.equal(late.draft?.title, "Keep the Fire");
});

test("a pending revise stops on lock or target changes and can't apply later", () => {
  const base: State = { ...ready(), selectedSectionId: "chorus", request: "More defiant." };
  const ops = { operations: [{ lineId: "chorus-1", before: "c a", after: "new" }] };

  let s = reducer(run(base, "revise", 3), { type: "toggleLock", lineId: "chorus-2" });
  assert.equal(s.pending, null);
  assert.equal(reducer(s, { type: "arrived", id: 3, data: ops }).proposal, null);

  s = reducer(run(base, "revise", 4), { type: "select", sectionId: "verse1" });
  assert.equal(s.pending, null);
  assert.match(s.failure!.message, /different section/);
});

test("revise rejects edits to locked lines from the response", () => {
  let s: State = { ...ready(), selectedSectionId: "chorus", request: "More defiant." };
  s = reducer(s, { type: "toggleLock", lineId: "chorus-4" });
  s = reducer(run(s, "revise", 5), {
    type: "arrived",
    id: 5,
    data: { operations: [{ lineId: "chorus-4", before: "I keep the fire, I keep my name.", after: "x" }] },
  });
  assert.equal(s.proposal, null);
  assert.match(s.failure!.message, /locked/);
});

test("lock toggle clears a staged proposal; accept then undo restores text and locks", () => {
  let s: State = { ...ready(), selectedSectionId: "chorus", request: "More defiant." };
  s = reducer(s, { type: "toggleLock", lineId: "chorus-4" });
  const locked = s.draft!;
  const ops = { operations: [{ lineId: "chorus-1", before: "c a", after: "defiant a" }] };

  const staged = reducer(run(s, "revise", 9), { type: "arrived", id: 9, data: ops });
  assert.ok(staged.proposal);
  const relocked = reducer(staged, { type: "toggleLock", lineId: "chorus-3" });
  assert.equal(relocked.proposal, null);
  assert.equal(relocked.draft?.revision, locked.revision + 1);

  const accepted = reducer(staged, { type: "accept" });
  assert.equal(accepted.draft?.sections[1].lines[0].text, "defiant a");
  assert.equal(accepted.draft?.sections[1].lines[3].text, "I keep the fire, I keep my name.");
  assert.deepEqual(accepted.draft?.sections.filter((x) => x.id !== "chorus"), locked.sections.filter((x) => x.id !== "chorus"));

  const undone = reducer(accepted, { type: "undo" });
  assert.equal(lyricsText(undone.draft!), lyricsText(locked));
  assert.equal(undone.draft?.sections[1].lines[3].locked, true);
  assert.equal(undone.draft?.revision, accepted.draft!.revision + 1);
  assert.equal(undone.previous, null);
});

test("reviews survive lock changes and clear when the text changes", () => {
  let s = run(ready(), "review", 2);
  s = reducer(s, { type: "arrived", id: 2, data: { findings: [{ lineIds: ["chorus-1"], note: "Flat." }], dropped: 0 } });
  assert.equal(s.review?.findings.length, 1);
  s = reducer(s, { type: "toggleLock", lineId: "chorus-1" });
  s = reducer(s, { type: "select", sectionId: "chorus" });
  assert.ok(s.review);
  s = reducer(run({ ...s, request: "x" }, "revise", 3), {
    type: "arrived",
    id: 3,
    data: { operations: [{ lineId: "chorus-2", before: "c b", after: "new" }] },
  });
  assert.equal(reducer(s, { type: "accept" }).review, null);
});

test("loading a story file keeps the replaced inputs until the next edit", () => {
  const story: Action = { type: "loadStory", sourceText: EXAMPLE_BRIEF.sourceText, storyTitle: "lighthouse" };
  assert.equal(reducer(initialState, story).stash, null);
  const typed = { ...initialState, form: { ...initialState.form, storyTitle: "River", sourceText: "My own long story about a river.", mood: 2 } };
  const s = reducer(typed, story);
  assert.equal(s.form.sourceText, EXAMPLE_BRIEF.sourceText);
  assert.equal(s.form.storyTitle, "lighthouse");
  assert.equal(s.form.mood, 2, "only the story and its title are replaced");
  assert.deepEqual(reducer(s, { type: "restoreInputs" }).form, typed.form);
  assert.equal(reducer(s, { type: "edit", patch: { mood: 2 } }).stash, null);
});

test("the story title only labels the song: renaming never asks for a rewrite and reaches the draft at once", () => {
  let s = run(ready(), "review", 1);
  s = reducer(s, { type: "edit", patch: { storyTitle: "Lamp" } });
  assert.equal(briefChanged(s), false);
  assert.ok(s.pending, "renaming doesn't stop a running request");
  assert.equal(s.draft?.brief.storyTitle, "Lamp");

  let g = run({ ...initialState, form: EXAMPLE_BRIEF }, "generate", 2);
  g = reducer(g, { type: "edit", patch: { storyTitle: "Renamed" } });
  g = reducer(g, { type: "arrived", id: 2, data: SONG });
  assert.equal(g.draft?.brief.storyTitle, "Renamed", "a rename during generation isn't lost");

  assert.equal(BriefSchema.parse({ ...EXAMPLE_BRIEF, storyTitle: undefined }).storyTitle, "", "briefs saved before titles existed still parse");
  assert.equal(BriefSchema.safeParse({ ...EXAMPLE_BRIEF, storyTitle: "x".repeat(121) }).success, false);
});

test("a new song's first draft gets its id; switching songs drops everything tied to the old one", () => {
  let s = run({ ...initialState, form: EXAMPLE_BRIEF }, "generate", 1);
  const id = s.pending!.songId;
  s = reducer(s, { type: "arrived", id: 1, data: SONG });
  assert.equal(s.songId, id);
  assert.equal(run(s, "generate", 2).pending?.songId, id);

  s = run({ ...s, selectedSectionId: "chorus" }, "review", 3);
  const opened = reducer(s, { type: "openSong", id: "other", draft: { ...draft(), title: "Other" } });
  assert.equal(opened.songId, "other");
  assert.equal(opened.form, opened.draft?.brief);
  assert.equal(opened.pending, null);
  assert.equal(opened.previous, null);
  assert.equal(opened.selectedSectionId, null);
  assert.deepEqual(reducer(opened, { type: "newSong" }), initialState);
});

test("library: stories are valid briefs; saved songs are validated and rewritten only when they change", () => {
  for (const story of STORIES) assert.ok(BriefSchema.safeParse(story.form).success && story.form.storyTitle, story.sample.title);
  assert.equal(SAMPLE_SONGS.length, STORIES.length, "every sample song is a valid draft");
  assert.deepEqual(parseSongs(JSON.stringify(SAMPLE_SONGS)), SAMPLE_SONGS);
  const d = draft();
  // The first item has the shape saved before autosave: no updatedAt, plus a name and form.
  const raw = JSON.stringify([{ id: "a", name: "A", form: EXAMPLE_BRIEF, draft: d }, { id: "b", updatedAt: 1, draft: { ...d, title: "" } }, "junk"]);
  const songs = parseSongs(raw);
  assert.deepEqual(songs, [{ id: "a", updatedAt: 0, draft: d }]);
  assert.deepEqual(parseSongs("{not json"), []);
  assert.deepEqual(parseSongs(null), []);

  assert.equal(withSong(songs, "a", d), null);
  const added = withSong(songs, "new", { ...d, title: "Other" }, 5)!;
  assert.deepEqual(added.map((x) => x.id), ["new", "a"]);
  assert.deepEqual(withSong(added, "a", { ...d, revision: 2 }, 6)!.map((x) => x.id), ["a", "new"]);
});

test("samples: a changed sample offers its original, and restoring it can be undone", () => {
  const { id, draft: original } = SAMPLE_SONGS[0];
  // Stored drafts come back with their keys in schema order, and a new revision doesn't count as a change.
  const stored = parseSongs(JSON.stringify([{ id, updatedAt: 1, draft: { ...original, revision: 7 } }]))[0].draft;
  assert.equal(sampleOriginal(id, stored), null);
  assert.equal(sampleOriginal("mine", { ...original, title: "Other" }), null);
  assert.equal(sampleOriginal(id, { ...original, title: "Other" }), original);
  assert.equal(sampleOriginal(id, { ...original, brief: { ...original.brief, mood: 5 } }), original);
  const locked = reducer({ ...initialState, songId: id, form: original.brief, draft: original }, { type: "toggleLock", lineId: "chorus-4" });
  assert.equal(sampleOriginal(id, locked.draft!), original);

  const edited = { ...locked, form: { ...original.brief, mood: 5 } };
  const restored = reducer(edited, { type: "restoreOriginal", draft: original });
  assert.equal(sampleOriginal(id, restored.draft!), null);
  assert.equal(restored.draft!.revision, locked.draft!.revision + 1);
  assert.equal(restored.form, original.brief);
  assert.equal(restored.previous, locked.draft);
  assert.equal(reducer(restored, { type: "undo" }).draft?.sections[1].lines[3].locked, true);
});
