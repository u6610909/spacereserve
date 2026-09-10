import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { config, getSecrets } from '../config';
import { logger } from '../lib/logger';

import type { ObjectSchema } from '@google/generative-ai';

const responseSchema: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    capacity: { type: SchemaType.NUMBER, nullable: true, description: 'Number of people' },
    startTime: { type: SchemaType.STRING, nullable: true, description: 'ISO 8601 with a +07:00 offset' },
    endTime: { type: SchemaType.STRING, nullable: true, description: 'ISO 8601 with a +07:00 offset' },
    amenities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: true },
    building: { type: SchemaType.STRING, nullable: true },
  },
};

const geminiResultSchema = z.object({
  capacity: z.number().int().positive().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  amenities: z.array(z.string()).nullable().optional(),
  building: z.string().nullable().optional(),
});

export type GeminiInterpretation = z.infer<typeof geminiResultSchema>;

/** The real values the DB filter can match, so the model maps "music room" to
 * the amenities that exist (piano/keyboard/drums) rather than inventing
 * "music" and returning nothing. */
export interface SearchVocabulary {
  amenities: string[];
  buildings: string[];
}

/**
 * `null` on any failure (missing key, network error, malformed/invalid JSON)
 * — callers fall back to keyword search (docs/architecture.md). Model output is
 * zod-validated before anything downstream touches it; it never reaches
 * Prisma except as typed query-builder arguments.
 */
export async function interpretQuery(
  query: string,
  vocab?: SearchVocabulary,
): Promise<GeminiInterpretation | null> {
  const { geminiApiKey } = getSecrets();
  if (!geminiApiKey) return null;

  try {
    const client = new GoogleGenerativeAI(geminiApiKey);
    const model = client.getGenerativeModel(
      {
        // Pinned model names keep getting retired from the v1beta
        // generateContent endpoint (1.5-flash -> 404, 2.0-flash -> 404).
        // `gemini-flash-lite-latest` is Google's moving alias for the light,
        // high-throughput flash model — plenty for pulling a few fields out of
        // one sentence, and its quota is roomier so the free tier 503s
        // ("model is experiencing high demand") far less often. Any failure
        // still falls back to keyword search with "degraded": true, never a 500.
        model: 'gemini-flash-lite-latest',
        generationConfig: { responseMimeType: 'application/json', responseSchema },
      },
      // `baseUrl` routes the call through the region-unblocked proxy in
      // production (see config.geminiBaseUrl); empty -> the SDK's default host.
      config.geminiBaseUrl ? { baseUrl: config.geminiBaseUrl } : undefined,
    );

    // Relative dates ("tomorrow", "next Monday") are resolved against this —
    // the one place in the codebase that thinks about timezones at all
    // (docs/architecture.md). Everything else stays UTC/timestamptz.
    const nowBangkok = DateTime.now().setZone('Asia/Bangkok').toISO();
    const prompt = [
      `Current date/time in Asia/Bangkok: ${nowBangkok}.`,
      `Extract a room search from this request: "${query}"`,
      'Resolve any relative dates/times against the current date/time above.',
      'capacity is the number of people mentioned, if any.',
      'startTime/endTime must be ISO 8601 with a +07:00 offset.',
      vocab && vocab.amenities.length > 0
        ? `amenities: choose zero or more values EXACTLY from this list, nothing else — [${vocab.amenities.join(
            ', ',
          )}]. Map loose wording (e.g. "music"/"band"/"jam" -> piano, keyboard, drums; "TV" -> tv-display). If nothing clearly fits, return null.`
        : 'amenities: short lowercase keywords, or null.',
      vocab && vocab.buildings.length > 0
        ? `building: one EXACT value from [${vocab.buildings.join(', ')}] or null.`
        : 'building: the building name mentioned, or null.',
      'Omit (null) any field the request does not mention.',
    ].join(' ');

    // One quick retry on a transient upstream 5xx (the free tier occasionally
    // answers 503 "high demand"); anything still failing after that degrades.
    let result;
    try {
      result = await model.generateContent(prompt);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      if (status < 500) throw err;
      await new Promise((r) => setTimeout(r, 400));
      result = await model.generateContent(prompt);
    }
    const parsed: unknown = JSON.parse(result.response.text());
    return geminiResultSchema.parse(parsed);
  } catch (err) {
    logger.warn({ err }, 'gemini interpretation failed');
    return null;
  }
}
