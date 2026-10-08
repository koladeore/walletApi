import { createHmac, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { PaystackService } from '../paystack/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmationService } from './confirmation.service';
import { WebhookService } from './webhook.service';

describe('Authenticated webhook inbox', () => {
  const key = 'sk_test_example123';
  const paystack = new PaystackService(
    new ConfigService({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: key }),
  );
  const prisma = {
    paystackEvent: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const confirmation = { confirm: jest.fn() };
  const service = new WebhookService(
    prisma as unknown as PrismaService,
    paystack,
    confirmation as unknown as ConfirmationService,
  );
  const raw = Buffer.from(
    JSON.stringify({
      event: 'charge.success',
      data: {
        id: 123,
        reference: 'fund-test',
        amount: 10050,
        currency: 'NGN',
        domain: 'test',
        status: 'success',
        customer: { email: 'owner@example.com' },
        authorization: { authorization_code: 'private-card-token' },
      },
    }),
  );
  const sign = (body: Buffer) => createHmac('sha512', key).update(body).digest('hex');
  beforeEach(() => jest.resetAllMocks());

  it.each([undefined, '', 'bad', '0'.repeat(128)])(
    'rejects invalid signature before persistence (%s)',
    async (signature) => {
      await expect(service.receive(raw, signature)).rejects.toThrow('Invalid Paystack signature');
      expect(prisma.paystackEvent.createMany).not.toHaveBeenCalled();
    },
  );
  it('authenticates the exact bytes, not parsed or reserialized JSON', async () => {
    await expect(
      service.receive(Buffer.concat([raw, Buffer.from(' ')]), sign(raw)),
    ).rejects.toThrow('Invalid Paystack signature');
  });
  it('persists deduplicated events and omits card authorizations', async () => {
    await service.receive(raw, sign(raw));
    await service.receive(raw, sign(raw));
    const call = prisma.paystackEvent.createMany.mock.calls[0] as unknown as [
      { skipDuplicates: boolean; data: [{ id: string; payment: object }] },
    ];
    expect(call[0].data[0].id).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(call[0].skipDuplicates).toBe(true);
    expect(JSON.stringify(call[0].data[0].payment)).not.toContain('private-card-token');
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });
  it('records unrelated events as ignored without crediting', async () => {
    const other = Buffer.from(JSON.stringify({ event: 'transfer.success', data: {} }));
    await service.receive(other, sign(other));
    expect(prisma.paystackEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ status: 'IGNORED' }) as object,
        ]) as object,
      }),
    );
  });
  it('does not process an event leased or completed by another worker', async () => {
    prisma.paystackEvent.updateMany.mockResolvedValue({ count: 0 });
    await service.process('event');
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });
  it('marks an event processed after confirmation', async () => {
    prisma.paystackEvent.updateMany.mockResolvedValue({ count: 1 });
    prisma.paystackEvent.findUniqueOrThrow.mockResolvedValue({
      id: 'event',
      reference: 'fund-test',
      payment: {},
      attempts: 1,
    });
    confirmation.confirm.mockResolvedValue({ status: 'SUCCESS' });
    await service.process('event');
    expect(prisma.paystackEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSED', lockedUntil: null }) as object,
      }),
    );
  });
  it.each([new Error('network unavailable'), new ConflictException('wrong amount')])(
    'persists sanitized processing failures for retry or review',
    async (error) => {
      prisma.paystackEvent.updateMany.mockResolvedValue({ count: 1 });
      prisma.paystackEvent.findUniqueOrThrow.mockResolvedValue({
        id: 'event',
        reference: 'fund-test',
        payment: {},
        attempts: 1,
      });
      confirmation.confirm.mockRejectedValue(error);
      await service.process('event');
      expect(prisma.paystackEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: error instanceof ConflictException ? 'REJECTED' : 'RECEIVED',
            lockedUntil: null,
          }) as object,
        }),
      );
    },
  );
});
