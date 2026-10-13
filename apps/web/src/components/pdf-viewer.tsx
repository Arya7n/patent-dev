"use client";

import { useEffect, useRef, useState } from "react";
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
  const frame = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(612);
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    if (!documentId) {
      setFile(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setFile(null);
    setError(null);
    setPage(1);
    setZoom(1);
    apiBlob(`/documents/${documentId}/file`)
      .then((blob) => {
        if (!cancelled) setFile(blob);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error && reason.message ? reason.message : "The document could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (highlight?.page) setPage(highlight.page);
  }, [highlight?.page]);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => setFrameWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [file, documentId]);

  const fitted = Math.max(frameWidth - 48, 240);
  const displayWidth = Math.round(fitted * zoom);
  const scale = pageWidth > 0 ? displayWidth / pageWidth : 1;

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-200/70">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-sm">
        <div className="flex items-center gap-1">
          <button className="rounded border border-line bg-white px-2 py-1" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            Previous
          </button>
          <span className="min-w-[5.5rem] text-center text-xs text-stone-600">
            {pages > 0 ? `Page ${page} / ${pages}` : "Page"}
          </span>
          <button className="rounded border border-line bg-white px-2 py-1" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages}>
            Next
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded border border-line bg-white px-2 py-1 text-xs" onClick={() => setZoom(1)}>
            Fit width
          </button>
          <button className="rounded border border-line bg-white px-2 py-1" onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))}>
            −
          </button>
          <span className="w-12 text-center text-xs text-stone-600">{Math.round(zoom * 100)}%</span>
          <button className="rounded border border-line bg-white px-2 py-1" onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}>
            +
          </button>
        </div>
        {highlight && !highlight.bbox ? (
          <span className="text-xs text-stone-500">Showing the source page. Exact highlight coordinates were not available.</span>
        ) : null}
      </div>
      <div ref={frame} className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {!documentId ? <p className="text-sm text-stone-500">Select a document to open the viewer.</p> : null}
        {error ? <p className="text-sm text-rose-800">{error}</p> : null}
        {documentId && !error && !file ? <p className="text-sm text-stone-500">Opening PDF…</p> : null}
        {file && frameWidth > 0 ? (
          <Document file={file} onLoadSuccess={(pdf) => setPages(pdf.numPages)} loading={<p className="text-sm text-stone-500">Rendering PDF…</p>}>
            <div className="mx-auto w-fit bg-white shadow-md">
              <div className="relative">
                <Page
                  pageNumber={page}
                  width={displayWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onLoadSuccess={(loaded) => setPageWidth(loaded.originalWidth || loaded.width)}
                />
                {highlight?.bbox && highlight.page === page ? (
                  <div
                    className="pointer-events-none absolute border-2 border-pine bg-emerald-300/40"
                    style={{
                      left: highlight.bbox.x * scale,
                      top: highlight.bbox.y * scale,
                      width: highlight.bbox.width * scale,
                      height: highlight.bbox.height * scale,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </Document>
        ) : null}
      </div>
    </div>
  );
}
