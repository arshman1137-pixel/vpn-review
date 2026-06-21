"""
Patent Mining Spain — Pipeline Configuration
Edit this file to tune filters and thresholds before running.
"""

import os

# ── API Keys ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# ── USPTO PatentsView API ─────────────────────────────────────────────────────
PATENTSVIEW_BASE_URL = "https://search.patentsview.org/api/v1"

# ── CPC Subgroup Codes — Physical, Manufacturable Products Only ───────────────
# These are precise CPC subgroup prefixes that map to tangible consumer goods
# manufacturable via Alibaba and sellable on Amazon.es FBA.
#
# REASONING: The old broad category codes (A47J, A01G, etc.) matched thousands
# of patents covering software, methods, and abstract improvements — not
# physical products. These specific subgroup codes filter to hardware/devices.

CPC_SUBGROUPS: dict[str, str] = {
    # ── Kitchen ──────────────────────────────────────────────────────────────
    "A47J27": "Cooking vessels (pots, pans, pressure cookers, steamers) — highly manufacturable",
    "A47J37": "Cooking by direct heat contact (grills, griddles, woks, BBQ accessories)",
    "A47J36": "Lids, covers, and accessories for cooking vessels",
    "A47J43": "Food-processing devices (mashers, graters, slicers, manual choppers)",
    "A47J44": "Coffee and tea brewing apparatus (pour-over, French press, stovetop)",
    "A47J47": "Kitchen utensil storage and organizers",

    # ── Garden / Plants ───────────────────────────────────────────────────────
    "A01G9":  "Cultivating flowers, plants, trees in containers/pots — high Amazon demand",
    "A01G27": "Watering apparatus (drip systems, self-watering planters, sprinklers)",
    "A01G13": "Protective covers for plants (frost blankets, shade cloths, row covers)",
    "A01G17": "Plant training and support devices (trellises, stakes, clips)",

    # ── Pet / Animal ──────────────────────────────────────────────────────────
    "A01K15": "Pet accessories (collars, leashes, harnesses, muzzles, feeders)",
    "A01K29": "Fishing equipment (hooks, lures, tackle accessories) — manufacturable hardware",
    "A01K63": "Fish tanks, aquarium equipment and accessories",
    "A01K1":  "Animal housing, litter trays, bedding accessories for small pets",

    # ── Home Utensils / Cleaning ──────────────────────────────────────────────
    "A47L13": "Hand implements for household cleaning (brushes, scrapers, squeegees)",
    "A47L17": "Dish-washing implements and accessories (draining racks, bottle brushes)",
    "A47L25": "Window and mirror cleaning devices",

    # ── Household Articles / Storage ─────────────────────────────────────────
    "A47G19": "Tableware, serving dishes, table accessories (napkin rings, trivets)",
    "A47G21": "Toothpicks, skewers, kitchen picks and small serving accessories",
    "A47G29": "Household article storage (hangers, hooks, wall-mounted organizers)",
    "A47G33": "Ornamental articles for the home (candle holders, vases — simple forms)",
}

# Flat list of subgroup prefixes — used by the API query builder and bulk downloader
CPC_CATEGORIES: list[str] = list(CPC_SUBGROUPS.keys())

# Only patents that expired AFTER this year are still potentially protectable
# (or expired recently — simpler to manufacture without IP risk)
PATENT_EXPIRY_AFTER_YEAR = 2014

# Small company filter — fewer than this many employees at assignee
MAX_ASSIGNEE_EMPLOYEES = 50

# How many patents to fetch per API request (max 1000)
PAGE_SIZE = 100

# Total patents to collect before stopping (set None for unlimited)
MAX_PATENTS = 500

# ── Claude Scoring ────────────────────────────────────────────────────────────
CLAUDE_MODEL = "claude-haiku-4-5-20251001"  # Fast + cheap for bulk scoring
SCORE_THRESHOLD = 7  # Keep only patents scored >= this

SCORING_PROMPT = """\
You are a commercial patent analyst specializing in Amazon FBA product sourcing.

Analyze the following patent and score it from 1 to 10 based on these criteria:
1. Ease of manufacturing in China or Spain (simple design = high score)
2. Demand on Amazon.es in Spain (kitchen, garden, pet, home categories score high)
3. Expected profit margin (products that can sell €10-25 with low BOM score high)
4. Low competition risk (niche, not dominated by big brands = high score)
5. Patent is expired or expiring — product is now free to manufacture

Return ONLY valid JSON with this exact structure:
{
  "score": <integer 1-10>,
  "manufacturing_ease": <integer 1-10>,
  "amazon_demand": <integer 1-10>,
  "margin_potential": <integer 1-10>,
  "reasoning": "<2-3 sentences in English>",
  "product_idea": "<concrete product name for Amazon.es listing>",
  "estimated_sale_price_eur": <number>,
  "estimated_manufacturing_cost_eur": <number>,
  "recommended_categories": ["<Amazon category>"]
}

Patent data:
{patent_data}
"""

# ── Output Paths ──────────────────────────────────────────────────────────────
DATA_DIR = "data"
RAW_DIR = f"{DATA_DIR}/raw"
SCORED_DIR = f"{DATA_DIR}/scored"
SHORTLIST_CSV = f"{DATA_DIR}/shortlist.csv"
