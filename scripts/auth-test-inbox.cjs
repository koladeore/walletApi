require('reflect-metadata');
const fs = require('node:fs');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { decryptDelivery } = require('../dist/src/security/crypto');
const { validateEnvironment } = require('../dist/src/config/environment');
const env = { ...require('dotenv').parse(fs.readFileSync('.env')), ...process.env };
(async () => {
  if (!['development', 'test'].includes(env.NODE_ENV) || env.AUTH_DELIVERY_MODE !== 'test')
    throw new Error('Test inbox requires explicit non-production test delivery');
  const recipient = process.argv[2];
  if (!recipient) throw new Error('Provide the recipient email');
  const validated = validateEnvironment(env);
  const prisma = new PrismaService(new ConfigService(validated));
  await prisma.$connect();
  try {
    const rows = await prisma.securityDelivery.findMany({
      where: { recipient, status: 'TEST', expiresAt: { gt: new Date() }, payload: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const secret = validated.AUTH_SECURITY_SECRET;
    for (const row of rows) {
      const challenge = await prisma.securityChallenge.findUnique({ where: { id: row.id } });
      if (challenge && !challenge.consumedAt)
        console.log(JSON.stringify(decryptDelivery(secret, row.payload), null, 2));
    }
    if (!rows.length) console.log('No active test messages for this recipient.');
  } finally {
    await prisma.$disconnect();
  }
})().catch(() => {
  console.error('Test inbox unavailable. Check test mode, recipient, configuration, and database.');
  process.exitCode = 1;
});
