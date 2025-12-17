# Crash Game ML Prediction Service

Sistema de Machine Learning para auxilio na tomada de decisao em jogos do tipo "Crash" (ex: Aviator).

## AVISO IMPORTANTE

**Este sistema NAO garante lucro em jogo algum.** O objetivo e apenas:
- Reduzir variancia nas decisoes
- Ajudar a detectar momentos potencialmente ruins
- Fornecer informacoes estatisticas baseadas em dados historicos

Jogos de azar sao projetados para dar vantagem a casa. Use este sistema apenas como ferramenta de auxilio, nunca como garantia de sucesso.

---

## Arquitetura Geral

```
+---------------+      +-------+      +------------+      +-----------+
|   Python ML   | ---> | Redis | ---> |  Node.js   | ---> | Dashboard |
|   Service     |      | Pub/  |      |  WebSocket |      |   (JS)    |
|               |      | Sub   |      |  Server    |      |           |
+---------------+      +-------+      +------------+      +-----------+
        |                                    |
        v                                    v
+---------------+                  +------------------+
|    SQLite     |                  | Clientes Browser |
|   Database    |                  |   (WebSocket)    |
+---------------+                  +------------------+
```

### Fluxo de Dados

1. **Python ML Service** le dados do SQLite e treina/carrega modelos
2. Ao detectar nova rodada, gera previsoes para a proxima rodada
3. Publica previsoes em JSON no canal Redis `ml_predictions`
4. **Node.js Server** esta inscrito no canal Redis
5. Ao receber mensagem, retransmite via WebSocket para todos os clientes
6. **Dashboard** recebe e renderiza as previsoes em tempo real

---

## Estrutura de Arquivos

```
crash-game-observer/
├── ml_service/
│   ├── config.py          # Configuracoes do servico
│   ├── features.py        # Feature engineering
│   ├── training.py        # Pipeline de treinamento
│   ├── inference.py       # Servico de inferencia
│   ├── requirements.txt   # Dependencias Python
│   ├── README.md          # Esta documentacao
│   ├── models/            # Modelos treinados (.joblib)
│   └── logs/              # Logs do servico
│
├── src/
│   ├── observer/
│   │   ├── redisSubscriber.js  # Subscriber Redis (novo)
│   │   ├── websocket.js        # WebSocket server (atualizado)
│   │   └── index.js            # Entry point (atualizado)
│   ├── public/
│   │   ├── app.js              # Frontend (atualizado)
│   │   ├── index.html          # HTML (atualizado)
│   │   └── style.css           # CSS (atualizado)
│   └── shared/
│       └── protocol.js         # Tipos de mensagem (atualizado)
│
└── data/
    └── crash_stats.db     # Banco SQLite
```

---

## Banco de Dados SQLite

### Schema Atual (Existente)

```sql
CREATE TABLE rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createdAt TEXT NOT NULL,      -- ISO 8601 timestamp
    betCount INTEGER NOT NULL,    -- Numero de jogadores
    totalBet REAL NOT NULL,       -- Total apostado
    totalWin REAL NOT NULL,       -- Total ganho
    multiplier REAL NOT NULL      -- Multiplicador final
);

CREATE INDEX idx_rounds_createdAt ON rounds(createdAt);
CREATE INDEX idx_rounds_multiplier ON rounds(multiplier);
```

### Campos Derivados (calculados na feature engineering)

- `house_profit = totalBet - totalWin`

---

## Features do Modelo

O modelo utiliza as seguintes categorias de features:

### 1. Features Temporais

| Feature | Descricao |
|---------|-----------|
| `hour_of_day` | Hora do dia (0-23) |
| `day_of_week` | Dia da semana (0-6, 0=Segunda) |
| `minute_of_day` | Minuto do dia (0-1439) |
| `hour_sin/cos` | Encoding ciclico da hora |
| `day_sin/cos` | Encoding ciclico do dia |
| `minute_sin/cos` | Encoding ciclico do minuto |

### 2. Estatisticas de Janela Movel

Para cada janela (20, 50, 100 rodadas):

| Feature | Descricao |
|---------|-----------|
| `multiplier_mean_N` | Media dos multiplicadores |
| `multiplier_std_N` | Desvio padrao |
| `multiplier_min_N` | Minimo |
| `multiplier_max_N` | Maximo |
| `multiplier_median_N` | Mediana |
| `bet_count_mean_N` | Media de jogadores |
| `total_bet_mean_N` | Media de apostas |
| `total_win_mean_N` | Media de ganhos |
| `house_profit_mean_N` | Media do lucro da casa |

### 3. Contagem de Eventos

| Feature | Descricao |
|---------|-----------|
| `count_gt_Xx_last_N` | Quantidade de multiplicadores > X nas ultimas N rodadas |

