"use strict";

// Download MindTouch
var http = require('http');
var fs = require('fs');
var pretty = require('pretty');
var parser = require('xml2json');

var main = function() {
  getSiteMap(function(pages) {
    saveHierarchy(pages, function() {
      // On Success
    });
  });
}

var maxRequests = 20;
var queuedRequests = 0;

var saveQueue = [];
var saveQueueInit = false;
var pagesLength = -1;
var saveHierarchy = function(pages, oncomplete) {
  if (!saveQueueInit) {
    saveQueue = pages;
    saveQueueInit = true;
    pagesLength = pages.length;
  }

  while (saveQueue.length > 0) {
    var data = saveQueue.pop();
    var requestSent = savePage(data.id, "mt/" + data.path.$t, data.id + "-" + data.title,
      function() { // success
        var percent = parseInt(((pagesLength - saveQueue.length)/ pagesLength)*100); 
        writeProgress("Writing Files", percent);
        if (queuedRequests == 0 && saveQueue.length == 0 && oncomplete) {
          oncomplete();
        } else {
          saveHierarchy(pages, oncomplete);
        }
      },
      function(e) { // failure
        console.log(e);
        oncomplete(e);
      });

    if (!requestSent) {
      saveQueue.push(data);
      return;
    }
  }
}

var getSubPageData = function(pageId, success, failure) {
  return httpGet("help.pentaho.com", "/@api/deki/pages/" + pageId + "/subpages", 
    function(data) {
      var regex = new RegExp(/id=\"([0-9]+)\".*?<title>(.+?)<\/title>/g);
      var match = null;
      var results = [];
      while(match = regex.exec(data)) {
        results.push({
          pageId: match[1],
          title: match[2]
        });
      }

      if (success) {
        success(results);
      }
    }, failure);
}

var savePage = function(pageId, path, filename, success, failure) {
  return httpGet("help.pentaho.com", "/@api/deki/pages/" + pageId + "/contents",
    function (data) {
      path = (path.startsWith("./") ? "" : "./" ) + path;
      makePath(path);
      filename = filename
        .replace(/\//g, "-") // replace "/" with "-"
        .replace(/:/g, ""); // replace ":" with ""
      var file = path + (path.endsWith("/") ? "" : "/") + filename + ".html";

      data = data
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g,">")
        .replace(/&quot;/g, '"');

      // Cleanup html
      fs.writeFile(file, pretty(data), function(err) {
        if(err) {
          if (failure) {
            failure(err)
          }
          return console.log(err);
        }
        
        if (success) {
          success();
        }
      });
    }, failure);
}

var getSiteMap = function(success, failure) {
  return httpGet("help.pentaho.com", "/@api/deki/pages", 
    function(data) {
      var jsonStr = parser.toJson(data);
      var json = JSON.parse(jsonStr);

      var resultsArr = [];
      flattenMap(json.pages.page, resultsArr);

      success(resultsArr);
    }, failure);
}

var flattenMap = function(page, result) {
  result.push(page);
  if (page.subpages.page) {
    var subpagesObj = page.subpages.page;
    if (subpagesObj.length > 0) {
      for (var i = 0; i < subpagesObj.length; i++) {
        flattenMap(subpagesObj[i], result);
      }
    } else {
      flattenMap(subpagesObj, result);
    }
  }
}

var httpGet = function(hostname, path, success, failure) {
  if (queuedRequests >= maxRequests) {
    return false;
  }

  try {
    ++queuedRequests;
    var request = http.get({
      hostname: hostname,
      path: path,
      agent: false  // create a new agent just for this one request
    }, (response) => {
      var str = '';

      response.on('data', function (chunk) { // data streaming in
        str += chunk;
      });

      response.on('end', function () { // all data retrieved
        --queuedRequests;
        if (success) {
          success(str);
        }
      });

      response.on("error", function(e) {
        --queuedRequests;
        console.log(e);
        if (failure) {
          failure();
        }
      })
    });
  } catch(e) {
    if (failure) {
      failure(e);
    }

    return false;
  }

  request.on("error", function(e) {
    console.log(e);
    if (failure) {
      failure();
    }
  });

  return true;
}

var makePath = function(path, success) {
  var folders = path.split("/");
  var dir = "";
  for (var i = 0; i < folders.length; i++) {
    var folder = folders[i];
    if (folder.length > 0) {
      dir += folder + "/";
      if (!fs.existsSync(dir)) { // make dir if it does not exist
        fs.mkdirSync(dir);
      }
    }
  }
}

var writeProgress = function(msg, percent) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(msg + " ( " + percent + "% )" );
}

main();