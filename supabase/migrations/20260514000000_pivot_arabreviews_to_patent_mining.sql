-- =============================================================
-- Migration: Pivot ArabReviews → Patent Mining Spain
-- Date: 2026-05-14
-- Operator: Suzan Attallah (suzan.attallah@roboco-op.org)
-- CEO Decision: Higher ARPU (48% margin), Spanish language moat
--
-- Run this in your Supabase SQL Editor.
-- Replace <<YOUR_USER_ID>> with your actual Supabase auth.users UUID.
-- =============================================================

-- ① Update the startup row
UPDATE startups
SET
  name         = 'Patent Mining Spain',
  description  = 'Find expired USPTO patents in kitchen/garden/pet → manufacture via Alibaba → sell on Amazon.es FBA. Target: 48% margin per unit. Expand to Amazon.de/fr/it in Month 3.',
  business_type = 'physical_product',
  status        = 'active',
  experiment_count = 0
WHERE
  name = 'ArabReviews'
  AND user_id = '<<YOUR_USER_ID>>';

-- ② Delete the old ArabReviews experiments
DELETE FROM experiments
WHERE startup_id = (
  SELECT id FROM startups
  WHERE name = 'Patent Mining Spain' AND user_id = '<<YOUR_USER_ID>>'
);

-- ③ Insert Patent Mining Spain experiments
INSERT INTO experiments (startup_id, hypothesis, metric, target_value, status)
SELECT
  s.id,
  exp.hypothesis,
  exp.metric,
  exp.target_value,
  exp.status
FROM startups s
CROSS JOIN (VALUES
  (
    'USPTO scraper returns 50+ scoreable patents in kitchen/garden/pet categories',
    'Patents fetched with complete data',
    '50',
    'running'
  ),
  (
    'Claude scoring identifies 3+ products with score ≥ 7 from first patent batch',
    'Patents with score ≥ 7',
    '3',
    'pending'
  ),
  (
    'Alibaba supplier found for top-scored product at < €2/unit with MOQ ≤ 1,000',
    'Supplier quotes received',
    '3',
    'pending'
  )
) AS exp(hypothesis, metric, target_value, status)
WHERE s.name = 'Patent Mining Spain'
  AND s.user_id = '<<YOUR_USER_ID>>';

-- ④ Update experiment_count
UPDATE startups
SET experiment_count = 3
WHERE name = 'Patent Mining Spain'
  AND user_id = '<<YOUR_USER_ID>>';

-- ⑤ Log the pivot
INSERT INTO pivot_log (startup_id, pivot_from, pivot_to, reason)
SELECT
  id,
  'ArabReviews (affiliate_seo)',
  'Patent Mining Spain (physical_product)',
  'Higher ARPU: 48% net margin vs ~5% affiliate. Spanish language moat on Amazon.es. Operator speaks Spanish. CEO approved 2026-05-14.'
FROM startups
WHERE name = 'Patent Mining Spain'
  AND user_id = '<<YOUR_USER_ID>>';

-- ⑥ Verify
SELECT name, business_type, status, experiment_count
FROM startups
WHERE user_id = '<<YOUR_USER_ID>>';
