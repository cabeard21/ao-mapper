from __future__ import annotations

import httpx


def post_ocr_result(backend_url: str, payload: dict) -> bool:
    """POST parsed OCR data to the backend. Returns True on success."""
    url = f"{backend_url.rstrip('/')}/api/connections/ocr"
    try:
        with httpx.Client(timeout=5.0) as http:
            response = http.post(url, json=payload)
        if response.status_code == 200:
            return True
        print(f"[ocr] Backend returned {response.status_code}: {response.text}")
        return False
    except httpx.ConnectError:
        print(f"[ocr] Cannot reach backend at {url} — is the API running?")
        return False
    except Exception as exc:
        print(f"[ocr] Unexpected error: {exc}")
        return False
