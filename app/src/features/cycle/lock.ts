/**
 * The lock on the cycle page.
 *
 * This is not the app's security boundary — the device's own lock screen is,
 * and everything here is already on a phone someone is holding. What this
 * defends against is the realistic case: the phone is unlocked and face-up on
 * a table, and somebody scrolls it.
 *
 * The PIN is stretched with PBKDF2 rather than hashed once. A four-digit space
 * is ten thousand guesses, which a single SHA-256 round turns over in well
 * under a second; at this iteration count each guess costs enough that reading
 * the salt and hash out of IndexedDB is not a shortcut worth taking. Six digits
 * is the default the screen asks for, which buys two more orders of magnitude
 * for one extra tap.
 *
 * The salt and hash live in settings, which is the one table sync does not
 * carry — the lock is per-device on purpose, so unlocking here does not unlock
 * the other phone.
 */

import { loadSettings, saveSettings } from '../../db/database';

const ITERATIONS = 210_000;
const KEY_BITS = 256;

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;

function toBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/* Both of these return a view over a plain ArrayBuffer rather than whatever
   the source infers: WebCrypto's BufferSource will not take a buffer that
   might be shared. */
function bytes(source: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(source.length));
  out.set(source);
  return out;
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const s = atob(value);
  return bytes(Array.from(s, (c) => c.charCodeAt(0)));
}

export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', bytes(new TextEncoder().encode(pin)), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: ITERATIONS },
    key,
    KEY_BITS,
  );
  return toBase64(new Uint8Array(bits));
}

/** Compares without leaking where two hashes first differ. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`).test(pin);
}

export async function hasPin(): Promise<boolean> {
  const settings = await loadSettings();
  return Boolean(settings.cyclePinSalt && settings.cyclePinHash);
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`a PIN is ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits`);
  const salt = newSalt();
  await saveSettings({ cyclePinSalt: salt, cyclePinHash: await hashPin(pin, salt) });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.cyclePinSalt || !settings.cyclePinHash) return false;
  return sameHash(await hashPin(pin, settings.cyclePinSalt), settings.cyclePinHash);
}

/**
 * Removing the lock needs the PIN, not just the button. Otherwise the person
 * the lock exists for can take it off in two taps.
 */
export async function clearPin(pin: string): Promise<boolean> {
  if (!(await verifyPin(pin))) return false;
  await saveSettings({ cyclePinSalt: undefined, cyclePinHash: undefined });
  return true;
}
