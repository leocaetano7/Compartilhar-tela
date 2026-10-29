// Prefixo dos IDs no servidor gratuito do PeerJS (0.peerjs.com). O servidor é
// compartilhado com outros sites, então o prefixo precisa ser só nosso.
const PREFIXO_ID = "nemesiscall-";
const TOTAL_SALAS = 10;
// Cada pessoa manda áudio e vídeo direto pra cada uma das outras,
// então sala grande pesa na internet de todo mundo
const MAX_PESSOAS = 8;

const SALAS = Array.from({ length: TOTAL_SALAS }, (_, i) => ({ slug: `sala-${i + 1}`, nome: `Sala ${i + 1}` }));
const CORES_AVATAR = ["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#1abc9c", "#9b59b6", "#e67e22"];

// Desenhos dos ícones (traço de 2px, a cor vem do texto)
const ICONES = {
  voz: '<path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  mutado: '<path d="m2 2 20 20"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 17a7 7 0 0 1-12-5v-2m14 0v2a7 7 0 0 1-.1 1.2"/><path d="M12 19v3"/>',
  camera: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  cameraDesligada: '<path d="M10.7 6H14a2 2 0 0 1 2 2v2.3l1 1L22 8v8"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z"/><path d="m2 2 20 20"/>',
  tela: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  sair: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-3.3-2.7m-2.7-3.3a19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.4 2.1L8.1 9.9"/><path d="m22 2-20 20"/>',
  convidar: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  seta: '<path d="m9 18 6-6-6-6"/>',
};

const $ = (id) => document.getElementById(id);
const podeCompartilharTela = !!navigator.mediaDevices?.getDisplayMedia;

// ---------- ESTADO DA CHAMADA ----------
let peer = null;          // minha conexão com o servidor do PeerJS
let salaAtual = null;     // sala aberta na tela (pode estar conectando ainda)
let meuId = null;         // meu "lugar" na sala, ex.: nemesiscall-sala-1-0
let tentativaAtual = 0;   // muda a cada entrada/saída, pra cancelar uma entrada que ficou pra trás
let inicioChamada = null;
let euFalando = false;
let ultimoSom = 0;
let meuLugar = -1;
let timerManutencao = null;
let timerTempo = null;
let timerFalando = null;
const meuEstado = { nome: "", mutado: false, camera: false, tela: false };
// id -> { id, dados, euIniciei, chamada, estado, falando, criadoEm, ultimoContato, audio, bloco, streamVideo }
const pares = new Map();

// Mídia local. Tudo o que eu mando sai em 1 trilha de áudio + 1 de vídeo:
// o áudio é o microfone misturado com o som da tela, e o vídeo é a tela, a câmera ou um vídeo vazio.
let audioCtx = null;
let ganhoMic = null;
let analisadorMic = null;
let destinoAudio = null;
let micStream = null;
let cameraTrack = null;
let telaStream = null;
let fonteAudioTela = null;
let videoVazio = null;
let meuBloco = null;
const amostrasMic = new Float32Array(512);

