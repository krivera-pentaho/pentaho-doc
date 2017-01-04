"use strict";

// Download MindTouch
var http = require('http');
var fs = require('fs');
var pretty = require('pretty');
var main = function() {
  buildHierarchy("home", "mt", [], function(pages) {
    saveHierarchy(pages, function() {
      console.log("all files saved");
    });
  })
}

var queue = [];
var maxRequests = 20;
var queuedRequests = 0;
var buildHierarchy = function(pageId, path, result, oncomplete) {
  return getSubPageData(pageId, function(pages) {
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      page.path = path;
      result.push(page);
    }

    queue = queue.concat(pages);

    console.log(result.length + " pages loaded");

    if (queue.length > 0) {
      for (var i = 0; i < maxRequests; i++) {
        let data = queue.pop();
        if (!data) {
          break;
        }
        if (!buildHierarchy(data.pageId, path + "/" + data.pageId, result, oncomplete)) {
          queue.push(data);
        }
      }
    } else if (queuedRequests == 0 && oncomplete) {
      oncomplete(result);
    }
  }, function(e) {
    console.log(e);
  });
}

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
    var requestSent = savePage(data.pageId, data.path, data.pageId + "-" + data.title,
      function() { // success
        var percent = parseInt(((pagesLength - saveQueue.length)/ pagesLength)*100); 
        console.log(percent + "% complete saving");
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
      filename = filename.replace(/\//g, "-"); // remove "/" from filename
      var file = path + (path.endsWith("/") ? "" : "/") + filename + ".html";

      data = data
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g,">");

      // Cleanup html
      fs.writeFile(filename + ".html", pretty(data), function(err) {
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
  process.chdir(__dirname); // Revert to root location

  var folders = path.split("/");
  var dir = "";
  for (var i = 0; i < folders.length; i++) {
    var folder = folders[i]; 
    if (folder.length > 0) {
      if (!fs.existsSync(folder)) { // make dir if it does not exist
        fs.mkdirSync(folder);
      }
      process.chdir(folder);
    }
  }
}

main();