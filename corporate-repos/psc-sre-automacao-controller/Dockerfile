FROM docker.binarios.intranet.bb.com.br/node:22 as builder

WORKDIR /app

COPY . .

RUN npm install && npm run build

FROM docker.binarios.intranet.bb.com.br/bb/dev/dev-nodejs:22.16.3

USER root

RUN mkdir -p "$HOME/.npm" && \
    chown -R 1001:1001 "$HOME/.npm" 

USER 1001:0

WORKDIR /app

EXPOSE 3000

COPY --chown=1001:0 . .

RUN chgrp -R 0 /app && chmod -R g=u /app

ENV ACCESS_STDOUT=1

CMD ["npm", "run", "start"]
