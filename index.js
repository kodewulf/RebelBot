var promise = require('bluebird')
var BeamSocket = require('./beam/ws');
var request = require('request');
var config = require('./config');
var _ = require("lodash");
var sqlite = require("sqlite3").verbose();
var urban = require('./apis/urban');

var db = new sqlite.Database('db.sqlite3');

var auth;
var endpoints = null;
var apiURL = "https://beam.pro/api/v1";
var socket;

var urC = new urban.Client();

// Giant function that handles chat joining and messages.
function getChatJoin(channelID, userID) {
    request({
        method: "GET",
        uri: apiURL + "/chats/" + channelID,
        jar: true
    },
        function (err, res, body) {
            var chatData = JSON.parse(body);
            auth = chatData.authkey;
            if (endpoints == null) {
                endpoints = chatData.endpoints;

                socket = new BeamSocket(endpoints).boot();
                socket.call('auth', [channelID, userID, auth]).then(function () {
                    console.log("[getChatJoin]: You are now authed!");
                }).catch(function (err) {
                    console.log("[getChatJoin]: ERROR NOT AUTHED!");
                });

                socket.on('ChatMessage', function (data) {
                    var text = "";
                    var roles = data.user_roles;

                    _.forEach(data.message.message, function (component) {
                        switch (component.type) {
                            case 'text':
                                text += component.data;
                                break;
                            case 'emoticon':
                                text += component.text;
                                break;
                            case 'link':
                                text += component.text;
                                break;
                        }
                    });
                    if (text.indexOf("!") == 0) {
                        // Should probably clean this up later.
                        var cText = text.replace('!addcom ', '');
                        var spltText = cText.split(' ');
                        var tiText = spltText.shift();
                        var comText = spltText.toString();
                        var allTheText = comText.replace(/,/g, ' ');

                        var dText = text.replace('!delcom ', '');
                        var dSpltText = cText.split(' ');
                        var dTiText = spltText.shift();
                        var dComText = spltText.toString();
                        var dAllTheText = comText.replace(/,/g, ' ');

                        var urText = text.replace('!urban ', '');

                        var qText = text.replace('!quote ', '');
                        var qSpltText = qText.split(' ');
                        var qTiText = qSpltText.shift();
                        var qComText = qSpltText.toString();
                        var qAllTheText = qComText.replace(/,/g, ' ');

                        var qaText = text.replace('!addquote ', '');
                        var qaSpltText = qaText.split(' ');
                        var qaTiText = qaSpltText.shift();
                        var qaComText = qaSpltText.toString();
                        var qaAllTheText = qaComText.replace(/,/g, ' ');

                        var qdText = text.replace('!delquote ', '');
                        var qdSpltText = qdText.split(' ');
                        var qdTiText = qdSpltText.shift();
                        var qdComText = qdSpltText.toString();
                        var qdAllTheText = qdComText.replace(/,/g, ' ');

                        // Adds a Command to the DB
                        if (text.indexOf("!addcom") == 0 && roles.indexOf("Owner") >= 0 || roles.indexOf("Mod") >= 0) {
                            if (tiText.indexOf("!") == 0) {
                                addCom(channelID, tiText, allTheText);
                            } else {
                                var tiText2 = "!" + tiText;
                                addCom(channelID, tiText2, allTheText);
                            }
                            console.log("[TEST]: " + tiText);
                            console.log("[TEST]: " + allTheText);
                        }

                        if (text.indexOf("!delcom") == 0 && roles.indexOf("Owner") >= 0 || roles.indexOf("Mod") >= 0) {
                            delCom(channelID, dText);
                        }

                        // Urban command
                        if (text.indexOf("!urban") == 0) {
                            urC.getTerm({ term: urText }, function(err, def){
                                if (err) {
                                    console.log(err);
                                } else {
                                    sendMsg(def);
                                }
                            });
                        }

                        // Deletes a quote from the DB
                        if (text.indexOf("!delquote") == 0 && roles.indexOf("Owner") >= 0 || roles.indexOf("Mod") >=0) {
                            delQuote(channelID, qdAllTheText);
                        }

                        // Adds a quote to the DB
                        if (text.indexOf("!addquote") == 0 && roles.indexOf("Owner") >= 0 || roles.indexOf("Mod") >= 0) {
                            console.log(qAllTheText);
                            addQuote(channelID, qaAllTheText);
                        }

                        // Grabs a quote from DB
                        if (text.indexOf("!quote") == 0) {
                            console.log(qText);
                            db.get("SELECT res FROM quotes WHERE ID = ? AND chan = ?", [qText, channelID], function(err, row){
                                if(err){
                                    console.log(err);
                                    sendMsg("There was ann error getting that quote");
                                } else {
                                    sendMsg(row.res);
                                }
                            });
                        }

                        // Gets Command from the DB
                        if (text.indexOf("!addcom") != 0 && text.indexOf("!urban") != 0 && text.indexOf("!addquote") != 0 && text.indexOf("!quote") != 0 && text.indexOf("!delcom") != 0 && text.indexOf("!delquote") != 0) {
                            db.get("SELECT response FROM commands WHERE chanID = ? AND name = ?", [channelID, text], function (err, row) {
                                if (err || row == undefined) {
                                    console.log(err)
                                    sendMsg("There was an error getting that command or that command doesn't exist");
                                } else {
                                    sendMsg(row.response);
                                }
                            });
                        }
                    }
                    if(data.user_name != "rip.") {
                        console.log('[' + data.user_name + ']: ' + text);
                    }
                });

            }
            console.log("[getChatJoin]: " + auth);
        });
}

