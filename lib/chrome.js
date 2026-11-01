var app = {};

app.error = function () {
  return chrome.runtime.lastError;
};

app.button = {
  "popup": function (popup, callback) {
    chrome.action.setPopup({"popup": popup}, function (e) {
      if (callback) callback(e);
    });
  },
  "on": {
    "clicked": function (callback) {
      chrome.action.onClicked.addListener(function (e) {
        app.storage.load(function () {
          callback(e);
        }); 
      });
    }
  }
};

app.contextmenu = {
  "removeAll": function (callback) {
    if (chrome.contextMenus) {
      chrome.contextMenus.removeAll(function (e) {
        app.error();
        /* creation waits for the wipe: a create racing removeAll
           replays the "duplicate id" error and loses radio items */
        if (callback) callback(e);
      });
    } else {
      if (callback) callback();
    }
  },
  "create": function (options, callback) {
    if (chrome.contextMenus) {
      chrome.contextMenus.create(options, function (e) {
        if (callback) callback(e);
      });
    }
  },
  "on": {
    "clicked": function (callback) {
      if (chrome.contextMenus) {
        chrome.contextMenus.onClicked.addListener(function (info, tab) {
          app.storage.load(function () {
            callback(info, tab);
          });
        });
      }
    }
  }
};

app.storage = {
  "local": {},
  "read": function (id) {
    return app.storage.local[id];
  },
  "update": function (callback) {
    /*  */
    chrome.storage.local.get(null, function (e) {
      app.storage.local = e;
      if (callback) {
        callback("update");
      }
    });
  },
  "patch": function (changes) {
    /* the change deltas land in the cache directly: a full re-read
       replaced the whole cache after the get, so a write landing in
       between was lost, and every single change paid a full round-trip */
    Object.keys(changes).forEach(function (key) {
      if (changes[key].newValue !== undefined) {
        app.storage.local[key] = changes[key].newValue;
      } else {
        delete app.storage.local[key];
      }
    });
  },
  "write": function (id, data, callback) {
    let tmp = {};
    tmp[id] = data;
    app.storage.local[id] = data;
    /*  */
    chrome.storage.local.set(tmp, function (e) {
      if (callback) {
        callback(e);
      }
    });
  },
  "load": function (callback) {
    const keys = Object.keys(app.storage.local);
    if (keys && keys.length) {
      if (callback) {
        callback("cache");
      }
    } else {
      app.storage.update(function () {
        if (callback) callback("disk");
      });
    }
  } 
};

app.window = {
  set id (e) {
    app.storage.write("window.id", e);
  },
  get id () {
    return app.storage.read("window.id") !== undefined ? app.storage.read("window.id") : '';
  },
  "create": function (options, callback) {
    chrome.windows.create(options, function (e) {
      if (callback) callback(e);
    });
  },
  "get": function (windowId, callback) {
    chrome.windows.get(windowId, function (e) {
      if (callback) callback(e);
    });
  },
  "update": function (windowId, options, callback) {
    chrome.windows.update(windowId, options, function (e) {
      if (callback) callback(e);
    });
  },
  "remove": function (windowId, callback) {
    chrome.windows.remove(windowId, function (e) {
      if (callback) callback(e);
    });
  },
  "query": {
    "current": function (callback) {
      chrome.windows.getCurrent(callback);
    }
  },
  "on": {
    "removed": function (callback) {
      chrome.windows.onRemoved.addListener(function (e) {
        app.storage.load(function () {
          callback(e);
        }); 
      });
    }
  }
};

app.tab = {
  "get": function (tabId, callback) {
    chrome.tabs.get(tabId, function (e) {
      if (callback) callback(e);
    });
  },
  "remove": function (tabId, callback) {
    chrome.tabs.remove(tabId, function (e) {
      if (callback) callback(e);
    });
  },
  "query": {
    "index": function (callback) {
      chrome.tabs.query({"active": true, "currentWindow": true}, function (tabs) {
        if (tabs && tabs.length) {
          callback(tabs[0].index);
        } else callback(undefined);
      });
    }
  },
  "update": function (tabId, options, callback) {
    if (tabId) {
      chrome.tabs.update(tabId, options, function (e) {
        if (callback) callback(e);
      });
    } else {
      chrome.tabs.update(options, function (e) {
        if (callback) callback(e);
      });
    }
  },
  "open": function (url, index, active, callback) {
    const properties = {
      "url": url, 
      "active": active !== undefined ? active : true
    };
    /*  */
    if (index !== undefined) {
      if (typeof index === "number") {
        properties.index = index + 1;
      }
    }
    /*  */
    chrome.tabs.create(properties, function (tab) {
      if (callback) callback(tab);
    }); 
  },
  "on": {
    "removed": function (callback) {
      chrome.tabs.onRemoved.addListener(function (e) {
        app.storage.load(function () {
          callback(e);
        });
      });
    }
  }
};

