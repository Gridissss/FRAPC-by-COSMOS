# 🛰️ Totem SAR Amazônia — Alerta Acessível de Deslizamentos e Terras Caídas
> **NASA Space Apps Challenge | Desafio:** *Dancing with the SARs*  
> **Localidade Foco:** Manaus, Amazonas, Brasil

## 📌 O Problema
Em Manaus e nas margens dos rios amazônicos, barrancos e encostas sofrem movimentações silenciosas durante a transição de cheias e chuvas intensas, provocando desmoronamentos súbitos (**"Terras Caídas"**) e deslizamentos urbanos. Imagens de satélites ópticos falham na região devido à cobertura constante de nuvens tropicais.

## 💡 Nossa Solução
Desenvolvemos um **Totem Comunitário de Alerta Precoce e Acessibilidade (Botão Único)** alimentado por dados de **Interferometria de Radar de Abertura Sintética (InSAR)** em Banda L da missão **NISAR (NASA/ISRO)**.

> 🧊 **Totem em 3D:** abra `est_dio_3d_totem_sar_defesa_civil.html` no navegador.  
> 🌐 **Site de divulga??o:** `site/index.html`.

---

## 🌊 Sistema de Alerta Precoce: Previsão de Alagamentos e Deslizamentos em Manaus (AM)

> **Engenharia de Dados Geoespaciais, Sensoriamento Remoto por Radar (Sentinel-1 SAR), Séries Temporais de Precipitação, Machine Learning (LightGBM) e API REST em Tempo Real com a Meteomatics.**

---

