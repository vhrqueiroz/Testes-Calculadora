/* Cliente da API do Pokémon TCG Dashboard. O token de sessão existe somente em memória. */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw2-KYtbgdWDhCD5c2Pzmllc7hSsBxFeGS5f7pkVX2-W_kZcC_d6LqXAwh5ySVoXDY/exec";
let _currentUser = null;
let _sessionToken = null;
const _loadRequests = new WeakMap();
let _loadRequestId = 0;
const NUMERIC_FIELDS = ["ID", "Total de Boosters", "Quantidade de Cartas", "Total de Cartas", "Double Rare", "Ultra Rare", "Classic Rare", "Illustration Rare", "Special Illustration Rare", "Mega Hyper Rare", "Futuristic Rare", "Total"];

function getCurrentUser() { return _currentUser; }
function _normalizeIncluir(value) {
  if (value === false || value === 0) return false;
  if (value == null || value === "") return true;
  return !["false", "0", "não", "nao"].includes(String(value).trim().toLowerCase());
}
function _clearSession() { _sessionToken = null; _currentUser = null; }
function _reportMutationError(err) {
  window.lastApiError = err && err.message ? err.message : "Não foi possível concluir a alteração.";
  if (typeof window.onMutationError === "function") window.onMutationError(window.lastApiError);
}
function _notifySessionExpired(message) {
  _clearSession();
  if (typeof window.onSessionExpired === "function") window.onSessionExpired(message || "Sessão expirada. Faça login novamente.");
}
const MAP_STORAGE_KEY = "pokemonTcgDashboard.mapeamento.v1";
function _makeRequestId() {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14);
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : ("req_" + Date.now().toString(36) + "_fallback");
}
function _delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function _post(payload) {
  const pauses = [600, 1500]; let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 30000) : null;
    try {
      const response = await fetch(GAS_WEB_APP_URL, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), signal: controller ? controller.signal : undefined });
      if (!response.ok) {
        const error = new Error(response.status === 404 ? "O servidor do Google não respondeu após várias tentativas. Verifique a conexão e a URL /exec da implantação." : "Erro HTTP " + response.status + " ao comunicar com o Web App.");
        error.code = "HTTP_" + response.status; error.status = response.status; error.attempts = attempt + 1;
        if (attempt < 2 && (response.status === 404 || response.status === 429 || response.status >= 500)) { lastError = error; await _delay(pauses[attempt]); continue; }
        throw error;
      }
      let json;
      try { json = await response.json(); } catch (parseError) {
        const error = new Error("O Web App respondeu em formato não JSON."); error.code = "RESPOSTA_INVALIDA"; error.attempts = attempt + 1;
        if (attempt < 2) { lastError = error; await _delay(pauses[attempt]); continue; } throw error;
      }
      if (!json || json.success !== true) {
        let message = json && json.error ? json.error : "Não foi possível concluir a solicitação.";
        const unknownAction = /Ação (?:POST|GET) desconhecida/i.test(message);
        if (unknownAction) message += " O endpoint respondeu, mas a implantação não reconhece esta ação. Publique uma nova versão do Apps Script e confirme a URL /exec.";
        const error = new Error(message); error.code = json && json.code ? json.code : (unknownAction ? "DEPLOYMENT_DESATUALIZADO" : "ERRO_SOLICITACAO"); error.attempts = attempt + 1;
        if (error.code === "SESSAO_EXPIRADA") _notifySessionExpired(error.message); throw error;
      }
      return json;
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught)); if (!error.attempts) error.attempts = attempt + 1;
      const transient = error.name === "AbortError" || error instanceof TypeError || error.code === "RESPOSTA_INVALIDA" || (error.status === 404 || error.status === 429 || error.status >= 500);
      if (attempt < 2 && transient) { lastError = error; await _delay(pauses[attempt]); continue; }
      if (error.name === "AbortError") { error.code = "TIMEOUT"; error.message = "Tempo limite de 30 segundos excedido ao acessar o Web App."; }
      if (error.status === 404) error.message = "O servidor do Google não respondeu após várias tentativas. Verifique a conexão e a URL /exec da implantação.";
      if (error instanceof TypeError && !error.code) { error.code = "REDE_OU_CORS"; error.message = "Falha de rede/CORS após várias tentativas. Verifique a conexão e a implantação."; }
      error.attempts = attempt + 1; throw error;
    } finally { if (timer !== null) clearTimeout(timer); }
  }
  throw lastError || new Error("Não foi possível acessar o Web App após várias tentativas.");
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
    const saved = localStorage.getItem(MAP_STORAGE_KEY); if (saved) { const parsed = JSON.parse(saved); if (parsed && Array.isArray(parsed.data) && parsed.data.length) { window.productMappingVersion = parsed.version || ""; return parsed.data; } }
  } catch (storageError) {}
  return null;
}
async function getRecords(sheetName) {
  try {
    const json = await _post({ action: "getRecords", sheetName: sheetName, token: _sessionToken });
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    if (typeof window.onLoadError === "function") window.onLoadError(sheetName, err.message || "Não foi possível carregar os dados.");
    return null;
  }
}
async function addRecord(sheetName, recordData) {
  try {
    const data = Object.assign({}, recordData || {});
    delete data.ID;
    delete data["Usuário"];
    const requestId = _makeRequestId();
    const json = await _post({ action: "addRecord", sheetName: sheetName, data: data, token: _sessionToken, requestId: requestId });
    return json.id;
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    _reportMutationError(err);
    return null;
  }
}
async function deleteRecord(sheetName, id) {
  try {
    await _post({ action: "deleteRecord", sheetName: sheetName, id: id, token: _sessionToken });
    return true;
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    if (err.code === "REGISTRO_NAO_ENCONTRADO" && err.attempts > 1) return true;
    _reportMutationError(err);
    return false;
  }
}
async function updateIncluir(sheetName, id, incluir) {
  try {
    await _post({ action: "updateIncluir", sheetName: sheetName, id: id, incluir: !!incluir, token: _sessionToken });
    return true;
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    _reportMutationError(err);
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
    const normalized = records.map(function(record) {
      const r = Object.assign({}, record);
      NUMERIC_FIELDS.forEach(function(field) {
        if (r[field] !== undefined && r[field] !== "") {
          const value = Number(r[field]);
          r[field] = Number.isFinite(value) ? value : 0;
        } else if (r[field] === "") r[field] = 0;
      });
      r["Incluir"] = _normalizeIncluir(r["Incluir"]);
      return r;
    });
    dataArray.splice(0, dataArray.length, ...normalized);
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
      _clearSession();
      const err = new Error("O login foi aceito, mas o Web App não retornou token de sessão. A implantação parece desatualizada: publique uma nova versão do Codigo.gs.txt e confirme a URL /exec em GAS_WEB_APP_URL.");
      err.code = "DEPLOYMENT_DESATUALIZADO";
      throw err;
    }
    _sessionToken = json.token;
    _currentUser = json.user;
    return true;
  } catch (err) {
    if (err.code === "LOGIN_INVALIDO" || err.code === "LOGIN_BLOQUEADO") {
      window.lastLoginMessage = err.message;
      _clearSession();
      return false;
    }
    window.lastLoginMessage = err.message || "Não foi possível realizar o login.";
    if (err.code === "SESSAO_EXPIRADA") return false;
    throw err;
  }
}
async function logoutApp() {
  const token = _sessionToken;
  try { if (token) await _post({ action: "logout", token: token }); } catch (err) { /* A limpeza local deve ocorrer mesmo se a rede falhar. */ }
  _clearSession();
}

window.loadMapeamento = loadMapeamento;
