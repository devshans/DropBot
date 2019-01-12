/*
    @document   : DropBot.js
    @author     : devshans
    @copyright  : 2019, devshans
    @license    : The MIT License (MIT) - see LICENSE
    @description: DropBot automated Bot for Discord Application.
                  Uses discord.io Discordapp library.
                  Randomly selects a location to start in for 
                    the Fortnite Battle Royale game. 
		  Hosted on AWS.

    Links  * Epic Games : https://www.epicgames.com
           * Fortnite   : https://www.epicgames.com/fortnite/en-US/home
           * Discord    : https://discordapp.com
	   * discord.io : https://github.com/izy521/discord.io
*/

var Discord = require('discord.io');
var logger  = require('winston');
var auth    = require('./auth.json');
var rwc     = require('random-weighted-choice');
var fs      = require('fs');
var AWS     = require("aws-sdk");
let date    = require('date-and-time');

const DEBUG_VERBOSE = true;

// Discord ID of this bot to identify ourselves.
const DROPBOT_ID  = 487298106849886224;

const USER_TIMEOUT_SEC = 2;
const USER_MAX_STRIKES = 3;

const NUM_DROP_LOCATIONS = 21;
const DEFAULT_WEIGHT =  5;
const MAX_WEIGHT     = 10;

AWS.config.update({
    region: "us-east-2",
    endpoint: "https://dynamodb.us-east-2.amazonaws.com"
});

var docClient = new AWS.DynamoDB.DocumentClient();

var table = "DropLocations";

// DynamoDB Table Names
var dbTableGuilds    = "DropGuilds";
var dbTableLocations = "DropLocations";
var dbTableUsers     = "DropUsers";

var dropLocationNames = [
    "Dusty Divot"
    ,"Fatal Fields"
    ,"Frosty Flights"
    ,"Greasy Grove"
    ,"Happy Hamlet"
    ,"Haunted Hills"
    ,"Junk Junction"
    ,"Lazy Links"
    ,"Lonely Lodge"
    ,"Loot Lake"
    ,"Lucky Landing"
    ,"Paradise Palms"
    ,"Pleasant Park"
    ,"Polar Peak"
    ,"Retail Row"
    ,"Salty Springs"
    ,"Shifty Shafts"
    ,"Snobby Shores"
    ,"The Block"
    ,"Tilted Towers"
    ,"Wailing Woods"
];

var serverInitialized   = {};
var dropUserInitialized = {};

var dropUserTimeout     = {};
var dropUserStrikes     = {};
var dropUserBlocked     = {};
var serverDropLocations = {};
var serverDropWeights   = {};
var serverAudioMute     = {};

var dropIntros = [
     'intro.wav'
    ,'intro2.wav'
    ,'intro3.wav'
];

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console());
logger.level = 'debug';

var filenameArray = __filename.split("/");

var defaultWeights = [];
initDefaultWeights().then((result) => console.log("Retrieved default weights."));

// Init Discord Bot
var bot = new Discord.Client({
    token: auth.token,
    autorun: true
});

// 0: playing
// 1: streaming
// 2: listening
// 3: watching
bot.setPresence({
    game: {    
        name:"Where we droppin' boys?",
        type:2
    }
});

async function initGuildDatabase(guildName, guildID) {

    return new Promise(function(resolve, reject) {

        var guildPromise = getDropBotGuilds(guildID);

        guildPromise.then(function(result) {

            var stringDB = defaultWeights.reduce((map, obj) => (map[obj.id] = obj.weight, map), {});

            if (result.Item == null) {
                // Create entry in database.
                console.log("Attempting to create a new guild entry in database...");
                var params = {
                    TableName: dbTableGuilds,
                    Item:{
                        "name":guildName,			
                        "id":guildID,
                        "dropLocations":stringDB,
			"audioMute":false
                    }
                };

                docClient.put(params).promise().then(function(result) {
                    console.log("Successfully created entry.");
                    resolve(result);
                }, function(err) {
                    console.log("Failed to create database entry");
                    console.log(err);
                    reject(err);
                });

            } else {
                resolve(result);
            }

        }, function(err) {
            console.log(err);
            reject(err);
        });

    });

}

