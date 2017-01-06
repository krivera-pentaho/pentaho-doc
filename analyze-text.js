var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');
var csv = require("fast-csv");

var readabilityKey = "readability";
var sentenceInfoKey = "sentence-info";
var verbTypesKey = "verb-types";
var sentenceBeginningsKey = "sentence-beginnings";

var filenamesLength = -1;
var main = function() {
  var filenames = [];
  findPages("./mt", function(filename) {
    filenames.push(filename);
  });

  filenamesLength = filenames.length;

  getReports(filenames, 0, {}, function(reports) {
    writeReports(reports);
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

var writeReports = function(reports) {
  console.log("\nWriting Reports");
  
  writeReport(readabilityKey, reports);
  writeReport(sentenceInfoKey, reports);
  writeReport(verbTypesKey, reports);
  writeReport(sentenceBeginningsKey, reports);
}

var writeReport = function(categoryName, reports) {
  var filename = "text-analysis-" + categoryName + ".csv";
  console.log("\nWriting " + filename);

  var csvStream = csv.createWriteStream({headers: true}),
      writableStream = fs.createWriteStream(filename);
  
  writableStream.on("finish", function(){
    console.log("DONE!");
  });
  
  csvStream.pipe(writableStream);
  for (var filename in reports) {
    var category = reports[filename][categoryName];
    for (var attribute in category) {
      csvStream.write({
        File: filename,
        Attribute: attribute,
        Value: category[attribute]
      });
    }      
  }
  csvStream.end();
}

var getReports = function(filenames, i, reports, oncomplete) {
  if (i >= filenames.length) {
    oncomplete(reports);
    return;
  }
  
  var filename = filenames[i];
  getReport("\"" + filename + "\"", function(report) {
    var percent = parseInt((i / filenamesLength)*100); 
    writeProgress("Building Reports: ", percent);
    // console.log("Building Reports: " + percent + "%");
    filename = filename
      .replace(/[\W\w]+\//g, "")
      .replace(/\.html/g, "");
    reports[filename] = report;
    
    getReports(filenames, ++i, reports, oncomplete);
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