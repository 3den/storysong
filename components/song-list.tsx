"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { didSaveFail, parseSongs, readSongs, subscribeSongs, writeSongs, type SavedSong } from "@/lib/library";
import { cn } from "@/lib/utils";

const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function SongList({
  openId,
  onNew,
  onOpen,
  onDeleted,
}: {
  openId: string | null;
  onNew: () => void;
  onOpen: (song: SavedSong) => void;
  onDeleted: (id: string) => void;
}) {
  // The server snapshot is empty, so saved songs appear after hydration.
  const raw = useSyncExternalStore(subscribeSongs, readSongs, () => null);
  const songs = useMemo(() => parseSongs(raw), [raw]);
  const saveFailed = useSyncExternalStore(subscribeSongs, didSaveFail, () => false);
  const [deleted, setDeleted] = useState<{ song: SavedSong; index: number } | null>(null);

  function remove(song: SavedSong, index: number) {
    writeSongs(songs.filter((s) => s.id !== song.id));
    setDeleted({ song, index });
    onDeleted(song.id);
  }

  function restore() {
    if (!deleted) return;
    writeSongs(songs.toSpliced(deleted.index, 0, deleted.song));
    setDeleted(null);
  }

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
        <p role="status" className="px-2 text-sm text-muted-foreground empty:hidden">
          {deleted ? (
            <>
              Deleted “{deleted.song.draft.title}”.{" "}
              <Button variant="link" className="h-auto p-0" onClick={restore}>
                Undo
              </Button>
            </>
          ) : null}
        </p>
        {saveFailed ? (
          <p role="alert" className="px-2 text-sm text-destructive">
            Couldn&apos;t save your latest change. Browser storage is full or turned off.
          </p>
        ) : null}
        {songs.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">Songs you write appear here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {songs.map((song, index) => (
              <li key={song.id} className={cn("flex items-center gap-1 rounded-lg", song.id === openId && "bg-muted")}>
                <Button
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-2 text-left"
                  aria-current={song.id === openId ? "page" : undefined}
                  onClick={() => onOpen(song)}
                >
                  <span className="w-full truncate font-medium">{song.draft.title}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {song.draft.brief.genre}
                    {song.updatedAt ? ` · ${day.format(song.updatedAt)}` : ""}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${song.draft.title}`}
                  className="size-10 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(song, index)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
