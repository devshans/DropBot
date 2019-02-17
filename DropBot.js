/*
    @document   : DropBot.js
    @author     : devshans
    @version    : 8.5.0
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

// Discord ID of this bot to identify ourselves.
const DROPBOT_ID      = "487298106849886224";
const DEV_DROPBOT_ID  = "533851604651081728";

const DROPBOT_SERVER_ID = "534217612805275658"; // Official DropBot Server
const DROPBOT_TEST_CHANNEL_ID1 = "535268088569135116"; // dropbot-test-1
const DROPBOT_TEST_CHANNEL_ID2 = "535268112833052672"; // dropbot-test-2

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
var serverDefaultGame     = {}; 
var serverAudioMute       = {};
var serverUpdateNotice    = {};
var serverActiveVoice     = {}; // Servers that DropBot is actively speaking on.

var dropIntros = [
     'intro.wav'
    ,'intro2.wav'
    ,'intro3.wav'
];


const client = new Discord.Client();

const { prefix, token, donateURL, webhookAuth } = require('./config.json');

var filenameArray = __filename.split("/");

var developerMode = filenameArray[filenameArray.length-1] == "DropBot-dev.js" ? true : false;

// DynamoDB Table Names
const dbTableLocationsFN = "DropLocations";
const dbTableLocationsAL = "DropLocationsAL";

if (developerMode) {
    var dbAWS = require('./db-dev.js');
    var dbTableGuilds    = "dev_DropGuilds";
    var dbTableUsers     = "dev_DropUsers";
} else {
    var dbAWS = require('./db.js');
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

var defaultWeightsFN = [];
initDefaultWeightsFN().then((result) => console.log("Retrieved default weights for Fortnite."));

var defaultWeightsAL = [];
initDefaultWeightsAL().then((result) => console.log("Retrieved default weights for Apex Legends."));

const DBL = require("dblapi.js");
var dbl;

// Set up DBL even in developerMode to use the real DropBot auth.token to check stats.
//   Do not set a client, webhooks, or update serverCount.
if (developerMode) {

    dbl = new DBL(auth.dblToken);

} else {

    // Express server for webhooks
    const express = require('express');
    const http = require('http');

    const app = express();
    const server = http.createServer(app);

    // DiscordBotList API

    dbl = new DBL(auth.dblToken, { webhookAuth: webhookAuth, webhookServer: server, webhookPort: 3000 });

    dbl.webhook.on('ready', hook => {
        console.log(`Webhook running at http://${hook.hostname}:${hook.port}${hook.path}`);
    });

    dbl.webhook.on('vote', vote => {
        //console.log(`User with ID ${vote.user} just voted!`);
        client.fetchUser(vote.user).then(user => {
            console.log("User " + user.username + ` [${vote.user}] just voted!`);
        });
    });

    
    //DBL webhooks
    app.post('/dblwebhook', async (req, res) => {

        console.log("/dblwebhook post retrieved");
        console.log(req.headers);
        console.log(req.statusCode);
        
        if(req.headers.authorization) {
            //if(req.headers.authorization === config.webhook_secret) {
            if(req.headers.authorization === "ohheysteve") {
                await thingToDo();
                res.send({status: 200});
            }
            else {
                res.send({status: 401, error: 'The auth received does not match the one in your config file.'})
            }
        } 
        else {
            res.send({status: 403, error: 'There was no auth header in the webhook'})
        }
    });

    app.get('/dblwebhook', async (req, res) => {

        console.log("/dblwebhook get retrieved");
        console.log(req.headers);
        console.log(req.statusCode);

        
        if(req.headers.authorization) {
            //if(req.headers.authorization === config.webhook_secret) {
            if(req.headers.authorization === "ohheysteve") {
                await thingToDo();
                res.send({status: 200});
            }
            else {
                res.send({status: 401, error: 'The auth received does not match the one in your config file.'})
            }
        } 
        else {
            res.send({status: 403, error: 'There was no auth header in the webhook'})
        }
    });

    server.listen(3000, () => {
        console.log('Listening');
    });

}

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

client.on('error', error => {
    console.log("ERROR CLIENT " + error);

    for (var v in client.voiceConnections) {
        console.log("v: " + v);
        console.log(client.voiceConnections.get(v));
        client.voiceConnections.get(v).disconnect();
    }
    
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
            UpdateExpression: "set dropLocations = :dfn, dropLocationsAL = :dal, defaultGame = :dg, audioMute = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":dfn":dbStringFN,
		":dal":dbStringAL,
                ":dg":serverDefaultGame[guildID],
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

async function updateGuildDefaultGame(guildID) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildDefaultGame for server: ", guildID, " to ", serverDefaultGame[guildID]);

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":guildID
            },
            UpdateExpression: "set defaultGame = :dg, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":dg":serverDefaultGame[guildID],
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	dbAWS.databaseUpdate(params).then(function(result) {
            console.log("Successfully updated entry.");
            resolve(result);
        }, function(err) {
            console.error("ERROR updateGuildDefaultGame: Failed to update database entry.\n" + err);
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
        serverDefaultGame[guildID]     = "fortnite";
	serverAudioMute[guildID]       = false;
        serverActiveVoice[guildID]     = false;

        dbAWS.readGuild(guildID).then(result => {

            if (result.Item === undefined || result.Item == null) {
                console.error("ERROR initGuild " + guildID + ":\nresult.Item is null.");
                reject ("result.Item is null");
            }
	    
            var myDropLocationsFN = result.Item.dropLocations;
	    var myDropLocationsAL = result.Item.dropLocationsAL;

            serverDefaultGame[guildID] = result.Item.defaultGame;            
	    serverAudioMute[guildID]   = result.Item.audioMute;

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

async function playDropLocation(isFortnite, message, guildMember) {

    let guildID = message.guild.id;
    const dropLocationID = isFortnite ? rwc(serverDropLocationsFN[guildID]) : rwc(serverDropLocationsAL[guildID]);

    if (dropLocationID == null) {
        console.error("ERROR: Could not select a drop location.");
        messageContent = "ERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
        sendMessage(messageContent, message.channel);        
        return;
    }

    const dropLocation   = isFortnite ? dropLocationNamesFN[dropLocationID] : dropLocationNamesAL[dropLocationID];
    const gameName       = isFortnite ? "Fortnite" : "Apex Legends";
    
    let dropChance;
    let messageContent = "";
    
    if (client.voiceConnections.get(message.guild.id)) {
        message.reply("Wait for DropBot to finish talking");
        return;
    }   

    if (DEBUG_COMMAND) {
        if (isFortnite) console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNamesFN[dropLocationID]);
        else            console.log("Dropping at dropLocationId: " + dropLocationID + " - " + dropLocationNamesAL[dropLocationID]);
    }

    if (isFortnite) {
        if (serverDropLocationsFN[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocationsFN[guildID][dropLocationID]['weight'] / serverDropWeightsFN[guildID] * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
            messageContent = "ERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            sendMessage(messageContent, message.channel);
            return;
        }
    } else {
        if (serverDropLocationsAL[guildID][dropLocationID]['weight']) {
            dropChance = serverDropLocationsAL[guildID][dropLocationID]['weight'] / serverDropWeightsAL[guildID] * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
            messageContent = "ERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            sendMessage(messageContent, message.channel);
            return;
        }
    }

    messageContent = 'So, where we droppin\' boys...';
    sendMessage(messageContent, message.channel);
    
    let dropLocationMessage = "```" + dropLocation + " (" + dropChance + "% chance) - " + gameName + "```" + "\nUse \"db!settings\" to see locations and chances.";

    messageContent = "";
    
    if (serverAudioMute[guildID]) {           

        if (guildMember.voiceChannel) {
    	    dropLocationMessage += "\n```User is in a voice channel while DropBot is muted. Use \"db!unmute\" to play audio.```";
        }

        sendMessage(dropLocationMessage, message.channel, {delay: 500});

    } else {

        //fixme - SPS. Move the full path prefix to a config file.
        const introFile = '/home/ec2-user/sfx_droplocations/' + dropIntros[Math.floor(Math.random()*dropIntros.length)];
        if (!fs.existsSync(introFile)) {
            console.error("Couldn't find introFile: " + introFile);
            return 1;
        }
	
        const sfxFile = isFortnite ?
              '/home/ec2-user/sfx_droplocations/'    + dropLocation.split(' ').join('_').toLowerCase() + '.wav' :
              '/home/ec2-user/sfx_droplocations_al/' + dropLocation.split(' ').join('_').toLowerCase() + '.wav';              
        
        if (!fs.existsSync(sfxFile)) {
    	    messageContent = 'Oops... Tried to drop ' + dropLocation + ' but our audio file doesn\'t exist.';
            sendMessage(messageContent, message.channel);
            return;
        }


        if (guildMember.voiceChannel) {

            // Check permissions to join voice channel and play audio.
            // Send message on text channel to author if not.
            // https://discordapp.com/developers/docs/topics/permissions
            if (! (guildMember.voiceChannel.permissionsFor(message.guild.me).has("CONNECT", true) &&
                   guildMember.voiceChannel.permissionsFor(message.guild.me).has("SPEAK", true))) {

                console.log("Voice channel permissions error for: " + guildID);
                
                message.reply("This channel does not have the necessary permissions for DropBot to speak on voice channel.\n" +
                              "DropBot needs voice channel permissions for CONNECT and SPEAK.\n" +
                              "Please change permissions or disable voice with \"db!mute\"");
                return;
            }
            
            guildMember.voiceChannel.join().then(connection => { // Connection is an instance of VoiceConnection       	

        	if (DEBUG_COMMAND) console.log('Talking on channel : ' + guildMember.voiceChannel.name + " [" + guildMember.voiceChannel.id + "]");

                connection.on("error", e => {
                    console.log("WARNING connection playFile intro: " + e);
                    connection.disconnect();
		    connection.channel.leave();
                    return;
        	});	

		// playStream() is less efficient than using playFile() but it will cut off the end of the audio.
                const dispatcher = connection.playStream(fs.createReadStream(introFile));

                dispatcher.on('end', () => {

                    connection.on("error", e => {
                        console.log("WARNING connection 2 playFile intro: " + e);
                        connection.disconnect();
		        connection.channel.leave();
                        return;
        	    });	
                    
                    sendMessage(dropLocationMessage, message.channel, {delay: 1000});

		    const dispatcher2 = connection.playStream(fs.createReadStream(sfxFile));

                    dispatcher2.on('end', () => {
                        connection.disconnect();
		        connection.channel.leave();
                    });

                    dispatcher2.on("error", e => {
        	        console.log("WARNING dispatcher2 playFile location: " + e);
                        connection.disconnect();
		        connection.channel.leave();
                        return;
        	    });

                });

                dispatcher.on("error", e => {
                    console.log("WARNING dispatcher playFile intro: " + e);
                    connection.disconnect();
		    connection.channel.leave();        	    
        	});
                	
            }).catch(console.log);
        	
        } else {

            // Send message anyway but alert user of usage.
            sendMessage(dropLocationMessage, message.channel, {delay: 500});
            
            setTimeout(function() {
        	message.reply('To announce location, join a voice channel to get audio or mute DropBot using \"db!mute\" to remove this message.');
            }, 500);

        }

    } // !(serverAudioMute)

    return 0 ;
}



async function handleCommand(args, message) {

    var userID    = message.author.id;
    var channelID = message.channel.id;
    var guildID   = message.guild.id;
    
    var isDevUser = (DEVSHANS_ID == userID);

    var cmd = args[0];
    var messageContent = "";

    let isFortniteCommand = true;

    if (DEBUG_COMMAND) console.log("handleCommand: user=" + userID + " - " +  args);

    args = args.splice(1);

    // Commands restricted to developer user.
    // --------------------------------------
    if (isDevUser) {

        console.log("Running command from dev user: " + userID);
        
        switch(cmd) {
	    
        case 'numservers':
	    messageContent = "Number of active servers: " + client.guilds.size;
            console.log(messageContent);
	    sendMessage(messageContent, message.channel);
            break;

            // Toggle debug messages on/off.
        case 'debugmessage':
            DEBUG_MESSAGE = !DEBUG_MESSAGE;
            messageContent = "Set DEBUG_MESSAGE to " + DEBUG_MESSAGE;
	    sendMessage(messageContent, message.channel);
            break;
        case 'debugcommand':
            DEBUG_COMMAND = !DEBUG_COMMAND;
            messageContent = "Set DEBUG_COMMAND to " + DEBUG_COMMAND;
	    sendMessage(messageContent, message.channel);
            break;
        case 'debugdatabase':
            DEBUG_DATABASE = !DEBUG_DATABASE;
            messageContent = "Set DEBUG_DATABASE to " + DEBUG_DATABASE;
	    sendMessage(messageContent, message.channel);
            break;
        case 'debugdbl':
            DEBUG_DBL = !DEBUG_DBL;
            messageContent = "Set DEBUG_DBL to " + DEBUG_DBL;
	    sendMessage(messageContent, message.channel);
            break;
        case 'debugvote':
            DEBUG_VOTE = !DEBUG_VOTE;
            messageContent = "Set DEBUG_VOTE to " + DEBUG_VOTE;
	    sendMessage(messageContent, message.channel);
            break;

        case 'viewdebug':
            messageContent = "Debug flag status:";
            messageContent += "```";
            messageContent += "DEBUG_MESSAGE  : " + DEBUG_MESSAGE  + "\n";
            messageContent += "DEBUG_COMMAND  : " + DEBUG_COMMAND  + "\n";
            messageContent += "DEBUG_DATABASE : " + DEBUG_DATABASE + "\n";
            messageContent += "DEBUG_DBL      : " + DEBUG_DBL      + "\n";
            messageContent += "DEBUG_VOTE     : " + DEBUG_VOTE     + "\n";
            messageContent += "```";
	    sendMessage(messageContent, message.channel);
            break;

        case 'debugon':
            DEBUG_MESSAGE  = true;
            DEBUG_COMMAND  = true;
            DEBUG_DATABASE = true;
            DEBUG_DBL      = true;
            DEBUG_VOTE     = true;
            messageContent = "Set all debug flags to TRUE.";
	    sendMessage(messageContent, message.channel);
            break;

        case 'debugoff':
            DEBUG_MESSAGE  = false;
            DEBUG_COMMAND  = false;
            DEBUG_DATABASE = false;
            DEBUG_DBL      = false;
            DEBUG_VOTE     = false;
            messageContent = "Set all debug flags to FALSE.";
	    sendMessage(messageContent, message.channel);
            break;

        case 'strikesystem':            
            STRIKE_SYSTEM_ENABLED = !STRIKE_SYSTEM_ENABLED;
            messageContent = "Set STRIKE_SYSTEM_ENABLED to " + STRIKE_SYSTEM_ENABLED;
	    sendMessage(messageContent, message.channel);
            break;

        case 'votesystem':            
            VOTE_SYSTEM_ENABLED = !VOTE_SYSTEM_ENABLED;
            messageContent = "Set VOTE_SYSTEM_ENABLED to " + VOTE_SYSTEM_ENABLED;
	    sendMessage(messageContent, message.channel);
            break;           
            
        case 'resetban':
            if (args.length < 1) {
                messageContent = "Please specify user ID to unban.";
		sendMessage(messageContent, message.channel);
                break;
            }
            var otherUserID = args[0]; 
            messageContent = "Resetting ban for user ID: " + otherUserID;
	    sendMessage(messageContent, message.channel);
	    
            updateUser(otherUserID, (new Date).getTime(), false).then(result => {

                dropUserBlocked[otherUserID] = false;
		messageContent = "Ban cleared successfully.";
		sendMessage(messageContent, message.channel, {delay: 200});
                
            }).catch((e) => {
                console.error("ERROR resetban: " + e);
		messageContent = "ERROR: " + e;
		sendMessage(messageContent, message.channel, {delay: 200});
            });
            break;
            
        case 'resetallbans':
            messageContent = "Resetting bans for all users...";
	    sendMessage(messageContent, message.channel);

            resetAllUserBans();

	    messageContent = "Done.";
	    sendMessage(messageContent, message.channel, {delay: 200});

	    break;

	case 'dumpuser':
	    if (args.length < 1) {
                messageContent = "Please specify user ID to check for voting.";
		sendMessage(messageContent, message.channel);
                break;
	    }
	    var otherUserID = args[0];

	    messageContent = "```";
	    messageContent += "--- Current state of user in DropBot ---\n";
	    messageContent += "  dropUserID      - " + dropUserInitialized[otherUserID] + "\n";
	    messageContent += "  dropUserTimeout - " + dropUserTimeout[otherUserID] + "\n";
	    messageContent += "  dropUserStrikes - " + dropUserStrikes[otherUserID] + "\n";
	    messageContent += "  dropUserBlocked - " + dropUserBlocked[otherUserID] + "\n";
	    messageContent += "  dropUserIsVoter - " + dropUserIsVoter[otherUserID] + "\n";
    	    messageContent += "  dropUserWarned  - " + dropUserWarned[otherUserID]  + "\n";
	    messageContent += "```";
	    sendMessage(messageContent, message.channel);
	    
	    break;

	case 'resetvoice':

            for (var entry of client.voiceConnections.entries()) {
                var key   = entry[0];
                var value = entry[1]; // VoiceConnection

                value.on("error", e => {
                    console.log("ERROR dev reset voice connection: " + e);
                    return;
        	});	
                
                value.disconnect();
                value.channel.leave();
            }

            break;

        case 'getvoters':
            //  'username', 'discriminator', 'id', 'avatar'
	    messageContent = "Voters sent to log file.";
	    sendMessage(messageContent, message.channel);
            dbl.getVotes().then(votes => {
                for (var v in votes) {
                    var voter = votes[v];
                    console.log("Voter: " + voter.username + "#" + voter.discriminator + " [" + voter.id + "]");
                }
            });
            break;

        case 'getstats':
	    dbl.getStats(DROPBOT_ID).then(stats => {
		var shards = stats.shards ? 1 : stats.shards;
		messageContent = `\`\`\`Servers - ${stats.server_count}\nShards  - ${shards}\nUsers   - ${usersTotalCount}\`\`\``;
		sendMessage(messageContent, message.channel);
	    });
            break;

        case 'members':

	    if (args.length < 1) {
                messageContent = "Please specify user ID to check for voting.";
		sendMessage(messageContent, message.channel);
                break;
	    }

            for (var entry of client.guilds.get(args[0]).members.entries()) {
                var key   = entry[0],
                    value = entry[1];
                console.log("Member: " + value.user.id + " " + key + " - " + value.user.username + "#" + value.user.discriminator);
            }

            break;

        case 'members2':
            
	    if (args.length < 1) {
                messageContent = "Please specify user ID to check for voting.";
		sendMessage(messageContent, message.channel);
                break;
	    }

            client.guilds.get(args[0]).fetchMembers().then(r => {
                r.members.array().forEach(r => {
                    let username = `${r.user.username}#${r.user.discriminator}`;
                    console.log(`${username} [${r.user.id}]`);
                });
            });

            
            break;
            
	case 'isvoter':

	    if (args.length < 1) {
                messageContent = "Please specify user ID to check for voting.";
		sendMessage(messageContent, message.channel);
                break;
	    }
	    var otherUserID = args[0];

	    messageContent = "Checking user ID + " + otherUserID + " for voting status...";
	    sendMessage(messageContent, message.channel);
	    
	    dbl.hasVoted(otherUserID).then(voted => {
                var messageContent = "";
                if (! (voted)) {
		    messageContent  = userID + " has NOT been verified to use DropBot in the last 24 hours.\n";
		    messageContent += "Strike " + dropUserStrikes[userID] + "/" + USER_MAX_STRIKES;
		    console.log(messageContent);                
                } else {
		    messageContent  = userID + " HAS voted to use DropBot in the last 24 hours.\n";
		    console.log(messageContent);
                }

		sendMessage(messageContent, message.channel, {delay: 200});
                
	    }).catch((err) => {
                var messageContent = "Oops... DropBot could not access dbl.hasVoted database for userID: " + userID + "\n" +  err;
                console.log(messageContent);
		sendMessage(messageContent, message.channel, {delay: 200});
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
        messageContent =  'DropBot Help\n';
        messageContent += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n'; 
        messageContent += "Built using node.js and discord.io.\n";
        messageContent += '```';
        messageContent += "Author   : devshans\n";
        messageContent += "GitHub   : https://github.com/devshans/DropBot\n";        
        messageContent += "Bot Link : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
        messageContent += "Vote     : https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
        messageContent += 'Discord support server: https://discord.gg/YJWEsvV \n\n';
        messageContent += 'usage: db![option]\n\n';
        messageContent += 'db![option]            Description\n';
        messageContent += '----------------------------------\n';
        messageContent += 'db!drop  /  db!       : Uses the default game location for randomly choosing a drop location. Change with "db!default"\n';
        messageContent += 'db!default [game]     : Sets the default game for "db!drop" and "db!" commands. Legal options are "apex" and "fortnite".\n';
        messageContent += 'db!fortnite           : Randomly choose a Fortnite location to drop based on server settings.\n';
        messageContent += 'db!apex               : Randomly choose an Apex Legends location to drop based on server settings.\n';
        messageContent += 'db!mute               : Mutes DropBot audio in voice channel.\n';
        messageContent += 'db!unmute             : Unmutes DropBot audio. Requires user to be in a voice channel.\n';
	messageContent += 'db!settings           : Shows all DropBot settings on this server.\n';
	messageContent += 'db!reset              : Resets all DropBot settings to their defaults on this server.\n';
        messageContent += 'db!info               : Shows DropBot information and links/commands for additional help.\n';
        messageContent += 'db!stop               : Stop playing audio and remove DropBot from voice channel.\n';
	messageContent += 'db!help               : Show this help message again.\n';
        messageContent += 'db!donate             : Get link to donate to help support bot development and hosting fees.\n';
	messageContent += 'db!vote               : Check and update vote status for bot within the last 24 hours without rate limit penalty.\n';
        messageContent += 'db!set  [id] [weight] : Change the percentage chance of choosing each Fortnite location. Use "db!set help" for more info.\n';
        messageContent += 'db!aset [id] [weight] : Change the percentage chance of choosing each Apex Legends location. Use "db!set help" for more info.\n';
        messageContent += '----------------------------------\n';
        messageContent += '```';
	sendMessage(messageContent, message.channel);
        break;

    case 'd':
    case 'donate':
        message.reply("Donate to DropBot development from the link below!");
        message.channel.send(donateURL);
        break;
        
    // Only intended to be used by private error handling
    case 'error':

        if (args.length < 1) {
            messageContent = "\u200BUnhandled error.";
	    sendMessage(messageContent, message.channel);
            break;
        }

	messageContent = args[0];
	
	sendMessage(messageContent, message.channel);
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
                        messageContent  = "\u200B<@!" + userID + ">, you are not shown as having voted in the last 24 hours.\n";
                        messageContent += "If you just voted, wait about a minute or 2 for it to process.\n";
                        messageContent += "You can run \"db!vote\" again without restriction to check vote status.\n";
                    } else {
                        dropUserWarned[userID] = true;
                        messageContent  = "\u200B<@!" + userID + "> has NOT yet voted in the last 24 hours.\n";
                        messageContent += "If you just voted, wait about a minute or 2 for it to process.\n";
                        messageContent += "You are rate limited to using one command every " + NO_VOTE_USER_TIMEOUT_SEC + " seconds.\n";
    		        messageContent += "To lessen restriction to " + VOTE_USER_TIMEOUT_SEC + " second(s), simply verify user by voting for DropBot at: https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
                        messageContent += "You may check if your vote has been processed immediately and without penalty with \"db!vote\"";
                    }
                    args = ["error", messageContent];
                    handleCommand(args, message);
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
                        messageContent  = "\u200B<@!" + userID + ">, you are shown as voting within the last 24 hours! Restriction lessened to " + VOTE_USER_TIMEOUT_SEC + " second(s).\n";;
                        args = ["error", messageContent];
                        handleCommand(args, message);
                    }).catch((err) => {
                        console.error("ERROR vote command update: " + err);
                    });
                    
    		    return 0;
    	        }
            }).catch((err) => {

                var messageContent = "\u200BOops... <@!" + userID + ">, DropBot could not access Discord Bot List's vote database.\nPlease try again later.\n";

		sendMessage(messageContent, message.channel);
                
                return 3;
            });
        } else {
            messageContent = "\u200BVote system temporarily disabled.\n" +
                "Rate limiting set to minimum of " + VOTE_USER_TIMEOUT_SEC + " second(s).";
            messageContent += "Voting link : https://discordbots.org/bot/" + DROPBOT_ID + "/vote \n";
	    sendMessage(messageContent, message.channel);
        }
        
        break;

    case 'm':
    case 'mute':

    	if (serverAudioMute[guildID]) {
            messageContent = "\u200BDropBot is already muted.";
	    message.reply(messageContent);
    	    break;
    	} else {
            serverAudioMute[guildID] = true;
    	}       
        
        updateGuildAudioMute(guildID).then(result => {
            messageContent = "\u200BMuted DropBot. Will no longer speak in voice channels.";
	    message.reply(messageContent);
            console.log(`Successfully updated audioMute for ${message.guild.name}[guildID]`);
        }).catch((e) => {
            console.error("ERROR updateGuildAudioMute " + guildID + ":\n" + e);
        });
    	break;

    case 'u':        
    case 'unmute':

    	if (serverAudioMute[guildID]) {
            serverAudioMute[guildID] = false;
    	} else {
            messageContent = "\u200BDropBot is not muted.";
	    message.reply(messageContent);
    	    break;
    	}

        updateGuildAudioMute(guildID).then(result => {
            messageContent = "\u200BAllowing DropBot to speak in voice channels again.";
            message.reply(messageContent);
            console.log(`Successfully updated audioMute for ${message.guild.name}[guildID]`);
        }).catch((e) => {
            console.error("ERROR updateGuildAudioMute " + guildID + ":\n" + e);
        });
    	break;

    case 'default':
        if (args.length < 1) {
            messageContent = "Please specify game to set as default. (e.g. \"apex\" or \"fortnite\"";
	    sendMessage(messageContent, message.channel);
            break;
        }
        let newDefaultGame = args[0].toLowerCase();
        if (newDefaultGame == "fortnite" || newDefaultGame == "fn" ||
            newDefaultGame == "fort"     || newDefaultGame == "fortnight" ||
            newDefaultGame == "f") {
            newDefaultGame = "fortnite";            
        } else if (newDefaultGame == "apex" || newDefaultGame == "legends" ||
                   newDefaultGame == "a"    || newDefaultGame == "") {
            newDefaultGame = "apex";
        } else {
            messageContent = "Illegal game option. Please choose either \"apex\" or \"fortnite\"";
            sendMessage(messageContent, message.channel);
            return;
        }

        serverDefaultGame[guildID] = newDefaultGame;

        updateGuildDefaultGame(guildID).then(result => {
            let newDefaultGameString = newDefaultGame == "fortnite" ? "Fortnite" : "Apex Legends";
            messageContent = "\u200BChanged default game to " + newDefaultGameString;
            message.reply(messageContent);
            console.log(`Successfully updated default game for ${message.guild.name}[guildID]`);
        }).catch((e) => {
            console.error("ERROR updateGuildDefaultGame " + guildID + ":\n" + e);
        });

        break;


    case 'fset':        
    case 'set':

        var validChange         = true;
        var setId               = Number(args[0]);
        var setWeight           = Number(args[1]);
        var previousWeight      = -1;
        var previousTotalWeight = serverDropWeightsFN[guildID];
        var nextTotalWeight     = 0;

        messageContent = '';

        if (args.length == 0 || (args.length == 1 && args[0] == "help")) {
    	    messageContent +=  'Help for changing drop location chance\n';
            validChange = false;
            messageContent += '```';
            messageContent += 'db!set [id] [weight]\n';
            messageContent += '```';	    
    	}

        if (validChange && args.length < 2) {
            messageContent = "Please specify the index and weight.";
            validChange = false;            
        }
        
        if (validChange && ! (Number.isInteger(setId)) || ! (Number.isInteger(setWeight))) {
            messageContent += "ERROR: [id] and [weight] arguments must both be numbers.";
            validChange = false;
        }
        
        if (validChange && setId > (NUM_DROP_LOCATIONS-1) || setId < 0) {
            messageContent += "ERROR: [id] must be within the range of 0 to " + (NUM_DROP_LOCATIONS-1);
            validChange = false;
        }
        
        if (validChange && setWeight > MAX_WEIGHT || setWeight < 0) {
            messageContent += "ERROR: [weight] must be within the range of 0 to " + MAX_WEIGHT;
            validChange = false;
        }

        if (validChange && serverDropLocationsFN[guildID][setId]['weight'] == setWeight) {
            messageContent += "ERROR: Weight for " + dropLocationNamesFN[setId] + " is already " + setWeight;
            validChange = false;
        }

        if (validChange) {
            messageContent += "Setting weight for " + dropLocationNamesFN[setId] + " to " + setWeight;
            serverDropLocationsFN[guildID][setId]['weight'] = setWeight;

            previousWeight = Number(serverDropLocationsFN[guildID][setId]['weight']);
            
            nextTotalWeight = 0;
            for (var i=0; i < dropLocationNamesFN.length; i++) {
                nextTotalWeight += Number(serverDropLocationsFN[guildID][i]['weight']);
            }
            
            if (nextTotalWeight < 1) {
                messageContent += "ERROR: All weights must add up to at least 1";
                serverDropLocationsFN[guildID][setId]['weight'] = previousWeight;
                validChange = false;
            }
            
        } else {
            
            for (var i=0; i < dropLocationNamesFN.length; i++) {        
                nextTotalWeight += Number(serverDropLocationsFN[guildID][i]['weight']);
            }

        }

        serverDropWeightsFN[guildID] = nextTotalWeight;

	sendMessage(messageContent, message.channel);

	// Start new message
        messageContent = "```";
        
    	messageContent += "-------------- Fortnite ---------------\n";
        messageContent += "  ID   Location        Weight  % Chance\n";
        messageContent += "  -------------------------------------\n";

        for (var i=0; i < dropLocationNamesFN.length; i++) {
            var dropLocationID     = i;;
            var dropLocationWeight = Number(serverDropLocationsFN[guildID][i]['weight']);
            var dropLocationName   = dropLocationNamesFN[dropLocationID];
            var dropChance         = serverDropLocationsFN[guildID][dropLocationID]['weight'] / serverDropWeightsFN[guildID] * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);

            messageContent += "  ";
            if (dropLocationID < 10) messageContent += " " + dropLocationID;
            else                     messageContent += dropLocationID;

            messageContent += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                messageContent += " ";
            }

            messageContent += " - " + dropLocationWeight + "   ";
            if (dropLocationWeight != 10) messageContent += " ";

            messageContent += " - " + dropChance + "%\n";
            
        }        
        
        messageContent += "  ------------------------------\n";
    	messageContent += "Total weight: " + serverDropWeightsFN[guildID] + "\n";        

        messageContent += "```";	

        if (validChange) {
            updateGuildDropsFN(guildID).then(result => {

		sendMessage(messageContent, message.channel, {delay: 200});

            }).catch((e) => {
                console.error("ERROR updateGuildDropsFN: " + e);
            });
        } else {
	    sendMessage(messageContent, message.channel, {delay: 500});
        }

        break;

    case 'aset':

        var validChange         = true;
        var setId               = Number(args[0]);
        var setWeight           = Number(args[1]);
        var previousWeight      = -1;
        var previousTotalWeight = serverDropWeightsAL[guildID];
        var nextTotalWeight     = 0;

        messageContent = '';

        if (args.length == 0 || (args.length == 1 && args[0] == "help")) {
    	    messageContent +=  'Help for changing drop location chance\n';
            validChange = false;
            messageContent += '```';
            messageContent += 'db!set [id] [weight]\n';
            messageContent += '```';	    
    	}

        if (validChange && args.length < 2) {
            messageContent = "Please specify the index and weight.";
            validChange = false;            
        }
        
        if (validChange && ! (Number.isInteger(setId)) || ! (Number.isInteger(setWeight))) {
            messageContent += "ERROR: [id] and [weight] arguments must both be numbers.";
            validChange = false;
        }
        
        if (validChange && setId > (NUM_DROP_LOCATIONS-1) || setId < 0) {
            messageContent += "ERROR: [id] must be within the range of 0 to " + (NUM_DROP_LOCATIONS-1);
            validChange = false;
        }
        
        if (validChange && setWeight > MAX_WEIGHT || setWeight < 0) {
            messageContent += "ERROR: [weight] must be within the range of 0 to " + MAX_WEIGHT;
            validChange = false;
        }

        if (validChange && serverDropLocationsAL[guildID][setId]['weight'] == setWeight) {
            messageContent += "ERROR: Weight for " + dropLocationNamesAL[setId] + " is already " + setWeight;
            validChange = false;
        }        

        if (validChange) {
            messageContent += "Setting weight for " + dropLocationNamesAL[setId] + " to " + setWeight;
            serverDropLocationsAL[guildID][setId]['weight'] = setWeight;

            previousWeight = Number(serverDropLocationsAL[guildID][setId]['weight']);
            
            nextTotalWeight = 0;
            for (var i=0; i < dropLocationNamesAL.length; i++) {
                nextTotalWeight += Number(serverDropLocationsAL[guildID][i]['weight']);
            }
            
            if (nextTotalWeight < 1) {
                messageContent += "ERROR: All weights must add up to at least 1";
                serverDropLocationsAL[guildID][setId]['weight'] = previousWeight;
                validChange = false;
            }
            
        } else {
            
            for (var i=0; i < dropLocationNamesAL.length; i++) {        
                nextTotalWeight += Number(serverDropLocationsAL[guildID][i]['weight']);
            }

        }

        serverDropWeightsAL[guildID] = nextTotalWeight;

	sendMessage(messageContent, message.channel);

	// Start new message
        messageContent = "```";

    	messageContent += "------------ Apex Legends -------------\n";
        messageContent += "  ID   Location        Weight  % Chance\n";
        messageContent += "  -------------------------------------\n";            

        for (var i=0; i < dropLocationNamesAL.length; i++) {
            var dropLocationID     = i;;
            var dropLocationWeight = Number(serverDropLocationsAL[guildID][i]['weight']);
            var dropLocationName   = dropLocationNamesAL[dropLocationID];
            var dropChance         = serverDropLocationsAL[guildID][dropLocationID]['weight'] / serverDropWeightsAL[guildID] * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);

            messageContent += "  ";
            if (dropLocationID < 10) messageContent += " " + dropLocationID;
            else                     messageContent += dropLocationID;

            messageContent += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                messageContent += " ";
            }

            messageContent += " - " + dropLocationWeight + "   ";
            if (dropLocationWeight != 10) messageContent += " ";

            messageContent += " - " + dropChance + "%\n";
            
        }        
        
        messageContent += "  ------------------------------\n";
    	messageContent += "Total weight: " + serverDropWeightsAL[guildID] + "\n";        

        messageContent += "```";

        if (validChange) {
            updateGuildDropsAL(guildID).then(result => {

		sendMessage(messageContent, message.channel, {delay: 200});

            }).catch((e) => {
                console.error("ERROR updateGuildDropsAL: " + e);
            });
        } else {
	    sendMessage(messageContent, message.channel, {delay: 500});
        }
        
        break;
        
    case 'i':        
    case 'info':

        messageContent  = "\n";
        messageContent += "DropBot - Randomly select a location to start/drop in for the Fortnite Battle Royale Game.\n";
        messageContent += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n';         
        messageContent += "```";
        messageContent += "Bot usage help : \"db!help\"\n";
        messageContent += "Server settings: \"db!settings\"\n";
        messageContent += "Built using node.js and discord.io.\n";
        messageContent += "Author           : devshans\n";
        messageContent += "Email            : devshans0@gmail.com\n"
        messageContent += "GitHub           : https://github.com/devshans/DropBot\n";
        messageContent += "Bot Link         : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
        messageContent += "Bot Vote Support : https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
        messageContent += "Support Discord  : https://discord.gg/YJWEsvV\n\n";
        messageContent += "```";
	sendMessage(messageContent, message.channel);
        break;

    case 's':
    case 'settings':

        messageContent = "Retrieving info for this server...";
	sendMessage(messageContent, message.channel);	

        dbAWS.readGuild(guildID).then(result => {

            var myDropLocationsFN        = result.Item.dropLocations;
            var myDropLocationsAL        = result.Item.dropLocationsAL;
            serverDefaultGame[guildID]   = result.Item.defaultGame;
	    serverAudioMute[guildID]     = result.Item.audioMute;
	    serverDropWeightsFN[guildID] = 0;
            serverDropWeightsAL[guildID] = 0;

	    // Start new message
            messageContent = "```";

            messageContent += "Discord Server Settings\n";
            messageContent += "---------------------------------\n";
	    messageContent += "Server ID    : " + result.Item.id             + "\n";
	    messageContent += "Server Name  : " + result.Item.name           + "\n";
            messageContent += "Default Game : " + serverDefaultGame[guildID] + "\n";
	    messageContent += "Audio Muted  : " + serverAudioMute[guildID]   + "\n\n";
	    messageContent += "-------------- Fortnite ---------------\n";
            messageContent += "  ID   Location        Weight  % Chance\n";
            messageContent += "  -------------------------------------\n";
            
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

		messageContent += "  ";
                if (dropLocationID < 10) messageContent += " " + dropLocationID;
                else                     messageContent += dropLocationID;

                messageContent += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    messageContent += " ";
                }

                messageContent += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) messageContent += " ";

                messageContent += " - " + dropChance + "%\n";
                
            }

            messageContent += "  ------------------------------------\n";
	    messageContent += "Total weight: " + serverDropWeightsFN[guildID] + "\n\n";

	    messageContent += "------------ Apex Legends -------------\n";
            messageContent += "  ID   Location        Weight  % Chance\n";
            messageContent += "  -------------------------------------\n";            

            if (serverDropWeightsAL[guildID] == null || serverDropWeightsAL[guildID] == 0) {
                serverDropWeightsAL[guildID] = 0; 
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

		messageContent += "  ";
                if (dropLocationID < 10) messageContent += " " + dropLocationID;
                else                     messageContent += dropLocationID;

                messageContent += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    messageContent += " ";
                }

                messageContent += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) messageContent += " ";

                messageContent += " - " + dropChance + "%\n";
                
            }
            
            messageContent += "  ------------------------------------\n";
	    messageContent += "Total weight: " + serverDropWeightsAL[guildID] + "\n\n";
            
            messageContent += "```";

	    sendMessage(messageContent, message.channel, {delay: 500});

        }).catch((e) => {
            console.log("ERROR: settings command. guildID: " + guildID + "\n" + e);
        });

        break;
              
    case 'reset':
        messageContent = "Resetting all values to their defaults...";
	sendMessage(messageContent, message.channel);

        dbAWS.readGuild(guildID).then(result => {

            serverDefaultGame[guildID] = "fortnite";
    	    serverAudioMute[guildID]   = false;

	    // Start new message
            messageContent = "```";

            messageContent += "Discord Server Settings\n";
            messageContent += "---------------------------------\n";
    	    messageContent += "Server ID    : " + result.Item.id             + "\n";
    	    messageContent += "Server Nam e : " + result.Item.name           + "\n";
            messageContent += "Default Game : " + serverDefaultGame[guildID] + "\n";
    	    messageContent += "Audio Muted  : " + serverAudioMute[guildID]   + "\n";
    	    messageContent += "------------- Fortnite ---------------\n";
            messageContent += "  ID   Location       Weight  % Chance\n";
            messageContent += "  ------------------------------------\n";

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

    		messageContent += "  ";
                if (dropLocationID < 10) messageContent += " " + dropLocationID;
                else                     messageContent += dropLocationID;

                messageContent += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    messageContent += " ";
                }

                messageContent += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) messageContent += " ";

                messageContent += " - " + dropChance + "%\n";
                
            }

            messageContent += "  ------------------------------------\n";
    	    messageContent += "Total weight: " + serverDropWeightsFN[guildID] + "\n\n";

    	    messageContent += "----------- Apex Legends -------------\n";
            messageContent += "  ID   Location       Weight  % Chance\n";
            messageContent += "  ------------------------------------\n";
	    
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

    		messageContent += "  ";
                if (dropLocationID < 10) messageContent += " " + dropLocationID;
                else                     messageContent += dropLocationID;

                messageContent += " - " + dropLocationName;
                for (var j = dropLocationName.length; j < 15; j++) {
                    messageContent += " ";
                }

                messageContent += " - " + dropLocationWeight + "   ";
                if (dropLocationWeight != 10) messageContent += " ";

                messageContent += " - " + dropChance + "%\n";
                
            }

            messageContent += "  ------------------------------------\n";
    	    messageContent += "Total weight: " + serverDropWeightsAL[guildID] + "\n";
	    
            messageContent += "```";            

            updateGuildAll(guildID).then(result => {

		sendMessage(messageContent, message.channel, {delay: 500});
                
            }).catch((e) => {
                console.error("ERROR updateGuildDrops: " + e);
            });

            
        }).catch((e) => {
            console.log("ERROR: reset command. guildID: " + guildID + "\n" + e);
        });

        break;

    // Exits active voice channel in this guild.
    case 'stop':

	messageContent = "Okay, leaving any active voice channels in this server now.";
	sendMessage(messageContent, message.channel);

	if (DEBUG_COMMAND) console.log("Asked to leave voice channels in guildID: " + message.guild.name +
				       "[" + message.guild.id + "]" + " by userID " + message.author.id);

        var connection = client.guilds.get(guildID).voiceConnection;
        if (connection) connection.disconnect();
        
        break;
        
	
    // Default command. Can be run with "db!"
    case '':
    case 'd':
    case 'drop':
        if (serverDefaultGame[guildID].toLowerCase() == "apex") isFortniteCommand = false;
        else                                                    isFortniteCommand = true;

        var guildMember = message.member;
        if (guildMember === undefined || guildMember == null || !(guildMember)) {
            console.log("Retrieving guild member with fetchMember: " + message.author.id);
            guildMember = message.guild.fetchMember(message.author).then(member => {
                guildMember = member;
                playDropLocation(isFortniteCommand, message, guildMember);
            }).catch((e) => {
                console.error("ERROR retrieving guild member with fetchMember:\n" + e);
            });            
        } else {
            playDropLocation(isFortniteCommand, message, guildMember);
        }                
	
        break;
        
    case 'fdrop':
    case 'fort':
    case 'fortnight':
    case 'fortnite':
        isFortniteCommand = true;

        var guildMember = message.member;
        if (guildMember === undefined || guildMember == null || !(guildMember)) {
            console.log("Retrieving guild member with fetchMember: " + message.author.id);            
            guildMember = message.guild.fetchMember(message.author).then(member => {
                guildMember = member;
                playDropLocation(isFortniteCommand, message, guildMember);
            }).catch((e) => {
                console.error("ERROR retrieving guild member with fetchMember:\n" + e);
            });            
        } else {
            playDropLocation(isFortniteCommand, message, guildMember);
        }                
	
        break;
        
    case 'a':
    case 'adrop':
    case 'apex':
        isFortniteCommand = false;
        
        var guildMember = message.member;
        if (guildMember === undefined || guildMember == null || !(guildMember)) {
            console.log("Retrieving guild member with fetchMember: " + message.author.id);            
            guildMember = message.guild.fetchMember(message.author).then(member => {
                guildMember = member;
                playDropLocation(isFortniteCommand, message, guildMember);
            }).catch((e) => {
                console.error("ERROR retrieving guild member with fetchMember:\n" + e);
            });
        } else {
            playDropLocation(isFortniteCommand, message, guildMember);
        }                
	
        break;
        
    } // switch (cmd)

    // Check voter status after each successful command.
    // We default users to voters at bot/user initialization and demote from there.
    // Will be checked again prior to sending a message,
    //   if they have a non-voter restriction and send a command under the time limit.
    if (VOTE_SYSTEM_ENABLED) {
        if (dropUserIsVoter[userID]) {

            dbl.hasVoted(userID).then(voted => {

                if (! (voted) ) {
                    console.log("SPS Has not VOTED: " + userID);
                    message.reply("Has been over 24 hours since last vote...\nCan vote again at: https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n");
                }

            }).catch((err) => {
                console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
                return 3;
            });

        }
    } // (VOTE_SYSTEM_ENABLED)

    return 1;
}


async function sendMessage(content, channel, options) {

    var delay = 0;
    if (options !== undefined) {
	delay = options.delay !== undefined ? options.delay : delay;
    }

    if (delay) {
	setTimeout(function() {
	    channel.send("\u200B" + content);
        }, delay);
    } else {
	channel.send("\u200B" + content);
    }
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

    if (dropUserBlocked[userID] && !(isDevUser)) return 0;    

    // Alert the user if they enter "!db" as it is a common mistake.
    if (sanitizedMessage.substring(0,3) == "!db") {
	message.reply("DropBot usage has exclamation point after prefix: \"db!\"");
        return;
    }
    
    // Discord bot best practices ask that unsupported commands fail silently.
    //   Source: https://github.com/meew0/discord-bot-best-practices
    //
    if (developerMode) { // Developer mode allows us to test with bots. Don't listen in production mode.
        if (! (sanitizedMessage.startsWith(`${prefix}`))) return;    
    } else {
        if (! (sanitizedMessage.startsWith(`${prefix}`)) || message.author.bot) return;
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
            handleCommand(args, message);
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

        var messageContent =  "Hey, <@!" + userID + ">!\n\n";
        messageContent += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n'; 
        messageContent += "Author   : <@" + DEVSHANS_ID + ">\n";
        messageContent += "GitHub   : https://github.com/devshans/DropBot\n";        
        messageContent += "Bot Link : https://discordbots.org/bot/" + DROPBOT_ID + "\n";
        messageContent += "Vote     : https://discordbots.org/bot/" + DROPBOT_ID + "/vote\n";
        messageContent += 'Discord support server: https://discord.gg/YJWEsvV \n';
                
        message.reply(messageContent);
        
	return 0;
    }

    var guildID   = message.guild.id;
    var guildName = message.guild.name;

    // Special for Official DropBot Support server
    // Do not want to take DropBot off each channel for visibility.
    //   Have the moderator bot delegate instructions to move to supported channels.
    if (message.guild.id == DROPBOT_SERVER_ID) {
        if (message.channel.id != DROPBOT_TEST_CHANNEL_ID1 &&
            message.channel.id != DROPBOT_TEST_CHANNEL_ID2) return;
    }
    
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
		        message.channel.send("<@!" + userID + "> - DropBot has been updated to version 8.5! \n" +
					     "Added ability to change default game for \"db!drop\" and \"db!\" commands.\n" +
                                             "If your server wants to play Apex Legends, try using the command \"db!default apex\" to save yourself some time.\n" +
					     "Use db!help for more info on commands.\n" +
					     "Post on DropBot support server linked in db!help if you have any issues."
					    );
	            }, 10000);
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
                    handleCommand(args, message);
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

    if (STRIKE_SYSTEM_ENABLED) {
	if (dropUserBlocked[userID] || dropUserStrikes[userID] == USER_MAX_STRIKES) {

            if (dropUserBlocked[userID] == false) {
		dropUserBlocked[userID]  = true;
		updateUser(userID, epochTime, true);
            }
            args = ["error", "Too many strikes [" + USER_MAX_STRIKES + "].\n" + "<@!" + userID + "> blocked due to rate limiting.\n" +
		    "Please wait at least an hour or contact developer devshans0@gmail.com if you think this was in error."];
            console.log("BLOCKED: User - " + user + "[" + userID + "] due to max strikes of rate limiting.");
            handleCommand(args, message);
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
            handleCommand(args, message);
            return 3;
        }
    }

    if (VOTE_SYSTEM_ENABLED) {
        if (args[0] == 'vote') {
            handleCommand(args, message);
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

        var messageContent = "";
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

                        sendMessage(sendWarnMessage, message.channel, {delay: 500});

		    }

                    messageContent  = "\u200B<@!" + userID + "> please wait " + (timeout_sec-timeSinceLastCommand) +
                        " second(s) before issuing another command.\n" +
                        "You may check if your vote has been processed immediately and without penalty with \"db!vote\"";
                    args = ["error", messageContent];
                    handleCommand(args, message);
                    return 1;
                } else {
		    dropUserIsVoter[userID] = true;
		    dropUserWarned[userID]  = false; 
                    if (DEBUG_VOTE) console.log("***** VOTE before handleCommand changed to " + voted + " for userID " + userID);
                    messageContent  = "\u200B<@!" + userID + ">, thanks for voting! Restriction lessened to " + VOTE_USER_TIMEOUT_SEC + " second(s).\n";;
                    args = ["error", messageContent];
                    handleCommand(args, message);		    
		    return 0;
		}
            }).catch((err) => {
                console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
                return 3;
            });
            
        } else {
	    args = ["error", "<@!" + userID + "> please wait " + (timeout_sec-timeSinceLastCommand) + " second(s) before issuing another command.\n"];
            handleCommand(args, message);            
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
            handleCommand(args, message);
        }, 100);
    } else {
        updateUser(userID, epochTime, false).then(result => {
            setTimeout(function() {                
                handleCommand(args, message);
            }, 100);
        }).catch((err) => {
            console.error("ERROR updateUser bot.on(message): ", err);
        });
    }    

});
