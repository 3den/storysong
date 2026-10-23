"use client";

import { Lock, LockOpen } from "lucide-react";
import { useState, type Dispatch } from "react";
import { Failure } from "@/components/failure";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, SECTION_LABELS, lineLabel, lyricsText, type Draft, type SectionId } from "@/lib/lyrics";
import { blockedReason, briefChanged, type Action, type ActionKind, type Review, type State } from "@/lib/state";
import { cn } from "@/lib/utils";

type Run = (kind: ActionKind, sectionId?: SectionId | null) => void;

function Feedback({ draft, review, dispatch }: { draft: Draft; review: Review; dispatch: Dispatch<Action> }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Feedback · {review.sectionId ? SECTION_LABELS[review.sectionId] : "Whole song"}</h3>
        <Button variant="ghost" className="h-9 px-3" onClick={() => dispatch({ type: "clearReview" })}>
          Dismiss
        </Button>
      </div>
      <ol className="flex flex-col gap-3">
        {review.findings.map((finding, index) => (
          <li key={index} className="flex gap-3">
            <span className="font-semibold text-primary" aria-hidden>
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <p>{finding.note}</p>
              <p className="text-xs text-muted-foreground">{finding.lineIds.map((id) => lineLabel(draft, id)).join(", ")}</p>
            </div>
          </li>
        ))}
      </ol>
      {review.dropped > 0 ? (
        <p className="text-xs text-muted-foreground">
          {review.dropped === 1 ? "1 note was" : `${review.dropped} notes were`} dropped because it cited lines that aren&apos;t in
          the song.
        </p>
      ) : null}
    </div>
  );
}

