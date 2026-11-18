const net = require('net');

let cachedStatus = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 20 * 1000; // Cache 20 giây

function encodeVarInt(value) {
  const bytes = [];
  let val = value >>> 0;
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val);
      break;
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  let read;
  do {
    if (offset + numRead >= buffer.length) return null;
    read = buffer[offset + numRead];
    result |= (read & 0x7f) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt too big');
  } while ((read & 0x80) !== 0);

  return { value: result, bytesRead: numRead };
}

function stripMotdColors(description) {
  if (!description) return '';
  if (typeof description === 'string') {
    return description.replace(/§[0-9a-fk-or]/gi, '').trim();
  }
  let text = description.text || '';
  if (Array.isArray(description.extra)) {
    text += description.extra.map((part) => stripMotdColors(part)).join('');
  }
  return text.replace(/§[0-9a-fk-or]/gi, '').trim();
}

function pingServerRaw(host, port, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);

    const chunks = [];

    socket.on('connect', () => {
      const hostBuf = Buffer.from(host, 'utf8');
      const handshakeData = Buffer.concat([
        encodeVarInt(0x00), // Packet ID: Handshake
        encodeVarInt(767), // Protocol version (1.21)
        encodeVarInt(hostBuf.length),
        hostBuf,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        encodeVarInt(0x01), // Next state: Status
      ]);

      const handshakePacket = Buffer.concat([encodeVarInt(handshakeData.length), handshakeData]);
      const statusRequestPacket = Buffer.from([0x01, 0x00]);

      socket.write(Buffer.concat([handshakePacket, statusRequestPacket]));
    });

    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const fullBuf = Buffer.concat(chunks);

      try {
        const packetLen = readVarInt(fullBuf, 0);
        if (!packetLen || fullBuf.length < packetLen.bytesRead + packetLen.value) return;

        let offset = packetLen.bytesRead;
        const packetId = readVarInt(fullBuf, offset);
        if (!packetId || packetId.value !== 0x00) return;
        offset += packetId.bytesRead;

        const strLen = readVarInt(fullBuf, offset);
        if (!strLen || fullBuf.length < offset + strLen.bytesRead + strLen.value) return;
        offset += strLen.bytesRead;

        const jsonStr = fullBuf.slice(offset, offset + strLen.value).toString('utf8');
        const parsed = JSON.parse(jsonStr);
        const latencyMs = Date.now() - startTime;

        socket.destroy();
        resolve({
          online: true,
          host,
          port,
          version: parsed.version?.name || 'Paper 1.21',
          motd: stripMotdColors(parsed.description),
          players: {
            online: parsed.players?.online ?? 0,
            max: parsed.players?.max ?? 0,
            sample: (parsed.players?.sample || []).map((p) => ({
              uuid: p.id,
              username: p.name,
            })),
          },
          latencyMs,
        });
      } catch (_) {
        // Chờ nhận đủ chunk tiếp theo
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('PING_TIMEOUT'));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

async function getMinecraftServerStatus(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedStatus && now < cacheExpiresAt) {
    return { ...cachedStatus, cached: true };
  }

  const host = process.env.MC_SERVER_HOST || '127.0.0.1';
  const port = Number(process.env.MC_SERVER_PORT || 25565);

  try {
    const status = await pingServerRaw(host, port, 1500);
    cachedStatus = { ...status, checkedAt: new Date(now).toISOString() };
  } catch (_) {
    cachedStatus = {
      online: false,
      host,
      port,
      version: null,
      motd: null,
      players: { online: 0, max: 0, sample: [] },
      latencyMs: null,
      checkedAt: new Date(now).toISOString(),
    };
  }

  cacheExpiresAt = now + CACHE_TTL_MS;
  return { ...cachedStatus, cached: false };
}

module.exports = { getMinecraftServerStatus };