/* Cliente da API do Pokémon TCG Dashboard. O token de sessão existe somente em memória. */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwbI3E_Dwa3nsvDZTrTpbAbTN6Yj1AFlCwbHl-NdIChyr4K0eDif8aZiTbvmlDodnd3/exec";
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
function _notifySessionExpired(message) {
  _clearSession();
  if (typeof window.onSessionExpired === "function") window.onSessionExpired(message || "Sessão expirada. Faça login novamente.");
}
async function _post(payload) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Erro de comunicação com o servidor (HTTP " + response.status + ").");
  const json = await response.json();
  if (!json || json.success !== true) {
    const err = new Error(json && json.error ? json.error : "Não foi possível concluir a solicitação.");
    err.code = json && json.code ? json.code : "ERRO_SOLICITACAO";
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    throw err;
  }
  return json;
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
    const json = await _post({ action: "addRecord", sheetName: sheetName, data: data, token: _sessionToken });
    return json.id;
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    return null;
  }
}
async function deleteRecord(sheetName, id) {
  try {
    await _post({ action: "deleteRecord", sheetName: sheetName, id: id, token: _sessionToken });
    return true;
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
    return false;
  }
}
async function updateIncluir(sheetName, id, incluir) {
  try {
    await _post({ action: "updateIncluir", sheetName: sheetName, id: id, incluir: !!incluir, token: _sessionToken });
    return true;
  } catch (err) {
    if (err.code === "SESSAO_EXPIRADA") _notifySessionExpired(err.message);
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
    _sessionToken = json.token;
    _currentUser = json.user || String(usuario == null ? "" : usuario).trim();
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
