from concurrent.futures import ThreadPoolExecutor
from functools import partial
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import ExtractionResponse
from .ocr import extract_image

app = FastAPI(title="PicSpinner OCR", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "privacy": "request data is processed in memory"}


@app.post("/api/extract", response_model=ExtractionResponse)
async def extract(files: list[UploadFile] = File(...), language: str = "eng", include_ui: bool = False) -> ExtractionResponse:
    if not files or len(files) > 64:
        raise HTTPException(400, "Send between 1 and 64 images.")
    payloads: list[bytes] = []
    for upload in files:
        if not (upload.content_type or "").startswith("image/"):
            raise HTTPException(415, f"{upload.filename} is not an image.")
        content = await upload.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(413, f"{upload.filename} exceeds 25 MB.")
        payloads.append(content)
    try:
        with ThreadPoolExecutor(max_workers=min(4, len(payloads))) as executor:
            work = partial(extract_image, language=language, include_ui=include_ui)
            images = list(executor.map(lambda pair: work(content=pair[1], image_index=pair[0] + 1), enumerate(payloads)))
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc
    combined = "# Screenshot Batch\n\n" + "\n\n---\n\n".join(f"## Image {item.image_index}\n\n{item.markdown}" for item in images)
    warnings = [f"Image {item.image_index}: low confidence; review recommended" for item in images if item.confidence < 70]
    return ExtractionResponse(batch_id=str(uuid4()), images=images, combined_markdown=combined, warnings=warnings)
