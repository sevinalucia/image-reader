const app = window.opener.config.app;
const storage = window.opener.config.storage;

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
  "message": async function (e) {
    if (e.data?.type === "set-theme") {
      document.documentElement.setAttribute("theme", e.data.theme);
    }
  },
  "load": function () {
    const theme = storage.read("theme") !== undefined ? storage.read("theme") : "light";
    /*  */
    config.elements.ocr = document.getElementById("ocr");    
    config.elements.start = document.getElementById("start");
    config.elements.video = document.getElementById("video");
    config.elements.reload = document.getElementById("reload");
    config.elements.result = document.querySelector(".result");
    config.elements.overlay = document.querySelector(".overlay");
    config.elements.capture = document.getElementById("capture");
    /*  */
    config.elements.canvas = config.elements.result.querySelector("canvas");
    config.elements.ctx = config.elements.canvas.getContext("2d");
    document.documentElement.setAttribute("theme", theme);
    /*  */
    config.elements.ocr.addEventListener("click", config.listeners.ocr);
    config.elements.start.addEventListener("click", config.listeners.start);
    config.elements.reload.addEventListener("click", config.listeners.reload);
    config.elements.capture.addEventListener("click", config.listeners.capture);
    config.elements.video.addEventListener("mouseup", config.listeners.mouseup);
    config.elements.video.addEventListener("mousedown", config.listeners.mousedown);
    config.elements.video.addEventListener("mousemove", config.listeners.mousemove);
  },
  "listeners": {
    "reload": function () {
      document.location.reload();
    },
    "mouseup": function () {
      config.metrics.drawing = false;
      config.listeners.capture();
    },
    "ocr": async function () {
      try {
        const data = config.elements.canvas.toDataURL("image/png");
        /*  */
        if (data) {
          app.handle.clip.result(data);
          /*  */
          config.metrics.stream.getTracks().forEach(track => track.stop());
          config.metrics.stream = null;
          window.close();
        }
      } catch (e) {
        window.alert("Screen capture canceled or not supported.");
      }
    },
    "mousedown": function (e) {
      const rect = config.elements.overlay.parentElement.getBoundingClientRect();
      /*  */
      config.metrics.drawing = true;
      config.metrics.start.Y = e.clientY - rect.top ;
      config.metrics.start.X = e.clientX - rect.left ;
      /*  */
      config.elements.overlay.style.width = "0";
      config.elements.overlay.style.height = "0";
      config.elements.overlay.style.display = "block";
      config.elements.overlay.style.top = config.metrics.start.Y + "px";
      config.elements.overlay.style.left = config.metrics.start.X + "px";
    },
    "mousemove": function (e) {
      if (!config.metrics.drawing) return;
      const rect = config.elements.overlay.parentElement.getBoundingClientRect();
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
    "capture": async function () {
      if (!config.metrics.stream) {
        return window.alert("No screen stream active!");
      }
      /*  */
      const current = config.elements.overlay.getBoundingClientRect();
      const rect = config.elements.overlay.parentElement.getBoundingClientRect();
      /*  */
      const scaleX = config.elements.video.videoWidth / rect.width;
      const scaleY = config.elements.video.videoHeight / rect.height;
      /*  */
      const sw = current.width * scaleX;
      const sh = current.height * scaleY;
      const sy = (current.top - rect.top) * scaleY;
      const sx = (current.left - rect.left) * scaleX;
      /*  */
      config.elements.canvas.width = sw;
      config.elements.canvas.height = sh;
      /*  */
      config.elements.ocr.disabled = false;
      config.elements.ctx.drawImage(config.elements.video, sx, sy, sw, sh, 0, 0, sw, sh);
    },
    "start": async function () {
      try {
        config.metrics.stream = await navigator.mediaDevices.getDisplayMedia({
          "video": {
            "displaySurface": "window"
          }
        });
        /*  */
        config.elements.capture.disabled = false;
        config.elements.video.style.display = "block";
        config.elements.overlay.style.display = "block";
        config.elements.video.srcObject = config.metrics.stream;
        /*  */
        const current = config.elements.video.getBoundingClientRect();
        const rect = config.elements.overlay.parentElement.getBoundingClientRect();
        /*  */
        config.elements.overlay.style.width = current.width * 0.6 + "px";
        config.elements.overlay.style.height = current.height * 0.6 + "px";
        config.elements.overlay.style.top = (current.top - rect.top + current.height * 0.2) + "px";
        config.elements.overlay.style.left = (current.left - rect.left + current.width * 0.2) + "px";
        /*  */
        window.setTimeout(function () {
          config.listeners.capture();
        }, 300);
      } catch (e) {
        window.alert("Screen capture canceled or not supported.");
      }
    }
  }
};

window.addEventListener("message", config.message);
window.addEventListener("load", config.load, false);
