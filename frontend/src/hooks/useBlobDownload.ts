import { useCallback, useState } from "react";
import { triggerBlobDownload } from "@/api/client";
import { useUiStore } from "@/stores/useUiStore";

export function useBlobDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const notify = useUiStore((s) => s.notify);

  const download = useCallback(
    async (fetcher: () => Promise<Blob>, filename: string, successMessage?: string, errorMessage?: string) => {
      setIsDownloading(true);
      try {
        const blob = await fetcher();
        triggerBlobDownload(blob, filename);
        if (successMessage) {
          notify({ tone: "success", title: successMessage });
        }
      } catch (err) {
        notify({
          tone: "error",
          title: errorMessage ?? (err instanceof Error ? err.message : "Download failed"),
        });
      } finally {
        setIsDownloading(false);
      }
    },
    [notify]
  );

  return { isDownloading, download };
}
