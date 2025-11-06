var config = {
  "katex": '',
  "rendermath": '',
  "message": async function (e) {
    if (e.data?.type === "print") {
      window.print();
    }
    //
    if (e.data?.type === "set-theme") {
      document.documentElement.setAttribute("theme", e.data.theme);
    }
    //
    if (e.data?.type === "clear-content") {
      const container = document.getElementById("content");
      container.textContent = '';
    }
    //
    if (e.data?.type === "set-content") {
      const module = {};
      const range = document.createRange();
      const container = document.getElementById("content");
      const fragment = range.createContextualFragment(e.data.content);
      //
      container.textContent = '';
      container.appendChild(fragment);
      //
      module.katex = await import(e.data.katex);
      module.render = await import(e.data.render);
      //
      const formulas = container.querySelectorAll(".formula");
      //
      for (let element of formulas) {
        module.katex.render(element.textContent, element, {
          "throwOnError": false
        });
      }
      //
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
};

window.addEventListener("message", config.message);
