function normalize(value: string): string[] {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
}

function removeLeadingWords(value: string, count: number): string {
  const matches = [...value.matchAll(/\S+/g)];
  if (count >= matches.length) return '';
  return value.slice(matches[count].index).trim();
}

export interface OverlapResult { words: number; confidence: number; merged: string; uncertain: boolean }

export function mergeTextOverlap(previous: string, next: string, enabled = true): OverlapResult {
  if (!enabled) return { words: 0, confidence: 0, merged: `${previous}\n\n${next}`, uncertain: false };
  const a = normalize(previous);
  const b = normalize(next);
  const max = Math.min(80, a.length, b.length);
  let best = 0;
  for (let size = 4; size <= max; size += 1) {
    if (a.slice(-size).join(' ') === b.slice(0, size).join(' ')) best = size;
  }
  const confidence = best ? Math.min(1, best / 8) : 0;
  if (best >= 6) {
    return { words: best, confidence, merged: `${previous.trim()}\n\n${removeLeadingWords(next, best)}`.trim(), uncertain: false };
  }
  const tail = new Set(a.slice(-12));
  const similarity = b.slice(0, 12).filter((word) => tail.has(word)).length / Math.max(1, Math.min(12, b.length));
  const uncertain = similarity >= 0.5;
  return { words: 0, confidence: similarity, merged: `${previous.trim()}\n\n${uncertain ? '[Possible screenshot overlap]\n\n' : ''}${next.trim()}`, uncertain };
}

export function combinedMarkdown(pages: string[], merge: boolean): string {
  if (!pages.length) return '';
  if (!merge) return `# Screenshot Batch\n\n${pages.map((text, index) => `## Image ${index + 1}\n\n${text}`).join('\n\n---\n\n')}`;
  let result = `## Image 1\n\n${pages[0]}`;
  for (let index = 1; index < pages.length; index += 1) {
    const overlap = mergeTextOverlap(pages[index - 1], pages[index], true);
    const nextBody = overlap.words > 0
      ? overlap.merged.slice(pages[index - 1].trim().length).trim()
      : `${overlap.uncertain ? '[Possible screenshot overlap]\n\n' : ''}${pages[index]}`;
    result += `\n\n---\n\n## Image ${index + 1}\n\n${nextBody}`;
  }
  return `# Screenshot Batch\n\n${result}`;
}

export function combinedPlainText(pages: string[], merge: boolean): string {
  if (!pages.length) return '';
  if (!merge) return pages.join('\n\n');
  let result = pages[0].trim();
  for (let index = 1; index < pages.length; index += 1) {
    const overlap = mergeTextOverlap(pages[index - 1], pages[index], true);
    const nextBody = overlap.words > 0
      ? overlap.merged.slice(pages[index - 1].trim().length).trim()
      : pages[index].trim();
    result = `${result}\n\n${nextBody}`.trim();
  }
  return result;
}

export function similarityHash(bytes: Uint8Array): string {
  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += stride) hash = Math.imul(hash ^ bytes[i], 16777619);
  return (hash >>> 0).toString(16);
}
