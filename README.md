# Nemesis call

**Autor:** leocaetano7

Site de chamada de voz e compartilhamento de tela que roda direto no **GitHub Pages**, sem servidor próprio, sem conta e sem limite de uso.
O áudio, a câmera e a tela vão **direto de um navegador para o outro (P2P, com WebRTC)**. O [PeerJS](https://peerjs.com) e o servidor gratuito dele (`0.peerjs.com`) só servem para as pessoas se encontrarem.

## Como funciona
- Lista de canais de voz no estilo Discord: **Sala 1** até **Sala 10** (a quantidade fica em `TOTAL_SALAS`, no `client.js`). Basta clicar para entrar.
- Embaixo do canal em que você está aparecem o tempo de chamada e quem está nela, com avatar, **anel verde em quem está falando**, ícones de microfone mutado e câmera ligada, e o selo **AO VIVO** para quem está compartilhando a tela.
- Na chamada, cada pessoa tem um bloco. Quem compartilha a tela ganha um bloco grande, e clicar num bloco com vídeo abre em tela cheia.
- Botões embaixo: microfone, câmera, compartilhar tela (até 30 fps, com o som da aba ou do sistema quando o navegador permite) e sair.
- **Convidar para voz** e **+ Criar sala** copiam o link de convite (a sala criada é `sala-xxxxxxxx`).
- **Entrar com código** aceita o código ou o link do site.
- Cada sala tem seu próprio link: `https://leocaetano7.github.io/Compartilhar-tela/#sala-1`. Quem abre o link confirma o nome antes de entrar, porque o navegador só libera o som depois de um clique.
- O nome fica salvo no navegador (`localStorage`).

## Como as pessoas se encontram sem servidor
Cada sala tem **8 lugares** com nome fixo no servidor do PeerJS (`nemesiscall-sala-1-0`, `nemesiscall-sala-1-1`...).
Quem entra pega o primeiro lugar livre e se conecta com quem está nos lugares de número menor. Quem está nos lugares de número maior se conecta com ele.
A cada 5 s cada um avisa que está vivo, tira da lista quem sumiu e procura gente nova.

## Limites
- **No máximo 8 pessoas por sala.** Cada pessoa manda o áudio e o vídeo direto para cada uma das outras, então quem compartilha a tela com muita gente gasta bastante internet de upload. Funciona melhor com até uns 5.
- Algumas redes muito fechadas (de empresa ou de alguns celulares) bloqueiam a conexão direta. Nesses casos o PeerJS tenta passar pelo servidor de TURN gratuito dele, que não tem garantia.
- Só dá para ver quem está na sala em que você entrou. As outras salas não mostram ninguém, porque isso precisaria de um servidor.
- Não tem chat de texto.
- Testado no Chrome. No celular dá para entrar, falar e ver a tela dos outros, mas os navegadores de celular não deixam compartilhar a tela.

## Arquivos
| Arquivo | O que faz |
|---|---|
| `index.html` | Estrutura da página |
| `style.css` | Visual (cores no estilo Discord, e um layout para celular) |
| `client.js` | Canais, salas, convite e a chamada P2P |
| `.nojekyll` | Faz o GitHub Pages servir os arquivos sem processar com Jekyll |

## Publicando no GitHub Pages
1. No repositório, vá em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Branch **main**, pasta **/ (root)**, e clique em **Save**.
4. Em 1 ou 2 minutos o site fica no ar em `https://leocaetano7.github.io/Compartilhar-tela/`.

Todo `git push` na `main` atualiza o site sozinho.

## Testando no computador
A câmera e a tela só funcionam em `https://` ou em `localhost`, então não dá para abrir o `index.html` com dois cliques. Rode um servidor simples na pasta:
```
npx serve .
```
ou
```
python -m http.server 8080
```
e abra `http://localhost:8080`.

Para testar com mais de uma pessoa no mesmo computador, abra o link da sala numa janela anônima ou em outro navegador. As abas do mesmo navegador dividem o nome salvo.

## Versão antiga (C# + PostgreSQL)
A versão com login, banco de dados e chat via SignalR não roda no GitHub Pages, que só serve arquivos estáticos.
O código dela continua no histórico do git, no commit `ccb1397`:
```
git checkout ccb1397
```
