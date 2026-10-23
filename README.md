# Storysong

Paste a story or poem, pick a genre and mood, and generate a five-section song. Then review it, or revise one section while the lines you lock stay exactly as written.

The spec in `docs/storysong_spec.md` is the source of truth for behavior.

## Run it

```sh
pnpm install
cp .env.example .env.local   # then add your key to DEEPSEEK_API_KEY
pnpm dev
```

Open http://localhost:3000, open the **Golden Sand** sample song, click **Edit settings**, then **Rewrite the song**. Every draft, review, and revision is a live DeepSeek call, to `deepseek-flash` at `medium` reasoning effort unless `DEEPSEEK_MODEL` or `DEEPSEEK_REASONING_EFFORT` says otherwise. Without a key, the app still loads and shows the server's 503 inline.

## Test

```sh
pnpm test    # rules and reducer, node --test, no extra framework
pnpm lint
pnpm build
```

## Deploy

Import the repo into Vercel (Hobby works), set `DEEPSEEK_API_KEY` in the project's environment variables, and deploy. The key never reaches the browser. Every visitor's action spends it, so set a spend limit.

## Where things are

- `lib/lyrics.ts`: input and draft schemas, plus the edit rules (`checkOperations`, `applyOperations`, `groundFindings`) that the server and browser both run.
- `lib/state.ts`: the client reducer. After every action, one pass drops whatever became stale: a request whose brief, lyrics, locks, or section changed, an outdated proposal, an outdated review.
- `lib/library.ts`: the bundled stories behind the sample songs, and the autosaved song list in `localStorage`, validated on read.
- `lib/prompts.ts`: prompt text. Mood guidance comes from the validated mood number.
- `app/api/lyrics/route.ts`: the single endpoint (`generate`, `review`, `revise`). It validates input, calls the model in JSON mode, and checks the result against the schema and the edit rules before returning it.
- `components/`: the song sidebar, the new-song and settings form, and the lyric document, where each section is rewritten and reviewed in place.
