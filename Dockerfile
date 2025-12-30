# Dockerfile para o Observer Node.js
FROM node:20-slim

WORKDIR /app

# Instala dependências do sistema para better-sqlite3 e healthcheck
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia package.json primeiro (melhor cache)
COPY package*.json ./

# Instala dependências
RUN npm ci --only=production

# Copia o código
COPY src/ ./src/

# Cria diretório de dados (será montado como volume)
RUN mkdir -p /app/data

# Porta do WebSocket e API
EXPOSE 3010 3001

# Comando padrão
CMD ["npm", "run", "observer:bet365"]
