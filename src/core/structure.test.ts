import { describe, expect, it } from 'vitest';
import { classifyRegion, confidenceLevel, renderMarkdown } from './structure';
import type { TextRegion } from '../types';

const region = (text: string, kind: TextRegion['kind'], confidence = 95): TextRegion => ({ id: text, text, originalText: text, bbox: { x: 0, y: 0, width: 100, height: 18 }, confidence, level: confidenceLevel(confidence), kind, lineIndex: 0 });

describe('structure reconstruction', () => {
  it('preserves labels and required markers', () => expect(renderMarkdown([region('Overall Preference *', 'label')])).toBe('**Overall Preference ***'));
  it('preserves uncertain text without pretending certainty', () => expect(renderMarkdown([region('Prefer 8', 'paragraph', 42)])).toContain('[unclear: possible “Prefer 8”]'));
  it('recognizes options', () => expect(classifyRegion('A. First answer', 16, 16)).toBe('list-item'));
  it('can exclude known UI noise reversibly', () => expect(renderMarkdown([region('Settings', 'ui'), region('Question', 'heading')])).toBe('### Question'));
});