function SectionBlock({
  state,
  draft,
  section,
  marks,
  dispatch,
  onRun,
}: {
  state: State;
  draft: Draft;
  section: Draft["sections"][number];
  marks: Map<string, number[]>;
  dispatch: Dispatch<Action>;
  onRun: Run;
}) {
  const { pending, proposal, failure, review } = state;
  const label = SECTION_LABELS[section.id];
  const selected = section.id === state.selectedSectionId;
  // A proposal only ever belongs to the selected section; changing the selection clears it.
  const changes = selected && proposal ? new Map(proposal.operations.map((op) => [op.lineId, op])) : null;
  const select = (sectionId: SectionId | null) => dispatch({ type: "select", sectionId });
  const working = (kind: ActionKind) => pending?.kind === kind && pending.sectionId === section.id;
  const reviseBlocked = blockedReason(state, "revise");
  const reviewBlocked = blockedReason(state, "review");

  return (
    <section
      aria-labelledby={`${section.id}-heading`}
      // The heading button is the keyboard control; clicking anywhere else is a shortcut, off while a proposal waits.
      onClick={selected || proposal ? undefined : () => select(section.id)}
      className={cn(
        "rounded-xl border p-2 sm:p-3",
        selected ? "border-primary bg-primary/5" : "border-transparent",
        !selected && !proposal && "cursor-pointer hover:border-border",
      )}
    >
      <h3 id={`${section.id}-heading`}>
        <Button
          variant="ghost"
          aria-expanded={selected}
          onClick={(e) => {
            e.stopPropagation();
            select(selected ? null : section.id);
          }}
          className="h-10 px-2 text-sm font-semibold tracking-wide uppercase"
        >
          {label}
        </Button>
      </h3>
      <ol className="flex flex-col">
        {section.lines.map((line, index) => {
          const op = changes?.get(line.id);
          const notes = marks.get(line.id);
          return (
            <li key={line.id} className="flex items-start gap-1">
              <span className="flex size-11 shrink-0 items-center justify-center">
                {selected ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-pressed={line.locked}
                    aria-label={`Lock ${label} line ${index + 1}`}
                    onClick={() => dispatch({ type: "toggleLock", lineId: line.id })}
                    className={cn("size-11", line.locked ? "text-primary" : "text-muted-foreground")}
                  >
                    {line.locked ? <Lock /> : <LockOpen />}
                  </Button>
                ) : line.locked ? (
                  <>
                    <Lock className="size-4 text-primary" aria-hidden />
                    <span className="sr-only">Locked</span>
                  </>
                ) : null}
              </span>
              <div className="flex-1 py-2.5 font-serif text-lg leading-snug">
                {op ? (
                  <>
                    <del className="block text-base text-muted-foreground">
                      <span className="sr-only">Was: </span>
                      {op.before}
                    </del>
                    <ins className="block text-primary no-underline">
                      <span className="sr-only">Proposed: </span>
                      {op.after}
                    </ins>
                  </>
                ) : (
                  line.text
                )}
                {notes ? (
                  <>
                    <sup className="ml-1 font-sans text-xs font-semibold text-primary" aria-hidden>
                      {notes.join(",")}
                    </sup>
                    <span className="sr-only">(feedback note {notes.join(", ")})</span>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {selected ? (
        <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
          {changes ? (
            <>
              <p className="text-sm text-muted-foreground">
                {changes.size} of {section.lines.length} lines change. Locked lines and other sections stay as they are.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="h-10 px-4" onClick={() => dispatch({ type: "accept" })}>
                  Keep changes
                </Button>
                <Button variant="outline" className="h-10 px-4" onClick={() => dispatch({ type: "discard" })}>
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="request">What should change?</Label>
                <Textarea
                  id="request"
                  value={state.request}
                  placeholder="For example: more defiant and less literal. Keep the last line."
                  onChange={(e) => dispatch({ type: "setRequest", request: e.target.value })}
                  className="min-h-20 font-sans text-sm"
                />
                {state.request.length > LIMITS.request - 100 ? (
                  <p className={state.request.length > LIMITS.request ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {state.request.length} / {LIMITS.request}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="h-10 px-4" onClick={() => onRun("revise")} disabled={reviseBlocked !== null}>
                  {working("revise") ? "Rewriting…" : `Rewrite ${label}`}
                </Button>
                <Button variant="outline" className="h-10 px-4" onClick={() => onRun("review", section.id)} disabled={reviewBlocked !== null}>
                  {working("review") ? "Getting feedback…" : "Get feedback"}
                </Button>
              </div>
              {/* Changed settings are explained once, in the settings panel. */}
              {reviseBlocked && !pending && !briefChanged(state) ? <p className="text-sm text-muted-foreground">{reviseBlocked}</p> : null}
            </>
          )}
          {failure && failure.kind !== "generate" ? (
            <Failure
              message={failure.message}
              onRetry={() => onRun(failure.kind, section.id)}
              retryDisabled={blockedReason(state, failure.kind) !== null}
            />
          ) : null}
        </div>
      ) : null}

      {review?.sectionId === section.id ? (
        <div className="mt-3">
          <Feedback draft={draft} review={review} dispatch={dispatch} />
        </div>
      ) : null}
    </section>
  );
}

export function LyricDocument({ state, draft, dispatch, onRun }: { state: State; draft: Draft; dispatch: Dispatch<Action>; onRun: Run }) {
  const { review, failure } = state;
  // Line id → the numbers of the feedback notes that cite it.
  const marks = new Map<string, number[]>();
  review?.findings.forEach((finding, index) => {
    for (const id of finding.lineIds) marks.set(id, [...(marks.get(id) ?? []), index + 1]);
  });
  const [copyNote, setCopyNote] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(lyricsText(draft));
      setCopyNote("Copied");
      setTimeout(() => setCopyNote(""), 2500);
    } catch {
      setCopyNote("Couldn't copy. Select the lyrics and copy them by hand.");
    }
  }

  return (
    <article aria-labelledby="page-title" className="flex flex-col gap-3 rounded-xl bg-card p-3 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <p className="text-sm text-muted-foreground">Select a section to rewrite it or get feedback. Lock the lines you want to keep.</p>
        <div className="flex items-center gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {copyNote}
          </p>
          <Button variant="outline" className="h-10 px-4" onClick={copy}>
            Copy lyrics
          </Button>
        </div>
      </div>
      {failure && failure.kind !== "generate" && !state.selectedSectionId ? (
        <Failure message={failure.message} onRetry={() => onRun(failure.kind, null)} retryDisabled={blockedReason(state, failure.kind) !== null} />
      ) : null}
      {review && review.sectionId === null ? <Feedback draft={draft} review={review} dispatch={dispatch} /> : null}
      {draft.sections.map((section) => (
        <SectionBlock key={section.id} state={state} draft={draft} section={section} marks={marks} dispatch={dispatch} onRun={onRun} />
      ))}
    </article>
  );
}
