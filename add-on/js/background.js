var loader_port = browser.runtime.connectNative("WT_loader");

// store every connection
var ports = [];
browser.runtime.onConnect.addListener(p => {
    if (p.name === "WT_loader") {
        ports[p.sender.contextId] = p;
    }
});

// forward native response to dev-tool  
loader_port.onMessage.addListener((response) => {
    console.log("Recive:" + response);
    for (let p in ports) {
        try {
            ports[p].postMessage(response);
        } catch (error) {
            delete ports[p];
        }
    }
});


// recive message from port
browser.runtime.onMessage.addListener((message_json, sender, sendResponse) => {
    let message = JSON.parse(message_json);
    console.log(message);
    if (message.mode === "bfac") {
        browser.tabs.query({currentWindow: true, active: true}).then(([tabinfo]) => {
            let request = {
                "mode": message.mode,
                "sender": sender.contextId,
                "body": tabinfo.url
            }
            console.log(JSON.stringify(request));
            loader_port.postMessage(JSON.stringify(request));
        });
    } else if (message.mode === "sublist3r") {
        browser.tabs.query({currentWindow: true, active: true}).then(([tabinfo]) => {
            let url = tabinfo.url.split(":")[1].split("/").filter(i => i)[0]
            let request = {
                "mode": message.mode,
                "sender": sender.contextId,
                "body": url
            }
            console.log(JSON.stringify(request));
            loader_port.postMessage(JSON.stringify(request));
        });
    } else if (message.mode === "dirsearch") {
        browser.tabs.query({currentWindow: true, active: true}).then(([tabinfo]) => {
            let url_component = tabinfo.url.split("/");
            url_component.pop();
            let url = url_component.join("/");
            let request = {
                "mode": message.mode,
                "sender": sender.contextId,
                "body": url
            }
            console.log(JSON.stringify(request));
            loader_port.postMessage(JSON.stringify(request));
        });
    } else if (message.mode === "GET") {
        browser.tabs.query({currentWindow: true, active: true}).then(([tabinfo]) => {
            var updating = browser.tabs.update(
                tabinfo.id,
                {url: message.url}
            ).then(null, null);
        });
    } else if (message.mode === "POST") {
        // console.log(message);
        browser.tabs.query({ currentWindow: true, active: true }).then(([tabinfo]) => {
            // console.logo(tabinfo);
            console.log(tabinfo);
            console.log(connections);
            connections[tabinfo.id]["content"].postMessage({
                action: "POST",
                url: message.url,
                body: message.body
            });
        });
    } else if (message.mode === "GET_URL") {
        browser.tabs.query({ currentWindow: true, active: true }).then(([tabinfo]) => {
            ports[sender.contextId].postMessage(JSON.stringify({mode:"GET_URL", url:tabinfo.url}));
        });
    }
})



var connections = {};

browser.runtime.onConnect.addListener(port => {
    var extensionListener = message => {
        var tabId = port.sender.tab ? port.sender.tab.id : message.tabId;

        if (message.action == "init") {
            if (!connections[tabId]) {
                connections[tabId] = {};
            }
            connections[tabId][port.name] = port;
            return;
        }

        if (message.target) {
            var conn = connections[tabId][message.target];
            if (conn) {
                conn.postMessage(message);
            }
        }
    };

    port.onMessage.addListener(extensionListener);

    port.onDisconnect.addListener(port => {
        var tabs = Object.keys(connections);
        for (var i=0, len=tabs.length; i < len; i++) {
        if (connections[tabs[i]][port.name] === port) {
            delete connections[tabs[i]][port.name];
            if (Object.keys(connections[tabs[i]]).length === 0) {
                delete connections[tabs[i]];
            }
            break;
            }
        }
    });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
  if (changeInfo.status === "complete") {
    var conn = connections[tabId]["panel"];
    if (conn) {
      conn.postMessage({
          action: "update",
          target: "panel"
      });
    }
  }
},
{
  properties: ["status"]
});

//
"use strict";

let config;
let started = 'off';
let debug_mode = false;
const isChrome = (navigator.userAgent.toLowerCase().indexOf("chrome") !== -1);

