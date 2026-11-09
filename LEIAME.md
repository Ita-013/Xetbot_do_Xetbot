# Monitor de Promoções do Telegram

A cada 10 minutos o GitHub Actions lê as páginas públicas dos canais
(`t.me/s/achadoshardware` e `t.me/s/xetdaspromocoes`), procura as postagens novas e,
se alguma bater com um produto do `config.json`, **um bot seu te avisa no Telegram**.

Não usa o login da sua conta e não precisa do PC ligado.

## Configuração (uma vez só)

### 1. Criar o bot
1. No Telegram, abra o **@BotFather** e mande `/newbot`.
2. Escolha um nome e um usuário (precisa terminar em `bot`).
3. Ele responde com um **token** (algo como `123456:ABC-xyz...`). Guarde, não compartilhe.
4. Abra o seu bot novo e mande qualquer mensagem (ex: "oi"). Sem isso o bot não pode falar com você.

### 2. Criar o repositório no GitHub
1. Crie um repositório **público** novo (ex: `monitor-promocoes`).
2. Suba todos os arquivos desta pasta, incluindo a pasta `.github`.

### 3. Guardar o token
No repositório: **Settings → Secrets and variables → Actions → New repository secret**
- Nome: `BOT_TOKEN`
- Valor: o token do BotFather

### 4. Ligar
Aba **Actions** → "Monitor de promocoes" → **Run workflow**.
Na primeira execução você recebe "✅ Monitor ativado" no bot. A partir daí, só avisa
postagens novas.

## Editar os produtos

Edite o `config.json` direto no GitHub (ícone de lápis). Cada produto aceita:

| Campo         | O que faz                                                           |
|---------------|---------------------------------------------------------------------|
| `nome`        | Nome que aparece no aviso                                           |
| `todas`       | Todas essas palavras precisam aparecer                              |
| `alguma`      | Pelo menos uma destas precisa aparecer (opcional)                   |
| `excluir`     | Se alguma aparecer, ignora a postagem (opcional)                    |
| `precoMaximo` | Só avisa se o menor "R$" da postagem for até esse valor (opcional)  |

Maiúsculas e acentos são ignorados. Para adicionar outro canal público, coloque o nome
dele (sem `@`) em `"canais"`.

## Observações
- O GitHub pode atrasar as execuções agendadas (às vezes 15–20 min em vez de 10).
- O arquivo `state.json` guarda a última postagem lida de cada canal e o ID do seu chat
  com o bot. Ele é atualizado automaticamente — não precisa mexer.
- Se preferir não deixar o ID do chat visível no repositório público, crie também um
  Secret `CHAT_ID` com esse número e apague o campo `chatId` do `state.json`.
- Testar no PC (sem enviar nada): `node check.js --seco`
