// ID do seu app no JaaS (8x8.vc). Ele aparece no painel https://jaas.8x8.vc
const JAAS_APP_ID = "vpaas-magic-cookie-e6e833249fb34aa3b0e931d31b94c417";
// Prefixo pra não misturar as salas deste site com outras salas do mesmo App ID
const PREFIXO_SALA = "nemesis-";
const TOTAL_SALAS = 10;

const SALAS = Array.from({ length: TOTAL_SALAS }, (_, i) => ({ slug: `sala-${i + 1}`, nome: `Sala ${i + 1}` }));
const CORES_AVATAR = ["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#1abc9c", "#9b59b6", "#e67e22"];

// Desenhos dos ícones (traço de 2px, a cor vem do texto)
const ICONES = {
  voz: '<path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mutado: '<path d="m2 2 20 20"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 17a7 7 0 0 1-12-5v-2m14 0v2a7 7 0 0 1-.1 1.2"/><path d="M12 19v3"/>',
  convidar: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  seta: '<path d="m9 18 6-6-6-6"/>',
};

const $ = (id) => document.getElementById(id);
const podeCompartilharTela = !!navigator.mediaDevices?.getDisplayMedia;

let api = null;
let salaAtual = null;
let meuId = null;
let meuMicMutado = false;
let euCompartilhando = false;
let inicioChamada = null;
let timerChamada = null;
let timerSincronizar = null;
// id -> { nome, mutado, maoLevantada }
const participantes = new Map();
let compartilhandoTela = new Set();

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

function criarAvatar(nome) {
  const avatar = document.createElement("span");
  avatar.className = "avatar";
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
  timerAviso = setTimeout(() => aviso.classList.remove("visivel"), 3500);
}

function lerNomeSalvo() {
  try { return localStorage.getItem("nome") || ""; } catch { return ""; }
}

function salvarNome(nome) {
  try { localStorage.setItem("nome", nome); } catch {}
}

// ---------- SCRIPT DO 8x8 ----------
// Carrega em segundo plano, sem travar a abertura da página
let promessaApi = null;
function carregarApiJitsi() {
  if (!promessaApi) {
    promessaApi = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://8x8.vc/${JAAS_APP_ID}/external_api.js`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        promessaApi = null; // deixa tentar de novo na próxima vez
        script.remove();
        reject(new Error("Falha ao carregar o external_api.js"));
      };
      document.head.appendChild(script);
    });
  }
  return promessaApi;
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

function atualizarMembros() {
  const lista = $("membrosCanal");
  if (!lista) return;
  lista.innerHTML = "";

  if (!meuId) {
    const conectando = document.createElement("li");
    conectando.className = "membro conectando";
    conectando.textContent = "Conectando…";
    lista.append(conectando);
    $("listaParticipantes").textContent = "";
    return;
  }

  const membros = [...participantes.entries()].sort(([, a], [, b]) => a.nome.localeCompare(b.nome, "pt-BR"));

  for (const [id, membro] of membros) {
    const li = document.createElement("li");
    li.className = "membro";

    const nome = document.createElement("span");
    nome.className = "membro-nome";
    nome.textContent = membro.nome;
    li.append(criarAvatar(membro.nome), nome);

    if (membro.maoLevantada) {
      const mao = document.createElement("span");
      mao.textContent = "✋";
      mao.title = "Mão levantada";
      li.append(mao);
    }

    if (compartilhandoTela.has(id) || (id === meuId && euCompartilhando)) {
      const aoVivo = document.createElement("span");
      aoVivo.className = "ao-vivo";
      aoVivo.textContent = "AO VIVO";
      aoVivo.title = "Compartilhando a tela";
      li.append(aoVivo);
    }

    if (membro.mutado) {
      li.append(icone("mutado", "icone-mutado"));
      li.title = "Microfone desligado";
    }

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

  // No celular a lista de membros fica escondida, então os nomes aparecem no topo
  const nomes = membros.map(([, membro]) => membro.nome);
  $("listaParticipantes").textContent = `Na chamada (${nomes.length}): ${nomes.join(", ")}`;
}

function atualizarTempo() {
  const tempo = $("tempoChamada");
  if (tempo) tempo.textContent = inicioChamada && meuId ? formatarTempo(Date.now() - inicioChamada) : "";
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
    abrirSala("");
  }
}

