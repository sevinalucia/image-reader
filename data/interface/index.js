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
  "load": function () {
    const theme = document.querySelector(".theme");
    const reload = document.getElementById("reload");
    const engine = document.querySelector("#engine");
    const choose = document.querySelector("#choose");
    const support = document.getElementById("support");
    const consent = document.querySelector("#consent");
    const backend = document.querySelector("#backend");
    const language = document.querySelector("#language");
    const accuracy = document.querySelector("#accuracy");
    const donation = document.getElementById("donation");
    const selector = document.querySelector(".selector");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    }, false);
    /*  */
    accuracy.addEventListener("change", function (e) {
      config.storage.write("accuracy", e.target.selectedIndex);
      window.lastFile && config.ocr.engine.init(false);
    });
    /*  */
    language.addEventListener("change", function (e) {
      config.storage.write("language", e.target.selectedIndex);
      window.lastFile && config.ocr.engine.init(true);
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
        config.ocr.engine.start(window.lastFile = this.files[0]);
      }
    });
    /*  */
    engine.addEventListener("change", function (e) {
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
    theme.addEventListener("click", function () {
      let attribute = document.documentElement.getAttribute("theme");
      attribute = attribute === "dark" ? "light" : "dark";
      /*  */
      const iframe = document.querySelector("iframe");
      const message = {"theme": attribute, "type": "set-theme"};
      /*  */
      config.storage.write("theme", attribute);
      iframe.contentWindow.postMessage(message, '*');
      document.documentElement.setAttribute("theme", attribute);
      /*  */
      if (config.ocr.clipper.popup) {
        config.ocr.clipper.popup.postMessage(message, '*');
      }
    }, false);
    /*  */
    selector.addEventListener("click", function () {
      const metrics = {};
      /*  */
      metrics.width = 600; // window.outerWidth * 0.75
      metrics.height = 800; // window.outerHeight * 0.75;
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
    config.storage.load(config.app.start);
    window.removeEventListener("load", config.load, false);
  },
  "ocr": {
    "clipper": {
      "popup": null
    },
    "engine": {
      "parser": null,
      "worker": null,
      "module": null,
      "start": async function (file) {
        const copy = document.querySelector(".copy");
        const print = document.querySelector(".print");
        const iframe = document.querySelector("iframe");        
        const choose = document.querySelector("#choose");
        const textarea = document.querySelector("textarea");
        const download = document.querySelector(".download");
        const theme = config.storage.read("theme") !== undefined ? config.storage.read("theme") : "light";
        const engine = config.storage.read("engine") !== undefined ? config.storage.read("engine") : "tesseract";
        /*  */
        if (copy) copy.remove();
        if (print) print.remove();
        if (download) download.remove();
        /*  */
        const url = await config.app.file.to.dataURL(file);
        choose.style.backgroundSize = "contain";
        choose.style.backgroundPosition = "center";
        choose.style.backgroundRepeat = "no-repeat";
        choose.style.backgroundImage = `url(${url})`;
        /*  */
        textarea.value = '';
        config.app.update({"clear": true});
        iframe.contentWindow.postMessage({"type": "clear-content"}, '*');
        config.app.update({"status": "Image Reader is processing the image, please wait..."});
        config.app.is.working(true);
        /*  */
        if (engine === "tesseract") {
          const data = await config.ocr.engine.worker.recognize(file);
          config.app.is.working(false);
          /*  */
          config.app.update({"status": "done", "data": data});
        }
        /*  */
        if (engine === "granite") {
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
          const result = {};
          const prompt = config.ocr.engine.processor.apply_chat_template(messages, {"add_generation_prompt": true});
          const inputs = await config.ocr.engine.processor(prompt, [image], {"do_image_splitting": true});
          await new Promise(resolve => window.setTimeout(resolve, 300));
          /*  */
          result.chunks = '';
          config.app.update({"clear": true});
          config.app.update({"status": "Image Reader is generating text, please wait..."});
          /*  */
          await config.ocr.engine.transcriber.generate({
            ...inputs,
            "max_new_tokens": 4096,
            "streamer": new config.ocr.engine.module.TextStreamer(config.ocr.engine.processor.tokenizer, {
              "skip_prompt": true,
              "skip_special_tokens": false,
              "callback_function": function (e) {
                result.chunks += e;
                textarea.scrollTop = textarea.scrollHeight;
                config.app.update({"status": "ontext", "data": {"data": {"text": e}}});
              }
            })
          });
          /*  */
          result.final = result.chunks.replace(/<\|end_of_text\|>$/, '');
          const converter = new config.ocr.engine.parser.DoclingConverter();
          const text = converter.convertToText(result.final);
          const html = converter.convertToHTML(result.final);
          /*  */
          config.app.text.copy();
          config.app.text.print();
          config.app.text.download();
          config.app.is.working(false);
          config.app.update({"status": "done", "data": {"data": {"text": text}}});
          /*  */
          iframe.src = chrome.runtime.getURL("/data/interface/iframe/index.html");
          iframe.addEventListener("load", function () {
            iframe.contentWindow.postMessage({
              "theme": theme,
              "type": "set-theme"
            }, '*');
            /*  */
            iframe.contentWindow.postMessage({
              "content": html,
              "type": "set-content",
              "katex": chrome.runtime.getURL("/data/interface/vendor/katex/katex.mjs"),
              "render": chrome.runtime.getURL("/data/interface/vendor/katex/auto-render.mjs")
            }, '*');
          });
        }
      },
      "init": async function (fromcache) {
        const engine = config.storage.read("engine") !== undefined ? config.storage.read("engine") : "tesseract";
        /*  */
        if (engine === "tesseract") {
          config.app.is.working(true);
          config.app.update({"status": "OCR > loading tesseract, please wait..."});
          await new Promise(resolve => window.setTimeout(resolve, 300));
          config.app.update({"clear": true});
          /*  */
          const language = document.querySelector("#language").value;
          const accuracy = document.querySelector("#accuracy").value;
          /*  */
          if (config.ocr.engine.worker) await config.ocr.engine.worker.terminate();
          config.ocr.engine.worker = await Tesseract.createWorker(language, '3', {
            "workerBlobURL": false,
            "corePath": "vendor/core",
            "logger": config.app.update,
            "workerPath": "vendor/worker.min.js",
            "cacheMethod": fromcache ? "write" : "refresh",
            "langPath": "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/" + accuracy
          });
          /*  */
          config.app.is.working(false);
          config.app.update({"clear": true});
          config.app.update({"status": "(1) Low, (2) Moderate, (3) Fast - shorter OCR time, (4) Best - better OCR accuracy"});
          config.app.update({"status": "Next, choose the desired OCR accuracy. Alternatively, you can select your image file via the above file I/O input area."});
          config.app.update({"status": "Please select a language and then drag & drop an image in the above area."});
          config.app.update({"status": "Image Reader is ready!"});
        } else {
          const remote = {};
          /*  */
          remote.id = "onnx-community/granite-docling-258M-ONNX";
          remote.host = "https://huggingface.co/" + remote.id;
          remote.permission = "IBM Granite Docling OCR engine needs to download pre-trained model for: " + remote.host + " \n\nTo continue, press OK. Otherwise, press Cancel and change the OCR engine. \n\nOnce downloaded, the data will be cached in memory, allowing the OCR application to function offline.";
          /*  */
          const permission = config.storage.read("permission") !== undefined ? config.storage.read("permission") : window.confirm(remote.permission);
          /*  */
          if (permission) {
            const progress = {};
            config.app.is.working(true);
            const device = document.querySelector("#backend").value;
            /*  */
            config.storage.write("permission", permission);
            config.app.update({"status": "Loading transformers.js..."});
            config.app.update({"status": "OCR > loading granite docling, please wait..."});
            /*  */
            config.ocr.engine.parser = await import(chrome.runtime.getURL("/data/interface/resources/parser.js"));
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
            config.ocr.engine.module.env.backends.onnx.wasm.proxy = true; // for multi-threaded speedup
            config.ocr.engine.module.env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
            config.ocr.engine.module.env.backends.onnx.wasm.wasmPaths = {
              "mjs": chrome.runtime.getURL("/data/interface/vendor/wasm/ort-wasm-simd-threaded.jsep.mjs"),
              "wasm": chrome.runtime.getURL("/data/interface/vendor/wasm/ort-wasm-simd-threaded.jsep.wasm")
            };
            /*  */
            progress.size = {'a': 0, 'b': 0, 'c': 0, 'd': 0};
            progress.percent = {'a': 0, 'b': 0, 'c': 0, 'd': 0};
            /*  */
            config.ocr.engine.processor = await config.ocr.engine.module.AutoProcessor.from_pretrained(remote.id);
            config.ocr.engine.transcriber = await config.ocr.engine.module.AutoModelForVision2Seq.from_pretrained(remote.id, {
              "device": device,
              "dtype": {
                "embed_tokens": "fp32",
                "vision_encoder": "fp32",
                "decoder_model_merged": "fp32"
              },
              "progress_callback": async function (data) {
                if (data.status === "done") {
                  /*  */
                } else {
                  if (data.status === "progress" && data.file?.endsWith?.("onnx_data")) {
                    /*  */
                    progress.embed = data.file.indexOf("embed_tokens");
                    progress.encoder = data.file.indexOf("vision_encoder");
                    progress.decoder = data.file.indexOf("decoder_model_merged");
                    progress.valid = data.loaded !== undefined && data.total !== undefined;
                    progress.other = progress.embed === -1 && progress.encoder === -1 && progress.decoder === -1;
                    /*  */
                    if (progress.valid) {
                      if (progress.other) progress.size.a = (data.total / (1024 * 1024)).toFixed(2);
                      if (progress.embed !== -1) progress.size.d = (data.total / (1024 * 1024)).toFixed(2);
                      if (progress.other) progress.percent.a = ((data.loaded / data.total) * 100).toFixed(2);
                      if (progress.encoder !== -1) progress.size.b = (data.total / (1024 * 1024)).toFixed(2);
                      if (progress.decoder !== -1) progress.size.c = (data.total / (1024 * 1024)).toFixed(2);
                      if (progress.embed !== -1) progress.percent.d = ((data.loaded / data.total) * 100).toFixed(2);
                      if (progress.encoder !== -1) progress.percent.b = ((data.loaded / data.total) * 100).toFixed(2);
                      if (progress.decoder !== -1) progress.percent.c = ((data.loaded / data.total) * 100).toFixed(2);
                    }
                    /*  */
                    config.app.update({"clear": true});
                    config.app.update({"status": "Loading embed_tokens.onnx" + (progress.size.d ? " (" + progress.size.d + " MB)" : '') + ' ' + progress.percent.d + '%', "progress": progress.percent.d / 100});
                    config.app.update({"status": "Loading encoder_model.onnx" + (progress.size.b ? " (" + progress.size.b + " MB)" : '') + ' ' + progress.percent.b + '%', "progress": progress.percent.b / 100});
                    config.app.update({"status": "Loading decoder_model_merged.onnx" + (progress.size.c ? " (" + progress.size.c + " MB)" : '') + ' ' + progress.percent.c + '%', "progress": progress.percent.c / 100});
                    if (progress.other) config.app.update({"status": "Loading " + data.file + ' ' + progress.percent.a + '%', "progress": progress.percent.a / 100});
                    /*  */
                    config.app.update({"status": "Downloading model data for: " + remote.host});
                  }
                }
              }
            });
            /*  */
            config.app.is.working(false);
            config.app.update({"clear": true});
            await new Promise(resolve => window.setTimeout(resolve, 300));
            /*  */
            const gpuadapter = "gpu" in navigator ? await navigator.gpu.requestAdapter() : null;
            const gpudevice = gpuadapter ? await gpuadapter.requestDevice() : null;
            const supported = device === "wasm" ? true : gpuadapter && gpudevice;
            /*  */
            if (supported) {
              config.app.update({"status": "Alternatively, you can select your image file via the above file I/O input area."});
              config.app.update({"status": "Please drag & drop an image in the above area."});
              config.app.update({"status": "Image Reader is ready!"});
            } else {
              config.app.update({"status": "Please reload the app or try a different browser."});
            }
          }
        }
      }
    }
  },
  "app": {
    "isgecko": navigator.userAgent.toLowerCase().includes("firefox"),
    "handle": {
      "clip": {
        "result": function (blob) {
          config.ocr.engine.start(blob);
        }
      }
    },
    "log": function (e) {
      const text = document.createTextNode(e);
      const line = document.createElement("div");
      const status = document.createElement("div");
      const log = document.querySelector(".console");
      /*  */
      status.className = "status";
      /*  */
      status.appendChild(text);
      line.appendChild(status);
      log.insertBefore(line, log.firstChild);
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
        const selector = document.querySelector(".selector");
        /*  */
        choose.disabled = flag;
        engine.disabled = flag;
        backend.disabled = flag;
        language.disabled = flag;
        accuracy.disabled = flag;
        if (flag) log.textContent = '';
        fileio.style.opacity = flag ? "0.7" : "1.0";
        choose.style.cursor = flag ? "not-allowed" : "pointer";
        flag ? selector.setAttribute("disabled", '') : selector.removeAttribute("disabled");
      }
    },
    "start": function () {
      const context = document.documentElement.getAttribute("context");
      /*  */
      const theme = config.storage.read("theme") !== undefined ? config.storage.read("theme") : "light";
      const accuracy = config.storage.read("accuracy") !== undefined ? config.storage.read("accuracy") : 3;
      const language = config.storage.read("language") !== undefined ? config.storage.read("language") : 14;
      const engine = config.storage.read("engine") !== undefined ? config.storage.read("engine") : "tesseract";
      const backend = config.storage.read("backend") !== undefined ? config.storage.read("backend") : (config.app.isgecko ? "wasm" : "webgpu");
      /*  */
      document.querySelector("#choose").value = '';
      document.querySelector("textarea").value = '';
      document.querySelector("#engine").value = engine;
      document.querySelector("#backend").value = backend;
      document.querySelector("#accuracy").selectedIndex = accuracy;
      document.querySelector("#language").selectedIndex = language;
      document.documentElement.setAttribute("theme", theme !== undefined ? theme : "light");
      document.documentElement.setAttribute("engine", engine !== undefined ? engine : "tesseract");      
      /*  */
      if (context !== "webapp") {
        const consent = config.storage.read("consent") !== undefined ? config.storage.read("consent") : false;
        document.querySelector(".consent").style.display = consent ? "none" : "block";
      }
      /*  */
      config.ocr.engine.init(false);
    },
    "text": {
      "print": function () {
        const print = document.querySelector(".print");
        /*  */
        if (!print) {
          const render = document.querySelector(".render");
          const textarea = document.querySelector("textarea");
          /*  */
          if (textarea.value) {
            const print = document.createElement('a');
            /*  */
            print.textContent = '🖶';
            print.className = "print";
            print.title = "Click to print the OCR text";
            print.addEventListener("click", function () {
              const iframe = document.querySelector("iframe");
              iframe.contentWindow.postMessage({"type": "print"}, '*');
            });
            /*  */
            render.appendChild(print);
          }
        }
      },
      "download": function () {
        const textarea = document.querySelector("textarea");
        const download = document.querySelector(".download");
        /*  */
        if (!download) {
          /*  */
          if (textarea.value) {
            const download = document.createElement('a');
            const result = document.querySelector(".result");
            const blob = new Blob([textarea.value], {"type": "text/html"});
            /*  */
            download.textContent = '↓';
            download.className = "download";
            download.download = "ocr_result.txt";
            download.href = URL.createObjectURL(blob);
            download.title = "Click to download the OCR text as ocr_result.txt";
            /*  */
            result.appendChild(download);
          }
        } else {
          const blob = new Blob([textarea.value], {"type": "text/html"});
          download.href = URL.createObjectURL(blob);
        }
      },
      "copy": function () {
        const copy = document.querySelector(".copy");
        if (!copy) {
          const textarea = document.querySelector("textarea");
          /*  */
          if (textarea.value) {
            const copy = document.createElement('a');
            const result = document.querySelector(".result");
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
            result.appendChild(copy);
          }
        }
      }
    },
    "update": function (e) {
      const current = {};
      const line = document.createElement("div");
      const status = document.createElement("div");
      const log = document.querySelector(".console");
      const result = document.querySelector(".result");
      const textarea = document.querySelector("textarea");
      const cond = {"is": {"valid": {}}, "has": {"same": {}}};
      /*  */
      current.node = null;
      current.progress = null;
      current.text = " > " + e.status;
      cond.has.data = e && e.data && e.data.data;
      cond.has.progress = e && "progress" in e && typeof e.progress !== "undefined";
      cond.is.valid.progress = cond.has.progress && !Number.isNaN(Number(e.progress));
      cond.has.same.status = cond.has.progress && log.firstChild && log.firstChild.status === e.status;
      /*  */
      if (e.clear) {
        log.textContent = '';
        return;
      }
      /*  */
      if (e.status === "done") {
        log.textContent = '';
      }
      /*  */
      if (e.progress) {
        result.style.backgroundImage = "none";
      }
      /*  */
      if (e.status === "ontext") {
        textarea.value += cond.has.data ? e.data.data.text : '';
        return;
      }
    	/*  */
    	if (cond.has.same.status) {
        current.progress = log.firstChild.querySelector("progress");
        current.progress.value = cond.is.valid.progress ? Number(e.progress).toFixed(1) : 1;
        return;
    	}
      /*  */
      if (cond.has.progress) {
        current.progress = document.createElement("progress");
        current.progress.value = cond.is.valid.progress ? Number(e.progress).toFixed(1) : 1;
        current.progress.max = 1;
        line.appendChild(current.progress);
      }
      /*  */
      if (e.status === "done") {
        textarea.value = cond.has.data ? e.data.data.text : "Error!";
        /*  */
        config.app.text.copy();
        config.app.text.print();
        config.app.text.download();
        /*  */
        if (cond.has.data && e.data.data.confidence) {
          status.setAttribute(e.status, '');
          /*  */
          const str_0 = "OCR > extraction is done! " + (e.data.data && e.data.data.confidence ? e.data.data.confidence + "% confidence, " : '');
          const str_1 = e.data.data.symbols ? e.data.data.symbols.length + " symbol" + (e.data.data.symbols.length === 1 ? '' : 's') + ", " : '';
          const str_2 = e.data.data.words ? e.data.data.words.length + " word" + (e.data.data.words.length === 1 ? '' : 's') + ", " : '';
          const str_3 = e.data.data.lines ? e.data.data.lines.length + " line" + (e.data.data.lines.length === 1 ? '' : 's') + ", " : '';
          const str_4 = e.data.data.paragraphs ? e.data.data.paragraphs.length + " paragraph" + (e.data.data.paragraphs.length === 1 ? '' : 's') + " " : '';
          /*  */
          current.text = str_0 + str_1 + str_2 + str_3 + str_4;
        } else {
          current.text = "OCR > extraction is done!";
        }
      }
      /*  */
      line.status = e.status;
      status.className = "status";
      current.node = document.createTextNode(current.text);
      /*  */
      status.appendChild(current.node);
      line.appendChild(status);
      log.insertBefore(line, log.firstChild);
    }
  }
};

config.port.connect();

document.addEventListener("drop", config.cancel.drop, true);
document.addEventListener("dragover", config.cancel.drop, true);

window.addEventListener("load", config.load, false);
window.addEventListener("resize", config.resize.method, false);
