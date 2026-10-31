export function uid(prefix = 'id'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export const nowIso = () => new Date().toISOString();

/** Local calendar date as YYYY-MM-DD (avoids UTC off-by-one). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export const todayKey = () => toDateKey(new Date());

export function formatDay(key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) {
  return parseDateKey(key).toLocaleDateString('en-IE', opts);
}

interface ClaudeHost {
  use: (name: string) => Promise<{ save: (r: { filename: string; data: string }) => Promise<unknown> } | null>;
}

/** True when the app runs inside another page (e.g. a claude.ai artifact), where printing and plain downloads are blocked. */
export const isEmbedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export type DownloadResult = 'saved' | 'declined' | 'unavailable';

/**
 * Saves a generated file. In a normal browser this is an ordinary download.
 * When hosted as a claude.ai artifact it goes through the host's save prompt instead.
 */
export async function downloadFile(filename: string, content: string, type = 'application/json'): Promise<DownloadResult> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    try {
      const downloads = await host.use('downloads');
      if (!downloads) return 'unavailable';
      await downloads.save({ filename, data: content });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  if (isEmbedded) return 'unavailable';
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

/** Reads an image file and shrinks it to a compact JPEG data URL for local storage. */
export function resizeImage(file: File, max = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('The image format is not supported.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image processing is not available.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const plural = (n: number, word: string, pluralWord = word + 's') => `${n} ${n === 1 ? word : pluralWord}`;

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
