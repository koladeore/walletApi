import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

describe('UsersService registration', () => {
  const profile = {
    id: 'user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const input = {
    email: profile.email,
    password: 'registration-test-password',
    firstName: profile.firstName,
    lastName: profile.lastName,
  };
  let service: UsersService;
  const findUnique = jest.fn();
  const createUser = jest.fn<Promise<Record<string, unknown>>, [Prisma.UserCreateArgs]>();
  const createWallet = jest.fn();
  const transaction = jest.fn();
  const sendWelcomeEmail = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    findUnique.mockResolvedValue(null);
    createWallet.mockResolvedValue({});
    sendWelcomeEmail.mockResolvedValue(undefined);
    // Model Prisma's projection against a stored row containing a password hash.
    createUser.mockImplementation((args: Prisma.UserCreateArgs) => {
      const row = { ...profile, password: args.data.password };
      return Promise.resolve(
        Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !args.select || Reflect.get(args.select, key) === true,
          ),
        ),
      );
    });
    const tx = { user: { create: createUser }, wallet: { create: createWallet } };
    transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { user: { findUnique }, $transaction: transaction } },
        { provide: EmailService, useValue: { sendWelcomeEmail } },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('returns only public fields while storing a hashed password and creating a wallet', async () => {
    const result = await service.create(input);
    expect(result).toEqual(profile);
    expect(result).not.toHaveProperty('password');
    expect(JSON.stringify(result)).not.toContain(input.password);
    const args = createUser.mock.calls[0][0];
    expect(createUser).toHaveBeenCalledWith({
      data: { ...input, password: args.data.password },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(args.data.password).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, args.data.password)).toBe(true);
    expect(createWallet).toHaveBeenCalledWith({
      data: { userId: profile.id, currency: 'USD', balance: 0 },
    });
    expect(sendWelcomeEmail).toHaveBeenCalledWith(profile.email, profile.firstName);
  });

  it('rejects an existing email without creating a user or sending an email', async () => {
    findUnique.mockResolvedValue({ ...profile, password: 'existing-hash' });
    await expect(service.create(input)).rejects.toThrow(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
