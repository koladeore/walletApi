"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secretHash = secretHash;
exports.encryptDelivery = encryptDelivery;
exports.decryptDelivery = decryptDelivery;
const node_crypto_1 = require("node:crypto");
function key(secret, context) {
    return Buffer.from((0, node_crypto_1.hkdfSync)('sha256', secret, 'wallet-security-v1', context, 32));
}
function secretHash(secret, value) {
    return (0, node_crypto_1.createHmac)('sha256', key(secret, 'challenge-and-proof')).update(value).digest('hex');
}
function encryptDelivery(secret, value) {
    const nonce = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key(secret, 'delivery'), nonce);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${nonce.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${data.toString('hex')}`;
}
function decryptDelivery(secret, value) {
    const [nonce, tag, data] = value.split('.');
    const cipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key(secret, 'delivery'), Buffer.from(nonce, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8'));
}
//# sourceMappingURL=crypto.js.map