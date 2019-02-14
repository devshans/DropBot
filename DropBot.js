/*
    @document   : DropBot.js
    @author     : devshans
    @version    : 8.1.0
    @copyright  : 2019, devshans
    @license    : The MIT License (MIT) - see LICENSE
    @repository : https://github.com/devshans/DropBot
    @description: DropBot automated Bot for Discord Application.
                  Uses discord.js Discordapp library.
                  Randomly selects a location to start in for 
                    the Apex Legends and Fortnite Battle Royale games.
		  Hosted on AWS.

    Discord support server: https://discord.gg/YJWEsvV

    Add bot to server with:
        https://discordapp.com/oauth2/authorize?client_id=487298106849886224&scope=bot&permissions=0

    Links  * Epic Games : https://www.epicgames.com
           * Fortnite   : https://www.epicgames.com/fortnite/en-US/home
	   * Locations  : https://fortnite.gamepedia.com/Battle_Royale_Map
           * Discord    : https://discordapp.com
	   * discord.js : https://discord.js.org
*/

var DEBUG_MESSAGE  = true;
var DEBUG_COMMAND  = true;
var DEBUG_DATABASE = true;
var DEBUG_DBL      = true;
var DEBUG_VOTE     = true;

var STRIKE_SYSTEM_ENABLED = false;
var VOTE_SYSTEM_ENABLED   = false;

const NO_VOTE_USER_TIMEOUT_SEC = (1 * 60);
const VOTE_USER_TIMEOUT_SEC    = 1;
const USER_MAX_STRIKES = 5;

const NUM_DROP_LOCATIONS = 21;
const DEFAULT_WEIGHT =  5;
const MAX_WEIGHT     = 10;

const Discord = require('discord.js');
const fs      = require('fs');
const rwc     = require('random-weighted-choice');
const AWS     = require("aws-sdk");
const date    = require('date-and-time');

const dbAWS = require('./db.js');

// Discord ID of this bot to identify ourselves.
const DROPBOT_ID      = "487298106849886224";
const DEV_DROPBOT_ID  = "533851604651081728";

var DEVSHANS_ID = -1;

const devFilename = "dev.json";
fs.readFile(devFilename, 'utf8', function(err, data) {
    if (err) {
        console.log("No " + devFilename + " file for authentication.");
        return 1;
    }
    var devJson = JSON.parse(data);
    console.log("Set DEVSHANS_ID to: ", devJson.uid);
    DEVSHANS_ID = devJson.uid;
});

// Fortnite specific stuff
var dropLocationNamesFN = [
    "Dusty Divot"
    ,"Fatal Fields"
    ,"Frosty Flights"
    ,"Tomato Temple"
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

// Apex specific stuff
var dropLocationNamesAL = [
    "Airbase"
    ,"Artillery"
    ,"Bridges"
    ,"Bunker"
    ,"Cascades"
    ,"Hydro Dam"
    ,"Market"
    ,"Relay"
    ,"Repulsor"
    ,"Runoff"
    ,"Skull Town"
    ,"Slum Lakes"
    ,"Swamps"
    ,"The Pit"
    ,"Thunderdome"
    ,"Water Treatment"
    ,"Wetlands"
];

// Database status in memory
var serverInitialized   = {};
var dropUserInitialized = {};

var usersTotalCount     = 0;
var dropUserTimeout     = {};
var dropUserStrikes     = {};
var dropUserBlocked     = {};
var dropUserIsVoter     = {};
var dropUserWarned      = {};

var serverTotalCount      = 0;
var serverDropLocationsFN = {};
var serverDropWeightsFN   = {};
var serverDropLocationsAL = {};
var serverDropWeightsAL   = {};
var serverAudioMute       = {};
var serverUpdateNotice    = {};
var serverActiveVoice     = {}; // Servers that DropBot is actively speaking on.

var dropIntros = [
     'intro.wav'
    ,'intro2.wav'
    ,'intro3.wav'
];

module.exports = {
    serverInitialized:   serverInitialized,
    dropUserInitialized: dropUserInitialized
}

var defaultWeightsFN = [];
initDefaultWeightsFN().then((result) => console.log("Retrieved default weights for Fortnite."));

var defaultWeightsAL = [];
initDefaultWeightsAL().then((result) => console.log("Retrieved default weights for Apex Legends."));


const client = new Discord.Client();

const { prefix, token } = require('./config.json');

var filenameArray = __filename.split("/");

var developerMode = filenameArray[filenameArray.length-1] == "DropBot-dev.js" ? true : false;

//fixme - SPS. These should only be in db.js
// DynamoDB Table Names
const dbTableLocationsFN = "DropLocations";
const dbTableLocationsAL = "DropLocationsAL";

if (developerMode) {
    var dbTableGuilds    = "dev_DropGuilds";
    var dbTableUsers     = "dev_DropUsers";
} else {
    var dbTableGuilds    = "DropGuilds";
    var dbTableUsers     = "DropUsers";
}

if (developerMode) {
    console.log("Starting DropBot-dev.js in DEVELOPER mode");
    var auth    = require('./auth-dev.json');
} else {
    console.log("*** Starting DropBot in PRODUCTION mode ***");
    var auth    = require('./auth.json');
}


// DiscordBotList API
const DBL = require("dblapi.js");
const dbl = new DBL(auth.dblToken, client); // NOTE: Make sure to guard any accesses from DropBot-dev with developerMode.


console.log("Starting database reads for setup");
dbAWS.scanUsers(onScan);

function onScan(err, data) {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        console.log("dbTableUsers scan succeeded.");
        data.Items.forEach(function(item) {        
            if (developerMode) console.log(" -", item.name + ": " + item.blocked);
            dropUserTimeout[item.id] = item.accessTime;
            dropUserStrikes[item.id] = 0;
            dropUserBlocked[item.id] = item.blocked;
            dropUserIsVoter[item.id] = true;
	    dropUserWarned[item.id]  = false;
            dropUserInitialized[item.id] = true;
            usersTotalCount++;            
        });

        // continue scanning if we have more movies, because
        // scan can retrieve a maximum of 1MB of data
        if (typeof data.LastEvaluatedKey != "undefined") {
            console.log("dbTableUsers scanning for more...");
            params.ExclusiveStartKey = data.LastEvaluatedKey;
            docClient.scan(params, onScan);
        } else {
	    console.log("Done scanning dbTableUsers");
            //console.log("Done reading " + dbTableUsers + " before starting bot for " + usersTotalCount + " users");
        }
    }
}


/**
 * The ready event is vital, it means that only _after_ this will your bot start reacting to information
 * received from Discord
 */
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);   
    client.user.setActivity(`\"db!help\"`, { type: 'LISTENING' });
    
    // Send client.guilds.size to DBL at startup and then every 30 minutes.
    if (! (developerMode) && client.user.id == DROPBOT_ID) {
        dblPostStats(); 
        setInterval(() => {
            dblPostStats();
        }, 1800000);	
    }

    console.log("DropBot listening on " + client.guilds.size + " servers for " + usersTotalCount + " total users");

    console.log('DropBot done initializing. Ready to accept user commands.');
    
});

