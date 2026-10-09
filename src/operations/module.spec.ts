import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { FundingModule } from '../funding/funding.module';
import { WebhookService } from '../funding/webhook.service';
import { PayoutsService } from '../payouts/payouts.service';
import { FinancialService } from './financial.service';
import { ReconciliationService } from './reconciliation.service';

it('wires financial processing and reconciliation into the funding/payout module tree', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PrismaModule,
      FundingModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  try {
    expect(module.get(WebhookService)).toBeDefined();
    expect(module.get(PayoutsService)).toBeDefined();
    expect(module.get(FinancialService)).toBeDefined();
    expect(module.get(ReconciliationService)).toBeDefined();
  } finally {
    await module.close();
  }
});
