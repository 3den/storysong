import OpenAI from "openai";
import { z } from "zod";
import {
  LyricsRequestSchema,
  ReviewOutputSchema,
  RevisionOutputSchema,
  SongSchema,
  checkOperations,
  groundFindings,
  songToDraft,
  withBefore,
} from "@/lib/lyrics";
import { generatePrompt, reviewPrompt, revisePrompt, type Prompt } from "@/lib/prompts";

// Two 55s attempts fit inside this.
export const maxDuration = 120;

/** A model response we refuse to pass on; its message is safe to show. */
class OutputError extends Error {}

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

async function ask<T extends z.ZodType>(schema: T, prompt: Prompt, signal: AbortSignal): Promise<z.infer<T>> {
  const client = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
    timeout: 55_000,
    maxRetries: 1,
  });
  const completion = await client.chat.completions.create(
    {
      model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
      reasoning_effort: (process.env.DEEPSEEK_REASONING_EFFORT || "medium") as OpenAI.ReasoningEffort,
      response_format: { type: "json_object" },
      messages: [
        // JSON mode needs the word "json" and the expected shape in the prompt.
        {
          role: "system",
          content: `${prompt.system}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`,
        },
        { role: "user", content: prompt.user },
      ],
    },
    { signal },
  );
  const choice = completion.choices[0];
  if (choice?.finish_reason === "content_filter") {
    throw new OutputError("The model declined this request. Try different source text or direction.");
  }
  const content = choice?.message.content?.trim();
  if (!content) throw new OutputError("The model returned an empty response. Try again.");
  let json: unknown = null;
  try {
    json = JSON.parse(content);
  } catch {}
  const result = schema.safeParse(json);
  if (!result.success) {
    console.error(content);
    throw new OutputError("The model returned a malformed response. Try again.");
  }
  return result.data;
}

function modelFailure(error: unknown) {
  if (error instanceof OutputError) return fail(502, error.message);
  if (error instanceof OpenAI.APIUserAbortError) return fail(499, "Cancelled.");
  console.error(error);
  if (error instanceof OpenAI.APIConnectionTimeoutError) return fail(504, "The model took too long to respond. Try again.");
  if (error instanceof OpenAI.APIConnectionError) return fail(502, "Couldn't reach the model service. Try again.");
  if (error instanceof OpenAI.RateLimitError) return fail(429, "The model service is busy. Wait a moment and try again.");
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return fail(503, "The server's model credentials were rejected.");
  }
  if (error instanceof OpenAI.APIError) return fail(502, `The model service returned an error (${error.status ?? "no status"}). Try again.`);
  return fail(500, "Something went wrong on the server. Try again.");
}

export async function POST(request: Request) {
  const parsed = LyricsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  if (!process.env.DEEPSEEK_API_KEY) return fail(503, "Live generation is not configured on this server.");
  const body = parsed.data;

  try {
    if (body.action === "generate") {
      const song = await ask(SongSchema, generatePrompt(body.brief), request.signal);
      const draft = songToDraft(song, body.brief, 1);
      if (typeof draft === "string") throw new OutputError(`The model returned an invalid song: ${draft}. Try again.`);
      return Response.json(song);
    }

    if (body.action === "review") {
      const out = await ask(ReviewOutputSchema, reviewPrompt(body.draft, body.sectionId), request.signal);
      const grounded = groundFindings(body.draft, out.findings);
      if (grounded.findings.length === 0) throw new OutputError("The review didn't cite any lines from the draft. Try again.");
      return Response.json(grounded);
    }

    const section = body.draft.sections.find((s) => s.id === body.sectionId);
    if (section?.lines.every((l) => l.locked)) return fail(400, "Every line in this section is locked.");
    const out = await ask(RevisionOutputSchema, revisePrompt(body.draft, body.sectionId, body.request), request.signal);
    const operations = withBefore(body.draft, out.operations);
    const problem = checkOperations(body.draft, body.sectionId, operations);
    if (problem) throw new OutputError(`The model's revision was rejected because ${problem}. Try again.`);
    return Response.json({ operations });
  } catch (error) {
    return modelFailure(error);
  }
}
