import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture, ArrowDownToLine, Camera, Check, ChevronDown, Clipboard, Copy, FileImage, FolderOpen,
  GripVertical, ImagePlus, LockKeyhole, Moon, Play, Search, ShieldCheck, Sparkles, Sun,
  SwitchCamera, Upload, X,
} from 'lucide-react';
import type { ExtractionOptions, SourceImage, TextRegion } from './types';
import { imageFromFile, downloadText } from './core/files';
import { OcrPool } from './core/ocr';
import { combinedMarkdown, combinedPlainText } from './core/overlap';
import { renderMarkdown, renderPlainText } from './core/structure';

const defaultOptions: ExtractionOptions = { mode: 'simple', mergeOverlaps: true, includeUi: false, language: 'eng' };

function plainText(markdown: string): string {
  return markdown.replace(/^#{1,6}\s+/gm, '').replace(/^\*\*(.*?)\*\*$/gm, '$1').replace(/^\*\s+/gm, '• ');
}

export default function App() {
  const [images, setImages] = useState<SourceImage[]>([]);
  const [options, setOptions] = useState(defaultOptions);
  const [activeId, setActiveId] = useState<string>();
  const [activeRegion, setActiveRegion] = useState<string>();
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('picspinner-theme') === 'dark');
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const pool = useRef<OcrPool | null>(null);
  const active = images.find((image) => image.id === activeId) ?? images[0];
  const done = images.filter((image) => image.status === 'done');

  const simpleMode = options.mode === 'simple';
  const includeUi = options.mode !== 'optimized' || options.includeUi;
  const output = useMemo(() => simpleMode
    ? combinedPlainText(done.map((image) => renderPlainText(image.regions, includeUi)), options.mergeOverlaps)
    : combinedMarkdown(done.map((image) => renderMarkdown(image.regions, includeUi)), options.mergeOverlaps), [done, includeUi, options.mergeOverlaps, simpleMode]);
  const characterCount = output.length;
  const uncertain = useMemo(() => images.flatMap((image) => image.regions.filter((r) => r.level !== 'high').map((region) => ({ image, region }))), [images]);
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    return images.flatMap((image, imageIndex) => image.regions.filter((region) => region.text.toLocaleLowerCase().includes(term)).map((region) => ({ image, imageIndex, region })));
  }, [images, query]);
  const visibleRegions = active?.regions.filter((region) => !showReview || region.level !== 'high') ?? [];

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('picspinner-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => () => images.forEach((image) => URL.revokeObjectURL(image.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 1800); };

  const addFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((file) => file.type.startsWith('image/'));
    if (!valid.length) { notify('Choose one or more image files'); return []; }
    const loaded = await Promise.allSettled(valid.map(imageFromFile));
    const next = loaded.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    setImages((current) => {
      const signatures = new Map(current.map((image) => [image.id.split('-')[0], image.id]));
      return [...current, ...next.map((image) => ({ ...image, duplicateOf: signatures.get(image.id.split('-')[0]) }))];
    });
    setActiveId((current) => current ?? next[0]?.id);
    if (next.length !== valid.length) notify(`${valid.length - next.length} image(s) could not be read`);
    return next;
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); void addFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const runExtraction = useCallback(async (targets: SourceImage[]) => {
    if (!targets.length || processing) return;
    setProcessing(true);
    setImages((current) => current.map((image) => targets.some((target) => target.id === image.id) ? { ...image, status: 'queued', progress: 0 } : image));
    pool.current = new OcrPool();
    const processed = await pool.current.process(targets, options.language, (id, progress) => {
      setImages((current) => current.map((image) => image.id === id ? { ...image, status: 'processing', progress } : image));
    });
    setImages((current) => current.map((image) => processed.find((item) => item.id === image.id) ?? image));
    setProcessing(false);
    notify(processed.some((image) => image.status === 'error') ? 'Finished with errors' : 'Extraction complete');
  }, [options.language, processing]);

  const process = useCallback(async () => {
    await runExtraction(images.filter((image) => image.status !== 'done'));
  }, [images, runExtraction]);

  const acceptCameraPhoto = useCallback(async (file: File) => {
    const added = await addFiles([file]);
    if (!added.length) return;
    setActiveId(added[0].id);
    void runExtraction(added);
  }, [addFiles, runExtraction]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === 'c' && output) { event.preventDefault(); void navigator.clipboard.writeText(output).then(() => notify('Copied all')); }
      if (mod && event.key === 'Enter') { event.preventDefault(); void process(); }
      if (event.key === 'Escape') { setShowReview(false); setActiveRegion(undefined); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [output, process]);

  const copy = async (text: string, label = 'Copied') => { await navigator.clipboard.writeText(text); notify(label); };
  const remove = (id: string) => { const removed = images.find((image) => image.id === id); if (removed) URL.revokeObjectURL(removed.url); setImages((current) => current.filter((image) => image.id !== id)); if (activeId === id) setActiveId(undefined); };
  const reorder = (from: number, to: number) => setImages((current) => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  const updateRegion = (imageId: string, regionId: string, text: string) => setImages((current) => current.map((image) => image.id !== imageId ? image : {
    ...image, regions: image.regions.map((region) => region.id === regionId ? { ...region, text } : region),
  }));

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="PicSpinner home"><span className="brand-mark"><ScanGlyph /></span><span>PicSpinner</span><em>LOCAL OCR</em></a>
      <div className="header-actions"><span className="privacy"><LockKeyhole size={14} /> Images stay on this device</span><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle color theme">{dark ? <Sun /> : <Moon />}</button></div>
    </header>

    <main id="top">
      <section className="intro">
        <div><p className="eyebrow"><Sparkles size={14} /> High-fidelity transcription</p><h1>Turn screenshots into<br/><span>structured text.</span></h1><p>Preserve wording, punctuation, and hierarchy—ready to copy into any AI tool.</p></div>
        <div className="trust-card"><ShieldCheck /><div><strong>Private by design</strong><span>OCR runs locally in your browser. Nothing is uploaded.</span></div></div>
      </section>

      {images.length === 0 ? <UploadZone dragging={dragging} setDragging={setDragging} onFiles={addFiles} onBrowse={() => fileInput.current?.click()} onFolder={() => folderInput.current?.click()} onCamera={() => setCameraOpen(true)} /> : <>
        <section className="batch-section">
          <div className="section-heading"><div><span className="step">01</span><div><h2>Source images</h2><p>{images.length} image{images.length === 1 ? '' : 's'} · drag to reorder</p></div></div><div className="source-actions"><button className="text-button" onClick={() => setCameraOpen(true)}><Camera /> Camera</button><button className="text-button" onClick={() => fileInput.current?.click()}><ImagePlus /> Add more</button></div></div>
          <div className="thumbnail-strip">
            {images.map((image, index) => <article key={image.id} className={`thumbnail-card ${active?.id === image.id ? 'active' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('index', String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => reorder(Number(e.dataTransfer.getData('index')), index)} onClick={() => setActiveId(image.id)}>
              <div className="thumb-image"><img src={image.url} alt={image.name}/><span className="sequence">{String(index + 1).padStart(2, '0')}</span>{image.status === 'done' && <span className="done"><Check /></span>}</div>
              <div className="thumb-meta"><GripVertical /><span>{image.name}</span><button onClick={(event) => { event.stopPropagation(); remove(image.id); }} aria-label={`Remove ${image.name}`}><X /></button></div>
              {image.status === 'processing' && <div className="progress"><i style={{ width: `${image.progress}%` }}/></div>}
              {image.duplicateOf && <div className="duplicate">Possible duplicate</div>}
            </article>)}
          </div>
        </section>

        <section className="control-panel">
          <div className="control-copy"><span className="step inverse">02</span><div><h2>Extraction setup</h2><p>Optimized for maximum recall</p></div></div>
          <label className="select-label">Mode<select value={options.mode} onChange={(e) => setOptions({ ...options, mode: e.target.value as ExtractionOptions['mode'] })}><option value="simple">Simple text</option><option value="exact">Exact structured</option><option value="optimized">AI-optimized</option></select><ChevronDown /></label>
          <label className="toggle"><input type="checkbox" checked={options.mergeOverlaps} onChange={(e) => setOptions({ ...options, mergeOverlaps: e.target.checked })}/><i/><span><strong>Merge overlaps</strong><small>Conservative duplicate removal</small></span></label>
          <label className={`toggle ${options.mode !== 'optimized' ? 'disabled' : ''}`}><input type="checkbox" checked={includeUi} disabled={options.mode !== 'optimized'} onChange={(e) => setOptions({ ...options, includeUi: e.target.checked })}/><i/><span><strong>Include UI text</strong><small>{options.mode !== 'optimized' ? 'Always on in this mode' : 'Navigation and browser chrome'}</small></span></label>
          <button className="primary" onClick={process} disabled={processing || !images.some((image) => image.status !== 'done')}><Play />{processing ? 'Processing…' : done.length ? 'Process remaining' : 'Extract text'}<span>⌘ ↵</span></button>
        </section>
      </>}

      {done.length > 0 && <section className="results-section">
        <div className="section-heading"><div><span className="step">03</span><div><h2>Review & export</h2><p>{characterCount.toLocaleString()} characters · {uncertain.length} item{uncertain.length === 1 ? '' : 's'} to review</p></div></div><div className="view-actions"><button className={showReview ? 'active' : ''} onClick={() => { const first = uncertain[0]; setShowReview(!showReview); if (!showReview && first) { setActiveId(first.image.id); setActiveRegion(first.region.id); } }}>Review uncertain <span>{uncertain.length}</span></button></div></div>
        <div className="search-row"><Search/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search across all screenshots…"/>{query && <button onClick={() => setQuery('')}><X/></button>}</div>
        {query && <div className="search-results">{results.length ? results.map(({ image, imageIndex, region }) => <button key={region.id} onClick={() => { setActiveId(image.id); setActiveRegion(region.id); }}><strong>Image {imageIndex + 1} · Line {region.lineIndex + 1}</strong><span>{region.text}</span></button>) : <p>No matching text found.</p>}</div>}
        <div className="review-grid">
          <div className="source-pane panel"><div className="pane-head"><span><FileImage/>Original · Image {images.indexOf(active) + 1}</span><small>{active?.width} × {active?.height}</small></div>{active && <div className="image-stage"><div className="image-wrap"><img src={active.url} alt="Original screenshot"/>{active.regions.map((region) => <button key={region.id} className={`region-box ${activeRegion === region.id ? 'selected' : ''} ${region.level}`} style={{ left: `${region.bbox.x / active.width * 100}%`, top: `${region.bbox.y / active.height * 100}%`, width: `${region.bbox.width / active.width * 100}%`, height: `${region.bbox.height / active.height * 100}%` }} onClick={() => setActiveRegion(region.id)} aria-label={`Select text: ${region.text}`}/>)}</div></div>}</div>
          <div className={`text-pane panel ${simpleMode && !showReview ? 'simple-output' : ''}`}><div className="pane-head"><span><Clipboard/>{showReview ? 'Uncertain text' : simpleMode ? 'Plain text' : 'Structured text'}</span><button onClick={() => active && copy(simpleMode ? renderPlainText(active.regions, includeUi) : renderMarkdown(active.regions, includeUi), 'Image copied')}><Copy/> Copy image</button></div><div className="region-list">{visibleRegions.length ? visibleRegions.map((region) => <RegionEditor key={region.id} region={region} simple={simpleMode && !showReview} selected={activeRegion === region.id} onSelect={() => setActiveRegion(region.id)} onChange={(text) => active && updateRegion(active.id, region.id, text)}/>) : <div className="empty-review"><Check/>No uncertain lines in this image.</div>}</div></div>
        </div>
      </section>}
    </main>

    {done.length > 0 && <footer className="action-dock"><div><span>{done.length}/{images.length} processed</span><i/><span>{characterCount.toLocaleString()} characters</span></div><div>{!simpleMode && <button className="secondary" onClick={() => copy(plainText(output), 'Plain text copied')}><Copy/> Copy plain</button>}<button className="secondary" onClick={() => downloadText(output, simpleMode ? 'txt' : 'md')}><ArrowDownToLine/> Download .{simpleMode ? 'txt' : 'md'}</button><button className="primary copy-all" onClick={() => copy(output, 'Copied all')}><Copy/> Copy all</button></div></footer>}
    <input ref={fileInput} hidden type="file" accept="image/*" multiple onChange={(e) => void addFiles([...(e.target.files ?? [])])}/>
    <input ref={folderInput} hidden type="file" accept="image/*" multiple {...({ webkitdirectory: '' } as object)} onChange={(e) => void addFiles([...(e.target.files ?? [])])}/>
    {cameraOpen && <CameraModal onClose={() => setCameraOpen(false)} onCapture={acceptCameraPhoto}/>} 
    {toast && <div className="toast"><Check/>{toast}</div>}
  </div>;
}

function UploadZone({ dragging, setDragging, onFiles, onBrowse, onFolder, onCamera }: { dragging: boolean; setDragging: (value: boolean) => void; onFiles: (files: File[]) => void; onBrowse: () => void; onFolder: () => void; onCamera: () => void }) {
  return <section className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void onFiles([...e.dataTransfer.files]); }}>
    <div className="upload-icon"><Upload/></div><h2>Drop screenshots here</h2><p>or paste directly from your clipboard</p><div className="upload-actions"><button className="primary" onClick={onCamera}><Camera/> Use camera</button><button className="secondary" onClick={onBrowse}><ImagePlus/> Choose images</button><button className="secondary" onClick={onFolder}><FolderOpen/> Choose folder</button></div><div className="formats"><span>PNG</span><span>JPG</span><span>WEBP</span><span>Up to 50+ images</span></div>
  </section>;
}

function CameraModal({ onClose, onCapture }: { onClose: () => void; onCapture: (file: File) => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }, []);

  const start = useCallback(async (mode: 'environment' | 'user') => {
    stop();
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError';
      setError(denied ? 'Camera permission was denied. Allow camera access in your browser settings and try again.' : reason instanceof Error ? reason.message : 'The camera could not be started.');
    }
  }, [stop]);

  useEffect(() => { void start(facing); return stop; }, []); // camera starts only after the user opened this dialog
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { stop(); onClose(); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, stop]);

  const switchFacing = async () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    await start(next);
  };

  const close = () => { stop(); onClose(); };
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) { setError('This browser could not capture the camera frame.'); setBusy(false); return; }
    if (facing === 'user') { context.translate(canvas.width, 0); context.scale(-1, 1); }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.96));
    if (!blob) { setError('The photo could not be encoded.'); setBusy(false); return; }
    stop();
    await onCapture(new File([blob], `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    onClose();
  };

  return <div className="camera-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title">
      <header><div><Camera/><span><strong id="camera-title">Take a photo</strong><small>Hold steady and fill the frame with text</small></span></div><button className="icon-button" onClick={close} aria-label="Close camera"><X/></button></header>
      <div className="camera-viewport">
        <video ref={videoRef} autoPlay muted playsInline className={facing === 'user' ? 'mirrored' : ''}/>
        {!ready && !error && <div className="camera-status"><span className="camera-spinner"/>Requesting camera permission…</div>}
        {error && <div className="camera-error"><Camera/><strong>Camera unavailable</strong><p>{error}</p><button className="secondary" onClick={() => void start(facing)}>Try again</button></div>}
        {ready && <div className="camera-guide"><i/><i/><i/><i/></div>}
      </div>
      <footer><button className="camera-switch" onClick={() => void switchFacing()} disabled={!ready || busy} aria-label="Switch front or rear camera"><SwitchCamera/></button><button className="shutter" onClick={() => void capture()} disabled={!ready || busy} aria-label="Take photo"><span><Aperture/></span></button><div className="camera-spacer"/></footer>
      <p className="camera-privacy"><LockKeyhole/> The captured frame stays on this device and starts OCR immediately.</p>
    </section>
  </div>;
}

function RegionEditor({ region, simple, selected, onSelect, onChange }: { region: TextRegion; simple: boolean; selected: boolean; onSelect: () => void; onChange: (text: string) => void }) {
  return <div id={region.id} className={`region-editor ${simple ? 'simple' : ''} ${selected ? 'selected' : ''}`} onClick={onSelect}>{!simple && <span className={`confidence-dot ${region.level}`} title={`${Math.round(region.confidence)}% confidence`}/>}<textarea rows={Math.max(1, Math.ceil(region.text.length / 72))} value={region.text} onChange={(e) => onChange(e.target.value)} aria-label={`Extracted line ${region.lineIndex + 1}`}/>{!simple && <small>{region.kind}</small>}</div>;
}

function ScanGlyph() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3M8 9h8M8 12h8M8 15h5"/></svg>; }
