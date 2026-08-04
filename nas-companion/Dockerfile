FROM node:22-alpine

RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY index.mjs /app/index.mjs
CMD ["node", "/app/index.mjs"]
