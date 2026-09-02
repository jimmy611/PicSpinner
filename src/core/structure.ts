import type { TextRegion } from '../types';

const bullet = /^(?:[•●▪◦*]|[-–—])\s+/;
const numbered = /^(?:\d+[.)]|[A-Za-z][.)])\s+/;
const uiNoise = /^(?:home|menu|search|settings|sign out|log in|back|next|submit|cancel)$/i;

export function confidenceLevel(score: number): TextRegion['level'] {
  if (score >= 88) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

export function classifyRegion(text: string, height: number, medianHeight: number): TextRegion['kind'] {
  const clean = text.trim();
  if (uiNoise.test(clean)) return 'ui';
  if (bullet.test(clean) || numbered.test(clean)) return 'list-item';
  if (/\*$/.test(clean) || /:$/.test(clean)) return 'label';
  if (clean.length <= 80 && (height > medianHeight * 1.22 || /^[A-Z][^.!?]{2,50}$/.test(clean))) return 'heading';
  return 'paragraph';
}

export function renderMarkdown(regions: TextRegion[], includeUi = false): string {
  const visible = includeUi ? regions : regions.filter((region) => region.kind !== 'ui');
  const lines: string[] = [];
  for (const region of visible) {
    const value = region.level === 'low' ? `[unclear: possible “${region.text}”]` : region.text;
    if (region.kind === 'heading') lines.push(`### ${value}`);
    else if (region.kind === 'list-item') lines.push(value.replace(bullet, '* '));
    else if (region.kind === 'label') lines.push(`**${value}**`);
    else lines.push(value);
  }
  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function renderPlainText(regions: TextRegion[], includeUi = true): string {
  return (includeUi ? regions : regions.filter((region) => region.kind !== 'ui'))
    .map((region) => region.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function normalizeRegions(regions: TextRegion[]): TextRegion[] {
  const heights = regions.map((r) => r.bbox.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 16;
  return regions
    .sort((a, b) => Math.abs(a.bbox.y - b.bbox.y) < median * 0.45 ? a.bbox.x - b.bbox.x : a.bbox.y - b.bbox.y)
    .map((region, lineIndex) => ({
      ...region,
      lineIndex,
      level: confidenceLevel(region.confidence),
      kind: classifyRegion(region.text, region.bbox.height, median),
    }));
}
