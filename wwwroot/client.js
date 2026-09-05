// client.js
// Igual antes, só que agora fala com o servidor C# via SignalR em vez de Socket.io.

const conexao = new signalR.HubConnectionBuilder().withUrl("/chathub").build();
conexao.start().catch((erro) => console.error("Erro ao conectar no SignalR:", erro));

let usuarioLogado = null;
let canalAtual = null;
let cadastrando = false;

let peer = null;
let meuStream = null;
let chamadasAtivas = [];
let compartilhandoTela = false;

// ---------- VERIFICAR SE JÁ ESTÁ LOGADO ----------
async function verificarLogin() {
  const resp = await fetch("/api/me");
  if (resp.ok) {
    const dados = await resp.json();
    usuarioLogado = dados.usuario;
    mostrarApp();
  }
}
verificarLogin();

// ---------- LOGIN / CADASTRO ----------
document.getElementById("btnCadastrar").addEventListener("click", () => {
  cadastrando = !cadastrando;
  document.getElementById("tituloLogin").textContent = cadastrando ? "Criar conta" : "Entrar";
  document.getElementById("btnEntrar").textContent = cadastrando ? "Cadastrar" : "Entrar";
  document.getElementById("btnCadastrar").textContent = cadastrando
    ? "Já tenho conta - Entrar"
    : "Não tenho conta - Cadastrar";
});