client.on('disconnect', event => {
    console.log('Disconnected from Discord. Retrying...');
    client.login(auth.token);
    console.log('Disconnection error code: ' + event.code);
});

client.on("guildCreate", guild => {
  // This event triggers when the bot joins a guild.
  console.log(`New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
  //client.user.setActivity(`Serving ${client.guilds.size} servers`);
});

client.on("guildDelete", guild => {
  // this event triggers when the bot is removed from a guild.
  console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
  //client.user.setActivity(`Serving ${client.guilds.size} servers`);
});

// Create an event listener for new guild members
client.on('guildMemberAdd', member => {
  // Send the message to a designated channel on a server:
  const channel = member.guild.channels.find(ch => ch.name === 'member-log');
  // Do nothing if the channel wasn't found on this server
  if (!channel) return;
  // Send the message, mentioning the member
  channel.send(`Welcome to the server, ${member}`);
});


// Log our bot in using the token from https://discordapp.com/developers/applications/me
var loginDelay = developerMode ? 500 : 5000;
setTimeout(function() {
    client.login(auth.token);
}, loginDelay);


async function initGuildDatabase(guildName, guildID) {

    return new Promise(function(resolve, reject) {

        var guildPromise = dbAWS.getDropBotGuilds(guildID);
        serverUpdateNotice[guildID] = false;

        guildPromise.then(function(result) {

            var dbStringFN = defaultWeightsFN.reduce((map, obj) => (map[obj.id] = obj.weight, map), {});
	    var dbStringAL = defaultWeightsAL.reduce((map, obj) => (map[obj.id] = obj.weight, map), {});         

            if (result.Item == null) {
                // Create entry in database.
                console.log("Creating NEW server database entry: " + guildName + "[" + guildID + "]");
                var params = {
                    TableName: dbTableGuilds,
                    Item:{
                        "name":guildName,			
                        "id":guildID,
                        "numAccesses":1,
                        "dropLocations":dbStringFN,
                        "dropLocationsAL":dbStringAL,			
			"audioMute":false,
                        "updateNotice":true
                    }
                };

                dbAWS.databasePut(params).then(function(result) {
                    if (DEBUG_DATABASE) console.log("Successfully created NEW server database entry.");
                    client.guilds.size++;
                    console.log("New total servers: " + client.guilds.size);
                    resolve(result);
                }, function(err) {
                    console.error("ERROR: Failed to create database entry:\n" + err);
                    reject(err);
                });

            } else {
                if (DEBUG_DATABASE) console.log("Server already exists in database..");

                //fixme - SPS. Push these servers to a queue that is sent out separately.
                // Send a message to the server if it is the first access since an update.
                if (! (result.Item.updateNotice)) {
                    serverUpdateNotice[guildID] = true;
                    console.log("*** Sending update message to server: " + guildID);
                }
                
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

        var userPromise = dbAWS.getDropBotUsers(userID);

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
                        "creationTime":accessTime,
                        "lastVoteTime":accessTime,
                        "numAccesses":1,
                        "numVotes":0,
                        "isVoter":false,
                        "blocked":false
                    }
                };

		dbAWS.databasePut(params).then(function(result) {
                    if (DEBUG_DATABASE) console.log("Successfully created new user entry.");
                    dropUserTimeout[userID] = accessTime;
                    dropUserStrikes[userID] = 0;
                    dropUserBlocked[userID] = false;
                    dropUserIsVoter[userID] = true;
		    dropUserWarned[userID]  = false;
                    dropUserInitialized[userID] = true;
                    usersTotalCount++;
                    console.log("New total users: " + usersTotalCount);
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

	dbAWS.databaseUpdate(params).then(function(result) {
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
        dbAWS.docClient.scan(params, resetAllUserBanScan);
        
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
            dbAWS.docClient.scan(params, resetAllUserBanScan);
        }
    }
}

async function updateGuildAll(guildID) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildAll for server: ", guildID);

        var dbStringFN = serverDropLocationsFN[guildID].reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});
        var dbStringAL = serverDropLocationsAL[guildID].reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});	

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set dropLocations = :dfn, dropLocationsAL = :dal, audioMute = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":dfn":dbStringFN,
		":dal":dbStringAL,
                ":bool":serverAudioMute[guildID],
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	dbAWS.databaseUpdate(params).then(function(result) {	
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildAll: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

}


async function updateGuildDropsFN(guildID) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildDropsFN for server: ", guildID);

        var dbStringFN = serverDropLocationsFN[guildID].reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set dropLocations = :d, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":d":dbStringFN,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	dbAWS.databaseUpdate(params).then(function(result) {
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildDropsFN: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

}

async function updateGuildDropsAL(guildID) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildDropsAL for server: ", guildID);

        var dbStringAL = serverDropLocationsAL[guildID].reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set dropLocationsAL = :d, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":d":dbStringAL,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	dbAWS.databaseUpdate(params).then(function(result) {
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildDropsAL: Failed to update database entry.\n" + err);
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

	dbAWS.databaseUpdate(params).then(function(result) {
            console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildAudioMute: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

}

async function updateGuildUpdateNotice(guildID) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildUpdateNotice for server: ", guildID, " to \"true\"");

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set updateNotice = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":bool":true,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	dbAWS.databaseUpdate(params).then(function(result) {
            console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildUpdateNotice: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

}

async function initDefaultWeightsFN(guildID) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        console.log("Getting default weights for client.");

        for (var id = 0; id < dropLocationNamesFN.length; id++) {
            promises.push(dbAWS.getDropLocationFN(id));
        }

        Promise.all(promises).then((results) => {

            for (var i=0; i < results.length; i++) {
                var dropLocationWeight = results[i].Item.defaultWeight;
                var dropLocationName   = results[i].Item.name;

                defaultWeightsFN.push({
                    id: results[i].Item.id,
                    weight: dropLocationWeight
                });

            }

            resolve(defaultWeightsFN);

        }).catch((e) => {
            console.error("ERROR initDefaultWeightsFN:\n" + e);
            reject(e);
        });
    });

}

async function initDefaultWeightsAL(guildID) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        console.log("Getting default weights for client.");

        for (var id = 0; id < dropLocationNamesAL.length; id++) {
            promises.push(dbAWS.getDropLocationAL(id));
        }

        Promise.all(promises).then((results) => {

            for (var i=0; i < results.length; i++) {
                var dropLocationWeight = results[i].Item.defaultWeight;
                var dropLocationName   = results[i].Item.name;

                defaultWeightsAL.push({
                    id: results[i].Item.id,
                    weight: dropLocationWeight
                });

            }

            resolve(defaultWeightsAL);

        }).catch((e) => {
            console.error("ERROR initDefaultWeightsAL:\n" + e);
            reject(e);
        });
    });

}

async function initGuild(guildID) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        if (DEBUG_DATABASE) console.log("Getting dropLocation weights for server: " + guildID);

        serverDropLocationsFN[guildID] = [];
        serverDropWeightsFN[guildID]   = 0;
        serverDropLocationsAL[guildID] = [];
        serverDropWeightsAL[guildID]   = 0;
	serverAudioMute[guildID]     = false;
        serverActiveVoice[guildID]   = false;

        dbAWS.readGuild(guildID).then(result => {

            if (result.Item === undefined || result.Item == null) {
                console.error("ERROR initGuild " + guildID + ":\nresult.Item is null.");
                reject ("result.Item is null");
            }
	    
            var myDropLocationsFN = result.Item.dropLocations;
	    var myDropLocationsAL = result.Item.dropLocationsAL;

	    serverAudioMute[guildID] = result.Item.audioMute;

            for (var i in myDropLocationsFN) {
                serverDropWeightsFN[guildID] += myDropLocationsFN[i];
                serverDropLocationsFN[guildID].push({
                    id: i,
                    weight: myDropLocationsFN[i]
                });
            }

	    for (var i in myDropLocationsAL) {
                serverDropWeightsAL[guildID] += myDropLocationsAL[i];
                serverDropLocationsAL[guildID].push({
                    id: i,
                    weight: myDropLocationsAL[i]
                });
            }
	    
            resolve(serverDropLocationsFN[guildID]);
	    
        }).catch((e) => {
            console.error("ERROR initGuild " + guildID + ":\n" + e);
            reject(e);
        });

    });

}


function dblPostStats() {
    console.log('*** DBL: Sending client.guilds.size to Discord Bot List - ' + client.guilds.size);

    dbl.postStats(client.guilds.size).then(() => {
	console.log('*** DBL: SUCCESS sending client.guilds.size to Discord Bot List - ' + client.guilds.size);
    }).catch(err => {
        console.log("*** DBL WARNING: Could not access dbl.postStats database");
    });

}


async function handleCommand(args, userID, channelID, guildID, messageObj) {

    var isDevUser = (DEVSHANS_ID == userID);

    var cmd = args[0];
    message = "";

    if (DEBUG_COMMAND) console.log("handleCommand: user=" + userID + " - " +  args);

    args = args.splice(1);

    var sendMessage = "";

    // Commands restricted to developer user.
    // --------------------------------------
    if (isDevUser) {

        console.log("Running command from dev user: " + userID);
        
        switch(cmd) {

        case 'numservers':
            console.log("Number of active servers: " + client.guilds.size);            
            break;

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

        case 'votesystem':            
            VOTE_SYSTEM_ENABLED = !VOTE_SYSTEM_ENABLED;
            message = "\u200BSet VOTE_SYSTEM_ENABLED to " + VOTE_SYSTEM_ENABLED;
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
		    sendMessage = "\u200BBan cleared successfully.";
		    client.channels.get(channelID).send(sendMessage);
                }, 200);
                
            }).catch((e) => {
                console.error("ERROR resetban: " + e);
                setTimeout(function() {
		    sendMessage = "\u200BERROR: " + e;
		    client.channels.get(channelID).send(sendMessage);
                }, 200);
            });
            break;
            
        case 'resetallbans':
            message = "\u200BResetting bans for all users...";
            resetAllUserBans();
            setTimeout(function() {
		sendMessage = "\u200BDone.";
		    client.channels.get(channelID).send(sendMessage);
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

	case 'resetvoice':

	    for (var thisGuildID in client.servers) {
                if (serverActiveVoice[thisGuildID]) {
		    serverActiveVoice = false;
		    for (var voiceChannelID in client.servers[thisGuildID].channels) {
                        if (client.servers[thisGuildID].channels[voiceChannelID].type == 2) {
    			    console.log("Leaving active voice channel " +
    					client.servers[thisGuildID].channels[voiceChannelID] + "[" + voiceChannelID + "]" + " in server " +
    					client.servers[thisGuildID].name + "[" + thisGuildID + "]");
			    client.leaveVoiceChannel(voiceChannelID, function(error, events) {
                                if (error) {
				    if (typeof error === 'string' && error.substring(0, 32) != "Error: Not in the voice channel:") {
                                        console.log("WARNING: Error leaving voice channel dev:\n" + error);
				    } 
                                } else {
				    serverActiveVoice[thisGuildID] = false;
                                }
			    });                           
                        }
		    }
                }
	    }           

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
		    client.channels.get(channelID).send(sendMessage);
                }, 200);
                
	    }).catch((err) => {
                var sendMessage = "\u200BOops... DropBot could not access dbl.hasVoted database for userID: " + userID + "\n" +  err;
                console.log(sendMessage);
                
                setTimeout(function() {
		    client.channels.get(channelID).send(sendMessage);
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
        message += "Vote     : https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
        message += 'Discord support server: https://discord.gg/YJWEsvV \n\n';
        message += 'usage: db![option]\n\n';
        message += 'db![option]            Description\n';
        message += '----------------------------------\n';
        message += 'db!                   : Uses the default command for choosing a drop location (\"db!drop\")\n';
        message += 'db!drop / db!fortnite : Randomly choose a Fortnite location to drop based on server settings.\n';
        message += 'db!apex               : Randomly choose an Apex Legends location to drop based on server settings.\n';
        message += 'db!mute               : Mutes DropBot audio in voice channel.\n';
        message += 'db!unmute             : Unmutes DropBot audio. Requires user to be in a voice channel.\n';
	message += 'db!settings           : Shows all DropBot settings on this server.\n';
	message += 'db!reset              : Resets all DropBot settings to their defaults on this server.\n';
        message += 'db!info               : Shows DropBot information and links/commands for additional help.\n';
        message += 'db!stop               : Stop playing audio and remove DropBot from voice channel.\n';
	message += 'db!help               : Show this help message again.\n';
	message += 'db!vote               : Check and update vote status for bot within the last 24 hours without rate limit penalty.\n';
        message += 'db!set  [id] [weight] : Change the percentage chance of choosing each Fortnite location. Use "db!set help" for more info.\n';
        message += 'db!aset [id] [weight] : Change the percentage chance of choosing each Apex Legends location. Use "db!set help" for more info.\n';
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
        if (VOTE_SYSTEM_ENABLED) {
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
                    handleCommand(args, userID, channelID, guildID, messageObj);
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
                        handleCommand(args, userID, channelID, guildID, messageObj);
                    }).catch((err) => {
                        console.error("ERROR vote command update: " + err);
                    });
                    
    		    return 0;
    	        }
            }).catch((err) => {

                var sendMessage = "\u200BOops... <@!" + userID + ">, DropBot could not access Discord Bot List's vote database.\nPlease try again later.\n";
                console.log(sendMessage);
                
                setTimeout(function() {
		    client.channels.get(channelID).send(sendMessage);
                }, 200);
                
                return 3;
            });
        } else {
            message = "\u200BVote system temporarily disabled.\n" +
                "Rate limiting set to minimum of " + VOTE_USER_TIMEOUT_SEC + " second(s).";
            message += "Voting link : https://discordbots.org/bot/" + DROPBOT_ID + "/vote \n";
        }
        
        break;

    case 'm':
    case 'mute':

    	if (serverAudioMute[guildID]) {
            message = "\u200BDropBot is already muted.";
    	    break;
    	} else {
            message = "\u200BMuting DropClient.";
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

    case 'fset':        
    case 'set':

        var validChange         = true;
        var setId               = Number(args[0]);
        var setWeight           = Number(args[1]);
        var previousWeight      = -1;
        var previousTotalWeight = serverDropWeightsFN[guildID];
        var nextTotalWeight     = 0;

        message = '\u200B';

        if (args.length == 0 || (args.length == 1 && args[0] == "help")) {
    	    message +=  'Help for changing drop location chance\n';
            validChange = false;
            message += '```';
            message += 'db!set [id] [weight]\n';
            message += '```';	    
    	}

        if (validChange && args.length < 2) {
            message = "Please specify the index and weight.";
            validChange = false;            
        }
        
        if (validChange && ! (Number.isInteger(setId)) || ! (Number.isInteger(setWeight))) {
            message += "ERROR: [id] and [weight] arguments must both be numbers.";
            validChange = false;
        }
        
        if (validChange && setId > (NUM_DROP_LOCATIONS-1) || setId < 0) {
            message += "ERROR: [id] must be within the range of 0 to " + (NUM_DROP_LOCATIONS-1);
            validChange = false;
        }
        
        if (validChange && setWeight > MAX_WEIGHT || setWeight < 0) {
            message += "ERROR: [weight] must be within the range of 0 to " + MAX_WEIGHT;
            validChange = false;
        }

        if (validChange && serverDropLocationsFN[guildID][setId]['weight'] == setWeight) {
            message += "ERROR: Weight for " + dropLocationNamesFN[setId] + " is already " + setWeight;
            validChange = false;
        }        

        if (validChange) {
            message += "Setting weight for " + dropLocationNamesFN[setId] + " to " + setWeight;
            serverDropLocationsFN[guildID][setId]['weight'] = setWeight;

            previousWeight = Number(serverDropLocationsFN[guildID][setId]['weight']);
            
            nextTotalWeight = 0;
            for (var i=0; i < dropLocationNamesFN.length; i++) {
                console.log("SPS HUH... " + i + " " + serverDropLocationsFN[guildID][i]);
                nextTotalWeight += Number(serverDropLocationsFN[guildID][i]['weight']);
            }
            
            if (nextTotalWeight < 1) {
                message += "ERROR: All weights must add up to at least 1";
                serverDropLocationsFN[guildID][setId]['weight'] = previousWeight;
                validChange = false;
            }
            
        } else {
            
            for (var i=0; i < dropLocationNamesFN.length; i++) {        
                nextTotalWeight += Number(serverDropLocationsFN[guildID][i]['weight']);
            }

        }

        serverDropWeightsFN[guildID] = nextTotalWeight;

        
        var sendMessage = "```";
        
    	sendMessage += "-------------- Fortnite ---------------\n";
        sendMessage += "  ID   Location        Weight  % Chance\n";
        sendMessage += "  -------------------------------------\n";

        for (var i=0; i < dropLocationNamesFN.length; i++) {
            var dropLocationID     = i;;
            var dropLocationWeight = Number(serverDropLocationsFN[guildID][i]['weight']);
            var dropLocationName   = dropLocationNamesFN[dropLocationID];
            var dropChance         = serverDropLocationsFN[guildID][dropLocationID]['weight'] / serverDropWeightsFN[guildID] * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);

            sendMessage += "  ";
            if (dropLocationID < 10) sendMessage += " " + dropLocationID;
            else                     sendMessage += dropLocationID;

            sendMessage += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                sendMessage += " ";
            }

            sendMessage += " - " + dropLocationWeight + "   ";
            if (dropLocationWeight != 10) sendMessage += " ";

            sendMessage += " - " + dropChance + "%\n";
            
        }        
        
        sendMessage += "  ------------------------------\n";
    	sendMessage += "Total weight: " + serverDropWeightsFN[guildID] + "\n";        

        sendMessage += "```";

        if (validChange) {
            updateGuildDropsFN(guildID).then(result => {
                
                setTimeout(function() {
		    client.channels.get(channelID).send(sendMessage);
                }, 500);

            }).catch((e) => {
                console.error("ERROR updateGuildDropsFN: " + e);
            });
        } else {
            setTimeout(function() {
		client.channels.get(channelID).send(sendMessage);
            }, 500);
        }
        
        break;

    case 'aset':

        var validChange         = true;
        var setId               = Number(args[0]);
        var setWeight           = Number(args[1]);
        var previousWeight      = -1;
        var previousTotalWeight = serverDropWeightsAL[guildID];
        var nextTotalWeight     = 0;

        message = '\u200B';

        if (args.length == 0 || (args.length == 1 && args[0] == "help")) {
    	    message +=  'Help for changing drop location chance\n';
            validChange = false;
            message += '```';
            message += 'db!set [id] [weight]\n';
            message += '```';	    
    	}

        if (validChange && args.length < 2) {
            message = "Please specify the index and weight.";
            validChange = false;            
        }
        
        if (validChange && ! (Number.isInteger(setId)) || ! (Number.isInteger(setWeight))) {
            message += "ERROR: [id] and [weight] arguments must both be numbers.";
            validChange = false;
        }
        
        if (validChange && setId > (NUM_DROP_LOCATIONS-1) || setId < 0) {
            message += "ERROR: [id] must be within the range of 0 to " + (NUM_DROP_LOCATIONS-1);
            validChange = false;
        }
        
        if (validChange && setWeight > MAX_WEIGHT || setWeight < 0) {
            message += "ERROR: [weight] must be within the range of 0 to " + MAX_WEIGHT;
            validChange = false;
        }

        if (validChange && serverDropLocationsAL[guildID][setId]['weight'] == setWeight) {
            message += "ERROR: Weight for " + dropLocationNamesAL[setId] + " is already " + setWeight;
            validChange = false;
        }        

        if (validChange) {
            message += "Setting weight for " + dropLocationNamesAL[setId] + " to " + setWeight;
            serverDropLocationsAL[guildID][setId]['weight'] = setWeight;

            previousWeight = Number(serverDropLocationsAL[guildID][setId]['weight']);
            
            nextTotalWeight = 0;
            for (var i=0; i < dropLocationNamesAL.length; i++) {
                nextTotalWeight += Number(serverDropLocationsAL[guildID][i]['weight']);
            }
            
            if (nextTotalWeight < 1) {
                message += "ERROR: All weights must add up to at least 1";
                serverDropLocationsAL[guildID][setId]['weight'] = previousWeight;
                validChange = false;
            }
            
        } else {
            
            for (var i=0; i < dropLocationNamesAL.length; i++) {        
                nextTotalWeight += Number(serverDropLocationsAL[guildID][i]['weight']);
            }

        }

        serverDropWeightsAL[guildID] = nextTotalWeight;

        
        var sendMessage = "```";

    	sendMessage += "------------ Apex Legends -------------\n";
        sendMessage += "  ID   Location        Weight  % Chance\n";
        sendMessage += "  -------------------------------------\n";            

        for (var i=0; i < dropLocationNamesAL.length; i++) {
            var dropLocationID     = i;;
            var dropLocationWeight = Number(serverDropLocationsAL[guildID][i]['weight']);
            var dropLocationName   = dropLocationNamesAL[dropLocationID];
            var dropChance         = serverDropLocationsAL[guildID][dropLocationID]['weight'] / serverDropWeightsAL[guildID] * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);

            sendMessage += "  ";
            if (dropLocationID < 10) sendMessage += " " + dropLocationID;
            else                     sendMessage += dropLocationID;

            sendMessage += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                sendMessage += " ";
            }

            sendMessage += " - " + dropLocationWeight + "   ";
            if (dropLocationWeight != 10) sendMessage += " ";

            sendMessage += " - " + dropChance + "%\n";
            
        }        
        
        sendMessage += "  ------------------------------\n";
    	sendMessage += "Total weight: " + serverDropWeightsAL[guildID] + "\n";        

        sendMessage += "```";

        if (validChange) {
            updateGuildDropsAL(guildID).then(result => {
                
                setTimeout(function() {
		    client.channels.get(channelID).send(sendMessage);
                }, 500);

            }).catch((e) => {
                console.error("ERROR updateGuildDropsAL: " + e);
            });
        } else {
            setTimeout(function() {
		client.channels.get(channelID).send(sendMessage);
            }, 500);
        }
        
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
        message += "Bot Vote Support : https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
        message += "Support Discord  : https://discord.gg/YJWEsvV\n\n";
        message += "```";
        break;

    case 's':
    case 'settings':

        message += "\u200BRetrieving info for this server...";

        dbAWS.readGuild(guildID).then(result => {

            var myDropLocationsFN        = result.Item.dropLocations;
            var myDropLocationsAL        = result.Item.dropLocationsAL;
	    serverAudioMute[guildID]     = result.Item.audioMute;
	    serverDropWeightsFN[guildID] = 0;
            serverDropWeightsAL[guildID] = 0;
	    
            var sendMessage = "```";

            sendMessage += "Discord Server Settings\n";
            sendMessage += "---------------------------------\n";
	    sendMessage += "Server ID   : " + result.Item.id + "\n";
	    sendMessage += "Server Name : " + result.Item.name + "\n";
	    sendMessage += "Audio Muted : " + serverAudioMute[guildID] + "\n\n";
	    sendMessage += "-------------- Fortnite ---------------\n";
            sendMessage += "  ID   Location        Weight  % Chance\n";
            sendMessage += "  -------------------------------------\n";
            
            if (serverDropWeightsFN[guildID] == null || serverDropWeightsFN[guildID] == 0) {
                serverDropWeightsFN[guildID] = 0;
                for (var i in myDropLocationsFN) {
                    serverDropWeightsFN[guildID] += myDropLocationsFN[i];
                }
            }

            for (var i in myDropLocationsFN) {

                var dropLocationID = i;
                var dropLocationWeight = myDropLocationsFN[i];
                var dropLocationName   = dropLocationNamesFN[dropLocationID];
                var dropChance         = serverDropLocationsFN[guildID][dropLocationID]['weight'] / serverDropWeightsFN[guildID] * 100;
                if (dropChance != 100) dropChance = dropChance.toPrecision(2);

		sendMessage += "  ";
                if (dropLocationID < 10) sendMessage += " " + dropLocationID;
                else                     sendMessage += dropLocationID;

                sendMessage += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    sendMessage += " ";
                }

                sendMessage += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) sendMessage += " ";

                sendMessage += " - " + dropChance + "%\n";
                
            }

            sendMessage += "  ------------------------------------\n";
	    sendMessage += "Total weight: " + serverDropWeightsFN[guildID] + "\n\n";

	    sendMessage += "------------ Apex Legends -------------\n";
            sendMessage += "  ID   Location        Weight  % Chance\n";
            sendMessage += "  -------------------------------------\n";            

            if (serverDropWeightsAL[guildID] == null || serverDropWeightsAL[guildID] == 0) {
                serverDropWeightsAL[guildID] = 0; //fixme - SPS. needed?
                for (var i in myDropLocationsAL) {
                    serverDropWeightsAL[guildID] += myDropLocationsAL[i];
                }
            }

            for (var i in myDropLocationsAL) {

                var dropLocationID = i;
                var dropLocationWeight = myDropLocationsAL[i];
                var dropLocationName   = dropLocationNamesAL[dropLocationID];
                var dropChance         = serverDropLocationsAL[guildID][dropLocationID]['weight'] / serverDropWeightsAL[guildID] * 100;
                if (dropChance != 100) dropChance = dropChance.toPrecision(2);

		sendMessage += "  ";
                if (dropLocationID < 10) sendMessage += " " + dropLocationID;
                else                     sendMessage += dropLocationID;

                sendMessage += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    sendMessage += " ";
                }

                sendMessage += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) sendMessage += " ";

                sendMessage += " - " + dropChance + "%\n";
                
            }
            
            sendMessage += "  ------------------------------------\n";
	    sendMessage += "Total weight: " + serverDropWeightsAL[guildID] + "\n\n";
            
            sendMessage += "```";

            setTimeout(function() {
		client.channels.get(channelID).send(sendMessage);
            }, 500);

        }).catch((e) => {
            console.log("ERROR: settings command. guildID: " + guildID + "\n" + e);
        });

        break;
              
    case 'reset':
        message = "Resetting all values to their defaults...";

        dbAWS.readGuild(guildID).then(result => {

    	    serverAudioMute[guildID]   = false;
    	    //serverDropWeightsFN[guildID] = 0;
	    
            var sendMessage = "```";

            sendMessage += "Discord Server Settings\n";
            sendMessage += "---------------------------------\n";
    	    sendMessage += "Server ID   : " + result.Item.id + "\n";
    	    sendMessage += "Server Name : " + result.Item.name + "\n";
    	    sendMessage += "Audio Muted : " + serverAudioMute[guildID] + "\n";
    	    sendMessage += "------------- Fortnite ---------------\n";
            sendMessage += "  ID   Location       Weight  % Chance\n";
            sendMessage += "  ------------------------------------\n";

            serverDropLocationsFN[guildID] = [];
            serverDropWeightsFN[guildID]   = 0;
            for (var dropLocationID in result.Item.dropLocations) {
                serverDropLocationsFN[guildID].push({
                    id: dropLocationID,
                    weight: defaultWeightsFN[dropLocationID]['weight']
                });
                serverDropWeightsFN[guildID] += Number(defaultWeightsFN[dropLocationID]['weight']);
            }
	    
            for (var dropLocationID in serverDropLocationsFN[guildID]) {

                var dropLocationWeight = Number(serverDropLocationsFN[guildID][dropLocationID]['weight']);
                var dropLocationName   = dropLocationNamesFN[dropLocationID];
                var dropChance         = serverDropLocationsFN[guildID][dropLocationID]['weight'] / serverDropWeightsFN[guildID] * 100;
                if (dropChance != 100) dropChance = dropChance.toPrecision(2);

    		sendMessage += "  ";
                if (dropLocationID < 10) sendMessage += " " + dropLocationID;
                else                     sendMessage += dropLocationID;

                sendMessage += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    sendMessage += " ";
                }

                sendMessage += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) sendMessage += " ";

                sendMessage += " - " + dropChance + "%\n";
                
            }

            sendMessage += "  ------------------------------------\n";
    	    sendMessage += "Total weight: " + serverDropWeightsFN[guildID] + "\n\n";

    	    sendMessage += "----------- Apex Legends -------------\n";
            sendMessage += "  ID   Location       Weight  % Chance\n";
            sendMessage += "  ------------------------------------\n";
	    
            serverDropLocationsAL[guildID] = [];
            serverDropWeightsAL[guildID]   = 0;
            for (var dropLocationID in result.Item.dropLocationsAL) {
                serverDropLocationsAL[guildID].push({
                    id: dropLocationID,
                    weight: defaultWeightsAL[dropLocationID]['weight']
                });
                serverDropWeightsAL[guildID] += Number(defaultWeightsAL[dropLocationID]['weight']);
            }

            for (var dropLocationID in serverDropLocationsAL[guildID]) {

                var dropLocationWeight = Number(serverDropLocationsAL[guildID][dropLocationID]['weight']);
                var dropLocationName   = dropLocationNamesAL[dropLocationID];
                var dropChance         = serverDropLocationsAL[guildID][dropLocationID]['weight'] / serverDropWeightsAL[guildID] * 100;
                if (dropChance != 100) dropChance = dropChance.toPrecision(2);

    		sendMessage += "  ";
                if (dropLocationID < 10) sendMessage += " " + dropLocationID;
                else                     sendMessage += dropLocationID;

                sendMessage += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    sendMessage += " ";
                }

                sendMessage += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) sendMessage += " ";

                sendMessage += " - " + dropChance + "%\n";
                
            }

            sendMessage += "  ------------------------------------\n";
    	    sendMessage += "Total weight: " + serverDropWeightsAL[guildID] + "\n";
	    
            sendMessage += "```";            

            updateGuildAll(guildID).then(result => {
		
                setTimeout(function() {
		    client.channels.get(channelID).send(sendMessage);
                }, 500);
                
            }).catch((e) => {
                console.error("ERROR updateGuildDrops: " + e);
            });

            
        }).catch((e) => {
            console.log("ERROR: reset command. guildID: " + guildID + "\n" + e);
        });

        break;

    // Exits active voice channel in this guild.
    case 'stop':

        var connection = client.guilds.get(guildID).voiceConnection;
        if (connection) connection.disconnect();
        
        break;
        
	
    // Default command. Can be run with "db!"
    case '':
    case 'd':
    case 'fdrop':
    case 'fortnite':
    case 'drop':
    case 'wwdb': // Where we droppin', boys?

        if (client.guilds.get(guildID).voiceConnection) {
            messageObj.reply("Wait for DropBot to finish talking");
            return;
        }
      
        var dropLocationID = rwc(serverDropLocationsFN[guildID]);            
        var dropChance;

        if (dropLocationID == null) {
            console.error("ERROR: Could not select a drop location.");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        if (DEBUG_COMMAND) console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNamesFN[dropLocationID]);

        if (serverDropLocationsFN[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocationsFN[guildID][dropLocationID]['weight'] / serverDropWeightsFN[guildID] * 100;                
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        message = '\u200BSo, where we droppin\' boys...';

        var dropLocation = dropLocationNamesFN[dropLocationID];
        var dropLocationMessage = "```" + dropLocation + " (" + dropChance + "% chance) - Fortnite```" + "\nUse \"db!settings\" to see locations and chances.";
        
    	if (serverAudioMute[guildID]) {           

	    if (messageObj.member.voiceChannel) {
    		dropLocationMessage += "\n```User is in a voice channel while DropBot is muted. Use \"db!unmute\" to play audio.```";
	    }

            setTimeout(function() {
		client.channels.get(channelID).send(dropLocationMessage);
            }, 500);

    	} else {

	    //fixme - SPS. Move the full path prefix to a config file.
	    var introFile = '/home/ec2-user/sfx_droplocations/' + dropIntros[Math.floor(Math.random()*dropIntros.length)];
	    if (!fs.existsSync(introFile)) {
		console.error("Couldn't find introFile: " + introFile);
		return 1;
	    }
	    
            var sfxFile = '/home/ec2-user/sfx_droplocations/' + dropLocation.split(' ').join('_').toLowerCase() + '.wav';
            if (!fs.existsSync(sfxFile)) {
    		message = '\u200BOops... Tried to drop ' + dropLocation + ' but our audio file doesn\'t exist.';
    		break;
            }


	    if (messageObj.member.voiceChannel) {

                // Check permissions to join voice channel and play audio.
                // Send message on text channel to author if not.
                // https://discordapp.com/developers/docs/topics/permissions
                if (! (messageObj.member.voiceChannel.permissionsFor(messageObj.guild.me).has("CONNECT", true) &&
                       messageObj.member.voiceChannel.permissionsFor(messageObj.guild.me).has("SPEAK", true))) {

                    console.log("Voice channel permissions error for: " + guildID);
                    
                    messageObj.reply("This channel does not have the necessary permissions for DropBot to speak on voice channel.\n" +
                                     "DropBot needs voice channel permissions for CONNECT and SPEAK.\n" +
                                     "Please change permissions or disable voice with \"db!mute\"");
                    return;
                }
                
		messageObj.member.voiceChannel.join()
		    .then(connection => { // Connection is an instance of VoiceConnection

			if (DEBUG_COMMAND) console.log('Talking on channel : ' + messageObj.member.voiceChannel.name + " [" + messageObj.member.voiceChannel.id + "]");

                        var dispatcher = connection.playStream(fs.createReadStream(introFile));

                        dispatcher.on('end', () => {

                            setTimeout(function() {
                                client.channels.get(channelID).send(dropLocationMessage);
                            }, 1000);
                            
                            var dispatcher2 = connection.playStream(fs.createReadStream(sfxFile));

                            connection.playStream(fs.createReadStream(sfxFile)).on('end', () => {
                                    connection.disconnect();
                                    messageObj.member.voiceChannel.leave();
                            });

                            dispatcher2.on("error", e => {
			        console.error("ERROR playFile location: " + e)
			    });

                        });

                        dispatcher.on("error", e => {
			    console.error("ERROR playFile intro: " + e)
			});
			
		    })	    
		    .catch(console.log);
	    } else {
                setTimeout(function() {
		    messageObj.reply('To announce location, join a voice channel to get audio or mute DropBot using \"db!mute\" to remove this message.');
                }, 500);

	    }

    	} // !(serverAudioMute)
	
        break;

    case 'a':
    case 'adrop':
    case 'apex':
    case 'adrop':

        var dropLocationID = rwc(serverDropLocationsAL[guildID]);
        var dropChance;

        if (dropLocationID == null) {
            console.error("ERROR: Could not select a drop location.");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        if (DEBUG_COMMAND) console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNamesAL[dropLocationID]);

        if (serverDropLocationsAL[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocationsAL[guildID][dropLocationID]['weight'] / serverDropWeightsAL[guildID] * 100;                
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
            message = "\u200BERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            break;
        }

        message = '\u200BSo, where we droppin\' boys...';

        var dropLocation = dropLocationNamesAL[dropLocationID];
        var dropLocationMessage = "```" + dropLocation + " (" + dropChance + "% chance) - Apex Legends```" + "\nUse \"db!settings\" to see locations and chances.";
        
    	if (serverAudioMute[guildID]) {           

	    if (messageObj.member.voiceChannel) {
    		dropLocationMessage += "\n```User is in a voice channel while DropBot is muted. Use \"db!unmute\" to play audio.```";
	    }

            setTimeout(function() {
		client.channels.get(channelID).send(dropLocationMessage);
            }, 500);

    	} else {

	    //fixme - SPS. Move the full path prefix to a config file.
	    var introFile = '/home/ec2-user/sfx_droplocations/' + dropIntros[Math.floor(Math.random()*dropIntros.length)];
	    if (!fs.existsSync(introFile)) {
		console.error("Couldn't find introFile: " + introFile);
		return 1;
	    }
	    
            var sfxFile = '/home/ec2-user/sfx_droplocations_al/' + dropLocation.split(' ').join('_').toLowerCase() + '.wav';
            if (!fs.existsSync(sfxFile)) {
    		message = '\u200BOops... Tried to drop ' + dropLocation + ' but our audio file doesn\'t exist.';
    		break;
            }


	    if (messageObj.member.voiceChannel) {

                // Check permissions to join voice channel and play audio.
                // Send message on text channel to author if not.
                // https://discordapp.com/developers/docs/topics/permissions
                if (! (messageObj.member.voiceChannel.permissionsFor(messageObj.guild.me).has("CONNECT", true) &&
                       messageObj.member.voiceChannel.permissionsFor(messageObj.guild.me).has("SPEAK", true))) {

                    console.log("Voice channel permissions error for: " + guildID);
                    
                    messageObj.reply("This channel does not have the necessary permissions for DropBot to speak on voice channel.\n" +
                                     "DropBot needs voice channel permissions for CONNECT and SPEAK.\n" +
                                     "Please change permissions or disable voice with \"db!mute\"");
                    return;
                }
                
		messageObj.member.voiceChannel.join()
		    .then(connection => { // Connection is an instance of VoiceConnection

			if (DEBUG_COMMAND) console.log('Talking on channel : ' + messageObj.member.voiceChannel.name + " [" + messageObj.member.voiceChannel.id + "]");

                        const dispatcher = connection.playStream(fs.createReadStream(introFile));

                        dispatcher.on('end', () => {

                            setTimeout(function() {
                                client.channels.get(channelID).send(dropLocationMessage);
                            }, 800);                           

                            const dispatcher2 = connection.playStream(fs.createReadStream(sfxFile));

                            dispatcher2.on('end', () => {
                                    connection.disconnect();
                                    messageObj.member.voiceChannel.leave();
                            });

                            dispatcher2.on("error", e => {
			        console.error("ERROR playFile location: " + e)
			    });

                        });

                        dispatcher.on("error", e => {
			    console.error("ERROR playFile intro: " + e)
			});
			
		    })	    
		    .catch(console.log);
	    } else {
                setTimeout(function() {
		    messageObj.reply('To announce location, join a voice channel to get audio or mute DropBot using \"db!mute\" to remove this message.');
                }, 500);

	    }

    	} // !(serverAudioMute)
	
        break;
        
    } // switch (cmd)

    if (message != "" && message != "\u200B") {
	client.channels.get(channelID).send(message);
    }

    // Check voter status after each successful command.
    // We default users to voters at bot/user initialization and demote from there.
    // Will be checked again prior to sending a message,
    //   if they have a non-voter restriction and send a command under the time limit.
    if (VOTE_SYSTEM_ENABLED) {
        dbl.hasVoted(userID).then(voted => {
            
            if (dropUserIsVoter[userID] != voted) {
                if (DEBUG_VOTE) console.log("***** VOTE after handleCommand changed to " + voted + " for userID " + userID);

                dropUserIsVoter[userID] = voted;
                if (voted) {
                    dropUserWarned[userID]  = false;
                    sendMessage = "\u200B<@!" + userID + ">, thanks for voting! Restriction lessened to " + VOTE_USER_TIMEOUT_SEC + " second(s).\n";
                    client.channels.get(channelID).send(dropLocationMessage);    
                }
            } else {
                console.log("Vote after handleCommand: " + userID + " status unchanged. isVoter:" + voted);
            }
	    
        }).catch((err) => {
            console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
            return 3;
        });
    }

    return 1;


}



// Create an event listener for messages
client.on('message', message => {

    var userID   = message.author.id;
    var user     = message.author.username;
    var userDisc = message.author.discriminator;

    var channelID = message.channel.id;
    var channelName = message.channel.name;

    var dateTime  = message.createdAt;
    var epochTime = message.createdTimestamp;    

    var sanitizedMessage = message.content.trim().replace(/ +(?= )/g,'').toLowerCase();
    var args = sanitizedMessage.slice(prefix.length).split(/ +/);
    
    // Exit if it's DropBot.
    if (userID == DROPBOT_ID || userID == DEV_DROPBOT_ID) return 0;

    var isDevUser = (DEVSHANS_ID == userID);
    var maxMessageLength = isDevUser ? 50 : 12;

    //fixme - SPS. Make a counter to see if this continues to happen and report user.    
    // If a user is banned, do not allow them to continue spamming the bot.
    if (dropUserBlocked[userID] && !(isDevUser)) return 0;    

    // Alert the user if they enter "!db" as it is a common mistake.
    if (sanitizedMessage.substring(0,3) == "!db") {
	message.reply("DropBot usage has exclamation point after prefix: \"db!\"");
        return;
    }
    
    // Discord bot best practices ask that unsupported commands fail silently.
    //   Source: https://github.com/meew0/discord-bot-best-practices
    //
    //if (! (sanitizedMessage.startsWith(`${prefix}`)) || message.author.bot) {
    if (! (sanitizedMessage.startsWith(`${prefix}`))) {
        return;
    }

    // WE DO give an error if there is a space before what could be a valid command.
    if (message.content.length > 4 && message.content[3] == " " && message.content[4].match(/[a-z0-9]/i)) {
	message.reply("Do not put a space after \"db!\" and command");
        return;
    }
    
    // Drop commands that are too long.
    // Currently, this is the longest valid user command:
    //    db!set 20 10
    // Drop messages greater than this length but suggest help if the command is "set"
    if (message.content.length > maxMessageLength) {
        if (message.content.substring(3,6) == "set") {
            args = ["error", "Wrong syntax for set command. Please use \"db!set help\" for usage."];
            handleCommand(args, userID, channelID, guildID, message);
        }
        return 3;
    }         
    
    
    if (message.guild) {
	console.log("Message sent from a guild.");
    } else {
	console.log("Message not sent from a guild.");
    }
   
    if (message.channel instanceof Discord.DMChannel) {
	console.log("Message sent from DM channel.");

        if (DEBUG_MESSAGE) {
            console.log("--------- New DMChannel command ---------");
            console.log("  User    : " + userID + " - " + user + "#" + userDisc);
            console.log("  Channel : " + channelID + " - " + channelName);	
            console.log("  Time    : " + dateTime.toISOString());
            console.log("  message : " + message);
            console.log("-----------------------------------------");  
        }

        var sendMessage =  "Hey, <@!" + userID + ">!\n\n";
        sendMessage += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n'; 
        sendMessage += "Author   : <@" + DEVSHANS_ID + ">\n";
        sendMessage += "GitHub   : https://github.com/devshans/DropBot\n";        
        sendMessage += "Bot Link : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
        sendMessage += "Vote     : https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
        sendMessage += 'Discord support server: https://discord.gg/YJWEsvV \n';
                
        message.reply(sendMessage);
        
	return 0;
    }

    var guildID   = message.guild.id;
    var guildName = message.guild.name;
    
    // Main debug code block for application.
    // Logged on every successful message being parsed past the intial sanitation and DM feedback.
    if (DEBUG_MESSAGE) {
        console.log("------------- New command -------------");
        console.log("  User    : " + userID + " - " + user + "#" + userDisc);
        console.log("  Channel : " + channelID + " - " + channelName);	
        console.log("  Guild   : " + guildID + " - " + guildName);	
        console.log("  Time    : " + dateTime.toISOString());
        console.log("  message : " + message.content);
        console.log("---------------------------------------");  
    }

    // Check permissions to send messages in channel.
    // DM author if SEND_MESSAGES is disabled.
    // https://discordapp.com/developers/docs/topics/permissions
    if (! (message.channel.permissionsFor(message.guild.me).has("SEND_MESSAGES", true))) {
        message.author.send("This channel does not have permissions for DropBot to send message");
        return;
    }
    
    var newUser = false;

    // First access from a server since reboot or new server.
    if (serverInitialized[guildID] === undefined || serverInitialized[guildID] == false) {
        if (DEBUG_MESSAGE) console.log("First access from server since at least reboot: ", guildID);

        // Assume that database writes will succeed.
        //   If another user comes in before they are done from the same server, we'll trigger the init twice.
        serverInitialized[guildID] = true; 

        initGuildDatabase(guildName, guildID).then(result => {
            if (DEBUG_MESSAGE) console.log("initGuildDatabase success.");
        }).catch(err => {
            console.error("ERROR initGuildDatabase + " + guildID + ":\n" + err);
            serverInitialized[guildID] = false; 
        }).then(() => {

            if (serverUpdateNotice[guildID]) {
                serverUpdateNotice[guildID] = false;
                updateGuildUpdateNotice(guildID).then(result => {                
                    setTimeout(function() {
		        message.channel.send("<@!" + userID + "> - DropBot has been updated to version 7.0! \n" +
					     "Now supporting Apex Legends.\n\n" +
					     "Use db!help for more info on commands.\n" +
					     "Post on DropBot support server linked in db!help if you have any issues."
					    );
	            }, 5000);
                });
            }
            
            initGuild(guildID).then(result => {
                if (DEBUG_MESSAGE) console.log("initGuild " + guildID + " success.");

                // For the case of using a new server only, we treat the user as new as well.
                //   If the user is banned, the script will already have exited above.
                epochTime = dateTime.getTime();
                dropUserTimeout[userID] = epochTime;
                dropUserStrikes[userID] = 0;
                dropUserStrikes[userID] = 0;
                dropUserBlocked[userID] = false;
                dropUserWarned[userID]  = false;

                if (dropUserInitialized[userID] === undefined || dropUserInitialized[userID] == false) {
                    newUser = true;
		    initUser(user, userID, userDisc, epochTime).then(result => {
                        dropUserInitialized[userID] = true;
		        if (DEBUG_DATABASE) console.log("initUser " + userID + " in initGuild " +
                                                        guildID + ": success");                        
		        //if (DEBUG_DATABASE) console.log(result);
		    }).catch(err3 => {
		        console.error("ERROR initUser " + userID + " in initGuild " +
                                      guildID + ":\n", err3);                        
		    });
                } else {
		    updateUser(userID, epochTime, false).then(result => {
		        if (DEBUG_DATABASE) console.log("updateUser " + userID + " in initGuild " +
                                                        guildID + ": SUCCESS");
		        //if (DEBUG_DATABASE) console.log(result);
		    }).catch(err3 => {
		        console.error("ERROR updateUser " + userID + " in initGuild " +
                                      guildID + ":\n", err3);
		    });                    
                }
                
                // Handle command only once the server has been initialized.
                //   The user will already have been set up above.
                // The script will exit in the return block below.
                //   No additional code in this function will be executed.
                setTimeout(function() {
                    handleCommand(args, userID, channelID, guildID, message);
                }, 500);
            }).catch(err2 => {
                console.error("ERROR initGuild + " + guildID + ":\n", err2);
            });    
        });

        // Do not execute any more code in this function.
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
        dropUserTimeout[userID] = epochTime - 1000;
        dropUserStrikes[userID] = 0;
        dropUserStrikes[userID] = 0;
        dropUserBlocked[userID] = false;
        dropUserWarned[userID]  = false;

        newUser = true;
        
	initUser(user, userID, userDisc, epochTime).then(result => {
	    if (DEBUG_DATABASE) console.log("initUser " + user + "[" + userID + "]success from on.message");
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

    if (VOTE_SYSTEM_ENABLED) {
        if (args[0] == 'vote') {
            handleCommand(args, userID, channelID, guildID);
            return 0;
        }
    } else {
        dropUserIsVoter[userID] = true;
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

    // No need to update access time for new user. That will be done on initialization
    if (newUser) {
        setTimeout(function() {            
            handleCommand(args, userID, channelID, guildID, message);
        }, 100);
    } else {
        updateUser(userID, epochTime, false).then(result => {
            setTimeout(function() {                
                handleCommand(args, userID, channelID, guildID, message);
            }, 100);
        }).catch((err) => {
            console.error("ERROR updateUser bot.on(message): ", err);
        });
    }    

});
