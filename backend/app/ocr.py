from __future__ import annotations

import re
from collections import defaultdict
from io import BytesIO
from uuid import uuid4

from PIL import Image, ImageOps

from .models import Box, ImageExtraction, Region


UI_NOISE = re.compile(r"^(home|menu|search|settings|sign out|log in|back|next|submit|cancel)$", re.I)
BULLET = re.compile(r"^(?:[•●▪◦*]|[-–—]|\d+[.)]|[A-Za-z][.)])\s+")


def _level(confidence: float) -> str:
    return "high" if confidence >= 88 else "medium" if confidence >= 70 else "low"


def _kind(text: str, height: int, median_height: float) -> str:
    value = text.strip()
    if UI_NOISE.match(value):
        return "ui"
    if BULLET.match(value):
        return "list-item"
    if value.endswith(("*", ":")):
        return "label"
    if len(value) <= 80 and (height > median_height * 1.22 or re.match(r"^[A-Z][^.!?]{2,50}$", value)):
        return "heading"
    return "paragraph"


def _markdown(regions: list[Region], include_ui: bool) -> str:
    rendered: list[str] = []
    for region in regions:
        if region.kind == "ui" and not include_ui:
            continue
        value = f'[unclear: possible “{region.text}”]' if region.level == "low" else region.text
        if region.kind == "heading":
            value = f"### {value}"
        elif region.kind == "label":
            value = f"**{value}**"
        elif region.kind == "list-item":
            value = BULLET.sub("* ", value)
        rendered.append(value)
    return "\n\n".join(rendered)


def extract_image(content: bytes, image_index: int, language: str, include_ui: bool) -> ImageExtraction:
    try:
        import pytesseract
        from pytesseract import Output
    except ImportError as exc:
        raise RuntimeError("Native OCR dependencies are not installed; use the browser OCR path or install backend/requirements.txt") from exc

    image = ImageOps.exif_transpose(Image.open(BytesIO(content))).convert("RGB")
    data = pytesseract.image_to_data(image, lang=language, output_type=Output.DICT, config="--oem 3 --psm 3")
    grouped: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for index, raw in enumerate(data["text"]):
        if raw.strip():
            grouped[(data["block_num"][index], data["par_num"][index], data["line_num"][index])].append(index)

    lines: list[tuple[str, float, Box]] = []
    for indices in grouped.values():
        text = " ".join(data["text"][index] for index in indices).strip()
        confidences = [float(data["conf"][index]) for index in indices if float(data["conf"][index]) >= 0]
        left = min(data["left"][index] for index in indices)
        top = min(data["top"][index] for index in indices)
        right = max(data["left"][index] + data["width"][index] for index in indices)
        bottom = max(data["top"][index] + data["height"][index] for index in indices)
        lines.append((text, sum(confidences) / max(1, len(confidences)), Box(x=left, y=top, width=right-left, height=bottom-top)))
    lines.sort(key=lambda item: (item[2].y, item[2].x))
    heights = sorted(line[2].height for line in lines)
    median_height = heights[len(heights) // 2] if heights else 16
    regions = [Region(id=str(uuid4()), text=text, bbox=box, confidence=max(0, confidence), level=_level(confidence), kind=_kind(text, box.height, median_height), line_index=index) for index, (text, confidence, box) in enumerate(lines)]
    markdown = _markdown(regions, include_ui)
    return ImageExtraction(image_index=image_index, text="\n".join(region.text for region in regions), markdown=markdown,
                           confidence=sum(region.confidence for region in regions) / max(1, len(regions)), regions=regions)
