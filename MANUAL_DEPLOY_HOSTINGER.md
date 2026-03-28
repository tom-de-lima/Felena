# Manual Operacional - GranaCheck em Container (Hostinger Docker Manager)

Este manual reflete o estado atual da aplicação: **execução 100% em container Docker**, com Nginx apontando para a porta `3001` no host.

## 1. Estado atual (produção)

- Runtime da aplicação: `docker` (container `granacheck_app`)
- Porta do container: `3000`
- Porta publicada no host: `3001`
- Nginx (domínio): proxy para `127.0.0.1:3001`
- PM2 legado: removido/parado para este app
- Banco: SQLite persistido em volume Docker `granacheck_sqlite_data`

## 2. Arquivos de deploy no repositório

- `Dockerfile`
- `docker-compose.yml` (arquivo principal para Docker Manager)
- `docker-compose.hostinger.yml` (variação para referência)
- `.dockerignore`

## 3. docker-compose.yml de referência

```yaml
version: "3.9"

services:
  granacheck:
    container_name: "granacheck_app"
    build:
      context: "."
      dockerfile: "Dockerfile"
    restart: "always"
    ports:
      - "3001:3000"
    environment:
      NODE_ENV: "production"
      PORT: "3000"
      APP_TIMEZONE: "America/Fortaleza"
      APP_BASE_URL: "https://orqtech.tech"
      JWT_SECRET: "DEFINIR_NO_PAINEL"
      ADMIN_JWT_SECRET: "DEFINIR_NO_PAINEL"
      PIX_KEY: "DEFINIR_NO_PAINEL"
      MASTER_ADMIN_NAME: "Administrador Master"
      MASTER_ADMIN_EMAIL: "master@granacheck.local"
      MASTER_ADMIN_PASSWORD: "DEFINIR_NO_PAINEL"
      SMTP_HOST: ""
      SMTP_PORT: "587"
      SMTP_SECURE: "false"
      SMTP_USER: ""
      SMTP_PASS: ""
      SMTP_FROM: ""
    volumes:
      - "granacheck_sqlite_data:/app/data"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/health"]
      interval: "30s"
      timeout: "5s"
      retries: 5
      start_period: "20s"

volumes:
  granacheck_sqlite_data:
    name: "granacheck_sqlite_data"
```

## 4. Deploy via Hostinger Docker Manager (Compose por URL)

1. No repositório GitHub, garantir `docker-compose.yml` válido e atualizado.
2. No painel Hostinger:
   - Docker Manager -> Compose a partir de URL
   - URL do projeto: `https://github.com/tom-de-lima/Felena.git`
   - Branch: `main`
   - Compose file: `docker-compose.yml`
3. Preencher variáveis sensíveis no painel (não usar placeholders):
   - `JWT_SECRET`
   - `ADMIN_JWT_SECRET`
   - `PIX_KEY`
   - `MASTER_ADMIN_PASSWORD`

## 5. Fluxo padrão de atualização (novo release)

### 5.1 No computador local (commit e push)

```powershell
cd "C:\Users\anton\OneDrive\Trade\Apps\Felena\Estável\Felena"
git status
git add .
git commit -m "tipo(escopo): resumo da alteração"
git pull --rebase origin main
git push origin main
git rev-parse --short HEAD
git status
```

### 5.2 No Hostinger Docker Manager

1. Re-implantar o projeto via Compose URL.
2. Aguardar status `Em execução`.
3. Confirmar `healthy`.

### 5.3 Validação no terminal da VPS

```bash
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -i http://127.0.0.1:3001/health
curl -I https://orqtech.tech/app/login
```

## 6. Banco SQLite e persistência (crítico)

O banco em produção está no volume:

- `granacheck_sqlite_data`

Validar dados dentro do container:

```bash
sudo docker exec -it granacheck_app sh -lc "node -e \"const sqlite3=require('sqlite3').verbose(); const db=new sqlite3.Database('/app/data/granacheck.db'); db.get('select count(*) as c from users',[],(e,r)=>{if(e) throw e; console.log('users=',r.c); db.get('select count(*) as c from salary_records',[],(e2,r2)=>{if(e2) throw e2; console.log('salary_records=',r2.c); db.close();});});\""
```

