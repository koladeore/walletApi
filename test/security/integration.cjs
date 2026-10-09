const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const bcrypt=require('bcrypt');
const {ConfigService}=require('@nestjs/config');
const {PrismaService}=require('../../src/prisma/prisma.service');
const {SecurityService}=require('../../src/security/security.service');
const {SecurityDeliveryService}=require('../../src/security/delivery.service');
const {decryptDelivery,secretHash}=require('../../src/security/crypto');
const {describeAction}=require('../../src/security/actions');
const {JwtStrategy}=require('../../src/auth/strategies/jwt.strategy');
const {PayoutsService}=require('../../src/payouts/payouts.service');

async function main(){
  const url=process.env.LEDGER_TEST_DATABASE_URL;if(!url||!new URL(url).pathname.startsWith('/wallet_ledger_test'))throw new Error('Use a migrated disposable LEDGER_TEST_DATABASE_URL named wallet_ledger_test*');
  const secret='test-security-5db628f347ce903e7a911483b253dec2';
  const config=new ConfigService({DATABASE_URL:url,NODE_ENV:'test',AUTH_DELIVERY_MODE:'test',AUTH_SECURITY_SECRET:secret,JWT_SECRET:'test-signing-secret'});
  const prisma=new PrismaService(config);await prisma.$connect();
  try{
    const password='initial-password-123';const user=await prisma.user.create({data:{email:`security-${randomUUID()}@example.com`,password:await bcrypt.hash(password,4),wallet:{create:{}}},include:{wallet:true}});
    const other=await prisma.user.create({data:{email:`security-other-${randomUUID()}@example.com`,password:await bcrypt.hash(password,4),wallet:{create:{}}}});
    const delivery=new SecurityDeliveryService(config,prisma);const security=new SecurityService(prisma,config,delivery);
    const codeFor=async id=>{const row=await prisma.securityDelivery.findUniqueOrThrow({where:{id}});assert.ok(!row.payload.includes('Code:'));return decryptDelivery(secret,row.payload).code;};
    const email=await security.requestEmail(user.id);const emailCode=await codeFor(email.challengeId);
    await assert.rejects(()=>security.confirmEmail(other.id,email.challengeId,emailCode));
    const attempts=await Promise.allSettled(Array.from({length:3},()=>security.confirmEmail(user.id,email.challengeId,emailCode)));
    assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
    assert.equal((await security.status(user.id)).emailVerified,true);
    await assert.rejects(()=>security.confirmEmail(user.id,email.challengeId,emailCode));
    assert.equal((await prisma.securityDelivery.findUniqueOrThrow({where:{id:email.challengeId}})).payload,null);
    await assert.rejects(()=>prisma.securityChallenge.update({where:{id:email.challengeId},data:{consumedAt:null}}));
    await assert.rejects(()=>security.requestEmail(user.id));
    await assert.rejects(()=>security.requestStepUp(user.id,'wrong-password','PAYOUT',{beneficiaryId:randomUUID(),amount:'100'}));

    const expiredId=randomUUID();
    await prisma.securityChallenge.create({data:{id:expiredId,userId:user.id,purpose:'EMAIL',target:user.email,codeHash:secretHash(secret,`code:${expiredId}:123456`),authVersion:0,expiresAt:new Date(Date.now()-1000)}});
    await assert.rejects(()=>security.confirmEmail(user.id,expiredId,'123456'));
    assert.equal((await prisma.securityChallenge.findUniqueOrThrow({where:{id:expiredId}})).consumedAt,null);
    const beneficiaryId=randomUUID();const details={beneficiaryId,amount:'100.00'};
    const expiredToken='a'.repeat(64);
    await prisma.stepUpProof.create({data:{userId:user.id,tokenHash:secretHash(secret,`proof:${expiredToken}`),action:'PAYOUT',binding:describeAction('PAYOUT',details).binding,authVersion:0,expiresAt:new Date(Date.now()-1000)}});
    await assert.rejects(()=>security.authorize(user.id,expiredToken,'PAYOUT',details));
    const step=await security.requestStepUp(user.id,password,'PAYOUT',details);const stepCode=await codeFor(step.challengeId);
    const grant=await security.confirmStepUp(user.id,step.challengeId,stepCode);
    await assert.rejects(()=>security.authorize(user.id,grant.stepUpToken,'PAYOUT',{...details,amount:'101'}));
    await assert.rejects(()=>security.authorize(other.id,grant.stepUpToken,'PAYOUT',details));
    await assert.rejects(()=>security.authorize(user.id,grant.stepUpToken,'BENEFICIARY',{bankCode:'058',accountNumber:'0001234567'}));
    const uses=await Promise.allSettled(Array.from({length:3},()=>security.authorize(user.id,grant.stepUpToken,'PAYOUT',details)));
    assert.equal(uses.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(uses.find(item=>item.status==='fulfilled').value,0);
    // A consumed action proof cannot regain validity by altering its consumedAt flag.
    const proof=await prisma.stepUpProof.findFirstOrThrow({where:{userId:user.id,consumedAt:{not:null}}});
    await assert.rejects(()=>prisma.stepUpProof.update({where:{id:proof.id},data:{consumedAt:null}}));

    // Five incorrect attempts persist even though the API reports failure.
    const wrong=await security.requestEmail(other.id);const correct=await codeFor(wrong.challengeId);const bad=correct==='000000'?'000001':'000000';
    for(let i=0;i<5;i++)await assert.rejects(()=>security.confirmEmail(other.id,wrong.challengeId,bad));
    assert.equal((await prisma.securityChallenge.findUniqueOrThrow({where:{id:wrong.challengeId}})).attempts,5);
    await assert.rejects(()=>security.confirmEmail(other.id,wrong.challengeId,correct));

    const known=await security.requestReset(user.email);const unknown=await security.requestReset(`missing-${randomUUID()}@example.com`);assert.deepEqual(known,unknown);
    const reset=await prisma.securityChallenge.findFirstOrThrow({where:{userId:user.id,purpose:'RESET'},orderBy:{createdAt:'desc'}});const resetCode=await codeFor(reset.id);
    await prisma.authToken.create({data:{userId:user.id,token:'test-refresh-hash',expiresAt:new Date(Date.now()+600000)}});
    const strategy=new JwtStrategy(config,{findById:id=>prisma.user.findUnique({where:{id}})});
    await strategy.validate({sub:user.id,email:user.email,authVersion:0});
    const resets=await Promise.allSettled(Array.from({length:2},()=>security.resetPassword(reset.id,resetCode,'new-password-456789')));
    assert.equal(resets.filter(item=>item.status==='fulfilled').length,1);
    const changed=await prisma.user.findUniqueOrThrow({where:{id:user.id}});
    assert.equal(changed.authVersion,1);assert.ok(await bcrypt.compare('new-password-456789',changed.password));
    assert.equal(await prisma.authToken.count({where:{userId:user.id,isRevoked:false}}),0);
    await assert.rejects(()=>strategy.validate({sub:user.id,email:user.email,authVersion:0}));
    await assert.rejects(()=>security.resetPassword(reset.id,resetCode,'third-password-456789'));
    await assert.rejects(()=>security.authorize(user.id,grant.stepUpToken,'PAYOUT',details));
    const beneficiary=await prisma.beneficiary.create({data:{userId:user.id,accountNumber:'0001234567',bankCode:'058',accountName:'TEST',verifiedAt:new Date()}});
    const payout=new PayoutsService(prisma,{assertEnabled(){}},{});
    await assert.rejects(()=>payout.create(user.id,beneficiary.id,'1',randomUUID(),0));
    assert.equal(await prisma.payout.count({where:{userId:user.id}}),0);

    assert.ok(await prisma.auditLog.count({where:{userId:user.id,action:'SECURITY_RESET_CONFIRMED'}}));
    console.log('Security database checks passed: encrypted delivery, purpose/user binding, concurrent single use, code lockout, cooldowns, action binding, immutable proof consumption, generic recovery, password reset/session revocation, stale-authorization payout rejection, and audit records.');
  }finally{await prisma.$disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
