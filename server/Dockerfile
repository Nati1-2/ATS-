FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# Uploaded CVs and logos live on a volume, outside the image
ENV UPLOAD_DIR=/data/uploads PORT=5000
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
CMD ["node", "src/index.js"]
