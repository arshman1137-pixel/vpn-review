#!/usr/bin/env python3
"""
USPTO Bulk Data Downloader — Patent Mining Spain
Downloads USPTO patent grant full-text data files directly from the bulk portal.
Use this instead of scraper.py when the PatentsView API is rate-limited or when
processing large batches across multiple years.

Bulk data lives at: https://bulkdata.uspto.gov/data/patent/grant/redbook/fulltext/
Format: JSON files (ipg<YYMMDD>.json) released weekly; XML also available.
Each weekly file contains all grants for that week.

Usage:
    python downloader.py --year 2018         # download and filter all 2018 weekly files
    python downloader.py --year 2018 --dry-run   # show first 5 matching patents, no save
    python downloader.py --year 2015 --format xml  # use XML fallback if JSON unavailable

Output: data/raw/bulk_<year>_<YYMMDD>.json  (same schema as scraper.py output)
"""

import argparse
import gzip
import io
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Iterator

import requests
from tqdm import tqdm

from config import (
    CPC_SUBGROUPS,
    DATA_DIR,
    MAX_PATENTS,
    RAW_DIR,
)

# ── Constants ─────────────────────────────────────────────────────────────────

BULK_BASE_URL = "https://bulkdata.uspto.gov/data/patent/grant/redbook/fulltext"

# Target years — patents granted 2004-2020 are expired or expiring
DEFAULT_YEAR_START = 2004
DEFAULT_YEAR_END = 2020

# Max assignee patent count to qualify as "small" — rough proxy for company size
MAX_ASSIGNEE_PATENTS = 500  # uspto bulk data doesn't include total counts; filter by org name length heuristic

# Streaming chunk size for download
CHUNK_SIZE = 1024 * 64  # 64 KB

# USPTO individual grant JSON structure keys (post-2012 JSON format)
# Older years are XML-only; we handle both.
JSON_YEARS_START = 2013  # JSON format available from ~2013


# ── Helpers ───────────────────────────────────────────────────────────────────


def _cpc_matches(cpc_code: str) -> bool:
    """Return True if cpc_code starts with any of our target subgroup prefixes."""
    if not cpc_code:
        return False
    for prefix in CPC_SUBGROUPS:
        if cpc_code.startswith(prefix):
            return True
    return False


def _index_weekly_files(year: int, fmt: str, session: requests.Session) -> list[dict]:
    """
    Scrape the USPTO bulk index page for the given year and return a list of
    {filename, url, size_bytes} for weekly grant files in the requested format.
    """
    year_url = f"{BULK_BASE_URL}/{year}/"
    print(f"[downloader] Fetching index: {year_url}")

    try:
        resp = session.get(year_url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[downloader] ERROR: could not reach bulk index — {e}")
        return []

    html = resp.text

    # Look for weekly grant files — pattern like ipg180102.zip (XML) or ipg180102_json.zip
    if fmt == "json":
        pattern = r'href="(ipg\d{6}(?:_json)?\.zip)"'
        # Some years the JSON file is named differently
        pattern_alt = r'href="(ipg\d{6}\.json(?:\.zip)?)"'
    else:
        pattern = r'href="(ipg\d{6}\.zip)"'
        pattern_alt = r'href="(ipg\d{6}\.xml(?:\.zip)?)"'

    filenames = re.findall(pattern, html, re.IGNORECASE)
    if not filenames:
        filenames = re.findall(pattern_alt, html, re.IGNORECASE)

    if not filenames:
        # Fallback: grab any .zip that looks like a weekly grant file
        filenames = re.findall(r'href="(ipg\d{6}[^"]*\.zip)"', html, re.IGNORECASE)

    results = []
    for fname in sorted(set(filenames)):
        results.append({
            "filename": fname,
            "url": f"{year_url}{fname}",
        })

    print(f"[downloader]   Found {len(results)} weekly files for {year}")
    return results


def _stream_download(url: str, session: requests.Session) -> bytes | None:
    """
    Download a file from url with a tqdm progress bar.
    Returns the raw bytes, or None on error.
    """
    try:
        resp = session.get(url, stream=True, timeout=120)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"\n[downloader] Download error: {e}")
        return None

    total = int(resp.headers.get("content-length", 0))
    buf = io.BytesIO()
    desc = url.split("/")[-1]

    with tqdm(total=total, unit="B", unit_scale=True, unit_divisor=1024, desc=desc, leave=False) as pbar:
        for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
            if chunk:
                buf.write(chunk)
                pbar.update(len(chunk))

    return buf.getvalue()


