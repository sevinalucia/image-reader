app.version = function () {return chrome.runtime.getManifest().version};
app.homepage = function () {return chrome.runtime.getManifest().homepage_url};

if (!navigator.webdriver) {
  app.on.uninstalled(app.homepage() + "?v=" + app.version() + "&type=uninstall");
  app.on.installed(function (e) {
    app.on.management(function (result) {
      if (result.installType === "normal") {
        app.tab.query.index(function (index) {
          let previous = e.previousVersion !== undefined && e.previousVersion !== app.version();
          let doupdate = previous && parseInt((Date.now() - config.welcome.lastupdate) / (24 * 3600 * 1000)) > 45;
          if (e.reason === "install" || (e.reason === "update" && doupdate)) {
            let parameter = (e.previousVersion ? "&p=" + e.previousVersion : '') + "&type=" + e.reason;
            let url = app.homepage() + "?v=" + app.version() + parameter;
            app.tab.open(url, index, e.reason === "install");
            config.welcome.lastupdate = Date.now();
          }
        });
      }
    });
  });
}

app.on.connect(function (port) {
  if (port) {
    if (port.name) {
      /* every live port registers per namespace in a dedicated registry:
         two reader surfaces both count, so one disconnect must not null
         the shared port while the other surface is still connected - the
         buckets never write onto the api namespaces (a "tab" port would
         otherwise mount fields on app.tab itself) */
      app.ports = app.ports || {};
      if (!app.ports[port.name]) app.ports[port.name] = {"list": []};
      app.ports[port.name].list.push(port);
      app.ports[port.name].port = port;
      /*  */
      if (port.sender) {
        if (port.sender.tab) {
          /*  */
          if (port.name === "tab") {
            app.interface.id = port.sender.tab.id;
            app.interface.kind = "tab";
          }
          /*  */
          if (port.name === "win") {
            if (port.sender.tab.windowId) {
              app.interface.id = port.sender.tab.windowId;
              app.interface.kind = "win";
            }
          }
        }
      }
    }
    /*  */
    port.onMessage.addListener(function (e) {
      /* a popup-window surface carries no sender.tab: it hands its
         window id over as a handshake on the port itself */
      if (e && e.handshake === "win" && port.name === "win") {
        if (typeof e.id === "number") {
          app.interface.id = e.id;
          app.interface.kind = "win";
        }
      }
    });
    /*  */
    port.onDisconnect.addListener(function (e) {
      /* the namespace port stays alive when a second surface keeps it
         connected: the disconnect removes its own registration, and
         the shared .port points at the last remaining live port */
      const settle = function (ns) {
        if (!ns || !ns.list) return null;
        const index = ns.list.indexOf(e);
        if (index !== -1) ns.list.splice(index, 1);
        return ns.list.length ? ns.list[ns.list.length - 1] : null;
      };
      app.storage.load(function () {
        if (e) {
          if (e.name) {
            if (app.ports && app.ports[e.name]) app.ports[e.name].port = settle(app.ports[e.name]);
            /*  */
            if (e.sender) {
              /*  */
              if (e.name === "tab") {
                if (e.sender.tab) {
                  /* only the recorded namespace owns the id - a window
                     opener must survive its popup frame disconnect, else
                     each reload of the window orphaned the reader */
                  if (app.interface.kind === "tab") {
                    app.interface.id = '';
                    app.interface.kind = '';
                  }
                }
              }
              /*  */
              if (e.name === "win") {
                if (e.sender.tab && e.sender.tab.windowId) {
                  if (e.sender.tab.windowId === app.interface.id && app.interface.kind === "win") {
                    app.interface.id = '';
                    app.interface.kind = '';
                  }
                } else {
                  /* a handshake-registered window records no tab: clear
                     only when the namespace has no surviving port, else
                     a second surface would orphan the open reader */
                  if (app.ports && app.ports[e.name] && !app.ports[e.name].port && app.interface.kind === "win") {
                    app.interface.id = '';
                    app.interface.kind = '';
                  }
                }
              }
            }
          }
        }
      });
    });
  }
});