// ---------- UTILITÁRIOS ----------
function criarSlug(texto) {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function nomeDaSala(slug) {
  return SALAS.find((sala) => sala.slug === slug)?.nome || slug;
}

function linkDaSala(slug) {
  return location.origin + location.pathname + "#" + slug;
}

function formatarTempo(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const segundos = String(total % 60).padStart(2, "0");
  return horas ? `${horas}:${minutos}:${segundos}` : `${minutos}:${segundos}`;
}

function icone(nome, classe = "") {
  const molde = document.createElement("template");
  molde.innerHTML = `<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
  return molde.content.firstChild;
}

function criarAvatar(nome, classeExtra = "") {
  const avatar = document.createElement("span");
  avatar.className = ("avatar " + classeExtra).trim();
  avatar.textContent = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => Array.from(parte)[0]).join("").toUpperCase() || "?";
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + letra.codePointAt(0)) >>> 0;
  avatar.style.background = CORES_AVATAR[soma % CORES_AVATAR.length];
  return avatar;
}

let timerAviso;
function mostrarAviso(texto) {
  const aviso = $("aviso");
  aviso.textContent = texto;
  aviso.classList.add("visivel");
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => aviso.classList.remove("visivel"), 4000);
}

function lerNomeSalvo() {
  try { return localStorage.getItem("nome") || ""; } catch { return ""; }
}

function salvarNome(nome) {
  try { localStorage.setItem("nome", nome); } catch {}
}

function pararTrilhas(stream) {
  stream?.getTracks().forEach((trilha) => trilha.stop());
}

// ---------- LISTA DE CANAIS DE VOZ ----------
function montarCanais() {
  const lista = $("listaCanais");
  lista.innerHTML = "";

  // Sala criada ou vinda de convite aparece no fim da lista enquanto você está nela
  const salaExtra = salaAtual && !SALAS.some((sala) => sala.slug === salaAtual);
  const salas = salaExtra ? [...SALAS, { slug: salaAtual, nome: salaAtual }] : SALAS;

  for (const sala of salas) {
    const li = document.createElement("li");
    li.className = "canal";

    const botao = document.createElement("button");
    botao.className = "canal-botao";
    const nome = document.createElement("span");
    nome.className = "canal-nome";
    nome.textContent = sala.nome;
    botao.append(icone("voz", "icone-voz"), nome);
    botao.addEventListener("click", () => irPara(sala.slug));
    li.append(botao);

    if (sala.slug === salaAtual) {
      li.classList.add("ativo");
      botao.setAttribute("aria-current", "page");

      const tempo = document.createElement("span");
      tempo.id = "tempoChamada";
      tempo.className = "canal-tempo";
      botao.append(tempo);

      const membros = document.createElement("ul");
      membros.id = "membrosCanal";
      membros.className = "canal-membros";
      li.append(membros);
    }

    lista.append(li);
  }

  atualizarMembros();
  atualizarTempo();
}

function pessoasNaChamada() {
  if (!meuId) return [];
  const pessoas = [{ id: meuId, ...meuEstado, falando: euFalando }];
  for (const par of pares.values()) {
    if (par.estado) pessoas.push({ id: par.id, ...par.estado, falando: par.falando });
  }
  return pessoas;
}

function atualizarMembros() {
  const pessoas = pessoasNaChamada().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // No celular a lista de membros fica escondida, então os nomes aparecem no topo
  $("listaParticipantes").textContent = pessoas.length ? `Na chamada (${pessoas.length}): ${pessoas.map((p) => p.nome).join(", ")}` : "";

  const lista = $("membrosCanal");
  if (!lista) return;
  lista.innerHTML = "";

  if (!meuId) {
    const conectando = document.createElement("li");
    conectando.className = "membro conectando";
    conectando.textContent = "Conectando…";
    lista.append(conectando);
    return;
  }

  for (const pessoa of pessoas) {
    const li = document.createElement("li");
    li.className = "membro";
    li.dataset.id = pessoa.id;
    li.classList.toggle("falando", pessoa.falando);

    const nome = document.createElement("span");
    nome.className = "membro-nome";
    nome.textContent = pessoa.nome;
    li.append(criarAvatar(pessoa.nome), nome);

    if (pessoa.tela) {
      const aoVivo = document.createElement("span");
      aoVivo.className = "ao-vivo";
      aoVivo.textContent = "AO VIVO";
      aoVivo.title = "Compartilhando a tela";
      li.append(aoVivo);
    }

    const icones = document.createElement("span");
    icones.className = "membro-icones";
    if (pessoa.camera) icones.append(icone("camera"));
    if (pessoa.mutado) icones.append(icone("mutado"));
    li.append(icones);

    lista.append(li);
  }

  const itemConvite = document.createElement("li");
  const convidar = document.createElement("button");
  convidar.className = "membro convidar";
  const textoConvite = document.createElement("span");
  textoConvite.textContent = "Convidar para voz";
  convidar.append(icone("convidar"), textoConvite, icone("seta", "icone-seta"));
  convidar.addEventListener("click", () => copiarConvite(salaAtual));
  itemConvite.append(convidar);
  lista.append(itemConvite);
}

function atualizarTempo() {
  const tempo = $("tempoChamada");
  if (tempo) tempo.textContent = meuId && inicioChamada ? formatarTempo(Date.now() - inicioChamada) : "";
}

function marcarFalando(id, falando) {
  if (!id) return;
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((el) => el.classList.toggle("falando", falando));
}

// ---------- BLOCOS DE VÍDEO (um por pessoa) ----------
function criarBloco(id) {
  const bloco = document.createElement("div");
  bloco.className = "bloco";
  bloco.dataset.id = id;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // o som vem por um <audio> separado

  const rotulo = document.createElement("div");
  rotulo.className = "rotulo";

  bloco.append(video, rotulo);
  bloco.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (bloco.classList.contains("com-video")) bloco.requestFullscreen?.().catch(() => {});
  });
  $("palco").append(bloco);
  return bloco;
}

function atualizarBloco(bloco, pessoa) {
  const comVideo = pessoa.camera || pessoa.tela;
  bloco.classList.toggle("com-video", comVideo);
  bloco.classList.toggle("destaque", pessoa.tela);
  bloco.classList.toggle("falando", pessoa.falando);
  bloco.title = comVideo ? "Clique para ver em tela cheia" : "";

  const avatar = criarAvatar(pessoa.nome, "avatar-grande");
  const avatarAntigo = bloco.querySelector(".avatar");
  if (avatarAntigo) avatarAntigo.replaceWith(avatar);
  else bloco.append(avatar);

  const nome = document.createElement("span");
  nome.textContent = pessoa.nome;
  const rotulo = bloco.querySelector(".rotulo");
  rotulo.replaceChildren();
  if (pessoa.mutado) rotulo.append(icone("mutado"));
  rotulo.append(nome);
  if (pessoa.tela) {
    const aoVivo = document.createElement("span");
    aoVivo.className = "ao-vivo";
    aoVivo.textContent = "AO VIVO";
    rotulo.append(aoVivo);
  }
}

function atualizarControles() {
  const mic = $("btnMic");
  mic.replaceChildren(icone(meuEstado.mutado ? "mutado" : "mic"));
  mic.classList.toggle("desligado", meuEstado.mutado);
  mic.title = meuEstado.mutado ? "Ligar microfone" : "Mutar microfone";

  const camera = $("btnCamera");
  camera.replaceChildren(icone(meuEstado.camera ? "camera" : "cameraDesligada"));
  camera.classList.toggle("ligado", meuEstado.camera);
  camera.title = meuEstado.camera ? "Desligar câmera" : "Ligar câmera";

  const tela = $("btnTela");
  tela.replaceChildren(icone("tela"));
  tela.classList.toggle("ligado", meuEstado.tela);
  tela.title = meuEstado.tela ? "Parar de compartilhar" : "Compartilhar tela";
  tela.hidden = !podeCompartilharTela;

  $("btnSair").replaceChildren(icone("sair"));
  $("btnSair").title = "Sair da chamada";

  for (const botao of [mic, camera, tela, $("btnSair")]) botao.setAttribute("aria-label", botao.title);
}

function atualizarTela() {
  atualizarMembros();
  if (meuBloco) atualizarBloco(meuBloco, { ...meuEstado, falando: euFalando });
  let alguemNaTela = meuEstado.tela;
  for (const par of pares.values()) {
    if (!par.estado) continue;
    if (!par.bloco) {
      par.bloco = criarBloco(par.id);
      if (par.streamVideo) par.bloco.querySelector("video").srcObject = par.streamVideo;
    }
    atualizarBloco(par.bloco, { ...par.estado, falando: par.falando });
    alguemNaTela ||= par.estado.tela;
  }
  $("palco").classList.toggle("com-tela", alguemNaTela);
  atualizarControles();
}

// ---------- NAVEGAÇÃO (a sala fica no link: site/#sala-1) ----------
function salaDaUrl() {
  try { return criarSlug(decodeURIComponent(location.hash.slice(1))); } catch { return ""; }
}

function irPara(slug) {
  if (slug) {
    location.hash = slug; // dispara o "hashchange", que abre a sala
  } else {
    history.pushState(null, "", location.pathname + location.search);
    sairDaChamada();
  }
}

function abrirSalaDaUrl() {
  const slug = salaDaUrl();
  if (slug === salaAtual) return;
  if (slug) pedirParaEntrar(slug);
  else sairDaChamada();
}

window.addEventListener("hashchange", abrirSalaDaUrl);

let salaPendente = null;
const dialogoEntrar = $("dialogoEntrar");

// O navegador só libera som depois de um clique na página, então quem chega
// por um link (ou ainda não tem nome) confirma a entrada antes
function pedirParaEntrar(slug) {
  const nome = $("inputNome").value.trim();
  const jaClicou = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (nome && jaClicou) {
    entrarNaSala(slug);
    return;
  }
  salaPendente = slug;
  $("tituloEntrar").textContent = "Entrar na " + nomeDaSala(slug);
  $("inputNomeEntrar").value = nome;
  dialogoEntrar.returnValue = "";
  dialogoEntrar.showModal();
}

$("btnCancelarEntrar").addEventListener("click", () => dialogoEntrar.close());

dialogoEntrar.addEventListener("close", () => {
  const slug = salaPendente;
  salaPendente = null;
  if (dialogoEntrar.returnValue === "entrar") {
    const nome = $("inputNomeEntrar").value.trim();
    $("inputNome").value = nome;
    salvarNome(nome);
    entrarNaSala(slug);
  } else {
    // Desistiu: o link volta pra sala em que a pessoa já estava (ou pra nenhuma)
    history.replaceState(null, "", location.pathname + location.search + (salaAtual ? "#" + salaAtual : ""));
  }
});

// ---------- ENTRAR E SAIR ----------
async function entrarNaSala(slug) {
  sairDaChamada();
  const tentativa = tentativaAtual;
  const aindaValida = () => tentativa === tentativaAtual;

  salaAtual = slug;
  meuEstado.nome = $("inputNome").value.trim() || "Convidado";
  document.body.classList.add("em-chamada");
  montarCanais();
  $("nomeSalaAtual").textContent = nomeDaSala(slug);
  document.title = nomeDaSala(slug) + " · Nemesis call";
  $("boasVindas").hidden = true;
  $("palco").hidden = false;
  $("barraControles").hidden = false;
  $("btnCopiarLink").hidden = false;
  atualizarControles();

  if (typeof Peer === "undefined") {
    mostrarAviso("Não foi possível carregar o PeerJS. Verifique sua internet e recarregue a página.");
    irPara("");
    return;
  }

  // 1) Microfone (sem ele, a pessoa entra só ouvindo)
  let mic = null;
  try { mic = await pedirMicrofone(); } catch {}
  if (!aindaValida()) return pararTrilhas(mic);
  montarAudio();
  if (mic) conectarMicrofone(mic);
  else {
    meuEstado.mutado = true;
    mostrarAviso("Sem acesso ao microfone: você entrou só ouvindo.");
  }
  ganhoMic.gain.value = meuEstado.mutado ? 0 : 1;

  // 2) Um lugar livre na sala
  let novoPeer;
  try {
    novoPeer = await pegarLugarNaSala(slug);
  } catch (erro) {
    if (!aindaValida()) return;
    mostrarAviso(erro.message === "sala-cheia"
      ? `Sala cheia (máximo de ${MAX_PESSOAS} pessoas).`
      : "Não foi possível conectar ao servidor. Tente de novo em alguns segundos.");
    irPara("");
    return;
  }
  if (!aindaValida()) return novoPeer.destroy();

  peer = novoPeer;
  meuId = peer.id;
  meuLugar = numeroDoLugar(meuId);
  inicioChamada = Date.now();
  peer.on("connection", (dados) => adotarConexao(dados, false));
  peer.on("call", receberChamada);
  peer.on("disconnected", () => {
    // Caiu só a conexão com o servidor (as chamadas continuam): reconecta pra manter o lugar
    setTimeout(() => { if (peer && peer.disconnected && !peer.destroyed) peer.reconnect(); }, 2000);
  });
  peer.on("error", (erro) => {
    if (erro.type !== "peer-unavailable") console.warn("PeerJS:", erro.type, erro.message); // peer-unavailable = lugar vazio
  });

  meuBloco = criarBloco(meuId);
  timerManutencao = setInterval(manutencao, 5000);
  timerTempo = setInterval(atualizarTempo, 1000);
  timerFalando = setInterval(medirFala, 150);
  montarCanais();
  atualizarTela();
  procurarPessoas();
}

function sairDaChamada() {
  tentativaAtual++;
  for (const id of [...pares.keys()]) removerPar(id);
  if (peer) {
    peer.destroy();
    peer = null;
  }
  clearInterval(timerManutencao);
  clearInterval(timerTempo);
  clearInterval(timerFalando);

  pararTrilhas(micStream);
  pararTrilhas(telaStream);
  cameraTrack?.stop();
  videoVazio?.stop();
  audioCtx?.close().catch(() => {});
  micStream = telaStream = cameraTrack = videoVazio = null;
  audioCtx = ganhoMic = analisadorMic = destinoAudio = fonteAudioTela = null;
  meuBloco?.remove();
  meuBloco = null;

  meuId = null;
  meuLugar = -1;
  salaAtual = null;
  inicioChamada = null;
  euFalando = false;
  Object.assign(meuEstado, { mutado: false, camera: false, tela: false });
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  document.body.classList.remove("em-chamada");
  montarCanais();
  $("nomeSalaAtual").textContent = "Escolha um canal";
  document.title = "Nemesis call";
  $("boasVindas").hidden = false;
  $("palco").hidden = true;
  $("palco").replaceChildren();
  $("barraControles").hidden = true;
  $("btnCopiarLink").hidden = true;
}

// Fechou ou recarregou a aba: libera o lugar na hora
window.addEventListener("pagehide", () => peer?.destroy());

// ---------- LUGARES NA SALA ----------
// Cada sala tem MAX_PESSOAS lugares com ID fixo (nemesiscall-sala-1-0, -1, -2...).
// Quem entra pega o primeiro livre. A conexão entre duas pessoas é sempre iniciada
// por quem está no lugar de número maior, então as duas pontas nunca ligam ao mesmo tempo.
function idDoLugar(slug, lugar) {
  return `${PREFIXO_ID}${slug}-${lugar}`;
}

function numeroDoLugar(id) {
  const lugar = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isInteger(lugar) && id === idDoLugar(salaAtual, lugar) ? lugar : -1;
}

function tentarId(id) {
  return new Promise((resolve) => {
    const candidato = new Peer(id, { debug: 0 });
    const desistir = setTimeout(() => terminar({ erro: { type: "timeout" } }), 10000);
    function terminar(resultado) {
      clearTimeout(desistir);
      candidato.off("open", aoAbrir);
      candidato.off("error", aoErrar);
      if (resultado.erro) candidato.destroy();
      resolve(resultado);
    }
    function aoAbrir() { terminar({ peer: candidato }); }
    function aoErrar(erro) { terminar({ erro }); }
    candidato.on("open", aoAbrir);
    candidato.on("error", aoErrar);
  });
}

async function pegarLugarNaSala(slug) {
  for (let lugar = 0; lugar < MAX_PESSOAS; lugar++) {
    const { peer: novoPeer, erro } = await tentarId(idDoLugar(slug, lugar));
    if (novoPeer) return novoPeer;
    if (erro.type !== "unavailable-id") throw new Error(erro.type);
  }
  throw new Error("sala-cheia");
}

// Liga pros lugares menores que o meu (os maiores ligam pra mim)
function procurarPessoas() {
  if (!peer || peer.disconnected) return;
  for (let lugar = 0; lugar < meuLugar; lugar++) {
    const id = idDoLugar(salaAtual, lugar);
    if (pares.has(id)) continue;
    const dados = peer.connect(id, { serialization: "json" });
    if (dados) adotarConexao(dados, true);
  }
}

function adotarConexao(dados, euIniciei) {
  const id = dados.peer;
  const lugarDele = numeroDoLugar(id);
  if (lugarDele < 0 || (!euIniciei && lugarDele < meuLugar)) {
    dados.close(); // não é desta sala, ou não segue a regra de quem liga
    return;
  }

  let par = pares.get(id);
  if (par) {
    // A pessoa reconectou: fica a conexão nova
    const antiga = par.dados;
    Object.assign(par, { dados, euIniciei, criadoEm: Date.now() });
    antiga.close();
  } else {
    par = { id, dados, euIniciei, chamada: null, estado: null, falando: false, criadoEm: Date.now(), ultimoContato: Date.now() };
    pares.set(id, par);
  }

  dados.on("open", () => {
    if (par.dados !== dados) return;
    par.ultimoContato = Date.now();
    dados.send(mensagemEstado());
    if (par.euIniciei) ligarPara(par);
  });
  dados.on("data", (mensagem) => {
    if (par.dados === dados) receberMensagem(par, mensagem);
  });
  dados.on("close", () => {
    if (par.dados === dados) removerPar(id);
  });
  dados.on("error", () => {});
}

function removerPar(id) {
  const par = pares.get(id);
  if (!par) return;
  pares.delete(id);
  par.dados.close();
  par.chamada?.close();
  if (par.audio) {
    par.audio.srcObject = null;
    par.audio.remove();
  }
  par.bloco?.remove();
  atualizarTela();
}

// A cada 5 s: avisa que está vivo, tira quem sumiu, religa áudio que caiu
// e procura gente nova nos lugares menores (alguém pode ter pego um lugar que vagou)
function manutencao() {
  const agora = Date.now();
  enviarParaTodos({ t: "oi" });
  for (const par of [...pares.values()]) {
    if (!par.dados.open) {
      if (agora - par.criadoEm > 10000) removerPar(par.id); // lugar vazio
    } else if (agora - par.ultimoContato > 20000) {
      removerPar(par.id); // fechou a aba sem avisar
    } else if (!par.chamada && par.euIniciei) {
      ligarPara(par);
    }
  }
  procurarPessoas();
}

// ---------- MENSAGENS (nome, mute, câmera, tela, quem está falando) ----------
function mensagemEstado() {
  // Manda "há quanto tempo" em vez da hora, pra não depender do relógio de cada PC
  return { t: "estado", ...meuEstado, decorrido: Date.now() - inicioChamada };
}

function enviarParaTodos(mensagem) {
  for (const par of pares.values()) {
    if (par.dados.open) par.dados.send(mensagem);
  }
}

function anunciarEstado() {
  enviarParaTodos(mensagemEstado());
  atualizarTela();
}

function receberMensagem(par, mensagem) {
  par.ultimoContato = Date.now();
  if (!mensagem || typeof mensagem !== "object") return;

  if (mensagem.t === "estado") {
    par.estado = {
      nome: String(mensagem.nome || "Convidado").slice(0, 40),
      mutado: !!mensagem.mutado,
      camera: !!mensagem.camera,
      tela: !!mensagem.tela,
    };
    const decorrido = Number(mensagem.decorrido);
    if (decorrido > 0 && decorrido < 86400000) inicioChamada = Math.min(inicioChamada, Date.now() - decorrido);
    atualizarTela();
  } else if (mensagem.t === "falando") {
    par.falando = !!mensagem.v;
    marcarFalando(par.id, par.falando);
  }
}

// ---------- ÁUDIO E VÍDEO ----------
function pedirMicrofone() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

function montarAudio() {
  audioCtx = new AudioContext();
  audioCtx.resume().catch(() => {});
  // Se o navegador segurar o som até um clique, os outros ouviriam silêncio: avisa a pessoa
  setTimeout(() => { if (audioCtx?.state === "suspended") avisarSomBloqueado(); }, 1000);
  destinoAudio = audioCtx.createMediaStreamDestination();
  ganhoMic = audioCtx.createGain();
  ganhoMic.connect(destinoAudio);

  // "Vídeo vazio": a conexão já nasce com espaço pra câmera/tela,
  // e ligar uma delas depois é só trocar a trilha, sem renegociar
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
  videoVazio = canvas.captureStream(0).getVideoTracks()[0];
}

function conectarMicrofone(mic) {
  micStream = mic;
  const fonte = audioCtx.createMediaStreamSource(mic);
  analisadorMic = audioCtx.createAnalyser();
  analisadorMic.fftSize = amostrasMic.length;
  fonte.connect(ganhoMic);
  fonte.connect(analisadorMic);
}

function videoAtual() {
  return telaStream?.getVideoTracks()[0] || cameraTrack || videoVazio;
}

function meuStream() {
  return new MediaStream([destinoAudio.stream.getAudioTracks()[0], videoAtual()]);
}

function ligarPara(par) {
  if (!peer || !destinoAudio) return;
  adotarChamada(par, peer.call(par.id, meuStream()));
}

function receberChamada(chamada) {
  const par = pares.get(chamada.peer);
  if (!par || !destinoAudio) {
    chamada.close();
    return;
  }
  chamada.answer(meuStream());
  adotarChamada(par, chamada);
}

function adotarChamada(par, chamada) {
  if (!chamada) return;
  if (par.chamada && par.chamada !== chamada) par.chamada.close();
  par.chamada = chamada;
  chamada.on("stream", (stream) => {
    if (par.chamada !== chamada) return;
    mostrarMidiaRemota(par, stream);
    ajustarQualidade(chamada);
  });
  chamada.on("close", () => {
    if (par.chamada === chamada) par.chamada = null;
  });
  chamada.on("error", () => {});
}

function mostrarMidiaRemota(par, stream) {
  if (!par.audio) {
    par.audio = document.createElement("audio");
    par.audio.autoplay = true;
    document.body.append(par.audio);
  }
  par.audio.srcObject = new MediaStream(stream.getAudioTracks());
  // O PeerJS avisa uma vez pro áudio e outra pro vídeo; só o "NotAllowedError" é bloqueio de verdade
  par.audio.play().catch((erro) => { if (erro.name === "NotAllowedError") avisarSomBloqueado(); });

  par.streamVideo = new MediaStream(stream.getVideoTracks());
  if (par.bloco) par.bloco.querySelector("video").srcObject = par.streamVideo;
}

function avisarSomBloqueado() {
  mostrarAviso("Clique em qualquer lugar da página para ouvir a chamada.");
  document.addEventListener("click", () => {
    audioCtx?.resume().catch(() => {});
    for (const par of pares.values()) par.audio?.play().catch(() => {});
  }, { once: true });
}

// Troca o que vai no vídeo (tela, câmera ou vazio) em todas as conexões de uma vez
function trocarVideoEnviado() {
  const trilha = videoAtual();
  for (const par of pares.values()) {
    const remetente = par.chamada?.peerConnection?.getSenders().find((s) => s.track?.kind === "video");
    if (remetente && remetente.track !== trilha) {
      remetente.replaceTrack(trilha).then(() => ajustarQualidade(par.chamada)).catch(() => {});
    }
  }
  if (meuBloco) {
    meuBloco.querySelector("video").srcObject = trilha === videoVazio ? null : new MediaStream([trilha]);
    meuBloco.classList.toggle("espelhado", !!cameraTrack && !telaStream);
  }
}

// Limita quanto cada conexão gasta: a tela pode mais, a câmera menos
async function ajustarQualidade(chamada) {
  const remetente = chamada?.peerConnection?.getSenders().find((s) => s.track?.kind === "video");
  if (!remetente) return;
  try {
    const parametros = remetente.getParameters();
    if (!parametros.encodings?.length) return;
    parametros.encodings[0].maxBitrate = meuEstado.tela ? 1500000 : 500000;
    await remetente.setParameters(parametros);
  } catch {}
}

async function alternarMicrofone() {
  if (!audioCtx) return;
  if (!micStream) {
    let mic;
    try {
      mic = await pedirMicrofone();
    } catch {
      mostrarAviso("O navegador não liberou o microfone. Confira a permissão no cadeado da barra de endereço.");
      return;
    }
    if (!audioCtx) return pararTrilhas(mic);
    conectarMicrofone(mic);
    meuEstado.mutado = false;
  } else {
    meuEstado.mutado = !meuEstado.mutado;
  }
  ganhoMic.gain.value = meuEstado.mutado ? 0 : 1;
  anunciarEstado();
}

async function alternarCamera() {
  if (!audioCtx) return;
  if (cameraTrack) {
    cameraTrack.stop();
    cameraTrack = null;
  } else {
    let trilha;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
      });
      trilha = stream.getVideoTracks()[0];
    } catch {
      mostrarAviso("Não foi possível ligar a câmera.");
      return;
    }
    if (!audioCtx) return trilha.stop();
    cameraTrack = trilha;
    trilha.addEventListener("ended", () => { if (cameraTrack === trilha) alternarCamera(); }); // câmera desconectada
  }
  meuEstado.camera = !!cameraTrack;
  trocarVideoEnviado();
  anunciarEstado();
}

async function alternarTela() {
  if (!audioCtx) return;
  if (telaStream) {
    pararTela();
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      // Som da aba/sistema junto, sem pegar o som da própria chamada (onde o navegador permite)
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },
      systemAudio: "include",
    });
  } catch {
    return; // a pessoa cancelou a escolha da tela
  }
  if (!audioCtx) return pararTrilhas(stream);

  telaStream = stream;
  telaStream.getVideoTracks()[0].addEventListener("ended", pararTela); // botão "Parar" do próprio navegador
  const somDaTela = telaStream.getAudioTracks()[0];
  if (somDaTela) {
    fonteAudioTela = audioCtx.createMediaStreamSource(new MediaStream([somDaTela]));
    fonteAudioTela.connect(destinoAudio);
  }
  meuEstado.tela = true;
  trocarVideoEnviado();
  anunciarEstado();
}

function pararTela() {
  if (!telaStream) return;
  pararTrilhas(telaStream);
  fonteAudioTela?.disconnect();
  fonteAudioTela = null;
  telaStream = null;
  meuEstado.tela = false;
  trocarVideoEnviado();
  anunciarEstado();
}

// Anel verde de quem está falando: mede o volume do meu microfone e avisa os outros
function medirFala() {
  if (!analisadorMic) return;
  analisadorMic.getFloatTimeDomainData(amostrasMic);
  let soma = 0;
  for (const amostra of amostrasMic) soma += amostra * amostra;
  const volume = Math.sqrt(soma / amostrasMic.length);
  const agora = Date.now();
  if (!meuEstado.mutado && volume > 0.02) ultimoSom = agora;
  const falando = agora - ultimoSom < 400;
  if (falando === euFalando) return;
  euFalando = falando;
  marcarFalando(meuId, falando);
  enviarParaTodos({ t: "falando", v: falando });
}

// ---------- CONVITE ----------
async function copiarConvite(slug, mensagem = "Link de convite copiado!") {
  const link = linkDaSala(slug);
  try {
    await navigator.clipboard.writeText(link);
    mostrarAviso(mensagem);
  } catch {
    prompt("Copie o link de convite:", link);
  }
}

// Aceita o código ("sala-1a2b3c4d") ou o link do site
function extrairCodigo(texto) {
  let codigo = texto.trim();
  if (codigo.includes("#")) codigo = codigo.split("#").pop();
  try { codigo = decodeURIComponent(codigo); } catch {}
  return criarSlug(codigo);
}

// ---------- BOTÕES ----------
$("btnCriarSala").addEventListener("click", () => {
  const aleatorio = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  const codigo = "sala-" + aleatorio;
  copiarConvite(codigo, "Sala criada! O link de convite foi copiado.");
  irPara(codigo);
});

const dialogoCodigo = $("dialogoCodigo");

$("btnEntrarCodigo").addEventListener("click", () => {
  $("inputCodigo").value = "";
  dialogoCodigo.returnValue = "";
  dialogoCodigo.showModal();
});

$("btnCancelarCodigo").addEventListener("click", () => dialogoCodigo.close());

dialogoCodigo.addEventListener("close", () => {
  if (dialogoCodigo.returnValue !== "entrar") return;
  const codigo = extrairCodigo($("inputCodigo").value);
  if (codigo) irPara(codigo);
  else mostrarAviso("Código inválido.");
});

$("btnMic").addEventListener("click", alternarMicrofone);
$("btnCamera").addEventListener("click", alternarCamera);
$("btnTela").addEventListener("click", alternarTela);
$("btnSair").addEventListener("click", () => irPara(""));
$("btnCopiarLink").addEventListener("click", () => salaAtual && copiarConvite(salaAtual));

$("inputNome").value = lerNomeSalvo();
$("inputNome").addEventListener("change", () => {
  const nome = $("inputNome").value.trim();
  salvarNome(nome);
  if (meuId && nome) {
    meuEstado.nome = nome;
    anunciarEstado();
  }
});

// ---------- INÍCIO ----------
sairDaChamada();
abrirSalaDaUrl();
