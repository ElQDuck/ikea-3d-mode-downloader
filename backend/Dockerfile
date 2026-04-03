FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

RUN mkdir -p /app/downloads && chown pwuser:pwuser /app/downloads

USER pwuser

EXPOSE 3001
CMD ["node", "dist/server.js"]
