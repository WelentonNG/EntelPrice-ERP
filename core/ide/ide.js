/* =========================================================================
   Forge IDE — arquivo único
   Editor: Monaco. Arquivos: File System Access API (disco real).
   Terminal: shell próprio que opera sobre os arquivos reais da pasta aberta.
   ========================================================================= */
'use strict';

const MONACO_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
const HAS_FSA = typeof window.showDirectoryPicker === 'function';

/* ------------------------------------------------------------- estado */
const S = {
  rootHandle: null,
  rootName: '',
  dirs: new Map(),          // path -> FileSystemDirectoryHandle
  files: new Map(),         // path -> FileSystemFileHandle
  expanded: new Set(),
  tabs: [],                 // {path,name,model,handle,savedId,viewState}
  active: null,
  selected: null,
  fileList: null,           // cache p/ Ctrl+P
  theme: 'forge',
  settings: { fontSize:13, tabSize:2, wordWrap:'off', minimap:true, autoSave:false, insertSpaces:true,
    font:'jetbrains', customFont:'', ligatures:true },
  terms: [],
  activeTerm: null,
  searchOpts: { caseSensitive:false, regex:false }
};

const $ = (id) => document.getElementById(id);
const el = {
  boot:$('boot'), bootMsg:$('boot-msg'), app:$('app'), tree:$('tree'), tabs:$('tabs'),
  editor:$('editor'), welcome:$('welcome'), sidebar:$('sidebar'), rootName:$('root-name'),
  stRoot:$('st-root'), stPath:$('st-path'), stPos:$('st-pos'), stLang:$('st-lang'),
  stIndent:$('st-indent'), stWrap:$('st-wrap'), termPanel:$('term-panel'), termBody:$('term-body'),
  termTabs:$('term-tabs'), splitTerm:$('split-term'), overlay:$('overlay'), paletteField:$('palette-field'),
  paletteList:$('palette-list'), palettePrefix:$('palette-prefix'), menu:$('menu'), toasts:$('toasts'),
  modalOverlay:$('modal-overlay'), modalTitle:$('modal-title'), modalBody:$('modal-body'),
  modalActions:$('modal-actions'), searchInput:$('search-input'), searchInclude:$('search-include'),
  searchResults:$('search-results'), outline:$('outline')
};

let editor = null;

/* ------------------------------------------------------------- utilidades */
const IGNORE = new Set(['node_modules','.git','dist','build','.next','.nuxt','.cache','coverage','__pycache__','.venv','venv','vendor','target','.idea','.turbo','bin','obj']);

function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function base(p){ return p.split('/').pop(); }
function dirname(p){ const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0,i); }
function ext(p){ const n = base(p); const i = n.lastIndexOf('.'); return i <= 0 ? '' : n.slice(i+1).toLowerCase(); }
function join(a,b){ return a ? a + '/' + b : b; }
function fmtSize(n){
  if(n < 1024) return n + ' B';
  if(n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}

function toast(msg, kind){
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = msg;
  el.toasts.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .25s'; }, 2600);
  setTimeout(() => d.remove(), 2900);
}

const EXT_META = {
  js:['JS','amber'], mjs:['JS','amber'], cjs:['JS','amber'], jsx:['JSX','blue'],
  ts:['TS','blue'], tsx:['TSX','blue'], json:['{}','amber'], html:['<>','red'],
  htm:['<>','red'], css:['CSS','violet'], scss:['SCS','red'], sass:['SAS','red'],
  less:['LES','blue'], md:['MD','text-dim'], markdown:['MD','text-dim'], txt:['TXT','muted'],
  php:['PHP','violet'], py:['PY','teal'], rb:['RB','red'], go:['GO','blue'],
  rs:['RS','amber'], java:['JV','red'], cs:['C#','violet'], c:['C','blue'],
  cpp:['C++','blue'], h:['H','muted'], sql:['SQL','teal'], sh:['SH','teal'],
  bash:['SH','teal'], yml:['YML','red'], yaml:['YML','red'], xml:['XML','amber'],
  vue:['VUE','teal'], svelte:['SVE','red'], env:['ENV','amber'], lock:['LCK','muted'],
  svg:['SVG','amber'], png:['IMG','violet'], jpg:['IMG','violet'], jpeg:['IMG','violet'],
  gif:['IMG','violet'], webp:['IMG','violet'], ico:['IMG','violet'], pdf:['PDF','red'],
  csv:['CSV','teal'], blade:['BLD','red'], twig:['TWG','teal'], ini:['INI','muted'],
  sqlite:['DB','teal'], db:['DB','teal']
};
function iconFor(name){
  const m = EXT_META[ext(name)];
  return m ? { t:m[0], c:'var(--' + m[1] + ')' } : { t:'•', c:'var(--muted)' };
}

const LANG = {
  js:'javascript', mjs:'javascript', cjs:'javascript', jsx:'javascript', ts:'typescript',
  tsx:'typescript', json:'json', html:'html', htm:'html', css:'css', scss:'scss', less:'less',
  md:'markdown', markdown:'markdown', php:'php', py:'python', rb:'ruby', go:'go', rs:'rust',
  java:'java', cs:'csharp', c:'c', cpp:'cpp', h:'cpp', sql:'sql', sh:'shell', bash:'shell',
  yml:'yaml', yaml:'yaml', xml:'xml', svg:'xml', vue:'html', svelte:'html', ini:'ini',
  dockerfile:'dockerfile', graphql:'graphql', csv:'plaintext', txt:'plaintext'
};
function langFor(name){
  const n = name.toLowerCase();
  if(n === 'dockerfile') return 'dockerfile';
  if(n.startsWith('.env')) return 'ini';
  return LANG[ext(name)] || 'plaintext';
}
const BINARY_EXT = new Set(['png','jpg','jpeg','gif','webp','ico','pdf','zip','rar','7z','exe','dll','so','dylib','woff','woff2','ttf','eot','mp3','mp4','mov','avi','wav','psd','jar','class','bin','db','sqlite']);

/* ------------------------------------------------------------- temas */
/* ui: variáveis CSS da interface. syn: cores de sintaxe do editor. */
const THEMES = {
  forge: {
    name:'Forge',
    ui:{ 'ink-900':'#080D12','ink-850':'#0B1218','ink-800':'#0E161E','ink-750':'#121C25',
      'ink-700':'#16222C','ink-600':'#1D2B37','line':'#22323F','line-soft':'#182530',
      'text':'#C9D8E4','text-dim':'#8CA1B4','muted':'#63798C','teal':'#2FBFA8','teal-dim':'#1D7D6E',
      'amber':'#E9A23B','red':'#E1616D','violet':'#8A7BE8','blue':'#4FA3E3',
      'on-accent':'#04120F','sel':'rgba(47,191,168,.28)','hi':'rgba(47,191,168,.12)','markbg':'rgba(233,162,59,.25)' },
    base:'vs-dark',
    syn:{ comment:'4E6373', keyword:'8A7BE8', string:'2FBFA8', number:'E9A23B', type:'4FA3E3',
      func:'4FA3E3', variable:'C9D8E4', tag:'E1616D', attr:'E9A23B', delimiter:'8CA1B4' }
  },
  vscode: {
    name:'VS Code Dark+',
    ui:{ 'ink-900':'#1E1E1E','ink-850':'#1E1E1E','ink-800':'#252526','ink-750':'#2D2D30',
      'ink-700':'#37373D','ink-600':'#3E3E42','line':'#3C3C3C','line-soft':'#2B2B2B',
      'text':'#CCCCCC','text-dim':'#B4B4B4','muted':'#858585','teal':'#0098FF','teal-dim':'#0E639C',
      'amber':'#DCDCAA','red':'#F44747','violet':'#C586C0','blue':'#569CD6',
      'on-accent':'#FFFFFF','sel':'rgba(38,79,120,.75)','hi':'rgba(0,152,255,.14)','markbg':'rgba(234,160,60,.3)' },
    base:'vs-dark',
    syn:{ comment:'6A9955', keyword:'569CD6', string:'CE9178', number:'B5CEA8', type:'4EC9B0',
      func:'DCDCAA', variable:'9CDCFE', tag:'569CD6', attr:'9CDCFE', delimiter:'D4D4D4' }
  },
  vslight: {
    name:'VS Code Light',
    ui:{ 'ink-900':'#F3F3F3','ink-850':'#FFFFFF','ink-800':'#F3F3F3','ink-750':'#F8F8F8',
      'ink-700':'#E8E8E8','ink-600':'#D6D6D6','line':'#DDDDDD','line-soft':'#E7E7E7',
      'text':'#2B2B2B','text-dim':'#4A4A4A','muted':'#8A8A8A','teal':'#0066B8','teal-dim':'#9CC7E8',
      'amber':'#B07219','red':'#C72E2E','violet':'#AF00DB','blue':'#0451A5',
      'on-accent':'#FFFFFF','sel':'rgba(173,214,255,.75)','hi':'rgba(0,102,184,.10)','markbg':'rgba(255,206,84,.45)' },
    base:'vs',
    syn:{ comment:'008000', keyword:'0000FF', string:'A31515', number:'098658', type:'267F99',
      func:'795E26', variable:'001080', tag:'800000', attr:'E50000', delimiter:'383838' }
  },
  dracula: {
    name:'Dracula',
    ui:{ 'ink-900':'#191A21','ink-850':'#282A36','ink-800':'#21222C','ink-750':'#2D2F3B',
      'ink-700':'#343746','ink-600':'#44475A','line':'#383A4A','line-soft':'#2B2D3A',
      'text':'#F8F8F2','text-dim':'#C7C9D6','muted':'#6272A4','teal':'#BD93F9','teal-dim':'#6C4FB8',
      'amber':'#F1FA8C','red':'#FF5555','violet':'#FF79C6','blue':'#8BE9FD',
      'on-accent':'#21222C','sel':'rgba(189,147,249,.32)','hi':'rgba(189,147,249,.14)','markbg':'rgba(241,250,140,.28)' },
    base:'vs-dark',
    syn:{ comment:'6272A4', keyword:'FF79C6', string:'F1FA8C', number:'BD93F9', type:'8BE9FD',
      func:'50FA7B', variable:'F8F8F2', tag:'FF79C6', attr:'50FA7B', delimiter:'F8F8F2' }
  },
  monokai: {
    name:'Monokai (Sublime)',
    ui:{ 'ink-900':'#1F201A','ink-850':'#272822','ink-800':'#22231C','ink-750':'#2D2E27',
      'ink-700':'#3E3D32','ink-600':'#49483E','line':'#3E3D32','line-soft':'#2A2B23',
      'text':'#F8F8F2','text-dim':'#CFCFC2','muted':'#75715E','teal':'#A6E22E','teal-dim':'#5E8C1A',
      'amber':'#E6DB74','red':'#F92672','violet':'#AE81FF','blue':'#66D9EF',
      'on-accent':'#1F201A','sel':'rgba(73,72,62,.95)','hi':'rgba(166,226,46,.12)','markbg':'rgba(230,219,116,.28)' },
    base:'vs-dark',
    syn:{ comment:'75715E', keyword:'F92672', string:'E6DB74', number:'AE81FF', type:'66D9EF',
      func:'A6E22E', variable:'F8F8F2', tag:'F92672', attr:'A6E22E', delimiter:'F8F8F2' }
  },
  oceanic: {
    name:'Oceanic Next (Sublime)',
    ui:{ 'ink-900':'#262C33','ink-850':'#303841','ink-800':'#2A3138','ink-750':'#343D47',
      'ink-700':'#3B4550','ink-600':'#46515E','line':'#3B4550','line-soft':'#2E353D',
      'text':'#D8DEE9','text-dim':'#B4BFCC','muted':'#6B8888','teal':'#6699CC','teal-dim':'#3D6B99',
      'amber':'#FAC863','red':'#EC5F67','violet':'#C594C5','blue':'#5FB3B3',
      'on-accent':'#1B222A','sel':'rgba(102,153,204,.30)','hi':'rgba(102,153,204,.12)','markbg':'rgba(250,200,99,.28)' },
    base:'vs-dark',
    syn:{ comment:'6B8888', keyword:'C594C5', string:'99C794', number:'F99157', type:'FAC863',
      func:'6699CC', variable:'D8DEE9', tag:'EC5F67', attr:'FAC863', delimiter:'F99157' }
  },
  onedark: {
    name:'One Dark',
    ui:{ 'ink-900':'#1E2127','ink-850':'#282C34','ink-800':'#21252B','ink-750':'#2C313A',
      'ink-700':'#323842','ink-600':'#3E4451','line':'#3A404B','line-soft':'#2C313A',
      'text':'#ABB2BF','text-dim':'#9DA5B4','muted':'#5C6370','teal':'#61AFEF','teal-dim':'#3A6EA5',
      'amber':'#E5C07B','red':'#E06C75','violet':'#C678DD','blue':'#56B6C2',
      'on-accent':'#1E2127','sel':'rgba(97,175,239,.28)','hi':'rgba(97,175,239,.12)','markbg':'rgba(229,192,123,.28)' },
    base:'vs-dark',
    syn:{ comment:'5C6370', keyword:'C678DD', string:'98C379', number:'D19A66', type:'E5C07B',
      func:'61AFEF', variable:'ABB2BF', tag:'E06C75', attr:'D19A66', delimiter:'ABB2BF' }
  }
};

function defineMonacoThemes(){
  for(const [id, th] of Object.entries(THEMES)){
    const u = th.ui, s = th.syn;
    monaco.editor.defineTheme('t-' + id, {
      base: th.base, inherit:true,
      rules:[
        { token:'comment', foreground:s.comment, fontStyle:'italic' },
        { token:'keyword', foreground:s.keyword },
        { token:'keyword.operator', foreground:s.keyword },
        { token:'string', foreground:s.string },
        { token:'number', foreground:s.number },
        { token:'type', foreground:s.type },
        { token:'type.identifier', foreground:s.type },
        { token:'function', foreground:s.func },
        { token:'identifier', foreground:s.variable },
        { token:'variable', foreground:s.variable },
        { token:'variable.predefined', foreground:s.number },
        { token:'tag', foreground:s.tag },
        { token:'metatag', foreground:s.tag },
        { token:'attribute.name', foreground:s.attr },
        { token:'attribute.value', foreground:s.string },
        { token:'delimiter', foreground:s.delimiter },
        { token:'operator', foreground:s.delimiter }
      ],
      colors:{
        'editor.background': u['ink-850'],
        'editor.foreground': u['text'],
        'editorLineNumber.foreground': u['muted'],
        'editorLineNumber.activeForeground': u['text-dim'],
        'editor.lineHighlightBackground': u['ink-750'],
        'editor.selectionBackground': u['ink-600'],
        'editor.inactiveSelectionBackground': u['ink-700'],
        'editorCursor.foreground': u['teal'],
        'editorIndentGuide.background1': u['line-soft'],
        'editorIndentGuide.activeBackground1': u['line'],
        'editorGutter.background': u['ink-850'],
        'editorWidget.background': u['ink-750'],
        'editorWidget.border': u['line'],
        'editorSuggestWidget.background': u['ink-750'],
        'editorSuggestWidget.border': u['line'],
        'editorSuggestWidget.selectedBackground': u['ink-700'],
        'editorHoverWidget.background': u['ink-750'],
        'editorHoverWidget.border': u['line'],
        'minimap.background': u['ink-850'],
        'scrollbarSlider.background': u['ink-700'],
        'scrollbarSlider.hoverBackground': u['ink-600'],
        'editorBracketMatch.background': u['ink-700'],
        'editorBracketMatch.border': u['teal'],
        'editorError.foreground': u['red'],
        'editorWarning.foreground': u['amber']
      }
    });
  }
}

function applyTheme(id){
  const th = THEMES[id];
  if(!th) return;
  S.theme = id;
  const root = document.documentElement.style;
  for(const [k, v] of Object.entries(th.ui)) root.setProperty('--' + k, v);
  if(window.monaco && editor) monaco.editor.setTheme('t-' + id);
  const btn = $('st-theme');
  if(btn) btn.textContent = th.name;
}

function openThemePicker(){
  const rows = Object.entries(THEMES).map(([id, th]) => {
    const u = th.ui;
    return `<button class="theme-row${id === S.theme ? ' on' : ''}" data-theme="${id}">
      <span class="swatch" style="background:${u['ink-850']};border-color:${u['line']}">
        <i style="background:${u['teal']}"></i><i style="background:${u['red']}"></i><i style="background:${u['amber']}"></i>
      </span>
      <span>${esc(th.name)}</span></button>`;
  }).join('');
  showModal('Tema', `<div class="theme-list">${rows}</div>`, [{ label:'Fechar', primary:true }]);
  setTimeout(() => {
    el.modalBody.querySelectorAll('.theme-row').forEach(b => {
      b.onclick = () => {
        applyTheme(b.dataset.theme);
        el.modalBody.querySelectorAll('.theme-row').forEach(x => x.classList.toggle('on', x === b));
      };
    });
  }, 0);
}

/* ------------------------------------------------------------- fontes */
const FONTS = [
  { id:'jetbrains',   name:'JetBrains Mono',  stack:"'JetBrains Mono'",  google:'JetBrains+Mono:wght@400;500;700', lig:true },
  { id:'fira',        name:'Fira Code',       stack:"'Fira Code'",       google:'Fira+Code:wght@400;500;700', lig:true },
  { id:'source',      name:'Source Code Pro', stack:"'Source Code Pro'", google:'Source+Code+Pro:wght@400;500;700' },
  { id:'plex',        name:'IBM Plex Mono',   stack:"'IBM Plex Mono'",   google:'IBM+Plex+Mono:wght@400;500;700' },
  { id:'roboto',      name:'Roboto Mono',     stack:"'Roboto Mono'",     google:'Roboto+Mono:wght@400;500;700' },
  { id:'inconsolata', name:'Inconsolata',     stack:"'Inconsolata'",     google:'Inconsolata:wght@400;500;700' },
  { id:'space',       name:'Space Mono',      stack:"'Space Mono'",      google:'Space+Mono:wght@400;700' },
  { id:'cascadia',    name:'Cascadia Code',   stack:"'Cascadia Code','Cascadia Mono'", local:true, lig:true },
  { id:'consolas',    name:'Consolas / Menlo',stack:"Consolas,Menlo,'DejaVu Sans Mono'", local:true },
  { id:'courier',     name:'Courier New',     stack:"'Courier New'", local:true }
];

function ensureGoogleFont(spec){
  if(!spec) return;
  const id = 'gf-' + spec.replace(/[^a-z0-9]/gi, '');
  if(document.getElementById(id)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.id = id;
  l.href = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap';
  document.head.appendChild(l);
}

function fontStack(){
  const f = FONTS.find(x => x.id === S.settings.font) || FONTS[0];
  ensureGoogleFont(f.google);
  const custom = (S.settings.customFont || '').trim();
  return (custom ? `'${custom.replace(/'/g,'')}', ` : '') + f.stack + ", ui-monospace, SFMono-Regular, monospace";
}

function applyFont(){
  const stack = fontStack();
  document.documentElement.style.setProperty('--mono', stack);
  document.documentElement.style.setProperty('--term-font', Math.max(10, S.settings.fontSize - 0.5) + 'px');
  if(editor){
    editor.updateOptions({ fontFamily: stack, fontLigatures: S.settings.ligatures });
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => { try{ monaco.editor.remeasureFonts(); }catch(_){} });
    }
  }
}

