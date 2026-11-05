FROM node:24-alpine
WORKDIR /app
COPY dist ./dist
COPY output/server ./server
COPY output/scripts ./scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4174 MOTE_DB_FILE=/data/mote.sqlite
USER node
EXPOSE 4174
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD node -e "fetch('http://127.0.0.1:4174/healthz').then(r=>process.exit(r.status===204?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.js"]
