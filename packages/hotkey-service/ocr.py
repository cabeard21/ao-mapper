from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter, ImageOps

_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr  # lazy import — first call downloads model if needed
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


def run_ocr(image: Image.Image) -> list[str]:
    processed = _preprocess(image)
    reader = _get_reader()
    # easyocr requires a numpy array, not a PIL Image
    arr = np.array(processed)
    results: list[str] = reader.readtext(arr, detail=0, paragraph=False)
    return results


def _preprocess(image: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(image)
    # Scale up 2× so small tooltip text is clearer
    w, h = gray.size
    scaled = gray.resize((w * 2, h * 2), Image.LANCZOS)
    # Mild sharpening helps OCR on anti-aliased game text
    return scaled.filter(ImageFilter.SHARPEN)
