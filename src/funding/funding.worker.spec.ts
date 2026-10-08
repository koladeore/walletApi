import { ConfigService } from '@nestjs/config';
import { FundingWorker } from './funding.worker';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { ConfirmationService } from './confirmation.service';

describe('Durable pending payment checks', () => {
  const prisma = {
    paystackEvent: { findMany: jest.fn() },
    fundingRequest: { findMany: jest.fn(), updateMany: jest.fn() },
  };
  const webhook = { process: jest.fn() };
  const confirmation = { confirm: jest.fn() };
  const worker = new FundingWorker(
    prisma as unknown as PrismaService,
    new ConfigService(),
    webhook as unknown as WebhookService,
    confirmation as unknown as ConfirmationService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.paystackEvent.findMany.mockResolvedValue([]);
    prisma.fundingRequest.findMany.mockResolvedValue([]);
  });

  it('processes persisted due events and verifies stale pending requests', async () => {
    prisma.paystackEvent.findMany.mockResolvedValue([{ id: 'event1' }]);
    prisma.fundingRequest.findMany.mockResolvedValue([{ id: 'request1', reference: 'fund-test' }]);
    prisma.fundingRequest.updateMany.mockResolvedValue({ count: 1 });
    await worker.tick();
    expect(webhook.process).toHaveBeenCalledWith('event1');
    expect(confirmation.confirm).toHaveBeenCalledWith('fund-test');
    expect(prisma.fundingRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['INITIALIZING', 'INITIALIZATION_UNKNOWN', 'PENDING'] },
        }) as object,
      }),
    );
  });
  it('skips pending requests claimed by another replica', async () => {
    prisma.fundingRequest.findMany.mockResolvedValue([{ id: 'request1', reference: 'fund-test' }]);
    prisma.fundingRequest.updateMany.mockResolvedValue({ count: 0 });
    await worker.tick();
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });
  it('continues with later payments after a verification failure', async () => {
    prisma.fundingRequest.findMany.mockResolvedValue([
      { id: 'request1', reference: 'fund-one' },
      { id: 'request2', reference: 'fund-two' },
    ]);
    prisma.fundingRequest.updateMany.mockResolvedValue({ count: 1 });
    confirmation.confirm.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({});
    await worker.tick();
    expect(confirmation.confirm).toHaveBeenCalledTimes(2);
  });
});
