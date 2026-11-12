import { createHash, createHmac } from "node:crypto";
import { isAddress, verifyTypedData, type Address, type Hex } from "viem";
import { env } from "@/lib/env.server";

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const CHAIN_ID = 4441;

function pinataJwt() {
  return env("PINATA_JWT") ?? "";
}

function signingKey() {
  return pinataJwt() || env("UPLOAD_SIGNING_SECRET") || "";
}

function allowed(request: Request, origin: string) {
  if (!origin) return false;
  const self = new URL(request.url).origin;
  const list = (env("UPLOAD_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return origin === self || origin === "https://rarecognos.vercel.app" || list.includes(origin);
}

export function uploadJson(status: number, data: unknown, origin = "") {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "origin";
    headers["access-control-allow-headers"] = "content-type";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function uploadOptions(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  if (!allowed(request, origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      vary: "origin",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export function uploadStatus(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  if (origin && !allowed(request, origin)) return uploadJson(403, { error: "Origin not allowed" });
  return uploadJson(
    200,
    { enabled: Boolean(pinataJwt()), mode: "ipfs", maxBytes: MAX_UPLOAD_BYTES, chainId: CHAIN_ID },
    origin,
  );
}

function mac(message: string) {
  return createHmac("sha256", signingKey()).update(message).digest("hex");
}

function pack(body: unknown) {
  return Buffer.from(JSON.stringify(body)).toString("base64url");
}

function unpack(id: string) {
  const parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as {
    payload?: string;
    typed?: PublishTyped;
    expires?: number;
    mac?: string;
  };
  if (!parsed.payload || !parsed.typed || !parsed.expires || !parsed.mac) throw Error("Bad authorization");
  return parsed;
}

const publishDomain = { name: "RareCognos", version: "1", chainId: CHAIN_ID } as const;
const publishTypes = {
  Publish: [
    { name: "statement", type: "string" },
    { name: "artwork", type: "string" },
    { name: "site", type: "string" },
    { name: "wallet", type: "address" },
    { name: "image", type: "bytes32" },
    { name: "until", type: "string" },
  ],
} as const;
type PublishTyped = {
  domain: typeof publishDomain;
  types: typeof publishTypes;
  primaryType: "Publish";
  message: {
    statement: string;
    artwork: string;
    site: string;
    wallet: Address;
    image: Hex;
    until: string;
  };
};
const publishStatement = "Publish this artwork. This does not send zkLTC.";

export async function uploadChallenge(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  if (!allowed(request, origin)) return uploadJson(403, { error: "Origin not allowed" });
  if (!pinataJwt()) return uploadJson(503, { error: "Permanent upload storage is not configured." }, origin);
  const body = (await request.json()) as {
    wallet?: string;
    digest?: string;
    name?: string;
    description?: string;
    rights?: boolean;
  };
  const { wallet, digest, name, description, rights } = body;
  if (
    !wallet ||
    !isAddress(wallet) ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 120 ||
    typeof description !== "string" ||
    description.length > 2000 ||
    rights !== true
  ) {
    return uploadJson(400, { error: "Check name, description, wallet and rights declaration." }, origin);
  }
  const expires = Date.now() + 300000;
  const payload = JSON.stringify({
    wallet: wallet.toLowerCase(),
    digest,
    name: name.trim(),
    description,
    rights,
    chainId: CHAIN_ID,
  });
  const until =
    new Date(expires).toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }) + " UTC";
  const typed: PublishTyped = {
    domain: publishDomain,
    types: publishTypes,
    primaryType: "Publish",
    message: {
      statement: publishStatement,
      artwork: name.trim(),
      site: new URL(origin).host,
      wallet: wallet as Address,
      image: `0x${digest}` as Hex,
      until,
    },
  };
  return uploadJson(
    200,
    { id: pack({ payload, typed, expires, mac: mac(JSON.stringify(typed)) }), typed, expires },
    origin,
  );
}

function imageType(bytes: Buffer) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    if (bytes.includes(Buffer.from("ANIM")) || bytes.includes(Buffer.from("ANMF"))) return null;
    return "image/webp";
  }
  return null;
}

async function pinFile(bytes: Buffer, mime: string, name: string) {
  const jwt = pinataJwt();
  if (!jwt) throw Object.assign(new Error("Permanent storage is not configured."), { status: 503 });
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  form.set("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Object.assign(new Error("Permanent storage unavailable. Retry with a new signature."), { status: 502 });
  const result = (await response.json()) as { IpfsHash?: string };
  if (!result.IpfsHash || !/^b[a-z2-7]{40,120}$/.test(result.IpfsHash))
    throw Object.assign(new Error("Invalid storage response"), { status: 502 });
  return `ipfs://${result.IpfsHash}`;
}

export async function uploadPrepare(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  if (!allowed(request, origin)) return uploadJson(403, { error: "Origin not allowed" });
  try {
    const body = (await request.json()) as { id?: string; signature?: string; file?: string };
    if (!body.id || typeof body.signature !== "string" || typeof body.file !== "string")
      return uploadJson(400, { error: "Missing image" }, origin);
    const ticket = unpack(body.id);
    const typed = ticket.typed!;
    if (ticket.mac !== mac(JSON.stringify(typed)) || !ticket.expires || ticket.expires < Date.now())
      return uploadJson(401, { error: "Upload authorization expired or already used. Sign again." }, origin);
    const payload = JSON.parse(ticket.payload!) as {
      wallet: string;
      digest: string;
      name: string;
      description: string;
    };
    const site = new URL(origin).host;
    if (
      typed.domain.name !== publishDomain.name ||
      typed.domain.version !== publishDomain.version ||
      typed.domain.chainId !== CHAIN_ID ||
      typed.primaryType !== "Publish" ||
      typed.message.statement !== publishStatement ||
      typed.message.site !== site ||
      typed.message.wallet.toLowerCase() !== payload.wallet ||
      typed.message.artwork !== payload.name ||
      typed.message.image.toLowerCase() !== `0x${payload.digest}`
    )
      return uploadJson(401, { error: "Upload authorization expired or already used. Sign again." }, origin);
    if (
      !(await verifyTypedData({
        address: payload.wallet as Address,
        domain: publishDomain,
        types: publishTypes,
        primaryType: "Publish",
        message: typed.message,
        signature: body.signature as Hex,
      }))
    )
      return uploadJson(401, { error: "Invalid wallet signature" }, origin);
    const bytes = Buffer.from(body.file, "base64");
    if (bytes.length > MAX_UPLOAD_BYTES) return uploadJson(413, { error: "Maximum file size is 3 MB" }, origin);
    if (createHash("sha256").update(bytes).digest("hex") !== payload.digest)
      return uploadJson(400, { error: "Image does not match signed digest" }, origin);
    const mime = imageType(bytes);
    if (!mime) return uploadJson(415, { error: "Only single-frame PNG, JPEG and WebP images are supported" }, origin);
    const imageURI = await pinFile(bytes, mime, `${payload.digest}.${mime.split("/")[1]}`);
    const metadata = {
      name: payload.name,
      description: payload.description,
      image: imageURI,
      creator: payload.wallet,
      attributes: [{ trait_type: "Edition", value: "1/1" }],
      properties: { content_sha256: payload.digest, rights_declared: true },
    };
    const uri = await pinFile(Buffer.from(JSON.stringify(metadata)), "application/json", "metadata.json");
    return uploadJson(
      200,
      {
        uri,
        image: imageURI,
        name: payload.name,
        description: payload.description,
        creator: payload.wallet,
        chainId: CHAIN_ID,
        contentHash: payload.digest,
        mode: "ipfs",
      },
      origin,
    );
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    const message = error instanceof Error && status !== 400 ? error.message : "Image validation or storage failed. Check the file and retry.";
    return uploadJson(status || 400, { error: message }, origin);
  }
}
