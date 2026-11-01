var config = {
  "katex": '',
  "rendermath": '',
  "sanitize": function (html) {
    /*
      the walker lives once in the shared resources module
    */
    return sanitizer.run(html);
  },
  "message": async function (e) {
    /*
      only the opener interface may talk to this frame
    */
    if (!e.source || e.source !== window.parent) return;
    if (e.data?.type === "print") {
      window.print();
    }
    /*  */
    if (e.data?.type === "set-theme") {
      document.documentElement.setAttribute("theme", e.data.theme);
    }
    /*  */
    if (e.data?.type === "clear-content") {
      const container = document.getElementById("content");
      container.textContent = '';
    }
    /*  */
    if (e.data?.type === "set-paragraphs") {
      const container = document.getElementById("content");
      /*  */
      container.textContent = '';
      (e.data.paragraphs || []).forEach(function (text) {
        const p = document.createElement("p");
        p.className = "paragraph";
        p.textContent = text;
        /*  */
        container.appendChild(p);
      });
    }
    /*  */
    if (e.data?.type === "set-content") {
      const module = {};
      const container = document.getElementById("content");
      /* only package-internal urls qualify - a message without the
         katex paths (or a forged remote one) still renders the
         content, just without the formula steps */
      const katex = typeof e.data.katex === "string" && e.data.katex.startsWith(chrome.runtime.getURL("data/interface/vendor/katex/"));
      const auto = typeof e.data.render === "string" && e.data.render.startsWith(chrome.runtime.getURL("data/interface/vendor/katex/"));
      /*  */
      container.textContent = '';
      container.appendChild(config.sanitize(e.data.content));
      /*  */
      if (katex && auto) {
        /* a rejected import must not become an unhandled rejection:
           the content already renders, the formulas keep their raw
           text when the module load fails */
        try {
          module.katex = await import(e.data.katex);
          module.render = await import(e.data.render);
        } catch (err) {
          module.katex = null;
        }
      }
      if (module.katex && module.render) {
        /*  */
        const formulas = container.querySelectorAll(".formula");
        /*  */
        for (let element of formulas) {
          module.katex.render(element.textContent, element, {
            "throwOnError": false
          });
        }
        /*  */
        module.render.default(container, {
          "throwOnError": false,
          "delimiters": [
            {
              "left": "$$",
              "right": "$$",
              "display": true
            },
            {
              "left": "\\[",
              "right": "\\]",
              "display": true
            },
            {
              "left": "$",
              "right": "$",
              "display": false
            },
            {
              "left": "\\(",
              "right": "\\)",
              "display": false
            }
          ]
        });
      }
    }
  }
};

window.addEventListener("message", config.message);

