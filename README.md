# Crash Game Observer

Observador em tempo real do jogo Crash da SpinBetter com dashboard de estatísticas.

## Requisitos

- Node.js 18+
- npm

## Instalação

```bash
# Instalar dependências
npm install

# Instalar browsers do Playwright
npx playwright install chromium
```

## Uso

### Primeira execução (fazer login)

```bash
npm start
```

1. O navegador Chromium abrirá automaticamente
2. A página do jogo Crash será carregada
3. **Faça login manualmente** na sua conta SpinBetter
4. Navegue até o jogo Crash se necessário
5. O observer começará a monitorar automaticamente quando detectar o elemento do jogo

A sessão será salva em `data/browser-session/`, então nas próximas execuções você já estará logado.

### Execuções seguintes

```bash
npm start
```

O navegador abrirá já logado e começará a monitorar imediatamente.

### Acessar o Dashboard

Após iniciar o script, acesse:

```
http://localhost:3000
```

O dashboard mostra:
- Última rodada (multiplicador, apostadores, valores)
- Estatísticas gerais (média, máximo, mínimo, distribuição)
- Histórico de rodadas (chips coloridos)
- Tabela detalhada com todas as informações

As atualizações são em tempo real via Server-Sent Events (SSE).

## Scripts disponíveis

```bash
# Modo completo (observer + dashboard)
npm start

# Apenas observer (sem dashboard web)
npm run observer

# Apenas dashboard (visualizar dados já coletados)
npm run dashboard
```

## Estrutura do projeto

```
crash-game-observer/
├── package.json
├── src/
│   ├── index.js          # Entry point
│   ├── observer.js       # Playwright + MutationObserver
│   ├── database.js       # SQLite
│   ├── server.js         # Express + API + SSE
│   └── public/
│       ├── index.html    # Dashboard HTML
│       ├── style.css     # Estilos
│       └── app.js        # JavaScript frontend
└── data/
    ├── browser-session/  # Sessão do navegador (cookies, localStorage)
    └── crash_stats.db    # Banco de dados SQLite
```

## Banco de dados

Os dados são salvos em SQLite (`data/crash_stats.db`) com a seguinte estrutura:

```sql
CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  createdAt TEXT NOT NULL,      -- Data/hora ISO 8601
  betCount INTEGER NOT NULL,    -- Número de apostadores
  totalBet REAL NOT NULL,       -- Total apostado
  totalWin REAL NOT NULL,       -- Total ganho
  multiplier REAL NOT NULL      -- Multiplicador final
);
```

## API REST

- `GET /api/rounds?limit=100` - Últimas N rodadas
- `GET /api/rounds/all` - Todas as rodadas
- `GET /api/stats` - Estatísticas gerais
- `GET /api/last` - Última rodada
- `GET /api/events` - Stream SSE para atualizações em tempo real

## Como funciona

1. **Observer**: Um `MutationObserver` monitora mudanças de classe no elemento `.crash-game__mountains`. Quando a classe `--game` é removida, significa que a rodada terminou.

2. **Coleta de dados**: No momento do fim da rodada, o script coleta:
   - Multiplicador do `.crash-game__counter`
   - Apostadores do `.crash-total__value--players`
   - Total apostado do `.crash-total__value--bets`
   - Total ganho do `.crash-total__value--prize`

3. **Persistência**: Os dados são salvos no SQLite imediatamente.

4. **Dashboard**: Atualizado em tempo real via SSE.

## Troubleshooting

### "Elemento do jogo não encontrado"

- Verifique se você está logado
- Verifique se está na página correta do Crash
- O site pode ter mudado a estrutura HTML

### "Session expired"

Delete a pasta `data/browser-session/` e faça login novamente.

### Dados não aparecem no dashboard

- Verifique se o observer está rodando
- Verifique o console do navegador (F12) por erros
- Verifique o terminal por mensagens de erro
