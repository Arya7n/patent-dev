FROM python:3.12-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr ghostscript qpdf \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY extract_pdf.py .
ENTRYPOINT ["python", "extract_pdf.py"]
