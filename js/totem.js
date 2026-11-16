(function () {
  "use strict";

  var D = window.DADOS;
  var app = document.getElementById("app");

  // Tempo de cada tela em segundos. Telas de risco = base + porNivel x nível (maior risco fica mais tempo).
  var TEMPO = { resumo: 14, proximas: 20, previsao: 18, kit: 14, ajuda: 12, risco: 8, mapa: 10, porNivel: 3 };
  var RECARREGAR_MIN = 10;
  // ?vitrine: totem embutido no site de divulgação (sem painel, sem som, com dados de exemplo)
  var VITRINE = /[?&]vitrine(=|&|$)/.test(location.search);
  // Navegação manual (setas, botões, toque e teclado). Temporária: ponha false na instalação final do totem.
  var MANUAL = !VITRINE;
  // Voz e sinal sonoro: o Chrome do totem precisa iniciar com --autoplay-policy=no-user-gesture-required.
  var VOZ = !VITRINE;
  var SOM = !VITRINE;

  // Mapa estilo Google Earth: imagem de satélite (Esri World Imagery, sem chave) + ruas e nomes por cima
  var TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  var TILES_RUAS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
  var TILES_NOMES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
  var TILES_ATRIB = "Imagens © Esri, Maxar, Earthstar Geographics · © OpenStreetMap";
  // Mapa: tempo na visão geral antes do zoom automático aproximar
  var ZOOM_AUTO_MS = 3000;
  var ROTA_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/";
  var COR = { 1: "#16a34a", 2: "#facc15", 3: "#fb923c", 4: "#dc2626" };
  // Limites de Manaus para o seletor de localização do painel de teste
  var LIMITES_MANAUS = [[-3.25, -60.25], [-2.85, -59.75]];

  // Para onde ir: hospital, bombeiros, Defesa Civil, ponto de encontro ou o bairro mais seguro
  var DESTINOS = {
    hospital: { rotulo: "Hospital", icone: "cruz" },
    bombeiros: { rotulo: "Bombeiros", icone: "fogo" },
    defesa_civil: { rotulo: "Defesa Civil", icone: "sirene" },
    abrigo: { rotulo: "Ponto de encontro", icone: "seguro" },
    area: { rotulo: "Área segura", icone: "seguro" },
    area_menos_risco: { rotulo: "Área mais tranquila", icone: "seguro" },
    bairro: { rotulo: "Área segura", icone: "seguro" },
    ponto: { rotulo: "Ponto seguro", icone: "seguro" }
  };

  function destino(seg) {
    return DESTINOS[seg && seg.tipo] || DESTINOS.ponto;
  }

  var NIVEIS = {
    1: { nome: "Tranquilo", curto: "Tranquilo", sig: "Sem risco" },
    2: { nome: "Atenção", curto: "Atenção", sig: "Pode acontecer" },
    3: { nome: "Perigo", curto: "Perigo", sig: "Vai acontecer" },
    4: { nome: "Perigo extremo", curto: "Extremo", sig: "Está acontecendo" }
  };

  // Mensagem principal em pictograma: ficar em casa, ficar atento ou sair
  var VEREDITO = {
    1: { icone: "casaok", titulo: "Tudo tranquilo", sub: "Pode ficar em casa" },
    2: { icone: "olho", titulo: "Fique atento", sub: "Pode acontecer. Fique pronto" },
    3: { icone: "correr", titulo: "Saia de casa", sub: "Vai acontecer. Vá ao ponto seguro" },
    4: { icone: "correr", titulo: "Saia agora!", sub: "Está acontecendo! Vá já ao ponto seguro" }
  };

  var RISCOS = {
    deslizamento: { titulo: "Deslizamento", curto: "Morro", icone: "morro", prevenir: ["mochila", "Deixe a mochila pronta"] },
    alagamento: { titulo: "Alagamento", curto: "Cheia", icone: "casa", prevenir: ["documento", "Guarde documentos e coisas no alto"] }
  };
  var ORDEM = ["deslizamento", "alagamento"];

  var ACOES = {
    deslizamento: {
      cuidado: [["rachadura", "Veja rachaduras e árvores inclinadas"], ["mochila", "Deixe a mochila pronta"], ["telefone", "Viu sinais? Ligue 199"]],
      perigo: [["correr", "Saia de casa e vá ao ponto seguro"], ["idoso", "Leve crianças e idosos"], ["rachadura", "Só volte quando a Defesa Civil liberar"]]
    },
    alagamento: {
      cuidado: [["documento", "Guarde documentos no alto"], ["olho", "Olhe a rua e o rio"], ["telefone", "Água subindo? Ligue 199"]],
      perigo: [["correr", "Vá para o ponto seguro"], ["luz", "Desligue a luz"], ["aguax", "Não atravesse água na rua"]]
    }
  };

  var KIT = [["agua", "Água"], ["documento", "Documentos"], ["lanterna", "Lanterna"], ["remedio", "Remédios"], ["comida", "Comida"], ["celular", "Celular carregado"]];

  var DICAS = [
    ["chuva", "Chuva forte: afaste-se de barrancos e encostas"],
    ["aguax", "Não atravesse rua alagada a pé nem de carro"],
    ["idoso", "Ajude vizinhos idosos e crianças a sair"],
    ["mochila", "Deixe documentos e remédios numa mochila"],
    ["rachadura", "Rachadura nova na parede? Avise a Defesa Civil"]
  ];

  var ICONES = {
    n1: '<circle cx="32" cy="32" r="26"/><path d="M20 33l8 8 16-18"/>',
    n2: '<path d="M32 8L59 55H5z"/><path d="M32 26v13"/><path d="M32 47v.5"/>',
    n3: '<path d="M32 4L60 32 32 60 4 32z"/><path d="M32 20v15"/><path d="M32 43v.5"/>',
    n4: '<path d="M21 5h22l16 16v22L43 59H21L5 43V21z"/><path d="M32 18v17"/><path d="M32 44v.5"/>',
    escudo: '<path d="M32 5l22 8v16c0 14-9 24-22 30C19 53 10 43 10 29V13z"/><path d="M22 31l7 7 14-15"/>',
    morro: '<path d="M4 54L28 14l14 22 6-8 12 26z"/><path d="M30 28l6 10M24 36l5 9"/><circle cx="44" cy="50" r="3" fill="currentColor"/><circle cx="53" cy="46" r="2" fill="currentColor"/>',
    casa: '<path d="M10 28L32 10l22 18"/><path d="M16 24v14M48 24v14"/><path d="M4 46q7-6 14 0t14 0 14 0 14 0"/><path d="M4 56q7-6 14 0t14 0 14 0 14 0"/>',
    casaok: '<path d="M8 30L32 8l24 22"/><path d="M14 26v28h36V26"/><path d="M24 40l6 6 11-12"/>',
    correr: '<circle cx="38" cy="9" r="5"/><path d="M36 17L30 36M34 22L24 26 20 34M34 22L44 26 50 20M30 36L41 44 37 57M30 36L21 46 9 50"/>',
    seguro: '<path d="M6 38L26 20l20 18"/><path d="M11 35v21h30V35"/><path d="M22 56V44h8v12"/><path d="M52 6v28"/><path d="M52 8h10l-4 6 4 6H52"/>',
    voce: '<circle cx="32" cy="18" r="9"/><path d="M14 56c0-12 8-20 18-20s18 8 18 20z"/>',
    rachadura: '<rect x="8" y="8" width="48" height="48" rx="4"/><path d="M34 8l-6 14 10 8-8 12 4 14"/>',
    luz: '<path d="M36 4L14 36h16l-4 24 24-34H34z"/><path d="M6 6l52 52"/>',
    aguax: '<path d="M4 40q7-6 14 0t14 0 14 0 14 0"/><path d="M4 52q7-6 14 0t14 0 14 0 14 0"/><path d="M20 6l22 22M42 6L20 28"/>',
    cruz: '<path d="M24 6h16v18h18v16H40v18H24V40H6V24h18z"/>',
    coracao: '<path d="M32 56S6 40 6 22a13 13 0 0 1 26-4 13 13 0 0 1 26 4c0 18-26 34-26 34z"/>',
    idoso: '<circle cx="24" cy="10" r="6"/><path d="M24 18v22M24 24l14 6M24 40l-8 18M24 40l8 18M40 30v28"/>',
    chuva: '<path d="M18 36a10 10 0 0 1 1-20 14 14 0 0 1 27 3 9 9 0 0 1 0 17z"/><path d="M22 44l-4 10M34 44l-4 10M46 44l-4 10"/>',
    sol: '<circle cx="32" cy="32" r="12"/><path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/>',
    nuvem: '<path d="M16 48a11 11 0 0 1 1-22 15 15 0 0 1 29 3 9.5 9.5 0 0 1 0 19z"/>',
    tempestade: '<path d="M18 36a10 10 0 0 1 1-20 14 14 0 0 1 27 3 9 9 0 0 1 0 17z"/><path d="M34 34l-8 12h10l-6 14"/>',
    gota: '<path d="M32 6C22 22 16 30 16 40a16 16 0 0 0 32 0C48 30 42 22 32 6z"/><path d="M24 40a8 8 0 0 0 8 8"/>',
    regua: '<rect x="20" y="6" width="24" height="52" rx="3"/><path d="M20 16h10M20 26h6M20 36h10M20 46h6"/>',
    telefone: '<path d="M14 8h10l4 14-6 4q4 10 14 16l4-6 14 4v10a6 6 0 0 1-6 6C28 56 8 36 8 14a6 6 0 0 1 6-6z"/>',
    sirene: '<path d="M18 50V34a14 14 0 0 1 28 0v16"/><path d="M12 50h40v8H12z"/><path d="M32 4v6M10 14l5 5M54 14l-5 5"/><path d="M28 36a4 4 0 0 1 4-4"/>',
    fogo: '<path d="M32 6c3 11 17 16 17 32a17 17 0 0 1-34 0c0-9 5-14 9-18 0 6 3 10 7 10-3-8-2-16 1-24z"/>',
    calendario: '<rect x="8" y="12" width="48" height="44" rx="6"/><path d="M8 26h48M20 6v12M44 6v12M20 38h6M30 38h6M40 38h6M20 47h6M30 47h6"/>',
    olho: '<path d="M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z"/><circle cx="32" cy="32" r="8"/>',
    mochila: '<path d="M16 26a16 16 0 0 1 32 0v32H16z"/><path d="M26 10V8a6 6 0 0 1 12 0v2"/><path d="M22 38h20v10H22z"/>',
    documento: '<path d="M16 6h22l12 12v40H16z"/><path d="M38 6v12h12M22 30h20M22 38h20M22 46h14"/>',
    agua: '<path d="M26 6h12v8l4 6v36a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V20l4-6z"/><path d="M22 30h20M22 44h20"/>',
    lanterna: '<path d="M22 24h20l-4 10v22H26V34z"/><path d="M22 24l-6-14h32l-6 14"/><path d="M32 42v6"/>',
    remedio: '<rect x="8" y="18" width="48" height="38" rx="6"/><path d="M24 18v-6h16v6M32 28v18M23 37h18"/>',
    comida: '<ellipse cx="32" cy="14" rx="18" ry="6"/><path d="M14 14v36c0 3 8 6 18 6s18-3 18-6V14"/><path d="M14 30c0 3 8 6 18 6s18-3 18-6"/>',
    celular: '<rect x="18" y="4" width="28" height="56" rx="6"/><path d="M28 52h8"/><path d="M34 16l-6 12h8l-6 12"/>',
    familia: '<circle cx="20" cy="18" r="7"/><circle cx="44" cy="18" r="7"/><path d="M6 52v-8a10 10 0 0 1 10-10h8a10 10 0 0 1 10 10M30 44a10 10 0 0 1 10-10h8a10 10 0 0 1 10 10v8"/>',
    seta: '<path d="M8 32h44M38 18l14 14-14 14"/>',
    pausa: '<path d="M20 10v44M44 10v44"/>',
    play: '<path d="M18 10l36 22-36 22z"/>',
    relogio: '<circle cx="32" cy="32" r="26"/><path d="M32 16v16l11 7"/>'
  };

  function ic(nome) {
    return '<svg class="ic" viewBox="0 0 64 64" aria-hidden="true">' + (ICONES[nome] || "") + "</svg>";
  }

  function atraso(k) {
    return ' style="--d:' + k + '"';
  }

  function nivel(id) {
    return D[id].nivel;
  }

  function maxNivel() {
    return Math.max(nivel("deslizamento"), nivel("alagamento"));
  }

  function porRisco() {
    return ORDEM.slice().sort(function (a, b) { return nivel(b) - nivel(a); });
  }

  // pseudoaleatório fixo: os desenhos não mudam a cada tela
  function rnd(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function diaSemana(k) {
    var d = new Date();
    d.setDate(d.getDate() + k);
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  }

  function nomeDia(k) {
    return k === 0 ? "Hoje" : k === 1 ? "Amanhã" : diaSemana(k);
  }

  function quando(k) {
    return k === 1 ? "Amanhã" : "Em " + k + " dias";
  }

  function acoes(id, n) {
    return ACOES[id][n >= 3 ? "perigo" : "cuidado"];
  }

  function alertasPreventivos() {
    var lista = [];
    ORDEM.forEach(function (id) {
      var hoje = nivel(id);
      var pico = -1;
      D.previsao.forEach(function (dia, k) {
        if (k > 0 && dia[id] >= 3 && dia[id] > hoje && (pico < 0 || dia[id] > D.previsao[pico][id])) pico = k;
      });
      if (pico > 0) lista.push({ id: id, dia: pico, nivel: D.previsao[pico][id], chuva: D.previsao[pico].chuva });
    });
    return lista.sort(function (a, b) { return b.nivel - a.nivel || a.dia - b.dia; });
  }

  var ESTADOS = {
    agora: { nome: "Acontecendo agora", icone: "sirene" },
    perto: { nome: "Muito perto de acontecer", icone: "relogio" },
    vai: { nome: "Vai acontecer", icone: "relogio" },
    pode: { nome: "Pode acontecer", icone: "olho" }
  };

  function textoHoras(h) {
    return h === 0 ? "Agora" : h >= 24 ? "Amanhã" : h === 1 ? "Em 1 hora" : "Em " + h + " horas";
  }

  function estadoEvento(horas, prob, nv) {
    if (horas === 0) return nv >= 4 ? "agora" : nv === 3 ? "perto" : "pode";
    if (nv <= 2 || prob < 70) return "pode";
    return horas <= 1 ? "perto" : "vai";
  }

  // Eventos de risco (nível 2 a 4): o que acontece agora, o que piora nas próximas horas e o que pode acontecer amanhã
  function eventos() {
    var lista = [];
    ORDEM.forEach(function (id) {
      var maior = 0;
      D.horizonte.forEach(function (h) {
        var x = h[id];
        if (x.nivel < 2) return;
        if (x.nivel <= maior && h.horas < 24) return;
        maior = Math.max(maior, x.nivel);
        lista.push({ id: id, nivel: x.nivel, prob: x.prob, horas: h.horas, estado: estadoEvento(h.horas, x.prob, x.nivel) });
      });
    });
    return lista.sort(function (a, b) { return a.horas - b.horas || b.nivel - a.nivel; });
  }

  // Maior nível entre o que está acontecendo ou está muito perto de acontecer
  function nivelImediato() {
    var m = 0;
    eventos().forEach(function (e) {
      if (e.estado === "agora" || e.estado === "perto") m = Math.max(m, e.nivel);
    });
    return m;
  }

  function num(v, dec, unidade) {
    return '<span class="conta" data-alvo="' + v + '" data-dec="' + (dec || 0) + '">0</span>' + (unidade || "");
  }

  /* ================= Ilustrações ================= */

  function abre() {
    return '<svg class="cena" viewBox="0 -150 1000 750" preserveAspectRatio="xMidYMax slice" aria-hidden="true">';
  }

  function grad(id, a, b) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
  }

  function nuvens(c1, c2) {
    return '<g transform="translate(0 -110)"><g class="nuvem" fill="' + c1 + '"><ellipse cx="160" cy="70" rx="190" ry="55"/><ellipse cx="440" cy="45" rx="170" ry="50"/><ellipse cx="820" cy="60" rx="220" ry="60"/></g>' +
      '<g class="nuvem b" fill="' + c2 + '"><ellipse cx="300" cy="105" rx="150" ry="40"/><ellipse cx="660" cy="100" rx="180" ry="45"/><ellipse cx="980" cy="110" rx="130" ry="38"/></g></g>';
  }

  function chuva(cols) {
    var sp = 1000 / cols;
    var s = '<g class="chuva" stroke="#d6e6ff" stroke-width="3" stroke-linecap="round" opacity=".6">';
    for (var r = -2; r < 7; r++) {
      for (var c = 0; c <= cols + 8; c++) {
        var x = c * sp - r * 30 + rnd(c) * sp * 0.6;
        var y = r * 100 + rnd(c + 50) * 60;
        s += '<path d="M' + x.toFixed(1) + " " + y.toFixed(1) + 'l-9 30"/>';
      }
    }
    return s + "</g>";
  }

  function onda(y, amp, cls, fill, op) {
    var d = "M-400 " + y;
    for (var x = -400; x < 1400; x += 200) d += " q50 " + -amp + " 100 0 t100 0";
    return '<path class="' + cls + '" d="' + d + ' V600 H-400z" fill="' + fill + '" opacity="' + op + '"/>';
  }

  function casaDesenho(x, y, s, r, cor) {
    return '<g transform="translate(' + x + " " + y + ") rotate(" + r + ") scale(" + s + ')">' +
      '<rect x="-55" y="-70" width="110" height="70" rx="4" fill="' + cor + '"/>' +
      '<path d="M-68 -66L0 -118 68 -66z" fill="#b5472f"/>' +
      '<rect x="-13" y="-42" width="26" height="42" rx="3" fill="#6b4a2c"/>' +
      '<rect x="26" y="-56" width="22" height="22" rx="3" fill="#fff6cf"/><rect x="-48" y="-56" width="22" height="22" rx="3" fill="#fff6cf"/></g>';
  }

  var CORES_CASA = ["#f6c453", "#ef8f6b", "#7bc4a4", "#8fb8ff", "#f4a6c0"];

  function cenaDeslizamento(n) {
    var escuro = n >= 3;
    var ceu = escuro ? "dsCeuE" : "dsCeuC";
    var s = abre() + "<defs>" + (escuro ? grad("dsCeuE", "#33466a", "#7c97bb") : grad("dsCeuC", "#8fcdf7", "#e9f6ff")) +
      grad("dsMorro", "#78b955", "#3d7a2e") + grad("dsLama", "#c28850", "#6b3d19") + "</defs>";
    s += '<rect y="-150" width="1000" height="750" fill="url(#' + ceu + ')"/>';
    if (n === 4) {
      s += '<rect class="flash" y="-150" width="1000" height="750" fill="#e6efff"/>' +
        '<path class="raio" d="M780 40L745 150 790 150 735 280" fill="none" stroke="#fff7b0" stroke-width="8" stroke-linejoin="round"/>';
    }
    if (!escuro) s += '<circle class="brilho" cx="860" cy="100" r="80" fill="#fff3b0" opacity=".5"/><circle cx="860" cy="100" r="48" fill="#ffe27a"/>';
    s += nuvens(escuro ? "#46587a" : "#ffffff", escuro ? "#5a6c8d" : "#f1f8ff");
    s += '<path d="M0 340Q200 240 420 280T820 260 1000 300V600H0z" fill="#a8d28f"/>';
    s += '<path d="M0 600V340Q200 230 420 195Q600 170 760 250Q900 320 1000 330V600z" fill="url(#dsMorro)"/>';
    if (n >= 3) {
      s += '<path d="M430 212Q520 210 565 262Q625 360 720 600H430Q445 420 410 300z" fill="url(#dsLama)" opacity="' + (n === 4 ? 1 : 0.8) + '"/>' +
        '<g stroke="#4a2810" stroke-width="6" fill="none" stroke-linecap="round" opacity=".6"><path class="escorre" d="M470 250Q500 350 560 450T640 600"/><path class="escorre" style="animation-delay:-.8s" d="M520 240Q550 340 610 450T700 600"/></g>';
    }
    if (n >= 2) {
      s += '<g stroke="#2c1a0a" stroke-width="5" fill="none" stroke-linecap="round"><path d="M300 260l20 14-12 14 22 14-8 14"/><path d="M700 300l-14 18 18 10-10 20"/></g>';
    }
    var casas = [[110, 372, 1], [250, 318, 0.95], [880, 366, 1], [740, 318, 0.95], [150, 500, 1.1], [330, 500, 1.1], [820, 510, 1.1]];
    casas.forEach(function (c, i) { s += casaDesenho(c[0], c[1], c[2], 0, CORES_CASA[i % 5]); });
    s += casaDesenho(540, 505, 1.1, n === 4 ? 14 : n === 3 ? 5 : 0, "#ef8f6b");
    s += '<g transform="translate(60 590)"><g class="placa"><rect x="-5" y="-110" width="10" height="110" fill="#cbd5e1"/>' +
      '<path d="M0 -175L54 -90H-54z" fill="#facc15" stroke="#111" stroke-width="6" stroke-linejoin="round"/>' +
      '<path d="M0 -146v28" stroke="#111" stroke-width="9" stroke-linecap="round"/><circle cy="-102" r="5" fill="#111"/></g></g>';
    if (n >= 3) {
      for (var i = 0; i < (n === 4 ? 4 : 2); i++) {
        s += '<g transform="translate(' + (450 + i * 28) + " " + (225 + i * 12) + ')"><g class="pedra" style="animation-delay:' + (-i * 0.8) +
          's"><path d="M-16-4L-6-16 12-14 18 2 6 16-12 12z" fill="#6b6b6b" stroke="#333" stroke-width="3"/></g></g>';
      }
    }
    if (n >= 2) s += chuva(n === 2 ? 6 : n === 3 ? 14 : 22);
    return s + "</svg>";
  }

  function predio(x, base, w, h, cor, cols, linhas) {
    var s = '<rect x="' + x + '" y="' + (base - h) + '" width="' + w + '" height="' + h + '" rx="6" fill="' + cor + '"/>';
    var jw = 26;
    var gx = (w - cols * jw) / (cols + 1);
    for (var r = 0; r < linhas; r++) {
      for (var c = 0; c < cols; c++) {
        s += '<rect x="' + (x + gx + c * (jw + gx)).toFixed(0) + '" y="' + (base - h + 24 + r * 56) + '" width="' + jw + '" height="34" rx="4" fill="#fff6cf" opacity=".95"/>';
      }
    }
    return s + '<rect x="' + (x + w / 2 - 18) + '" y="' + (base - 56) + '" width="36" height="56" rx="4" fill="#5a3d25"/>';
  }

  function cenaAlagamento(n) {
    var escuro = n >= 3;
    var chao = 350;
    var base = 414;
    var h = [0, 0, 22, 60, 130][n];
    var y = base - h;
    var ceu = escuro ? "alCeuE" : "alCeuC";
    var s = abre() + "<defs>" + (escuro ? grad("alCeuE", "#4a5f7d", "#9db3ca") : grad("alCeuC", "#8fcdf7", "#e9f6ff")) +
      grad("alAgua", "#52a6ee", "#1558a8") + grad("alAgua2", "#3b8fe0", "#0f4d94") + "</defs>";
    s += '<rect y="-150" width="1000" height="750" fill="url(#' + ceu + ')"/>';
    if (!escuro) s += '<circle class="brilho" cx="130" cy="95" r="80" fill="#fff3b0" opacity=".5"/><circle cx="130" cy="95" r="46" fill="#ffe27a"/>';
    s += nuvens(escuro ? "#5d718d" : "#ffffff", escuro ? "#71849f" : "#f1f8ff");
    s += predio(20, chao, 150, 300, "#f4c27a", 3, 4) + predio(185, chao, 130, 380, "#8fb8ff", 2, 5) +
      predio(330, chao, 170, 260, "#f2a0a0", 3, 3) + predio(515, chao, 140, 340, "#a8d8b9", 2, 4) + predio(670, chao, 120, 290, "#f6d36b", 3, 4);
    s += '<rect y="' + chao + '" width="1000" height="100" fill="#6b7280"/><rect y="' + chao + '" width="1000" height="14" fill="#cbd5e1"/>' +
      '<path d="M0 490H1000" stroke="#f8fafc" stroke-width="6" stroke-dasharray="40 30"/>';
    s += '<g transform="translate(640 ' + (chao + 62) + ')"><g' + (n >= 3 ? ' class="boia"' : "") + '>' +
      '<path d="M-90 0v-36q0-12 12-14l38-6 22-28h62l26 28q26 4 26 20v36z" fill="#ef4444"/>' +
      '<path d="M-26 -52l16-24h54l20 24z" fill="#dbeafe"/><circle cx="-52" cy="2" r="22" fill="#1f2937"/><circle cx="68" cy="2" r="22" fill="#1f2937"/></g></g>';
    if (n === 2) s += '<g fill="#7cc0f0" opacity=".85"><ellipse cx="220" cy="470" rx="80" ry="9"/><ellipse cx="470" cy="520" rx="60" ry="7"/><ellipse cx="800" cy="480" rx="90" ry="9"/></g>';
    if (n >= 3) s += onda(y, 10, "onda2", "url(#alAgua2)", 0.85) + onda(y + 8, 12, "onda1", "url(#alAgua)", 0.88);
    var faixas = [["#22c55e", 0, 10], ["#facc15", 10, 30], ["#fb923c", 40, 60], ["#ef4444", 100, 80]];
    s += '<g transform="translate(815 0)"><rect x="-8" y="' + (base - 192) + '" width="76" height="' + (192 + 40) + '" rx="12" fill="#0c1a33"/>';
    faixas.forEach(function (f) {
      s += '<rect x="0" y="' + (base - f[1] - f[2]) + '" width="60" height="' + f[2] + '" fill="' + f[0] + '"/>';
    });
    s += '<g stroke="#fff" stroke-width="4" opacity=".7"><path d="M0 ' + (base - 10) + 'h60M0 ' + (base - 40) + 'h60M0 ' + (base - 100) + 'h60"/></g>';
    s += '<g class="marca-agua"><path d="M-14 ' + y + 'l-32 -18v36z" fill="#0c1a33" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></g></g>';
    if (n >= 2) s += chuva(n === 2 ? 6 : n === 3 ? 14 : 22);
    return s + "</svg>";
  }

  var CENAS = { deslizamento: cenaDeslizamento, alagamento: cenaAlagamento };

  /* ================= Mapa real (Leaflet + OpenStreetMap) ================= */

  var rotasCache = {};

  function pinBairro(b, n, k) {
    return L.divIcon({
      className: "pin-wrap", iconSize: [0, 0],
      html: '<div class="pin n' + n + (b.atual ? " atual" : "") + '"' + atraso(k) + '><span class="pin-halo"></span><span class="pin-c">' + ic("n" + n) + '</span><b class="pin-t">' +
        (b.atual ? "Seu bairro · " : "") + b.nome + "</b></div>"
    });
  }

  function pinVoce() {
    return L.divIcon({
      className: "pin-wrap", iconSize: [0, 0],
      html: '<div class="pin-voce"><span class="anel"></span><span class="anel b"></span><span class="pv-c">' + ic("voce") + '</span><b class="pin-t pv-t">Você está aqui</b></div>'
    });
  }

  function pinSeguro(seg) {
    var t = destino(seg);
    return L.divIcon({
      className: "pin-wrap", iconSize: [0, 0],
      html: '<div class="pin-seguro"><span class="ps-c">' + ic(t.icone) + '</span><b class="pin-t ps-t">' + t.rotulo + "</b></div>"
    });
  }

  function camadaSatelite(mapa) {
    L.tileLayer(TILES, { maxZoom: 19, attribution: TILES_ATRIB }).addTo(mapa);
    L.tileLayer(TILES_RUAS, { maxZoom: 19, opacity: 0.75 }).addTo(mapa);
    L.tileLayer(TILES_NOMES, { maxZoom: 19 }).addTo(mapa);
  }

  function distancia(a, b) {
    return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1]));
  }

  function desenharRota(mapa, coords, extra) {
    var fundo = L.polyline(coords, { color: "#fff", weight: 22, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(mapa);
    var linha = L.polyline(coords, { color: "#16a34a", weight: 11, opacity: 1, lineCap: "round", lineJoin: "round", dashArray: "2 20", className: "rota-real" }).addTo(mapa);
    var acum = [0];
    for (var i = 1; i < coords.length; i++) acum.push(acum[i - 1] + distancia(coords[i - 1], coords[i]));
    var total = acum[acum.length - 1] || 1;
    var ponto = L.circleMarker(coords[0], { radius: 14, color: "#16a34a", weight: 7, fillColor: "#fff", fillOpacity: 1 }).addTo(mapa);
    var t0 = Date.now();
    var timer = setInterval(function () {
      var alvo = (((Date.now() - t0) % 4500) / 4500) * total;
      var j = 1;
      while (j < acum.length - 1 && acum[j] < alvo) j++;
      var f = (alvo - acum[j - 1]) / ((acum[j] - acum[j - 1]) || 1);
      ponto.setLatLng([coords[j - 1][0] + (coords[j][0] - coords[j - 1][0]) * f, coords[j - 1][1] + (coords[j][1] - coords[j - 1][1]) * f]);
    }, 40);
    extra.push(function () { clearInterval(timer); });
    return [fundo, linha, ponto];
  }

  // Destino só aparece quando há o que fazer: em "tranquilo" ninguém precisa sair de casa
  function temDestino(id) {
    return nivel(id) >= 2 && !!D[id].pontoSeguro;
  }

  function iniciarMapa(el, id) {
    if (!window.L) return;
    var d = D[id];
    var cont = el.querySelector(".mapa-leaflet");
    var limpar = [];
    // Totem sem toque: o mapa não responde a dedo nem mouse, o zoom é automático
    var mapa = L.map(cont, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, fadeAnimation: true
    });
    camadaSatelite(mapa);
    L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(mapa);

    var voce = [D.voce.lat, D.voce.lng];
    var seg = temDestino(id) ? d.pontoSeguro : null;
    var alvo = seg ? [seg.lat, seg.lng] : null;
    // Polígonos precisam de uma vista definida antes de entrar no mapa
    mapa.setView(voce, 14, { animate: false });
    var geral = L.latLngBounds(alvo ? [voce, alvo] : [voce]);
    var perto = L.latLngBounds(alvo ? [voce, alvo] : [voce]);
    D.bairros.forEach(function (b, k) {
      var n = b[id];
      var area;
      if (b.geometria) {
        area = L.geoJSON(b.geometria, {
          interactive: false,
          style: b.atual
            ? { color: "#fff", weight: 7, dashArray: "18 12", opacity: 1, fillColor: COR[n], fillOpacity: 0.32 }
            : { color: COR[n], weight: n >= 3 ? 5 : 3, opacity: 0.95, fillColor: COR[n], fillOpacity: n >= 3 ? 0.4 : 0.24 }
        }).addTo(mapa);
        if (b.atual) area.bringToFront();
      } else {
        area = L.circle([b.lat, b.lng], { radius: 200 + n * 90, color: COR[n], weight: n >= 3 ? 4 : 0, opacity: 0.7, fillColor: COR[n], fillOpacity: n >= 3 ? 0.34 : 0.22, interactive: false }).addTo(mapa);
      }
      // Visão geral: bairro do totem inteiro + centro dos vizinhos (vizinhos grandes não afastam demais)
      geral.extend(b.atual ? area.getBounds() : L.latLng(b.lat, b.lng));
      // De perto: o caminho até o destino; sem destino, o próprio bairro
      if (b.atual && !alvo) perto.extend(area.getBounds());
      L.marker([b.lat, b.lng], { icon: pinBairro(b, n, k), interactive: false, zIndexOffset: n * 100 + (b.atual ? 500 : 0) }).addTo(mapa);
    });
    L.marker(voce, { icon: pinVoce(), interactive: false, zIndexOffset: 2000 }).addTo(mapa);

    if (seg) {
      L.marker(alvo, { icon: pinSeguro(seg), interactive: false, zIndexOffset: 1000 }).addTo(mapa);
      tracarRota(el, mapa, voce, alvo, limpar);
    }

    // Zoom automático: começa afastado (bairro, vizinhos e destino) e depois aproxima
    var folga = L.point(150, 200);
    mapa.fitBounds(geral, { padding: folga, animate: false });
    var aproximar = setTimeout(function () {
      mapa.invalidateSize();
      if (alvo) mapa.flyToBounds(perto.pad(0.25), { padding: folga, duration: 2.5, maxZoom: 17 });
      else mapa.flyTo(voce, Math.max(16, mapa.getBoundsZoom(perto, false, folga)), { duration: 2.5 });
    }, ZOOM_AUTO_MS);

    el._fim = function () {
      clearTimeout(aproximar);
      limpar.forEach(function (f) { f(); });
      mapa.stop();
      mapa.remove();
    };
  }

  function tracarRota(el, mapa, voce, alvo, limpar) {
    var direta = [voce, alvo];
    var chave = direta.join(";");
    var camadas = [];
    function aplicar(coords) {
      camadas.forEach(function (c) { mapa.removeLayer(c); });
      limpar.forEach(function (f) { f(); });
      limpar.length = 0;
      camadas = desenharRota(mapa, coords, limpar);
    }
    function minutos(min) {
      var alvoMin = el.querySelector(".min-val");
      if (alvoMin) alvoMin.textContent = min;
    }
    if (rotasCache[chave]) {
      aplicar(rotasCache[chave].coords);
      minutos(rotasCache[chave].min);
      return;
    }
    aplicar(direta);
    var ctrl = window.AbortController ? new AbortController() : null;
    var abortar = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
    fetch(ROTA_URL + voce[1] + "," + voce[0] + ";" + alvo[1] + "," + alvo[0] + "?overview=full&geometries=geojson", ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(abortar);
        var r = j.routes && j.routes[0];
        if (!r) return;
        var coords = r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
        rotasCache[chave] = { coords: coords, min: Math.max(1, Math.round(r.duration / 60)) };
        if (!el.isConnected) return;
        aplicar(coords);
        minutos(rotasCache[chave].min);
      })
      .catch(function () { /* sem internet: mantém a linha direta */ });
  }

  /* ================= Blocos ================= */

  function semaforo(n, cls) {
    var s = '<div class="semaforo ' + (cls || "v") + '" role="img" aria-label="' + NIVEIS[n].nome + '">';
    for (var k = 4; k >= 1; k--) s += '<span class="luz n' + k + (k === n ? " on" : "") + '">' + ic("n" + k) + "</span>";
    return s + "</div>";
  }

  function chip(n) {
    return '<span class="chip n' + n + '">' + ic("n" + n) + NIVEIS[n].nome + "</span>";
  }

  function cabecalho(icone, titulo, sub, direita) {
    return '<div class="cab in"' + atraso(0) + '>' + (icone ? '<span class="cab-ic">' + ic(icone) + "</span>" : "") + "<div><h1>" + titulo + "</h1><p>" + sub + "</p></div>" + (direita || "") + "</div>";
  }

  function veredito(n, cls) {
    var v = VEREDITO[n];
    return '<div class="veredito n' + n + " " + (cls || "") + '"><span class="ver-ic' + (n >= 3 ? " corre" : n === 2 ? " olha" : "") + '">' + ic(v.icone) + "</span>" +
      "<div><b>" + v.titulo + "</b><small>" + v.sub + "</small></div></div>";
  }

  function passos(id, n) {
    return '<div class="passos n' + n + '">' + acoes(id, n).map(function (a, k) {
      return '<div class="passo in"' + atraso(k + 5) + '><span class="passo-num">' + (k + 1) + '</span><span class="passo-ic">' + ic(a[0]) + "</span><p>" + a[1] + "</p></div>";
    }).join("") + "</div>";
  }

  function onde(id) {
    var top = D.bairros.slice().sort(function (a, b) { return b[id] - a[id]; }).slice(0, 3);
    return '<div class="onde in"' + atraso(4) + '><span class="onde-t">' + ic("seguro") + "Bairros</span>" + top.map(function (b) {
      return '<span class="onde-b n' + b[id] + '"><span class="onde-ic">' + ic("n" + b[id]) + "</span><b>" + b.nome + "</b></span>";
    }).join("") + "</div>";
  }

  function legenda() {
    var s = '<div class="legenda in"' + atraso(7) + ">";
    for (var k = 1; k <= 4; k++) {
      s += '<span class="leg n' + k + '">' + ic("n" + k) + '<span class="leg-t"><b>' + NIVEIS[k].curto + "</b><small>" + NIVEIS[k].sig + "</small></span></span>";
    }
    return s + "</div>";
  }

  /* ================= Telas ================= */

  function slideResumo() {
    var s = cabecalho(null, "Hoje na cidade", D.cidade + " · " + nomeDia(0));
    porRisco().forEach(function (id, k) {
      var n = nivel(id);
      s += '<div class="cartao-risco n' + n + ' in"' + atraso(k + 1) + '><div class="cr-cena">' + CENAS[id](n) + '<span class="cr-nome">' + ic(RISCOS[id].icone) + RISCOS[id].titulo + "</span>" +
        (n >= 3 ? '<span class="cr-alerta">' + ic("sirene") + "Alerta</span>" : "") + "</div>" +
        '<div class="cr-corpo"><div class="cr-nivel">' + semaforo(n, "h") + chip(n) + '<span class="cr-sig">' + NIVEIS[n].sig + "</span></div>" + veredito(n, "mini") + "</div></div>";
    });
    var a = eventos()[0];
    if (a) {
      s += '<div class="resumo-alerta n' + a.nivel + ' in"' + atraso(4) + ">" + ic(a.estado === "agora" ? "sirene" : "relogio") +
        "<div><small>" + ESTADOS[a.estado].nome + "</small><b>" + RISCOS[a.id].titulo + " · " + (a.horas === 0 ? "agora" : textoHoras(a.horas).toLowerCase() + " (" + a.prob + "%)") + "</b></div>" + ic(RISCOS[a.id].icone) + "</div>";
    } else {
      s += '<div class="resumo-alerta n1 in"' + atraso(4) + ">" + ic("n1") + "<div><small>Previsão</small><b>Sem risco nas próximas horas e amanhã</b></div></div>";
    }
    return s;
  }

  function slideRisco(id) {
    var d = D[id];
    var n = d.nivel;
    var ind = d.indicadores.map(function (t) {
      return '<div class="vidro">' + ic(t.icone) + "<div><b>" + num(t.valor, t.dec, t.unidade) + "</b><span>" + t.rotulo + "</span></div></div>";
    }).join("");
    return '<div class="heroi in"' + atraso(0) + ">" + CENAS[id](n) + (n >= 3 ? '<div class="hero-perigo n' + n + '"></div>' : "") + '<div class="hero-sem">' + semaforo(n, "v") + "</div>" +
      '<div class="indicadores">' + ind + "</div>" +
      '<div class="badge n' + n + '"><span class="badge-ic">' + ic(RISCOS[id].icone) + "</span><div><small>" + RISCOS[id].titulo + "</small><b>" + NIVEIS[n].nome + "</b><em>" + NIVEIS[n].sig + "</em></div></div></div>" +
      '<div class="in"' + atraso(3) + ">" + veredito(n) + "</div>" + onde(id) + passos(id, n);
  }

  function slideMapa(id) {
    var d = D[id];
    var n = d.nivel;
    var seg = d.pontoSeguro;
    var bairro = D.voce.bairro ? "Seu bairro: " + D.voce.bairro : "Seu bairro";
    var s = cabecalho(RISCOS[id].icone, "Mapa · " + RISCOS[id].titulo, bairro + (n >= 2 ? " · caminho seguro" : " e vizinhos"), semaforo(n, "h"));
    s += '<div class="mapa-card in"' + atraso(1) + '><div class="mapa-leaflet"></div></div>' + legenda();
    s += '<div class="rota-cards in"' + atraso(8) + '><div class="rc voce"><span class="rc-ic">' + ic("voce") + "</span><div><small>Você está aqui</small><b>" + D.voce.nome + "</b></div></div>";
    if (temDestino(id)) {
      var t = destino(seg);
      s += '<span class="rc-seta">' + ic("seta") + ic("seta") + ic("seta") + "</span>" +
        '<div class="rc seguro n' + n + '"><span class="rc-ic">' + ic(t.icone) + "</span><div><small>" + (n >= 3 ? "Vá agora para" : "Se precisar sair") + " · " + t.rotulo +
        "</small><b>" + seg.nome + '</b></div><span class="min">' + ic("correr") + '<span class="min-val">' + seg.minutos + "</span> min</span></div>";
    } else if (n >= 2) {
      s += '<div class="rc seguro n' + n + '"><span class="rc-ic">' + ic("telefone") + "</span><div><small>Para onde ir</small><b>Ligue 199 · Defesa Civil</b></div></div>";
    } else {
      s += '<div class="rc tranquilo"><span class="rc-ic">' + ic("casaok") + "</span><div><small>Tudo tranquilo</small><b>Não precisa sair de casa</b></div></div>";
    }
    return s + "</div>";
  }

  function slideProximas() {
    var s = cabecalho("relogio", "Próximas horas", "O que acontece agora e o que está chegando");
    s += '<div class="tabela compacta in"' + atraso(1) + '><div class="tab-linha"><span></span>' + D.horizonte.map(function (h, k) {
      return '<span class="tab-dia' + (k === 0 ? " hoje" : "") + '">' + h.rotulo + "</span>";
    }).join("") + '</div><div class="tab-linha chuva-linha"><span class="tab-risco">' + ic("chuva") + "Chuva</span>";
    D.horizonte.forEach(function (h) {
      s += '<div class="chuva-cel"><span class="clima">' + ic(clima(h.chuva)) + '</span><div class="barra"><i style="--h:' + Math.min(100, (h.chuva / 80) * 100).toFixed(0) +
        '%"></i></div><b>' + h.chuva + (h.horas >= 24 ? " mm" : " mm/h") + "</b></div>";
    });
    s += "</div>";
    ORDEM.forEach(function (id) {
      s += '<div class="tab-linha"><span class="tab-risco">' + ic(RISCOS[id].icone) + RISCOS[id].curto + "</span>" + D.horizonte.map(function (h) {
        var x = h[id];
        return '<span class="tab-cel hc n' + x.nivel + (x.prob < 70 && h.horas > 0 ? " possivel" : "") + '">' + ic("n" + x.nivel) + '<b class="prob">' + (h.horas === 0 ? "agora" : x.prob + "%") + "</b></span>";
      }).join("") + "</div>";
    });
    s += '<div class="legenda-prob"><span class="lp certo"></span>Vai acontecer<span class="lp possivel"></span>Pode acontecer</div></div>';
    var ev = eventos().slice(0, 6);
    s += '<div class="eventos' + (ev.length > 4 ? " denso" : "") + '">';
    ev.forEach(function (e, k) {
      var est = ESTADOS[e.estado];
      var f = e.estado === "agora" || e.estado === "perto" ? acoes(e.id, e.nivel)[0] : RISCOS[e.id].prevenir;
      s += '<div class="evento n' + e.nivel + " " + e.estado + ' in"' + atraso(k + 3) + '><div class="ev-quando">' + ic("relogio") + "<b>" + textoHoras(e.horas) + "</b></div>" +
        '<div class="ev-corpo"><div class="ev-topo">' + ic(RISCOS[e.id].icone) + "<b>" + RISCOS[e.id].titulo + "</b>" + chip(e.nivel) + "</div>" +
        '<div class="ev-linha"><span class="estado ' + e.estado + '">' + ic(est.icone) + est.nome + (e.horas > 0 ? " · " + e.prob + "%" : "") + "</span>" +
        '<div class="ev-fazer">' + ic(f[0]) + "<p>" + f[1] + "</p></div></div></div></div>";
    });
    if (!ev.length) {
      s += '<div class="evento n1 in"' + atraso(3) + '><div class="ev-quando">' + ic("n1") + '<b>Tudo bem</b></div><div class="ev-corpo"><div class="ev-topo"><b>Sem perigo previsto nas próximas horas</b></div></div></div>';
    }
    return s + "</div>";
  }

  function clima(mm) {
    return mm < 5 ? "sol" : mm < 25 ? "nuvem" : mm < 55 ? "chuva" : "tempestade";
  }

  function slidePrevisao() {
    var s = cabecalho("calendario", "Próximos dias", "Prepare-se antes do perigo chegar");
    s += '<div class="tabela in"' + atraso(1) + '><div class="tab-linha"><span></span>';
    D.previsao.forEach(function (_, k) { s += '<span class="tab-dia' + (k === 0 ? " hoje" : "") + '">' + nomeDia(k) + "</span>"; });
    s += '</div><div class="tab-linha chuva-linha"><span class="tab-risco">' + ic("chuva") + "Chuva</span>";
    D.previsao.forEach(function (dia) {
      s += '<div class="chuva-cel"><span class="clima">' + ic(clima(dia.chuva)) + '</span><div class="barra"><i style="--h:' + Math.min(100, (dia.chuva / 80) * 100).toFixed(0) +
        '%"></i></div><b>' + dia.chuva + " mm</b></div>";
    });
    s += "</div>";
    ORDEM.forEach(function (id) {
      s += '<div class="tab-linha"><span class="tab-risco">' + ic(RISCOS[id].icone) + RISCOS[id].curto + "</span>" +
        D.previsao.map(function (dia) { return '<span class="tab-cel n' + dia[id] + '">' + ic("n" + dia[id]) + "</span>"; }).join("") + "</div>";
    });
    s += "</div>" + legenda() + '<div class="alertas">';
    var lista = alertasPreventivos().slice(0, 2);
    lista.forEach(function (a, k) {
      var p = RISCOS[a.id].prevenir;
      s += '<div class="alerta n' + a.nivel + ' in"' + atraso(k + 3) + '><div class="quando">' + ic("calendario") + "<b>" + quando(a.dia) + "</b><small>" + diaSemana(a.dia) + "</small></div>" +
        '<div><div class="alerta-o-que">' + ic(RISCOS[a.id].icone) + "<div><b>" + RISCOS[a.id].titulo + "</b>" + chip(a.nivel) + "</div></div>" +
        '<div class="alerta-fazer">' + ic(p[0]) + "<p>" + p[1] + "</p></div></div></div>";
    });
    if (!lista.length) {
      s += '<div class="alerta n1 in"' + atraso(3) + '><div class="quando">' + ic("n1") + "<b>Tudo bem</b></div><div class=\"alerta-o-que\"><div><b>Sem alertas nos próximos dias</b></div></div></div>";
    }
    return s + "</div>";
  }

  function slideKit() {
    var s = cabecalho("mochila", "Tenha sempre pronto", "Uma mochila para sair rápido");
    s += '<div class="kit">' + KIT.map(function (k, i) {
      return '<div class="kit-item in"' + atraso(i + 1) + '><span class="kit-ic">' + ic(k[0]) + "</span><b>" + k[1] + "</b></div>";
    }).join("") + "</div>";
    return s + '<div class="ajude in"' + atraso(8) + ">" + ic("idoso") + ic("familia") + "<p>Ajude crianças, idosos e quem tem dificuldade para andar</p>" + ic("coracao") + "</div>";
  }

  function slideAjuda() {
    var s = cabecalho("telefone", "Pedir ajuda", "Ligue de graça, de qualquer telefone");
    s += '<div class="tels">' + D.telefones.map(function (t, i) {
      return '<div class="tel in"' + atraso(i + 1) + '><span class="tel-ic">' + ic(t.icone) + '</span><div class="tel-meio"><b>' + t.nome + '</b><div class="tel-usos">' +
        t.usos.map(function (u) { return ic(u); }).join("") + '</div></div><span class="tel-num">' + t.numero + "</span></div>";
    }).join("") + "</div>";
    return s;
  }

  /* ================= Sequência automática ================= */

  function montarLista() {
    var lista = [{ tipo: "resumo", dur: TEMPO.resumo }];
    porRisco().forEach(function (id) {
      lista.push({ tipo: "risco", id: id, dur: TEMPO.risco + TEMPO.porNivel * nivel(id) });
      lista.push({ tipo: "mapa", id: id, dur: TEMPO.mapa + TEMPO.porNivel * nivel(id) });
    });
    lista.push({ tipo: "proximas", dur: TEMPO.proximas });
    lista.push({ tipo: "previsao", dur: TEMPO.previsao });
    lista.push({ tipo: "kit", dur: TEMPO.kit });
    lista.push({ tipo: "ajuda", dur: TEMPO.ajuda });
    return lista;
  }

  function htmlItem(it) {
    if (it.tipo === "resumo") return slideResumo();
    if (it.tipo === "risco") return slideRisco(it.id);
    if (it.tipo === "mapa") return slideMapa(it.id);
    if (it.tipo === "proximas") return slideProximas();
    if (it.tipo === "previsao") return slidePrevisao();
    if (it.tipo === "kit") return slideKit();
    return slideAjuda();
  }

  // Nível que dá o clima visual da tela (cores, bordas, faróis)
  function nivelTela(it) {
    if (it.id) return nivel(it.id);
    if (it.tipo === "proximas") return nivelImediato();
    return it.tipo === "resumo" ? maxNivel() : 0;
  }

  function textoItem(it) {
    var n;
    if (it.tipo === "resumo") {
      return "Hoje na cidade. " + porRisco().map(function (id) { return RISCOS[id].titulo + ": " + NIVEIS[nivel(id)].nome + ". " + VEREDITO[nivel(id)].titulo + ". " + VEREDITO[nivel(id)].sub; }).join(". ") + ".";
    }
    if (it.tipo === "risco") {
      n = nivel(it.id);
      return RISCOS[it.id].titulo + ". " + NIVEIS[n].nome + ". " + VEREDITO[n].titulo + ". " + VEREDITO[n].sub + ". " + acoes(it.id, n).map(function (a) { return a[1]; }).join(". ") + ".";
    }
    if (it.tipo === "mapa") {
      var seg = D[it.id].pontoSeguro;
      var onde = D.voce.bairro ? "Você está no bairro " + D.voce.bairro : "Você está na " + D.voce.nome;
      if (!temDestino(it.id)) return "Mapa de " + RISCOS[it.id].titulo + ". " + onde + ". " + (nivel(it.id) >= 2 ? "Ligue 199 para saber para onde ir." : "Não precisa sair de casa.");
      return "Mapa de " + RISCOS[it.id].titulo + ". " + onde + ". " + (nivel(it.id) >= 3 ? "Vá agora para " : "Se precisar sair, vá para ") +
        destino(seg).rotulo + ": " + seg.nome + ".";
    }
    if (it.tipo === "proximas") {
      var ev = eventos();
      return "Próximas horas. " + (ev.length ? ev.map(function (e) { return textoHoras(e.horas) + ": " + RISCOS[e.id].titulo + ", " + NIVEIS[e.nivel].nome + ". " + ESTADOS[e.estado].nome + (e.horas > 0 ? ", " + e.prob + " por cento" : ""); }).join(". ") : "Sem perigo previsto.") + ".";
    }
    if (it.tipo === "previsao") {
      var a = alertasPreventivos();
      return "Próximos dias. " + (a.length ? a.map(function (x) { return quando(x.dia) + ": " + RISCOS[x.id].titulo + ", " + NIVEIS[x.nivel].nome + ". " + RISCOS[x.id].prevenir[1]; }).join(". ") : "Sem alertas.") + ".";
    }
    if (it.tipo === "kit") return "Tenha sempre pronto: " + KIT.map(function (k) { return k[1]; }).join(", ") + ". Ajude crianças, idosos e quem tem dificuldade para andar.";
    return "Pedir ajuda. " + D.telefones.map(function (t) { return t.nome + ", " + t.numero.split("").join(" "); }).join(". ") + ".";
  }

  // Voz só em atenção, perigo ou extremo: com tudo tranquilo o totem fica em silêncio
  function nivelFala(it) {
    var m = it.id ? nivel(it.id) : maxNivel();
    if (it.tipo === "proximas") eventos().forEach(function (e) { m = Math.max(m, e.nivel); });
    if (it.tipo === "previsao") alertasPreventivos().forEach(function (a) { m = Math.max(m, a.nivel); });
    return m;
  }

  function falar(t) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t);
    u.lang = "pt-BR";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  var audio = null;
  function sinal(n) {
    if (!SOM || n < 3) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state !== "running") audio.resume();
      var t = audio.currentTime;
      [0, 0.32, 0.64].forEach(function (o, i) {
        var osc = audio.createOscillator();
        var g = audio.createGain();
        osc.frequency.value = n === 4 ? (i % 2 ? 740 : 988) : 880;
        g.gain.setValueAtTime(0.0001, t + o);
        g.gain.exponentialRampToValueAtTime(0.25, t + o + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.28);
        osc.connect(g);
        g.connect(audio.destination);
        osc.start(t + o);
        osc.stop(t + o + 0.3);
      });
    } catch (e) { /* sem áudio */ }
  }

  function contar(raiz) {
    Array.prototype.forEach.call(raiz.querySelectorAll(".conta"), function (el) {
      var alvo = parseFloat(el.getAttribute("data-alvo"));
      var dec = parseInt(el.getAttribute("data-dec"), 10);
      setTimeout(function () {
        var t0 = performance.now();
        (function passo(t) {
          var p = Math.min(1, (t - t0) / 1600);
          p = 1 - Math.pow(1 - p, 3);
          el.textContent = (alvo * p).toFixed(dec).replace(".", ",");
          if (p < 1) requestAnimationFrame(passo);
        })(t0);
      }, 700);
    });
  }

  function textoFaixa() {
    var item = "<span>" + ic("correr") + VEREDITO[maxNivel()].titulo + "</span>";
    return item + item + item + item;
  }

  function montarTela() {
    var maior = maxNivel();
    var dicas = [["telefone", "Emergência: " + D.telefones.map(function (t) { return t.nome + " " + t.numero; }).join(" · ")]].concat(DICAS).map(function (t) { return "<span>" + ic(t[0]) + t[1] + "</span>"; }).join("");
    app.className = "stage";
    app.setAttribute("data-max", maior);
    app.setAttribute("data-nivel", 0);
    app.innerHTML =
      '<div class="farol e"></div><div class="farol d"></div>' +
      '<header class="topo"><div class="logo"><span class="logo-img"><img src="logo.svg" alt="FRAPC by Cosmos"></span>' +
      "<div><b>Alerta " + D.cidade + "</b><small>" + (D.voce.bairro ? "Bairro " + D.voce.bairro : "Deslizamento e alagamento") + "</small></div></div>" +
      '<div class="relogio"><b id="hora">--:--</b><small id="data"></small><small id="api-estado"></small></div></header>' +
      (maior >= 3 ? '<div class="faixa n' + maior + '"><span class="faixa-ic">' + ic("sirene") + '</span><div class="faixa-trilho"><div class="faixa-fita">' + textoFaixa() + textoFaixa() + '</div></div><span class="faixa-ic">' + ic("sirene") + "</span></div>" : "") +
      '<div class="progresso" id="progresso"></div><main class="palco" id="palco"></main>' +
      '<footer class="ticker"><div class="ticker-sos">' + ic("telefone") + "<div><small>Emergência</small>" + D.telefones.map(function (t) { return t.numero; }).join(" · ") + "</div></div>" +
      '<div class="ticker-trilho"><div class="ticker-fita">' + dicas + dicas + "</div></div></footer>";
  }

  function relogio() {
    var agora = new Date();
    document.getElementById("hora").textContent = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    document.getElementById("data").textContent = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    var est = document.getElementById("api-estado");
    var vivo = aoVivo && apiOk === true;
    var s = segundosDesde(ultimaAtualizacao);
    est.textContent = apiOk === false ? "SEM CONEXÃO COM A API (python api.py) · Dados: " + D.atualizadoEm :
      vivo ? "● AO VIVO · atualizado há " + (s || 0) + " s" : "Dados: " + D.atualizadoEm;
    est.classList.toggle("falha", apiOk === false);
    est.classList.toggle("vivo", vivo);
    atualizarBotaoAoVivo();
  }

  var LARGURA_PAINEL = 340;

  function ajustar() {
    var painel = MANUAL ? LARGURA_PAINEL : 0;
    var area = Math.max(200, window.innerWidth - painel);
    var s = Math.min(area / 1080, window.innerHeight / 1920);
    app.style.left = painel + area / 2 + "px";
    app.style.transform = "translate(-50%, -50%) scale(" + s + ")";
  }

  var lista, palco, progresso;
  var atual = null;
  var indice = 0;
  var inicio = Date.now();
  var params = new URLSearchParams(location.search);
  var pausado = params.has("pausa");
  var timer = null;
  var tInicio = 0;
  var restante = 0;

  function agendar(ms) {
    clearTimeout(timer);
    tInicio = Date.now();
    restante = ms;
    if (!pausado) timer = setTimeout(function () { ir(1); }, ms);
  }

  function ir(d) {
    mostrar((indice + d + lista.length) % lista.length);
  }

  function pausar(sim) {
    if (sim === pausado) return;
    if (sim) {
      clearTimeout(timer);
      restante -= Date.now() - tInicio;
      pausado = true;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } else {
      pausado = false;
      agendar(restante);
    }
    app.classList.toggle("pausado", pausado);
    atualizarPainel();
  }

  function mostrar(i) {
    if (i === 0 && atual && !pausado && Date.now() - inicio > RECARREGAR_MIN * 60000) {
      location.reload();
      return;
    }
    indice = i;
    var it = lista[i];
    var el = document.createElement("section");
    el.className = "slide";
    el.innerHTML = htmlItem(it);
    palco.appendChild(el);
    void el.offsetWidth;
    el.classList.add("ativo");
    contar(el);
    if (it.tipo === "mapa") iniciarMapa(el, it.id);

    var antigo = atual;
    atual = el;
    if (antigo) {
      antigo.classList.remove("ativo");
      antigo.classList.add("saindo");
      setTimeout(function () {
        if (antigo._fim) antigo._fim();
        antigo.remove();
      }, 1000);
    }

    var n = nivelTela(it);
    app.setAttribute("data-nivel", n);
    progresso.innerHTML = lista.map(function (x, k) {
      return '<span class="seg' + (k < i ? " feito" : k === i ? " agora" : "") + '" data-i="' + k + '" style="flex:' + x.dur + '"><i' +
        (k === i ? ' style="animation-duration:' + x.dur + 's"' : "") + "></i></span>";
    }).join("");
    atualizarPainel();

    if (it.tipo === "risco") sinal(nivel(it.id));
    avisarVitrine(it);
    if (VOZ && !pausado && nivelFala(it) >= 2) falar(textoItem(it));
    else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    agendar(it.dur * 1000);
  }

  // Teste: nível original de cada risco, para os bairros acompanharem quando o nível for trocado
  var ORIGEM = {};
  var HORIZONTE_ORIGEM = [];

  function registrarOrigem() {
    ORDEM.forEach(function (id) {
      ORIGEM[id] = { nivel: D[id].nivel, bairros: D.bairros.map(function (b) { return b[id]; }), ind: D[id].indicadores.map(function (i) { return i.valor; }) };
    });
    HORIZONTE_ORIGEM = JSON.parse(JSON.stringify(D.horizonte));
  }

  // Valores de exemplo dos indicadores quando o nível é trocado no painel de teste
  var INDICADOR_TESTE = { deslizamento: [10, 45, 90, 140], alagamento: [2, 15, 30, 55] };

  function ajustarNivel(id, n) {
    var o = ORIGEM[id];
    var delta = n - o.nivel;
    var mudou = delta !== 0;
    D[id].nivel = n;
    D.previsao[0][id] = n;
    D.horizonte[0][id].nivel = n;
    D.bairros.forEach(function (b, k) { b[id] = Math.max(1, Math.min(4, o.bairros[k] + delta)); });
    var minimo = id === "deslizamento" ? 3 : 2;
    D[id].indicadores[0].valor = mudou ? INDICADOR_TESTE[id][n - 1] : o.ind[0];
    D[id].indicadores[1].valor = mudou ? D.bairros.filter(function (b) { return b[id] >= minimo; }).length : o.ind[1];
  }

  // Cenários de teste: nível previsto para agora, 1 h, 3 h, 5 h e amanhã (nos dois riscos)
  var CENARIOS = [
    ["Exemplo", null],
    ["Sem perigo", [1, 1, 1, 1, 1]],
    ["Perigo em 1 hora", [1, 3, 4, 4, 4]],
    ["Perigo em 4-5 horas", [1, 1, 2, 4, 3]],
    ["Só amanhã", [1, 1, 1, 2, 4]]
  ];

  function aplicarCenario(k) {
    var c = CENARIOS[k][1];
    ORDEM.forEach(function (id) {
      D.horizonte.forEach(function (h, j) {
        h[id].nivel = c ? c[j] : HORIZONTE_ORIGEM[j][id].nivel;
        h[id].prob = HORIZONTE_ORIGEM[j][id].prob;
      });
      ajustarNivel(id, D.horizonte[0][id].nivel);
    });
  }

  function reconstruir() {
    var item = lista[indice];
    clearTimeout(timer);
    if (atual && atual._fim) atual._fim();
    atual = null;
    montarTela();
    palco = document.getElementById("palco");
    progresso = document.getElementById("progresso");
    relogio();
    lista = montarLista();
    var novo = 0;
    lista.forEach(function (x, k) { if (x.tipo === item.tipo && x.id === item.id) novo = k; });
    app.classList.toggle("pausado", pausado);
    mostrar(novo);
  }

  var NOMES = { resumo: "Hoje na cidade", proximas: "Próximas horas", previsao: "Próximos dias", kit: "Mochila", ajuda: "Pedir ajuda" };

  function nomeItem(it) {
    if (it.tipo === "risco") return RISCOS[it.id].titulo;
    if (it.tipo === "mapa") return "Mapa · " + RISCOS[it.id].titulo;
    return NOMES[it.tipo];
  }

  function atualizarPainel() {
    var p = document.getElementById("teste");
    if (!p) return;
    document.getElementById("t-pausa").innerHTML = ic(pausado ? "play" : "pausa") + (pausado ? "Continuar" : "Pausar");
    document.getElementById("t-lista").innerHTML = lista.map(function (it, k) {
      return '<button type="button" data-i="' + k + '"' + (k === indice ? ' class="ativa"' : "") + "><span>" + (k + 1) + "</span>" + nomeItem(it) + "</button>";
    }).join("");
    Array.prototype.forEach.call(p.querySelectorAll("[data-risco]"), function (b) {
      b.setAttribute("aria-pressed", nivel(b.getAttribute("data-risco")) === parseInt(b.getAttribute("data-nivel"), 10) ? "true" : "false");
    });
  }

  /* ================= Localização do totem (painel de teste) ================= */

  var LOCAL_CHAVE = "totem.local";
  var LOCAL_PADRAO = { lat: -3.1336, lng: -60.0233, nome: null };
  var CHUVAS_TESTE = [[1, "Real (agora)"], [4, "Forte (x4)"], [8, "Muito forte (x8)"], [15, "Extrema (x15)"]];
  var fatorChuva = 1;
  var miniMapa = null;
  var miniMarcador = null;
  var miniBairro = null;

  function ehLocal(l) {
    return !!l && typeof l.lat === "number" && typeof l.lng === "number" && isFinite(l.lat) && isFinite(l.lng);
  }

  // Prioridade: escolha do painel de teste > ?lat=&lng= na URL > config.js
  function localTotem() {
    if (MANUAL) {
      try {
        var salvo = JSON.parse(localStorage.getItem(LOCAL_CHAVE));
        if (ehLocal(salvo)) return salvo;
      } catch (e) { /* sem localStorage */ }
    }
    var daUrl = { lat: parseFloat(params.get("lat")), lng: parseFloat(params.get("lng")), nome: params.get("local") };
    if (ehLocal(daUrl)) return daUrl;
    return ehLocal(CFG.local) ? CFG.local : LOCAL_PADRAO;
  }

  function trocarLocal(l) {
    try {
      if (l) localStorage.setItem(LOCAL_CHAVE, JSON.stringify(l));
      else localStorage.removeItem(LOCAL_CHAVE);
    } catch (e) { /* sem localStorage */ }
    recarregarDaApi();
  }

  function recarregarDaApi() {
    var info = document.getElementById("t-local");
    if (info) info.textContent = "Buscando dados do local...";
    if (miniMarcador) miniMarcador.setLatLng([localTotem().lat, localTotem().lng]);
    carregarDados().then(function (ok) {
      apiOk = ok;
      if (ok) {
        registrarOrigem();
        reconstruir();
      }
      atualizarMiniMapa(ok);
    });
  }

  function atualizarMiniMapa(ok) {
    var info = document.getElementById("t-local");
    if (info) {
      info.innerHTML = ok === false ? "Não foi possível buscar este local na API." :
        "<b>" + (D.voce.bairro ? "Bairro " + D.voce.bairro : D.voce.nome) + "</b><br>" + D.voce.lat.toFixed(5) + ", " + D.voce.lng.toFixed(5) +
        (D.meta && D.meta.fonte_chuva ? "<br><small>Chuva: " + D.meta.fonte_chuva + "</small>" : "");
    }
    if (!miniMapa) return;
    var l = localTotem();
    miniMarcador.setLatLng([l.lat, l.lng]);
    if (miniBairro) miniMapa.removeLayer(miniBairro);
    miniBairro = null;
    var atual = D.bairros.filter(function (b) { return b.atual && b.geometria; })[0];
    if (atual) {
      miniBairro = L.geoJSON(atual.geometria, { interactive: false, style: { color: "#fff", weight: 2, dashArray: "5 4", fillColor: "#38bdf8", fillOpacity: 0.15 } }).addTo(miniMapa);
    }
    miniMapa.panTo([l.lat, l.lng]);
  }

  function iniciarMiniMapa() {
    if (!window.L || !document.getElementById("t-mapa")) return;
    var l = localTotem();
    miniMapa = L.map("t-mapa", { attributionControl: false, minZoom: 10, maxBounds: L.latLngBounds(LIMITES_MANAUS).pad(0.1) });
    camadaSatelite(miniMapa);
    miniMapa.setView([l.lat, l.lng], 13);
    miniMarcador = L.circleMarker([l.lat, l.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(miniMapa);
    miniMapa.on("click", function (e) {
      if (!L.latLngBounds(LIMITES_MANAUS).contains(e.latlng)) return;
      trocarLocal({ lat: e.latlng.lat, lng: e.latlng.lng, nome: null });
    });
    atualizarMiniMapa(apiOk);

    apiBuscar(CFG.rotaBairros || "/totem/bairros").then(function (lista) {
      var sel = document.getElementById("t-bairro");
      if (!sel || !Array.isArray(lista)) return;
      sel.innerHTML += lista.filter(ehCoord).map(function (b, k) {
        return '<option value="' + k + '">' + txt(b.nome) + "</option>";
      }).join("");
      sel._lista = lista.filter(ehCoord);
    }).catch(function () { /* lista é opcional: o clique no mapa continua funcionando */ });
  }

  function htmlPainelLocal() {
    if (!apiBase || !apiTudo) {
      return "<h3>Localização do totem</h3><p>Ligue a API (python api.py) para escolher a localização em Manaus.</p>";
    }
    return "<h3>Localização do totem</h3><p>Clique no mapa ou escolha um bairro de Manaus</p>" +
      '<div id="t-mapa"></div><select id="t-bairro" aria-label="Bairro"><option value="">Ir para um bairro...</option></select>' +
      '<p id="t-local"></p><button type="button" data-t="local-padrao" class="t-largo">Voltar ao local padrão</button>' +
      '<h3>Chuva (simulação no modelo)</h3><select id="t-chuva" aria-label="Chuva">' + CHUVAS_TESTE.map(function (c) {
        return '<option value="' + c[0] + '"' + (c[0] === fatorChuva ? " selected" : "") + ">" + c[1] + "</option>";
      }).join("") + "</select>";
  }

  function montarPainelTeste() {
    document.body.classList.add("manual-ativo");
    var p = document.createElement("aside");
    p.id = "teste";
    var s = "<h2>Teste</h2><p>Controles fora da tela do totem</p>" +
      (apiBase ? '<button type="button" data-t="aovivo" id="t-aovivo" class="t-aovivo"></button>' : "") +
      htmlPainelLocal() + "<h3>Telas</h3>" +
      '<div class="t-nav"><button type="button" data-t="ant" class="vira" aria-label="Anterior">' + ic("seta") + '</button><button type="button" data-t="pausa" id="t-pausa"></button>' +
      '<button type="button" data-t="prox" aria-label="Próxima">' + ic("seta") + '</button></div><div id="t-lista"></div>';
    ORDEM.forEach(function (id) {
      s += "<h3>" + RISCOS[id].titulo + '</h3><div class="t-niveis">';
      for (var n = 1; n <= 4; n++) {
        s += '<button type="button" class="n' + n + '" data-risco="' + id + '" data-nivel="' + n + '">' + ic("n" + n) + NIVEIS[n].curto + "</button>";
      }
      s += "</div>";
    });
    s += "<h3>Previsão</h3><div class=\"t-cenarios\">" + CENARIOS.map(function (c, k) {
      return '<button type="button" data-cenario="' + k + '">' + c[0] + "</button>";
    }).join("") + "</div>";
    s += '<h3>Som</h3><label><input type="checkbox" id="t-voz"' + (VOZ ? " checked" : "") + '> Voz</label><label><input type="checkbox" id="t-som"' + (SOM ? " checked" : "") + "> Sinal sonoro</label>" + (apiBase ? '<h3>API</h3><label><input type="checkbox" id="t-api" checked> Atualizar da API</label>' : "");
    p.innerHTML = s;
    document.body.appendChild(p);
    iniciarMiniMapa();
    atualizarBotaoAoVivo();

    // Níveis e cenários de teste são simulação: saem do tempo real e congelam a API para não sobrescrever
    function congelarParaTeste() {
      if (aoVivo) ligarAoVivo(false);
      apiPausada = true;
      var cb = document.getElementById("t-api");
      if (cb) cb.checked = false;
    }

    p.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-cenario")) {
        congelarParaTeste();
        aplicarCenario(parseInt(b.getAttribute("data-cenario"), 10));
        reconstruir();
      } else if (b.hasAttribute("data-risco")) {
        congelarParaTeste();
        ajustarNivel(b.getAttribute("data-risco"), parseInt(b.getAttribute("data-nivel"), 10));
        reconstruir();
      } else if (b.hasAttribute("data-i")) {
        mostrar(parseInt(b.getAttribute("data-i"), 10));
      } else {
        var a = b.getAttribute("data-t");
        if (a === "prox") ir(1);
        else if (a === "ant") ir(-1);
        else if (a === "local-padrao") trocarLocal(null);
        else if (a === "aovivo") ligarAoVivo(!aoVivo);
        else pausar(!pausado);
      }
    });
    p.addEventListener("change", function (e) {
      if (e.target.id === "t-voz") {
        VOZ = e.target.checked;
        if (!VOZ && "speechSynthesis" in window) window.speechSynthesis.cancel();
      } else if (e.target.id === "t-som") {
        SOM = e.target.checked;
      } else if (e.target.id === "t-api") {
        apiPausada = !e.target.checked;
        if (apiPausada && aoVivo) ligarAoVivo(false);
      } else if (e.target.id === "t-bairro") {
        var b = e.target._lista && e.target._lista[parseInt(e.target.value, 10)];
        if (b) trocarLocal({ lat: b.lat, lng: b.lng, nome: null });
        e.target.value = "";
      } else if (e.target.id === "t-chuva") {
        fatorChuva = parseFloat(e.target.value) || 1;
        if (fatorChuva !== 1 && aoVivo) ligarAoVivo(false);
        recarregarDaApi();
      }
    });
  }

  function ligarNavegacaoManual() {
    montarPainelTeste();
    app.addEventListener("click", function (e) {
      var s = e.target.closest(".seg");
      if (s) mostrar(parseInt(s.getAttribute("data-i"), 10));
    });
    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.closest("#t-mapa")) return;
      if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
      else if (e.key === " ") { e.preventDefault(); pausar(!pausado); }
    });
    var x0 = null;
    document.addEventListener("touchstart", function (e) { x0 = e.target.closest("#teste") ? null : e.touches[0].clientX; }, { passive: true });
    document.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 70) ir(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ================= API ================= */

  var CFG = window.API_CONFIG || {};
  var ROTAS = { cidade: "/cidade", deslizamento: "/deslizamento", alagamento: "/alagamento", bairros: "/bairros", horizonte: "/horizonte", previsao: "/previsao" };
  var apiBase = VITRINE ? "" : params.get("api") || CFG.base || "";
  var apiSufixo = params.has("sufixo") ? params.get("sufixo") : CFG.sufixo || "";
  var apiTudo = params.has("tudo") ? params.get("tudo") : CFG.tudo || "";
  var apiOk = null;
  var apiPausada = false;

  function apiUrl(rota, consulta) {
    return apiBase.replace(/\/+$/, "") + rota + apiSufixo + (consulta ? "?" + consulta : "");
  }

  // Localização do totem e simulação de chuva vão como parâmetros da rota única
  function consultaLocal() {
    var l = localTotem();
    return "lat=" + l.lat.toFixed(6) + "&lng=" + l.lng.toFixed(6) + (l.nome ? "&nome=" + encodeURIComponent(l.nome) : "") +
      (fatorChuva !== 1 ? "&fator_chuva=" + fatorChuva : "") + (forcarAtualizacao ? "&atualizar=true" : "");
  }

  function apiBuscar(rota, consulta) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.limiteMs || 5000);
    var cab = Object.assign({ Accept: "application/json" }, CFG.cabecalhos || {});
    return fetch(apiUrl(rota, consulta), { headers: cab, cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }, function (e) {
        clearTimeout(t);
        throw e;
      });
  }

  // Tudo que vem da API entra como texto escapado e com números e ícones validados
  function txt(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function num0(v, padrao) {
    v = Number(v);
    return isFinite(v) ? v : padrao;
  }

  function ehNivel(n) {
    return typeof n === "number" && n >= 1 && n <= 4;
  }

  function ehCoord(o) {
    return !!o && typeof o.lat === "number" && typeof o.lng === "number";
  }

  function iconeOu(n, padrao) {
    return ICONES[n] ? n : padrao;
  }

  function aplicarCidade(j) {
    if (typeof j.cidade === "string") D.cidade = txt(j.cidade);
    if (typeof j.atualizadoEm === "string") D.atualizadoEm = txt(j.atualizadoEm);
    if (j.voce && ehCoord(j.voce)) D.voce = { nome: txt(j.voce.nome), bairro: j.voce.bairro ? txt(j.voce.bairro) : "", lat: j.voce.lat, lng: j.voce.lng };
    if (j.meta && typeof j.meta === "object") D.meta = { fonte_chuva: txt(j.meta.fonte_chuva), bairro: txt(j.meta.bairro) };
    if (Array.isArray(j.telefones) && j.telefones.length) {
      D.telefones = j.telefones.map(function (t) {
        return {
          nome: txt(t.nome), numero: String(t.numero).replace(/\D/g, ""), icone: iconeOu(t.icone, "telefone"),
          usos: (Array.isArray(t.usos) ? t.usos : []).filter(function (u) { return ICONES[u]; })
        };
      });
    }
  }

  function aplicarRisco(id, j) {
    if (!j || typeof j !== "object") return;
    if (ehNivel(j.nivel)) D[id].nivel = Math.round(j.nivel);
    if (Array.isArray(j.indicadores) && j.indicadores.length >= 2) {
      D[id].indicadores = j.indicadores.slice(0, 2).map(function (i) {
        return { icone: iconeOu(i.icone, "gota"), valor: num0(i.valor, 0), dec: num0(i.dec, 0), unidade: txt(i.unidade), rotulo: txt(i.rotulo) };
      });
    }
    var s = j.pontoSeguro;
    if (s && ehCoord(s)) {
      D[id].pontoSeguro = { nome: txt(s.nome), tipo: DESTINOS[s.tipo] ? s.tipo : "ponto", bairro: txt(s.bairro), lat: s.lat, lng: s.lng, minutos: num0(s.minutos, 10) };
    } else if (s === null) {
      D[id].pontoSeguro = null;
    }
  }

  // Só aceita polígonos GeoJSON (contorno do bairro desenhado no mapa)
  function ehGeometria(g) {
    return !!g && (g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.coordinates);
  }

  function aplicarBairros(j) {
    if (!Array.isArray(j)) return;
    var v = j.filter(function (b) { return b && b.nome && ehCoord(b) && ehNivel(b.deslizamento) && ehNivel(b.alagamento); }).map(function (b) {
      return {
        id: txt(b.id || b.nome), nome: txt(b.nome), lat: b.lat, lng: b.lng, deslizamento: Math.round(b.deslizamento), alagamento: Math.round(b.alagamento),
        atual: b.atual === true, geometria: ehGeometria(b.geometria) ? { type: b.geometria.type, coordinates: b.geometria.coordinates } : null
      };
    });
    if (v.length) D.bairros = v;
  }

  function aplicarHorizonte(j) {
    if (!Array.isArray(j)) return;
    function par(x) { return { nivel: Math.round(x.nivel), prob: Math.max(0, Math.min(100, num0(x.prob, 100))) }; }
    var v = j.filter(function (h) {
      return h && typeof h.horas === "number" && h.deslizamento && h.alagamento && ehNivel(h.deslizamento.nivel) && ehNivel(h.alagamento.nivel);
    }).map(function (h) {
      return { rotulo: txt(h.rotulo), horas: h.horas, chuva: num0(h.chuva, 0), deslizamento: par(h.deslizamento), alagamento: par(h.alagamento) };
    });
    if (v.length) D.horizonte = v;
  }

  function aplicarPrevisao(j) {
    if (!Array.isArray(j)) return;
    var v = j.filter(function (d) { return d && ehNivel(d.deslizamento) && ehNivel(d.alagamento); }).map(function (d) {
      return { chuva: num0(d.chuva, 0), deslizamento: Math.round(d.deslizamento), alagamento: Math.round(d.alagamento) };
    });
    if (v.length) D.previsao = v;
  }

  var SECOES = {
    cidade: aplicarCidade,
    deslizamento: function (j) { aplicarRisco("deslizamento", j); },
    alagamento: function (j) { aplicarRisco("alagamento", j); },
    bairros: aplicarBairros,
    horizonte: aplicarHorizonte,
    previsao: aplicarPrevisao
  };

  // Busca os dados na API e mescla em DADOS. Resolve true se alguma parte chegou.
  function carregarDados() {
    if (!apiBase) return Promise.resolve(false);
    var tarefas;
    if (apiTudo) {
      var consulta = consultaLocal();
      forcarAtualizacao = false;
      tarefas = [apiBuscar(apiTudo, consulta).then(function (j) {
        aplicarCidade(j);
        Object.keys(SECOES).forEach(function (k) { if (k !== "cidade" && j[k] !== undefined) SECOES[k](j[k]); });
        return true;
      })];
    } else {
      tarefas = Object.keys(SECOES).filter(function (k) { return (CFG.rotas && CFG.rotas[k]) || ROTAS[k]; }).map(function (k) {
        return apiBuscar((CFG.rotas && CFG.rotas[k]) || ROTAS[k]).then(function (j) {
          SECOES[k](j);
          return true;
        });
      });
    }
    return Promise.all(tarefas.map(function (p) { return p.catch(function () { return false; }); })).then(function (r) {
      var ok = r.some(Boolean);
      if (ok) ultimaAtualizacao = Date.now();
      return ok;
    });
  }

  // Só o conteúdo dos alertas: hora de atualização e metadados mudam a cada consulta e não devem reiniciar a tela
  function assinaturaDados() {
    var c = Object.assign({}, D);
    delete c.atualizadoEm;
    delete c.meta;
    return JSON.stringify(c);
  }

  function atualizarDaApi() {
    if (!apiBase || apiPausada) return;
    var antes = assinaturaDados();
    carregarDados().then(function (ok) {
      apiOk = ok;
      if (ok && assinaturaDados() !== antes) {
        registrarOrigem();
        reconstruir();
        atualizarMiniMapa(ok);
      } else if (!ok) {
        atualizarMiniMapa(false);
      }
    });
  }

  /* ================= Tempo real ================= */

  var AO_VIVO_CHAVE = "totem.aovivo";
  var aoVivo = false;
  var forcarAtualizacao = false;
  var ultimaAtualizacao = 0;
  var timerApi = null;

  function aoVivoInicial() {
    if (!apiBase) return false;
    if (MANUAL) {
      try {
        var salvo = localStorage.getItem(AO_VIVO_CHAVE);
        if (salvo !== null) return salvo === "1";
      } catch (e) { /* sem localStorage */ }
    }
    return CFG.tempoReal !== false;
  }

  function agendarApi() {
    clearTimeout(timerApi);
    if (!apiBase) return;
    var seg = aoVivo ? CFG.intervaloAoVivoSeg || 15 : CFG.intervaloSeg || 60;
    timerApi = setTimeout(function () {
      // No modo tempo real pede a chuva de novo ao servidor (ele limita a 1 consulta por minuto)
      forcarAtualizacao = aoVivo;
      atualizarDaApi();
      agendarApi();
    }, seg * 1000);
  }

  function ligarAoVivo(sim) {
    if (!apiBase) return;
    aoVivo = sim;
    try { localStorage.setItem(AO_VIVO_CHAVE, sim ? "1" : "0"); } catch (e) { /* sem localStorage */ }
    if (sim) {
      // Tempo real = dados reais rodando: tira simulação, pausa e congelamento da API
      apiPausada = false;
      fatorChuva = 1;
      var cb = document.getElementById("t-api");
      if (cb) cb.checked = true;
      var sel = document.getElementById("t-chuva");
      if (sel) sel.value = "1";
      pausar(false);
      forcarAtualizacao = true;
      recarregarDaApi();
    }
    agendarApi();
    relogio();
  }

  function segundosDesde(t) {
    return t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null;
  }

  function atualizarBotaoAoVivo() {
    var b = document.getElementById("t-aovivo");
    if (!b) return;
    var s = segundosDesde(ultimaAtualizacao);
    b.classList.toggle("ligado", aoVivo);
    b.setAttribute("aria-pressed", aoVivo ? "true" : "false");
    b.innerHTML = '<span class="t-aovivo-luz"></span><span><b>' + (aoVivo ? "Tempo real ligado" : "Ligar tempo real") + "</b><small>" +
      (aoVivo ? "Atualiza a cada " + (CFG.intervaloAoVivoSeg || 15) + " s" + (s !== null ? " · última há " + s + " s" : "") : "Hoje: atualiza a cada " + (CFG.intervaloSeg || 60) + " s") +
      "</small></span>";
  }

  function mostrarCarregando(msg) {
    app.className = "stage";
    app.setAttribute("data-nivel", 0);
    app.innerHTML = '<div class="carregando">' + msg + "</div>";
  }

  function iniciar() {
    registrarOrigem();
    // ?desl=N e ?alag=N (1 a 4) já abrem com esse nível
    ORDEM.forEach(function (id) {
      var q = parseInt(params.get(id === "deslizamento" ? "desl" : "alag"), 10);
      ajustarNivel(id, q >= 1 && q <= 4 ? q : D[id].nivel);
    });

    montarTela();
    palco = document.getElementById("palco");
    progresso = document.getElementById("progresso");
    lista = montarLista();
    relogio();
    setInterval(relogio, 1000);
    aoVivo = aoVivoInicial();
    if (aoVivo) pausado = false;
    if (MANUAL) ligarNavegacaoManual();
    if (pausado) app.classList.add("pausado");

    // ?slide=N abre direto numa tela; ?pausa congela (para revisar o visual)
    var primeiro = parseInt(params.get("slide"), 10) || 0;
    var pagina = document.body.getAttribute("data-pagina");
    for (var k = 0; k < lista.length; k++) {
      if (pagina && lista[k].tipo === "risco" && lista[k].id === pagina) { primeiro = k; break; }
    }
    mostrar(primeiro);
    agendarApi();
    if (VITRINE) ouvirVitrine();
  }

  // Site de divulgação comanda o totem embutido: trocar de tela e simular o nível de risco
  function ouvirVitrine() {
    window.addEventListener("message", function (e) {
      if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
      var m = e.data;
      if (m.totem === "tela" && typeof m.tipo === "string") {
        var k = -1;
        lista.forEach(function (x, i) { if (k < 0 && x.tipo === m.tipo && (!m.id || x.id === m.id)) k = i; });
        if (k >= 0) mostrar(k);
      } else if (m.totem === "nivel" && ehNivel(m.nivel)) {
        var alvo = { deslizamento: m.nivel, alagamento: Math.max(1, m.nivel - 1) };
        ORDEM.forEach(function (id) {
          D.horizonte.forEach(function (h) { h[id].nivel = alvo[id]; });
          D.previsao.forEach(function (p, i) { p[id] = Math.max(1, alvo[id] - (i > 1 ? 1 : 0)); });
          ajustarNivel(id, alvo[id]);
        });
        reconstruir();
      }
    });
  }

  function avisarVitrine(it) {
    if (VITRINE && window.parent !== window) {
      window.parent.postMessage({ totem: "mostrando", tipo: it.tipo, id: it.id || null, nivel: maxNivel() }, "*");
    }
  }

  function abrir() {
    mostrarCarregando("Carregando alertas...");
    forcarAtualizacao = aoVivoInicial();
    carregarDados().then(function (ok) {
      apiOk = apiBase ? ok : null;
      if (apiBase && !ok && CFG.exemploSeFalhar === false) {
        mostrarCarregando("Sem conexão com o servidor de alertas.<br><small>Tentando de novo...</small>");
        setTimeout(abrir, 15000);
        return;
      }
      iniciar();
    });
  }

  window.addEventListener("resize", ajustar);
  ajustar();
  abrir();
})();
