#!/bin/bash
# Script de inicialização do Firefox na VPS

echo "=== Iniciando Firefox para Bet365 Observer ==="

# Aguarda Xvfb estar pronto
echo "Aguardando Xvfb..."
sleep 5

# Define display
export DISPLAY=:99
export HOME=/root

# Verifica se o display está funcionando
if ! xdpyinfo -display :99 > /dev/null 2>&1; then
    echo "ERRO: Display :99 não está disponível"
    sleep 5
    exit 1
fi
echo "Display :99 OK"

# URL inicial
INITIAL_URL="${INITIAL_URL:-https://casino.bet365.bet.br/play/AviatorNYX}"

# Aguarda o observer estar disponível
OBSERVER_HOST="${OBSERVER_HOST:-observer}"
OBSERVER_PORT="${OBSERVER_PORT:-3010}"

echo "Aguardando observer em $OBSERVER_HOST:$OBSERVER_PORT..."
for i in {1..30}; do
    if nc -z "$OBSERVER_HOST" "$OBSERVER_PORT" 2>/dev/null; then
        echo "Observer disponível!"
        break
    fi
    echo "Tentativa $i/30..."
    sleep 2
done

# Prepara extensão com o host correto do observer
echo "Preparando extensão para Docker..."
/opt/prepare-extension.sh /opt/extension "$OBSERVER_HOST" "$OBSERVER_PORT"

# Instala a extensão no perfil
PROFILE_DIR="/root/.mozilla/firefox/bet365.default-release"

# Cria diretório do perfil se não existir
mkdir -p "$PROFILE_DIR/extensions"

# Copia extensão para o perfil
cp -r /opt/extension "$PROFILE_DIR/extensions/bet365-observer@local"
echo "Extensão copiada para o perfil"

# Inicia Firefox
echo "Iniciando Firefox com URL: $INITIAL_URL"
firefox \
    --profile "$PROFILE_DIR" \
    --no-remote \
    "$INITIAL_URL" &

FIREFOX_PID=$!
echo "Firefox iniciado com PID: $FIREFOX_PID"

# Mantém o processo rodando
wait $FIREFOX_PID
