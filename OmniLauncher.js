// =================================================================
// OmniLauncher.js - v7.0.0 (The Ultimate Absolute Edition)
// Professional Multi-Runtime App Launcher for Scriptable (iOS)
// =================================================================

const OL_VERSION   = "7.0.0";
const OL_ROOT      = "OmniLauncher_Storage";
const OL_SAVES     = "OmniLauncher_Saves";
const OL_MAX_DEPTH = 6;
const OL_CFG_FILE  = "config.json";

const OL_BLACKLIST = [
  ".git", ".github", "node_modules", ".DS_Store", "__MACOSX",
  "Thumbs.db", "dist", "build", ".cache", "_omni_run.html"
];

const OL_ENTRIES = [
  "index.html", "main.html", "app.html", "start.html", "home.html",
  "index.js",   "main.js",   "app.js",   "start.js",  "run.js"
];

const OL_IMG_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"];

const C = {
  bg0:      Color.dynamic(new Color("#f2f2f7"), new Color("#000000")),
  bg1:      Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  bg_proj:  Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  bg_warn:  Color.dynamic(new Color("#fff3cd"), new Color("#332b00")),
  text:     Color.dynamic(new Color("#000000"), new Color("#ffffff")),
  accent:   new Color("#007aff"),
  muted:    Color.dynamic(new Color("#8e8e93"), new Color("#98989d")),
  faint:    Color.dynamic(new Color("#c7c7cc"), new Color("#48484a")),
  red:      new Color("#ff3b30")
};

// ================================================================
// M01 - KERNEL
// ================================================================

class Kernel {
  constructor() {
    try {
      this.fm = FileManager.iCloud();
      this.fm.documentsDirectory();
    } catch(e) {
      this.fm = FileManager.local();
    }
    this.scriptableRoot = this.fm.documentsDirectory();
    this.root = this.fm.joinPath(this.scriptableRoot, OL_ROOT);
    this.savesRoot = this.fm.joinPath(this.scriptableRoot, OL_SAVES);
    this.ok = false;
  }

  boot() {
    try {
      if (!this.fm.fileExists(this.root)) {
        this.fm.createDirectory(this.root, true);
      }
      if (!this.fm.fileExists(this.savesRoot)) {
        this.fm.createDirectory(this.savesRoot, true);
      }
      this.ok = true;
    } catch (e) {
      this.ok = false;
    }
    return this.ok;
  }

  projects() {
    if (!this.ok) return [];
    try {
      return this.fm.listContents(this.root)
        .filter(n => this.fm.isDirectory(this.fm.joinPath(this.root, n)))
        .sort();
    } catch (e) {
      return [];
    }
  }
}

// ================================================================
// M02 - DATABASE & JOURNAL MANAGER
// ================================================================

class DatabaseManager {
  constructor(fm, savesRoot) {
    this.fm = fm;
    this.savesRoot = savesRoot;
  }

  savePath(projName) { 
    return this.fm.joinPath(this.savesRoot, projName); 
  }
  
  ensureSaveDir(projName) {
    const p = this.savePath(projName);
    if (!this.fm.fileExists(p)) {
      this.fm.createDirectory(p, true);
    }
    return p;
  }

