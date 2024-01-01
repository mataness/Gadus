FROM nikolaik/python-nodejs
RUN mkdir -p /opt/app/assets
WORKDIR /opt/app
RUN apt-get update && apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
COPY ./package.json ./package-lock.json tsconfig.json .
RUN npm install && npm install typescript -g
COPY src/ ./src
COPY models/ ./models
RUN tsc
EXPOSE 3000
CMD [ "node", "assets/index.js"]