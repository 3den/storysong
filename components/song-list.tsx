"use client";

import { Plus } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { didSaveFail, parseSongs, readSongs, subscribeSongs, type SavedSong } from "@/lib/library";
import type { Brief } from "@/lib/lyrics";
import { cn } from "@/lib/utils";

// An untitled story goes by its first line.
const storyName = (brief: Brief) => brief.storyTitle.trim() || brief.sourceText.trim().split("\n")[0];

export function SongList({ openId, onNew, onOpen }: { openId: string | null; onNew: () => void; onOpen: (song: SavedSong) => void }) {
  // The server snapshot is empty, so saved songs appear after hydration.
  const raw = useSyncExternalStore(subscribeSongs, readSongs, () => null);
  const songs = useMemo(() => parseSongs(raw), [raw]);
  const saveFailed = useSyncExternalStore(subscribeSongs, didSaveFail, () => false);

  return (
    <nav aria-label="Songs" className="flex flex-col gap-5">
      <Button
        variant={openId === null ? "secondary" : "outline"}
        className="h-11 justify-start gap-2 px-3 text-base"
        aria-current={openId === null ? "page" : undefined}
        onClick={onNew}
      >
        <Plus /> New song
      </Button>

      <div className="flex flex-col gap-2">
        <h2 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your songs</h2>
        {saveFailed ? (
          <p role="alert" className="px-2 text-sm text-destructive">
            Couldn&apos;t save your latest change. Browser storage is full or turned off.
          </p>
        ) : null}
        {songs.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">Songs you write appear here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {songs.map((song) => (
              <li key={song.id}>
                <Button
                  variant="ghost"
                  className={cn(
                    "h-auto w-full flex-col items-start gap-0.5 px-2 py-2 text-left",
                    song.id === openId && "bg-muted",
                  )}
                  aria-current={song.id === openId ? "page" : undefined}
                  onClick={() => onOpen(song)}
                >
                  <span className={cn("w-full truncate font-medium", song.id === openId && "text-primary")}>{song.draft.title}</span>
                  <span className="w-full truncate text-xs font-normal text-muted-foreground">{storyName(song.draft.brief)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
