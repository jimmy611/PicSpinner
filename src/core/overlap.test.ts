import { describe, expect, it } from 'vitest';
import { mergeTextOverlap, similarityHash } from './overlap';

describe('overlap detection', () => {
  it('removes only substantial exact normalized overlap', () => {
    const result = mergeTextOverlap('Keep all words before this repeated phrase of six words exactly', 'repeated phrase of six words exactly then continue here');
    expect(result.words).toBe(6);
    expect(result.merged).toContain('then continue here');
  });
  it('preserves unrelated pages', () => expect(mergeTextOverlap('alpha beta gamma', 'delta epsilon zeta').merged).toContain('delta'));
  it('creates stable sampled hashes', () => expect(similarityHash(new Uint8Array([1, 2, 3]))).toBe(similarityHash(new Uint8Array([1, 2, 3]))));
});
