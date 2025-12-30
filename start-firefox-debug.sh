#!/bin/bash

# Script para iniciar o Firefox com Remote Debugging habilitado
# Isso permite que o observer se conecte ao Firefox para observar o Bet365

echo "========================================"
echo "  Iniciando Firefox com Remote Debugging"
echo "========================================"
echo ""

# Verifica se o Firefox está instalado
if [ ! -d "/Applications/Firefox.app" ]; then
    echo "❌ Firefox não encontrado!"
    echo ""
    echo "Instale o Firefox com:"
    echo "  brew install --cask firefox"
    echo ""
    echo "Ou baixe de: https://www.mozilla.org/firefox/"
    exit 1
fi

# Verifica se o Firefox já está rodando
if pgrep -x "firefox" > /dev/null; then
    echo "⚠️  O Firefox já está rodando!"
    echo ""
    read -p "Deseja fechar o Firefox e reiniciar com debugging? (s/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo "Fechando Firefox..."
        pkill -9 "firefox"
        sleep 2
    else
        echo "Abortando."
        exit 1
    fi
fi

echo "Iniciando Firefox com debugging na porta 9222..."
echo ""
echo "INSTRUÇÕES:"
echo "1. Faça login no Bet365"
echo "2. Navegue até o jogo Aviator"
echo "3. Em outro terminal, execute: npm run observer:bet365"
echo ""

# Inicia o Firefox com debugging
/Applications/Firefox.app/Contents/MacOS/firefox \
    --remote-debugging-port=9222 \
    "https://casino.bet365.bet.br" &

echo "Firefox iniciado! PID: $!"
echo ""
echo "Quando estiver no Aviator, execute em outro terminal:"
echo "  npm run observer:bet365"
