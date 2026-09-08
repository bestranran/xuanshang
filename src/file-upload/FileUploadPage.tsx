import { FormEvent, useEffect, useState } from "react";
import {
  addFileToDb,
  createFileUploadUrl,
  deleteFile,
  getAllFilesByUser,
  getDownloadFileSignedURL,
  useQuery,
} from "wasp/client/operations";
import type { File } from "wasp/entities";

import { Download, Trash } from "lucide-react";
import { Alert, AlertDescription } from "../client/components/ui/alert";
import { Button } from "../client/components/ui/button";
import { Card, CardContent, CardTitle } from "../client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../client/components/ui/dialog";
import { Input } from "../client/components/ui/input";
import { Label } from "../client/components/ui/label";
import { Progress } from "../client/components/ui/progress";
import { toast } from "../client/hooks/use-toast";
import { cn } from "../client/utils";
import { uploadFileWithProgress, validateFile } from "./fileUploading";
import { ALLOWED_FILE_TYPES } from "./validation";

export function FileUploadPage() {
  const [fileKeyForS3, setFileKeyForS3] = useState<File["s3Key"]>("");
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const [fileToDelete, setFileToDelete] = useState<Pick<
    File,
    "id" | "s3Key" | "name"
  > | null>(null);

  const allUserFiles = useQuery(getAllFilesByUser, undefined, {
    // We disable automatic refetching because otherwise files would be refetched after `createFile` is called and the S3 URL is returned,
    // which happens before the file is actually fully uploaded. Instead, we manually (re)fetch on mount and after the upload is complete.
    enabled: false,
  });
  const { isLoading: isDownloadUrlLoading, refetch: refetchDownloadUrl } =
    useQuery(
      getDownloadFileSignedURL,
      { s3Key: fileKeyForS3 },
      { enabled: false },
    );

  useEffect(() => {
    allUserFiles.refetch();
  }, [allUserFiles]);

  useEffect(() => {
    if (fileKeyForS3.length > 0) {
      refetchDownloadUrl()
        .then((urlQuery) => {
          switch (urlQuery.status) {
            case "error":
              console.error("获取下载地址失败", urlQuery.error);
              toast({
                title: "获取下载链接失败",
                description: "请稍后重试。",
                variant: "destructive",
              });
              return;
            case "success":
              window.open(urlQuery.data, "_blank");
              return;
          }
        })
        .finally(() => {
          setFileKeyForS3("");
        });
    }
  }, [fileKeyForS3, refetchDownloadUrl]);

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    try {
      e.preventDefault();

      const formElement = e.target;
      if (!(formElement instanceof HTMLFormElement)) {
        throw new Error("提交内容不是有效表单");
      }

      const formData = new FormData(formElement);
      const formDataFileUpload = formData.get("file-upload");

      if (
        !formDataFileUpload ||
        !(formDataFileUpload instanceof File) ||
        formDataFileUpload.size === 0
      ) {
        toast({
          title: "未选择文件",
          description: "请选择要上传的文件。",
          variant: "destructive",
        });
        return;
      }

      const file = validateFile(formDataFileUpload);

      const { s3UploadUrl, s3UploadFields, s3Key } = await createFileUploadUrl({
        fileType: file.type,
        fileName: file.name,
      });

      await uploadFileWithProgress({
        file,
        s3UploadUrl,
        s3UploadFields,
        setUploadProgressPercent,
      });

      await addFileToDb({
        s3Key,
        fileType: file.type,
        fileName: file.name,
      });

      formElement.reset();
      allUserFiles.refetch();
      toast({
        title: "上传成功",
        description: "文件已成功上传。",
      });
    } catch (error) {
      console.error("上传文件失败：", error);
      const errorMessage =
        error instanceof Error ? error.message : "上传文件失败。";
      toast({
        title: "上传文件失败",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setUploadProgressPercent(0);
    }
  };

  const handleDelete = async ({ id, name }: Pick<File, "id" | "name">) => {
    try {
      await deleteFile({ id });
      toast({
        title: "文件已删除",
        description: (
          <span>
            文件 <strong>{name}</strong> 已删除。
          </span>
        ),
      });
      allUserFiles.refetch();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "删除文件失败。";
      toast({
        title: "操作失败",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setFileToDelete(null);
    }
  };

  return (
    <>
      <div className="py-10 lg:mt-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-foreground mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="text-primary">AWS</span> 文件上传
            </h2>
          </div>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-center text-lg leading-8">
            将任务成果附件安全上传到 AWS S3，并在这里查看、下载或删除。
          </p>
          <Card className="my-8">
            <CardContent className="mx-auto my-10 space-y-10 px-4 py-8 sm:max-w-lg">
              <form onSubmit={handleUpload} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="file-upload"
                    className="text-foreground text-sm font-medium"
                  >
                    选择要上传的文件
                  </Label>
                  <Input
                    type="file"
                    id="file-upload"
                    name="file-upload"
                    accept={ALLOWED_FILE_TYPES.join(",")}
                    className="cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <Button
                    type="submit"
                    disabled={uploadProgressPercent > 0}
                    className="w-full"
                  >
                    {uploadProgressPercent > 0
                      ? `正在上传 ${uploadProgressPercent}%`
                      : "上传"}
                  </Button>
                  {uploadProgressPercent > 0 && (
                    <Progress
                      value={uploadProgressPercent}
                      className="w-full"
                    />
                  )}
                </div>
              </form>
              <div className="border-border border-b-2"></div>
              <div className="col-span-full space-y-4">
                <CardTitle className="text-foreground text-xl font-bold">
                  已上传文件
                </CardTitle>
                {allUserFiles.isLoading && (
                  <p className="text-muted-foreground">正在加载…</p>
                )}
                {allUserFiles.error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      加载失败：{allUserFiles.error.message}
                    </AlertDescription>
                  </Alert>
                )}
                {!!allUserFiles.data &&
                allUserFiles.data.length > 0 &&
                !allUserFiles.isLoading ? (
                  <div className="space-y-3">
                    {allUserFiles.data.map((file: File) => (
                      <Card key={file.s3Key} className="p-4">
                        <div
                          className={cn(
                            "flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center",
                            {
                              "opacity-70":
                                file.s3Key === fileKeyForS3 &&
                                isDownloadUrlLoading,
                            },
                          )}
                        >
                          <p className="text-foreground font-medium">
                            {file.name}
                          </p>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              onClick={() => setFileKeyForS3(file.s3Key)}
                              disabled={
                                file.s3Key === fileKeyForS3 &&
                                isDownloadUrlLoading
                              }
                              variant="outline"
                              size="sm"
                            >
                              <Download className="h-5 w-5" />
                            </Button>
                            <Button
                              onClick={() => setFileToDelete(file)}
                              variant="outline"
                              size="sm"
                              aria-label="删除文件"
                            >
                              <Trash className="text-destructive h-5 w-5" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center">
                    暂无已上传文件
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {fileToDelete && (
        <Dialog
          open={!!fileToDelete}
          onOpenChange={(isOpen) => !isOpen && setFileToDelete(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除文件</DialogTitle>
              <DialogDescription>
                确定要删除 <strong>{fileToDelete.name}</strong> 吗？此操作无法撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFileToDelete(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(fileToDelete)}
              >
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
