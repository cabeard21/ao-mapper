"""Albion Online portal tooltip hotkey service.

Press the configured hotkey (default: F9) while hovering over a portal tooltip
to automatically capture it via OCR and send the parsed data to ao-mapper.

Usage:
  python main.py            normal mode
  python main.py --debug    save each capture as debug_capture.png for offset tuning
"""
from __future__ import annotations

import sys
import threading
import time

from pynput import keyboard

import capture
import client
import config
import ocr
import parser

DEBUG = "--debug" in sys.argv


def _handle_hotkey(cfg: dict) -> None:
    cap_cfg = cfg["capture"]
    backend_url: str = cfg["backend"]["url"]

    print("[ocr] Hotkey pressed — capturing tooltip…")

    try:
        image = capture.capture_tooltip(
            offset_x=cap_cfg["offset_x"],
            offset_y=cap_cfg["offset_y"],
            width=cap_cfg["width"],
            height=cap_cfg["height"],
            debug=DEBUG,
        )
    except Exception as exc:
        print(f"[ocr] Screen capture failed: {exc}")
        return

    if DEBUG:
        debug_path = "debug_capture.png"
        image.save(debug_path)
        print(f"[ocr] Debug: saved capture to {debug_path} — check it to tune offsets in config.toml")

    lines = ocr.run_ocr(image)
    print(f"[ocr] Raw OCR lines: {lines}")

    result = parser.parse_tooltip(lines)
    if result is None:
        print("[ocr] Could not parse a portal tooltip from the capture. Try hovering closer.")
        return

    print(
        f"[ocr] Parsed → zone: {result['toZoneName']}  "
        f"charges: {result['charges']}  "
        f"closes in: {result['closesInMinutes']} min"
    )

    ok = client.post_ocr_result(backend_url, result)
    if ok:
        print("[ocr] Sent to ao-mapper — confirm in the browser.")


def main() -> None:
    cfg = config.load()
    hotkey_str: str = cfg["hotkey"]["key"]

    print(f"[ocr] Hotkey service started. Press {hotkey_str.upper()} over a portal tooltip.")
    print(f"[ocr] Backend: {cfg['backend']['url']}")
    if DEBUG:
        print("[ocr] DEBUG MODE — captures will be saved as debug_capture.png")
    print("[ocr] Press Ctrl+C to quit.\n")

    def on_press(key: keyboard.Key | keyboard.KeyCode | None) -> None:
        try:
            key_name = key.char if hasattr(key, "char") else key.name  # type: ignore[union-attr]
        except AttributeError:
            return
        if key_name and key_name.lower() == hotkey_str.lower():
            thread = threading.Thread(target=_handle_hotkey, args=(cfg,), daemon=True)
            thread.start()

    listener = keyboard.Listener(on_press=on_press)
    listener.start()
    try:
        while listener.running:
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    finally:
        listener.stop()
        print("\n[ocr] Shutting down.")


if __name__ == "__main__":
    main()
