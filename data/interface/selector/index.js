const config = {
  "elements": {},
  "metrics": {
    "stream": null,
    "drawing": false,
    "end": {
      'X': 0,
      'Y': 0
    },
    "start": {
      'X': 0,
      'Y': 0
    }
  },
  "video": function () {
    return config.elements.video.getBoundingClientRect();
  },
  "holder": function () {
    return config.elements.holder.getBoundingClientRect();
  },
  "loader": function () {
    /*
      re-resolved at every interaction — the reader window may have reloaded;
      the embedded pane rides window.parent, an iframe has no opener
    */
    if (window.opener && window.opener.config) return window.opener.config;
    if (window.parent && window.parent !== window && window.parent.config) return window.parent.config;
    return null;
  },
  "message": function (e) {
    /*
      only the opener interface (or the embedding parent surface) may
      talk to this window - a same-origin check below keeps strangers out
    */
    if (!e.source || (e.source !== window.opener && !(window.parent !== window && e.source === window.parent))) return;
    if (e.data?.type === "set-theme") {
      document.documentElement.setAttribute("theme", e.data.theme);
    }
    if (e.data?.type === "clipper-close") {
      /* the parent dismissed the pane: a hidden iframe keeps
         capturing otherwise - release the stream and the buttons */
      config.stop();
    }
  },
  "stop": function () {
    /* the intentional exits (handoff, reload, pagehide) flag first:
       track.stop() fires the ended listener, whose "browser bar" alert
       would otherwise stack on the success path as a second popup */
    config.metrics.closed = true;
    /* the draw session dies with the stream: a mouseup right after
       the browser-bar stop would otherwise still believe a draw was
       running and alert "No screen stream active!" */
    config.metrics.drawing = false;
    if (config.metrics.stream) {
      config.metrics.stream.getTracks().forEach(track => track.stop());
      config.metrics.stream = null;
    }
    /*  */
    config.elements.ocr.disabled = true;
    config.elements.capture.disabled = true;
  },
  "load": function () {
    const holder = document.querySelector(".viewport");
    /* the embedded marker marks the pane stance: a css hook for
       pane-specific styling without touching the popup look - the
       popup never sets it (it has no parent frame) */
    if (window.parent !== window) document.documentElement.setAttribute("embedded", '');
    /*  */
    config.elements.ocr = document.getElementById("ocr");
    config.elements.start = document.getElementById("start");
    config.elements.video = document.getElementById("video");
    config.elements.holder = holder;
    config.elements.reload = document.getElementById("reload");
    config.elements.result = document.querySelector(".result");
    config.elements.overlay = document.querySelector(".overlay");
    config.elements.capture = document.getElementById("capture");
    /*  */
    config.elements.canvas = config.elements.result.querySelector("canvas");
    config.elements.ctx = config.elements.canvas.getContext("2d");
    /* theme comes straight from storage — the opener may be gone by now;
       the "auto" stored value resolves against the OS preference here */
    chrome.storage.local.get(null, function (e) {
      const stored = e["theme"] !== undefined ? e["theme"] : "auto";
      const dark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("theme", dark ? "dark" : "light");
    });
    /*  */
    config.elements.ocr.addEventListener("click", config.listeners.ocr);
    config.elements.start.addEventListener("click", config.listeners.start);
    config.elements.reload.addEventListener("click", config.listeners.reload);
    config.elements.capture.addEventListener("click", config.listeners.capture);
    /* the selection events live on the wrapper so the overlay above the
       video keeps receiving them through the DOM bubble; the release
       rides the window - a drag ending over the toolbar (or beyond the
       viewport) must still settle the draw */
    window.addEventListener("mouseup", config.listeners.mouseup);
    holder.addEventListener("mousedown", config.listeners.mousedown);
    holder.addEventListener("mousemove", config.listeners.mousemove);
    /*
      the camera/screen indicator must release on every exit path
    */
    window.addEventListener("pagehide", config.stop);
  },
  "listeners": {
    "reload": function () {
      document.location.reload();
    },
    "mouseup": function () {
      if (!config.metrics.drawing) return;
      config.metrics.drawing = false;
      config.listeners.capture();
    },
    "ocr": async function () {
      const opener = config.loader();
      /*  */
      if (!opener) {
        window.alert("The reader window is no longer available. Reload the screen clipper and capture a new selection!");
        return;
      }
      /* the hand-off keeps the crop: the reader must be ready or the
         window stays open with the selection intact; a failed engine
         would swallow the crop silently on the reader's failed gate */
      if (opener.ocr.engine.failed) {
        window.alert("The OCR engine has failed — reload the reader window and try again; this window keeps your selection!");
        return;
      }
      if (!opener.ocr.engine.ready || opener.ocr.engine.busy) {
        window.alert("The OCR engine is still loading or busy — try again in a moment; this window keeps your selection!");
        return;
      }
      /*  */
      try {
        const data = config.elements.canvas.toDataURL("image/png");
        /*  */
        if (data) {
          opener.app.handle.clip.result(data);
          /*  */
          config.stop();
          /* the embedded pane hands off through the parent (an iframe
             close() is a no-op); the popup keeps its own close flow */
          if (window.parent !== window) {
            window.parent.postMessage({"type": "clipper-close"}, chrome.runtime.getURL("/"));
          } else {
            if (window.opener) window.opener.focus();
            window.close();
          }
        }
      } catch (e) {
        window.alert("Screen capture canceled or not supported.");
      }
    },
    "mousedown": function (e) {
      if (e.button !== 0) return;
      /* the box rides the viewport as its containing block, so the
         pointer math reads the viewport rect: the embed centers the
         video inside the pane (letterbox gap) and a video-relative
         box would draw shifted off the pointer - the popup keeps the
         same math (both rects coincide there) */
      const rect = config.holder();
      /*  */
      config.metrics.drawing = true;
      config.metrics.start.Y = e.clientY - rect.top;
      config.metrics.start.X = e.clientX - rect.left;
      /*  */
      config.elements.overlay.style.width = "0";
      config.elements.overlay.style.height = "0";
      config.elements.overlay.style.display = "block";
      config.elements.overlay.style.top = config.metrics.start.Y + "px";
      config.elements.overlay.style.left = config.metrics.start.X + "px";
    },
    "mousemove": function (e) {
      if (!config.metrics.drawing) return;
      const rect = config.holder();
      /*  */
      config.metrics.end.Y = e.clientY - rect.top;
      config.metrics.end.X = e.clientX - rect.left;
      /*  */
      const width = config.metrics.end.X - config.metrics.start.X;
      const height = config.metrics.end.Y - config.metrics.start.Y;
      /*  */
      config.elements.overlay.style.width = Math.abs(width) + "px";
      config.elements.overlay.style.height = Math.abs(height) + "px";
      config.elements.overlay.style.left = (width > 0 ? config.metrics.start.X : config.metrics.end.X) + "px";
      config.elements.overlay.style.top = (height > 0 ? config.metrics.start.Y : config.metrics.end.Y) + "px";
    },
    "capture": function () {
      if (!config.metrics.stream) {
        return window.alert("No screen stream active!");
      }
      /*  */
      const current = config.elements.overlay.getBoundingClientRect();
      const rect = config.video();
      /*  */
      const scaleX = config.elements.video.videoWidth / rect.width;
      const scaleY = config.elements.video.videoHeight / rect.height;
      /*  */
      const sw = current.width * scaleX;
      const sh = current.height * scaleY;
      const sy = (current.top - rect.top) * scaleY;
      const sx = (current.left - rect.left) * scaleX;
      /* the crop clamps on both edges: a residual negative origin used
         to shift the crop silently, and a drag past the far edge must
         stop at the video bounds instead of trusting the canvas clip */
      const cx = Math.max(0, Math.min(sx, config.elements.video.videoWidth));
      const cy = Math.max(0, Math.min(sy, config.elements.video.videoHeight));
      const cw = Math.min(sw - (cx - sx), config.elements.video.videoWidth - cx);
      const ch = Math.min(sh - (cy - sy), config.elements.video.videoHeight - cy);
      /* stray-pad selections under 8px are ignored — and a previous
         good crop no longer stays actionable below them; the REAL
         canvas dims gate here: a drag that starts left of the video
         clamps the origin and shrinks the width, so the original
         sw/sh pair would pass while cw already sits below the floor */
      if (cw < 8 || ch < 8) {
        config.elements.ocr.disabled = true;
        return;
      }
      /*  */
      config.elements.canvas.width = cw;
      config.elements.canvas.height = ch;
      /*  */
      config.elements.ocr.disabled = false;
      config.elements.ctx.drawImage(config.elements.video, cx, cy, cw, ch, 0, 0, cw, ch);
    },
    "start": async function () {
      config.metrics.closed = false;
      try {
        config.metrics.stream = await navigator.mediaDevices.getDisplayMedia({
          "video": {
            "displaySurface": "window"
          }
        });
        /*  */
        config.metrics.stream.getVideoTracks()[0].addEventListener("ended", function () {
          /* an intentional stop (handoff, reload, pagehide) silenced the
             ended listener through the flag - only the browser bar stop
             reaches the alert */
          if (config.metrics.closed) return;
          config.stop();
          config.elements.holder.style.display = "none";
          config.elements.video.style.display = "none";
          window.alert("Screen capture was stopped from the browser bar.");
        });
        /* Chrome can end the capture from its own stop-sharing bar;
           config.stop() is the shared exit path - it releases the stream
           AND disables the capture/OCR pair, so a stale canvas can't be
           handed to the reader on the disabled OCR path */
        config.elements.capture.disabled = false;
        config.elements.holder.style.display = "inline-flex";
        config.elements.video.style.display = "block";
        config.elements.overlay.style.display = "block";
        config.elements.video.srcObject = config.metrics.stream;
        /* the very first frame sizes the starter overlay from the real
           video rect — a pre-load 300x150 default reads as a wrong box;
           the offset lands the box on the video itself: the embed
           centers the video in the pane, so the viewport rect alone
           would float the preview into the letterbox gap */
        config.elements.video.addEventListener("loadeddata", function () {
          const rect = config.video();
          const holder = config.holder();
          /*  */
          config.elements.overlay.style.width = rect.width * 0.6 + "px";
          config.elements.overlay.style.height = rect.height * 0.6 + "px";
          config.elements.overlay.style.top = rect.top - holder.top + rect.height * 0.2 + "px";
          config.elements.overlay.style.left = rect.left - holder.left + rect.width * 0.2 + "px";
          config.listeners.capture();
        }, {"once": true});
      } catch (e) {
        window.alert("Screen capture canceled or not supported.");
      }
    }
  }
};

window.addEventListener("message", config.message);
window.addEventListener("load", config.load, false);

