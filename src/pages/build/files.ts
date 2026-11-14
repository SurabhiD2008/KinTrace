import { LIMITS } from '../../domain';

/**
 * Largest file read for import. UTF-16 takes two bytes a character, so the
 * byte limit is twice the text limit; deserialize then checks the text itself.
 */
export const MAX_IMPORT_BYTES = LIMITS.maxBytes * 2;

/**
 * Text from a file's bytes. A byte-order mark picks UTF-16 (little or big
 * endian) or UTF-8; anything else is read as UTF-8, with bad bytes replaced
 * rather than thrown on.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return new TextDecoder('utf-8').decode(utf8Bom ? bytes.subarray(3) : bytes);
}

/** Reads a chosen file as text. Nothing leaves the device. */
export async function readTextFile(file: File): Promise<string> {
  if (typeof file.arrayBuffer === 'function') return decodeText(new Uint8Array(await file.arrayBuffer()));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(reader.result instanceof ArrayBuffer ? decodeText(new Uint8Array(reader.result)) : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

/** Offers text to the user as a file download. Returns false where the browser cannot do it. */
export function downloadTextFile(name: string, text: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
