const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { WalletService } = require('../../src/wallet/wallet.service');
const { PaystackService } = require('../../src/paystack/paystack.service');
const { ConfirmationService } = require('../../src/funding/confirmation.service');
const { WebhookService } = require('../../src/funding/webhook.service');
const { FinancialService } = require('../../src/operations/financial.service');
const { ReconciliationService } = require('../../src/operations/reconciliation.service');
const { OperationsController } = require('../../src/operations/operations.controller');

async function main() {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/wallet_ledger_test')) throw new Error('Use a migrated disposable LEDGER_TEST_DATABASE_URL named wallet_ledger_test*');
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));await prisma.$connect();
  try {
    const config=new ConfigService({NODE_ENV:'test',ENABLE_SIMULATED_FUNDING:'true',PAYSTACK_ENABLED:'true',PAYSTACK_SECRET_KEY:'sk_test_example123'});
    const paystack=new PaystackService(config);
    const user=await prisma.user.create({data:{email:`operations-${randomUUID()}@example.com`,password:'test',wallet:{create:{}}},include:{wallet:true}});
    const other=await prisma.user.create({data:{email:`operations-other-${randomUUID()}@example.com`,password:'test',wallet:{create:{}}},include:{wallet:true}});
    const funding=await prisma.fundingRequest.create({data:{reference:`fund-${randomUUID()}`,idempotencyKey:randomUUID(),userId:user.id,walletId:user.wallet.id,expectedEmail:user.email,amountMinor:10000n,currency:'NGN'}});
    const payment={reference:funding.reference,amountMinor:'10000',currency:'NGN',domain:'test',status:'success',email:user.email,transactionId:'9876543',feeMinor:'500'};
    await new ConfirmationService(prisma,{verifyPayment:async()=>payment}).confirm(funding.reference);
    let verified={kind:'REFUND',providerId:'111',transaction:payment,amountMinor:2000n,status:'processed',resolution:null,disputeId:null};
    const provider={fetchCase:async()=>verified};
    const financial=new FinancialService(prisma,provider);
    await Promise.all(Array.from({length:5},()=>financial.fee('FUNDING',funding.reference,'500')));
    assert.equal(await prisma.providerFee.count({where:{reference:funding.reference}}),1);
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,10000n);
    await Promise.all(Array.from({length:5},()=>financial.processCase('REFUND','111')));
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,8000n);
    assert.equal(await prisma.financialCase.count({where:{fundingId:funding.id}}),1);
    const wallets=new WalletService(prisma,{sendTransferReceipt:async()=>{},sendTransferReceivedEmail:async()=>{}},{notifyTransferReceived:async()=>{}},config);
    const priorReservation=await wallets.reserveWithdrawal(user.id,'20',randomUUID());
    await wallets.transferFunds(user.id,other.email,'50',randomUUID());
    verified={...verified,providerId:'112',amountMinor:3000n};
    const shortfall=await financial.processCase('REFUND','112');
    assert.equal(shortfall.recoveredMinor,'1000');assert.equal(shortfall.shortfallMinor,'2000');
    const frozen=await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}});
    assert.equal(frozen.balanceMinor,2000n);assert.equal(frozen.reservedMinor,2000n);assert.equal(frozen.outgoingFrozen,true);
    await wallets.resolveWithdrawal(priorReservation.reference,'CAPTURED');
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,0n);
    assert.ok(await prisma.reconciliationIssue.findUnique({where:{key:`case-shortfall:${shortfall.id}`}}));
    await wallets.fundWallet(user.id,'10',randomUUID());
    await assert.rejects(()=>wallets.transferFunds(user.id,other.email,'1',randomUUID()));
    await assert.rejects(()=>wallets.reserveWithdrawal(user.id,'1',randomUUID()));
    await prisma.$queryRaw`SELECT ledger_assert_wallet(${user.wallet.id})::text`;

    // Chargeback and its linked processed refund share the same accounting identity.
    verified={...verified,kind:'DISPUTE',providerId:'200',amountMinor:1000n,status:'resolved',resolution:'merchant-accepted',disputeId:null};
    await financial.processCase('DISPUTE','200');
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,0n);
    verified={...verified,kind:'REFUND',providerId:'113',status:'processed',disputeId:'200'};
    await financial.processCase('REFUND','113');
    assert.equal(await prisma.financialCase.count({where:{fundingId:funding.id,kind:'DISPUTE',providerId:'200'}}),1);
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,0n);
    // Signed refund events are deduplicated and do not debit the applied case again.
    const raw=Buffer.from(JSON.stringify({event:'refund.processed',data:{id:113,transaction:{reference:funding.reference}}}));
    const signature=createHmac('sha512','sk_test_example123').update(raw).digest('hex');
    const webhook=new WebhookService(prisma,paystack,{},undefined,financial);
    await Promise.all(Array.from({length:3},()=>webhook.receive(raw,signature)));
    const event=await prisma.paystackEvent.findFirstOrThrow({where:{eventType:'refund.processed',reference:funding.reference}});
    await webhook.process(event.id);
    assert.equal((await prisma.paystackEvent.findUniqueOrThrow({where:{id:event.id}})).status,'PROCESSED');
    await financial.fee('FUNDING',funding.reference,'600');
    assert.ok(await prisma.reconciliationIssue.findUnique({where:{key:`fee-changed:FUNDING:${funding.reference}`}}));

    const inventory={...provider,inventory:async resource=>resource==='transaction'?[{domain:'test',reference:funding.reference,status:'success'},{domain:'test',reference:'fund-provider-only',status:'success'}]:[],balance:async()=>999999n};
    const reconciliation=new ReconciliationService(prisma,inventory,{assertEnabled(){},verifyPayment:async()=>payment},{verify:async()=>{throw new Error('unavailable')}},financial);
    // Simulate corruption only in this disposable database; prove reconciliation detects it.
    await prisma.$executeRawUnsafe('ALTER TABLE wallets DISABLE TRIGGER USER');
    await prisma.wallet.update({where:{id:user.wallet.id},data:{balanceMinor:1n}});
    await prisma.$executeRawUnsafe('ALTER TABLE wallets ENABLE TRIGGER USER');
    const result=await reconciliation.run();
    assert.ok(await prisma.reconciliationIssue.findUnique({where:{key:`wallet:${user.wallet.id}`}}));
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,1n);
    await prisma.$executeRawUnsafe('ALTER TABLE wallets DISABLE TRIGGER USER');
    await prisma.wallet.update({where:{id:user.wallet.id},data:{balanceMinor:0n}});
    await prisma.$executeRawUnsafe('ALTER TABLE wallets ENABLE TRIGGER USER');
    assert.equal(result.status,'DIFFERENCES');
    assert.ok(await prisma.reconciliationIssue.findUnique({where:{key:'provider-funding:fund-provider-only'}}));
    assert.ok(await prisma.reconciliationIssue.findUnique({where:{key:'provider-balance:NGN'}}));
    const unavailable={...inventory,inventory:async()=>{throw new Error('offline')}};
    const incomplete=await new ReconciliationService(prisma,unavailable,{assertEnabled(){}},{},financial).run();
    assert.equal(incomplete.status,'INCOMPLETE');
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).balanceMinor,0n);
    await prisma.$queryRaw`SELECT ledger_assert_wallet(${user.wallet.id})::text`;
    const admin=await prisma.user.create({data:{email:`operations-admin-${randomUUID()}@example.com`,password:'test',role:'ADMIN'}});
    const controller=new OperationsController(prisma,reconciliation);
    const note={reason:'Reviewed provider evidence in disposable integration test'};
    await assert.rejects(()=>controller.unfreeze({user:{id:user.id}},user.wallet.id,note));
    await assert.rejects(()=>controller.unfreeze({user:{id:admin.id}},user.wallet.id,note));
    const issues=await prisma.reconciliationIssue.findMany({where:{status:'OPEN',OR:[{reference:funding.reference},{details:{path:['walletId'],equals:user.wallet.id}}]}});
    for(const issue of issues)await controller.resolve({user:{id:admin.id}},issue.id,note);
    await controller.unfreeze({user:{id:admin.id}},user.wallet.id,note);
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:user.wallet.id}})).outgoingFrozen,false);
    await financial.fee('FUNDING',funding.reference,'600');
    assert.equal((await prisma.reconciliationIssue.findUniqueOrThrow({where:{key:`fee-changed:FUNDING:${funding.reference}`}})).status,'RESOLVED');
    assert.equal(await prisma.auditLog.count({where:{userId:admin.id,action:'WALLET_OUTGOING_UNFROZEN'}}),1);
    console.log('Financial operations database checks passed: business fees once, partial refunds, concurrency, shortfall posting/freezes, chargeback/refund deduplication, signed events, fee-change alerts, unmatched provider records, clearing discrepancies, and incomplete-run detection.');
  } finally {await prisma.$disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
