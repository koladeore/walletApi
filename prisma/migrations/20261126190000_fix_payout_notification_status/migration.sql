-- PostgreSQL lower() accepts text, not the PayoutStatus enum.
CREATE OR REPLACE FUNCTION notify_money_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT; info JSONB;
BEGIN
 IF TG_TABLE_NAME='transactions' THEN
  IF NEW.type='TRANSFER' AND NEW.status='SUCCESS' AND NEW."reversalOfId" IS NULL THEN
   info=jsonb_build_object('transactionId',NEW.id,'amountMinor',NEW."amountMinor"::text,'currency',NEW.currency);
   SELECT "userId" INTO target FROM wallets WHERE id=NEW."senderWalletId";
   INSERT INTO notifications("userId","eventKey",kind,title,body,data) VALUES(target,'transfer:'||NEW.id||':sent','TRANSFER_SENT','Transfer sent','Your wallet transfer completed.',info) ON CONFLICT("eventKey") DO NOTHING;
   SELECT "userId" INTO target FROM wallets WHERE id=NEW."receiverWalletId";
   INSERT INTO notifications("userId","eventKey",kind,title,body,data) VALUES(target,'transfer:'||NEW.id||':received','TRANSFER_RECEIVED','Transfer received','You received a wallet transfer.',info) ON CONFLICT("eventKey") DO NOTHING;
  END IF;
 ELSIF TG_TABLE_NAME='funding_requests' THEN
  IF NEW.status='SUCCESS' AND OLD.status IS DISTINCT FROM NEW.status THEN
   INSERT INTO notifications("userId","eventKey",kind,title,body,data) VALUES(NEW."userId",'funding:'||NEW.id||':success','FUNDING_SUCCESS','Funding confirmed','Your payment was confirmed and your wallet credited.',jsonb_build_object('reference',NEW.reference,'amountMinor',NEW."amountMinor"::text,'currency',NEW.currency)) ON CONFLICT("eventKey") DO NOTHING;
  END IF;
 ELSIF TG_TABLE_NAME='payouts' THEN
  IF NEW.status IN ('SUCCESS','FAILED','REVERSED') AND OLD.status IS DISTINCT FROM NEW.status THEN
   INSERT INTO notifications("userId","eventKey",kind,title,body,data) VALUES(NEW."userId",'payout:'||NEW.id||':'||NEW.status,'PAYOUT_'||NEW.status,'Payout '||lower(NEW.status::text),'Your payout status changed. Check your payout details.',jsonb_build_object('reference',NEW.reference,'status',NEW.status,'amountMinor',NEW."amountMinor"::text,'currency',NEW.currency)) ON CONFLICT("eventKey") DO NOTHING;
  END IF;
 ELSIF TG_TABLE_NAME='wallets' THEN
  IF OLD."outgoingFrozen" IS DISTINCT FROM NEW."outgoingFrozen" THEN
   INSERT INTO notifications("userId","eventKey",kind,title,body,data) VALUES(NEW."userId",'freeze:'||gen_random_uuid()::text,CASE WHEN NEW."outgoingFrozen" THEN 'WALLET_FROZEN' ELSE 'WALLET_UNFROZEN' END,CASE WHEN NEW."outgoingFrozen" THEN 'Outgoing money frozen' ELSE 'Outgoing money unfrozen' END,'Your outgoing wallet access changed. Contact support if you need help.',jsonb_build_object('walletId',NEW.id,'outgoingFrozen',NEW."outgoingFrozen"));
  END IF;
 END IF;
 RETURN NEW;
END $$;
