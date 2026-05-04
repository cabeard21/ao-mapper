"""Parse Albion Online portal tooltip text into structured data.

Expected tooltip format (as seen in-game):
  Road of Avalon to
  <Zone Name>
  <current>/<max>    n/a
  Closes in Xh Ym
"""
from __future__ import annotations

import re


def parse_tooltip(lines: list[str]) -> dict | None:
    """Return parsed tooltip dict or None if the text doesn't look like a portal tooltip."""
    text = " ".join(lines)

    zone_name = _extract_zone_name(lines, text)
    if not zone_name:
        return None

    charges = _extract_max_charges(text)
    closes_in_minutes = _extract_minutes(text)
    if closes_in_minutes is None:
        return None

    return {
        "toZoneName": zone_name,
        "charges": charges,
        "closesInMinutes": closes_in_minutes,
    }


def _extract_zone_name(lines: list[str], text: str) -> str | None:
    # Primary: the zone name is its own line immediately after the "Road of Avalon to" header.
    # OCR often reads 'o' as '0', so match t[o0].
    for i, line in enumerate(lines):
        if re.search(r"avalon\s+t[o0]", line, re.IGNORECASE) and i + 1 < len(lines):
            candidate = lines[i + 1].strip()
            if re.match(r"[A-Z][A-Za-z0-9][A-Za-z0-9\- ]*$", candidate):
                return candidate

    # Fallback: regex on joined text — handles single-line OCR output
    match = re.search(r"\bt[o0]\s+([A-Z][A-Za-z0-9][A-Za-z0-9\- ]+?)(?=\s+\d|\s*$)", text)
    if match:
        return match.group(1).strip()

    return None


def _extract_max_charges(text: str) -> int:
    # Portal size is the max capacity: the number AFTER "/" (e.g. "7/7" → 7, "3/20" → 20)
    match = re.search(r"\d+\s*/\s*(\d+)", text)
    if match:
        return int(match.group(1))
    return 7  # default to 7-man if not found


def _extract_minutes(text: str) -> int | None:
    # "11 h 45 m", "11h45m", "0 h 30 m", "45 m" etc.
    hm_match = re.search(r"(\d+)\s*h\s*(\d+)\s*m", text, re.IGNORECASE)
    if hm_match:
        return int(hm_match.group(1)) * 60 + int(hm_match.group(2))

    h_only = re.search(r"(\d+)\s*h\b", text, re.IGNORECASE)
    if h_only:
        return int(h_only.group(1)) * 60

    m_only = re.search(r"(\d+)\s*m\b", text, re.IGNORECASE)
    if m_only:
        return int(m_only.group(1))

    return None
