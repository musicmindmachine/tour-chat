import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import {
  action,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const r2 = new R2(components.r2);
const ZIP_DOWNLOAD_TTL_MS = 5 * 60 * 1000;

const r2Client = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireAuthenticatedUser(ctx);
  },
  checkReadBucket: async (ctx) => {
    await requireAuthenticatedUser(ctx);
  },
  checkDelete: async (ctx) => {
    await requireAuthenticatedUser(ctx);
  },
});

export const syncMetadata = r2Client.syncMetadata;

export const finalizeUpload = action({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not signed in");
    }

    await r2.syncMetadata(ctx, args.key);
    return null;
  },
});

export const createUploadUrl = mutation({
  args: {
    fileName: v.string(),
    directory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);

    const fileName = normalizeFileName(args.fileName);
    const directory = normalizeDirectory(args.directory);
    const path = await findAvailablePath(ctx, directory, fileName);

    const { key, url } = await r2.generateUploadUrl(path);

    return {
      key,
      path,
      uploadUrl: url,
    };
  },
});

export const commitUpload = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx);

    const metadata = await r2.getMetadata(ctx, args.key);
    if (!metadata) {
      throw new Error(
        "Upload metadata was not found. Upload the file and sync metadata first.",
      );
    }

    const { fileName, directory } = splitPath(args.key);
    const now = Date.now();

    const existing = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      if (existing.uploaderId !== user._id) {
        throw new Error("A different user already owns this file path.");
      }
      await ctx.db.patch(existing._id, {
        name: fileName,
        path: args.key,
        directory,
        uploaderName: user.name ?? undefined,
        uploaderEmail: user.email ?? undefined,
        size: metadata.size,
        contentType: metadata.contentType,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("files", {
      key: args.key,
      name: fileName,
      path: args.key,
      directory,
      uploaderId: user._id,
      uploaderName: user.name ?? undefined,
      uploaderEmail: user.email ?? undefined,
      size: metadata.size,
      contentType: metadata.contentType,
      uploadedAt: now,
      updatedAt: now,
    });
  },
});

export const deleteFile = mutation({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx);
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("The file no longer exists.");
    }
    if (file.uploaderId !== user._id) {
      throw new Error("Only the uploader can delete this file.");
    }

    await r2.deleteObject(ctx, file.key);
    await ctx.db.delete(file._id);

    return { deletedPath: file.path };
  },
});

export const deletePrefix = mutation({
  args: {
    prefix: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);

    const prefix = normalizeDirectory(args.prefix);
    if (!prefix) {
      throw new Error("Folder prefix is required.");
    }

    const prefixWithSlash = `${prefix}/`;
    const files = await ctx.db.query("files").collect();
    const filesToDelete = files.filter(
      (file) => file.path === prefix || file.path.startsWith(prefixWithSlash),
    );

    for (const file of filesToDelete) {
      await r2.deleteObject(ctx, file.key);
      await ctx.db.delete(file._id);
    }

    return {
      prefix,
      deletedCount: filesToDelete.length,
    };
  },
});

export const listShared = query({
  args: {
    directory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);

    const currentDirectory = normalizeDirectory(args.directory);
    const files = await ctx.db.query("files").collect();
    const filesInDirectory = files
      .filter((file) => file.directory === currentDirectory)
      .sort((a, b) => a.name.localeCompare(b.name));
    const filesWithUrls = await Promise.all(
      filesInDirectory.map(async (file) => ({
        ...file,
        downloadUrl: await r2.getUrl(file.key, { expiresIn: 60 * 30 }),
      })),
    );
    const directories = collectChildDirectories(files, currentDirectory).sort((a, b) =>
      a.localeCompare(b),
    );

    return {
      currentDirectory,
      parentDirectory: getParentDirectory(currentDirectory),
      breadcrumbs: buildBreadcrumbs(currentDirectory),
      directories: directories.map((name) => ({
        name,
        path: toPath(currentDirectory, name),
      })),
      files: filesWithUrls,
    };
  },
});

export const createZipDownloadUrl = mutation({
  args: {
    prefix: v.optional(v.string()),
    recursive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx);
    const workerUrl = requireEnv("ZIP_DOWNLOAD_WORKER_URL");
    const tokenSecret = requireEnv("ZIP_DOWNLOAD_TOKEN_SECRET");

    if (tokenSecret.length < 16) {
      throw new Error("ZIP_DOWNLOAD_TOKEN_SECRET must be at least 16 characters.");
    }

    const prefix = normalizeZipPrefix(args.prefix);
    const recursive = args.recursive === true;
    const now = Date.now();
    const payload: ZipDownloadTokenPayload = {
      sub: user._id,
      prefix,
      recursive,
      filename: buildZipFileName(prefix),
      iat: now,
      exp: now + ZIP_DOWNLOAD_TTL_MS,
    };

    const payloadPart = encodeURIComponent(JSON.stringify(payload));
    const signature = await signZipToken(payloadPart, tokenSecret);
    const token = `${payloadPart}|${signature}`;

    const downloadUrl = new URL(workerUrl);
    downloadUrl.searchParams.set("token", token);

    return {
      downloadUrl: downloadUrl.toString(),
      expiresAt: payload.exp,
      filename: payload.filename,
      prefix,
      recursive,
    };
  },
});