async function initUser(userName, userID, accessTime) {

    return new Promise(function(resolve, reject) {

        var userPromise = getDropBotUsers(userID);

        userPromise.then(function(result) {

            if (result.Item == null) {
                // Create entry in database.
                console.log("Attempting to create a new user entry in database...");
                var params = {
                    TableName: dbTableUsers,
                    Item:{
                        "name":userName,
                        "id":userID,
                        "accessTime":accessTime,
                        "blocked":false
                    }
                };

                docClient.put(params).promise().then(function(result) {
                    console.log("Successfully created entry.");
                    dropUserTimeout[userID] = accessTime;
                    dropUserStrikes[userID] = 0;
                    dropUserBlocked[userID] = false;
                    dropUserInitialized[userID] = true;
                    resolve(result);
                }, function(err) {
                    console.log("Failed to create database entry");
                    console.log(err);
                    reject(err);
                });

            } else {
                resolve(result);
            }

        }, function(err) {
            console.log(err);
            reject(err);
        });

    });

}

async function updateUser(userID, accessTime, blocked) {

    return new Promise(function(resolve, reject) {

        console.log("updateUser for user: ", userID);

        var params = {
            TableName: dbTableUsers,
            Key:{
                "id":userID
            },
            UpdateExpression: "set accessTime = :a, blocked = :b",
            ExpressionAttributeValues:{
                ":a":accessTime,
                ":b":blocked
            },
            ReturnValues:"UPDATED_NEW"
        };

        docClient.update(params).promise().then(function(result) {
            dropUserTimeout[userID] = accessTime;
            console.log("Successfully updated user database entry.");
            resolve(result);
        }, function(err) {
            console.log("Failed to update user database entry");
            console.log(err);
            reject(err);
        });

    });

}

async function updateGuildDrops(guildID) {

    return new Promise(function(resolve, reject) {

        console.log("updateGuildDrops for server: ", guildID);

        var stringDB = serverDropLocations[guildID].reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set dropLocations = :d",
            ExpressionAttributeValues:{
                ":d":stringDB
            },
            ReturnValues:"UPDATED_NEW"
        };

        docClient.update(params).promise().then(function(result) {
            console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.log("Failed to update database entry");
            console.log(err);
            reject(err);
        });

    });

}

async function updateGuildAudioMute(guildID) {

    return new Promise(function(resolve, reject) {

        console.log("updateGuildAudioMute for server: ", guildID, " to ", serverAudioMute[guildID]);

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set audioMute = :bool",
            ExpressionAttributeValues:{
                ":bool":serverAudioMute[guildID]
            },
            ReturnValues:"UPDATED_NEW"
        };

        docClient.update(params).promise().then(function(result) {
            console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.log("Failed to update database entry");
            console.log(err);
            reject(err);
        });

    });

}

async function initDefaultWeights(guildID) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        console.log("Getting default weights for bot.");

        for (var id = 0; id < dropLocationNames.length; id++) {
            promises.push(getDropLocation(id));
        }

        Promise.all(promises).then((results) => {

            for (var i=0; i < results.length; i++) {
                var dropLocationWeight = results[i].Item.defaultWeight;
                var dropLocationName   = results[i].Item.name;

                defaultWeights.push({
                    id: results[i].Item.id,
                    weight: dropLocationWeight
                });

            }

            resolve(defaultWeights);

        }).catch((e) => {
            console.log("Error in: ", e);
            reject(e);
        });
    });

}

