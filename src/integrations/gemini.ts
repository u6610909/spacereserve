import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { getSecrets } from '../config';
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

/**
 * `null` on any failure (missing key, network error, malformed/invalid JSON)
 * — callers fall back to keyword search (MASTER_PROMPT §6a). Model output is
 * zod-validated before anything downstream touches it; it never reaches
 * Prisma except as typed query-builder arguments.
 */
export async function interpretQuery(query: string): Promise<GeminiInterpretation | null> {
  const { geminiApiKey } = getSecrets();
  if (!geminiApiKey) return null;

  try {
    const client = new GoogleGenerativeAI(geminiApiKey);
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json', responseSchema },
    });

    // Relative dates ("tomorrow", "next Monday") are resolved against this —
    // the one place in the codebase that thinks about timezones at all
    // (DECISIONS.md #8). Everything else stays UTC/timestamptz.
    const nowBangkok = DateTime.now().setZone('Asia/Bangkok').toISO();
    const prompt = [
      `Current date/time in Asia/Bangkok: ${nowBangkok}.`,
      `Extract a room search from this request: "${query}"`,
      'Resolve any relative dates/times against the current date/time above.',
      'capacity is the number of people mentioned, if any.',
      'startTime/endTime must be ISO 8601 with a +07:00 offset.',
      'Omit (null) any field the request does not mention.',
    ].join(' ');

    const result = await model.generateContent(prompt);
    const parsed: unknown = JSON.parse(result.response.text());
    return geminiResultSchema.parse(parsed);
  } catch (err) {
    logger.warn({ err }, 'gemini interpretation failed');
    return null;
  }
}
