# The whole game is static files plus one small Node server, and it has no
# dependencies at all, so there is nothing to install and nothing to build.
# Pinned by digest (node:24-alpine, all architectures) so a rebuild months
# from now starts from exactly this image rather than whatever the tag has
# since become. Dependabot proposes new digests weekly (never a new Node major);
# the live check on the deploy proves one boots.
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

ENV NODE_ENV=production
ENV PORT=8080
# Where the world directory is kept. Mount something here to keep worlds across
# a redeploy; without a mount the game still works, it just forgets which
# worlds exist (the players' own devices do not).
ENV DATA_DIR=/app/data
ENV WORLD_TTL_DAYS=14

WORKDIR /app

# Exactly INPUTS in server/buildid.mjs (tests/deploy-contract.test.mjs checks):
# the server hashes these files at start, so /version can only match the id CI
# computes if the image holds the same files. Tests and tools stay out.
COPY Dockerfile package.json ./
COPY index.html ./
COPY stats.html ./
COPY map.html ./
COPY server/ ./server/
COPY src/ ./src/
COPY styles/ ./styles/
COPY icons/ ./icons/
COPY site.webmanifest ./

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 8080

# /rooms answers from the relay, so it proves both halves are alive.
HEALTHCHECK --interval=30s --timeout=3s --start-period=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/rooms').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/serve.mjs"]
