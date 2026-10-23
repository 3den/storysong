import { z } from "zod";
import { A_DREAM_WITHIN_A_DREAM } from "./a-dream-within-a-dream.ts";

export const GENRES = ["Rock", "Metal", "Pop", "Hip-hop", "R&B", "Country", "Folk", "Jazz", "Electronic"] as const;

// Index is mood - 1.
export const MOODS = [
  { label: "Calm", direction: "Gentle imagery and restrained phrasing." },
  { label: "Gentle", direction: "Warm, reflective language." },
  { label: "Balanced", direction: "Moderate emphasis and intensity." },
  { label: "Intense", direction: "Vivid imagery and emphatic verbs." },
  { label: "Aggressive", direction: "Urgent phrasing and confrontational diction." },
] as const;

export const SECTION_IDS = ["verse1", "chorus", "verse2", "bridge", "finalChorus"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABELS: Record<SectionId, string> = {
  verse1: "Verse 1",
  chorus: "Chorus",
  verse2: "Verse 2",
  bridge: "Bridge",
  finalChorus: "Final chorus",
};

export const LIMITS = {
  sourceMinWords: 100,
  sourceMax: 100_000,
  direction: 600,
  request: 600,
  line: 120,
  title: 80,
  storyTitle: 120,
} as const;

const BREAKS = /[\r\n\u2028\u2029]/;

export const wordCount = (s: string) => s.match(/\S+/g)?.length ?? 0;

// shortcut: regexes, not a Markdown parser, so nested or escaped markup can survive; use a parser if stories need it.
const MARKDOWN: [RegExp, string][] = [
  [/^ {0,3}(?:`{3,}|~{3,}).*$/gm, ""], // code fences
  [/^ {0,3}([-*_])(?: *\1){2,} *$/gm, ""], // horizontal rules
  [/^ {0,3}#{1,6} +(.*?)(?: +#+)? *$/gm, "$1"], // headings
  [/^ {0,3}(?:> ?)+/gm, ""], // blockquotes
  [/^( *)(?:[-*+]|\d+[.)]) +/gm, "$1"], // list markers
  [/!?\[([^\]]*)\]\([^)]*\)/g, "$1"], // links and images
  [/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2"], // bold
  [/\*(?=\S)(.+?)(?<=\S)\*/g, "$1"], // italics
  [/(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1"], // italics, never inside a word
  [/`([^`\n]+)`/g, "$1"], // inline code
  [/\\([\\`*_{}[\]()#+\-.!>])/g, "$1"], // escapes
];

/** A Markdown story as plain text: markup goes, while words, spacing, and line breaks stay. */
export const markdownToText = (md: string) => MARKDOWN.reduce((text, [pattern, to]) => text.replace(pattern, to), md);

export const BriefSchema = z.object({
  // Labels the song in the list; never sent to the model. Briefs saved before it existed have none.
  storyTitle: z
    .string()
    .max(LIMITS.storyTitle, `Story title must be at most ${LIMITS.storyTitle} characters.`)
    .default(""),
  // Never trimmed or normalized: whitespace and line breaks reach the model as typed.
  sourceText: z
    .string()
    .max(LIMITS.sourceMax, `Story or poem must be at most ${LIMITS.sourceMax.toLocaleString("en-US")} characters.`)
    .refine((s) => wordCount(s) >= LIMITS.sourceMinWords, `Story or poem needs at least ${LIMITS.sourceMinWords} words.`),
  genre: z.enum(GENRES),
  mood: z.int().min(1).max(5),
  narrator: z.enum(["first", "third"]),
  direction: z.string().max(LIMITS.direction, `Additional direction must be at most ${LIMITS.direction} characters.`),
});
export type Brief = z.infer<typeof BriefSchema>;

export const DEFAULT_BRIEF: Brief = {
  storyTitle: "",
  sourceText: "",
  genre: "Rock",
  mood: 4,
  narrator: "first",
  direction: "",
};

export const EXAMPLE_BRIEF: Brief = {
  storyTitle: "A Dream Within a Dream by Edgar Allan Poe",
  sourceText: A_DREAM_WITHIN_A_DREAM,
  genre: "Folk",
  mood: 2,
  narrator: "first",
  direction: "End the chorus with this exact line: Is all we see a dream within a dream?",
};

/** Why a lyric line is invalid, as a clause, or null if it's fine. */
export function lineProblem(text: string): string | null {
  if (!text.trim()) return "is empty";
  if (BREAKS.test(text)) return "contains a line break";
  if (text.length > LIMITS.line) return `is longer than ${LIMITS.line} characters`;
  return null;
}

export const lineId = (sectionId: SectionId, index: number) => `${sectionId}-${index + 1}`;

const LineSchema = z.object({
  id: z.string(),
  text: z.string().refine((t) => lineProblem(t) === null, "Each lyric line must be one nonempty line."),
  locked: z.boolean(),
});

export const DraftSchema = z
  .object({
    title: z.string().min(1).max(LIMITS.title),
    revision: z.int().min(1),
    brief: BriefSchema,
    sections: z.array(z.object({ id: z.enum(SECTION_IDS), lines: z.array(LineSchema).length(4) })).length(5),
  })
  .refine(
    (d) => d.sections.every((s, i) => s.id === SECTION_IDS[i] && s.lines.every((l, j) => l.id === lineId(s.id, j))),
    "Draft sections or line IDs are out of order.",
  );
export type Draft = z.infer<typeof DraftSchema>;

export const LyricsRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), brief: BriefSchema }),
  z.object({ action: z.literal("review"), draft: DraftSchema, sectionId: z.enum(SECTION_IDS).nullable() }),
  z.object({
    action: z.literal("revise"),
    draft: DraftSchema,
    sectionId: z.enum(SECTION_IDS),
    request: z
      .string()
      .max(LIMITS.request, `Revision request must be at most ${LIMITS.request} characters.`)
      .refine((s) => s.trim().length > 0, "Enter a revision request."),
  }),
]);
export type LyricsRequest = z.infer<typeof LyricsRequestSchema>;

// Model output shapes. Counts and lengths are checked in code below, not in the schema.
export const SongSchema = z.object({
  title: z.string(),
  verse1: z.array(z.string()),
  chorus: z.array(z.string()),
  verse2: z.array(z.string()),
  bridge: z.array(z.string()),
  finalChorus: z.array(z.string()),
});
export type Song = z.infer<typeof SongSchema>;

const FindingSchema = z.object({ lineIds: z.array(z.string()), note: z.string() });
export type Finding = z.infer<typeof FindingSchema>;
export const ReviewOutputSchema = z.object({ findings: z.array(FindingSchema) });
export const RevisionOutputSchema = z.object({ operations: z.array(z.object({ lineId: z.string(), after: z.string() })) });

// Server response shapes, checked again by the client on arrival.
export const ReviewResponseSchema = z.object({ findings: z.array(FindingSchema), dropped: z.int().min(0) });
const OperationSchema = z.object({ lineId: z.string(), before: z.string(), after: z.string() });
export type Operation = z.infer<typeof OperationSchema>;
export const RevisionResponseSchema = z.object({ operations: z.array(OperationSchema) });

/** Builds a draft from model output, or returns why the output is invalid. */
export function songToDraft(song: Song, brief: Brief, revision: number): Draft | string {
  const title = song.title.trim();
  if (!title || title.length > LIMITS.title || BREAKS.test(title)) return "the title is missing or too long";
  const sections: Draft["sections"] = [];
  for (const id of SECTION_IDS) {
    const lines = song[id].map((text) => text.trim());
    if (lines.length !== 4) return `${SECTION_LABELS[id]} has ${lines.length} lines instead of 4`;
    for (const text of lines) {
      const problem = lineProblem(text);
      if (problem) return `a line in ${SECTION_LABELS[id]} ${problem}`;
    }
    sections.push({ id, lines: lines.map((text, i) => ({ id: lineId(id, i), text, locked: false })) });
  }
  return { title, revision, brief, sections };
}

function findLine(draft: Draft, id: string) {
  for (const section of draft.sections) {
    const index = section.lines.findIndex((l) => l.id === id);
    if (index >= 0) return { section, index, line: section.lines[index] };
  }
  return null;
}

/** Turns model edits into operations: `before` comes from the accepted draft, never from the model. */
export function withBefore(draft: Draft, edits: { lineId: string; after: string }[]): Operation[] {
  return edits
    .map((e) => ({ lineId: e.lineId, before: findLine(draft, e.lineId)?.line.text ?? "", after: e.after.trim() }))
    .filter((op) => op.after !== op.before);
}

/** Why operations can't apply to this section of this draft, as a clause, or null if they can. */
export function checkOperations(draft: Draft, sectionId: SectionId, operations: Operation[]): string | null {
  if (operations.length === 0) return "it didn't change any lines";
  const seen = new Set<string>();
  for (const op of operations) {
    const found = findLine(draft, op.lineId);
    if (!found || found.section.id !== sectionId) return `it targets a line outside ${SECTION_LABELS[sectionId]}`;
    const label = `${SECTION_LABELS[sectionId]} line ${found.index + 1}`;
    if (found.line.locked) return `${label} is locked`;
    if (seen.has(op.lineId)) return `it changes ${label} twice`;
    seen.add(op.lineId);
    if (op.before !== found.line.text) return `${label} no longer matches the accepted text`;
    const problem = lineProblem(op.after);
    if (problem) return `the new ${label} ${problem}`;
  }
  return null;
}

/** Only line text changes; IDs, order, counts, locks, and other sections stay as they are. */
export function applyOperations(draft: Draft, operations: Operation[], revision: number): Draft {
  const after = new Map(operations.map((op) => [op.lineId, op.after]));
  return {
    ...draft,
    revision,
    sections: draft.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, text: after.get(l.id) ?? l.text })) })),
  };
}

/** Keeps up to three findings that cite real lines; counts the rest as dropped. */
export function groundFindings(draft: Draft, findings: Finding[]) {
  const ids = new Set(draft.sections.flatMap((s) => s.lines.map((l) => l.id)));
  const valid = findings
    .map((f) => ({ lineIds: [...new Set(f.lineIds)], note: f.note.trim() }))
    .filter((f) => f.note && f.lineIds.length > 0 && f.lineIds.every((id) => ids.has(id)));
  return { findings: valid.slice(0, 3), dropped: findings.length - valid.length };
}

export function lineLabel(draft: Draft, id: string) {
  const found = findLine(draft, id);
  return found ? `${SECTION_LABELS[found.section.id]} line ${found.index + 1}` : id;
}

export function lineText(draft: Draft, id: string) {
  return findLine(draft, id)?.line.text ?? "";
}

export function sameBrief(a: Brief, b: Brief) {
  return (Object.keys(a) as (keyof Brief)[]).every((key) => a[key] === b[key]);
}

/** Whether two briefs write the same song: the story title only labels it. */
export const sameSettings = (a: Brief, b: Brief) => sameBrief({ ...a, storyTitle: b.storyTitle }, b);

/** Title, section labels, and line breaks: the Copy format. */
export function lyricsText(draft: Draft) {
  return [
    draft.title,
    ...draft.sections.map((s) => `[${SECTION_LABELS[s.id]}]\n${s.lines.map((l) => l.text).join("\n")}`),
  ].join("\n\n");
}
