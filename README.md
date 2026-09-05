# Discord Clone - Projeto de Faculdade (versão C#)

**Autor:** leocaetano7

## O que já está funcionando
- Login e cadastro (senha criptografada com BCrypt, guardada no PostgreSQL)
- "Sessão" de login guardada no banco (não perde o login quando o servidor reinicia)
- Criação de canais com código de convite
- Entrar em canal usando o código de um amigo
- Chat em tempo real via **SignalR** (equivalente ao Socket.io, só que em C#)
- Chamada de vídeo com PeerJS (JavaScript no navegador, igual antes)
- Botões de mutar microfone, ligar/desligar câmera, compartilhar tela

## O que mudou da versão Node.js
| Antes (Node.js) | Agora (C#) |
|---|---|
| Express | ASP.NET Core (Minimal API) |
| Socket.io | SignalR |
| pg (biblioteca do Postgres) | Npgsql |
| bcryptjs | BCrypt.Net-Next |
| express-session + connect-pg-simple | Tabela `discord_sessions` própria, feita na mão |

O HTML/CSS não mudou quase nada. O `client.js` mudou só a parte de conexão em tempo real (troca de `io()` do Socket.io pelo `HubConnectionBuilder` do SignalR).

## Rodando localmente (precisa ter o .NET 8 SDK instalado)
```
dotnet restore
dotnet run
```
Antes de rodar, defina a variável de ambiente `DATABASE_URL` com a connection string do Supabase (a mesma que já usamos na versão Node.js).

## Publicando no Render

O Render não roda .NET nativamente do mesmo jeito que roda Node.js, então usamos um **Dockerfile** (já incluso no projeto) - o Render detecta ele sozinho.

1. No Render, no seu Web Service (ou crie um novo), em **"Runtime"**, escolha **"Docker"**.
2. Nas variáveis de ambiente ("Environment"), mantenha as mesmas de antes:
   - `DATABASE_URL` = a connection string do Supabase
3. Salve e espere o build (a primeira vez demora um pouco mais, porque baixa a imagem do .NET).

## Próximos passos
1. Gerar link clicável de convite (não só o código).
2. Lista de participantes online.
3. Editar/apagar mensagens.
