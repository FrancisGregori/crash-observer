# Deploy na VPS - Bet365 Observer

Guia para rodar o observer 24/7 em uma VPS com Docker.

## Requisitos da VPS

- **Sistema:** Ubuntu 22.04 ou Debian 12
- **RAM:** 2GB mínimo (4GB recomendado)
- **Disco:** 10GB
- **Portas abertas:** 6080 (noVNC), 3001 (API)

### VPS Recomendadas

| Provedor | Plano | Preço/mês |
|----------|-------|-----------|
| Hetzner | CX22 | ~€4 |
| DigitalOcean | Basic | $6 |
| Vultr | Cloud Compute | $6 |
| Contabo | VPS S | €5 |

---

## Deploy Rápido

### 1. Conecte na VPS

```bash
ssh root@SEU_IP_VPS
```

### 2. Instale Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 3. Clone o projeto

```bash
git clone https://github.com/SEU_USUARIO/crash-game-observer.git /opt/bet365-observer
cd /opt/bet365-observer
```

**Ou copie via SCP do seu computador:**

```bash
# No seu computador local:
scp -r ./crash-game-observer root@SEU_IP_VPS:/opt/bet365-observer
```

### 4. Configure e inicie

```bash
cd /opt/bet365-observer

# Cria arquivo .env com senha VNC
echo "VNC_PASSWORD=$(openssl rand -base64 12)" > .env

# Build e start
docker compose -f docker-compose.vps.yml up -d --build
```

### 5. Acesse o Firefox

Abra no navegador: **http://SEU_IP_VPS:6080**

- Digite a senha VNC (está no arquivo `.env`)
- Faça login no Bet365
- Navegue até o jogo Aviator
- A extensão conecta automaticamente!

---

## Comandos Úteis

```bash
# Ver logs em tempo real
docker compose -f docker-compose.vps.yml logs -f

# Ver logs só do observer
docker compose -f docker-compose.vps.yml logs -f observer

# Ver logs só do Firefox
docker compose -f docker-compose.vps.yml logs -f firefox

# Reiniciar tudo
docker compose -f docker-compose.vps.yml restart

# Parar tudo
docker compose -f docker-compose.vps.yml down

# Reconstruir após mudanças
docker compose -f docker-compose.vps.yml up -d --build

# Ver status dos containers
docker compose -f docker-compose.vps.yml ps

# Entrar no container do Firefox
docker exec -it bet365-firefox bash

# Ver senha VNC
cat .env
```

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                      VPS                             │
│                                                      │
│  ┌─────────────────┐     ┌─────────────────┐        │
│  │    Firefox      │────▶│    Observer     │        │
│  │  + Extensão     │ ws  │   (Node.js)     │        │
│  │  (Xvfb + VNC)   │     │                 │        │
│  └────────┬────────┘     └────────┬────────┘        │
│           │                       │                  │
│    ┌──────▼──────┐         ┌──────▼──────┐          │
│    │   noVNC     │         │   SQLite    │          │
│    │   :6080     │         │   Database  │          │
│    └─────────────┘         └─────────────┘          │
│                                                      │
│  Você acessa ───────────────────────▶ :6080 (noVNC) │
│  Dashboard  ────────────────────────▶ :3001 (API)   │
└─────────────────────────────────────────────────────┘
```

---

## Portas

| Porta | Serviço | Descrição |
|-------|---------|-----------|
| 6080 | noVNC | Acesso visual ao Firefox |
| 5900 | VNC | VNC direto (opcional) |
| 3001 | API | REST API do observer |
| 3010 | WebSocket | Comunicação extensão ↔ observer (interno) |

---

## Persistência de Dados

Os dados são salvos em:

- `./data/` → Banco SQLite com rodadas
- Volume `bet365-firefox-profile` → Perfil do Firefox (cookies, login)

### Backup

```bash
# Backup do banco de dados
cp ./data/crash_data.sqlite ./data/backup_$(date +%Y%m%d).sqlite

# Backup completo
tar -czvf backup_$(date +%Y%m%d).tar.gz ./data
```

---

## Troubleshooting

### Firefox não carrega o site

1. Acesse via noVNC
2. Verifique se não há modal de erro
3. Recarregue a página (F5)
4. Se persistir, reinicie o container:
   ```bash
   docker compose -f docker-compose.vps.yml restart firefox
   ```

### Extensão não conecta ao Observer

1. Verifique se o observer está rodando:
   ```bash
   docker compose -f docker-compose.vps.yml ps
   curl http://localhost:3001/health
   ```
2. Veja os logs do observer:
   ```bash
   docker compose -f docker-compose.vps.yml logs observer
   ```

### Login do Bet365 expira

A extensão tem sistema de detecção de logout e redireciona automaticamente.
Se não funcionar:

1. Acesse via noVNC
2. Faça login novamente
3. A extensão reconecta automaticamente

### VNC muito lento

1. Use resolução menor no docker-compose:
   ```yaml
   environment:
     - DISPLAY_WIDTH=1024
     - DISPLAY_HEIGHT=768
   ```
2. Ou use VNC direto (porta 5900) em vez de noVNC

---

## Segurança

### Firewall

```bash
# Só permite portas necessárias
ufw allow 22/tcp      # SSH
ufw allow 6080/tcp    # noVNC
ufw allow 3001/tcp    # API (opcional, só se precisar acesso externo)
ufw enable
```

### Trocar senha VNC

```bash
# Edite o .env
echo "VNC_PASSWORD=NovaSenhaForte123" > .env

# Reinicie
docker compose -f docker-compose.vps.yml down
docker compose -f docker-compose.vps.yml up -d
```

---

## Atualizações

```bash
cd /opt/bet365-observer

# Puxa atualizações
git pull

# Rebuild
docker compose -f docker-compose.vps.yml up -d --build
```

---

## Monitoramento

### Verificar se está funcionando

```bash
# Health check
curl http://localhost:3001/health

# Ver última rodada
curl http://localhost:3001/api/last

# Ver estatísticas
curl http://localhost:3001/api/stats
```

### Configurar alertas (opcional)

Você pode usar o Uptime Kuma ou similar para monitorar:
- `http://SEU_IP:3001/health`

---

## Custos Estimados

| Item | Custo/mês |
|------|-----------|
| VPS (Hetzner CX22) | €4-6 |
| **Total** | **~€5/mês** |

---

## Suporte

Se tiver problemas:
1. Verifique os logs: `docker compose -f docker-compose.vps.yml logs -f`
2. Reinicie os containers
3. Acesse via noVNC para diagnóstico visual