  logJournal(projName, message) {
    const dir = this.ensureSaveDir(projName);
    const jPath = this.fm.joinPath(dir, "journal.log");
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${timestamp}] ${message}`;
    
    if (!this.fm.fileExists(jPath)) {
      this.fm.writeString(jPath, logLine + "\n");
    } else {
      let current = this.fm.readString(jPath) || "";
      let lines = current.split('\n').filter(l => l.trim() !== '');
      if (lines.length > 200) {
        lines = lines.slice(lines.length - 200);
      }
      lines.push(logLine);
      this.fm.writeString(jPath, lines.join('\n') + '\n');
    }
  }

  readJournal(projName) {
    const jPath = this.fm.joinPath(this.ensureSaveDir(projName), "journal.log");
    if (this.fm.fileExists(jPath)) {
      return this.fm.readString(jPath);
    }
    return "Nessun log disponibile.";
  }

  clearJournal(projName) {
    const jPath = this.fm.joinPath(this.ensureSaveDir(projName), "journal.log");
    if (this.fm.fileExists(jPath)) {
      this.fm.remove(jPath);
    }
  }

  readDB(projName, slot = "auto.json") {
    const file = this.fm.joinPath(this.ensureSaveDir(projName), slot);
    if (!this.fm.fileExists(file)) return "{}";
    try {
      if (this.fm.isFileDownloaded && !this.fm.isFileDownloaded(file)) {
        this.fm.downloadFileFromiCloud(file);
      }
      return this.fm.readString(file) || "{}";
    } catch(e) { 
      this.logJournal(projName, "ERRORE LETTURA DB: " + e.message);
      return "{}"; 
    }
  }

  writeDB(projName, data, slot = "auto.json") {
    const file = this.fm.joinPath(this.ensureSaveDir(projName), slot);
    this.fm.writeString(file, data);
    this.logJournal(projName, `DB Salvato (Slot: ${slot}, Size: ${data.length} bytes)`);
  }

  listSlots(projName) {
    try { 
      return this.fm.listContents(this.ensureSaveDir(projName))
        .filter(f => f.endsWith(".json"))
        .sort(); 
    } catch(e) { 
      return []; 
    }
  }
}

// ================================================================
// M02.5 - STORAGE MANAGER
// ================================================================

class StorageManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.fm     = kernel.fm;
    this.root   = kernel.root;
    this.db     = new DatabaseManager(this.fm, kernel.savesRoot);
  }

  path(name) { 
    return this.fm.joinPath(this.root, name); 
  }
  
  ensure(name) {
    const p = this.path(name);
    if (!this.fm.fileExists(p)) {
      this.fm.createDirectory(p, true);
    }
    return p;
  }
  
  remove(name) {
    const p = this.path(name);
    const s = this.db.savePath(name);
    if (this.fm.fileExists(p)) this.fm.remove(p);
    if (this.fm.fileExists(s)) this.fm.remove(s);
    return true;
  }

  dirSize(path, depth) {
    if (depth > OL_MAX_DEPTH) return 0;
    let total = 0;
    try {
      for (const item of this.fm.listContents(path)) {
        const p = this.fm.joinPath(path, item);
        try { 
          total += this.fm.isDirectory(p) ? this.dirSize(p, depth + 1) : (this.fm.fileSize(p) || 0); 
        } catch (e) {}
      }
    } catch (e) {}
    return total;
  }

  fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }

  scanFiles(base, current, depth, filterFn) {
    const out = [];
    if (depth > 4) return out;
    let items = [];
    try { 
      items = this.fm.listContents(current); 
    } catch (e) { 
      return out; 
    }

    for (const item of items) {
      if (OL_BLACKLIST.includes(item)) continue;
      if (item.startsWith(".")) continue;
      const full = this.fm.joinPath(current, item);
      const rel  = full.replace(base + "/", "");
      try {
        if (this.fm.isDirectory(full)) {
          out.push(...this.scanFiles(base, full, depth + 1, filterFn));
        } else if (!filterFn || filterFn(item)) {
          out.push(rel);
        }
      } catch (e) {}
    }
    return out;
  }
}

// ================================================================
// M03 - IMPORTER
// ================================================================

class Importer {
  constructor(storage, meta) {
    this.st = storage;
    this.fm = storage.fm;
    this.meta = meta;
  }

  async fromLocal() {
    let picked;
    try { 
      picked = await DocumentPicker.open(); 
    } catch (e) { 
      return null; 
    }
    
    if (!picked || picked.length === 0) return null;
    
    const srcPath = picked[0];
    const rawName = srcPath.split("/").pop().replace(/\.zip$/i, "");
    const name = this._sanitize(rawName);
    
    if (srcPath.toLowerCase().endsWith(".zip")) {
      return this._stageZip(srcPath, name);
    } else {
      return this._copySingle(srcPath, name);
    }
  }

  _copySingle(srcPath, name) {
    const destDir  = this.st.ensure(name);
    const fileName = srcPath.split("/").pop();
    const destFile = this.fm.joinPath(destDir, fileName);
    try {
      if (this.fm.fileExists(destFile)) {
        this.fm.remove(destFile);
      }
      this.fm.copy(srcPath, destFile);
      return name;
    } catch (e) { 
      return null; 
    }
  }

  async _stageZip(srcPath, name) {
    const destDir = this.st.ensure(name);
    const destZip = this.fm.joinPath(destDir, name + ".zip");
    try {
      if (this.fm.fileExists(destZip)) {
        this.fm.remove(destZip);
      }
      this.fm.copy(srcPath, destZip);
      
      const a = new Alert();
      a.title = "📦 ZIP Importato";
      a.message = "Estrai il file ZIP nell'app File prima di configurare l'app.";
      a.addAction("Apri app File");
      a.addCancelAction("Dopo");
      
      if (await a.present() === 0) {
        Safari.open("shareddocuments://");
      }
      return name;
    } catch (e) { 
      return null; 
    }
  }

  async fromURL(rawURL, forceName = null) {
    if (!rawURL || !rawURL.trim()) return null;
    const url = rawURL.trim();
    const resolved = this._resolveGitURL(url);
    const name = forceName || this._sanitize(url.replace(/\.git$/, "").split("/").filter(Boolean).pop() || "project");

    try {
      const req = new Request(resolved); 
      req.timeoutInterval = 90;
      const data = await req.load();
      if (!data) throw new Error("Risposta vuota dal server.");
      
      const destDir = this.st.ensure(name);
      const destZip = this.fm.joinPath(destDir, name + ".zip");
      if (this.fm.fileExists(destZip)) {
        this.fm.remove(destZip);
      }
      this.fm.write(destZip, data);
      
      if (this.meta) {
        this.meta.update(destDir, { sourceUrl: url });
      }
      this.st.db.logJournal(name, `Download/Pull da Git completato.`);

      const a2 = new Alert();
      a2.title = forceName ? "🔄 Aggiornamento Completato" : "✅ Download Completato";
      a2.message = "ZIP scaricato con successo. Apri l'app File per estrarre i contenuti sovrascrivendo i vecchi file.";
      a2.addAction("Apri app File");
      a2.addCancelAction("Chiudi");
      
      if (await a2.present() === 0) {
        Safari.open("shareddocuments://");
      }
      return name;
    } catch (e) {
      const ae = new Alert();
      ae.title = "❌ Errore Download";
      ae.message = e.message;
      ae.addAction("OK");
      await ae.present();
      return null;
    }
  }

  _resolveGitURL(url) {
    const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
    if (url.includes("github.com") && !url.includes("/archive/") && !url.includes("/releases/")) {
      return clean + "/archive/refs/heads/main.zip";
    }
    return url;
  }

  _sanitize(raw) { 
    return (raw || "app").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").substring(0, 40) || "app"; 
  }
}

// ================================================================
// M04 - SELECTOR
// ================================================================

class Selector {
  constructor(storage) { 
    this.st = storage; 
  }

  async promptEntry(name, projectPath) {
    const files = this.st.scanFiles(projectPath, projectPath, 0, f => f.toLowerCase().endsWith(".html") || f.toLowerCase().endsWith(".js"));
    
    if (files.length === 0) {
      const a = new Alert();
      a.title = "⚠️ Nessun File";
      a.message = "Non trovo file validi. Sicuro di aver estratto lo ZIP?";
      a.addAction("Apri app File");
      a.addCancelAction("Annulla");
      if (await a.present() === 0) {
        Safari.open("shareddocuments://");
      }
      return null;
    }

    const sorted = files.sort((a, b) => {
      const aBase = a.split("/").pop().toLowerCase();
      const bBase = b.split("/").pop().toLowerCase();
      const aScore = OL_ENTRIES.includes(aBase) ? 0 : 1;
      const bScore = OL_ENTRIES.includes(bBase) ? 0 : 1;
      return aScore !== bScore ? aScore - bScore : a.localeCompare(b);
    });

    const a = new Alert();
    a.title = "Seleziona File Principale";
    for (const f of sorted.slice(0, 12)) {
      a.addAction(f);
    }
    a.addCancelAction("Annulla");
    const idx = await a.present();
    return idx === -1 ? null : sorted[idx];
  }

  async promptName(currentName) {
    const a = new Alert();
    a.title = "Nome Visualizzato";
    a.addTextField("Nome", currentName || "");
    a.addAction("Salva");
    a.addCancelAction("Annulla");
    if (await a.present() === -1) return null;
    return a.textFieldValue(0).trim();
  }

  async promptIcon(name, projectPath) {
    const images = this.st.scanFiles(projectPath, projectPath, 0, f => OL_IMG_EXT.some(e => f.toLowerCase().endsWith(e)));
    
    if (images.length === 0) { 
      let a = new Alert(); 
      a.title = "Nessuna Immagine"; 
      a.addAction("OK"); 
      await a.present(); 
      return null; 
    }
    
    const a = new Alert();
    a.title = "Scegli Icona";
    a.addAction("❌ Rimuovi Icona");
    const shown = images.slice(0, 9);
    for (const img of shown) {
      a.addAction(img.split("/").pop());
    }
    a.addCancelAction("Annulla");
    
    const idx = await a.present();
    if (idx === -1) return undefined;
    if (idx === 0) return null;
    return shown[idx - 1];
  }

  async promptDisplayMode() {
    const a = new Alert();
    a.title = "Impostazioni Schermo";
    a.addAction("📱 Schermo Intero (Fullscreen)");
    a.addAction("🪟 Finestra a comparsa (Sheet)");
    a.addCancelAction("Annulla");
    const idx = await a.present();
    return idx === -1 ? null : (idx === 0 ? "fullscreen" : "sheet");
  }

  async promptAutoFit() {
    const a = new Alert();
    a.title = "🛡️ Smart Boundaries";
    a.message = "Applica padding sicuro per non far sovrapporre l'app alle aree di sistema (Notch).";
    a.addAction("✅ Attivo (Consigliato)");
    a.addAction("❌ Disattivato");
    a.addCancelAction("Annulla");
    const idx = await a.present();
    return idx === -1 ? null : (idx === 0);
  }

  async promptUIDaemon() {
    const a = new Alert();
    a.title = "🎩 UI Daemon (Fix Menu iOS)";
    a.message = "Inietta direttive CSS per correggere menu a scomparsa, dropdown (<select>) e box di testo che si rompono in WebKit/Safari.";
    a.addAction("✅ Abilitato (Consigliato)");
    a.addAction("❌ Disabilitato");
    a.addCancelAction("Annulla");
    const idx = await a.present();
    return idx === -1 ? null : (idx === 0);
  }

  async promptOmniUI() {
    const a = new Alert();
    a.title = "⚙️ Menu Galleggiante (OmniUI)";
    a.message = "Inietta il pulsante trasparente per ricaricare l'app o forzare i salvataggi DB.";
    a.addAction("✅ Abilitato (Consigliato)");
    a.addAction("❌ Disabilitato");
    a.addCancelAction("Annulla");
    const idx = await a.present();
    return idx === -1 ? null : (idx === 0);
  }

  detectType(entry) { 
    return entry.toLowerCase().endsWith(".html") ? "webApp" : "nativeJS"; 
  }
}

// ================================================================
// M05 - METADATA MANAGER
// ================================================================

class MetadataManager {
  constructor(storage) {
    this.st = storage;
    this.fm = storage.fm;
  }

  _cfgPath(p) { 
    return this.fm.joinPath(p, OL_CFG_FILE); 
  }

  load(p) {
    const path = this._cfgPath(p);
    if (!this.fm.fileExists(path)) return {};
    try {
      if (this.fm.isFileDownloaded && !this.fm.isFileDownloaded(path)) {
        this.fm.downloadFileFromiCloud(path);
      }
      return JSON.parse(this.fm.readString(path) || "{}");
    } catch (e) { 
      return {}; 
    }
  }

  save(p, data) { 
    try { 
      this.fm.writeString(this._cfgPath(p), JSON.stringify(data, null, 2)); 
      return true; 
    } catch (e) { 
      return false; 
    } 
  }

  update(p, patch) { 
    return this.save(p, Object.assign({}, this.load(p), patch)); 
  }
}

// ================================================================
// M06 - ENGINE INJECTIONS (Il Nucleo Finale)
// ================================================================

// 1. SMART BOUNDARIES
const SMART_BOUNDARIES = `
<style id="ol-smart-bounds">
  body {
    padding-top: env(safe-area-inset-top, 0px) !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    padding-left: env(safe-area-inset-left, 0px) !important;
    padding-right: env(safe-area-inset-right, 0px) !important;
  }
</style>
`;

// 2. UI DAEMON (Fix Menu a Scomparsa e Zoom iOS)
const UI_DAEMON_INJECT = `
<style id="ol-ui-daemon">
  /* Previene lo zoom automatico di iOS all'apertura dei campi */
  input, textarea, select {
    font-size: 16px !important;
  }
  /* Ripristina la normalità per i dropdown */
  select {
    -webkit-appearance: none;
    background-color: #fff;
    color: #000;
    padding: 4px 8px;
  }
  /* Permette scroll fluido sui popup */
  html, body {
    -webkit-overflow-scrolling: touch;
  }
</style>
`;

// 3. OMNI UI (Pass-through Assoluto con pointer-events)
const OMNI_UI_SCRIPT = `
<script id="ol-omni-ui-init">
(function() {
  function buildUI() {
    if (document.getElementById('ol-omni-wrapper')) return;
    
    var wrapper = document.createElement('div');
    wrapper.id = 'ol-omni-wrapper';
    
    wrapper.innerHTML = \`
      <style>
        #ol-omni-wrapper { 
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; 
          pointer-events: none; z-index: 2147483647; font-family: sans-serif; 
        }
        #ol-omni-fab { 
          position: absolute; top: max(env(safe-area-inset-top, 15px), 15px); right: 15px; 
          width: 44px; height: 44px; background: #007aff; color: white; border-radius: 22px; 
          text-align: center; line-height: 44px; font-size: 22px; opacity: 0.3; transition: 0.2s; 
          pointer-events: auto; cursor: pointer; user-select: none; -webkit-user-select: none; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        #ol-omni-fab:active { opacity: 1; transform: scale(0.9); }
        #ol-omni-modal { 
          display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
          background: rgba(0,0,0,0.85); align-items: center; justify-content: center; 
          backdrop-filter: blur(5px); pointer-events: auto; 
        }
        #ol-omni-modal-content { 
          background: #1c1c1e; padding: 20px; border-radius: 14px; width: 280px; 
          max-height: 80vh; overflow-y: auto; color: white; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); 
        }
        .ol-btn { 
          display: block; width: 100%; padding: 12px; margin-bottom: 10px; background: #2c2c2e; 
          color: #0a84ff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; 
        }
        .ol-btn.close { background: #ff453a; color: white; margin-bottom: 0; }
      </style>
      
      <div id="ol-omni-fab">⚙️</div>
      <div id="ol-omni-modal">
        <div id="ol-omni-modal-content">
          <h3 style="margin-top:0; color: white;">OmniUI</h3>
          <button class="ol-btn" id="ol-btn-save">💾 Forza Salvataggio DB</button>
          <button class="ol-btn" id="ol-btn-reload">🔄 Riavvia App</button>
          <button class="ol-btn close" id="ol-btn-close">Chiudi Menu</button>
        </div>
      </div>
    \`;
    
    if (document.documentElement) {
      document.documentElement.appendChild(wrapper);
    }

    var fab = document.getElementById('ol-omni-fab');
    var modal = document.getElementById('ol-omni-modal');

    fab.addEventListener('click', function(e) {
      modal.style.display = 'flex';
      fab.style.opacity = '1';
    });
    
    document.getElementById('ol-btn-save').addEventListener('click', function() { 
      window.__OL_MANUAL_SAVE = true; 
      modal.style.display = 'none'; 
      fab.style.opacity = '0.3';
      fab.innerText = "✅"; 
      setTimeout(function(){ fab.innerText = "⚙️"; }, 1000); 
    });
    
    document.getElementById('ol-btn-reload').addEventListener('click', function() { 
      location.reload(); 
    });
    
    document.getElementById('ol-btn-close').addEventListener('click', function() { 
      modal.style.display = 'none'; 
      fab.style.opacity = '0.3';
    });
  }

  if(document.documentElement) {
    buildUI();
  } else {
    window.addEventListener('DOMContentLoaded', buildUI);
  }
  
  // Ripristino silenzioso se il gioco pulisce il DOM
  setInterval(function() {
    if(!document.getElementById('ol-omni-wrapper') && document.documentElement) {
      buildUI();
    }
  }, 2000);
})();
</script>
`;

// 4. DATABASE POLYFILL (Ignora Symbol e funzioni)
function getDBPolyfill(dataString) {
  return `
  <script>
    (function(){
      var realData = ${dataString || "{}"};
      var mockDB = {
        _data: realData,
        _dirty: false,
        _logs: [],
        getItem: function(k){ return this._data.hasOwnProperty(k) ? String(this._data[k]) : null; },
        setItem: function(k,v){ this._data[k] = String(v); this._dirty = true; },
        removeItem: function(k){ delete this._data[k]; this._dirty = true; },
        clear: function(){ this._data = {}; this._dirty = true; }
      };
      
      var proxy = new Proxy(mockDB, {
        get: function(target, prop) {
          if (typeof prop === 'symbol') return undefined; 
          if (prop === 'length') return Object.keys(target._data).length;
          if (typeof target[prop] === 'function') return target[prop].bind(target);
          if (prop in target) return target[prop];
          return target._data.hasOwnProperty(prop) ? target._data[prop] : null;
        },
        set: function(target, prop, value) {
          if (typeof prop === 'symbol') return true;
          if (prop in target) { target[prop] = value; }
          else { target._data[prop] = String(value); target._dirty = true; }
          return true;
        }
      });
      
      try { Object.defineProperty(window, 'localStorage', { value: proxy, configurable: true }); } catch(e){}
      try { Object.defineProperty(window, 'sessionStorage', { value: proxy, configurable: true }); } catch(e){}
      
      window.addEventListener('error', function(e){ mockDB._logs.push("ERR: " + e.message); });
      window.addEventListener('unhandledrejection', function(e){ mockDB._logs.push("PROMISE: " + String(e.reason)); });
      
      window.__OL_SYNC = function() {
        var payload = { save: null, logs: mockDB._logs };
        if (mockDB._dirty || window.__OL_MANUAL_SAVE) { 
          payload.save = JSON.stringify(mockDB._data); 
          mockDB._dirty = false; 
          window.__OL_MANUAL_SAVE = false; 
        }
        mockDB._logs = [];
        return JSON.stringify(payload);
      };
    })();
  </script>`;
}

// Funzione di Iniezione sicura nel <head> (Senza toccare il body originale)
function injectHead(originalHtml, headContent) {
    let html = originalHtml;
    if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/(<head[^>]*>)/i, function(m) { return m + "\n" + headContent; });
    } else if (/<html[^>]*>/i.test(html)) {
        html = html.replace(/(<html[^>]*>)/i, function(m) { return m + "\n<head>\n" + headContent + "\n</head>"; });
    } else {
        html = "<head>\n" + headContent + "\n</head>\n" + html;
    }
    return html;
}

class Runner {
  constructor(storage, meta) { 
    this.st = storage; 
    this.meta = meta; 
    this.fm = storage.fm; 
  }

  async launch(name) {
    const pPath = this.st.path(name);
    const cfg = this.meta.load(pPath);
    
    if (!cfg.entryPoint || !cfg.type) { 
      let a = new Alert(); 
      a.title = "⚙️ Setup Richiesto"; 
      a.addAction("OK"); 
      await a.present(); 
      return; 
    }
    
    const entryAbs = this.fm.joinPath(pPath, cfg.entryPoint);
    if (!this.fm.fileExists(entryAbs)) { 
      let a = new Alert(); 
      a.title = "❌ File Mancante"; 
      a.addAction("OK"); 
      await a.present(); 
      return; 
    }

    this.st.db.logJournal(name, ">>> Avvio Sessione");
    
    if (cfg.type === "webApp") {
      await this._runWebApp(name, pPath, entryAbs, cfg);
    } else if (cfg.type === "nativeJS") {
      await this._runNative(name, entryAbs);
    }
  }

  async _runWebApp(name, pPath, entryAbs, cfg) {
    let html = "";
    try {
      if (this.fm.isFileDownloaded && !this.fm.isFileDownloaded(entryAbs)) {
        await this.fm.downloadFileFromiCloud(entryAbs);
      }
      html = this.fm.readString(entryAbs);
    } catch (e) { 
      this.st.db.logJournal(name, "HTML Lettura Errore: " + e.message); 
      return; 
    }

    const savedData = this.st.db.readDB(name, "auto.json");
    
    let headInject = getDBPolyfill(savedData);
    
    if (cfg.autoFit !== false) {
      headInject += SMART_BOUNDARIES;
    }
    
    if (cfg.uiDaemon !== false) {
      headInject += UI_DAEMON_INJECT;
    }
    
    if (cfg.omniUI !== false) {
      headInject += OMNI_UI_SCRIPT;
    }
    
    html = injectHead(html, headInject);

    const sandboxFile = this.fm.joinPath(pPath, "_omni_run.html");
    this.fm.writeString(sandboxFile, html);

    const wv = new WebView();
    await wv.loadURL("file://" + sandboxFile);
    
    let polling = true;
    const pollLoop = async () => {
      while (polling) {
        await new Promise(r => Timer.schedule(1500, false, r));
        if (!polling) break;
        try {
          const out = await wv.evaluateJavaScript("window.__OL_SYNC && window.__OL_SYNC()");
          if (out && out !== "null") {
              const payload = JSON.parse(out);
              if (payload.save) {
                this.st.db.writeDB(name, payload.save, "auto.json");
              }
              if (payload.logs && payload.logs.length > 0) {
                payload.logs.forEach(l => this.st.db.logJournal(name, l));
              }
          }
        } catch(e) { 
          polling = false; 
        }
      }
    };
    pollLoop();
    
    await wv.present(cfg.displayMode !== "sheet");
    polling = false; 
    this.st.db.logJournal(name, "<<< Sessione Chiusa");
  }

  async _runNative(name, entryAbs) {
    try {
      if (this.fm.isFileDownloaded && !this.fm.isFileDownloaded(entryAbs)) {
        await this.fm.downloadFileFromiCloud(entryAbs);
      }
      const code = this.fm.readString(entryAbs);
      
      globalThis.Omni = {
          DB: {
              read: (slot) => JSON.parse(this.st.db.readDB(name, slot)),
              write: (data, slot) => this.st.db.writeDB(name, JSON.stringify(data), slot)
          },
          Journal: {
              log: (msg) => this.st.db.logJournal(name, msg)
          },
          projectDir: this.st.path(name)
      };

      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(code);
      await fn();
      
    } catch (e) {
      this.st.db.logJournal(name, "Fatal Native Error: " + e.message);
      const a = new Alert(); 
      a.title = "❌ Errore JS"; 
      a.message = e.message; 
      a.addAction("OK"); 
      await a.present();
    }
  }

  async exportStandalone(name) {
    const pPath = this.st.path(name);
    const cfg = this.meta.load(pPath);
    const dName = cfg.displayName || name;
    
    const scriptName = dName.replace(/[\/\\?%*:|"<> ]/g, '_').trim();
    
    // Escaping pulito per i template literal nel codice esportato
    const escBoundaries = SMART_BOUNDARIES.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const escDaemon     = UI_DAEMON_INJECT.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const escOmniUI     = OMNI_UI_SCRIPT.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const escPolyfill   = getDBPolyfill("").replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const launcherCode = `// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: rocket;
// Launcher Autogenerato: ${dName}
const ROOT = "${OL_ROOT}";
const SAVES = "${OL_SAVES}";
const PROJ = "${name}";

const fm = FileManager.local();
let docDir = fm.documentsDirectory();
let useICloud = false;

try {
  FileManager.iCloud().documentsDirectory();
  docDir = FileManager.iCloud().documentsDirectory();
  useICloud = true;
} catch(e) {}

const myFm = useICloud ? FileManager.iCloud() : FileManager.local();
const pPath = myFm.joinPath(docDir, ROOT + "/" + PROJ);
const saveDir = myFm.joinPath(docDir, SAVES + "/" + PROJ);
const cfgFile = myFm.joinPath(pPath, "${OL_CFG_FILE}");

if (!myFm.fileExists(saveDir)) {
  myFm.createDirectory(saveDir, true);
}

function writeJ(m) {
  const jp = myFm.joinPath(saveDir, "journal.log");
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const l = "\\n["+ts+"] STANDALONE: " + m;
  if(!myFm.fileExists(jp)) {
    myFm.writeString(jp, l);
  } else {
    let current = myFm.readString(jp) || "";
    let lines = current.split('\\n').filter(x => x.trim() !== '');
    if(lines.length > 200) lines = lines.slice(lines.length - 200);
    lines.push(l);
    myFm.writeString(jp, lines.join('\\n') + '\\n');
  }
}

function injectHead(originalHtml, headContent) {
    let html = originalHtml;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, function(m) { return m + "\\n" + headContent; });
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/(<html[^>]*>)/i, function(m) { return m + "\\n<head>\\n" + headContent + "\\n</head>"; });
    } else {
      html = "<head>\\n" + headContent + "\\n</head>\\n" + html;
    }
    return html;
}

if (!myFm.fileExists(cfgFile)) {
  let a = new Alert(); 
  a.title = "Errore"; 
  a.message = "File di configurazione non trovato.";
  a.addAction("OK"); 
  a.present();
} else {
  if (myFm.isFileDownloaded && !myFm.isFileDownloaded(cfgFile)) {
    myFm.downloadFileFromiCloud(cfgFile);
  }
  const cfg = JSON.parse(myFm.readString(cfgFile));
  const entryAbs = myFm.joinPath(pPath, cfg.entryPoint);
  writeJ("Avvio Standalone");
  
  if (cfg.type === "webApp") {
    if (myFm.isFileDownloaded && !myFm.isFileDownloaded(entryAbs)) {
      myFm.downloadFileFromiCloud(entryAbs);
    }
    let html = myFm.readString(entryAbs);
    
    let savedData = "{}"; 
    const autoPath = myFm.joinPath(saveDir, "auto.json");
    if(myFm.fileExists(autoPath)) { 
      if(myFm.isFileDownloaded && !myFm.isFileDownloaded(autoPath)) {
        myFm.downloadFileFromiCloud(autoPath);
      }
      savedData = myFm.readString(autoPath) || "{}"; 
    }
    
    let headInj = \`${escPolyfill}\`.replace(/var realData = {};/, "var realData = " + savedData + ";");
    if (cfg.autoFit !== false) headInj += \`${escBoundaries}\`;
    if (cfg.uiDaemon !== false) headInj += \`${escDaemon}\`;
    if (cfg.omniUI !== false) headInj += \`${escOmniUI}\`;
    
    html = injectHead(html, headInj);
    
    const sandboxFile = myFm.joinPath(pPath, "_omni_run.html");
    myFm.writeString(sandboxFile, html);
    
    let wv = new WebView(); 
    wv.loadURL("file://" + sandboxFile);
    
    let polling = true;
    const pollLoop = async () => {
      while (polling) {
        await new Promise(r => Timer.schedule(1500, false, r)); 
        if (!polling) break;
        try {
          const out = await wv.evaluateJavaScript("window.__OL_SYNC && window.__OL_SYNC()");
          if (out && out !== "null") {
             const payload = JSON.parse(out);
             if (payload.save) myFm.writeString(autoPath, payload.save);
             if (payload.logs && payload.logs.length > 0) payload.logs.forEach(l => writeJ(l));
          }
        } catch(e) { polling = false; }
      }
    };
    pollLoop();
    
    wv.present(cfg.displayMode !== "sheet").then(() => { 
      polling = false; 
      writeJ("Chiusura Standalone"); 
    });
  } else {
    if (myFm.isFileDownloaded && !myFm.isFileDownloaded(entryAbs)) {
      myFm.downloadFileFromiCloud(entryAbs);
    }
    const code = myFm.readString(entryAbs);
    globalThis.Omni = {
        DB: { 
          read: (s) => JSON.parse(myFm.readString(myFm.joinPath(saveDir, s)) || "{}"), 
          write: (d, s) => myFm.writeString(myFm.joinPath(saveDir, s), JSON.stringify(d)) 
        },
        Journal: { log: writeJ }, 
        projectDir: pPath
    };
    
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(code);
    try { 
      await fn(); 
    } catch(e) { 
      Omni.Journal.log("CRASH: " + e.message); 
      console.error(e); 
    }
  }
}
`;

    const scriptPath = this.st.kernel.fm.joinPath(this.st.kernel.scriptableRoot, scriptName + ".js");
    this.st.kernel.fm.writeString(scriptPath, launcherCode);

    const a = new Alert(); 
    a.title = "📲 Script Generato!"; 
    a.message = `Lo script "${scriptName}" è pronto ed è perfettamente sincronizzato.\n\nAggiungilo alla Home usando Comandi Rapidi!`;
    a.addAction("OK"); 
    await a.present();
  }
}

// ================================================================
// M08 - GUI RENDERER
// ================================================================

class GUI {
  constructor(deps) {
    this.kernel = deps.kernel; 
    this.st = deps.storage; 
    this.imp = deps.importer;
    this.sel = deps.selector; 
    this.meta = deps.meta; 
    this.run = deps.runner;
    this.fm = deps.storage.fm; 
    this.tbl = new UITable(); 
    this.tbl.showSeparators = true; 
    this.isPresented = false;
  }

  async render() {
    this.tbl.removeAllRows(); 
    this._header();
    
    const projs = this.kernel.projects();
    if (projs.length === 0) {
      this._emptyState();
    } else {
      for (const name of projs) {
        this._projectRow(name);
      }
    }
    
    this._actionBar(); 
    this._statusBar(projs.length);
    
    if (!this.isPresented) { 
      this.isPresented = true; 
      await this.tbl.present(true); 
    } else {
      this.tbl.reload();
    }
  }

  _header() {
    const row = new UITableRow(); 
    row.height = 60; 
    row.backgroundColor = C.bg0;
    const title = row.addText("🚀 OmniLauncher", "The Absolute Framework");
    title.titleColor = C.accent; 
    title.subtitleColor = C.muted; 
    title.titleFont = Font.boldSystemFont(22); 
    title.subtitleFont = Font.systemFont(12);
    this.tbl.addRow(row);
  }

  _projectRow(name) {
    const pPath = this.st.path(name); 
    const cfg = this.meta.load(pPath); 
    const configured = !!(cfg.entryPoint && cfg.type);
    const dName = cfg.displayName || name;
    
    const row = new UITableRow(); 
    row.height = 70; 
    row.backgroundColor = configured ? C.bg_proj : C.bg_warn;
    
    let iconLoaded = false;
    if (cfg.icon) {
      const iconPath = this.fm.joinPath(pPath, cfg.icon);
      if (this.fm.fileExists(iconPath)) {
        try {
          if (this.fm.isFileDownloaded && !this.fm.isFileDownloaded(iconPath)) {
            this.fm.downloadFileFromiCloud(iconPath);
          }
          const img = this.fm.readImage(iconPath);
          if (img) { 
            const ic = row.addImage(img); 
            ic.widthWeight = 15; 
            ic.centerAligned(); 
            iconLoaded = true; 
          }
        } catch (e) {}
      }
    }
    if (!iconLoaded) {
      const badge = row.addText(cfg.type === "webApp" ? "🌐" : cfg.type === "nativeJS" ? "⚡️" : "📁");
      badge.widthWeight = 15; 
      badge.titleFont = Font.systemFont(24); 
      badge.centerAligned();
    }
    
    const sizeStr = this.st.fmtSize(this.st.dirSize(pPath, 0));
    const entry = cfg.entryPoint ? cfg.entryPoint.split("/").pop() : "Da configurare";
    
    const info = row.addText(dName, entry + " • " + sizeStr);
    info.widthWeight = 45; 
    info.titleColor = C.text; 
    info.subtitleColor = C.muted; 
    info.titleFont = Font.semiboldSystemFont(16); 
    info.subtitleFont = Font.systemFont(12); 
    info.leftAligned();
    
    const runBtn = row.addButton("▶️"); 
    runBtn.widthWeight = 15; 
    runBtn.centerAligned(); 
    runBtn.onTap = async () => {
      await this.run.launch(name);
      await this.render();
    };

    const cfgBtn = row.addButton("⚙️"); 
    cfgBtn.widthWeight = 13; 
    cfgBtn.centerAligned(); 
    cfgBtn.onTap = async () => {
      await this._settingsMenu(name);
      await this.render();
    };

    const delBtn = row.addButton("🗑️"); 
    delBtn.widthWeight = 12; 
    delBtn.centerAligned(); 
    delBtn.onTap = async () => {
      await this._delete(name);
      await this.render();
    };

    this.tbl.addRow(row);
  }

  _emptyState() {
    const row = new UITableRow(); 
    row.height = 120; 
    row.backgroundColor = C.bg1;
    const cell = row.addText("Nessun Progetto", "Importa una cartella o un file ZIP."); 
    cell.titleColor = C.muted; 
    cell.subtitleColor = C.faint; 
    cell.titleFont = Font.boldSystemFont(16); 
    cell.subtitleFont = Font.systemFont(12); 
    cell.centerAligned();
    this.tbl.addRow(row);
  }

  _actionBar() {
    const row = new UITableRow(); 
    row.height = 60; 
    row.backgroundColor = C.bg0;
    
    const localBtn = row.addButton("📂 Importa Locale"); 
    localBtn.widthWeight = 50; 
    localBtn.centerAligned(); 
    localBtn.onTap = async () => {
      const n = await this.imp.fromLocal();
      if(n) await this._quickSetup(n);
      await this.render();
    };

    const gitBtn = row.addButton("🌍 Scarica Web/Git"); 
    gitBtn.widthWeight = 50; 
    gitBtn.centerAligned(); 
    gitBtn.onTap = async () => {
      const url = await this._promptURL();
      if(url) {
        const n = await this.imp.fromURL(url);
        if(n) await this._quickSetup(n);
      }
      await this.render();
    };
    
    this.tbl.addRow(row);
  }

  _statusBar(count) {
    const row = new UITableRow(); 
    row.height = 30; 
    row.backgroundColor = C.bg0;
    const cell = row.addText(count + " progetti • OmniDB Active • v" + OL_VERSION); 
    cell.titleColor = C.faint; 
    cell.titleFont = Font.systemFont(10); 
    cell.centerAligned();
    this.tbl.addRow(row);
  }

  async _promptURL(defUrl = "") {
    const a = new Alert(); 
    a.title = "Download URL / Git"; 
    a.addTextField("https://...", defUrl); 
    a.addAction("Scarica"); 
    a.addCancelAction("Annulla");
    if (await a.present() === -1) return null; 
    return a.textFieldValue(0).trim() || null;
  }

  async _quickSetup(name) {
    const pPath = this.st.path(name); 
    const entry = await this.sel.promptEntry(name, pPath); 
    if (!entry) return;
    this.meta.update(pPath, { 
      name, 
      type: this.sel.detectType(entry), 
      entryPoint: entry, 
      displayMode: "fullscreen", 
      autoFit: true, 
      uiDaemon: true,
      omniUI: true 
    });
  }

  async _savesMenu(name) {
    while (true) {
        const saves = this.st.db.listSlots(name);
        const a = new Alert(); 
        a.title = "💾 OmniDB: " + name; 
        a.message = "Slot DB: " + saves.length;
        
        a.addAction("➕ Crea Backup (Da Auto a Slot)"); 
        a.addAction("🔄 Ripristina Backup"); 
        a.addDestructiveAction("🗑️ Elimina Slot"); 
        a.addCancelAction("Indietro");
        
        const choice = await a.present(); 
        if (choice === -1) break;
        
        if (choice === 0) {
            const prompt = new Alert(); 
            prompt.title = "Nome Slot DB"; 
            prompt.addTextField("es_prima_boss", ""); 
            prompt.addAction("Salva"); 
            prompt.addCancelAction("Annulla");
            if (await prompt.present() === 0) {
                let slotName = prompt.textFieldValue(0).trim().replace(/[^a-zA-Z0-9_-]/g, "_");
                if (slotName) { 
                  if (!slotName.endsWith(".json")) slotName += ".json"; 
                  this.st.db.writeDB(name, this.st.db.readDB(name, "auto.json"), slotName); 
                }
            }
        } else if (choice === 1 && saves.length > 0) {
            const r = new Alert(); 
            r.title = "Ripristina DB"; 
            saves.forEach(s => r.addAction(s)); 
            r.addCancelAction("Annulla");
            const sel = await r.present(); 
            if (sel !== -1) { 
                this.st.db.writeDB(name, this.st.db.readDB(name, saves[sel]), "auto.json"); 
                let ok = new Alert(); 
                ok.title = "Ripristinato!"; 
                ok.addAction("OK"); 
                await ok.present(); 
            }
        } else if (choice === 2 && saves.length > 0) {
            const del = new Alert(); 
            del.title = "Elimina Slot"; 
            saves.forEach(s => del.addDestructiveAction(s)); 
            del.addCancelAction("Annulla");
            const sel = await del.present(); 
            if (sel !== -1) { 
                const p = this.fm.joinPath(this.st.db.savePath(name), saves[sel]); 
                if (this.fm.fileExists(p)) this.fm.remove(p); 
            }
        }
    }
  }

  async _settingsMenu(name) {
    const pPath = this.st.path(name); 
    const cfg = this.meta.load(pPath); 
    const dName = cfg.displayName || name;
    
    const a = new Alert(); 
    a.title = "⚙️ Menu: " + dName;
    
    a.addAction("🎯 Cambia File Avvio"); 
    a.addAction("📝 Cambia Nome Display"); 
    a.addAction("🖼️ Scegli Icona");
    a.addAction("💾 Database (Gestione Slot)"); 
    a.addAction("📜 Log App (OmniJournal)");
    
    const isWeb = cfg.type === "webApp";
    if (isWeb) { 
        a.addAction("📱 Impostazioni Schermo"); 
        a.addAction("🛡️ Limiti Intelligenti (Auto-Fit)"); 
        a.addAction("🎩 Demone UI (Fix Dropdown iOS)"); 
        a.addAction("🕹️ Menu Galleggiante (OmniUI)"); 
    }
    
    a.addAction("🔄 Pull Git / URL"); 
    a.addAction("📲 Crea App Standalone"); 
    a.addCancelAction("Chiudi");
    
    const choice = await a.present();
    
    if (choice === 0) { 
        const entry = await this.sel.promptEntry(name, pPath); 
        if (entry) this.meta.update(pPath, { type: this.sel.detectType(entry), entryPoint: entry }); 
    } 
    else if (choice === 1) { 
        const newName = await this.sel.promptName(dName); 
        if (newName !== null) this.meta.update(pPath, { displayName: newName }); 
    } 
    else if (choice === 2) { 
        const newIcon = await this.sel.promptIcon(name, pPath); 
        if (newIcon !== undefined) this.meta.update(pPath, { icon: newIcon }); 
    } 
    else if (choice === 3) { 
        await this._savesMenu(name); 
    } 
    else if (choice === 4) { 
        const jA = new Alert(); 
        jA.title = "📜 Journal Log"; 
        jA.message = this.st.db.readJournal(name); 
        jA.addAction("OK"); 
        jA.addDestructiveAction("Pulisci Log"); 
        if (await jA.present() === 1) {
            this.st.db.clearJournal(name); 
        }
    }
    else if (isWeb && choice === 5) { 
        const mode = await this.sel.promptDisplayMode(); 
        if (mode !== null) this.meta.update(pPath, { displayMode: mode }); 
    } 
    else if (isWeb && choice === 6) { 
        const autoFit = await this.sel.promptAutoFit(); 
        if (autoFit !== null) this.meta.update(pPath, { autoFit: autoFit }); 
    } 
    else if (isWeb && choice === 7) { 
        const uiDaemon = await this.sel.promptUIDaemon(); 
        if (uiDaemon !== null) this.meta.update(pPath, { uiDaemon: uiDaemon }); 
    } 
    else if (isWeb && choice === 8) { 
        const omniUI = await this.sel.promptOmniUI(); 
        if (omniUI !== null) this.meta.update(pPath, { omniUI: omniUI }); 
    } 
    else if (choice === (isWeb ? 9 : 5)) {
        let urlToUpdate = cfg.sourceUrl;
        if (!urlToUpdate) {
            urlToUpdate = await this._promptURL();
        } else {
            const upAlert = new Alert(); 
            upAlert.title = "Pull Git"; 
            upAlert.message = "URL:\n" + urlToUpdate; 
            upAlert.addAction("Aggiorna"); 
            upAlert.addAction("Cambia URL"); 
            upAlert.addCancelAction("Annulla");
            const upChoice = await upAlert.present();
            if (upChoice !== -1) { 
                if (upChoice === 1) urlToUpdate = await this._promptURL(urlToUpdate); 
                if (urlToUpdate) await this.imp.fromURL(urlToUpdate, name); 
            }
        }
    } 
    else if (choice === (isWeb ? 10 : 6)) { 
        await this.run.exportStandalone(name); 
    }
  }

  async _delete(name) {
    const a = new Alert(); 
    a.title = "🗑️ Elimina Progetto"; 
    a.message = "Vuoi eliminare '" + name + "' e tutto il suo Database?\nAzione irreversibile."; 
    a.addDestructiveAction("Elimina"); 
    a.addCancelAction("Annulla");
    if (await a.present() === 0) {
      this.st.remove(name);
    }
  }
}

// ================================================================
// M09 - MAIN BOOT
// ================================================================

async function main() {
  const kernel = new Kernel();
  if (!kernel.boot()) { 
    let a = new Alert(); 
    a.title = "Errore Critico Accesso File"; 
    a.addAction("Esci"); 
    await a.present(); 
    Script.complete(); 
    return; 
  }

  const storage  = new StorageManager(kernel);
  const meta     = new MetadataManager(storage);
  const selector = new Selector(storage);
  const importer = new Importer(storage, meta);
  const runner   = new Runner(storage, meta);
  const gui      = new GUI({ kernel, storage, importer, selector, meta, runner });

  await gui.render();
}
await main();
