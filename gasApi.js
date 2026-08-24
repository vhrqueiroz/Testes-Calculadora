/**
 * =============================================================================
 * gasApi.js — Integração do Frontend com o Google Apps Script Web App
 * =============================================================================
 *
 * INSTRUÇÕES DE USO:
 *   1. Cole a URL do seu Web App (gerada no passo de deploy) em GAS_WEB_APP_URL.
 *   2. Inclua este arquivo no seu index.html:
 *        <script src="../GoogleAppsScript/gasApi.js"></script>
 *   3. Substitua as chamadas aos arrays locais (DATA, CAOS_DATA, THIRTY_DATA)
 *      pelas funções abaixo.
 *
 * NOMES DAS ABAS (exemplos — use exatamente os nomes da sua planilha):
 *   "ME04 - Caos Ascendente"
 *   "ME05 - Escuridão Absoluta"
 *   "Celebração 30 anos"
 * =============================================================================
 */

// ⚠️  SUBSTITUA pela URL do seu Web App após o deploy no Google Apps Script
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyCLxcctfFeAKy2haDUhFHNeYvVjeHYyEFWZ3UKUm5B426zJTY6M5kNZEcuEs8UEVQW/exec";

// --------------------------------------------------------------------------
// 1. LER registros de uma coleção (GET)
// --------------------------------------------------------------------------

/**
 * Busca todos os registros de uma aba/coleção específica.
 *
 * @param {string} sheetName - Nome exato da aba na planilha.
 *                             Ex: "ME04 - Caos Ascendente"
 * @returns {Promise<Array>} - Array de objetos com os dados dos registros.
 *
 * Exemplo de uso:
 *   const registros = await getRecords("ME04 - Caos Ascendente");
 *   DATA.length = 0;
 *   registros.forEach(r => DATA.push(r));
 *   render();
 */
