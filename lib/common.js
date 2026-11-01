var core = {
  "start": function () {
    core.load();
  },
  "install": function () {
    core.load();
  },
  "load": function () {
    app.interface.id = '';
    app.interface.kind = '';
    /*  */
    const context = config.interface.context;
    const url = app.interface.path + '?' + context;
    /*  */
    app.button.popup(context === "popup" ? url : '');
    /*  */
    app.contextmenu.removeAll(function () {
      /* the items build inside the wipe callback, else the duplicate-id
         race can drop the radio menu right after an update */
      app.contextmenu.create({
        "id": "tab", 
        "type": "radio", 
        "title": "Open in tab",  
        "contexts": ["action"],
        "checked": context === "tab"
      }, app.error);
      /*  */
      app.contextmenu.create({
        "id": "win", 
        "type": "radio", 
        "title": "Open in win",  
        "contexts": ["action"],
        "checked": context === "win"
      }, app.error);
      /*  */
      app.contextmenu.create({
        "id": "popup", 
        "type": "radio", 
        "contexts": ["action"],
        "title": "Open in popup",  
        "checked": context === "popup"
      }, app.error);
    });
  },
  "action": {
    "storage": function (changes, namespace) {
      /* the toolbar context rebuilds the button popup + the radio menu:
         the options radio writes interface.context and this lands the
         exact same wiring a cold start built - a reset that wipes the
         key falls back to core.load's stored default instead of a
         silent "win" reversal */
      if (namespace === "local") {
        if (changes["interface.context"]) core.load();
      }
    },
    "removed": function (e, kind) {
      /* the id spaces differ (a window id 5 and a tab id 5 coexist):
         the caller names the kind, so a closing window can never
         clear a tab reader that happens to share the number */
      if (e === app.interface.id && kind === app.interface.kind) {
        app.interface.id = '';
        /* the namespace dies with its id - a half-cleared pair would
           route the next button open through a stale context */
        app.interface.kind = '';
      }
    },
    "contextmenu": function (e) {
      app.interface.close(config.interface.context);
      config.interface.context = e.menuItemId;
      /*  */
      const context = config.interface.context;
      const url = app.interface.path + '?' + context;
      app.button.popup(context === "popup" ? url : '');
    },
    "button": function () {
      const context = config.interface.context;
      const url = app.interface.path + '?' + context;
      /*  */
      if (context === "popup") app.button.popup(url);
      else {
        /* the id is namespace-scoped: it stays usable only when its
           recorded kind matches the current surface, else a fresh open */
        const kind = app.interface.kind;
        if (app.interface.id && kind && kind === context) {
          if (context === "tab") {
            app.tab.get(app.interface.id, function (tab) {
              if (tab) {
                app.tab.update(app.interface.id, {"active": true});
              } else {
                app.interface.id = '';
                app.interface.kind = '';
                app.tab.open(url);
              }
            });
          }
          /*  */
          if (context === "win") {
            app.window.get(app.interface.id, function (win) {
              if (win) {
                app.window.update(app.interface.id, {"focused": true});
              } else {
                app.interface.id = '';
                app.interface.kind = '';
                app.interface.create();
              }
            });
          }
        } else {
          app.interface.id = '';
          app.interface.kind = '';
          if (context === "tab") app.tab.open(url);
          if (context === "win") app.interface.create(url);
        }
      }
    }
  }
};

app.button.on.clicked(core.action.button);
app.window.on.removed(function (e) {core.action.removed(e, "win");});
/* the tab reader's id is a tab id: a closing TAB must clear it too,
   else the tab-kind surface keeps a dead id forever */
app.tab.on.removed(function (e) {core.action.removed(e, "tab");});
app.contextmenu.on.clicked(core.action.contextmenu);

app.on.startup(core.start);
app.on.installed(core.install);
app.on.storage(core.action.storage);
