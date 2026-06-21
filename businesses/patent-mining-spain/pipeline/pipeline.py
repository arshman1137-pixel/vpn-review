#!/usr/bin/env python3
"""
Patent Mining Spain — Master Pipeline Orchestrator
Runs the full end-to-end pipeline:

  Step 1: Scrape (API) or Download (bulk) → data/raw/
  Step 2: Score with Claude Haiku → data/scored/
  Step 3: Enrich top patents with Amazon.es + Google Trends Spain URLs
  Step 4: Output final shortlist → data/shortlist.csv

Usage:
    python pipeline.py                     # API scrape → score → enrich → shortlist
    python pipeline.py --source bulk --year 2017  # bulk download for 2017
    python pipeline.py --source api --limit 300   # API scrape with 300 patent limit
    python pipeline.py --dry-run                   # test run, no files saved

Logs each step's cost to data/pipeline_log.json.
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

import anthropic
import requests

from config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    CPC_CATEGORIES,
    CPC_SUBGROUPS,
    DATA_DIR,
    MAX_PATENTS,
    PAGE_SIZE,
    PATENT_EXPIRY_AFTER_YEAR,
    PATENTSVIEW_BASE_URL,
    RAW_DIR,
    SCORE_THRESHOLD,
    SCORED_DIR,
    SCORING_PROMPT,
    SHORTLIST_CSV,
)

# ── Paths ──────────────────────────────────────────────────────────────────────

PIPELINE_LOG = os.path.join(DATA_DIR, "pipeline_log.json")

# ── Cost tracking ──────────────────────────────────────────────────────────────

# Approximate token costs (USD) for Haiku — update if pricing changes
HAIKU_INPUT_COST_PER_1K = 0.00025
HAIKU_OUTPUT_COST_PER_1K = 0.00125


def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens / 1000 * HAIKU_INPUT_COST_PER_1K
        + output_tokens / 1000 * HAIKU_OUTPUT_COST_PER_1K
    )


# ── Pipeline log ───────────────────────────────────────────────────────────────


def _load_log() -> list[dict]:
    if Path(PIPELINE_LOG).exists():
        with open(PIPELINE_LOG, encoding="utf-8") as f:
            return json.load(f)
    return []


def _append_log(entry: dict) -> None:
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)
    log = _load_log()
    log.append(entry)
    with open(PIPELINE_LOG, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


# ── Step 1a: API Scrape ────────────────────────────────────────────────────────


def _build_api_query(cpc_code: str, page: int) -> dict:
    grant_date_start = f"{PATENT_EXPIRY_AFTER_YEAR - 20}-01-01"
    grant_date_end = f"{datetime.now().year - 4}-12-31"
    return {
        "q": {
            "_and": [
                {"_begins": {"cpc_subgroup_id": cpc_code}},
                {"_gte": {"patent_date": grant_date_start}},
                {"_lte": {"patent_date": grant_date_end}},
            ]
        },
        "f": [
            "patent_id", "patent_title", "patent_abstract", "patent_date",
            "patent_type", "cpc_subgroup_id", "assignee_organization",
            "assignee_total_num_patents", "inventor_last_name",
            "inventor_first_name", "inventor_country",
        ],
        "o": {"page": page, "per_page": PAGE_SIZE},
        "s": [{"patent_date": "desc"}],
    }


def step1_api_scrape(limit: int | None, dry_run: bool) -> tuple[list[dict], str]:
    """
    Fetch patents via PatentsView REST API.
    Returns (patents, output_path). output_path is empty string in dry_run mode.
    """
    print("\n[Step 1 — API Scrape]")
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "User-Agent": "PatentMiningSpain/1.0 (suzan.attallah@roboco-op.org)",
    })

    all_patents: list[dict] = []
    per_cat = (limit // len(CPC_CATEGORIES)) if limit else None

    for cpc in CPC_CATEGORIES:
        print(f"  Scraping {cpc}...")
        page = 1
        cat_patents: list[dict] = []

        while True:
            query = _build_api_query(cpc, page)
            url = f"{PATENTSVIEW_BASE_URL}/patents/query"
            try:
                resp = session.post(url, json=query, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"    Error on page {page}: {e}")
                break

            patents = data.get("patents") or []
            total = data.get("total_patent_count", 0)

            for p in patents:
                total_p = p.get("assignee_total_num_patents")
                if total_p is None or int(total_p) <= 500:
                    cat_patents.append(p)

            if dry_run:
                print(f"    [dry-run] Page 1 returned {len(patents)} patents (total_found={total})")
                break

            fetched = page * PAGE_SIZE
            if fetched >= total or not patents:
                break
            if per_cat and len(cat_patents) >= per_cat:
                cat_patents = cat_patents[:per_cat]
                break

            page += 1
            time.sleep(0.5)

        print(f"    Kept {len(cat_patents)} small-assignee patents for {cpc}")
        all_patents.extend(cat_patents)

    if dry_run:
        print(f"  [dry-run] Would have collected ≈{len(all_patents)} patents")
        return all_patents[:5], ""

    if not all_patents:
        return [], ""

    Path(RAW_DIR).mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(RAW_DIR, f"patents_{ts}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "total": len(all_patents),
            "categories_scraped": list({p.get("cpc_subgroup_id", "")[:4] for p in all_patents}),
            "patents": all_patents,
        }, f, ensure_ascii=False, indent=2)

    print(f"  Saved {len(all_patents)} patents → {out_path}")
    return all_patents, out_path


# ── Step 1b: Bulk Download ─────────────────────────────────────────────────────


def step1_bulk_download(year: int, limit: int | None, dry_run: bool) -> tuple[list[dict], str]:
    """
    Delegate to downloader.py via subprocess.
    Returns (patents, output_path).
    """
    print(f"\n[Step 1 — Bulk Download ({year})]")
    script = Path(__file__).parent / "downloader.py"
    cmd = [sys.executable, str(script), "--year", str(year)]
    if limit:
        cmd += ["--limit", str(limit)]
    if dry_run:
        cmd += ["--dry-run"]

    result = subprocess.run(cmd, capture_output=False, text=True)
    if result.returncode != 0:
        print(f"  [pipeline] downloader.py exited with code {result.returncode}")
        return [], ""

    if dry_run:
        return [], ""

    # Find the file just created
    raw_dir = Path(RAW_DIR)
    files = sorted(raw_dir.glob(f"bulk_{year}_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        print("  [pipeline] Could not find bulk output file.")
        return [], ""

    out_path = str(files[0])
    with open(out_path, encoding="utf-8") as f:
        data = json.load(f)
    patents = data.get("patents", [])
    print(f"  Loaded {len(patents)} patents from {out_path}")
    return patents, out_path


# ── Step 2: Score ─────────────────────────────────────────────────────────────


def _build_patent_text(patent: dict) -> str:
    return (
        f"Title: {patent.get('patent_title', 'N/A')}\n"
        f"Abstract: {(patent.get('patent_abstract') or 'N/A')[:800]}\n"
        f"CPC category: {patent.get('cpc_subgroup_id', 'N/A')}\n"
        f"Grant date: {patent.get('patent_date', 'N/A')}\n"
        f"Assignee: {patent.get('assignee_organization', 'Individual inventor')}\n"
        f"Inventor country: {patent.get('inventor_country', 'N/A')}\n"
    )


def step2_score(
    patents: list[dict],
    threshold: int,
    dry_run: bool,
) -> tuple[list[dict], float]:
    """
    Score each patent with Claude Haiku.
    Returns (scored_patents_above_threshold, total_cost_usd).
    """
    print(f"\n[Step 2 — Claude Scoring] {len(patents)} patents | threshold={threshold}")

    if not ANTHROPIC_API_KEY:
        print("  ERROR: ANTHROPIC_API_KEY not set. Skipping scoring.")
        return [], 0.0

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    passed: list[dict] = []
    total_input_tokens = 0
    total_output_tokens = 0

    sample = patents[:3] if dry_run else patents
    if dry_run:
        print(f"  [dry-run] Scoring first {len(sample)} patents only")

    for i, patent in enumerate(sample, 1):
        title = (patent.get("patent_title") or "")[:60]
        print(f"  [{i:>3}/{len(sample)}] {title}...", end=" ", flush=True)

        prompt = SCORING_PROMPT.format(patent_data=_build_patent_text(patent))

        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            score_data = json.loads(raw)

            total_input_tokens += response.usage.input_tokens
            total_output_tokens += response.usage.output_tokens

            score = score_data.get("score", 0)
            print(f"score={score} | {score_data.get('product_idea', '')}")

            if score >= threshold:
                patent["claude_score"] = score_data
                passed.append(patent)

        except json.JSONDecodeError as e:
            print(f"JSON error: {e}")
        except anthropic.APIError as e:
            print(f"API error: {e}")
        except Exception as e:
            print(f"error: {e}")

        time.sleep(0.2)

    cost = _estimate_cost(total_input_tokens, total_output_tokens)
    print(f"  Passed ≥{threshold}: {len(passed)} | Cost: ${cost:.4f}")
    return passed, cost


# ── Step 3: Enrich with Amazon.es + Google Trends URLs ────────────────────────


def _amazon_es_url(query: str) -> str:
    """Construct an Amazon.es search URL for a product idea."""
    encoded = urllib.parse.quote_plus(query)
    return f"https://www.amazon.es/s?k={encoded}&ref=nb_sb_noss"


def _google_trends_es_url(query: str) -> str:
    """Construct a Google Trends URL filtered to Spain."""
    encoded = urllib.parse.quote_plus(query)
    return f"https://trends.google.com/trends/explore?q={encoded}&geo=ES"


def _alibaba_url(query: str) -> str:
    """Construct an Alibaba supplier search URL."""
    encoded = urllib.parse.quote_plus(query)
    return f"https://www.alibaba.com/trade/search?SearchText={encoded}"


def step3_enrich(patents: list[dict]) -> list[dict]:
    """
    Add Amazon.es search URL, Google Trends Spain URL, and Alibaba URL
    to each top-scoring patent. Returns the enriched list.
    """
    print(f"\n[Step 3 — Enrich] Adding market validation URLs to {len(patents)} patents")

    for patent in patents:
        score_data = patent.get("claude_score") or {}
        product_idea = score_data.get("product_idea") or patent.get("patent_title") or ""

        # Use the Claude-suggested product idea as the search term — it's more
        # market-ready than the raw patent title (e.g. "Adjustable pot lid"
        # instead of "Apparatus for sealing a culinary vessel").
        patent["amazon_es_url"] = _amazon_es_url(product_idea)
        patent["google_trends_es_url"] = _google_trends_es_url(product_idea)
        patent["alibaba_url"] = _alibaba_url(product_idea)

    return patents


# ── Step 4: Shortlist CSV ──────────────────────────────────────────────────────


SHORTLIST_FIELDNAMES = [
    "patent_id",
    "patent_title",
    "score",
    "manufacturing_ease",
    "amazon_demand",
    "margin_potential",
    "product_idea",
    "estimated_sale_price_eur",
    "estimated_manufacturing_cost_eur",
    "reasoning",
    "recommended_categories",
    "cpc_subgroup_id",
    "patent_date",
    "assignee_organization",
    "amazon_es_url",
    "google_trends_es_url",
    "alibaba_url",
]


def step4_shortlist(patents: list[dict], dry_run: bool) -> str:
    """
    Write enriched + scored patents to the shortlist CSV.
    Always overwrites (fresh run). Returns the output path.
    """
    print(f"\n[Step 4 — Shortlist CSV] Writing {len(patents)} patents")

    if dry_run:
        print("  [dry-run] Would write to", SHORTLIST_CSV)
        for p in patents[:2]:
            print(json.dumps({k: p.get(k) or (p.get("claude_score") or {}).get(k) for k in SHORTLIST_FIELDNAMES[:8]}, indent=2, ensure_ascii=False))
        return ""

    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)
    with open(SHORTLIST_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SHORTLIST_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        for p in patents:
            cs = p.get("claude_score") or {}
            row = {
                "patent_id": p.get("patent_id"),
                "patent_title": p.get("patent_title"),
                "cpc_subgroup_id": p.get("cpc_subgroup_id"),
                "patent_date": p.get("patent_date"),
                "assignee_organization": p.get("assignee_organization"),
                "amazon_es_url": p.get("amazon_es_url"),
                "google_trends_es_url": p.get("google_trends_es_url"),
                "alibaba_url": p.get("alibaba_url"),
                "score": cs.get("score"),
                "manufacturing_ease": cs.get("manufacturing_ease"),
                "amazon_demand": cs.get("amazon_demand"),
                "margin_potential": cs.get("margin_potential"),
                "product_idea": cs.get("product_idea"),
                "estimated_sale_price_eur": cs.get("estimated_sale_price_eur"),
                "estimated_manufacturing_cost_eur": cs.get("estimated_manufacturing_cost_eur"),
                "reasoning": cs.get("reasoning"),
                "recommended_categories": json.dumps(cs.get("recommended_categories") or []),
            }
            writer.writerow(row)

    print(f"  Saved → {SHORTLIST_CSV}")
    return SHORTLIST_CSV


# ── CLI + orchestration ────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Patent Mining Spain — end-to-end pipeline (scrape → score → enrich → CSV)"
    )
    parser.add_argument(
        "--source",
        choices=["api", "bulk"],
        default="api",
        help="Data source: 'api' uses PatentsView REST API; 'bulk' downloads USPTO full files (default: api)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=None,
        help="Year for bulk download (required when --source bulk, e.g. 2018)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=MAX_PATENTS,
        help=f"Max patents to scrape/download (default: {MAX_PATENTS})",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=SCORE_THRESHOLD,
        help=f"Minimum Claude score to include in shortlist (default: {SCORE_THRESHOLD})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run each step with minimal data and skip saving files",
    )
    args = parser.parse_args()

    if args.source == "bulk" and not args.year:
        parser.error("--year is required when --source bulk (e.g. --year 2018)")

    run_start = datetime.utcnow()
    print("=" * 55)
    print("  Patent Mining Spain — Pipeline")
    print(f"  Source: {args.source.upper()} | Limit: {args.limit} | Threshold: {args.threshold}")
    print(f"  Started: {run_start.strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 55)

    # ── Step 1 ────────────────────────────────────────────────────────────────
    if args.source == "api":
        patents_raw, raw_path = step1_api_scrape(args.limit, args.dry_run)
    else:
        patents_raw, raw_path = step1_bulk_download(args.year, args.limit, args.dry_run)

    scraped_count = len(patents_raw)

    if not patents_raw and not args.dry_run:
        print("\n[pipeline] No patents collected in Step 1. Aborting.")
        return

    # ── Step 2 ────────────────────────────────────────────────────────────────
    scored_patents, scoring_cost = step2_score(patents_raw, args.threshold, args.dry_run)
    scored_count = len(patents_raw)  # total passed through scorer
    above_threshold = len(scored_patents)

    # Save scored file
    if scored_patents and not args.dry_run:
        Path(SCORED_DIR).mkdir(parents=True, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        scored_path = os.path.join(SCORED_DIR, f"scored_{ts}.json")
        with open(scored_path, "w", encoding="utf-8") as f:
            json.dump({
                "scored_at": datetime.utcnow().isoformat() + "Z",
                "threshold": args.threshold,
                "total_scored": above_threshold,
                "patents": scored_patents,
            }, f, ensure_ascii=False, indent=2)
        print(f"  Scored file → {scored_path}")

    # ── Step 3 ────────────────────────────────────────────────────────────────
    enriched = step3_enrich(scored_patents)

    # ── Step 4 ────────────────────────────────────────────────────────────────
    shortlist_path = step4_shortlist(enriched, args.dry_run)

    # ── Log ───────────────────────────────────────────────────────────────────
    run_end = datetime.utcnow()
    log_entry = {
        "run_at": run_start.isoformat() + "Z",
        "duration_seconds": round((run_end - run_start).total_seconds(), 1),
        "source": args.source,
        "year": args.year,
        "dry_run": args.dry_run,
        "patents_scraped": scraped_count,
        "patents_scored": scored_count,
        "above_threshold": above_threshold,
        "threshold": args.threshold,
        "scoring_cost_usd": round(scoring_cost, 5),
        "raw_file": raw_path,
        "shortlist": shortlist_path,
    }
    if not args.dry_run:
        _append_log(log_entry)

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("=" * 40)
    print("  === Pipeline Summary ===")
    print(f"  Patents scraped:  {scraped_count}")
    print(f"  Patents scored:   {scored_count}")
    print(f"  Score >= {args.threshold}:      {above_threshold}")
    print(f"  Scoring cost:     ${scoring_cost:.4f}")
    print(f"  Saved to:         {shortlist_path or '(dry-run)'}")
    print("=" * 40)

    if not args.dry_run and above_threshold > 0:
        print(f"\nNext step: open {shortlist_path}")
        print("  Click the amazon_es_url links to validate demand.")
        print("  Click google_trends_es_url to check search trend in Spain.")
        print("  Click alibaba_url to source from Chinese manufacturers.")


if __name__ == "__main__":
    main()
