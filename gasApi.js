/* Cliente da API do Pokémon TCG Dashboard. O token de sessão existe somente em memória. */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx1TVw6SNu1tNCrrw1IoNhW59Xg9dyxtCm8EEFnK2BySuBvD6cXdEpOwxB7a7Rv1Au4/exec";
const MAP_STORAGE_KEY = "pokemonTcgDashboard.mapeamento.v1";
const NUMERIC_FIELDS = ["ID", "Total de Boosters", "Quantidade de Cartas", "Total de Cartas", "Double Rare", "Ultra Rare", "Classic Rare", "Illustration Rare", "Special Illustration Rare", "Mega Hyper Rare", "Mega Attack Rare", "Futuristic Rare", "Total"];
const RETRY_PAUSES = [600, 1500];
const REQUEST_TIMEOUT_MS = 30000;
let _sessionToken = null;
const _loadRequests = new WeakMap();
let _loadRequestId = 0;

function _reportMutationError(err) {
  window.lastApiError = err && err.message ? err.message : "Não foi possível concluir a alteração.";
  if (typeof window.onMutationError === "function") window.onMutationError(window.lastApiError);
}
function _notifySessionExpired(message) {
  _sessionToken = null;
  if (typeof window.onSessionExpired === "function") window.onSessionExpired(message || "Sessão expirada. Faça login novamente.");
}
function _makeRequestId() {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14);
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : ("req_" + Date.now().toString(36) + "_fallback");
}
function _delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function _isTransient(error) {
  return error.name === "AbortError" || error instanceof TypeError || error.code === "RESPOSTA_INVALIDA" ||
    error.status === 404 || error.status === 429 || error.status >= 500;
}

/* Envia um POST ao Web App. Falhas de rede, timeout, 404/429/5xx e resposta não JSON são
   repetidas até 2 vezes; erros devolvidos pelo servidor (success:false) não são repetidos. */
async function _post(payload) {
  for (let attempt = 0; ; attempt++) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const response = await fetch(GAS_WEB_APP_URL, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), signal: controller ? controller.signal : undefined });
      if (!response.ok) {
        const error = new Error("Erro HTTP " + response.status + " ao comunicar com o Web App.");
        error.code = "HTTP_" + response.status; error.status = response.status;
        throw error;
      }
      let json;
      try { json = await response.json(); } catch (parseError) {
        const error = new Error("O Web App respondeu em formato não JSON."); error.code = "RESPOSTA_INVALIDA";
        throw error;
      }
      if (!json || json.success !== true) {
        let message = json && json.error ? json.error : "Não foi possível concluir a solicitação.";
        const unknownAction = /Ação (?:POST|GET) desconhecida/i.test(message);
        if (unknownAction) message += " O endpoint respondeu, mas a implantação não reconhece esta ação. Publique uma nova versão do Apps Script e confirme a URL /exec.";
        const error = new Error(message);
        error.code = json && json.code ? json.code : (unknownAction ? "DEPLOYMENT_DESATUALIZADO" : "ERRO_SOLICITACAO");
        error.fromServer = true;
        throw error;
      }
      return json;
    } catch (caught) {
      let error = caught instanceof Error ? caught : new Error(String(caught));
      if (!error.fromServer && attempt < RETRY_PAUSES.length && _isTransient(error)) { await _delay(RETRY_PAUSES[attempt]); continue; }
      if (error.name === "AbortError") { error = new Error("Tempo limite de 30 segundos excedido ao acessar o Web App."); error.code = "TIMEOUT"; }
      else if (error.status === 404) error.message = "O servidor do Google não respondeu após várias tentativas. Verifique a conexão e a URL /exec da implantação.";
      else if (error instanceof TypeError && !error.code) { error.code = "REDE_OU_CORS"; error.message = "Falha de rede/CORS após várias tentativas. Verifique a conexão e a implantação."; }
      error.attempts = attempt + 1;
      if (error.code === "SESSAO_EXPIRADA") _notifySessionExpired(error.message);
      throw error;
    } finally { if (timer !== null) clearTimeout(timer); }
  }
}

