FROM python:3.13-slim

WORKDIR /app

COPY requirements-base.txt ./
RUN pip install --no-cache-dir -r requirements-base.txt

COPY common ./common
COPY ml ./ml

ENV PYTHONPATH=/app
EXPOSE 8003

CMD ["uvicorn", "ml.main:app", "--host", "0.0.0.0", "--port", "8003"]
