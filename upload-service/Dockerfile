FROM node:22.16-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY upload-service ./upload-service
RUN mkdir /data && chown node:node /data
USER node
ENV UPLOAD_HOST=0.0.0.0 UPLOAD_DATA_DIR=/data
EXPOSE 8787
CMD ["node", "upload-service/server.mjs"]
