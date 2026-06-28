// Shared config codec. The widget config can be carried in the URL as
// `?config=<base64>` so it can be shared without relying on localStorage.
// Uses URL-safe base64 over a UTF-8 encoding so Korean folder names survive.

export const CONFIG_STORAGE_KEY = "daily-widget-config";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeConfig(config: unknown): string {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);
  return toBase64Url(bytes);
}

export function decodeConfig<T = unknown>(encoded: string): T | null {
  try {
    const bytes = fromBase64Url(encoded);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Build a full shareable URL pointing at the widget root with the config embedded.
export function buildShareUrl(config: unknown, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?config=${encodeConfig(config)}`;
}
