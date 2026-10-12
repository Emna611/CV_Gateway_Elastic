# Moteur Flask. La cible `test` ne charge pas Torch (CI).
# L'image runtime installe Flask/OpenCV ; PyTorch se monte via
# INSTALL_ML=1 au build, ou le venv hôte hors Docker.

FROM python:3.11-slim-bookworm AS test
WORKDIR /app
COPY app.py config.yaml ./
COPY engine ./engine
RUN python -m py_compile app.py \
    && python -m py_compile $(find engine -name '*.py')

FROM python:3.11-slim-bookworm AS runtime
ARG INSTALL_ML=0
# Deno : yt-dlp s'en sert pour déchiffrer les signatures YouTube (EJS).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 ffmpeg ca-certificates curl unzip \
    && curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
        -o /tmp/deno.zip \
    && unzip -o /tmp/deno.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/deno \
    && rm /tmp/deno.zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir flask opencv-python-headless pyyaml requests "yt-dlp[default]" \
    && if [ "$INSTALL_ML" = "1" ]; then \
         pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
         && pip install --no-cache-dir ultralytics; \
       fi

COPY app.py config.yaml ./
COPY engine ./engine

ENV ENGINE_HOST=0.0.0.0
ENV ENGINE_PORT=5000
EXPOSE 5000
CMD ["python", "app.py"]
