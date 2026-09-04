# The whole game is static files plus one small Node server, and it has no
# dependencies at all, so there is nothing to install and nothing to build.
FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Only what the server actually serves. Tests and tools stay out of the image.
COPY package.json ./
COPY index.html ./
COPY server/ ./server/
COPY src/ ./src/
COPY styles/ ./styles/

USER node
EXPOSE 8080

# /rooms answers from the relay, so it proves both halves are alive.
HEALTHCHECK --interval=30s --timeout=3s --start-period=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/rooms').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/serve.mjs"]
