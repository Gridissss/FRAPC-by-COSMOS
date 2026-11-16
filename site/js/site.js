(function () {
  "use strict";

  var menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var totem = document.getElementById("totem-demo");
  var palco = document.querySelector(".palco");
  var aparelho = document.querySelector(".totem-aparelho");
  var nivelAtual = 3;

  var COR_NIVEL = { 1: "rgba(22, 163, 74, .45)", 2: "rgba(250, 204, 21, .45)", 3: "rgba(251, 146, 60, .55)", 4: "rgba(220, 38, 38, .6)" };

  /* ---------- Botões: texto que rola para cima no hover ---------- */

  // Roda antes da tradução: o idioma troca só o .botao-texto, sem desmontar o botão
  Array.prototype.forEach.call(document.querySelectorAll(".botao"), function (b) {
    Array.prototype.slice.call(b.childNodes).forEach(function (no) {
      if (no.nodeType !== 3 || !no.textContent.trim()) return;
      var rotulo = document.createElement("span");
      rotulo.className = "botao-rotulo";
      var texto = document.createElement("span");
      texto.className = "botao-texto";
      texto.textContent = no.textContent.trim();
      rotulo.appendChild(texto);
      b.replaceChild(rotulo, no);
    });
  });

  /* ---------- Idioma: inglês por padrão (o próprio HTML), português do Brasil opcional ---------- */

  var PT = window.COSMOS_PT || {};
  // Textos que só existem no JavaScript; os do HTML em inglês são lidos da própria página
  var EN = {
    "js.tela.resumo": "Today in the city",
    "js.tela.risco:deslizamento": "Landslide", "js.tela.risco:alagamento": "Flooding",
    "js.tela.mapa:deslizamento": "Map · Landslide", "js.tela.mapa:alagamento": "Map · Flooding",
    "js.tela.proximas": "Next hours", "js.tela.previsao": "Next days", "js.tela.kit": "Go-bag ready", "js.tela.ajuda": "Getting help",
    "js.youtube": "Project Cosmos video on YouTube"
  };
  var lingua = "en";
  var comTexto = document.querySelectorAll("[data-i18n]");
  var comAtributo = document.querySelectorAll("[data-i18n-attr]");

  function alvoTexto(el) {
    return (el.classList.contains("botao") && el.querySelector(".botao-texto")) || el;
  }
  function paresAtributo(el) {
    return el.getAttribute("data-i18n-attr").split(";").map(function (p) { return p.split(":"); });
  }
  Array.prototype.forEach.call(comTexto, function (el) {
    var chave = el.getAttribute("data-i18n");
    if (!(chave in EN)) EN[chave] = alvoTexto(el).innerHTML.trim().replace(/\s+/g, " ");
  });
  Array.prototype.forEach.call(comAtributo, function (el) {
    paresAtributo(el).forEach(function (p) { if (!(p[1] in EN)) EN[p[1]] = el.getAttribute(p[0]) || ""; });
  });

  function t(chave) {
    var v = lingua === "pt" ? PT[chave] : EN[chave];
    return v == null ? EN[chave] || "" : v;
  }
  function localeNumero() { return lingua === "pt" ? "pt-BR" : "en-US"; }

  function aplicarLingua(l) {
    lingua = l === "pt" ? "pt" : "en";
    document.documentElement.lang = lingua === "pt" ? "pt-BR" : "en";
    Array.prototype.forEach.call(comTexto, function (el) {
      alvoTexto(el).innerHTML = t(el.getAttribute("data-i18n"));
    });
    Array.prototype.forEach.call(comAtributo, function (el) {
      paresAtributo(el).forEach(function (p) { el.setAttribute(p[0], t(p[1])); });
    });
    var seletor = document.querySelector(".lingua");
    if (seletor) {
      seletor.setAttribute("data-ativa", lingua);
      Array.prototype.forEach.call(seletor.querySelectorAll("[data-lingua]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-lingua") === lingua ? "true" : "false");
      });
    }
    // Painel oficial e totem embutido abrem no mesmo idioma do site
    Array.prototype.forEach.call(document.querySelectorAll("[data-painel]"), function (a) {
      a.setAttribute("href", "../index.html?lang=" + lingua);
    });
    if (totem) {
      var src = "../index.html?vitrine&lang=" + lingua;
      if (totem.getAttribute("src") !== src) {
        totem.setAttribute("src", src);
        // O totem recarregado volta ao nível de exemplo (Perigo)
        Array.prototype.forEach.call(document.querySelectorAll(".simulador button"), function (x) {
          x.setAttribute("aria-pressed", x.getAttribute("data-nivel") === "3" ? "true" : "false");
        });
        nivelAtual = 3;
        pintarBrilho(3);
      }
    }
  }

  var linguaPedida = (location.search.match(/[?&]lang=(pt|en)\b/) || [])[1];
  try { linguaPedida = linguaPedida || localStorage.getItem("cosmos-lingua"); } catch (e) {}
  if (linguaPedida === "pt") aplicarLingua("pt");

  /* ---------- Totem embutido ---------- */

  var telaAtual = "resumo";
  function rotularTela() {
    var rotulo = document.getElementById("totem-tela");
    if (rotulo) rotulo.textContent = t("js.tela." + telaAtual) || t("js.tela." + telaAtual.split(":")[0]);
  }
  rotularTela();

  function falarComTotem(msg) {
    if (totem && totem.contentWindow) totem.contentWindow.postMessage(msg, "*");
  }

  function pintarBrilho(n) {
    if (aparelho) aparelho.style.setProperty("--brilho-totem", COR_NIVEL[n] || COR_NIVEL[3]);
  }

  window.addEventListener("message", function (e) {
    if (!totem || e.source !== totem.contentWindow || !e.data || e.data.totem !== "mostrando") return;
    telaAtual = e.data.id ? e.data.tipo + ":" + e.data.id : e.data.tipo;
    rotularTela();
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
    el.setAttribute("data-contado", "");
    if (menosMovimento) { el.textContent = alvo.toLocaleString(localeNumero()); return; }
    var t0 = performance.now();
    (function passo(agora) {
      var p = Math.min(1, Math.max(0, agora - t0) / 1600);
      el.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 4))).toLocaleString(localeNumero());
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

  /* ---------- Seletor de idioma ---------- */

  var titulosPartidos = !menosMovimento && "IntersectionObserver" in window;

  function trocarLingua(l) {
    if (l === lingua) return;
    try { localStorage.setItem("cosmos-lingua", l); } catch (e) {}
    var raizHtml = document.documentElement;
    function trocar() {
      aplicarLingua(l);
      // Os títulos e o manifesto foram quebrados em palavras: quebra de novo o texto traduzido
      if (titulosPartidos) Array.prototype.forEach.call(titulos, function (h) { partirPalavras(h, "palavra", true); });
      if (palavrasManifesto.length) {
        partirPalavras(manifesto, "m-palavra", false);
        palavrasManifesto = manifesto.querySelectorAll(".m-palavra");
        acenderManifesto();
      }
      Array.prototype.forEach.call(document.querySelectorAll(".conta[data-contado]"), function (el) {
        el.textContent = parseInt(el.getAttribute("data-alvo"), 10).toLocaleString(localeNumero());
      });
      rotularTela();
      raizHtml.classList.remove("trocando-lingua");
    }
    if (menosMovimento) { trocar(); return; }
    // Texto some, troca e volta: evita o "pulo" de layout no meio da leitura
    raizHtml.classList.add("trocando-lingua");
    setTimeout(trocar, 220);
  }

  Array.prototype.forEach.call(document.querySelectorAll(".lingua [data-lingua]"), function (b) {
    b.addEventListener("click", function () { trocarLingua(b.getAttribute("data-lingua")); });
  });

  /* ---------- Vídeo: arquivo próprio tocando na página; YouTube como reserva ---------- */

  var moldura = document.getElementById("video-moldura");
  var play = document.getElementById("video-play");
  var video = document.getElementById("video-cosmos");

  function trocarPorYoutube() {
    var id = moldura.getAttribute("data-youtube");
    // Sem origem http o YouTube recusa o player embutido: só resta abrir em outra aba
    if (!/^https?:$/.test(location.protocol)) {
      window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(id), "_blank", "noopener");
      moldura.classList.remove("tocando");
      return;
    }
    if (video) video.remove();
    var player = document.createElement("iframe");
    player.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0&playsinline=1";
    player.title = t("js.youtube");
    player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    player.referrerPolicy = "strict-origin-when-cross-origin";
    player.allowFullscreen = true;
    moldura.appendChild(player);
    moldura.classList.add("tocando");
  }

  if (moldura && play) {
    var querTocar = false;
    play.addEventListener("click", function () {
      if (!video) { trocarPorYoutube(); return; }
      moldura.classList.add("tocando");
      video.controls = true;
      querTocar = true;
      var tentativa = video.play();
      // AbortError só significa que o navegador trocou de formato no meio; não é falha
      if (tentativa && tentativa.catch) tentativa.catch(function (e) { if (e && e.name === "NotSupportedError") trocarPorYoutube(); });
    });
    if (video) {
      // Se o play foi abortado na troca WebM -> MP4, retoma quando o formato que funciona carregar
      video.addEventListener("canplay", function () {
        if (querTocar && video.paused) video.play().catch(function () {});
      });
      video.addEventListener("playing", function () { querTocar = false; });
      // Erro no último <source> = nenhum formato funcionou neste navegador
      var fontes = video.querySelectorAll("source");
      if (fontes.length) fontes[fontes.length - 1].addEventListener("error", trocarPorYoutube);
      video.addEventListener("ended", function () {
        video.controls = false;
        moldura.classList.remove("tocando");
        video.load();
      });
    }
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
        // Em cima da tela o totem se endireita: fica de frente para quem olha e o cursor repassado cai no ponto exato
        if (e.target === totem) { inclina.style.transform = ""; return; }
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

    iniciarCursor();
    repassarMouseDoTotem();
  }

  /* ---------- Cursor próprio: ponto + anel que segue com atraso, cresce sobre o que é clicável ---------- */

  function iniciarCursor() {
    var raiz = document.createElement("div");
    raiz.className = "cursor";
    raiz.setAttribute("aria-hidden", "true");
    raiz.innerHTML = '<span class="cursor-anel"><span class="cursor-rotulo"></span></span><span class="cursor-ponto"></span>';
    document.body.appendChild(raiz);
    document.documentElement.classList.add("cursor-ativo");

    var anel = raiz.querySelector(".cursor-anel");
    var ponto = raiz.querySelector(".cursor-ponto");
    var rotulo = raiz.querySelector(".cursor-rotulo");
    var mx = -100, my = -100, ax = -100, ay = -100;
    var visivel = false;

    function mostrar(sim) {
      if (sim === visivel) return;
      visivel = sim;
      raiz.classList.toggle("visivel", sim);
    }

    document.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      mx = e.clientX;
      my = e.clientY;
      ponto.style.transform = "translate(" + mx + "px," + my + "px)";
      if (!visivel) { ax = mx; ay = my; }
      mostrar(true);
    }, { passive: true });

    // Saída da janela ou entrada num iframe que não repassa o mouse (YouTube): o cursor nativo assume
    document.addEventListener("pointerout", function (e) {
      var para = e.relatedTarget;
      if (!para || (para.tagName === "IFRAME" && !para.hasAttribute("data-repassa"))) mostrar(false);
    });

    var SELETOR = "a, button, [data-cursor], .simulador button, .doc-capa";
    document.addEventListener("pointerover", function (e) {
      var alvo = e.target.closest ? e.target.closest(SELETOR) : null;
      if (alvo && alvo.closest(".tocando")) alvo = null;
      var texto = alvo ? alvo.getAttribute("data-cursor") || "" : "";
      raiz.classList.toggle("sobre", !!alvo && !texto);
      raiz.classList.toggle("com-rotulo", !!texto);
      if (texto) rotulo.textContent = texto;
    });

    document.addEventListener("pointerdown", function (e) {
      raiz.classList.add("apertado");
      // Respingo de gota onde clicou
      var gota = document.createElement("span");
      gota.className = "cursor-respingo";
      gota.style.left = e.clientX + "px";
      gota.style.top = e.clientY + "px";
      raiz.appendChild(gota);
      setTimeout(function () { gota.remove(); }, 700);
    });
    document.addEventListener("pointerup", function () { raiz.classList.remove("apertado"); });

    // A janela de documentos fica numa camada acima de tudo: o cursor vai junto
    var janela = document.getElementById("docs");
    if (janela) {
      new MutationObserver(function () {
        (janela.open ? janela : document.body).appendChild(raiz);
      }).observe(janela, { attributes: true, attributeFilter: ["open"] });
    }

    (function seguir() {
      ax += (mx - ax) * .18;
      ay += (my - ay) * .18;
      anel.style.transform = "translate(" + ax.toFixed(1) + "px," + ay.toFixed(1) + "px)";
      requestAnimationFrame(seguir);
    })();
  }

  // O totem é um quiosque (cursor: none) dentro de um iframe, que engole os eventos do mouse.
  // Como é da mesma origem, os movimentos e cliques de lá são repassados para a página:
  // o cursor próprio, a inclinação 3D e a malha continuam funcionando por cima dele.
  function repassarMouseDoTotem() {
    if (!totem) return;
    function ligarDocumento() {
      var doc;
      try { doc = totem.contentDocument; } catch (e) { return; }
      if (!doc || !doc.documentElement || doc.URL === "about:blank" || doc.__repassando) return;
      doc.__repassando = true;
      totem.setAttribute("data-repassa", "");
      var estilo = doc.createElement("style");
      estilo.textContent = "*, *::before, *::after { cursor: none !important; }";
      (doc.head || doc.documentElement).appendChild(estilo);

      function repassar(tipo, e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        var r = totem.getBoundingClientRect();
        var sx = totem.clientWidth ? r.width / totem.clientWidth : 1;
        var sy = totem.clientHeight ? r.height / totem.clientHeight : 1;
        totem.dispatchEvent(new PointerEvent(tipo, {
          bubbles: true, pointerType: "mouse", button: e.button, buttons: e.buttons,
          clientX: r.left + e.clientX * sx, clientY: r.top + e.clientY * sy
        }));
      }
      doc.addEventListener("pointermove", function (e) { repassar("pointermove", e); }, { passive: true });
      doc.addEventListener("pointerdown", function (e) { repassar("pointerdown", e); });
      doc.addEventListener("pointerup", function (e) { repassar("pointerup", e); });
      // Entrou no totem vindo de fora: o cursor deixa o modo "sobre botão"
      doc.addEventListener("pointerover", function (e) { if (!e.relatedTarget) repassar("pointerover", e); });
    }
    totem.addEventListener("load", ligarDocumento);
    ligarDocumento();
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

  /* ---------- Malhas interativas: a grade de 500 m vira um tecido que reage ao cursor ---------- */

  var TEMAS_MALHA = {
    escura: { base: "rgba(159, 176, 200, .09)", perto: [0, 170, 161], centro: [255, 154, 0], ponto: "255, 255, 255" },
    clara: { base: "rgba(17, 24, 39, .07)", perto: [0, 118, 191], centro: [255, 154, 0], ponto: "17, 24, 39" }
  };

  function misturar(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }

  function criarMalha(tela, area) {
    var tema = TEMAS_MALHA[tela.getAttribute("data-malha")] || TEMAS_MALHA.escura;
    var ctx = tela.getContext("2d");
    var PASSO = 46;
    var RAIO = 190;
    var colunas = 0, linhas = 0, larg = 0, alt = 0;
    var pts = [];
    var mouse = { x: -9999, y: -9999, vx: 0, vy: 0, ativo: false, ux: 0, uy: 0 };
    var ondas = [];
    var rodando = false;
    var visivel = false;

    function montar() {
      var r = Math.min(window.devicePixelRatio || 1, 2);
      larg = tela.clientWidth;
      alt = tela.clientHeight;
      tela.width = larg * r;
      tela.height = alt * r;
      ctx.setTransform(r, 0, 0, r, 0, 0);
      colunas = Math.ceil(larg / PASSO) + 2;
      linhas = Math.ceil(alt / PASSO) + 2;
      pts = [];
      var desloc = (larg - (colunas - 1) * PASSO) / 2;
      for (var j = 0; j < linhas; j++) {
        for (var i = 0; i < colunas; i++) {
          pts.push({ rx: desloc + i * PASSO, ry: -PASSO + j * PASSO, ox: 0, oy: 0, vx: 0, vy: 0, brilho: 0 });
        }
      }
      if (menosMovimento) desenhar(0);
    }

    function posicaoRelativa(e) {
      var r = tela.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    area.addEventListener("pointermove", function (e) {
      var p = posicaoRelativa(e);
      if (mouse.ativo) { mouse.vx = p.x - mouse.x; mouse.vy = p.y - mouse.y; }
      mouse.x = p.x;
      mouse.y = p.y;
      if (!mouse.ativo) { mouse.ux = p.x; mouse.uy = p.y; }
      mouse.ativo = true;
    }, { passive: true });
    area.addEventListener("pointerleave", function () { mouse.ativo = false; });
    area.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("iframe, video")) return;
      var p = posicaoRelativa(e);
      ondas.push({ x: p.x, y: p.y, t0: performance.now() });
      if (ondas.length > 4) ondas.shift();
    });

    function passo(agora) {
      try {
        avancar(agora);
        desenhar(agora);
      } catch (erro) {
        // Um quadro com problema não pode parar a animação inteira
        if (window.console) console.warn("malha:", erro);
      }
      if (rodando) requestAnimationFrame(passo);
    }

    function avancar(agora) {
      // Mouse "suavizado" para o brilho não pular
      mouse.ux += (mouse.x - mouse.ux) * .25;
      mouse.uy += (mouse.y - mouse.uy) * .25;
      mouse.vx *= .86;
      mouse.vy *= .86;
      ondas = ondas.filter(function (o) { return agora - o.t0 < 2200; });

      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        // Terreno "respirando" mesmo sem cursor
        var tx = Math.sin(p.ry * .011 + agora * .0007) * 3;
        var ty = Math.sin(p.rx * .009 + agora * .0011) * 4 + Math.cos(p.ry * .013 + agora * .0008) * 3;
        var alvoBrilho = 0;

        if (mouse.ativo) {
          var dx = p.rx - mouse.ux, dy = p.ry - mouse.uy;
          var d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < RAIO) {
            var f = 1 - d / RAIO;
            var f2 = f * f;
            // Empurra para fora e arrasta junto com o movimento do mouse (efeito tecido)
            tx += dx / d * f2 * 38 + mouse.vx * f2 * 1.6;
            ty += dy / d * f2 * 38 + mouse.vy * f2 * 1.6;
            alvoBrilho = f;
          }
        }

        // Onda de radar do clique
        for (var w = 0; w < ondas.length; w++) {
          var o = ondas[w];
          var decorrido = Math.max(0, agora - o.t0);
          var raioOnda = decorrido * .55;
          var ex = p.rx - o.x, ey = p.ry - o.y;
          var de = Math.sqrt(ex * ex + ey * ey) || 1;
          var faixa = 1 - Math.abs(de - raioOnda) / 60;
          if (faixa > 0) {
            var forca = faixa * (1 - decorrido / 2200) * 2.2;
            p.vx += ex / de * forca;
            p.vy += ey / de * forca;
            alvoBrilho = Math.max(alvoBrilho, faixa * .8);
          }
        }

        // Mola com amortecimento: chega no alvo e balança um pouco
        p.vx = (p.vx + (tx - p.ox) * .09) * .8;
        p.vy = (p.vy + (ty - p.oy) * .09) * .8;
        p.ox += p.vx;
        p.oy += p.vy;
        p.brilho += (alvoBrilho - p.brilho) * .12;
      }
    }

    function ponto(i, j) { return pts[j * colunas + i]; }

    function desenhar(agora) {
      ctx.clearRect(0, 0, larg, alt);

      // Brilho difuso sob o cursor
      if (mouse.ativo && !menosMovimento) {
        var g = ctx.createRadialGradient(mouse.ux, mouse.uy, 0, mouse.ux, mouse.uy, RAIO * 1.4);
        g.addColorStop(0, "rgba(" + tema.centro.join(",") + ", .10)");
        g.addColorStop(1, "rgba(" + tema.centro.join(",") + ", 0)");
        ctx.fillStyle = g;
        ctx.fillRect(mouse.ux - RAIO * 1.4, mouse.uy - RAIO * 1.4, RAIO * 2.8, RAIO * 2.8);
      }

      // Passada 1: a malha toda, fraca, num único traço
      ctx.lineWidth = 1;
      ctx.strokeStyle = tema.base;
      ctx.beginPath();
      var i, j, a, b;
      for (j = 0; j < linhas; j++) {
        for (i = 0; i < colunas; i++) {
          a = ponto(i, j);
          if (i === 0) ctx.moveTo(a.rx + a.ox, a.ry + a.oy); else ctx.lineTo(a.rx + a.ox, a.ry + a.oy);
        }
      }
      for (i = 0; i < colunas; i++) {
        for (j = 0; j < linhas; j++) {
          a = ponto(i, j);
          if (j === 0) ctx.moveTo(a.rx + a.ox, a.ry + a.oy); else ctx.lineTo(a.rx + a.ox, a.ry + a.oy);
        }
      }
      ctx.stroke();

      // Passada 2: só os trechos acesos (perto do cursor ou na onda), coloridos
      ctx.lineWidth = 1.4;
      for (j = 0; j < linhas; j++) {
        for (i = 0; i < colunas; i++) {
          a = ponto(i, j);
          if (a.brilho < .03) continue;
          var vizinhos = [i + 1 < colunas ? ponto(i + 1, j) : null, j + 1 < linhas ? ponto(i, j + 1) : null];
          for (var v = 0; v < 2; v++) {
            b = vizinhos[v];
            if (!b) continue;
            var br = (a.brilho + b.brilho) / 2;
            if (br < .03) continue;
            var cor = misturar(tema.perto, tema.centro, Math.min(1, br * 1.3));
            ctx.strokeStyle = "rgba(" + cor.join(",") + "," + (br * .85).toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(a.rx + a.ox, a.ry + a.oy);
            ctx.lineTo(b.rx + b.ox, b.ry + b.oy);
            ctx.stroke();
          }
          // Nós da grade acendem como pontos de medição
          if (a.brilho > .2) {
            ctx.fillStyle = "rgba(" + tema.ponto + "," + (a.brilho * .9).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(a.rx + a.ox, a.ry + a.oy, 1 + a.brilho * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Anéis das ondas de radar
      for (var w = 0; w < ondas.length; w++) {
        var o = ondas[w];
        var decorrido = Math.max(0, agora - o.t0);
        var idade = decorrido / 2200;
        ctx.strokeStyle = "rgba(" + tema.perto.join(",") + "," + (.5 * (1 - idade)).toFixed(3) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(o.x, o.y, decorrido * .55, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function ligar(sim) {
      if (menosMovimento || sim === rodando) return;
      rodando = sim;
      if (sim) requestAnimationFrame(passo);
    }

    montar();
    if ("ResizeObserver" in window) new ResizeObserver(montar).observe(tela);
    else window.addEventListener("resize", montar);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (itens) {
        visivel = itens[0].isIntersecting;
        ligar(visivel);
      }).observe(area);
    } else {
      ligar(true);
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll("canvas.malha"), function (tela) {
    criarMalha(tela, tela.closest(".palco, section") || tela.parentNode);
  });

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
  // Sem checar document.hidden: o navegador já pausa requestAnimationFrame em abas escondidas
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (itens) {
      palcoVisivel = itens[0].isIntersecting;
      ligar(palcoVisivel);
    }).observe(palco);
  } else {
    ligar(true);
  }
})();
