FROM node:22-alpine AS whisper-builder

ARG WHISPER_CPP_VERSION=v1.9.2
RUN apk add --no-cache build-base cmake git \
  && git clone --depth 1 --branch "${WHISPER_CPP_VERSION}" https://github.com/ggml-org/whisper.cpp.git /src/whisper.cpp \
  && cmake -S /src/whisper.cpp -B /src/whisper.cpp/build \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_SERVER=OFF \
    -DGGML_NATIVE=OFF \
    -DGGML_AVX=OFF \
    -DGGML_AVX2=OFF \
    -DGGML_FMA=OFF \
    -DGGML_F16C=OFF \
  && cmake --build /src/whisper.cpp/build --config Release -j2

FROM node:22-alpine

RUN apk add --no-cache curl ffmpeg libgomp libstdc++ \
  && mkdir -p /models \
  && curl --fail --location --retry 3 --output /models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
COPY --from=whisper-builder /src/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
WORKDIR /app
COPY index.mjs /app/index.mjs
EXPOSE 8787
CMD ["node", "/app/index.mjs"]
