/* ============================================================================
   sanitizer.js — the one html sanitizer for every surface (reader page and
   render pane share it; each surface's own script delegates to this file)
   ============================================================================ */

var sanitizer = {
  "run": function (html) {
    /*
      strict allowlist: only relative anchors and same-package /
      embedded-image sources survive — an exported file must never
      phone home, and nothing here decides by blocklist alone
    */
    /* SMIL animation tags ride the blocklist: an <animate> can retarget
       another element's attributes mid-flight, and exported files must
       stay static drawings (svg tagNames parse lowercase, so the
       walker matches both cases) */
    const blocked = {"SCRIPT": true, "IFRAME": true, "OBJECT": true, "EMBED": true, "META": true, "LINK": true, "STYLE": true, "BASE": true, "ANIMATE": true, "ANIMATETRANSFORM": true, "ANIMATEMOTION": true, "SET": true, "MPATH": true};
    const safe = function (name, value) {
      if (name.startsWith("on")) return false;
      if (name === "style" && value.indexOf("url(") !== -1) return false;
      if (value === "") return true;
      if (value.charAt(0) === "#") return true;
      if (value.startsWith("chrome-extension:")) return true;
      /* the embedded-image pass must not swallow srcset: the density
         list runs its own remote-candidate check below */
      if (value.startsWith("data:image/") && name !== "srcset") return true;
      /* href-family attributes share one url rule - lowercase xlink
         variants fell through the exact list and let an exported file
         fetch a remote resource; poster/background/ping round out the
         fetch family (ping even POSTs on click) */
      if (/(^|:)href$/.test(name) || name === "src" || name === "srcset" || name === "action" || name === "formaction" || name === "poster" || name === "background" || name === "ping") {
        /* a scheme-less value is same-package relative: no host, no
           hop - anything with a colon (http, ftp, data:text) is gone,
           and a leading // reuses the page scheme to reach a remote
           host, so it dies with the colon paths */
        if (name !== "srcset") return value.indexOf(":") === -1 && !value.startsWith("//");
        /* the srcset list carries one candidate per comma - one remote
           entry must not ride inside an otherwise local list; an
           embedded data:image candidate is offline-safe and survives
           (the OCR renders its own captures through it) */
        return value.split(",").every(function (candidate) {
          const url = candidate.trim().split(/\s+/)[0] || '';
          return url.startsWith("data:image/") || (url.indexOf(":") === -1 && !url.startsWith("//"));
        });
      }
      return true;
    };
    const doc = new DOMParser().parseFromString(html, "text/html");
    const holder = document.createElement("div");
    const walker = function (from, to) {
      Array.prototype.slice.call(from.childNodes).forEach(function (node) {
        if (node.nodeType === 3) {
          to.appendChild(document.createTextNode(node.nodeValue));
          return;
        }
        if (node.nodeType !== 1) return;
        if (blocked[node.tagName] || blocked[String(node.tagName).toUpperCase()]) return;
        /* the namespace travels with the node: plain createElement
           would pull <svg>/<math> into the html namespace and mangle
           the embedded render drawings */
        const mine = document.createElementNS(node.namespaceURI, node.localName);
        /*  */
        Array.prototype.slice.call(node.attributes).forEach(function (attr) {
          const name = attr.name.toLowerCase();
          const value = String(attr.value).trim().toLowerCase();
          /*  */
          if (!safe(name, value)) return;
          /*  */
          mine.setAttribute(attr.name, attr.value);
        });
        /*  */
        walker(node, mine);
        to.appendChild(mine);
      });
    };
    /*  */
    walker(doc.body, holder);
    return holder;
  }
};
