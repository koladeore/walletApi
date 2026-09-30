CREATE TABLE wallet_requests (
  key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  response JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER wallet_requests_immutable BEFORE UPDATE OR DELETE ON wallet_requests
 FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER wallet_requests_no_truncate BEFORE TRUNCATE ON wallet_requests
 FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
