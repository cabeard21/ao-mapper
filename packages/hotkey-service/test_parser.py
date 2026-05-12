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


class TestExtractZoneNameOcrArtifacts:
    def test_skips_single_char_stray_line(self):
        # OCR sometimes inserts a spurious single char between header and zone name
        result = parse_tooltip(["Road of Avalon to", "e", "Oetos-Oyexlos", "05.27", "XCloses in 9 h 37 m"])
        assert result is not None
        assert result["toZoneName"] == "Oetos-Oyexlos"

    def test_charges_line_before_zone_name(self):
        # OCR sometimes returns charge reading before zone name (lines swapped)
        result = parse_tooltip(["Road of Avalon t0", "7.54", "Hiros-Juderom", "nla", "Closes in 2 h 17 m"])
        assert result is not None
        assert result["toZoneName"] == "Hiros-Juderom"
        assert result["charges"] == 7
        assert result["closesInMinutes"] == 2 * 60 + 17

    def test_recovers_destination_with_garbled_close_timer(self):
        result = parse_tooltip(["Road of Avalon to", "Hilltes-Ugumtum", "09:13", "2", "Closegin ", "m 52 $"])
        assert result is not None
        assert result["toZoneName"] == "Hilltes-Ugumtum"
        assert result["charges"] == 7
        assert result["closesInMinutes"] == 52


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

    def test_slash_misread_as_dot_seven_man(self):
        # OCR reads "5/7" as "05.27" — extra digit prepended, slash→dot; last digit 7 → 7-man
        result = parse_tooltip(["Road of Avalon to", "e", "Oetos-Oyexlos", "05.27", "XCloses in 9 h 37 m"])
        assert result is not None
        assert result["charges"] == 7

    def test_slash_misread_as_dot_seven_man_variant(self):
        # OCR reads "4/7" as "04.37"
        result = parse_tooltip(["Road of Avalon to", "6", "Oetos-Oyexlos", "04.37", "Closesin 9 h 26 m"])
        assert result is not None
        assert result["charges"] == 7

    def test_twenty_man_exact(self):
        result = parse_tooltip(["Road of Avalon to SomeZone", "17/20", "Closes in 2 h 0 m"])
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