function openFontPicker(){
  const rows = FONTS.map(f => `<button class="font-row${f.id === S.settings.font ? ' on' : ''}" data-font="${f.id}">
      <span class="fname">${esc(f.name)}${f.local ? ' <i>instalada no PC</i>' : ''}</span>
      <span class="fsample" style="font-family:${f.stack.replace(/"/g,'')}, monospace">const total = 1_250.90; // ERP =&gt;</span>
    </button>`).join('');
  showModal('Fonte do editor', `
    <div class="font-list">${rows}</div>
    <div class="settings-row"><label>Ligaduras (=&gt; !== ===)</label><div class="switch ${S.settings.ligatures?'on':''}" id="fnt-lig"></div></div>
    <div class="settings-row"><label>Tamanho</label><input type="number" id="fnt-size" min="9" max="28" value="${S.settings.fontSize}"></div>
    <p style="margin-top:12px">Tem outra fonte instalada no computador? Escreva o nome exato dela aqui.</p>
    <input class="field" id="fnt-custom" placeholder="ex.: Cascadia Code, Menlo, Monaco" value="${esc(S.settings.customFont || '')}" spellcheck="false">
  `, [{ label:'Fechar', primary:true }]);

  setTimeout(() => {
    FONTS.forEach(f => ensureGoogleFont(f.google));
    el.modalBody.querySelectorAll('.font-row').forEach(b => {
      b.onclick = () => {
        S.settings.font = b.dataset.font;
        el.modalBody.querySelectorAll('.font-row').forEach(x => x.classList.toggle('on', x === b));
        applyFont();
      };
    });
    const lig = $('fnt-lig');
    if(lig) lig.onclick = () => { S.settings.ligatures = !S.settings.ligatures; lig.classList.toggle('on'); applyFont(); };
    const size = $('fnt-size');
    if(size) size.oninput = () => { setFontSize(Number(size.value) || 13); applyFont(); };
    const custom = $('fnt-custom');
    if(custom) custom.oninput = () => { S.settings.customFont = custom.value; applyFont(); };
  }, 0);
}

/* ------------------------------------------------------------- camada de arquivos */
async function ensurePermission(handle, mode){
  const opts = { mode: mode || 'readwrite' };
  if(await handle.queryPermission(opts) === 'granted') return true;
  return await handle.requestPermission(opts) === 'granted';
}

async function openFolder(){
  if(!HAS_FSA){
    toast('Este navegador não permite abrir pastas. Use Chrome ou Edge.', 'err');
    return;
  }
  let handle;
  try{
    handle = await window.showDirectoryPicker({ mode:'readwrite' });
  }catch(e){ return; }
  if(!await ensurePermission(handle)){
    toast('Permissão de gravação negada.', 'err');
    return;
  }
  S.rootHandle = handle;
  S.rootName = handle.name;
  S.dirs.clear(); S.files.clear(); S.expanded.clear(); S.fileList = null;
  S.dirs.set('', handle);
  el.rootName.textContent = handle.name;
  el.stRoot.textContent = handle.name;
  await renderTree();
  const t = activeTerm();
  termInterrupt(t);
  t.cwd = '';
  termWrite(t, `pasta aberta: <b>${esc(handle.name)}</b>`, 'ok');
  termPrompt(t);
  toast('Pasta aberta: ' + handle.name);
}

/** Lê o conteúdo de uma pasta e devolve a lista ordenada. */
async function readDir(path){
  let dh = null;
  try{ dh = await getDirHandle(path); }catch(_){ dh = null; }
  if(!dh) return [];
  const out = [];
  for await (const [name, h] of dh.entries()){
    const p = join(path, name);
    if(h.kind === 'directory'){ S.dirs.set(p, h); out.push({ name, path:p, dir:true }); }
    else { S.files.set(p, h); out.push({ name, path:p, dir:false }); }
  }
  out.sort((a,b) => a.dir === b.dir ? a.name.localeCompare(b.name,'pt-BR') : a.dir ? -1 : 1);
  return out;
}

async function getDirHandle(path, create){
  if(S.dirs.has(path)) return S.dirs.get(path);
  if(!S.rootHandle) return null;
  let cur = S.rootHandle, acc = '';
  for(const part of path.split('/').filter(Boolean)){
    cur = await cur.getDirectoryHandle(part, { create: !!create });
    acc = join(acc, part);
    S.dirs.set(acc, cur);
  }
  return cur;
}

