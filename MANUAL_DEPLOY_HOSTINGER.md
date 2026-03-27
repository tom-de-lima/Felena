# Manual Universal de Deploy em VPS (Hostinger/Ubuntu)

Este documento é um playbook reutilizável para deploy de **qualquer aplicação** em VPS Linux.  
Use os placeholders entre `<...>` e adapte ao projeto.

## 1. Variáveis padrão (preencher antes de executar)

- `<APP_NAME>`: nome da aplicação (ex.: `meuapp`)
- `<APP_USER>`: usuário do sistema que executa a app (ex.: `meuapp`)
- `<APP_DIR>`: pasta da app (ex.: `/opt/meuapp/app`)
- `<DOMAIN>`: domínio principal (ex.: `exemplo.com`)
- `<REPO_URL>`: URL do GitHub/Git (ex.: `https://github.com/usuario/repo.git`)
- `<APP_PORT>`: porta interna da aplicação (ex.: `3000`)

Exemplo prático preenchido:

```text
APP_NAME=granacheck
APP_USER=granacheck
APP_DIR=/opt/granacheck/app
DOMAIN=orqtech.tech
REPO_URL=https://github.com/tom-de-lima/Felena.git
APP_PORT=3000
```

## 2. Provisionamento base da VPS

```bash
ssh root@<VPS_IP>
apt update && apt upgrade -y
apt install -y git curl nginx ufw certbot python3-certbot-nginx
```

## 3. Usuário e diretório isolados por aplicação

```bash
adduser <APP_USER>
usermod -aG sudo <APP_USER>
mkdir -p /opt/<APP_NAME>
chown -R <APP_USER>:<APP_USER> /opt/<APP_NAME>
```

## 4. Clonar projeto

```bash
su - <APP_USER>
git clone <REPO_URL> <APP_DIR>
cd <APP_DIR>
```

## 5. Estratégias por stack (escolha uma)

### 5.1 Node.js + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