loadFromBrowserStorage(['config', 'started'], function (result) {

  // if old storage method
  if (result.config === undefined) loadConfigurationFromLocalStorage();
  else {
    started = result.started;
    config = JSON.parse(result.config);
  }

  if (started === 'on') {
    addListener();
    // chrome.browserAction.setIcon({ path: 'icons/modify-green-32.png' });
  }
  else if (started !== 'off') {
    started = 'off';
    storeInBrowserStorage({ started: 'off' });
  }
  // listen for change in configuration or start/stop
  chrome.runtime.onMessage.addListener(notify);
});


function loadConfigurationFromLocalStorage() {
  // if configuration exist 
  if (localStorage.getItem('config')) {
    console.log("Load standard config");
    config = JSON.parse(localStorage.getItem('config'));

    // If config 1.0 (Simple Modify headers V1.2) , save to format 1.1
    if (config.format_version === "1.0") {
      config.format_version = "1.2";
      for (let line of config.headers) {
        line.apply_on = "req";
        line.url_contains = "";
      }
      config.debug_mode = false;
      config.use_url_contains = false;
      console.log("save new config" + JSON.stringify(config));
    }
    // If config 1.1 (Simple Modify headers V1.3 to version 1.5) , save to format 1.2	
    if (config.format_version === "1.1") {
      config.format_version = "1.2";
      for (let line of config.headers) line.url_contains = "";
      config.use_url_contains = false;
      console.log("save new config" + JSON.stringify(config));
    }
  }
  else {
    // else check if old config exist (Simple Modify headers V1.1)
    if (localStorage.getItem('targetPage') && localStorage.getItem('modifyTable')) {
      console.log("Load old config");
      let headers = [];
      let modifyTable = JSON.parse(localStorage.getItem("modifyTable"));
      for (const to_modify of modifyTable) {
        headers.push({ action: to_modify[0], url_contains: "", header_name: to_modify[1], header_value: to_modify[2], comment: "", apply_on: "req", status: to_modify[3] });
      }
      config = { format_version: "1.1", target_page: localStorage.getItem('targetPage'), headers: headers, debug_mode: false, use_url_contains: false };
    }
    //else no config exists, create a default one
    else {
      console.log("Load default config");
      let headers = [];
      headers.push({ url_contains: "", action: "add", header_name: "test-header-name", header_value: "test-header-value", comment: "test", apply_on: "req", status: "on" });
      config = { format_version: "1.1", target_page: "*", headers: headers, debug_mode: false, use_url_contains: false };
    }
  }
  storeInBrowserStorage({ config: JSON.stringify(config) });
  started = localStorage.getItem('started');
  if (started !== undefined) storeInBrowserStorage({ started: started });
}




function loadFromBrowserStorage(item, callback_function) {
  chrome.storage.local.get(item, callback_function);
}

function storeInBrowserStorage(item, callback_function) {
  chrome.storage.local.set(item, callback_function);
}


/*
* Standard function to log messages
*
*/

function log(message) {
  console.log(new Date() + " SimpleModifyHeader : " + message);
}

/*
* Rewrite the request header (add , modify or delete)
*
*/
function rewriteRequestHeader(e) {
  if (config.debug_mode) log("Start modify request headers for url " + e.url);
  for (let to_modify of config.headers) {
    if ((to_modify.status === "on") && (to_modify.apply_on === "req") && (!config.use_url_contains || (config.use_url_contains && e.url.includes(to_modify.url_contains)))) {
      if (to_modify.action === "add") {
        let new_header = { "name": to_modify.header_name, "value": to_modify.header_value };
        e.requestHeaders.push(new_header);
        if (config.debug_mode) log("Add request header : name=" + to_modify.header_name +
          ",value=" + to_modify.header_value + " for url " + e.url);
      }
      else if (to_modify.action === "modify") {
        for (let header of e.requestHeaders) {
          if (header.name.toLowerCase() === to_modify.header_name.toLowerCase()) {
            if (config.debug_mode) log("Modify request header :  name= " + to_modify.header_name +
              ",old value=" + header.value + ",new value=" + to_modify.header_value +
              " for url " + e.url);
            header.value = to_modify.header_value;
          }
        }
      }
      else if (to_modify.action === "delete") {
        let index = -1;
        for (let i = 0; i < e.requestHeaders.length; i++) {
          if (e.requestHeaders[i].name.toLowerCase() === to_modify.header_name.toLowerCase()) index = i;
        }
        if (index !== -1) {
          e.requestHeaders.splice(index, 1);
          if (config.debug_mode) log("Delete request header :  name=" + to_modify.header_name.toLowerCase() +
            " for url " + e.url);
        }
      }
    }
  }
  if (config.debug_mode) log("End modify request headers for url " + e.url);
  return { requestHeaders: e.requestHeaders };
}


