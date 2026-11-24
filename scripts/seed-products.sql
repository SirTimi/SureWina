-- One-time load of the starting products and their draw times, as
-- PROPOSALS awaiting approval. Nothing is sold until a senior admin approves
-- each product and each draw time on Admin -> Products. Every value here is
-- a placeholder and can be changed there (with approval).
--
-- Safe to run twice: existing product codes and existing draw times are
-- left alone.
--
-- Run on the app server (after deploying 1b83ad7 or later):
--   set -a; . /root/surewina-secrets/migrator.env; set +a
--   psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f /opt/surewina/scripts/seed-products.sql

BEGIN;

-- Daily products: prize pool, 50% of sales, 4 cash categories.
-- Minimum pool = 1,000 x ticket price. Category prizes = 100x, 20x, 5x and 2x
-- the ticket price, so even at the minimum pool every category has winners.
INSERT INTO products (product_id, code, name, ticket_label, kind, active,
  ticket_price_ngn, prize_description, prize_model, pool_payout_bp,
  pool_minimum_ngn, pool_revenue_basis, prize_tiers, created_by_admin_id,
  pending_change, pending_proposed_by, pending_proposed_at, updated_at)
SELECT gen_random_uuid()::text, p.code, p.name, p.label, 'DAILY_STANDARD', false,
  p.price, 'Win up to ₦' || to_char(p.price * 100, 'FM999,999,999'), 'POOL', 5000,
  p.price * 1000, 'GROSS',
  jsonb_build_array(
    jsonb_build_object('tierNo', 1, 'name', 'First',  'active', true, 'allocationBp', 1000, 'winnerCount', null, 'prizePerWinnerNgn', p.price * 100, 'prizeDescription', null, 'itemPrize', false),
    jsonb_build_object('tierNo', 2, 'name', 'Second', 'active', true, 'allocationBp', 2000, 'winnerCount', null, 'prizePerWinnerNgn', p.price * 20,  'prizeDescription', null, 'itemPrize', false),
    jsonb_build_object('tierNo', 3, 'name', 'Third',  'active', true, 'allocationBp', 3000, 'winnerCount', null, 'prizePerWinnerNgn', p.price * 5,   'prizeDescription', null, 'itemPrize', false),
    jsonb_build_object('tierNo', 4, 'name', 'Fourth', 'active', true, 'allocationBp', 4000, 'winnerCount', null, 'prizePerWinnerNgn', p.price * 2,   'prizeDescription', null, 'itemPrize', false)
  ),
  'system-seed', '{"create": true}'::jsonb, 'system-seed', now(), now()
FROM (VALUES
  ('SW100',  'Sure 100',   'SURE 100',   100),
  ('SW200',  'Sure 200',   'SURE 200',   200),
  ('SW500',  'Sure 500',   'SURE 500',   500),
  ('SW1000', 'Sure 1000',  'SURE 1000',  1000)
) AS p(code, name, label, price)
ON CONFLICT (code) DO NOTHING;

-- Jackpot products: 3 stages, winners per stage set by management.
INSERT INTO products (product_id, code, name, ticket_label, kind, active,
  ticket_price_ngn, prize_description, prize_model, prize_tiers,
  created_by_admin_id, pending_change, pending_proposed_by, pending_proposed_at, updated_at)
SELECT gen_random_uuid()::text, j.code, j.name, j.label, 'SATURDAY_JACKPOT', false,
  j.price, j.headline, 'STAGES', j.tiers::jsonb,
  'system-seed', '{"create": true}'::jsonb, 'system-seed', now(), now()
