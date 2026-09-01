# PicSpinner

PicSpinner turns batches of screenshots into structured, copy-ready text. Its default path runs OCR entirely in the browser: images are not uploaded, no account is required, and the built frontend can be hosted as a free static site.

The product favors fidelity over cleanup. Low-confidence lines remain visible and editable, every OCR line retains its source bounding box, and UI-noise classification is reversible.

## What is implemented

- Multi-image picker, drag and drop, clipboard paste, desktop folder input, and an in-app camera with live preview
- Rear/front camera switching, local high-quality capture, immediate batch insertion, and automatic OCR after capture
- Bounded concurrent local OCR using Tesseract.js workers with progressive per-image status
- Spatial `Image → Region` model with boxes, reading order, confidence, and structural classification
- Exact and AI-optimized modes, Markdown rendering, conservative overlap detection, and duplicate warnings
- Side-by-side source/text review with bidirectional region selection and inline correction
- Batch search, uncertain-text review data, image/batch copy, plain-text copy, and Markdown download
- Responsive mobile layout, keyboard shortcuts, and dark mode
- Optional in-memory FastAPI endpoint for hosts that prefer native Tesseract
- Unit tests for structure, uncertainty, overlap, hashing, and benchmark metrics

## Architecture

```text
Browser files / clipboard / camera
            │
            ▼
  immutable SourceImage records ──► thumbnail + ordering UI
            │
            ▼
 bounded Tesseract.js worker pool (local, no upload)
            │
            ▼
 spatial TextRegion[] (text, bbox, confidence, kind, order)
            │
     ┌──────┼─────────────┐
     ▼      ▼             ▼
 review   Markdown     plain text / JSON-ready model
```

The optional backend mirrors the structured output contract and processes request bytes in memory. It is not required for the static deployment.

## Local development

Prerequisites: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. The first extraction downloads OCR language data into the browser cache; later runs reuse it.

Camera access requires a secure browser context. It works on `localhost` during development and must be served over HTTPS in production. Permission is requested only after the user selects **Use camera**, and the media stream is stopped after capture or when the camera panel closes.

### Optional native OCR API

The API requires Python 3.11+ and the native `tesseract` executable (`brew install tesseract`, `apt install tesseract-ocr`, or your platform equivalent).

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

API example:

```bash
curl -F 'files=@screenshot.png' 'http://localhost:8000/api/extract?language=eng'
```

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run benchmark
```

For real accuracy benchmarking, keep image fixtures and matching ground-truth `.txt` files outside the public build. Report character error rate, word error rate, punctuation error rate, and critical-token recall separately. Include clean/dark screenshots, photos, tables, columns, forms, small text, punctuation, overlap, duplicates, and long batches. The included metric test guards the edit-distance calculation used for such a harness.

## Free deployment

### Netlify

Push the repository and import it in Netlify. `netlify.toml` supplies the build and publish settings. No environment variables are required.

### Cloudflare Pages or GitHub Pages

Use build command `npm run build` and output directory `dist`. Because OCR runs client-side, there is no server bill or screenshot storage layer.

If you deploy the optional backend, put it behind TLS, restrict CORS to the frontend origin, set request/body limits at the proxy, and keep request logging disabled. The reference API never writes image or OCR content to disk or logs it.

## Keyboard shortcuts

- `Cmd/Ctrl + V`: paste screenshot(s)
- `Cmd/Ctrl + Shift + C`: copy the full extraction
- `Cmd/Ctrl + Enter`: process unprocessed images
- `Esc`: close the current review selection

Native browser copy and find shortcuts remain intact.

## Important accuracy notes

Browser OCR is genuinely private and inexpensive, but no OCR engine is perfect. PicSpinner never labels low-confidence output as certain; proofread red/amber lines before relying on punctuation, digits, negations, or answer labels. The optional native service is intentionally a separate deployment choice. A future verifier can consume only low-confidence crops without changing the core document model.