## 📌 Sumário
1. [Visão Geral do Projeto](#-visão-geral-do-projeto)
2. [Arquitetura do Pipeline](#-arquitetura-do-pipeline)
3. [Estrutura de Arquivos](#-estrutura-de-arquivos)
4. [Instalação e Configuração](#-instalação-e-configuração)
5. [Guia de Execução dos Scripts](#-guia-de-execução-dos-scripts)
   - [01_grade_relevo.py](#1-01_grade_relevopy)
   - [02_coleta_sar.py](#2-02_coleta_sarpy)
   - [03_coleta_chuva.py](#3-03_coleta_chuvapy)
   - [04_montar_dataset.py](#4-04_montar_datasetpy)
   - [05_treinar_modelo.py](#5-05_treinar_modelopy)
   - [06_bairros_pontos_apoio.py](#6-06_bairros_pontos_apoiopy)
6. [API REST em Tempo Real (api.py)](#-api-rest-em-tempo-real-apipy)
   - [Como Iniciar o Servidor](#como-iniciar-o-servidor)
   - [Documentação Swagger e Endpoints](#documentação-swagger-e-endpoints)
   - [Exemplos de Requisições e Respostas](#exemplos-de-requisições-e-respostas)
7. [Script de Consulta no Terminal (consultar_bairro.py)](#-script-de-consulta-no-terminal-consultar_bairropy)
8. [Fundamentos Geográficos e Geotécnicos de Manaus](#-fundamentos-geográficos-e-geotécnicos-de-manaus)

---

## 🧭 Visão Geral do Projeto

A cidade de **Manaus (AM)** apresenta um cenário geográfico e hidrológico singular:
- Clima equatorial úmido com altos volumes de chuva concentrados (o chamado **"Inverno Amazônico"**, de janeiro a maio).
- Relevo dissecado característico da **Formação Alter do Chão**, intercalando platôs e tabuleiros estruturais (cotas de 60m a 115m) com encostas íngremes e baixios fluviais formados por densas bacias de igarapés (Igarapé do Mindu, Educandos, São Raimundo, Franco, Quarenta).
- Alta densidade de ocupação em áreas de risco geológico-geotécnico (deslizamentos de talude) e hidrológico (inundações bruscas e remanso fluvial do Rio Negro).

Este projeto implementa um **pipeline completo e modular em Python** para prever o risco iminente de desastres naturais em nível de célula espacial (**500m x 500m**), integrando:
1. **Morfometria de Relevo (DEM):** Cota mínima, média e declividade em graus via gradiente numérico (`EPSG:31980`).
2. **Sensoriamento Remoto por Radar (SAR Sentinel-1):** Retroespalhamento de micro-ondas banda C nas polarizações $\text{VV}$, $\text{VH}$ e razão $\text{VV} - \text{VH}$ (sensível à saturação de solo e espelhos d'água).
3. **Hidrologia e Precipitação Horária:** Acumulados móveis em $1\text{h}$, $6\text{h}$, $24\text{h}$ e $72\text{h}$.
4. **Histórico da Defesa Civil:** Cruzamento geoespacial e temporal com chamados de ocorrências.
5. **Classificador LightGBM:** Calibrado com ponderação de classes raras (`scale_pos_weight = 176.41`) e split estritamente temporal.
6. **API REST FastAPI & Meteomatics API:** Consulta de risco por bairro ou coordenada utilizando telemetria meteorológica em tempo real.

---

## 🏗️ Arquitetura do Pipeline

```mermaid
flowchart TD
    subgraph S1["01. Grade e Relevo (EPSG:31980)"]
        DEM["DEM Manaus 30m"] --> Slope["Gradiente Numérico (Slope °)"]
        Grid["Grade 500m x 500m"] --> ZS["Zonal Stats (rasterstats)"]
        Slope --> ZS
        ZS --> Parquet1["grade_relevo.parquet"]
    end

    subgraph S2["02. Radar SAR Sentinel-1"]
        ASF["ASF Search (WGS84)"] --> Token1["EARTHDATA_TOKEN"]
        Token1 --> S1_Down["Sentinel-1 IW GRD_HD"]
        S1_Down --> SAR_dB["Calibração Linear -> dB & VV-VH"]
        SAR_dB --> Parquet2["sar_historico.parquet"]
    end

    subgraph S3["03. Precipitação Horária"]
        GPM["NASA GPM IMERG / Estações"] --> Token2["EARTHDATA_TOKEN"]
        Token2 --> Roll["Rolling Windows (1h, 6h, 24h, 72h)"]
        Roll --> Parquet3["chuva_horaria.parquet"]
    end

    subgraph S4["04. Integração Espaço-Temporal"]
        Parquet2 --> MergeAsof["pd.merge_asof (backward, 15 days)"]
        Parquet3 --> MergeAsof
        Parquet1 --> MergeStatic["Merge Estático (cell_id)"]
        MergeAsof --> MergeStatic
        DC["Ocorrências Defesa Civil"] --> Target["Target Binário (0 / 1)"]
        MergeStatic --> Target
        Target --> Parquet4["dataset_treino.parquet"]
    end

    subgraph S5["05. Modelagem e Treinamento"]
        Parquet4 --> Split["Split Estritamente Temporal (80/20)"]
        Split --> LGB["LightGBM Classifier (scale_pos_weight)"]
        LGB --> Eval["PR-AUC, F1, Recall & Threshold Tuning"]
        Eval --> Artifact["modelo_alagamento_deslizamento_lgb.joblib"]
    end

    subgraph S6["06. Operação em Tempo Real"]
        Artifact --> Engine["servico_previsao.py"]
        Meteo["Meteomatics Weather API"] --> Engine
        Engine --> API["api.py (FastAPI REST)"]
        Engine --> CLI["consultar_bairro.py (Terminal CLI)"]
    end
```

---

## 📁 Estrutura de Arquivos

```text
tratamento de dados/
├── .env                                # Arquivo ativo com credenciais de APIs
├── .env.example                        # Template de configuração e documentação das chaves
├── requirements.txt                    # Dependências do ecossistema Python
├── README.md                           # Documentação completa do projeto
│
├── 01_grade_relevo.py                  # Script 1: Grade regular 500m x 500m e extração de relevo/declividade
├── 02_coleta_sar.py                    # Script 2: Busca, download e processamento de radar Sentinel-1 SAR
├── 03_coleta_chuva.py                  # Script 3: Ingestão de chuva horária e janelas móveis (1h, 6h, 24h, 72h)
├── 04_montar_dataset.py                # Script 4: Integração com pd.merge_asof e mapeamento do target da Defesa Civil
├── 05_treinar_modelo.py                # Script 5: Treinamento do LightGBM com split temporal e métricas de eventos raros
├── 06_bairros_pontos_apoio.py          # Script 6: Polígonos dos bairros e hospitais/bombeiros (OpenStreetMap) para o totem
│
├── servico_previsao.py                 # Motor geoespacial, conector Meteomatics e inferência em tempo real
├── servico_totem.py                    # Pacote de dados do totem por localização (bairro, vizinhos, destino seguro)
├── api.py                              # Servidor web REST com FastAPI (também serve a tela do totem em /app/)
├── consultar_bairro.py                 # Utilitário CLI para consultas e simulações no terminal
│
├── index.html, alagamento.html, deslizamento.html, css/, js/, logo.svg   # Tela do totem (front)
├── dados_referencia/                   # Versionado: bairros_manaus.geojson e pontos_apoio_manaus.geojson
│
├── dados_brutos/                       # Armazenamento de dados raster e arquivos de entrada
│   ├── dem_manaus_utm.tif              # Modelo Digital de Elevação (DEM)
│   ├── ocorrencias_defesa_civil.csv    # Registros históricos da Defesa Civil de Manaus
│   └── sar/                            # GeoTIFFs orbitais baixados do Sentinel-1
│
├── dados_processados/                  # Arquivos intermediários otimizados em Apache Parquet
│   ├── grade_relevo.parquet            # Grade vetorial com centróides, cota e declividade
│   ├── sar_historico.parquet           # Série temporal calibrada de retroespalhamento SAR (VV, VH)
│   ├── chuva_horaria.parquet           # Matriz temporal horária com acumulados móveis
│   └── dataset_treino.parquet          # Dataset consolidado (~10M de linhas) pronto para ML
│
└── modelos/                            # Artefatos treinados de Machine Learning
    └── modelo_alagamento_deslizamento_lgb.joblib  # Classificador LightGBM + threshold calibrado + features
```

---

## ⚙️ Instalação e Configuração

### 1. Clonar ou Acessar o Diretório do Projeto
```bash
cd "tratamento de dados"
```

### 2. Criar e Ativar Ambiente Virtual (Recomendado)
```bash
python -m venv venv

# No Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# No Linux / macOS:
source venv/bin/activate
```

### 3. Instalar Dependências
```bash
pip install -r requirements.txt
```

### 4. Configurar as Variáveis de Ambiente (`.env`)
Copie o arquivo de exemplo para `.env` e preencha as credenciais:

```ini
# NASA Earthdata Login (Obrigatório para download de cenas reais Sentinel-1 e GPM IMERG)
# Cadastre-se gratuitamente em: https://urs.earthdata.nasa.gov/users/tokens
EARTHDATA_TOKEN=seu_bearer_token_aqui_da_nasa_earthdata

# Meteomatics API (Para dados meteorológicos em tempo real)
# Cadastre-se em: https://www.meteomatics.com/en/weather-api/
METEOMATICS_USERNAME=seu_usuario_meteomatics
METEOMATICS_PASSWORD=sua_senha_meteomatics

# INMET (Opcional)
INMET_TOKEN=seu_token_api_inmet_se_aplicavel
```

> [!NOTE]
> O sistema possui **mecanismos de resiliência e contingência meteorológica automática**: caso você não possua credenciais ativas da NASA ou Meteomatics no momento, todos os scripts ativam automaticamente dados calibrados com a dinâmica climática e topográfica real de Manaus ou rotas abertas (Open-Meteo), permitindo testar o pipeline e a API imediatamente sem bloqueios.

---

## 🚀 Guia de Execução dos Scripts

Os scripts foram desenhados para serem executados em **ordem sequencial** e **de forma independente**, persistindo etapas intermediárias em arquivos `.parquet`.

### 1. `01_grade_relevo.py`
- **O que faz:**
  1. Converte o Bounding Box de Manaus de WGS84 (`min_lon=-60.15, min_lat=-3.16, max_lon=-59.80, max_lat=-2.90`) para o sistema métrico oficial **SIRGAS 2000 / UTM zona 20S (`EPSG:31980`)**.
  2. Constrói uma malha regular com **4.582 células** de **500m x 500m** com identificadores únicos (`cell_00000` a `cell_04581`).
  3. Lê o DEM local (`dados_brutos/dem_manaus_utm.tif`) ou gera um DEM sintético 30m calibrado com a Formação Alter do Chão caso o arquivo ainda não exista.
  4. Calcula a declividade do terreno em graus através do gradiente numérico (`np.gradient`):
     $$\text{declividade} = \arctan\left(\sqrt{\left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}\right)$$
  5. Extrai estatísticas zonais por célula (`elev_media_m`, `elev_min_m`, `declividade_media`, `declividade_max`).
- **Como executar:**
  ```bash
  python 01_grade_relevo.py
  ```
- **Saída gerada:** `dados_processados/grade_relevo.parquet`

---

### 2. `02_coleta_sar.py`
- **O que faz:**
  1. Reprojeta a área urbana para WGS84 e realiza a busca de cenas **Sentinel-1 (`IW GRD_HD`)** via API pública `asf_search`.
  2. Autentica com `EARTHDATA_TOKEN` para autorizar transferências dos servidores da NASA ASF DAAC.
  3. Converte matrizes de amplitude/intensidade linear para decibéis:
     $$\text{dB} = 10 \cdot \log_{10}(\text{DN}^2)$$
  4. Extrai estatísticas zonais de retroespalhamento por célula e data:
     - `sar_vv_mean_db`, `sar_vv_std_db` (sensível a rugosidade superficial e áreas inundadas)
     - `sar_vh_mean_db`, `sar_vh_std_db` (polarização cruzada, sensível à biomassa vegetal)
     - `sar_diferenca_vv_vh` ($\text{VV} - \text{VH}$)
- **Como executar:**
  ```bash
  python 02_coleta_sar.py
  ```
- **Saída gerada:** `dados_processados/sar_historico.parquet`

---

### 3. `03_coleta_chuva.py`
- **O que faz:**
  1. Ingere séries horárias de precipitação para todas as 4.582 células ao longo de 90 dias do inverno amazônico (2.160 horas consecutivas = ~9,9 milhões de registros).
  2. Suporta conexão com satélite **NASA GPM IMERG** (`earthaccess`) e estações pluviométricas de superfície (CEMADEN/INMET) via interpolação espacial com `cKDTree`.
  3. Calcula janelas móveis temporais (*rolling windows*) vetorizadas por célula:
     - `chuva_acum_1h`: Precipitação horária instantânea
     - `chuva_acum_6h`: Acumulado de curto prazo (gatilho de enxurradas e refluxo de bueiros)
     - `chuva_acum_24h`: Acumulado diário
     - `chuva_acum_72h`: Saturação hídrica do solo (gatilho crítico de escorregamento de encostas)
- **Como executar:**
  ```bash
  python 03_coleta_chuva.py
  ```
- **Saída gerada:** `dados_processados/chuva_horaria.parquet`

---

### 4. `04_montar_dataset.py`
- **O que faz:**
  1. Executa a junção temporal assimétrica via `pd.merge_asof`:
     ```python
     pd.merge_asof(
         df_chuva_ord,
         df_sar_ord,
         on="timestamp",
         by="cell_id",
         direction="backward",
         tolerance=pd.Timedelta("15 days")
     )
     ```
     A direção `"backward"` assegura que cada instante horário $t$ seja relacionado exclusivamente à **última passagem anterior de radar Sentinel-1**, **eliminando 100% de qualquer vazamento de dados futuros (*data leakage*)**.
  2. Integra os atributos morfométricos estáticos de relevo da grade (`EPSG:31980`).
  3. Cruza com os registros históricos da Defesa Civil (`dados_brutos/ocorrencias_defesa_civil.csv`), criando a variável alvo binária `target` (`1` = desastre, `0` = normalidade).
- **Como executar:**
  ```bash
  python 04_montar_dataset.py
  ```
- **Saída gerada:** `dados_processados/dataset_treino.parquet` (9.897.120 linhas x 20 colunas)

---

### 5. `05_treinar_modelo.py`
- **O que faz:**
  1. **Divisão Estritamente Temporal (80% treino / 20% teste):** Treino até 13/03/2024 (7.917.696 amostras); Teste após 13/03/2024 (1.979.424 amostras não observadas).
  2. **Tratamento de Desbalanceamento Extremo:** As ocorrências de desastre representam apenas 0,56% da série temporal. O classificador **LightGBM** é treinado com `scale_pos_weight = 176.41`.
  3. **Métricas para Eventos Raros:**
     - **PR-AUC (Average Precision):** `0.6991`
     - **ROC-AUC:** `0.9988`
     - **Recall no Teste:** `99.87%` (10.976 de 10.990 desastres detectados no futuro não observado)
     - **F1-Score:** `0.82` (Threshold otimizado: `0.333`)
  4. Salva o pacote com o modelo, lista de 16 features e threshold calibrado.
- **Como executar:**
  ```bash
  python 05_treinar_modelo.py
  ```
- **Saída gerada:** `modelos/modelo_alagamento_deslizamento_lgb.joblib`

---

### 6. `06_bairros_pontos_apoio.py`
- **O que faz:** baixa do OpenStreetMap (Overpass API) os **polígonos dos bairros de Manaus** e os **pontos de apoio** (hospitais, quartéis de bombeiros, Defesa Civil e pontos de encontro). Os arquivos ficam versionados em `dados_referencia/`, então só é preciso rodar de novo para atualizar a base.
- **Como executar:**
  ```bash
  python 06_bairros_pontos_apoio.py
  ```
- **Saída gerada:** `dados_referencia/bairros_manaus.geojson` e `dados_referencia/pontos_apoio_manaus.geojson`
- Sem esses arquivos o totem continua funcionando: aproxima os bairros do catálogo por círculos e usa sempre o "bairro mais seguro" como destino.

---

## 🌐 API REST em Tempo Real (`api.py`)

A API expõe serviços web assíncronos baseados em **FastAPI** para consultar o risco de qualquer bairro ou coordenada em tempo real.

### Como Iniciar o Servidor
```bash
python api.py
```
*O servidor iniciará em `http://0.0.0.0:8000` com hot-reload ativo.*

### Documentação Swagger e Endpoints
- **Documentação Interativa Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Documentação Alternativa ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

| Método | Endpoint | Descrição |
| :---: | :--- | :--- |
| `GET` | `/` | Retorna o status operacional do sistema, metadados do modelo e limiares calibrados. |
| `GET` | `/bairros` | Lista todos os bairros pré-catalogados de Manaus com suas zonas, coordenadas e histórico. |
| `GET` | `/previsao/{nome_bairro}` | **Consulta em tempo real o risco do bairro** buscando a telemetria pluviométrica da Meteomatics. |
| `POST` | `/previsao` | Consulta parametrizada por coordenadas customizadas ou com simulação de volumes de chuva. |
| `GET` | `/totem?lat=&lng=` | **Pacote completo da tela do totem** (formato de `js/dados.js`) para o ponto onde ele está instalado. Parâmetros opcionais: `nome` (local do totem) e `fator_chuva` (multiplica a chuva real, para simulação). |
| `GET` | `/totem/bairros` | Bairros de Manaus (nome e ponto central) para o seletor de localização do painel de teste. |
| `GET` | `/app/` | Tela do totem servida pela própria API. |

---

## 🖥️ Totem (front-end)

O totem é a tela vertical (1080x1920) instalada em vários pontos da cidade. Cada totem envia a sua coordenada para `GET /totem` e recebe, numa resposta só:

1. **Bairro onde está** (ponto dentro do polígono OSM) e os **bairros que fazem divisa** com ele, cada um com nível de deslizamento e alagamento (1 = tranquilo … 4 = perigo extremo).
2. **Próximas horas** (agora, 1 h, 3 h, 5 h, amanhã) e **próximos dias** (hoje + 4), rodando o modelo sobre a série horária de chuva (Meteomatics → Open-Meteo → estimada).
3. **Para onde ir** (`pontoSeguro`) e o que fazer (`acao`: `ficar`, `preparar` ou `sair`). O destino é o mesmo para os dois riscos e precisa estar livre de ambos nas próximas 5 h:
   - hospital, bombeiros, Defesa Civil ou ponto de encontro num bairro que aparece **tranquilo (verde) nos dois riscos** — se o bairro está alagando ou com encosta em perigo, o hospital dele provavelmente também está — e com entorno de 600 m tranquilo;
   - se esse ponto ficar bem mais longe (> 2 km e > 1,5× a distância) que um **bairro tranquilo**, o totem manda para o ponto mais próximo desse bairro;
   - sem bairro tranquilo por perto, indica a "área mais tranquila" fora do bairro do totem;
   - pontos do OSM que não atendem emergência (terreno, CAPS, UBS, veterinário...) são ignorados.
   - Em **tranquilo** o totem não manda ninguém sair: o mapa mostra só o bairro e "Não precisa sair de casa". Em **atenção**, "Se precisar sair"; em **perigo/extremo**, "Vá agora para".

Como o modelo é usado (sem retreinar):
- **Features de chuva nas mesmas janelas do treino:** `03_coleta_chuva.py` usa `rolling("Nh", closed="both")` em dados horários, ou seja, o acumulado de N horas soma N+1 leituras (`chuva_acum_1h` = hora atual + anterior) e `chuva_mm` é só a hora atual. O totem e `/previsao` calculam exatamente assim.
- **Alagamento:** probabilidade do LightGBM → 1 (< 20%), 2 (< limiar F1), 3 (< 65%), 4 (≥ 65%), com piso "atenção" em baixio (cota ≤ 32 m) com metade da chuva do gatilho do treino. O alvo do treino são as ocorrências da Defesa Civil, e no dataset sintético todas são de alagamento.
- **Deslizamento:** o DEM sintético não passa de ~9° de declividade, então o gatilho de deslizamento do treino (≥ 16°) nunca ocorreu e o modelo não aprendeu esse risco. O totem aplica a mesma regra que rotulou deslizamentos (acum. 72 h ≥ 80 mm e 6 h ≥ 20 mm → perigo; 72 h ≥ 120 e 6 h ≥ 40 → extremo; 72 h ≥ 50 → atenção) nas encostas: 16° ou, no DEM sintético, as 15% células mais íngremes. Com o DEM real basta retreinar para o modelo cobrir os dois riscos.
- O nível do bairro é o da sua pior célula (há perigo em algum ponto do bairro).
- **Voz:** só fala em atenção, perigo ou extremo; com tudo tranquilo o totem fica em silêncio.

### Como abrir
```bash
python api.py
```
Abra **http://localhost:8000/app/** (ou o `index.html` direto do disco — o `js/config.js` aponta para `http://localhost:8000`).

- **Localização do totem:** `local` em `js/config.js`, ou na URL `index.html?lat=-3.1336&lng=-60.0233&local=Praça%20da%20Matriz`.
- **Painel de teste** (esquerda, com `MANUAL = true` em `js/totem.js`): clique no mapa de satélite ou escolha um bairro para mover o totem; "Chuva (simulação no modelo)" multiplica a chuva real para ver o totem reagir. A escolha fica salva no navegador; "Voltar ao local padrão" limpa.
- **Mapa:** imagem de satélite Esri World Imagery (estilo Google Earth, sem chave de API) + ruas/nomes, com a rota a pé (OSRM). O totem não tem toque: o **zoom é automático** — a tela abre afastada (bairro do totem, vizinhos e destino) e depois de 3 s aproxima no caminho até o destino (ou no próprio bairro, quando está tudo tranquilo).
- **Tempo real:** botão no topo do painel de teste (ligado por padrão via `tempoReal` em `js/config.js`). Busca a API a cada 15 s, pede ao servidor uma consulta nova da chuva (limitada a 1x por minuto por região, para não estourar a cota) e mostra "● AO VIVO" no topo. Mexer nos níveis/cenários de teste ou na simulação de chuva desliga o tempo real.
- **Sem API:** se a API não responder, o totem mostra os dados de exemplo de `js/dados.js` com o aviso "SEM CONEXÃO COM A API" e volta sozinho quando ela responder.

---

### Exemplos de Requisições e Respostas

#### Exemplo 1: Consulta em Tempo Real via GET
```bash
curl -X GET "http://localhost:8000/previsao/Educandos"
```

**Resposta JSON:**
```json
{
  "bairro": "Educandos",
  "zona_manaus": "Sul",
  "coordenadas": {
    "latitude": -3.1417,
    "longitude": -60.0125
  },
  "celula_grade": {
    "cell_id": "cell_01744",
    "distancia_m": 84.2,
    "elev_media_m": 43.1,
    "elev_min_m": 40.7,
    "declividade_media_graus": 2.1,
    "declividade_max_graus": 6.2
  },
  "dados_meteorologicos": {
    "fonte": "Meteomatics Weather API (Tempo Real)",
    "chuva_mm": 0.0,
    "chuva_acum_1h": 0.0,
    "chuva_acum_6h": 0.0,
    "chuva_acum_24h": 0.4,
    "chuva_acum_72h": 5.4,
    "timestamp_consulta": "2026-11-15T12:02:42.128456"
  },
  "radar_sentinel1": {
    "sar_vv_mean_db": -11.54,
    "sar_vv_std_db": 2.18,
    "sar_vh_mean_db": -18.14,
    "sar_vh_std_db": 2.05,
    "sar_diferenca_vv_vh": 6.60
  },
  "avaliacao_risco": {
    "probabilidade_desastre_pct": 0.0,
    "limiar_decisao_pct": 33.29,
    "nivel_alerta": "BAIXO",
    "cor_alerta": "VERDE",
    "ameaca_predita": "Sem Ocorrência Iminente",
    "fatores_determinantes": [
      "Volume de precipitação e retroespalhamento de radar dentro da faixa de segurança"
    ],
    "recomendacoes_defesa_civil": [
      "Condições normais de operação na malha urbana."
    ]
  },
  "historico_bairro": "Área crítica de baixio na bacia do Igarapé do Educandos, suscetível a alagamentos severos por remanso fluvial."
}
```

#### Exemplo 2: Simulação de Tempestade Severa via POST
```bash
curl -X POST "http://localhost:8000/previsao" \
     -H "Content-Type: application/json" \
     -d '{
       "bairro": "São Raimundo",
       "chuva_acum_1h": 65.0,
       "chuva_acum_6h": 110.0,
       "chuva_acum_24h": 125.0,
       "chuva_acum_72h": 140.0
     }'
```

**Diagnóstico Retornado:**
- `nivel_alerta`: `"EMERGÊNCIA MÁXIMA"`
- `probabilidade_desastre_pct`: `99.77%`
- `ameaca_predita`: `"Risco Misto (Alagamento Urbano e Deslizamento de Encosta)"`
- `recomendacoes_defesa_civil`:
  - *"Evitar tráfego em vias rebaixadas próximas a igarapés."*
  - *"Evacuar preventivamente residências situadas na base ou topo de taludes úmidos."*

---

## 🌐 Site de divulgação (`site/`)

Página de apresentação do Projeto Cosmos com o vídeo do projeto e o totem rodando de verdade dentro de um aparelho.

- Abra `site/index.html` no navegador (ou sirva a pasta do projeto com qualquer servidor estático). O totem embutido é o próprio `index.html` da raiz em **modo vitrine** (`index.html?vitrine`): sem painel de teste, sem voz, com os dados de exemplo de `js/dados.js` — nunca mostra "sem conexão" na apresentação.
- Ao rolar a seção "Como funciona", cada passo troca a tela do totem; os botões "Simule a chuva" mudam o nível (o site conversa com o totem por `postMessage`).
- **Vídeo:** toca dentro da página a partir de versões leves (`site/assets/video-cosmos.webm` e `.mp4`, ~5 MB cada) geradas do `video nasa apps.mp4`; se o navegador não conseguir tocar nenhum dos dois, usa o player do YouTube ([61hn_QcZrLA](https://www.youtube.com/watch?v=61hn_QcZrLA)). Para regerar:
  ```bash
  ffmpeg -i "video nasa apps.mp4" -vf scale=1280:-2 -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -c:a aac -b:a 112k -movflags +faststart site/assets/video-cosmos.mp4
  ffmpeg -i "video nasa apps.mp4" -vf scale=1280:-2 -c:v libvpx-vp9 -b:v 0 -crf 37 -row-mt 1 -c:a libopus -b:a 96k site/assets/video-cosmos.webm
  ```
- **Abra por http** (recomendado): na raiz do projeto rode `python -m http.server 8080` e acesse **http://localhost:8080/site/**. Aberto direto do disco (`file://`), alguns navegadores — como o navegador embutido do VS Code — bloqueiam vídeo e o YouTube recusa o player embutido.
- **Cursor:** com mouse, o site usa um cursor próprio (ponto + anel que segue com atraso, cresce sobre botões, mostra "Assistir"/"Abrir" no vídeo e nos PDFs e faz um respingo no clique). No celular e com "reduzir movimento" fica o cursor normal.
- **Malhas interativas:** a abertura, o vídeo, a tecnologia e a chamada final têm uma grade em `<canvas>` que o cursor empurra e arrasta (física de mola), respira sozinha quando parada e solta uma onda de radar a cada clique. Cada malha só anima enquanto a seção está na tela.
- **Idioma:** o site abre em **inglês** e tem o seletor **EN / PT-BR** na barra de navegação (a escolha fica salva no navegador; `?lang=pt` força o português). O texto em inglês é o próprio HTML; as traduções ficam em `site/js/textos-pt.js`, pela chave `data-i18n` (texto) ou `data-i18n-attr="atributo:chave"` (alt, aria-label, title…). Texto novo no site precisa de chave nos dois lugares. A tela do totem continua em português, como na rua.
- **Cursor sobre o totem:** o totem é um quiosque (`cursor: none`) dentro de um iframe; o site repassa os movimentos e cliques de lá para a página, então o cursor próprio, a inclinação 3D e a malha seguem funcionando — e o totem se endireita quando o mouse chega na tela dele.
- **Ver mais detalhes / Documentos:** abre uma janela com os PDFs da raiz do projeto (`as pessoas que vivem em situações de periferia e ribeirinhos.pdf` — Storytelling Canvas — e `5w2h.pdf`), com capa, "Abrir PDF" e "Baixar".
- Imagens ilustrativas ou geradas por IA aparecem com selo indicando isso.
- Para publicar, suba a pasta do projeto inteira (o site usa `../index.html`, `../js`, `../css` e os PDFs da raiz).

---

## 💻 Script de Consulta no Terminal (`consultar_bairro.py`)

Para operadores de campo ou testes ágeis sem necessidade de navegador ou cliente HTTP, utilize o script CLI:

### 1. Consultar um Bairro Específico (Tempo Real com Meteomatics)
```bash
python consultar_bairro.py --bairro "São Raimundo"
python consultar_bairro.py --bairro "Centro"
python consultar_bairro.py --bairro "Jorge Teixeira"
python consultar_bairro.py --bairro "Flores"
```

### 2. Listar Todos os Bairros Urbanos Cadastrados
```bash
python consultar_bairro.py --listar
```

### 3. Teste de Estresse / Simulação de Chuva Crítica
```bash
python consultar_bairro.py --bairro "São Raimundo" --simular-chuva-extrema
```

### 4. Diagnóstico em Lote para Toda a Cidade de Manaus
```bash
python consultar_bairro.py --todos
```

---

## 🗺️ Fundamentos Geográficos e Geotécnicos de Manaus

| Parâmetro | Definição Oficial Adotada | Justificativa Técnica |
| :--- | :--- | :--- |
| **CRS Métrico Oficial** | `EPSG:31980` (SIRGAS 2000 / UTM zona 20S) | Padrão cartográfico oficial para Manaus (meridiano central 59°W). Imprescindível para cálculos métricos exatos de área, distâncias e declividade. |
| **CRS Geográfico** | `EPSG:4326` (WGS84) | Utilizado para consultas aos catálogos abertos da NASA ASF, GPM e Meteomatics API. |
| **Bounding Box Urbana** | `min_lon=-60.15, min_lat=-3.16, max_lon=-59.80, max_lat=-2.90` | Cobre integralmente a mancha urbana contínua e as bacias dos principais igarapés de Manaus. |
| **Tamanho da Célula** | $500\text{m} \times 500\text{m}$ ($0{,}25\text{ km}^2$) | Escala tática ideal para a Defesa Civil isolar quarteirões e trechos de microbacias sem sobrecarregar a memória computacional. |
| **Gatilho de Alagamento** | Cotas baixas ($\le 32\text{m}$) e chuvas convectivas ($> 35\text{mm}/1\text{h}$ ou $> 50\text{mm}/6\text{h}$) | Corresponde aos transbordamentos das calhas do Mindu, Educandos e São Raimundo. |
| **Gatilho de Deslizamento**| Declividade acentuada ($> 6^\circ$ média ou $> 15^\circ$ máxima) e saturação ($> 80\text{mm}/72\text{h}$) | Limiar geotécnico em que a pressão neutra da água na Formação Alter do Chão causa ruptura ao cisalhamento de taludes habitados. |

---

## 🛡️ Licença e Boas Práticas
Projeto desenvolvido sob licença MIT. Construído com padrões de engenharia de software para missão crítica, logs estruturados com o módulo `logging`, validação de dados via Pydantic e tolerância a falhas de rede.
