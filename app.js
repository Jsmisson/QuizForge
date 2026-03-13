// ═══════════════════════════════════════════════════
//  MODAL SYSTEM — scroll lock + swipe to dismiss
// ═══════════════════════════════════════════════════
let _scrollY=0;
const APP_VERSION = '1.04';
const INSTALL_DISMISS_KEY = 'qforge_install_dismissed_at';
const INSTALL_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let _activeModalTrigger = null;
let _focusTrapCleanup = null;

function setAppVersionLabel(){
  const versionEl = document.getElementById('appVersionLabel');
  if(versionEl) versionEl.textContent = `v${APP_VERSION}`;
}

function parseActionArgs(raw, event, el){
  if(!raw) return [];
  const parts = [];
  let current = '';
  let quote = null;
  let depth = 0;
  for(let i=0;i<raw.length;i++){
    const ch = raw[i];
    if(quote){
      current += ch;
      if(ch === quote && raw[i-1] !== '\\') quote = null;
      continue;
    }
    if(ch === "'" || ch === '\"'){ quote = ch; current += ch; continue; }
    if(ch === '(' || ch === '[' || ch === '{'){ depth++; current += ch; continue; }
    if(ch === ')' || ch === ']' || ch === '}'){ depth--; current += ch; continue; }
    if(ch === ',' && depth === 0){ parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if(current.trim()) parts.push(current.trim());
  return parts.map(token => {
    if(token === 'event') return event;
    if(token === 'this') return el;
    if(token === 'true') return true;
    if(token === 'false') return false;
    if(token === 'null') return null;
    if(/^[-]?\d+(\.\d+)?$/.test(token)) return Number(token);
    if((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))){
      return token.slice(1,-1);
    }
    return token;
  });
}

function handleDelegatedAction(el, event){
  const action = el.dataset.action;
  if(!action) return;
  const args = parseActionArgs(el.dataset.actionArgs || '', event, el);
  switch(action){
    case 'stopPropagation': event.stopPropagation(); return;
    case 'removeParent': el.parentElement?.remove(); return;
    case 'clearImportText': { const t=document.getElementById('importText'); if(t) t.value=''; return; }
    case 'backFromQuizSource': return _quizFromHome ? goHome() : showView('manage');
    case 'selectQuick10Set': _q10SelectedId = args[0]; return q10Highlight();
  }
  const fnName = action.replace(/__/g,'.');
  const fn = fnName.split('.').reduce((obj,key)=>obj && obj[key], window);
  if(typeof fn === 'function') return fn(...args);
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if(!el) return;
  handleDelegatedAction(el, event);
});

document.addEventListener('keydown', (event) => {
  const el = event.target.closest('[data-action][role="button"]');
  if(!el) return;
  if(event.key === 'Enter' || event.key === ' '){
    event.preventDefault();
    handleDelegatedAction(el, event);
  }
});

document.addEventListener('error', (event) => {
  const el = event.target;
  if(el && el.classList && el.classList.contains('js-hide-on-error')) el.style.display = 'none';
}, true);

function syncCheckedOptionRows(root=document){
  root.querySelectorAll('.option-row').forEach(row => {
    const control = row.querySelector('input[type="checkbox"], input[type="radio"]');
    row.classList.toggle('checked', !!control?.checked);
  });
}

document.addEventListener('change', (event) => {
  if(event.target.matches('.option-row input[type="checkbox"], .option-row input[type="radio"]')){
    syncCheckedOptionRows(event.target.closest('.modal, .view, body') || document);
  }
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change-action]');
  if(!el) return;
  const fn = window[el.dataset.changeAction];
  if(typeof fn === 'function') fn(event);
});

document.addEventListener('click', (event) => {
  const overlay = event.target.closest('.modal-overlay[data-overlay-close]');
  if(!overlay || event.target !== overlay) return;
  const fn = window[overlay.dataset.overlayClose];
  if(typeof fn === 'function') fn(event);
});

function trapFocus(modalOverlay){
  const selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const nodes = [...modalOverlay.querySelectorAll(selectors)].filter(el => !el.disabled && el.offsetParent !== null);
  if(!nodes.length) return () => {};
  const first = nodes[0], last = nodes[nodes.length - 1];
  const onKeydown = (e) => {
    if(e.key === 'Escape'){ modalClose(modalOverlay.id); return; }
    if(e.key !== 'Tab') return;
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  };
  modalOverlay.addEventListener('keydown', onKeydown);
  setTimeout(() => (first.focus()), 0);
  return () => modalOverlay.removeEventListener('keydown', onKeydown);
}


function openOrganizeFromHomeMenu(){ closeHomeMenu(); openOrganizeModal(); }
function openBackupFromHomeMenu(){ closeHomeMenu(); openBackupModal(); }
function saveAndShowResultsFromExit(){ modalClose('exitQuizModal'); showPartialResults(); }
function exitWithoutResultsFromExit(){ modalClose('exitQuizModal'); endQuiz(); }
function startQuizFromSettings(){ saveQuizSettings(); closePreQuizModal(); startQuiz(); }
function openBackupFromImportExport(){ closeImportExportModal(); openBackupModal(); }
function openExportFromBackup(){ closeBackupModal(); openExportModal(); }
function exportFullBackupFromBackup(){ const ok = exportFullBackup(); if(ok !== false) closeBackupModal(); }
function importBankFromBackup(event){ closeBackupModal(); importBank(event); }
function importFullBackupFromBackup(event){ closeBackupModal(); importFullBackup(event); }
function clearLocalAndResyncFromBackup(){ closeBackupModal(); clearLocalAndResync(); }

function ensureGoogleIdentityScript(){
  if(window.google?.accounts?.oauth2) return Promise.resolve();
  if(window.__qforgeGISPromise) return window.__qforgeGISPromise;
  window.__qforgeGISPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services failed to load.'));
    document.head.appendChild(script);
  });
  return window.__qforgeGISPromise;
}

function modalOpen(id, triggerEl){
  const el=document.getElementById(id); if(!el) return;
  _activeModalTrigger = triggerEl || document.activeElement;
  _scrollY=window.scrollY;
  // Don't apply position:fixed scroll lock for exit quiz modal — quiz view doesn't scroll
  // and removing it causes iOS viewport jump that swallows the next tap
  if(id !== 'exitQuizModal'){
    document.body.classList.add('modal-open');
    document.body.style.top=`-${_scrollY}px`;
  }
  el.style.display='flex';
  el.setAttribute('aria-hidden','false');
  if(_focusTrapCleanup) _focusTrapCleanup();
  _focusTrapCleanup = trapFocus(el);
  const modal=el.querySelector('.modal');
  if(modal && window.innerWidth<600 && id !== 'exitQuizModal') _attachSwipe(modal, ()=>modalClose(id));
}
function modalClose(id){
  const el=document.getElementById(id); if(!el) return;
  el.style.display='none';
  el.setAttribute('aria-hidden','true');
  if(_focusTrapCleanup){ _focusTrapCleanup(); _focusTrapCleanup = null; }
  if(_activeModalTrigger && typeof _activeModalTrigger.focus === 'function'){ try { _activeModalTrigger.focus(); } catch(e){} }
  _activeModalTrigger = null;
  // Restore scroll only if no other modals are open
  const anyOpen=[...document.querySelectorAll('.modal-overlay')].some(m=>m.style.display==='flex');
  if(!anyOpen){
    document.body.classList.remove('modal-open');
    document.body.style.top='';
    window.scrollTo(0,_scrollY);
  }
}
function _attachSwipe(modal, onDismiss){
  let startY=0, currentY=0, dragging=false;
  const handleZone=modal.querySelector('.modal-handle-zone');
  if(!handleZone) return; // No handle = no swipe

  function onTouchStart(e){
    startY=e.touches[0].clientY;
    currentY=startY;
    dragging=true;
    modal.style.transition='none';
  }
  function onTouchMove(e){
    if(!dragging) return;
    currentY=e.touches[0].clientY;
    const delta=Math.max(0,currentY-startY);
    modal.style.transform=`translateY(${delta}px)`;
  }
  function onTouchEnd(){
    if(!dragging) return; dragging=false;
    const delta=currentY-startY;
    modal.style.transition='';
    if(delta>120){
      modal.style.transform=`translateY(100%)`;
      setTimeout(()=>{ modal.style.transform=''; onDismiss(); },220);
    } else {
      modal.style.transform='';
    }
    startY=0; currentY=0;
  }

  // Remove previous listeners if any
  if(handleZone._swipeStart) handleZone.removeEventListener('touchstart',handleZone._swipeStart);
  if(handleZone._swipeMove) modal.removeEventListener('touchmove',handleZone._swipeMove);
  if(handleZone._swipeEnd) modal.removeEventListener('touchend',handleZone._swipeEnd);

  handleZone._swipeStart=onTouchStart;
  handleZone._swipeMove=onTouchMove;
  handleZone._swipeEnd=onTouchEnd;

  // Start only from handle zone, move/end on modal
  handleZone.addEventListener('touchstart',onTouchStart,{passive:true});
  modal.addEventListener('touchmove',handleZone._swipeMove,{passive:true});
  modal.addEventListener('touchend',handleZone._swipeEnd);
}

// ═══════════════════════════════════════════════════
//  PWA — Service Worker + Install prompt
// ═══════════════════════════════════════════════════
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw3.js').catch(()=>{});
  });
}
let _deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); _deferredInstall=e;
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
  if(!dismissedAt || (Date.now() - dismissedAt) > INSTALL_DISMISS_TTL_MS)
    document.getElementById('installBanner').classList.add('show');
});
window.addEventListener('appinstalled',()=>{
  document.getElementById('installBanner').classList.remove('show');
  _deferredInstall=null;
});
function triggerInstall(){
  if(!_deferredInstall) return;
  _deferredInstall.prompt();
  _deferredInstall.userChoice.then(()=>{ _deferredInstall=null; document.getElementById('installBanner').classList.remove('show'); });
}
function dismissInstall(){
  localStorage.setItem(INSTALL_DISMISS_KEY, Date.now().toString());
  document.getElementById('installBanner').classList.remove('show');
}

// Offline indicator
function updateOnlineStatus(){
  document.getElementById('offlineBadge').style.display=navigator.onLine?'none':'block';
}
window.addEventListener('online',updateOnlineStatus);
window.addEventListener('offline',updateOnlineStatus);
updateOnlineStatus();

// ═══════════════════════════════════════════════════
//  IMAGE STORE  (session memory — images NEVER written to localStorage)
//
//  Architecture:
//    q.imageRef = short key stored in localStorage with the question
//    ImageStore = in-memory Map: imageRef → base64 dataURL
//    Drive/export payload carries images:{} map for persistence
//    On import/sync-down: ImageStore.putAll(payload.images) fills cache
//    On upload: compressImage → ImageStore.put(dataURL) → returns ref key
//
//  iOS localStorage quota (~2.5MB) is never touched by image data.
// ═══════════════════════════════════════════════════

