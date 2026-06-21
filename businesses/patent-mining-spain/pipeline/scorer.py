#!/usr/bin/env python3
"""
Claude Patent Scorer — Patent Mining Spain
Reads raw patent JSON from data/raw/, scores each patent with Claude,
and saves patents with score >= SCORE_THRESHOLD to data/scored/.

Usage:
    python scorer.py                          # score latest raw file
    python scorer.py --input data/raw/X.json # score specific file
    python scorer.py --dry-run               # score first 3 patents only
    python scorer.py --threshold 8           # override score threshold

Cost estimate: ~$0.0002 per patent with Haiku (500 patents ≈ $0.10)
"""

import argparse
import csv
import json
import os
import time
from pathlib import Path

import anthropic

from config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    DATA_DIR,
    RAW_DIR,
    SCORE_THRESHOLD,
    SCORED_DIR,
    SCORING_PROMPT,
    SHORTLIST_CSV,
)


def latest_raw_file() -> str | None:
    """Return path to the most recently created raw patent file."""
    raw_dir = Path(RAW_DIR)
    if not raw_dir.exists():
        return None
    files = sorted(raw_dir.glob("patents_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return str(files[0]) if files else None


def build_patent_text(patent: dict) -> str:
    """Format a patent dict into the text fed to the scoring prompt."""
    return (
        f"Title: {patent.get('patent_title', 'N/A')}\n"
        f"Abstract: {patent.get('patent_abstract', 'N/A')[:800]}\n"
        f"CPC category: {patent.get('cpc_subgroup_id', 'N/A')}\n"
        f"Grant date: {patent.get('patent_date', 'N/A')}\n"
        f"Assignee: {patent.get('assignee_organization', 'Individual inventor')}\n"
        f"Inventor country: {patent.get('inventor_country', 'N/A')}\n"
    )


def score_patent(client: anthropic.Anthropic, patent: dict) -> dict | None:
    """Call Claude to score a single patent. Returns parsed JSON or None."""
    patent_text = build_patent_text(patent)
    prompt = SCORING_PROMPT.format(patent_data=patent_text)

    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown fences if Claude wrapped the JSON
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"    JSON parse error: {e}")
        return None
    except anthropic.APIError as e:
        print(f"    API error: {e}")
        return None


def save_scored(scored: list[dict], source_file: str) -> str:
    """Save scored patents to data/scored/."""
    Path(SCORED_DIR).mkdir(parents=True, exist_ok=True)
    stem = Path(source_file).stem.replace("patents_", "scored_")
    out_path = os.path.join(SCORED_DIR, f"{stem}.json")

    payload = {
        "source": source_file,
        "threshold": SCORE_THRESHOLD,
        "total_scored": len(scored),
        "patents": scored,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return out_path


def save_shortlist(scored: list[dict]) -> None:
    """Append high-scoring patents to the master shortlist CSV."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)
    file_exists = Path(SHORTLIST_CSV).exists()

    fieldnames = [
        "patent_id", "patent_title", "score",
        "manufacturing_ease", "amazon_demand", "margin_potential",
        "product_idea", "estimated_sale_price_eur", "estimated_manufacturing_cost_eur",
        "reasoning", "cpc_subgroup_id", "patent_date", "assignee_organization",
    ]

    with open(SHORTLIST_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        if not file_exists:
            writer.writeheader()
        for p in scored:
            row = {
                "patent_id": p.get("patent_id"),
                "patent_title": p.get("patent_title"),
                "cpc_subgroup_id": p.get("cpc_subgroup_id"),
                "patent_date": p.get("patent_date"),
                "assignee_organization": p.get("assignee_organization"),
                **{k: p["claude_score"].get(k) for k in [
                    "score", "manufacturing_ease", "amazon_demand", "margin_potential",
                    "product_idea", "estimated_sale_price_eur",
                    "estimated_manufacturing_cost_eur", "reasoning",
                ]},
            }
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description="Score patents with Claude API")
    parser.add_argument("--input", help="Path to raw patents JSON file")
    parser.add_argument("--threshold", type=int, default=SCORE_THRESHOLD, help="Min score to keep")
    parser.add_argument("--dry-run", action="store_true", help="Score only first 3 patents")
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        print("[scorer] ERROR: ANTHROPIC_API_KEY not set. Export it first:")
        print("  export ANTHROPIC_API_KEY=sk-ant-...")
        return

    input_file = args.input or latest_raw_file()
    if not input_file or not Path(input_file).exists():
        print(f"[scorer] No raw patent file found in {RAW_DIR}/")
        print("  Run `python scraper.py` first to fetch patents.")
        return

    with open(input_file, encoding="utf-8") as f:
        data = json.load(f)

    patents = data.get("patents", [])
    if args.dry_run:
        patents = patents[:3]
        print(f"[scorer] DRY RUN — scoring first {len(patents)} patents only")

    print(f"[scorer] Scoring {len(patents)} patents from {input_file}")
    print(f"[scorer] Model: {CLAUDE_MODEL} | Threshold: {args.threshold}+")
    print(f"[scorer] Estimated cost: ${len(patents) * 0.0002:.3f}")
    print()

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    passed: list[dict] = []
    failed_count = 0

    for i, patent in enumerate(patents, 1):
        title = (patent.get("patent_title") or "")[:60]
        print(f"  [{i:>3}/{len(patents)}] {title}...", end=" ", flush=True)

        score_data = score_patent(client, patent)
        if not score_data:
            print("⚠ skipped")
            failed_count += 1
            time.sleep(0.3)
            continue

        score = score_data.get("score", 0)
        product_idea = score_data.get("product_idea", "")
        print(f"score={score} | {product_idea}")

        if score >= args.threshold:
            patent["claude_score"] = score_data
            passed.append(patent)

        time.sleep(0.2)  # avoid rate limits

    print()
    print(f"[scorer] Results:")
    print(f"  Total scored:      {len(patents)}")
    print(f"  Passed (≥{args.threshold}):      {len(passed)}")
    print(f"  Failed/skipped:    {failed_count}")
    print(f"  Rejection rate:    {(1 - len(passed)/max(len(patents),1))*100:.0f}%")

    if args.dry_run:
        print("\n[dry-run] Sample output:")
        for p in passed:
            print(json.dumps(p["claude_score"], ensure_ascii=False, indent=2))
        return

    if passed:
        scored_path = save_scored(passed, input_file)
        save_shortlist(passed)
        print(f"\n[scorer] ✓ Saved {len(passed)} scored patents → {scored_path}")
        print(f"[scorer] ✓ Shortlist updated → {SHORTLIST_CSV}")
        print("[scorer] Next step: open data/shortlist.csv and pick top candidates for Alibaba sourcing")
    else:
        print(f"\n[scorer] No patents scored ≥ {args.threshold}. Try:")
        print("  1. Lower threshold: --threshold 6")
        print("  2. Add more categories in config.py")
        print("  3. Run scraper with --limit 500 for a larger batch")


if __name__ == "__main__":
    main()
