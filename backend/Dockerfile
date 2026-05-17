FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 (pdfplumber용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpoppler-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 파일 저장 디렉토리 생성
RUN mkdir -p /data/uploads /data/outputs

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
