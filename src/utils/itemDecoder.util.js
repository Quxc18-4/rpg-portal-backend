const crypto = require('crypto');

const decodeCache = new Map();

const decodeItemStackBase64 = (base64String) => {
  if (!base64String) return [];

  const hash = crypto.createHash('md5').update(base64String).digest('hex');
  if (decodeCache.has(hash)) {
    return decodeCache.get(hash);
  }

  const parsedItems = {
    rawLength: base64String.length,
    status: 'PENDING_NBT_PARSER',
    items: [],
  };

  decodeCache.set(hash, parsedItems);
  return parsedItems;
};

module.exports = { decodeItemStackBase64 };
