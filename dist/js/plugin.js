"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const through2 = require('through2');
const PluginError = require("plugin-error");
const pkginfo = require('pkginfo')(module); // project package.json info into module.exports
const PLUGIN_NAME = module.exports.name;
const loglevel = require("loglevel");
const log = loglevel.getLogger(PLUGIN_NAME); // get a logger instance based on the project name
log.setLevel((process.env.DEBUG_LEVEL || 'warn'));
const parse = require('csv-parse');
/** wrap incoming recordObject in a Singer RECORD Message object*/
function createRecord(recordObject, streamName) {
    return { type: "RECORD", stream: streamName, record: recordObject };
}
/* This is a gulp-etl plugin. It is compliant with best practices for Gulp plugins (see
https://github.com/gulpjs/gulp/blob/master/docs/writing-a-plugin/guidelines.md#what-does-a-good-plugin-look-like ),
and like all gulp-etl plugins it accepts a configObj as its first parameter */
function carfiltering(configObj) {
    if (!configObj)
        configObj = {};
    if (!configObj.columns)
        configObj.columns = true; // we don't allow false for columns; it results in arrays instead of objects for each record
    // creating a stream through which each file will pass - a new instance will be created and invoked for each file 
    // see https://stackoverflow.com/a/52432089/5578474 for a note on the "this" param
    const strm = through2.obj(function (file, encoding, cb) {
        const self = this;
        let returnErr = null;
        const parser = parse(configObj);
        // post-process line object
        const carFiltering = (lineObj, _streamName) => {
            if (lineObj.record["price"] <= 15000) {
                lineObj = "";
            }
            else {
                lineObj = createRecord(lineObj, _streamName);
            }
            return lineObj;
        };
        function newTransformer(streamName) {
            let transformer = through2.obj(); // new transform stream, in object mode
            // transformer is designed to follow csv-parse, which emits objects, so dataObj is an Object. We will finish by converting dataObj to a text line
            transformer._transform = function (dataObj, encoding, callback) {
                let returnErr = null;
                try {
                    let handledObj = carFiltering(dataObj, streamName);
                    if (handledObj) {
                        let handledLine = JSON.stringify(handledObj);
                        log.debug(handledLine);
                        this.push(handledLine + '\n');
                    }
                }
                catch (err) {
                    returnErr = new PluginError(PLUGIN_NAME, err);
                }
                callback(returnErr);
            };
            return transformer;
        }
        // set the stream name to the file name (without extension)
        let streamName = file.stem;
        if (file.isNull()) {
            // return empty file
            return cb(returnErr, file);
        }
        else if (file.isBuffer()) {
            parse(file.contents, configObj, function (err, linesArray) {
                // this callback function runs when the parser finishes its work, returning an array parsed lines 
                let tempLine;
                let resultArray = [];
                // we'll call handleLine on each line
                for (let dataIdx in linesArray) {
                    try {
                        let lineObj = linesArray[dataIdx];
                        tempLine = carFiltering(lineObj, streamName);
                        if (tempLine) {
                            let tempStr = JSON.stringify(tempLine);
                            log.debug(tempStr);
                            resultArray.push(tempStr);
                        }
                    }
                    catch (err) {
                        returnErr = new PluginError(PLUGIN_NAME, err);
                    }
                }
                let data = resultArray.join('\n');
                file.contents = Buffer.from(data);
                // we are done with file processing. Pass the processed file along
                log.debug('calling callback');
                cb(returnErr, file);
            });
        }
        else if (file.isStream()) {
            file.contents = file.contents
                .pipe(parser)
                .on('end', function () {
                // DON'T CALL THIS HERE. It MAY work, if the job is small enough. But it needs to be called after the stream is SET UP, not when the streaming is DONE.
                // Calling the callback here instead of below may result in data hanging in the stream--not sure of the technical term, but dest() creates no file, or the file is blank
                // cb(returnErr, file);
                // log.debug('calling callback')    
                log.debug('csv parser is done');
            })
                // .on('data', function (data:any, err: any) {
                //   log.debug(data)
                // })
                .on('error', function (err) {
                log.error(err);
                self.emit('error', new PluginError(PLUGIN_NAME, err));
            })
                .pipe(newTransformer(streamName));
            // after our stream is set up (not necesarily finished) we call the callback
            log.debug('calling callback');
            cb(returnErr, file);
        }
    });
    return strm;
}
exports.carfiltering = carfiltering;
//# sourceMappingURL=plugin.js.map