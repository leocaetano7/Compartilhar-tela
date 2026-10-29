# Nemesis call

**Autor:** leocaetano7

Site de chamada de vídeo e compartilhamento de tela que roda direto no **GitHub Pages**, sem servidor próprio.
O vídeo, o áudio, a tela compartilhada e o chat da chamada são feitos pelo **JaaS (Jitsi as a Service) da 8x8**, o mesmo serviço do `8x8.vc`.

## Como funciona
- Lista de canais de voz no estilo Discord: **Sala 1** até **Sala 10** (a quantidade fica em `TOTAL_SALAS`, no `client.js`). Basta clicar para entrar.
- Embaixo do canal em que você está aparecem o tempo de chamada e quem está nela, com avatar, ícone de microfone mutado, ✋ de mão levantada e o selo **AO VIVO** para quem está compartilhando a tela.
- **Convidar para voz** e **+ Criar sala** copiam o link de convite (a sala criada é `sala-xxxxxxxx`).
- **Entrar com código** aceita o código, o link do site ou o link do 8x8.
- Cada sala tem seu próprio link: `https://leocaetano7.github.io/Compartilhar-tela/#sala-1`.
- Só dá para ver quem está na sala em que você entrou. As outras salas não mostram ninguém, porque isso precisaria de um servidor.
- O nome que a pessoa digita fica salvo no navegador (`localStorage`).
- Botão **Compartilhar tela** no topo, e até 30 fps na tela compartilhada.
- No celular a chamada abre no próprio navegador, sem mandar baixar o app.

## Arquivos
| Arquivo | O que faz |
|---|---|
| `index.html` | Estrutura da página |
| `style.css` | Visual (cores no estilo Discord, e um layout para celular) |
| `client.js` | Canais, salas, convite e integração com o 8x8 |
| `.nojekyll` | Faz o GitHub Pages servir os arquivos sem processar com Jekyll |

O `App ID` do JaaS fica no começo do `client.js` (`JAAS_APP_ID`). Para usar outra conta do 8x8, troque só ele.

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

## Limites do plano grátis do JaaS
- O plano **Dev** é grátis até **25 usuários ativos por mês**. Acima disso é preciso mudar de plano no painel [jaas.8x8.vc](https://jaas.8x8.vc).
- O site entra nas salas **sem JWT** (token de login). Se aparecer "aguardando o moderador" ou pedido de autenticação, libere no painel do JaaS a opção de deixar participantes entrarem sem autenticação.
- Sem JWT, ninguém é moderador, então não dá para gravar a chamada nem fazer transmissão. Para isso o JWT tem que ser assinado com a chave privada num servidor, e isso não pode ficar num site estático, senão a chave vaza.

## Versão antiga (C# + PostgreSQL)
A versão com login, banco de dados e chat via SignalR não roda no GitHub Pages, que só serve arquivos estáticos.
O código dela continua no histórico do git, no commit `ccb1397`:
```
git checkout ccb1397
```
