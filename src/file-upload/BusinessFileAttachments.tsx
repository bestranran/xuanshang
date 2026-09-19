import { useEffect, useState } from "react";
import { Download, FileText, LoaderCircle, Play, Trash2, UploadCloud } from "lucide-react";
import { abortBusinessFileUpload, completeBusinessFileUpload, getBusinessFileAccessUrl, getBusinessUploadParts, resumeBusinessFileUpload, startBusinessFileUpload } from "wasp/client/operations";
import { Button } from "../client/components/ui/button";
import { ALLOWED_FILE_TYPES, classifyFile, MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENTS_PER_VERSION, MAX_VIDEO_SIZE_BYTES, MAX_VIDEOS_PER_VERSION } from "./validation";

type ReadyFile = { id: string; name: string; type: string; sizeBytes: number; kind: "VIDEO" | "ATTACHMENT" };

export function BusinessFileUploader({ targetType, targetId, onChange }: { targetType: "TASK" | "CONTEST"; targetId: string; onChange: (fileIds: string[]) => void }) {
  const [files, setFiles] = useState<ReadyFile[]>([]);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { onChange(files.map((file) => file.id)); }, [files, onChange]);

  async function uploadOne(file: File) {
    const kind = classifyFile(file.type);
    const storageKey = `business-upload:${targetType}:${targetId}`;
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as { fileId: string; name: string; size: number; type: string } | null;
    let started: any;
    let uploadedParts: Array<{ partNumber: number; etag: string }> = [];
    if (saved && saved.name === file.name && saved.size === file.size && saved.type === file.type) {
      const resumed = await resumeBusinessFileUpload({ fileId: saved.fileId }) as any;
      started = { file: resumed.file, chunkSizeBytes: resumed.chunkSizeBytes, partCount: Math.ceil(file.size / resumed.chunkSizeBytes) };
      uploadedParts = resumed.uploadedParts;
    } else {
      if (saved) await abortBusinessFileUpload({ fileId: saved.fileId }).catch(() => undefined);
      started = await startBusinessFileUpload({ targetType, targetId, fileName: file.name, fileType: file.type as any, sizeBytes: file.size }) as any;
      localStorage.setItem(storageKey, JSON.stringify({ fileId: started.file.id, name: file.name, size: file.size, type: file.type }));
    }
    const fileId = started.file.id as string;
    try {
      const uploadedNumbers = new Set(uploadedParts.map((part) => part.partNumber));
      const partNumbers = Array.from({ length: started.partCount as number }, (_, index) => index + 1).filter((partNumber) => !uploadedNumbers.has(partNumber));
      const signed = partNumbers.length ? await getBusinessUploadParts({ fileId, partNumbers }) as Array<{ partNumber: number; url: string }> : [];
      const completed: Array<{ partNumber: number; etag: string }> = [...uploadedParts];
      for (let offset = 0; offset < signed.length; offset += 3) {
        const batch = signed.slice(offset, offset + 3);
        completed.push(...await Promise.all(batch.map(async ({ partNumber, url }) => {
          const start = (partNumber - 1) * started.chunkSizeBytes;
          const response = await fetch(url, { method: "PUT", body: file.slice(start, Math.min(file.size, start + started.chunkSizeBytes)) });
          if (!response.ok) throw new Error(`第 ${partNumber} 个分片上传失败`);
          const etag = response.headers.get("etag");
          if (!etag) throw new Error("对象存储 CORS 必须暴露 ETag 响应头");
          return { partNumber, etag };
        })));
        setProgress({ name: file.name, percent: Math.round(completed.length / started.partCount * 100) });
      }
      const ready = await completeBusinessFileUpload({ fileId, parts: completed }) as ReadyFile;
      localStorage.removeItem(storageKey);
      setFiles((current) => [...current, ready]);
    } catch (uploadError) {
      throw uploadError;
    }
  }

  async function select(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    event.target.value = "";
    setError("");
    const combined = [...files.map((file) => ({ type: file.type, size: file.sizeBytes, name: file.name })), ...selected];
    if (combined.filter((file) => classifyFile(file.type) === "VIDEO").length > MAX_VIDEOS_PER_VERSION) return setError("每版最多上传 1 个视频");
    if (combined.filter((file) => classifyFile(file.type) === "ATTACHMENT").length > MAX_ATTACHMENTS_PER_VERSION) return setError("每版最多上传 5 个普通附件");
    for (const file of selected) {
      if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) return setError(`不支持 ${file.name} 的文件类型`);
      const limit = classifyFile(file.type) === "VIDEO" ? MAX_VIDEO_SIZE_BYTES : MAX_ATTACHMENT_SIZE_BYTES;
      if (!file.size || file.size > limit) return setError(`${file.name} 超过 ${limit / 1024 / 1024} MB 限制`);
    }
    try {
      for (const file of selected) { setProgress({ name: file.name, percent: 0 }); await uploadOne(file); }
    } catch (uploadError: any) { setError(`${uploadError?.response?.data?.message ?? uploadError?.message ?? "上传失败"}。重新选择同一文件可以续传。`); }
    finally { setProgress(null); }
  }

  async function remove(file: ReadyFile) {
    setError("");
    try { await abortBusinessFileUpload({ fileId: file.id }); setFiles((current) => current.filter((item) => item.id !== file.id)); }
    catch (removeError: any) { setError(removeError?.response?.data?.message ?? removeError?.message ?? "删除失败"); }
  }

  return <div className="space-y-3 rounded-xl border border-dashed p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="font-medium">成果附件</p><p className="text-xs text-muted-foreground">1 个视频（MP4/MOV，最大 500 MB）和 5 个普通附件（单个 20 MB）</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><UploadCloud size={16} />选择文件<input className="sr-only" type="file" multiple accept={ALLOWED_FILE_TYPES.join(",")} disabled={Boolean(progress)} onChange={(event) => void select(event)} /></label></div>
    {progress && <div className="rounded-lg bg-muted p-3 text-sm"><span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={15} />{progress.name}</span><div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">已上传 {progress.percent}%</p></div>}
    {files.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">{file.kind === "VIDEO" ? <Play size={16} /> : <FileText size={16} />}<span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span><button type="button" aria-label={`删除 ${file.name}`} onClick={() => void remove(file)}><Trash2 size={16} /></button></div>)}
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function BusinessFileList({ files }: { files: ReadyFile[] }) {
  if (!files?.length) return null;
  return <div className="mt-3 space-y-2">{files.map((file) => <BusinessFileItem key={file.id} file={file} />)}</div>;
}

function BusinessFileItem({ file }: { file: ReadyFile }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  async function access(download: boolean) {
    setError("");
    try {
      const result = await getBusinessFileAccessUrl({ fileId: file.id, download }) as any;
      if (download) window.open(result.url, "_blank", "noopener,noreferrer"); else setUrl(result.url);
    } catch (accessError: any) { setError(accessError?.response?.data?.message ?? accessError?.message ?? "文件暂时无法访问"); }
  }
  return <div className="rounded-lg border p-3 text-sm">{file.kind === "VIDEO" && url ? <video className="mb-3 max-h-96 w-full rounded-lg bg-black" src={url} controls preload="metadata" onError={() => setError("当前浏览器无法播放该视频，请下载查看")} /> : null}<div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span>{file.kind === "VIDEO" && !url && <Button size="sm" variant="outline" onClick={() => void access(false)}><Play size={14} />播放</Button>}<Button size="sm" variant="outline" onClick={() => void access(true)}><Download size={14} />下载</Button></div>{error && <p className="mt-2 text-xs text-destructive">{error}</p>}</div>;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
