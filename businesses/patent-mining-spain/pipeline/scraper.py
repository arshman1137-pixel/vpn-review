#!/usr/bin/env python3
"""
USPTO Patent Scraper — Patent Mining Spain
Uses the free PatentsView API (no auth required).

Usage:
    python scraper.py                  # fetch all categories, save to data/raw/
    python scraper.py --category A47J  # fetch kitchen patents only
    python scraper.py --limit 200      # stop after 200 results
    python scraper.py --dry-run        # print first page, don't save

API docs: https://search.patentsview.org/api/v1
"""

import argparse
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests

from config import (
    CPC_CATEGORIES,
    DATA_DIR,
    MAX_PATENTS,
    PAGE_SIZE,
    PATENT_EXPIRY_AFTER_YEAR,
    PATENTSVIEW_BASE_URL,
    RAW_DIR,
)


def build_query(cpc_code: str) -> dict:
    """Build the PatentsView API query payload for one CPC category."""
    # Patents that granted after PATENT_EXPIRY_AFTER_YEAR - 20 years = still active
    # We target patents granted 2004-2020 (expired or expiring soon)
    grant_date_start = f"{PATENT_EXPIRY_AFTER_YEAR - 20}-01-01"
    grant_date_end = f"{datetime.now().year - 4}-12-31"  # at least 4 years old

    return {
        "q": {
            "_and": [
                {"_begins": {"cpc_subgroup_id": cpc_code}},
                {"_gte": {"patent_date": grant_date_start}},
                {"_lte": {"patent_date": grant_date_end}},
            ]
        },
        "f": [
            "patent_id",
            "patent_title",
            "patent_abstract",
            "patent_date",
            "patent_type",
            "cpc_subgroup_id",
            "assignee_organization",
            "assignee_total_num_patents",
            "inventor_last_name",
            "inventor_first_name",
            "inventor_country",
        ],
        "o": {"page": 1, "per_page": PAGE_SIZE},
        "s": [{"patent_date": "desc"}],
    }


def fetch_page(session: requests.Session, query: dict, page: int) -> dict | None:
    """Fetch a single page from PatentsView. Returns None on error."""
    query = dict(query)
    query["o"] = {"page": page, "per_page": PAGE_SIZE}

    url = f"{PATENTSVIEW_BASE_URL}/patents/query"
    try:
        resp = session.post(url, json=query, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        print(f"  HTTP error on page {page}: {e}")
        return None
    except requests.RequestException as e:
        print(f"  Request error on page {page}: {e}")
        return None


def is_small_company(patent: dict, max_employees: int = 50) -> bool:
    """Heuristic: small companies have fewer total patents filed."""
    total = patent.get("assignee_total_num_patents")
    if total is None:
        return True  # unknown → keep (solo inventors, small shops)
    return int(total) <= max_employees * 10  # rough proxy


def scrape_category(
    session: requests.Session,
    cpc_code: str,
    max_patents: int | None,
    dry_run: bool,
) -> list[dict]:
    """Scrape all pages for one CPC code and return cleaned patent list."""
    print(f"\n[scraper] Category: {cpc_code}")
    query = build_query(cpc_code)
    results: list[dict] = []
    page = 1

    while True:
        print(f"  Page {page}...", end=" ", flush=True)
        data = fetch_page(session, query, page)

        if not data:
            print("error — stopping")
            break

        patents = data.get("patents") or []
        total_found = data.get("total_patent_count", 0)
        print(f"{len(patents)} patents (total: {total_found})")

        if dry_run:
            print(json.dumps(patents[:2], indent=2, ensure_ascii=False))
            break

        for p in patents:
            if is_small_company(p):
                results.append(p)

        if max_patents and len(results) >= max_patents:
            results = results[:max_patents]
            print(f"  Reached limit of {max_patents}")
            break

        fetched_so_far = page * PAGE_SIZE
        if fetched_so_far >= total_found or not patents:
            break

        page += 1
        time.sleep(0.5)  # be polite to the API

    print(f"  → Kept {len(results)} small-company patents")
    return results


def save_results(all_patents: list[dict], output_dir: str) -> str:
    """Save patent list to timestamped JSON file."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(output_dir, f"patents_{timestamp}.json")

    payload = {
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "total": len(all_patents),
        "categories_scraped": list({p.get("cpc_subgroup_id", "")[:4] for p in all_patents}),
        "patents": all_patents,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return out_path


def main():
    parser = argparse.ArgumentParser(description="Scrape USPTO patents via PatentsView")
    parser.add_argument("--category", help="Single CPC code (e.g. A47J). Default: all.")
    parser.add_argument("--limit", type=int, default=MAX_PATENTS, help="Max patents to collect")
    parser.add_argument("--dry-run", action="store_true", help="Print first 2 results, don't save")
    args = parser.parse_args()

    categories = [args.category] if args.category else CPC_CATEGORIES

    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "User-Agent": "PatentMiningSpain/1.0 (suzan.attallah@roboco-op.org)",
    })

    all_patents: list[dict] = []
    per_category_limit = (args.limit // len(categories)) if args.limit else None

    for cpc in categories:
        patents = scrape_category(session, cpc, per_category_limit, args.dry_run)
        all_patents.extend(patents)

    if args.dry_run:
        print(f"\n[dry-run] Would have collected {len(all_patents)} patents total")
        return

    if not all_patents:
        print("\n[scraper] No patents found — check filters in config.py")
        return

    out_path = save_results(all_patents, RAW_DIR)
    print(f"\n[scraper] ✓ Saved {len(all_patents)} patents → {out_path}")
    print("[scraper] Next step: run `python scorer.py` to score this batch")


if __name__ == "__main__":
    main()