Onde X = {2, 3, 4, 5, 7, 10} e N = {50, 100}

### 4. Distancia desde Ultimo Evento

| Feature | Descricao |
|---------|-----------|
| `rounds_since_gt_2x` | Rodadas desde ultimo multiplicador > 2x |
| `rounds_since_gt_5x` | Rodadas desde ultimo multiplicador > 5x |
| `rounds_since_gt_10x` | Rodadas desde ultimo multiplicador > 10x |

### 5. Taxa de Early Crash

| Feature | Descricao |
|---------|-----------|
| `early_crash_rate_20` | % de crashes precoces nas ultimas 20 rodadas |
| `early_crash_rate_50` | % de crashes precoces nas ultimas 50 rodadas |

Early crash = multiplicador <= 1.20

### 6. Features de Sequencia

| Feature | Descricao |
|---------|-----------|
| `multiplier_lag_1` a `multiplier_lag_20` | Ultimos 20 multiplicadores |

### 7. Features Derivadas

| Feature | Descricao |
|---------|-----------|
| `multiplier_trend_20` | Tendencia linear dos ultimos 20 multiplicadores |
| `volatility_ratio` | Volatilidade recente / historica |
| `hot_streak_indicator` | Performance recente vs media historica |

---

## Targets (Labels)

O modelo preve 8 classificacoes binarias:

| Label | Descricao | Condicao |
|-------|-----------|----------|
| `label_gt_2x` | Multiplicador > 2x | multiplier > 2.0 |
| `label_gt_3x` | Multiplicador > 3x | multiplier > 3.0 |
| `label_gt_4x` | Multiplicador > 4x | multiplier > 4.0 |
| `label_gt_5x` | Multiplicador > 5x | multiplier > 5.0 |
| `label_gt_7x` | Multiplicador > 7x | multiplier > 7.0 |
| `label_gt_10x` | Multiplicador > 10x | multiplier > 10.0 |
| `label_early_crash` | Crash precoce | multiplier <= 1.20 |
| `label_high_loss_streak` | Sequencia ruim | Ver formula abaixo |

### Formula: High Loss Streak

Uma rodada e marcada como "high loss streak" se:

```
proportion_below_2x_in_last_20 > historical_avg_below_2x * 1.3
```

Ou seja, a proporcao de rodadas abaixo de 2x nas ultimas 20 rodadas
excede a media historica em 30%.

---

## Modelo de ML

### Algoritmo Escolhido: XGBoost

Razoes:
1. Excelente performance em dados tabulares
2. Lida bem com features numericas e categoricas
3. Robusto a overfitting com regularizacao
4. Suporte nativo a class weights para classes desbalanceadas
5. Rapido para treino e inferencia

### Hiperparametros

```python
XGBOOST_PARAMS = {
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.05,
    "min_child_weight": 3,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "gamma": 0.1,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
}
```

### Tratamento de Desbalanceamento

- `scale_pos_weight` calculado automaticamente como `n_negative / n_positive`
- Foco em calibracao de probabilidade (Brier score)

---

## Metricas de Avaliacao

| Metrica | Descricao |
|---------|-----------|
| AUC-ROC | Area sob a curva ROC |
| Log Loss | Perda logaritmica |
| Brier Score | Calibracao de probabilidade |
| Accuracy | Acuracia (com cuidado) |
| Precision | Precisao |
| Recall | Revocacao |
| F1 | F1-Score |

---

## Formato de Mensagem (Redis -> WebSocket)

```json
{
    "round_id": 12345,
    "generated_at": "2025-01-01T10:00:00Z",
    "features_window_start_round": 12325,
    "features_window_end_round": 12344,
    "prob_gt_2x": 0.63,
    "prob_gt_3x": 0.47,
    "prob_gt_4x": 0.35,
    "prob_gt_5x": 0.28,
    "prob_gt_7x": 0.19,
    "prob_gt_10x": 0.08,
    "prob_early_crash": 0.22,
    "prob_high_loss_streak": 0.31,
    "model_version": "v1.0.0"
}
```

---

## Instalacao e Execucao

### Pre-requisitos

1. Python 3.9+
2. Redis Server
3. Node.js 18+
4. Dados historicos no SQLite (minimo 1000 rodadas)

### 1. Instalar Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

**Windows:**
```bash
# Usar WSL2 ou Docker
docker run -d -p 6379:6379 redis
```

### 2. Instalar Dependencias Python

```bash
cd ml_service
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Instalar Dependencias Node.js

```bash
cd ..  # volta para raiz do projeto
npm install
```

### 4. Treinar o Modelo

```bash
cd ml_service
source venv/bin/activate
python training.py
```

Saida esperada:
```
Loading rounds from ../data/crash_stats.db
Loaded 5000 rounds from database
Creating training dataset...
Split data - Train: 3500, Val: 750, Test: 750
Training model for: label_gt_2x
  Train AUC: 0.8234, Val AUC: 0.7856
