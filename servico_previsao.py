"""
================================================================================
PROJETO: PREVISÃO DE ALAGAMENTOS E DESLIZAMENTOS - MANAUS (AM)
MÓDULO: SERVIÇO DE PREVISÃO E CONECTOR METEOMATICS API
================================================================================
Objetivo:
    1. Catálogo estruturado de bairros urbanos de Manaus (AM) com coordenadas.
    2. Conector com a API oficial da Meteomatics (tempo real com Basic Auth)
       e fallback transparente de contingência.
    3. Mapeamento geoespacial bairro -> célula da grade SIRGAS 2000 / UTM 20S.
    4. Carga do modelo LightGBM treinado e execução de inferência em tempo real.
    5. Diagnóstico de risco: probabilidade, nível de alerta, tipo de desastre e
       recomendações operacionais para a Defesa Civil.
================================================================================
"""

import os
import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
import unicodedata

import numpy as np
import pandas as pd
import geopandas as gpd
from pyproj import Transformer
from scipy.spatial import cKDTree
import requests
import joblib
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("servico_previsao")

load_dotenv()

# Caminhos dos artefatos (relativos ao projeto, para a API funcionar de qualquer diretório)
DIR_PROJETO = Path(__file__).resolve().parent
DIR_PROCESSADOS = DIR_PROJETO / "dados_processados"
CAMINHO_GRADE = DIR_PROCESSADOS / "grade_relevo.parquet"
CAMINHO_SAR = DIR_PROCESSADOS / "sar_historico.parquet"
CAMINHO_MODELO = DIR_PROJETO / "modelos" / "modelo_alagamento_deslizamento_lgb.joblib"

# ------------------------------------------------------------------------------
# CATÁLOGO DE BAIRROS DE MANAUS COM VULNERABILIDADES HISTÓRICAS CONHECIDAS
# ------------------------------------------------------------------------------
CATALOGO_BAIRROS = {
    "educandos": {
        "nome": "Educandos",
        "zona": "Sul",
        "lat": -3.1417,
        "lon": -60.0125,
        "historico": "Área crítica de baixio na bacia do Igarapé do Educandos, suscetível a alagamentos severos por remanso fluvial."
    },
    "centro": {
        "nome": "Centro",
        "zona": "Sul",
        "lat": -3.1319,
        "lon": -60.0242,
        "historico": "Região central de baixa cota próxima ao Rio Negro, vulnerável a refluxo de drenagem pluvial e bueiros."
    },
    "sao raimundo": {
        "nome": "São Raimundo",
        "zona": "Oeste",
        "lat": -3.1231,
        "lon": -60.0381,
        "historico": "Várzea e calha do Igarapé de São Raimundo, sujeito a enchentes bruscas e enxurradas urbanas."
    },
    "gloria": {
        "nome": "Glória",
        "zona": "Oeste",
        "lat": -3.1205,
        "lon": -60.0345,
        "historico": "Margens de igarapé com histórico de inundações em períodos de chuvas convectivas intensas."
    },
    "aparecida": {
        "nome": "Aparecida",
        "zona": "Sul",
        "lat": -3.1280,
        "lon": -60.0300,
        "historico": "Área de transição próxima à orla, com pontos críticos de retenção de água superficial."
    },
    "presidente vargas": {
        "nome": "Presidente Vargas (Matinha)",
        "zona": "Sul",
        "lat": -3.1180,
        "lon": -60.0280,
        "historico": "Área de taludes e margens de igarapé com ocupações em encostas propensas a deslizamento."
    },
    "jorge teixeira": {
        "nome": "Jorge Teixeira",
        "zona": "Leste",
        "lat": -3.0450,
        "lon": -59.9320,
        "historico": "Relevo dissecado de alta declividade com ocupações em ravinas, histórico de soterramentos e escorregamentos."
    },
    "cidade de deus": {
        "nome": "Cidade de Deus",
        "zona": "Norte",
        "lat": -3.0250,
        "lon": -59.9550,
        "historico": "Encostas íngremes e cabeceiras de drenagem com risco geotécnico elevado após chuvas prolongadas."
    },
    "cidade nova": {
        "nome": "Cidade Nova",
        "zona": "Norte",
        "lat": -3.0375,
        "lon": -59.9750,
        "historico": "Platôs com igarapés interceptados, gerando pontos isolados de alagamento em avenidas principais."
    },
    "nova cidade": {
        "nome": "Nova Cidade",
        "zona": "Norte",
        "lat": -3.0050,
        "lon": -59.9950,
        "historico": "Áreas de declive pronunciado nos fundos de vale com erosões e deslizamentos."
    },
    "adrianopolis": {
        "nome": "Adrianópolis",
        "zona": "Centro-Sul",
        "lat": -3.1042,
        "lon": -60.0094,
        "historico": "Área urbanizada sobre platô estrutural; risco focado na calha de drenagem do Mindu."
    },
    "flores": {
        "nome": "Flores",
        "zona": "Centro-Sul",
        "lat": -3.0722,
        "lon": -60.0247,
        "historico": "Bacia média do Igarapé do Mindu com recorrência de transbordamento sob precipitação > 40mm/h."
    },
    "aleixo": {
        "nome": "Aleixo",
        "zona": "Centro-Sul",
        "lat": -3.0975,
        "lon": -59.9886,
        "historico": "Terreno de colinas com pontos de estrangulamento de drenagem pluvial."
    },
    "coroado": {
        "nome": "Coroado",
        "zona": "Leste",
        "lat": -3.0950,
        "lon": -59.9720,
        "historico": "Encostas desmatadas no entorno do campus universitário, suscetíveis a escorregamentos pontuais."
    },
    "mauazinho": {
        "nome": "Mauazinho",
        "zona": "Leste",
        "lat": -3.1450,
        "lon": -59.9450,
        "historico": "Taludes próximos à calha do Rio Negro e áreas portuárias com risco geotécnico em aterros."
    },
    "compensa": {
        "nome": "Compensa",
        "zona": "Oeste",
        "lat": -3.1097,
        "lon": -60.0558,
        "historico": "Ocupação densa em baixio e encostas no Igarapé do Franco, risco duplo de alagamento e erosão de talude."
    },
    "alvorada": {
        "nome": "Alvorada",
        "zona": "Centro-Oeste",
        "lat": -3.0886,
        "lon": -60.0514,
        "historico": "Topografia mista com canalizações pluviais que transbordam sob chuvas intensas de curto prazo."
    },
    "taruma": {
        "nome": "Tarumã",
        "zona": "Oeste",
        "lat": -2.9980,
        "lon": -60.0820,
        "historico": "Bacia hidrográfica ampla com áreas ribeirinhas vulneráveis a inundações nas marés fluviais."
    },
    "ponta negra": {
        "nome": "Ponta Negra",
        "zona": "Oeste",
        "lat": -3.0650,
        "lon": -60.1030,
        "historico": "Orla alta sobre platô arenoso, baixo risco de alagamento, restrito a erosão superficial em obras."
    }
}