# ── XML parsing ───────────────────────────────────────────────────────────────


def _text(el: ET.Element | None, default: str = "") -> str:
    if el is None:
        return default
    return (el.text or "").strip()


def _parse_xml_file(raw_bytes: bytes) -> Iterator[dict]:
    """
    Parse a USPTO grant XML file (pre-2013 or fallback).
    The USPTO XML is a sequence of individual grant documents concatenated
    together — NOT a single well-formed XML document. We split on the XML
    declaration boundary.
    """
    # Decompress if needed
    try:
        import zipfile
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
            # Pick the first XML-looking member
            xml_name = next((n for n in zf.namelist() if n.endswith(".xml")), None)
            if xml_name:
                content = zf.read(xml_name)
            else:
                content = raw_bytes
    except Exception:
        content = raw_bytes

    # Split concatenated XML documents
    text = content.decode("utf-8", errors="replace")
    chunks = re.split(r'(?=<\?xml\s)', text)

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk or "<patent-grant" not in chunk and "<us-patent-grant" not in chunk:
            continue
        try:
            root = ET.fromstring(chunk)
        except ET.ParseError:
            continue

        # Extract fields from USPTO grant XML schema (v4.5 / SGML-style)
        ns = {"us": "http://www.loc.gov/patents/"}

        def find(path: str) -> ET.Element | None:
            el = root.find(path)
            if el is None:
                # Try with namespace
                el = root.find(path.replace("/", "/us:").replace("./", "./us:"))
            return el

        patent_id = _text(find(".//doc-number") or find(".//application-reference/doc-number"))
        title = _text(find(".//invention-title"))
        abstract_el = find(".//abstract")
        abstract = " ".join(t.strip() for t in (abstract_el.itertext() if abstract_el is not None else []))
        grant_date = _text(find(".//publication-reference/date") or find(".//grant-date"))

        # CPC classifications
        cpc_codes: list[str] = []
        for cls_el in root.findall(".//classification-cpc"):
            section = _text(cls_el.find("section"))
            cls_num = _text(cls_el.find("class"))
            subclass = _text(cls_el.find("subclass"))
            main_group = _text(cls_el.find("main-group"))
            if section:
                cpc_codes.append(f"{section}{cls_num}{subclass}{main_group}".strip())

        # Assignee
        assignee_el = find(".//assignee")
        assignee_org = _text(assignee_el.find("addressbook/orgname") if assignee_el is not None else None)

        # Inventors
        inventors = root.findall(".//inventors/inventor/addressbook") or root.findall(".//inventor")
        inv_last = ""
        inv_first = ""
        inv_country = ""
        if inventors:
            inv = inventors[0]
            inv_last = _text(inv.find("last-name") or inv.find("family-name"))
            inv_first = _text(inv.find("first-name") or inv.find("given-name"))
            inv_country = _text(inv.find("residence/country") or inv.find("country"))

        if not patent_id or not title:
            continue

        yield {
            "patent_id": patent_id,
            "patent_title": title,
            "patent_abstract": abstract[:1500],
            "patent_date": grant_date,
            "patent_type": "utility",
            "cpc_subgroup_id": cpc_codes[0] if cpc_codes else "",
            "cpc_codes_all": cpc_codes,
            "assignee_organization": assignee_org,
            "assignee_total_num_patents": None,
            "inventor_last_name": inv_last,
            "inventor_first_name": inv_first,
            "inventor_country": inv_country,
            "source": "bulk_xml",
        }


# ── JSON parsing ──────────────────────────────────────────────────────────────


