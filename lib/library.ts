import { z } from "zod";
import { LETS_GET_TOGETHER } from "./lets-get-together.ts";
import { DEFAULT_BRIEF, DraftSchema, EXAMPLE_BRIEF, lyricsText, sameBrief, songToDraft } from "./lyrics.ts";
import type { Brief, Draft, Song } from "./lyrics.ts";

/** Bundled stories, each behind a sample song written during development (not by the app) for the first visit. */
export const STORIES: { form: Brief; sample: Song }[] = [
  {
    form: { ...DEFAULT_BRIEF, storyTitle: "Let's Get Together by Isaac Asimov", sourceText: LETS_GET_TOGETHER, genre: "Electronic", mood: 3, narrator: "third" },
    sample: {
      title: "Machine Oil",
      verse1: [
        "A hundred years of quiet wore the map to pastel shades",
        "Green for We and pink for They, a game with gentle rules",
        "Then a soft-faced Security man came in from Washington",
        "And told the Chief of Robotics that the stalemate had come undone",
      ],
      chorus: [
        "Ten quiet strangers walking in from ten directions",
        "Every one a perfect face with nothing underneath",
        "Let's get together, let's get together",
        "Piece by piece the bomb is breathing in the street",
      ],
      verse2: [
        "Each one carries just a fragment, harmless on its own",
        "A coil behind a collarbone, a fuse behind a smile",
        "Bring them close together and the whole sky turns to white",
        "Lynn traces every footstep on the map throughout the night",
      ],
      bridge: [
        "The strangers burn before they're caught, all ten of them at once",
        "Someone warned them from this room without a phone or wire",
        "Lynn turns to the man from Washington and finally fires",
        "Not blood across the floorboards, just high-grade machine oil",
      ],
      finalChorus: [
        "Ten quiet strangers, and the eleventh sat beside him",
        "Every one a perfect face with nothing underneath",
        "Let's get together, let's get together",
        "Peace is just a stalemate breathing through its teeth",
      ],
    },
  },
  {
    form: EXAMPLE_BRIEF,
    sample: {
      title: "Golden Sand",
      verse1: [
        "I kissed you on the brow the morning I went on my way",
        "You called my years a dream, and I had nothing left to say",
        "If hope slips out at midnight or it fades in morning light",
        "Is it any less gone for the hour it took flight?",
      ],
      chorus: [
        "I stand where the long waves roar",
        "With a handful of sand from the shore",
        "The tighter I hold it, the faster it falls to the deep",
        "Is all we see a dream within a dream?",
      ],
      verse2: [
        "I count the grains like hours, and how few they are tonight",
        "They creep between my knuckles and they vanish from the light",
        "I'm weeping now, I'm weeping, and the water doesn't care",
        "It takes the gold I'm holding and it leaves the cold hand bare",
      ],
      bridge: [
        "Lord, can I not close my hand a little tighter still",
        "Can I not save a single one against the water's will",
        "Just one small grain of all of it to carry home to you",
        "But the pitiless wave keeps taking, like it always knew",
      ],
      finalChorus: [
        "I stand where the long waves roar",
        "With an empty hand on the shore",
        "Whatever I held has gone with the tide to the deep",
        "Is all we see a dream within a dream?",
      ],
    },
  },
];

export type SavedSong = { id: string; updatedAt: number; draft: Draft };

/** The song list until the first save: one ready song per prefilled story. */
export const SAMPLE_SONGS: SavedSong[] = STORIES.flatMap((story, index) => {
  const draft = songToDraft(story.sample, story.form, 1);
  return typeof draft === "string" ? [] : [{ id: `sample-${index + 1}`, updatedAt: 0, draft }];
});
const SEED = JSON.stringify(SAMPLE_SONGS);

const locks = (d: Draft) => d.sections.flatMap((s) => s.lines.map((l) => l.locked)).join();

/** The bundled draft for a sample song that has changed from it, or null. Compares content, since stored drafts reorder keys. */
export function sampleOriginal(id: string | null, draft: Draft): Draft | null {
  const sample = SAMPLE_SONGS.find((s) => s.id === id)?.draft;
  if (!sample) return null;
  const same = lyricsText(draft) === lyricsText(sample) && sameBrief(draft.brief, sample.brief) && locks(draft) === locks(sample);
  return same ? null : sample;
}

// Items from before autosave lack updatedAt and carry extra fields, which parsing drops.
const SavedSongSchema = z.object({ id: z.string(), updatedAt: z.number().default(0), draft: DraftSchema });

/** Saved songs from storage, most recently changed first, skipping any that are malformed or no longer valid. */
export function parseSongs(raw: string | null): SavedSong[] {
  try {
    const items: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
      const result = SavedSongSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

/** The list with this draft saved at the top, or null when it's already saved as is. */
export function withSong(songs: SavedSong[], id: string, draft: Draft, now = Date.now()): SavedSong[] | null {
  const saved = songs.find((s) => s.id === id);
  if (saved && JSON.stringify(saved.draft) === JSON.stringify(draft)) return null;
  return [{ id, updatedAt: now, draft }, ...songs.filter((s) => s.id !== id)];
}

const KEY = "storysong:library:v1";
const listeners = new Set<() => void>();
let saveFailed = false;

export function subscribeSongs(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readSongs() {
  try {
    return localStorage.getItem(KEY) ?? SEED;
  } catch {
    return SEED;
  }
}

export const didSaveFail = () => saveFailed;

/** Storage can be full or turned off; that's flagged for the song list to show rather than thrown. */
export function writeSongs(songs: SavedSong[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(songs));
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
  listeners.forEach((notify) => notify());
}