async function initGuild(guildID) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        console.log("Getting dropLocation weights for server: ", guildID);

        if (serverDropLocations[guildID] != null && serverDropLocations[guildID].length > 0) {
            console.log("serverDropLocations already set.");
            resolve(serverDropLocations[guildID]);
        }

        serverDropLocations[guildID] = [];
        serverDropWeights[guildID]   = 0;
	serverAudioMute[guildID]     = false;

        readGuild(guildID).then(result => {

            var myDropLocations = result.Item.dropLocations;

	    serverAudioMute[guildID] = result.Item.audioMute;

            for (var i in myDropLocations) {
                serverDropWeights[guildID] += myDropLocations[i];
                serverDropLocations[guildID].push({
                    id: i,
                    weight: myDropLocations[i]
                });
            }
            resolve(serverDropLocations[guildID]);
        }).catch((e) => {
            console.log("Error: ", e);
            reject(e);
        });

    });

}

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');

    var params = {
        TableName: dbTableUsers,
    };
    docClient.scan({TableName: dbTableUsers}).eachPage((err, data, done) => {
        if (data != null) {
            for (let index = 0; index < data.Items.length; index++) {
                dropUserTimeout[data.Items[index].id] = data.Items[index].accessTime;
                dropUserStrikes[data.Items[index].id] = 0;
                dropUserBlocked[data.Items[index].id] = data.Items[index].blocked;
                dropUserInitialized[data.Items[index].id] = true;
            }
        }
        done();
    });

});

