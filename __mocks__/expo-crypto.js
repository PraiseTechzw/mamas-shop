const { randomUUID } = require('node:crypto');

module.exports = {
  randomUUID: () => randomUUID(),
  getRandomBytesAsync: async (length) => require('node:crypto').randomBytes(length),
  digestStringAsync: async (_algo, value) => require('node:crypto').createHash('sha256').update(value).digest('hex'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
};