async function getRecords(sheetName) {
  const url = `${GAS_WEB_APP_URL}?action=getRecords&sheet=${encodeURIComponent(sheetName)}`;

  console.log(`[GAS API] GET → ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow", // necessário para o redirect do GAS
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (!json.success) {
      throw new Error(json.error || "Erro desconhecido ao buscar registros.");
    }

    console.log(`[GAS API] ✅ ${json.data.length} registro(s) carregado(s) de "${sheetName}"`);
    return json.data;

  } catch (err) {
    console.error(`[GAS API] ❌ Falha ao buscar registros de "${sheetName}":`, err);
    alert(`Erro ao carregar dados da coleção "${sheetName}".\nDetalhes: ${err.message}`);
    return []; // retorna array vazio para não quebrar a UI
  }
}

// --------------------------------------------------------------------------
// 2. INSERIR um registro (POST addRecord)
// --------------------------------------------------------------------------

/**
 * Envia um novo registro para ser salvo na planilha.
 *
 * @param {string} sheetName - Nome exato da aba destino.
 * @param {Object} recordData - Objeto com os campos do registro.
 *                              Não precisa incluir o campo "ID" (gerado pelo backend).
 * @returns {Promise<number|null>} - ID do registro criado, ou null em caso de erro.
 *
 * Exemplo de uso:
 *   const novoRegistro = {
 *     "Bloco": "Mega Evolução",
 *     "Coleção": "Caos Ascendente",
 *     "Produto": "Booster Box",
 *     "Nacionalidade": "Brasil",
 *     "Total de Boosters": 36,
 *     "Total de Cartas": 216,
 *     "Double Rare": 4,
 *     "Ultra Rare": 1,
 *     "Illustration Rare": 2,
 *     "Special Illustration Rare": 0,
 *     "Mega Hyper Rare": 0,
 *     "Total": 7
 *   };
 *   const id = await addRecord("ME04 - Caos Ascendente", novoRegistro);
 *   if (id) {
 *     novoRegistro.ID = id;
 *     DATA.push(novoRegistro);
 *     render();
 *   }
 */
async function addRecord(sheetName, recordData) {
  const body = {
    action: "addRecord",
    sheetName: sheetName,
    data: recordData,
  };

  console.log(`[GAS API] POST addRecord → aba: "${sheetName}"`, recordData);

  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      redirect: "follow",
      // Nota: não definimos Content-Type como application/json porque o GAS
      // não aceita preflight CORS (OPTIONS). Usamos text/plain com body JSON.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (!json.success) {
      throw new Error(json.error || "Erro desconhecido ao inserir registro.");
    }

    console.log(`[GAS API] ✅ Registro inserido com ID ${json.id} na aba "${sheetName}"`);
    return json.id;

  } catch (err) {
    console.error(`[GAS API] ❌ Falha ao inserir registro em "${sheetName}":`, err);
    alert(`Erro ao salvar o registro na coleção "${sheetName}".\nDetalhes: ${err.message}`);
    return null;
  }
}

// --------------------------------------------------------------------------
// 3. DELETAR um registro (POST deleteRecord)
// --------------------------------------------------------------------------

/**
 * Remove um registro da planilha pelo seu ID.
 *
 * @param {string} sheetName - Nome exato da aba onde o registro está.
 * @param {number} id        - ID do registro a ser excluído.
 * @returns {Promise<boolean>} - true se excluído com sucesso, false caso contrário.
 *
 * Exemplo de uso:
 *   const ok = await deleteRecord("ME04 - Caos Ascendente", 42);
 *   if (ok) {
 *     DATA = DATA.filter(d => d.ID !== 42);
 *     render();
 *   }
 */
async function deleteRecord(sheetName, id) {
  const body = {
    action: "deleteRecord",
    sheetName: sheetName,
    id: id,
  };

  console.log(`[GAS API] POST deleteRecord → aba: "${sheetName}", ID: ${id}`);

  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (!json.success) {
      throw new Error(json.error || "Erro desconhecido ao excluir registro.");
    }

    console.log(`[GAS API] ✅ Registro ID ${id} excluído da aba "${sheetName}"`);
    return true;

  } catch (err) {
    console.error(`[GAS API] ❌ Falha ao excluir registro ID ${id} de "${sheetName}":`, err);
    alert(`Erro ao excluir o registro ID ${id} da coleção "${sheetName}".\nDetalhes: ${err.message}`);
    return false;
  }
}

// --------------------------------------------------------------------------
// 4. Helpers de UI (opcional — use para indicar carregamento)
// --------------------------------------------------------------------------

/**
 * Exibe ou oculta um indicador de carregamento na tela.
 * Crie um elemento <div id="loadingOverlay"> no seu HTML se quiser usar.
 *
 * @param {boolean} visible
 */
function setLoading(visible) {
  const el = document.getElementById("loadingOverlay");
  if (el) el.style.display = visible ? "flex" : "none";
}

// --------------------------------------------------------------------------
// 5. Inicialização: carrega dados da coleção ao entrar na tela
// --------------------------------------------------------------------------

/**
 * Fluxo completo: ao selecionar uma coleção, carrega os dados e renderiza.
 *
 * Integre chamando esta função nos seus event listeners de seleção de coleção.
 *
 * @param {string}   sheetName  - Ex: "ME04 - Caos Ascendente"
 * @param {Array}    dataArray  - Referência ao array de dados (ex: CAOS_DATA)
 * @param {Function} renderFn  - Função de renderização (ex: render ou tRender)
 */
async function loadCollectionData(sheetName, dataArray, renderFn) {
  setLoading(true);
  try {
    const records = await getRecords(sheetName);

    // Limpa o array existente e popula com os dados da planilha
    dataArray.length = 0;
    records.forEach(function(r) {
      // Converte campos numéricos (a planilha pode retornar como string)
      const numericFields = [
        "ID", "Total de Boosters", "Quantidade de Cartas", "Total de Cartas",
        "Double Rare", "Ultra Rare", "Classic Rare", "Illustration Rare",
        "Special Illustration Rare", "Mega Hyper Rare", "Futuristic Rare", "Total"
      ];
      numericFields.forEach(function(field) {
        if (r[field] !== undefined && r[field] !== "") {
          r[field] = Number(r[field]);
        }
      });
      // Garante que o campo Incluir seja booleano
      r["Incluir"] = r["Incluir"] !== false && r["Incluir"] !== "FALSE";
      dataArray.push(r);
    });

    renderFn();
  } finally {
    setLoading(false);
  }
}

// --------------------------------------------------------------------------
// 6. LOGIN (POST login)
// --------------------------------------------------------------------------

/**
 * Valida o usuário e senha na planilha.
 */
async function loginApp(usuario, senha) {
  const body = {
    action: "login",
    usuario: usuario,
    senha: senha
  };

  try {
    const response = await fetch(GAS_WEB_APP_URL, { // Lembre de colar a nova URL lá no topo
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const json = await response.json();
    
    // Se o servidor devolver um erro (ex: ação desconhecida, ou aba não encontrada)
    if (json.error) {
      alert("ERRO NO SERVIDOR: " + json.error);
    }
    
    return json.success; 

  } catch (err) {
    throw err;
  }
}