## 7. Backup e restauração do SQLite

### 7.1 Backup do arquivo no volume Docker

```bash
sudo docker run --rm \
  -v granacheck_sqlite_data:/from \
  -v /opt/_legacy_backup:/to \
  alpine sh -c "cp /from/granacheck.db /to/granacheck-$(date +%F_%H%M).db.bak && ls -lh /to"
```

### 7.2 Restauração para o volume Docker

```bash
sudo docker stop granacheck_app
sudo docker run --rm \
  -v granacheck_sqlite_data:/to \
  -v /opt/_legacy_backup:/from \
  alpine sh -c "cp /from/SEU_BACKUP.db.bak /to/granacheck.db"
sudo docker start granacheck_app
```

## 8. Nginx (produção)

Configuração atual esperada:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

Validar:

```bash
grep -n "proxy_pass" /etc/nginx/sites-available/granacheck
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Troubleshooting rápido (container)

### 9.1 Se o painel ficar “implantando” por muito tempo

```bash
sudo docker ps -a
sudo docker logs --tail 200 granacheck_app
```

### 9.2 Se aparecer erro de pull `granacheck:latest`

Causa: compose antigo com `image: granacheck:latest`.  
Correção: usar compose com `build:` e sem `image:`.

### 9.3 Se ocorrer 502

```bash
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -i http://127.0.0.1:3001/health
grep -n "proxy_pass" /etc/nginx/sites-available/granacheck
sudo tail -n 120 /var/log/nginx/error.log
```

## 10. Rollback rápido

### 10.1 Rollback de tráfego para runtime antigo (somente emergência)

```bash
sudo sed -i 's/127.0.0.1:3001/127.0.0.1:3000/g' /etc/nginx/sites-available/granacheck
sudo nginx -t && sudo systemctl reload nginx
```

### 10.2 Rollback de versão do container

- Reimplantar no Docker Manager com commit/tag anterior.
- Ou ajustar URL/branch para commit estável e reimplantar.

## 11. Limpeza de legado fora do container

Status alvo:

- Sem processo `node /opt/granacheck/app/server.js` no host
- Sem app rodando em PM2 para este projeto
- Código legado movido para quarentena:
  - `/opt/_legacy_backup/granacheck_app_legacy_<timestamp>`

## 12. Checklist operacional diário

1. Commit/push no GitHub.
2. Re-deploy no Docker Manager.
3. Validar container `healthy`.
4. Validar `/health` em `3001`.
5. Validar domínio em produção.
6. Checar logs se necessário.

Comandos:

```bash
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -i http://127.0.0.1:3001/health
curl -I https://orqtech.tech/app/login
sudo docker logs --tail 80 granacheck_app
```

## 13. Acesso visual ao banco SQLite (Windows + túnel SSH)

Objetivo: visualizar o banco de dados em interface web sem expor porta pública na internet.

### 13.1 Subir viewer SQLite na VPS (somente leitura no volume)

```bash
sudo docker rm -f sqlite_web_ro 2>/dev/null || true
sudo docker run -d --name sqlite_web_ro \
  --restart unless-stopped \
  -p 127.0.0.1:8088:8080 \
  -v granacheck_sqlite_data:/data:ro \
  coleifer/sqlite-web \
  sqlite_web /data/granacheck.db --host 0.0.0.0 --port 8080
```

Validar na VPS:

```bash
sudo docker ps --filter name=sqlite_web_ro
curl -I http://127.0.0.1:8088
```

### 13.2 Criar túnel SSH no Windows PowerShell

No computador local (Windows):

```powershell
ssh -L 8088:127.0.0.1:8088 granacheck@187.77.49.157
```

Observação:
- manter essa sessão SSH aberta enquanto usar a interface visual do banco.

### 13.3 Acessar interface visual no navegador local

No navegador do Windows:

```text
http://127.0.0.1:8088
```

### 13.4 Encerrar com segurança

1. Fechar túnel SSH no PowerShell (`Ctrl + C`).
2. Opcional: parar o viewer na VPS:

```bash
sudo docker stop sqlite_web_ro
```

Opcional remover:

```bash
sudo docker rm sqlite_web_ro
```
