export function parseModernSeed(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return BigInt.asIntN(64, value);
  if (typeof value === "number") return BigInt.asIntN(64, BigInt(Math.trunc(value)));
  const trimmed = value.trim();
  if (/^[+-]?\d+$/.test(trimmed)) return BigInt.asIntN(64, BigInt(trimmed));

  let hash = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    hash = (Math.imul(hash, 31) + trimmed.charCodeAt(index)) | 0;
  }
  return BigInt(hash);
}
