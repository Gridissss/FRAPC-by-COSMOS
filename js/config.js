// Configuração da API que alimenta o totem. Todas as chamadas são GET e devolvem JSON.
// Com "base" vazio o totem usa os dados de exemplo de js/dados.js.
window.API_CONFIG = {
  // Endereço da API (python api.py). O servidor precisa liberar CORS para o totem.
  // Aberto pela própria API (http://localhost:8000/app/) usa o mesmo endereço automaticamente.
  // Para testar com os arquivos de api-exemplo/, abra index.html?api=api-exemplo&sufixo=.json&tudo=
  base: /^https?:$/.test(location.protocol) && location.pathname.indexOf("/app/") === 0 ? location.origin : "http://localhost:8000",

  // Texto acrescentado ao fim de cada rota (".json" para arquivos estáticos).
  sufixo: "",

  // Se preenchido, busca tudo numa chamada só, no formato de js/dados.js (é o que a api.py oferece em /totem).
  // Se vazio, usa as rotas abaixo.
  tudo: "/totem",

  // Onde o totem está instalado. Cada totem da cidade usa a sua coordenada.
  // Também dá para passar na URL: index.html?lat=-3.1085&lng=-60.0455&local=Praça%20X
  // No painel de teste dá para trocar clicando no mapa (fica salvo neste navegador).
  local: { lat: -3.1336, lng: -60.0233, nome: "Praça da Matriz" },

  // Rotas usadas quando "tudo" estiver vazio (ex.: arquivos de api-exemplo/)
  rotas: {
    cidade: "/cidade",             // { cidade, atualizadoEm, voce: {nome, lat, lng}, telefones: [{nome, numero, icone, usos}] }
    deslizamento: "/deslizamento", // { nivel, indicadores: [{icone, valor, dec, unidade, rotulo}], pontoSeguro: {nome, tipo, lat, lng, minutos} }
    alagamento: "/alagamento",     // mesmo formato de deslizamento
    bairros: "/bairros",           // [{ id, nome, lat, lng, deslizamento, alagamento, atual, geometria }]  (níveis de 1 a 4)
    horizonte: "/horizonte",       // [{ rotulo, horas, chuva, deslizamento: {nivel, prob}, alagamento: {nivel, prob} }]
    previsao: "/previsao"          // [{ chuva, deslizamento, alagamento }]  (hoje + 4 dias)
  },

  // Lista de bairros para o seletor de localização do painel de teste
  rotaBairros: "/totem/bairros",

  // Cabeçalhos extras, por exemplo { Authorization: "Bearer ..." }
  cabecalhos: {},

  intervaloSeg: 60,   // de quanto em quanto tempo busca dados novos
  intervaloAoVivoSeg: 15, // no modo tempo real (a chuva é consultada de novo no máximo 1x por minuto)
  // Modo tempo real ao abrir. No painel de teste vira o botão "Tempo real" (a escolha fica salva no navegador).
  tempoReal: true,
  limiteMs: 15000,    // tempo máximo de espera por chamada (a 1ª consulta de chuva pode demorar)
  exemploSeFalhar: true // false = se a API não responder na abertura, mostra "sem conexão" em vez dos dados de exemplo
};
