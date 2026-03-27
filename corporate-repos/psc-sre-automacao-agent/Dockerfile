FROM docker.binarios.intranet.bb.com.br/node:22 as builder

WORKDIR /app

COPY . .

RUN npm install && npm run build

FROM docker.binarios.intranet.bb.com.br/bb/dev/dev-nodejs:22.16.3

USER root

RUN mkdir -p "$HOME/.npm" && \
    chown -R 1001:1001 "$HOME/.npm" 
USER 1001:1001

WORKDIR /app

COPY --from=builder --chown=1001:1001 /app ./

EXPOSE 8080

CMD [ "npm", "start" ]
