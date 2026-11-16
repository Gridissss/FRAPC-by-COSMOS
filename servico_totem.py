"""
================================================================================
PROJETO: PREVISÃO DE ALAGAMENTOS E DESLIZAMENTOS - MANAUS (AM)
MÓDULO: SERVIÇO DO TOTEM (PACOTE DE DADOS POR LOCALIZAÇÃO)
================================================================================
Objetivo:
    Dada a coordenada onde o totem está instalado, montar numa única resposta
    tudo o que a tela precisa, no mesmo formato de js/dados.js:
        1. Bairro do totem (polígono OSM) e bairros que fazem divisa com ele.
        2. Nível de deslizamento e alagamento (1 a 4) de cada bairro, agora,
           nas próximas horas, amanhã e nos próximos 4 dias.
        3. Para onde ir (só faz sentido em atenção/perigo; "acao" diz ficar, preparar ou sair):
           hospital, bombeiros, Defesa Civil ou ponto de encontro próximo num bairro tranquilo
           (verde) nos dois riscos; se for longe demais ou não houver, o bairro tranquilo mais próximo.

Como os níveis são calculados (por célula de 500 m da grade, com os acumulados de chuva
nas mesmas janelas do treino):
    - Alagamento: probabilidade do modelo LightGBM -> 1 (<20%), 2 (< limiar F1), 3 (< 65%),
      4 (>= 65%), com piso "atenção" em baixio (cota <= 32 m) com metade da chuva do gatilho.
    - Deslizamento: o modelo não teve exemplos (DEM sintético < 16°), então usa a mesma regra
      que rotulou deslizamentos no treino (acum. 72 h >= 80 mm e 6 h >= 20 mm) nas encostas.
    - Nível do bairro: o maior nível que cobre pelo menos 10% das células dele (uma célula isolada
      não pinta o bairro inteiro); no bairro do totem também conta o entorno de 600 m da pessoa.
================================================================================
"""

import json
import logging
import math
from datetime import timedelta

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import Point, mapping

from servico_previsao import (
    CATALOGO_BAIRROS, DIR_PROJETO, FUSO_MANAUS, get_servico_previsao, normalizar_texto, obter_serie_chuva
)

logger = logging.getLogger("servico_totem")

DIR_REFERENCIA = DIR_PROJETO / "dados_referencia"
CAMINHO_BAIRROS = DIR_REFERENCIA / "bairros_manaus.geojson"
CAMINHO_PONTOS = DIR_REFERENCIA / "pontos_apoio_manaus.geojson"

# lon_min, lat_min, lon_max, lat_max
LIMITES_MANAUS = (-60.25, -3.25, -59.75, -2.85)
DIST_MAX_GRADE_M = 750       # mais longe que isso da célula mais próxima = fora da área monitorada
RAIO_ANALISE_M = 6000
RAIO_DESTINO_M = 5000
MAX_VIZINHOS = 8
FRACAO_CELULAS_BAIRRO = 0.10        # o risco precisa cobrir 10% do bairro para colorir o bairro inteiro
RAIO_ENTORNO_SEGURO_M = 600         # entorno do totem e dos pontos de apoio
DIST_POI_PREFERIDA_M = 2000         # até ~35 min a pé o hospital/bombeiros é preferido à área segura
DIST_MAX_AREA_VERDE_M = 3000        # além disso (~50 min a pé), indica a área mais tranquila por perto

# Pontos do OSM que não servem como destino numa emergência
PONTOS_FORA = ("terreno", "psiqui", "psicos", "veterin", "olhos", "odonto", "physical", "hemoam", "oncologia",
               "ubs", "unidade basica", "unidade da familia", "modulo saude", "ambulatorio", "centro de saude",
               "centro de parto", "caimi", "cemom")
VELOCIDADE_PE_M_MIN = 75.0   # ~4,5 km/h
FATOR_TRAJETO = 1.3          # ruas não são linha reta
DIAS_PREVISAO = 4

# Limiares do alvo de treino (04_montar_dataset.py)
COTA_BAIXIO_M = 32.0
DECLIVIDADE_DESLIZAMENTO = 16.0

# O que o totem manda a pessoa fazer em cada nível
ACAO = {1: "ficar", 2: "preparar", 3: "sair", 4: "sair"}

