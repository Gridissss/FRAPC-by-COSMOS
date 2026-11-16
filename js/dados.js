// Dados de exemplo. Substituir pelas saídas do modelo de machine learning mantendo esta estrutura.
// Níveis: 1 = tranquilo (sem risco), 2 = atenção (pode acontecer), 3 = perigo (vai acontecer, muito perto), 4 = perigo extremo (está acontecendo)
// As coordenadas (lat/lng) dos bairros de Manaus são aproximadas e só servem de exemplo: confira e ajuste.
window.DADOS = {
  cidade: "Manaus",
  atualizadoEm: "14/11/2026 · 08:00",

  // Onde o totem está instalado
  voce: { nome: "Praça do Santo Antônio", bairro: "Santo Antônio", lat: -3.1085, lng: -60.0455 },

  telefones: [
    { nome: "Defesa Civil", numero: "199", icone: "sirene", usos: ["morro", "casa"] },
    { nome: "Bombeiros", numero: "193", icone: "fogo", usos: ["fogo", "correr"] },
    { nome: "SAMU", numero: "192", icone: "cruz", usos: ["cruz", "coracao"] }
  ],

  // pontoSeguro.tipo: hospital, bombeiros, defesa_civil, abrigo ou bairro (bairro vizinho mais seguro)
  deslizamento: {
    nivel: 3,
    indicadores: [
      { icone: "chuva", valor: 95, unidade: " mm", rotulo: "chuva em 3 dias" },
      { icone: "morro", valor: 2, rotulo: "bairros em perigo" }
    ],
    pontoSeguro: { nome: "Ginásio Municipal", tipo: "abrigo", lat: -3.1015, lng: -60.0435, minutos: 12 }
  },

  alagamento: {
    nivel: 2,
    indicadores: [
      { icone: "gota", valor: 18.5, dec: 1, unidade: " mm", rotulo: "chuva em 6 horas" },
      { icone: "casa", valor: 4, rotulo: "bairros em atenção" }
    ],
    pontoSeguro: { nome: "Escola da Colina", tipo: "abrigo", lat: -3.1130, lng: -60.0400, minutos: 9 }
  },

  // Nível de cada bairro por tipo de risco. atual = bairro onde o totem está.
  // A API também manda "geometria" (polígono GeoJSON) para desenhar o contorno do bairro.
  bairros: [
    { id: "compensa", nome: "Compensa", lat: -3.1055, lng: -60.0585, deslizamento: 3, alagamento: 2 },
    { id: "santoantonio", nome: "Santo Antônio", lat: -3.1125, lng: -60.0505, deslizamento: 2, alagamento: 2, atual: true },
    { id: "saojorge", nome: "São Jorge", lat: -3.0960, lng: -60.0525, deslizamento: 3, alagamento: 1 },
    { id: "gloria", nome: "Glória", lat: -3.1100, lng: -60.0640, deslizamento: 2, alagamento: 1 },
    { id: "saoraimundo", nome: "São Raimundo", lat: -3.1180, lng: -60.0465, deslizamento: 1, alagamento: 2 },
    { id: "liriodovale", nome: "Lírio do Vale", lat: -3.0890, lng: -60.0625, deslizamento: 1, alagamento: 1 },
    { id: "vilaprata", nome: "Vila da Prata", lat: -3.1230, lng: -60.0580, deslizamento: 1, alagamento: 2 },
    { id: "santoagostinho", nome: "Santo Agostinho", lat: -3.1000, lng: -60.0640, deslizamento: 2, alagamento: 1 }
  ],

  // Próximas horas e amanhã. horas = quanto falta; chuva em mm/h (amanhã: mm no dia);
  // prob = chance (%) de acontecer. O primeiro item (agora) deve bater com o nível atual.
  horizonte: [
    { rotulo: "Agora", horas: 0, chuva: 18, deslizamento: { nivel: 3, prob: 100 }, alagamento: { nivel: 2, prob: 100 } },
    { rotulo: "1 h", horas: 1, chuva: 24, deslizamento: { nivel: 3, prob: 95 }, alagamento: { nivel: 2, prob: 90 } },
    { rotulo: "3 h", horas: 3, chuva: 31, deslizamento: { nivel: 4, prob: 80 }, alagamento: { nivel: 3, prob: 75 } },
    { rotulo: "5 h", horas: 5, chuva: 36, deslizamento: { nivel: 4, prob: 70 }, alagamento: { nivel: 3, prob: 65 } },
    { rotulo: "Amanhã", horas: 24, chuva: 72, deslizamento: { nivel: 4, prob: 55 }, alagamento: { nivel: 3, prob: 50 } }
  ],

  // Hoje + 4 dias. chuva em mm. O primeiro item deve bater com o nível atual.
  previsao: [
    { chuva: 48, deslizamento: 3, alagamento: 2 },
    { chuva: 72, deslizamento: 4, alagamento: 3 },
    { chuva: 30, deslizamento: 3, alagamento: 3 },
    { chuva: 9, deslizamento: 2, alagamento: 2 },
    { chuva: 2, deslizamento: 1, alagamento: 1 }
  ]
};