// Bans a user. Not complete.
function banUser(username, chatID, uID) {
    request({
        method: "PATCH",
        uri: apiURL + "/channels/" + chatID + "/users/" + uID,
        json: true,
        body: {
            add: ["Banned"]
        },
        jar: true
    },
        function (err, res, body) {
            console.log(username);
            console.log(body);
        }
        );
}

// Sends a message to the chat server.
function sendMsg(msg) {
    socket.call('msg', [msg]).then(function () {
        console.log('[sendMsg]: ' + msg);
    }).catch(function (err) {
        console.log(err);
    });
}

// Adds a quote to the DB.
function addQuote(chanID, txt) {
    db.serialize(function() {
        db.run("INSERT INTO 'quotes' VALUES(null, ?, ?)", [txt, chanID], function(err){
            sendMsg("Quote added with ID of " + this.lastID);
        });

    });
}

// Deletes a quote from the DB.
function delQuote(chanID, qID) {
    db.serialize(function(){
        db.run("DELETE FROM 'quotes' WHERE ID = ? AND chan = ?", [qID, chanID]);
        sendMsg("Quote " + qID + " Removed!");
    });
}

// Deletes a command form the DB.
function delCom(chanID, com) {
    db.serialize(function(){
        db.run("DELETE FROM 'commands' WHERE chanid = ? AND name = ?", [chanID, com]);
        sendMsg("Command " + com + " removed!");
    });
}

// Adds a command to the DB.
function addCom(chanID, com, res) {
    db.serialize(function () {
        db.run("INSERT INTO 'commands' VALUES(?, ?, ?)", [chanID, com, res]);
        sendMsg("Command " + com + " added!");
    });
}

// Logs bot into beam.
function loginBot(username, password) {
    request({
        method: "POST",
        uri: apiURL + "/users/login",
        form: {
            username: username,
            password: password
        },
        jar: true
    },
        function (err, res, body) {
            console.log("[loginBot]: " + body);
            getChatJoin(config.beam.chatID, config.beam.userID);
        });
}

// uncaughtException handler. Probably will be replaced.
process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err);
});


loginBot(config.beam.user, config.beam.pass);
// console.log(data);
