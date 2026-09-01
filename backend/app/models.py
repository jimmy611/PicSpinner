from typing import Literal
from pydantic import BaseModel, Field


class Box(BaseModel):
    x: int
    y: int
    width: int
    height: int


class Region(BaseModel):
    id: str
    text: str
    bbox: Box
    confidence: float = Field(ge=0, le=100)
    level: Literal["high", "medium", "low"]
    kind: Literal["heading", "paragraph", "list-item", "label", "ui", "uncertain"]
    line_index: int


class ImageExtraction(BaseModel):
    image_index: int
    text: str
    markdown: str
    confidence: float
    regions: list[Region]


class ExtractionResponse(BaseModel):
    batch_id: str
    images: list[ImageExtraction]
    combined_markdown: str
    warnings: list[str]