def normalizar_texto(texto: str) -> str:
    """Remove acentos, espaços extras e converte para minúsculas para matching resiliente."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", texto)
    sem_acento = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return sem_acento.strip().lower()


# ------------------------------------------------------------------------------
# SÉRIE HORÁRIA DE CHUVA (72h PASSADAS + PREVISÃO) PARA O TOTEM
# ------------------------------------------------------------------------------
# Manaus não tem horário de verão: UTC-4 o ano todo
FUSO_MANAUS = timezone(timedelta(hours=-4))
_CACHE_SERIES = {}
CACHE_SERIE_SEG = 600
MIN_FORCAR_SEG = 60


def _serie(fonte: str, horas: list, mm, agora: datetime) -> dict:
    """Padroniza a série: horas locais (início da hora), mm por hora e índice da hora atual."""
    hora_atual = agora.replace(minute=0, second=0, microsecond=0, tzinfo=None)
    idx = max((i for i, h in enumerate(horas) if h <= hora_atual), default=0)
    return {"fonte": fonte, "horas": horas, "mm": np.clip(np.asarray(mm, dtype=float), 0, None), "idx_agora": idx}


def consultar_serie_meteomatics(lat: float, lon: float, dias_previsao: int = 5):
    user = os.getenv("METEOMATICS_USERNAME", "").strip()
    pwd = os.getenv("METEOMATICS_PASSWORD", "").strip()
    if not user or not pwd or "seu_usuario" in user.lower():
        return None
    agora = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    inicio = (agora - timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ")
    fim = (agora + timedelta(days=dias_previsao + 1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    url = f"https://api.meteomatics.com/{inicio}--{fim}:PT1H/precip_1h:mm/{lat},{lon}/json"
    try:
        resp = requests.get(url, auth=(user, pwd), timeout=8)
        if resp.status_code != 200:
            logger.warning(f"Meteomatics (série) retornou HTTP {resp.status_code}")
            return None
        datas = resp.json()["data"][0]["coordinates"][0]["dates"]
        horas = [
            datetime.fromisoformat(d["date"].replace("Z", "+00:00")).astimezone(FUSO_MANAUS).replace(tzinfo=None)
            for d in datas
        ]
        return _serie("Meteomatics Weather API (Tempo Real)", horas, [d["value"] for d in datas],
                      datetime.now(FUSO_MANAUS))
    except Exception as e:
        logger.warning(f"Falha na série Meteomatics: {e}")
        return None


def consultar_serie_open_meteo(lat: float, lon: float, dias_previsao: int = 5):
    url = (
        "https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&hourly=precipitation&past_days=3"
        f"&forecast_days={dias_previsao + 1}&timezone=America%2FManaus"
    )
    try:
        r = requests.get(url, timeout=6)
        if r.status_code != 200:
            return None
        hourly = r.json().get("hourly", {})
        horas = [datetime.fromisoformat(t) for t in hourly.get("time", [])]
        mm = [v if v is not None else 0.0 for v in hourly.get("precipitation", [])]
        if not horas:
            return None
        return _serie("Open-Meteo API (Tempo Real Aberto / Fallback)", horas, mm, datetime.now(FUSO_MANAUS))
    except Exception as e:
        logger.warning(f"Falha na série Open-Meteo: {e}")
        return None


def serie_chuva_estimada(dias_previsao: int = 5) -> dict:
    """Série sintética determinística com pancadas de fim de tarde (convecção tropical de Manaus)."""
    agora = datetime.now(FUSO_MANAUS).replace(tzinfo=None)
    inicio = (agora - timedelta(days=3)).replace(hour=0, minute=0, second=0, microsecond=0)
    horas = [inicio + timedelta(hours=k) for k in range(24 * (4 + dias_previsao))]
    mm = []
    for h in horas:
        intensidade = 1.0 + 0.6 * np.sin(h.toordinal() * 1.7)
        mm.append(max(0.0, intensidade * 6.0 * np.exp(-((h.hour - 16) ** 2) / 4.0)))
    return _serie("Telemetria Estimada (Manaus - Convecção Tropical)", horas, mm, datetime.now(FUSO_MANAUS))


def obter_serie_chuva(lat: float, lon: float, forcar: bool = False) -> dict:
    """
    Série horária de chuva com cache por região (~1 km) para não estourar as APIs.
    forcar=True (modo tempo real do totem) ignora o cache, mas no máximo uma vez por minuto por região.
    """
    chave = (round(lat, 2), round(lon, 2))
    agora = datetime.now().timestamp()
    em_cache = _CACHE_SERIES.get(chave)
    validade = MIN_FORCAR_SEG if forcar else CACHE_SERIE_SEG
    if em_cache and agora - em_cache[0] < validade:
        consultada, serie = em_cache
    else:
        serie = consultar_serie_meteomatics(lat, lon) or consultar_serie_open_meteo(lat, lon) or serie_chuva_estimada()
        consultada = agora
        _CACHE_SERIES[chave] = (agora, serie)
    # Recalcula a hora atual: a série pode estar em cache desde a hora anterior
    resultado = _serie(serie["fonte"], serie["horas"], serie["mm"], datetime.now(FUSO_MANAUS))
    resultado["consultada_em"] = datetime.fromtimestamp(consultada, FUSO_MANAUS)
    return resultado


class ServicoPrevisaoRisco:
    """
    Motor central de inteligência geoespacial e predição de desastres naturais em Manaus.
    """

    def __init__(self):
        logger.info("Inicializando Motor de Previsão Geoespacial...")
        self.transformer_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:31980", always_xy=True)
        self._carregar_artefatos()

    def _carregar_artefatos(self):
        """Carrega modelo treinado, grade de relevo e dados SAR."""
        if not CAMINHO_MODELO.exists():
            raise FileNotFoundError(f"Modelo não encontrado em '{CAMINHO_MODELO}'. Treine o modelo primeiro.")
        
        logger.info(f"Carregando pacote do modelo LightGBM: {CAMINHO_MODELO}")
        pacote = joblib.load(CAMINHO_MODELO)
        self.modelo = pacote["modelo"]
        self.features_esperadas = pacote["features"]
        self.limiar_otimizado = pacote.get("limiar_otimizado", 0.333)

        if not CAMINHO_GRADE.exists():
            raise FileNotFoundError(f"Grade de relevo não encontrada em '{CAMINHO_GRADE}'.")
        
        logger.info(f"Carregando grade espacial de referência: {CAMINHO_GRADE}")
        self.gdf_grade = gpd.read_parquet(CAMINHO_GRADE)
        
        # Constrói árvore KDTree para busca espacial ultrarrápida do centroide mais próximo
        coords_utm = np.column_stack([self.gdf_grade["centroid_x"], self.gdf_grade["centroid_y"]])
        self.tree_espacial = cKDTree(coords_utm)

        # Carrega dados SAR históricos para recuperar baseline de retroespalhamento
        if CAMINHO_SAR.exists():
            logger.info(f"Carregando baseline Sentinel-1 SAR: {CAMINHO_SAR}")
            self.df_sar = pd.read_parquet(CAMINHO_SAR)
            # Agrupa por célula para obter os valores SAR mais recentes
            self.sar_recente = self.df_sar.sort_values(by="timestamp").groupby("cell_id").last().reset_index()
        else:
            logger.warning("SAR histórico não encontrado. Usando médias globais de micro-ondas.")
            self.sar_recente = pd.DataFrame()

    def identificar_bairro(self, nome_bairro: str) -> dict:
        """Localiza o bairro no catálogo ou busca por similaridade."""
        chave = normalizar_texto(nome_bairro)
        
        # 1. Busca exata
        if chave in CATALOGO_BAIRROS:
            return CATALOGO_BAIRROS[chave]
            
        # 2. Busca parcial (contém substring)
        for k, v in CATALOGO_BAIRROS.items():
            if chave in k or k in chave:
                return v

        # Caso não encontre, gera erro com opções válidas
        nomes_disponiveis = [v["nome"] for v in CATALOGO_BAIRROS.values()]
        raise ValueError(
            f"Bairro '{nome_bairro}' não encontrado no catálogo urbano de Manaus. "
            f"Bairros cadastrados: {', '.join(sorted(nomes_disponiveis))}"
        )

    def obter_celula_mais_proxima(self, lat: float, lon: float) -> dict:
        """
        Converte coordenada WGS84 para UTM 20S e localiza a célula correspondente na grade 500m.
        """
        utm_x, utm_y = self.transformer_to_utm.transform(lon, lat)
        distancia, idx = self.tree_espacial.query([utm_x, utm_y])
        
        celula = self.gdf_grade.iloc[idx].to_dict()
        celula["distancia_ao_centroide_m"] = round(float(distancia), 1)
        return celula

    def obter_sar_celula(self, cell_id: str) -> dict:
        """Recupera as features de radar Sentinel-1 mais recentes para a célula."""
        if not self.sar_recente.empty:
            sub = self.sar_recente[self.sar_recente["cell_id"] == cell_id]
            if not sub.empty:
                r = sub.iloc[0]
                return {
                    "sar_vv_mean_db": float(r["sar_vv_mean_db"]),
                    "sar_vv_std_db": float(r["sar_vv_std_db"]),
                    "sar_vh_mean_db": float(r["sar_vh_mean_db"]),
                    "sar_vh_std_db": float(r["sar_vh_std_db"]),
                    "sar_diferenca_vv_vh": float(r["sar_diferenca_vv_vh"])
                }
        # Baseline seguro caso não haja registro na célula
        return {
            "sar_vv_mean_db": -10.8,
            "sar_vv_std_db": 2.2,
            "sar_vh_mean_db": -16.5,
            "sar_vh_std_db": 2.0,
            "sar_diferenca_vv_vh": 5.7
        }

    def consultar_meteomatics_tempo_real(self, lat: float, lon: float) -> dict:
        """
        Chuva em tempo real no formato das features do modelo.

        Usa a série horária de obter_serie_chuva() (Meteomatics com Basic Auth -> Open-Meteo ->
        série estimada) e calcula os acumulados exatamente como no treino (03_coleta_chuva.py):
        rolling("Nh", closed="both") em dados horários soma N+1 leituras terminando na hora atual,
        e chuva_mm é só a hora atual.
        """
        serie = obter_serie_chuva(lat, lon)
        mm, i = serie["mm"], serie["idx_agora"]

        def acum(n_horas):
            return round(float(mm[max(0, i - n_horas):i + 1].sum()), 2)

        return {
            "fonte": serie["fonte"],
            "chuva_mm": round(float(mm[i]), 2),
            "chuva_acum_1h": acum(1),
            "chuva_acum_6h": acum(6),
            "chuva_acum_24h": acum(24),
            "chuva_acum_72h": acum(72),
            "timestamp_consulta": datetime.now().isoformat()
        }

    def bairro_catalogo_mais_proximo(self, lat: float, lon: float) -> str:
        """Retorna a chave do bairro do catálogo mais próximo da coordenada."""
        return min(
            CATALOGO_BAIRROS,
            key=lambda k: (CATALOGO_BAIRROS[k]["lat"] - lat) ** 2 + (CATALOGO_BAIRROS[k]["lon"] - lon) ** 2
        )

    def avaliar_risco(self, nome_bairro: str, chuva_custom: dict = None,
                      lat: float = None, lon: float = None) -> dict:
        """
        Executa a avaliação completa de risco para um bairro de Manaus:
            (Se lat/lon forem informados, a avaliação usa esse ponto exato em vez do centro do bairro.)
            1. Identifica o bairro e suas coordenadas.
            2. Mapeia para a célula de 500m na grade SIRGAS 2000 / UTM 20S.
            3. Obtém dados de precipitação em tempo real (Meteomatics).
            4. Recupera parâmetros SAR Sentinel-1.
            5. Executa inferência no modelo LightGBM.
            6. Classifica o tipo de ameaça (Alagamento / Deslizamento) e nível de alerta.
        """
        info_bairro = self.identificar_bairro(nome_bairro)
        if lat is None or lon is None:
            lat = info_bairro["lat"]
            lon = info_bairro["lon"]

        # Célula da grade
        celula = self.obter_celula_mais_proxima(lat, lon)
        cell_id = celula["cell_id"]

        # Chuva (Meteomatics ou customizada pelo usuário)
        if chuva_custom:
            dados_chuva = {
                "fonte": "Parâmetros Fornecidos pelo Usuário",
                "chuva_mm": float(chuva_custom.get("chuva_mm", 0.0)),
                "chuva_acum_1h": float(chuva_custom.get("chuva_acum_1h", 0.0)),
                "chuva_acum_6h": float(chuva_custom.get("chuva_acum_6h", 0.0)),
                "chuva_acum_24h": float(chuva_custom.get("chuva_acum_24h", 0.0)),
                "chuva_acum_72h": float(chuva_custom.get("chuva_acum_72h", 0.0)),
                "timestamp_consulta": datetime.now().isoformat()
            }
        else:
            dados_chuva = self.consultar_meteomatics_tempo_real(lat, lon)

        # Dados SAR
        dados_sar = self.obter_sar_celula(cell_id)

        # Montagem do vetor de features exato
        registro_features = {
            "chuva_mm": dados_chuva["chuva_mm"],
            "chuva_acum_1h": dados_chuva["chuva_acum_1h"],
            "chuva_acum_6h": dados_chuva["chuva_acum_6h"],
            "chuva_acum_24h": dados_chuva["chuva_acum_24h"],
            "chuva_acum_72h": dados_chuva["chuva_acum_72h"],
            "sar_vv_mean_db": dados_sar["sar_vv_mean_db"],
            "sar_vv_std_db": dados_sar["sar_vv_std_db"],
            "sar_vh_mean_db": dados_sar["sar_vh_mean_db"],
            "sar_vh_std_db": dados_sar["sar_vh_std_db"],
            "sar_diferenca_vv_vh": dados_sar["sar_diferenca_vv_vh"],
            "elev_media_m": celula["elev_media_m"],
            "elev_min_m": celula["elev_min_m"],
            "declividade_media": celula["declividade_media"],
            "declividade_max": celula["declividade_max"],
            "centroid_x": celula["centroid_x"],
            "centroid_y": celula["centroid_y"]
        }

        df_inferencia = pd.DataFrame([registro_features])[self.features_esperadas]

        # Predição de probabilidade
        probabilidade = float(self.modelo.predict_proba(df_inferencia)[0, 1])

        # Determinação do Nível de Risco
        if probabilidade < 0.20:
            nivel_alerta = "BAIXO"
            cor_alerta = "VERDE"
        elif probabilidade < self.limiar_otimizado:
            nivel_alerta = "ATENÇÃO"
            cor_alerta = "AMARELO"
        elif probabilidade < 0.65:
            nivel_alerta = "ALERTA"
            cor_alerta = "LARANJA"
        else:
            nivel_alerta = "EMERGÊNCIA MÁXIMA"
            cor_alerta = "VERMELHO"

        # Diagnóstico da Tipologia do Desastre
        elev_min = celula["elev_min_m"]
        decl_max = celula["declividade_max"]
        c6h = dados_chuva["chuva_acum_6h"]
        c72h = dados_chuva["chuva_acum_72h"]

        tipologia = "Sem Ocorrência Iminente"
        fatores = []

        if probabilidade >= self.limiar_otimizado:
            tem_alagamento = (elev_min <= 36.0) and (c6h >= 25.0 or dados_chuva["chuva_acum_1h"] >= 15.0)
            tem_deslizamento = (decl_max >= 5.5 or celula["declividade_media"] >= 2.2) and (c72h >= 40.0)

            if tem_alagamento and tem_deslizamento:
                tipologia = "Risco Misto (Alagamento Urbano e Deslizamento de Encosta)"
                fatores.append(f"Cota baixa de drenagem ({elev_min:.1f}m) combinada com talude íngreme ({decl_max:.1f}°)")
                fatores.append(f"Chuva crítica acumulada em 6h ({c6h:.1f}mm) e saturação em 72h ({c72h:.1f}mm)")
            elif tem_deslizamento:
                tipologia = "Risco de Deslizamento de Terra / Escorregamento de Encosta"
                fatores.append(f"Declividade acentuada do terreno ({decl_max:.1f}° max)")
                fatores.append(f"Solo com alta saturação hídrica (acumulado 72h: {c72h:.1f}mm)")
            elif tem_alagamento:
                tipologia = "Risco de Alagamento Urbano / Inundação de Igarapé"
                fatores.append(f"Cota de baixio suscetível a remanso ({elev_min:.1f}m)")
                fatores.append(f"Chuva intensa de curto prazo (acumulado 6h: {c6h:.1f}mm)")
            else:
                # Caso genérico acionado pelo ensemble do modelo
                if elev_min < 45.0:
                    tipologia = "Risco de Alagamento Localizado"
                else:
                    tipologia = "Risco de Movimento de Massa em Encosta"
                fatores.append("Padrão de risco identificado pelo modelo preditivo com base em radar e chuva acumulada")
        else:
            fatores.append("Volume de precipitação e retroespalhamento de radar dentro da faixa de segurança")

        # Recomendações da Defesa Civil
        recomendacoes = []
        if nivel_alerta in ["ALERTA", "EMERGÊNCIA MÁXIMA"]:
            if "Alagamento" in tipologia:
                recomendacoes.append("Evitar tráfego em vias rebaixadas próximas a igarapés.")
                recomendacoes.append("Acionar equipes da Defesa Civil para desobstrução de galerias pluviais.")
            if "Deslizamento" in tipologia:
                recomendacoes.append("Monitorar trincas em paredes e árvores inclinadas em áreas de encosta.")
                recomendacoes.append("Evacuar preventivamente residências situadas na base ou topo de taludes úmidos.")
        elif nivel_alerta == "ATENÇÃO":
            recomendacoes.append("Acompanhar atualizações dos radares e pluviômetros nas próximas 3 horas.")
        else:
            recomendacoes.append("Condições normais de operação na malha urbana.")

        return {
            "bairro": info_bairro["nome"],
            "zona_manaus": info_bairro["zona"],
            "coordenadas": {"latitude": lat, "longitude": lon},
            "celula_grade": {
                "cell_id": cell_id,
                "distancia_m": celula["distancia_ao_centroide_m"],
                "elev_media_m": celula["elev_media_m"],
                "elev_min_m": celula["elev_min_m"],
                "declividade_media_graus": celula["declividade_media"],
                "declividade_max_graus": celula["declividade_max"]
            },
            "dados_meteorologicos": dados_chuva,
            "radar_sentinel1": dados_sar,
            "avaliacao_risco": {
                "probabilidade_desastre_pct": round(probabilidade * 100, 2),
                "limiar_decisao_pct": round(self.limiar_otimizado * 100, 2),
                "nivel_alerta": nivel_alerta,
                "cor_alerta": cor_alerta,
                "ameaca_predita": tipologia,
                "fatores_determinantes": fatores,
                "recomendacoes_defesa_civil": recomendacoes
            },
            "historico_bairro": info_bairro["historico"]
        }


# Instância singleton para uso na API e no script CLI
_servico_instancia = None

def get_servico_previsao() -> ServicoPrevisaoRisco:
    global _servico_instancia
    if _servico_instancia is None:
        _servico_instancia = ServicoPrevisaoRisco()
    return _servico_instancia
