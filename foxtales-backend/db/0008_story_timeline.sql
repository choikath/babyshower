-- 0008: branded-mix timeline map — powers the player's "Skip to the story".
-- Shape mirrors the club backend's stories.timeline:
--   {"version":1,"greetStart":8,"bookStart":67,"bookEnd":270.68,"total":270.68}
-- bookStart (seconds) is where the first page's text begins; the skip button
-- lands 5s before it. Rows without a timeline simply don't show the button.
alter table stories
  add column if not exists timeline jsonb;
