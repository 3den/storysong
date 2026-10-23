import {
  BriefSchema,
  DEFAULT_BRIEF,
  LIMITS,
  ReviewResponseSchema,
  RevisionResponseSchema,
  SongSchema,
  applyOperations,
  checkOperations,
  groundFindings,
  lyricsText,
  sameBrief,
  sameSettings,
  songToDraft,
} from "./lyrics.ts";
import type { Brief, Draft, Finding, Operation, SectionId } from "./lyrics.ts";

export type ActionKind = "generate" | "review" | "revise";

/** What a request was sent with; checked against current state until it settles. */
export type Pending = {
  id: number;
  kind: ActionKind;
  brief: Brief;
  revision: number;
  sectionId: SectionId | null;
  text: string;
  /** The id a new song is saved under once its first draft arrives. */
  songId: string;
};

export type Proposal = { revision: number; sectionId: SectionId; operations: Operation[] };
export type Review = { sectionId: SectionId | null; text: string; findings: Finding[]; dropped: number };

export type State = {
  form: Brief;
  stash: Brief | null;
  draft: Draft | null;
  previous: Draft | null;
  selectedSectionId: SectionId | null;
  request: string;
  proposal: Proposal | null;
  review: Review | null;
  pending: Pending | null;
  failure: { kind: ActionKind; message: string } | null;
  /** The open song in the saved list; null until a new song's first draft arrives. */
  songId: string | null;
};

export const initialState: State = {
  form: DEFAULT_BRIEF,
  stash: null,
  draft: null,
  previous: null,
  selectedSectionId: null,
  request: "",
  proposal: null,
  review: null,
  pending: null,
  failure: null,
  songId: null,
};

export type Action =
  | { type: "edit"; patch: Partial<Brief> }
  | { type: "loadStory"; sourceText: string; storyTitle: string }
  | { type: "newSong" }
  | { type: "openSong"; id: string; draft: Draft }
  | { type: "restoreOriginal"; draft: Draft }
  | { type: "revertBrief" }
  | { type: "restoreInputs" }
  | { type: "toggleLock"; lineId: string }
  | { type: "select"; sectionId: SectionId | null }
  | { type: "setRequest"; request: string }
  | { type: "clearReview" }
  | { type: "start"; pending: Pending }
  | { type: "arrived"; id: number; data: unknown }
  | { type: "failed"; id: number; message: string }
  | { type: "cancel" }
  | { type: "accept" }
  | { type: "discard" }
  | { type: "undo" };

export function briefChanged(s: State) {
  return s.draft !== null && !sameSettings(s.form, s.draft.brief);
}

/** Why an action can't start right now, or null if it can. */
export function blockedReason(s: State, kind: ActionKind): string | null {
  if (s.pending) return "Another request is running.";
  if (kind === "generate") {
    const result = BriefSchema.safeParse(s.form);
    return result.success ? null : result.error.issues[0].message;
  }
  if (!s.draft) return "Write the song first.";
  if (briefChanged(s)) return "The settings changed. Rewrite the song, or discard the changes.";
  if (kind === "revise") {
    const section = s.draft.sections.find((x) => x.id === s.selectedSectionId);
    if (!section) return "Select a section in the lyrics to revise it.";
    if (section.lines.every((l) => l.locked)) return "Every line in this section is locked.";
    if (!s.request.trim()) return "Describe the change you want.";
    if (s.request.length > LIMITS.request) return `Keep the request to ${LIMITS.request} characters or fewer.`;
  }
  return null;
}

/**
 * The request body and its pending record, both from one read of state.
 * Revise always targets the selected section; review can target any section or, with null, the whole song.
 */
export function begin(s: State, kind: ActionKind, id: number, sectionId = s.selectedSectionId) {
  const pending: Pending = {
    id,
    kind,
    brief: s.form,
    revision: s.draft?.revision ?? 0,
    sectionId,
    text: s.draft ? lyricsText(s.draft) : "",
    songId: s.songId ?? crypto.randomUUID(),
  };
  const body =
    kind === "generate"
      ? { action: kind, brief: s.form }
      : kind === "review"
        ? { action: kind, draft: s.draft, sectionId }
        : { action: kind, draft: s.draft, sectionId: s.selectedSectionId, request: s.request };
  return { pending, body };
}

/** Why a pending request no longer matches what it was sent for, as a clause. */
function pendingProblem(s: State, p: Pending): string | null {
  if (p.kind === "generate") return sameSettings(s.form, p.brief) ? null : "the settings changed";
  if (!s.draft || briefChanged(s)) return "the settings changed";
  if (p.kind === "review") return lyricsText(s.draft) === p.text ? null : "the lyrics changed";
  if (s.draft.revision !== p.revision) return "the draft or its locks changed";
  return s.selectedSectionId === p.sectionId ? null : "a different section was selected";
}

function proposalProblem(s: State, p: Proposal): string | null {
  if (!s.draft || s.draft.revision !== p.revision) return "the draft or its locks changed";
  if (briefChanged(s)) return "the settings changed";
  if (s.selectedSectionId !== p.sectionId) return "a different section was selected";
  return checkOperations(s.draft, p.sectionId, p.operations);
}

function replaceForm(s: State, form: Brief): State {
  if (sameBrief(s.form, form)) return s;
  // Untouched defaults aren't worth offering back.
  return { ...s, form, stash: sameBrief(s.form, DEFAULT_BRIEF) ? null : s.form };
}

