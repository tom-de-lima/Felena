# Manual de Deploy - GranaCheck (Hostinger VPS + Ubuntu 24.04)

Este documento registra, de forma completa, o procedimento utilizado para publicar o app **GranaCheck** em produção na VPS da Hostinger, com domínio `orqtech.tech`, acesso via Termius e execução isolada.

## 1. Contexto do ambiente

- VPS: Hostinger
- SO: Ubuntu 24.04 LTS
- Domínio: `orqtech.tech`
- Aplicação: Node.js + Express
- Processo: PM2
- Proxy reverso: Nginx
- SSL: Let's Encrypt (Certbot)
- Acesso remoto: Termius (SSH)

## 2. Objetivo da publicação

- Rodar o app de forma estável e persistente.
- Isolar a aplicação de outros serviços.
- Expor por domínio com HTTPS.
- Garantir reinício automático após reboot.

## 3. Acesso inicial na VPS

Conexão via SSH:

```bash
ssh root@IP_DA_VPS
```

Atualização de pacotes:

```bash
apt update && apt upgrade -y
```

Instalação de dependências base:

```bash
apt install -y git curl nginx ufw certbot python3-certbot-nginx
```

## 4. Criação de usuário isolado da aplicação

Usuário dedicado:

```bash
adduser granacheck
usermod -aG sudo granacheck
```

## 5. Instalação do Node.js e PM2

Node 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

PM2 global:

```bash
npm install -g pm2
```

Validação:

```bash
node -v
npm -v
pm2 -v
```

## 6. Estrutura isolada do projeto

Criação de diretório de app:

```bash
mkdir -p /opt/granacheck
chown -R granacheck:granacheck /opt/granacheck
```

Troca para o usuário da app:

```bash
su - granacheck
```

Clone do repositório:

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git /opt/granacheck/app
cd /opt/granacheck/app
npm ci
```

## 7. Configuração de ambiente (`.env`)

Arquivo:

```bash
nano /opt/granacheck/app/.env
```

Exemplo utilizado:

```env
PORT=3000
APP_BASE_URL=https://orqtech.tech
APP_TIMEZONE=America/Fortaleza
JWT_SECRET=SEU_SEGREDO_FORTE_1
ADMIN_JWT_SECRET=SEU_SEGREDO_FORTE_2
PIX_KEY=SUA_CHAVE_PIX
MASTER_ADMIN_NAME=Administrador Master
MASTER_ADMIN_EMAIL=master@granacheck.local
MASTER_ADMIN_PASSWORD=Master@123456
```

## 8. Teste local da aplicação na VPS

Execução manual:

```bash
cd /opt/granacheck/app
node server.js
```

Teste de saúde:

```bash
curl -i http://127.0.0.1:3000/health
```

Resposta esperada:

```json
{"ok":true}
```

## 9. Subida com PM2 (produção)

Iniciar app:

```bash
cd /opt/granacheck/app
pm2 start server.js --name granacheck
pm2 save
```

Habilitar auto-start no boot:

```bash
pm2 startup
```

Executar o comando adicional que o PM2 imprimir (normalmente com `sudo`), depois:

```bash
pm2 save
pm2 status
```

## 10. Configuração do Nginx

Arquivo de site:

```bash
sudo nano /etc/nginx/sites-available/granacheck
```

Configuração:

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

Ativação:

```bash
sudo ln -s /etc/nginx/sites-available/granacheck /etc/nginx/sites-enabled/granacheck
sudo nginx -t
sudo systemctl reload nginx
```

## 11. DNS do domínio na Hostinger

Entradas configuradas no painel DNS:

- `A` para `@` -> `IP_DA_VPS`
- `A` para `www` -> `IP_DA_VPS`

## 12. SSL (HTTPS) com Certbot

```bash
sudo certbot --nginx -d orqtech.tech -d www.orqtech.tech
```

Durante o wizard, selecionar redirecionamento HTTP -> HTTPS.

## 13. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 14. Erro encontrado e resolução (502 Bad Gateway)

### Sintoma

Ao acessar `https://orqtech.tech`, apareceu:

`502 Bad Gateway (nginx/1.24.0)`

### Diagnóstico realizado

1. Verificação de saúde da app:

```bash
curl -i http://127.0.0.1:3000/health
```

Retorno: `200` com `{"ok":true}`.

2. Verificação dos logs do Nginx:

```bash
sudo tail -n 80 /var/log/nginx/error.log
```

Foi identificado upstream recusado em `127.0.0.1:3010` (`connect() failed (111: Connection refused)`), indicando incompatibilidade de porta.

3. Checagem do `proxy_pass` efetivo:

```bash
grep -R "proxy_pass" /etc/nginx/sites-available/granacheck
```

4. Ajuste definitivo para alinhar com a porta da app (`3000`) e recarregar Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Validação após correção

```bash
curl -i http://127.0.0.1:3000/health
curl -I https://orqtech.tech
```

Resultado final: aplicação operacional, com redirecionamento correto para `/app/login`.

## 15. Verificações finais de produção

```bash
pm2 status
pm2 logs granacheck --lines 80
curl -i http://127.0.0.1:3000/health
curl -I https://orqtech.tech
```

Checklist:

- App responde em `/health`.
- PM2 mostra processo `online`.
- Domínio abre via HTTPS.
- Login, cálculos, histórico e área admin funcionando.

## 16. Rotina de atualização (deploy de novas versões)

Como usuário `granacheck`:

```bash
cd /opt/granacheck/app
git pull
npm ci
pm2 restart granacheck
pm2 save
```

Validação:

```bash
pm2 status
curl -i http://127.0.0.1:3000/health
```

## 17. Backup recomendado (SQLite)

Banco local em:

`/opt/granacheck/app/data/granacheck.db`

Backup manual:

```bash
cp /opt/granacheck/app/data/granacheck.db /opt/granacheck/app/data/granacheck-$(date +%F).db.bak
```

## 18. Observações importantes

- O app está isolado por:
  - usuário dedicado (`granacheck`)
  - diretório dedicado (`/opt/granacheck/app`)
  - processo PM2 nomeado (`granacheck`)
  - bloco Nginx específico (`granacheck`)
- Em comandos com `sudo`, usar a senha do usuário atual (`granacheck`) ou operar como root.