// Compress a data-URL to max 900px / JPEG 82% (~50-100KB result)
function compressImage(dataURL){
  return new Promise((resolve) => {
    const MAX = 900, QUALITY = 0.82;
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if(w > MAX || h > MAX){
        if(w >= h){ h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

const ImageStore = (() => {
  const _cache = new Map(); // imageRef key → dataURL

  // Store a new image; returns a unique ref key
  function put(dataURL){
    if(!dataURL) return null;
    const key = 'img_' + Math.random().toString(36).slice(2,10) + '_' + Date.now();
    _cache.set(key, dataURL);
    return key;
  }
  function get(key){ return (key && _cache.has(key)) ? _cache.get(key) : null; }
  function del(key){ if(key) _cache.delete(key); }
  // Bulk load from Drive payload or import file
  function putAll(map){
    if(!map || typeof map !== 'object') return;
    Object.entries(map).forEach(([k,v]) => { if(k && v) _cache.set(k, v); });
  }
  // Return only the requested keys (for Drive payload / export)
  function getAll(keys){
    const out = {};
    (keys || []).forEach(k => { const v = _cache.get(k); if(v) out[k] = v; });
    return out;
  }
  // Remove stale keys not in the live ref set
  function pruneExcept(keepSet){
    _cache.forEach((_, k) => { if(!keepSet.has(k)) _cache.delete(k); });
  }
  function size(){ return _cache.size; }
  return { put, get, del, putAll, getAll, pruneExcept, size };
})();

// Helper: collect all imageRef values from a questions array
function _collectImageRefs(questions){
  return (questions || []).map(q => q.imageRef).filter(Boolean);
}

// ── Quota-safe localStorage writer ──────────────────────────────────────────
// Eviction order (most expendable first):
//   srs → incorrect → flags → other question sets (last resort) → throw
function _lsSet(key, value){
  const evictPrefixes = ['qforge_srs_', 'qforge_incorrect_', 'qforge_flags_'];
  for(let attempt = 0; attempt <= evictPrefixes.length; attempt++){
    try {
      localStorage.setItem(key, value);
      return; // success
    } catch(e) {
      if(e instanceof DOMException && (
          e.code === 22 || e.code === 1014 ||
          e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED')){
        if(attempt < evictPrefixes.length){
          const prefix = evictPrefixes[attempt];
          Object.keys(localStorage)
            .filter(k => k.startsWith(prefix))
            .forEach(k => localStorage.removeItem(k));
          console.warn('[QuizForge] localStorage quota hit — evicted keys with prefix:', prefix);
        } else {
          // Last resort: evict question data for OTHER sets (not the one being written)
          const currentSetKey = key.startsWith('qforge_qs_') ? key : null;
          let evicted = 0;
          Object.keys(localStorage)
            .filter(k => k.startsWith('qforge_qs_') && k !== currentSetKey)
            .forEach(k => { localStorage.removeItem(k); evicted++; });
          if(evicted > 0){
            console.warn('[QuizForge] extreme quota — evicted', evicted, 'other question sets. Re-sync to restore.');
            try { localStorage.setItem(key, value); return; } catch(_){}
          }
          // Truly unrecoverable — throw so sync catch block knows the write failed
          console.error('[QuizForge] localStorage quota exceeded — could not write:', key);
          if(typeof showToast === 'function')
            showToast('⚠️ Storage full — data could not be saved. Export a backup and clear some sets.', 6000);
          throw e;
        }
      } else { throw e; }
    }
  }
}
// ────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════
function loadSets(){ return JSON.parse(localStorage.getItem('qforge_sets')||'[]'); }
function saveSets(s){ _lsSet('qforge_sets',JSON.stringify(s)); }
function loadFolders(){ return JSON.parse(localStorage.getItem('qforge_folders')||'[]'); }
function saveFolders(f){ _lsSet('qforge_folders',JSON.stringify(f)); }
function loadQs(id){ return JSON.parse(localStorage.getItem('qforge_qs_'+id)||'[]'); }
function saveQs(id, qs){
  // Strip inline images before writing to localStorage — store only the ref key.
  // Any q.image blob gets moved into ImageStore and replaced with q.imageRef.
  const stripped = (qs || []).map(q => {
    if(q.image && q.image.startsWith('data:')){
      // Migrate inline image into session cache
      const ref = q.imageRef || ImageStore.put(q.image);
      const { image, ...rest } = q;
      return { ...rest, imageRef: ref };
    }
    return q;
  });
  _lsSet('qforge_qs_'+id, JSON.stringify(stripped));
}
function loadFlags(id){ return JSON.parse(localStorage.getItem('qforge_flags_'+id)||'[]'); }
function saveFlags(id,fl){ _lsSet('qforge_flags_'+id,JSON.stringify(fl)); }

// Incorrect tracking: {key: questionText, streak: consecutive correct count needed to clear}
function loadIncorrect(id){ return JSON.parse(localStorage.getItem('qforge_incorrect_'+id)||'[]'); }
function saveIncorrect(id,arr){ _lsSet('qforge_incorrect_'+id,JSON.stringify(arr)); }
function incorrectKey(q){ return q.type==='card'?('card:'+q.term.trim()):q.text.trim(); }
function isIncorrect(q){ return loadIncorrect(activeSetId).some(x=>x.key===incorrectKey(q)); }
function markIncorrect(q){
  const arr=loadIncorrect(activeSetId), key=incorrectKey(q);
  const existing=arr.find(x=>x.key===key);
  if(existing){ existing.streak=0; existing.lastWrong=Date.now(); }
  else arr.push({key,streak:0,lastWrong:Date.now()});
  recordModified(activeSetId,'incorrect');
  saveIncorrect(activeSetId,arr);
}
function markCorrect(q){
  const arr=loadIncorrect(activeSetId), key=incorrectKey(q);
  const existing=arr.find(x=>x.key===key);
  if(!existing) return;
  existing.streak=(existing.streak||0)+1;
  if(existing.streak>=2) arr.splice(arr.findIndex(x=>x.key===key),1);
  recordModified(activeSetId,'incorrect');
  saveIncorrect(activeSetId,arr);
}

function migrateLegacy(){
  const old=localStorage.getItem('qforge_qs'); if(!old) return;
  if(loadSets().length) return;
  const id=uid();
  saveSets([{id,name:'Default Set',created:Date.now()}]);
  saveQs(id,JSON.parse(old||'[]'));
  saveFlags(id,JSON.parse(localStorage.getItem('qforge_flags')||'[]'));
  localStorage.removeItem('qforge_qs'); localStorage.removeItem('qforge_flags');
}

function getSavedWrongs(){
  return Object.entries(quiz.savedAnswers||{})
    .filter(([,a])=>!a.isCorrect)
    .map(([i,a])=>({q:quiz.questions[+i],selected:a.selected||[],isCorrect:false,isCard:a.cardResult!==undefined}))
    .filter(e=>e.q);
}
function renderResultButtons(savedWrongs){
  const incCount=loadIncorrect(activeSetId).length;
  const incBtn=document.getElementById('retakeIncorrectBtn');
  if(incBtn){ incBtn.style.display=incCount?'inline-flex':'none'; incBtn.textContent=`❌ Review (${incCount})`; }
  const viewBtn=document.getElementById('viewIncorrectBtn');
  if(viewBtn){ viewBtn.style.display=savedWrongs.length?'inline-flex':'none'; viewBtn.textContent=`📋 View Incorrect (${savedWrongs.length})`; }
  const revSec=document.getElementById('incorrectReviewSection');
  if(revSec) revSec.style.display='none';
  const revList=document.getElementById('incorrectReviewList');
  if(revList) revList.innerHTML='';
}
function formatTime(sec){ const m=Math.floor(sec/60), s=sec%60; return `${m}m ${s}s`; }
function shufflePool(pool){
  if(document.getElementById('settShuffleOpts').checked){
    pool=pool.map(q=>{
      if(q.type==='card') return q;
      const p=q.options.map((o,i)=>({o,c:q.correct.includes(i)}));
      p.sort(()=>Math.random()-.5);
      return{...q,options:p.map(x=>x.o),correct:p.map((x,i)=>x.c?i:-1).filter(i=>i>=0)};
    });
  }
  return pool;
}
function startQuizFromPool(pool, extra={}){
  pool=shufflePool(pool);
  quiz={questions:pool,idx:0,score:0,wrongs:0,selected:[],timeouts:0,answerLog:[],savedAnswers:{},...extra};
  answered=false; overallSec=0; clearInterval(overallInterval);
  overallInterval=setInterval(()=>{ overallSec++; updateOverallTimer(); },1000);
  showView('quiz'); renderQuestion();
}
// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
let activeSetId=null, questions=[], flaggedKeys=[];
let quiz={questions:[],idx:0,score:0,selected:[],timeouts:0};
let answered=false, qFilter='all', editingIdx=null;
let overallInterval=null, qInterval=null, _qTimerGen=0;
let overallSec=0, qSec=0, qMaxSec=60;

// ═══════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════
function uid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
function esc(s=''){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function save(){ if(activeSetId){ recordModified(activeSetId,'questions'); saveQs(activeSetId,questions); } }
function saveFlg(){ if(activeSetId){ recordModified(activeSetId,'flags'); saveFlags(activeSetId,flaggedKeys); } }
function showHomeMsg(msg,ok){ const el=document.getElementById('homeMsg'); el.style.display='block'; el.style.color=ok?'var(--green)':'var(--red)'; el.textContent=msg; }

// ═══════════════════════════════════════════════════
//  VIEWS
// ═══════════════════════════════════════════════════
const INNER_VIEWS=['manage','add','import','settings','quiz','results'];
const TAB_VIEWS=['manage','add','import','settings'];

function showView(name){
  INNER_VIEWS.forEach(v=>{ const el=document.getElementById('view-'+v); if(el) el.classList.toggle('active',v===name); });
  document.querySelectorAll('#innerApp .tab').forEach((t,i)=>t.classList.toggle('active',TAB_VIEWS[i]===name));
  if(name==='manage') renderQList();
  if(name!=='quiz'){ clearInterval(overallInterval); clearInterval(qInterval); }
  // Hide tabs + header actions during quiz for immersive mode
  const isQuiz = name==='quiz' || name==='results';
  const tabs = document.querySelector('#innerApp .tabs');
  const hr = document.getElementById('headerRight');
  const bc = document.querySelector('#innerApp .breadcrumb');
  if(tabs) tabs.style.display = isQuiz ? 'none' : '';
  if(hr) hr.style.display = isQuiz ? 'none' : '';
  if(bc) bc.style.display = isQuiz ? 'none' : '';
  // Show set name inside quiz header
  const quizSetName = document.getElementById('quizSetName');
  if(quizSetName){
    quizSetName.style.display = name==='quiz' ? '' : 'none';
    if(name==='quiz') quizSetName.textContent = document.getElementById('bcSetName').textContent;
  }
  // Use instant scroll for quiz transitions to prevent layout shift eating taps
  window.scrollTo({top:0, behavior: (name==='quiz'||name==='results'||name==='manage') ? 'instant' : 'smooth'});
}

// ═══════════════════════════════════════════════════
//  HOME / SETS
// ═══════════════════════════════════════════════════
function goHome(){
  if(document.getElementById('view-quiz').classList.contains('active')){
    openExitQuizModal(); return;
  }
  // Reset any elements quiz immersive mode may have hidden before leaving innerApp
  const tabs=document.querySelector('#innerApp .tabs');
  const bc=document.querySelector('#innerApp .breadcrumb');
  const hr=document.getElementById('headerRight');
  if(tabs) tabs.style.display='';
  if(bc) bc.style.display='';
  if(hr) hr.style.display='';
  activeSetId=null; questions=[]; flaggedKeys=[];
  document.getElementById('innerApp').style.display='none';
  document.getElementById('view-home').classList.add('active');
  renderHeader(); renderSetsGrid();
}

function renderHeader(){
  const hr=document.getElementById('headerRight');
  if(activeSetId){
    const inc=loadIncorrect(activeSetId);
    const incBtn=inc.length?`<button class="btn btn-ghost-red btn-sm" data-action="startIncorrectQuiz">❌ Review (${inc.length})</button>`:'';
    hr.innerHTML=`${incBtn}<button class="btn btn-ghost-accent btn-sm" data-action="openQuick10Modal" data-action-args="true">⚡ Quick 10</button><button class="btn btn-primary btn-sm" data-action="openPreQuizModal">▶ Quiz</button>`;
  } else { hr.innerHTML=''; }
}


function openSet(id){
  _quizFromHome = false;
  const sets=loadSets(), set=sets.find(s=>s.id===id); if(!set) return;
  activeSetId=id; questions=loadQs(id); flaggedKeys=loadFlags(id);
  document.getElementById('view-home').classList.remove('active');
  document.getElementById('innerApp').style.display='block';
  document.getElementById('bcSetName').textContent=set.name;
  document.getElementById('importSetName').textContent=set.name;
  document.getElementById('renameInput').value=set.name;
  populateFolderSelects();
  document.getElementById('setFolderSelect').value=set.folderId||'';
  // Always reset elements that quiz immersive mode may have hidden
  const tabs=document.querySelector('#innerApp .tabs');
  const bc=document.querySelector('#innerApp .breadcrumb');
  const hr=document.getElementById('headerRight');
  if(tabs) tabs.style.display='';
  if(bc) bc.style.display='';
  if(hr) hr.style.display='';
  const quizSetName=document.getElementById('quizSetName');
  if(quizSetName) quizSetName.style.display='none';
  renderHeader();
  INNER_VIEWS.forEach(v=>{ const el=document.getElementById('view-'+v); if(el) el.classList.remove('active'); });
  document.getElementById('view-manage').classList.add('active');
  document.querySelectorAll('#innerApp .tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  renderQList(); initOptionRows();
  window.scrollTo({top:0,behavior:'instant'});
}

function loadGridOrder(){ return JSON.parse(localStorage.getItem('qforge_grid_order')||'[]'); }
function saveGridOrder(order){ _lsSet('qforge_grid_order',JSON.stringify(order)); recordModified('__grid__','order'); }

function renderSetsGrid(){
  const fb=document.getElementById('createSetFallback'); if(fb) fb.remove();
  const sets=loadSets(), folders=loadFolders();
  const grid=document.getElementById('setsGrid');
  if(!grid) return;

  // Build ordered list respecting saved grid order
  const savedOrder=loadGridOrder();
  const allItems=[
    ...folders.map(f=>({type:'folder',id:f.id})),
    ...sets.filter(s=>!s.folderId).map(s=>({type:'set',id:s.id}))
  ];

  // Sort allItems by savedOrder, appending anything not yet in savedOrder at end
  let ordered=[];
  if(savedOrder.length){
    savedOrder.forEach(o=>{ const found=allItems.find(x=>x.type===o.type&&x.id===o.id); if(found) ordered.push(found); });
    allItems.forEach(x=>{ if(!ordered.find(o=>o.type===x.type&&o.id===x.id)) ordered.push(x); });
  } else {
    ordered=allItems;
  }

  let html='';
  ordered.forEach(item=>{
    if(item.type==='folder'){
      const f=folders.find(x=>x.id===item.id); if(!f) return;
      const folderSets=sets.filter(s=>s.folderId===f.id);
      html+=`<div class="folder-card" data-action="openFolder" data-action-args="'${f.id}'">
        <div class="folder-card-icon">📁</div>
        <div class="folder-card-name">${esc(f.name)}</div>
        <div class="folder-card-meta">${folderSets.length} set${folderSets.length!==1?'s':''}</div>
      </div>`;
    } else {
      const s=sets.find(x=>x.id===item.id); if(!s) return;
      const qs=loadQs(s.id)||[];
      const due=getSRSDueCount(s.id);
      html+=`<div class="set-card" data-action="openSet" data-action-args="'${s.id}'">
        <div class="set-card-name">${esc(s.name)}</div>
        <div class="set-card-meta">${qs.length} question${qs.length!==1?'s':''}</div>
        ${due>0&&dueBadgesEnabled()?`<span class="srs-due-badge">📅 ${due} due</span>`:''}
      </div>`;
    }
  });

  html+=`<div class="new-set-card" data-action="openCreateSetModal"><div class="plus">＋</div><div>New Set</div></div>`;
  grid.innerHTML=html;
}

function openFolder(folderId){
  const folders=loadFolders(), folder=folders.find(f=>f.id===folderId); if(!folder) return;
  const sets=loadSets().filter(s=>s.folderId===folderId);
  const grid=document.getElementById('setsGrid');

  let html=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;grid-column:1/-1">
    <button class="btn btn-ghost btn-sm" data-action="renderSetsGrid">← Back</button>
    <span style="font-size:1rem;font-weight:700">📁 ${esc(folder.name)}</span>
    <button class="btn btn-ghost-red btn-sm" data-action="deleteFolder" data-action-args="'${folderId}'" style="margin-left:auto">🗑 Delete Folder</button>
  </div>`;

  sets.forEach(s=>{
    const qs=loadQs(s.id)||[], isActive=s.id===activeSetId;
    const due=getSRSDueCount(s.id);
    html+=`<div class="set-card${isActive?' active-set':''}" data-action="openSet" data-action-args="'${s.id}'">
      <div class="set-card-name">${esc(s.name)}</div>
      <div class="set-card-meta">${qs.length} question${qs.length!==1?'s':''}</div>
      ${isActive?'<span class="set-card-badge">Active</span>':''}
      ${due>0&&dueBadgesEnabled()?`<span class="srs-due-badge">📅 ${due} due</span>`:''}
    </div>`;
  });

  if(!sets.length) html+=`<div style="grid-column:1/-1;color:var(--muted);font-size:.82rem;padding:12px 0">No sets in this folder yet. Assign sets from within each set's Settings tab.</div>`;
  grid.innerHTML=html;
}

// ── Folder management ──
function openCreateSetModal(){
  document.getElementById('newSetName').value='';
  populateFolderSelects();
  document.getElementById('newSetFolder').value='';
  modalOpen('createSetModal');
  setTimeout(()=>document.getElementById('newSetName').focus(),100);
  syncCheckedOptionRows();
}
function closeCreateSetModal(e){
  if(e&&e.target!==document.getElementById('createSetModal')) return;
  modalClose('createSetModal');
}
function confirmCreateSet(){
  const name=document.getElementById('newSetName').value.trim();
  if(!name) return document.getElementById('newSetName').focus();
  const folderId=document.getElementById('newSetFolder').value||null;
  const sets=loadSets(), id=uid();
  sets.push({id,name,folderId,created:Date.now()});
  saveSets(sets);
  modalClose('createSetModal');
  renderSetsGrid();
  openSet(id);
}
function openFolderManagerModal(){
  renderFolderList();
  populateFolderSelects();
  modalOpen('folderManagerModal');
}
function closeFolderManagerModal(e){
  if(e&&e.target!==document.getElementById('folderManagerModal')) return;
  modalClose('folderManagerModal');
  populateFolderSelects();
}
function renderFolderList(){
  const folders=loadFolders();
  const sets=loadSets();
  const el=document.getElementById('folderList');
  if(!folders.length){ el.innerHTML=`<div style="color:var(--muted);font-size:.82rem">No folders yet.</div>`; return; }
  el.innerHTML=folders.map(f=>{
    const count=sets.filter(s=>s.folderId===f.id).length;
    return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px">
      <span>📁 ${esc(f.name)} <span style="color:var(--muted);font-size:.75rem">(${count} set${count!==1?'s':''})</span></span>
      <button class="btn btn-ghost-red btn-sm" data-action="deleteFolder" data-action-args="'${f.id}',true">🗑</button>
    </div>`;
  }).join('');
}
function addFolder(){
  const name=document.getElementById('newFolderName').value.trim();
  if(!name) return;
  const folders=loadFolders();
  if(folders.find(f=>f.name.toLowerCase()===name.toLowerCase())) return alert('A folder with that name already exists.');
  folders.push({id:uid(),name});
  saveFolders(folders);
  document.getElementById('newFolderName').value='';
  renderFolderList(); populateFolderSelects();
}
function deleteFolder(folderId, fromManager=false){
  const folders=loadFolders(), folder=folders.find(f=>f.id===folderId); if(!folder) return;
  if(!confirm(`Delete folder "${folder.name}"? Sets inside will be moved to the main screen.`)) return;
  // Unassign sets from this folder
  const sets=loadSets().map(s=>s.folderId===folderId?{...s,folderId:null}:s);
  saveSets(sets);
  saveFolders(folders.filter(f=>f.id!==folderId));
  if(fromManager){ renderFolderList(); populateFolderSelects(); }
  else renderSetsGrid();
}
function populateFolderSelects(){
  const folders=loadFolders();
  const opts=`<option value="">— No folder —</option>`+folders.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('');
  ['newSetFolder','setFolderSelect'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });
}
function assignSetFolder(){
  if(!activeSetId) return;
  const folderId=document.getElementById('setFolderSelect').value||null;
  const sets=loadSets().map(s=>s.id===activeSetId?{...s,folderId}:s);
  saveSets(sets);
}
function createSet(){
  openCreateSetModal();
}

function loadTombstones(){ return JSON.parse(localStorage.getItem('qforge_tombstones')||'[]'); }
function saveTombstones(t){ _lsSet('qforge_tombstones',JSON.stringify(t)); }
function addTombstone(id){
  const t=loadTombstones();
  if(!t.find(x=>x.id===id)) t.push({id, deletedAt: Date.now()});
  saveTombstones(t);
}

function deleteSet(id){
  const sets=loadSets(), set=sets.find(s=>s.id===id);
  if(!set||!confirm(`Delete "${set.name}" and all questions?`)) return;
  sets.splice(sets.findIndex(s=>s.id===id),1);
  addTombstone(id);
  saveSets(sets); localStorage.removeItem('qforge_qs_'+id); localStorage.removeItem('qforge_flags_'+id);
  if(activeSetId===id) goHome(); else renderSetsGrid();
}
function deleteCurrentSet(){ if(activeSetId) deleteSet(activeSetId); }

function startRenameCard(id){
  const nameEl=document.getElementById('sname-'+id);
  const orig=nameEl.textContent;
  nameEl.innerHTML=`<input id="renameInput" name="renameInput" class="set-name-input" value="${esc(orig)}" onblur="finishRenameCard('${id}',this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='${esc(orig)}';this.blur()}">`;
  nameEl.querySelector('input').focus();
}
function finishRenameCard(id,inp){
  const val=inp.value.trim()||'Untitled Set';
  const sets=loadSets(), s=sets.find(x=>x.id===id);
  if(s){ s.name=val; saveSets(sets); }
  renderSetsGrid();
}
function renameCurrentSet(){
  const val=document.getElementById('renameInput').value.trim();
  if(!val||!activeSetId) return;
  const sets=loadSets(), s=sets.find(x=>x.id===activeSetId);
  if(s){ s.name=val; saveSets(sets); }
  document.getElementById('bcSetName').textContent=val;
  document.getElementById('importSetName').textContent=val;
  renderSetsGrid();
}

// ═══════════════════════════════════════════════════
//  FLAGS
// ═══════════════════════════════════════════════════
function flagKey(q){ return incorrectKey(q); }
function isFlagged(q){ return flaggedKeys.includes(flagKey(q)); }
function toggleGlobalFlag(q){ const k=flagKey(q),i=flaggedKeys.indexOf(k); if(i>=0)flaggedKeys.splice(i,1); else flaggedKeys.push(k); saveFlg(); }
function clearAllFlags(){ if(!confirm('Clear all flags for this set?')) return; flaggedKeys=[]; saveFlg(); recordClear(activeSetId,'flags'); renderQList(); }
function loadClearTimestamps(){ return JSON.parse(localStorage.getItem('qforge_clear_ts')||'{}'); }
function saveClearTimestamps(ts){ _lsSet('qforge_clear_ts',JSON.stringify(ts)); }
function recordClear(setId, field){
  const ts = loadClearTimestamps();
  if(!ts[setId]) ts[setId] = {};
  ts[setId][field] = Date.now();
  saveClearTimestamps(ts);
}
function recordModified(setId, field){
  const ts = loadClearTimestamps();
  if(!ts[setId]) ts[setId] = {};
  ts[setId][field] = Date.now();
  saveClearTimestamps(ts);
}

function clearIncorrect(){ if(!confirm('Clear all incorrect tracking for this set?')) return; saveIncorrect(activeSetId,[]); recordClear(activeSetId,'incorrect'); renderQList(); renderHeader(); }

function setFilter(f){
  qFilter=f;
  document.getElementById('chipAll').classList.toggle('active',f==='all');
  document.getElementById('chipFlagged').classList.toggle('active',f==='flagged');
  document.getElementById('chipIncorrect').classList.toggle('active',f==='incorrect');
  renderQList();
}

// ═══════════════════════════════════════════════════
//  QUESTION LIST
// ═══════════════════════════════════════════════════
function renderQList(){
  const fc=questions.filter(isFlagged).length;
  const ic=loadIncorrect(activeSetId).length;
  document.getElementById('qCount').textContent=questions.length;
  document.getElementById('flagCount').textContent=fc;
  document.getElementById('incorrectCount').textContent=ic;
  const list=document.getElementById('qList');
  const shown=qFilter==='flagged'
    ? questions.map((q,i)=>({q,i})).filter(({q})=>isFlagged(q))
    : qFilter==='incorrect'
    ? questions.map((q,i)=>({q,i})).filter(({q})=>isIncorrect(q))
    : questions.map((q,i)=>({q,i}));
  if(!shown.length){
    const msg=qFilter==='flagged'?'No flagged questions.':qFilter==='incorrect'?'No recent incorrect questions. Keep it up!':'No questions yet.';
    const icon=qFilter==='flagged'?'🚩':qFilter==='incorrect'?'✅':'📭';
    list.innerHTML=`<div class="empty-state"><div class="icon">${icon}</div>${msg}</div>`;
    return;
  }
  list.innerHTML=shown.map(({q,i})=>{
    const fl=isFlagged(q), inc=isIncorrect(q);
    const incData=loadIncorrect(activeSetId).find(x=>x.key===incorrectKey(q));
    const streakTip=incData?`${incData.streak}/2 correct`:'';
    const isCard=q.type==='card';
    const displayText=isCard?q.term:(q.text||'');
    const badgeLabel=isCard?'Card':q.type==='multi'?'Multi':'Single';
    const badgeClass=isCard?' card-type':q.type==='multi'?' multi':'';
    const hasImg = q.image || q.imageRef; // imageRef: legacy fallback
    return `<div class="q-item${fl?' is-flagged':''}${inc?' is-incorrect':''}">
      ${hasImg?`<img class="q-item-img" id="qimg_list_${i}" src="" alt="">`:'' }
      <div class="q-item-text" data-action="openEditModal" data-action-args="${i}">${esc(displayText.slice(0,80))}${displayText.length>80?'…':''}</div>
      <div class="q-item-right">
        <div class="q-item-badges">
          ${inc?`<span class="q-item-badge" style="background:rgba(255,82,82,.12);color:var(--red);border-color:rgba(255,82,82,.25)" title="${streakTip}">❌ ${streakTip}</span>`:''}
          ${fl?'<span class="q-item-badge flag-badge">🚩</span>':''}
          <span class="q-item-badge${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="q-item-actions">
          <button class="icon-btn edit-icon" data-action="openEditModal" data-action-args="${i}" title="Edit">✏️</button>
          <button class="icon-btn flag-icon${fl?' active':''}" data-action="listToggleFlag" data-action-args="${i}" title="Flag">🚩</button>
          <button class="icon-btn" data-action="deleteQ" data-action-args="${i}" title="Delete">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
  // Async: populate image thumbnails after render
  shown.forEach(({q,i}) => {
    if(!q.image && !q.imageRef) return; // imageRef: legacy fallback
    _resolveImgSrc(q).then(src => {
      const el = document.getElementById('qimg_list_'+i);
      if(el && src) el.src = src;
    });
  });
}

function listToggleFlag(i){ toggleGlobalFlag(questions[i]); renderQList(); }
function deleteQ(i){ if(confirm('Delete this question?')){ questions.splice(i,1); save(); renderQList(); } }
function clearAllQuestions(){ if(confirm('Delete ALL questions in this set?')){ questions=[]; save(); renderQList(); } }

// ═══════════════════════════════════════════════════
//  ADD FORM
// ═══════════════════════════════════════════════════
function initOptionRows(){ document.getElementById('optionsBuilder').innerHTML=''; [1,2,3,4].forEach(()=>addOptionRow()); }
function updateOptionControls(){
  const type=document.getElementById('newQType').value;
  const isCard=type==='card';
  document.getElementById('newQMcFields').style.display=isCard?'none':'';
  document.getElementById('newQCardFields').style.display=isCard?'':'none';
  document.getElementById('newQTextWrap').style.display=isCard?'none':'';
  if(!isCard){
    const t=type==='multi'?'checkbox':'radio';
    document.querySelectorAll('#optionsBuilder .opt-correct-input').forEach(inp=>{inp.type=t;inp.name='correct';});
  }
  syncCheckedOptionRows();
}
function addOptionRow(){
  const b=document.getElementById('optionsBuilder');
  const t=document.getElementById('newQType').value==='multi'?'checkbox':'radio';
  const idx=b.children.length;
  const uid_opt='opt_new_'+idx+'_'+Date.now();
  const d=document.createElement('div'); d.className='option-row';
  d.innerHTML=`<input type="${t}" id="${uid_opt}" class="opt-correct-input" name="correct" aria-label="Mark option ${idx+1} as correct"><input type="text" class="opt-text" placeholder="Answer option..." aria-label="Option ${idx+1} text"><span class="opt-correct-label">✓ Correct</span><button type="button" class="icon-btn" data-action="removeParent" style="flex-shrink:0" aria-label="Remove option">✕</button>`;
  b.appendChild(d);
}
function cancelEdit(){
  initOptionRows();
  document.getElementById('newQText').value='';
  document.getElementById('newQExplain').value='';
  document.getElementById('newQTerm').value='';
  document.getElementById('newQDef').value='';
  document.getElementById('newQType').value='single';
  document.getElementById('newQMcFields').style.display='';
  document.getElementById('newQCardFields').style.display='none';
  document.getElementById('newQTextWrap').style.display='';
  _resetNewQImgUI();
  showView('manage');
}
let _newQImg=null, _editQImg=null;  // hold data-URLs in memory during editing only

function _setImgUI(prefix, src){
  const ref = prefix==='new' ? '_newQImg' : '_editQImg';
  window[ref]=src||null;
  document.getElementById(prefix+'QImgThumb').src=src||'';
  document.getElementById(prefix+'QImgPreview').style.display=src?'block':'none';
  document.getElementById(prefix+'QImgUploadArea').style.display=src?'none':'';
}
function handleNewQImg(evt){
  const file=evt.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    const compressed = await compressImage(e.target.result);
    _newQImg=compressed; _setImgUI('new',_newQImg);
  };
  reader.readAsDataURL(file); evt.target.value='';
}
function removeNewQImg(){ _setImgUI('new',null); }
function handleEditQImg(evt){
  const file=evt.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    const compressed = await compressImage(e.target.result);
    _editQImg=compressed; _setImgUI('edit',_editQImg);
  };
  reader.readAsDataURL(file); evt.target.value='';
}
function removeEditQImg(){ _setImgUI('edit',null); }
function _resetNewQImgUI(){ _setImgUI('new',null); }

// Load image for edit modal — resolved from session cache via imageRef
function _loadImgIntoEdit(imageRef){
  _setImgUI('edit', ImageStore.get(imageRef) || null);
}

// Resolve image source for rendering — returns a Promise for consistent async handling
function _resolveImgSrc(q){
  if(!q) return Promise.resolve(null);
  if(q.imageRef) return Promise.resolve(ImageStore.get(q.imageRef) || null);
  if(q.image) return Promise.resolve(q.image); // legacy inline
  return Promise.resolve(null);
}

function saveQuestion(){
  const type=document.getElementById('newQType').value;
  let q;
  if(type==='card'){
    const term=document.getElementById('newQTerm').value.trim();
    const def=document.getElementById('newQDef').value.trim();
    if(!term) return alert('Please enter a term.');
    if(!def) return alert('Please enter a definition.');
    q={type:'card',term,definition:def,explain:document.getElementById('newQExplain').value.trim()};
  } else {
    const text=document.getElementById('newQText').value.trim();
    if(!text) return alert('Please enter a question.');
    const rows=document.querySelectorAll('#optionsBuilder .option-row');
    const options=[],correct=[];
    rows.forEach(row=>{ const t=row.querySelector('.opt-text').value.trim(); const c=row.querySelector('.opt-correct-input').checked; if(t){options.push(t);if(c)correct.push(options.length-1);} });
    if(options.length<2) return alert('Add at least 2 options.');
    if(!correct.length) return alert('Mark at least one correct answer.');
    q={text,type,options,correct,explain:document.getElementById('newQExplain').value.trim()};
  }
  if(_newQImg){
    q.imageRef = ImageStore.put(_newQImg); // store in session cache, keep localStorage clean
  }
  questions.push(q);
  _resetNewQImgUI();
  save(); cancelEdit();
}

// ═══════════════════════════════════════════════════
//  EDIT MODAL
// ═══════════════════════════════════════════════════
function openEditModal(i){
  editingIdx=i; const q=questions[i];
  const isCard=q.type==='card';
  document.getElementById('editQType').value=q.type;
  document.getElementById('editQExplain').value=q.explain||'';
  document.getElementById('editQMcFields').style.display=isCard?'none':'';
  document.getElementById('editQCardFields').style.display=isCard?'':'none';
  document.getElementById('editQText').value=isCard?'':q.text||'';
  if(isCard){
    document.getElementById('editQTerm').value=q.term||'';
    document.getElementById('editQDef').value=q.definition||'';
  } else {
    const b=document.getElementById('editOptionsBuilder'); b.innerHTML='';
    (q.options||[]).forEach((opt,oi)=>{
      const d=document.createElement('div'); d.className='option-row';
      const isC=q.correct.includes(oi), t=q.type==='multi'?'checkbox':'radio';
      d.innerHTML=`<input type="${t}" class="edit-opt-correct" name="editcorrect"${isC?' checked':''}><input type="text" class="edit-opt-text" value="${esc(opt)}"><span class="opt-correct-label">✓ Correct</span><button type="button" class="icon-btn" data-action="removeParent" style="flex-shrink:0">✕</button>`;
      b.appendChild(d);
    });
  }
  _loadImgIntoEdit(q.imageRef || null);
  modalOpen('editModal');
  syncCheckedOptionRows();
}
function closeEditModal(e){
  if(e&&e.target!==document.getElementById('editModal')) return;
  modalClose('editModal'); editingIdx=null;
}
function updateEditOptionControls(){
  const type=document.getElementById('editQType').value;
  const isCard=type==='card';
  document.getElementById('editQMcFields').style.display=isCard?'none':'';
  document.getElementById('editQCardFields').style.display=isCard?'':'none';
  if(!isCard){
    const t=type==='multi'?'checkbox':'radio';
    document.querySelectorAll('#editOptionsBuilder .edit-opt-correct').forEach(inp=>{inp.type=t;inp.name='editcorrect';});
  }
  syncCheckedOptionRows();
}
function addEditOptionRow(){
  const b=document.getElementById('editOptionsBuilder');
  const t=document.getElementById('editQType').value==='multi'?'checkbox':'radio';
  const idx=b.children.length;
  const uid_opt='opt_edit_'+idx+'_'+Date.now();
  const d=document.createElement('div'); d.className='option-row';
  d.innerHTML=`<input type="${t}" id="${uid_opt}" class="edit-opt-correct" name="editcorrect" aria-label="Mark option ${idx+1} as correct"><input type="text" class="edit-opt-text" placeholder="Answer option..." aria-label="Option ${idx+1} text"><span class="opt-correct-label">✓ Correct</span><button type="button" class="icon-btn" data-action="removeParent" style="flex-shrink:0" aria-label="Remove option">✕</button>`;
  b.appendChild(d);
}
function saveEditQuestion(){
  if(editingIdx===null) return;
  const type=document.getElementById('editQType').value;
  const oldKey=flagKey(questions[editingIdx]);
  let updatedQ;
  if(type==='card'){
    const term=document.getElementById('editQTerm').value.trim();
    const def=document.getElementById('editQDef').value.trim();
    if(!term) return alert('Term is required.');
    if(!def) return alert('Definition is required.');
    updatedQ={type:'card',term,definition:def,explain:document.getElementById('editQExplain').value.trim()};
  } else {
    const text=document.getElementById('editQText').value.trim(); if(!text) return alert('Question text required.');
    const rows=document.querySelectorAll('#editOptionsBuilder .option-row');
    const options=[],correct=[];
    rows.forEach(row=>{ const t=row.querySelector('.edit-opt-text').value.trim(); const c=row.querySelector('.edit-opt-correct').checked; if(t){options.push(t);if(c)correct.push(options.length-1);} });
    if(options.length<2) return alert('Need at least 2 options.');
    if(!correct.length) return alert('Mark at least one correct answer.');
    updatedQ={text,type,options,correct,explain:document.getElementById('editQExplain').value.trim()};
  }
  // Image handling — always use imageRef/session cache, never inline in localStorage
  if(_editQImg){
    // New image — delete old ref from cache, store new one
    if(questions[editingIdx].imageRef) ImageStore.del(questions[editingIdx].imageRef);
    updatedQ.imageRef = ImageStore.put(_editQImg);
  } else if(_editQImg === null && !document.getElementById('editQImgPreview').style.display){
    // Image was explicitly removed (preview hidden, _editQImg cleared)
    if(questions[editingIdx].imageRef) ImageStore.del(questions[editingIdx].imageRef);
  } else if(questions[editingIdx].imageRef){
    updatedQ.imageRef = questions[editingIdx].imageRef; // unchanged
  } else if(questions[editingIdx].image){
    // Migrate legacy inline image into session cache on save
    updatedQ.imageRef = ImageStore.put(questions[editingIdx].image);
  }
  questions[editingIdx]=updatedQ;
  const newKey=flagKey(questions[editingIdx]);
  if(oldKey!==newKey){ const fi=flaggedKeys.indexOf(oldKey); if(fi>=0){flaggedKeys[fi]=newKey;saveFlg();} }
  save(); modalClose('editModal'); editingIdx=null; renderQList();
}

// ═══════════════════════════════════════════════════
//  IMPORT
// ═══════════════════════════════════════════════════
function importQuestions(){
  const raw=document.getElementById('importText').value.trim();
  let added=0,errors=0;
  raw.split(/\n\s*\n/).filter(b=>b.trim()).forEach(block=>{
    try{
      const lines=block.split('\n').map(l=>l.trim()).filter(Boolean);
      // Check for CARD block first
      const cardLine=lines.find(l=>/^CARD:/i.test(l));
      if(cardLine){
        const term=cardLine.replace(/^CARD:\s*/i,'').trim();
        const defLine=lines.find(l=>/^DEF:/i.test(l));
        const definition=defLine?defLine.replace(/^DEF:\s*/i,'').trim():'';
        if(!term||!definition){ errors++; return; }
        const expLine=lines.find(l=>/^EXPLAIN:/i.test(l));
        const explain=expLine?expLine.replace(/^EXPLAIN:\s*/i,'').trim():'';
        questions.push({type:'card',term,definition,explain});
        added++; return;
      }
      const qLine=lines.find(l=>/^Q\d*:/i.test(l)); if(!qLine) return;
      let text=qLine.replace(/^Q\d*:\s*/i,'').replace(/\[SIMULATION\]/gi,'').trim();
      let isMulti=/\[MULTI\]/i.test(text)||/\(select\s+\w+\)/i.test(text);
      text=text.replace(/\[MULTI\]/gi,'').replace(/\(select\s+\w+\)/gi,'').trim();
      const expLine=lines.find(l=>/^EXPLAIN:/i.test(l));
      const explain=expLine?expLine.replace(/^EXPLAIN:\s*/i,'').trim():'';
      const rawOptLines=[];
      lines.forEach(l=>{
        if(/^Q\d*:/i.test(l)||/^EXPLAIN:/i.test(l)) return;
        const chunks=l.split(/\s{2,}/), optChunks=chunks.filter(c=>/^\*?[A-Z]:\s*.+/i.test(c));
        if(optChunks.length>=2) optChunks.forEach(c=>rawOptLines.push(c.trim()));
        else if(/^\*?[A-Z]:\s*.+/i.test(l)) rawOptLines.push(l);
      });
      const opts=[],corr=[];
      rawOptLines.forEach(ol=>{
        const isC=ol.trimStart().startsWith('*');
        const cleaned=ol.replace(/^\*?[A-Z]:\s*/i,'').replace(/←.*$/,'').replace(/\(correct\)/gi,'').trim();
        if(cleaned){ opts.push(cleaned); if(isC) corr.push(opts.length-1); }
      });
      if(corr.length>1) isMulti=true;
      if(opts.length>=2&&corr.length){ questions.push({text,type:isMulti?'multi':'single',options:opts,correct:corr,explain}); added++; }
      else errors++;
    }catch(e){ errors++; }
  });
  save();
  const m=document.getElementById('importMsg'); m.style.display='block';
  m.style.color=added?'var(--green)':'var(--red)';
  m.textContent=`✓ Imported ${added} question(s).${errors?' '+errors+' skipped.':''}`;
  if(added){ document.getElementById('importText').value=''; renderQList(); }
}

// ═══════════════════════════════════════════════════
//  EXPORT / IMPORT BANK
// ═══════════════════════════════════════════════════
function exportCurrentSet(){
  if(!activeSetId||!questions.length) return alert('No questions to export.');
  const sets=loadSets(), s=sets.find(x=>x.id===activeSetId);
  const folders=loadFolders(), folder=folders.find(f=>f.id===s.folderId)||null;
  const payload={
    version:3, exported:new Date().toISOString(),
    setName:s.name,
    folderName:folder?folder.name:null,
    questions,
    flaggedKeys,
    incorrectTracking:loadIncorrect(activeSetId)
  };
  dlBlob(JSON.stringify(payload,null,2),`quizforge-${s.name.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.json`);
}
function openPreQuizModal(){
  // If no set is loaded, show a set picker
  if(!activeSetId){
    const sets = loadSets().filter(s => loadQs(s.id).length > 0);
    if(!sets.length){
      document.getElementById('preQuizSummary').innerHTML =
        `<div style="padding:10px 14px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);font-size:.85rem;color:var(--muted)">No sets with questions yet. Add questions to a set first.</div>`;
    } else {
      document.getElementById('preQuizSummary').innerHTML =
        `<div>
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px">Select a Set</div>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto">
            ${sets.map(s=>`
              <button data-action="pickSetForQuiz" data-action-args="'${s.id}'" style="text-align:left;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-family:'Sora',sans-serif;font-size:.85rem;cursor:pointer;width:100%;transition:border-color .15s">
                <span style="font-weight:600">${esc(s.name)}</span>
                <span style="color:var(--muted);font-size:.75rem;margin-left:8px">${loadQs(s.id).length} questions</span>
              </button>`).join('')}
          </div>
        </div>`;
    }
    modalOpen('preQuizModal');
    return;
  }
  const set = loadSets().find(s => s.id === activeSetId);
  const setName = set ? set.name : '';
  const flaggedOnly = document.getElementById('settFlaggedOnly').checked;
  const limit = parseInt(document.getElementById('settQLimit').value)||0;
  let pool = questions;
  if(flaggedOnly) pool = pool.filter(isFlagged);
  const available = pool.length;
  const willAsk = limit > 0 && limit < available ? limit : available;
  const color = willAsk === 0 ? 'var(--red)' : 'var(--accent)';
  const countLabel = willAsk === 0 ? 'No questions available' :
    `${willAsk}${willAsk < available ? ' of ' + available : ''} question${willAsk !== 1 ? 's' : ''}${flaggedOnly ? ' · flagged only' : ''}`;
  document.getElementById('preQuizSummary').innerHTML =
    `<div style="padding:10px 14px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
      ${setName ? `<div style="font-size:.75rem;color:var(--muted);margin-bottom:4px">${esc(setName)}</div>` : ''}
      <div style="font-size:.85rem;font-weight:700;color:${color}">${countLabel}</div>
    </div>`;
  modalOpen('preQuizModal');
}
function pickSetForQuiz(id){
  _quizFromHome = true;
  _activateSet(id);
  openPreQuizModal();
}
function closePreQuizModal(e){
  if(e&&e.target!==document.getElementById('preQuizModal')) return;
  saveQuizSettings();
  modalClose('preQuizModal');
}
function openImportExportModal(){
  modalOpen('importExportModal', document.activeElement);
  try{ GDRIVE._renderBar(); } catch(e){}
}
function closeImportExportModal(e){
  if(e&&e.target!==document.getElementById('importExportModal')) return;
  modalClose('importExportModal');
}
let _q10SelectedId = null;
function openQuick10Modal(withinSet){
  const sets = loadSets().filter(s => loadQs(s.id).length > 0);
  const list = document.getElementById('quick10SetList');
  _q10SelectedId = activeSetId || (sets.length ? sets[0].id : null);
  function render(){
    list.innerHTML = sets.map(s => `
      <button data-action="selectQuick10Set" data-action-args="'${s.id}'" style="text-align:left;background:var(--surface2);border:2px solid ${s.id===_q10SelectedId?'var(--accent)':'var(--border)'};border-radius:10px;padding:10px 14px;color:var(--text);font-family:'Sora',sans-serif;font-size:.85rem;cursor:pointer;transition:border-color .15s;width:100%" id="q10btn_${s.id}">
        <span style="font-weight:600">${esc(s.name)}</span>
        <span style="color:var(--muted);font-size:.75rem;margin-left:8px">${loadQs(s.id).length} questions</span>
      </button>`).join('');
  }
  window.q10Highlight = () => {
    document.querySelectorAll('#quick10SetList button').forEach(btn => {
      btn.style.borderColor = btn.id === 'q10btn_' + _q10SelectedId ? 'var(--accent)' : 'var(--border)';
    });
  };
  const setSection = document.getElementById('quick10SetSection');
  const nameEl = document.getElementById('quick10SetName');
  if(withinSet){
    if(setSection) setSection.style.display = 'none';
    const set = loadSets().find(s => s.id === activeSetId);
    if(nameEl) nameEl.innerHTML = set
      ? `<div style="padding:10px 14px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);font-size:.85rem;font-weight:700;color:var(--accent);margin-bottom:16px">${esc(set.name)}</div>`
      : '';
  } else {
    if(setSection) setSection.style.display = '';
    if(nameEl) nameEl.innerHTML = '';
    if(!sets.length){
      list.innerHTML = `<div style="color:var(--muted);font-size:.82rem;padding:8px 0">No sets with questions yet.</div>`;
    } else { render(); }
  }
  modalOpen('quick10Modal');
}
function closeQuick10Modal(){ modalClose('quick10Modal'); }
let _quizFromHome = false;
function _activateSet(id){
  const sets = loadSets(), set = sets.find(s => s.id === id);
  if(!set) return false;
  activeSetId = id;
  questions = loadQs(id);
  flaggedKeys = loadFlags(id);
  document.getElementById('view-home').classList.remove('active');
  document.getElementById('innerApp').style.display = 'block';
  document.getElementById('bcSetName').textContent = set.name;
  renderHeader();
  return true;
}
function startQuick10(){
  const id = _q10SelectedId || activeSetId;
  if(!id) return;
  const qs = loadQs(id);
  if(!qs.length) return;
  closeQuick10Modal();
  _quizFromHome = true;
  _activateSet(id);
  const pool = [...questions].sort(()=>Math.random()-.5).slice(0,10);
  startQuizFromPool(pool);
}
function openBackupModal(){ modalOpen('backupModal'); }
function closeBackupModal(){ modalClose('backupModal'); }

function clearLocalAndResync(){
  if(!confirm('This will wipe ALL local data on this device and pull a fresh copy from Google Drive.\n\nYour Drive data is untouched. Continue?')) return;
  // Check Google Drive is connected before nuking local data
  if(!window.GDRIVE || !localStorage.getItem('qforge_gdrive_token')){
    alert('Not connected to Google Drive. Connect first so data can be restored after the wipe.');
    return;
  }
  // Clear every qforge key from localStorage
  const keys = Object.keys(localStorage).filter(k => k.startsWith('qforge_'));
  keys.forEach(k => localStorage.removeItem(k));
  // Reset in-memory state
  sets = []; questions = []; flaggedKeys = []; activeSetId = null;
  try{ renderSetsGrid(); } catch(e){}
  showHomeMsg('✓ Local data cleared — pulling from Drive…', true);
  // Force a fresh sync — re-reads token from storage first
  setTimeout(() => {
    try{ GDRIVE.initSync(); } catch(e){ showHomeMsg('✗ Sync failed: ' + e.message, false); }
  }, 300);
}
function openOrganizeModal(){
  renderOrganizeList();
  modalOpen('organizeModal');
}
function closeOrganizeModal(e){
  if(e&&e.target!==document.getElementById('organizeModal')) return;
  modalClose('organizeModal');
}
let _orgItems=[];
let _orgDragIdx=null;

function renderOrganizeList(){
  const sets=loadSets(), folders=loadFolders();
  // Build flat ordered list matching how grid renders: folders first, then root sets
  _orgItems=[
    ...folders.map(f=>({type:'folder',id:f.id,name:f.name,meta:sets.filter(s=>s.folderId===f.id).length+' set(s)'})),
    ...sets.filter(s=>!s.folderId).map(s=>({type:'set',id:s.id,name:s.name,meta:loadQs(s.id).length+' questions'}))
  ];
  _renderOrgDOM();
}

function _renderOrgDOM(){
  const el=document.getElementById('organizeList');
  const len=_orgItems.length;
  el.innerHTML=_orgItems.map((item,i)=>`
    <div class="organize-row" data-idx="${i}" draggable="true"
      ondragstart="orgDragStart(event,${i})" ondragover="orgDragOver(event)" ondrop="orgDrop(event,${i})" ondragend="orgDragEnd()"
      style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;transition:background .15s">
      <span style="cursor:grab;color:var(--muted);font-size:1rem;padding:0 4px;user-select:none">⠿</span>
      <span style="font-size:.9rem">${item.type==='folder'?'📁':'📋'}</span>
      <span style="flex:1;font-size:.85rem;font-weight:600">${esc(item.name)}</span>
      <span style="font-size:.72rem;color:var(--muted);margin-right:6px">${item.meta}</span>
      <div style="display:flex;gap:2px">
        <button class="icon-btn" style="min-width:32px;min-height:32px;font-size:.8rem" data-action="orgMoveUp" data-action-args="${i}" ${i===0?'disabled':''}>▲</button>
        <button class="icon-btn" style="min-width:32px;min-height:32px;font-size:.8rem" data-action="orgMoveDown" data-action-args="${i}" ${i===len-1?'disabled':''}>▼</button>
      </div>
    </div>`).join('');
}

function orgMoveUp(i){
  if(i<=0) return;
  const tmp=_orgItems[i]; _orgItems[i]=_orgItems[i-1]; _orgItems[i-1]=tmp;
  _renderOrgDOM();
}
function orgMoveDown(i){
  if(i>=_orgItems.length-1) return;
  const tmp=_orgItems[i]; _orgItems[i]=_orgItems[i+1]; _orgItems[i+1]=tmp;
  _renderOrgDOM();
}
function orgDragStart(e,i){ _orgDragIdx=i; setTimeout(()=>{ const rows=document.querySelectorAll('.organize-row'); if(rows[i]) rows[i].style.opacity='.4'; },0); }
function orgDragEnd(){ document.querySelectorAll('.organize-row').forEach(r=>{ r.style.opacity='1'; r.style.background=''; }); }
function orgDragOver(e){ e.preventDefault(); e.currentTarget.style.background='rgba(0,229,255,.08)'; }
function orgDrop(e,targetIdx){
  e.preventDefault();
  if(_orgDragIdx===null||_orgDragIdx===targetIdx){ _orgDragIdx=null; return; }
  const item=_orgItems.splice(_orgDragIdx,1)[0];
  _orgItems.splice(targetIdx,0,item);
  _orgDragIdx=null;
  _renderOrgDOM();
}
function saveOrganize(){
  // Persist order to dedicated gridOrder key
  saveGridOrder(_orgItems.map(x=>({type:x.type,id:x.id})));
  modalClose('organizeModal');
  renderSetsGrid();
}
function openQuizOptsModal(){ openPreQuizModal(); }
function closeQuizOptsModal(e){ closePreQuizModal(e); }
function toggleAdvancedOpts(){
  const el = document.getElementById('advancedOpts');
  const caret = document.getElementById('advOptsCaret');
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  caret.textContent = open ? '▼' : '▶';
}
function toggleHomeMenu(e){
  e.stopPropagation();
  const m = document.getElementById('homeMenu');
  m.style.display = m.style.display === 'none' ? '' : 'none';
  if(m.style.display !== 'none'){
    _updateSoundToggle();
    const db = document.getElementById('menuDueBadges');
    if(db) db.checked = dueBadgesEnabled();
    setTimeout(()=>document.addEventListener('click', closeHomeMenu, {once:true}), 0);
  }
}
function closeHomeMenu(){
  const m = document.getElementById('homeMenu');
  if(m) m.style.display = 'none';
}

function openExportModal(){
  const sets=loadSets();
  if(!sets.length) return showHomeMsg('No sets to export.',false);
  const list=document.getElementById('exportSetList');
  list.innerHTML=sets.map(s=>{
    const qs=loadQs(s.id)||[];
    return `<label style="display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:pointer">
      <input type="checkbox" class="export-set-check" data-id="${s.id}" checked style="width:20px;height:20px;accent-color:var(--accent);flex-shrink:0">
      <div>
        <div style="font-size:.9rem;font-weight:600">${esc(s.name)}</div>
        <div style="font-size:.72rem;color:var(--muted)">${qs.length} question${qs.length!==1?'s':''}</div>
      </div>
    </label>`;
  }).join('');
  modalOpen('exportModal');
}
function closeExportModal(e){
  if(e&&e.target!==document.getElementById('exportModal')) return;
  modalClose('exportModal');
}
function exportSelectAll(){
  document.querySelectorAll('.export-set-check').forEach(c=>c.checked=true);
}
function exportSelectNone(){
  document.querySelectorAll('.export-set-check').forEach(c=>c.checked=false);
}
function exportSelected(){
  const checked=[...document.querySelectorAll('.export-set-check:checked')].map(c=>c.dataset.id);
  if(!checked.length) return alert('Select at least one set.');
  const allSets=loadSets(), sets=allSets.filter(s=>checked.includes(s.id));
  const folders=loadFolders();
  // Include only folders that have at least one exported set
  const usedFolderIds=new Set(sets.map(s=>s.folderId).filter(Boolean));
  const exportFolders=folders.filter(f=>usedFolderIds.has(f.id));
  if(checked.length===1){
    const s=sets[0], folder=folders.find(f=>f.id===s.folderId)||null;
    const payload={version:3,exported:new Date().toISOString(),setName:s.name,folderName:folder?folder.name:null,questions:loadQs(s.id),flaggedKeys:loadFlags(s.id),incorrectTracking:loadIncorrect(s.id)};
    dlBlob(JSON.stringify(payload,null,2),`quizforge-${s.name.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.json`);
  } else {
    const payload={version:3,exported:new Date().toISOString(),folders:exportFolders,sets:sets.map(s=>({id:s.id,name:s.name,folderId:s.folderId||null,created:s.created,questions:loadQs(s.id),flaggedKeys:loadFlags(s.id),incorrectTracking:loadIncorrect(s.id)}))};
    dlBlob(JSON.stringify(payload,null,2),`quizforge-${sets.length}sets-${new Date().toISOString().slice(0,10)}.json`);
  }
  modalClose('exportModal');
  showHomeMsg(`✓ Exported ${checked.length} set(s).`,true);
}
function exportAll(){
  const sets=loadSets(); if(!sets.length) return showHomeMsg('No sets to export.',false);
  const folders=loadFolders();
  const payload={version:3,exported:new Date().toISOString(),folders,sets:sets.map(s=>({id:s.id,name:s.name,folderId:s.folderId||null,created:s.created,questions:loadQs(s.id),flaggedKeys:loadFlags(s.id),incorrectTracking:loadIncorrect(s.id)}))};
  dlBlob(JSON.stringify(payload,null,2),`quizforge-all-${new Date().toISOString().slice(0,10)}.json`);
  showHomeMsg(`✓ Exported ${sets.length} set(s).`,true);
}
function importBank(evt){
  const file=evt.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const data=JSON.parse(e.target.result); let setsAdded=0,qAdded=0;
      // If this is a full backup file, route it correctly
      if(data.type==='fullbackup'){
        showHomeMsg('✗ This is a full backup file — use "Restore Full Backup" instead.',false);
        evt.target.value=''; return;
      }
      // Load any bundled images into session cache first
      if(data.images && typeof data.images === 'object') ImageStore.putAll(data.images);
      if(data.sets&&Array.isArray(data.sets)){
        // Load images into session cache before saveQs strips refs
        if(data.images && typeof data.images === 'object') ImageStore.putAll(data.images);
        const existing=loadSets(), existingFolders=loadFolders();
        const folderIdMap={};
        if(data.folders&&Array.isArray(data.folders)){
          data.folders.forEach(f=>{
            const ef=existingFolders.find(x=>x.name.toLowerCase()===f.name.toLowerCase());
            if(ef){ folderIdMap[f.id]=ef.id; }
            else{ const newId=uid(); folderIdMap[f.id]=newId; existingFolders.push({id:newId,name:f.name}); }
          });
          saveFolders(existingFolders);
        }
        data.sets.forEach(sd=>{
          const newId=uid();
          const newFolderId=sd.folderId&&folderIdMap[sd.folderId]?folderIdMap[sd.folderId]:null;
          existing.push({id:newId,name:sd.name||'Imported Set',folderId:newFolderId,created:sd.created||Date.now()});
          saveQs(newId,Array.isArray(sd.questions)?sd.questions:[]);
          saveFlags(newId,Array.isArray(sd.flaggedKeys)?sd.flaggedKeys:[]);
          if(Array.isArray(sd.incorrectTracking)) saveIncorrect(newId,sd.incorrectTracking);
          setsAdded++; qAdded+=(sd.questions||[]).length;
        });
        saveSets(existing);
        showHomeMsg(`✓ Imported ${setsAdded} set(s) with ${qAdded} question(s).`,true);
      } else if(data.questions&&Array.isArray(data.questions)){
        const existing=loadSets(), newId=uid(), name=(data.setName||file.name.replace(/.json$/,'')||'Imported Set').trim();
        existing.push({id:newId,name,folderId:null,created:Date.now()});
        saveQs(newId,data.questions);
        saveFlags(newId,Array.isArray(data.flaggedKeys)?data.flaggedKeys:[]);
        if(Array.isArray(data.incorrectTracking)) saveIncorrect(newId,data.incorrectTracking);
        saveSets(existing);
        showHomeMsg(`✓ Created "${name}" with ${data.questions.length} question(s).`,true);
      } else throw new Error('No recognisable sets or questions found in file.');
      renderSetsGrid();
    }catch(err){ showHomeMsg('✗ Import failed: '+err.message,false); }
    evt.target.value='';
  };
  reader.onerror=()=>{ showHomeMsg('✗ Could not read file — try again.',false); evt.target.value=''; };
  reader.readAsText(file);
}
function exportFullBackup(){
  const sets=loadSets(), folders=loadFolders(), gridOrder=loadGridOrder();
  const byId = (id) => document.getElementById(id);
  const settings={
    shuffle:!!byId('settShuffle')?.checked,
    shuffleOpts:!!byId('settShuffleOpts')?.checked,
    feedback:!!byId('settFeedback')?.checked,
    explain:!!byId('settExplain')?.checked,
    flaggedOnly:!!byId('settFlaggedOnly')?.checked,
    qTimer:byId('settQTimer')?.value || '0',
    autoAdvance:!!byId('settAutoAdvance')?.checked,
    qLimit:byId('settQLimit')?.value || '0',
    cardFirst:byId('settCardFirst')?.value || 'term',
    cardsOnly:!!byId('settCardsOnly')?.checked
  };
  // Collect all imageRefs across all sets and bundle blobs from session cache
  const allSetsData = sets.map(s=>({
    id:s.id, name:s.name, folderId:s.folderId||null, created:s.created,
    questions:loadQs(s.id),
    flaggedKeys:loadFlags(s.id),
    incorrectTracking:loadIncorrect(s.id)
  }));
  const allRefs = [];
  allSetsData.forEach(s => s.questions.forEach(q => { if(q.imageRef) allRefs.push(q.imageRef); }));
  const images = ImageStore.getAll(allRefs);
  const payload={
    type:'fullbackup', version:7,
    exported:new Date().toISOString(),
    settings, gridOrder, folders,
    images,  // {imageRef: dataURL} — images live here, not inline in questions
    sets: allSetsData
  };
  dlBlob(JSON.stringify(payload,null,2),`quizforge-backup-${new Date().toISOString().slice(0,10)}.json`);
  showHomeMsg(`✓ Full backup exported (${allRefs.length} image(s) included).`,true);
  return true;
}
function importFullBackup(evt){
  const file=evt.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.type!=='fullbackup') throw new Error('Not a full backup file. Use Import Set(s) instead.');
      if(!confirm('This will REPLACE all your current data with the backup. Are you sure?')){ evt.target.value=''; return; }
      // Load images from payload into session cache FIRST — before saveQs strips refs
      if(data.images && typeof data.images === 'object') ImageStore.putAll(data.images);
      // Also handle legacy v5 format where images were inline in q.image
      // (saveQs will auto-migrate those into ImageStore)
      // Clear everything
      const oldSets=loadSets();
      oldSets.forEach(s=>{ localStorage.removeItem('qforge_qs_'+s.id); localStorage.removeItem('qforge_flags_'+s.id); localStorage.removeItem('qforge_incorrect_'+s.id); });
      // Restore folders
      saveFolders(Array.isArray(data.folders)?data.folders:[]);
      // Restore sets
      const newSets=[];
      if(Array.isArray(data.sets)){
        data.sets.forEach(sd=>{
          newSets.push({id:sd.id,name:sd.name,folderId:sd.folderId||null,created:sd.created||Date.now()});
          saveQs(sd.id,Array.isArray(sd.questions)?sd.questions:[]);
          saveFlags(sd.id,Array.isArray(sd.flaggedKeys)?sd.flaggedKeys:[]);
          if(Array.isArray(sd.incorrectTracking)) saveIncorrect(sd.id,sd.incorrectTracking);
        });
      }
      saveSets(newSets);
      if(Array.isArray(data.gridOrder)) saveGridOrder(data.gridOrder);
      if(data.settings){
        const s=data.settings;
        const set=(id,val)=>{ const el=document.getElementById(id); if(el) typeof val==='boolean'?el.checked=val:el.value=val; };
        set('settShuffle',s.shuffle); set('settShuffleOpts',s.shuffleOpts);
        set('settFeedback',s.feedback); set('settExplain',s.explain);
        set('settFlaggedOnly',s.flaggedOnly); set('settQTimer',s.qTimer||'0');
        set('settAutoAdvance',s.autoAdvance); set('settQLimit',s.qLimit||'0');
        if(s.cardFirst) set('settCardFirst',s.cardFirst);
        if(s.cardsOnly!==undefined) set('settCardsOnly',s.cardsOnly);
        saveQuizSettings();
      }
      showHomeMsg(`✓ Backup restored — ${newSets.length} set(s) loaded.`,true);
      renderSetsGrid();
    }catch(err){ showHomeMsg('✗ Restore failed: '+err.message,false); }
    evt.target.value='';
  };
  reader.onerror=()=>{ showHomeMsg('✗ Could not read file — try again.',false); evt.target.value=''; };
  reader.readAsText(file);
}
function dlBlob(content,filename){
  const blob=new Blob([content],{type:'application/json'}), url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.rel='noopener';
  a.style.display='none';
  document.body.appendChild(a);
  try {
    a.click();
  } catch (e) {
    a.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
  }
  setTimeout(()=>{ if(a.parentNode) document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

// ═══════════════════════════════════════════════════
//  QUIZ
// ═══════════════════════════════════════════════════
function startQuiz(){
  let pool=[...questions];
  if(document.getElementById('settFlaggedOnly').checked) pool=pool.filter(isFlagged);
  if(document.getElementById('settCardsOnly').checked) pool=pool.filter(q=>q.type==='card');
  if(document.getElementById('settSRSOnly') && document.getElementById('settSRSOnly').checked){
    const due=getDueQuestions(activeSetId,pool);
    if(!due.length){ alert('🎉 Nothing due for review! All caught up.'); return; }
    pool=due;
  }
  if(!pool.length) return alert('No questions to quiz!');
  if(document.getElementById('settShuffle').checked) pool.sort(()=>Math.random()-.5);
  const limit=parseInt(document.getElementById('settQLimit').value)||0;
  if(limit>0&&limit<pool.length) pool=pool.slice(0,limit);
  startQuizFromPool(pool);
}
function updateOverallTimer(){
  const m=Math.floor(overallSec/60).toString().padStart(2,'0'), s=(overallSec%60).toString().padStart(2,'0');
  document.getElementById('overallVal').textContent=`${m}:${s}`;
}
function startQTimer(){
  clearInterval(qInterval); qMaxSec=parseInt(document.getElementById('settQTimer').value)||0;
  const wrap=document.getElementById('qTimerWrap');
  if(!qMaxSec){wrap.style.display='none';return;}
  wrap.style.display='flex'; qSec=qMaxSec; updateQTimer();
  const gen = ++_qTimerGen; // capture generation for this question
  qInterval=setInterval(()=>{
    if(gen !== _qTimerGen){ clearInterval(qInterval); return; } // stale — wrong question
    qSec--; updateQTimer();
    if(qSec<=0){ clearInterval(qInterval); onTimeout(); }
  },1000);
}
function updateQTimer(){
  document.getElementById('ringTxt').textContent=qSec<=99?qSec:'∞';
  const circ=113.1, pct=Math.max(0,qSec/qMaxSec);
  const ring=document.getElementById('ringFill'), rtxt=document.getElementById('ringTxt');
  ring.style.strokeDashoffset=circ*(1-pct);
  if(pct>.5){ring.style.stroke='var(--accent)';rtxt.style.color='var(--accent)';}
  else if(pct>.25){ring.style.stroke='var(--orange)';rtxt.style.color='var(--orange)';}
  else{ring.style.stroke='var(--red)';rtxt.style.color='var(--red)';}
}
function onTimeout(){
  if(answered) return; answered=true; quiz.timeouts++;
  const q=quiz.questions[quiz.idx];
  if(!quiz.savedAnswers) quiz.savedAnswers={};
  quiz.savedAnswers[quiz.idx]={selected:[],isCorrect:false};
  markIncorrect(q); quiz.wrongs=(quiz.wrongs||0)+1; renderHeader();
  document.getElementById('wrongDisplay').textContent=quiz.wrongs;
  document.querySelectorAll('.choice-btn').forEach((btn,i)=>{ btn.disabled=true; if(q.correct.includes(i)) btn.classList.add('correct'); else if(quiz.selected.includes(i)) btn.classList.add('wrong'); });
  const fb=document.getElementById('feedbackBox'); fb.style.display='block'; fb.className='feedback-box show timeout-fb';
  document.getElementById('fbTitle').textContent="⏱ Time's up!";
  document.getElementById('fbExplain').textContent=`Correct: ${q.correct.map(i=>q.options[i]).join(', ')}${q.explain?' — '+q.explain:''}`;
  const sb=document.getElementById('submitBtn'), isLast=quiz.idx>=quiz.questions.length-1;
  sb.textContent=isLast?'See Results →':'Next →'; sb.onclick=nextQuestion;
}
function renderQuestion(){
  answered=false; quiz.selected=[];
  const q=quiz.questions[quiz.idx], total=quiz.questions.length, pct=Math.round((quiz.idx/total)*100);
  const freeNav=isFreeNav();
  // Restore saved answer for this question if navigating back (MC: re-selects choices, card: shows flipped state)
  const saved=(quiz.savedAnswers||{})[quiz.idx];
  const hasRealAnswer = saved && (
    (saved.selected && saved.selected.length > 0) ||
    (saved.cardResult !== undefined)
  );
  if(hasRealAnswer && freeNav){
    if(saved.selected) quiz.selected=[...saved.selected];
    // Note: answered stays false for MC so user can change and re-submit
    // Cards handle their own answered state via wasAnswered below
  }
  document.getElementById('progressLabel').textContent=`Q ${quiz.idx+1} of ${total}`;
  document.getElementById('progressPct').textContent=pct+'%';
  document.getElementById('progressFill').style.width=pct+'%';
  const feedbackOn=document.getElementById('settFeedback').checked;
  const scoreBadges=document.getElementById('scoreBadgeWrap');
  if(scoreBadges) scoreBadges.style.display=feedbackOn?'flex':'none';
  document.getElementById('scoreDisplay').textContent=quiz.score;
  document.getElementById('wrongDisplay').textContent=quiz.wrongs||0;
  const fl=isFlagged(q), fb=document.getElementById('flagBtn');
  fb.textContent='🚩'; fb.className='btn btn-flag'+(fl?' flagged':'');
  fb.style.cssText='padding:5px 9px;font-size:.75rem;min-height:0'+(fl?';background:rgba(255,215,64,.15)':'');
  document.getElementById('questionCard').classList.toggle('is-flagged',fl);
  const feedEl=document.getElementById('feedbackBox'); feedEl.className='feedback-box'; feedEl.style.display='none';

  if(q.type==='card'){
    const showFirst=document.getElementById('settCardFirst').value||'term';
    const frontText=showFirst==='term'?q.term:q.definition;
    const backText=showFirst==='term'?q.definition:q.term;
    const frontLabel=showFirst==='term'?'Term':'Definition';
    const backLabel=showFirst==='term'?'Definition':'Term';
    document.getElementById('questionText').textContent='';
    const qImg=document.getElementById('questionImg'); qImg.src=''; qImg.style.display='none';
    document.getElementById('questionHint').style.display='none';
    // If previously answered this card, show pre-flipped with result
    const wasAnswered=saved && saved.cardResult!==undefined;
    document.getElementById('choicesList').innerHTML=`
      <div class="flip-card-wrap" data-action="flipCard" data-action-args="this">
        <div class="flip-card${wasAnswered?' flipped':''}" id="flipCard">
          <div class="flip-face flip-face-front">
            <div class="flip-label">${frontLabel}</div>
            ${(q.imageRef||q.image)?`<img class="flip-card-img" id="flipCardImg" src="" alt="">`:''}
            <div class="flip-text">${esc(frontText)}</div>
            <div class="flip-tap-hint">Tap to reveal ${backLabel.toLowerCase()}</div>
          </div>
          <div class="flip-face flip-face-back">
            <div class="flip-label">${backLabel}</div>
            <div class="flip-text">${esc(backText)}</div>
            ${q.explain?`<div style="font-size:.75rem;color:var(--muted);margin-top:10px;line-height:1.5">${esc(q.explain)}</div>`:''}
          </div>
        </div>
      </div>`;
    const footer=document.querySelector('.quiz-footer');
    const backBtn=freeNav&&quiz.idx>0?`<button class="btn btn-ghost" style="flex:1;max-width:120px" data-action="prevQuestion">← Back</button>`:'';
    if(wasAnswered){
      // Previously answered — show re-answer buttons immediately
      const isLast=quiz.idx>=total-1;
      footer.innerHTML=`
        <span class="quiz-footer-hint" id="selHint"></span>
        <div style="display:flex;gap:8px;width:100%;flex-wrap:wrap">
          ${backBtn}
          <button class="btn-got-it" style="flex:1;padding:14px;border-radius:var(--radius);font-family:'Sora',sans-serif;font-weight:700;font-size:.9rem" data-action="cardAnswer" data-action-args="true">✓ Got it</button>
          <button class="btn-missed" style="flex:1;padding:14px;border-radius:var(--radius);font-family:'Sora',sans-serif;font-weight:700;font-size:.9rem" data-action="cardAnswer" data-action-args="false">✗ Missed it</button>
          <button class="btn btn-primary" style="flex:1;max-width:120px" data-action="nextQuestion">${isLast?'Results →':'Next →'}</button>
        </div>`;
    } else {
      footer.innerHTML=`
        <span class="quiz-footer-hint" id="selHint"></span>
        <div style="display:flex;gap:8px;width:100%">
          ${backBtn}
          <button class="btn btn-primary submit-btn" id="submitBtn" style="display:none"></button>
          <div class="flashcard-btns" id="flashcardBtns" style="display:${wasAnswered?'flex':'none'};flex:1">
            <button class="btn-got-it flashcard-btns" style="flex:1;padding:14px;border-radius:var(--radius);font-family:'Sora',sans-serif;font-weight:700;font-size:.9rem" data-action="cardAnswer" data-action-args="true">✓ Got it</button>
            <button class="btn-missed flashcard-btns" style="flex:1;padding:14px;border-radius:var(--radius);font-family:'Sora',sans-serif;font-weight:700;font-size:.9rem" data-action="cardAnswer" data-action-args="false">✗ Missed it</button>
          </div>
        </div>`;
    }
        // Async: populate flashcard image from IndexedDB after render
    if(q.imageRef || q.image){
      _resolveImgSrc(q).then(src => {
        const fi = document.getElementById('flipCardImg');
        if(fi && src) fi.src = src;
      });
    }
    updateHotkeyLegend(true);
  } else {
    // MC mode
    const footer=document.querySelector('.quiz-footer');
    footer.innerHTML=`<span class="quiz-footer-hint" id="selHint"></span><button class="btn btn-primary submit-btn" id="submitBtn" data-action="submitAnswer">Submit Answer</button>`;
    document.getElementById('questionText').textContent=q.text;
    const qImg=document.getElementById('questionImg');
    if(q.imageRef || q.image){
      _resolveImgSrc(q).then(src => { if(src){ qImg.src=src; qImg.style.display='block'; } });
    } else { qImg.src=''; qImg.style.display='none'; }
    const hint=document.getElementById('questionHint');
    if(q.type==='multi'){hint.textContent=`Select ${q.correct.length} correct answer(s)`;hint.style.display='flex';}
    else hint.style.display='none';
    document.getElementById('selHint').textContent=q.type==='multi'?`Choose ${q.correct.length}`:'Choose 1';
    const keys='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    document.getElementById('choicesList').innerHTML=q.options.map((opt,i)=>
      `<button class="choice-btn${quiz.selected.includes(i)?' selected':''}" id="choice-${i}" data-action="toggleChoice" data-action-args="${i}"><span class="ck">${keys[i]}</span><span>${esc(opt)}</span></button>`
    ).join('');
    const sb=document.getElementById('submitBtn');
    sb.style.display=''; sb.textContent='Submit Answer'; sb.onclick=submitAnswer;
    if(freeNav && quiz.idx>0){
      const backBtn=document.createElement('button');
      backBtn.className='btn btn-ghost'; backBtn.textContent='← Back';
      backBtn.style.cssText='flex:1;max-width:120px';
      backBtn.onclick=prevQuestion;
      footer.insertBefore(backBtn, sb);
    }
    if(q.type==='multi'){
      const needed=q.correct.length, have=quiz.selected.length, ready=have>=needed;
      sb.disabled=!ready; sb.style.opacity=ready?'':'0.45'; sb.style.cursor=ready?'':'not-allowed';
      document.getElementById('selHint').textContent=ready?`${have} selected — ready!`:`Choose ${needed} (${have}/${needed} selected)`;
    } else { sb.disabled=false; sb.style.opacity=''; sb.style.cursor=''; }
    updateHotkeyLegend(false);
  }
  startQTimer();
}
function flipCard(wrap){
  const card=wrap.querySelector('.flip-card');
  card.classList.toggle('flipped');
  if(card.classList.contains('flipped')){
    SFX.flip();
    const fbDiv=document.getElementById('flashcardBtns');
    if(fbDiv) fbDiv.style.display='flex';
  }
}
function cardAnswer(gotIt){
  if(answered) return; answered=true;
  const q=quiz.questions[quiz.idx];
  // Save answer (overwrite if re-answering)
  if(!quiz.savedAnswers) quiz.savedAnswers={};
  const prevSaved=quiz.savedAnswers[quiz.idx];
  quiz.savedAnswers[quiz.idx]={cardResult:gotIt, isCorrect:gotIt};
  // Undo previous incorrect tracking if re-answering
  if(prevSaved!==undefined){
    const arr=loadIncorrect(activeSetId);
    const key=incorrectKey(q);
    const idx=arr.findIndex(x=>x.key===key);
    if(idx>=0) arr.splice(idx,1);
    saveIncorrect(activeSetId,arr);
  }
  if(gotIt) markCorrect(q); else markIncorrect(q);
  if(gotIt) SFX.correct(); else SFX.incorrect();
  // Recalculate score from savedAnswers
  let score=0, wrongs=0;
  Object.values(quiz.savedAnswers).forEach(a=>{ if(a.isCorrect) score++; else wrongs++; });
  quiz.score=score; quiz.wrongs=wrongs;
  // Update answerLog
  if(quiz.answerLog){
    const key=incorrectKey(q);
    const li=quiz.answerLog.findIndex(e=>incorrectKey(e.q)===key);
    const entry={q,selected:[],isCorrect:gotIt,isCard:true};
    if(li>=0) quiz.answerLog[li]=entry; else quiz.answerLog.push(entry);
  }
  document.getElementById('scoreDisplay').textContent=quiz.score;
  document.getElementById('wrongDisplay').textContent=quiz.wrongs||0;
  renderHeader();
  clearInterval(qInterval);
  const isLast=quiz.idx>=quiz.questions.length-1;
  const fbDiv=document.getElementById('flashcardBtns');
  if(fbDiv) fbDiv.style.display='none';
  const footer=document.querySelector('.quiz-footer');
  // Clear footer and rebuild with back + next
  footer.innerHTML='';
  if(isFreeNav() && quiz.idx>0){
    const backBtn=document.createElement('button');
    backBtn.className='btn btn-ghost'; backBtn.textContent='← Back';
    backBtn.style.cssText='flex:1;max-width:120px';
    backBtn.onclick=prevQuestion;
    footer.appendChild(backBtn);
  }
  const nextBtn=document.createElement('button');
  nextBtn.className='btn btn-primary submit-btn';
  nextBtn.style.flex='1';
  nextBtn.textContent=isLast?'See Results →':'Next →';
  nextBtn.onclick=nextQuestion;
  footer.appendChild(nextBtn);
}
function toggleFlag(){
  const q=quiz.questions[quiz.idx]; toggleGlobalFlag(q);
  const fl=isFlagged(q), btn=document.getElementById('flagBtn');
  btn.textContent='🚩'; btn.className='btn btn-flag'+(fl?' flagged':'');
  btn.style.cssText='padding:5px 9px;font-size:.75rem;min-height:0'+(fl?';background:rgba(255,215,64,.15)':'');
  document.getElementById('questionCard').classList.toggle('is-flagged',fl);
}
function toggleChoice(i){
  if(answered) return;
  const q=quiz.questions[quiz.idx], btn=document.getElementById('choice-'+i);
  if(q.type==='single'){
    quiz.selected=[i];
    document.querySelectorAll('.choice-btn').forEach((b,j)=>b.classList.toggle('selected',j===i));
  } else {
    const p=quiz.selected.indexOf(i);
    if(p>=0){ quiz.selected.splice(p,1); btn.classList.remove('selected'); }
    else { quiz.selected.push(i); btn.classList.add('selected'); }
  }
  // Update submit button state for multi questions
  if(q.type==='multi'){
    const sb=document.getElementById('submitBtn');
    const needed=q.correct.length, have=quiz.selected.length;
    const ready=have>=needed;
    sb.disabled=!ready;
    sb.style.opacity=ready?'':'0.45';
    sb.style.cursor=ready?'':'not-allowed';
    // Update hint text with live count
    document.getElementById('selHint').textContent=ready
      ? `${have} selected — ready!`
      : `Choose ${needed} (${have}/${needed} selected)`;
  }
}
function submitAnswer(){
  if(answered) return;
  const q=quiz.questions[quiz.idx];
  if(!quiz.selected.length) return;
  if(q.type==='multi' && quiz.selected.length < q.correct.length){
    const hint=document.getElementById('selHint');
    hint.textContent=`⚠ Select ${q.correct.length - quiz.selected.length} more answer(s)`;
    hint.style.color='var(--orange)';
    setTimeout(()=>{ hint.style.color=''; hint.textContent=`Choose ${q.correct.length} (${quiz.selected.length}/${q.correct.length} selected)`; }, 2000);
    return;
  }
  clearInterval(qInterval); answered=true;
  const isCorrect=[...q.correct].sort().join(',')===[...quiz.selected].sort().join(',');
  // Save answer (overwrite if re-answering)
  if(!quiz.savedAnswers) quiz.savedAnswers={};
  const prevSaved=quiz.savedAnswers[quiz.idx];
  quiz.savedAnswers[quiz.idx]={selected:[...quiz.selected], isCorrect};
  // Recalculate score and wrongs from savedAnswers to avoid double-counting
  let score=0, wrongs=0;
  Object.values(quiz.savedAnswers).forEach(a=>{ if(a.isCorrect) score++; else wrongs++; });
  quiz.score=score; quiz.wrongs=wrongs;
  // Update incorrect tracking (undo previous if re-answering)
  if(prevSaved!==undefined){
    // Remove old tracking for this question before re-tracking
    const arr=loadIncorrect(activeSetId);
    const key=incorrectKey(q);
    const idx=arr.findIndex(x=>x.key===key);
    if(idx>=0) arr.splice(idx,1);
    saveIncorrect(activeSetId,arr);
  }
  if(isCorrect) markCorrect(q); else markIncorrect(q);
  if(isCorrect) SFX.correct(); else SFX.incorrect();
  // Update answerLog (replace entry for this question if re-answering)
  if(quiz.answerLog){
    const key=incorrectKey(q);
    const li=quiz.answerLog.findIndex(e=>incorrectKey(e.q)===key);
    const entry={q,selected:[...quiz.selected],isCorrect};
    if(li>=0) quiz.answerLog[li]=entry; else quiz.answerLog.push(entry);
  }
  renderHeader();
  if(document.getElementById('settFeedback').checked){
    document.querySelectorAll('.choice-btn').forEach((btn,i)=>{ btn.disabled=true; if(q.correct.includes(i)) btn.classList.add('correct'); else if(quiz.selected.includes(i)) btn.classList.add('wrong'); });
    const fb=document.getElementById('feedbackBox'); fb.style.display='block';
    if(isCorrect){fb.className='feedback-box show correct-fb';document.getElementById('fbTitle').textContent='✓ Correct!';}
    else{fb.className='feedback-box show wrong-fb';document.getElementById('fbTitle').textContent=`✗ Incorrect — Correct: ${q.correct.map(i=>q.options[i]).join(', ')}`;}
    document.getElementById('fbExplain').textContent=(document.getElementById('settExplain').checked&&q.explain)?q.explain:'';
  } else {
    document.querySelectorAll('.choice-btn').forEach(btn=>{ btn.disabled=true; });
  }
  document.getElementById('scoreDisplay').textContent=quiz.score;
  document.getElementById('wrongDisplay').textContent=quiz.wrongs||0;
  const sb=document.getElementById('submitBtn'), isLast=quiz.idx>=quiz.questions.length-1;
  // Disable button immediately to prevent double-click
  sb.disabled=true; sb.style.opacity='0.5'; sb.style.cursor='not-allowed';
  if(isFreeNav()){
    // Free-nav: show Next button but don't auto-advance (user may want to go back)
    sb.textContent=isLast?'See Results →':'Next →';
    sb.disabled=false; sb.style.opacity=''; sb.style.cursor='';
    sb.onclick=nextQuestion;
    // In free-nav, also add a back button after answering
    if(quiz.idx>0 && !document.querySelector('.quiz-footer .btn-ghost')){
      const footer=document.querySelector('.quiz-footer');
      const backBtn=document.createElement('button');
      backBtn.className='btn btn-ghost'; backBtn.textContent='← Back';
      backBtn.style.cssText='flex:1;max-width:120px';
      backBtn.onclick=prevQuestion;
      footer.insertBefore(backBtn, footer.firstChild);
    }
  } else if(document.getElementById('settFeedback').checked){
    // Feedback on: show result, require click to advance
    sb.textContent=isLast?'See Results →':'Next →';
    sb.disabled=false; sb.style.opacity=''; sb.style.cursor='';
    sb.onclick=nextQuestion;
  } else {
    // No feedback: advance immediately
    nextQuestion();
  }
}
function quickQuiz(n){
  if(!questions.length) return alert('No questions in this set.');
  const pool=[...questions].sort(()=>Math.random()-.5).slice(0,n);
  startQuizFromPool(pool);
}
function startIncorrectQuiz(){
  const inc=loadIncorrect(activeSetId);
  if(!inc.length) return alert('No recent incorrect questions!');
  const incKeys=new Set(inc.map(x=>x.key));
  let pool=questions.filter(q=>incKeys.has(incorrectKey(q)));
  if(!pool.length) return alert('Incorrect questions not found in this set.');
  pool.sort(()=>Math.random()-.5);
  startQuizFromPool(pool,{isIncorrectMode:true});
}
function nextQuestion(){ quiz.idx++; if(quiz.idx>=quiz.questions.length){showResults();return;} renderQuestion(); }
function prevQuestion(){ if(quiz.idx<=0) return; quiz.idx--; renderQuestion(); }

function isFreeNav(){
  return document.getElementById('settCardsOnly').checked;
}
function showResults(){
  clearInterval(overallInterval); clearInterval(qInterval);
  const total=quiz.questions.length, pct=Math.round((quiz.score/total)*100), pass=pct>=70;
  document.getElementById('resultScore').textContent=pct+'%';
  document.getElementById('resultScore').className='result-score '+(pass?'pass':'fail');
  document.getElementById('resultLabel').textContent=pass?'🎉 Great work! You passed.':'📚 Keep studying - you will get there!';
  document.getElementById('rCorrect').textContent=quiz.score;
  document.getElementById('rWrong').textContent=total-quiz.score-quiz.timeouts;
  document.getElementById('rTimeout').textContent=quiz.timeouts;
  document.getElementById('rTotal').textContent=total;
  document.getElementById('rTime').textContent=formatTime(overallSec);
  renderResultButtons(getSavedWrongs());
  const flagged=quiz.questions.filter(isFlagged);
  const sec=document.getElementById('flaggedSection');
  if(flagged.length){
    sec.style.display='block';
    document.getElementById('flaggedList').innerHTML=flagged.map(q=>`<div class="flagged-q"><div class="fq-q">${esc(q.text||q.term||'')}</div><div class="fq-a">✓ ${q.type==='card'?esc(q.definition):q.correct.map(i=>esc(q.options[i])).join(', ')}</div>${q.explain?`<div class="fq-e">${esc(q.explain)}</div>`:''}</div>`).join('');
  } else sec.style.display='none';
  showView('results');
}
function toggleIncorrectReview(){
  const sec=document.getElementById('incorrectReviewSection');
  const btn=document.getElementById('viewIncorrectBtn');
  if(sec.style.display==='none'){
    renderIncorrectReview();
    sec.style.display='block';
    btn.textContent=btn.textContent.replace('View','Hide');
    sec.scrollIntoView({behavior:'smooth',block:'nearest'});
  } else {
    sec.style.display='none';
    btn.textContent=btn.textContent.replace('Hide','View');
  }
}
function renderIncorrectReview(){
  const wrongLog=getSavedWrongs();
  const list=document.getElementById('incorrectReviewList');
  if(!list) return;
  list.innerHTML=wrongLog.map((entry,ei)=>{
    const {q,selected,isCard}=entry;
    if(isCard){
      return `<div class="review-q">
        <div class="review-q-text">🃏 ${esc(q.term)}</div>
        <div class="review-opt given-wrong"><span class="review-opt-icon">✗</span><span>You marked: <strong>Missed it</strong></span></div>
        <div class="review-card-def"><span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">Definition: </span>${esc(q.definition)}</div>
        ${q.explain?`<div class="review-explain">${esc(q.explain)}</div>`:''}
      </div>`;
    }
    const opts=(q.options||[]).map((opt,i)=>{
      const wasSelected=selected.includes(i);
      const isCorrect=q.correct.includes(i);
      let cls='neutral', icon='';
      if(wasSelected && !isCorrect){ cls='given-wrong'; icon='✗'; }
      else if(isCorrect){ cls='correct-ans'; icon='✓'; }
      else return '';
      return `<div class="review-opt ${cls}"><span class="review-opt-icon">${icon}</span><span>${esc(opt)}</span></div>`;
    }).join('');
    return `<div class="review-q">
      <div class="review-q-text">${esc(q.text||'')}</div>
      ${opts}
      ${q.explain?`<div class="review-explain">${esc(q.explain)}</div>`:''}
    </div>`;
  }).join('');
}


















function openExitQuizModal(){
  const total = quiz.questions.length;
  const attempted = quiz.idx + (answered ? 1 : 0);
  const skipped = total - attempted;
  document.getElementById('exitQuizSummary').innerHTML=`
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        <span style="font-size:.82rem;color:var(--muted)">✅ Answered</span>
        <span style="font-size:.82rem;font-weight:700;color:var(--green)">${attempted} of ${total}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
        <span style="font-size:.82rem;color:var(--muted)">⏭ Not seen</span>
        <span style="font-size:.82rem;font-weight:700;color:var(--muted)">${skipped}</span>
      </div>
      <p style="font-size:.76rem;color:var(--muted);padding:4px 0">Flags and incorrect tracking from answered questions will be saved.</p>
    </div>`;
  modalOpen('exitQuizModal');
}
function closeExitQuizModal(e){
  if(e&&e.target!==document.getElementById('exitQuizModal')) return;
  modalClose('exitQuizModal');
}
function showPartialResults(){
  // Only count questions that were actually answered
  const attempted=quiz.questions.slice(0, quiz.idx+(answered?1:0));
  if(!attempted.length){ endQuiz(); return; }
  // Temporarily override quiz to only show answered questions
  const savedQuestions=quiz.questions;
  quiz.questions=attempted;
  clearInterval(overallInterval); clearInterval(qInterval);
  // Score/wrongs from savedAnswers only — quiz.score may include future answers
  const answeredEntries=Object.entries(quiz.savedAnswers||{}).filter(([i])=>+i<attempted.length);
  const score=answeredEntries.filter(([,a])=>a.isCorrect).length;
  const total=attempted.length, pct=total?Math.round((score/total)*100):0, pass=pct>=70;
  document.getElementById('resultScore').textContent=pct+'%';
  document.getElementById('resultScore').className='result-score '+(pass?'pass':'fail');
  document.getElementById('resultLabel').textContent=`Partial result — ${attempted.length} of ${savedQuestions.length} questions answered`;
  document.getElementById('rCorrect').textContent=score;
  document.getElementById('rWrong').textContent=Math.max(0,total-score-quiz.timeouts);
  document.getElementById('rTimeout').textContent=quiz.timeouts;
  document.getElementById('rTotal').textContent=total;
  document.getElementById('rTime').textContent=formatTime(overallSec);
  renderResultButtons(getSavedWrongs());
  const flagged=attempted.filter(isFlagged);
  const sec=document.getElementById('flaggedSection');
  if(flagged.length){
    sec.style.display='block';
    document.getElementById('flaggedList').innerHTML=flagged.map(q=>`<div class="flagged-q"><div class="fq-q">${esc(q.text)}</div><div class="fq-a">✓ ${q.correct.map(i=>esc(q.options[i])).join(', ')}</div>${q.explain?`<div class="fq-e">${esc(q.explain)}</div>`:''}</div>`).join('');
  } else sec.style.display='none';
  showView('results');
}
function endQuiz(){
  clearInterval(overallInterval); clearInterval(qInterval);
  if(_quizFromHome){ _quizFromHome = false; goHome(); return; }
  showView('manage');
  renderHeader();
}

// ═══════════════════════════════════════════════════
//  KEYBOARD HOTKEYS (desktop only)
// ═══════════════════════════════════════════════════
document.addEventListener('keydown', function(e){
  // Only active when quiz view is shown
  const quizView=document.getElementById('view-quiz');
  if(!quizView || !quizView.classList.contains('active')) return;
  // Ignore if focus is in an input/textarea
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;

  const key=e.key.toUpperCase();
  const q=quiz && quiz.questions && quiz.questions[quiz.idx];
  if(!q) return;

  const isCard=q.type==='card';

  if(isCard){
    // Space = flip card
    if(e.key===' '||e.key==='Enter'){
      e.preventDefault();
      const wrap=document.querySelector('.flip-card-wrap');
      if(wrap){
        const card=wrap.querySelector('.flip-card');
        const alreadyFlipped=card.classList.contains('flipped');
        if(!alreadyFlipped){ flipCard(wrap); }
        else {
          // If already flipped, Space/Enter advances like "Got it" only if answered
          if(answered) nextQuestion();
        }
      }
      return;
    }
    // G = got it, M = missed
    if(key==='G'){ const fb=document.getElementById('flashcardBtns'); if(fb&&fb.style.display!=='none') cardAnswer(true); return; }
    if(key==='M'){ const fb=document.getElementById('flashcardBtns'); if(fb&&fb.style.display!=='none') cardAnswer(false); return; }
  } else {
    // Number keys 1–9 or letter keys A–I = select choice
    let choiceIdx=-1;
    if(e.key>='1'&&e.key<='9') choiceIdx=parseInt(e.key)-1;
    else if(key>='A'&&key<='I') choiceIdx=key.charCodeAt(0)-65;
    if(choiceIdx>=0 && choiceIdx<(q.options||[]).length && !answered){
      e.preventDefault();
      toggleChoice(choiceIdx); return;
    }
    // Space or Enter = submit / next
    if(e.key===' '||e.key==='Enter'){
      e.preventDefault();
      const sb=document.getElementById('submitBtn');
      if(sb && !sb.disabled) sb.click();
      return;
    }
  }

  // F = flag (works for both types)
  if(key==='F'){ e.preventDefault(); toggleFlag(); return; }

  // Arrow keys — back/forward in free-nav mode
  if(isFreeNav()){
    if(e.key==='ArrowLeft' && quiz.idx>0){ e.preventDefault(); prevQuestion(); return; }
    if(e.key==='ArrowRight'){ e.preventDefault(); nextQuestion(); return; }
  }

  // Escape = exit quiz modal
  if(e.key==='Escape'){ e.preventDefault(); openExitQuizModal(); return; }
});

// Update hotkey legend based on question type
function updateHotkeyLegend(isCard){
  const el=document.getElementById('hotkeyLegend');
  if(!el) return;
  const nav=isFreeNav()?`<span class="hk"><kbd>←</kbd><kbd>→</kbd> Navigate</span>`:'';
  if(isCard){
    el.innerHTML=`
      <span class="hk"><kbd>Space</kbd> Flip card</span>
      <span class="hk"><kbd>G</kbd> Got it</span>
      <span class="hk"><kbd>M</kbd> Missed it</span>
      <span class="hk"><kbd>F</kbd> Flag</span>
      ${nav}
      <span class="hk"><kbd>Esc</kbd> Exit</span>`;
  } else {
    el.innerHTML=`
      <span class="hk"><kbd>1</kbd>–<kbd>9</kbd> Select answer</span>
      <span class="hk"><kbd>Space</kbd> Submit / Next</span>
      <span class="hk"><kbd>F</kbd> Flag</span>
      ${nav}
      <span class="hk"><kbd>Esc</kbd> Exit</span>`;
  }
}

// ═══════════════════════════════════════════════════
//  AUDIO
// ═══════════════════════════════════════════════════
const SFX = (() => {
  let _ctx = null;
  function _ctx_get(){ if(!_ctx) _ctx = new (window.AudioContext||window.webkitAudioContext)(); return _ctx; }
  function _tone(freq, type, vol, dur, freqEnd){
    if(!soundEnabled()) return;
    try{
      const ctx = _ctx_get();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if(freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch(e){}
  }
  function correct(){
    // Two-note ascending chime
    _tone(523, 'sine', 0.18, 0.12);
    setTimeout(()=>_tone(784, 'sine', 0.15, 0.2), 100);
  }
  function incorrect(){
    // Low descending thud
    _tone(280, 'sine', 0.22, 0.08);
    setTimeout(()=>_tone(180, 'sine', 0.18, 0.18), 60);
  }
  function flip(){
    // Soft click for card flip
    _tone(900, 'sine', 0.06, 0.06);
  }
  return { correct, incorrect, flip };
})();

function dueBadgesEnabled(){ return localStorage.getItem('qforge_due_badges') !== 'off'; }
function toggleDueBadges(){
  localStorage.setItem('qforge_due_badges', dueBadgesEnabled() ? 'off' : 'on');
  const el = document.getElementById('menuDueBadges');
  if(el) el.checked = dueBadgesEnabled();
  renderSetsGrid();
}
function soundEnabled(){
  return localStorage.getItem('qforge_sound') !== 'off';
}
function toggleSound(){
  localStorage.setItem('qforge_sound', soundEnabled() ? 'off' : 'on');
  _updateSoundToggle();
}
function _updateSoundToggle(){
  const el = document.getElementById('menuSound');
  if(el) el.checked = soundEnabled();
}

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
function saveQuizSettings(){
  const get = id => { const el=document.getElementById(id); if(!el) return null; return el.type==='checkbox'?el.checked:el.value; };
  const s = {
    shuffle:     get('settShuffle'),
    shuffleOpts: get('settShuffleOpts'),
    qLimit:      get('settQLimit'),
    feedback:    get('settFeedback'),
    flaggedOnly: get('settFlaggedOnly'),
    explain:     get('settExplain'),
    cardsOnly:   get('settCardsOnly'),
    cardFirst:   get('settCardFirst'),
    srsOnly:     get('settSRSOnly'),
    qTimer:      get('settQTimer'),
    autoAdvance: get('settAutoAdvance'),
  };
  localStorage.setItem('qforge_quiz_settings', JSON.stringify(s));
}
function loadQuizSettings(){
  try{
    const s = JSON.parse(localStorage.getItem('qforge_quiz_settings')||'{}');
    const set = (id, val) => { if(val===null||val===undefined) return; const el=document.getElementById(id); if(!el) return; el.type==='checkbox'?el.checked=val:el.value=val; };
    set('settShuffle',     s.shuffle);
    set('settShuffleOpts', s.shuffleOpts);
    set('settQLimit',      s.qLimit);
    set('settFeedback',    s.feedback);
    set('settFlaggedOnly', s.flaggedOnly);
    set('settExplain',     s.explain);
    set('settCardsOnly',   s.cardsOnly);
    set('settCardFirst',   s.cardFirst);
    set('settSRSOnly',     s.srsOnly);
    set('settQTimer',      s.qTimer);
    set('settAutoAdvance', s.autoAdvance);
  } catch(e){}
}

function init(){
  try{ migrateLegacy(); } catch(e){ console.log('migrate err',e); }
  try{ loadSets(); } catch(e){ console.log('sets init err',e); }
  try{ loadQuizSettings(); } catch(e){}
  try{ _updateSoundToggle(); } catch(e){}
  try{ renderSetsGrid(); } catch(e){ console.log('grid err',e); }
  try{ renderHeader(); } catch(e){}
  try{ initOptionRows(); } catch(e){}
  setTimeout(()=>{ try{ GDRIVE.initSync(); } catch(e){} }, 0);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ═══════════════════════════════════════════════════
//  SPACED REPETITION (SM-2)
// ═══════════════════════════════════════════════════
function loadSRS(id){ return JSON.parse(localStorage.getItem('qforge_srs_'+id)||'[]'); }
function saveSRS(id,arr){ _lsSet('qforge_srs_'+id,JSON.stringify(arr)); }
function srsKey(q){ return q.type==='card'?'card:'+q.term.trim():q.text.trim(); }

function updateSRS(setId, q, isCorrect){
  const arr = loadSRS(setId);
  const key = srsKey(q);
  let item = arr.find(x => x.key === key);
  if(!item){ item = {key, interval:1, ease:2.5, reps:0, due:Date.now()}; arr.push(item); }
  const quality = isCorrect ? 4 : 1;
  if(!isCorrect){
    item.reps = 0;
    item.interval = 1;
  } else {
    if(item.reps === 0)      item.interval = 1;
    else if(item.reps === 1) item.interval = 6;
    else item.interval = Math.round(item.interval * item.ease);
    item.reps++;
  }
  item.ease = Math.max(1.3, item.ease + 0.1 - (5 - quality) * 0.08);
  item.due  = Date.now() + item.interval * 86400000;
  saveSRS(setId, arr);
}

function getDueQuestions(setId, allQuestions){
  const arr = loadSRS(setId);
  const now = Date.now();
  return allQuestions.filter(q => {
    const item = arr.find(x => x.key === srsKey(q));
    return !item || item.due <= now;
  });
}

function getSRSDueCount(setId){
  const qs = loadQs(setId);
  return getDueQuestions(setId, qs).length;
}

function getSRSInfo(setId, q){
  const arr = loadSRS(setId);
  return arr.find(x => x.key === srsKey(q)) || null;
}

// Patch markCorrect/markIncorrect to update SRS
const _origMarkCorrect = window.markCorrect;
window.markCorrect = function(q){
  _origMarkCorrect(q);
  updateSRS(activeSetId, q, true);
};
const _origMarkIncorrect = window.markIncorrect;
window.markIncorrect = function(q){
  _origMarkIncorrect(q);
  updateSRS(activeSetId, q, false);
};

// ═══════════════════════════════════════════════════
//  GOOGLE DRIVE SYNC
//  Replace QUIZFORGE_CLIENT_ID with your OAuth client ID
//  from console.cloud.google.com
// ═══════════════════════════════════════════════════
const GDRIVE = (() => {
  const CLIENT_ID   = '752845259407-e44vv7b61ct0549hvhsc9guu7vd2dscb.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata profile email';
  const FILE_NAME   = 'quizforge-sync.json';
  const MIME        = 'application/json';

  let _token = null;
  let _fileId = null;
  let _syncTimeout = null;
  let _userProfile = null;
  let _lastAuthStatus = { msg: 'Sign in to sync', type: '' };
  let _resumeReauthTimer = null;
  let _silentReauthInFlight = false;
  let _lastSilentReauthAt = 0;

  // ── UI helpers ──
  function _renderBar(){
    const wrap = document.getElementById('syncBarWrap');
    if(!wrap) return;
    const hasSession = !!(_token || _userProfile);
    if(!hasSession){
      wrap.innerHTML = `
        <button id="syncSignInBtn" data-action="GDRIVE__signIn">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google to sync
        </button>`;
      const strip = document.getElementById('syncStrip');
      if(strip){
        strip.classList.add('visible');
        const dot = document.getElementById('sstripDot');
        const status = document.getElementById('sstripStatus');
        if(dot) dot.className = 'sstrip-dot';
        if(status) status.textContent = _lastAuthStatus.msg || 'Sign in to sync';
      }
      return;
    }

    const name = _userProfile ? (_userProfile.name || _userProfile.email || 'Google User') : 'Google Drive';
    const pic  = _userProfile && _userProfile.picture
      ? `<img class="sync-avatar" src="${_userProfile.picture}" referrerpolicy="no-referrer" >`
      : `<span style="width:24px;height:24px;border-radius:50%;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;color:#000;flex-shrink:0">${(name[0]||'G').toUpperCase()}</span>`;
    const action = _token ? 'GDRIVE__syncNow' : 'GDRIVE__signIn';
    const label = _token ? '↑↓ Sync' : '↻ Reconnect';
    const statusMsg = _lastAuthStatus.msg || (_token ? 'Ready' : 'Sign in needed before next sync');
    const statusType = _lastAuthStatus.type || (_token ? '' : 'err');
    wrap.innerHTML = `
      <div id="syncBar">
        ${pic}
        <span class="sync-name">${name}</span>
        <span class="sync-status${statusType ? ' ' + statusType : ''}" id="syncStatus">●&nbsp;${statusMsg}</span>
        <button class="btn btn-ghost btn-sm" data-action="${action}" style="padding:5px 10px;font-size:.7rem">${label}</button>
        <button class="btn btn-ghost btn-sm" data-action="GDRIVE__signOut" style="padding:5px 10px;font-size:.7rem;color:var(--muted)">Sign out</button>
      </div>`;
    const strip = document.getElementById('syncStrip');
    if(strip){
      strip.classList.add('visible');
      const av = document.getElementById('sstripAvatar');
      if(av) av.style.display='none';
      const nm = document.getElementById('sstripName');
      if(nm) nm.textContent = '';
    }
  }

  function _setStatus(msg, type=''){
    _lastAuthStatus = { msg, type };
    const el = document.getElementById('syncStatus');
    if(el){ el.textContent = '● ' + msg; el.className = 'sync-status' + (type?' '+type:''); }
    const dot = document.getElementById('sstripDot');
    const txt = document.getElementById('sstripStatus');
    if(dot){ dot.className = 'sstrip-dot' + (type?' '+type:''); }
    if(txt) txt.textContent = msg;
  }

  // ── Auth ──
  function _getLoginHint(){
    return _userProfile?.email || '';
  }

  function _persistToken(accessToken, expiry){
    _token = accessToken;
    localStorage.setItem('qforge_gdrive_token', accessToken);
    localStorage.setItem('qforge_gdrive_token_expiry', String(expiry));
    _setStatus('Ready', '');
    _scheduleTokenRefresh(expiry);
    _renderBar();
  }

  async function signIn(){
    if(CLIENT_ID === 'QUIZFORGE_CLIENT_ID'){
      alert('Google Drive sync needs a Client ID\nSee the setup guide at the top of the sync section in index.html.');
      return;
    }
    await ensureGoogleIdentityScript();
    const loginHint = _getLoginHint();
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ...(loginHint ? { login_hint: loginHint } : {}),
      callback: async (resp) => {
        if(resp.error){
          console.error('GIS error', resp);
          _setStatus('Sign-in cancelled', 'err');
          _renderBar();
          return;
        }
        const expiry = Date.now() + 55 * 60 * 1000;
        _persistToken(resp.access_token, expiry);
        await _fetchProfile();
        _renderBar();
        await syncNow();
      }
    });
    client.requestAccessToken({ prompt: 'consent' });
  }

  let _refreshTimer = null;

  function _scheduleTokenRefresh(expiryMs){
    clearTimeout(_refreshTimer);
    if(!expiryMs || Number.isNaN(expiryMs)) return;
    const msUntilRefresh = expiryMs - Date.now() - 5 * 60 * 1000;
    if(msUntilRefresh <= 0){ _silentReauth({ reason: 'expired' }); return; }
    console.log('[Sync] token refresh scheduled in', Math.round(msUntilRefresh/60000), 'min');
    _refreshTimer = setTimeout(()=>{
      console.log('[Sync] proactive token refresh');
      _silentReauth({ reason: 'timer' });
    }, msUntilRefresh);
  }

  async function _silentReauth(opts = {}){
    if(CLIENT_ID === 'QUIZFORGE_CLIENT_ID') return false;
    if(_silentReauthInFlight) return false;
    const now = Date.now();
    if(now - _lastSilentReauthAt < 15000 && !opts.force) return false;
    _lastSilentReauthAt = now;
    try{ await ensureGoogleIdentityScript(); } catch(_) { return false; }
    if(typeof google === 'undefined') return false;
    _silentReauthInFlight = true;
    console.log('[Sync] attempting silent re-auth', opts.reason || '');
    return await new Promise((resolve) => {
      const loginHint = _getLoginHint();
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        prompt: '',
        ...(loginHint ? { login_hint: loginHint } : {}),
        callback: async (resp) => {
          try{
            if(resp.error){
              console.warn('[Sync] silent re-auth failed:', resp.error);
              _token = null;
              localStorage.removeItem('qforge_gdrive_token');
              localStorage.removeItem('qforge_gdrive_token_expiry');
              _setStatus('Reconnect before next sync', 'err');
              _renderBar();
              resolve(false);
              return;
            }
            const expiry = Date.now() + 55 * 60 * 1000;
            _persistToken(resp.access_token, expiry);
            console.log('[Sync] silent re-auth success');
            if(opts.syncAfter !== false){
              try{ await syncNow(); } catch(_){}
            }
            resolve(true);
          } finally {
            _silentReauthInFlight = false;
          }
        }
      });
      try{
        client.requestAccessToken({ prompt: '' });
      } catch(err){
        console.warn('[Sync] silent re-auth request failed:', err);
        _silentReauthInFlight = false;
        resolve(false);
      }
    });
  }

  function _maybeRefreshOnResume(){
    clearTimeout(_resumeReauthTimer);
    _resumeReauthTimer = setTimeout(() => {
      if(!_userProfile) return;
      const expiry = parseInt(localStorage.getItem('qforge_gdrive_token_expiry') || '0', 10);
      const nearExpiry = !expiry || (expiry - Date.now()) < 10 * 60 * 1000;
      if(!_token || nearExpiry){
        _silentReauth({ reason: 'resume', syncAfter: false });
      }
    }, 800);
  }

  function signOut(){
    if(!confirm('Sign out of Google Drive?\n\nYour data will remain on this device but will no longer sync.')) return;
    const oldToken = _token;
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
    clearTimeout(_syncTimeout);
    _syncTimeout = null;
    clearTimeout(_resumeReauthTimer);
    _resumeReauthTimer = null;
    _silentReauthInFlight = false;
    _token = null; _fileId = null; _userProfile = null;
    _lastAuthStatus = { msg: 'Sign in to sync', type: '' };
    localStorage.removeItem('qforge_gdrive_token');
    localStorage.removeItem('qforge_gdrive_token_expiry');
    localStorage.removeItem('qforge_gdrive_profile');
    try{ google?.accounts?.id?.disableAutoSelect?.(); } catch(_){ }
    if(oldToken && google?.accounts?.oauth2?.revoke){
      google.accounts.oauth2.revoke(oldToken, () => {
        _setStatus('Signed out', 'ok');
        _renderBar();
      });
    } else {
      _setStatus('Signed out', 'ok');
      _renderBar();
    }
  }

  async function _fetchProfile(){
    try{
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + _token }
      });
      const data = await r.json();
      // v3 userinfo returns 'name' and 'picture' — normalise just in case
      _userProfile = {
        name:    data.name || data.given_name || data.email || 'Google User',
        picture: data.picture || '',
        email:   data.email || ''
      };
      // Cache profile so name/avatar survive token expiry and page reload
      localStorage.setItem('qforge_gdrive_profile', JSON.stringify(_userProfile));
    } catch(e){
      // Try restoring from cache if network fails
      const cached = localStorage.getItem('qforge_gdrive_profile');
      if(cached) try{ _userProfile = JSON.parse(cached); } catch(_){}
    }
  }

  // ── Drive file helpers (appDataFolder — private to this app) ──
  async function _findFile(){
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${FILE_NAME}%27&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc`,
      { headers: { Authorization: 'Bearer ' + _token } }
    );
    if(r.status === 401) throw new Error('findFile: 401 Unauthorized');
    if(r.status === 403) throw new Error('findFile: 403 insufficient authentication scopes');
    if(!r.ok) throw new Error('findFile: HTTP ' + r.status);
    const d = await r.json();
    console.log('[QuizForge Sync] findFile — all matches:', JSON.stringify(d.files));
    if(d.error){ throw new Error('findFile: ' + d.error.message); }
    if(!d.files || !d.files.length) return null;
    // Clean up duplicate files — keep most recently modified, delete the rest
    if(d.files.length > 1){
      console.warn('[QuizForge Sync] found', d.files.length, 'sync files — deleting duplicates');
      for(let i = 1; i < d.files.length; i++){
        await fetch(`https://www.googleapis.com/drive/v3/files/${d.files[i].id}`,
          { method:'DELETE', headers:{ Authorization:'Bearer '+_token } });
        console.log('[QuizForge Sync] deleted duplicate:', d.files[i].id);
      }
    }
    return d.files[0].id;
  }

  async function _readFile(id){
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers: { Authorization: 'Bearer ' + _token } }
    );
    if(r.status === 401) throw new Error('readFile: 401 Unauthorized');
    if(r.status === 403) throw new Error('readFile: 403 insufficient authentication scopes');
    if(!r.ok){ throw new Error('readFile HTTP ' + r.status); }
    const d = await r.json();
    console.log('[QuizForge Sync] readFile sets count:', d && d.sets ? d.sets.length : 'n/a');
    return d;
  }

  async function _writeFile(id, payload){
    const body = JSON.stringify(payload);
    const byteSize = new Blob([body]).size;
    console.log('[QuizForge Sync] writeFile id:', id, 'sets:', payload.sets ? payload.sets.length : 0, 'bytes:', byteSize);
    // Use FormData for both create and update — browser handles multipart encoding
    // correctly on all platforms including iOS Safari. Never set Content-Type manually
    // when using FormData; the browser must set the boundary itself.
    const meta = JSON.stringify(id
      ? { name: FILE_NAME }
      : { name: FILE_NAME, parents: ['appDataFolder'] }
    );
    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file',     new Blob([body], { type: MIME }));
    const url = id
      ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const method = id ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + _token },
      // No Content-Type header — FormData sets it with the correct boundary
      body: form
    });
    if(!r.ok && r.status !== 200){
      // Try to get error detail from response body
      let errMsg = `writeFile HTTP ${r.status}`;
      try { const d = await r.json(); if(d.error) errMsg = 'writeFile: ' + d.error.message; } catch(_){}
      throw new Error(errMsg);
    }
    const d = await r.json();
    console.log('[QuizForge Sync] writeFile response:', d.id || d.error || d);
    if(d.error){ throw new Error('writeFile: ' + d.error.message); }
    return d;
  }

  // ── Build full backup payload (mirrors exportFullBackup) ──
  function _buildPayload(){
    const sets = loadSets(), folders = loadFolders();
    const tombstones = loadTombstones();
    const clearTs = loadClearTimestamps();
    console.log('[Sync] building payload — sets:', sets.length, 'tombstones:', tombstones);

    // Collect all live imageRef keys and fetch from session cache
    const allSets = sets.map(s => ({ ...s, questions: loadQs(s.id) }));
    const allRefs = [];
    allSets.forEach(s => s.questions.forEach(q => { if(q.imageRef) allRefs.push(q.imageRef); }));
    const images = ImageStore.getAll(allRefs);
    console.log('[Sync] payload images:', Object.keys(images).length, 'refs:', allRefs.length);

    return {
      type: 'fullbackup', version: 7,
      synced: new Date().toISOString(),
      tombstones,
      clearTimestamps: clearTs,
      gridOrder: loadGridOrder(),
      folders,
      images, // {imageRef: dataURL} — kept out of localStorage, travels via Drive
      sets: allSets.map(s => ({
        id: s.id, name: s.name, folderId: s.folderId || null, created: s.created,
        questions:          s.questions,
        flaggedKeys:        loadFlags(s.id),
        incorrectTracking:  loadIncorrect(s.id),
        srsData:            loadSRS(s.id)
      }))
    };
  }

  // ── Restore from cloud payload — true two-way merge ──
  async function _applyPayload(data){
    if(!data || !Array.isArray(data.sets)) return;

    // Load images from payload into session cache — keeps localStorage clean
    if(data.images && typeof data.images === 'object'){
      ImageStore.putAll(data.images);
      console.log('[Sync] loaded', Object.keys(data.images).length, 'images into session cache');
    }

    // Merge tombstones — union of local + cloud deletions
    const localTombstones  = loadTombstones();
    const cloudTombstones  = Array.isArray(data.tombstones) ? data.tombstones : [];
    console.log('[Sync] localTombstones:', localTombstones);
    console.log('[Sync] cloudTombstones:', cloudTombstones);

    const mergedTombstones = [...localTombstones];
    cloudTombstones.forEach(ct => {
      if(!mergedTombstones.find(t => t.id === ct.id)) mergedTombstones.push(ct);
    });
    _lsSet('qforge_tombstones', JSON.stringify(mergedTombstones));
    const deletedIds = new Set(mergedTombstones.map(t => t.id));
    console.log('[Sync] deletedIds:', [...deletedIds]);

    // Merge clear timestamps — take the most recent clear per set per field
    const localClearTs  = loadClearTimestamps();
    const cloudClearTs  = (data.clearTimestamps && typeof data.clearTimestamps === 'object') ? data.clearTimestamps : {};
    const mergedClearTs = JSON.parse(JSON.stringify(localClearTs));
    Object.entries(cloudClearTs).forEach(([setId, fields]) => {
      if(!mergedClearTs[setId]) mergedClearTs[setId] = {};
      Object.entries(fields).forEach(([field, ts]) => {
        if(!mergedClearTs[setId][field] || ts > mergedClearTs[setId][field])
          mergedClearTs[setId][field] = ts;
      });
    });
    saveClearTimestamps(mergedClearTs);

    // Remove clearTimestamps entries for tombstoned sets — otherwise a set deleted
    // on one device can appear "locally modified" on another and get resurrected
    if(deletedIds.size > 0){
      const cleanedClearTs = JSON.parse(JSON.stringify(mergedClearTs));
      deletedIds.forEach(id => { delete cleanedClearTs[id]; });
      saveClearTimestamps(cleanedClearTs);
    }

    const localSets = loadSets();
    console.log('[Sync] localSets before purge:', localSets.map(s=>s.id+':'+s.name));
    localSets.forEach(s => {
      if(deletedIds.has(s.id)){
        console.log('[Sync] purging local set:', s.id, s.name);
        localStorage.removeItem('qforge_qs_'        + s.id);
        localStorage.removeItem('qforge_flags_'     + s.id);
        localStorage.removeItem('qforge_incorrect_' + s.id);
        localStorage.removeItem('qforge_srs_'       + s.id);
      }
    });

    const localFolders = loadFolders();
    const localIds     = new Set(localSets.map(s => s.id));

    // Merge folders
    const mergedFolders = [...localFolders];
    (data.folders || []).forEach(cf => {
      if(!mergedFolders.find(f => f.id === cf.id)) mergedFolders.push(cf);
    });
    _lsSet('qforge_folders', JSON.stringify(mergedFolders));

    // Build merged set list — local sets minus tombstoned, plus new cloud sets
    const mergedSets = localSets.filter(s => !deletedIds.has(s.id));
    console.log('[Sync] mergedSets after filter:', mergedSets.map(s=>s.id+':'+s.name));

    // Hoist lastLocalSync so it's available both inside the forEach and for grid order check below
    const lastLocalSync = parseInt(localStorage.getItem('qforge_gdrive_lastSync') || '0');

    data.sets.forEach(cs => {
      if(deletedIds.has(cs.id)){
        console.log('[Sync] skipping cloud set (tombstoned):', cs.id, cs.name);
        localStorage.removeItem('qforge_qs_'        + cs.id);
        localStorage.removeItem('qforge_flags_'     + cs.id);
        localStorage.removeItem('qforge_incorrect_' + cs.id);
        localStorage.removeItem('qforge_srs_'       + cs.id);
        return;
      }
      if(!localIds.has(cs.id)){
        console.log('[Sync] adding cloud set locally:', cs.id, cs.name);
        mergedSets.push({ id: cs.id, name: cs.name, folderId: cs.folderId || null, created: cs.created || Date.now() });
      }

      // ── Conflict resolution ──────────────────────────────────────────────
      // lastLocalSync = when this device last successfully pushed to Drive.
      // localSetTs.questions = when questions were last modified ON THIS DEVICE.
      // We use localClearTs (not mergedClearTs) so cloud timestamps can't block cloud data.
      // Cloud wins unless THIS device edited the field after its last successful sync.
      const localSetTs = localClearTs[cs.id] || {};

      const localQsModified  = localSetTs.questions  || 0;
      const localFlModified  = localSetTs.flags      || 0;
      const localIncModified = localSetTs.incorrect  || 0;

      const cloudQCount = Array.isArray(cs.questions) ? cs.questions.length : 'missing';
      const localQCount = JSON.parse(localStorage.getItem('qforge_qs_' + cs.id) || '[]').length;
      console.log(`[Sync] "${cs.name}" cloud:${cloudQCount}q local:${localQCount}q localMod:${new Date(localQsModified).toLocaleTimeString()} lastSync:${new Date(lastLocalSync).toLocaleTimeString()} localNewer:${localQsModified > lastLocalSync} isActive:${cs.id===activeSetId}`);

      // Questions: cloud wins unless local was modified AFTER last successful sync
      if(localQsModified > lastLocalSync){
        console.log('[Sync] keeping local questions for', cs.name, '— edited since last sync', new Date(localQsModified).toLocaleTimeString());
      } else if(typeof activeSetId !== 'undefined' && cs.id === activeSetId){
        console.log('[Sync] skipping question overwrite for active set:', cs.name);
      } else {
        // Use saveQs (not _lsSet directly) so any inline q.image blobs from old
        // desktop payloads are stripped into ImageStore before hitting localStorage
        saveQs(cs.id, Array.isArray(cs.questions) ? cs.questions : []);
        console.log('[Sync] applied cloud questions for', cs.name, '(', (cs.questions||[]).length, 'items )');
      }

      // Flags: same logic
      if(localFlModified > lastLocalSync){
        console.log('[Sync] keeping local flags for', cs.name, '— edited since last sync');
      } else {
        _lsSet('qforge_flags_' + cs.id, JSON.stringify(Array.isArray(cs.flaggedKeys) ? cs.flaggedKeys : []));
      }

      // Incorrect tracking: same logic
      if(localIncModified > lastLocalSync){
        console.log('[Sync] keeping local incorrect for', cs.name, '— edited since last sync');
      } else {
        _lsSet('qforge_incorrect_' + cs.id, JSON.stringify(Array.isArray(cs.incorrectTracking) ? cs.incorrectTracking : []));
      }

      if(Array.isArray(cs.srsData)) _lsSet('qforge_srs_' + cs.id, JSON.stringify(cs.srsData));
    });

    _lsSet('qforge_sets', JSON.stringify(mergedSets));
    console.log('[Sync] final mergedSets saved:', mergedSets.map(s=>s.id+':'+s.name));

    // Apply cloud grid order if newer than local
    // Use localClearTs for the same reason as above — cloud ts shouldn't block cloud data
    if(Array.isArray(data.gridOrder) && data.gridOrder.length){
      const localGridTs = (localClearTs['__grid__'] || {}).order || 0;
      if(localGridTs <= lastLocalSync){
        // Write directly (bypass scheduleSync patch to avoid sync loop)
        _lsSet('qforge_grid_order', JSON.stringify(data.gridOrder));
        recordModified('__grid__', 'order');
        console.log('[Sync] applied cloud grid order');
      } else {
        console.log('[Sync] keeping local grid order — modified after cloud sync');
      }
    }

  }

  // ── Main sync — pull then push merged result ──
  let _syncing = false;
  async function syncNow(){
    if(_syncing) return;
    if(!_token){
      _setStatus(_userProfile ? 'Reconnect before next sync' : 'Sign in to sync', _userProfile ? 'err' : '');
      _renderBar();
      return;
    }
    _syncing = true;
    _fileId = null; // always re-lookup to avoid stale cached ID
    _setStatus('Syncing…', 'busy');
    try{
      // 1. Find or create cloud file
      if(!_fileId) _fileId = await _findFile();

      // 2. Pull cloud → merge into local
      if(_fileId){
        const cloudData = await _readFile(_fileId);
        await _applyPayload(cloudData);
        try{ renderSetsGrid(); } catch(e){}
        // Re-render question list if open — images are now in cache after applyPayload
        try{ if(activeSetId && document.getElementById('view-manage').classList.contains('active')) renderQList(); } catch(e){}
      }

      // 3. Push merged local state back to cloud (now async — bundles images)
      const payload = _buildPayload();
      const result  = await _writeFile(_fileId, payload);
      if(!_fileId && result && result.id) _fileId = result.id;

      const t = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      _setStatus('Synced ' + t, 'ok');
      localStorage.setItem('qforge_gdrive_lastSync', Date.now());
    } catch(e){
      console.error('[QuizForge Sync] syncNow error:', e.message, e);
      if(e.message && (e.message.includes('401') || e.message.includes('Invalid Credentials') || e.message.includes('invalid_token'))){
        _token = null;
        localStorage.removeItem('qforge_gdrive_token');
        localStorage.removeItem('qforge_gdrive_token_expiry');
        _setStatus('Reconnecting…', 'busy');
        _renderBar();
        _silentReauth({ reason: '401' });
      } else if(e.message && (e.message.includes('403') || e.message.includes('insufficient') || e.message.includes('authentication scopes') || e.message.includes('insufficientPermissions'))){
        // Stale token or scope mismatch — clear it and prompt fresh interactive sign-in
        _token = null;
        localStorage.removeItem('qforge_gdrive_token');
        localStorage.removeItem('qforge_gdrive_token_expiry');
        _setStatus('Reconnect before next sync', 'err');
        _renderBar();
      } else if(e.message && e.message.includes('Failed to fetch')){
        _setStatus('Offline — will retry', 'err');
      } else {
        // Show the actual error message on screen — critical for debugging on iOS where console is inaccessible
        const shortMsg = (e.message || 'unknown error').slice(0, 120);
        _setStatus('Sync error: ' + shortMsg, 'err');
      }
    } finally {
      _syncing = false;
    }
  }

  // ── Auto-sync: debounce writes so rapid edits don't flood Drive ──
  function scheduleSync(){
    if(!_token) return;
    clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(()=>{ if(!_syncing) syncNow(); }, 4000);
  }

  // ── Patch save functions to trigger auto-sync ──
  const _origSaveSets = window.saveSets;
  window.saveSets = function(s){ _origSaveSets(s); scheduleSync(); };
  const _origSaveQs = window.saveQs;
  window.saveQs = function(id, qs){ _origSaveQs(id, qs); scheduleSync(); };
  const _origSaveFlags = window.saveFlags;
  window.saveFlags = function(id, fl){ _origSaveFlags(id, fl); scheduleSync(); };
  const _origSaveFolders = window.saveFolders;
  window.saveFolders = function(f){ _origSaveFolders(f); scheduleSync(); };
  const _origSaveIncorrect = window.saveIncorrect;
  window.saveIncorrect = function(id, arr){ _origSaveIncorrect(id, arr); scheduleSync(); };
  // Tombstones must also trigger sync — deleteSet calls saveTombstones before saveSets
  const _origSaveTombstones = window.saveTombstones;
  window.saveTombstones = function(t){ _origSaveTombstones(t); scheduleSync(); };
  // Grid order must sync — dragging sets to reorder should push to Drive
  const _origSaveGridOrder = window.saveGridOrder;
  window.saveGridOrder = function(o){ _origSaveGridOrder(o); scheduleSync(); };

  // ── Init: restore token from storage and render bar ──
  async function initSync(){
    const saved = localStorage.getItem('qforge_gdrive_token');
    const tokenExpiry = parseInt(localStorage.getItem('qforge_gdrive_token_expiry') || '0', 10);
    const cachedProfile = localStorage.getItem('qforge_gdrive_profile');
    if(cachedProfile) try{ _userProfile = JSON.parse(cachedProfile); } catch(_){ }

    if(saved && tokenExpiry && Date.now() < tokenExpiry){
      _persistToken(saved, tokenExpiry);
      console.log('[Sync] restored token from storage, expiry:', new Date(tokenExpiry).toLocaleTimeString());
      await _fetchProfile();
      _renderBar();
      syncNow();
    } else if(_userProfile){
      _token = null;
      localStorage.removeItem('qforge_gdrive_token');
      localStorage.removeItem('qforge_gdrive_token_expiry');
      _setStatus('Reconnect before next sync', 'err');
      _renderBar();
      _silentReauth({ reason: 'init', syncAfter: false });
    } else {
      _setStatus('Sign in to sync', '');
      _renderBar();
    }

    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') _maybeRefreshOnResume();
    });
    window.addEventListener('focus', _maybeRefreshOnResume);
    window.addEventListener('online', _maybeRefreshOnResume);
  }

  return { signIn, signOut, syncNow, initSync, _renderBar };
})();
window.GDRIVE = GDRIVE;
