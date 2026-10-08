"""Extract PDF text and top-left bounding boxes with PyMuPDF."""

import json
import sys

import fitz


def main() -> None:
    source, destination = sys.argv[1], sys.argv[2]
    document = fitz.open(source)
    pages = []
    for index, page in enumerate(document, start=1):
        items = []
        lines = []
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
                if not text:
                    continue
                x0, y0, x1, y1 = line["bbox"]
                items.append(
                    {
                        "text": text,
                        "bbox": {
                            "x": x0,
                            "y": y0,
                            "width": x1 - x0,
                            "height": y1 - y0,
                        },
                    }
                )
                lines.append(text)
        pages.append(
            {
                "pageNumber": index,
                "width": page.rect.width,
                "height": page.rect.height,
                "text": "\n".join(lines),
                "items": items,
            }
        )
    metadata = document.metadata or {}
    payload = {
        "pageCount": document.page_count,
        "metadata": {"title": metadata.get("title") or "", "author": metadata.get("author") or ""},
        "pages": pages,
    }
    with open(destination, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


if __name__ == "__main__":
    main()
