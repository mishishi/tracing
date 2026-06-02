FROM node:20-alpine

WORKDIR /app

COPY tracing/tracing-dashboard/package.json tracing/tracing-dashboard/package-lock.json* ./
RUN npm install

COPY tracing/tracing-dashboard/ .

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]