async function handleCommand(args, userID, channelID, guildID) {

    var cmd = args[0];
    message = "";

    console.log("handleCommand: ", args);

    args = args.splice(1);
    switch(cmd) {

    // List all possible commands and usage.
    case 'h':
    case 'help':
        message =  '```DropBot\n';
        message += 'Runs by sending \"db!\" message in a Discord server with DropBot active.\n';
        message += '   Will randomly choose a location in Fortnite to drop.\n\n';
        message += 'Optional features:\n';
        message += 'usage: db![option] [argument] ...\n\n';
        message += 'db![option]    Arguments\n';
        message += '-----------------------\n';
        message += 'db!            Randomly choose a Fortnite location to drop based on server settings.\n';        
        message += 'db!mute        Mutes DropBot audio in voice channel.\n';
        message += 'db!unmute      Unmutes DropBot audio. Requires user by in voice channel.\n';	
        message += 'db!info        Shows DropBot settings on this server\n';
        message += 'db!stop        Stop playing audio and remove DropBot from voice channel.\n';
        message += '\n';
        message += '-----------------------\n';
        message += 'db!set [id] [weight]\n';
        message += '  Change the chance of choosing each location.\n';
        message += '\n';
        message += '[id]  Location\n';
        for (var i in dropLocationNames) {
            if (i < 10) message += ' ';
            message += i + '    ' + dropLocationNames[i] + '\n';
        }
        message += '\n';
        message += '[weight] can be 0 to 10.\n';
        message += ' 10 being most likely to be chosen.\n';
        message += '  0 being a location that will not be chosen.\n';
        message += '\n';        
        message += 'All locations default to a weight of 5.\n';
        message += 'Example: To remove Happy Hamlet from the list, send message:\n';
        message += '  \"db!set 4 0\n';
        message += 'Example: To set Snobby Shores to the max chance, send message:\n';
        message += '  \"db!set 17 10\n';
        message += '```';
        break;
        
    // Only intended to be used by private error handling
    case 'error':

        if (args.length < 1) {
            message = "Unhandled error.";
            break;
        }
        message = args[0];
        break;

    case 'm':
    case 'mute':

	if (serverAudioMute[guildID]) {
            message = "DropBot is already muted.";
	    break;
	} else {
            message = "Muting DropBot.";
            serverAudioMute[guildID] = true;
	}

        updateGuildAudioMute(guildID);	
	break;

    case 'u':        
    case 'unmute':

	if (serverAudioMute[guildID]) {
            message = "Allowing DropBot to speak again.";	    
            serverAudioMute[guildID] = false;
	} else {
            message = "DropBot is not muted.";
	    break;
	}

        updateGuildAudioMute(guildID);
	break;

    case 'set':
    case 'setweight':

        if (args.length < 2) {
            message = "Please specify the index and weight.";
            break;
        }

        var setId = Number(args[0]);
        var setWeight = Number(args[1]);

        if (setWeight > MAX_WEIGHT || setWeight < 0) {
            message = "ERROR: Weight must be within the range of 0 to " + MAX_WEIGHT;
            break;
        }

        var previousTotalWeight = serverDropWeights[guildID];
        var nextTotalWeight     = 0;

        var previousWeight = Number(serverDropLocations[guildID][setId]['weight']);

        if (serverDropLocations[guildID][setId]['weight'] == setWeight) {
            message = "ERROR: Weight for " + dropLocationNames[setId] + " is already " + setWeight;
            break;
        }

        message = "Setting weight for " + dropLocationNames[setId] + " to " + setWeight;
        
        serverDropLocations[guildID][setId]['weight'] = setWeight;
        
        var sendMessage = "```";
        sendMessage += "Total weight:\n", serverDropWeights[guildID];
	sendMessage += "---------------------------------\n\n";
        sendMessage += "  ID   Location          Weight\n";
        sendMessage += "  -----------------------------\n";        
        for (var i=0; i < dropLocationNames.length; i++) {
            var dropLocationID     = i;;
            var dropLocationWeight = Number(serverDropLocations[guildID][i]['weight']);
            var dropLocationName   = dropLocationNames[dropLocationID];

            nextTotalWeight += dropLocationWeight;
            
            sendMessage += "  ";
            if (dropLocationID < 10) sendMessage += " " + dropLocationID;
            else                     sendMessage += dropLocationID;

            sendMessage += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 14; j++) {
                sendMessage += " ";
            }

            sendMessage += " - " + dropLocationWeight + "\n";
        }

        if (nextTotalWeight < 10) {
            message = "Error: All weights must add up to at least 10";
            serverDropLocations[guildID][setId]['weight'] = previousWeight;
            break;
        }

        serverDropWeights[guildID] = nextTotalWeight;
        
        sendMessage += "  -----------------------------\n";
	sendMessage += "Total weight: " + serverDropWeights[guildID] + "\n";        

        sendMessage += "```";

        updateGuildDrops(guildID).then(result => {
                                       
            setTimeout(function() {
                bot.sendMessage({
                    to: channelID,
                    message: sendMessage
                });
            }, 500);

        }).catch((e) => {
            console.log("Error: ", e);
        });

        break;

    case 'i':        
    case 'info':

        message = "Retrieving server info...";

        readGuild(guildID).then(result => {

            var myDropLocations        = result.Item.dropLocations;
	    serverAudioMute[guildID]   = result.Item.audioMute;
	    serverDropWeights[guildID] = 0;
	    
            var sendMessage = "```";

            sendMessage += "Discord Server Settings\n";
            sendMessage += "---------------------------------\n";
	    sendMessage += "Server ID   : " + result.Item.id + "\n";
	    sendMessage += "Server Name : " + result.Item.name + "\n";
	    sendMessage += "Audio Muted : " + serverAudioMute[guildID] + "\n";
	    sendMessage += "---------------------------------\n\n";
            sendMessage += "  ID   Location          Weight\n";
            sendMessage += "  -----------------------------\n";

            for (var i in myDropLocations) {

                var dropLocationID = i;
                var dropLocationWeight = myDropLocations[i];
                var dropLocationName   = dropLocationNames[dropLocationID];

                serverDropWeights[guildID] += dropLocationWeight;

		sendMessage += "  ";
                if (dropLocationID < 10) sendMessage += " " + dropLocationID;
                else                     sendMessage += dropLocationID;

                sendMessage += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 14; j++) {
                    sendMessage += " ";
                }
                sendMessage += "  - " + dropLocationWeight + "\n";
            }

            sendMessage += "  -----------------------------\n";
	    sendMessage += "Total weight: " + serverDropWeights[guildID] + "\n";

            sendMessage += "```";

            setTimeout(function() {
                bot.sendMessage({
                    to: channelID,
                    message: sendMessage
                });
            }, 500);

        }).catch((e) => {
            console.log("Error: ", e);
        });

        break;

    // Note that this will only work if the message was sent in a guild
    // and the author is actually in a voice channel.
    // You might want to check for all that stuff first
    // It also won't stop the existing command but will not play audio.
    case 's':        
    case 'stop':

        var channels = bot.channels;
        message = "Sorry, my dudes. Shutting up now.";

        for (var c in channels) {
            var channel = channels[c];

            if (channel.type == 2) {
                logger.info('Asked to leave voice channel: ' + c);
                bot.leaveVoiceChannel(c);
            }
        }
        break;


    // Default command. Can be run with "db!"
    case '':
    case 'wwdb': // Where we droppin', boys?

        var dropLocationID = rwc(serverDropLocations[guildID]);;
        var dropChance;

        while (serverDropLocations[guildID][dropLocationID]           === undefined ||
               serverDropLocations[guildID][dropLocationID]['weight'] === undefined ||
               serverDropLocations[guildID][dropLocationID]['weight'] <= 0) {
            dropLocationID = rwc(serverDropLocations[guildID]);
        }
        
        console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNames[dropLocationID]);

        if (serverDropLocations[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocations[guildID][dropLocationID]['weight'] / 
                serverDropWeights[guildID] * 100;
        } else {
            console.log("dropLocationID " + dropLocationID + " is undefined");
            break;
        }

        message = 'So, where we droppin\' boys...';

        var dropLocation = dropLocationNames[dropLocationID];
        var dropLocationMessage = dropLocation + " (" + dropChance.toPrecision(2) + "%)";	

	if (serverAudioMute[guildID]) {

            setTimeout(function() {
		bot.sendMessage({
                    to: channelID,
                    message: dropLocationMessage
		});
            }, 500);

	} else {
	    
            sfxFile = 'sfx_droplocations/' + dropLocation.split(' ').join('_').toLowerCase() + '.wav';
            if (!fs.existsSync(sfxFile)) {
		message = 'Oops... Tried to drop ' + dropLocation + ' but our audio file doesn\'t exist.';
		break;
            }

            var voiceChannelID = -1;
            var channels = bot.servers[guildID].channels;

            for (var c in channels) {
		if (voiceChannelID != -1) break;
		var channel = channels[c];

		for (var m in channel.members) {
                    if (voiceChannelID != -1) break;
                    var member = channel.members[m];
                    if (member.user_id == userID) {
			voiceChannelID = c;

			logger.info('Joining channel name: ' + channel.name);
			logger.info('Joining channel ID:   ' + c);

			bot.joinVoiceChannel(c, function(error, events) {
                            if (error) {
				bot.sendMessage({
                                    to: channelID,
                                    message: 'DropBot is already active in this voice channel. Wait until it\'s done.'
				});
				//return console.error(error);
                                return 1;
                            }

                            var played2nd = false;

                            bot.getAudioContext(voiceChannelID, function(error, stream) {
				//Once again, check to see if any errors exist
				if (error) {
                                    bot.sendMessage({
					to: channelID,
					message: 'Had a strange problem talking... Wait a sec?'
                                    });
                                    return console.error(error);
				}

				if (fs.existsSync(sfxFile)) {
                                    var introFile = 'sfx_droplocations/' + dropIntros[Math.floor(Math.random()*dropIntros.length)];
                                    fs.createReadStream(introFile).pipe(stream, {end: false});                  
                                    //var readStream = fs.createReadStream('sfx_droplocations/intro.wav');
                                    //readStream.pipe(stream, {end: false});

				} else {
                                    bot.leaveVoiceChannel(voiceChannelID);
				}

				//The stream fires `done` when it's got nothing else to send to Discord.
				stream.on('done', function() {

                                    // This event will fire when the 2nd stream is done so make sure
                                    //   we only play it once.
                                    if (played2nd) return 0;
                                    played2nd = true;

                                    bot.sendMessage({
					to: channelID,
					message: dropLocationMessage
                                    });

                                    if (fs.existsSync(sfxFile)) {
					// console.log(sfxFile);
					fs.createReadStream(sfxFile).pipe(stream, {end: false});
                                    } else {
					bot.leaveVoiceChannel(voiceChannelID);
                                    }

                                    //The stream fires `done` when it's got nothing else to send to Discord.
                                    stream.on('done', function() {                      
					//Handle
					bot.leaveVoiceChannel(voiceChannelID);
                                    });
				});
                            });
			});
                    }
		}
            }

            if (voiceChannelID == -1) {
		message = "Join a voice channel or mute DropBot using \"db!mute\".";
            }
	} // !(serverAudioMute)
        break;
        
    } // switch (cmd)


    if (message != "") {
        bot.sendMessage({
            to: channelID,
            message: message
        });
    } else {
        bot.sendMessage({
            to: channelID,
            message: 'DropBot doesn\'t understand that. Please run \'db!help\''
        });
    }

    return 1;
}



