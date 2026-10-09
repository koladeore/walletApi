import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

function key(secret: string, context: string) {
  return Buffer.from(hkdfSync('sha256', secret, 'wallet-security-v1', context, 32));
}
export function secretHash(secret: string, value: string) {
  return createHmac('sha256', key(secret, 'challenge-and-proof')).update(value).digest('hex');
}
export function encryptDelivery(secret: string, value: unknown) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret, 'delivery'), nonce);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${nonce.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${data.toString('hex')}`;
}
export function decryptDelivery(secret: string, value: string): unknown {
  const [nonce, tag, data] = value.split('.');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key(secret, 'delivery'),
    Buffer.from(nonce, 'hex'),
  );
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8'),
  ) as unknown;
}
