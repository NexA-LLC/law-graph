import { createHash } from 'node:crypto';

// Fixed protocol namespace; changing this value changes every derived ID.
export const NAMESPACE = '5d6c6cf5-664c-5f88-bb7b-559f857dd711';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}

export function uuid(name, namespace = NAMESPACE) {
  const bytes = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  if (bytes.length !== 16) throw new Error('Invalid UUID namespace');
  const digest = createHash('sha1').update(bytes).update(name, 'utf8').digest().subarray(0, 16);
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const h = digest.toString('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}

export function id(kind, ...parts) {
  return uuid(canonical([kind, ...parts]));
}

export function snapshotId(graph) {
  const { observations, ...content } = graph;
  return sha256(content);
}