window.addEventListener("hashchange", () => abrirSala(salaDaUrl()));

// ---------- CHAMADA ----------
async function abrirSala(slug) {
  if (slug === salaAtual) return;
  fecharChamada();
  if (!slug) return;

  salaAtual = slug;
  document.body.classList.add("em-chamada");
  montarCanais();
  $("nomeSalaAtual").textContent = nomeDaSala(slug);
  document.title = nomeDaSala(slug) + " · Nemesis call";
  $("boasVindas").hidden = true;
  $("meet").hidden = false;
  $("btnCopiarLink").hidden = false;
  $("btnSair").hidden = false;
  $("btnCompartilharTela").hidden = !podeCompartilharTela;

  try {
    await carregarApiJitsi();
  } catch {
    mostrarAviso("Não foi possível conectar ao servidor de vídeo. Verifique sua internet.");
    if (salaAtual === slug) irPara("");
    return;
  }
  if (salaAtual !== slug) return; // trocou de sala enquanto o script carregava

  const nome = $("inputNome").value.trim();

  api = new JitsiMeetExternalAPI("8x8.vc", {
    roomName: `${JAAS_APP_ID}/${PREFIXO_SALA}${slug}`,
    parentNode: $("meet"),
    width: "100%",
    height: "100%",
    lang: "pt-BR",
    userInfo: { displayName: nome },
    configOverwrite: {
      // Sem nome salvo, o 8x8 mostra a tela de pré-entrada pra pessoa digitar
      prejoinConfig: { enabled: !nome },
      startWithAudioMuted: false,
      startWithVideoMuted: true,
      // Tela compartilhada mais fluida (o padrão do Jitsi é 5 fps)
      desktopSharingFrameRate: { min: 5, max: 30 },
      // No celular, fica no navegador em vez de mandar baixar o app
      disableDeepLinking: true,
      // O convite é o link deste site, não o link do 8x8
      disableInviteFunctions: true,
      hideConferenceSubject: true,
      toolbarButtons: [
        "microphone", "camera", "desktop", "chat", "raisehand", "reactions",
        "participants-pane", "tileview", "select-background", "toggle-camera",
        "videoquality", "fullscreen", "settings", "hangup",
      ],
    },
    interfaceConfigOverwrite: {
      MOBILE_APP_PROMO: false,
    },
  });

  registrarEventos();
  timerChamada = setInterval(atualizarTempo, 1000);
  timerSincronizar = setInterval(sincronizarParticipantes, 2000);
}

function registrarEventos() {
  api.on("videoConferenceJoined", ({ id, displayName }) => {
    meuId = id;
    atualizarMeuNome(displayName);
    participantes.set(id, { nome: displayName || "Você", mutado: meuMicMutado, maoLevantada: false });
    if (!inicioChamada) inicioChamada = Date.now();
    atualizarMembros();
  });

  // Hora em que a chamada começou (mesmo que você tenha entrado depois).
  // Se o relógio do PC estiver atrasado ela vem "no futuro", então conta a partir de agora.
  api.on("conferenceCreatedTimestamp", ({ timestamp }) => {
    const inicio = Number(timestamp);
    if (inicio > 0) inicioChamada = Math.min(inicio, Date.now());
    atualizarTempo();
  });

  api.on("participantJoined", ({ id, displayName }) => {
    participantes.set(id, { nome: displayName || "Convidado", mutado: false, maoLevantada: false });
    atualizarMembros();
  });

  api.on("participantLeft", ({ id }) => {
    participantes.delete(id);
    compartilhandoTela.delete(id);
    atualizarMembros();
  });

  api.on("displayNameChange", ({ id, displayname }) => {
    if (id === meuId) atualizarMeuNome(displayname);
    alterarMembro(id, { nome: displayname || "Convidado" });
  });

  api.on("audioMuteStatusChanged", ({ muted }) => {
    meuMicMutado = muted;
    alterarMembro(meuId, { mutado: muted });
  });

  api.on("participantMuted", ({ participantId, isMuted, mediaType }) => {
    if (mediaType === "audio") alterarMembro(participantId, { mutado: isMuted });
  });

  api.on("raiseHandUpdated", ({ id, handRaised }) => alterarMembro(id, { maoLevantada: !!handRaised }));

  api.on("contentSharingParticipantsChanged", ({ data }) => {
    compartilhandoTela = new Set(data);
    atualizarMembros();
  });

  api.on("screenSharingStatusChanged", ({ on }) => {
    euCompartilhando = on;
    atualizarBotaoTela(on);
    atualizarMembros();
  });

  // Clicou em "desligar" dentro da chamada
  api.on("readyToClose", () => irPara(""));
}

