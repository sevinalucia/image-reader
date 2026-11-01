var config  = {
  "addon": {
    "homepage": function () {
      return chrome.runtime.getManifest().homepage_url || "https://www.mybrowseraddon.com/image-reader-ocr.html";
    }
  },
  "drop": {
    "over": function (e) {
      const fileio = document.querySelector(".fileio");
      /*
        a drop anywhere must never navigate the document away
      */
      e.preventDefault();
      /*  */
      fileio.classList.add("hover");
    },
    "leave": function (e) {
      const fileio = document.querySelector(".fileio");
      /* a crossing into a child also fires leave: only a real exit (no
         related target, or one outside the drop area) clears the ring */
      if (!e.relatedTarget || !fileio.contains(e.relatedTarget)) fileio.classList.remove("hover");
    },
    "pick": function (e) {
      const fileio = document.querySelector(".fileio");
      /* the drop area IS the file input, so the file payload arrives on
         every target - prevent the browser default open and read it;
         a text drop rides the surface UNDER the pointer, not the focus
         (the old activeElement read skipped an unfocused textarea and
         answered "That file is not an image." for plain text) */
      e.preventDefault();
      /*  */
      fileio.classList.remove("hover");
      /*  */
      const files = e.dataTransfer ? e.dataTransfer.files : null;
      const has = Boolean(files && files.length);
      /* the field branch takes the payload only when no files ride it:
         a file dropped on the textarea (or the whitelist) reports an
         empty text/plain and used to die right here - preventDefault
         had already swallowed the browser default, so nothing at all
         happened while the drop ring still promised acceptance */
      const field = has ? null : (e.target && e.target.closest ? e.target.closest("textarea, input[type='text']") : null);
      if (field) {
        const text = e.dataTransfer ? e.dataTransfer.getData("text/plain") : '';
        if (!text) return;
        if (field.tagName === "TEXTAREA") {
          /* the caret reads test for numbers, not truthiness: a
             selection at 0 (or select-all from 0) used to fall through
             to the end-of-value branch and append instead of replace */
          const start = typeof field.selectionStart === "number" ? field.selectionStart : field.value.length;
          const end = typeof field.selectionEnd === "number" ? field.selectionEnd : start;
          field.value = field.value.slice(0, start) + text + field.value.slice(end);
          field.selectionStart = field.selectionEnd = start + text.length;
          config.app.text.state();
        } else {
          field.value += text;
          /* the change rides so an immediate run reads the fresh
             whitelist (a value assignment alone fires no event) */
          field.dispatchEvent(new Event("change", {bubbles: true}));
        }
        return;
      }
      /*  */
      const file = has ? files[0] : null;
      /* non-image payloads answer politely; everything else funnels
         into engine.start - the single gate that explains the state */
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        config.app.update({"status": "That file is not an image."});
        return;
      }
      config.ocr.engine.start(window.lastFile = file);
    }
  },
  "resize": {
    "timeout": null,
    "method": function () {
      /* every surface re-clamps its panes while the frame moves: the
         explicit pair heights would otherwise overflow a shrunk window
         until the next storage push (a mid-drag resize skips the pass -
         the drag owns the panes until the pointer comes back up) */
      if (!document.documentElement.getAttribute("dragging")) config.app.resize.watch();
      if (config.port.name === "win") {
        if (config.resize.timeout) window.clearTimeout(config.resize.timeout);
        config.resize.timeout = window.setTimeout(async function () {
          const current = await chrome.windows.getCurrent();
          /*  */
          config.storage.write("interface.size", {
            "top": current.top,
            "left": current.left,
            "width": current.width,
            "height": current.height
          });
        }, 1000);
      }
    }
  },
  "port": {
    "name": '',
    "self": null,
    "connect": function () {
      config.port.name = "webapp";
      const context = document.documentElement.getAttribute("context");
      /*  */
      if (chrome.runtime) {
        if (chrome.runtime.connect) {
          if (context !== config.port.name) {
            if (document.location.search === "?tab") config.port.name = "tab";
            if (document.location.search === "?win") config.port.name = "win";
            if (document.location.search === "?popup") config.port.name = "popup";
            /*  */
            if (config.port.name === "popup") {
              document.documentElement.style.width = "780px";
              document.documentElement.style.height = "550px";
            }
            /*  */
            config.port.self = chrome.runtime.connect({"name": config.port.name});
            /* a popup-window surface carries no sender.tab, so the
               background never learns its window id - the surface hands
               it over on the port itself, else the toolbar spawns a new
               window on every click instead of focusing the open one */
            if (config.port.name === "win") chrome.windows.getCurrent(function (current) {
              config.port.self.postMessage({"handshake": "win", "id": current.id});
            });
          }
        }
      }
      /*  */
      document.documentElement.setAttribute("context", config.port.name);
    }
  },
  "option": {
    "value": function (id, fallback) {
      /* accuracy and language moved from selectedIndex to value storage;
         legacy numeric entries map through the live option list */
      const select = document.querySelector("#" + id);
      const stored = config.storage.read(id);
      const mapped = function (index) {
        return select && select.options[index] ? select.options[index].value : undefined;
      };
      /*  */
      if (stored === undefined) return mapped(fallback);
      if (typeof stored === "number") return mapped(stored) !== undefined ? mapped(stored) : mapped(fallback);
      /* a current-format string is honored when it names a live option -
         validation matters: a stale value (e.g. a dropped tier) would
         set selectedIndex = -1 and silently OCR with an empty path */
      if (typeof stored === "string" && select && [...select.options].some(function (o) {return o.value === stored;})) return stored;
      /* any other legacy type (booleans, objects) is stale data — fall
         back to the documented default instead of a bogus select value */
      return mapped(fallback) !== undefined ? mapped(fallback) : String(stored);
    }
  },
  "enum": {
    "value": function (id) {
      /* attribute-backed enums (engine, uimode, layout, sections, theme)
         carry no <select> to validate against - a hand-edited or legacy
         junk value would disable every html[layout='...'] rule and with
         it the divider grips, or the whole dark palette leg */
      const list = this.pick[id] || [];
      const stored = config.storage.read(id);
      return typeof stored === "string" && list.indexOf(stored) !== -1 ? stored : undefined;
    },
    "pick": {
      "engine": ["tesseract", "granite"],
      "uimode": ["classic", "modern"],
      "layout": ["rows", "columns"],
      "sections": ["two", "one", "html", "none"],
      "theme": ["auto", "dark", "light"]
    }
  },
  "settings": {
    "group": function (name, fallback) {
      /* radio-backed keys validate against their live group: a junk or
         stale stored value would leave every radio unchecked and
         silently disable the themed rules until the next toggle - the
         String coercion keeps a legacy numeric import presentable */
      const group = document.querySelectorAll("input[name='" + name + "']");
      const stored = config.storage.read(name);
      return Array.prototype.some.call(group, function (radio) {
        return radio.value === String(stored);
      }) ? String(stored) : fallback;
    },
    "sync": function () {
      const fonts = {
        "system": "system-ui, sans-serif",
        "sans": "sans-serif",
        "serif": "Georgia, serif",
        "mono": "monospace"
      };
      /* a legacy numeric import (or hand edit) reads as a number
         forever: the radio-backed keys normalize once to their string
         form, so no reader needs the String coercion - the rewrite
         re-enters sync through its own push and converges there */
      ["font", "fontsize", "theme", "layout", "uimode", "clipper"].forEach(function (name) {
        const stored = config.storage.read(name);
        if (typeof stored === "number") config.storage.write(name, String(stored));
      });
      /* select-backed keys need the same root heal: the import gate
         accepts a legacy numeric index, but only the select renderer
         maps it - the raw read("engine") sites would keep seeing a
         number three answers apart from the shown option - each pass
         maps the index through the live option list (or the exact
         value hit to its string form) and writes once, converging on
         the same push; flip-list keys mark the heal through the
         selfwrite flag so the flip-reload listener skips the writing
         surface (other surfaces still reload - their stored value did
         change) */
      ["engine", "backend", "core", "psm", "spacing", "language"].forEach(function (name) {
        const select = document.querySelector("#" + name);
        const stored = config.storage.read(name);
        if (!select || typeof stored !== "number") return;
        const exact = Array.prototype.some.call(select.options, function (option) {
          return option.value === String(stored);
        });
        const mapped = exact ? String(stored) : select.options[stored] ? select.options[stored].value : undefined;
        if (mapped === undefined) return;
        if (name === "engine" || name === "backend") config.ocr.engine.selfwrite = true;
        config.storage.write(name, mapped);
      });
      const root = document.documentElement;
      const engine = config.enum.value("engine") || "tesseract";
      const uimode = config.enum.value("uimode") || "classic";
      const layout = config.enum.value("layout") || "columns";
      const font = config.settings.group("font", "system");
      const fontsize = config.settings.group("fontsize", "13");
      /*  */
      root.setAttribute("engine", engine);
      root.setAttribute("uimode", uimode);
      root.setAttribute("layout", layout);
      /* the result-panes attribute drives the pane-hiding rules: the
         css gates on it, so every surface re-syncs on storage pushes */
      root.setAttribute("sections", config.enum.value("sections") || "two");
      /* the resolved theme attribute follows the settings row: auto maps
         to the OS preference, dark/light win over it */
      root.setAttribute("theme", config.app.theme.value());
      root.style.setProperty("--ff", fonts[font] || fonts.system);
      root.style.setProperty("--fs", fontsize + "px");
      /* the pane re-derivation rides every sync: the html view only
         arms while the frame is fed and the sections pick allows it -
         cross-surface pushes, import and reset re-gate the identical
         way (the run paths still set/remove attribute directly) */
      const frameref = document.querySelector("iframe");
      if (config.app.panes.render() && frameref.src === chrome.runtime.getURL("/data/interface/iframe/index.html")) {
        root.setAttribute("render", "on");
      } else {
        root.removeAttribute("render");
      }
    },
    "render": function () {
      const uimode = config.enum.value("uimode") || "classic";
      const layout = config.enum.value("layout") || "columns";
      const font = config.settings.group("font", "system");
      const fontsize = config.settings.group("fontsize", "13");
      /* the switch paints the stored stance: an unset key stays
         unchecked and the engine asks once at the first granite
         download - the old default-allowed paint disagreed with the
         ask-once behavior on a fresh install */
      const permission = config.storage.read("permission") === true;
      /* the engine parameters paint here too: the cross-surface storage
         chain calls sync + render only, so B's selects stay factual
         even mid-session (app.start runs on first paint exclusively) -
         enum selects validate through their live option list, the two
         tier selects keep their legacy index mapping */
      const pick = function (id, fallback) {
        const select = document.querySelector("#" + id);
        const stored = config.storage.read(id);
        /* the same two paths valid() accepts: an exact value hit, or a
           legacy numeric select index that maps through the live list */
        const index = Number(stored);
        if (select && [...select.options].some(function (o) {return o.value === String(stored);})) return String(stored);
        if (select && Number.isInteger(index) && select.options[index]) return select.options[index].value;
        return fallback;
      };
      const engine = pick("engine", "tesseract");
      const backend = pick("backend", config.app.isgecko ? "wasm" : "webgpu");
      const core = pick("core", "auto");
      const psm = pick("psm", "3");
      const spacing = pick("spacing", "0");
      const accuracy = config.option.value("accuracy", 3);
      const language = config.option.value("language", 14);
      /*
        values only - the wiring lives in config.load
      */
      document.querySelectorAll("input[name='uimode']").forEach(function (radio) {
        radio.checked = radio.value === uimode;
      });
      document.querySelectorAll("input[name='layout']").forEach(function (radio) {
        radio.checked = radio.value === layout;
      });
      document.querySelectorAll("input[name='theme']").forEach(function (radio) {
        radio.checked = radio.value === config.settings.group("theme", "auto");
      });
      document.querySelectorAll("input[name='font']").forEach(function (radio) {
        radio.checked = radio.value === font;
      });
      document.querySelectorAll("input[name='fontsize']").forEach(function (radio) {
        radio.checked = radio.value === fontsize;
      });
      document.querySelectorAll("input[name='clipper']").forEach(function (radio) {
        radio.checked = radio.value === config.settings.group("clipper", "page");
      });
      document.getElementById("models").checked = permission;
      /*
        the checkbox options re-sync on import/reset flows too; the
        streaming switch carries the repaired default (live until told)
      */
      document.getElementById("preprocess").checked = config.storage.read("preprocess") === true;
      document.getElementById("streaming").checked = config.storage.read("streaming") !== false;
      /*  */
      document.querySelector("#engine").value = engine;
      document.querySelector("#backend").value = backend;
      document.querySelector("#core").value = core;
      document.querySelector("#sections").value = config.app.panes.value();
      document.querySelector("#accuracy").value = accuracy;
      document.querySelector("#language").value = language;
      document.querySelector("#psm").value = psm;
      document.querySelector("#spacing").value = spacing;
      document.querySelector("#whitelist").value = config.storage.read("whitelist") !== undefined ? config.storage.read("whitelist") : '';
    },
    "note": function (text) {
      document.getElementById("note").textContent = text;
      /* the note strip sits in the settings view - toolbar toggles fire
         from the main view where the strip is display:none, so a console
         row echoes the same sentence where it is actually visible */
      const hidden = document.documentElement.getAttribute("view") !== "settings";
      if (text && hidden) config.app.update({"status": text});
    },
    "open": function () {
      const next = document.documentElement.getAttribute("view") === "settings" ? "main" : "settings";
      const tooltip = document.querySelector("td#settings");
      /*  */
      document.documentElement.setAttribute("view", next);
      tooltip.title = next === "settings" ? "Back to main" : "Open settings";
      /*
        the note strip starts empty on every settings visit
      */
      if (next === "settings") config.settings.note('');
    },
    "toggle": function () {
      const current = config.storage.read("uimode") !== undefined ? config.storage.read("uimode") : "classic";
      const next = current === "modern" ? "classic" : "modern";
      /*  */
      config.storage.write("uimode", next);
      config.settings.sync();
      config.settings.render();
      /*
        the toolbar twin of the settings radio change - same feedback
      */
      config.settings.note("Interface style applies right away.");
    },
    "layout": function () {
      const current = config.storage.read("layout") !== undefined ? config.storage.read("layout") : "columns";
      const next = current === "columns" ? "rows" : "columns";
      /*  */
      config.storage.write("layout", next);
      config.settings.sync();
      config.settings.render();
      /*
        the toolbar twin of the settings radio group - the display
        layout applies right away, like the interface style above
      */
      config.settings.note("The display layout applies right away.");
    },
    "keys": ["theme", "layout", "uimode", "font", "fontsize", "engine", "backend", "core", "accuracy", "language", "sections", "psm", "spacing", "whitelist", "preprocess", "streaming", "clipper", "consent", "permission", "panesizes", "interface.context"],
    "export": function () {
      const envelope = {"app": "image-reader-ocr", "format": 1, "settings": {}};
      const anchor = document.createElement('a');
      /*  */
      /* machine-local and approval wiring never joins the envelope:
         the toolbar context would silently move where the reader
         opens, and a shipped consent/permission pair would pre-accept
         the remote model download on the next machine - the AGENTS
         rule says no remote content without the explicit user OK */
      config.settings.keys.forEach(function (key) {
        if (key === "interface.context" || key === "consent" || key === "permission") return;
        const value = config.storage.read(key);
        if (value !== undefined) envelope.settings[key] = value;
      });
      /*  */
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {"type": "application/json"});
      const url = URL.createObjectURL(blob);
      /*  */
      anchor.href = url;
      anchor.setAttribute("download", "image-reader-ocr-settings.json");
      anchor.style.display = "none";
      /*  */
      document.body.appendChild(anchor);
      anchor.click();
      /*  */
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 300);
    },
    "import": function () {
      const io = document.getElementById("settings-io");
      /*  */
      io.value = '';
      io.click();
    },
    "reset": async function () {
      if (!window.confirm("Reset all Image Reader settings to their defaults? The cached OCR models (~500 MB) and the open reader window state are wiped too!")) return;
      /* a reset during a stuck run must re-open the controls: the
         wipe reloads everything anyway, so the busy latch drops here */
      config.ocr.engine.busy = false;
      config.ocr.engine.aborted = false;
      config.ocr.engine.ready = false;
      config.ocr.engine.failed = false;
      /* the token rotates like cancel() does: a late rejection from the
         terminated workers must not settle the fresh engine's waits */
      config.ocr.engine.token = {};
      /* the workers die with the state: a live run would otherwise keep
         reading the caches this function wipes below */
      try {if (config.ocr.engine.runner) config.ocr.engine.runner.terminate();} catch (e) {}
      config.ocr.engine.runner = null;
      try {if (config.ocr.engine.worker) await config.ocr.engine.worker.terminate();} catch (e) {}
      config.ocr.engine.worker = null;
      /*  */
      config.storage.local = {};
      /* the toolbar context is machine wiring: like the import wipe it
         survives the reset, else the button silently reverts to "win"
         while the context-menu radio still shows the stored pick */
      const context = config.storage.read("interface.context");
      await chrome.storage.local.clear();
      if (typeof context === "string" && context) {
        /* the restore awaits: a fire-and-forget set could land after the
           load below re-reads storage and the context silently reverts */
        await chrome.storage.local.set((function () {
          let tmp = {};
          tmp["interface.context"] = context;
          return tmp;
        })());
      }
      /* wipe cached model data (transformers + tesseract caches; the
         tesseract traineddata lives in the worker's keyval-store) */
      if (window.caches) {
        const names = await caches.keys();
        for (let i = 0; i < names.length; i++) await caches.delete(names[i]);
      }
      /* deleteDatabase resolves only through its request events: bare
         await on the request is instant and the wipe races the reload */
      try {
        await new Promise(function (resolve) {
          const request = indexedDB.deleteDatabase("keyval-store");
          request.onsuccess = request.onerror = request.onblocked = resolve;
        });
      } catch (e) {}
      /*  */
      config.storage.load(function () {
        config.settings.sync();
        config.settings.render();
        config.app.start();
        config.settings.note("All settings are restored to their defaults.");
      });
    },
    "apply": async function (file, reader) {
      let payload = null;
      try {payload = JSON.parse(reader.result);} catch (e) {}
      /*  */
      if (!payload || payload.app !== "image-reader-ocr" || payload.format !== 1 || !payload.settings) {
        window.alert("Invalid settings file! The export format of Image Reader is required.");
        return;
      }
      /* an import during a live run would wipe the parameter keys and
         fire start() under a recognize() in flight - the note shows in
         the settings view the import button lives on */
      if (config.ocr.engine.busy) {
        config.settings.note("Finish or stop the current OCR run before importing settings.");
        return;
      }
      if (!window.confirm("Replace all stored settings with the imported file?")) return;
      /* enum-backed keys validate against the live option list, so a
         stale or tampered value can never leave a select empty and
         break the langPath / oem reads */
      const valid = function (key, value) {
        /* radio-backed keys (theme/uimode/layout/font/fontsize) match
           their group: an unpresentable value would disable every
           themed rule silently until the next toggle */
        if (document.querySelector("input[name='" + key + "']")) {
          return [...document.querySelectorAll("input[name='" + key + "']")].some(function (radio) {
            return radio.value === String(value);
          });
        }
        let select = null;
        try {select = document.querySelector("#" + key);} catch (err) {return value !== '' && value !== null && value !== undefined;}
        /* only real select elements validate against option lists: an
           exact value hit or a legacy numeric that maps through the
           live option list (the same alias path config.option.value
           reads round-trip) - free inputs (whitelist) and checkboxes
           accept every legal value, an empty whitelist clears the gate */
        if (!select || !select.options) return true;
        if (Array.prototype.some.call(select.options, function (option) {
          return option.value === String(value);
        })) return true;
        const index = Number(value);
        return Number.isInteger(index) && Boolean(select.options[index]) && select.options[index].value !== undefined;
      };
      /* replace means replace: the stored keys wipe first, only the
          validated import entries come back; the wipe awaits, else one
          straggler callback could clear a freshly written key; the
          toolbar context and the consent/permission pair stay
          machine-local both ways - the wipe clears the approval keys
          too, so an import always re-shows the disclosure banner */
      config.storage.local = {};
      await new Promise(function (resolve) {
        chrome.storage.local.remove(Array.prototype.filter.call(config.settings.keys, function (key) {
          return key !== "interface.context";
        }), resolve);
      });
      /*  */
      for (const key of config.settings.keys) {
        const value = payload.settings[key];
        if (value === undefined) continue;
        /* the toolbar context is machine-local wiring in the export
           loop - the import must mirror that skip, and the consent /
           permission pair must never restore (a moved envelope can
           never pre-accept the remote download) */
        if (key === "interface.context" || key === "consent" || key === "permission") continue;
        /* each write awaits, mirroring the remove wipe above - a
           straggler write callback can then never race the load */
        await new Promise(function (resolve) {
          if (valid(key, value)) {
            chrome.storage.local.set((function () {
              let tmp = {};
              tmp[key] = value;
              return tmp;
            })(), resolve);
          } else {
            resolve();
          }
        });
      }
      /*  */
      config.storage.load(function () {
        config.settings.sync();
        config.settings.render();
        config.app.start();
        config.settings.note("Settings imported.");
      });
    }
  },
  "storage": {
    "local": {},
    "read": function (id) {
      return config.storage.local[id];
    },
    "load": function (callback) {
      chrome.storage.local.get(null, function (e) {
        config.storage.local = e;
        callback();
      });
    },
    "write": function (id, data) {
      if (id) {
        if (data !== '' && data !== null && data !== undefined) {
          let tmp = {};
          tmp[id] = data;
          config.storage.local[id] = data;
          chrome.storage.local.set(tmp);
        } else {
          delete config.storage.local[id];
          chrome.storage.local.remove(id);
        }
      }
    }
  },
  "load": function () {
    const theme = document.getElementById("theme");
    const reload = document.getElementById("reload");
    const engine = document.querySelector("#engine");
    const choose = document.querySelector("#choose");
    const support = document.getElementById("support");
    const consent = document.querySelector("#consent");
    const backend = document.querySelector("#backend");
    const core = document.querySelector("#core");
    const sections = document.querySelector("#sections");
    const language = document.querySelector("#language");
    const accuracy = document.querySelector("#accuracy");
    const psm = document.querySelector("#psm");
    const spacing = document.querySelector("#spacing");
    const whitelist = document.querySelector("#whitelist");
    const prepare = document.getElementById("preprocess");
    const stream = document.getElementById("streaming");
    const donation = document.getElementById("donation");
    const settings = document.getElementById("settings");
    const screenshot = document.getElementById("screenshot");
    const reset = document.getElementById("reset");
    const exp = document.getElementById("export");
    const imp = document.getElementById("import");
    const io = document.getElementById("settings-io");
    const models = document.getElementById("models");
    const skin = document.getElementById("uimode");
    const layout = document.getElementById("layout");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    }, false);
    /* the toolbar cells answer the keyboard too: role="button" and
       tabindex in the markup promise it, the Enter/Space pair clicks
       the focused cell like a native button would */
    ["settings", "uimode", "layout", "screenshot", "export", "import", "reset", "theme", "reload", "support", "donation"].forEach(function (id) {
      const cell = document.getElementById(id);
      cell.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          cell.click();
        }
      }, false);
    });
    /*  */
    accuracy.addEventListener("change", async function (e) {
      config.storage.write("accuracy", e.target.value);
      /*  */
      if (config.storage.read("engine") === "tesseract") {
        /* cache-first like the language switch: the tier model is
           cached after the first download, refresh only re-fetches */
        await config.ocr.engine.init();
        window.lastFile && config.ocr.engine.start(window.lastFile);
      }
    });
    /*  */
    language.addEventListener("change", async function (e) {
      config.storage.write("language", e.target.value);
      /*  */
      if (config.storage.read("engine") === "tesseract") {
        await config.ocr.engine.init();
        window.lastFile && config.ocr.engine.start(window.lastFile);
      }
    });
    /*  */
    psm.addEventListener("change", async function (e) {
      config.storage.write("psm", e.target.value);
      /*
        the psm mode is a plain parameter - no engine re-init needed
      */
      if (config.storage.read("engine") === "tesseract") {
        /* a busy worker rejects setParameters - the change rides the
           idle re-apply after the run instead of dying silently */
        if (config.ocr.engine.busy) config.settings.note("The change applies to the next run.");
        else await config.ocr.engine.parameters();
      }
    });
    /*  */
    spacing.addEventListener("change", async function (e) {
      config.storage.write("spacing", e.target.value);
      /*  */
      if (config.storage.read("engine") === "tesseract") {
        if (config.ocr.engine.busy) config.settings.note("The change applies to the next run.");
        else await config.ocr.engine.parameters();
      }
    });
    /*  */
    whitelist.addEventListener("change", async function (e) {
      config.storage.write("whitelist", e.target.value.trim());
      /*  */
      if (config.storage.read("engine") === "tesseract") {
        if (config.ocr.engine.busy) config.settings.note("The change applies to the next run.");
        else await config.ocr.engine.parameters();
      }
    });
    /*  */
    prepare.addEventListener("change", function (e) {
      const open = e.target.checked;
      /*
        the preparation canvas pass applies on the next OCR run
      */
      config.storage.write("preprocess", open ? true : false);
      config.settings.note(open ? "Image preparation applies right away — the next run gets contrast, an upscale for small images and a border." : "The OCR runs on the original image again.");
    });
    /*  */
    stream.addEventListener("change", function (e) {
      const next = e.target.checked;
      /*
        the streaming mode applies on the next granite run
      */
      config.storage.write("streaming", next ? true : false);
      config.settings.note(next ? "Live streaming applies right away — the next granite run streams token by token." : "Word-boundary streaming applies right away — chunks arrive with a delay on low-space markup.");
    });
    /*  */
    consent.addEventListener("click", async function () {
      config.storage.write("consent", true);
      document.querySelector(".consent").style.display = "none";
      /*
        remote downloads start only after the notice is accepted
      */
      await config.ocr.engine.init();
    });
    /*  */
    support.addEventListener("click", function () {
      const url = config.addon.homepage();
      if (chrome.tabs) chrome.tabs.create({"url": url, "active": true});
    }, false);
    /*  */
    donation.addEventListener("click", function () {
      const url = config.addon.homepage() + "?reason=support";
      if (chrome.tabs) chrome.tabs.create({"url": url, "active": true});
    }, false);
    /*  */
    choose.addEventListener("change", function () {
      if (this.files && this.files.length) {
        config.ocr.engine.start(window.lastFile = this.files[0]);
      }
      this.value = '';
    });
    /*  */
    engine.addEventListener("change", function (e) {
      /*
        the console resets first: the next engine's rows print alone
      */
      config.app.update({"clear": true});
      config.storage.write("engine", e.target.value);
      /*  */
      window.setTimeout(function () {
        document.location.reload();
      }, 300);
    });
    /*  */
    backend.addEventListener("change", function (e) {
      config.storage.write("backend", e.target.value);
      /*  */
      window.setTimeout(function () {
        document.location.reload();
      }, 300);
    });
    /*  */
    core.addEventListener("change", async function (e) {
      config.storage.write("core", e.target.value);
      /* the wasm build is init-level - a pinned core needs a worker
         rebuild, the tier/language style re-init covers it */
      if (config.storage.read("engine") === "tesseract") {
        await config.ocr.engine.init();
        window.lastFile && config.ocr.engine.start(window.lastFile);
      }
    });
    /*  */
    sections.addEventListener("change", function (e) {
      config.storage.write("sections", e.target.value);
      /* the attribute resync publishes the new mode to the css gates
         live - sync() owns the render frame re-derivation now */
      config.settings.sync();
      /*
        the pane divider follows the visibility flag in both directions
      */
      config.app.resize.watch();
    });
    /*  */
    theme.addEventListener("click", function () {
      /* the button keeps its flip logic; the apply helper broadcasts the
         resolved theme to every surface (page, iframe, clipper popup) */
      const attribute = document.documentElement.getAttribute("theme") === "dark" ? "light" : "dark";
      /*  */
      config.storage.write("theme", attribute);
      config.app.theme.apply(attribute);
      /*
        the settings radios follow the toolbar toggle
      */
      config.settings.render();
    }, false);
    /*  */
    skin.addEventListener("click", config.settings.toggle, false);
    layout.addEventListener("click", config.settings.layout, false);
    /*  */
    settings.addEventListener("click", function () {
      config.settings.open();
    }, false);
    /*  */
    reset.addEventListener("click", function () {
      config.settings.reset();
    }, false);
    /*  */
    exp.addEventListener("click", function () {
      config.settings.export();
    }, false);
    /*  */
    imp.addEventListener("click", function () {
      config.settings.import();
    }, false);
    /*  */
    io.addEventListener("change", function () {
      const picker = this;
      /*  */
      if (!picker.files || !picker.files.length) return;
      const reader = new FileReader();
      reader.onload = function () {
        config.settings.apply(picker.files[0], reader);
      };
      reader.readAsText(picker.files[0]);
      picker.value = '';
    });
    /*  */
    models.addEventListener("change", async function (e) {
      const open = e.target.checked;
      /*  */
      config.storage.write("permission", open ? true : false);
      /* the notes tell the truth: re-enabling re-initializes now, the
         blocking only stops NEW downloads - a cached or loaded engine
         keeps running until the run chain ends */
      config.settings.note(open ? "Model downloads are allowed — the granite engine re-initializes." : "Model downloads are blocked — new downloads stop, a cached engine keeps running.");
      /*  */
      /* blocking pulls the ready gate too: an already-loaded model must
         not keep running after the switch says blocked - re-enabling
         re-inits from the still-cached model so the wait is short -
         while busy, the flag flips stay deferred: clearing the working
         state mid-run would re-open every control and a concurrent
         re-init would fight the live transcription */
      if (config.storage.read("engine") === "granite") {
        if (config.ocr.engine.busy) return;
        if (open) {
          await config.ocr.engine.init();
        } else {
          config.ocr.engine.ready = false;
          config.ocr.engine.failed = false;
          config.app.is.working(false);
        }
      }
    });
    /*  */
    ["uimode", "layout", "theme", "font", "fontsize", "clipper"].forEach(function (name) {
      const notes = {
        "uimode": "Interface style applies right away.",
        "layout": "Interface layout applies right away.",
        "theme": "Dark mode applies right away.",
        "font": "Font family applies right away.",
        "fontsize": "Font size applies right away.",
        "clipper": "The screenshot placement applies to the next capture."
      };
      const radios = document.querySelectorAll("input[name='" + name + "']");
      /*  */
      Array.prototype.slice.call(radios).forEach(function (radio) {
        radio.addEventListener("change", function (e) {
          config.storage.write(name, e.target.value);
          config.settings.sync();
          /* the apply helper re-themes every surface: page, render
             pane (iframe) and the clipper — the broadcast passes the
             resolved value, so "auto" never leaks into surfaces that
             only know dark/light */
          if (name === "theme") config.app.theme.apply(config.app.theme.value());
          config.settings.note(notes[name]);
        });
      });
    });
    /*  */
    screenshot.addEventListener("click", function () {
      const metrics = {};
      /* the embedded pane rides the right column: a second click
         toggles it off, since the pane has no window close affordance */
      if (config.settings.group("clipper", "page") !== "window") {
        if (config.ocr.clipper.open) {
          config.ocr.clipper.dismiss();
        } else {
          config.ocr.clipper.embed();
        }
        return;
      }
      /*  */
      /*
        default popup: 600 x 800, shrunk to fit small screens
      */
      metrics.width = Math.min(600, window.screen.availWidth);
      metrics.height = Math.min(800, window.screen.availHeight);
      metrics.url = chrome.runtime.getURL("/data/interface/selector/index.html");
      metrics.left = window.screenX + Math.round((window.outerWidth - metrics.width) / 2);
      metrics.top = window.screenY + Math.round((window.outerHeight - metrics.height) / 2);
      metrics.options = `popup=yes, width=${metrics.width}, height=${metrics.height}, left=${metrics.left}, top=${metrics.top}`;
      /*  */
      config.ocr.clipper.popup = window.open(metrics.url, '', metrics.options, false);
      /*  */
      if (config.ocr.clipper.popup) {
        config.ocr.clipper.popup.focus();
      } else {
        window.alert("Please allow popups for image reader app");
      }
    }, false);
    /*  */
    window.addEventListener("message", function (e) {
      const frame = config.ocr.clipper.frame;
      /* the embedded clipper is the only talker: the open gate plus
         the source identity keep other extension surfaces from
         closing the pane (the render frame uses the same source-only
         convention) */
      if (!config.ocr.clipper.open || !frame || e.source !== frame.contentWindow) return;
      if (e.data && e.data.type === "clipper-close") config.ocr.clipper.dismiss();
    }, false);
    /*  */
    /* the permanent action cluster is built once at load; editing the
       result text re-gates the text actions immediately */
    config.app.text.cluster();
    /* the resize handles mount once; every storage push re-gates and
       re-applies their persisted sizes */
    config.app.resize.build();
    document.querySelector("textarea").addEventListener("input", config.app.text.state, false);
    /*  */
    config.app.theme.watch();
    /* two open reader surfaces keep different skin/theme/text until
       one reloads - the storage push re-reads the fresh mirror first
       (a second surface reads a stale cache otherwise), then sync,
       render and the exports re-gate ride it; the pure window-resize
       flood writes only interface.size keys and skips everything */
    chrome.storage.onChanged.addListener(function (e) {
      /* panesizes joins the skip list: only the dragging surface in
         this page ends a divider drag, and the echo (a full reload,
         sync, render, watch cycle) re-mounted the OTHER blocks stored
         heights plus the pane visibility re-derivation right after
         the live drag - one drag reshuffled neighbours and the render
         pane collapsed */
      /* the dispatcher hands the changes map itself (lib/chrome.js
         calls back with (changes, namespace)), so the keys decode off
         the event directly - an event that names no keys carries no
         verdict: a real push always names its keys, so an undecodable
         one skips the heavy chain exactly like the size-only echo does
         - running the chain on the divider drags re-rendered the panes
         and collapsed the render view (the echo bug resurfacing) */
      const names = [];
      for (const key in (e || {})) names.push(key);
      const sizeonly = names.length === 0 || names.every(function (name) {
        return name === "interface.size" || name === "panesizes";
      });
      if (sizeonly) return;
      /* an engine or backend switch written by ANOTHER surface needs a
         full rebuild here, not a select repaint: B's worker/tokenizer
         stays the old engine while the mirror already says otherwise -
         the same 300ms reload surface A runs on its own change; only a
         landed NEW value counts (a reset clearing the key must not
         reload mid-chain) */
      const flip = names.some(function (name) {
        const change = e[name];
        return (name === "engine" || name === "backend") && change && change.newValue !== undefined;
      });
      if (flip) {
        /* the backend fallback writes its own key mid-load: the flag
           marks the self-write so this surface skips the reload it
           would otherwise schedule (the fresh load is already running)
           - other surfaces still reload to pick the new backend */
        if (config.ocr.engine.selfwrite) {
          config.ocr.engine.selfwrite = false;
        } else {
          window.setTimeout(function () {
            document.location.reload();
          }, 300);
        }
        return;
      }
      /* the tier/core and psm-trio groups mirror surface A's own change
         handlers: a tier or core switch re-inits the worker (a loaded
         image re-runs along), the psm trio re-applies to the idle
         worker - B stays the config it displays instead of running one
         run behind the mirror; a busy worker rejects both, so a change
         mid-run rides the idle re-apply after the run */
      const reinit = names.some(function (name) {
        const change = e[name];
        return (name === "core" || name === "accuracy" || name === "language") && change && change.newValue !== undefined;
      });
      const reparam = names.some(function (name) {
        const change = e[name];
        return (name === "psm" || name === "spacing" || name === "whitelist") && change && change.newValue !== undefined;
      });
      const consented = names.some(function (name) {
        const change = e[name];
        return name === "consent" && change && change.newValue === true;
      });
      config.storage.load(async function () {
        config.settings.sync();
        config.settings.render();
        /* the render frame (and the clipper popup) re-theme with the
           push: sync flips the attribute but never messages the frame */
        config.app.theme.apply(config.app.theme.value());
        config.app.exports.refresh();
        config.app.resize.watch();
        /* the consent banner follows the key in every surface, and a
           first-time accept starts the engine here too (app.start owns
           the boot-time branch, this is the cross-surface mirror) - the
           busy guard skips the push of the accept click's own write:
           the handler already started the engine, and a second init
           would race the first createWorker and leak a worker heap */
        const consent = config.storage.read("consent") !== undefined ? config.storage.read("consent") : false;
        /* a granted permission clears the granite skip-flag: the settings
           toggle writes the key, so its own push re-opens the engine */
        const granted = names.some(function (name) {
          const change = e[name];
          return name === "permission" && change && change.newValue === true;
        });
        if (granted) config.ocr.engine.declined = false;
        document.querySelector(".consent").style.display = consent ? "none" : "block";
        /* the declined flag skips the granite re-init: the declined init
           lands neither ready nor failed, so without it every unrelated
           push would re-enter the init and stack its status row - a
           same-surface engine switch reaches init directly (the select's
           own handler), a cross-surface switch reloads through the flip */
        if ((consented || (consent && !config.ocr.engine.ready)) && !config.ocr.engine.busy && !config.ocr.engine.declined) config.ocr.engine.init();
        /* the tesseract-only groups gate on the stored engine like
           surface A's handlers do - the re-init awaits: a bare call
           would race start against the worker init is tearing down */
        if (config.storage.read("engine") === "tesseract" && !config.ocr.engine.busy) {
          if (reinit) {
            await config.ocr.engine.init();
            window.lastFile && config.ocr.engine.start(window.lastFile);
          } else if (reparam) {
            config.ocr.engine.parameters();
          }
        }
      });
    });
    /*  */
    config.storage.load(config.app.start);
    window.removeEventListener("load", config.load, false);
  },
  "ocr": {
    "clipper": {
      "popup": null,
      "frame": null,
      "open": false,
      "embed": function () {
        const frame = document.querySelector(".col.right .clipper iframe");
        /* a fresh load per open re-arms the selector clean, so a stale
           stream or selection can never ride into the next capture */
        frame.src = chrome.runtime.getURL("/data/interface/selector/index.html");
        config.ocr.clipper.frame = frame;
        config.ocr.clipper.open = true;
        document.documentElement.setAttribute("clipper", "on");
        /* the embed marker rides the iframe itself: a css hook for
           pane-specific styling without the html-attribute chain */
        frame.setAttribute("embed", '');
        /* the selector self-themes from storage at load; this push
           keeps it in step when the stance flips while the pane shows */
        frame.addEventListener("load", function () {
          frame.contentWindow.postMessage({"theme": config.app.theme.value(), "type": "set-theme"}, chrome.runtime.getURL("/"));
        }, {"once": true});
      },
      "dismiss": function () {
        const frame = config.ocr.clipper.frame;
        /* the stream must die with the pane: a hidden iframe keeps
           capturing otherwise - the selector releases on its own
           pagehide only, so the close message stops it explicitly */
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({"type": "clipper-close"}, chrome.runtime.getURL("/"));
        }
        config.ocr.clipper.open = false;
        document.documentElement.removeAttribute("clipper");
        frame && frame.removeAttribute("embed");
      }
    },
    "engine": {
      "ready": false,
      "busy": false,
      "aborted": false,
      "failed": false,
      "token": null,
      "parser": null,
      "worker": null,
      "module": null,
      "runner": null,
      "runnerwait": {},
      "runlive": false,
      "killer": null,
      "selfwrite": false,
      "declined": false,
      "loadreset": function (host) {
        config.ocr.engine.loadstate = {
          "host": host,
          "size": {"a": 0, "b": 0, "c": 0, "d": 0},
          "percent": {"a": 0, "b": 0, "c": 0, "d": 0}
        };
      },
      "fallbackwasm": function () {
        /* the self-write flag spares THIS surface its own flip-reload -
           the wasm load continues in place; every other surface still
           reloads. the timer re-arms the flag when the write turns out
           to be a no-op (same value): a later manual backend flip must
           reload, and a no-op write fires no storage event to consume
           the flag */
        config.ocr.engine.selfwrite = true;
        window.setTimeout(function () {
          config.ocr.engine.selfwrite = false;
        }, 500);
        document.querySelector("#backend").value = "wasm";
        config.storage.write("backend", "wasm");
        config.app.update({"status": "WebGPU unavailable — using the CPU (wasm) backend instead."});
      },
      "runmodel": function (file) {
        return new Promise(function (resolve, reject) {
          config.ocr.engine.runlive = true;
          config.ocr.engine.runnerwait.run = {"resolve": resolve, "reject": reject};
          config.ocr.engine.runner.postMessage({"type": "run", "file": file, "streaming": config.storage.read("streaming") !== false});
        });
      },
      "parameters": async function () {
        /* a busy worker is mid-run - setParameters on it rejects and
           kills the run, so the change rides the next init instead */
        if (config.ocr.engine.busy) return;
        const worker = config.ocr.engine.worker;
        if (!worker) return;
        /*
          the psm/spacing/whitelist trio rides on one setParameters call;
          a race the busy guard missed rejects the call - the change
          rides the next init instead of spraying an unhandled rejection
        */
        try {
          await worker.setParameters({
            "tessedit_pageseg_mode": config.storage.read("psm") !== undefined ? config.storage.read("psm") : "3",
            "preserve_interword_spaces": config.storage.read("spacing") !== undefined ? config.storage.read("spacing") : "0",
            "tessedit_char_whitelist": config.storage.read("whitelist") !== undefined ? config.storage.read("whitelist") : ''
          });
        } catch (e) {}
      },
      "cancel": async function () {
        const engine = config.storage.read("engine") !== undefined ? config.storage.read("engine") : "tesseract";
        const live = config.ocr.engine.runlive;
        config.ocr.engine.aborted = true;
        /*  */
        try {if (config.ocr.engine.worker) await config.ocr.engine.worker.terminate();} catch (e) {}
        config.ocr.engine.worker = null;
        /* the run token rotates here: a late recognize() rejection from
           the terminated worker no longer matches the token error()
           compares against (a cancelled run used to strand the fresh
           engine with failed=true / ready=false on the re-init path) */
        config.ocr.engine.token = {};
        /*
          the throwing streamer callback unwinds the running generate()
        */
        if (engine === "tesseract") {
          /* the tesseract worker is gone — a clean re-init rebuilds it;
             init catches its own failures, so the abort gate opens for
             the re-init: error() then un-sticks busy + marks failed
             instead of the UI freezing mid-disabled-early-return; the
             flag stays false after — a later offline init failure must
             reach error() instead of swallowing into a soft lock */
          config.ocr.engine.aborted = false;
          await config.ocr.engine.init();
        } else {
          try {if (config.ocr.engine.runner) config.ocr.engine.runner.postMessage({"type": "cancel"});} catch (e) {}
          /* granite's loaded model stays in memory; a re-init would
             block the UI for tens of seconds on a cache reload; ready
             only when a transcriber exists (a cancelled download
             leaves none) - failed follows the same truth so the next
             drop names the reload-retry branch instead of "still
             loading"; the latch clears right away on the main-thread
             path (its streamer throw races this function), while the
             worker path keeps it armed until the run rejection lands
             in start's catch - error() skips while the flag is up and
             then clears it, so a cancelled run never reads as a fatal
             engine error and the next run never exits through the
             success path with a stale latch */
          if (!config.ocr.engine.runner) config.ocr.engine.aborted = false;
          config.ocr.engine.failed = !Boolean(config.ocr.engine.transcriber);
          config.ocr.engine.ready = Boolean(config.ocr.engine.transcriber);
          /* a live run keeps the latch armed until its rejection lands:
             the busy gate must not re-open while the worker is still
             inside generate() - the killer timer below releases it when
             the pass never unwinds */
          if (!config.ocr.engine.runlive) config.app.is.working(false);
          /* the streaming throw lands at the next token, but the encoder
             prefill can outlast any patience - a run that did not unwind
             within the grace window dies with its worker; the model
             reloads from the shared cache on the next init */
          if (config.ocr.engine.runlive) {
            window.clearTimeout(config.ocr.engine.killer);
            config.ocr.engine.killer = window.setTimeout(function () {
              const runner = config.ocr.engine.runner;
              const wait = config.ocr.engine.runnerwait.run;
              config.ocr.engine.killer = null;
              config.ocr.engine.runlive = false;
              config.ocr.engine.runner = null;
              config.ocr.engine.transcriber = null;
              config.ocr.engine.runnerwait.run = null;
              config.ocr.engine.ready = false;
              config.ocr.engine.failed = true;
              try {if (runner) runner.terminate();} catch (e) {}
              if (wait) wait.reject(new Error("cancelled by user"));
              config.app.update({"status": "OCR > the run was cancelled - reload the UI to retry."});
            }, 1500);
          }
        }
        /*
          the story lands after any re-init console clear - a failed
          re-init keeps its own error line above, a clean one reports
          cancelled; a cancelled granite download names its retry path
        */
        /* the wording follows the kill path: a live run (the killer owns
           its line) names the run instead of the download, and the
           failed line follows the engine - the accuracy advice is
           tesseract-only */
        const story = live ? "OCR > the run was cancelled - reload the UI to retry." : engine === "granite" && !config.ocr.engine.transcriber ? "OCR > the granite download was cancelled - reload the UI to retry." : config.ocr.engine.failed ? (engine === "granite" ? "OCR > the engine failed — reload the UI to retry." : "OCR > the engine failed — change the OCR accuracy or reload the UI to retry.") : "OCR > cancelled by user.";
        config.app.update({"status": story});
      },
      "error": function (e, token) {
        /* cancel() owns the cancellation story: the granite streamer
           throws its way out, so this handler must not fight it by
           killing the engine state or overwriting the status line */
        if (config.ocr.engine.aborted) return;
        /* a stale report (a late rejection from a worker that a later
           init already replaced) must not kill the fresh engine */
        if (token && config.ocr.engine.token && config.ocr.engine.token !== token) return;
        const reason = e && e.message ? e.message : String(e);
        /*  */
        config.ocr.engine.ready = false;
        /* a fatal error stays remembered - the next drop explains the
           real state instead of claiming "still loading" */
        config.ocr.engine.failed = true;
        /* the float tier is mis-compiled in tesseract.js-core v7 (upstream
           issue #1080) — a friendly line beats the raw emscripten abort */
        if (reason.indexOf("DotProductSSE") !== -1) {
          config.app.update({"status": "The Best accuracy tier is currently broken in tesseract.js v7 (float models run into an upstream bug)."});
          config.app.update({"status": "Please use the Low, Moderate or Fast accuracy instead until tesseract.js ships a fix."});
        } else {
          config.app.update({"status": "Error > " + reason});
        }
        /* the stack frames name the failing side (app code vs vendor
           transformers) - three lines keep the console readable */
        const stack = e && typeof e.stack === "string" ? e.stack.split("\n") : null;
        if (stack) {
          let frames = [];
          for (let i = 0; i < stack.length && frames.length < 3; i++) {
            if (stack[i].indexOf("Error") !== -1) continue;
            frames.push(stack[i].trim());
          }
          if (frames.length) config.app.update({"status": "Error > " + frames.join(" | ")});
        }
        config.app.is.working(false);
      },
      "runneronmessage": function (e) {
        const data = e.data || {};
        const textarea = document.querySelector("textarea");
        /*  */
        if (data.type === "progress") {
          config.ocr.engine.loadrows(data.file, data.loaded, data.total);
        } else if (data.type === "phase" && data.name === "running") {
          config.app.tick.stop();
          config.app.update({"clear": true});
          /* the encoder/prefill pass runs before the first token can
             exist - the ticker holds the row while the numbers are
             honest only once the streamer starts */
          config.app.tick.start("OCR > running the model, the first words take the longest");
        } else if (data.type === "token") {
          if (config.app.tick.timer) config.app.tick.stop();
          config.app.update({"status": "ontext", "data": {"data": {"text": data.text}}});
          textarea.scrollTop = textarea.scrollHeight;
        } else if (data.type === "done") {
          const wait = config.ocr.engine.runnerwait.run;
          config.ocr.engine.runlive = false;
          window.clearTimeout(config.ocr.engine.killer);
          config.ocr.engine.killer = null;
          /* the slot dies with the settle: a queued message from a
             replaced worker must not re-settle a dead wait */
          config.ocr.engine.runnerwait.run = null;
          if (wait) wait.resolve(data.text);
        } else if (data.type === "loaded") {
          const wait = config.ocr.engine.runnerwait.init;
          /* the slot dies with the settle: a queued message from a
             replaced worker must not re-settle a dead wait */
          config.ocr.engine.runnerwait.init = null;
          if (wait) wait.resolve(true);
        } else if (data.type === "error") {
          const err = new Error(data.message);
          if (data.stack) err.stack = data.stack;
          const stage = data.stage === "run" ? "run" : "init";
          const wait = stage === "run" ? config.ocr.engine.runnerwait.run : config.ocr.engine.runnerwait.init;
          /* the slot dies with the settle: a queued message from a
             replaced worker must not re-settle a dead wait */
          config.ocr.engine.runnerwait[stage] = null;
          if (wait) wait.reject(err);
          else config.ocr.engine.error(err, config.ocr.engine.token);
          if (stage === "run") {
            config.ocr.engine.runlive = false;
            window.clearTimeout(config.ocr.engine.killer);
            config.ocr.engine.killer = null;
          }
        }
      },
      "runnererror": function (e) {
        const err = new Error(e && e.message ? e.message : "the OCR worker crashed");
        const wait = config.ocr.engine.runnerwait.run || config.ocr.engine.runnerwait.init;
        config.ocr.engine.runlive = false;
        window.clearTimeout(config.ocr.engine.killer);
        config.ocr.engine.killer = null;
        /* the slots die with the settle: a queued message from a
           replaced worker must not re-settle a dead wait */
        config.ocr.engine.runnerwait.run = null;
        config.ocr.engine.runnerwait.init = null;
        /* a worker-level crash (module load, OOM, ORT abort) fires the
           error event instead of a routed message - reject the pending
           wait so the awaiting init/run unwinds, or surface the crash
           directly when nothing waits */
        if (wait) wait.reject(err);
        else config.ocr.engine.error(err, config.ocr.engine.token);
      },
      "loadrows": function (file, loaded, total) {
        const state = config.ocr.engine.loadstate;
        /* the vendor sometimes reports a file-less tick: the name
           normalizes to an empty string instead of crashing indexOf,
           and a zero total would render "Infinity%" - both gate the
           math off */
        const name = typeof file === "string" ? file : '';
        const embed = name.indexOf("embed_tokens");
        const encoder = name.indexOf("vision_encoder");
        const decoder = name.indexOf("decoder_model_merged");
        const other = embed === -1 && encoder === -1 && decoder === -1;
        const valid = loaded !== undefined && total !== undefined && total > 0;
        /*  */
        if (valid) {
          if (other) state.size.a = (total / (1024 * 1024)).toFixed(2);
          if (embed !== -1) state.size.d = (total / (1024 * 1024)).toFixed(2);
          if (other) state.percent.a = ((loaded / total) * 100).toFixed(2);
          if (encoder !== -1) state.size.b = (total / (1024 * 1024)).toFixed(2);
          if (decoder !== -1) state.size.c = (total / (1024 * 1024)).toFixed(2);
          if (embed !== -1) state.percent.d = ((loaded / total) * 100).toFixed(2);
          if (encoder !== -1) state.percent.b = ((loaded / total) * 100).toFixed(2);
          if (decoder !== -1) state.percent.c = ((loaded / total) * 100).toFixed(2);
        }
        /* the console rows re-key on the stripped text, so the whole
           log no longer wipes and rebuilds on every tick; the
           newest-first console inserts above the previous line, so the
           reads run top-down: Downloading → embed → encoder → decoder
        */
        if (other) config.app.update({"status": "Loading " + name + " " + state.percent.a + '%', "progress": state.percent.a / 100});
        config.app.update({"status": "Loading decoder_model_merged.onnx" + (state.size.c ? " (" + state.size.c + " MB)" : '') + ' ' + state.percent.c + '%', "progress": state.percent.c / 100});
        config.app.update({"status": "Loading encoder_model.onnx" + (state.size.b ? " (" + state.size.b + " MB)" : '') + ' ' + state.percent.b + '%', "progress": state.percent.b / 100});
        config.app.update({"status": "Loading embed_tokens.onnx" + (state.size.d ? " (" + state.size.d + " MB)" : '') + ' ' + state.percent.d + '%', "progress": state.percent.d / 100});
        /*  */
        config.app.update({"status": "Downloading model data for: " + state.host});
      },
      "start": async function (file) {
        const iframe = document.querySelector("iframe");
        const result = document.querySelector(".result");
        const choose = document.querySelector("#choose");
        const accuracy = document.querySelector("#accuracy");
        const language = document.querySelector("#language");
        const textarea = document.querySelector("textarea");
        const theme = config.app.theme.value();
        const engine = config.storage.read("engine") !== undefined ? config.storage.read("engine") : "tesseract";
        /*  */
        if (!config.ocr.engine.ready) {
          const consented = config.storage.read("consent") === true;
          if (config.ocr.engine.failed) {
            /* the accuracy advice is tesseract-only: granite carries no
               tier select, so its line names the reload path instead */
            config.app.update({"status": engine === "granite" ? "OCR > the engine failed — reload the UI to retry." : "OCR > the engine failed — change the OCR accuracy or reload the UI to retry."});
          } else if (!consented) {
            config.app.update({"status": "OCR > accept the notice above to start the OCR engine."});
          } else if (config.storage.read("engine") !== "tesseract" && config.storage.read("permission") === false) {
            config.app.update({"status": "OCR > the granite engine is disabled — allow model downloads in the settings, or switch back to the tesseract engine."});
          } else {
            config.app.update({"status": "OCR > engine is still loading, please wait..."});
          }
          return;
        }
        if (config.ocr.engine.busy) {
          config.app.update({"status": "OCR > please wait for the current run to finish."});
          return;
        }
        /* the flag flips before the first await: two triggers inside
           the dataURL conversion window would both pass a late gate */
        config.ocr.engine.busy = true;
        /*  */
        config.ocr.engine.aborted = false;
        /* the run token scopes its errors: a late rejection from a
           worker torn down by cancel must not kill a freshly rebuilt
           engine (error() compares and skips) */
        const token = config.ocr.engine.token = {};
        /*  */
        try {
          const url = await config.app.file.to.dataURL(file);
          /* the preview shrinks away from the top and bottom label strips,
             so the text stays readable while an image is loaded */
          choose.style.backgroundSize = "auto calc(100% - 58px)";
          choose.style.backgroundPosition = "center";
          choose.style.backgroundRepeat = "no-repeat";
          choose.style.backgroundImage = `url(${url})`;
          /*  */
          textarea.value = '';
          result.style.backgroundImage = '';
          /*
            a fresh run invalidates the previous html export
          */
          window.lastHtml = null;
          config.app.update({"clear": true});
          config.app.text.state();
          iframe.contentWindow.postMessage({"type": "clear-content"}, chrome.runtime.getURL("/"));
          /* fresh run — the paragraph render highlight starts over;
             working() clears the console, so its exact follow-up lets
             the "processing" line survive in the fresh log */
          document.documentElement.removeAttribute("render");
          /*
            the pane divider hides with the html view on fresh runs
          */
          config.app.resize.watch();
          config.app.is.working(true);
          config.app.update({"status": "Image Reader is processing the image, please wait..."});
          /*  */
          if (engine === "tesseract") {
            const warn = {"equ": "Math", "tgl": "Tagalog"};
            const tier = accuracy.value;
            /*  */
            if (warn[language.value] && (tier === "4.0.0_fast" || tier === "4.0.0_best")) {
              config.app.update({"status": "Note: the " + warn[language.value] + " language is not included in every accuracy tier."});
            }
            /*  */
            /* the optional preparation pass (grayscale, Otsu, upscale,
               border) feeds the engine a cleaner image while the file
               input preview keeps showing the original */
            let payload = file;
            if (config.storage.read("preprocess") === true) {
              config.app.update({"status": "OCR > preparing the image..."});
              payload = await config.app.file.to.prepared(file);
            }
            /* tesseract v7 ships the whole structure inside output.blocks —
               the v6-style top level keys are rebuilt from it for the
               status counters and the html render pane */
            const data = await config.ocr.engine.worker.recognize(payload, {}, {"text": true, "blocks": true});
            const flat = {"paragraphs": [], "lines": [], "words": [], "symbols": []};
            /*  */
            (data.data.blocks || []).forEach(function (block) {
              (block.paragraphs || []).forEach(function (paragraph) {
                flat.paragraphs.push(paragraph.text);
                (paragraph.lines || []).forEach(function (linex) {
                  flat.lines.push(linex.text);
                  (linex.words || []).forEach(function (word) {
                    flat.words.push(word.text);
                    (word.symbols || []).forEach(function (symbol) {
                      flat.symbols.push(symbol.text);
                    });
                  });
                });
              });
            });
            /*  */
            data.data.paragraphs = flat.paragraphs;
            data.data.lines = flat.lines;
            data.data.words = flat.words;
            data.data.symbols = flat.symbols;
            /* a psm/spacing/whitelist change made mid-run was silently
               dropped by the busy gate - the done handoff releases the
               latch inside update (before the cluster re-gates), then
               the re-apply lands on the idle worker immediately */
            config.app.update({"status": "done", "data": data});
            /*  */
            await config.ocr.engine.parameters();
          }
          /*  */
          if (engine === "granite") {
            const finish = async function (chunks) {
              const final = chunks.replace(/<\|end_of_text\|>$/, '');
              const converter = new config.ocr.engine.parser.DoclingConverter();
              const text = converter.convertToText(final);
              const html = converter.convertToHTML(final);
              /* the status counters ride the text itself: convertToText
                 blooms every paragraph and header boundary into a blank
                 line and collapses the rest, so the blank-line split is
                 a faithful paragraph count (no fake confidence - granite
                 runs show words, lines and paragraphs only) */
              config.app.update({
                "status": "done",
                "data": {
                  "data": {
                    "text": text,
                    "words": text.split(/\s+/).filter(Boolean),
                    "lines": text.split(/\n/).filter(Boolean),
                    "paragraphs": text.split(/\n\s*\n/).filter(Boolean)
                  }
                }
              });
              /*
                the html export button reads the last docling result
              */
              window.lastHtml = html;
              /*  */
              const target = chrome.runtime.getURL("/data/interface/iframe/index.html");
              const origin = chrome.runtime.getURL("/");
              const deliver = function () {
                iframe.contentWindow.postMessage({"theme": theme, "type": "set-theme"}, origin);
                /*  */
                iframe.contentWindow.postMessage({
                  "content": html,
                  "type": "set-content",
                  "katex": chrome.runtime.getURL("/data/interface/vendor/katex/katex.mjs"),
                  "render": chrome.runtime.getURL("/data/interface/vendor/katex/auto-render.mjs")
                }, origin);
              };
              /* reload only on the first run — an already-loaded iframe never
                 refires load, so later runs post to the live window */
              if (iframe.src !== target) {
                iframe.src = target;
                iframe.addEventListener("load", deliver, {"once": true});
              } else {
                deliver();
              }
              /*
                the panes helper owns the show/hide decision - html mode
                keeps the pane, one/none drop it, same gate as the
                tesseract path
              */
              if (config.app.panes.render()) document.documentElement.setAttribute("render", "on");
              config.app.resize.watch();
            };
            if (config.ocr.engine.runner) {
              /* the worker path: preprocessing runs off-main too, so the
                 preparing ticker counts honestly and the phase swap
                 arrives as a message when the first pass can start */
              config.app.tick.start("OCR > preparing the image for the model");
              const chunks = await config.ocr.engine.runmodel(file);
              await finish(chunks);
            } else {
              config.app.tick.start("OCR > preparing the image for the model");
              const image = await config.ocr.engine.module.load_image(file);
              const messages = [
                {
                  "role": "user",
                  "content": [
                    {
                      "type": "image"
                    },
                    {
                      "type": "text",
                      "text": "Convert this page to docling."
                    }
                  ]
                }
              ];
              /*  */
              const res = {};
              const prompt = config.ocr.engine.processor.apply_chat_template(messages, {"add_generation_prompt": true});
              const inputs = await config.ocr.engine.processor(prompt, [image], {"do_image_splitting": true});
              /*  */
              res.chunks = '';
              config.app.tick.stop();
              config.app.update({"clear": true});
              /* the encoder/prefill pass runs before the first token can
                 exist - the ticker holds the row while the numbers are
                 honest only once the streamer starts */
              config.app.tick.start("OCR > running the model, the first words take the longest");
              /* the vendor TextStreamer holds text back until it hits a
                 literal space - docling markup pages carry few spaces, so
                 the live mode re-decodes the cache per token step; the
                 "word boundaries" setting keeps the vendor behaviour */
              const livestreaming = config.storage.read("streaming") !== false;
              const Streamer = livestreaming ? class extends config.ocr.engine.module.TextStreamer {
                put(value) {
                  if (value.length > 1) throw Error("TextStreamer only supports batch size of 1");
                  const tokens = value[0];
                  if (this.next_tokens_are_prompt) {
                    this.next_tokens_are_prompt = false;
                    if (this.skip_prompt) return;
                  }
                  this.token_callback_function?.(tokens);
                  this.token_cache = [...this.token_cache, ...tokens];
                  /* a full cache re-decode per step keeps multibyte pieces
                     intact; the printed length owns the emitted part */
                  const text = this.tokenizer.decode(this.token_cache, this.decode_kwargs);
                  this.on_finalized_text(text.slice(this.print_len), false);
                  this.print_len = text.length;
                }
              } : config.ocr.engine.module.TextStreamer;
              /*  */
              await config.ocr.engine.transcriber.generate({
                ...inputs,
                "max_new_tokens": 4096,
                "streamer": new Streamer(config.ocr.engine.processor.tokenizer, {
                  "skip_prompt": true,
                  "skip_special_tokens": false,
                  "callback_function": function (e) {
                    if (config.app.tick.timer) config.app.tick.stop();
                    if (config.ocr.engine.aborted) throw new Error("cancelled by user");
                    res.chunks += e;
                    config.app.update({"status": "ontext", "data": {"data": {"text": e}}});
                    /* the scroll rides after the append: a pre-append read
                       measures the old scrollHeight and lags one chunk */
                    textarea.scrollTop = textarea.scrollHeight;
                  }
                })
              });
              await finish(res.chunks);
            }
          }
        } catch (e) {
          /* a cancelled run skips error() (it returns while latched) and
             releases the busy latch itself - the worker path keeps the
             latch armed across cancel() until the run settles, so this
             line is the release for the graceful streamer throw and the
             killer-timer rejection alike; honest errors still route
             through error(), which releases the latch at its end */
          if (config.ocr.engine.aborted) config.app.is.working(false);
          config.ocr.engine.error(e, token);
          /* the abort flag is one-shot here too: the throwing streamer
             of a cancelled run must not silence honest errors later */
          config.ocr.engine.aborted = false;
        }
      },
      "init": async function () {
        const engine = config.storage.read("engine") !== undefined ? config.storage.read("engine") : "tesseract";
        /* the declined stance settles synchronously at the door: the
           deep branch arms its flag only after the async permission
           reads, so a storage push racing a boot init re-entered the
           declined path and stacked its status row - the story prints
           on the transition only (a second caller re-arms the flag
           silently) */
        if (engine !== "tesseract" && config.storage.read("permission") === false) {
          const fresh = !config.ocr.engine.declined;
          config.ocr.engine.declined = true;
          if (fresh) {
            config.app.is.working(false);
            config.app.update({"status": "OCR > granite engine is disabled — allow model downloads in the settings, or switch back to the tesseract engine."});
          }
          return;
        }
        /*  */
        try {
          if (engine === "tesseract") {
            config.app.is.working(true);
            config.app.update({"status": "OCR > loading tesseract, please wait..."});
            await new Promise(resolve => window.setTimeout(resolve, 300));
            config.app.update({"clear": true});
            /*  */
            const language = document.querySelector("#language").value;
            const accuracy = document.querySelector("#accuracy").value;
            /*  */
            /* tessdata 4.0.0 tiers are LSTM-only — oem 1 matches them;
               the legacy tier keeps oem 0 */
            const oem = accuracy === "3.02" ? '0' : '1';
            /* the legacy engine code must be shipped in the worker or
               the 3.02 tier silently misbehaves (api.md note) */
            const legacy = accuracy === "3.02";
            /*
              core pick: auto lets the worker feature-detect inside the
              core folder; anything else pins an exact build file; the
              best tier pins simd-lstm because the relaxed-simd build
              mis-links the float path (upstream issue #1080) - the pin
              needs simd itself: an 88-90 build fails on it, so the
              feature probe falls back to the no-simd lstm core
            */
            let corepick = document.querySelector("#core").value;
            /* the probe module carries an i8x16.splat (0xFD 0x0F): it
               parses only on simd engines, so a pre-simd browser
               answers "false" */
            const simdbinary = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,9,1,7,0,65,0,253,15,26,11]);
            const sims = WebAssembly.validate(simdbinary);
            /* fallback notes park here: the worker create wipes the
               console once it resolves, so the honest lines print after
               the clear instead of being erased unread */
            let corenote = '';
            if (corepick === "auto") corepick = legacy ? "auto" : (accuracy === "4.0.0_best" ? (sims ? "simd-lstm" : "lstm") : "auto");
            /* the relaxed-simd builds mis-link the float path (upstream
               #1080): a best-tier user pinning one falls back to the
               compatible build */
            if (accuracy === "4.0.0_best" && (corepick === "relaxedsimd-lstm" || corepick === "relaxedsimd")) {
              corenote = "Note: that core build breaks the Best tier - using the compatible SIMD build instead.";
              corepick = sims ? "simd-lstm" : "lstm";
            }
            /*
              an lstm-only core cannot run the legacy tier
            */
            if (legacy && (corepick === "lstm" || corepick === "relaxedsimd-lstm" || corepick === "simd-lstm")) {
              corenote = "Note: the Low (legacy) tier needs a full core - Auto or one of the 'Full' options works.";
              corepick = "auto";
            }
            /*  */
            if (config.ocr.engine.worker) await config.ocr.engine.worker.terminate();
            /*
              the plain core carries no variant suffix in its filename
            */
            /* the handler pins the token that was current at create
               time: it receives one arg, so a bare pass-through left
               the staleness gate skipped and a late rejection from a
               replaced worker could kill the fresh engine */
            const thistoken = config.ocr.engine.token;
            config.ocr.engine.worker = await Tesseract.createWorker(language, oem, {
              "legacyCore": legacy,
              "legacyLang": legacy,
              /*
                the per-tier cachePath keys the IndexedDB store per accuracy
                tier, so an offline tier switch loads its own model
              */
              "cachePath": accuracy,
              "workerBlobURL": false,
              "logger": config.app.update,
              "workerPath": "vendor/worker.min.js",
              "errorHandler": function (e) {config.ocr.engine.error(e, thistoken);},
              "cacheMethod": "write",
              "langPath": "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/" + accuracy,
              "corePath": corepick === "auto" ? "vendor/core" : (corepick === "plain" ? "vendor/core/tesseract-core.wasm.js" : "vendor/core/tesseract-core-" + corepick + ".wasm.js")
            });
            /*  */
            config.app.is.working(false);
            config.app.update({"clear": true});
            /*
              the stored psm/spacing/whitelist stance applies to the fresh worker before the first run
            */
            await config.ocr.engine.parameters();
            /* the parked fallback note now prints, after the clear -
               before it was erased unread */
            if (corenote) config.app.update({"status": corenote});
            /* the tutorial row block prints once per page load: every
               init (tier switch, language switch, cancel rebuild) used
               to re-print the nine rows and bury the fresh console */
            if (!config.ocr.engine.tutorial) {
              config.ocr.engine.tutorial = true;
              config.app.update({"status": "Best - better OCR accuracy"});
              config.app.update({"status": "Fast - shorter OCR time"});
              config.app.update({"status": "Moderate"});
              config.app.update({"status": "Low"});
              config.app.update({"status": "Next, choose the desired OCR accuracy."});
              config.app.update({"status": "You can select your image file via the above file I/O input area."});
              config.app.update({"status": "Drag & drop an image in the above area. Alternatively,"});
              config.app.update({"status": "Please select a language and then,"});
              config.app.update({"status": "Image Reader is ready!"});
            }
            /*  */
            config.ocr.engine.failed = false;
            config.ocr.engine.ready = true;
          } else {
            const remote = {};
            /*  */
            remote.id = "onnx-community/granite-docling-258M-ONNX";
            remote.host = "https://huggingface.co/" + remote.id;
            remote.permission = "IBM Granite Docling OCR engine needs to download pre-trained model for: " + remote.host + " \n\nTo continue, press OK. Otherwise, press Cancel and change the OCR engine. \n\nOnce downloaded, the data will be cached in memory, allowing the OCR application to function offline.";
            /*  */
            const declined = config.storage.read("permission") === false;
            const permission = config.storage.read("permission") !== undefined ? config.storage.read("permission") : window.confirm(remote.permission);
            /* persist the declined answer too, otherwise the confirm dialog
               re-appears on every reload; the settings view can re-enable it;
               write only on a real change - Firefox fires storage events for
               every set, so an unconditional rewrite re-arms init forever */
            if (config.storage.read("permission") !== permission) config.storage.write("permission", permission);
            /*  */
            if (permission) {
              /* the declined skip-flag clears here: a granted permission
                 (confirm or settings toggle) must start the engine again */
              config.ocr.engine.declined = false;
              /*  */
              let device = document.querySelector("#backend").value;
              /* going busy first keeps this block's status lines alive -
                 working() clears the console and used to erase notes
                 that printed directly before the swap */
              config.app.is.working(true);
              /* GPU probe before any model data is fetched — the download used
                 to complete on unsupported devices and fail only afterwards;
                 the probe promise itself can reject (denied feature, a
                 device dying mid-request) — the catch folds it into the
                 same no-GPU path the missing adapter already takes */
              let gpuadapter = null;
              let gpudevice = null;
              const gpu = "gpu" in navigator;
              try {gpuadapter = gpu ? await navigator.gpu.requestAdapter() : null;} catch (e) {gpuadapter = null;}
              try {gpudevice = gpuadapter ? await gpuadapter.requestDevice() : null;} catch (e) {gpudevice = null;}
              const supported = gpuadapter && gpudevice;
              /*  */
              if (!supported) {
                if (device !== "wasm") {
                  /* the fallback helper arms selfwrite: without it the
                     backend write flip-reloads this surface mid-load */
                  device = "wasm";
                  config.ocr.engine.fallbackwasm();
                }
              }
              /*  */
              config.app.update({"status": "Loading transformers.js..."});
              config.app.update({"status": "OCR > loading granite docling, please wait..."});
              /*  */
              config.ocr.engine.parser = await import(chrome.runtime.getURL("/data/interface/resources/parser.js"));
              config.ocr.engine.loadreset(remote.host);
              /* one runtime build serves both backends: the stable
                 asyncify pair (its factory carries the webgpu glue and
                 the worker pause/resume transform) - the dev build and
                 the picker around it retired after the stable pairing
                 verified on both the cpu and the gpu backend */
              const rooted = function (suffix) {
                return chrome.runtime.getURL("/data/interface/vendor/wasm/" + suffix);
              };
              const workerload = async function () {
                /*
                  the wasm (CPU) branch runs the whole generate pass
                  synchronously inside its own worker thread - the main
                  thread keeps painting, the elapsed ticker keeps counting
                  and cancel stays responsive; the model load lives in the
                  worker too, so the weights come from the shared
                  same-origin cache without a re-download
                */
                try {if (config.ocr.engine.runner) config.ocr.engine.runner.terminate();} catch (e) {}
                config.ocr.engine.runner = new Worker(chrome.runtime.getURL("/data/interface/resources/granite-worker.js"), {"type": "module"});
                const worker = config.ocr.engine.runner;
                /* the handlers compare the worker they were born with: a
                   message queued by a terminated worker must not settle
                   the fresh wait (one shared runnerwait slot) */
                config.ocr.engine.runner.onerror = function (e) {if (config.ocr.engine.runner === worker) config.ocr.engine.runnererror(e);};
                config.ocr.engine.runner.onmessage = function (e) {if (config.ocr.engine.runner === worker) config.ocr.engine.runneronmessage(e);};
                config.ocr.engine.runner.onmessageerror = function (e) {if (config.ocr.engine.runner === worker) config.ocr.engine.runnererror(e);};
                const ready = new Promise(function (resolve, reject) {
                  config.ocr.engine.runnerwait.init = {"resolve": resolve, "reject": reject};
                });
                config.ocr.engine.runner.postMessage({
                  "type": "init",
                  "id": remote.id,
                  "host": (new URL(remote.host)).origin,
                  "template": remote.id + "/resolve/main",
                  "device": "wasm",
                  "dtype": {
                    "embed_tokens": "fp32",
                    "vision_encoder": "fp32",
                    "decoder_model_merged": "fp32"
                  },
                  "wasmPaths": {
                    "mjs": rooted("ort-wasm-simd-threaded.asyncify.mjs"),
                    "wasm": rooted("ort-wasm-simd-threaded.asyncify.wasm")
                  }
                });
                await ready;
                /* the runner owns the model - the placeholder keeps the
                   ready/failed and cancel-wording gates that read the
                   transcriber truthiness */
                config.ocr.engine.transcriber = {"worker": true};
              };
              if (device === "wasm") {
                await workerload();
              } else {
                config.ocr.engine.module = await import(chrome.runtime.getURL("/data/interface/vendor/transformers.js"));
                /*  */
                config.ocr.engine.module.env.useBrowserCache = true;
                config.ocr.engine.module.env.allowLocalModels = false;
                config.ocr.engine.module.env.allowRemoteModels = true;
                config.ocr.engine.module.env.remoteHost = (new URL(remote.host)).origin;
                config.ocr.engine.module.env.remotePathTemplate = remote.id + "/resolve/main";
                /*  */
                config.ocr.engine.module.env.backends.onnx.wasm.simd = true;
                config.ocr.engine.module.env.backends.onnx.logLevel = "error";
                /* download-path warnings (missing content-length, cache
                   rejections...) are vendor noise — keep only real errors */
                config.ocr.engine.module.env.logLevel = "error";
                /* multi-threaded wasm needs SharedArrayBuffer — the thread
                   count only rises when the page is cross-origin isolated */
                config.ocr.engine.module.env.backends.onnx.wasm.numThreads = crossOriginIsolated ? navigator.hardwareConcurrency || 4 : 1;
                config.ocr.engine.module.env.backends.onnx.wasm.wasmPaths = {
                  "mjs": rooted("ort-wasm-simd-threaded.asyncify.mjs"),
                  "wasm": rooted("ort-wasm-simd-threaded.asyncify.wasm")
                };
                /* the vendor sets a high-performance power preference; chrome
                   ignores it on windows and warns — skip the option entirely */
                if (config.ocr.engine.module.env.backends.onnx.webgpu) {
                  config.ocr.engine.module.env.backends.onnx.webgpu.powerPreference = undefined;
                }
                /*  */
                const load = async function (backend) {
                  return await config.ocr.engine.module.AutoModelForVision2Seq.from_pretrained(remote.id, {
                    "device": backend,
                    "dtype": {
                      "embed_tokens": "fp32",
                      "vision_encoder": "fp32",
                      "decoder_model_merged": "fp32"
                    },
                    "progress_callback": async function (data) {
                      if (data.status === "done") {
                        /*  */
                      } else {
                        if (data.status === "progress") config.ocr.engine.loadrows(data.file, data.loaded, data.total);
                      }
                    }
                  });
                };
                /*  */
                config.ocr.engine.processor = await config.ocr.engine.module.AutoProcessor.from_pretrained(remote.id);
                try {
                  config.ocr.engine.transcriber = await load(device);
                } catch (e) {
                  /* some devices report a webgpu adapter yet the webgpu runtime
                     never initializes — heal by re-running the load on the CPU */
                  if (device !== "wasm" && ("" + (e && e.message)).toLowerCase().indexOf("webgpu") !== -1) {
                    /* the helper arms selfwrite (with its no-op expiry
                       timer): the wasm load below is already running,
                       and every other surface still reloads */
                    device = "wasm";
                    config.ocr.engine.fallbackwasm();
                    await workerload();
                  } else {
                    throw e;
                  }
                }
              }
              /*  */
              config.app.is.working(false);
              /* a cancel during the download unwind lands here: the fetch
                 cannot be stopped, so the loaded model is accepted but
                 never announced as ready until the next run re-arms */
              if (config.ocr.engine.aborted) {
                config.ocr.engine.ready = Boolean(config.ocr.engine.transcriber);
                config.ocr.engine.aborted = false;
                config.ocr.engine.failed = false;
              } else {
                config.app.update({"clear": true});
                await new Promise(resolve => window.setTimeout(resolve, 300));
                config.app.update({"status": "You can select your image file via the above file I/O input area."});
                config.app.update({"status": "Please drag & drop an image in the above area. Alternatively, "});
                config.app.update({"status": "Image Reader is ready!"});
                config.ocr.engine.failed = false;
                config.ocr.engine.ready = true;
              }
            } else {
              /*
                declined — clear the working state and point at tesseract;
                the skip-flag arms here: neither ready nor failed lands,
                so the storage listener would re-enter this init on every
                unrelated push and stack the status row
              */
              config.ocr.engine.declined = true;
              config.app.is.working(false);
              config.app.update({"status": declined ? "OCR > granite engine is disabled — allow model downloads in the settings, or switch back to the tesseract engine." : "OCR > model download declined — the tesseract engine remains available, or change the OCR engine below."});
            }
          }
        } catch (e) {
          /* the init failure carries the live token: an init error can
             land after a cancel already swapped the state */
          config.ocr.engine.error(e, config.ocr.engine.token);
          /* the abort flag is one-shot: cancel() set it to silence the
             error handler, so it must not swallow honest errors later */
          config.ocr.engine.aborted = false;
        }
      }
    }
  },
  "app": {
    "isgecko": navigator.userAgent.toLowerCase().includes("firefox"),
    "theme": {
      "value": function () {
        const stored = config.enum.value("theme");
        /*
          auto (or nothing stored) follows the OS theme; a manual choice wins
        */
        return stored && stored !== "auto" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      },
      "apply": function (attribute) {
        const iframe = document.querySelector("iframe");
        const message = {"theme": attribute, "type": "set-theme"};
        /*  */
        document.documentElement.setAttribute("theme", attribute);
        iframe.contentWindow.postMessage(message, chrome.runtime.getURL("/"));
        /*
          a closed popup window drops its message target
        */
        if (config.ocr.clipper.popup && !config.ocr.clipper.popup.closed) {
          config.ocr.clipper.popup.postMessage(message, chrome.runtime.getURL("/"));
        }
        /*
          the embedded pane rides along while it is open
        */
        if (config.ocr.clipper.open && config.ocr.clipper.frame && config.ocr.clipper.frame.contentWindow) {
          config.ocr.clipper.frame.contentWindow.postMessage(message, chrome.runtime.getURL("/"));
        }
      },
      "watch": function () {
        /*
          the stored "auto" (or unset) stance follows a live OS flip
        */
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
          const stored = config.storage.read("theme");
          if (stored === undefined || stored === "auto") config.app.theme.apply(config.app.theme.value());
        });
      }
    },
    "panes": {
      "value": function () {
        const stored = config.storage.read("sections");
        /*
          legacy two-choice values keep their meaning; unknown or
          unset falls back to the fresh-install default (both shown)
        */
        return stored === "one" || stored === "two" || stored === "html" || stored === "none" ? stored : "two";
      },
      "render": function () {
        const mode = this.value();
        return mode === "two" || mode === "html";
      }
    },
    "exports": {
      "pool": {"txt": '', "html": ''},
      "settle": null,
      "refresh": function () {
        /*
          the owner of both download blobs: the urls exist before the
          first click arrives (click-time caches resolved the old href
          first, so the very first click saved a copy of the page);
          a busy run defers the rebuild instead of churning blobs on
          every streaming token
        */
        if (config.ocr.engine.busy) return;
        const textarea = document.querySelector("textarea");
        const txt = document.querySelector("a.download");
        const html = document.querySelector("a.htmlexport");
        const shell = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Image Reader (OCR)</title>\n</head>\n<body>\n';
        /*  */
        const previous = {"txt": this.pool.txt, "html": this.pool.html};
        /* the new urls are created BEFORE the old ones die: revoke-
           first left a window where a click resolved the revoked href */
        this.pool = {"txt": '', "html": ''};
        /* the exported html reuses the doctype shell so the file stays
           out of quirks mode (the bare <div> fragment made browsers
           guess) */
        if (textarea && textarea.value) {
          this.pool.txt = URL.createObjectURL(new Blob([textarea.value], {"type": "text/plain;charset=utf-8"}));
        }
        if (window.lastHtml) {
          const clean = config.app.sanitize(window.lastHtml);
          const body = new XMLSerializer().serializeToString(clean);
          this.pool.html = URL.createObjectURL(new Blob([shell + body + '\n</body>\n</html>'], {"type": "text/html;charset=utf-8"}));
        }
        /*  */
        if (txt) txt.href = this.pool.txt || "#";
        if (html) html.href = this.pool.html || "#";
        if (previous.txt && previous.txt !== this.pool.txt) URL.revokeObjectURL(previous.txt);
        if (previous.html && previous.html !== this.pool.html) URL.revokeObjectURL(previous.html);
      }
    },
    "resize": {
      "sheet": function () {
        let stored = {};
        try {stored = JSON.parse(config.storage.read("panesizes")) || {};} catch (e) {stored = {};}
        return stored;
      },
      "maxof": function (region, skip) {
        /* the tallest a block may grow: the shared region minus the
           min-heights every OTHER visible block keeps and the room the
           visible dividers take - remounting past this grew a scrollbar
           (the drags no longer read this: a pair caps itself with its
           own total and the below block's floor) */
        let used = 0;
        region.querySelectorAll(".fileio, .console, .result, .render").forEach(function (block) {
          if (block === skip) return;
          if (getComputedStyle(block).display === "none") return;
          used += parseFloat(getComputedStyle(block).minHeight) || 0;
        });
        region.querySelectorAll(".separator, .resizer").forEach(function (rail) {
          if (!rail.getBoundingClientRect().height) return;
          used += rail.getBoundingClientRect().height;
        });
        return Math.max(60, region.clientHeight - used);
      },
      "grip": function (handle, mode, name, belowName, above, below) {
        /* a divider drag partitions the two ADJACENT blocks into one
           explicit pair: the one above picks up the pointer delta as a
           clamped px height, the one below takes the exact remainder,
           so the pair total stays constant and no height ever leaks to
           a farther edge in either stacked or split layout; the css
           min-heights set the lower bound with a shared 60px floor */
        handle.addEventListener("pointerdown", function (e) {
          if (document.documentElement.getAttribute("layout") !== mode) return;
          if (below && getComputedStyle(below).display === "none") return;
          /* transitions animate every inline height/flex write, so the
             panes lag behind the pointer and fight the instant peers -
             the attribute suspends them for the whole drag */
          document.documentElement.setAttribute("dragging", '');
          const origin = {"x": e.clientX, "y": e.clientY};
          /* the split drag carries no block pair: its reads skip the
             nulls and the moves branch takes over for the columns */
          const input = above ? above.querySelector("input[type='file']") : null;
          const floor = Math.max(above ? parseFloat(getComputedStyle(above).minHeight) || 0 : 0, input ? parseFloat(getComputedStyle(input).minHeight) || 0 : 0, 60);
          /* the pair accounts itself before the drag, in client space
             (the css border joins every written height, so client
             heights keep the trade exact): the rail joins the total or
             the first move claws it out of the below block, and the
             below floor caps how far the above block may grow */
          const rail = handle.getBoundingClientRect().height;
          const start = above ? above.clientHeight : 0;
          const startBelow = below ? below.clientHeight : 0;
          const belowFloor = below ? Math.max(parseFloat(getComputedStyle(below).minHeight) || 0, 60) : 0;
          const available = start + rail + startBelow;
          const moves = function (ev) {
            if (below) {
              const height = Math.min(available - rail - belowFloor, Math.max(floor, start + (ev.clientY - origin.y)));
              above.style.flex = "none";
              above.style.height = height + "px";
              below.style.flex = "none";
              below.style.height = (available - rail - height) + "px";
            } else {
              const content = handle.parentElement;
              const left = content.querySelector(".col.left");
              const right = content.querySelector(".col.right");
              const scale = Math.min(90, Math.max(10, ((ev.clientX - content.getBoundingClientRect().left) / content.getBoundingClientRect().width) * 100));
              left.style.flex = "none";
              left.style.width = scale.toFixed(2) + "%";
              right.style.flex = "1";
              right.style.width = '';
            }
          };
          const finish = function () {
            handle.removeEventListener("pointermove", moves);
            handle.removeEventListener("pointerup", finish);
            handle.removeEventListener("pointercancel", finish);
            handle.removeAttribute("drag");
            document.documentElement.removeAttribute("dragging");
            /* the sizes persist per layout, since the stack shares
               heights differently in rows vs columns mode */
            const stored = config.app.resize.sheet();
            if (below) {
              const layout = document.documentElement.getAttribute("layout");
              stored[name + "." + layout] = Math.round(above.clientHeight);
              /* the stacked layout is one flat pair space now: the below
                 block trades its own explicit height, so it persists too
                 - columns keeps the single absorber key, its pair lives
                 alone in one col and reproduces exactly */
              if (mode === "rows") stored[belowName + "." + layout] = Math.round(below.clientHeight);
            } else {
              /* a click without a drag must not store NaN: parseFloat
                 reads the empty width as null, so only real values land */
              const end = parseFloat(handle.parentElement.querySelector(".col.left").style.width);
              if (!Number.isNaN(end)) stored.split = end;
            }
            config.storage.write("panesizes", JSON.stringify(stored));
          };
          /* the capture pins the moves to the handle while the pointer
             leaves it - a failed capture (an already-released pointer)
             must not strand the dragging attribute mid-setup */
          try {
            handle.setPointerCapture(e.pointerId);
          } catch (err) {
            document.documentElement.removeAttribute("dragging");
            return;
          }
          handle.setAttribute("drag", '');
          handle.addEventListener("pointermove", moves);
          handle.addEventListener("pointerup", finish);
          handle.addEventListener("pointercancel", finish);
        });
      },
      "build": function () {
        const content = document.querySelector(".container .content");
        const left = document.querySelector(".content .col.left");
        const right = document.querySelector(".content .col.right");
        const fileio = document.querySelector(".container .fileio");
        const consoleel = document.querySelector(".container .console");
        const result = document.querySelector(".container .result");
        const render = document.querySelector(".container .render");
        const strip = function (name, belowName, host, aboveSel, belowSel) {
          const handle = document.createElement("div");
          const below = host.querySelector(belowSel);
          handle.className = "resizer";
          host.insertBefore(handle, below);
          config.app.resize.grip(handle, "columns", name, belowName, host.querySelector(aboveSel), below);
        };
        /*  */
        strip("fileio", "console", left, ".container .fileio", ".container .console");
        strip("result", "render", right, ".container .result", ".container .render");
        /*  */
        const split = document.createElement("div");
        split.className = "resizer split";
        content.insertBefore(split, right);
        config.app.resize.grip(split, "columns", "split", null, null);
        /* rows mode drags ride the existing separators: the full-width
           dividers between the stacked blocks react there, so no extra
           strip doubles up in the stack view */
        const leftsep = left.querySelector(".separator");
        const rightseps = right.querySelectorAll(".separator");
        config.app.resize.grip(leftsep, "rows", "fileio", "console", fileio, consoleel);
        config.app.resize.grip(rightseps[0], "rows", "console", "result", consoleel, result);
        config.app.resize.grip(rightseps[rightseps.length - 1], "rows", "result", "render", result, render);
        /*  */
        config.app.resize.watch();
      },
      "watch": function () {
        const layout = document.documentElement.getAttribute("layout");
        const stored = config.app.resize.sheet();
        const fileio = document.querySelector(".container .fileio");
        const consoleel = document.querySelector(".container .console");
        const result = document.querySelector(".container .result");
        const render = document.querySelector(".container .render");
        const left = document.querySelector(".content .col.left");
        const right = document.querySelector(".content .col.right");
        const split = document.querySelector(".content > .resizer.split");
        const renderhandle = document.querySelector(".col.right > .resizer:not(.split)");
        /* each stored height remounts on its carrier block and pins the
           absorber below it; a missing value clears the inline styles
           of both, so factory reset lands back on plain css */
        const mount = function (carrier, id, absorber) {
          const value = stored[id + "." + layout];
          /* a stored height only remounts while it still fits: a window
             resized (or stored) bigger than the current frame must not
             push the stack into a scrollbar - e.g. it re-fires whenever
             the storage listener runs, so the theme toggle lands it too;
             zero and junk never remount (a hidden pane once recorded 0) */
          if (carrier && typeof value === "number" && value > 0) {
            carrier.style.flex = "none";
            /* the stacked layout tallies across BOTH columns, so its
               ceiling reads the whole content region - the column pair
               only clamps inside its own col */
            const region = layout === "rows" ? document.querySelector(".container .content") : carrier.parentElement;
            carrier.style.height = Math.min(value, config.app.resize.maxof(region, carrier)) + "px";
            if (absorber) {
              absorber.style.flex = "1";
              absorber.style.height = '';
            }
          } else if (carrier) {
            carrier.style.flex = '';
            carrier.style.height = '';
            if (absorber) {
              absorber.style.flex = '';
              absorber.style.height = '';
            }
          }
        };
        /* the column split only arms in columns mode - inline widths
           cleared everywhere else, since rows stacks the two cols */
        if (split) split.style.display = layout === "columns" ? '' : "none";
        if (layout === "columns" && typeof stored.split === "number") {
          left.style.flex = "none";
          left.style.width = stored.split + "%";
          right.style.flex = "1";
          right.style.width = '';
        } else {
          left.style.flex = '';
          left.style.width = '';
          right.style.flex = '';
          right.style.width = '';
        }
        /* the dividers follow the pane visibility: the render divider
           dies when either of its panes sits hidden (html/none modes,
           engines that never populated the html view), and the
           right-col separator in front of the result dies with it; the
           stylesheet keeps the columns separators hidden either way */
        mount(fileio, "fileio", layout === "columns" ? consoleel : null);
        /* the stacked layout is one flat pair space: every block trades
           its own explicit height, so the console mounts as a pure
           carrier there; in columns mode the console is the absorber
           the fileio mount just armed and must not be touched again */
        if (layout === "rows") mount(consoleel, "console", null);
        mount(result, "result", render);
        if (renderhandle) {
          const shown = getComputedStyle(result).display !== "none" && getComputedStyle(render).display !== "none";
          renderhandle.style.display = shown ? '' : "none";
        }
        const rightseps = right.querySelectorAll(".separator");
        if (rightseps.length === 2) {
          const resultshown = getComputedStyle(result).display !== "none";
          const rendershown = getComputedStyle(render).display !== "none";
          rightseps[0].style.display = resultshown ? '' : "none";
          rightseps[1].style.display = resultshown && rendershown ? '' : "none";
        }
      }
    },
    "icon": function (host, viewBox, drawings) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      /*  */
      svg.setAttribute("viewBox", viewBox);
      drawings.forEach(function (item) {
        const node = document.createElementNS("http://www.w3.org/2000/svg", item.tag || "path");
        Object.keys(item).forEach(function (key) {
          if (key !== "tag" && key !== "child") node.setAttribute(key, item[key]);
        });
        /*
          some glyphs (rerun) ride inside a transformed group
        */
        if (item.child) {
          const inner = document.createElementNS("http://www.w3.org/2000/svg", item.child.tag || "path");
          Object.keys(item.child).forEach(function (key) {
            if (key !== "tag") inner.setAttribute(key, item.child[key]);
          });
          node.appendChild(inner);
        }
        svg.appendChild(node);
      });
      /*  */
      host.appendChild(svg);
    },
    "sanitize": function (html) {
      /* the walker lives once in resources/sanitizer.js - both
         surfaces (this page and the render pane) load that file */
      return sanitizer.run(html);
    },
    "handle": {
      "clip": {
        "result": function (blob) {
          /* the dataURL joins lastFile so the run rests like a picked
             file - rerun and the tier/language changes re-clip it */
          config.ocr.engine.start(window.lastFile = blob);
        }
      }
    },
    "file": {
      "to": {
        "dataURL": function (file) {
          return new Promise((resolve, reject) => {
            if (typeof file === "string" && file.startsWith("data:")) {
              resolve(file);
            } else {
              const reader = new FileReader();
              /*  */
              reader.onerror = reject;
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            }
          });
        },
        /* the image preparation pass for the tesseract engine:
           grayscale, auto-invert, Otsu threshold, a white border pad
           and an upscale for small screenshots */
        "prepared": async function (file) {
          const url = await config.app.file.to.dataURL(file);
          const image = new Image();
          image.src = url;
          await image.decode();
          /*  */
          const scale = image.naturalHeight && image.naturalHeight < 300 ? Math.min(3, 300 / image.naturalHeight) : 1;
          const pad = 10;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.naturalWidth * scale) + pad * 2;
          canvas.height = Math.round(image.naturalHeight * scale) + pad * 2;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, pad, pad, Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixel = frame.data;
          const grey = new Uint8ClampedArray(pixel.length / 4);
          const histogram = new Array(256).fill(0);
          /*  */
          let sum = 0;
          for (let i = 0; i < grey.length; i++) {
            const value = Math.round(0.299 * pixel[i * 4] + 0.587 * pixel[i * 4 + 1] + 0.114 * pixel[i * 4 + 2]);
            grey[i] = value;
            histogram[value]++;
            sum += value;
          }
          /* Otsu threshold: the cutoff maximizes the between-class
             variance of the grey histogram */
          const total = grey.length;
          const totalsum = sum;
          let cutoff = 128;
          let weightsum = 0;
          let classsum = 0;
          let score = 0;
          for (let t = 0; t < 256; t++) {
            weightsum += histogram[t];
            if (!weightsum) continue;
            classsum += t * histogram[t];
            const first = weightsum;
            const second = total - weightsum;
            if (!second) break;
            const below = classsum / first;
            const above = (totalsum - classsum) / second;
            const between = first * second * (below - above) * (below - above);
            if (between > score) {
              score = between;
              cutoff = t;
            }
          }
          /* a dark shot (mean under the mid point) flips to dark text
             on a light background before the binarization; the flip
             mirrors the greys, so the cut mirrors with it - the plain
             cut erased the whole ink of a dark screenshot (all white) */
          const mean = sum / total;
          const flip = mean < 128;
          for (let i = 0; i < grey.length; i++) {
            let value = grey[i];
            if (flip) value = 255 - value;
            const ink = value < (flip ? 255 - cutoff : cutoff) ? 0 : 255;
            pixel[i * 4] = ink;
            pixel[i * 4 + 1] = ink;
            pixel[i * 4 + 2] = ink;
          }
          ctx.putImageData(frame, 0, 0);
          /*
            the engine consumes a png blob of the prepared canvas
          */
          const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
          /* the encoder resolves null on a torn-down canvas: the run
             falls back to the raw file instead of recognize(null) */
          return blob || file;
        }
      }
    },
    "is": {
      "working": function (flag) {
        const log = document.querySelector(".console");
        const fileio = document.querySelector(".fileio");
        const choose = document.querySelector("#choose");
        const engine = document.querySelector("#engine");
        const backend = document.querySelector("#backend");
        const language = document.querySelector("#language");
        const accuracy = document.querySelector("#accuracy");
        const selector = document.getElementById("screenshot");
        const gated = [...document.querySelectorAll("#core, #psm, #spacing, #whitelist")];
        /*  */
        config.ocr.engine.busy = flag;
        /* a run started from the main surface reclaims the right
           column: the open clipper pane steps aside for the result */
        if (flag && config.ocr.clipper.open) config.ocr.clipper.dismiss();
        /* every settled run (done, cancelled, failed) retires the
           wait-ticker with its striped row */
        if (!flag) config.app.tick.stop();
        choose.disabled = flag;
        engine.disabled = flag;
        backend.disabled = flag;
        language.disabled = flag;
        accuracy.disabled = flag;
        for (let i = 0; i < gated.length; i++) gated[i].disabled = flag;
        if (flag) log.textContent = '';
        fileio.style.opacity = flag ? "0.7" : "1.0";
        choose.style.cursor = flag ? "not-allowed" : "pointer";
        /*  */
        if (selector) flag ? selector.setAttribute("disabled", '') : selector.removeAttribute("disabled");
        /* the action-cluster cancel anchor covers cancellation; the busy
           state also gates the permanent action cluster */
        config.app.text.state();
      }
    },
    "start": function () {
      /*  */
      config.settings.sync();
      config.settings.render();
      /* the persisted pane sizes remount once the mirror is filled:
         build's first pass runs before storage.load answers, so a plain
         boot painted defaults until this re-read lands the stored ones */
      config.app.resize.watch();
      /*  */
      document.querySelector("#choose").value = '';
      document.querySelector("textarea").value = '';
      /* a reset or an import lands here mid-session: sync would re-arm
         the html pane on the surviving frame src, so the stale run
         surfaces retire explicitly - the confirm dialog promises a
         wiped reader state, and the export gate follows lastHtml; the
         rerun gate follows lastFile, so the image retiree clears too */
      window.lastHtml = null;
      window.lastFile = null;
      const iframe = document.querySelector("iframe");
      iframe && iframe.contentWindow && iframe.contentWindow.postMessage({"type": "clear-content"}, chrome.runtime.getURL("/"));
      document.documentElement.removeAttribute("render");
      /*  */
      const consent = config.storage.read("consent") !== undefined ? config.storage.read("consent") : false;
      document.querySelector(".consent").style.display = consent ? "none" : "block";
      /* engine and its remote downloads start only after the consent
         notice is accepted at least once */
      if (consent) config.ocr.engine.init();
      /*
        the watermark attribute follows the empty result text
      */
      config.app.text.state();
    },
    "text": {
      "state": function () {
        const gates = {};
        const textarea = document.querySelector("textarea");
        const result = document.querySelector(".result");
        const busy = config.ocr.engine.busy;
        /*
          the watermark follows the same text truth as the buttons
        */
        if (result) {
          textarea && textarea.value ? result.setAttribute("filled", '') : result.removeAttribute("filled");
        }
        /* each button disables itself when it has nothing to act on; the
           strip goes dark while a run is in progress */
        gates.rerun = Boolean(window.lastFile) && !busy;
        gates.htmlexport = Boolean(window.lastHtml) && !busy;
        /*
          the export urls renew with the settled text - debounced so a
          keystroke stream rebuilds the blob pair once, on the tail
        */
        window.clearTimeout(config.app.exports.settle);
        config.app.exports.settle = window.setTimeout(function () {
          config.app.exports.refresh();
        }, 300);
        gates.copy = Boolean(textarea && textarea.value) && !busy;
        gates.print = Boolean(textarea && textarea.value) && !busy;
        gates.download = Boolean(textarea && textarea.value) && !busy;
        gates.cancel = busy;
        /*  */
        Object.keys(gates).forEach(function (key) {
          const anchor = document.querySelector("a." + key);
          /*  */
          if (!anchor) return;
          if (gates[key]) anchor.removeAttribute("disabled");
          else anchor.setAttribute("disabled", "");
        });
      },
      "cluster": function () {
        const actions = document.querySelector(".toolbar .actions");
        /*  */
        if (!actions || actions.childElementCount) return;
        const textarea = document.querySelector("textarea");
        /*
          rerun: re-processes the last picked / dropped / pasted image
        */
        const rerun = document.createElement('a');
        rerun.className = "rerun";
        rerun.href = "#";
        rerun.title = "Click to run the OCR again on the current image";
        rerun.addEventListener("click", function (e) {
          e.preventDefault();
          config.ocr.engine.start(window.lastFile);
        });
        /*
          html export: the granite docling result as an .html file
        */
        const htmlexport = document.createElement('a');
        htmlexport.className = "htmlexport";
        htmlexport.href = "#";
        htmlexport.title = "Click to download the OCR result as an HTML file";
        htmlexport.setAttribute("download", "ocr_result.html");
        /* the blob lives with config.app.exports: it is built when the
           result lands and never from inside the click - a click-time
           cache resolved the old href first and saved a copy of the page */
        htmlexport.addEventListener("click", function (e) {
          if (!window.lastHtml) {
            e.preventDefault();
            window.alert("Run an OCR first, then export the HTML result.");
          }
        });
        /*
          copy: the OCR text to the clipboard
        */
        const copy = document.createElement('a');
        copy.className = "copy";
        copy.href = "#";
        copy.title = "Click to copy the OCR text to the clipboard";
        copy.addEventListener("click", async function (e) {
          e.preventDefault();
          try {
            copy.classList.add("pending");
            await navigator.clipboard.writeText(textarea.value);
            await new Promise(resolve => window.setTimeout(resolve, 300));
          } catch (e) {
            window.alert("Error! Failed to copy the OCR text to the clipboard!");
          } finally {
            copy.classList.remove("pending");
          }
        });
        /*
          print: runs through the html render frame
        */
        const print = document.createElement('a');
        print.className = "print";
        print.href = "#";
        print.title = "Click to print the OCR text";
        print.addEventListener("click", function (e) {
          e.preventDefault();
          const render = document.querySelector("iframe");
          render.contentWindow.postMessage({"type": "print"}, chrome.runtime.getURL("/"));
        });
        /* cancel: aborts the running job from the top strip; the busy
           state enables it, a click unwinds the streamer and reloads
           the engine */
        const cancel = document.createElement('a');
        cancel.className = "cancel";
        cancel.href = "#";
        cancel.title = "Click to cancel the running OCR";
        cancel.addEventListener("click", function (e) {
          e.preventDefault();
          config.ocr.engine.cancel();
        });
        /* download: ocr_result.txt is built from the live textarea; the
           blob renews in config.app.exports whenever the text settles,
           so the click only guards an empty result */
        const download = document.createElement('a');
        download.className = "download";
        download.href = "#";
        download.download = "ocr_result.txt";
        download.title = "Click to download the OCR text as ocr_result.txt";
        download.addEventListener("click", function (e) {
          if (!textarea.value) {
            e.preventDefault();
            window.alert("Run an OCR first, then download the text.");
          }
        });
        /*  */
        config.app.icon(rerun, "0 0 16 16", [{"d": "M 7.9511719,0.12304688 C 7.217761,0.85643294 6.4837818,1.5892506 5.75,2.3222656 L 9.859375,6.4355469 H 0.16601562 V 9.5644531 H 9.859375 L 5.75,13.677734 7.9511719,15.876953 15.828125,8 Z"}]);
        config.app.icon(htmlexport, "0 0 96 96", [
          {"d": "M24.8452,25.3957a6.0129,6.0129,0,0,0-8.4487.7617L1.3974,44.1563a5.9844,5.9844,0,0,0,0,7.687L16.3965,69.8422a5.9983,5.9983,0,1,0,9.21-7.687L13.8068,48l11.8-14.1554A6,6,0,0,0,24.8452,25.3957Z"},
          {"d": "M55.1714,12.1192A6.0558,6.0558,0,0,0,48.1172,16.83L36.1179,76.8262A5.9847,5.9847,0,0,0,40.8286,83.88a5.7059,5.7059,0,0,0,1.1835.1172A5.9949,5.9949,0,0,0,47.8828,79.17L59.8821,19.1735A5.9848,5.9848,0,0,0,55.1714,12.1192Z"},
          {"d": "M94.6026,44.1563,79.6035,26.1574a5.9983,5.9983,0,1,0-9.21,7.687L82.1932,48l-11.8,14.1554a5.9983,5.9983,0,1,0,9.21,7.687L94.6026,51.8433A5.9844,5.9844,0,0,0,94.6026,44.1563Z"}
        ]);
        config.app.icon(copy, "0 0 48 48", [{"d": "M32 2h-24c-2.21 0-4 1.79-4 4v28h4v-28h24v-4zm6 8h-22c-2.21 0-4 1.79-4 4v28c0 2.21 1.79 4 4 4h22c2.21 0 4-1.79 4-4v-28c0-2.21-1.79-4-4-4zm0 32h-22v-28h22v28z"}]);
        config.app.icon(print, "0 0 122.8799 122.8799", [{"d": "M 20.088461,7.796912 C 20.115373,17.021043 20.088461,22.426355 20.088461,31.855404 H 1.3632812 V 72.542113 93.182435 H 8.5107284 16.868272 V 83.966309 H 10.579408 V 69.439095 H 112.60728 V 83.966309 H 106.34266 V 93.182435 H 121.84766 V 83.966309 H 121.82342 V 63.57649 31.855404 C 121.69342,31.83149 121.58213,31.806716 121.45372,31.782677 V 31.855404 H 102.72854 V 7.796912 Z M 20.19553,76.671389 V 115.21871 H 103.0942 V 76.671389 Z"}]);
        config.app.icon(cancel, "0 0 512 512", [{"d": "M 82.862259 37.926784 L 31.885746 88.903298 L 201.8354 258.85296 L 31.885746 428.80262 L 82.862259 479.82105 L 252.81192 309.87139 L 422.76158 479.82105 L 473.73809 428.80262 L 303.78843 258.85296 L 473.73809 88.903298 L 422.76158 37.926784 L 252.81192 207.87644 L 82.862259 37.926784 z"}]);
        config.app.icon(download, "0 0 18 18", [{"d": "M14,0 L2,0 C0.9,0 0,0.9 0,2 L0,16 C0,17.1 0.9,18 2,18 L16,18 C17.1,18 18,17.1 18,16 L18,4 L14,0 L14,0 Z M9,16 C7.3,16 6,14.7 6,13 C6,11.3 7.3,10 9,10 C10.7,10 12,12.7 12,13 C12,14.7 10.7,16 9,16 L9,16 Z M12,6 L2,6 L2,2 L12,2 L12,6 L12,6 Z"}]);
        /*  */
        /*
          data actions first, text actions second, cancel last
        */
        [rerun, htmlexport, copy, print, download, cancel].forEach(function (anchor) {
          actions.appendChild(anchor);
        });
      }
    },
    "tick": {
      "timer": null,
      "node": null,
      "seconds": 0,
      "label": '',
      "start": function (label) {
        /* the silent phases have no vendor callback to hang a percent
           on, so the wait row names its phase and counts the seconds:
           the number rides in the label, and the row-key normalization
           folds the ticker into ONE row (the striped bar sits with it);
           the first streaming token ends the estimate phase */
        config.app.tick.stop();
        config.app.tick.seconds = 0;
        config.app.tick.label = label;
        /* the suffix rides from second zero: the row key normalizes
           numbers, so the ticker and every later tick share ONE row */
        config.app.update({"status": label + " (0s elapsed)", "bar": true});
        config.app.tick.timer = window.setInterval(function () {
          config.app.tick.seconds += 1;
          config.app.update({"status": config.app.tick.label + " (" + config.app.tick.seconds + "s elapsed)", "bar": true});
        }, 1000);
      },
      "stop": function () {
        if (config.app.tick.timer) window.clearInterval(config.app.tick.timer);
        config.app.tick.timer = null;
        if (config.app.tick.node) config.app.tick.node.remove();
        config.app.tick.node = null;
      }
    },
    "update": function (e) {
      const current = {};
      const line = document.createElement("div");
      const status = document.createElement("div");
      const log = document.querySelector(".console");
      const result = document.querySelector(".result");
      const textarea = document.querySelector("textarea");
      const cond = {"is": {"valid": {}}, "has": {}};
      /*  */
      /* clear-only pushes and the streaming text feed leave before the
         console-row build touches them - e.clear carries no status and
         reading it below crashed every engine start */
      if (e && e.clear) {
        log.textContent = '';
        return;
      }
      /* the bare call reaches the label read below: every payload read
         in this function already guards, so an empty object simply
         renders the no-status skip row */
      if (!e) e = {};
      /* the payload flags come before the early-returns: the streaming
         "ontext" feed reads cond.has.data, so a late assignment would
         stream nothing into the result textarea until the run ends */
      cond.has.data = e && e.data && e.data.data;
      cond.has.progress = e && "progress" in e && typeof e.progress !== "undefined";
      cond.is.valid.progress = cond.has.progress && !Number.isNaN(Number(e.progress));
      /* the wait-ticker carries a bar with no value: a native progress
         element stays indeterminate (striped) until a real number lands */
      cond.has.bar = e && e.bar === true;
      /*  */
      if (e.status === "done") {
        log.textContent = '';
      }
      /* the old inline background reset is gone: the watermark was
         always the ::before pseudo gated on the filled attribute */
      /*  */
      if (e.status === "ontext") {
        textarea.value += cond.has.data ? e.data.data.text : '';
        config.app.text.state();
        return;
      }
      /* the tesseract logger feeds its raw vendor strings here: trim
         the stray indentation and give them the app log prefix so the
         rows read like the rest of the console; a statusless push
         formats as an empty label instead of crashing */
      current.label = typeof e.status === "string" ? e.status : String(e.status || "");
      const vendorlog = current.label.startsWith("loading tesseract core");
      /* seventeen call sites already ship their own prefix - a double
         " > OCR > ..." read worse than the raw vendor lines did, so an
         already-prefixed label passes through untouched */
      const own = current.label.startsWith("OCR >") || current.label.startsWith("Error >");
      current.text = own ? current.label.trim() : (vendorlog ? "OCR > " : " > ") + current.label.trim();
      /* a payload with neither label, text nor progress renders no row:
         the bare " > " placeholder would just dangle in the log (the
         guard reads the label, not the prefixed text - the prefix
         alone trims to a truthy ">" and used to leak a bare row) */
      if (!current.label.trim() && !cond.has.progress) return;
      /*  */
      if (e.status === "done") {
        textarea.value = cond.has.data ? e.data.data.text : "Error!";
        /* the busy latch releases before the cluster re-gates: the
           tesseract/granite sites used to release before this call and
           re-opened the tail of the double-run window the head guard
           closes - the done bookkeeping (deliver, re-gate) now runs
           under one synchronous task */
        config.app.is.working(false);
        /*  */
        if (cond.has.data) {
          status.setAttribute(e.status, '');
          /* the sentence counts whatever the engine produced: the
             confidence word joins only when the number exists (the v6
             shape), the structure counts carry v7 and granite runs
             alike - the counters join as one sentence so no dangling
             separator remains when a tier omits a group; a legit 0%
             run keeps its counters too (the truthy check used to drop
             it) */
          const counts = [];
          if (typeof e.data.data.confidence === "number") counts.push(e.data.data.confidence + "% confidence");
          const label = function (list, word) {
            counts.push(list.length + " " + word + (list.length === 1 ? '' : 's'));
          };
          if (e.data.data.symbols) label(e.data.data.symbols, "symbol");
          if (e.data.data.words) label(e.data.data.words, "word");
          if (e.data.data.lines) label(e.data.data.lines, "line");
          if (e.data.data.paragraphs) label(e.data.data.paragraphs, "paragraph");
          current.text = "OCR > extraction is done!" + (counts.length ? " " + counts.join(", ") : '');
        } else {
          current.text = "OCR > extraction is done!";
        }
        /* paragraphs land in the html render frame — posted as plain strings,
           the frame builds the <p> nodes itself */
        if (cond.has.data && e.data.data.paragraphs && e.data.data.paragraphs.length) {
          const iframe = document.querySelector("iframe");
          const origin = chrome.runtime.getURL("/");
          const target = chrome.runtime.getURL("/data/interface/iframe/index.html");
          const deliver = function () {
            iframe.contentWindow.postMessage({"theme": config.app.theme.value(), "type": "set-theme"}, origin);
            iframe.contentWindow.postMessage({"type": "set-paragraphs", "paragraphs": e.data.data.paragraphs}, origin);
          };
          /*  */
          if (iframe.src !== target) {
            iframe.src = target;
            iframe.addEventListener("load", deliver, {"once": true});
          } else {
            deliver();
          }
          /*
            the frame stays fed for print even when the pane is off;
            the panes helper decides the visibility
          */
          if (config.app.panes.render()) {
            document.documentElement.setAttribute("render", "on");
          }
          config.app.resize.watch();
        }
      }
      /* the row is one line: a plain span with the CSS ellipsis doing
         the clipping — no pre-split budgets, no second line — and the
         green progress state rides on the status itself (attribute +
         custom property) instead of a separate bar element; the shimmer
         attribute is only re-set when missing, because a remove + re-add
         would restart the sweep animation on every ticker tick */
      const paint = function (host, text) {
        const span = document.createElement("span");
        host.textContent = '';
        span.textContent = text;
        host.appendChild(span);
        if (cond.is.valid.progress) {
          host.removeAttribute("data-shimmer");
          host.setAttribute("data-progress", '');
          host.style.setProperty("--fill", (Number(e.progress) * 100).toFixed(1) + "%");
        } else if (cond.has.bar) {
          if (!host.hasAttribute("data-shimmer")) host.setAttribute("data-shimmer", '');
          host.removeAttribute("data-progress");
          host.style.removeProperty("--fill");
        } else {
          host.removeAttribute("data-shimmer");
          host.removeAttribute("data-progress");
          host.style.removeProperty("--fill");
        }
      };
      /* the match key normalizes every number (%, MB, sizes...) so a
         streaming progress row updates in place instead of spawning
         a fresh one on every tick */
      current.key = current.text.replace(/[0-9][0-9.,]*/g, '#');
      /* repeated statuses update their existing console line in place
         instead of appending a fresh row on every progress tick */
      current.match = null;
      current.existing = Array.prototype.slice.call(log.children);
      /*  */
      current.existing.forEach(function (node) {
        if (node.key !== current.key) return;
        if ((cond.is.valid.progress || cond.has.bar) && !node.querySelector(".status[data-progress], .status[data-shimmer]")) return;
        if (!current.match) current.match = node;
        else node.remove();
      });
      /*  */
      if (current.match) {
        paint(current.match.querySelector(".status"), current.text);
        if (cond.has.bar) config.app.tick.node = current.match;
        /* the row updates in place and keeps its slot - a bump-to-top
           would shuffle the whole granite download block on every tick */
        return;
      }
      /*  */
      line.status = e.status;
      line.key = current.key;
      status.className = "status";
      paint(status, current.text);
      line.appendChild(status);
      log.insertBefore(line, log.firstChild);
      /* the wait-ticker owns its own row reference: the stop() call
         removes the shimmer row the moment real numbers take over */
      if (cond.has.bar) config.app.tick.node = line;
      /*  */
      while (log.childElementCount > 60) log.removeChild(log.lastChild);
    }
  }
};

config.port.connect();

document.addEventListener("drop", config.drop.pick, true);
document.addEventListener("dragover", config.drop.over, true);
document.addEventListener("dragleave", config.drop.leave, true);

/* clipboard image paste (Ctrl+V) — no permissions needed; text spots and
   a busy engine keep the browser's own paste */
window.addEventListener("paste", function (e) {
  const tag = document.activeElement ? document.activeElement.tagName : '';
  /*  */
  if (tag === "TEXTAREA" || tag === "INPUT") return;
  const files = e.clipboardData ? e.clipboardData.files : null;
  /* only image payloads take over the paste; everything else keeps
     the browser's own text paste behavior - ready/busy answering
     lives in engine.start, the single gate */
  if (files && files.length && files[0].type && files[0].type.indexOf("image/") === 0) {
    e.preventDefault();
    config.ocr.engine.start(window.lastFile = files[0]);
  }
});

window.addEventListener("load", config.load, false);
window.addEventListener("resize", config.resize.method, false);

