-- Additive indexes; run during a maintenance window on populated databases.
CREATE INDEX idx_users_date_id ON users("createdAt",id);
CREATE INDEX idx_transactions_sender_date_id ON transactions("senderWalletId","createdAt",id);
CREATE INDEX idx_transactions_receiver_date_id ON transactions("receiverWalletId","createdAt",id);
CREATE INDEX idx_beneficiaries_user_date_id ON beneficiaries("userId","createdAt",id);
CREATE INDEX idx_payouts_user_date_id ON payouts("userId","createdAt",id);
CREATE INDEX idx_reconciliation_runs_date_id ON reconciliation_runs("startedAt",id);
CREATE INDEX idx_reconciliation_issues_status_date_id ON reconciliation_issues(status,"firstSeenAt",id);
CREATE INDEX idx_financial_cases_date_id ON financial_cases("createdAt",id);
CREATE INDEX idx_provider_fees_date_id ON provider_fees("createdAt",id);
CREATE INDEX idx_activity_flags_status_date_id ON activity_flags(status,"createdAt",id);
CREATE INDEX idx_notifications_user_date_id ON notifications("userId","createdAt",id);
CREATE INDEX idx_notifications_user_read_date_id ON notifications("userId","readAt","createdAt",id);
CREATE INDEX idx_sessions_user_active_date_id ON auth_sessions("userId","revokedAt","createdAt",id);
