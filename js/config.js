// Configuração da API que alimenta o totem. Todas as chamadas são GET e devolvem JSON.
// Com "base" vazio o totem usa os dados de exemplo de js/dados.js.
window.API_CONFIG = {
  // Endereço da API, por exemplo "https://api.suacidade.gov.br/v1". O servidor precisa liberar CORS para o totem.
  // Para testar com os arquivos de api-exemplo/, abra index.html?api=api-exemplo&sufixo=.json
  base: "",

  // Texto acrescentado ao fim de cada rota (".json" para arquivos estáticos).
  sufixo: "",

  // Se preenchido (ex.: "/totem"), busca tudo numa chamada só, no formato de js/dados.js. Se vazio, usa as rotas abaixo.
  tudo: "",

  rotas: {
    cidade: "/cidade",             // { cidade, atualizadoEm, voce: {nome, lat, lng}, telefones: [{nome, numero, icone, usos}] }
    deslizamento: "/deslizamento", // { nivel, indicadores: [{icone, valor, dec, unidade, rotulo}], pontoSeguro: {nome, lat, lng, minutos} }
    alagamento: "/alagamento",     // mesmo formato de deslizamento
    bairros: "/bairros",           // [{ id, nome, lat, lng, deslizamento, alagamento }]  (níveis de 1 a 4)
    horizonte: "/horizonte",       // [{ rotulo, horas, chuva, deslizamento: {nivel, prob}, alagamento: {nivel, prob} }]
    previsao: "/previsao"          // [{ chuva, deslizamento, alagamento }]  (hoje + 4 dias)
  },

  // Cabeçalhos extras, por exemplo { Authorization: "Bearer ..." }
  cabecalhos: {},

  intervaloSeg: 60,   // de quanto em quanto tempo busca dados novos
  limiteMs: 5000,     // tempo máximo de espera por chamada
  exemploSeFalhar: true // false = se a API não responder na abertura, mostra "sem conexão" em vez dos dados de exemplo
};