async function getFileHandle(path, create){
  if(S.files.has(path) && !create) return S.files.get(path);
  const dh = await getDirHandle(dirname(path), create);
  if(!dh) throw new Error('pasta não encontrada: ' + dirname(path));
  const fh = await dh.getFileHandle(base(path), { create: !!create });
  S.files.set(path, fh);
  return fh;
}

async function readFileText(path){
  const fh = await getFileHandle(path);
  const f = await fh.getFile();
  return await f.text();
}

async function writeFileText(path, text){
  const fh = await getFileHandle(path, true);
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
  S.fileList = null;
}

/** Descobre se um caminho é 'file', 'directory' ou null (não existe). */
async function kindOf(path){
  if(!path) return 'directory';
  try{
    const dh = await getDirHandle(dirname(path));
    if(!dh) return null;
    const name = base(path);
    for await (const [n, h] of dh.entries()) if(n === name) return h.kind;
    return null;
  }catch(_){ return null; }
}

async function pathExists(path){ return (await kindOf(path)) !== null; }
async function isDirPath(path){ return (await kindOf(path)) === 'directory'; }

async function removePath(path){
  const dh = await getDirHandle(dirname(path));
  if(!dh) throw new Error('caminho inválido');
  await dh.removeEntry(base(path), { recursive:true });
  S.files.delete(path); S.dirs.delete(path);
  for(const k of [...S.files.keys()]) if(k.startsWith(path + '/')) S.files.delete(k);
  for(const k of [...S.dirs.keys()]) if(k.startsWith(path + '/')) S.dirs.delete(k);
  S.fileList = null;
}

/** Copia um arquivo ou uma pasta inteira. */
async function copyPath(from, to){
  if(await isDirPath(from)){
    await getDirHandle(to, true);
    for(const item of await readDir(from)) await copyPath(item.path, join(to, item.name));
    return;
  }
  const fh = await getFileHandle(from);
  const file = await fh.getFile();
  const dest = await getFileHandle(to, true);
  const w = await dest.createWritable();
  await w.write(await file.arrayBuffer());
  await w.close();
  S.fileList = null;
}

async function movePath(from, to){
  await copyPath(from, to);
  await removePath(from);
  const tab = S.tabs.find(t => t.path === from);
  if(tab){ tab.path = to; tab.name = base(to); tab.handle = await getFileHandle(to); renderTabs(); }
}

/** Percorre a pasta inteira coletando os caminhos de arquivo. */
async function walk(path = '', acc = [], depth = 0){
  if(depth > 12 || acc.length > 20000) return acc;
  for(const item of await readDir(path)){
    if(item.dir){
      if(IGNORE.has(item.name)) continue;
      await walk(item.path, acc, depth + 1);
    }else acc.push(item.path);
  }
  return acc;
}

async function allFiles(force){
  if(S.fileList && !force) return S.fileList;
  S.fileList = await walk('');
  return S.fileList;
}

/* ------------------------------------------------------------- árvore */
async function renderTree(){
  if(!S.rootHandle){
    el.tree.innerHTML = `<div class="tree-empty">Nenhuma pasta aberta.<br><button id="tree-open">Abrir uma pasta do disco</button></div>`;
    const b = $('tree-open'); if(b) b.onclick = openFolder;
    return;
  }
  el.tree.innerHTML = '';
  await renderLevel('', el.tree, 0);
}

async function renderLevel(path, container, depth){
  const items = await readDir(path);
  for(const item of items){
    const row = buildNode(item, depth);
    container.appendChild(row);
    if(item.dir && S.expanded.has(item.path)){
      row.classList.add('open');
      const kids = document.createElement('div');
      kids.dataset.children = item.path;
      container.appendChild(kids);
      await renderLevel(item.path, kids, depth + 1);
    }
  }
}

function buildNode(item, depth){
  const row = document.createElement('div');
  row.className = 'node';
  row.dataset.path = item.path;
  row.dataset.dir = item.dir ? '1' : '';
  row.style.paddingLeft = (6 + depth * 12) + 'px';
  const ic = iconFor(item.name);
  row.innerHTML = item.dir
    ? `<span class="tw"><svg viewBox="0 0 12 12"><path d="M4 2l4 4-4 4"/></svg></span>
       <span class="ico" style="color:${IGNORE.has(item.name) ? 'var(--muted)' : 'var(--blue)'}">
         <svg viewBox="0 0 16 16" style="width:13px;height:13px"><path d="M1.5 13v-10h4l1.5 2h7.5v8z"/></svg></span>
       <span class="nm">${esc(item.name)}</span>`
    : `<span class="tw"></span><span class="ico" style="color:${ic.c}">${esc(ic.t)}</span><span class="nm">${esc(item.name)}</span>`;
  if(!item.dir && S.tabs.some(t => t.path === item.path && t.dirty)) row.insertAdjacentHTML('beforeend','<span class="dot"></span>');
  if(S.active === item.path) row.classList.add('active');
  if(S.selected === item.path) row.classList.add('sel');

  row.onclick = () => selectNode(item);
  row.oncontextmenu = (e) => { e.preventDefault(); S.selected = item.path; showTreeMenu(e, item); };
  return row;
}

async function selectNode(item){
  S.selected = item.path;
  if(item.dir){
    if(S.expanded.has(item.path)) S.expanded.delete(item.path);
    else S.expanded.add(item.path);
    await renderTree();
  }else{
    await openFile(item.path);
  }
}

function refreshTreeMarks(){
  el.tree.querySelectorAll('.node').forEach(n => {
    const p = n.dataset.path;
    n.classList.toggle('active', S.active === p);
    n.classList.toggle('sel', S.selected === p);
    const has = S.tabs.some(t => t.path === p && t.dirty);
    const dot = n.querySelector('.dot');
    if(has && !dot) n.insertAdjacentHTML('beforeend','<span class="dot"></span>');
    if(!has && dot) dot.remove();
  });
}

/* ------------------------------------------------------------- abas e editor */
async function openFile(path, opts){
  const existing = S.tabs.find(t => t.path === path);
  if(existing) return activateTab(path, opts);

  if(BINARY_EXT.has(ext(path))){
    toast('Arquivo binário: ' + base(path) + ' não pode ser editado como texto.', 'warn');
    return;
  }
  let text;
  try{ text = await readFileText(path); }
  catch(e){ toast('Não foi possível ler ' + base(path), 'err'); return; }

  const model = monaco.editor.createModel(text, langFor(base(path)), monaco.Uri.file('/' + path));
  model.updateOptions({ tabSize: S.settings.tabSize, insertSpaces: S.settings.insertSpaces });
  const tab = {
    path, name: base(path), model, dirty:false,
    savedId: model.getAlternativeVersionId(), viewState:null
  };
  model.onDidChangeContent(() => {
    const d = model.getAlternativeVersionId() !== tab.savedId;
    if(d !== tab.dirty){ tab.dirty = d; renderTabs(); refreshTreeMarks(); }
    if(S.settings.autoSave && d) scheduleAutoSave(tab);
  });
  S.tabs.push(tab);
  activateTab(path, opts);
}

let autoSaveTimer = null;
function scheduleAutoSave(tab){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveTab(tab, true), 900);
}

function activateTab(path, opts){
  const tab = S.tabs.find(t => t.path === path);
  if(!tab) return;
  const prev = S.tabs.find(t => t.path === S.active);
  if(prev && editor && prev !== tab) prev.viewState = editor.saveViewState();

  S.active = path;
  el.welcome.hidden = true;
  el.editor.classList.remove('hidden');
  editor.setModel(tab.model);
  if(tab.viewState) editor.restoreViewState(tab.viewState);
  editor.focus();
  if(opts && opts.line){
    editor.revealLineInCenter(opts.line);
    editor.setPosition({ lineNumber: opts.line, column: (opts.column || 1) });
  }
  renderTabs(); refreshTreeMarks(); updateStatus(); renderOutline();
}

