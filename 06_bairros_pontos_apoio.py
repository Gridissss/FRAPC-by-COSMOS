"""
================================================================================
PROJETO: PREVISÃO DE ALAGAMENTOS E DESLIZAMENTOS - MANAUS (AM)
ARQUIVO: 06_bairros_pontos_apoio.py (BASE DE REFERÊNCIA DO TOTEM)
================================================================================
Objetivo:
    Baixar do OpenStreetMap (Overpass API) e salvar em dados_referencia/:
        1. bairros_manaus.geojson -> polígonos oficiais dos bairros (admin_level=10),
           usados para descobrir em qual bairro o totem está e quais fazem divisa.
        2. pontos_apoio_manaus.geojson -> hospitais, quartéis de bombeiros, Defesa
           Civil e abrigos/pontos de encontro, usados como destino seguro do totem.
    Os arquivos ficam versionados para o totem funcionar sem depender do Overpass.
================================================================================
"""

import json
import logging
import sys
import time
from pathlib import Path

import requests
from shapely.geometry import LineString, mapping, shape
from shapely.ops import polygonize, unary_union

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("06_bairros_pontos_apoio")

DIR_REFERENCIA = Path("dados_referencia")
CAMINHO_BAIRROS = DIR_REFERENCIA / "bairros_manaus.geojson"
CAMINHO_PONTOS = DIR_REFERENCIA / "pontos_apoio_manaus.geojson"

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
CABECALHOS = {"User-Agent": "AlertaManaus-Totem/1.0 (hackathon Cosmos na NASA)"}
AREA_MANAUS = 'area["name"="Manaus"]["boundary"="administrative"]["admin_level"="8"]->.a;'

CONSULTA_BAIRROS = (
    "[out:json][timeout:120];" + AREA_MANAUS +
    'relation["boundary"="administrative"]["admin_level"="10"](area.a);out geom;'
)

CONSULTA_PONTOS = (
    "[out:json][timeout:120];" + AREA_MANAUS +
    "("
    'nwr["amenity"="hospital"](area.a);'
    'nwr["amenity"="fire_station"](area.a);'
    'nwr["emergency"="assembly_point"](area.a);'
    'nwr["amenity"="shelter"]["shelter_type"="emergency"](area.a);'
    'nwr["name"~"Defesa Civil",i](area.a);'
    ");out center tags;"
)


def consultar_overpass(consulta: str) -> list:
    """Tenta cada servidor Overpass (duas vezes) até um responder."""
    ultimo_erro = None
    for tentativa in range(2):
        for url in OVERPASS_URLS:
            try:
                resp = requests.post(url, data={"data": consulta}, headers=CABECALHOS, timeout=(10, 150))
                resp.raise_for_status()
                return resp.json().get("elements", [])
            except (requests.RequestException, ValueError) as e:
                logger.warning(f"Overpass indisponível em {url}: {e}")
                ultimo_erro = e
        time.sleep(5)
    raise requests.RequestException(f"Nenhum servidor Overpass respondeu: {ultimo_erro}")


def montar_poligono_relacao(relacao: dict):
    """Junta os trechos 'outer' da relação em um (Multi)Polygon."""
    linhas = []
    for membro in relacao.get("members", []):
        if membro.get("type") != "way" or membro.get("role") not in ("outer", ""):
            continue
        coords = [(p["lon"], p["lat"]) for p in membro.get("geometry", []) if p]
        if len(coords) >= 2:
            linhas.append(LineString(coords))
    poligonos = list(polygonize(unary_union(linhas)))
    if not poligonos:
        return None
    return unary_union(poligonos)


def baixar_bairros() -> dict:
    logger.info("Consultando polígonos dos bairros de Manaus no Overpass...")
    feicoes = []
    for rel in consultar_overpass(CONSULTA_BAIRROS):
        nome = rel.get("tags", {}).get("name")
        geom = montar_poligono_relacao(rel)
        if not nome or geom is None or geom.is_empty:
            logger.warning(f"Bairro ignorado (sem geometria válida): {nome}")
            continue
        geom = geom.simplify(0.00008, preserve_topology=True)
        feicoes.append({
            "type": "Feature",
            "properties": {"nome": nome, "osm_id": rel["id"]},
            "geometry": mapping(geom)
        })
    feicoes.sort(key=lambda f: f["properties"]["nome"])
    logger.info(f"{len(feicoes)} bairros montados.")
    return {"type": "FeatureCollection", "features": feicoes}


def classificar_ponto(tags: dict) -> str:
    nome = tags.get("name", "").lower()
    if "defesa civil" in nome:
        return "defesa_civil"
    if tags.get("amenity") == "hospital":
        return "hospital"
    if tags.get("amenity") == "fire_station":
        return "bombeiros"
    return "abrigo"


def baixar_pontos_apoio() -> dict:
    logger.info("Consultando hospitais, bombeiros, Defesa Civil e abrigos no Overpass...")
    feicoes = []
    vistos = set()
    for el in consultar_overpass(CONSULTA_PONTOS):
        tags = el.get("tags", {})
        if "lat" in el:
            lat, lon = el["lat"], el["lon"]
        elif "center" in el:
            lat, lon = el["center"]["lat"], el["center"]["lon"]
        else:
            continue
        tipo = classificar_ponto(tags)
        nome = tags.get("name") or {
            "hospital": "Hospital", "bombeiros": "Corpo de Bombeiros",
            "defesa_civil": "Defesa Civil", "abrigo": "Ponto de encontro"
        }[tipo]
        chave = (tipo, round(lat, 4), round(lon, 4))
        if chave in vistos:
            continue
        vistos.add(chave)
        feicoes.append({
            "type": "Feature",
            "properties": {"nome": nome, "tipo": tipo, "osm_id": f"{el['type']}/{el['id']}"},
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}
        })
    feicoes.sort(key=lambda f: (f["properties"]["tipo"], f["properties"]["nome"]))
    logger.info(f"{len(feicoes)} pontos de apoio encontrados.")
    return {"type": "FeatureCollection", "features": feicoes}


def main():
    DIR_REFERENCIA.mkdir(exist_ok=True)
    try:
        bairros = baixar_bairros()
        pontos = baixar_pontos_apoio()
    except requests.RequestException as e:
        logger.error(f"Falha ao consultar o Overpass: {e}")
        sys.exit(1)

    # Valida que as geometrias continuam legíveis antes de gravar
    for f in bairros["features"]:
        shape(f["geometry"])

    CAMINHO_BAIRROS.write_text(json.dumps(bairros, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    CAMINHO_PONTOS.write_text(json.dumps(pontos, ensure_ascii=False, indent=1), encoding="utf-8")
    logger.info(f"Arquivos salvos em '{DIR_REFERENCIA}/'. Etapa 06 concluída com sucesso!")


if __name__ == "__main__":
    main()
