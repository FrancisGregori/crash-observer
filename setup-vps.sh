#!/bin/bash
#
# Script de Setup para VPS - Bet365 Observer
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/setup-vps.sh | bash
#
# Ou:
#   chmod +x setup-vps.sh && ./setup-vps.sh
#

set -e

echo "=========================================="
echo "  Bet365 Observer - Setup VPS"
echo "=========================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verifica se é root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Execute como root: sudo ./setup-vps.sh${NC}"
    exit 1
fi

# Detecta SO
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}Sistema operacional não suportado${NC}"
    exit 1
fi

echo -e "${GREEN}Sistema detectado: $OS $VERSION_ID${NC}"
echo ""

# ==========================================
# 1. Instala Docker
# ==========================================
echo -e "${YELLOW}[1/4] Instalando Docker...${NC}"

if command -v docker &> /dev/null; then
    echo "Docker já está instalado"
else
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get update
        apt-get install -y ca-certificates curl gnupg
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
        curl -fsSL https://get.docker.com | sh
    fi
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker instalado com sucesso!${NC}"
fi

# ==========================================
# 2. Cria diretórios
# ==========================================
echo ""
echo -e "${YELLOW}[2/4] Criando estrutura de diretórios...${NC}"

INSTALL_DIR="/opt/bet365-observer"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

echo "Diretório: $INSTALL_DIR"

# ==========================================
# 3. Clona repositório ou copia arquivos
# ==========================================
echo ""
echo -e "${YELLOW}[3/4] Baixando arquivos...${NC}"

# Se já existir, faz pull
if [ -d ".git" ]; then
    echo "Atualizando repositório..."
    git pull
else
    echo "Por favor, copie os arquivos do projeto para $INSTALL_DIR"
    echo ""
    echo "Opções:"
    echo "  1. git clone SEU_REPO $INSTALL_DIR"
    echo "  2. scp -r ./crash-game-observer/* root@SEU_VPS:$INSTALL_DIR/"
    echo ""
    read -p "Os arquivos já estão em $INSTALL_DIR? (s/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        echo -e "${YELLOW}Copie os arquivos e execute novamente${NC}"
        exit 0
    fi
fi

# ==========================================
# 4. Configura e inicia
# ==========================================
echo ""
echo -e "${YELLOW}[4/4] Configurando e iniciando containers...${NC}"

# Cria arquivo .env se não existir
if [ ! -f ".env" ]; then
    echo "Criando arquivo .env..."

    # Gera senha aleatória para VNC
    VNC_PASS=$(openssl rand -base64 12)

    cat > .env << EOF
# Configurações do Bet365 Observer
VNC_PASSWORD=$VNC_PASS
NODE_ENV=production
EOF

    echo -e "${GREEN}Senha VNC gerada: $VNC_PASS${NC}"
    echo "Salve essa senha! Você vai precisar para acessar o Firefox."
fi

# Carrega variáveis
source .env

# Build e start
echo ""
echo "Construindo imagens Docker..."
docker compose -f docker-compose.vps.yml build

echo ""
echo "Iniciando containers..."
docker compose -f docker-compose.vps.yml up -d

# ==========================================
# Finalização
# ==========================================
echo ""
echo "=========================================="
echo -e "${GREEN}  Setup concluído com sucesso!${NC}"
echo "=========================================="
echo ""

# Pega IP público
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "SEU_IP")

echo "Acesse:"
echo ""
echo -e "  ${GREEN}noVNC (Firefox):${NC} http://$PUBLIC_IP:6080"
echo -e "  ${GREEN}Senha VNC:${NC} $VNC_PASSWORD"
echo ""
echo -e "  ${GREEN}Observer API:${NC} http://$PUBLIC_IP:3001"
echo ""
echo "Comandos úteis:"
echo ""
echo "  docker compose -f docker-compose.vps.yml logs -f     # Ver logs"
echo "  docker compose -f docker-compose.vps.yml restart     # Reiniciar"
echo "  docker compose -f docker-compose.vps.yml down        # Parar"
echo ""
echo "=========================================="
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC}"
echo "1. Acesse http://$PUBLIC_IP:6080 para ver o Firefox"
echo "2. Faça login no Bet365 manualmente"
echo "3. Navegue até o jogo Aviator"
echo "4. A extensão vai conectar automaticamente ao Observer"
echo ""
