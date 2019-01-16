/*
    @document   : DropBot.js
    @author     : devshans
    @version    : 4.3.0
    @copyright  : 2019, devshans
    @license    : The MIT License (MIT) - see LICENSE
    @repository : https://github.com/devshans/DropBot
    @description: DropBot automated Bot for Discord Application.
                  Uses discord.io Discordapp library.
                  Randomly selects a location to start in for 
                    the Fortnite Battle Royale game. 
		  Hosted on AWS.

    Discord support server: https://discord.gg/YJWEsvV

    Add bot to server with:
        https://discordapp.com/oauth2/authorize?client_id=487298106849886224&scope=bot&permissions=0

    Links  * Epic Games : https://www.epicgames.com
           * Fortnite   : https://www.epicgames.com/fortnite/en-US/home
           * Discord    : https://discordapp.com
	   * discord.io : https://github.com/izy521/discord.io
*/

const DEBUG_VERBOSE = true;

var Discord = require('discord.io');
var rwc     = require('random-weighted-choice');
var fs      = require('fs');
var AWS     = require("aws-sdk");
let date    = require('date-and-time');

var filenameArray = __filename.split("/");
var developerMode = filenameArray[filenameArray.length-1] == "DropBot-dev.js" ? true : false;

if (developerMode) {
    console.log("Starting DropBot-dev.js in DEVELOPER mode");
    var auth    = require('./auth-dev.json');
} else {
    console.log("*** Starting DropBot in PRODUCTION mode ***");
    var auth    = require('./auth.json');
}

// Discord ID of this bot to identify ourselves.
const DROPBOT_ID      = "487298106849886224";
const DEV_DROPBOT_ID  = "533851604651081728";

var   DEVSHANS_ID = -1;

var devFilename = "dev.json";
fs.readFile(devFilename, 'utf8', function(err, data) {
    if (err) {
        console.log("No " + devFilename + " file for authentication.");
        return 1;
    }
    var devJson = JSON.parse(data);
    console.log("Set DEVSHANS_ID to: ", devJson.uid);
    DEVSHANS_ID = devJson.uid;
});

const USER_TIMEOUT_SEC = 1;
const USER_MAX_STRIKES = 5;

const NUM_DROP_LOCATIONS = 21;
const DEFAULT_WEIGHT =  5;
const MAX_WEIGHT     = 10;

AWS.config.update({
    region: "us-east-2",
    endpoint: "https://dynamodb.us-east-2.amazonaws.com"
});

var docClient = new AWS.DynamoDB.DocumentClient();

// DynamoDB Table Names
var dbTableLocations = "DropLocations";
if (developerMode) {
    var dbTableGuilds    = "dev_DropGuilds";
    var dbTableUsers     = "dev_DropUsers";
} else {
    var dbTableGuilds    = "DropGuilds";
    var dbTableUsers     = "DropUsers";
}

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

var filenameArray = __filename.split("/");

var defaultWeights = [];
initDefaultWeights().then((result) => console.log("Retrieved default weights."));

// Init Discord Bot
var bot = new Discord.Client({
    token: auth.token,
    autorun: true
});

// DiscordBotList API
const DBL = require("dblapi.js");
const dbl = developerMode ? null : new DBL(auth.dblToken, bot);

