FROM node:lts-slim

WORKDIR /usr/src/app

COPY package* /usr/src/app
RUN npm install

VOLUME /tmp/foo

COPY ./ /usr/src/app
RUN npm run build