FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src/ ./src/
COPY tsconfig.json ./
COPY scripts/ ./scripts/

RUN npm run build

RUN mkdir -p /app/downloads && chown pwuser:pwuser /app/downloads

# Install Blender for server-side conversion using official Blender release
USER root
RUN apt-get update && apt-get install -y python3-numpy wget xz-utils ca-certificates && rm -rf /var/lib/apt/lists/*

# Download and unpack official Blender release (change BLENDER_VERSION to upgrade)
ARG BLENDER_VERSION=3.6.4
RUN wget -qO /tmp/blender.tar.xz "https://download.blender.org/release/Blender3.6/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
  && tar -xJf /tmp/blender.tar.xz -C /opt \
  && mv /opt/blender-${BLENDER_VERSION}-linux-x64 /opt/blender \
  && ln -s /opt/blender/blender /usr/local/bin/blender \
  && rm /tmp/blender.tar.xz
USER pwuser

USER pwuser

EXPOSE 3001
CMD ["node", "dist/server.js"]
