FROM node:22-alpine

# 安装 JRE 17 和 git
RUN apk add --no-cache openjdk17-jre-headless git

WORKDIR /app

# 拷贝依赖配置
COPY package*.json ./
RUN npm install

# 拷贝源码
COPY . .

# 环境变量默认值
ENV DATA_ROOT=/app/artifacts
ENV SYNC_INTERVAL=21600

CMD ["node", "index.js"]
