FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js server-lan.js server-diagnostics.js server-assets.js server-deployment.js server-activity.js server-voice.js bots.js ./
COPY shared ./shared
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210
EXPOSE 3210
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3210)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