cd <APP_DIR>
npm install
```

### 5.2 Docker + Docker Compose

```bash
apt install -y docker.io docker-compose-plugin
systemctl enable docker
systemctl start docker
usermod -aG docker <APP_USER>
```

## 6. Configuração de ambiente

Crie/edite `.env` conforme o projeto:

```bash
nano <APP_DIR>/.env
```

Exemplo mínimo:

```env
PORT=<APP_PORT>
APP_BASE_URL=https://<DOMAIN>
APP_TIMEZONE=America/Fortaleza
```

## 7. Publicação da aplicação

### 7.1 Node + PM2

```bash
cd <APP_DIR>
pm2 start server.js --name <APP_NAME> --update-env
pm2 save
pm2 startup
```

### 7.2 Docker Compose

```bash
cd <APP_DIR>
docker compose up -d --build
docker ps
```

## 8. Nginx (proxy reverso)

```bash
sudo nano /etc/nginx/sites-available/<APP_NAME>
```

Template:

```nginx
server {
    listen 80;
    server_name <DOMAIN> www.<DOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:<APP_PORT>;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar:

```bash
sudo ln -sf /etc/nginx/sites-available/<APP_NAME> /etc/nginx/sites-enabled/<APP_NAME>
sudo nginx -t
sudo systemctl reload nginx
```

Exemplo prático preenchido:

```nginx
server {
    listen 80;
    server_name orqtech.tech www.orqtech.tech;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 9. SSL com Certbot

```bash
sudo certbot --nginx -d <DOMAIN> -d www.<DOMAIN>
```

## 10. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 11. Fluxo padrão de atualização (qualquer projeto)

### 11.1 Local (commit/push)

```powershell
cd "C:\CAMINHO\DO\REPOSITORIO"
git status
git add .
git commit -m "tipo(escopo): resumo da alteração"
git pull --rebase origin main
git push origin main
git rev-parse --short HEAD
```

Exemplo prático preenchido:

```powershell
cd "C:\Users\anton\OneDrive\Trade\Apps\Felena\Estável\Felena"
git status
git add .
git commit -m "feat(help): atualiza FAQ e documentação"
git pull --rebase origin main
git push origin main
git rev-parse --short HEAD
```

### 11.2 VPS (deploy)

```bash
sudo su - <APP_USER>
cd <APP_DIR>
git fetch origin
git pull origin main
git rev-parse --short HEAD
git log -1 --oneline
```

Exemplo prático preenchido:

```bash
sudo su - granacheck
cd /opt/granacheck/app
git fetch origin
git pull origin main
git rev-parse --short HEAD
git log -1 --oneline
```

#### Se Node + PM2

```bash
npm install
pm2 restart <APP_NAME> --update-env
pm2 save
pm2 status
```

Exemplo prático preenchido:

```bash
npm install
pm2 restart granacheck --update-env
pm2 save
pm2 status
```

#### Se Docker Compose

```bash
docker compose pull
docker compose up -d --build
docker ps
```

Exemplo prático preenchido:

```bash
docker compose pull
docker compose up -d --build
docker ps
```

## 12. Verificação pós-deploy

```bash
curl -i http://127.0.0.1:<APP_PORT>/health
curl -I https://<DOMAIN>
```

Exemplo prático preenchido:

```bash
curl -i http://127.0.0.1:3000/health
curl -I https://orqtech.tech/app/login
```

## 13. Troubleshooting rápido

### 13.1 502 Bad Gateway

```bash
sudo tail -n 120 /var/log/nginx/error.log
grep -n "proxy_pass" /etc/nginx/sites-available/<APP_NAME>
```

Exemplo prático preenchido:

```bash
sudo tail -n 120 /var/log/nginx/error.log
grep -n "proxy_pass" /etc/nginx/sites-available/granacheck
```

### 13.2 App não sobe

Node/PM2:

```bash
pm2 status
pm2 logs <APP_NAME> --lines 120 --nostream
```

Docker:

```bash
docker ps -a
docker compose logs --tail=120
```

Exemplo prático preenchido (Node + PM2):

```bash
pm2 status
pm2 logs granacheck --lines 120 --nostream
```

### 13.3 Dependências quebradas (Node)

```bash
cd <APP_DIR>
git restore .
git pull origin main
rm -rf node_modules
npm install
pm2 restart <APP_NAME> --update-env
```

Exemplo prático preenchido:

```bash
cd /opt/granacheck/app
git restore .
git pull origin main
rm -rf node_modules
npm install
pm2 restart granacheck --update-env
```

## 14. Rollback rápido

```bash
cd <APP_DIR>
git log -5 --oneline
git checkout <COMMIT_ANTERIOR>
```

Exemplo prático preenchido:

```bash
cd /opt/granacheck/app
git log -5 --oneline
git checkout e70dbf7
```

Node:

```bash
npm install
pm2 restart <APP_NAME> --update-env
```

Exemplo prático preenchido:

```bash
npm install
pm2 restart granacheck --update-env
```

Docker:

```bash
docker compose up -d --build
```

## 15. Banco de dados (backup)

SQLite:

```bash
cp <APP_DIR>/data/<DB_FILE>.db <APP_DIR>/data/<DB_FILE>-$(date +%F_%H%M).bak
```

Exemplo prático preenchido:

```bash
cp /opt/granacheck/app/data/granacheck.db /opt/granacheck/app/data/granacheck-$(date +%F_%H%M).bak
```

MySQL/PostgreSQL: usar `mysqldump` / `pg_dump` conforme stack.

## 16. Isolamento (host vs container)

```bash
sudo docker ps
pm2 status
ps -ef | grep -E "node|python|java" | grep -v grep
```

Leitura:

- Se existe processo no PM2 e `docker ps` vazio: execução no host.
- Se há container ativo da app: execução containerizada.

## 17. Boas práticas

- Padronize `<APP_NAME>`, portas e paths por aplicação.
- Não edite código direto em produção.
- Faça backup antes de mudanças sensíveis.
- Sempre valide `HEAD` local vs VPS.
- Tenha rota de health check (`/health`) em todas as apps.
