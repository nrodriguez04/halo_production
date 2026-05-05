-- Backfill lead statuses to match the new state machine declared in
-- @halo/shared. Pre-migration values that are no longer valid:
--
--   'rejected'      -> 'disqualified'   (semantic rename)
--   'underwriting'  -> 'enriched'       (the "underwriting" stage was
--                                         folded into deals; on a lead
--                                         this means enrichment is done
--                                         but no deal exists yet)
--
-- Any other unknown legacy status is left as-is so the application-side
-- validator (`transitionLeadStatus`) can decide what to do with it on
-- the next transition.

UPDATE "leads" SET "status" = 'disqualified' WHERE "status" = 'rejected';
UPDATE "leads" SET "status" = 'enriched'     WHERE "status" = 'underwriting';