// 0: playing
// 1: streaming
// 2: listening
// 3: watching
bot.setPresence({
    game: {    
        name:"\u200Bdb!help",
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
                        "numAccesses":1,
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

async function initUser(userName, userID, userDisc, accessTime) {

    return new Promise(function(resolve, reject) {

        var userPromise = getDropBotUsers(userID);

        userPromise.then(function(result) {

            if (result.Item == null) {
                // Create entry in database.
                console.log("Attempting to create a new user entry in database...");
                var params = {
                    TableName: dbTableUsers,
                    Item:{
                        "id":userID,
                        "discriminator":userDisc,
                        "name":userName,
                        "accessTime":accessTime,
                        "numAccesses":1,
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
            ConditionExpression: 'attribute_exists(id)',
            UpdateExpression: "set accessTime = :a, blocked = :b, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":a":accessTime,
                ":val":1,
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

async function resetAllUserBans() {

    return new Promise(function(resolve, reject) {

        var params = {
            TableName: dbTableUsers,
            FilterExpression: "blocked = :bool",
            ExpressionAttributeValues: {
                ":bool": true
            }            
        };

        console.log("Scanning " + dbTableUsers + " table for banned users.");
        docClient.scan(params, resetAllUserBanScan);
        
    });
}

function resetAllUserBanScan(err, data) {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        // Log and reset all banned users
        console.log("Scan succeeded.");
        data.Items.forEach(function(item) {
            console.log(" -", item.name + ": " + item.blocked);
            dropUserBlocked[item.id] = false;
            updateUser(item.id, (new Date).getTime(), false);
        });

        // continue scanning if we have more users, because
        // scan can retrieve a maximum of 1MB of data
        if (typeof data.LastEvaluatedKey != "undefined") {
            console.log("Scanning for more...");
            params.ExclusiveStartKey = data.LastEvaluatedKey;
            docClient.scan(params, resetAllUserBanScan);
        }
    }
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
            UpdateExpression: "set dropLocations = :d, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":d":stringDB,
                ":val":1
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
            UpdateExpression: "set audioMute = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":bool":serverAudioMute[guildID],
                ":val":1                
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

function dblPostStats(serverCount) {
    console.log('*** DBL: Sending serverCount to Discord Bot List - ' + serverCount);
    dbl.postStats(serverCount);
}

bot.on('ready', function (evt) {
    console.log('Connected top DropBot Discord client');
    console.log('Logged in as: ' + bot.username + ' - (' + bot.id + ')');

    // Send serverCount to DBL at startup and then every 30 minutes.
    if (! (developerMode) && bot.id == DROPBOT_ID) {
        var serverCount = Object.keys(bot.servers).length;
        dblPostStats(serverCount); 
        setInterval(() => {
            dblPostStats(serverCount);
        }, 1800000);	
    }
    
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

    console.log('DropBot done initializing. Ready to accept user commands.');

});

async function handleCommand(args, userID, channelID, guildID) {

    var isDevUser = (DEVSHANS_ID == userID);

    var cmd = args[0];
    message = "";

    console.log("handleCommand: user=" + userID + " - " +  args);

    args = args.splice(1);

    // Commands restricted to developer user.
    // --------------------------------------
    if (isDevUser) {

        console.log("Running command from dev user: ", userID);
        
        switch(cmd) {
            
        case 'resetban':
            if (args.length < 1) {
                message = "\u200BPlease specify user ID to unban.";
                break;
            }
            var banUserID = args[0]; //fixme - SPS. Check that this is a number. But casting it will round.
            message = "\u200BResetting ban for user ID: " + banUserID;
            updateUser(banUserID, (new Date).getTime(), false).then(result => {

                dropUserBlocked[banUserID] = false;
                setTimeout(function() {
                    bot.sendMessage({
                        to: channelID,
                        message: "\u200BBan cleared successfully."
                    });
                }, 200);
                
            }).catch((e) => {
                console.log("Error: ", e);
                setTimeout(function() {
                    bot.sendMessage({
                        to: channelID,
                        message: "\u200BERROR: " + e
                    });
                }, 200);
            });
            break;
            
        case 'resetallbans':
            message = "\u200BResetting bans for all users...";
            resetAllUserBans();
            setTimeout(function() {
                bot.sendMessage({
                    to: channelID,
                    message: "Done."
                });
            }, 200);
            break;
        }
    }

    // User commands.
    // --------------------------------------
    switch(cmd) {        

    // List all possible commands and usage.
    case 'h':
    case 'help':
        message =  '\u200BDropBot Help\n';
        message += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n'; 
        message += "Built using node.js and discord.io.\n";
        message += '```';
        message += "Author   : devshans\n";
        message += "GitHub   : https://github.com/devshans/DropBot\n";        
        message += "Bot Link : https://discordbots.org/bot/487298106849886224\n";
        message += 'Discord support server: https://discord.gg/YJWEsvV \n\n';
        message += 'usage: db![option]\n\n';
        message += 'db![option]            Description\n';
        message += '----------------------------------\n';
        message += 'db!                  : Randomly choose a Fortnite location to drop based on server settings.\n';        
        message += 'db!mute              : Mutes DropBot audio in voice channel.\n';
        message += 'db!unmute            : Unmutes DropBot audio. Requires user by in voice channel.\n';
	message += 'db!settings          : Shows only DropBot settings on this server.\n';
        message += 'db!info              : Shows DropBot settings on this server and additional help.\n';
        message += 'db!stop              : Stop playing audio and remove DropBot from voice channel.\n';
	message += 'db!help              : Show this help message again.\n';
        message += 'db!set [id] [weight] : Change the chance of choosing each location. Use "db!set help" for more info.\n';
        message += '----------------------------------\n';
        message += '```';
        break;
        
    // Only intended to be used by private error handling
    case 'error':

        if (args.length < 1) {
            message = "\u200BUnhandled error.";
            break;
        }
        message = args[0];
        break;

    case 'm':
    case 'mute':

	if (serverAudioMute[guildID]) {
            message = "\u200BDropBot is already muted.";
	    break;
	} else {
            message = "\u200BMuting DropBot.";
            serverAudioMute[guildID] = true;
	}

        updateGuildAudioMute(guildID);	
	break;

    case 'u':        
    case 'unmute':

	if (serverAudioMute[guildID]) {
            message = "\u200BAllowing DropBot to speak again.";	    
            serverAudioMute[guildID] = false;
	} else {
            message = "\u200BDropBot is not muted.";
	    break;
	}

        updateGuildAudioMute(guildID);
	break;

    case 'set':

	if (args.length == 1 && args[0] == "help") {
	    message =  '\u200BHelp for changing drop location chance\n';
	    message += '```';
            message += 'db!set [id] [weight]\n';
            message += '----------------------------------\n';
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
	}

        if (args.length < 2) {
            message = "\u200BPlease specify the index and weight.";
            break;
        }

        var setId = Number(args[0]);
        var setWeight = Number(args[1]);

        if (setId > (NUM_DROP_LOCATIONS-1) || setId < 0) {
            message = "\u200BERROR: Index must be within the range of 0 to " + (NUM_DROP_LOCATIONS-1);
            break;
        }
        
        if (setWeight > MAX_WEIGHT || setWeight < 0) {
            message = "\u200BERROR: Weight must be within the range of 0 to " + MAX_WEIGHT;
            break;
        }

        var previousTotalWeight = serverDropWeights[guildID];
        var nextTotalWeight     = 0;

        var previousWeight = Number(serverDropLocations[guildID][setId]['weight']);

        if (serverDropLocations[guildID][setId]['weight'] == setWeight) {
            message = "\u200BERROR: Weight for " + dropLocationNames[setId] + " is already " + setWeight;
            break;
        }

        message = "\u200BSetting weight for " + dropLocationNames[setId] + " to " + setWeight;
        
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

        if (nextTotalWeight < 1) {
            message = "\u200BError: All weights must add up to at least 1";
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

        message  = "\u200B\n";
        message += "DropBot - Randomly select a location to start/drop in for the Fortnite Battle Royale Game.\n";
        message += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n';         
        message += "```";
        message += "Bot usage help : \"db!help\"\n";
        message += "Server settings: \"db!settings\"\n";
        message += "Built using node.js and discord.io.\n";
        message += "Author           : devshans\n";
        message += "Email            : devshans0@gmail.com\n"
        message += "GitHub           : https://github.com/devshans/DropBot\n";
        message += "Bot Link         : https://discordbots.org/bot/487298106849886224\n";
        message += "Support Discord  : https://discord.gg/YJWEsvV\n\n";
        message += "```";
        break;

    case 's':
    case 'settings':

        message += "\u200BRetrieving info for this server...";

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
    // It also won't stop the existing command but will not play audio.
    case 'stop':

        var channels = bot.servers[guildID].channels;
        message = "\u200BSorry, my dudes. Shutting up now.";

        for (var c in channels) {
            var channel = channels[c];

            if (channel.type == 2) {
                console.log('Asked to leave voice channel: ' + c);
                bot.leaveVoiceChannel(c);
            }
        }

        break;


    // Default command. Can be run with "db!"
    case '':
    case 'wwdb': // Where we droppin', boys?

        var dropLocationID = rwc(serverDropLocations[guildID]);
        var dropChance;

        if (dropLocationID == null) {
            console.log("ERROR: Could not select a drop location.");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNames[dropLocationID]);

        if (serverDropLocations[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocations[guildID][dropLocationID]['weight'] / serverDropWeights[guildID] * 100;                
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.log("ERROR: dropLocationID " + dropLocationID + " is undefined");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        message = '\u200BSo, where we droppin\' boys...';

        var dropLocation = dropLocationNames[dropLocationID];
        var dropLocationMessage = dropLocation + " (" + dropChance + "%)";	

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
		message = '\u200BOops... Tried to drop ' + dropLocation + ' but our audio file doesn\'t exist.';
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

			console.log('Talking on channel ID: ' + c);

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
		message = "\u200BJoin a voice channel or mute DropBot using \"db!mute\".";
            }
	} // !(serverAudioMute)
       
        break;
        
    } // switch (cmd)


    if (message != "" && message != "\u200B") {
        bot.sendMessage({
            to: channelID,
            message: message
        });
    }

    return 1;
}

bot.on('message', function (user, userID, channelID, message, evt) {

    // Exit if it's DropBot.
    if (userID == DROPBOT_ID || userID == DEV_DROPBOT_ID) return 0;

    var isDevUser = (DEVSHANS_ID == userID);
    var maxMessageLength = isDevUser ? 50 : 12;

    //fixme - SPS. Make a counter to see if this continues to happen and report user.    
    // If a user is banned, do not allow them to continue spamming the bot.
    if (dropUserBlocked[userID] && !(isDevUser)) return 0;

    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `db!`
    var origMessage = message;
    message = message.trim().replace(/ +(?= )/g,'').toLowerCase();
    if (message.substring(0, 3) != "db!") return 0;
	
    var args = message.split(' ');
   
    var dateTime = new Date();
    var epochTime = dateTime.getTime();

    var channel = bot.channels[channelID];

    // If this is a direct message, respond to user with guide on usage.
    if (channel === undefined) { 
        var dmChannel = bot.directMessages[channelID];
        if (dmChannel === undefined) {
            console.error("ERROR: Channel " + channelID + " does not exist.");
            return 3;
        } else {
            console.log("Sending to DMChannel " + channelID);
            var message =  'Hey, ' + user + "!\n\n";
            message += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n'; 
            message += "Author   : <@" + DEVSHANS_ID + ">\n";
            message += "GitHub   : https://github.com/devshans/DropBot\n";        
            message += "Bot Link : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
            message += 'Discord support server: https://discord.gg/YJWEsvV \n';
            
            bot.sendMessage({
		to: channelID,
		message: message
	    });
        }
        return 0;
    } 

    var guildID = bot.channels[channelID].guild_id;
    var guildName = bot.servers[guildID].name;

    var userDisc = bot.servers[guildID].members[userID].discriminator;

    // Discord bot best practices ask that unsupported commands fail silently.
    //   Source: https://github.com/meew0/discord-bot-best-practices
    //
    // WE DO give an error if there is a space before what could be a valid command.
    if (message.length > 4 && message[3] == " " && message[4].match(/[a-z]/i)) {
	args = ["error", "Do not put a space after \"db!\" and command"];
        handleCommand(args, userID, channelID, guildID);
        return 3;
    }
    // Fail silently if the first letter of command is anything other than a letter.
    if (message.length > 3 && !(message[3].match(/[a-z]/i))) {
	return 4;
    }
    // Drop commands that are too long.
    // Currently, this is the longest valid user command:
    //    db!set 20 10
    // Drop messages greater than this length but suggest help if the command is "set"
    if (message.length > maxMessageLength) {
        if (message.substring(3,6) == "set") {
            args = ["error", "Wrong syntax for set command. Please use \"db!set help\" for usage."];
            handleCommand(args, userID, channelID, guildID);
        }
        return 3;
    }
    
    
    if (DEBUG_VERBOSE) {
        console.log("--- New command ---");
        console.log("User       :  " + user + "#" + userDisc);
        console.log("User ID    : ", userID);
        console.log("Channel    : ", bot.channels[channelID].name);	
        console.log("Channel ID : ", channelID);
        console.log("Guild      : ", guildName);	
        console.log("Guild ID   : ", guildID);
        console.log("Time       : ", dateTime.toISOString());
        console.log("Time (ms)  : ", epochTime);
        console.log("message    : ", message);
        console.log("-------------------");
        console.log("");
    }

    
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
        args = ["error", "Too many strikes [" + USER_MAX_STRIKES + "]. User blocked due to rate limiting.\n" +
		"Please wait at least an hour or contact developer devshans0@gmail.com if you think this was in error."];
        console.log("User max strikes: " + userID + " too many requests.");
        handleCommand(args, userID, channelID, guildID);
        return 3;
    }


    if (dropUserInitialized[userID] === undefined || dropUserInitialized[userID].length == 0) {         

        console.log("Initializing user: ", userID);
        initUser(user, userID, userDisc, epochTime).then(result => {
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