function renderTabs(){
  el.tabs.innerHTML = '';
  for(const tab of S.tabs){
    const d = document.createElement('div');
    d.className = 'tab' + (tab.path === S.active ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    d.title = tab.path;
    const ic = iconFor(tab.name);
    d.innerHTML = `<span class="ico" style="color:${ic.c}">${esc(ic.t)}</span>
                   <span class="nm">${esc(tab.name)}</span>
                   <button class="x"><svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>`;
    d.onclick = (e) => { if(!e.target.closest('.x')) activateTab(tab.path); };
    d.onauxclick = (e) => { if(e.button === 1){ e.preventDefault(); closeTab(tab.path); } };
    d.querySelector('.x').onclick = (e) => { e.stopPropagation(); closeTab(tab.path); };
    el.tabs.appendChild(d);
  }
  const act = el.tabs.querySelector('.tab.active');
  if(act) act.scrollIntoView({ block:'nearest', inline:'nearest' });
}

async function closeTab(path){
  const i = S.tabs.findIndex(t => t.path === path);
  if(i < 0) return;
  const tab = S.tabs[i];
  if(tab.dirty){
    const ans = await confirmDialog('Salvar alterações?',
      `“${tab.name}” tem alterações não salvas.`, ['Salvar','Descartar','Cancelar']);
    if(ans === 'Cancelar') return;
    if(ans === 'Salvar') await saveTab(tab);
  }
  tab.model.dispose();
  S.tabs.splice(i,1);
  if(S.active === path){
    const next = S.tabs[i] || S.tabs[i-1];
    if(next) activateTab(next.path);
    else{
      S.active = null;
      editor.setModel(null);
      el.editor.classList.add('hidden');
      el.welcome.hidden = false;
      updateStatus();
    }
  }
  renderTabs(); refreshTreeMarks();
}

async function saveTab(tab, silent){
  if(!tab) return;
  try{
    await writeFileText(tab.path, tab.model.getValue());
    tab.savedId = tab.model.getAlternativeVersionId();
    tab.dirty = false;
    renderTabs(); refreshTreeMarks();
    if(!silent) toast('Salvo: ' + tab.name);
  }catch(e){
    toast('Falha ao salvar ' + tab.name + ' — ' + e.message, 'err');
  }
}

function activeTab(){ return S.tabs.find(t => t.path === S.active); }

async function saveActive(){
  const t = activeTab();
  if(!t){ toast('Nenhum arquivo aberto.', 'warn'); return; }
  await saveTab(t);
}

async function saveAll(){
  const dirty = S.tabs.filter(t => t.dirty);
  for(const t of dirty) await saveTab(t, true);
  toast(dirty.length ? dirty.length + ' arquivo(s) salvos' : 'Nada para salvar');
}

/* ------------------------------------------------------------- status */
function updateStatus(){
  const t = activeTab();
  if(!t){
    el.stPath.textContent = 'nenhum arquivo aberto';
    el.stLang.textContent = 'texto';
    el.stPos.textContent = 'Ln 1, Col 1';
    return;
  }
  el.stPath.innerHTML = (t.dirty ? '<span class="st-dot"></span>' : '') + esc(t.path);
  el.stLang.textContent = t.model.getLanguageId();
  el.stIndent.textContent = (S.settings.insertSpaces ? 'Espaços: ' : 'Tabulação: ') + S.settings.tabSize;
  el.stWrap.textContent = S.settings.wordWrap === 'on' ? 'Quebra de linha' : 'Sem quebra';
}

/* ------------------------------------------------------------- estrutura (outline) */
function renderOutline(){
  const t = activeTab();
  if(!t){ el.outline.innerHTML = '<p class="empty">Abra um arquivo para ver funções, classes e cabeçalhos.</p>'; return; }
  const lines = t.model.getValue().split('\n');
  const lang = t.model.getLanguageId();
  const items = [];
  const push = (k,n,l) => items.push({ k, n, l });

  lines.forEach((ln, i) => {
    const s = ln.trim();
    if(lang === 'markdown'){
      const m = s.match(/^(#{1,4})\s+(.+)/);
      if(m) push('#'.repeat(m[1].length), m[2], i+1);
      return;
    }
    if(lang === 'css' || lang === 'scss' || lang === 'less'){
      const m = s.match(/^([.#&@][^{;]{1,60})\{$/);
      if(m) push('{}', m[1].trim(), i+1);
      return;
    }
    let m;
    if((m = s.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([\w$]+)/))) return push('C', m[1], i+1);
    if((m = s.match(/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/))) return push('ƒ', m[1], i+1);
    if((m = s.match(/^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function|\()/))) return push('ƒ', m[1], i+1);
    if((m = s.match(/^(?:public|private|protected|static)?\s*(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{$/))){
      if(!['if','for','while','switch','catch','return'].includes(m[1])) return push('m', m[1], i+1);
    }
    if((m = s.match(/^def\s+([\w_]+)/))) return push('ƒ', m[1], i+1);
    if((m = s.match(/^(?:public|private|protected)?\s*function\s+([\w_]+)/))) return push('ƒ', m[1], i+1);
  });

  if(!items.length){ el.outline.innerHTML = '<p class="empty">Nenhum símbolo reconhecido neste arquivo.</p>'; return; }
  el.outline.innerHTML = '';
  for(const it of items){
    const d = document.createElement('div');
    d.className = 'ol-item';
    d.innerHTML = `<span class="k">${esc(it.k)}</span><span class="nm">${esc(it.n)}</span>`;
    d.onclick = () => { editor.revealLineInCenter(it.l); editor.setPosition({ lineNumber: it.l, column:1 }); editor.focus(); };
    el.outline.appendChild(d);
  }
}

/* ------------------------------------------------------------- busca global */
async function runSearch(){
  const q = el.searchInput.value;
  if(!S.rootHandle){ el.searchResults.innerHTML = '<p class="empty">Abra uma pasta primeiro.</p>'; return; }
  if(!q){ el.searchResults.innerHTML = '<p class="empty">Digite algo para procurar.</p>'; return; }

  let re;
  try{
    const pat = S.searchOpts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    re = new RegExp(pat, S.searchOpts.caseSensitive ? 'g' : 'gi');
  }catch(_){ el.searchResults.innerHTML = '<p class="empty">Expressão regular inválida.</p>'; return; }

  const inc = el.searchInclude.value.trim();
  let incRe = null;
  if(inc){
    try{ incRe = new RegExp(inc.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'§').replace(/\*/g,'[^/]*').replace(/§/g,'.*') + '$','i'); }catch(_){}
  }

  el.searchResults.innerHTML = '<p class="empty">Procurando…</p>';
  const files = await allFiles();
  const out = [];
  let total = 0;

  for(const p of files){
    if(incRe && !incRe.test(p)) continue;
    if(BINARY_EXT.has(ext(p))) continue;
    let text;
    try{
      const f = await (await getFileHandle(p)).getFile();
      if(f.size > 2 * 1024 * 1024) continue;
      text = await f.text();
    }catch(_){ continue; }
    if(text.indexOf('\u0000') >= 0) continue;
    const lines = text.split('\n');
    const hits = [];
    for(let i = 0; i < lines.length; i++){
      re.lastIndex = 0;
      if(re.test(lines[i])){
        hits.push({ line:i+1, text:lines[i].slice(0,300) });
        total++;
        if(hits.length >= 40) break;
      }
    }
    if(hits.length) out.push({ path:p, hits });
    if(total > 1500) break;
  }

  if(!out.length){ el.searchResults.innerHTML = '<p class="empty">Nenhum resultado.</p>'; return; }
  el.searchResults.innerHTML = '';
  const head = document.createElement('p');
  head.className = 'empty';
  head.style.padding = '4px 12px 8px';
  head.textContent = `${total} ocorrência(s) em ${out.length} arquivo(s)`;
  el.searchResults.appendChild(head);

  for(const r of out){
    const f = document.createElement('div');
    f.className = 'sr-file';
    const ic = iconFor(r.path);
    f.innerHTML = `<span class="ico" style="color:${ic.c};font-family:var(--mono);font-size:8.5px;font-weight:700">${esc(ic.t)}</span>
      <b>${esc(base(r.path))}</b><small>${esc(dirname(r.path))}</small><span class="sr-count">${r.hits.length}</span>`;
    f.onclick = () => openFile(r.path);
    el.searchResults.appendChild(f);
    for(const h of r.hits){
      const d = document.createElement('div');
      d.className = 'sr-hit';
      re.lastIndex = 0;
      const marked = esc(h.text.trim()).replace(new RegExp(re.source, re.flags), (m) => `<mark>${m}</mark>`);
      d.innerHTML = `<span class="ln">${h.line}</span><span class="tx">${marked}</span>`;
      d.onclick = () => openFile(r.path, { line:h.line });
      el.searchResults.appendChild(d);
    }
  }
}

/* ------------------------------------------------------------- paleta / quick open */
let paletteMode = 'files';
let paletteItems = [];
let paletteIndex = 0;

function fuzzy(text, q){
  if(!q) return { score:0, marks:[] };
  const t = text.toLowerCase(), s = q.toLowerCase();
  let ti = 0, score = 0, marks = [], streak = 0;
  for(let i = 0; i < s.length; i++){
    const idx = t.indexOf(s[i], ti);
    if(idx < 0) return null;
    marks.push(idx);
    streak = idx === ti ? streak + 1 : 0;
    score += streak * 3 + (idx === 0 ? 6 : 0) + Math.max(0, 12 - (idx - ti));
    ti = idx + 1;
  }
  return { score, marks };
}
function markUp(text, marks){
  let out = '', last = 0;
  for(const m of marks){ out += esc(text.slice(last,m)) + '<mark>' + esc(text[m]) + '</mark>'; last = m+1; }
  return out + esc(text.slice(last));
}

async function openPalette(mode){
  paletteMode = mode;
  el.overlay.hidden = false;
  el.paletteField.value = '';
  el.palettePrefix.textContent = mode === 'commands' ? '>' : '';
  el.paletteField.placeholder = mode === 'commands' ? 'Digite um comando…' : 'Nome do arquivo…';
  if(mode === 'files'){
    if(!S.rootHandle){ closePalette(); openFolder(); return; }
    el.paletteList.innerHTML = '<li class="palette-empty">Lendo arquivos…</li>';
    paletteItems = (await allFiles()).map(p => ({ label:base(p), detail:dirname(p), path:p }));
  }else{
    paletteItems = COMMANDS.map(c => ({ label:c.title, detail:c.hint || '', run:c.run }));
  }
  el.paletteField.focus();
  filterPalette();
}
function closePalette(){ el.overlay.hidden = true; if(editor) editor.focus(); }

function filterPalette(){
  const q = el.paletteField.value.trim();
  const scored = [];
  for(const it of paletteItems){
    const r = fuzzy(it.label, q) || (q ? fuzzy(it.detail || '', q) : null);
    if(q && !r) continue;
    scored.push({ it, score: r ? r.score : 0, marks: (r && fuzzy(it.label,q)) ? fuzzy(it.label,q).marks : [] });
  }
  scored.sort((a,b) => b.score - a.score);
  const top = scored.slice(0,300);
  paletteIndex = 0;
  if(!top.length){ el.paletteList.innerHTML = '<li class="palette-empty">Nada encontrado.</li>'; return; }
  el.paletteList.innerHTML = '';
  top.forEach((s, i) => {
    const li = document.createElement('li');
    if(i === 0) li.className = 'sel';
    const ic = paletteMode === 'files' ? iconFor(s.it.label) : { t:'>', c:'#2FBFA8' };
    li.innerHTML = `<span class="ico" style="color:${ic.c}">${esc(ic.t)}</span>
                    <span>${markUp(s.it.label, s.marks)}</span>
                    <span class="p">${esc(s.it.detail || '')}</span>`;
    li.onclick = () => runPaletteItem(s.it);
    el.paletteList.appendChild(li);
  });
  paletteItems._filtered = top.map(s => s.it);
}

function movePalette(delta){
  const lis = [...el.paletteList.querySelectorAll('li')].filter(l => !l.classList.contains('palette-empty'));
  if(!lis.length) return;
  lis[paletteIndex]?.classList.remove('sel');
  paletteIndex = (paletteIndex + delta + lis.length) % lis.length;
  lis[paletteIndex].classList.add('sel');
  lis[paletteIndex].scrollIntoView({ block:'nearest' });
}

function runPaletteItem(it){
  closePalette();
  if(it.path) openFile(it.path);
  else if(it.run) it.run();
}

/* ------------------------------------------------------------- comandos */
const COMMANDS = [
  { title:'Abrir pasta…', hint:'Ctrl+O', run: openFolder },
  { title:'Salvar arquivo', hint:'Ctrl+S', run: saveActive },
  { title:'Salvar todos', hint:'Ctrl+Alt+S', run: saveAll },
  { title:'Novo arquivo', run: () => createEntry(false) },
  { title:'Nova pasta', run: () => createEntry(true) },
  { title:'Fechar aba', hint:'Ctrl+W', run: () => S.active && closeTab(S.active) },
  { title:'Buscar no projeto', hint:'Ctrl+Shift+F', run: () => { setView('search'); el.searchInput.focus(); } },
  { title:'Substituir no arquivo', hint:'Ctrl+H', run: () => editor.getAction('editor.action.startFindReplaceAction').run() },
  { title:'Formatar documento', hint:'Shift+Alt+F', run: () => editor.getAction('editor.action.formatDocument').run() },
  { title:'Ir para a linha…', hint:'Ctrl+G', run: () => editor.getAction('editor.action.gotoLine').run() },
  { title:'Duplicar linha', run: () => editor.getAction('editor.action.copyLinesDownAction').run() },
  { title:'Comentar/descomentar', hint:'Ctrl+/', run: () => editor.getAction('editor.action.commentLine').run() },
  { title:'Dobrar tudo', run: () => editor.getAction('editor.foldAll').run() },
  { title:'Desdobrar tudo', run: () => editor.getAction('editor.unfoldAll').run() },
  { title:'Alternar quebra de linha', hint:'Alt+Z', run: toggleWrap },
  { title:'Alternar minimapa', run: toggleMinimap },
  { title:'Alternar terminal', hint:'Ctrl+`', run: toggleTerminal },
  { title:'Novo terminal', run: () => { showTerminal(true); newTerminal(); } },
  { title:'Aumentar fonte do editor', run: () => setFontSize(S.settings.fontSize + 1) },
  { title:'Diminuir fonte do editor', run: () => setFontSize(S.settings.fontSize - 1) },
  { title:'Executar arquivo atual', hint:'Ctrl+Enter', run: runActiveFile },
  { title:'Tema…', run: openThemePicker },
  { title:'Fonte…', run: openFontPicker },
  { title:'Preferências', run: openSettings },
  { title:'Atalhos do teclado', run: openHelp },
  ...Object.entries(THEMES).map(([id, th]) => ({ title:'Tema: ' + th.name, hint:'aparência', run:() => applyTheme(id) }))
];

/* ------------------------------------------------------------- criar / renomear / excluir */
async function createEntry(isDir){
  if(!S.rootHandle){ toast('Abra uma pasta primeiro.','warn'); return; }
  let parent = '';
  if(S.selected){
    parent = S.dirs.has(S.selected) ? S.selected : dirname(S.selected);
  }
  const name = await promptDialog(isDir ? 'Nova pasta' : 'Novo arquivo',
    parent ? 'Dentro de ' + parent : 'Na raiz do projeto', isDir ? 'nome-da-pasta' : 'arquivo.js');
  if(!name) return;
  const path = join(parent, name);
  try{
    if(await pathExists(path)){ toast('Já existe um item com esse nome.','err'); return; }
    if(isDir){
      await getDirHandle(path, true);
      S.expanded.add(parent);
    }else{
      await writeFileText(path, '');
      S.expanded.add(parent);
    }
    S.fileList = null;
    await renderTree();
    if(!isDir) await openFile(path);
    toast((isDir ? 'Pasta criada: ' : 'Arquivo criado: ') + name);
  }catch(e){ toast('Erro: ' + e.message, 'err'); }
}

async function renameEntry(item){
  const name = await promptDialog('Renomear', item.path, base(item.path));
  if(!name || name === base(item.path)) return;
  const to = join(dirname(item.path), name);
  try{
    if(await pathExists(to)){ toast('Já existe um item com esse nome.','err'); return; }
    await movePath(item.path, to);
    await renderTree();
    toast('Renomeado para ' + name);
  }catch(e){ toast('Erro ao renomear: ' + e.message, 'err'); }
}

async function deleteEntry(item){
  const ok = await confirmDialog('Excluir',
    `“${base(item.path)}” será apagado do disco. Não dá para desfazer.`, ['Excluir','Cancelar']);
  if(ok !== 'Excluir') return;
  try{
    await removePath(item.path);
    for(const t of [...S.tabs]) if(t.path === item.path || t.path.startsWith(item.path + '/')){ t.dirty = false; await closeTab(t.path); }
    await renderTree();
    toast('Excluído: ' + base(item.path));
  }catch(e){ toast('Erro ao excluir: ' + e.message, 'err'); }
}

/* ------------------------------------------------------------- menu de contexto */
function showTreeMenu(e, item){
  const isDir = item.dir;
  const entries = [
    ...(isDir ? [
      { label:'Novo arquivo aqui', run: () => { S.selected = item.path; createEntry(false); } },
      { label:'Nova pasta aqui', run: () => { S.selected = item.path; createEntry(true); } },
      { sep:true },
      { label:'Abrir terminal aqui', run: () => {
          showTerminal(true);
          const t = activeTerm();
          termInterrupt(t);
          t.cwd = item.path;
          termWrite(t, 'cd /' + item.path, 'dim');
          termPrompt(t);
        } }
    ] : [
      { label:'Abrir', run: () => openFile(item.path) },
      { label:'Copiar caminho', run: () => { navigator.clipboard.writeText(item.path); toast('Caminho copiado'); } }
    ]),
    { sep:true },
    { label:'Duplicar', run: () => duplicateEntry(item) },
    { label:'Renomear', kbd:'F2', run: () => renameEntry(item) },
    { label:'Excluir', kbd:'Del', danger:true, run: () => deleteEntry(item) }
  ];
  openMenu(e.clientX, e.clientY, entries);
  refreshTreeMarks();
}

async function duplicateEntry(item){
  let n = 1, to;
  const e2 = ext(item.path);
  const stem = e2 ? item.path.slice(0, -(e2.length + 1)) : item.path;
  do{ to = e2 ? `${stem}-copia${n > 1 ? n : ''}.${e2}` : `${stem}-copia${n > 1 ? n : ''}`; n++; }while(await pathExists(to));
  try{ await copyPath(item.path, to); await renderTree(); toast('Duplicado: ' + base(to)); }
  catch(err){ toast('Erro: ' + err.message, 'err'); }
}

function openMenu(x, y, entries){
  el.menu.innerHTML = '';
  for(const it of entries){
    if(it.sep){ el.menu.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    if(it.danger) b.className = 'danger';
    b.innerHTML = esc(it.label) + (it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : '');
    b.onclick = () => { closeMenu(); it.run(); };
    el.menu.appendChild(b);
  }
  el.menu.hidden = false;
  const r = el.menu.getBoundingClientRect();
  el.menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  el.menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function closeMenu(){ el.menu.hidden = true; }
document.addEventListener('click', closeMenu);
document.addEventListener('scroll', closeMenu, true);

/* ------------------------------------------------------------- diálogos */
function showModal(title, bodyHTML, actions){
  return new Promise((resolve) => {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = bodyHTML;
    el.modalActions.innerHTML = '';
    for(const a of actions){
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '');
      b.textContent = a.label;
      b.onclick = () => { el.modalOverlay.hidden = true; resolve(a.value !== undefined ? a.value : a.label); };
      el.modalActions.appendChild(b);
    }
    el.modalOverlay.hidden = false;
    const inp = el.modalBody.querySelector('input');
    if(inp){
      inp.focus(); inp.select();
      inp.onkeydown = (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); el.modalOverlay.hidden = true; resolve(inp.value.trim()); }
        if(e.key === 'Escape'){ el.modalOverlay.hidden = true; resolve(null); }
      };
    }
    el.modalOverlay.onclick = (e) => { if(e.target === el.modalOverlay){ el.modalOverlay.hidden = true; resolve(null); } };
  });
}

function promptDialog(title, desc, value){
  return showModal(title,
    `<p>${esc(desc)}</p><input class="field" value="${esc(value || '')}" spellcheck="false" />`,
    [{ label:'Cancelar', value:null }, { label:'Confirmar', primary:true, value:'__input__' }]
  ).then(v => {
    const inp = el.modalBody.querySelector('input');
    if(v === '__input__') return inp ? inp.value.trim() : null;
    return typeof v === 'string' && v !== '__input__' ? v : (v === null ? null : v);
  });
}

function confirmDialog(title, desc, labels){
  return showModal(title, `<p>${esc(desc)}</p>`,
    labels.map((l,i) => ({ label:l, primary:i === 0 && l !== 'Excluir', danger:l === 'Excluir' })));
}

function openSettings(){
  const s = S.settings;
  showModal('Preferências', `
    <div class="settings-row"><label>Tema</label><select id="set-theme">${
      Object.entries(THEMES).map(([id, th]) => `<option value="${id}"${id === S.theme ? ' selected' : ''}>${esc(th.name)}</option>`).join('')
    }</select></div>
    <div class="settings-row"><label>Fonte</label><button class="chip" id="set-fontpick">${esc((FONTS.find(f => f.id === s.font) || FONTS[0]).name)}</button></div>
    <div class="settings-row"><label>Tamanho da fonte</label><input type="number" id="set-font" min="9" max="28" value="${s.fontSize}"></div>
    <div class="settings-row"><label>Tamanho da indentação</label><input type="number" id="set-tab" min="1" max="8" value="${s.tabSize}"></div>
    <div class="settings-row"><label>Indentar com espaços</label><div class="switch ${s.insertSpaces?'on':''}" id="set-spaces"></div></div>
    <div class="settings-row"><label>Quebra automática de linha</label><div class="switch ${s.wordWrap==='on'?'on':''}" id="set-wrap"></div></div>
    <div class="settings-row"><label>Minimapa</label><div class="switch ${s.minimap?'on':''}" id="set-mini"></div></div>
    <div class="settings-row"><label>Salvar automaticamente</label><div class="switch ${s.autoSave?'on':''}" id="set-auto"></div></div>
  `, [{ label:'Fechar', primary:true }]);
  setTimeout(() => {
    for(const [id, key] of [['set-spaces','insertSpaces'],['set-mini','minimap'],['set-auto','autoSave']]){
      const sw = $(id);
      if(sw) sw.onclick = () => { S.settings[key] = !S.settings[key]; sw.classList.toggle('on'); applySettings(); };
    }
    const w = $('set-wrap');
    if(w) w.onclick = () => { S.settings.wordWrap = S.settings.wordWrap === 'on' ? 'off' : 'on'; w.classList.toggle('on'); applySettings(); };
    const f = $('set-font');
    if(f) f.oninput = () => setFontSize(Number(f.value) || 13);
    const t = $('set-tab');
    if(t) t.oninput = () => { S.settings.tabSize = Number(t.value) || 2; applySettings(); };
    const th = $('set-theme');
    if(th) th.onchange = () => applyTheme(th.value);
    const fp = $('set-fontpick');
    if(fp) fp.onclick = () => openFontPicker();
  }, 0);
}

function openHelp(){
  showModal('Atalhos', `
    <p>Esta IDE roda inteira no navegador e usa a API de arquivos do Chrome/Edge para ler e gravar direto no seu disco. O PHP roda de verdade, compilado em WebAssembly — <b>npm</b>, <b>node</b>, <b>composer</b> e <b>git</b> ainda precisam do terminal do sistema.</p>
    <div class="settings-row"><label>Executar arquivo (.php/.js)</label><span><kbd>Ctrl</kbd><kbd>Enter</kbd></span></div>
    <div class="settings-row"><label>Abrir pasta</label><span><kbd>Ctrl</kbd><kbd>O</kbd></span></div>
    <div class="settings-row"><label>Ir para arquivo</label><span><kbd>Ctrl</kbd><kbd>P</kbd></span></div>
    <div class="settings-row"><label>Paleta de comandos</label><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>P</kbd></span></div>
    <div class="settings-row"><label>Salvar / salvar todos</label><span><kbd>Ctrl</kbd><kbd>S</kbd> · <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>S</kbd></span></div>
    <div class="settings-row"><label>Buscar no projeto</label><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>F</kbd></span></div>
    <div class="settings-row"><label>Terminal</label><span><kbd>Ctrl</kbd><kbd>\`</kbd></span></div>
    <div class="settings-row"><label>Painel lateral</label><span><kbd>Ctrl</kbd><kbd>B</kbd></span></div>
    <div class="settings-row"><label>Fechar aba</label><span><kbd>Ctrl</kbd><kbd>W</kbd></span></div>
    <div class="settings-row"><label>Renomear / excluir na árvore</label><span><kbd>F2</kbd> · <kbd>Del</kbd></span></div>
  `, [{ label:'Fechar', primary:true }]);
}

/* ------------------------------------------------------------- terminal */
function makeTerminal(){
  const view = document.createElement('div');
  view.className = 'term-view';
  const t = {
    id: S.terms.length + 1, view, cwd:'', history:[], hIndex:-1, input:null, busy:false
  };
  view.onclick = () => { if(t.input && !getSelection().toString()) t.input.focus(); };
  el.termBody.appendChild(view);
  S.terms.push(t);
  return t;
}

function activeTerm(){
  if(!S.activeTerm) newTerminal();
  return S.activeTerm;
}

function newTerminal(){
  const t = makeTerminal();
  selectTerminal(t);
  termWrite(t, 'Forge Shell — comandos de arquivo reais sobre a pasta aberta.', 'ok');
  termWrite(t, 'Digite <b>help</b> para os comandos. <b>php arquivo.php</b> executa de verdade (WebAssembly).', 'dim');
  if(!S.rootHandle) termWrite(t, 'Nenhuma pasta aberta ainda — use Ctrl+O.', 'warn');
  termPrompt(t);
  renderTermTabs();
  return t;
}

function selectTerminal(t){
  S.activeTerm = t;
  for(const x of S.terms) x.view.hidden = x !== t;
  renderTermTabs();
  if(t.input) t.input.focus();
}

function renderTermTabs(){
  el.termTabs.innerHTML = '';
  for(const t of S.terms){
    const b = document.createElement('button');
    b.className = 'term-tab' + (t === S.activeTerm ? ' active' : '');
    b.innerHTML = `<span class="d"></span>shell ${t.id}`;
    b.onclick = () => selectTerminal(t);
    el.termTabs.appendChild(b);
  }
}

/** Remove a linha de entrada pendente antes de escrever de fora do shell. */
function termInterrupt(t){
  if(t && t.input){
    const line = t.input.closest('.term-input-line');
    if(line) line.remove();
    t.input = null;
  }
}

function termWrite(t, html, cls){
  const d = document.createElement('div');
  d.className = 'term-line' + (cls ? ' ' + cls : '');
  d.innerHTML = html;
  t.view.appendChild(d);
  t.view.scrollTop = t.view.scrollHeight;
}
function termPlain(t, text, cls){ termWrite(t, esc(text), cls); }

function promptHTML(t){
  const root = S.rootName || '~';
  const p = t.cwd ? '/' + t.cwd : '';
  return `<span class="term-prompt">${esc(root)}<span class="p">${esc(p)}</span> $&nbsp;</span>`;
}

function termPrompt(t){
  const line = document.createElement('div');
  line.className = 'term-input-line';
  line.innerHTML = promptHTML(t);
  const inp = document.createElement('input');
  inp.className = 'term-input';
  inp.spellcheck = false;
  inp.autocomplete = 'off';
  line.appendChild(inp);
  t.view.appendChild(line);
  t.input = inp;
  inp.focus();
  t.view.scrollTop = t.view.scrollHeight;

  inp.onkeydown = async (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      const cmd = inp.value;
      inp.disabled = true;
      inp.classList.remove('term-input');
      line.innerHTML = promptHTML(t) + `<span style="white-space:pre-wrap">${esc(cmd)}</span>`;
      if(cmd.trim()){ t.history.push(cmd); t.hIndex = t.history.length; }
      let closed = false;
      try{ closed = await execCommand(t, cmd); }
      catch(err){ termPlain(t, 'erro: ' + err.message, 'err'); }
      if(!closed) termPrompt(t);
    }else if(e.key === 'ArrowUp'){
      e.preventDefault();
      if(t.hIndex > 0){ t.hIndex--; inp.value = t.history[t.hIndex]; }
    }else if(e.key === 'ArrowDown'){
      e.preventDefault();
      if(t.hIndex < t.history.length - 1){ t.hIndex++; inp.value = t.history[t.hIndex]; }
      else { t.hIndex = t.history.length; inp.value = ''; }
    }else if(e.key === 'Tab'){
      e.preventDefault();
      await completePath(t, inp);
    }else if(e.key === 'l' && e.ctrlKey){
      e.preventDefault();
      clearTerm(t);
    }else if(e.key === 'c' && e.ctrlKey && !getSelection().toString()){
      e.preventDefault();
      inp.value = '';
    }
  };
}

function clearTerm(t){
  t.view.innerHTML = '';
  termPrompt(t);
}

async function completePath(t, inp){
  const parts = tokenize(inp.value);
  const last = parts.length ? parts[parts.length - 1] : '';
  const slash = last.lastIndexOf('/');
  const dirPart = slash >= 0 ? last.slice(0, slash) : '';
  const stem = slash >= 0 ? last.slice(slash + 1) : last;
  const dir = resolvePath(t, dirPart || '.');
  let items;
  try{ items = await readDir(dir); }catch(_){ return; }
  const matches = items.filter(i => i.name.startsWith(stem));
  if(!matches.length) return;
  if(matches.length === 1){
    const full = (dirPart ? dirPart + '/' : '') + matches[0].name + (matches[0].dir ? '/' : '');
    parts[parts.length - 1] = full;
    inp.value = parts.join(' ');
  }else{
    termPlain(t, matches.map(m => m.name + (m.dir ? '/' : '')).join('   '), 'dim');
  }
}

function tokenize(line){
  const out = [];
  let cur = '', q = null;
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(q){ if(c === q) q = null; else cur += c; }
    else if(c === '"' || c === "'") q = c;
    else if(c === ' '){ if(cur){ out.push(cur); cur = ''; } }
    else cur += c;
  }
  if(cur) out.push(cur);
  return out;
}

/** Resolve um caminho digitado no shell para caminho relativo à raiz. */
function resolvePath(t, p){
  if(!p || p === '.') return t.cwd;
  let baseParts = p.startsWith('/') ? [] : t.cwd.split('/').filter(Boolean);
  for(const seg of p.split('/')){
    if(!seg || seg === '.') continue;
    if(seg === '..') baseParts.pop();
    else baseParts.push(seg);
  }
  return baseParts.join('/');
}

const HELP = [
  ['ls [-l] [dir]', 'lista o conteúdo da pasta'],
  ['cd <dir>', 'entra em uma pasta (.. volta)'],
  ['pwd', 'mostra a pasta atual'],
  ['cat <arquivo>', 'mostra o conteúdo'],
  ['head/tail -n N <arq>', 'primeiras/últimas linhas'],
  ['open <arquivo>', 'abre no editor'],
  ['touch <arquivo>', 'cria arquivo vazio'],
  ['mkdir [-p] <pasta>', 'cria pasta'],
  ['rm [-r] <alvo>', 'apaga arquivo ou pasta'],
  ['cp <origem> <destino>', 'copia'],
  ['mv <origem> <destino>', 'move ou renomeia'],
  ['echo texto > arquivo', 'grava (>> concatena)'],
  ['write <arquivo>', 'grava no arquivo o conteúdo do editor'],
  ['grep [-i] <padrão> [dir]', 'procura texto nos arquivos'],
  ['find <padrão>', 'procura arquivos pelo nome'],
  ['tree [dir]', 'mostra a árvore de pastas'],
  ['wc <arquivo>', 'conta linhas, palavras e bytes'],
  ['stat <alvo>', 'tamanho e data de modificação'],
  ['du [dir]', 'soma o tamanho dos arquivos'],
  ['php <arquivo.php>', 'executa PHP 8.4 (WebAssembly)'],
  ['php -r "código"', 'executa PHP direto na linha'],
  ['php -v / phpinfo', 'versão e extensões do PHP'],
  ['run <arquivo.js>', 'executa JavaScript no navegador'],
  ['save / saveall', 'salva o arquivo atual / todos'],
  ['clear', 'limpa o terminal'],
  ['date', 'data e hora'],
  ['help', 'esta lista']
];

async function execCommand(t, raw){
  const line = raw.trim();
  if(!line) return;

  // redirecionamento simples: cmd > arquivo  |  cmd >> arquivo
  let redirect = null;
  const rx = line.match(/^(.*?)\s*(>>|>)\s*(\S+)$/);
  let work = line;
  if(rx && !/^(grep|find|php)\b/.test(line)){
    work = rx[1];
    redirect = { append: rx[2] === '>>', path: resolvePath(t, rx[3]) };
  }

  const parts = tokenize(work);
  const cmd = parts[0];
  const args = parts.slice(1);
  const flags = args.filter(a => a.startsWith('-'));
  const rest = args.filter(a => !a.startsWith('-'));
  const has = (f) => flags.some(x => x.includes(f.replace('-','')));

  let captured = [];
  const out = (text, cls) => { if(redirect) captured.push(text); else termWrite(t, text, cls); };
  const outPlain = (text, cls) => out(esc(text), cls);

  const needRoot = () => {
    if(!S.rootHandle){ termPlain(t, 'nenhuma pasta aberta — pressione Ctrl+O', 'err'); return false; }
    return true;
  };

  switch(cmd){

    case 'help': {
      out('<b>Comandos disponíveis</b>');
      for(const [c, d] of HELP) out(`  <span class="d">${esc(c.padEnd(24))}</span><span class="f">${esc(d)}</span>`);
      break;
    }

    case 'clear': case 'cls': t.view.innerHTML = ''; return false;

    case 'pwd': outPlain('/' + t.cwd); break;

    case 'date': outPlain(new Date().toLocaleString('pt-BR')); break;

    case 'ls': case 'dir': {
      if(!needRoot()) break;
      const dir = resolvePath(t, rest[0] || '.');
      let items;
      try{ items = await readDir(dir); }catch(_){ termPlain(t, 'pasta não encontrada: ' + (rest[0] || '.'), 'err'); break; }
      if(!items.length){ out('<span class="f">(vazia)</span>'); break; }
      if(has('l')){
        for(const i of items){
          let size = '';
          if(!i.dir){ try{ size = fmtSize((await (await getFileHandle(i.path)).getFile()).size); }catch(_){} }
          out(`  <span class="${i.dir ? 'd' : 'f'}">${esc((i.name + (i.dir ? '/' : '')).padEnd(34))}</span><span class="f">${esc(size)}</span>`);
        }
      }else{
        const names = items.map(i => i.dir
          ? `<span class="d">${esc(i.name)}/</span>`
          : `<span class="f">${esc(i.name)}</span>`);
        out('  ' + names.join('   '));
      }
      break;
    }

    case 'cd': {
      if(!needRoot()) break;
      const target = rest[0] || '';
      if(!target || target === '/' || target === '~'){ t.cwd = ''; break; }
      const p = resolvePath(t, target);
      const dh = await getDirHandle(p).catch(() => null);
      if(!dh){ termPlain(t, 'pasta não encontrada: ' + target, 'err'); break; }
      t.cwd = p;
      break;
    }

    case 'cat': {
      if(!rest.length){ termPlain(t, 'uso: cat <arquivo>', 'err'); break; }
      for(const f of rest){
        const p = resolvePath(t, f);
        try{ outPlain(await readFileText(p)); }
        catch(_){ termPlain(t, 'não encontrado: ' + f, 'err'); }
      }
      break;
    }

    case 'head': case 'tail': {
      const n = Number((args.find(a => /^-n\d*$/.test(a)) || '').replace('-n','')) || Number(rest[1]) || 10;
      const p = resolvePath(t, rest[0]);
      try{
        const lines = (await readFileText(p)).split('\n');
        const sel = cmd === 'head' ? lines.slice(0, n) : lines.slice(-n);
        outPlain(sel.join('\n'));
      }catch(_){ termPlain(t, 'não encontrado: ' + rest[0], 'err'); }
      break;
    }

    case 'open': case 'edit': {
      if(!rest.length){ termPlain(t, 'uso: open <arquivo>', 'err'); break; }
      const p = resolvePath(t, rest[0]);
      if(!await pathExists(p)){ termPlain(t, 'não encontrado: ' + rest[0], 'err'); break; }
      await openFile(p);
      outPlain('aberto no editor: ' + p, 'ok');
      break;
    }

    case 'touch': {
      if(!needRoot()) break;
      for(const f of rest){
        const p = resolvePath(t, f);
        if(!await pathExists(p)) await writeFileText(p, '');
        outPlain('criado: ' + p, 'ok');
      }
      await renderTree();
      break;
    }

    case 'mkdir': {
      if(!needRoot()) break;
      for(const d of rest){
        const p = resolvePath(t, d);
        await getDirHandle(p, true);
        outPlain('pasta criada: ' + p, 'ok');
      }
      S.fileList = null;
      await renderTree();
      break;
    }

    case 'rm': case 'del': {
      if(!rest.length){ termPlain(t, 'uso: rm [-r] <alvo>', 'err'); break; }
      for(const f of rest){
        const p = resolvePath(t, f);
        if(!await pathExists(p)){ termPlain(t, 'não encontrado: ' + f, 'err'); continue; }
        if(await isDirPath(p) && !has('r')){ termPlain(t, f + ' é uma pasta — use rm -r', 'err'); continue; }
        await removePath(p);
        outPlain('removido: ' + p, 'ok');
        for(const tab of [...S.tabs]) if(tab.path === p){ tab.dirty = false; await closeTab(tab.path); }
      }
      await renderTree();
      break;
    }

    case 'cp': {
      if(rest.length < 2){ termPlain(t, 'uso: cp <origem> <destino>', 'err'); break; }
      const from = resolvePath(t, rest[0]);
      let to = resolvePath(t, rest[1]);
      if(await isDirPath(to)) to = join(to, base(from));
      await copyPath(from, to);
      outPlain(`copiado: ${from} -> ${to}`, 'ok');
      await renderTree();
      break;
    }

    case 'mv': case 'ren': {
      if(rest.length < 2){ termPlain(t, 'uso: mv <origem> <destino>', 'err'); break; }
      const from = resolvePath(t, rest[0]);
      let to = resolvePath(t, rest[1]);
      if(await isDirPath(to)) to = join(to, base(from));
      await movePath(from, to);
      outPlain(`movido: ${from} -> ${to}`, 'ok');
      await renderTree();
      break;
    }

    case 'echo': {
      const text = rest.join(' ');
      outPlain(text);
      break;
    }

    case 'write': {
      const tab = activeTab();
      if(!tab){ termPlain(t, 'nenhum arquivo aberto no editor', 'err'); break; }
      const p = rest[0] ? resolvePath(t, rest[0]) : tab.path;
      await writeFileText(p, tab.model.getValue());
      outPlain('gravado: ' + p, 'ok');
      await renderTree();
      break;
    }

    case 'save': await saveActive(); break;
    case 'saveall': await saveAll(); break;

    case 'grep': {
      if(!needRoot()) break;
      const pat = rest[0];
      if(!pat){ termPlain(t, 'uso: grep [-i] <padrão> [pasta]', 'err'); break; }
      const dir = resolvePath(t, rest[1] || '.');
      const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), has('i') ? 'i' : '');
      const files = await walk(dir, []);
      let n = 0;
      for(const p of files){
        if(BINARY_EXT.has(ext(p))) continue;
        let text;
        try{ text = await readFileText(p); }catch(_){ continue; }
        text.split('\n').forEach((ln, i) => {
          if(re.test(ln) && n < 300){
            n++;
            out(`<span class="d">${esc(p)}</span><span class="f">:${i+1}:</span> ${esc(ln.trim().slice(0,180))}`);
          }
        });
      }
      if(!n) out('<span class="f">nenhuma ocorrência</span>');
      else out(`<span class="f">${n} ocorrência(s)</span>`);
      break;
    }

    case 'find': {
      if(!needRoot()) break;
      const pat = (rest[0] || '').toLowerCase();
      const files = await walk(resolvePath(t, rest[1] || '.'), []);
      const hits = files.filter(p => base(p).toLowerCase().includes(pat.replace(/\*/g,'')));
      if(!hits.length) out('<span class="f">nada encontrado</span>');
      hits.slice(0,300).forEach(p => outPlain(p));
      break;
    }

    case 'tree': {
      if(!needRoot()) break;
      const start = resolvePath(t, rest[0] || '.');
      const render = async (dir, prefix, depth) => {
        if(depth > 5) return;
        const items = await readDir(dir);
        for(let i = 0; i < items.length; i++){
          const it = items[i];
          const last = i === items.length - 1;
          const branch = prefix + (last ? '└─ ' : '├─ ');
          out(`<span class="f">${esc(branch)}</span><span class="${it.dir ? 'd' : 'f'}">${esc(it.name)}${it.dir ? '/' : ''}</span>`);
          if(it.dir && !IGNORE.has(it.name)) await render(it.path, prefix + (last ? '   ' : '│  '), depth + 1);
        }
      };
      out(`<span class="d">${esc('/' + start)}</span>`);
      await render(start, '', 0);
      break;
    }

    case 'wc': {
      const p = resolvePath(t, rest[0]);
      try{
        const text = await readFileText(p);
        outPlain(`${text.split('\n').length} linhas   ${text.split(/\s+/).filter(Boolean).length} palavras   ${new Blob([text]).size} bytes`);
      }catch(_){ termPlain(t, 'não encontrado: ' + rest[0], 'err'); }
      break;
    }

    case 'stat': {
      const p = resolvePath(t, rest[0]);
      try{
        const f = await (await getFileHandle(p)).getFile();
        outPlain(`${p}\ntamanho: ${fmtSize(f.size)}\nmodificado: ${new Date(f.lastModified).toLocaleString('pt-BR')}\ntipo: ${f.type || 'desconhecido'}`);
      }catch(_){ termPlain(t, 'não encontrado (ou é uma pasta): ' + rest[0], 'err'); }
      break;
    }

    case 'du': {
      if(!needRoot()) break;
      const files = await walk(resolvePath(t, rest[0] || '.'), []);
      let total = 0;
      for(const p of files){ try{ total += (await (await getFileHandle(p)).getFile()).size; }catch(_){} }
      outPlain(`${files.length} arquivos   ${fmtSize(total)}`);
      break;
    }

    case 'run': {
      const p = resolvePath(t, rest[0] || '');
      let code;
      try{ code = await readFileText(p); }catch(_){ termPlain(t, 'não encontrado: ' + rest[0], 'err'); break; }
      const logs = [];
      const fakeConsole = { log:(...a) => logs.push(a.map(String).join(' ')), error:(...a) => logs.push('erro: ' + a.map(String).join(' ')) };
      try{
        const fn = new Function('console', code);
        const r = fn(fakeConsole);
        logs.forEach(l => outPlain(l));
        if(r !== undefined) outPlain(String(r), 'ok');
      }catch(err){
        logs.forEach(l => outPlain(l));
        termPlain(t, String(err), 'err');
      }
      break;
    }

    case 'php': {
      if(flags.includes('-v') || rest[0] === '-v'){
        await runPhp(t, '<?php echo "PHP " . PHP_VERSION . " (WebAssembly, dentro do navegador)\\n";', {});
        break;
      }
      const rIdx = args.indexOf('-r');
      if(rIdx >= 0){
        const code = args.slice(rIdx + 1).join(' ');
        if(!code){ termPlain(t, 'uso: php -r "echo 1+1;"', 'err'); break; }
        await runPhp(t, '<?php ' + code, { mount:true });
        break;
      }
      if(!rest.length){ termPlain(t, 'uso: php <arquivo.php> | php -r "código" | php -v', 'err'); break; }
      if(!needRoot()) break;
      await execPhpFile(t, resolvePath(t, rest[0]), rest.slice(1));
      break;
    }

    case 'phpinfo':
      await runPhp(t, '<?php echo "PHP " . PHP_VERSION . "\\nExtensões: " . implode(", ", get_loaded_extensions()) . "\\n";', {});
      break;

    case 'npm': case 'node': case 'git': case 'yarn': case 'pnpm': case 'python': case 'composer': case 'artisan':
      termWrite(t, `<b>${esc(cmd)}</b> precisa de um processo no sistema operacional, o que o navegador não permite.`, 'warn');
      termWrite(t, 'Use o terminal do Windows/Linux na mesma pasta. PHP é a exceção: roda aqui em WebAssembly.', 'dim');
      break;

    case 'exit':
      if(S.terms.length > 1){
        const i = S.terms.indexOf(t);
        t.view.remove(); S.terms.splice(i,1);
        selectTerminal(S.terms[Math.max(0,i-1)]);
        return true;
      }
      t.view.innerHTML = '';
      return false;

    default:
      termWrite(t, `comando não reconhecido: <b>${esc(cmd)}</b> — digite <b>help</b>`, 'err');
  }

  if(redirect && captured.length){
    const text = captured.map(c => c.replace(/<[^>]+>/g,'')).join('\n');
    let prev = '';
    if(redirect.append){ try{ prev = await readFileText(redirect.path) + '\n'; }catch(_){} }
    await writeFileText(redirect.path, prev + text + '\n');
    termPlain(t, 'gravado em ' + redirect.path, 'ok');
    await renderTree();
  }
}

/* ------------------------------------------------------------- PHP (WebAssembly) */
const PHP_CDN = 'https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs';
const PHP = { instance:null, loading:null, out:[], mounted:new Map(), running:false };

function phpStr(s){ return "'" + String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'") + "'"; }

function detailToText(d){
  if(d == null) return '';
  if(typeof d === 'string') return d;
  if(d instanceof Uint8Array || Array.isArray(d) && typeof d[0] === 'number') return new TextDecoder().decode(new Uint8Array(d));
  if(Array.isArray(d)) return d.map(detailToText).join('');
  if(d.buffer) return new TextDecoder().decode(d);
  return String(d);
}

function hashBytes(bytes){
  let h = 2166136261;
  for(let i = 0; i < bytes.length; i++){ h ^= bytes[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16) + ':' + bytes.length;
}

async function getPhp(t){
  if(PHP.instance) return PHP.instance;
  if(PHP.loading) return PHP.loading;
  termWrite(t, 'baixando o PHP 8.4 (WebAssembly)… isso só acontece na primeira execução', 'dim');
  PHP.loading = (async () => {
    const mod = await import(PHP_CDN);
    const PhpWeb = mod.PhpWeb;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    const php = new PhpWeb({ ini: `date.timezone=${tz}\nexpose_php=0\ndisplay_errors=1\nerror_reporting=E_ALL\n` });
    php.addEventListener('output', (e) => PHP.out.push({ text: detailToText(e.detail) }));
    php.addEventListener('error', (e) => PHP.out.push({ text: detailToText(e.detail), err:true }));
    PHP.instance = php;
    return php;
  })();
  try{ return await PHP.loading; }
  catch(e){
    PHP.loading = null;
    throw new Error('não foi possível carregar o PHP (sem internet?): ' + e.message);
  }
}

async function phpMkdirp(php, dir){
  let cur = '';
  for(const seg of dir.split('/').filter(Boolean)){
    cur += '/' + seg;
    try{ await php.mkdir(cur); }catch(_){}
  }
}

/** Copia os arquivos do projeto para /app dentro do PHP, só os que mudaram. */
async function mountProject(php){
  await phpMkdirp(php, '/app');
  if(!S.rootHandle) return 0;
  const files = await allFiles();
  const enc = new TextEncoder();
  let n = 0;
  for(const p of files){
    if(BINARY_EXT.has(ext(p))) continue;
    let f;
    try{ f = await (await getFileHandle(p)).getFile(); }catch(_){ continue; }
    if(f.size > 1024 * 1024) continue;
    const sig = f.size + '@' + f.lastModified;
    const prev = PHP.mounted.get(p);
    if(prev && prev.sig === sig) continue;
    const text = await f.text();
    await phpMkdirp(php, '/app/' + dirname(p));
    await php.writeFile('/app/' + p, text, { encoding:'utf8' });
    PHP.mounted.set(p, { sig, hash: hashBytes(enc.encode(text)) });
    n++;
  }
  return n;
}

/** Traz de volta para o disco os arquivos que o PHP criou ou alterou. */
async function syncBackPhp(php){
  const changed = [];
  const walkPhp = async (dir, depth) => {
    if(depth > 8 || changed.length > 200) return;
    let entries = [];
    try{ entries = await php.readdir(dir); }catch(_){ return; }
    for(const name of entries){
      if(name === '.' || name === '..') continue;
      const full = dir + '/' + name;
      let isDir = false;
      try{ isDir = Array.isArray(await php.readdir(full)); }catch(_){ isDir = false; }
      if(isDir){ await walkPhp(full, depth + 1); continue; }
      let bytes;
      try{ bytes = await php.readFile(full); }catch(_){ continue; }
      if(!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
      if(bytes.length > 2 * 1024 * 1024) continue;
      const rel = full.replace(/^\/app\/?/, '');
      if(!rel) continue;
      const prev = PHP.mounted.get(rel);
      const hash = hashBytes(bytes);
      if(prev && prev.hash === hash) continue;
      try{
        const fh = await getFileHandle(rel, true);
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        const f = await fh.getFile();
        PHP.mounted.set(rel, { sig: f.size + '@' + f.lastModified, hash });
        changed.push(rel);
      }catch(_){}
    }
  };
  await walkPhp('/app', 0);
  return changed;
}

function flushPhpOutput(t){
  const chunks = PHP.out.splice(0, PHP.out.length);
  if(!chunks.length) return false;
  // junta pedaços consecutivos do mesmo canal antes de imprimir
  const groups = [];
  for(const c of chunks){
    const last = groups[groups.length - 1];
    if(last && last.err === !!c.err) last.text += c.text;
    else groups.push({ err: !!c.err, text: c.text });
  }
  let printed = false;
  for(const g of groups){
    const body = g.text.replace(/\n+$/, '');
    if(!body) continue;
    for(const line of body.split('\n')){ termPlain(t, line, g.err ? 'err' : ''); printed = true; }
  }
  return printed;
}

async function runPhp(t, source, opts){
  if(PHP.running){ termPlain(t, 'já existe um script PHP em execução', 'err'); return; }
  PHP.running = true;
  const started = performance.now();
  try{
    const php = await getPhp(t);
    if(opts && opts.mount && S.rootHandle){
      const n = await mountProject(php);
      if(n) termWrite(t, `<span class="f">${n} arquivo(s) sincronizados com o PHP</span>`, 'dim');
    }
    PHP.out.length = 0;
    let exit = 0;
    try{ exit = await php.run(source); }
    catch(e){ termPlain(t, String(e && e.message || e), 'err'); }
    flushPhpOutput(t);
    const ms = Math.round(performance.now() - started);
    termWrite(t, `<span class="f">— saiu com código ${exit} em ${ms} ms</span>`, exit ? 'warn' : 'dim');
    if(opts && opts.mount && S.rootHandle){
      const changed = await syncBackPhp(php);
      if(changed.length){
        termWrite(t, `<span class="f">gravado no disco: ${esc(changed.slice(0,8).join(', '))}${changed.length > 8 ? '…' : ''}</span>`, 'ok');
        await renderTree();
        await reloadUnchangedTabs(changed);
      }
    }
  }catch(e){
    termPlain(t, String(e.message || e), 'err');
  }finally{
    PHP.running = false;
  }
}

/** Recarrega no editor as abas que mudaram no disco e não têm edição pendente. */
async function reloadUnchangedTabs(paths){
  for(const p of paths){
    const tab = S.tabs.find(x => x.path === p);
    if(!tab || tab.dirty) continue;
    try{
      const text = await readFileText(p);
      if(text !== tab.model.getValue()){
        tab.model.setValue(text);
        tab.savedId = tab.model.getAlternativeVersionId();
        tab.dirty = false;
      }
    }catch(_){}
  }
  renderTabs(); refreshTreeMarks();
}

/** Executa o arquivo aberto (ou o informado) conforme a extensão. */
async function runActiveFile(){
  showTerminal(true);
  const t = activeTerm();
  const tab = activeTab();
  if(!tab){ toast('Abra um arquivo para executar.', 'warn'); return; }
  if(tab.dirty) await saveTab(tab, true);
  const e = ext(tab.path);
  termInterrupt(t);
  if(e === 'php'){
    termWrite(t, promptHTML(t) + `<span>php ${esc(tab.path)}</span>`);
    await execPhpFile(t, tab.path, []);
  }else if(['js','mjs','cjs'].includes(e)){
    termWrite(t, promptHTML(t) + `<span>run ${esc(tab.path)}</span>`);
    await execCommand(t, 'run ' + tab.path);
  }else{
    termWrite(t, `não sei executar arquivos .${esc(e || 'sem extensão')} — abra um .php ou .js`, 'warn');
  }
  termPrompt(t);
}

async function execPhpFile(t, rel, argv){
  if(!await pathExists(rel)){ termPlain(t, 'não encontrado: ' + rel, 'err'); return; }
  const dir = '/app/' + dirname(rel);
  const args = [rel, ...argv].map(a => phpStr(a)).join(', ');
  const src = `<?php
chdir(${phpStr(dir.replace(/\/$/,'') || '/app')});
$argv = [${args}]; $argc = ${argv.length + 1};
$_SERVER['argv'] = $argv; $_SERVER['argc'] = $argc;
$_SERVER['SCRIPT_NAME'] = ${phpStr('/' + rel)};
$_SERVER['SCRIPT_FILENAME'] = ${phpStr('/app/' + rel)};
$_SERVER['REQUEST_METHOD'] = 'GET';
require ${phpStr('/app/' + rel)};`;
  await runPhp(t, src, { mount:true });
}

/* ------------------------------------------------------------- painéis */
function setView(name){
  document.querySelectorAll('.rail-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.pane !== name);
  if(el.sidebar.classList.contains('hidden')) toggleSidebar();
}
function toggleSidebar(){
  el.sidebar.classList.toggle('hidden');
  $('split-side').style.display = el.sidebar.classList.contains('hidden') ? 'none' : '';
  if(editor) editor.layout();
}
function showTerminal(show){
  el.termPanel.classList.toggle('hidden', !show);
  el.splitTerm.classList.toggle('hidden', !show);
  if(show){
    if(!S.terms.length) newTerminal();
    else if(S.activeTerm && S.activeTerm.input) S.activeTerm.input.focus();
  }
  if(editor) editor.layout();
}
function toggleTerminal(){ showTerminal(el.termPanel.classList.contains('hidden')); }

function setFontSize(n){
  S.settings.fontSize = Math.max(9, Math.min(28, n));
  applySettings();
}
function toggleWrap(){ S.settings.wordWrap = S.settings.wordWrap === 'on' ? 'off' : 'on'; applySettings(); }
function toggleMinimap(){ S.settings.minimap = !S.settings.minimap; applySettings(); }

function applySettings(){
  applyFont();
  if(!editor) return;
  editor.updateOptions({
    fontSize: S.settings.fontSize,
    wordWrap: S.settings.wordWrap,
    minimap: { enabled: S.settings.minimap },
    tabSize: S.settings.tabSize,
    insertSpaces: S.settings.insertSpaces
  });
  for(const t of S.tabs) t.model.updateOptions({ tabSize:S.settings.tabSize, insertSpaces:S.settings.insertSpaces });
  updateStatus();
}

/* ------------------------------------------------------------- divisores */
function makeSplitter(node, dir, apply){
  node.onmousedown = (e) => {
    e.preventDefault();
    node.classList.add('drag');
    const move = (ev) => apply(ev);
    const up = () => {
      node.classList.remove('drag');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if(editor) editor.layout();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
}
makeSplitter($('split-side'), 'x', (ev) => {
  const w = Math.max(160, Math.min(560, ev.clientX - 46));
  el.sidebar.style.width = w + 'px';
  el.sidebar.style.flexBasis = w + 'px';
  if(editor) editor.layout();
});
makeSplitter(el.splitTerm, 'y', (ev) => {
  const rect = document.querySelector('.main').getBoundingClientRect();
  const h = Math.max(80, Math.min(rect.height - 120, rect.bottom - ev.clientY));
  el.termPanel.style.height = h + 'px';
  el.termPanel.style.flexBasis = h + 'px';
  if(editor) editor.layout();
});

/* ------------------------------------------------------------- teclado global */
document.addEventListener('keydown', async (e) => {
  const ctrl = e.ctrlKey || e.metaKey;

  // paleta aberta
  if(!el.overlay.hidden){
    if(e.key === 'Escape'){ e.preventDefault(); closePalette(); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); movePalette(1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); movePalette(-1); }
    else if(e.key === 'Enter'){
      e.preventDefault();
      const it = (paletteItems._filtered || [])[paletteIndex];
      if(it) runPaletteItem(it);
    }
    return;
  }

  if(ctrl && e.key.toLowerCase() === 's'){
    e.preventDefault();
    if(e.altKey) saveAll(); else saveActive();
    return;
  }
  if(ctrl && e.key.toLowerCase() === 'o'){ e.preventDefault(); openFolder(); return; }
  if(ctrl && e.shiftKey && e.key.toLowerCase() === 'p'){ e.preventDefault(); openPalette('commands'); return; }
  if(ctrl && e.key.toLowerCase() === 'p' && !e.shiftKey){ e.preventDefault(); openPalette('files'); return; }
  if(ctrl && e.shiftKey && e.key.toLowerCase() === 'f'){ e.preventDefault(); setView('search'); el.searchInput.focus(); return; }
  if(ctrl && e.shiftKey && e.key.toLowerCase() === 'e'){ e.preventDefault(); setView('files'); return; }
  if(ctrl && e.key.toLowerCase() === 'b'){ e.preventDefault(); toggleSidebar(); return; }
  if(ctrl && (e.key === '`' || e.key === '´')){ e.preventDefault(); toggleTerminal(); return; }
  if(ctrl && e.key.toLowerCase() === 'w'){ e.preventDefault(); if(S.active) closeTab(S.active); return; }
  if(ctrl && e.key.toLowerCase() === 'n'){ e.preventDefault(); createEntry(false); return; }
  if(e.altKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); toggleWrap(); return; }
  if((ctrl && e.key === 'Enter') || e.key === 'F5'){ e.preventDefault(); runActiveFile(); return; }

  // árvore em foco
  if(document.activeElement === el.tree || el.tree.contains(document.activeElement)){
    if(e.key === 'F2' && S.selected){ e.preventDefault(); renameEntry({ path:S.selected, dir:S.dirs.has(S.selected) }); }
    if(e.key === 'Delete' && S.selected){ e.preventDefault(); deleteEntry({ path:S.selected }); }
  }
});

window.addEventListener('beforeunload', (e) => {
  if(S.tabs.some(t => t.dirty)){ e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('resize', () => { if(editor) editor.layout(); });

/* ------------------------------------------------------------- ligações de UI */
$('btn-open-folder').onclick = openFolder;
$('welcome-open').onclick = openFolder;
$('btn-save').onclick = saveActive;
$('btn-term').onclick = toggleTerminal;
$('btn-settings').onclick = openSettings;
$('btn-run').onclick = runActiveFile;
$('st-theme').onclick = openThemePicker;
$('st-theme').oncontextmenu = (e) => { e.preventDefault(); openFontPicker(); };
$('btn-help').onclick = openHelp;
$('btn-sidebar').onclick = toggleSidebar;
$('btn-quick').onclick = () => openPalette('files');
$('btn-new-file').onclick = () => createEntry(false);
$('btn-new-folder').onclick = () => createEntry(true);
$('btn-refresh').onclick = async () => { S.fileList = null; await renderTree(); toast('Árvore atualizada'); };
$('btn-collapse').onclick = async () => { S.expanded.clear(); await renderTree(); };
$('btn-new-term').onclick = () => { showTerminal(true); newTerminal(); };
$('btn-clear-term').onclick = () => clearTerm(activeTerm());
$('btn-hide-term').onclick = () => showTerminal(false);
$('st-wrap').onclick = toggleWrap;
$('st-indent').onclick = openSettings;
$('st-lang').onclick = () => openPalette('commands');
$('st-pos').onclick = () => editor.getAction('editor.action.gotoLine').run();
document.querySelectorAll('.rail-btn[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));

el.paletteField.oninput = filterPalette;
el.overlay.onclick = (e) => { if(e.target === el.overlay) closePalette(); };
el.searchInput.onkeydown = (e) => { if(e.key === 'Enter') runSearch(); };
el.searchInclude.onkeydown = (e) => { if(e.key === 'Enter') runSearch(); };
$('opt-case').onclick = function(){ S.searchOpts.caseSensitive = !S.searchOpts.caseSensitive; this.classList.toggle('on'); runSearch(); };
$('opt-regex').onclick = function(){ S.searchOpts.regex = !S.searchOpts.regex; this.classList.toggle('on'); runSearch(); };

/* ------------------------------------------------------------- Monaco */
window.MonacoEnvironment = {
  getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`
    self.MonacoEnvironment = { baseUrl: '${MONACO_BASE}/' };
    importScripts('${MONACO_BASE}/vs/base/worker/workerMain.js');`)}`
};

require.config({ paths: { vs: MONACO_BASE + '/vs' } });

require(['vs/editor/editor.main'], () => {
  defineMonacoThemes();

  editor = monaco.editor.create(el.editor, {
    theme:'t-' + S.theme,
    automaticLayout:true,
    fontFamily:fontStack(),
    fontSize:S.settings.fontSize,
    fontLigatures:S.settings.ligatures,
    lineHeight:1.6,
    minimap:{ enabled:S.settings.minimap, renderCharacters:false },
    scrollBeyondLastLine:false,
    smoothScrolling:true,
    cursorBlinking:'smooth',
    renderWhitespace:'selection',
    padding:{ top:12, bottom:60 },
    bracketPairColorization:{ enabled:true },
    guides:{ bracketPairs:true, indentation:true },
    tabSize:S.settings.tabSize,
    wordWrap:S.settings.wordWrap,
    suggestSelection:'first',
    quickSuggestions:{ other:true, comments:false, strings:true },
    scrollbar:{ verticalScrollbarSize:10, horizontalScrollbarSize:10 }
  });

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation:true, noSyntaxValidation:false });

  editor.onDidChangeCursorPosition((e) => {
    el.stPos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });
  editor.onDidChangeModelContent(() => {
    updateStatus();
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(renderOutline, 600);
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveActive);

  applyTheme(S.theme);
  applyFont();
  el.boot.remove();
  el.app.hidden = false;
  renderTree();
  newTerminal();
  showTerminal(true);

  $('compat-note').innerHTML = HAS_FSA
    ? 'Os arquivos são lidos e gravados direto no disco. O navegador pede sua permissão na primeira vez que você abre a pasta.'
    : '<b>Atenção:</b> este navegador não suporta acesso a pastas. Abra em Chrome, Edge ou Opera para editar arquivos reais.';
});

let outlineTimer = null;

/* aviso se abrir via file:// (workers do Monaco exigem http) */
if(location.protocol === 'file:'){
  setTimeout(() => {
    if($('boot')) $('boot-msg').textContent = 'carregando… (se travar aqui, abra o arquivo por um servidor local)';
  }, 2500);
}