bot.on('message', function (user, userID, channelID, message, evt) {

    if (userID == DROPBOT_ID) return 0; // It's DropBot.

    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `db!`
    var origMessage = message;
    var epochTime = (new Date).getTime();

    var guildID = bot.channels[channelID].guild_id;
    var guildName = bot.servers[guildID].name;    

    if (DEBUG_VERBOSE) {
        console.log("User       : ", user);
        console.log("User ID    : ", userID);
        console.log("Channel    : ", bot.channels[channelID].name);	
        console.log("Channel ID : ", channelID);
        console.log("Guild      : ", guildName);	
        console.log("Guild ID   : ", guildID);
        console.log("Time (ms)  : ", epochTime);
    }

    var args = message.toLowerCase().split(' ');

    if (message.substring(0, 3) == "db!"){
        args = message.substring(3).split(' ');

        if (dropUserInitialized[userID] === undefined || dropUserInitialized[userID] == false) {        
            console.log("Reading user... ", userID);
            readUser(userID).then(result => {

		if (result.Item != null) {
                    dropUserTimeout[userID] = result.Item.accessTime;
                    dropUserStrikes[userID] = 0; // Always reset when server reloads
                    dropUserBlocked[userID] = result.Item.blocked;
                    dropUserInitialized[userID] = true;
		}

            }).catch((err) => {
                console.log("Error: ", err);
                return 3;
            });
        }

        if (dropUserBlocked[userID] == true || dropUserStrikes[userID] == USER_MAX_STRIKES) {

            if (dropUserBlocked[userID] == false) {
                dropUserBlocked[userID]  = true;
                updateUser(userID, epochTime, true);
            }
            args = ["error", "Too many strikes [" + USER_MAX_STRIKES + "]. User blocked. Please contact developer devshans0@gmail.com"];
            console.log("User max strikes: " + userID + " too many requests.");
            handleCommand(args, userID, channelID, guildID);
            return 3;
        }


        if (dropUserInitialized[userID] === undefined || dropUserInitialized[userID].length == 0) {         

            console.log("Initializing user: ", userID);
            initUser(user, userID, epochTime).then(result => {
                console.log(result);
            }).catch(err => {
                console.log("COULD NOT detect user");
                console.log(err);
            });
        } else {
            updateUser(userID, epochTime, false);
            if (args[0] != 'stop') {
                if (((epochTime - dropUserTimeout[userID])/1000) < USER_TIMEOUT_SEC) {
                    dropUserStrikes[userID] = dropUserStrikes[userID]+1;
                    args = ["error", "Please wait " + USER_TIMEOUT_SEC + " seconds in between each command. Strike " + dropUserStrikes[userID] + "/" + USER_MAX_STRIKES];
                    console.log("User error: ID: " + userID + " too many requests.");
                    handleCommand(args, userID, channelID, guildID);
                    return 1;
                }
            }
            dropUserStrikes[userID] = 0;
        }

        if (serverDropLocations[guildID] === undefined || serverDropLocations[guildID].length == 0) {
            console.log("First access from server: ", guildID);

            initGuildDatabase(guildName, guildID).then(result => {
                //console.log(result);
                console.log("Initialized server.");
            }).catch(err => {
                console.log("COULD NOT detect guild");
            }).then(() => {

                initGuild(guildID).then(function(result) {
                    handleCommand(args, userID, channelID, guildID);
                }, function(err) {
                    console.log(err);
                });
            });

        } else {
            console.log("Server already initialized ", guildID);
            handleCommand(args, userID, channelID, guildID);
        }


    }


}); // bot.on(message)

// ----------------------------------------------------------------------------------------
// Database async functions
// ----------------------------------------------------------------------------------------

async function getDropBotUsers(id) {

    console.log("getDropBotUsers: ", id);

    var params = {
        TableName: dbTableUsers,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
}

async function getDropBotGuilds(id) {

    var params = {
        TableName: dbTableGuilds,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
}

async function getDropLocation(id) {

    var params = {
        TableName: dbTableLocations,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
}

async function readUser(id) {

    var params = {
        TableName: dbTableUsers,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
}

async function readGuild(id) {

    var params = {
        TableName: dbTableGuilds,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
}
