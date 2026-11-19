# STAGE 1: Build & Compile TypeScript (Dikerjakan di Cloud GitHub)
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/sales.prisma
RUN npm run build

# STAGE 2: Production Runner (Yang akan dijalankan di VPS)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# Hanya install production dependencies (tanpa typescript, jest, dll)
RUN npm install --omit=dev

# Salin Prisma Client dan Binary Engine hasil generate dari Stage Builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Ambil folder dist hasil compile dari stage builder
COPY --from=builder /app/dist ./dist

# Siapkan direktori runtime & jalankan kontainer sebagai non-root user (node)
RUN mkdir -p /app/uploads /app/.wwebjs_auth && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "start"]