async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not signed in");
  }

  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new Error("User was deleted");
  }

  return user;
}

function normalizeDirectory(directory: string | undefined) {
  if (!directory) {
    return "";
  }

  const normalized = directory
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  for (const segment of segments) {
    validatePathSegment(segment, "directory");
  }

  return segments.join("/");
}

function normalizeZipPrefix(prefix: string | undefined) {
  const normalizedDirectory = normalizeDirectory(prefix);
  return normalizedDirectory ? `${normalizedDirectory}/` : "";
}

function normalizeFileName(fileName: string) {
  const normalized = fileName.trim();
  if (!normalized) {
    throw new Error("File name is required.");
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("File name cannot contain directory separators.");
  }

  validatePathSegment(normalized, "file name");
  return normalized;
}

function validatePathSegment(segment: string, label: string) {
  if (segment === "." || segment === "..") {
    throw new Error(`Invalid ${label}: relative path segments are not allowed.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(segment)) {
    throw new Error(`Invalid ${label}: control characters are not allowed.`);
  }
}

function toPath(directory: string, fileName: string) {
  return directory ? `${directory}/${fileName}` : fileName;
}

async function findAvailablePath(ctx: MutationCtx, directory: string, fileName: string) {
  const { stem, extension } = splitFileName(fileName);
  const maxAttempts = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidateFileName =
      attempt === 1 ? fileName : `${stem} (${attempt})${extension}`;
    const candidatePath = toPath(directory, candidateFileName);

    const [existingFile, existingMetadata] = await Promise.all([
      ctx.db
        .query("files")
        .withIndex("by_path", (q) => q.eq("path", candidatePath))
        .unique(),
      r2.getMetadata(ctx, candidatePath),
    ]);

    if (!existingFile && !existingMetadata) {
      return candidatePath;
    }
  }

  throw new Error("Could not find an available file name for this upload.");
}

function splitFileName(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return {
      stem: fileName,
      extension: "",
    };
  }

  return {
    stem: fileName.slice(0, lastDot),
    extension: fileName.slice(lastDot),
  };
}

function splitPath(path: string) {
  const parts = path.split("/");
  const fileName = parts.at(-1);
  if (!fileName) {
    throw new Error("Invalid object key.");
  }

  return {
    fileName,
    directory: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

function collectChildDirectories(
  files: Array<{
    directory: string;
  }>,
  currentDirectory: string,
) {
  const directories = new Set<string>();

  if (!currentDirectory) {
    for (const file of files) {
      if (!file.directory) {
        continue;
      }
      const [segment] = file.directory.split("/");
      if (segment) {
        directories.add(segment);
      }
    }
    return [...directories];
  }

  const prefix = `${currentDirectory}/`;
  for (const file of files) {
    if (!file.directory.startsWith(prefix)) {
      continue;
    }
    const remainder = file.directory.slice(prefix.length);
    if (!remainder) {
      continue;
    }
    const [segment] = remainder.split("/");
    if (segment) {
      directories.add(segment);
    }
  }

  return [...directories];
}

function getParentDirectory(directory: string) {
  if (!directory) {
    return null;
  }

  const parts = directory.split("/");
  parts.pop();
  return parts.join("/");
}

function buildBreadcrumbs(directory: string) {
  const breadcrumbs = [{ name: "Files", path: "" }];
  if (!directory) {
    return breadcrumbs;
  }

  const parts = directory.split("/");
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    breadcrumbs.push({
      name: part,
      path: currentPath,
    });
  }

  return breadcrumbs;
}

function buildZipFileName(prefix: string) {
  if (!prefix) {
    return "shared-files.zip";
  }

  const segment = prefix.split("/").filter(Boolean).at(-1) ?? "folder";
  const sanitized = segment
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");

  return `${sanitized || "folder"}.zip`;
}

function requireEnv(key: "ZIP_DOWNLOAD_WORKER_URL" | "ZIP_DOWNLOAD_TOKEN_SECRET") {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing Convex env var ${key}. Set it with: npx convex env set ${key} ...`,
    );
  }
  return value;
}

async function signZipToken(payloadPart: string, tokenSecret: string) {
  const secretBytes = new TextEncoder().encode(tokenSecret);
  const payloadBytes = new TextEncoder().encode(payloadPart);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", hmacKey, payloadBytes);
  return bytesToHex(new Uint8Array(signatureBuffer));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type ZipDownloadTokenPayload = {
  sub: string;
  prefix: string;
  recursive: boolean;
  filename: string;
  iat: number;
  exp: number;
};
