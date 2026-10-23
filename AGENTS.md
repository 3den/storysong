# Storysong

A lyrics-only workspace: paste a story or poem, pick genre and mood, generate a song draft, then revise it while protecting locked lines.

## Spec is the architecture

`docs/storysong_spec.md` is the living architecture doc. Read it before feature work.

- Any change to behavior, the API, the state model, validation rules, UI layout, or scope updates the spec in the same change.
- Edit the section that owns the fact; don't append a changelog.
- If the code and spec disagree, stop and ask which one is right. Don't silently pick one.

## Stack and scope

- Next.js + TypeScript + Tailwind CSS, deployed on Vercel Hobby, one text-model provider.
- shadcn/ui for the few components listed in the spec's Interface section; add others only when the spec needs them. Mood slider stays a native `<input type="range">`.
- One endpoint: `POST /api/lyrics` with actions `generate`, `review`, `revise`.
- Model credentials stay on the server. No database, accounts, server uploads, audio, or Suno. A story file is read in the browser.

## Hard rules

- Validate all input on the server. Mood must be an integer 1–5; derive mood guidance from the validated number. Preserve source whitespace and line breaks.
- Revision operations are `{ lineId, before, after }`. Enforce locks, section scope, line IDs, order, counts, and brief/draft revision match in code, never in the prompt alone.
- Stale, failed, cancelled, or malformed responses never change accepted work. Never silently fall back to sample content after a live failure.
- Render model output as plain text.
- One model action at a time, with visible loading and retry states.
- Accessibility: labeled controls, keyboard access, visible focus, works at 390px and 1024px.

## Priorities

Generation and controlled revision come first. Simplify Review and optional controls if time runs short. Target about 2 hours; hard stop at 8.

## Repo hygiene

- Keep "Anthropic" out of code, UI copy, and committed content.
- Never commit AI chat transcripts.
- `docs/SWE_take-home_assignment.md` is reference only; nothing from it ships in the app.

## Skills

Skills live in `.agents/skills/` (Claude reads them via the `.claude/skills` symlink).

- `ponytail`: default for all coding work. Smallest complete change.
- `vercel-react-best-practices`: when writing or reviewing React/Next.js code.
- `no-ai-slop`: when writing the README, design rationale, or UI copy.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
