var config  = {
  "addon": {
    "homepage": function () {
      return chrome.runtime.getManifest().homepage_url;
    }
  },
  "cancel": {
    "drop": function (e) {
      if (e.target.id === "choose") return;
      e.preventDefault();
    }
  },
  "resize": {
    "timeout": null,
    "method": function () {
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
            chrome.runtime.connect({"name": config.port.name});
          }
        }
      }
      /*  */
      document.documentElement.setAttribute("context", config.port.name);
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
  "ocr": {
    "engine": {
      "start": async function (file, fromcache) {
        const log = document.getElementById("log");
        const language = document.querySelector("#language");
        const accuracy = document.querySelector("#accuracy");
        /*  */
        const line = document.createElement("div");
        const status = document.createElement("div");
        const text = "OCR > loading tesseract.js, please wait...";
        /*  */
        log.textContent = '';
        status.className = "status";
        status.appendChild(document.createTextNode(text));
        line.appendChild(status);
        log.insertBefore(line, log.firstChild);
        /*  */
        const worker = await Tesseract.createWorker(language.value, '3', {
          "workerBlobURL": false,
          "corePath": "vendor/core",
          "logger": config.app.update,
          "workerPath": "vendor/worker.min.js",
          "cacheMethod": fromcache ? "write" : "refresh",
          "langPath": "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/" + accuracy.value
        });
        /*
          await worker.setParameters({
            "save_raw_choices": '0',
            "enable_new_segsearch": '0'
          });
        */
        config.app.is.working(true);
        const data = await worker.recognize(file);
        await worker.terminate();
        config.app.is.working(false);
        /*  */
        config.app.update({"status": "done", "data": data});
      }
    }
  },
  "load": function () {
    const theme = document.querySelector(".theme");
    const reload = document.getElementById("reload");
    const choose = document.querySelector("#choose");
    const support = document.getElementById("support");
    const consent = document.querySelector("#consent");
    const language = document.querySelector("#language");
    const accuracy = document.querySelector("#accuracy");
    const donation = document.getElementById("donation");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    }, false);
    /*  */
    accuracy.addEventListener("change", function (e) {
      config.storage.write("accuracy", e.target.selectedIndex);
      window.lastFile && config.ocr.engine.start(window.lastFile, false);
    });
    /*  */
    language.addEventListener("change", function (e) {
      config.storage.write("language", e.target.selectedIndex);
      window.lastFile && config.ocr.engine.start(window.lastFile, true);
    });
    /*  */
    consent.addEventListener("click", function () {
      config.storage.write("consent", true);
      document.querySelector(".consent").style.display = "none";
    });
    /*  */
    support.addEventListener("click", function () {
      const url = config.addon.homepage();
      chrome.tabs.create({"url": url, "active": true});
    }, false);
    /*  */
    donation.addEventListener("click", function () {
      const url = config.addon.homepage() + "?reason=support";
      chrome.tabs.create({"url": url, "active": true});
    }, false);
    /*  */
    choose.addEventListener("change", function () {
      if (this.files && this.files.length) {
        config.ocr.engine.start(window.lastFile = this.files[0], true);
      }
    });
    /*  */
    theme.addEventListener("click", function () {
      let attribute = document.documentElement.getAttribute("theme");
      attribute = attribute === "dark" ? "light" : "dark";
      /*  */
      document.documentElement.setAttribute("theme", attribute);
      config.storage.write("theme", attribute);
    }, false);
    /*  */
    config.storage.load(config.app.start);
    window.removeEventListener("load", config.load, false);
  },
  "app": {
    "is": {
      "working": function (flag) {
        const log = document.getElementById("log");
        const fileio = document.querySelector(".fileio");
        const choose = document.querySelector("#choose");
        const language = document.querySelector("#language");
        const accuracy = document.querySelector("#accuracy");
        /*  */
        choose.disabled = flag;
        language.disabled = flag;
        accuracy.disabled = flag;
        if (flag) log.textContent = '';
        fileio.style.opacity = flag ? "0.7" : "1.0";
        choose.style.cursor = flag ? "not-allowed" : "pointer";
      }
    },
    "start": function () {
      const context = document.documentElement.getAttribute("context");
      const theme = config.storage.read("theme") !== undefined ? config.storage.read("theme") : "light";
      const accuracy = config.storage.read("accuracy") !== undefined ? config.storage.read("accuracy") : 3;
      const language = config.storage.read("language") !== undefined ? config.storage.read("language") : 14;
      /*  */
      document.querySelector("#accuracy").selectedIndex = accuracy;
      document.querySelector("#language").selectedIndex = language;
      document.documentElement.setAttribute("theme", theme !== undefined ? theme : "light");
      /*  */
      config.app.update({"status": "(1) Low, (2) Moderate, (3) Fast - shorter OCR time, (4) Best - better OCR accuracy"});
      config.app.update({"status": "Next, choose the desired OCR accuracy."});
      config.app.update({"status": "Alternatively, you can select your image file via the above file I/O input area."});
      config.app.update({"status": "Please select a language and then drag & drop an image in the above area."});
      config.app.update({"status": "Image Reader is ready!"});
      /*  */
      if (context !== "webapp") {
        const consent = config.storage.read("consent") !== undefined ? config.storage.read("consent") : false;
        document.querySelector(".consent").style.display = consent ? "none" : "block";
      }
    },
    "text": {
      "download": function () {
        const textarea = document.querySelector("textarea");
        if (textarea.value) {
          const log = document.getElementById("log");
          const download = document.createElement('a');
          const blob = new Blob([textarea.value], {"type": "text/html"});
          /*  */
          download.textContent = '↓';
          download.className = "download";
          download.download = "ocr_result.txt";
          download.href = URL.createObjectURL(blob);
          download.title = "Click to download the OCR text as ocr_result.txt";
          /*  */
          log.appendChild(download);
        }
      },
      "copy": function () {
        const textarea = document.querySelector("textarea");
        if (textarea.value) {
          const copy = document.createElement('a');
          const log = document.getElementById("log");
          /*  */
          copy.className = "copy";
          copy.textContent = '⧉';
          copy.title = "Click to copy the OCR text to the clipboard";
          /*  */
          copy.addEventListener("click", async function () {
            try {
              copy.classList.add("pending");
              await navigator.clipboard.writeText(textarea.value);
              await new Promise(resolve => window.setTimeout(resolve, 300));
              copy.classList.remove("pending");
            } catch (e) {
              window.alert("Error! Failed to copy the OCR text to the clipboard!");
            }
          });
          /*  */
          log.appendChild(copy);
        }
      }
    },
    "update": function (e) {
      const log = document.getElementById("log");
      if (e.progress) log.style.backgroundImage = "none";
    	const samestatus = log.firstChild && log.firstChild.status === e.status;
    	/*  */
    	if (samestatus) {
    		if ("progress" in e) {
    			const progress = log.firstChild.querySelector("progress");
    			progress.value = e.progress;
    		}
    	} else {
        let text = " > " + e.status;
    		const line = document.createElement("div");
    		const status = document.createElement("div");
    		/*  */
        line.status = e.status;
    		status.className = "status";
        /*  */
    		if ("progress" in e) {
    			const progress = document.createElement("progress");
    			progress.value = e.progress;
    			progress.max = 1;
    			line.appendChild(progress);
    		}
        /*  */
        if (e.status === "done") {
          status.setAttribute(e.status, '');
          /*  */
          const str_0 = "OCR > extraction is done! " + (e.data.data && e.data.data.confidence ? e.data.data.confidence + "% confidence, " : '');
          const str_1 = e.data.data.symbols ? e.data.data.symbols.length + " symbol" + (e.data.data.symbols.length === 1 ? '' : 's') + ", " : '';
          const str_2 = e.data.data.words ? e.data.data.words.length + " word" + (e.data.data.words.length === 1 ? '' : 's') + ", " : '';
          const str_3 = e.data.data.lines ? e.data.data.lines.length + " line" + (e.data.data.lines.length === 1 ? '' : 's') + ", " : '';
          const str_4 = e.data.data.paragraphs ? e.data.data.paragraphs.length + " paragraph" + (e.data.data.paragraphs.length === 1 ? '' : 's') + " " : '';
          /*  */
          text = str_0 + str_1 + str_2 + str_3 + str_4;
        }
        /*  */
    		status.appendChild(document.createTextNode(text));
    		line.appendChild(status);
        log.insertBefore(line, log.firstChild);
    		/*  */
    		if (e.status === "done") {
    			const div = document.createElement("div");
    			const textarea = document.createElement("textarea");
    			textarea.value = e.data.data.text;
          div.className = "result";
          div.appendChild(textarea);
          log.insertBefore(div, log.firstChild);
          /*  */
          config.app.text.copy();
          config.app.text.download();
    		}
    	}
    }
  }
};

config.port.connect();

document.addEventListener("drop", config.cancel.drop, true);
document.addEventListener("dragover", config.cancel.drop, true);

window.addEventListener("load", config.load, false);
window.addEventListener("resize", config.resize.method, false);
