export type ExtractionMode = 'simple' | 'exact' | 'optimized';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ImageStatus = 'ready' | 'queued' | 'processing' | 'done' | 'error';

export interface Box { x: number; y: number; width: number; height: number }

export interface TextRegion {
  id: string;
  text: string;
  originalText: string;
  bbox: Box;
  confidence: number;
  level: ConfidenceLevel;
  kind: 'heading' | 'paragraph' | 'list-item' | 'label' | 'ui' | 'uncertain';
  lineIndex: number;
}

export interface SourceImage {
  id: string;
  file: File;
  name: string;
  url: string;
  width: number;
  height: number;
  status: ImageStatus;
  progress: number;
  error?: string;
  regions: TextRegion[];
  rawText: string;
  markdown: string;
  confidence: number;
  duplicateOf?: string;
}

export interface ExtractionOptions {
  mode: ExtractionMode;
  mergeOverlaps: boolean;
  includeUi: boolean;
  language: string;
}
