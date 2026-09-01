import { createWorker, type Worker } from 'tesseract.js';
import type { SourceImage, TextRegion } from '../types';
import { normalizeRegions, renderMarkdown } from './structure';

type ProgressCallback = (id: string, progress: number) => void;

function linesFromResult(data: unknown, image: SourceImage): TextRegion[] {
  const payload = data as { blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> };
  const lines = payload.blocks?.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []) ?? [];
  return normalizeRegions(lines.filter((line) => line.text.trim()).map((line, index) => ({
    id: `${image.id}-region-${index}`,
    text: line.text.trimEnd(),
    originalText: line.text.trimEnd(),
    confidence: line.confidence,
    level: 'high' as const,
    kind: 'paragraph' as const,
    lineIndex: index,
    bbox: { x: line.bbox.x0, y: line.bbox.y0, width: line.bbox.x1 - line.bbox.x0, height: line.bbox.y1 - line.bbox.y0 },
  })));
}

export class OcrPool {
  private readonly size: number;
  private cancelled = false;

  constructor(size = Math.min(3, Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2)))) {
    this.size = size;
  }

  cancel(): void { this.cancelled = true; }

  async process(images: SourceImage[], language: string, onProgress: ProgressCallback): Promise<SourceImage[]> {
    this.cancelled = false;
    const queue = [...images];
    const completed: SourceImage[] = [];
    const run = async () => {
      let worker: Worker | undefined;
      let activeId: string | undefined;
      try {
        worker = await createWorker(language, 1, { logger: (message) => {
          if (activeId && message.status === 'recognizing text') onProgress(activeId, message.progress * 100);
        }});
        while (queue.length && !this.cancelled) {
          const image = queue.shift()!;
          activeId = image.id;
          onProgress(image.id, 2);
          try {
            const result = await worker.recognize(image.file, {}, { blocks: true });
            const regions = linesFromResult(result.data, image);
            const markdown = renderMarkdown(regions);
            completed.push({ ...image, regions, rawText: regions.map((r) => r.text).join('\n'), markdown,
              confidence: regions.length ? regions.reduce((sum, r) => sum + r.confidence, 0) / regions.length : 0,
              status: 'done', progress: 100 });
          } catch (error) {
            completed.push({ ...image, status: 'error', progress: 0, error: error instanceof Error ? error.message : 'OCR failed' });
          }
          activeId = undefined;
        }
      } finally { await worker?.terminate(); }
    };
    await Promise.all(Array.from({ length: Math.min(this.size, images.length) }, run));
    return images.map((image) => completed.find((item) => item.id === image.id) ?? image);
  }
}
