FROM node:22-alpine

RUN apk add --no-cache openjdk17-jre-headless git

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV DATA_ROOT=/app/data
ENV SYNC_INTERVAL=600

CMD ["npm", "run", "start"]
