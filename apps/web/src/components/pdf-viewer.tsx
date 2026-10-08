"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { apiBlob } from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Highlight = { page: number; bbox: { x: number; y: number; width: number; height: number } | null };

export function PdfViewer({
  documentId,
  highlight,
}: {
  documentId: string | null;
  highlight?: Highlight | null;
}) {
  const [file, setFile] = useState<Blob | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(612);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    apiBlob(`/documents/${documentId}/file`)
      .then((blob) => {
        if (!cancelled) setFile(blob);
      })
      .catch(() => {
        if (!cancelled) setError("The document could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (highlight?.page) setPage(highlight.page);
  }, [highlight?.page]);

  if (!documentId) return <div className="p-6 text-sm text-stone-500">Select a document to open the viewer.</div>;
  if (error) return <div className="p-6 text-sm text-rose-800">{error}</div>;
  if (!file) return <div className="p-6 text-sm text-stone-500">Opening PDF…</div>;

  const scale = (640 * zoom) / pageWidth;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
        <button onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
        <span>
          Page {page} / {pages}
        </span>
        <button onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button>
        <button onClick={() => setZoom((current) => Math.max(0.6, current - 0.1))}>−</button>
        <button onClick={() => setZoom((current) => Math.min(2, current + 0.1))}>+</button>
        {highlight && !highlight.bbox ? (
          <span className="text-xs text-stone-500">Showing the source page. Exact highlight coordinates were not available.</span>
        ) : null}
      </div>
      <div className="overflow-auto bg-stone-200 p-4">
        <Document file={file} onLoadSuccess={(pdf) => setPages(pdf.numPages)}>
          <div className="relative inline-block">
            <Page
              pageNumber={page}
              width={640 * zoom}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(loaded) => setPageWidth(loaded.originalWidth || loaded.width)}
            />
            {highlight?.bbox && highlight.page === page ? (
              <div
                className="pointer-events-none absolute border border-pine bg-emerald-300/40"
                style={{
                  left: highlight.bbox.x * scale,
                  top: highlight.bbox.y * scale,
                  width: highlight.bbox.width * scale,
                  height: highlight.bbox.height * scale,
                }}
              />
            ) : null}
          </div>
        </Document>
      </div>
    </div>
  );
}
