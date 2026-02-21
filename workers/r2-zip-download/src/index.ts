const ZIP_ROUTE = "/download-zip";
const ZIP_LIST_LIMIT = 1000;
const ZIP_MAX_ENTRY_COUNT = 65535;
const ZIP_MAX_ENTRY_SIZE = 0xffffffff;
const ZIP_FLAG_DATA_DESCRIPTOR_AND_UTF8 = 0x0808;
const ZIP_VERSION_NEEDED = 20;

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const encoder = new TextEncoder();
const CRC32_TABLE = createCrc32Table();

interface Env {
  FILES_BUCKET: {
    list: (options: {
      prefix?: string;
      cursor?: string;
      limit?: number;
      delimiter?: string;
    }) => Promise<unknown>;
    get: (key: string) => Promise<unknown>;
  };
  ZIP_DOWNLOAD_TOKEN_SECRET: string;
}

type WorkerContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type ZipDownloadTokenPayload = {
  sub: string;
  prefix: string;
  recursive: boolean;
  filename: string;
  iat: number;
  exp: number;
};

type ZipEntry = {
  nameBytes: Uint8Array;
  crc32: number;
  size: number;
  modifiedTime: number;
  modifiedDate: number;
  localHeaderOffset: number;
};

type R2ListedObject = {
  key: string;
  uploaded?: Date | string | number;
};

type R2ListPage = {
  objects: R2ListedObject[];
  truncated: boolean;
  cursor?: string;
};

type R2ObjectBody = {
  body?: ReadableStream<Uint8Array>;
};

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    if (request.method !== "GET") {
      return textResponse("Method not allowed", 405);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== ZIP_ROUTE) {
      return textResponse("Not found", 404);
    }

    if (!env.ZIP_DOWNLOAD_TOKEN_SECRET) {
      return textResponse("Missing ZIP_DOWNLOAD_TOKEN_SECRET", 500);
    }

    const token = requestUrl.searchParams.get("token");
    if (!token) {
      return textResponse("Missing token", 401);
    }

    let payload: ZipDownloadTokenPayload;
    try {
      payload = await verifyToken(token, env.ZIP_DOWNLOAD_TOKEN_SECRET);
    } catch {
      return textResponse("Invalid or expired token", 401);
    }

    const prefix = payload.prefix;
    const recursive = payload.recursive;
    const filename = payload.filename;

    const initialListing = await findInitialListing(env.FILES_BUCKET, prefix, recursive);
    if (!initialListing) {
      return textResponse("No files found for this prefix", 404);
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const streamPromise = streamZipFromPrefix({
      bucket: env.FILES_BUCKET,
      prefix,
      recursive,
      initialListing,
      writer,
    }).catch(async (error: unknown) => {
      console.error("zip stream failed", error);
      await writer.abort(error);
      throw error;
    });

    ctx.waitUntil(streamPromise);

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": buildContentDisposition(filename),
        "Cache-Control": "private, no-store",
      },
    });
  },
};

async function verifyToken(
  token: string,
  tokenSecret: string,
): Promise<ZipDownloadTokenPayload> {
  const delimiterIndex = token.lastIndexOf("|");
  if (delimiterIndex <= 0 || delimiterIndex >= token.length - 1) {
    throw new Error("Malformed token");
  }

  const payloadPart = token.slice(0, delimiterIndex);
  const providedSignature = token.slice(delimiterIndex + 1).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(providedSignature)) {
    throw new Error("Malformed token signature");
  }

  const expectedSignature = await signPayload(payloadPart, tokenSecret);
  if (!timingSafeEquals(providedSignature, expectedSignature)) {
    throw new Error("Invalid signature");
  }

  const parsed = JSON.parse(decodeURIComponent(payloadPart)) as Partial<
    ZipDownloadTokenPayload
  >;

  if (typeof parsed.sub !== "string" || parsed.sub.length === 0) {
    throw new Error("Token subject is missing");
  }

  const iat = Number(parsed.iat);
  const exp = Number(parsed.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
    throw new Error("Token timestamps are invalid");
  }

  if (exp <= Date.now()) {
    throw new Error("Token expired");
  }

  const prefix = normalizePrefix(typeof parsed.prefix === "string" ? parsed.prefix : "");
  const recursive = typeof parsed.recursive === "boolean" ? parsed.recursive : true;
  const filename = sanitizeDownloadFileName(
    typeof parsed.filename === "string" ? parsed.filename : "shared-files.zip",
  );

  return {
    sub: parsed.sub,
    prefix,
    recursive,
    filename,
    iat,
    exp,
  };
}

async function signPayload(payloadPart: string, tokenSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(tokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadPart));
  return bytesToHex(new Uint8Array(signature));
}

function normalizePrefix(prefix: string) {
  const normalized = prefix
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  for (const segment of segments) {
    validatePathSegment(segment, "prefix");
  }

  return `${segments.join("/")}/`;
}

function validatePathSegment(segment: string, label: string) {
  if (segment === "." || segment === "..") {
    throw new Error(`Invalid ${label}`);
  }
  if (/[\u0000-\u001f\u007f]/.test(segment)) {
    throw new Error(`Invalid ${label}`);
  }
}

