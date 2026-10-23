import { z } from "zod";
import { LETS_GET_TOGETHER } from "./lets-get-together.ts";
import { DEFAULT_BRIEF, DraftSchema, EXAMPLE_BRIEF, songToDraft } from "./lyrics.ts";
import type { Brief, Draft, Song } from "./lyrics.ts";

/** Bundled stories, each behind a sample song written during development (not by the app) for the first visit. */
export const STORIES: { name: string; form: Brief; sample: Song }[] = [
  {
    name: "Let's Get Together (Isaac Asimov)",
    form: { ...DEFAULT_BRIEF, sourceText: LETS_GET_TOGETHER, genre: "Electronic", mood: 3, narrator: "third" },
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
    name: "The Last Lighthouse",
    form: EXAMPLE_BRIEF,
    sample: {
      title: "Keep the Fire",
      verse1: [
        "The boats went out at morning and the reef took them one by one",
        "By Sunday the harbor was empty and the village held its tongue",
        "I climbed a hundred iron stairs and lit the lamp against the black",
        "And every time they said his name, I spat the rumor back",
      ],
      chorus: [
        "Burn on, burn on, across the water",
        "Cut through the storm like a blade through the dark",
        "Let the tide come for me, let it come harder",
        "I keep the fire, I keep my name.",
      ],
      verse2: [
        "They said he ran the week the first boat went down",
        "They said the radio went quiet and he slipped out of town",
        "I stood up in the chapel and I shouted down the pews",
        "My brother never left a ship to drown, and that's the truth",
      ],
      bridge: [
        "Behind the spare batteries I found his careful hand",
        "One false distress call, logged in ink: the hour, the reef, the plan",
        "I read it twice by lamplight with my back against the wall",
        "Then I keyed the radio at dawn and told the island all",
      ],
      finalChorus: [
        "Burn on, burn on, for anyone still sailing",
        "Cut through the storm like a blade through the dark",
        "I told the truth on every channel, let it break me",
        "I keep the fire, I keep my name.",
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