HORIZONTE = [(0, "Agora"), (1, "1 h"), (3, "3 h"), (5, "5 h")]
CONFIANCA_DESLIZAMENTO = {1: 5, 2: 35, 3: 60, 4: 85}

TELEFONES = [
    {"nome": "Defesa Civil", "numero": "199", "icone": "sirene", "usos": ["morro", "casa"]},
    {"nome": "Bombeiros", "numero": "193", "icone": "fogo", "usos": ["fogo", "correr"]},
    {"nome": "SAMU", "numero": "192", "icone": "cruz", "usos": ["cruz", "coracao"]},
]

COLUNAS_SAR = ["sar_vv_mean_db", "sar_vv_std_db", "sar_vh_mean_db", "sar_vh_std_db", "sar_diferenca_vv_vh"]
SAR_PADRAO = {"sar_vv_mean_db": -10.8, "sar_vv_std_db": 2.2, "sar_vh_mean_db": -16.5,
              "sar_vh_std_db": 2.0, "sar_diferenca_vv_vh": 5.7}
COLUNAS_RELEVO = ["elev_media_m", "elev_min_m", "declividade_media", "declividade_max", "centroid_x", "centroid_y"]
COLUNAS_CHUVA = ["chuva_mm", "chuva_acum_1h", "chuva_acum_6h", "chuva_acum_24h", "chuva_acum_72h"]


def _arredondar(obj, casas=5):
    if isinstance(obj, (list, tuple)):
        return [_arredondar(o, casas) for o in obj]
    if isinstance(obj, float):
        return round(obj, casas)
    return obj


def _slug(nome: str) -> str:
    return normalizar_texto(nome).replace(" ", "-")


def _robusto(valores) -> float:
    """
    Valor de um bairro sem deixar uma célula isolada decidir sozinha: o maior valor alcançado por
    pelo menos 10% das células (mínimo 2; 1 em bairros de até 4 células). Com várias horas
    (matriz horas x células), calcula hora a hora e devolve a pior hora.
    """
    v = np.atleast_2d(np.asarray(valores, dtype=float))
    n = v.shape[1]
    if n == 0:
        return 1
    k = 1 if n <= 4 else max(2, math.ceil(FRACAO_CELULAS_BAIRRO * n))
    resultado = float(np.sort(v, axis=1)[:, n - k].max())
    return int(resultado) if float(resultado).is_integer() else resultado


