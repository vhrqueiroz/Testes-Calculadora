/* Cliente da API do Pokémon TCG Dashboard. O token de sessão existe somente em memória. */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxICTwfMs21K_goaOLEDvQ1RpE0oOMyRIL-dxz8swtM4gIH0nFNVvUFSfbdDZqyKH3I/exec";
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
async function _post(payload) {
  let response;
  try {
    response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  } catch (networkError) {
    const err = new Error("Falha de rede/CORS ao acessar o Web App. Confirme a URL /exec e as permissões da implantação.");
    err.code = "REDE_OU_CORS";
    throw err;
  }
  if (!response.ok) {
    const status = response.status;
    let destination = "";
    try {
      const host = new URL(response.url || GAS_WEB_APP_URL).hostname;
      destination = host.endsWith("googleusercontent.com") ? " O redirect do Apps Script chegou ao host de resposta, mas retornou erro." : " A resposta veio do endpoint do Web App.";
    } catch (ignored) {}
    const detail = status === 404
      ? "HTTP 404: recurso não encontrado." + destination + " Confirme que GAS_WEB_APP_URL é a URL /exec da implantação ativa; se publicou código novo, crie uma nova versão ou atualize a URL no gasApi.js. Falha de whitelist/aba costuma ser JSON de aplicação, não HTTP 404."
      : "Erro HTTP " + status + " ao comunicar com o Web App." + destination + " Confira a implantação e tente novamente.";
    const err = new Error(detail);
    err.code = "HTTP_" + status;
    throw err;
  }
  let json;
  try {
    json = await response.json();
  } catch (parseError) {
    const err = new Error("O Web App respondeu em formato inesperado. Confirme que a URL /exec pertence à versão implantada atual e que doPost está publicado.");
    err.code = "RESPOSTA_INVALIDA";
    throw err;
  }
  if (!json || json.success !== true) {
    let message = json && json.error ? json.error : "Não foi possível concluir a solicitação.";
    const unknownAction = /Ação (?:POST|GET) desconhecida/i.test(message);
    if (unknownAction) message += " O endpoint respondeu, mas a implantação não reconhece esta ação. Publique uma nova versão do Apps Script com o Codigo.gs.txt atual e confirme a URL /exec em GAS_WEB_APP_URL. Isso não é erro de nome de aba; confira a implantação antes de alterar os nomes.";
    const err = new Error(message);
    err.code = json && json.code ? json.code : (unknownAction ? "DEPLOYMENT_DESATUALIZADO" : "ERRO_SOLICITACAO");
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