/*
* Rewrite the response header (add , modify or delete)
*
*/
function rewriteResponseHeader(e) {
  if (config.debug_mode) log("Start modify response headers for url " + e.url);
  for (let to_modify of config.headers) {
    if ((to_modify.status === "on") && (to_modify.apply_on === "res") && (!config.use_url_contains || (config.use_url_contains && e.url.includes(to_modify.url_contains)))) {
      if (to_modify.action === "add") {
        let new_header = { "name": to_modify.header_name, "value": to_modify.header_value };
        e.responseHeaders.push(new_header);
        if (config.debug_mode) log("Add response header : name=" + to_modify.header_name
          + ",value=" + to_modify.header_value + " for url " + e.url);
      }
      else if (to_modify.action === "modify") {
        for (let header of e.responseHeaders) {
          if (header.name.toLowerCase() === to_modify.header_name.toLowerCase()) {
            if (config.debug_mode) log("Modify response header :  name= " + to_modify.header_name + ",old value="
              + header.value + ",new value=" + to_modify.header_value + " for url " + e.url);
            header.value = to_modify.header_value;
          }
        }
      }
      else if (to_modify.action === "delete") {
        let index = -1;
        for (let i = 0; i < e.responseHeaders.length; i++) {
          if (e.responseHeaders[i].name.toLowerCase() === to_modify.header_name.toLowerCase()) index = i;
        }
        if (index !== -1) {
          e.responseHeaders.splice(index, 1);
          if (config.debug_mode) log("Delete response header :  name=" + to_modify.header_name.toLowerCase()
            + " for url " + e.url);
        }
      }
    }
  }
  if (config.debug_mode) log("End modify response headers for url " + e.url);
  return { responseHeaders: e.responseHeaders };
}


/*
* Listen for message form config.js
* if message is reload : reload the configuration
* if message is on : start the modify header
* if message is off : stop the modify header
*
**/
function notify(message) {
  if (message === "reload") {
    if (config.debug_mode) log("Reload configuration");
    loadFromBrowserStorage(['config'], function (result) {
      config = JSON.parse(result.config);
      if (started === "on") {
        removeListener();
        addListener();
      }
    });
  }
  else if (message === "off") {
    removeListener();
    // chrome.browserAction.setIcon({ path: "icons/modify-32.png" });
    started = "off";
    if (config.debug_mode) log("Stop modifying headers");
  }
  else if (message === "on") {
    addListener();
    // chrome.browserAction.setIcon({ path: "icons/modify-green-32.png" });
    started = "on";
    if (config.debug_mode) log("Start modifying headers");
  }
}

/*
* Add rewriteRequestHeader as a listener to onBeforeSendHeaders, only for the target pages.
* Add rewriteResponseHeader as a listener to onHeadersReceived, only for the target pages.
* Make it "blocking" so we can modify the headers.
*/
function addListener() {
  let target = config.target_page;
  if ((target === "*") || (target === "") || (target === " ")) target = "<all_urls>";

  // need to had "extraHeaders" option for chrome https://developer.chrome.com/extensions/webRequest#life_cycle_footnote
  if (isChrome) {
    chrome.webRequest.onBeforeSendHeaders.addListener(rewriteRequestHeader,
      { urls: target.split(";") },
      ["blocking", "requestHeaders", "extraHeaders"]);

    chrome.webRequest.onHeadersReceived.addListener(rewriteResponseHeader,
      { urls: target.split(";") },
      ["blocking", "responseHeaders", "extraHeaders"]);
  }

  else {
    chrome.webRequest.onBeforeSendHeaders.addListener(rewriteRequestHeader,
      { urls: target.split(";") },
      ["blocking", "requestHeaders"]);
    chrome.webRequest.onHeadersReceived.addListener(rewriteResponseHeader,
      { urls: target.split(";") },
      ["blocking", "responseHeaders"]);
  }

}


/*
* Remove the two listener
*
*/
function removeListener() {
  chrome.webRequest.onBeforeSendHeaders.removeListener(rewriteRequestHeader);
  chrome.webRequest.onHeadersReceived.removeListener(rewriteResponseHeader);
}