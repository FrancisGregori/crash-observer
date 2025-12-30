# Bet365 Observer - Firefox Extension

Extensao do Firefox para capturar dados do Aviator no Bet365 e enviar para o Observer.

## Instalacao

1. Abra o Firefox
2. Digite `about:debugging` na barra de endereco
3. Clique em "Este Firefox" (ou "This Firefox")
4. Clique em "Carregar Extensao Temporaria" (ou "Load Temporary Add-on")
5. Navegue ate a pasta `firefox-extension` e selecione o arquivo `manifest.json`

## Como usar

1. Inicie o Observer em um terminal:
   ```bash
   npm run observer
   ```

2. Abra o Bet365 no Firefox e navegue ate o Aviator

3. A extensao detecta automaticamente a pagina e comeca a capturar dados

4. Voce vera um indicador de status no canto inferior direito da pagina:
   - Verde = Conectado ao Observer
   - Vermelho = Desconectado

5. Os dados das rodadas serao salvos no banco de dados automaticamente

## Notas

- A extensao funciona em modo normal do Firefox (sem debug mode)
- Os dados sao enviados via WebSocket para `ws://localhost:3010`
- O polling ocorre a cada 50ms para capturar rodadas rapidas
- Notificacoes visuais aparecem para crashes 1x e multiplicadores >= 10x
