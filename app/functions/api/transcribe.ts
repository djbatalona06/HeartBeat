import { authenticate, json, type Env } from './_lib';

/**
 * Speech to text, on Cloudflare's own models.
 *
 * The client POSTs raw audio bytes as the body with the blob's mime type in
 * content-type, rather than multipart: the recorder already holds a Blob, and
 * parsing multipart on the way in only to serialise it again on the way out is
 * work for nobody's benefit.
 *
 * Errors carry a `stage` so the client can say something useful. "Transcription
 * failed" is not an error message a person can act on; "the microphone recorded
 * nothing" and "the speech service is down" lead to different next steps.
 */

const MODEL = '@cf/openai/whisper-large-v3-turbo';

/** Whisper rejects very large uploads, and a phone can easily produce one. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Workers AI takes the audio as base64, so the bytes are encoded here.
 * btoa() only accepts a binary string, and spreading a multi-megabyte
 * Uint8Array into String.fromCharCode blows the argument limit, so this walks
 * it in chunks.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

type Stage = 'auth' | 'audio' | 'speech-provider' | 'transcribe';

function fail(stage: Stage, error: string, status: number): Response {
  return json({ stage, error }, status);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Dictation costs money to serve, so it is gated the same way everything
  // else is rather than left open on a public URL.
  const caller = await authenticate(request, env);
  if (!caller) {
    return fail('auth', 'This device is not paired yet. Open Settings and pair it first.', 401);
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return fail('audio', 'The recording was empty. Hold the button while you speak.', 400);
  }
  if (audio.byteLength > MAX_BYTES) {
    return fail('audio', 'That recording is too long. Try again in a shorter burst.', 413);
  }

  let text: string;
  try {
    const result = await env.AI.run(MODEL, {
      audio: toBase64(new Uint8Array(audio)),
      task: 'transcribe',
      // Dictation is short and often trails off. Without this, Whisper is
      // prone to looping the last phrase to fill the silence.
      condition_on_previous_text: false,
    });
    text = (result.text ?? '').trim();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return fail('speech-provider', `The speech service did not answer: ${detail}`, 502);
  }

  if (!text) {
    return fail('transcribe', 'Nothing was said in that recording, or it was too quiet.', 422);
  }

  return json({ text });
};
