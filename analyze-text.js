var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');
var csv = require("fast-csv");

var readabilityKey = "readability";
var sentenceInfoKey = "sentence-info";
var verbTypesKey = "verb-types";
var sentenceBeginningsKey = "sentence-beginnings";
var categoryKeys = [readabilityKey, sentenceInfoKey, verbTypesKey, sentenceBeginningsKey];

var logDir = "./bin/logs/";
var date = new Date();

var main = function() {
  var filenames = [];
  findPages("./mt", function(filename) {
    filenames.push(filename);
  });

  var filenamesLength = filenames.length;

  /* Make Dirs */
  logDir = logDir + date.toDateString() + "-" + date.toTimeString();
  var dirs = logDir.split("/"), dir = "";
  for (var i in dirs) {
    dir = path.resolve(dir, dirs[i]);
    if (!fs.existsSync(dir)) { // make dir if it does not exist
      fs.mkdirSync(dir);
    }
  }

  getReports(filenames, 0,
    function onreport(filename, report, i) {
      var percent = parseInt(((i + 1) / filenamesLength)*100); 
      writeProgress("Writing Reports: ", percent);
      for (var j in categoryKeys) {
        writeReport(filename, categoryKeys[j], report);
      }
    },
    function oncomplete() {
      console.log("");
      for (var i in csvStreams) { // End Stream
        csvStreams[i].end();
      }
    });
}

var writeProgress = function(msg, percent) {
  if (process.stdout.clearLine) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(msg + " ( " + percent + "% )" );
  } else {
    console.log(msg + " ( " + percent + "% )");
  }
}

var csvStreams = {};
var writeReport = function(filename, categoryName, report) {
  var csvStream = csvStreams[categoryName];
  if (!csvStream) {
    var csvFilename = path.resolve(logDir, "text-analysis-" + categoryName + ".csv");

    csvStream = csv.createWriteStream({headers: true});
    var writableStream = fs.createWriteStream(csvFilename);
    
    writableStream.on("finish", function(){
      console.log("done writing " + csvFilename);
    });
    
    csvStream.pipe(writableStream);
    csvStreams[categoryName] = csvStream;
  }

  var category = report[categoryName];
  for (var attribute in category) {
    csvStream.write({
      File: filename,
      Attribute: attribute,
      Value: category[attribute]
    });
  }

  return csvStream;
}

var getReports = function(filenames, i, onreport, oncomplete) {
  if (i >= filenames.length) {
    oncomplete();
    return;
  }
  
  var filename = filenames[i];
  getReport("\"" + filename + "\"", function(report) {
    filename = filename
      .replace(/[\W\w]+\//g, "")
      .replace(/\.html/g, "");
    onreport(filename, report, i);
    
    getReports(filenames, ++i, onreport, oncomplete);
  });
}

var findPages = function(dir, onpage) {
  var list = fs.readdirSync(dir);
  if (!list.length) {
    return;
  }
  
  list.forEach(function(file) {
    file = path.resolve(dir, file);
    var stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      findPages(file, onpage);
    } else {
      onpage(file)
    }
  });
}

var getReport = function(filename, onsuccess) {
  exec("w3m -dump " + filename + " | style", function(error, stdout, stderr) {
    if (error) {
      console.log(error);
      return;
    }

    var results = {};
    var numberInParen = /\((\d+)\)/g;

    results[readabilityKey] = {};
    getEntries(/readability grades:([\W\w]+?)sentence info:/g, stdout, function(entry) {
      var kv = entry.split(":");
      var key = kv[0].trim();
      var value = kv[1].trim();

      getMatches(/\d{2}\.\d/g, value, function(match) {
        results[readabilityKey][key] = match[0];
      });
    })

    results[sentenceInfoKey] = {};
    getEntries(/sentence info:([\W\w]+?)word usage:/g, stdout, function(entry) {
      getMatches(/  (\d+?|\d+% \(\d+\)) ([\w ]+)/g, entry, function(match) {
        var key = match[2].trim();
        var value = match[1].trim();
        if (value.search(/\(/g) > -1) {
          getMatches(numberInParen, value, function(submatch) {
            results[sentenceInfoKey][key]= submatch[1];
          });
        } else {
          results[sentenceInfoKey][key]= value;
        }
      });
    })

    results[verbTypesKey] = {};
    getEntries(/verb types:([\w\W]+?)sentence beginnings:/g, stdout, function(entry) {
      getMatches(/([\w ]+?) (\d*\(\d+\))/g, entry, function(match) {
        var key = match[1].trim();
        var value = match[2].trim();
        getMatches(numberInParen, value, function(submatch) {
           results[verbTypesKey][key] = submatch[1];
        });
      });
    });

    results[sentenceBeginningsKey] = {};
    getEntries(/sentence beginnings:([\W\w]+?)$/g, stdout, function(entry) {
      getMatches(/([\w ]+?) (\d*\(\d+\))/g, entry, function(match) {
        var key = match[1].trim();
        var value = match[2].trim();
        getMatches(numberInParen, value, function(submatch) {
           results[sentenceBeginningsKey][key] = submatch[1];
        });
      });
    });

    onsuccess(results);
  });
}

var getMatches = function(regex, data, onmatch) {
  var match = null;
  while(match = regex.exec(data)) {
    onmatch(match);
  }
}

var getEntries = function(regex, data, onentry) {
  getMatches(regex, data, function(match) {
    var entries = match[1].split("\n");
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i]; 
      if (entry.length == 0) {
        continue;
      }
      onentry(entry);      
    }
  });
}

main();