/* Converte os campos numéricos e descarta a coluna legada "Incluir". Devolve cópias. */
function normalizeRecords(records) {
  return records.map(function(record) {
    const r = Object.assign({}, record);
    NUMERIC_FIELDS.forEach(function(field) {
      if (r[field] === "") r[field] = 0;
      else if (r[field] !== undefined) {
        const value = Number(r[field]);
        r[field] = Number.isFinite(value) ? value : 0;
      }
    });
    delete r["Incluir"];
    return r;
  });
}

async function loadMapeamento() {
  try {
    const result = await _post({ action: "getMapeamento" });
    if (Array.isArray(result.data) && result.data.length) {
      window.productMappingVersion = result.version || "";
      try { localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify({ version: result.version || "", data: result.data })); } catch (storageError) {}
      return result.data;
    }
  } catch (requestError) {}
  try {
    const saved = localStorage.getItem(MAP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length) { window.productMappingVersion = parsed.version || ""; return parsed.data; }
    }
  } catch (storageError) {}
  return null;
}
async function getRecords(sheetName) {
  try {
    const json = await _post({ action: "getRecords", sheetName: sheetName, token: _sessionToken });
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    if (err.code !== "SESSAO_EXPIRADA" && typeof window.onLoadError === "function") window.onLoadError(sheetName, err.message || "Não foi possível carregar os dados.");
    return null;
  }
}
async function addRecord(sheetName, recordData) {
  try {
    const data = Object.assign({}, recordData || {});
    delete data.ID;
    delete data["Usuário"];
    const json = await _post({ action: "addRecord", sheetName: sheetName, data: data, token: _sessionToken, requestId: _makeRequestId() });
    return json.id;
  } catch (err) {
    if (err.code !== "SESSAO_EXPIRADA") _reportMutationError(err);
    return null;
  }
}
async function deleteRecord(sheetName, id) {
  try {
    await _post({ action: "deleteRecord", sheetName: sheetName, id: id, token: _sessionToken });
    return true;
  } catch (err) {
    // Se a 1ª tentativa excluiu mas a resposta se perdeu, a repetição não encontra o registro.
    if (err.code === "REGISTRO_NAO_ENCONTRADO" && err.attempts > 1) return true;
    if (err.code !== "SESSAO_EXPIRADA") _reportMutationError(err);
    return false;
  }
}
function setLoading(visible) {
  const el = document.getElementById("loadingOverlay");
  if (el) el.style.display = visible ? "flex" : "none";
}
async function loadCollectionData(sheetName, dataArray, renderFn) {
  const requestId = ++_loadRequestId;
  _loadRequests.set(dataArray, { id: requestId, sheetName: sheetName });
  setLoading(true);
  try {
    const records = await getRecords(sheetName);
    const current = _loadRequests.get(dataArray);
    if (!current || current.id !== requestId || current.sheetName !== sheetName) return false;
    if (records === null) return false;
    dataArray.splice(0, dataArray.length, ...normalizeRecords(records));
    if (typeof renderFn === "function") renderFn();
    return true;
  } finally {
    const current = _loadRequests.get(dataArray);
    if (current && current.id === requestId) setLoading(false);
  }
}
async function loginApp(usuario, senha) {
  window.lastLoginMessage = "";
  try {
    const json = await _post({ action: "login", usuario: String(usuario == null ? "" : usuario).trim(), senha: String(senha == null ? "" : senha) });
    if (!json.token || !json.user) {
      _sessionToken = null;
      const err = new Error("O login foi aceito, mas o Web App não retornou token de sessão. A implantação parece desatualizada: publique uma nova versão do Codigo.gs.txt e confirme a URL /exec em GAS_WEB_APP_URL.");
      err.code = "DEPLOYMENT_DESATUALIZADO";
      throw err;
    }
    _sessionToken = json.token;
    return true;
  } catch (err) {
    window.lastLoginMessage = err.message || "Não foi possível realizar o login.";
    if (err.code === "LOGIN_INVALIDO" || err.code === "LOGIN_BLOQUEADO") {
      _sessionToken = null;
      return false;
    }
    throw err;
  }
}
async function logoutApp() {
  const token = _sessionToken;
  try { if (token) await _post({ action: "logout", token: token }); } catch (err) { /* A limpeza local deve ocorrer mesmo se a rede falhar. */ }
  _sessionToken = null;
}