...
Training Pipeline Complete!
Trained 8 models
Models saved to: models/
```

### 5. Iniciar Servicos (Ordem)

**Terminal 1 - Redis (se nao estiver rodando como servico):**
```bash
redis-server
```

**Terminal 2 - Servico ML:**
```bash
cd ml_service
source venv/bin/activate
python inference.py
```

**Terminal 3 - Observer Node.js:**
```bash
npm run observer
```

**Terminal 4 - Dashboard:**
```bash
npm run dashboard
```

**Ou usar o modo dev:**
```bash
npm run dev
```

### 6. Acessar Dashboard

Abra `http://localhost:3000` no navegador.

A secao "Previsoes ML" aparecera na coluna direita.

---

## Manutencao

### Re-treinar o Modelo

Recomendado quando:
- Comportamento do jogo mudar significativamente
- Performance preditiva se degradar
- Acumular mais dados (ex: +10000 novas rodadas)

```bash
cd ml_service
source venv/bin/activate
python training.py
```

### Versionamento de Modelos

Atualize `MODEL_VERSION` em `config.py` antes de re-treinar:

```python
MODEL_VERSION = "v1.1.0"
```

A versao e exibida no dashboard e nas mensagens.

### Monitorar Performance

1. Compare as probabilidades previstas com os resultados reais
2. Monitore metricas de calibracao (Brier score)
3. Se AUC-ROC cair abaixo de 0.55-0.60, re-treinar

### Logs

Os logs do servico de inferencia mostram:
- Rodadas processadas
- Previsoes geradas
- Status da conexao Redis

---

## Limitacoes Conhecidas

1. **Aleatoriedade**: Jogos de crash sao projetados para serem aleatorios. Padroes historicos nao garantem resultados futuros.

2. **Vantagem da Casa**: O jogo e matematicamente projetado para dar lucro a plataforma a longo prazo.

3. **Overfitting**: Modelos podem aprender padroes que nao se generalizam.

4. **Latencia**: Ha um pequeno delay entre a rodada terminar e a previsao ser exibida.

5. **Dados Historicos**: A qualidade das previsoes depende da quantidade e qualidade dos dados de treino.

---

## Arquitetura Tecnica Detalhada

### Feature Engineering (features.py)

```python
# Extrai features para uma rodada especifica
# IMPORTANTE: Usa apenas dados ANTERIORES a rodada
features = feature_engineer.extract_features_for_round(round_idx, df)
```

### Training Pipeline (training.py)

```python
# 1. Carrega dados do SQLite
df = load_rounds_from_sqlite(db_path)

# 2. Cria dataset de treino
X, labels, valid_indices = create_training_dataset(df)

# 3. Split temporal (70% treino, 15% validacao, 15% teste)
train_data, val_data, test_data = temporal_split(X, labels)

# 4. Treina modelos para cada target
for label_name in target_names:
    model = train_single_model(X_train, y_train, X_val, y_val, label_name)
    save_model(model, label_name)
```

### Inference Service (inference.py)

```python
# Loop principal
while running:
    # Detecta novas rodadas
    new_rounds = get_new_rounds_since(last_processed_id)

    for round in new_rounds:
        # Extrai features
        features = extract_features_for_prediction(history_df)

        # Gera previsoes
        predictions = generate_predictions(features)

        # Publica no Redis
        redis_client.publish("ml_predictions", json.dumps(message))
```

---

## Troubleshooting

### Redis Connection Error

```
[Redis] Failed to initialize: Connection refused
```

**Solucao:** Verifique se o Redis esta rodando:
```bash
redis-cli ping
# Deve retornar: PONG
```

### Insufficient Data Error

```
ValueError: Insufficient data for training. Need at least 1000 rounds
```

**Solucao:** Aguarde acumular mais dados ou reduza `MIN_ROUNDS_FOR_TRAINING` em `config.py`.

### Model Not Found

```
[Redis] No models loaded! Run training first.
```

**Solucao:** Execute o script de treinamento:
```bash
python training.py
```

### WebSocket Not Receiving Predictions

1. Verifique se o servico de inferencia esta rodando
2. Verifique se o Redis esta rodando
3. Verifique os logs do Node.js para erros de conexao

---

## Contribuindo

1. Fork o repositorio
2. Crie uma branch para sua feature
3. Faca commit das mudancas
4. Envie um pull request

---

## Licenca

Este projeto e para uso educacional e pessoal. Nao nos responsabilizamos por perdas financeiras decorrentes do uso deste sistema.
