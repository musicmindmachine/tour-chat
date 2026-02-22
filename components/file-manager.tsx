"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronRight,
  Download,
  Folder,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
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

type UploadLifecycleState =
  | "queued"
  | "uploading"
  | "finalizing"
  | "done"
  | "failed";

type UploadProgressState = {
  status: UploadLifecycleState;
  uploadedBytes: number;
  totalBytes: number;
  error?: string;
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

type UploadProgressFn = (uploadedBytes: number, totalBytes: number) => void;

type UploadPhaseFn = () => void;

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
  const [uploadProgressById, setUploadProgressById] = useState<
    Record<string, UploadProgressState>
  >({});
  const [uploadPopoverOpen, setUploadPopoverOpen] = useState(false);
  const directoryPrefix = "";
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [search, setSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<Id<"files"> | null>(null);
  const [isDeletingPrefix, setIsDeletingPrefix] = useState<string | null>(null);
  const zipPrefix = "";
  const [isPreparingZip, setIsPreparingZip] = useState(false);

  const data = useQuery(api.files.listShared, {
    directory: currentDirectory || undefined,
  });
  const viewer = useQuery(api.users.viewer);
  const createUploadUrl = useMutation(api.files.createUploadUrl);
  const finalizeUpload = useAction(api.files.finalizeUpload);
  const commitUpload = useMutation(api.files.commitUpload);
  const deleteFile = useMutation(api.files.deleteFile);
  const deletePrefix = useMutation(api.files.deletePrefix);
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
    return data.files.filter((file) => file.name.toLowerCase().includes(searchText));
  }, [data, search]);

  const uploadSummary = useMemo(() => {
    const totalFiles = queuedUploads.length;
    if (totalFiles === 0) {
      return {
        totalFiles: 0,
        remainingFiles: 0,
        totalBytes: 0,
        remainingBytes: 0,
        overallPercent: 0,
      };
    }

    let remainingFiles = 0;
    let totalBytes = 0;
    let remainingBytes = 0;

    for (const item of queuedUploads) {
      const progress =
        uploadProgressById[item.id] ?? buildInitialUploadProgress(item.file.size);
      const total = progress.totalBytes || item.file.size;
      const uploaded = Math.min(progress.uploadedBytes, total);

      totalBytes += total;

      if (progress.status === "done") {
        continue;
      }

      remainingFiles += 1;
      if (progress.status === "uploading" || progress.status === "finalizing") {
        remainingBytes += Math.max(total - uploaded, 0);
      } else {
        remainingBytes += total;
      }
    }

    const completedBytes = Math.max(totalBytes - remainingBytes, 0);

    return {
      totalFiles,
      remainingFiles,
      totalBytes,
      remainingBytes,
      overallPercent: totalBytes > 0 ? (completedBytes / totalBytes) * 100 : 0,
    };
  }, [queuedUploads, uploadProgressById]);

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
    setUploadProgressById((current) => {
      const next = { ...current };
      for (const item of normalized) {
        if (!next[item.id]) {
          next[item.id] = buildInitialUploadProgress(item.file.size);
        }
      }
      return next;
    });
    setUploadPopoverOpen(true);
  }

  function clearQueue() {
    if (isUploading) {
      return;
    }
    setQueuedUploads([]);
    setUploadProgressById({});
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

    setUploadPopoverOpen(true);
    setIsUploading(true);
    try {
      const batch = [...queuedUploads];
      const failedIds = new Set<string>();
      const baseDirectory = normalizeDirectoryPrefix(directoryPrefix);
      const workerCount = Math.min(3, batch.length);
      let successfulCount = 0;
      let firstFailure = "";
      let nextIndex = 0;

      setUploadProgressById((current) => {
        const next = { ...current };
        for (const item of batch) {
          next[item.id] = buildInitialUploadProgress(item.file.size);
        }
        return next;
      });

      const runWorker = async () => {
        while (nextIndex < batch.length) {
          const item = batch[nextIndex];
          nextIndex += 1;

          try {
            setUploadProgressById((current) => ({
              ...current,
              [item.id]: {
                ...(current[item.id] ?? buildInitialUploadProgress(item.file.size)),
                status: "uploading",
                totalBytes: item.file.size,
                error: undefined,
              },
            }));

            await uploadSingleFile(
              item,
              baseDirectory,
              createUploadUrl,
              finalizeUpload,
              commitUpload,
              (uploadedBytes, totalBytes) => {
                setUploadProgressById((current) => ({
                  ...current,
                  [item.id]: {
                    ...(current[item.id] ?? buildInitialUploadProgress(item.file.size)),
                    status: "uploading",
                    uploadedBytes: Math.min(uploadedBytes, totalBytes || item.file.size),
                    totalBytes: totalBytes || item.file.size,
                    error: undefined,
                  },
                }));
              },
              () => {
                setUploadProgressById((current) => ({
                  ...current,
                  [item.id]: {
                    ...(current[item.id] ?? buildInitialUploadProgress(item.file.size)),
                    status: "finalizing",
                    error: undefined,
                  },
                }));
              },
            );

            successfulCount += 1;
            setUploadProgressById((current) => ({
              ...current,
              [item.id]: {
                ...(current[item.id] ?? buildInitialUploadProgress(item.file.size)),
                status: "done",
                uploadedBytes: item.file.size,
                totalBytes: item.file.size,
                error: undefined,
              },
            }));
          } catch (error) {
            failedIds.add(item.id);
            const message = toErrorMessage(error);
            if (!firstFailure) {
              firstFailure = message;
            }
            setUploadProgressById((current) => ({
              ...current,
              [item.id]: {
                ...(current[item.id] ?? buildInitialUploadProgress(item.file.size)),
                status: "failed",
                uploadedBytes: 0,
                totalBytes: item.file.size,
                error: message,
              },
            }));
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      if (failedIds.size > 0) {
        setQueuedUploads(batch.filter((item) => failedIds.has(item.id)));
        setUploadProgressById((current) => {
          const next: Record<string, UploadProgressState> = {};
          for (const item of batch) {
            if (!failedIds.has(item.id)) {
              continue;
            }
            next[item.id] =
              current[item.id] ?? buildInitialUploadProgress(item.file.size, "failed");
          }
          return next;
        });
        toast.error(
          `Uploaded ${successfulCount}/${batch.length}. ${failedIds.size} failed. ${firstFailure}`,
        );
      } else {
        setQueuedUploads([]);
        setUploadProgressById({});
        setUploadPopoverOpen(false);
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

  async function handleDeletePrefix(prefix: string) {
    const normalizedPrefix = normalizeDirectoryPrefix(prefix);
    if (!normalizedPrefix) {
      return;
    }

    const confirmed = window.confirm(
      `Delete all files under "${normalizedPrefix}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingPrefix(normalizedPrefix);
    try {
      const result = await deletePrefix({ prefix: normalizedPrefix });
      if (result.deletedCount === 0) {
        toast.success(`"${normalizedPrefix}" is already empty.`);
      } else {
        toast.success(
          `Deleted ${result.deletedCount} file${result.deletedCount === 1 ? "" : "s"} from ${result.prefix}.`,
        );
      }

      if (
        currentDirectory === normalizedPrefix ||
        currentDirectory.startsWith(`${normalizedPrefix}/`)
      ) {
        setCurrentDirectory(getParentDirectoryPath(normalizedPrefix));
      }
    } catch (error) {
      console.error(error);
      toast.error(`Folder delete failed: ${toErrorMessage(error)}`);
    } finally {
      setIsDeletingPrefix(null);
    }
  }

  async function handleDownloadZip(prefixOverride?: string) {
    if (isPreparingZip) {
      return;
    }

    setIsPreparingZip(true);
    try {
      const prefix = normalizeDirectoryPrefix(prefixOverride ?? zipPrefix);
      const result = await createZipDownloadUrl({
        prefix: prefix || undefined,
        recursive: true,
      });
      window.location.assign(result.downloadUrl);
      toast.success(`Starting ${result.filename}`);
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
    <div className="space-y-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shared files</h1>
          <p className="text-sm text-muted-foreground">
            Dropbox-style file browsing with folder uploads, ZIP downloads, and prefix
            cleanup.
          </p>
        </div>

        <Popover
          open={uploadPopoverOpen}
          onOpenChange={(nextOpen) => {
            if (isUploading && !nextOpen) {
              return;
            }
            setUploadPopoverOpen(nextOpen);
          }}
        >
          <PopoverTrigger asChild>
            <Button>
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,34rem)] space-y-3 p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Upload files and folders</h2>
              <p className="text-xs text-muted-foreground">
                Drag files or folders in, then upload with preserved paths.
              </p>
            </div>

            {/* <Input
              value={directoryPrefix}
              onChange={(event) => setDirectoryPrefix(event.target.value)}
              placeholder="Optional path prefix, e.g. designs/mockups"
              disabled={isUploading}
            /> */}

            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 bg-muted/20",
              )}
              onDragEnter={handleDropZoneDrag}
              onDragOver={handleDropZoneDrag}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(event) => void handleDropZoneDrop(event)}
            >
              <p className="text-xs font-medium">
                Drop files and folders here, or choose from the picker.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => filePickerRef.current?.click()}
              >
                Choose files
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => folderPickerRef.current?.click()}
              >
                Choose folder
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading || queuedUploads.length === 0}
                onClick={clearQueue}
              >
                Clear queue
              </Button>
            </div>

            {queuedUploads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files queued yet.</p>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border bg-muted/30 p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {uploadSummary.remainingFiles} / {uploadSummary.totalFiles} files left
                    </span>
                    <span>
                      {formatBytes(uploadSummary.remainingBytes)} / {formatBytes(uploadSummary.totalBytes)}
                    </span>
                  </div>
                  <Progress value={uploadSummary.overallPercent} className="mt-2 h-2" />
                </div>

                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {queuedUploads.map((item) => {
                    const progress =
                      uploadProgressById[item.id] ??
                      buildInitialUploadProgress(item.file.size);
                    const statusLabel = uploadStatusLabel(progress.status);
                    const progressPercent = toProgressPercent(
                      progress.uploadedBytes,
                      progress.totalBytes,
                      progress.status,
                    );
                    const uploadedForLabel =
                      progress.status === "uploading" || progress.status === "finalizing"
                        ? Math.min(progress.uploadedBytes, progress.totalBytes)
                        : progress.status === "done"
                          ? progress.totalBytes
                          : 0;

                    return (
                      <div key={item.id} className="rounded-md border bg-background p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-mono text-[11px]">{item.relativePath}</p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              uploadStatusBadgeClasses(progress.status),
                            )}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>
                            {formatBytes(uploadedForLabel)} / {formatBytes(progress.totalBytes)}
                          </span>
                          {progress.error ? (
                            <span className="truncate text-destructive">{progress.error}</span>
                          ) : null}
                        </div>
                        <Progress
                          value={progressPercent}
                          className={cn(
                            "mt-1 h-1.5",
                            progress.status === "failed" &&
                              "bg-destructive/20 [&_[data-slot=progress-indicator]]:bg-destructive",
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              disabled={isUploading || queuedUploads.length === 0}
              onClick={() => void handleUpload()}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isUploading
                ? "Uploading..."
                : `Upload ${queuedUploads.length} item${queuedUploads.length === 1 ? "" : "s"}`}
            </Button>

            <p className="text-xs text-muted-foreground">
              Uploads are signed with Convex + R2 and synced to a shared file index.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      <Card className="min-h-[calc(100vh-15rem)]">
        <CardHeader className="space-y-4">
          <CardTitle>File browser</CardTitle>

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
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md border bg-muted/30 px-2 py-1">
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
              Folder ZIP downloads are always recursive.
            </p>
            <div className="flex flex-wrap gap-2">
              {/* <Input
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
              </Button> */}
              <Button
                variant="outline"
                disabled={isPreparingZip}
                onClick={() => void handleDownloadZip()}
              >
                <Archive className="mr-2 h-4 w-4" />
                {isPreparingZip ? "Preparing..." : "Download ZIP"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex h-full flex-col">
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
            <div className="flex-1 overflow-auto rounded-md border bg-background">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">Uploader</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDirectories.map((directory) => (
                    <tr
                      key={`dir-${directory.path}`}
                      className="border-b align-top transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => navigateToDirectory(directory.path)}
                          className="inline-flex items-center gap-2 rounded px-1 py-1 text-left text-sm font-medium hover:bg-muted"
                        >
                          <Folder className="h-4 w-4 text-primary" />
                          {directory.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 pr-4">Folder</td>
                      <td className="px-3 py-3 pr-4">-</td>
                      <td className="px-3 py-3 pr-4">-</td>
                      <td className="px-3 py-3 pr-4">-</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPreparingZip}
                            onClick={() => void handleDownloadZip(directory.path)}
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
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isDeletingPrefix === directory.path}
                            onClick={() => void handleDeletePrefix(directory.path)}
                          >
                            {isDeletingPrefix === directory.path ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            {isDeletingPrefix === directory.path
                              ? "Deleting..."
                              : "Delete folder"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredFiles.map((file) => (
                    <tr
                      key={file._id}
                      className="border-b align-top transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3 pr-4">{file.name}</td>
                      <td className="px-3 py-3 pr-4">{file.contentType ?? "unknown"}</td>
                      <td className="px-3 py-3 pr-4">{formatBytes(file.size)}</td>
                      <td className="px-3 py-3 pr-4">
                        {file.uploaderName ?? file.uploaderEmail ?? "Unknown"}
                      </td>
                      <td className="px-3 py-3 pr-4">{formatDate(file.updatedAt)}</td>
                      <td className="px-3 py-3 text-right">
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
                            {isDeletingId === file._id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
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

function buildInitialUploadProgress(
  totalBytes: number,
  status: UploadLifecycleState = "queued",
): UploadProgressState {
  return {
    status,
    uploadedBytes: status === "done" ? totalBytes : 0,
    totalBytes,
  };
}

function uploadStatusLabel(status: UploadLifecycleState) {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "finalizing":
      return "Finalizing";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}

function uploadStatusBadgeClasses(status: UploadLifecycleState) {
  switch (status) {
    case "uploading":
      return "bg-primary/10 text-primary";
    case "finalizing":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "done":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "queued":
    default:
      return "bg-muted text-muted-foreground";
  }
}

function toProgressPercent(
  uploadedBytes: number,
  totalBytes: number,
  status: UploadLifecycleState,
) {
  if (status === "done") {
    return 100;
  }
  if (status === "queued" || status === "failed") {
    return 0;
  }
  if (!totalBytes) {
    return 0;
  }

  return Math.max(0, Math.min(100, (uploadedBytes / totalBytes) * 100));
}

function getParentDirectoryPath(path: string) {
  if (!path) {
    return "";
  }

  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
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
  onProgress?: UploadProgressFn,
  onFinalizeStart?: UploadPhaseFn,
) {
  const { fileName, directory } = splitRelativePath(item.relativePath);
  const uploadDirectory = joinDirectory(baseDirectory, directory);

  const upload = await createUploadUrl({
    fileName,
    directory: uploadDirectory || undefined,
  });

  await uploadFileWithProgress(upload.uploadUrl, item.file, onProgress);
  onFinalizeStart?.();

  await finalizeUpload({ key: upload.key });
  await commitUpload({ key: upload.key });
}

async function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress?: UploadProgressFn,
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);

    if (file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    }

    xhr.upload.onprogress = (event) => {
      if (!onProgress) {
        return;
      }
      const totalBytes = event.lengthComputable ? event.total : file.size;
      onProgress(Math.min(event.loaded, totalBytes), totalBytes);
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload."));
    };

    xhr.onabort = () => {
      reject(new Error("Upload was aborted."));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size, file.size);
        resolve();
        return;
      }
      reject(new Error(`R2 upload failed with status ${xhr.status}`));
    };

    xhr.send(file);
  });
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
