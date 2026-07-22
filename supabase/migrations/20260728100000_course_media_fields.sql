-- ---------------------------------------------------------------------------
-- Course media: one cover image, and two motivational videos per language.
--
-- Placement follows the admin form rather than convenience. In the design the
-- image carries no language tabs and the two videos do, so the image is one
-- value on `courses` and the videos are one row per locale on
-- `course_localizations` — the same table that already holds the course title
-- and description, and the same table `resolve_snapshot_localization` already
-- reads when it builds a learner's snapshot.
--
-- Storing the videos as a single jsonb `{de,en,ru}` on `courses` would have
-- been fewer columns and the wrong shape: every other translated course string
-- lives in `course_localizations`, and a second mechanism for the same idea is
-- how a codebase ends up with two half-working translation paths.
--
-- NO state column is added. `record_state` already has draft / active /
-- inactive / archived, so the form's "Activate the course" toggle is
-- active ↔ inactive, and "deleted, visible to nobody" is `archived`.
--
-- Additive only. Nothing reads these yet and no snapshot shape changes here,
-- so this migration cannot alter what an existing learner sees. The snapshot
-- and the validator are extended in a later migration, on purpose: a column
-- that nothing reads is safe to ship on its own, whereas a snapshot change is
-- the one edit that can silently empty a learner's course (ISSUES.md I-041).
-- ---------------------------------------------------------------------------

begin;

alter table public.courses
  add column if not exists hero_image_url text;

comment on column public.courses.hero_image_url is
  'Cover image shown on the course card and the group page. Not translated: the design shows no language tabs on it.';

alter table public.course_localizations
  add column if not exists exam_video_url text,
  add column if not exists completion_video_url text;

comment on column public.course_localizations.exam_video_url is
  'Motivational video played after the learner passes the exam. Per locale.';
comment on column public.course_localizations.completion_video_url is
  'Motivational video played after the learner completes the course. Per locale.';

-- Same protocol rule the tasks table already carries, so a relative upload path
-- and an absolute URL are both allowed but a `javascript:` URL is not. Written
-- as three separate constraints rather than one so a violation names the field.
alter table public.courses
  drop constraint if exists courses_hero_image_url_protocol;
alter table public.courses
  add constraint courses_hero_image_url_protocol
  check (
    hero_image_url is null
    or hero_image_url ~ '^https?://'
    or hero_image_url ~ '^/[^/]'
  );

alter table public.course_localizations
  drop constraint if exists course_localizations_exam_video_url_protocol;
alter table public.course_localizations
  add constraint course_localizations_exam_video_url_protocol
  check (
    exam_video_url is null
    or exam_video_url ~ '^https?://'
    or exam_video_url ~ '^/[^/]'
  );

alter table public.course_localizations
  drop constraint if exists course_localizations_completion_video_url_protocol;
alter table public.course_localizations
  add constraint course_localizations_completion_video_url_protocol
  check (
    completion_video_url is null
    or completion_video_url ~ '^https?://'
    or completion_video_url ~ '^/[^/]'
  );

commit;