function arrive(s: State, p: Pending, data: unknown): State {
  const fail = (message: string): State => ({ ...s, pending: null, failure: { kind: p.kind, message } });
  const done = { ...s, pending: null, failure: null };

  if (p.kind === "generate") {
    const song = SongSchema.safeParse(data);
    // The title may have been renamed while the song was being written.
    const brief = { ...p.brief, storyTitle: s.form.storyTitle };
    const draft = song.success ? songToDraft(song.data, brief, (s.draft?.revision ?? 0) + 1) : "it wasn't a song";
    if (typeof draft === "string") return fail(`The new draft was rejected because ${draft}. Nothing changed.`);
    return { ...done, draft, previous: s.draft, proposal: null, songId: p.songId };
  }
  if (!s.draft) return fail("There's no draft to apply this to. Nothing changed.");

  if (p.kind === "review") {
    const out = ReviewResponseSchema.safeParse(data);
    if (!out.success) return fail("The review was malformed. Nothing changed.");
    const grounded = groundFindings(s.draft, out.data.findings);
    if (grounded.findings.length === 0) return fail("The review didn't cite any lines from the draft.");
    const dropped = out.data.dropped + grounded.dropped;
    return { ...done, review: { sectionId: p.sectionId, text: p.text, findings: grounded.findings, dropped } };
  }

  const out = RevisionResponseSchema.safeParse(data);
  if (!out.success || !p.sectionId) return fail("The revision was malformed. Nothing changed.");
  const problem = checkOperations(s.draft, p.sectionId, out.data.operations);
  if (problem) return fail(`The revision was rejected because ${problem}. Nothing changed.`);
  return { ...done, proposal: { revision: p.revision, sectionId: p.sectionId, operations: out.data.operations } };
}

function step(s: State, a: Action): State {
  switch (a.type) {
    case "edit": {
      const form = { ...s.form, ...a.patch };
      // The title isn't a setting, so it reaches the open song, and its Undo snapshot, at once.
      const titled = (d: Draft | null) => d && { ...d, brief: { ...d.brief, storyTitle: form.storyTitle } };
      return { ...s, form, stash: null, draft: titled(s.draft), previous: titled(s.previous) };
    }
    case "loadStory":
      return replaceForm(s, { ...s.form, sourceText: a.sourceText, storyTitle: a.storyTitle });
    // Switching songs drops everything tied to the old one, including a running request and Undo.
    case "newSong":
      return initialState;
    case "openSong":
      return { ...initialState, form: a.draft.brief, draft: a.draft, songId: a.id };
    case "restoreOriginal":
      // Back to the bundled sample as a new accepted draft, so Undo can bring the edits back.
      if (!s.draft) return s;
      return { ...s, form: a.draft.brief, stash: null, previous: s.draft, draft: { ...a.draft, revision: s.draft.revision + 1 }, proposal: null };
    case "revertBrief":
      return s.draft ? replaceForm(s, s.draft.brief) : s;
    case "restoreInputs":
      return s.stash ? { ...s, form: s.stash, stash: null } : s;
    case "toggleLock": {
      if (!s.draft) return s;
      const sections = s.draft.sections.map((sec) => ({
        ...sec,
        lines: sec.lines.map((l) => (l.id === a.lineId ? { ...l, locked: !l.locked } : l)),
      }));
      return { ...s, draft: { ...s.draft, sections, revision: s.draft.revision + 1 } };
    }
    case "select":
      return { ...s, selectedSectionId: a.sectionId };
    case "setRequest":
      return { ...s, request: a.request };
    case "clearReview":
      return { ...s, review: null };
    case "start":
      if (blockedReason(s, a.pending.kind)) return s;
      return { ...s, pending: a.pending, failure: null, proposal: a.pending.kind === "revise" ? null : s.proposal };
    case "arrived":
      return s.pending?.id === a.id ? arrive(s, s.pending, a.data) : s;
    case "failed":
      return s.pending?.id === a.id ? { ...s, pending: null, failure: { kind: s.pending.kind, message: a.message } } : s;
    case "cancel":
      return s.pending ? { ...s, pending: null, failure: { kind: s.pending.kind, message: "Cancelled. Nothing changed." } } : s;
    case "accept": {
      if (!s.draft || !s.proposal) return s;
      const problem = proposalProblem(s, s.proposal);
      if (problem) {
        return { ...s, proposal: null, failure: { kind: "revise", message: `The revision can't be applied because ${problem}.` } };
      }
      return { ...s, previous: s.draft, draft: applyOperations(s.draft, s.proposal.operations, s.draft.revision + 1), proposal: null };
    }
    case "discard":
      return { ...s, proposal: null };
    case "undo":
      if (!s.draft || !s.previous) return s;
      // A fresh revision number, so nothing tagged with an older one can match again.
      return { ...s, draft: { ...s.previous, revision: s.draft.revision + 1 }, previous: null, proposal: null };
  }
}

/** Applies an action, then drops whatever it made stale: the spec's invalidation rules, in one place. */
export function reducer(s: State, a: Action): State {
  let next = step(s, a);
  if (next.pending) {
    const problem = pendingProblem(next, next.pending);
    if (problem) {
      next = { ...next, pending: null, failure: { kind: next.pending.kind, message: `Stopped because ${problem}. Nothing changed.` } };
    }
  }
  if (next.proposal) {
    const problem = proposalProblem(next, next.proposal);
    if (problem) {
      next = { ...next, proposal: null, failure: { kind: "revise", message: `The proposed revision was cleared because ${problem}.` } };
    }
  }
  if (next.review && (!next.draft || lyricsText(next.draft) !== next.review.text)) next = { ...next, review: null };
  return next;
}