app.on = {
  "management": function (callback) {
    chrome.management.getSelf(callback);
  },
  "uninstalled": function (url) {
    chrome.runtime.setUninstallURL(url, function () {});
  },
  "installed": function (callback) {
    chrome.runtime.onInstalled.addListener(function (e) {
      app.storage.load(function () {
        callback(e);
      });
    });
  },
  "startup": function (callback) {
    chrome.runtime.onStartup.addListener(function (e) {
      app.storage.load(function () {
        callback(e);
      });
    });
  },
  "connect": function (callback) {
    /* the setup registers the handshake receiver itself and never reads
       the storage cache (its disconnect path defers internally) - the
       deferral used to register port.onMessage too late on a cold
       service worker and the handshake message was lost */
    chrome.runtime.onConnect.addListener(function (e) {
      if (callback) callback(e);
    });
  },
  "storage": function (callback) {
    chrome.storage.onChanged.addListener(function (changes, namespace) {
      /* the cache mirrors storage.local only - session/sync events
         must not write keys they never carry */
      if (namespace === "local") {
        app.storage.patch(changes);
      }
      if (callback) {
        callback(changes, namespace);
      }
    });
  },
  "message": function (callback) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      /* the cache keeps this dispatch synchronous; a consumer that
         answers inside the call wins, the once-flag auto-answers an
         empty echo so a silent consumer cannot hang the sender - the
         echo fires INSIDE the load callback, else a cold MV3 worker
         (empty cache, async load) answers {} first and swallows the
         consumer's real sendResponse */
      let answered = false;
      const once = function (response) {
        if (!answered) {
          answered = true;
          sendResponse(response);
        }
      };
      app.storage.load(function () {
        callback(request, sender, once);
        if (!answered) once({});
      });
      /*  */
      return false;
    });
  }
};

app.interface = {
  "path": chrome.runtime.getURL("data/interface/index.html"),
  set id (e) {
    app.storage.write("interface.id", e);
  },
  get id () {
    return app.storage.read("interface.id") !== undefined ? app.storage.read("interface.id") : '';
  },
  /*
    the id lives in two namespaces (a tab reader stores the tab id, a
    window reader the window id) - the kind records which one it is, so
    the removal and the focus calls route to the right API
  */
  set kind (e) {
    app.storage.write("interface.kind", e);
  },
  get kind () {
    return app.storage.read("interface.kind") !== undefined ? app.storage.read("interface.kind") : '';
  },
  "close": function (context) {
    if (app.interface.id) {
      try {
        /* the stored kind names the id's namespace - fall back to the
           asking surface when a legacy install never recorded one */
        const kind = app.interface.kind || context;
        if (kind === "tab") app.tab.remove(app.interface.id);
        if (kind === "win") app.window.remove(app.interface.id);
      } catch (e) {}
    }
  },
  "create": function (url, callback) {
    app.window.query.current(function (win) {
      app.window.id = win.id;
      url = url ? url : app.interface.path;
      /*  */
      const width = config.interface.size.width;
      const height = config.interface.size.height;
      const top = typeof config.interface.size.top === "number" ? config.interface.size.top : (win.top + Math.round((win.height - height) / 2));
      const left = typeof config.interface.size.left === "number" ? config.interface.size.left : (win.left + Math.round((win.width - width) / 2));
      /*  */
      app.window.create({
        "url": url,
        "top": top,
        "left": left,
        "width": width,
        "type": "popup",
        "height": height
      }, function (e) {
        if (callback) callback(e);
      });
    });
  }
};