def _parse_json_file(raw_bytes: bytes) -> Iterator[dict]:
    """
    Parse a USPTO grant JSON bulk file (2013+).
    The file is a zip containing a .json with a top-level array of grant objects.
    """
    import zipfile

    # Unzip
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
            json_name = next(
                (n for n in zf.namelist() if n.endswith(".json")), None
            )
            if json_name is None:
                # Fallback: try XML member
                xml_name = next((n for n in zf.namelist() if n.endswith(".xml")), None)
                if xml_name:
                    yield from _parse_xml_file(zf.read(xml_name))
                return
            content = zf.read(json_name)
    except Exception:
        # Raw bytes might already be JSON
        content = raw_bytes

    try:
        data = json.loads(content.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return

    # USPTO JSON schema: top-level key may be "patents" or the array is root
    if isinstance(data, list):
        patents = data
    elif isinstance(data, dict):
        patents = data.get("patents") or data.get("PatentData") or []
    else:
        return

    for p in patents:
        if not isinstance(p, dict):
            continue

        # Extract CPC codes — may be nested
        cpc_codes: list[str] = []
        for cpc_entry in p.get("cpc", []) or []:
            code = (
                cpc_entry.get("cpc_subgroup_id")
                or cpc_entry.get("subgroup_id")
                or cpc_entry.get("code")
                or ""
            )
            if code:
                cpc_codes.append(code)

        assignees = p.get("assignees") or p.get("assignee") or []
        assignee_org = ""
        if isinstance(assignees, list) and assignees:
            assignee_org = assignees[0].get("assignee_organization") or assignees[0].get("organization") or ""
        elif isinstance(assignees, dict):
            assignee_org = assignees.get("assignee_organization") or assignees.get("organization") or ""

        inventors = p.get("inventors") or []
        inv_last = inv_first = inv_country = ""
        if inventors:
            inv = inventors[0]
            inv_last = inv.get("inventor_last_name") or inv.get("last_name") or ""
            inv_first = inv.get("inventor_first_name") or inv.get("first_name") or ""
            inv_country = inv.get("inventor_country") or inv.get("country") or ""

        yield {
            "patent_id": p.get("patent_id") or p.get("id") or "",
            "patent_title": p.get("patent_title") or p.get("title") or "",
            "patent_abstract": (p.get("patent_abstract") or p.get("abstract") or "")[:1500],
            "patent_date": p.get("patent_date") or p.get("grant_date") or "",
            "patent_type": p.get("patent_type") or "utility",
            "cpc_subgroup_id": cpc_codes[0] if cpc_codes else "",
            "cpc_codes_all": cpc_codes,
            "assignee_organization": assignee_org,
            "assignee_total_num_patents": None,
            "inventor_last_name": inv_last,
            "inventor_first_name": inv_first,
            "inventor_country": inv_country,
            "source": "bulk_json",
        }


# ── Filtering ─────────────────────────────────────────────────────────────────


def _is_target_patent(patent: dict) -> bool:
    """
    Return True if this patent matches our target criteria:
    1. CPC code belongs to one of our target subgroups
    2. Assignee is a small entity (heuristic: no Big Corp markers in name)
    3. Has a title and abstract
    """
    # Must have title
    if not patent.get("patent_title"):
        return False

    # CPC filter — check primary code and all codes
    cpc_primary = patent.get("cpc_subgroup_id", "")
    cpc_all = patent.get("cpc_codes_all") or [cpc_primary]
    if not any(_cpc_matches(c) for c in cpc_all):
        return False

    # Small assignee heuristic — large companies typically contain these markers
    org = (patent.get("assignee_organization") or "").upper()
    big_corp_markers = [
        "INC.", " INC ", "CORP.", " CORP ", "CORPORATION", "COMPANY",
        "LLC", "LLP", "INDUSTRIES", "GROUP", "HOLDINGS",
        "INTERNATIONAL", "GLOBAL", "SYSTEMS", "TECHNOLOGIES",
        "PROCTER", "GAMBLE", "3M", "PHILIPS", "SAMSUNG", "LG ",
        "PANASONIC", "HENKEL", "RECKITT",
    ]
    # If org is empty → solo inventor → keep
    if org:
        match_count = sum(1 for m in big_corp_markers if m in org)
        if match_count >= 2:
            return False

    return True


# ── Core download + filter loop ───────────────────────────────────────────────


def process_year(
    year: int,
    fmt: str,
    session: requests.Session,
    dry_run: bool,
    max_patents: int | None,
) -> list[dict]:
    """
    Download all weekly files for a given year, filter, and return matching patents.
    """
    weekly_files = _index_weekly_files(year, fmt, session)
    if not weekly_files:
        print(f"[downloader] No files found for {year}. The USPTO may not have {fmt.upper()} for this year.")
        return []

    collected: list[dict] = []
    dry_run_shown = 0

    for file_info in tqdm(weekly_files, desc=f"Year {year}", unit="file"):
        if max_patents and len(collected) >= max_patents:
            break

        url = file_info["url"]
        raw_bytes = _stream_download(url, session)
        if raw_bytes is None:
            continue

        # Choose parser based on format and availability
        use_json = fmt == "json" and year >= JSON_YEARS_START
        parser = _parse_json_file if use_json else _parse_xml_file

        file_match_count = 0
        for patent in parser(raw_bytes):
            if not _is_target_patent(patent):
                continue

            if dry_run:
                if dry_run_shown < 5:
                    print(json.dumps(patent, indent=2, ensure_ascii=False))
                    dry_run_shown += 1
                if dry_run_shown >= 5:
                    return collected  # stop early in dry-run
                continue

            collected.append(patent)
            file_match_count += 1

            if max_patents and len(collected) >= max_patents:
                break

        if not dry_run:
            tqdm.write(f"  {file_info['filename']}: {file_match_count} matching patents")

    return collected


# ── Output ────────────────────────────────────────────────────────────────────


def save_bulk_results(patents: list[dict], year: int) -> str:
    """Save filtered bulk patents to data/raw/ in the same schema as scraper.py."""
    Path(RAW_DIR).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(RAW_DIR, f"bulk_{year}_{timestamp}.json")

    payload = {
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "source": "bulk_download",
        "year": year,
        "total": len(patents),
        "categories_scraped": list({p.get("cpc_subgroup_id", "")[:4] for p in patents}),
        "patents": patents,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return out_path


# ── CLI ───────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Download USPTO bulk patent data and filter for target categories."
    )
    parser.add_argument(
        "--year",
        type=int,
        required=True,
        help=f"Year to download (e.g. 2018). Target range: {DEFAULT_YEAR_START}-{DEFAULT_YEAR_END}",
    )
    parser.add_argument(
        "--format",
        choices=["json", "xml"],
        default="json",
        dest="fmt",
        help="Preferred file format. JSON is faster to parse; XML used as fallback (default: json).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download first weekly file only, print first 5 matching patents, do not save.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=MAX_PATENTS,
        help=f"Max patents to collect across all weekly files (default: {MAX_PATENTS})",
    )
    args = parser.parse_args()

    if args.year < DEFAULT_YEAR_START or args.year > DEFAULT_YEAR_END:
        print(
            f"[downloader] WARNING: year {args.year} is outside the recommended range "
            f"({DEFAULT_YEAR_START}-{DEFAULT_YEAR_END}). Patents outside this range may "
            "still be under active protection."
        )

    session = requests.Session()
    session.headers.update({
        "User-Agent": "PatentMiningSpain/1.0 (suzan.attallah@roboco-op.org)",
        "Accept-Encoding": "gzip, deflate",
    })

    print(f"[downloader] Target year: {args.year} | Format: {args.fmt.upper()} | Limit: {args.limit}")
    print(f"[downloader] CPC target subgroups: {', '.join(list(CPC_SUBGROUPS.keys())[:6])}...")

    patents = process_year(
        year=args.year,
        fmt=args.fmt,
        session=session,
        dry_run=args.dry_run,
        max_patents=args.limit,
    )

    if args.dry_run:
        print(f"\n[dry-run] Would have collected {len(patents)} patents (shown first 5 above)")
        return

    if not patents:
        print("\n[downloader] No matching patents found.")
        print("  Try: --format xml  (if JSON not available for this year)")
        print("  Or check that the year has data at the USPTO bulk portal.")
        return

    out_path = save_bulk_results(patents, args.year)
    print(f"\n[downloader] Saved {len(patents)} patents → {out_path}")
    print("[downloader] Next step: run `python scorer.py` to score this batch")


if __name__ == "__main__":
    main()
