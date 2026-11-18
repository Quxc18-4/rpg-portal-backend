const crypto = require('crypto');

const decodeCache = new Map();
const MAX_STREAM_OPS = 50000; // Chặn cứng tối đa 50k thao tác (~2-3ms), không bao giờ treo Event Loop

const TC_NULL = 0x70;
const TC_REFERENCE = 0x71;
const TC_CLASSDESC = 0x72;
const TC_OBJECT = 0x73;
const TC_STRING = 0x74;
const TC_ARRAY = 0x75;
const TC_CLASS = 0x76;
const TC_BLOCKDATA = 0x77;
const TC_ENDBLOCKDATA = 0x78;
const TC_RESET = 0x79;
const TC_BLOCKDATALONG = 0x7a;
const TC_EXCEPTION = 0x7b;
const TC_LONGSTRING = 0x7c;
const TC_PROXYCLASSDESC = 0x7d;
const TC_ENUM = 0x7e;

class JavaStreamReader {
  constructor(buffer) {
    this.buf = buffer;
    this.offset = 0;
    this.handles = [];
    this.ops = 0;

    this.assertAvailable(4);
    const magic = this.readUInt16();
    const version = this.readUInt16();
    if (magic !== 0xaced || version !== 0x0005) {
      throw new Error('Invalid Java Serialization header');
    }
  }

  tickOp() {
    if (++this.ops > MAX_STREAM_OPS) {
      throw new Error('Stream operation limit exceeded');
    }
  }

