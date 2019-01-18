/*
    @document   : DropBot.js
    @author     : devshans
    @version    : 5.4.0
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

var DEBUG_MESSAGE  = true;
var DEBUG_COMMAND  = true;
var DEBUG_DATABASE = true;
var DEBUG_DBL      = true;
var DEBUG_VOTE     = true;

var STRIKE_SYSTEM_ENABLED = false;

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

const DROPBOT_SERVER_ID        = "534217612805275658"; // Official DropBot Server
const DROPBOT_TEST_CHANNEL_ID1 = "535268088569135116"; // dropbot-test-1
const DROPBOT_TEST_CHANNEL_ID2 = "535268112833052672"; // dropbot-test-2


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

const NO_VOTE_USER_TIMEOUT_SEC = (1 * 60);
const VOTE_USER_TIMEOUT_SEC    = 1;
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

// Fortnite specific stuff
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

// Database status in memory
var serverInitialized   = {};
var dropUserInitialized = {};

var dropUserTimeout     = {};
var dropUserStrikes     = {};
var dropUserBlocked     = {};
var dropUserIsVoter     = {};
var dropUserWarned      = {};
var serverDropLocations = {};
var serverDropWeights   = {};
var serverAudioMute     = {};

var dropIntros = [
     'intro.wav'
    ,'intro2.wav'
    ,'intro3.wav'
];

var legalCommands = [
     "h"
    ,"help"
    ,"error"
    ,"v"
    ,"vote"
    ,"m"
    ,"mute"
    ,"u"
    ,"unmute"
    ,"set"
    ,"i"
    ,"info"
    ,"s"
    ,"settings"
    ,"stop"
    ,""
    ,"wwdb"
]

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
const dbl = new DBL(auth.dblToken, bot); // NOTE: Make sure to guard any accesses from DropBot-dev with developerMode.

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
                console.log("Creating NEW server database entry: " + guildName + "[" + guildID + "]");
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
                    if (DEBUG_DATABASE) console.log("Successfully created entry.");
                    resolve(result);
                }, function(err) {
                    console.error("ERROR: Failed to create database entry:\n" + err);
                    reject(err);
                });

            } else {
                if (DEBUG_DATABASE) console.log("Server already exists in database..");
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
                if (DEBUG_DATABASE) console.log("Creating NEW user database entry: " + userName + "#" + userDisc + "[" + userID + "]");
                
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
                    if (DEBUG_DATABASE) console.log("Successfully created new user entry.");
                    dropUserTimeout[userID] = accessTime;
                    dropUserStrikes[userID] = 0;
                    dropUserBlocked[userID] = false;
                    dropUserIsVoter[userID] = true;
		    dropUserWarned[userID]  = false;
                    dropUserInitialized[userID] = true;
                    resolve(result);
                }, function(err) {
                    console.error("ERROR initUser: Failed to create database entry.\n" + err);
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

        if (DEBUG_DATABASE) console.log("updateUser for user: ", userID);

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
            if (DEBUG_DATABASE) console.log("Successfully updated user database entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateUser: Failed to update user database entry:\n" + err);
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
        console.error("ERROR resetAllUserBanScan: Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        // Log and reset all banned users
        console.log("Scan succeeded.");
        data.Items.forEach(function(item) {
            console.log(" -", item.name + ": " + item.blocked);
            dropUserBlocked[item.id] = false;
            dropUserIsVoter[item.id] = true;
	    dropUserWarned[item.id]  = false;
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

        if (DEBUG_DATABASE) console.log("updateGuildDrops for server: ", guildID);

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
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildDrops: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

}

async function updateGuildAudioMute(guildID) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildAudioMute for server: ", guildID, " to ", serverAudioMute[guildID]);

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
            console.error("ERROR updateGuildAudioMute: Failed to update database entry.\n" + err);
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
            console.error("ERROR initDefaultWeights:\n" + e);
            reject(e);
        });
    });

}

async function initGuild(guildID) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        if (DEBUG_DATABASE) console.log("Getting dropLocation weights for server: " + guildID);

        serverDropLocations[guildID] = [];
        serverDropWeights[guildID]   = 0;
	serverAudioMute[guildID]     = false;

        readGuild(guildID).then(result => {

            if (result.Item === undefined || result.Item == null) {
                console.error("ERROR initGuild " + guildID + ":\nresult.Item is null.");
                reject ("result.Item is null");
            }
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
            console.error("ERROR initGuild " + guildID + ":\n" + e);
            reject(e);
        });

    });

}

function dblPostStats(serverCount) {
    console.log('*** DBL: Sending serverCount to Discord Bot List - ' + serverCount);
    dbl.postStats(serverCount);
}

bot.on('ready', function (evt) {
    console.log('DropBot Discord client is connected and ready.');
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
                dropUserIsVoter[data.Items[index].id] = true;
		dropUserWarned[data.Items[index].id]  = false;
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

    if (DEBUG_COMMAND) console.log("handleCommand: user=" + userID + " - " +  args);

    args = args.splice(1);

    // Commands restricted to developer user.
    // --------------------------------------
    if (isDevUser) {

        console.log("Running command from dev user: " + userID);
        
        switch(cmd) {

        // Toggle debug messages on/off.
        case 'debugmessage':
            DEBUG_MESSAGE = !DEBUG_MESSAGE;
            message = "\u200BSet DEBUG_MESSAGE to " + DEBUG_MESSAGE;
            break;
        case 'debugcommand':
            DEBUG_COMMAND = !DEBUG_COMMAND;
            message = "\u200BSet DEBUG_COMMAND to " + DEBUG_COMMAND;
            break;
        case 'debugdatabase':
            DEBUG_DATABASE = !DEBUG_DATABASE;
            message = "\u200BSet DEBUG_DATABASE to " + DEBUG_DATABASE;
            break;
        case 'debugdbl':
            DEBUG_DBL = !DEBUG_DBL;
            message = "\u200BSet DEBUG_DBL to " + DEBUG_DBL;
            break;
        case 'debugvote':
            DEBUG_VOTE = !DEBUG_VOTE;
            message = "\u200BSet DEBUG_VOTE to " + DEBUG_VOTE;
            break;

        case 'viewdebug':
            message = "\u200BDebug flag status:";
            message += "```";
            message += "DEBUG_MESSAGE  : " + DEBUG_MESSAGE  + "\n";
            message += "DEBUG_COMMAND  : " + DEBUG_COMMAND  + "\n";
            message += "DEBUG_DATABASE : " + DEBUG_DATABASE + "\n";
            message += "DEBUG_DBL      : " + DEBUG_DBL      + "\n";
            message += "DEBUG_VOTE     : " + DEBUG_VOTE     + "\n";
            message += "```";
            break;

        case 'debugon':
            DEBUG_MESSAGE  = true;
            DEBUG_COMMAND  = true;
            DEBUG_DATABASE = true;
            DEBUG_DBL      = true;
            DEBUG_VOTE     = true;
            message = "\u200BSet all debug flags to TRUE.";
            break;

        case 'debugoff':
            DEBUG_MESSAGE  = false;
            DEBUG_COMMAND  = false;
            DEBUG_DATABASE = false;
            DEBUG_DBL      = false;
            DEBUG_VOTE     = false;
            message = "\u200BSet all debug flags to FALSE.";
            break;

        case 'strikesystem':            
            STRIKE_SYSTEM_ENABLED = !STRIKE_SYSTEM_ENABLED;
            message = "\u200BSet STRIKE_SYSTEM_ENABLED to " + STRIKE_SYSTEM_ENABLED;
            break;
            
        case 'resetban':
            if (args.length < 1) {
                message = "\u200BPlease specify user ID to unban.";
                break;
            }
            var otherUserID = args[0]; 
            message = "\u200BResetting ban for user ID: " + otherUserID;
            updateUser(otherUserID, (new Date).getTime(), false).then(result => {

                dropUserBlocked[otherUserID] = false;
                setTimeout(function() {
                    bot.sendMessage({
                        to: channelID,
                        message: "\u200BBan cleared successfully."
                    });
                }, 200);
                
            }).catch((e) => {
                console.error("ERROR resetban: " + e);
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

        case 'dumpuser':
            if (args.length < 1) {
                message = "\u200BPlease specify user ID to check for voting.";
                break;
            }
            var otherUserID = args[0];

            message = "```";
            message += "--- Current state of user in DropBot ---\n";
            message += "  dropUserID      - " + dropUserInitialized[otherUserID] + "\n";
            message += "  dropUserTimeout - " + dropUserTimeout[otherUserID] + "\n";
            message += "  dropUserStrikes - " + dropUserStrikes[otherUserID] + "\n";
            message += "  dropUserBlocked - " + dropUserBlocked[otherUserID] + "\n";
            message += "  dropUserIsVoter - " + dropUserIsVoter[otherUserID] + "\n";
	    message += "  dropUserWarned  - " + dropUserWarned[otherUserID]  + "\n";
            message += "```";
            
            break;

        case 'isvoter':

            if (args.length < 1) {
                message = "\u200BPlease specify user ID to check for voting.";
                break;
            }
            var otherUserID = args[0];

            message = "Checking user ID + " + otherUserID + " for voting status...";
            dbl.hasVoted(otherUserID).then(voted => {
                var sendMessage = "";
                if (! (voted)) {
                    sendMessage  = userID + " has NOT been verified to use DropBot in the last 24 hours.\n";
                    sendMessage += "Strike " + dropUserStrikes[userID] + "/" + USER_MAX_STRIKES;
                    console.log(sendMessage);                
                } else {
                    sendMessage  = userID + " HAS voted to use DropBot in the last 24 hours.\n";
                    console.log(sendMessage);
                }

                setTimeout(function() {
                    bot.sendMessage({
                        to: channelID,
                        message: sendMessage
                    });
                }, 200);
                
            }).catch((err) => {
                var sendMessage = "\u200BOops... DropBot could not access dbl.hasVoted database for userID: " + userID + "\n" +  err;
                console.log(sendMessage);
                
                setTimeout(function() {
                    bot.sendMessage({
                        to: channelID,
                        message: sendMessage
                    });
                }, 200);
                
            });
            
            break;

        } // dev switch(cmd)
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
        message += "Bot Link : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
        message += 'Discord support server: https://discord.gg/YJWEsvV \n\n';
        message += 'usage: db![option]\n\n';
        message += 'db![option]            Description\n';
        message += '----------------------------------\n';
        message += 'db!                  : Randomly choose a Fortnite location to drop based on server settings.\n';        
        message += 'db!mute              : Mutes DropBot audio in voice channel.\n';
        message += 'db!unmute            : Unmutes DropBot audio. Requires user to be in a voice channel.\n';
	message += 'db!settings          : Shows only DropBot settings on this server.\n';
        message += 'db!info              : Shows DropBot information and links/commands for additional help.\n';
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

    case 'v':
    case 'vote':

        dbl.hasVoted(userID).then(voted => {
            if (dropUserIsVoter[userID] != voted) {
                if (DEBUG_VOTE) console.log("***** VOTE command changed to " + voted + " for userID " + userID);
            }
            if (! (voted)) {
                dropUserIsVoter[userID] = false;
                if (dropUserWarned[userID]) {
                    sendMessage  = "\u200B<@!" + userID + ">, you are not shown as having voted in the last 24 hours.\n";
                    sendMessage += "If you just voted, wait about a minute or 2 for it to process.\n";
                    sendMessage += "You can run \"db!vote\" again without restriction to check vote status.\n";
                } else {
                    dropUserWarned[userID] = true;
                    sendMessage  = "\u200B<@!" + userID + "> has NOT yet voted in the last 24 hours.\n";
                    sendMessage += "If you just voted, wait about a minute or 2 for it to process.\n";
                    sendMessage += "You are rate limited to using one command every " + NO_VOTE_USER_TIMEOUT_SEC + " seconds.\n";
		    sendMessage += "To lessen restriction to " + VOTE_USER_TIMEOUT_SEC + " second(s), simply verify user by voting for DropBot at: https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
                    sendMessage += "You may check if your vote has been processed immediately and without penalty with \"db!vote\"";
                }
                args = ["error", sendMessage];
                handleCommand(args, userID, channelID, guildID);
                return 1;
            } else {
		dropUserIsVoter[userID] = true;
		dropUserWarned[userID]  = false;

                epochTime = (new Date).getTime();
                dropUserStrikes[userID] = 0;
                dropUserTimeout[userID] = epochTime;
                dropUserStrikes[userID] = 0;
                dropUserBlocked[userID] = false;
                dropUserWarned[userID]  = false;

                updateUser(userID, epochTime, false).then(result => {
                    sendMessage  = "\u200B<@!" + userID + ">, you are shown as voting within the last 24 hours! Restriction lessened to " + VOTE_USER_TIMEOUT_SEC + " second(s).\n";;
                    args = ["error", sendMessage];
                    handleCommand(args, userID, channelID, guildID);                    
                }).catch((err) => {
                    console.error("ERROR vote command update: " + err);
                });
                                
		return 0;
	    }
        }).catch((err) => {

            var sendMessage = "\u200BOops... <@!" + userID + ">, DropBot could not access Discord Bot List's vote database.\nPlease try again later.\n";
            console.log(sendMessage);
            
            setTimeout(function() {
                bot.sendMessage({
                    to: channelID,
                    message: sendMessage
                });
            }, 200);
            
            return 3;
        });
        
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

        if (typeof args[0] != "number" || typeof args[1] != "number") {
            message = "\u200BERROR: [id] and [weight] arguments must both be numbers.";
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
            console.error("ERROR updateGuildDrops: " + e);
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
        message += "Bot Link         : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
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
            console.log("ERROR: settings command. guildID: " + guildID + "\n" + e);
        });

        break;

    //fixme - SPS. Check that user is in a guild. Update description.
    // Note that this will only work if the message was sent in a guild
    // and the author is actually in a voice channel.
    // It also won't stop the existing command but will not play audio.
    case 'stop':

        var channels = bot.servers[guildID].channels;
        message = "\u200BSorry.... Leaving all voice channels on server now.";

        for (var c in channels) {
            var channel = channels[c];

            //fixme - SPS. Can we check for the string 'voice'?
            //   Also increase logging here.
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
            console.error("ERROR: Could not select a drop location.");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        if (DEBUG_COMMAND) console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNames[dropLocationID]);

        if (serverDropLocations[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocations[guildID][dropLocationID]['weight'] / serverDropWeights[guildID] * 100;                
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
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

			if (DEBUG_COMMAND) console.log('Talking on channel : ' + channels[c].name + " [" + c + "]");

			bot.joinVoiceChannel(c, function(error, events) {
                            if (error) {
                                var sendMessage = "\u200B";
                                sendMessage += "<@!" + userID + ">, <@!" + DROPBOT_ID + "> is having trouble communicating in this voice channel.\n";
                                sendMessage += "This can happen if you have restricted channel permissions.\n";
                                sendMessage += "If <@!" + DROPBOT_ID + "> is already active, wait until it\'s done speaking or use \"db!stop\"\n";
                                sendMessage += "If all else fails, use \"db!mute\" to force <@!" + DROPBOT_ID + "> to only communicate in text channels.";
				bot.sendMessage({
                                    to: channelID,
                                    message: sendMessage
				});
                                console.log("WARNING: Voice channel active/permissions issue for " +
                                            bot.servers[guildID].channels[voiceChannelID].name + " [" + voiceChannelID + "]");
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
                                    console.error(error);
                                    return 1;
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

    // Check voter status after each successful command.
    // We default users to voters at bot/user initialization and demote from there.
    // Will be checked again prior to sending a message,
    //   if they have a non-voter restriction and send a command under the time limit.
    dbl.hasVoted(userID).then(voted => {
        
        if (dropUserIsVoter[userID] != voted) {
            if (DEBUG_VOTE) console.log("***** VOTE after handleCommand changed to " + voted + " for userID " + userID);

            dropUserIsVoter[userID] = voted;
            if (voted) {
                dropUserWarned[userID]  = false;
                bot.sendMessage({
                    to: channelID,
                    message: "\u200B<@!" + userID + ">, thanks for voting! Restriction lessened to " + VOTE_USER_TIMEOUT_SEC + " second(s).\n"
                });
            }
        } else {
            console.log("Vote after handleCommand: " + userID + " status unchanged. isVoter:" + voted);
        }
	
    }).catch((err) => {
        console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
        return 3;
    });

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
            if (DEBUG_MESSAGE) {
                console.log("--------- New DMChannel command ---------");
                console.log("  User    : " + userID + " - " + user + "#" + dmChannel.recipient.discriminator);
                console.log("  Channel : " + channelID);	
                console.log("  Time    : " + dateTime.toISOString());
                console.log("  message : " + message);
                console.log("-----------------------------------------");  
            } 
            
            var message =  "Hey, <@!" + userID + ">!\n\n";
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
    // Fail silently if the first character of command is anything other than a letter.
    if (message.length > 3 && !(message[3].match(/[a-z]/i))) {
        console.log("Ignore command - first character is not a letter.");
	return 4;
    }
    // Fail quietly if user does not supply a valid command.
    if (! (isDevUser)) {
        if (! (legalCommands.includes(message.substring(3).split(' ')[0]))) {
            console.log("Ignore command - not a legal command.");
            return 5;
        }
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

    // Main debug code block for application.
    // Logged on every successful message being parsed past the intial sanitation and DM feedback.
    if (DEBUG_MESSAGE) {
        console.log("------------- New command -------------");
        console.log("  User    : " + userID + " - " + user + "#" + userDisc);
        console.log("  Channel : " + channelID + " - " + bot.channels[channelID].name);	
        console.log("  Guild   : " + guildID + " - " + guildName);	
        console.log("  Time    : " + dateTime.toISOString());
        console.log("  message : " + message);
        console.log("---------------------------------------");  
    } 

    // Ask to move to specific channels in Official DropBot Server
    if (guildID == DROPBOT_SERVER_ID) { 
        if (channelID != DROPBOT_TEST_CHANNEL_ID1 && channelID != DROPBOT_TEST_CHANNEL_ID2) {            
            console.log("User " + user + "#" + userDisc + " [" + userID + "] in DropBot Official Server. Asked to move to correct channel.");
            args = ["error", "\u200B<@!" + userID + ">, Please join either #dropbot-test-1 or #dropbot-test-2 channels."];
            handleCommand(args, userID, channelID, guildID);
            return 0;
        }
    }
    
    args = message.substring(3).split(' ');

    // First access from a server since reboot or new server.
    if (serverInitialized[guildID] === undefined || serverInitialized[guildID] == false) {
        if (DEBUG_MESSAGE) console.log("First access from server since at least reboot: ", guildID);
        serverInitialized[guildID] = false;

        initGuildDatabase(guildName, guildID).then(result => {
            if (DEBUG_MESSAGE) console.log("initGuildDatabase success.");
        }).catch(err => {
            console.error("ERROR initGuildDatabase + " + guildID + ":\n" + err);
        }).then(() => {

            initGuild(guildID).then(result => {
                if (DEBUG_MESSAGE) console.log("initGuild " + guildID + " success.");
                serverInitialized[guildID] = true;

                // For the case of using a new server only, we treat the user as new as well.
                //   If the user is banned, the script will already have exited above.
                epochTime = dateTime.getTime();
                dropUserTimeout[userID] = epochTime;
                dropUserStrikes[userID] = 0;
                dropUserStrikes[userID] = 0;
                dropUserBlocked[userID] = false;
                dropUserWarned[userID]  = false;

                if (dropUserInitialized[userID] === undefined || dropUserInitialized[userID] == false) {
		    initUser(user, userID, userDisc, epochTime).then(result => {
                        dropUserInitialized[userID] = true;
		        if (DEBUG_DATABASE) console.log("initUser " + userID + " in initGuild " +
                                                        guildID + ": success");                        
		        if (DEBUG_DATABASE) console.log(result);
		    }).catch(err3 => {
		        console.error("ERROR initUser " + userID + " in initGuild " +
                                      guildID + ":\n", err3);                        
		    });
                } else {
		    updateUser(userID, epochTime, false).then(result => {
		        if (DEBUG_DATABASE) console.log("updateUser " + userID + " in initGuild " +
                                                        guildID + ": success");
		        if (DEBUG_DATABASE) console.log(result);
		    }).catch(err3 => {
		        console.error("ERROR updateUser " + userID + " in initGuild " +
                                      guildID + ":\n", err3);
		    });                    
                }
                
                // Handle command only once the server has been initialized.
                //   The user will already have been set up above.
                // The script will exit in the return block below.
                //   No additional code in this function will be executed.
                handleCommand(args, userID, channelID, guildID);
            }).catch(err2 => {
                console.error("ERROR initGuild + " + guildID + ":\n", err2);
            });    
        });

        // Do not execute anymore code in this function.
        // User and server are treated as new and command will be sent if setup was successful.
        return 0;
    }  
    

    // *** All users will be scanned at initialization.
    // This will need to be scaled at heavy user loads but allows us to
    //   handle all commands immediately without doing 1 or more database accesses.
    // Servers above handle commands coming in only after they have been intialized.
    // The server intialzation will also create the user, if necessary, and then send the command and exit
    if (dropUserInitialized[userID] === undefined || dropUserInitialized[userID] == false) {
        if (DEBUG_MESSAGE) console.log("Detected NEW user sending message in existing server: ", userID);

        epochTime = dateTime.getTime();
        dropUserTimeout[userID] = epochTime;
        dropUserStrikes[userID] = 0;
        dropUserStrikes[userID] = 0;
        dropUserBlocked[userID] = false;
        dropUserWarned[userID]  = false;
        
	initUser(user, userID, userDisc, epochTime).then(result => {
	    if (DEBUG_DATABASE) console.log("initUser result from on.message:\n", result);
	}).catch(err => {
	    console.error("ERROR initUser: ", err);
	});
    }

    //fixme - SPS. Only send so many messages to each blocked user.
    //  At some point, we have to ignore them. Counter can be reset at bot restart.
    if (STRIKE_SYSTEM_ENABLED) {
	if (dropUserBlocked[userID] || dropUserStrikes[userID] == USER_MAX_STRIKES) {

            if (dropUserBlocked[userID] == false) {
		dropUserBlocked[userID]  = true;
		updateUser(userID, epochTime, true);
            }
            args = ["error", "Too many strikes [" + USER_MAX_STRIKES + "].\n" + "<@!" + userID + "> blocked due to rate limiting.\n" +
		    "Please wait at least an hour or contact developer devshans0@gmail.com if you think this was in error."];
            console.log("BLOCKED: User - " + user + "[" + userID + "] due to max strikes of rate limiting.");
            handleCommand(args, userID, channelID, guildID);
            return 3;
	}
    }

    // If a user has already been blocked in the database, we don't care about the strike system being enabled.
    //   It is possible they were blocked for another reason.
    else { // if (! (STRIKE_SYSTEM_ENABLED))
        if (dropUserBlocked[userID]) {
            args = ["error", "<@!" + userID + "> blocked due to previous violations.\n" +
		    "Please contact developer devshans0@gmail.com if you think this was in error."];
            console.log("BLOCKED: User - " + user + "[" + userID + "] tried to access without strike system enabled.");
            handleCommand(args, userID, channelID, guildID);
            return 3;
        }
    }

    if (args[0] == 'vote') {
        handleCommand(args, userID, channelID, guildID);
        return 0;
    }

    // The fun part... Handling rate limiting and vote status for repeated users.
    var timeout_sec = dropUserIsVoter[userID] ? VOTE_USER_TIMEOUT_SEC : NO_VOTE_USER_TIMEOUT_SEC;

    // Use minimum rate limiting for realtime commands.
    if (args[0] == 'stop') timeout_sec = 1; 
    if (args[0] == 'i')    timeout_sec = 1;
    if (args[0] == 'info') timeout_sec = 1; 
    if (args[0] == 'h')    timeout_sec = 1;
    if (args[0] == 'help') timeout_sec = 1;

    var timeSinceLastCommand = Math.ceil((epochTime-dropUserTimeout[userID])/1000);
    if (DEBUG_MESSAGE) console.log("User " + userID + " time since last command: " + timeSinceLastCommand);
    
    if (timeSinceLastCommand < timeout_sec && !(isDevUser)) {

        var sendMessage = "";
        dropUserStrikes[userID] = dropUserStrikes[userID]+1;
        
        if (! (dropUserIsVoter[userID])) {

            dbl.hasVoted(userID).then(voted => {

                if (! (voted)) {

                    if (DEBUG_MESSAGE) console.log("Non-vote restricted " + timeSinceLastCommand + " seconds for user: " + userID);
		    
		    if (! (dropUserWarned[userID])) {

			var sendWarnMessage = "\u200B";
			sendWarnMessage +"<@!" + userID + "> is temporarily rate limited to using one command every " + NO_VOTE_USER_TIMEOUT_SEC + " seconds.\n";
			sendWarnMessage += "Due to server constraints, users must be verified to use DropBot within the last 24 hours.\n";
			sendWarnMessage += "To lessen restriction to " + VOTE_USER_TIMEOUT_SEC + " second(s), simply verify user by voting for DropBot at: https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
			if (STRIKE_SYSTEM_ENABLED) sendWarnMessage += "Strike " + dropUserStrikes[userID] + "/" + USER_MAX_STRIKES;
			dropUserWarned[userID] = true;

			setTimeout(function() {
			    bot.sendMessage({
				to: channelID,
				message: sendWarnMessage
			    });
			}, 500);

		    }

                    sendMessage  = "\u200B<@!" + userID + "> please wait " + (timeout_sec-timeSinceLastCommand) +
                        " second(s) before issuing another command.\n" +
                        "You may check if your vote has been processed immediately and without penalty with \"db!vote\"";
                    args = ["error", sendMessage];
                    handleCommand(args, userID, channelID, guildID);
                    return 1;
                } else {
		    dropUserIsVoter[userID] = true;
		    dropUserWarned[userID]  = false; //fixme - SPS. May be redundant...
                    if (DEBUG_VOTE) console.log("***** VOTE before handleCommand changed to " + voted + " for userID " + userID);
                    sendMessage  = "\u200B<@!" + userID + ">, thanks for voting! Restriction lessened to " + VOTE_USER_TIMEOUT_SEC + " second(s).\n";;
                    args = ["error", sendMessage];
                    handleCommand(args, userID, channelID, guildID);		    
		    return 0;
		}
            }).catch((err) => {
                console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
                return 3;
            });
            
        } else {
	    args = ["error", "<@!" + userID + "> please wait " + (timeout_sec-timeSinceLastCommand) + " second(s) before issuing another command.\n"];
            handleCommand(args, userID, channelID, guildID);            
        }
        
        return 1;
        
    }

    // Update last access time and related stats if command succeeded
    epochTime = dateTime.getTime();
    dropUserStrikes[userID] = 0;
    dropUserTimeout[userID] = epochTime;
    dropUserStrikes[userID] = 0;
    dropUserBlocked[userID] = false;
    dropUserWarned[userID]  = false;

    updateUser(userID, epochTime, false).then(result => {
        handleCommand(args, userID, channelID, guildID);
    }).catch((err) => {
        console.error("ERROR bot.on(message): ", err);
    });  
        
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
