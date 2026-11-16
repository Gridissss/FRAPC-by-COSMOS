(function () {
  "use strict";

  var menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var totem = document.getElementById("totem-demo");
  var palco = document.querySelector(".palco");
  var aparelho = document.querySelector(".totem-aparelho");
  var nivelAtual = 3;

  var COR_NIVEL = { 1: "rgba(22, 163, 74, .45)", 2: "rgba(250, 204, 21, .45)", 3: "rgba(251, 146, 60, .55)", 4: "rgba(220, 38, 38, .6)" };
  var NOMES_TELA = {
    resumo: "Hoje na cidade",
    "risco:deslizamento": "Deslizamento", "risco:alagamento": "Alagamento",
    "mapa:deslizamento": "Mapa · Deslizamento", "mapa:alagamento": "Mapa · Alagamento",
    proximas: "Próximas horas", previsao: "Próximos dias", kit: "Mochila pronta", ajuda: "Pedir ajuda"
  };

  /* ---------- Totem embutido ---------- */

  function falarComTotem(msg) {
    if (totem && totem.contentWindow) totem.contentWindow.postMessage(msg, "*");
  }

  function pintarBrilho(n) {
    if (aparelho) aparelho.style.setProperty("--brilho-totem", COR_NIVEL[n] || COR_NIVEL[3]);
  }

  window.addEventListener("message", function (e) {
    if (!totem || e.source !== totem.contentWindow || !e.data || e.data.totem !== "mostrando") return;
    var chave = e.data.id ? e.data.tipo + ":" + e.data.id : e.data.tipo;
    var rotulo = document.getElementById("totem-tela");
    if (rotulo) rotulo.textContent = NOMES_TELA[chave] || NOMES_TELA[e.data.tipo] || "";
    if (e.data.nivel >= 1 && e.data.nivel <= 4) pintarBrilho(e.data.nivel);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".simulador button"), function (b) {
    b.addEventListener("click", function () {
      nivelAtual = parseInt(b.getAttribute("data-nivel"), 10);
      Array.prototype.forEach.call(document.querySelectorAll(".simulador button"), function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      falarComTotem({ totem: "nivel", nivel: nivelAtual });
      pintarBrilho(nivelAtual);
    });
  });

  // Rolar pelos passos troca a tela do totem
  var etapas = document.querySelectorAll("[data-tela]");
  if ("IntersectionObserver" in window) {
    var observaEtapa = new IntersectionObserver(function (itens) {
      itens.forEach(function (it) {
        if (!it.isIntersecting) return;
        Array.prototype.forEach.call(etapas, function (x) { x.classList.toggle("ativo", x === it.target); });
        falarComTotem({ totem: "tela", tipo: it.target.getAttribute("data-tela"), id: it.target.getAttribute("data-id") });
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    Array.prototype.forEach.call(etapas, function (x) { observaEtapa.observe(x); });
  }

  /* ---------- Navegação, barra de progresso e manifesto (um único laço de rolagem) ---------- */

  var nav = document.getElementById("nav");
  var barra = document.getElementById("progresso-leitura");
  var ultimoY = window.scrollY;
  var agendado = false;
  var velocidadeRolagem = 0;

  function aoRolar() {
    agendado = false;
    var y = window.scrollY;
    var total = document.documentElement.scrollHeight - window.innerHeight;
    if (barra) barra.style.transform = "scaleX(" + (total > 0 ? Math.min(1, y / total) : 0) + ")";
    acenderManifesto();
  }

  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    nav.classList.toggle("solida", y > 40);
    nav.classList.toggle("escondida", y > 500 && y > ultimoY + 4);
    if (y < ultimoY - 4) nav.classList.remove("escondida");
    velocidadeRolagem = y - ultimoY;
    ultimoY = y;
    if (!agendado) { agendado = true; requestAnimationFrame(aoRolar); }
  }, { passive: true });

  /* ---------- Títulos entram palavra por palavra ---------- */

  // Quebra o texto em <span> por palavra, mantendo <em> e o restante da marcação
  function partirPalavras(el, classe, comMiolo) {
    var n = 0;
    (function andar(no) {
      Array.prototype.slice.call(no.childNodes).forEach(function (filho) {
        if (filho.nodeType === 1) { andar(filho); return; }
        if (filho.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        filho.textContent.split(/(\s+)/).forEach(function (parte) {
          if (!parte) return;
          if (/^\s+$/.test(parte)) { frag.appendChild(document.createTextNode(" ")); return; }
          var w = document.createElement("span");
          w.className = classe;
          if (comMiolo) {
            var miolo = document.createElement("span");
            miolo.textContent = parte;
            w.appendChild(miolo);
            w.style.setProperty("--p", n);
          } else {
            w.textContent = parte;
          }
          n++;
          frag.appendChild(w);
        });
        no.replaceChild(frag, filho);
      });
    })(el);
    return n;
  }

  var titulos = document.querySelectorAll(".cabeca-secao h2, .chamada h2");
  if (!menosMovimento && "IntersectionObserver" in window) {
    Array.prototype.forEach.call(titulos, function (h) { partirPalavras(h, "palavra", true); });
    var observaTitulo = new IntersectionObserver(function (itens, obs) {
      itens.forEach(function (it) {
        if (!it.isIntersecting) return;
        it.target.classList.add("titulo-visivel");
        obs.unobserve(it.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    Array.prototype.forEach.call(titulos, function (h) { observaTitulo.observe(h); });
  }

  // Manifesto: cada palavra acende conforme o texto passa pela tela
  var manifesto = document.getElementById("manifesto-texto");
  var palavrasManifesto = [];
  if (manifesto && !menosMovimento) {
    partirPalavras(manifesto, "m-palavra", false);
    palavrasManifesto = manifesto.querySelectorAll(".m-palavra");
  }
  function acenderManifesto() {
    if (!palavrasManifesto.length) return;
    var r = manifesto.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = (vh * .85 - r.top) / (r.height + vh * .3);
    var acesas = Math.round(Math.max(0, Math.min(1, p)) * palavrasManifesto.length);
    for (var i = 0; i < palavrasManifesto.length; i++) palavrasManifesto[i].classList.toggle("acesa", i < acesas);
  }

  /* ---------- Revelar e contar ao entrar na tela ---------- */

  function contar(el) {
    var alvo = parseInt(el.getAttribute("data-alvo"), 10);
    if (menosMovimento) { el.textContent = alvo.toLocaleString("pt-BR"); return; }
    var t0 = performance.now();
    (function passo(t) {
      var p = Math.min(1, (t - t0) / 1600);
      el.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 4))).toLocaleString("pt-BR");
      if (p < 1) requestAnimationFrame(passo);
    })(t0);
  }

  if ("IntersectionObserver" in window) {
    var observaRevela = new IntersectionObserver(function (itens, obs) {
      itens.forEach(function (it) {
        if (!it.isIntersecting) return;
        it.target.classList.add("visivel");
        obs.unobserve(it.target);
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    Array.prototype.forEach.call(document.querySelectorAll("[data-revela]"), function (el) { observaRevela.observe(el); });

    var observaConta = new IntersectionObserver(function (itens, obs) {
      itens.forEach(function (it) {
        if (!it.isIntersecting) return;
        contar(it.target);
        obs.unobserve(it.target);
      });
    }, { threshold: .6 });
    Array.prototype.forEach.call(document.querySelectorAll(".conta"), function (el) { observaConta.observe(el); });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll("[data-revela]"), function (el) { el.classList.add("visivel"); });
    Array.prototype.forEach.call(document.querySelectorAll(".conta"), function (el) { el.textContent = el.getAttribute("data-alvo"); });
  }

  /* ---------- Vídeo do YouTube (só carrega ao clicar) ---------- */

  var moldura = document.getElementById("video-moldura");
  var play = document.getElementById("video-play");
  if (moldura && play) {
    play.addEventListener("click", function () {
      var id = moldura.getAttribute("data-youtube");
      // O YouTube recusa embed em página aberta direto do disco (sem origem http): abre em nova aba
      if (!/^https?:$/.test(location.protocol)) {
        window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(id), "_blank", "noopener");
        return;
      }
      var player = document.createElement("iframe");
      player.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0&playsinline=1&modestbranding=1";
      player.title = "Vídeo do Projeto Cosmos no YouTube";
      player.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      player.referrerPolicy = "strict-origin-when-cross-origin";
      player.allowFullscreen = true;
      moldura.appendChild(player);
      moldura.classList.add("tocando");
    });
  }

  /* ---------- Janela de documentos ("Ver mais detalhes") ---------- */

  var docs = document.getElementById("docs");
  if (docs) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-abrir-docs]"), function (b) {
      b.addEventListener("click", function () {
        if (docs.showModal) docs.showModal();
        else docs.setAttribute("open", "");
      });
    });
    Array.prototype.forEach.call(docs.querySelectorAll("[data-fechar-docs]"), function (b) {
      b.addEventListener("click", function () { docs.close ? docs.close() : docs.removeAttribute("open"); });
    });
    // Clique fora da caixa (no fundo escurecido) fecha
    docs.addEventListener("click", function (e) { if (e.target === docs && docs.close) docs.close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && docs.open) docs.close ? docs.close() : docs.removeAttribute("open");
    });
  }

  /* ---------- Interações finas: só com mouse e sem "reduzir movimento" ---------- */

  var mouseFino = window.matchMedia("(pointer: fine)").matches;
  if (mouseFino && !menosMovimento) {
    // Totem inclina levemente seguindo o mouse
    var palcoTotem = document.querySelector(".palco-totem");
    var inclina = document.querySelector(".totem-inclina");
    if (palcoTotem && inclina) {
      palcoTotem.addEventListener("pointermove", function (e) {
        var r = inclina.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        inclina.style.transform = "rotateY(" + (dx * 10).toFixed(2) + "deg) rotateX(" + (-dy * 7).toFixed(2) + "deg)";
      });
      palcoTotem.addEventListener("pointerleave", function () { inclina.style.transform = ""; });
    }

    // Luz que acompanha o cursor
    Array.prototype.forEach.call(document.querySelectorAll(".nivel, .cartao"), function (c) {
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty("--mx", (e.clientX - r.left) + "px");
        c.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });

    // Botões principais "puxados" pelo cursor
    Array.prototype.forEach.call(document.querySelectorAll(".hero-acoes .botao, .chamada-acoes .botao"), function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        b.style.transform = "translate(" + (dx * .22).toFixed(1) + "px," + (dy * .32).toFixed(1) + "px)";
      });
      b.addEventListener("pointerleave", function () { b.style.transform = ""; });
    });
  }

  /* ---------- Faixa de bairros: anda sozinha e acelera com a rolagem ---------- */

  var faixa = document.querySelector(".faixa");
  var trilho = document.querySelector(".faixa-trilho");
  if (faixa && trilho && !menosMovimento && "IntersectionObserver" in window) {
    faixa.classList.add("movida");
    var posicao = 0;
    var embalo = 0;
    var faixaVisivel = false;
    var antes = performance.now();
    var andarFaixa = function (agora) {
      var dt = Math.min(64, agora - antes) / 1000;
      antes = agora;
      embalo += (velocidadeRolagem - embalo) * .08;
      velocidadeRolagem *= .9;
      var metade = trilho.scrollWidth / 2;
      posicao -= (70 + Math.abs(embalo) * 18) * dt * (embalo < -1 ? -1 : 1);
      if (posicao <= -metade) posicao += metade;
      if (posicao > 0) posicao -= metade;
      trilho.style.transform = "translateX(" + posicao.toFixed(1) + "px) skewX(" + Math.max(-12, Math.min(12, -embalo * .35)).toFixed(2) + "deg)";
      if (faixaVisivel) requestAnimationFrame(andarFaixa);
    };
    new IntersectionObserver(function (itens) {
      var era = faixaVisivel;
      faixaVisivel = itens[0].isIntersecting;
      if (faixaVisivel && !era) { antes = performance.now(); requestAnimationFrame(andarFaixa); }
    }).observe(faixa);
  }

  aoRolar();

  /* ---------- Chuva no palco (mais forte quanto maior o nível simulado) ---------- */

  var tela = document.querySelector(".chuva");
  if (!tela || menosMovimento) return;
  var ctx = tela.getContext("2d");
  var gotas = [];
  var largura = 0;
  var altura = 0;
  var rodando = false;
  var GOTAS_POR_NIVEL = { 1: 40, 2: 110, 3: 220, 4: 380 };

  function medir() {
    var r = window.devicePixelRatio || 1;
    largura = tela.clientWidth;
    altura = tela.clientHeight;
    tela.width = largura * r;
    tela.height = altura * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }

  function novaGota(topo) {
    return {
      x: Math.random() * (largura + 200) - 100,
      y: topo ? -Math.random() * altura : Math.random() * altura,
      v: 9 + Math.random() * 10,
      c: 10 + Math.random() * 18,
      a: .08 + Math.random() * .22
    };
  }

  function quadro() {
    if (!rodando) return;
    var alvo = GOTAS_POR_NIVEL[nivelAtual] || 200;
    while (gotas.length < alvo) gotas.push(novaGota(true));
    if (gotas.length > alvo) gotas.length = alvo;
    ctx.clearRect(0, 0, largura, altura);
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    for (var i = 0; i < gotas.length; i++) {
      var g = gotas[i];
      ctx.strokeStyle = "rgba(190, 215, 255," + g.a + ")";
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x - g.c * .28, g.y + g.c);
      ctx.stroke();
      g.y += g.v;
      g.x -= g.v * .28;
      if (g.y > altura + 20) gotas[i] = novaGota(true);
    }
    requestAnimationFrame(quadro);
  }

  function ligar(sim) {
    if (sim === rodando) return;
    rodando = sim;
    if (sim) requestAnimationFrame(quadro);
  }

  medir();
  for (var k = 0; k < GOTAS_POR_NIVEL[nivelAtual]; k++) gotas.push(novaGota(false));
  window.addEventListener("resize", medir);
  var palcoVisivel = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (itens) {
      palcoVisivel = itens[0].isIntersecting;
      ligar(palcoVisivel && !document.hidden);
    }).observe(palco);
  } else {
    ligar(true);
  }
  document.addEventListener("visibilitychange", function () { ligar(palcoVisivel && !document.hidden); });
})();
