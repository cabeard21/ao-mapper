from __future__ import annotations

import ctypes
import ctypes.wintypes

import mss
from PIL import Image


class _POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def _get_cursor_pos() -> tuple[int, int]:
    pt = _POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y


def capture_tooltip(
    offset_x: int,
    offset_y: int,
    width: int,
    height: int,
    debug: bool = False,
) -> Image.Image:
    cursor_x, cursor_y = _get_cursor_pos()
    left = cursor_x + offset_x
    top = cursor_y + offset_y

    if debug:
        print(f"[ocr] Cursor: ({cursor_x}, {cursor_y})  "
              f"Capture region: left={left} top={top} w={width} h={height}")

    with mss.mss() as sct:
        monitor = {"left": left, "top": top, "width": width, "height": height}
        raw = sct.grab(monitor)

    return Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
