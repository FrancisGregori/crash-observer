#!/bin/bash
#
# Prepara a extensão do Firefox para rodar no Docker
# Substitui localhost pelo nome do serviço Docker
#

EXTENSION_DIR="${1:-/opt/extension}"
OBSERVER_HOST="${2:-observer}"
OBSERVER_PORT="${3:-3010}"

echo "Preparando extensão para Docker..."
echo "  Extension dir: $EXTENSION_DIR"
echo "  Observer host: $OBSERVER_HOST:$OBSERVER_PORT"

# Substitui o URL do WebSocket no content.js
if [ -f "$EXTENSION_DIR/content.js" ]; then
    sed -i "s|ws://localhost:3010|ws://${OBSERVER_HOST}:${OBSERVER_PORT}|g" "$EXTENSION_DIR/content.js"
    echo "  content.js atualizado"
else
    echo "  AVISO: content.js não encontrado em $EXTENSION_DIR"
fi

echo "Extensão preparada!"