  assertAvailable(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0 || this.offset + bytes > this.buf.length) {
      throw new Error(`Out of bounds: need ${bytes} bytes at ${this.offset}/${this.buf.length}`);
    }
  }

  registerHandle(obj) {
    const idx = this.handles.length;
    this.handles.push(obj);
    return idx;
  }

  readByte() {
    this.assertAvailable(1);
    return this.buf.readInt8(this.offset++);
  }

  readUByte() {
    this.assertAvailable(1);
    return this.buf.readUInt8(this.offset++);
  }

  readBoolean() {
    return this.readUByte() !== 0;
  }

  readInt16() {
    this.assertAvailable(2);
    const v = this.buf.readInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  readUInt16() {
    this.assertAvailable(2);
    const v = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  readInt32() {
    this.assertAvailable(4);
    const v = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readInt64() {
    this.assertAvailable(8);
    const v = this.buf.readBigInt64BE(this.offset);
    this.offset += 8;
    return Number(v);
  }

  readFloat() {
    this.assertAvailable(4);
    const v = this.buf.readFloatBE(this.offset);
    this.offset += 4;
    return v;
  }

  readDouble() {
    this.assertAvailable(8);
    const v = this.buf.readDoubleBE(this.offset);
    this.offset += 8;
    return v;
  }

  readUTF() {
    const len = this.readUInt16();
    this.assertAvailable(len);
    const str = this.buf.toString('utf8', this.offset, this.offset + len);
    this.offset += len;
    return str;
  }

  readLongUTF() {
    this.assertAvailable(8);
    const len = Number(this.buf.readBigUInt64BE(this.offset));
    this.offset += 8;
    this.assertAvailable(len);
    const str = this.buf.toString('utf8', this.offset, this.offset + len);
    this.offset += len;
    return str;
  }

  readAll() {
    const results = [];
    while (this.offset < this.buf.length) {
      const val = this.readContent();
      if (Array.isArray(val) && val.__isBlockData) {
        continue;
      }
      results.push(val);
    }
    return results;
  }

  readContent() {
    this.tickOp();
    const tc = this.readUByte();
    switch (tc) {
      case TC_NULL:
        return null;

      case TC_REFERENCE: {
        const handle = this.readInt32() - 0x7e0000;
        if (handle < 0 || handle >= this.handles.length) {
          throw new Error(`Invalid handle reference: ${handle}`);
        }
        return this.handles[handle];
      }

      case TC_STRING: {
        const str = this.readUTF();
        this.registerHandle(str);
        return str;
      }

      case TC_LONGSTRING: {
        const str = this.readLongUTF();
        this.registerHandle(str);
        return str;
      }

      case TC_CLASSDESC:
        return this.readClassDesc();

      case TC_OBJECT:
        return this.readObject();

      case TC_ARRAY:
        return this.readArray();

      case TC_CLASS: {
        const desc = this.readClassDescOrRef();
        this.registerHandle(desc);
        return desc;
      }

      case TC_ENUM: {
        this.readClassDescOrRef();
        const idx = this.registerHandle(null);
        const name = this.readContent();
        this.handles[idx] = name;
        return name;
      }

      case TC_BLOCKDATA: {
        const len = this.readUByte();
        this.assertAvailable(len);
        const slice = this.buf.subarray(this.offset, this.offset + len);
        this.offset += len;
        const arr = [slice];
        arr.__isBlockData = true;
        return arr;
      }

      case TC_BLOCKDATALONG: {
        const len = this.readInt32();
        this.assertAvailable(len);
        const slice = this.buf.subarray(this.offset, this.offset + len);
        this.offset += len;
        const arr = [slice];
        arr.__isBlockData = true;
        return arr;
      }

      case TC_RESET:
        this.handles = [];
        return null;

      default:
        throw new Error(`Unsupported TC: 0x${tc.toString(16)} at ${this.offset}`);
    }
  }

  readClassDescOrRef() {
    this.tickOp();
    const tc = this.readUByte();
    if (tc === TC_NULL) return null;
    if (tc === TC_REFERENCE) {
      const handle = this.readInt32() - 0x7e0000;
      return this.handles[handle];
    }
    if (tc === TC_CLASSDESC) {
      return this.readClassDesc();
    }
    if (tc === TC_PROXYCLASSDESC) {
      const desc = { name: 'Proxy', fields: [], flags: 0, superClass: null };
      this.registerHandle(desc);
      const count = this.readInt32();
      this.assertAvailable(count * 2);
      for (let i = 0; i < count; i++) this.readUTF();
      this.skipAnnotations();
      desc.superClass = this.readClassDescOrRef();
      return desc;
    }
    throw new Error(`Unexpected classDesc opcode: 0x${tc.toString(16)}`);
  }

  readClassDesc() {
    const name = this.readUTF();
    this.assertAvailable(11);
    this.offset += 8; // serialVersionUID
    const flags = this.readUByte();
    const fieldCount = this.readUInt16();
    this.assertAvailable(fieldCount * 3);

    const desc = { name, flags, fields: [], superClass: null };
    this.registerHandle(desc);

    for (let i = 0; i < fieldCount; i++) {
      const typeCode = String.fromCharCode(this.readUByte());
      const fieldName = this.readUTF();
      let className = null;
      if (typeCode === 'L' || typeCode === '[') {
        className = this.readContent();
      }
      desc.fields.push({ typeCode, fieldName, className });
    }

    this.skipAnnotations();
    desc.superClass = this.readClassDescOrRef();
    return desc;
  }

  skipAnnotations() {
    while (true) {
      this.tickOp();
      const tc = this.readUByte();
      if (tc === TC_ENDBLOCKDATA) break;
      this.offset--;
      this.readContent();
    }
  }

  readFieldValue(typeCode) {
    switch (typeCode) {
      case 'B':
        return this.readByte();
      case 'C':
        return String.fromCharCode(this.readUInt16());
      case 'D':
        return this.readDouble();
      case 'F':
        return this.readFloat();
      case 'I':
        return this.readInt32();
      case 'J':
        return this.readInt64();
      case 'S':
        return this.readInt16();
      case 'Z':
        return this.readBoolean();
      case 'L':
      case '[':
        return this.readContent();
      default:
        throw new Error(`Unknown field typeCode: ${typeCode}`);
    }
  }

  readObject() {
    const classDesc = this.readClassDescOrRef();
    if (!classDesc) throw new Error('Null classDesc in readObject');

    const instance = { __class: classDesc.name };
    const handleIdx = this.registerHandle(instance);

    const hierarchy = [];
    let curr = classDesc;
    while (curr) {
      hierarchy.unshift(curr);
      curr = curr.superClass;
    }

    for (const cls of hierarchy) {
      for (const f of cls.fields) {
        instance[f.fieldName] = this.readFieldValue(f.typeCode);
      }

      // SC_EXTERNALIZABLE (0x04) với SC_BLOCK_DATA (0x08)
      if ((cls.flags & 0x04) !== 0 && (cls.flags & 0x08) !== 0) {
        this.skipAnnotations();
      }

      // SC_WRITE_METHOD (0x01)
      if ((cls.flags & 0x01) !== 0) {
        if (cls.name === 'java.util.HashMap' || cls.name === 'java.util.LinkedHashMap') {
          const mapObj = {};
          const block = this.readContent();
          if (!Array.isArray(block) || !block.__isBlockData || block[0].length < 8) {
            throw new Error('Invalid HashMap blockdata');
          }
          const size = block[0].readInt32BE(4);
          this.assertAvailable(size * 2);
          for (let i = 0; i < size; i++) {
            const k = this.readContent();
            const v = this.readContent();
            mapObj[String(k)] = v;
          }
          this.skipAnnotations();
          Object.assign(instance, mapObj);
        } else if (cls.name === 'java.util.HashSet' || cls.name === 'java.util.LinkedHashSet') {
          const list = [];
          const block = this.readContent();
          if (!Array.isArray(block) || !block.__isBlockData || block[0].length < 12) {
            throw new Error('Invalid HashSet blockdata');
          }
          const size = block[0].readInt32BE(8);
          this.assertAvailable(size);
          for (let i = 0; i < size; i++) {
            list.push(this.readContent());
          }
          this.skipAnnotations();
          instance.__list = list;
        } else if (cls.name === 'java.util.ArrayList') {
          this.assertAvailable(instance.size);
          const list = [];
          this.readContent(); // capacity blockdata
          for (let i = 0; i < instance.size; i++) {
            list.push(this.readContent());
          }
          this.skipAnnotations();
          instance.__list = list;
        } else {
          this.skipAnnotations();
        }
      }
    }

    let unwrapped = instance;
    if (classDesc.name === 'org.bukkit.util.io.Wrapper' && instance.map) {
      unwrapped = instance.map;
    } else if (
      classDesc.name === 'com.google.common.collect.ImmutableMap$SerializedForm' &&
      Array.isArray(instance.keys)
    ) {
      const obj = {};
      instance.keys.forEach((k, i) => {
        obj[String(k)] = instance.values[i];
      });
      unwrapped = obj;
    } else if (classDesc.name === 'java.util.Arrays$ArrayList' && Array.isArray(instance.a)) {
      unwrapped = instance.a;
    } else if (classDesc.name === 'java.util.Collections$SingletonList') {
      unwrapped = [instance.element];
    } else if (classDesc.name === 'java.util.Collections$SingletonMap') {
      unwrapped = { [String(instance.k)]: instance.v };
    } else if (
      classDesc.name.startsWith('java.util.Collections$Unmodifiable') &&
      (instance.c || instance.m || instance.list)
    ) {
      unwrapped = instance.m || instance.c || instance.list;
    } else if (
      [
        'java.lang.Integer',
        'java.lang.Long',
        'java.lang.Double',
        'java.lang.Float',
        'java.lang.Short',
        'java.lang.Byte',
        'java.lang.Boolean',
      ].includes(classDesc.name)
    ) {
      unwrapped = instance.value;
    } else if (instance.__list) {
      unwrapped = instance.__list;
    } else {
      delete unwrapped.__class;
      delete unwrapped.loadFactor;
      delete unwrapped.threshold;
      delete unwrapped.accessOrder;
    }

    this.handles[handleIdx] = unwrapped;
    return unwrapped;
  }

  readArray() {
    const classDesc = this.readClassDescOrRef();
    if (!classDesc) throw new Error('Null classDesc in readArray');
    const arr = [];
    this.registerHandle(arr);
    const len = this.readInt32();
    this.assertAvailable(len);

    const elemType = classDesc.name.charAt(1);
    for (let i = 0; i < len; i++) {
      arr.push(this.readFieldValue(elemType));
    }
    return arr;
  }
}

// Tách các phần tử cấp cao nhất của chuỗi SNBT List trong Paper 1.21: ["", {extra:[...]}, ...]
const splitSnbtList = (raw) => {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];

  const inner = trimmed.slice(1, -1);
  const elements = [];
  let current = '';
  let inQuotes = false;
  let depthBrace = 0;
  let depthBracket = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && inner[j] === '\\'; j--) backslashes++;
      if (backslashes % 2 === 0) inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === '{') depthBrace++;
      else if (ch === '}') depthBrace--;
      else if (ch === '[') depthBracket++;
      else if (ch === ']') depthBracket--;
      else if (ch === ',' && depthBrace === 0 && depthBracket === 0) {
        elements.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    elements.push(current.trim());
  }
  return elements;
};

