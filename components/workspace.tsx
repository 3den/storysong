"use client";

import { AudioLines, ChevronLeft, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { LyricDocument } from "@/components/lyric-document";
import { Composer, SongSettings } from "@/components/settings-form";
import { SongList } from "@/components/song-list";
import { Button } from "@/components/ui/button";
import { SAMPLE_SONGS, parseSongs, readSongs, sampleOriginal, withSong, writeSongs, type SavedSong } from "@/lib/library";
import type { SectionId } from "@/lib/lyrics";
import { begin, blockedReason, briefChanged, initialState, reducer, type ActionKind } from "@/lib/state";
import { cn } from "@/lib/utils";

const WORKING: Record<ActionKind, string> = {
  generate: "Writing the song…",
  review: "Getting feedback…",
  revise: "Rewriting…",
};

export function Workspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const inFlight = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  // Phones show either the song list or the open song; wide screens show both.
  const [listOpen, setListOpen] = useState(false);
  const [deleted, setDeleted] = useState<{ song: SavedSong; index: number } | null>(null);
  const changed = briefChanged(state);
  // The bundled samples stay; only songs the user wrote can be deleted.
  const deletable = state.songId !== null && !SAMPLE_SONGS.some((s) => s.id === state.songId);
  // A changed sample can always go back to its bundled version.
  const original = state.draft && sampleOriginal(state.songId, state.draft);

  // Once nothing is pending (finished, cancelled, or stopped by an edit), close any request still open.
  useEffect(() => {
    if (!state.pending && inFlight.current) {
      inFlight.current.abort();
      inFlight.current = null;
    }
  }, [state.pending]);

  // Autosave: every accepted draft of the open song replaces its saved copy.
  useEffect(() => {
    if (!state.songId || !state.draft) return;
    const songs = withSong(parseSongs(readSongs()), state.songId, state.draft);
    if (songs) writeSongs(songs);
  }, [state.songId, state.draft]);

  async function run(kind: ActionKind, sectionId?: SectionId | null) {
    // The ref, not state, guards against a second click before React re-renders.
    if (inFlight.current || blockedReason(state, kind)) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const { pending, body } = begin(state, kind, ++nextId.current, sectionId);
    dispatch({ type: "start", pending });
    try {
      const response = await fetch("/api/lyrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.ok) {
        dispatch({ type: "arrived", id: pending.id, data });
      } else {
        const error = (data as { error?: unknown } | null)?.error;
        const message = typeof error === "string" ? error : `The request failed (${response.status}).`;
        dispatch({ type: "failed", id: pending.id, message: `${message} Nothing changed.` });
      }
    } catch {
      const message = controller.signal.aborted
        ? "Cancelled. Nothing changed."
        : "Couldn't reach the server. Check your connection and try again.";
      dispatch({ type: "failed", id: pending.id, message });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  function newSong() {
    // An unsaved composer is already a new song; keep what's typed there.
    if (state.songId) dispatch({ type: "newSong" });
    setDeleted(null);
    setListOpen(false);
  }

  function openSong(song: SavedSong) {
    if (song.id !== state.songId) dispatch({ type: "openSong", id: song.id, draft: song.draft });
    setDeleted(null);
    setListOpen(false);
  }

  function deleteSong() {
    const songs = parseSongs(readSongs());
    const index = songs.findIndex((s) => s.id === state.songId);
    if (index >= 0) {
      writeSongs(songs.toSpliced(index, 1));
      setDeleted({ song: songs[index], index });
    }
    dispatch({ type: "newSong" });
  }

  function restore() {
    if (!deleted) return;
    writeSongs(parseSongs(readSongs()).toSpliced(deleted.index, 0, deleted.song));
    setDeleted(null);
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "w-full shrink-0 flex-col gap-6 bg-sidebar p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:overflow-y-auto",
          listOpen ? "flex" : "hidden",
        )}
      >
        <h1 className="flex items-center gap-2 px-2 text-2xl font-bold tracking-tight">
          <AudioLines className="size-7 text-primary" aria-hidden />
          Storysong
        </h1>
        <SongList openId={state.songId} onNew={newSong} onOpen={openSong} />
      </aside>

      <div className={cn("min-w-0 flex-1 flex-col", listOpen ? "hidden lg:flex" : "flex")}>
        <header className="sticky top-0 z-10 flex min-h-16 max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 bg-background/95 px-4 py-3 backdrop-blur sm:px-8">
          <h1 className="sr-only lg:hidden">Storysong</h1>
          <Button variant="ghost" className="h-10 px-2 lg:hidden" onClick={() => setListOpen(true)}>
            <ChevronLeft /> Songs
          </Button>
          <h2 id="page-title" className="min-w-0 flex-1 text-2xl leading-tight font-bold">
            {state.draft?.title ?? "New song"}
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
            {state.pending ? WORKING[state.pending.kind] : null}
          </p>
          {state.pending ? (
            <Button variant="outline" className="h-10 px-4" onClick={() => dispatch({ type: "cancel" })}>
              Cancel
            </Button>
          ) : null}
          {state.draft ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10 px-4" onClick={() => dispatch({ type: "undo" })} disabled={!state.previous}>
                Undo
              </Button>
              <Button variant="highlight" className="h-10 px-4" onClick={() => run("review", null)} disabled={blockedReason(state, "review") !== null}>
                {state.pending?.kind === "review" && state.pending.sectionId === null ? "Getting feedback…" : "Feedback on the whole song"}
              </Button>
            </div>
          ) : null}
        </header>

        <main className="flex w-full max-w-4xl flex-col gap-4 p-4 sm:px-8">
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {deleted ? (
              <>
                Deleted “{deleted.song.draft.title}”.{" "}
                <Button variant="link" className="h-auto p-0" onClick={restore}>
                  Undo
                </Button>
              </>
            ) : null}
          </p>
          {state.draft ? (
            <>
              <SongSettings
                key={state.songId}
                state={state}
                draft={state.draft}
                dispatch={dispatch}
                changed={changed}
                onGenerate={() => run("generate")}
              />
              <LyricDocument state={state} draft={state.draft} dispatch={dispatch} onRun={run} />
              {deletable ? (
                <Button variant="destructive" className="h-10 gap-2 self-start px-4" onClick={deleteSong}>
                  <Trash2 /> Delete song
                </Button>
              ) : null}
              {original ? (
                <Button
                  variant="outline"
                  className="h-10 gap-2 self-start px-4"
                  onClick={() => dispatch({ type: "restoreOriginal", draft: original })}
                >
                  <RotateCcw /> Restore original
                </Button>
              ) : null}
            </>
          ) : (
            <Composer state={state} dispatch={dispatch} onGenerate={() => run("generate")} />
          )}
        </main>
      </div>
    </div>
  );
}
