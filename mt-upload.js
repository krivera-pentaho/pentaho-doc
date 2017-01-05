const commandLineArgs = require('command-line-args');
const fs = require('fs');
const curl = require('curlrequest');

var argDefs = [
    { name: "user", alias: "u", type: String, description: "Username used to authenticate with MindTouch" },
    { name: "password", alias: "p", type: String, description: "Password used to authenticate with MindTouch" },
    { name: "path", alias: "i", type: String, description: "Path to upload files in MindTouch" },
    { name: "doc", alias: "d", type: String, description: "Path to documentations" },
    { name: "help", alias: "h", type: Boolean, description: "Displays the help documentation" }
  ];

var cli = commandLineArgs( argDefs );

var doubleUri = function(path, underscoreToSpace) {
  return path.replace(/ /g, "%20") // Replace ' ' with '%20'
    .replace(/\//g, "%2F") // Replace '/' with '%2F'
    .replace(/_/g, "%20") // Replace '_' with '%20' -- MT urls have _ as spaces
    .replace(/\%/g, "%25"); // Double URI encode '%' with '%25'
};

var sanitizePath = function(path) {
  if (!path) {
    return;
  }

  // Remove beginning '/'
  if (path.charAt(0) == '/') {
    path = path.substr(1);
  }

  // Append end '/'
  if (path.charAt(path.length - 1) != '/') {
    path = path + "/";
  }

  return path;
};

var getFiles = function(path, files) {
  if (path.charAt(path.length - 1) != "/") {
    path += "/";
  }

  var items = fs.readdirSync(path);
  if(!items) {
    return;
  }

  var filenames = [];
  for (var i = 0; i < items.length; i++) {
    var name = items[i];

    var stat = fs.statSync(path + name);
    if (stat.isDirectory()) {
      getFiles(path + name + "/", files);
    } else if (stat.isFile() && name.search("\.html") == (name.length - 5) && name.search("jsdoc") == -1 && name.search("_modified.html") == -1) {
      filenames.push(name);
    }
  }

  files[path] = filenames;

  return files;
};

var replaceHref = function(fullPath, url, onsuccess) {
  fs.readFile(fullPath, 'utf8', function (err,data) {
    if (err) {
      return console.log(err);
    }

    var result = cleanDocumentBody(data)
      .match(/<body>([\w\W]+?)<\/body>/)[1]
      .replace(/href="(?!http)(.+?)"/g,
        function(g0, g1) {
          if(g1.indexOf("#") == 0) {
            return g0;
          } else {
            return g0.replace(g1, url + cleanFilename(g1));
          }
        });

    fullPath = fullPath.replace("\.html", "_modified.html");
    fs.writeFile(fullPath, result, 'utf8', function (err) {
       if (err) {
        return console.log(err);
      }

      onsuccess(fullPath);
    });
  });
}

var cleanFilename = function(filename) {
  // Remove '.html' and '.js' from the title of the URL
  return filename.replace("\.html", "").replace("\.js", "");
}

var cleanDocumentBody = function(body) {
  return body
    .replace("article>", "div>")
    .replace(/\.event:cdfcdf/g, "cdf#.event:cdf")
    .replace(/<h([0-9])>[\w\W]+?<\/h\1>/g, function(g0) {
      return g0.replace(/\s{2,}/g, '');
    })
    .replace(/\s{2,}/g, " ");
}


var upload = function(user, password, urlpath, fullpath, filename, onsuccess) {
  // Replace href with the url path so that hrefs map to the correct location
  replaceHref(fullpath, urlpath, function(outputFullPath) {
    var doubleUriUrlpath = doubleUri(sanitizePath(urlpath));

    var cleanedFilename = cleanFilename(filename);
    var pageName = "", re = /_(.*)_/g;

    if((m = re.exec(cleanedFilename)) !== null) {
      pageName = m[0].substr(1, m[0].length-2);
    } else {
      pageName = cleanedFilename.split('.')[cleanedFilename.split('.').length-1];
    }

    var options = {
      "user" : user + ":" + password,
      "data" : "@" + outputFullPath,
      "include" : true,
      "url": "https://pentaho-responsive.mindtouch.us/@api/deki/pages/=" + doubleUriUrlpath + cleanedFilename + "/contents?edittime=now&title="+pageName,
    };

    curl.request(options, function (err, parts, meta) {
      if (err) {
        console.log(err);
        return;
      }

      parts = parts.split('\r\n');
      var data = parts.pop(), head = parts.pop();

      try {
        var uploadUrl = data.match(/<uri.ui>(.+?)<\/uri.ui>/)[1];
        console.log("\n=== UPLOADED === ("+ filename+")\n" + uploadUrl);
        onsuccess();
      } catch (e) {
        console.log("\n=== ERROR ===  ("+ filename+")\n"+data.match(/<message>(.+?)<\/message>/)[1]);
      }
    });
  });
};

// MAIN
(function() {
  var options = cli.parse();

  if ( options.help ) {
    console.log( cli.getUsage( argDefs ) );
    return false;
  }

  var filesMap = getFiles(options.doc, { });
  dirs = Object.keys(filesMap);

  var j = 0, i = 0;
  var uploadFiles = function() {
    if (j < dirs.length) {
      var dir = dirs[j];
      var filenames = filesMap[dir];
      var url = sanitizePath(options.path) + dir.replace(options.doc, "");

      if (i < filenames.length) {
        var filename = filenames[i++];
        var fullpath = dir + filename;
        upload(options.user, options.password, url, fullpath, filename, uploadFiles);
      } else {
        i=0;
        j++;
        uploadFiles();
      }
    }
  };
  uploadFiles();

})();
