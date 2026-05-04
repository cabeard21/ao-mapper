"""Unit tests for the tooltip parser."""
import pytest
from parser import parse_tooltip


class TestExtractZoneName:
    def test_road_of_avalon_header(self):
        result = parse_tooltip(["Road of Avalon to", "Seritos-Onaytum", "7/7", "n/a", "Closes in 11 h 45 m"])
        assert result is not None
        assert result["toZoneName"] == "Seritos-Onaytum"

    def test_ocr_zero_for_o(self):
        # OCR commonly reads 'o' as '0' in "to"
        result = parse_tooltip(["Road of Avalon t0", "Seritos-Onaytum", "7/7", "n/a", "XCloses in 11 h 05 m"])
        assert result is not None
        assert result["toZoneName"] == "Seritos-Onaytum"

    def test_zone_name_with_space(self):
        result = parse_tooltip(["Road of Avalon tO", "Willowshade Pools", "7/7", "n/a", "XCloses in 2 h 18 m"])
        assert result is not None
        assert result["toZoneName"] == "Willowshade Pools"

    def test_multiword_joined(self):
        # OCR may join some words into one line (fallback regex path)
        result = parse_tooltip(["Road of Avalon to Seritos-Onaytum 7/7 n/a Closes in 11 h 45 m"])
        assert result is not None
        assert result["toZoneName"] == "Seritos-Onaytum"


class TestExtractMaxCharges:
    def test_seven_man(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "7/7", "Closes in 2 h 0 m"])
        assert result is not None
        assert result["charges"] == 7

    def test_twenty_man(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "20/20", "Closes in 2 h 0 m"])
        assert result is not None
        assert result["charges"] == 20

    def test_partially_used_portal(self):
        # 3 charges remaining out of max 20
        result = parse_tooltip(["Road of Avalon to SomeZone", "3/20", "Closes in 2 h 0 m"])
        assert result is not None
        assert result["charges"] == 20


class TestExtractMinutes:
    def test_hours_and_minutes(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "7/7", "Closes in 11 h 45 m"])
        assert result is not None
        assert result["closesInMinutes"] == 11 * 60 + 45

    def test_hours_only(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "7/7", "Closes in 22 h"])
        assert result is not None
        assert result["closesInMinutes"] == 22 * 60

    def test_minutes_only(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "7/7", "Closes in 45 m"])
        assert result is not None
        assert result["closesInMinutes"] == 45

    def test_zero_hours_with_minutes(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "7/7", "Closes in 0 h 30 m"])
        assert result is not None
        assert result["closesInMinutes"] == 30


class TestInvalidInput:
    def test_empty_lines(self):
        assert parse_tooltip([]) is None

    def test_no_zone_name(self):
        assert parse_tooltip(["7/7", "Closes in 11 h 45 m"]) is None

    def test_no_time(self):
        assert parse_tooltip(["Road of Avalon to SomeZone", "7/7"]) is None

    def test_unrelated_text(self):
        assert parse_tooltip(["Hello world", "foo bar"]) is None
