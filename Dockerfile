FROM node:18-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --omit=dev

# Copiar código da aplicação
COPY . .

# Criar diretório para dados persistentes
RUN mkdir -p data config

# Expor porta
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
