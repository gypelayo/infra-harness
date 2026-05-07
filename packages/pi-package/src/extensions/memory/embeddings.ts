import { OpenAI } from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set — embeddings unavailable.");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

export { DIMENSIONS };

/**
 * Generate a single embedding vector for a text string.
 * Returns null if OpenAI is not configured.
 */
export async function embed(text: string): Promise<number[] | null> {
  try {
    const client = getClient();
    const res = await client.embeddings.create({ model: MODEL, input: text });
    return res.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Format a Float32 embedding as a sqlite-vec BLOB buffer.
 * sqlite-vec vec0 tables expect a raw binary float32 array.
 */
export function toVecBlob(embedding: number[]): Buffer {
  const buf = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buf.writeFloatLE(embedding[i]!, i * 4);
  }
  return buf;
}