document.getElementById("btnEntrar").addEventListener("click", async () => {
  const username = document.getElementById("inputUsuario").value.trim();
  const password = document.getElementById("inputSenha").value;
  if (!username || !password) return;

  const rota = cadastrando ? "/api/registrar" : "/api/login";
  const resp = await fetch(rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const dados = await resp.json();

  if (!resp.ok) {
    document.getElementById("erroLogin").textContent = dados.erro;
    return;
  }

  usuarioLogado = dados.usuario;
  mostrarApp();
});

function mostrarApp() {
  document.getElementById("telaLogin").style.display = "none";
  document.getElementById("telaApp").style.display = "flex";
  carregarCanais();
}

// ---------- CANAIS ----------
async function carregarCanais() {
  const resp = await fetch("/api/canais");

  if (resp.status === 401) {
    usuarioLogado = null;
    document.getElementById("telaApp").style.display = "none";
    document.getElementById("telaLogin").style.display = "flex";
    document.getElementById("erroLogin").textContent = "Sua sessão expirou, entre de novo.";
    return;
  }

  const dados = await resp.json();
  const lista = document.getElementById("listaCanais");
  lista.innerHTML = "";

  dados.canais.forEach((canal) => {
    const li = document.createElement("li");
    li.textContent = "# " + canal.name;
    li.addEventListener("click", () => trocarCanal(canal));
    lista.appendChild(li);
  });
}

async function trocarCanal(canal) {
  canalAtual = canal.id;
  document.getElementById("nomeCanalAtual").textContent = "#" + canal.name;
  document.getElementById("mensagens").innerHTML = "";
  await conexao.invoke("EntrarCanal", canal.id);
}

document.getElementById("btnCriarCanal").addEventListener("click", async () => {
  const nome = prompt("Nome do novo canal:");
  if (!nome) return;

  const resp = await fetch("/api/canais", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  const dados = await resp.json();

  await carregarCanais();
  await trocarCanal(dados.canal);

  document.getElementById("codigoConvite").value = dados.canal.invite_code;
  document.getElementById("modalConvite").style.display = "flex";
});

document.getElementById("btnEntrarCanal").addEventListener("click", async () => {
  const codigo = prompt("Cole aqui o código de convite que seu amigo te mandou:");
  if (!codigo) return;

  const resp = await fetch("/api/canais/entrar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  const dados = await resp.json();

  if (!resp.ok) {
    alert(dados.erro);
    return;
  }

  await carregarCanais();
  await trocarCanal(dados.canal);
});

document.getElementById("btnFecharModal").addEventListener("click", () => {
  document.getElementById("modalConvite").style.display = "none";
});

// ---------- CHAT ----------
document.getElementById("btnEnviar").addEventListener("click", enviarMensagem);
document.getElementById("inputMensagem").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensagem();
});

async function enviarMensagem() {
  if (!canalAtual) return alert("Escolha ou crie um canal primeiro");
  const input = document.getElementById("inputMensagem");
  const texto = input.value.trim();
  if (!texto) return;
  await conexao.invoke("Mensagem", canalAtual, texto);
  input.value = "";
}

conexao.on("novaMensagem", ({ usuario, texto, hora }) => {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>${usuario}</b> <span style="color:#949ba4">${hora}</span><br>${texto}`;
  document.getElementById("mensagens").appendChild(div);
  document.getElementById("mensagens").scrollTop = 999999;
});

conexao.on("mensagemSistema", (texto) => {
  const div = document.createElement("div");
  div.className = "sistema";
  div.textContent = texto;
  document.getElementById("mensagens").appendChild(div);
});

// ---------- CHAMADA: entrar, mutar, câmera, compartilhar tela ----------

document.getElementById("btnChamada").addEventListener("click", iniciarChamada);
document.getElementById("btnMutar").addEventListener("click", alternarMicrofone);
document.getElementById("btnCamera").addEventListener("click", alternarCamera);
document.getElementById("btnCompartilharTela").addEventListener("click", alternarCompartilharTela);

async function iniciarChamada() {
  if (!canalAtual) return alert("Escolha ou crie um canal primeiro");

  document.getElementById("areaVideo").style.display = "flex";
  document.getElementById("btnChamada").style.display = "none";
  document.getElementById("btnMutar").style.display = "inline-block";
  document.getElementById("btnCamera").style.display = "inline-block";
  document.getElementById("btnCompartilharTela").style.display = "inline-block";

  meuStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  meuStream.getVideoTracks()[0].enabled = false;

  mostrarVideo(meuStream, "Você", "meu-video");

  peer = new Peer();

  peer.on("open", async (peerId) => {
    await conexao.invoke("EntrarChamada", canalAtual, peerId);
  });

  peer.on("call", (chamada) => {
    chamada.answer(meuStream);
    chamada.on("stream", (streamRemoto) => mostrarVideo(streamRemoto, "Convidado", chamada.peer));
    chamadasAtivas.push(chamada);
  });

  conexao.on("novoParticipanteChamada", ({ peerId, usuario }) => {
    const chamada = peer.call(peerId, meuStream);
    chamada.on("stream", (streamRemoto) => mostrarVideo(streamRemoto, usuario, chamada.peer));
    chamadasAtivas.push(chamada);
  });
}

function mostrarVideo(stream, nome, idElemento) {
  let video = document.getElementById("video-" + idElemento);
  if (!video) {
    video = document.createElement("video");
    video.id = "video-" + idElemento;
    video.autoplay = true;
    video.playsInline = true;
    video.title = nome;
    document.getElementById("areaVideo").appendChild(video);
  }
  video.srcObject = stream;
}

function alternarMicrofone() {
  if (!meuStream) return;
  const faixaAudio = meuStream.getAudioTracks()[0];
  faixaAudio.enabled = !faixaAudio.enabled;
  document.getElementById("btnMutar").textContent = faixaAudio.enabled ? "🎤 Mutar" : "🔇 Desmutar";
}

function alternarCamera() {
  if (!meuStream) return;
  const faixaVideo = meuStream.getVideoTracks()[0];
  faixaVideo.enabled = !faixaVideo.enabled;
  document.getElementById("btnCamera").textContent = faixaVideo.enabled ? "📷 Desligar câmera" : "📷 Ligar câmera";
}

function trocarFaixaDeVideoEmTodasChamadas(novaFaixa) {
  chamadasAtivas.forEach((chamada) => {
    const remetente = chamada.peerConnection
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");
    if (remetente) remetente.replaceTrack(novaFaixa);
  });
}

async function alternarCompartilharTela() {
  if (!compartilhandoTela) {
    const streamTela = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const faixaTela = streamTela.getVideoTracks()[0];

    trocarFaixaDeVideoEmTodasChamadas(faixaTela);
    mostrarVideo(streamTela, "Sua tela", "meu-video");
    compartilhandoTela = true;
    document.getElementById("btnCompartilharTela").textContent = "🖥️ Parar compartilhamento";

    faixaTela.onended = pararCompartilharTela;
  } else {
    pararCompartilharTela();
  }
}

function pararCompartilharTela() {
  const faixaCamera = meuStream.getVideoTracks()[0];
  trocarFaixaDeVideoEmTodasChamadas(faixaCamera);
  mostrarVideo(meuStream, "Você", "meu-video");
  compartilhandoTela = false;
  document.getElementById("btnCompartilharTela").textContent = "🖥️ Compartilhar tela";
}