FROM (VALUES
  ('JP500', 'Sure Jackpot', 'SURE JACKPOT', 500, 'Win a car or ₦5,000,000',
   '[{"tierNo":1,"name":"Jackpot","active":true,"allocationBp":null,"winnerCount":1,"prizePerWinnerNgn":5000000,"prizeDescription":"Car","itemPrize":true},
     {"tierNo":2,"name":"Consolation","active":true,"allocationBp":null,"winnerCount":10,"prizePerWinnerNgn":50000,"prizeDescription":null,"itemPrize":false},
     {"tierNo":3,"name":"Second consolation","active":true,"allocationBp":null,"winnerCount":50,"prizePerWinnerNgn":5000,"prizeDescription":null,"itemPrize":false}]'),
  ('JP1000', 'Mega Jackpot', 'MEGA JACKPOT', 1000, 'Win ₦10,000,000',
   '[{"tierNo":1,"name":"Jackpot","active":true,"allocationBp":null,"winnerCount":1,"prizePerWinnerNgn":10000000,"prizeDescription":null,"itemPrize":false},
     {"tierNo":2,"name":"Consolation","active":true,"allocationBp":null,"winnerCount":10,"prizePerWinnerNgn":100000,"prizeDescription":null,"itemPrize":false},
     {"tierNo":3,"name":"Second consolation","active":true,"allocationBp":null,"winnerCount":50,"prizePerWinnerNgn":10000,"prizeDescription":null,"itemPrize":false}]')
) AS j(code, name, label, price, headline, tiers)
ON CONFLICT (code) DO NOTHING;

-- Draw times, awaiting approval. Daily: noon (sales 19:00 the day before to
-- 11:00) and 6pm (sales 13:00 to 17:00), every day. Jackpots: 20:00, sales
-- open when the draw is created and close at 19:00; Sure Jackpot on
-- Saturdays, Mega Jackpot on Wednesdays.
INSERT INTO draw_templates (template_id, template_type, product_id, slot_code,
  label, prize_description, prize_value_ngn, ticket_price_ngn,
  sales_open_minutes_wat, sales_open_previous_day, cutoff_minutes_wat,
  scheduled_minutes_wat, weekdays, version, status, effective_from,
  created_by_admin_id, updated_at)
SELECT gen_random_uuid()::text,
  CASE WHEN p.kind = 'SATURDAY_JACKPOT' THEN 'SATURDAY_JACKPOT'::"DrawTemplateType" ELSE 'DAILY_STANDARD'::"DrawTemplateType" END,
  p.product_id, s.slot, p.name || ' ' || s.slot, p.prize_description,
  GREATEST(1, COALESCE(p.pool_minimum_ngn, 1)), p.ticket_price_ngn,
  s.opens, s.prev_day, s.cutoff, s.draw_at, s.days, 1, 'PENDING_APPROVAL', now(),
  'system-seed', now()
FROM products p
JOIN (VALUES
  ('DAILY',  'NOON',     1140, true,  660,  720,  ARRAY[0,1,2,3,4,5,6]),
  ('DAILY',  'EVENING',  780,  false, 1020, 1080, ARRAY[0,1,2,3,4,5,6]),
  ('JP500',  'SATURDAY', NULL, false, 1140, 1200, ARRAY[6]),
  ('JP1000', 'WEDNESDAY', NULL, false, 1140, 1200, ARRAY[3])
) AS s(applies_to, slot, opens, prev_day, cutoff, draw_at, days)
  ON (s.applies_to = 'DAILY' AND p.kind = 'DAILY_STANDARD') OR s.applies_to = p.code
WHERE p.code IN ('SW100', 'SW200', 'SW500', 'SW1000', 'JP500', 'JP1000')
  AND NOT EXISTS (
    SELECT 1 FROM draw_templates t
    WHERE t.product_id = p.product_id AND t.slot_code = s.slot
      AND t.status IN ('ACTIVE', 'PENDING_APPROVAL')
  );

SELECT p.code, p.name, p.ticket_price_ngn AS price, p.active,
       (p.pending_change IS NOT NULL) AS awaiting_approval,
       string_agg(t.slot_code || CASE WHEN t.status = 'PENDING_APPROVAL' THEN ' (awaiting approval)' ELSE '' END, ', ' ORDER BY t.slot_code) AS draw_times
FROM products p
LEFT JOIN draw_templates t ON t.product_id = p.product_id AND t.status IN ('ACTIVE', 'PENDING_APPROVAL')
GROUP BY p.code, p.name, p.kind, p.ticket_price_ngn, p.active, p.pending_change
ORDER BY p.kind, p.ticket_price_ngn;

COMMIT;
