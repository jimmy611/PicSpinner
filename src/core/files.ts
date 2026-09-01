import type { SourceImage } from '../types';
import { similarityHash } from './overlap';

export async function imageFromFile(file: File): Promise<SourceImage> {
  const url = URL.createObjectURL(file);
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`${file.name} is not a readable image.`));
    image.src = url;
  });
  const hash = similarityHash(new Uint8Array(await file.arrayBuffer()));
  return { id: `${hash}-${crypto.randomUUID()}`, file, name: file.name, url, ...dimensions, status: 'ready', progress: 0, regions: [], rawText: '', markdown: '', confidence: 0 };
}

export function downloadText(content: string, extension: 'md' | 'txt'): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `picspinner-${new Date().toISOString().slice(0, 10)}.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}
