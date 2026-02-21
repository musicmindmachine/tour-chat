"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Archive, ChevronRight, Download, Folder, Trash2, Upload } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
} from "react";
import { toast } from "sonner";

type SelectedUpload = {
  file: File;
  relativePath: string;
};

type QueuedUpload = SelectedUpload & {
  id: string;
};

type CreateUploadUrlFn = (args: {
  fileName: string;
  directory?: string;
}) => Promise<{
  key: string;
  path: string;
  uploadUrl: string;
}>;

type FinalizeUploadFn = (args: { key: string }) => Promise<null>;

type CommitUploadFn = (args: { key: string }) => Promise<Id<"files">>;

type FolderPickerAttributes = InputHTMLAttributes<HTMLInputElement> & {
  directory?: string;
  webkitdirectory?: string;
};

const folderPickerAttributes: FolderPickerAttributes = {
  directory: "",
  webkitdirectory: "",
};

export function FileManager() {
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [directoryPrefix, setDirectoryPrefix] = useState("");
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [search, setSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<Id<"files"> | null>(null);
  const [zipPrefix, setZipPrefix] = useState("");
  const [zipRecursive, setZipRecursive] = useState(false);
  const [isPreparingZip, setIsPreparingZip] = useState(false);

  const data = useQuery(api.files.listShared, {
    directory: currentDirectory || undefined,
  });
  const viewer = useQuery(api.users.viewer);
  const createUploadUrl = useMutation(api.files.createUploadUrl);
  const finalizeUpload = useAction(api.files.finalizeUpload);
  const commitUpload = useMutation(api.files.commitUpload);
  const deleteFile = useMutation(api.files.deleteFile);
  const createZipDownloadUrl = useMutation(api.files.createZipDownloadUrl);

  const filePickerRef = useRef<HTMLInputElement>(null);
  const folderPickerRef = useRef<HTMLInputElement>(null);

  const filteredDirectories = useMemo(() => {
    if (!data) {
      return [];
    }

    if (!search.trim()) {
      return data.directories;
    }

    const searchText = search.trim().toLowerCase();
    return data.directories.filter((directory) =>
      directory.name.toLowerCase().includes(searchText),
    );
  }, [data, search]);

  const filteredFiles = useMemo(() => {
    if (!data) {
      return [];
    }

    if (!search.trim()) {
      return data.files;
    }

    const searchText = search.trim().toLowerCase();
    return data.files.filter((file) =>
      file.name.toLowerCase().includes(searchText),
    );
  }, [data, search]);

  function addToQueue(nextUploads: SelectedUpload[]) {
    const normalized = nextUploads
      .map(toQueuedUpload)
      .filter((item): item is QueuedUpload => item !== null);

    if (normalized.length === 0) {
      toast.error("No valid files were selected.");
      return;
    }

    const skippedCount = nextUploads.length - normalized.length;
    if (skippedCount > 0) {
      toast.error(
        `Skipped ${skippedCount} file${skippedCount === 1 ? "" : "s"} with invalid paths.`,
      );
    }

    setQueuedUploads((current) => mergeQueuedUploads(current, normalized));
  }

  function handlePickerChange(event: ChangeEvent<HTMLInputElement>) {
    if (isUploading) {
      return;
    }

    addToQueue(filesFromInput(event.target.files));
    event.target.value = "";
  }

  function handleDropZoneDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (isUploading) {
      return;
    }
    setIsDragActive(true);
  }

  async function handleDropZoneDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (isUploading) {
      return;
    }

    try {
      const droppedFiles = await filesFromDataTransfer(event.dataTransfer);
      if (droppedFiles.length === 0) {
        toast.error("Drop did not include any files.");
        return;
      }
      addToQueue(droppedFiles);
    } catch (error) {
      console.error(error);
      toast.error("Could not read dropped files.");
    }
  }

  async function handleUpload() {
    if (queuedUploads.length === 0) {
      toast.error("Add files or folders first.");
      return;
    }

    setIsUploading(true);
    try {
      const batch = [...queuedUploads];
      const failedIds = new Set<string>();
      const baseDirectory = normalizeDirectoryPrefix(directoryPrefix);
      const workerCount = Math.min(3, batch.length);
      let successfulCount = 0;
      let firstFailure = "";
      let nextIndex = 0;

      const runWorker = async () => {
        while (nextIndex < batch.length) {
          const item = batch[nextIndex];
          nextIndex += 1;

          try {
            await uploadSingleFile(
              item,
              baseDirectory,
              createUploadUrl,
              finalizeUpload,
              commitUpload,
            );
            successfulCount += 1;
          } catch (error) {
            failedIds.add(item.id);
            if (!firstFailure) {
              firstFailure = toErrorMessage(error);
            }
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      if (failedIds.size > 0) {
        setQueuedUploads(batch.filter((item) => failedIds.has(item.id)));
        toast.error(
          `Uploaded ${successfulCount}/${batch.length}. ${failedIds.size} failed. ${firstFailure}`,
        );
      } else {
        setQueuedUploads([]);
        toast.success(
          `Uploaded ${successfulCount} file${successfulCount === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(fileId: Id<"files">) {
    setIsDeletingId(fileId);
    try {
      await deleteFile({ fileId });
      toast.success("File deleted");
    } catch (error) {
      console.error(error);
      toast.error("Delete failed");
    } finally {
      setIsDeletingId(null);
    }
  }

  async function handleDownloadZip(options?: {
    prefix?: string;
    recursive?: boolean;
  }) {
    if (isPreparingZip) {
      return;
    }

    setIsPreparingZip(true);
    try {
      const prefix = normalizeDirectoryPrefix(options?.prefix ?? zipPrefix);
      const recursive = options?.recursive ?? zipRecursive;
      const result = await createZipDownloadUrl({
        prefix: prefix || undefined,
        recursive,
      });
      window.location.assign(result.downloadUrl);
      toast.success(
        `Starting ${result.filename}${recursive ? " (recursive)" : " (current folder only)"}`,
      );
    } catch (error) {
      console.error(error);
      toast.error(`Could not prepare ZIP: ${toErrorMessage(error)}`);
    } finally {
      setIsPreparingZip(false);
    }
  }

  function navigateToDirectory(path: string) {
    setCurrentDirectory(path);
    setSearch("");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload files and folders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={filePickerRef}
            className="hidden"
            type="file"
            multiple
            onChange={handlePickerChange}
          />
          <input
            ref={folderPickerRef}
            className="hidden"
            type="file"
            multiple
            onChange={handlePickerChange}
            {...folderPickerAttributes}
          />
          <Input
            value={directoryPrefix}
            onChange={(event) => setDirectoryPrefix(event.target.value)}
            placeholder="Optional path prefix, e.g. designs/mockups"
            disabled={isUploading}
          />
          <div
            className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 bg-muted/20"
            }`}
            onDragEnter={handleDropZoneDrag}
            onDragOver={handleDropZoneDrag}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(event) => void handleDropZoneDrop(event)}
          >
            <p className="text-sm font-medium">
              Drag files or folders here, or use the picker buttons.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Folder structure is preserved when uploaded to R2.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={isUploading}
              onClick={() => filePickerRef.current?.click()}
            >
              Choose files
            </Button>
            <Button
              variant="outline"
              disabled={isUploading}
              onClick={() => folderPickerRef.current?.click()}
            >
              Choose folder
            </Button>
            <Button
              variant="outline"
              disabled={isUploading || queuedUploads.length === 0}
              onClick={() => setQueuedUploads([])}
            >
              Clear queue
            </Button>
            <Button
              disabled={isUploading || queuedUploads.length === 0}
              onClick={() => void handleUpload()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading
                ? "Uploading..."
                : `Upload ${queuedUploads.length} item${
                    queuedUploads.length === 1 ? "" : "s"
                  }`}
            </Button>
          </div>
          {queuedUploads.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files queued yet.</p>
          ) : (
            <div className="max-h-56 overflow-auto rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Path</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {queuedUploads.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2 font-mono">{item.relativePath}</td>
                      <td className="px-3 py-2 text-right">
                        {formatBytes(item.file.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Uploads are signed with Convex + R2 and synced to a shared file index.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>Shared files</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data === undefined || data.parentDirectory === null}
              onClick={() => {
                if (!data || data.parentDirectory === null) {
                  return;
                }
                navigateToDirectory(data.parentDirectory);
              }}
            >
              <Folder className="mr-2 h-4 w-4" />
              Up
            </Button>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md border bg-muted/30 px-2 py-1">
              {data ? (
                data.breadcrumbs.map((breadcrumb, index) => (
                  <div
                    key={breadcrumb.path || "root"}
                    className="flex shrink-0 items-center gap-1"
                  >
                    {index > 0 ? (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    ) : null}
                    <Button
                      variant={
                        breadcrumb.path === data.currentDirectory ? "secondary" : "ghost"
                      }
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => navigateToDirectory(breadcrumb.path)}
                    >
                      {breadcrumb.name}
                    </Button>
                  </div>
                ))
              ) : (
                <span className="px-2 text-xs text-muted-foreground">Loading path...</span>
              )}
            </div>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this folder"
          />
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Download all files or a specific folder prefix as a ZIP.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={zipPrefix}
                onChange={(event) => setZipPrefix(event.target.value)}
                placeholder="Optional folder prefix, e.g. designs/mockups"
                disabled={isPreparingZip}
                className="min-w-[260px] flex-1"
              />
              <Button
                variant="ghost"
                disabled={isPreparingZip || data === undefined}
                onClick={() =>
                  setZipPrefix(data?.currentDirectory ? data.currentDirectory : "")
                }
              >
                Use current folder
              </Button>
              <Button
                variant={zipRecursive ? "secondary" : "outline"}
                disabled={isPreparingZip}
                onClick={() => setZipRecursive((current) => !current)}
              >
                {zipRecursive ? "Recursive on" : "Recursive off"}
              </Button>
              <Button
                variant="outline"
                disabled={isPreparingZip}
                onClick={() => void handleDownloadZip({})}
              >
                <Archive className="mr-2 h-4 w-4" />
                {isPreparingZip ? "Preparing..." : "Download ZIP"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Recursive mode includes nested subfolders. When off, only files directly
              inside the selected folder are zipped.
            </p>
          </div>
          {data && data.directories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.directories.map((directory) => (
                <Button
                  key={directory.path}
                  variant="outline"
                  size="sm"
                  disabled={isPreparingZip}
                  onClick={() => void handleDownloadZip({ prefix: directory.path })}
                  className="h-7 rounded-full px-3 text-xs"
                >
                  <Folder className="h-3 w-3" />
                  {directory.name}
                </Button>
              ))}
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {data === undefined ? (
            <p className="text-sm text-muted-foreground">Loading files...</p>
          ) : filteredDirectories.length + filteredFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search.trim()
                ? "No matching files or folders in this folder."
                : data.currentDirectory
                  ? "This folder is empty."
                  : "No files yet. Upload the first one."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Size</th>
                    <th className="pb-2 font-medium">Uploader</th>
                    <th className="pb-2 font-medium">Updated</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDirectories.map((directory) => (
                    <tr key={`dir-${directory.path}`} className="border-b align-top">
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => navigateToDirectory(directory.path)}
                          className="inline-flex items-center gap-2 rounded px-1 py-1 text-left text-sm font-medium hover:bg-muted"
                        >
                          <Folder className="h-4 w-4 text-primary" />
                          {directory.name}
                        </button>
                      </td>
                      <td className="py-3 pr-4">Folder</td>
                      <td className="py-3 pr-4">-</td>
                      <td className="py-3 pr-4">-</td>
                      <td className="py-3 pr-4">-</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDownloadZip({ prefix: directory.path })}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            ZIP
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigateToDirectory(directory.path)}
                          >
                            Open
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredFiles.map((file) => (
                    <tr key={file._id} className="border-b align-top">
                      <td className="py-3 pr-4">{file.name}</td>
                      <td className="py-3 pr-4">{file.contentType ?? "unknown"}</td>
                      <td className="py-3 pr-4">{formatBytes(file.size)}</td>
                      <td className="py-3 pr-4">
                        {file.uploaderName ?? file.uploaderEmail ?? "Unknown"}
                      </td>
                      <td className="py-3 pr-4">{formatDate(file.updatedAt)}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </a>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={
                              isDeletingId === file._id ||
                              viewer === undefined ||
                              file.uploaderId !== viewer._id
                            }
                            onClick={() => void handleDelete(file._id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {isDeletingId === file._id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(size: number | undefined) {
  if (size === undefined) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

async function uploadSingleFile(
  item: QueuedUpload,
  baseDirectory: string,
  createUploadUrl: CreateUploadUrlFn,
  finalizeUpload: FinalizeUploadFn,
  commitUpload: CommitUploadFn,
) {
  const { fileName, directory } = splitRelativePath(item.relativePath);
  const uploadDirectory = joinDirectory(baseDirectory, directory);

  const upload = await createUploadUrl({
    fileName,
    directory: uploadDirectory || undefined,
  });

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: item.file.type
      ? {
          "Content-Type": item.file.type,
        }
      : undefined,
    body: item.file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`R2 upload failed with status ${uploadResponse.status}`);
  }

  await finalizeUpload({ key: upload.key });
  await commitUpload({ key: upload.key });
}

function mergeQueuedUploads(
  current: QueuedUpload[],
  nextUploads: QueuedUpload[],
): QueuedUpload[] {
  if (nextUploads.length === 0) {
    return current;
  }

  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];

  for (const item of nextUploads) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  return merged;
}

function filesFromInput(fileList: FileList | null): SelectedUpload[] {
  if (!fileList) {
    return [];
  }

  return Array.from(fileList).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

function toQueuedUpload(upload: SelectedUpload): QueuedUpload | null {
  const normalizedPath = normalizeRelativePath(upload.relativePath, upload.file.name);
  if (!normalizedPath) {
    return null;
  }

  return {
    ...upload,
    relativePath: normalizedPath,
    id: normalizedPath,
  };
}

function normalizeDirectoryPrefix(value: string) {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function normalizeRelativePath(path: string, fallbackFileName: string) {
  const raw = (path || fallbackFileName)
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  if (!raw) {
    return null;
  }

  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  for (const part of parts) {
    if (part === "." || part === "..") {
      return null;
    }
    if (/[\u0000-\u001f\u007f]/.test(part)) {
      return null;
    }
  }

  return parts.join("/");
}

function splitRelativePath(path: string) {
  const parts = path.split("/");
  const fileName = parts.at(-1);
  if (!fileName) {
    throw new Error("Invalid upload path.");
  }
  return {
    fileName,
    directory: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

function joinDirectory(a: string, b: string) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return `${a}/${b}`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error";
}

type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<SelectedUpload[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item as WebkitDataTransferItem).webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    const nestedFiles = await Promise.all(
      entries.map((entry) => collectEntryFiles(entry, "")),
    );
    return nestedFiles.flat();
  }

  return Array.from(dataTransfer.files).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

async function collectEntryFiles(
  entry: FileSystemEntry,
  parentPath: string,
): Promise<SelectedUpload[]> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    return [{ file, relativePath }];
  }

  if (entry.isDirectory) {
    const directoryEntry = entry as FileSystemDirectoryEntry;
    const nextPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const childEntries = await readAllDirectoryEntries(directoryEntry);
    const nested = await Promise.all(
      childEntries.map((childEntry) => collectEntryFiles(childEntry, nextPath)),
    );
    return nested.flat();
  }

  return [];
}

async function readAllDirectoryEntries(
  directoryEntry: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = directoryEntry.createReader();
  const allEntries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      break;
    }
    allEntries.push(...batch);
  }

  return allEntries;
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}
