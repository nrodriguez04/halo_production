-- Contract metadata: documents sent, recipient roles, subject, signed copy reference
ALTER TABLE "contracts" ADD COLUMN "metadata" JSONB;