function sanitizeDownloadFileName(fileName: string) {
  const raw = fileName
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .at(-1);

  const stem = (raw ?? "shared-files")
    .replace(/\.zip$/i, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .trim();

  const safeStem = stem.length > 0 ? stem.slice(0, 100) : "shared-files";
  return `${safeStem}.zip`;
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 120);

  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback || "download.zip"}"; filename*=UTF-8''${encoded}`;
}

async function findInitialListing(
  bucket: Env["FILES_BUCKET"],
  prefix: string,
  recursive: boolean,
): Promise<R2ListPage | null> {
  let cursor: string | undefined;

  while (true) {
    const page = await listObjectsPage(bucket, prefix, recursive, cursor);
    const filteredObjects = page.objects.filter((object) => isDownloadableObject(object));

    if (filteredObjects.length > 0) {
      return {
        ...page,
        objects: filteredObjects,
      };
    }

    if (!page.truncated) {
      return null;
    }

    if (!page.cursor) {
      throw new Error("R2 list response is missing cursor on truncated page.");
    }

    cursor = page.cursor;
  }
}

async function streamZipFromPrefix(args: {
  bucket: Env["FILES_BUCKET"];
  prefix: string;
  recursive: boolean;
  initialListing: R2ListPage;
  writer: WritableStreamDefaultWriter<Uint8Array>;
}) {
  const entries: ZipEntry[] = [];
  let bytesWritten = 0;
  let processedEntries = 0;

  let page = args.initialListing;

  while (true) {
    for (const listedObject of page.objects) {
      const entryName = toZipEntryName(listedObject.key, args.prefix, args.recursive);
      if (!entryName) {
        continue;
      }

      if (processedEntries >= ZIP_MAX_ENTRY_COUNT) {
        throw new Error("ZIP64 is not supported for more than 65535 files.");
      }

      const objectResponse = (await args.bucket.get(listedObject.key)) as R2ObjectBody | null;
      if (!objectResponse?.body) {
        continue;
      }

      const nameBytes = encoder.encode(entryName);
      if (nameBytes.byteLength > 0xffff) {
        throw new Error("File path is too long for this ZIP format.");
      }

      const uploadedAt = listedObject.uploaded ? new Date(listedObject.uploaded) : new Date();
      const dosDateTime = toDosDateTime(uploadedAt);

      const localHeaderOffset = bytesWritten;
      bytesWritten += await writeLocalHeader(args.writer, {
        nameBytes,
        modifiedDate: dosDateTime.date,
        modifiedTime: dosDateTime.time,
      });

      let crc = 0xffffffff;
      let fileSize = 0;
      const reader = objectResponse.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }

          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
          crc = crc32Update(crc, chunk);
          fileSize += chunk.byteLength;

          if (fileSize > ZIP_MAX_ENTRY_SIZE) {
            throw new Error("ZIP64 is required for files larger than 4 GiB.");
          }

          await args.writer.write(chunk);
          bytesWritten += chunk.byteLength;
        }
      } finally {
        reader.releaseLock();
      }

      const finalizedCrc = (crc ^ 0xffffffff) >>> 0;
      bytesWritten += await writeDataDescriptor(args.writer, {
        crc32: finalizedCrc,
        size: fileSize,
      });

      entries.push({
        nameBytes,
        crc32: finalizedCrc,
        size: fileSize,
        modifiedDate: dosDateTime.date,
        modifiedTime: dosDateTime.time,
        localHeaderOffset,
      });
      processedEntries += 1;
    }

    if (!page.truncated) {
      break;
    }

    if (!page.cursor) {
      throw new Error("R2 list response is missing cursor on truncated page.");
    }

    page = await listObjectsPage(args.bucket, args.prefix, args.recursive, page.cursor);
    page = {
      ...page,
      objects: page.objects.filter((object) => isDownloadableObject(object)),
    };
  }

  if (entries.length === 0) {
    throw new Error("No files found for this prefix.");
  }

  const centralDirectoryOffset = bytesWritten;

  for (const entry of entries) {
    bytesWritten += await writeCentralDirectoryRecord(args.writer, entry);
  }

  const centralDirectorySize = bytesWritten - centralDirectoryOffset;
  if (centralDirectoryOffset > ZIP_MAX_ENTRY_SIZE || centralDirectorySize > ZIP_MAX_ENTRY_SIZE) {
    throw new Error("ZIP64 is required for archives larger than 4 GiB.");
  }

  await writeEndOfCentralDirectory(args.writer, {
    entryCount: entries.length,
    centralDirectoryOffset,
    centralDirectorySize,
  });

  await args.writer.close();
}

async function listObjectsPage(
  bucket: Env["FILES_BUCKET"],
  prefix: string,
  recursive: boolean,
  cursor?: string,
): Promise<R2ListPage> {
  const response = (await bucket.list({
    prefix,
    delimiter: recursive ? undefined : "/",
    cursor,
    limit: ZIP_LIST_LIMIT,
  })) as Partial<R2ListPage> | null;

  return {
    objects: Array.isArray(response?.objects) ? response.objects : [],
    truncated: Boolean(response?.truncated),
    cursor: typeof response?.cursor === "string" ? response.cursor : undefined,
  };
}