// Trích xuất chữ sạch và màu chính từ JSON hoặc SNBT của Paper 1.21.11
const parseMinecraftComponent = (raw) => {
  if (!raw) return { text: '', color: null };
  if (typeof raw !== 'string') return { text: String(raw), color: null };

  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    const unquoted = trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/§[0-9a-fk-orx]/gi, '')
      .trim();
    return { text: unquoted, color: null };
  }

  // 1. Thử parse JSON chuẩn
  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const json = JSON.parse(trimmed);
      let mainColor = json.color || null;
      const extract = (node) => {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(extract).join('');
        if (!mainColor && node.color) mainColor = node.color;
        let text = node.text || '';
        if (Array.isArray(node.extra)) text += node.extra.map(extract).join('');
        return text;
      };
      return { text: extract(json).replace(/§[0-9a-fk-orx]/gi, '').trim(), color: mainColor };
    }
  } catch (_) {}

  // 2. Xử lý chuỗi SNBT của Paper 1.21+ ({extra:[{color:"yellow",text:"..."}],text:""})
  if (trimmed.includes('text:')) {
    const textMatches = [...trimmed.matchAll(/text:"((?:\\"|[^"])*)"/g)];
    const colorMatch = trimmed.match(/color:"([a-z_]+)"/);
    if (textMatches.length > 0) {
      const combined = textMatches
        .map((m) => m[1].replace(/\\"/g, '"'))
        .join('')
        .replace(/§[0-9a-fk-orx]/gi, '')
        .trim();
      return { text: combined, color: colorMatch ? colorMatch[1] : null };
    }
  }

  return { text: trimmed.replace(/§[0-9a-fk-orx]/gi, '').trim(), color: null };
};

// Trích xuất các key quan trọng từ PublicBukkitValues (bag_uuid, rpg_item_id, card_rank...)
const parseBukkitValues = (rawCustomData) => {
  if (!rawCustomData || typeof rawCustomData !== 'string') return null;
  const result = {};

  const strMatches = [...rawCustomData.matchAll(/"([a-z0-9_.-]+:[a-z0-9_.-]+)":"([^"]+)"/gi)];
  for (const m of strMatches) {
    const shortKey = m[1].split(':')[1];
    result[shortKey] = m[2];
  }

  const numMatches = [...rawCustomData.matchAll(/"([a-z0-9_.-]+:[a-z0-9_.-]+)":(-?\d+)[bsilfd]?/gi)];
  for (const m of numMatches) {
    const shortKey = m[1].split(':')[1];
    result[shortKey] = Number(m[2]);
  }

  return Object.keys(result).length > 0 ? result : null;
};

const fallbackScanItems = (buffer) => {
  const strings = [];
  for (let i = 0; i < buffer.length - 3; i++) {
    if (buffer[i] === TC_STRING) {
      const len = buffer.readUInt16BE(i + 1);
      if (len > 0 && len < 4096 && i + 3 + len <= buffer.length) {
        const str = buffer.toString('utf8', i + 3, i + 3 + len);
        if (/^[\x20-\x7E\u00A0-\uFFFF]+$/.test(str)) {
          strings.push(str);
          i += 2 + len;
        }
      }
    }
  }

  const items = [];
  let current = null;
  for (let i = 0; i < strings.length; i++) {
    if (strings[i] === 'org.bukkit.inventory.ItemStack') {
      if (current) items.push(current);
      current = { slot: items.length, type: 'UNKNOWN', amount: 1, displayName: '', color: null, lore: [] };
    } else if (current) {
      if ((strings[i] === 'id' || strings[i] === 'type') && strings[i + 1]) {
        current.type = strings[i + 1];
        if (!current.displayName) current.displayName = strings[i + 1];
      } else if (strings[i] === 'minecraft:custom_name' && strings[i + 1]) {
        const parsed = parseMinecraftComponent(strings[i + 1]);
        current.displayName = parsed.text;
        current.color = parsed.color;
      } else if (strings[i] === 'minecraft:lore' && strings[i + 1]) {
        const lines = splitSnbtList(strings[i + 1]);
        if (lines.length > 0) {
          current.lore = lines.map((line) => parseMinecraftComponent(line).text);
        }
      }
    }
  }
  if (current) items.push(current);
  return items;
};

const normalizeBukkitItem = (rawItem, slot, includeRaw = false) => {
  if (!rawItem || typeof rawItem !== 'object') return null;

  const components = rawItem.components || {};
  const meta = rawItem.meta || {};

  // Paper 1.21 lưu ở id & count; Spigot cũ lưu ở type & amount
  const itemType = rawItem.id || rawItem.type || null;
  const itemAmount = rawItem.count ?? rawItem.amount ?? 1;

  const rawDisplayName =
    components['minecraft:custom_name'] || meta['display-name'] || itemType || 'AIR';

  const parsedName = parseMinecraftComponent(rawDisplayName);

  // Hỗ trợ cả Lore dạng SNBT String (Paper 1.21) lẫn Array (Spigot cũ)
  const rawLoreSource = components['minecraft:lore'] || meta.lore || [];
  let cleanLore = [];
  if (Array.isArray(rawLoreSource)) {
    cleanLore = rawLoreSource.map((line) => parseMinecraftComponent(line).text);
  } else if (typeof rawLoreSource === 'string') {
    cleanLore = splitSnbtList(rawLoreSource).map((line) => parseMinecraftComponent(line).text);
  }

  const rawCustomData = components['minecraft:custom_data'] || meta.PublicBukkitValues || null;
  const tags = parseBukkitValues(rawCustomData);

  return {
    slot,
    type: itemType,
    amount: itemAmount,
    displayName: parsedName.text || itemType || 'Vật phẩm',
    color: parsedName.color,
    lore: cleanLore,
    ...(tags && { tags }),
    ...(includeRaw && { rawComponents: components }),
  };
};

const decodeItemStackBase64 = (base64String, options = {}) => {
  if (!base64String || typeof base64String !== 'string') {
    const empty = [];
    Object.defineProperty(empty, 'capacity', { value: 0, enumerable: false });
    return empty;
  }

  const includeRaw = Boolean(options.includeRaw);
  const hash =
    crypto.createHash('md5').update(base64String).digest('hex') + (includeRaw ? ':raw' : ':clean');

  if (decodeCache.has(hash)) {
    return decodeCache.get(hash);
  }

  const buffer = Buffer.from(base64String, 'base64');
  let items = [];
  let capacity = 0;

  try {
    const reader = new JavaStreamReader(buffer);
    const rawObjects = reader.readAll();
    const flatSlots =
      rawObjects.length === 1 && Array.isArray(rawObjects[0]) ? rawObjects[0] : rawObjects;

    capacity = flatSlots.length;
    flatSlots.forEach((entry, index) => {
      const normalized = normalizeBukkitItem(entry, index, includeRaw);
      if (normalized && normalized.displayName !== 'AIR' && normalized.type !== 'minecraft:air') {
        items.push(normalized);
      }
    });
  } catch (error) {
    console.warn('[ItemDecoder] Fallback scanner kích hoạt:', error.message);
    items = fallbackScanItems(buffer);
    capacity = items.length;
  }

  Object.defineProperty(items, 'capacity', { value: capacity, enumerable: false });
  decodeCache.set(hash, items);
  return items;
};

const decodeTrinketsMap = (trinketsObj, options = {}) => {
  if (!trinketsObj || typeof trinketsObj !== 'object') return [];
  const result = [];

  for (const [slotKey, base64Val] of Object.entries(trinketsObj)) {
    const decoded = decodeItemStackBase64(base64Val, options);
    if (decoded.length > 0) {
      result.push({ ...decoded[0], slot: Number(slotKey) });
    }
  }
  return result;
};

module.exports = {
  decodeItemStackBase64,
  decodeTrinketsMap,
};