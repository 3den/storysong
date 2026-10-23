"use client";

import { useState, type Dispatch, type ReactNode } from "react";
import { Failure } from "@/components/failure";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GENRES, LIMITS, MOODS, markdownToText, wordCount, type Brief, type Draft } from "@/lib/lyrics";
import { blockedReason, type Action, type State } from "@/lib/state";

const count = (n: number) => n.toLocaleString("en-US");

function LimitedText(props: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  limit: number;
  onChange: (value: string) => void;
}) {
  const over = props.value.length > props.limit;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Textarea
        id={props.id}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        aria-describedby={`${props.id}-count`}
        aria-invalid={over || undefined}
        className="max-h-40 min-h-16 text-sm"
      />
      <p id={`${props.id}-count`} className={over ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {count(props.value.length)} / {count(props.limit)}
        {over ? ` · ${count(props.value.length - props.limit)} over the limit` : ""}
      </p>
    </div>
  );
}

/** The story and preferences, shared by the new-song composer and a song's settings panel. */
function SettingsForm({
  state,
  dispatch,
  onGenerate,
  submitLabel,
  children,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  onGenerate: () => void;
  submitLabel: string;
  children?: ReactNode;
}) {
  const { form } = state;
  const edit = (patch: Partial<Brief>) => dispatch({ type: "edit", patch });
  const mood = MOODS[form.mood - 1];
  const length = form.sourceText.length;
  const words = wordCount(form.sourceText);
  const sourceError =
    length > LIMITS.sourceMax
      ? `Shorten it by ${count(length - LIMITS.sourceMax)} characters.`
      : length > 0 && words < LIMITS.sourceMinWords
        ? `Enter at least ${LIMITS.sourceMinWords} words.`
        : null;
  const blocked = blockedReason(state, "generate");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="source">Story or poem</Label>
        <Textarea
          id="source"
          value={form.sourceText}
          onChange={(e) => edit({ sourceText: e.target.value })}
          placeholder="Paste a story or poem you want to turn into lyrics."
          aria-describedby={sourceError ? "source-count source-error" : "source-count"}
          aria-invalid={sourceError ? true : undefined}
          className="max-h-[28rem] min-h-44 font-serif text-base leading-relaxed md:text-base"
        />
        <p id="source-count" className="text-xs text-muted-foreground">
          {count(words)} words
          {length > LIMITS.sourceMax * 0.9 ? ` · ${count(length)} / ${count(LIMITS.sourceMax)} characters` : ""}
        </p>
        {sourceError ? (
          <p id="source-error" className="text-sm text-destructive">
            {sourceError}
          </p>
        ) : null}
        {state.stash ? (
          <p className="text-sm text-muted-foreground">
            Your earlier inputs were replaced.{" "}
            <Button variant="link" className="h-auto p-0" onClick={() => dispatch({ type: "restoreInputs" })}>
              Restore your inputs
            </Button>
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="genre">Genre</Label>
          <Select value={form.genre} onValueChange={(genre) => edit({ genre: genre as Brief["genre"] })}>
            <SelectTrigger id="genre" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENRES.map((genre) => (
                <SelectItem key={genre} value={genre}>
                  {genre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="mood">Mood</Label>
            <span className="text-sm" aria-hidden>
              {mood.label} · {form.mood}
            </span>
          </div>
          <input
            id="mood"
            type="range"
            min={1}
            max={5}
            step={1}
            value={form.mood}
            onChange={(e) => edit({ mood: Number(e.target.value) })}
            aria-valuetext={`${mood.label}, ${form.mood} out of 5`}
            className="h-10 w-full cursor-pointer rounded-md accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
            <span>Calm</span>
            <span>Aggressive</span>
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Narrator</legend>
          <RadioGroup
            value={form.narrator}
            onValueChange={(narrator) => edit({ narrator: narrator as Brief["narrator"] })}
            className="flex flex-wrap gap-x-6 gap-y-3"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="narrator-first" value="first" />
              <Label htmlFor="narrator-first">First person</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="narrator-third" value="third" />
              <Label htmlFor="narrator-third">Third person</Label>
            </div>
          </RadioGroup>
        </fieldset>
      </div>

      <LimitedText
        id="direction"
        label="Note for the writer (optional)"
        placeholder="For example: end the chorus with “I keep the fire, I keep my name.”"
        value={form.direction}
        limit={LIMITS.direction}
        onChange={(direction) => edit({ direction })}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 px-6 text-base" onClick={onGenerate} disabled={blocked !== null}>
            {state.pending?.kind === "generate" ? "Writing…" : submitLabel}
          </Button>
          {children}
        </div>
        {state.failure?.kind === "generate" ? (
          <Failure message={state.failure.message} onRetry={onGenerate} retryDisabled={blocked !== null} />
        ) : null}
      </div>
    </div>
  );
}

const STORY_FILE = /\.(txt|md)$/i;

export function Composer({ state, dispatch, onGenerate }: { state: State; dispatch: Dispatch<Action>; onGenerate: () => void }) {
  const [fileError, setFileError] = useState<string | null>(null);

  // The file is read here in the browser; only its text joins the brief. `accept` is a hint, so the type is checked too.
  async function load(file: File) {
    const type = STORY_FILE.exec(file.name)?.[1].toLowerCase();
    if (!type) return setFileError("Choose a .txt or .md file.");
    // A UTF-8 character takes at most 4 bytes, so a larger file can't fit the limit.
    if (file.size > LIMITS.sourceMax * 4) return setFileError(`That file is too long. A story can be up to ${count(LIMITS.sourceMax)} characters.`);
    try {
      const text = await file.text();
      dispatch({ type: "loadStory", sourceText: type === "md" ? markdownToText(text) : text });
      setFileError(null);
    } catch {
      setFileError("Couldn't read that file. Nothing changed.");
    }
  }

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="story-file">Load a story from a file</Label>
        <input
          id="story-file"
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          aria-describedby={fileError ? "story-file-hint story-file-error" : "story-file-hint"}
          aria-invalid={fileError ? true : undefined}
          onClick={(e) => {
            // Lets the same file load again after edits.
            e.currentTarget.value = "";
          }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
          }}
          className="w-full cursor-pointer rounded-lg text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 file:mr-3 file:h-10 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-input/30 file:px-4 file:text-sm file:font-medium file:text-foreground hover:file:bg-input/50"
        />
        <p id="story-file-hint" className="text-xs text-muted-foreground">
          A .txt or .md file. Its text replaces the story below.
        </p>
        {fileError ? (
          <p id="story-file-error" className="text-sm text-destructive">
            {fileError}
          </p>
        ) : null}
      </div>
      <SettingsForm state={state} dispatch={dispatch} onGenerate={onGenerate} submitLabel="Write the song" />
    </section>
  );
}

/** One line naming the settings that wrote the lyrics; opens into the full form to change them. */
export function SongSettings({
  state,
  draft,
  dispatch,
  changed,
  onGenerate,
}: {
  state: State;
  draft: Draft;
  dispatch: Dispatch<Action>;
  changed: boolean;
  onGenerate: () => void;
}) {
  // Stays open until the draft changes, so a rewrite with these settings closes it.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const open = changed || openAt === draft.revision;
  const { brief } = draft;
  const summary = [
    brief.genre,
    `${MOODS[brief.mood - 1].label} (${brief.mood})`,
    brief.narrator === "first" ? "First person" : "Third person",
    `${count(wordCount(brief.sourceText))}-word story`,
  ].join(" · ");

  return (
    <section aria-label="Song settings" className="flex flex-col gap-4 rounded-xl border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{summary}</p>
        {changed ? null : (
          <Button variant="outline" className="h-10 px-4" aria-expanded={open} onClick={() => setOpenAt(open ? null : draft.revision)}>
            {open ? "Close" : "Edit settings"}
          </Button>
        )}
      </div>
      {open ? (
        <>
          {changed ? (
            <p className="text-sm">
              <span className="font-semibold text-primary">Settings changed. </span>
              The lyrics were written with the settings above. Rewrite the song to use the new ones, or discard the changes.
            </p>
          ) : null}
          <SettingsForm state={state} dispatch={dispatch} onGenerate={onGenerate} submitLabel="Rewrite the song">
            {changed ? (
              <Button
                variant="outline"
                className="h-11 px-4"
                onClick={() => {
                  dispatch({ type: "revertBrief" });
                  setOpenAt(null);
                }}
              >
                Discard changes
              </Button>
            ) : null}
          </SettingsForm>
        </>
      ) : null}
    </section>
  );
}
