FROM node:22-alpine

RUN apk add --no-cache openjdk17-jre-headless git

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV DATA_ROOT=/app/data
ENV WEBHOOK_PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start"]