function alterarMembro(id, mudancas) {
  const membro = participantes.get(id);
  if (!membro) return;
  Object.assign(membro, mudancas);
  atualizarMembros();
}

// O áudio de quem entra chega uns segundos depois e nem sempre gera evento,
// então de tempos em tempos pergunta pro 8x8 quem está mutado
async function sincronizarParticipantes() {
  const apiAtual = api;
  if (!apiAtual || !meuId) return;
  try {
    const { rooms } = await apiAtual.getRoomsInfo();
    if (api !== apiAtual) return;
    const sala = rooms.find((room) => room.isMainRoom) || rooms[0];
    let mudou = false;
    for (const pessoa of sala?.participants || []) {
      const membro = participantes.get(pessoa.id);
      if (membro && typeof pessoa.audioMuted === "boolean" && membro.mutado !== pessoa.audioMuted) {
        membro.mutado = pessoa.audioMuted;
        mudou = true;
      }
    }
    if (mudou) atualizarMembros();
  } catch {
    // Sem getRoomsInfo, fica só com os eventos
  }
}

function fecharChamada() {
  if (api) {
    api.dispose();
    api = null;
  }
  clearInterval(timerChamada);
  clearInterval(timerSincronizar);
  timerChamada = null;
  timerSincronizar = null;
  salaAtual = null;
  meuId = null;
  meuMicMutado = false;
  euCompartilhando = false;
  inicioChamada = null;
  participantes.clear();
  compartilhandoTela = new Set();

  document.body.classList.remove("em-chamada");
  montarCanais();
  $("nomeSalaAtual").textContent = "Escolha um canal";
  document.title = "Nemesis call";
  $("listaParticipantes").textContent = "";
  $("boasVindas").hidden = false;
  $("meet").hidden = true;
  $("btnCopiarLink").hidden = true;
  $("btnSair").hidden = true;
  $("btnCompartilharTela").hidden = true;
  atualizarBotaoTela(false);
}

function atualizarMeuNome(nome) {
  if (!nome) return;
  $("inputNome").value = nome;
  salvarNome(nome);
}

function atualizarBotaoTela(ligado) {
  const botao = $("btnCompartilharTela");
  botao.textContent = ligado ? "🖥️ Parar compartilhamento" : "🖥️ Compartilhar tela";
  botao.classList.toggle("ativo", ligado);
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

// Aceita o código ("sala-1a2b3c4d"), o link deste site ou até o link do 8x8
function extrairCodigo(texto) {
  let codigo = texto.trim();
  if (codigo.includes("#")) codigo = codigo.split("#").pop();
  else if (codigo.includes("/")) codigo = codigo.split("?")[0].split("/").filter(Boolean).pop() || "";
  try { codigo = decodeURIComponent(codigo); } catch {}
  codigo = criarSlug(codigo);
  return codigo.startsWith(PREFIXO_SALA) ? codigo.slice(PREFIXO_SALA.length) : codigo;
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

$("btnCompartilharTela").addEventListener("click", () => api?.executeCommand("toggleShareScreen"));
$("btnCopiarLink").addEventListener("click", () => salaAtual && copiarConvite(salaAtual));
$("btnSair").addEventListener("click", () => irPara(""));

$("inputNome").value = lerNomeSalvo();
$("inputNome").addEventListener("change", () => {
  const nome = $("inputNome").value.trim();
  salvarNome(nome);
  if (api && nome) api.executeCommand("displayName", nome);
});

// ---------- INÍCIO ----------
carregarApiJitsi().catch(() => {}); // já vai baixando enquanto a pessoa escolhe o canal
abrirSala(salaDaUrl());
