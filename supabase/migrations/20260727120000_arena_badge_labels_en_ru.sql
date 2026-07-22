-- ---------------------------------------------------------------------------
-- Badge names and descriptions in English and Russian.
--
-- `20260725100000_arena_award_engine.sql` seeded all eleven global badges with
-- `{"de": …}` only, reasoning that a missing locale key falls back to German
-- and a blank one would render an empty badge name. True — but the fallback was
-- never meant to be the destination, and it left the Arena hub showing German
-- badge names on /en and /ru while every other string on the page was
-- translated. `bug_categories` in `20260724100000_…` seeded all three locales
-- from the start; badges are the outlier, not the rule.
--
-- Badge names are product chrome, not course content. The German-only rule in
-- MASTER_PLAN §11 covers authored course material — task titles, instructions,
-- stage names — not the gamification vocabulary the app itself ships.
--
-- `||` merges rather than replaces, so the German source of truth is preserved
-- even if it has been edited since the seed. Keyed by `code` with
-- `organization_id is null`, matching `badges_global_code_version_uidx`; a
-- tenant that has cloned a badge into its own row is left alone.
-- ---------------------------------------------------------------------------

update public.badges as b
set labels       = b.labels || t.labels,
    descriptions = b.descriptions || t.descriptions,
    updated_at   = statement_timestamp()
from (values
  ('first-bug-found',
   '{"en": "First find", "ru": "Первая находка"}'::jsonb,
   '{"en": "Your first defect report was confirmed by a trainer.",
     "ru": "Ваш первый отчёт о дефекте подтверждён преподавателем."}'::jsonb),

  ('bug-hunter-5',
   '{"en": "Bug hunter", "ru": "Охотник за багами"}'::jsonb,
   '{"en": "Five confirmed defect reports.",
     "ru": "Пять подтверждённых отчётов о дефектах."}'::jsonb),

  ('bug-hunter-10',
   '{"en": "Gold bug hunter", "ru": "Золотой охотник за багами"}'::jsonb,
   '{"en": "Ten confirmed defect reports.",
     "ru": "Десять подтверждённых отчётов о дефектах."}'::jsonb),

  ('unplanted-find',
   '{"en": "Unexpected find", "ru": "Неожиданная находка"}'::jsonb,
   '{"en": "You found a real defect that we had not planted.",
     "ru": "Вы нашли настоящий дефект, который мы не закладывали."}'::jsonb),

  ('first-approval',
   '{"en": "First approval", "ru": "Первое одобрение"}'::jsonb,
   '{"en": "Your first submission was approved.",
     "ru": "Вашу первую работу приняли."}'::jsonb),

  ('approved-10',
   '{"en": "Ten approvals", "ru": "Десять одобрений"}'::jsonb,
   '{"en": "Ten approved submissions.",
     "ru": "Десять принятых работ."}'::jsonb),

  ('streak-3',
   '{"en": "Warming up", "ru": "Разминка"}'::jsonb,
   '{"en": "Three days of learning in a row.",
     "ru": "Три дня обучения подряд."}'::jsonb),

  ('streak-7',
   '{"en": "A week strong", "ru": "Неделя подряд"}'::jsonb,
   '{"en": "Seven days of learning in a row.",
     "ru": "Семь дней обучения подряд."}'::jsonb),

  ('streak-14',
   '{"en": "Two-week streak", "ru": "Две недели подряд"}'::jsonb,
   '{"en": "Fourteen days of learning in a row.",
     "ru": "Четырнадцать дней обучения подряд."}'::jsonb),

  ('streak-30',
   '{"en": "Month marathon", "ru": "Месячный марафон"}'::jsonb,
   '{"en": "Thirty days of learning in a row.",
     "ru": "Тридцать дней обучения подряд."}'::jsonb),

  ('streak-100',
   '{"en": "Centurion", "ru": "Центурион"}'::jsonb,
   '{"en": "One hundred days of learning in a row.",
     "ru": "Сто дней обучения подряд."}'::jsonb)
) as t(code, labels, descriptions)
where b.code = t.code
  and b.organization_id is null;