class ServicoTotem:

    def __init__(self):
        self.prev = get_servico_previsao()
        self.para_wgs = Transformer.from_crs("EPSG:31980", "EPSG:4326", always_xy=True)
        self._carregar_bairros()
        self._preparar_celulas()
        self._carregar_pontos()

    # ------------------------------------------------------------------ carga

    def _carregar_bairros(self):
        if CAMINHO_BAIRROS.exists():
            gdf = gpd.read_file(CAMINHO_BAIRROS)[["nome", "geometry"]].set_crs("EPSG:4326", allow_override=True)
            self.fonte_bairros = "OpenStreetMap (polígonos oficiais de bairro)"
        else:
            # Sem a base do OSM, aproxima cada bairro do catálogo por um círculo de 900 m
            logger.warning(f"'{CAMINHO_BAIRROS}' não encontrado. Rode 06_bairros_pontos_apoio.py. Usando catálogo.")
            pts = gpd.GeoDataFrame(
                {"nome": [b["nome"] for b in CATALOGO_BAIRROS.values()]},
                geometry=[Point(b["lon"], b["lat"]) for b in CATALOGO_BAIRROS.values()], crs="EPSG:4326"
            )
            gdf = pts.to_crs("EPSG:31980").buffer(900).to_crs("EPSG:4326")
            gdf = gpd.GeoDataFrame({"nome": pts["nome"]}, geometry=gdf, crs="EPSG:4326")
            self.fonte_bairros = "Catálogo interno (aproximação circular)"

        gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].reset_index(drop=True)
        self.bairros = gdf
        self.bairros_utm = gdf.to_crs("EPSG:31980")
        pontos = gdf.geometry.representative_point()
        self.bairro_lat = pontos.y.to_numpy()
        self.bairro_lng = pontos.x.to_numpy()
        pontos_utm = self.bairros_utm.geometry.representative_point()
        self.bairro_xy = np.column_stack([pontos_utm.x, pontos_utm.y])
        self.bairro_geojson = [_arredondar(mapping(g)) for g in gdf.geometry]
        self.bairro_id = [_slug(n) for n in gdf["nome"]]

        geoms = list(self.bairros_utm.geometry)
        self.vizinhos = []
        for i, g in enumerate(geoms):
            perto = [int(j) for j in self.bairros_utm.sindex.query(g.buffer(60), predicate="intersects") if j != i]
            if not perto:
                # Bairro sem divisa conhecida (ex.: catálogo em círculos): usa os mais próximos
                dist = np.hypot(*(self.bairro_xy - self.bairro_xy[i]).T)
                perto = [int(j) for j in np.argsort(dist)[1:7] if dist[j] <= 5000]
            self.vizinhos.append(perto)

        historicos = {normalizar_texto(b["nome"]): b["historico"] for b in CATALOGO_BAIRROS.values()}
        historicos.update({k: b["historico"] for k, b in CATALOGO_BAIRROS.items()})
        self.bairro_historico = [historicos.get(normalizar_texto(n)) for n in gdf["nome"]]
        logger.info(f"{len(gdf)} bairros carregados ({self.fonte_bairros}).")

    def _preparar_celulas(self):
        grade = self.prev.gdf_grade
        estatico = pd.DataFrame(grade[["cell_id"] + COLUNAS_RELEVO])
        sar = self.prev.sar_recente
        if not sar.empty:
            estatico = estatico.merge(sar[["cell_id"] + COLUNAS_SAR], on="cell_id", how="left")
        for c in COLUNAS_SAR:
            if c not in estatico:
                estatico[c] = np.nan
            estatico[c] = estatico[c].fillna(SAR_PADRAO[c])
        self.estatico = estatico.reset_index(drop=True)
        self.cel_xy = self.estatico[["centroid_x", "centroid_y"]].to_numpy()
        self.tree = cKDTree(self.cel_xy)
        # DEM real: 16° como no treino. DEM sintético (máx. ~9°): as 15% células mais íngremes.
        self.limiar_encosta = min(DECLIVIDADE_DESLIZAMENTO, float(np.percentile(self.estatico["declividade_max"], 85)))

        pontos = gpd.GeoDataFrame(geometry=gpd.points_from_xy(self.cel_xy[:, 0], self.cel_xy[:, 1]), crs="EPSG:31980")
        junc = gpd.sjoin(pontos, self.bairros_utm[["geometry"]], predicate="within", how="inner")
        self.celulas_do_bairro = {i: [] for i in range(len(self.bairros))}
        self.bairro_da_celula = np.full(len(self.cel_xy), -1)
        for cel, bairro in zip(junc.index, junc["index_right"]):
            self.celulas_do_bairro[int(bairro)].append(int(cel))
            self.bairro_da_celula[int(cel)] = int(bairro)
        for i, cels in self.celulas_do_bairro.items():
            if not cels:
                self.celulas_do_bairro[i] = [int(self.tree.query(self.bairro_xy[i])[1])]

    def _carregar_pontos(self):
        self.pontos = []
        if not CAMINHO_PONTOS.exists():
            logger.warning(f"'{CAMINHO_PONTOS}' não encontrado: destino será sempre o bairro mais seguro.")
            return
        dados = json.loads(CAMINHO_PONTOS.read_text(encoding="utf-8"))
        for f in dados.get("features", []):
            if not self._serve_emergencia(f["properties"]["nome"]):
                continue
            lng, lat = f["geometry"]["coordinates"]
            x, y = self.prev.transformer_to_utm.transform(lng, lat)
            self.pontos.append({"nome": f["properties"]["nome"], "tipo": f["properties"]["tipo"],
                                "lat": lat, "lng": lng, "x": x, "y": y, "bairro": self._bairro_do_ponto(x, y)})
        logger.info(f"{len(self.pontos)} pontos de apoio carregados.")

    @staticmethod
    def _serve_emergencia(nome: str) -> bool:
        """O OSM marca como hospital lugares que não recebem ninguém numa emergência (terreno, CAPS, UBS...)."""
        n = normalizar_texto(nome)
        return not any(t in n for t in PONTOS_FORA)

    # ------------------------------------------------------------------ consultas

    def listar_bairros(self) -> list:
        return [
            {"id": self.bairro_id[i], "nome": n, "lat": round(float(self.bairro_lat[i]), 6),
             "lng": round(float(self.bairro_lng[i]), 6)}
            for i, n in sorted(enumerate(self.bairros["nome"]), key=lambda t: normalizar_texto(t[1]))
        ]

    def _bairro_do_ponto(self, x: float, y: float) -> int:
        p = Point(x, y)
        dentro = self.bairros_utm.sindex.query(p, predicate="within")
        if len(dentro):
            return int(dentro[0])
        return int(self.bairros_utm.distance(p).idxmin())

    @staticmethod
    def _acumulados(mm: np.ndarray, idx: np.ndarray) -> dict:
        """
        Mesmas janelas do treino (03_coleta_chuva.py): rolling("Nh", closed="both") em dados horários
        inclui as duas pontas, então o acumulado de N horas soma N+1 leituras (1h = hora atual + anterior).
        chuva_mm é só a hora atual.
        """
        cs = np.concatenate([[0.0], np.cumsum(mm)])

        def acum(n_horas):
            return cs[idx + 1] - cs[np.maximum(0, idx - n_horas)]

        return {"chuva_mm": mm[idx], "chuva_acum_1h": acum(1), "chuva_acum_6h": acum(6),
                "chuva_acum_24h": acum(24), "chuva_acum_72h": acum(72)}

    def _niveis(self, chuva: dict, est: pd.DataFrame):
        """
        Probabilidade e níveis por (hora, célula). Retorna (P, nivel_alag, nivel_desl).

        O alvo do modelo é "houve ocorrência da Defesa Civil" (04_montar_dataset.py). No dataset
        sintético só houve ocorrências de ALAGAMENTO (cota <= 32 m e acum_1h >= 35 ou acum_6h >= 50):
        o gatilho de deslizamento (declividade >= 16°) nunca é atingido pelo DEM sintético (máx. ~9°).
        Por isso:
            - Alagamento = probabilidade do modelo (1: < 20%, 2: < limiar F1, 3: < 65%, 4: >= 65%),
              com piso "atenção" em baixio quando a chuva já passou da metade do gatilho do treino.
            - Deslizamento = a mesma regra que gerou as ocorrências de deslizamento no treino,
              aplicada às encostas mais íngremes da grade (limiar de 16° ou o percentil 85 do DEM).
        """
        n_t, n_c = len(chuva["chuva_mm"]), len(est)
        dados = {c: np.repeat(chuva[c], n_c) for c in COLUNAS_CHUVA}
        for c in COLUNAS_RELEVO + COLUNAS_SAR:
            dados[c] = np.tile(est[c].to_numpy(), n_t)
        X = pd.DataFrame(dados)[self.prev.features_esperadas]
        P = self.prev.modelo.predict_proba(X)[:, 1].reshape(n_t, n_c)

        limiar = self.prev.limiar_otimizado
        base = 1 + (P >= min(0.20, limiar)).astype(int) + (P >= limiar) + (P >= max(0.65, limiar))

        a1, a6, a72 = chuva["chuva_acum_1h"], chuva["chuva_acum_6h"], chuva["chuva_acum_72h"]
        baixio = est["elev_min_m"].to_numpy() <= COTA_BAIXIO_M
        meia_chuva_alag = (a1 >= 35.0 / 2) | (a6 >= 50.0 / 2)
        alag = np.where(baixio[None, :] & meia_chuva_alag[:, None], np.maximum(base, 2), base)

        encosta = est["declividade_max"].to_numpy() >= self.limiar_encosta
        regra = (1 + (a72 >= 50.0)
                 + ((a72 >= 80.0) & (a6 >= 20.0))     # gatilho exato do treino -> perigo
                 + ((a72 >= 120.0) & (a6 >= 40.0)))   # bem acima do gatilho -> extremo
        desl = np.where(encosta[None, :], regra[:, None], 1)
        return P, alag.astype(int), desl.astype(int)

    def avaliar(self, lat: float, lng: float, nome: str = None, fator_chuva: float = 1.0, forcar: bool = False) -> dict:
        lon_min, lat_min, lon_max, lat_max = LIMITES_MANAUS
        if not (lat_min <= lat <= lat_max and lon_min <= lng <= lon_max):
            raise ValueError("A localização precisa estar dentro de Manaus.")

        x, y = self.prev.transformer_to_utm.transform(lng, lat)
        if self.tree.query([x, y])[0] > DIST_MAX_GRADE_M:
            raise ValueError("Local fora da área monitorada pela grade de relevo (mancha urbana de Manaus).")
        atual = self._bairro_do_ponto(x, y)
        viz = sorted(self.vizinhos[atual], key=lambda j: np.hypot(*(self.bairro_xy[j] - [x, y])))[:MAX_VIZINHOS]
        foco = [atual] + viz

        # Células analisadas: raio ao redor do totem + bairros em foco + bairros/pontos que podem virar destino
        perto = [j for j in range(len(self.bairros)) if np.hypot(*(self.bairro_xy[j] - [x, y])) <= RAIO_DESTINO_M]
        pontos_perto = [p for p in self.pontos if np.hypot(p["x"] - x, p["y"] - y) <= RAIO_DESTINO_M]
        cels = set(self.tree.query_ball_point([x, y], RAIO_ANALISE_M))
        for b in set(foco) | set(perto) | {p["bairro"] for p in pontos_perto}:
            cels.update(self.celulas_do_bairro[b])
        cels = np.array(sorted(cels))
        coluna = {int(c): k for k, c in enumerate(cels)}
        est = self.estatico.iloc[cels].reset_index(drop=True)

        # Linha do tempo: da hora atual até o fim do 4º dia
        serie = obter_serie_chuva(lat, lng, forcar=forcar)
        mm = serie["mm"] * max(0.0, float(fator_chuva))
        horas = serie["horas"]
        i0 = serie["idx_agora"]
        hoje = horas[i0].date()
        fim = max(i for i, h in enumerate(horas) if h.date() <= hoje + timedelta(days=DIAS_PREVISAO))
        idx = np.arange(i0, fim + 1)
        chuva = self._acumulados(mm, idx)
        P, alag, desl = self._niveis(chuva, est)
        niveis = {"alagamento": alag, "deslizamento": desl}
        # Um lugar só é seguro se estiver livre dos dois riscos
        niveis_juntos = np.maximum(alag, desl)
        # Entorno imediato do totem (onde a pessoa está): sempre conta para o bairro dele
        entorno_totem = [coluna[int(c)] for c in self.tree.query_ball_point([x, y], RAIO_ENTORNO_SEGURO_M) if int(c) in coluna]

        def cols_bairro(b):
            return [coluna[c] for c in self.celulas_do_bairro[b] if c in coluna]

        def nivel_bairro(risco, b, linhas):
            matriz = niveis_juntos if risco is None else niveis[risco]
            nivel = _robusto(matriz[np.ix_(linhas, cols_bairro(b))])
            if b == atual and entorno_totem:
                nivel = max(nivel, int(matriz[np.ix_(linhas, entorno_totem)].max()))
            return nivel

        def prob_bairro(risco, b, linhas):
            if risco == "alagamento":
                prob = _robusto(P[np.ix_(linhas, cols_bairro(b))])
                if b == atual and entorno_totem:
                    prob = max(prob, float(P[np.ix_(linhas, entorno_totem)].max()))
                return int(round(100 * float(prob)))
            return CONFIANCA_DESLIZAMENTO[nivel_bairro(risco, b, linhas)]

        datas = [horas[i].date() for i in idx]
        linhas_dia = {d: [k for k, dt in enumerate(datas) if dt == hoje + timedelta(days=d)] for d in range(DIAS_PREVISAO + 1)}
        janela = list(range(min(6, len(idx))))  # agora até +5 h: usado para julgar se um destino é seguro

        # ---- bairros em foco
        bairros = []
        for b in foco:
            bairros.append({
                "id": self.bairro_id[b], "nome": self.bairros["nome"][b],
                "lat": round(float(self.bairro_lat[b]), 6), "lng": round(float(self.bairro_lng[b]), 6),
                "deslizamento": nivel_bairro("deslizamento", b, [0]),
                "alagamento": nivel_bairro("alagamento", b, [0]),
                "atual": b == atual,
                "geometria": self.bairro_geojson[b],
            })

        # ---- horizonte (agora, 1 h, 3 h, 5 h, amanhã)
        horizonte = []
        for h, rotulo in HORIZONTE:
            if h >= len(idx):
                continue
            horizonte.append({
                "rotulo": rotulo, "horas": h, "chuva": round(float(mm[idx[h]]), 1),
                **{r: {"nivel": nivel_bairro(r, atual, [h]), "prob": 100 if h == 0 else prob_bairro(r, atual, [h])}
                   for r in niveis}
            })
        if linhas_dia[1]:
            horizonte.append({
                "rotulo": "Amanhã", "horas": 24, "chuva": round(float(mm[idx[linhas_dia[1]]].sum()), 1),
                **{r: {"nivel": nivel_bairro(r, atual, linhas_dia[1]), "prob": prob_bairro(r, atual, linhas_dia[1])}
                   for r in niveis}
            })

        # ---- próximos dias (hoje + 4); hoje acompanha o nível atual
        previsao = []
        dia_hoje = [i for i, h in enumerate(horas) if h.date() == hoje]
        for d in range(DIAS_PREVISAO + 1):
            if d == 0:
                previsao.append({"chuva": round(float(mm[dia_hoje].sum()), 1),
                                 **{r: nivel_bairro(r, atual, [0]) for r in niveis}})
            elif linhas_dia[d]:
                previsao.append({"chuva": round(float(mm[idx[linhas_dia[d]]].sum()), 1),
                                 **{r: nivel_bairro(r, atual, linhas_dia[d]) for r in niveis}})

        # ---- destino seguro: o mesmo para os dois riscos (precisa estar livre de ambos)
        tree_cels = cKDTree(self.cel_xy[cels])
        pior_cel = niveis_juntos[janela].max(axis=0)
        destino = self._destino(pontos_perto, atual, x, y, tree_cels, pior_cel, cols_bairro, cels)

        agora = {c: round(float(v[0]), 1) for c, v in chuva.items()}
        nome_bairro = self.bairros["nome"][atual]
        indicadores = {
            "deslizamento": [
                {"icone": "chuva", "valor": round(agora["chuva_acum_72h"]), "unidade": " mm", "rotulo": "chuva em 3 dias"},
                {"icone": "morro", "valor": sum(1 for b in bairros if b["deslizamento"] >= 3), "rotulo": "bairros em perigo"},
            ],
            "alagamento": [
                {"icone": "gota", "valor": agora["chuva_acum_6h"], "dec": 1, "unidade": " mm", "rotulo": "chuva em 6 horas"},
                {"icone": "casa", "valor": sum(1 for b in bairros if b["alagamento"] >= 2), "rotulo": "bairros em atenção"},
            ],
        }

        return {
            "cidade": "Manaus",
            "atualizadoEm": horas[i0].strftime("%d/%m/%Y") + " · " + pd.Timestamp.now(tz=FUSO_MANAUS).strftime("%H:%M"),
            "voce": {"nome": nome or f"Bairro {nome_bairro}", "bairro": nome_bairro, "lat": lat, "lng": lng},
            "telefones": TELEFONES,
            **{r: {"nivel": nivel_bairro(r, atual, [0]), "acao": ACAO[nivel_bairro(r, atual, [0])],
                   "indicadores": indicadores[r], "pontoSeguro": destino}
               for r in niveis},
            "bairros": bairros,
            "horizonte": horizonte,
            "previsao": previsao,
            "meta": {
                "bairro": nome_bairro,
                "historico_bairro": self.bairro_historico[atual],
                "fonte_chuva": serie["fonte"] + (f" x{fator_chuva:g} (simulação)" if fator_chuva != 1 else ""),
                "chuva_consultada_em": serie["consultada_em"].strftime("%H:%M:%S"),
                "chuva_agora": agora,
                "fonte_bairros": self.fonte_bairros,
                "modelo": type(self.prev.modelo).__name__,
                "limiar_decisao": round(self.prev.limiar_otimizado, 4),
                "fonte_alagamento": "Modelo LightGBM (probabilidade de ocorrência)",
                "fonte_deslizamento": f"Regra do alvo de treino em encostas >= {self.limiar_encosta:.1f}° "
                                      "(o modelo não teve exemplos de deslizamento)",
                "celulas_analisadas": int(len(cels)),
            },
        }

    def _destino(self, pontos_perto, atual, x, y, tree_cels, pior_cel, cols_bairro, cels) -> dict:
        """
        Para onde ir, considerando alagamento e deslizamento juntos de agora até +5 h.
        Coerente com o mapa: só manda para bairro que aparece TRANQUILO (verde) nos dois riscos —
        se o bairro está alagando ou com encosta em perigo, o hospital dele provavelmente também está.
            1. Hospital/bombeiros/Defesa Civil/ponto de encontro mais próximo num bairro tranquilo,
               com o entorno de 600 m tranquilo.
            2. Se ele for bem mais longe que uma área segura (ou não existir): o ponto mais próximo
               de um bairro tranquilo (até 3 km), com o entorno de 600 m também tranquilo.
            3. Se tudo em volta estiver em risco: a "área mais tranquila" (entorno de 600 m tranquilo)
               mais próxima fora do bairro do totem; em último caso, o lugar menos arriscado.
        """
        def pior_do_bairro(b):
            cols = cols_bairro(b)
            return _robusto(pior_cel[cols]) if cols else 4

        melhor = None
        for p in pontos_perto:
            if pior_do_bairro(p["bairro"]) > 1:
                continue
            entorno = tree_cels.query_ball_point([p["x"], p["y"]], RAIO_ENTORNO_SEGURO_M) or [tree_cels.query([p["x"], p["y"]])[1]]
            if int(pior_cel[entorno].max()) > 1:
                continue
            dist = float(np.hypot(p["x"] - x, p["y"] - y))
            if melhor is None or dist < melhor[0]:
                melhor = (dist, p)
        if melhor:
            dist_poi, p = melhor
            poi = self._formatar_destino(p["nome"], p["tipo"], p["lat"], p["lng"], dist_poi, 1, self.bairros["nome"][p["bairro"]])
        else:
            dist_poi, poi = None, None

        bairro_col = self.bairro_da_celula[cels]
        entornos = tree_cels.query_ball_point(self.cel_xy[cels], RAIO_ENTORNO_SEGURO_M)
        seguro_local = np.array([int(pior_cel[v].max()) <= 1 for v in entornos])
        pior = {b: pior_do_bairro(b) for b in set(bairro_col.tolist()) - {-1}}
        dist_cel = np.hypot(self.cel_xy[cels][:, 0] - x, self.cel_xy[cels][:, 1] - y)
        fora = (bairro_col != atual) & (bairro_col >= 0)
        bairro_verde = np.array([pior.get(b, 4) <= 1 for b in bairro_col])
        ate_limite = dist_cel <= DIST_MAX_AREA_VERDE_M
        criterios = [
            # bairro verde por perto, com o entorno tranquilo
            fora & bairro_verde & seguro_local & ate_limite,
            # tudo em volta em risco: o ponto mais próximo com entorno de 600 m tranquilo ("área mais tranquila")
            fora & seguro_local,
            fora & bairro_verde,
            fora & (pior_cel == pior_cel[fora].min()) if fora.any() else np.ones(len(cels), bool),
        ]
        validas = next(c for c in criterios if c.any())
        k = int(np.flatnonzero(validas)[np.argmin(dist_cel[validas])])
        escolha = int(bairro_col[k]) if bairro_col[k] >= 0 else atual
        ponto, dist_area = self.cel_xy[cels[k]], float(dist_cel[k])
        nivel_area = pior.get(escolha, int(pior_cel[k]))

        # Hospital/bombeiros (sempre em bairro verde) vale se não for muito mais longe que a área segura
        if poi and (dist_poi <= DIST_POI_PREFERIDA_M or dist_poi <= 1.5 * dist_area
                    or (nivel_area > 1 and dist_poi <= DIST_MAX_AREA_VERDE_M)):
            return poi
        nome = self.bairros["nome"][escolha]
        lng, lat = self.para_wgs.transform(ponto[0], ponto[1])
        return self._formatar_destino(f"Bairro {nome}", "area" if nivel_area <= 1 else "area_menos_risco",
                                      lat, lng, dist_area, nivel_area, nome)

    @staticmethod
    def _formatar_destino(nome, tipo, lat, lng, dist, nivel, bairro) -> dict:
        return {
            "nome": nome, "tipo": tipo, "bairro": bairro, "nivel": int(nivel),
            "lat": round(lat, 6), "lng": round(lng, 6), "distancia_m": int(round(dist)),
            "minutos": max(1, int(round(dist * FATOR_TRAJETO / VELOCIDADE_PE_M_MIN))),
        }


_servico_totem = None


def get_servico_totem() -> ServicoTotem:
    global _servico_totem
    if _servico_totem is None:
        _servico_totem = ServicoTotem()
    return _servico_totem
