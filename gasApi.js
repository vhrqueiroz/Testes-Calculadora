/* Integração com o Google Apps Script Web App. Arquivo em UTF-8. */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwHqJZqpX3sBqE3W-kSGQlc99ATAdSnjkNjc_K1Q8ng0j3GwFjGlFbPKbfFsUxFLMxO/exec";
const GAS_SESSION_USER_KEY = "pokemon_tcg_logged_user";

function setLoggedUser(usuario){ sessionStorage.setItem(GAS_SESSION_USER_KEY,String(usuario||'').trim()); }
function getLoggedUser(){ return String(sessionStorage.getItem(GAS_SESSION_USER_KEY)||'').trim(); }
function logoutApp(){ sessionStorage.removeItem(GAS_SESSION_USER_KEY); }

async function parseResponse(response){
  if(!response.ok) throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
  const json=await response.json();
  if(!json.success) throw new Error(json.error||'Operação não concluída.');
  return json;
}

async function loginApp(usuario,senha){
  const u=String(usuario||'').trim(), s=String(senha||'').trim();
  if(!u||!s) return {success:false,error:'Usuário e senha são obrigatórios.'};
  try{
    const url=`${GAS_WEB_APP_URL}?action=login&usuario=${encodeURIComponent(u)}&senha=${encodeURIComponent(s)}`;
    const json=await parseResponse(await fetch(url,{method:'GET',redirect:'follow'}));
    if(json.success) setLoggedUser(json.usuario||u); else logoutApp();
    return json;
  }catch(error){ logoutApp(); return {success:false,error:error.message}; }
}

async function getRecords(sheetName){
  try{
    const url=`${GAS_WEB_APP_URL}?action=getRecords&sheet=${encodeURIComponent(sheetName)}`;
    const json=await parseResponse(await fetch(url,{method:'GET',redirect:'follow'}));
    return Array.isArray(json.data)?json.data:[];
  }catch(error){ console.error(error); alert(`Erro ao carregar registros: ${error.message}`); return []; }
}

async function addRecord(sheetName,recordData){
  const usuario=getLoggedUser();
  if(!usuario){ alert('Faça login novamente antes de salvar.'); return null; }
  const body={action:'addRecord',sheetName,usuario,data:recordData};
  try{
    const response=await fetch(GAS_WEB_APP_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
    const json=await parseResponse(response); return json.id;
  }catch(error){ console.error(error); alert(`Erro ao salvar o registro: ${error.message}`); return null; }
}

async function deleteRecord(sheetName,id){
  try{
    const response=await fetch(GAS_WEB_APP_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'deleteRecord',sheetName,id})});
    await parseResponse(response); return true;
  }catch(error){ console.error(error); alert(`Erro ao excluir o registro: ${error.message}`); return false; }
}