function isDownloadableObject(object: R2ListedObject) {
  return Boolean(object.key && !object.key.endsWith("/"));
}

function toZipEntryName(key: string, prefix: string, recursive: boolean) {
  if (prefix && !key.startsWith(prefix)) {
    return "";
  }

  const relative = (prefix ? key.slice(prefix.length) : key)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");

  if (!relative) {
    return "";
  }
  if (!recursive && relative.includes("/")) {
    return "";
  }

  const segments = relative.split("/").filter(Boolean);
  for (const segment of segments) {
    validatePathSegment(segment, "object key");
  }

  return segments.join("/");
}

function toDosDateTime(date: Date) {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.min(Math.max(safeDate.getUTCFullYear(), 1980), 2107);
  const month = safeDate.getUTCMonth() + 1;
  const day = safeDate.getUTCDate();
  const hours = safeDate.getUTCHours();
  const minutes = safeDate.getUTCMinutes();
  const seconds = safeDate.getUTCSeconds();

  return {
    time:
      ((hours & 0x1f) << 11) |
      ((minutes & 0x3f) << 5) |
      (Math.floor(seconds / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
  };
}

async function writeLocalHeader(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  args: {
    nameBytes: Uint8Array;
    modifiedTime: number;
    modifiedDate: number;
  },
) {
  const record = new Uint8Array(30 + args.nameBytes.byteLength);

  writeUint32LE(record, 0, LOCAL_FILE_HEADER_SIGNATURE);
  writeUint16LE(record, 4, ZIP_VERSION_NEEDED);
  writeUint16LE(record, 6, ZIP_FLAG_DATA_DESCRIPTOR_AND_UTF8);
  writeUint16LE(record, 8, 0);
  writeUint16LE(record, 10, args.modifiedTime);
  writeUint16LE(record, 12, args.modifiedDate);
  writeUint32LE(record, 14, 0);
  writeUint32LE(record, 18, 0);
  writeUint32LE(record, 22, 0);
  writeUint16LE(record, 26, args.nameBytes.byteLength);
  writeUint16LE(record, 28, 0);
  record.set(args.nameBytes, 30);

  await writer.write(record);
  return record.byteLength;
}

async function writeDataDescriptor(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  args: { crc32: number; size: number },
) {
  const record = new Uint8Array(16);
  writeUint32LE(record, 0, DATA_DESCRIPTOR_SIGNATURE);
  writeUint32LE(record, 4, args.crc32);
  writeUint32LE(record, 8, args.size);
  writeUint32LE(record, 12, args.size);

  await writer.write(record);
  return record.byteLength;
}

async function writeCentralDirectoryRecord(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  entry: ZipEntry,
) {
  const record = new Uint8Array(46 + entry.nameBytes.byteLength);

  writeUint32LE(record, 0, CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16LE(record, 4, ZIP_VERSION_NEEDED);
  writeUint16LE(record, 6, ZIP_VERSION_NEEDED);
  writeUint16LE(record, 8, ZIP_FLAG_DATA_DESCRIPTOR_AND_UTF8);
  writeUint16LE(record, 10, 0);
  writeUint16LE(record, 12, entry.modifiedTime);
  writeUint16LE(record, 14, entry.modifiedDate);
  writeUint32LE(record, 16, entry.crc32);
  writeUint32LE(record, 20, entry.size);
  writeUint32LE(record, 24, entry.size);
  writeUint16LE(record, 28, entry.nameBytes.byteLength);
  writeUint16LE(record, 30, 0);
  writeUint16LE(record, 32, 0);
  writeUint16LE(record, 34, 0);
  writeUint16LE(record, 36, 0);
  writeUint32LE(record, 38, 0);
  writeUint32LE(record, 42, entry.localHeaderOffset);
  record.set(entry.nameBytes, 46);

  await writer.write(record);
  return record.byteLength;
}

async function writeEndOfCentralDirectory(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  args: {
    entryCount: number;
    centralDirectorySize: number;
    centralDirectoryOffset: number;
  },
) {
  if (args.entryCount > ZIP_MAX_ENTRY_COUNT) {
    throw new Error("ZIP64 is required for archives with more than 65535 files.");
  }

  const record = new Uint8Array(22);
  writeUint32LE(record, 0, END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16LE(record, 4, 0);
  writeUint16LE(record, 6, 0);
  writeUint16LE(record, 8, args.entryCount);
  writeUint16LE(record, 10, args.entryCount);
  writeUint32LE(record, 12, args.centralDirectorySize);
  writeUint32LE(record, 16, args.centralDirectoryOffset);
  writeUint16LE(record, 20, 0);

  await writer.write(record);
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

function crc32Update(currentCrc: number, bytes: Uint8Array) {
  let crc = currentCrc >>> 0;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return crc >>> 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEquals(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
