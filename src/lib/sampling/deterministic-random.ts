import { createHmac } from "node:crypto";

const DOMAIN = "london-npc-sampler";
const UINT53_RANGE = 2 ** 53;

export function namedRandom(seed: string, path: string, version = "v1") {
  if (!seed || !path)
    throw new Error("Named randomness requires seed and path.");
  const digest = createHmac("sha256", seed)
    .update(`${DOMAIN}/${version}/${path}`)
    .digest();
  const high48 = digest.readUIntBE(0, 6);
  const low5 = digest[6]! >>> 3;
  return (high48 * 32 + low5) / UINT53_RANGE;
}

export function namedInteger(
  seed: string,
  path: string,
  minimum: number,
  maximum: number,
) {
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    minimum > maximum
  ) {
    throw new Error("Named integer bounds must be ordered integers.");
  }
  return (
    minimum + Math.floor(namedRandom(seed, path) * (maximum - minimum + 1))
  );
}
