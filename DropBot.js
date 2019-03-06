/*
    @document   : DropBot.js
    @author     : devshans
    @version    : 9.4.0
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

    Links  * Fortnite     : https://www.epicgames.com/fortnite/en-US/home
	   * Locations    : https://fortnite.gamepedia.com/Battle_Royale_Map
           * Apex Legends : https://www.ea.com/games/apex-legends
           * Discord      : https://discordapp.com
	   * discord.js   : https://discord.js.org
*/

var DEBUG_MESSAGE  = true;
var DEBUG_COMMAND  = true;
var DEBUG_DATABASE = true;
var DEBUG_DBL      = true;
var DEBUG_VOTE     = true;

var STRIKE_SYSTEM_ENABLED = false;
var VOTE_SYSTEM_ENABLED   = false;

// Node Modules
const fs        = require('fs');
const rwc       = require('random-weighted-choice');
const date      = require('date-and-time');

// Discord Modules
const Discord   = require('discord.js');
const AWS       = require("aws-sdk");
const DBL       = require("dblapi.js");

// DropBot Modules
const DBGuild   = require('./DBGuild.js');
const DBUser    = require('./DBUser.js');
const Constants = require('./Constants.js');
const config    = require('./config.json');

// Parse strings sent from ShardingManager
//   Args are sent as strings. Need to parse boolean as string.
const developerModeArg = process.argv[2];
if (developerModeArg == "true") developerMode = true;
else                            developerMode = false;
if (developerMode) console.log("Launching DropBot-dev.js in DEVELOPER mode.");
else               console.log("** Launching DropBot.js in PRODUCTION mode. **"); 

// DropBot Database Module
const dbAWS = developerMode ? require('./db-dev.js') : require('./db.js');

// See if we have any users with developer option privileges.
//   Currently only supports 1 user.
var DEVSHANS_ID = -1;
const devFilename = "dev.json";
fs.readFile(devFilename, 'utf8', function(err, data) {
    if (err) {
        console.error("No " + devFilename + " file for authentication.");
        return;
    }
    var devJson = JSON.parse(data);
    console.log("Setting DEVSHANS_ID to: ", devJson.uid);
    DEVSHANS_ID = devJson.uid;
});

// Database status in memory
var dbGuilds = [];
var dbUsers  = [];

const client  = new Discord.Client();
const shardID = client.shard === null ? -1 : client.shard.id;

// Log our bot in using the token from https://discordapp.com/developers/applications/me
var loginDelay = developerMode ? 10 : 100;
setTimeout(function() {
    client.login(client.token);
}, loginDelay);

// ------------------------------------------------------------------------------
// DiscordBotList API
//   https://discordbots.org/api/docs#jslib
//   https://github.com/DiscordBotList/dblapi.js
// ------------------------------------------------------------------------------

var dbl;

// Set up DBL even in developerMode to use the real DropBot auth.token to check stats.
//   Do not set a client, webhooks, or update serverCount.
// Likewise, only create 1 instance for shard ID 0 so that we aren't running multiple servers, etc.
if (developerMode || shardID != 0) {

    dbl = new DBL(config.dblToken);

} else { // shardID == 0

    // Express server for webhooks
    const express = require('express');
    const http    = require('http');
    const app     = express();
    const server  = http.createServer(app);

    // DiscordBotList API
    dbl = new DBL(config.dblToken, { webhookAuth: config.webhookAuth, webhookServer: server, webhookPort: config.webhookPort });

    // Emitted when the webhook is ready to listen.
    dbl.webhook.on('ready', hook => {
        console.log(`Webhook running at http://${hook.hostname}:${hook.port}${hook.path}`);
    });

    // Emitted when the webhook has received a vote.
    dbl.webhook.on('vote', vote => {
        client.fetchUser(vote.user).then(user => {
	    console.log("User " + user.username + ` [${vote.user}] just voted!`);
        });
    });

    server.listen(config.webhookPort, () => {
        console.log('Webhook server listening on port #' + config.webhookPort);
    });
    
}
if (dbl === undefined || dbl == null) console.error("Failed to initialize DBL API.");

// Post stats to Discord Bot List
function dblPostStats() {

    dbl.postStats(client.guilds.size, shardID, client.shard.count).then(() => {
        console.log(`[DBL]#${shardID}: SUCCESS sending guildsSize to Discord Bot List - ${client.guilds.size}`);
    }).catch(err => {
        console.log(`[DBL]#${shardID}: WARNING: Could not access Discord Bot List database`);
    });

    client.shard.fetchClientValues('guilds.size')
        .then(results => {
            console.log(`${results.reduce((prev, val) => prev + val, 0)} total guilds`);
        })
        .catch(console.error);       

}

// ------------------------------------------------------------------------------
// Discord.Client Event handling
// ------------------------------------------------------------------------------

// Emitted when the client becomes ready to start working.
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Only need to set client activity once
    client.user.setActivity(`\"db!help\"`, { type: 'LISTENING' });
    
    // Send client.guilds.size to DBL at startup and then every 30 minutes.
    //   Offset by 5 seconds for each shard
    if (! (developerMode) && client.user.id == Constants.DROPBOT_ID) {
        setTimeout(function() {
            dblPostStats(); 
            setInterval(() => {
                dblPostStats();
            }, 1800000);
        }, (1000*shardID));
    }

    console.log(`DropBot ${Constants.MAJOR_VERSION}.${Constants.MINOR_VERSION} shard ${client.shard.id} ` +
                `listening on ${client.guilds.size} servers for commands.`);
    
});

// Emitted whenever the client's WebSocket encounters a connection error.
client.on('error', error => {
    console.error(`ERROR CLIENT:\n ${error.name} = ${error.message}`);

    for (var v in client.voiceConnections) {
        console.log("Disconnecting from client.voiceConnections: " + v);
        console.log(client.voiceConnections.get(v));
        client.voiceConnections.get(v).disconnect();
    }
    
});

// Emitted when the client's WebSocket disconnects and will no longer attempt to reconnect.
client.on('disconnect', event => {
    console.error(`ERROR: Disconnected from Discord.\n\tError code: ${event.code}. Retrying...`);
    client.login(client.token);
});

// This event triggers when the bot joins a guild.
//   We will not add this to the database until a command has been sent.
client.on("guildCreate", guild => {
    console.log(`New guild joined: ${guild.name}[${guild.id}] with ${guild.memberCount} members.`);
    client.shard.fetchClientValues('guilds.size')
        .then(results => {
            console.log(`New total guilds = ${results.reduce((prev, val) => prev + val, 0)}`);
        })
        .catch(console.error);
});

// This event triggers when the bot is removed from a guild.
client.on("guildDelete", guild => {
  console.log(`DropBot removed from: ${guild.name}[${guild.id}]`);
});

// Discord.js specifies that servers with less than 250 members won't need to use fetchMember(s) functions.
//   Have seen in rare cases that a manual look-up is necessary in larger guilds.
async function getGuildMember(message) {

    return new Promise(function(resolve, reject) {
        
        var guildMember = message.member;
        if (guildMember === undefined || guildMember == null || !(guildMember)) {
            console.log("Retrieving guild member with fetchMember: " + message.author.id);
            message.guild.fetchMember(message.author).then(member => {
                guildMember = member;
                resolve(guildMember);                
            }).catch((e) => {
                console.error("ERROR retrieving guild member with fetchMember:\n" + e);
                reject(e);
            });            
        } else {
            resolve(guildMember);
        }

    });
        
}

// Join the voice channel of the member who triggered the command and
//   play audio to announce drop location.
async function playDropLocation(isFortnite, message, guildMember) {

    let guildID = message.guild.id;
    const dropLocationID = isFortnite ? rwc(dbGuilds[guildID].dropLocationsFN) : rwc(dbGuilds[guildID].dropLocationsAL);

    if (dropLocationID == null) {
        console.error("ERROR: Could not select a drop location.");
        messageContent = "ERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
        message.reply(messageContent);
        return;
    }

    const dropLocation   = isFortnite ? Constants.dropLocationNamesFN[dropLocationID] : Constants.dropLocationNamesAL[dropLocationID];
    const gameName       = isFortnite ? "Fortnite" : "Apex Legends";
    
    let dropChance;
    let messageContent = "";
    
    if (client.voiceConnections.get(message.guild.id)) {
        message.reply("wait for DropBot to finish talking.\nUse \"db!stop\" to force DropBot to leave the voice channel.");
        return;
    }   

    if (DEBUG_COMMAND) {
        if (isFortnite) console.log("Dropping at dropLocationId: " + dropLocationID + " - " + Constants.dropLocationNamesFN[dropLocationID]);
        else            console.log("Dropping at dropLocationId: " + dropLocationID + " - " + Constants.dropLocationNamesAL[dropLocationID]);
    }

    if (isFortnite) {
        if (dbGuilds[guildID].dropLocationsFN[dropLocationID]['weight']) {
            dropChance = dbGuilds[guildID].dropLocationsFN[dropLocationID]['weight'] / dbGuilds[guildID].dropWeightsFN * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
            messageContent = "ERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            sendMessage(messageContent, message.channel);
            return;
        }
    } else {
        if (dbGuilds[guildID].dropLocationsAL[dropLocationID]['weight']) {
            dropChance = dbGuilds[guildID].dropLocationsAL[dropLocationID]['weight'] / dbGuilds[guildID].dropWeightsAL * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);
        } else {
            console.error("ERROR: dropLocationID " + dropLocationID + " is undefined");
            messageContent = "ERROR: Could not select a drop location. Try adjusting weights with \"db!set ...\" command.";
            sendMessage(messageContent, message.channel);
            return;
        }
    }
    
    let dropLocationAudioFile = dropLocation.split(' ').join('_').toLowerCase() + '.wav';
    let dropLocationMapFile   = dropLocation.split(' ').join('_').toLowerCase() + '.png';

    const embed = {
	"title": "*** " + dropLocation + " *** - **" + dropChance + "% Chance**",
	"url": "https://discordbots.org/bot/487298106849886224",
	"color": isFortnite ? 3112447 : 16723712,
	"timestamp": "${(new Date).getTime()}",
	"footer": {
	    "icon_url": "https://cdn.discordapp.com/avatars/487298106849886224/3a7aecf76365ae6df789ff9486a32d47.png",
	    "text": `DropBot Version ${Constants.MAJOR_VERSION}.${Constants.MINOR_VERSION}`
	},
	"thumbnail": {
            "url": isFortnite ?
                config.logoPrefix + "dropbot_fortnite.png" :
                config.logoPrefix + "dropbot_apex.png" ,
	},
	"image": {
	    "url": isFortnite ?
                config.mapPrefixFN + dropLocationMapFile :
                config.mapPrefixAL + dropLocationMapFile ,
	},
	"author": {
	    "name": message.author.username + " - " + gameName + " Drop Location",
	    "url": "https://discordbots.org/bot/487298106849886224",
	    "icon_url": message.author.avatarURL
	},
        "description": '**Drop command help:** (Use "db!help" for all)',
	"fields": [
	    {
		"name":  dbGuilds[guildID].audioMute ? "DropBot audio muted" : "DropBot audio unmuted",
		"value": dbGuilds[guildID].audioMute ? 'Change with "db!unmute"' : 'Change with  "db!mute"',
		"inline": true
	    },
	    {
		"name": "Change drop chances",
		"value": isFortnite ? 'See usage: "db!set help"' : 'See usage: "db!aset help"',
		"inline": true
	    },
	    {
		"name": "Reset all settings",
		"value": 'Use "db!reset"',
		"inline": true
	    },
	    {
		"name": "See drop chances",
		"value": "Use \"db!settings\"",
		"inline": true
	    }
	]
    };
    

    let dropMessageDelay = (dbGuilds[guildID].audioMute && ! (guildMember.voiceChannel)) ? 1000 : 3000;

    message.channel.send('So, where we droppin\' boys...').then(msg => {
        msg.delete(dropMessageDelay);
    }).catch((error) => {
        console.error("Error deleting message playDropLocation");
    });
    
    setTimeout(function() {
        message.channel.send({embed});
    }, dropMessageDelay);
    
    if (dbGuilds[guildID].audioMute) {           

        if (guildMember.voiceChannel) {
            sendMessage("```User is in a voice channel while DropBot is muted. Use \"db!unmute\" to play audio.```",
                        message.channel, {delay: 500});
        }

    } else {
        
        const sfxFile = isFortnite ?
              config.sfxPrefixFN + dropLocationAudioFile :
              config.sfxPrefixAL + dropLocationAudioFile;
        
        if (!fs.existsSync(sfxFile)) {
            console.error("Could not access sfxFile: " + sfxFile);
    	    messageContent = 'Oops... Tried to drop ' + dropLocation +
                ' but having trouble accessing the audio file.\n' +
                'This has been reported to the developer. If problems persist, mute voice activity with "db!mute"';
            message.reply(messageContent);
            return;
        }

        if (guildMember.voiceChannel) {

            // Check permissions to join voice channel and play audio.
            // Send message on text channel to author if not.
            // https://discordapp.com/developers/docs/topics/permissions
            if (! (guildMember.voiceChannel.joinable) ||
                ! (guildMember.voiceChannel.permissionsFor(message.guild.me).has("CONNECT", true) &&
                   guildMember.voiceChannel.permissionsFor(message.guild.me).has("SPEAK", true))) {

                console.log("Alerted user of voice channel permissions error for: " + guildID);
                
                message.reply("This channel does not have the necessary permissions for DropBot to speak on voice channel.\n" +
                              "DropBot needs voice channel permissions for CONNECT and SPEAK.\n" +
                              "Please change permissions or disable voice with \"db!mute\"");
                return;
            }

            if (guildMember.voiceChannel.full) {
                console.log("Alerted user of voice channel full for: " + guildID);
                message.reply("Cannot play audio. Your current voice channel is full." +
                              "Please join a channel with open spots or disable voice with \"db!mute\"");
                return;
            }
           
            // Attempt to join the member's voice channel.
            guildMember.voiceChannel.join().then(connection => { // Connection is an instance of VoiceConnection       	

        	if (DEBUG_COMMAND) console.log(`Talking on channel : ${guildMember.voiceChannel.name}[${guildMember.voiceChannel.id}]`);

                // Emitted whenever the connection encounters an error.
                connection.on("error", error => {
                    console.error("ERROR connection playStream sfxFile:\n" + error);
                    connection.disconnect();
		    connection.channel.leave();
                    return;
        	});	

                // Emitted when we fail to initiate a voice connection.
                connection.on("failed", error => {
                    console.error("ERROR connection playStream sfxFile:\n" + error);
                    return;
        	});                
                
		// playStream() is less efficient than using playFile() but it will cut off the end of the audio.
                const dispatcher = connection.playStream(fs.createReadStream(sfxFile)); // StreamDispatcher

                // Emitted once the dispatcher ends.
                dispatcher.on('end', () => {
                    setTimeout(function() {
                        connection.disconnect();
		        connection.channel.leave();
                    }, 200);
                });

                // Emitted when we fail to initiate a voice connection.
                dispatcher.on("error", error => {
                    console.error("ERROR dispatcher playStream sfxFile:\n" + error);
                    connection.disconnect();
		    connection.channel.leave();    	    
        	});
                	
            }).catch((error) => {
                console.error(`ERROR joining voiceChannel : ${guildMember.voiceChannel.name}[${guildMember.voiceChannel.id}]\n${error}`);
            });
        	
        } else {
           
            setTimeout(function() {
        	message.reply('to announce location, join a voice channel to get audio or mute DropBot using \"db!mute\" to remove this message.');
            }, 500);

        }

    } // !(serverAudioMute)

    return;
}

// ------------------------------------------------------------------------------
// handleCommand()
// Main function for handling all commands that are filtered from the client
//   'message' event handler.
// ------------------------------------------------------------------------------
async function handleCommand(args, message) {

    var userID    = message.author.id;
    var channelID = message.channel.id;
    var guildID   = message.guild.id;
    
    var isDevUser = (DEVSHANS_ID == userID);

    var cmd = args[0];
    var messageContent = "";

    let isFortniteCommand    = true;
    let isFortniteCommandSet = false;

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

	case 'dumpuser':
	    if (args.length < 1) {
                messageContent = "Please specify user ID to check for voting.";
		sendMessage(messageContent, message.channel);
                break;
	    }

            sendMessage(dbUsers[args[0]].toString(), message.channel);
            
            break;

	case 'dumpusers':

            for (var i in dbUsers) {
                sendMessage(dbUsers[i].toString(), message.channel);
            }
            
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
            }).catch(console.error);
            break;

        case 'getstats':
	    dbl.getStats(Constants.DROPBOT_ID).then(stats => {
		var shards = stats.shards ? 1 : stats.shards;
		messageContent = `\`\`\`Servers - ${stats.server_count}\nShards  - ${shards}\`\`\``;
		sendMessage(messageContent, message.channel);
	    }).catch(console.error);
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
            }).catch(console.error);

            
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
		    messageContent += "Strike " + dropUserStrikes[userID] + "/" + Constants.USER_MAX_STRIKES;
		    console.log(messageContent);                
                } else {
		    messageContent  = userID + " HAS voted to use DropBot in the last 24 hours.\n";
		    console.log(messageContent);
                }

		sendMessage(messageContent, message.channel, {delay: 200});
                
	    }).catch((err) => {
                var messageContent = "Oops... DropBot could not access dbl.hasVoted database for userID: " + userID + "\n" +  err;
                console.log("WARNING: " + messageContent);
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
        messageContent += "Bot Link : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "\n";
        messageContent += "Vote     : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote\n";
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
        message.reply("donate to DropBot development from the link below!");
        message.channel.send(config.donateURL);
        break;
        
    //fixme - SPS. Restructure all this and use the webhook to update vote status.
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
                        messageContent  = "<@!" + userID + ">, you are not shown as having voted in the last 24 hours.\n";
                        messageContent += "If you just voted, wait about a minute or 2 for it to process.\n";
                        messageContent += "You can run \"db!vote\" again without restriction to check vote status.\n";
                    } else {
                        dropUserWarned[userID] = true;
                        messageContent  = "<@!" + userID + "> has NOT yet voted in the last 24 hours.\n";
                        messageContent += "If you just voted, wait about a minute or 2 for it to process.\n";
                        messageContent += "You are rate limited to using one command every " + Constants.NO_VOTE_USER_TIMEOUT_SEC + " seconds.\n";
    		        messageContent += "To lessen restriction to " + Constants.VOTE_USER_TIMEOUT_SEC + " second(s), simply verify user by voting for DropBot at: https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote\n";
                        messageContent += "You may check if your vote has been processed immediately and without penalty with \"db!vote\"";
                    }
                    sendMessage(messageContent, message.channel);
                    return;
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
                        message.reply("you are shown as voting within the last 24 hours! Restriction lessened to " + Constants.VOTE_USER_TIMEOUT_SEC + " second(s).\n");
                    }).catch((err) => {
                        console.error("ERROR vote command update: " + err);
                    });
                    
    		    return;
    	        }
            }).catch((err) => {

                console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
                
                var messageContent = "\u200BOops... <@!" + userID + ">, DropBot could not access Discord Bot List's vote database.\nPlease try again later.\n";                
        	sendMessage(messageContent, message.channel);
                
                return;
            });
        } else {
            messageContent = "\u200BVote system temporarily disabled.\n" +
                "Rate limiting set to minimum of " + Constants.VOTE_USER_TIMEOUT_SEC + " second(s).";
            messageContent += "Voting link : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote \n";
            sendMessage(messageContent, message.channel);
        }
        
        break;

    case 'm':
    case 'mute':

    	if (dbGuilds[guildID].audioMute) {
            messageContent = "\u200BDropBot is already muted.";
	    message.reply(messageContent);
    	    break;
    	} else {
            dbGuilds[guildID].audioMute = true;
    	}       
        
        dbAWS.updateGuildAudioMute(dbGuilds[guildID]).then(dropBotGuild => {
            messageContent = "\u200BMuted DropBot. Will no longer speak in voice channels.";
	    message.reply(messageContent);
            console.log(`Successfully updated audioMute for ${message.guild.name}[${guildID}]`);
        }).catch((e) => {
            console.error("ERROR updateGuildAudioMute " + guildID + ":\n" + e);
        });
    	break;

    case 'u':        
    case 'unmute':

    	if (dbGuilds[guildID].audioMute) {
            dbGuilds[guildID].audioMute = false;
    	} else {
            messageContent = "\u200BDropBot is not muted.";
	    message.reply(messageContent);
    	    break;
    	}

        dbAWS.updateGuildAudioMute(dbGuilds[guildID]).then(dropBotGuild => {
            messageContent = "\u200BAllowing DropBot to speak in voice channels again.";
            message.reply(messageContent);
            console.log(`Successfully updated audioMute for ${message.guild.name}[${guildID}]`);
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

        dbGuilds[guildID].defaultGame = newDefaultGame;

        dbAWS.updateGuildDefaultGame(dbGuilds[guildID]).then(dropBotGuild => {
            let newDefaultGameString = newDefaultGame == "fortnite" ? "Fortnite" : "Apex Legends";
            messageContent = "\u200Bchanged default game to " + newDefaultGameString;
            message.reply(messageContent);
            console.log(`Successfully updated default game for ${message.guild.name}[${guildID}]`);
        }).catch((e) => {
            console.error("ERROR updateGuildDefaultGame " + guildID + ":\n" + e);
        });

        break;

    //fixme - SPS. This needs to be udpated to fill all 50 weights. see db file
    case 'aset':
        isFortniteCommand    = false;
        isFortniteCommandSet = true;
    case 'fset':
    case 'set':
        if (! (isFortniteCommandSet)) isFortniteCommand = true;
        
        var setId               = Number(args[0]);
        var setWeight           = Number(args[1]);
        var previousWeight      = -1;
        var nextTotalWeight     = 0;
        var previousTotalWeight = isFortniteCommand ? dbGuilds[guildID].dropWeightsFN   : dbGuilds[guildID].dropWeightsAL;
        var myDropLocations     = isFortniteCommand ? dbGuilds[guildID].dropLocationsFN : dbGuilds[guildID].dropLocationsAL;
        var myDropLocationNames = isFortniteCommand ? Constants.dropLocationNamesFN     : Constants.dropLocationNamesAL;

        messageContent = '';

        // Sanitize 'set' command usage. Send message and exit if incorrect.
        if (args.length == 0 || (args.length == 1 && args[0] == "help")) {
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
    	}
        if (args.length < 2) {
            message.reply("USAGE ERROR: Please specify the index and weight.");
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
        }       
        if (! (Number.isInteger(setId)) || ! (Number.isInteger(setWeight))) {
            message.reply("USAGE ERROR: [id] and [weight] arguments must both be numbers.");
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
        }       
        if (setId > (myDropLocationNames.length-1) || setId < 0) {
            message.reply("USAGE ERROR: [id] must be within the range of 0 to " + (myDropLocationNames.length-1));
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
        }        
        if (setWeight > Constants.MAX_WEIGHT || setWeight < 0) {
            message.reply("USAGE ERROR: [weight] must be within the range of 0 to " + Constants.MAX_WEIGHT);
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
        }
        if (myDropLocations[setId]['weight'] == setWeight) {
            message.reply("USAGE ERROR: Weight for " + myDropLocationNames[setId] + " is already " + setWeight);
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
        }

        // Usage is correct... Continue.
        previousWeight = Number(myDropLocations[setId]['weight']);

        messageContent += "Setting weight for " + myDropLocationNames[setId] + " to " + setWeight;
        myDropLocations[setId]['weight'] = setWeight;
        
        nextTotalWeight = 0;
        for (var i=0; i < myDropLocationNames.length; i++) {
            nextTotalWeight += Number(myDropLocations[i]['weight']);
        }
        
        if (nextTotalWeight < 1) {
            myDropLocations[setId]['weight'] = previousWeight; // Revert changed value
            messageContent += "ERROR: All weights must add up to at least 1";
            message.reply(messageContent);
            sendMessage(getSetCommandUsage(isFortniteCommand, guildID), message.channel, {delay: 200});
            return;
        }

	if (isFortniteCommand) {
            dbGuilds[guildID].dropWeightsFN = nextTotalWeight;
	} else {
	    dbGuilds[guildID].dropWeightsAL = nextTotalWeight;
	}

	sendMessage(messageContent, message.channel);

	if (isFortniteCommand) {
            dbAWS.updateGuildDropsFN(dbGuilds[guildID]).then(dropBotGuild => {

		var sendMessageContent = dbGuilds[guildID].fortniteToString();
		sendMessage('```' + sendMessageContent + '```', message.channel, {delay: 200});

            }).catch((e) => {
		console.error("ERROR updateGuildDropsFN: " + e);
            });
	} else {
            dbAWS.updateGuildDropsAL(dbGuilds[guildID]).then(dropBotGuild => {

		var sendMessageContent = dbGuilds[guildID].apexToString();
		sendMessage('```' + sendMessageContent + '```', message.channel, {delay: 200});

            }).catch((e) => {
		console.error("ERROR updateGuildDropsAL: " + e);
            });
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
        messageContent += "Bot Link         : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "\n";
        messageContent += "Bot Vote Support : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote\n";
        messageContent += "Support Discord  : https://discord.gg/YJWEsvV\n\n";
        messageContent += "```";
	sendMessage(messageContent, message.channel);
        break;

    case 's':
    case 'settings':

        messageContent = "Retrieving info for this server...";
	sendMessage(messageContent, message.channel);

	sendMessage("```" + dbGuilds[guildID].headerString()     + "```", message.channel);
	sendMessage("```" + dbGuilds[guildID].gameHeaderString() + dbGuilds[guildID].gameTable() + "```", message.channel);

        break;
              
    case 'reset':
        messageContent = "Resetting all values to their defaults...";
	sendMessage(messageContent, message.channel);

        dbAWS.resetGuild(dbGuilds[guildID]).then(dropBotGuild => {
            dbGuilds[guildID] = dropBotGuild;
	    sendMessage("```" + dbGuilds[guildID].headerString()     + "```", message.channel);
	    sendMessage("```" + dbGuilds[guildID].gameHeaderString() + dbGuilds[guildID].gameTable() + "```", message.channel);
        }).catch((e) => {
            console.error("ERROR updateGuildDrops: " + e);
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
        isFortniteCommandSet = true;
        if (dbGuilds[guildID].defaultGame === undefined || dbGuilds[guildID].defaultGame == null ||
            dbGuilds[guildID].defaultGame.toLowerCase() == "fortnite") isFortniteCommand = true;
        else                                                           isFortniteCommand = false;        
    case 'fdrop':
    case 'fort':
    case 'fortnight':
    case 'fortnite':
        if (! (isFortniteCommandSet)) isFortniteCommand = true;
        isFortniteCommandSet = true;
    case 'a':
    case 'adrop':
    case 'apex':
        if (! (isFortniteCommandSet)) isFortniteCommand = false;
        isFortniteCommandSet = true;

        getGuildMember(message).then((guildMember) => {
            playDropLocation(isFortniteCommand, message, guildMember);
        }).catch((e) => {
            console.error("ERROR retrieving guild member Apex:\n" + e);
        });
	
        break;
        
    } // switch (cmd)

    // Check voter status after each successful command.
    // We default users to voters at bot/user initialization and demote from there.
    // Will be checked again prior to sending a message,
    //   if they have a non-voter restriction and send a command under the time limit.
    if (VOTE_SYSTEM_ENABLED) {
        if (dbUsers[userID].isVoter) {

            dbl.hasVoted(userID).then(voted => {

                if (! (voted) ) {
                    console.log("SPS Has not VOTED: " + userID);
                    message.reply("Has been over 24 hours since last vote...\nCan vote again at: https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote\n");
                }

            }).catch((err) => {
                console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
                return;
            });

        }
    } // (VOTE_SYSTEM_ENABLED)

    return;
}

// Wrapper send message function to prefix messages with a 0 width space
//   and optionally add delay.
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

// Common usage help for 'set' command if syntax was entered incorrectly.
function getSetCommandUsage(isFortniteCommand, guildID) {
    var messageContent = '';
    messageContent += 'Help for changing drop location chance\n';
    messageContent += '```';
    if (isFortniteCommand) {
        messageContent += 'db!set [id] [weight]\n';    
        messageContent += '     Change the chance of choosing each Fortnite location\n\n';
        messageContent += dbGuilds[guildID].fortniteToString();
    } else {
        messageContent += 'db!aset [id] [weight]\n';    
        messageContent += '     Change the chance of choosing each Apex Legends location\n\n';
        messageContent += dbGuilds[guildID].apexToString();
    }
    messageContent += '```';
    return messageContent;
}

// Create an event listener for messages
client.on('message', message => {
    
    var userID   = message.author.id;
    var userName = message.author.username;
    var userDisc = message.author.discriminator;

    var channelID = message.channel.id;
    var channelName = message.channel.name;

    var dateTime  = message.createdAt;
    var epochTime = message.createdTimestamp;    

    var sanitizedMessage = message.content.trim().replace(/ +(?= )/g,'').toLowerCase();
    var args = sanitizedMessage.slice(config.prefix.length).split(/ +/);
    
    // Exit if it's DropBot.
    //   We do not use message.author.bot so that unit testing can be done with bots.
    if (userID == Constants.DROPBOT_ID || userID == Constants.DEV_DROPBOT_ID) return;

    // Special for Official DropBot Support server
    // Do not want to take DropBot off each channel for visibility.
    //   Have the moderator bot delegate instructions to move to supported channels.
    if (message.guild && message.guild.id == Constants.DROPBOT_SERVER_ID) {
        if (message.channel.id != Constants.DROPBOT_TEST_CHANNEL_ID1 &&
            message.channel.id != Constants.DROPBOT_TEST_CHANNEL_ID2) return;
    }    

    var isDevUser = (DEVSHANS_ID == userID);
    var maxMessageLength = isDevUser ? 50 : 20;

    //fixme - SPS. Make a counter to see if this continues to happen and report user.    
    // If a user is banned, do not allow them to continue spamming the bot.
    if ((dbUsers[userID] && dbUsers[userID].blocked) && !(isDevUser)) return;

    // Alert the user if they enter "!db" as it is a common mistake.
    if (sanitizedMessage.substring(0,3) == "!db") {
	message.reply("DropBot usage has exclamation point after prefix: \"db!\"");
        return;
    }
    
    // Discord bot best practices ask that unsupported commands fail silently.
    //   Source: https://github.com/meew0/discord-bot-best-practices
    //
    if (developerMode) { // Developer mode allows us to test with bots. Don't listen in production mode.
        if (! (sanitizedMessage.startsWith(`${config.prefix}`))) return;
    } else {
        if (! (sanitizedMessage.startsWith(`${config.prefix}`)) || message.author.bot) return;
    }

    // WE DO give an error if there is a space before what could be a valid command.
    if (message.content.length > 4 && message.content[3] == " " && message.content[4].match(/[a-z0-9]/i)) {
	message.reply("do not put a space after \"db!\" and command");
        return;
    }
    
    // Drop commands that are too long.
    // Currently, this is the longest valid user command:
    //    db!default fortnight
    // Drop messages greater than this length but suggest help if the command is "set"
    if (message.content.length > maxMessageLength) {
        // Send some extra help for the 2 longer messages if they go over the limit.
        if (args[0] == "set") {
            message.reply("wrong syntax for set command. Please use \"db!set help\" for usage.");
        }
        if (args[0] == "default") {
            message.reply("wrong syntax for default command. Please use \"db!help\" for usage.");
        }
        return;
    }         
    
    if (DEBUG_MESSAGE) {
	if (message.guild) {
	    console.log(`------------- New command ${shardID} -----------`);
	} else {
	    console.log(`-------- New DMChannelcommand ${shardID} -------`);
	}
    }
    
    if (message.channel instanceof Discord.DMChannel) {

        if (DEBUG_MESSAGE) {
            console.log("  User    : " + userID + " - " + userName + "#" + userDisc);
            console.log("  Channel : " + channelID + " - " + channelName);	
            console.log("  Time    : " + dateTime.toISOString());
            console.log("  message : " + message);
            console.log("-----------------------------------------");  
        }

        var messageContent =  "Hey, <@!" + userID + ">!\n\n";
        messageContent += 'Add DropBot to a Discord server and see help by sending a \"db!help\" message in a channel with DropBot active.\n'; 
        messageContent += "Author   : <@" + DEVSHANS_ID + ">\n";
        messageContent += "GitHub   : https://github.com/devshans/DropBot\n";        
        messageContent += "Bot Link : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "\n";
        messageContent += "Vote     : https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote\n";
        messageContent += 'Discord support server: https://discord.gg/YJWEsvV \n';
                
        message.reply(messageContent);
        
	return;
    }

    var guildID   = message.guild.id;
    var guildName = message.guild.name;
    
    // Main debug code block for application.
    // Logged on every successful message being parsed past the intial sanitation and DM feedback.
    if (DEBUG_MESSAGE) {
        console.log("  User    : " + userID + " - " + userName + "#" + userDisc);
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
    
    // First access from a server since reboot or new server.
    if (dbGuilds[guildID] === undefined || dbGuilds[guildID] == null) {
        if (DEBUG_MESSAGE) console.log("First access from server since at least reboot: ", guildID);

        // Assume that database writes will succeed.
        //   If another user comes in before they are done from the same server, we'll trigger the init twice.
        dbGuilds[guildID] = true;

        dbGuilds[guildID] = new DBGuild(guildID, guildName);
        
        dbAWS.initGuildDatabase(dbGuilds[guildID]).then(dropBotGuild => {
            if (DEBUG_MESSAGE) console.log("initGuildDatabase success.");
            dbGuilds[guildID] = dropBotGuild;
            client.guilds.size++;
            console.log("New total servers: " + client.guilds.size);                    
        }).catch(err => {
            console.error("ERROR initGuildDatabase + " + guildID + ":\n" + err);
            dbGuilds[guildID] = false; 
        }).then(() => {

            var sendMessage = `DropBot has been updated to Version ${Constants.MAJOR_VERSION}.${Constants.MINOR_VERSION}\n`;
            sendMessage += 'Condensed formatting of "db!settings" and "db!reset" commands.\n';
            sendMessage += "Added map images and better formatting to drop commands.\n";
            sendMessage += "Fortnite Drop Locations: Removed Tomato Temple and added Volcano.\n";
	    sendMessage += 'Post on DropBot support server linked in "db!help" if you have any issues.';
            
            if ((dbGuilds[guildID].majorVersion < Constants.MAJOR_VERSION) ||
                (dbGuilds[guildID].majorVersion == Constants.MAJOR_VERSION &&
                 dbGuilds[guildID].minorVersion < Constants.MINOR_VERSION)) {
                
                dbGuilds[guildID].updateNotice = false;
                dbGuilds[guildID].majorVersion = Constants.MAJOR_VERSION;
                dbGuilds[guildID].minorVersion = Constants.MINOR_VERSION;
                
                dbAWS.updateGuildUpdateNotice(dbGuilds[guildID]).then(result => {                
                    setTimeout(function() {
		        message.reply(sendMessage);
	            }, 8000);
                });

            }

            if (dbGuilds[guildID].updateNotice) {

                dbGuilds[guildID].updateNotice = false;
                dbGuilds[guildID].majorVersion = Constants.MAJOR_VERSION;
                dbGuilds[guildID].minorVersion = Constants.MINOR_VERSION;

                dbAWS.updateGuildUpdateNotice(dbGuilds[guildID]).then(result => {                
                    setTimeout(function() {
                        message.reply(sendMessage);
	            }, 10000);
                });
            }	    
            
            dbAWS.initGuild(dbGuilds[guildID]).then(dropBotGuild => {
                if (DEBUG_MESSAGE) console.log("initGuild " + dropBotGuild.id + " success.");
		dbGuilds[guildID]= dropBotGuild;

                // For the case of using a new server only, we treat the user as new as well.
                //   If the user is banned, the script will already have exited above.
                if (dbUsers[userID] === undefined || dbUsers[userID] == null) {
                    dbUsers[userID] = new DBUser(userID, userName, userDisc);
		    dbAWS.initUser(dbUsers[userID]).then(dropBotUser => {
                        dbUsers[userID] = dropBotUser;
		        if (DEBUG_DATABASE) console.log("initUser " + userID + " in initGuild " +
                                                        guildID + ": success");                        
		    }).catch(err => {
		        console.error("ERROR initUser " + userID + " in initGuild " +
                                      guildID + ":\n", err);
		    });
                } else {
                   
                    epochTime = dateTime.getTime();
                    dbUsers[userID].timeout = epochTime;
                    dbUsers[userID].strikes = 0;
                    dbUsers[userID].blocked = false;
                    dbUsers[userID].warned  = false;
                    
		    dbAWS.updateUser(dbUsers[userID]).then(result => {
		        if (DEBUG_DATABASE) console.log("updateUser " + userID + " in initGuild " +
                                                        guildID + ": SUCCESS");
		    }).catch(err => {
		        console.error("ERROR updateUser " + userID + " in initGuild " +
                                      guildID + ":\n", err);
		    });                    
                }
                
                // Handle command only once the server has been initialized.
                //   The user will already have been set up above.
                // The script will exit in the return block below.
                //   No additional code in this function will be executed.
                setTimeout(function() {
                    handleCommand(args, message);
                }, 500);
            }).catch(err => {
                console.error("ERROR initGuild [" + guildID + "]:\n", err);
            });    
        });

        // Do not execute any more code in this function.
        // User and server are treated as new and command will be sent if setup was successful.
        return;
    }  

    // This will be triggered the first time a user sends a command since reboot, if it is not a new server.
    // The guild initialization above will also create the user, if necessary, and then send the command and exit.
    if (dbUsers[userID] === undefined || dbUsers[userID] == null) {

	dbAWS.readUser(userID).then(result => {

            if (result.Item === undefined || result.Item == null) {
		if (DEBUG_MESSAGE) console.log("Detected NEW user sending message in existing server: ", userID);

		epochTime = dateTime.getTime();
                dbUsers[userID] = new DBUser(userID, userName, userDisc);

		dbAWS.initUser(dbUsers[userID]).then(dropBotUser => {
		    if (DEBUG_DATABASE) console.log("initUser " + userName + "[" + userID + "]success from on.message");
                    dbUsers[userID] = dropBotUser;
		    handleCommand(args, message);

		}).catch(err => {
		    console.error("ERROR initUser: ", err);
		});

            } else {
		if (DEBUG_MESSAGE) console.log("Found existing user since client start: ", userID);

                dbUsers[userID] = new DBUser(userID, userName, userDisc);
		dbUsers[userID].blocked = result.Item.blocked;
                
		if (dbUsers[userID].blocked) {
		    console.log(`Blocked user ${userName}[${userID}] attempted to use DropBot`);
		    return;
		}
		
                dbAWS.updateUser(dbUsers[userID]).then(result => {
                    handleCommand(args, message);
                }).catch((err) => {
                    console.error("ERROR updateUser command update: " + err);
                });

	    }

	}).catch(err => {
            console.error("ERROR readUser [" + guildID + "]:\n", err);
        });    

	return;
        
    }
    
    //fixme - SPS. Only send so many messages to each blocked user.
    //  At some point, we have to ignore them. Counter can be reset at bot restart.
    if (STRIKE_SYSTEM_ENABLED) {
	if (dbUsers[userID].blocked || dbUsers[userID].strikes == Constants.USER_MAX_STRIKES) {

            if (dbUsers[userID].blocked == false) {
		dbUsers[userID].blocked  = true;
		dbAWS.updateUser(dbUsers[userID]).then(result => {
                    console.log("Successfully updated user block status in database.");
                    //fixme - SPS. Should use ShardClientUtil.broadcastEval() to alert all shards of a user being blocked.
                }).catch((err) => {
                    console.error("ERROR updateUser for blocked user: " + err);
                });
            }
            console.log("BLOCKED: User - " + user + "[" + userID + "] due to max strikes of rate limiting.");
            message.reply("You have been blocked due to rate limiting.\n" +
		          "Please wait at least an hour or contact developer at Official DropBot Support if you think this was in error." +
                          "https://discord.gg/YJWEsvV");
            return;
	}
    }

    // If a user has already been blocked in the database, we don't care about the strike system being enabled.
    //   It is possible they were blocked for another reason.
    else { // if (! (STRIKE_SYSTEM_ENABLED))

        if (dbUsers[userID].blocked) {
            console.log("BLOCKED: User - " + userName + "[" + userID + "] tried to access without strike system enabled.");
            message.reply("You have been blocked due to previous violations.\n" +
		          "Please contact developer at Official DropBot Support server if you think this was in error." +
                          "https://discord.gg/YJWEsvV");
            return;
        }
    }

    if (VOTE_SYSTEM_ENABLED) {
        if (args[0] == 'vote') {
            handleCommand(args, message);
            return;
        }
    } else {
        dbUsers[userID].isVoter = true;
    }

    // The fun part... Handling rate limiting and vote status for repeated users.
    var timeout_sec = dbUsers[userID].isVoter ? Constants.VOTE_USER_TIMEOUT_SEC : Constants.NO_VOTE_USER_TIMEOUT_SEC;

    // Use minimum rate limiting for realtime commands.
    if (args[0] == 'stop') timeout_sec = 1; 
    if (args[0] == 'i')    timeout_sec = 1;
    if (args[0] == 'info') timeout_sec = 1; 
    if (args[0] == 'h')    timeout_sec = 1;
    if (args[0] == 'help') timeout_sec = 1;

    var timeSinceLastCommand = Math.ceil((epochTime-dbUsers[userID].timeout)/1000);
    if (timeSinceLastCommand == 1) timeSinceLastCommand = 0; // Don't round up timeouts less than 1 second.
    if (DEBUG_MESSAGE) console.log("User " + userID + " time since last command: " + timeSinceLastCommand);
    
    if (timeSinceLastCommand < timeout_sec && !(isDevUser)) {

        var messageContent = "";
        dbUsers[userID].strikes = dbUsers[userID].strikes+1;
        
        if (! (dbUsers[userID].isVoter)) {

            dbl.hasVoted(userID).then(voted => {

                if (! (voted)) {

                    if (DEBUG_MESSAGE) console.log("Non-vote restricted " + timeSinceLastCommand + " seconds for user: " + userID);
		    
		    if (! (dbUsers[userID].warned)) {

			var sendWarnMessage = "\u200B";
			sendWarnMessage +"<@!" + userID + "> is temporarily rate limited to using one command every " + Constants.NO_VOTE_USER_TIMEOUT_SEC + " seconds.\n";
			sendWarnMessage += "Due to server constraints, users must be verified to use DropBot within the last 24 hours.\n";
			sendWarnMessage += "To lessen restriction to " + Constants.VOTE_USER_TIMEOUT_SEC + " second(s), simply verify user by voting for DropBot at: https://discordbots.org/bot/" + Constants.DROPBOT_ID + "/vote\n";
			if (STRIKE_SYSTEM_ENABLED) sendWarnMessage += "Strike " + dbUsers[userID].strikes + "/" + Constants.USER_MAX_STRIKES;
			dbUsers[userID].warned = true;

                        sendMessage(sendWarnMessage, message.channel, {delay: 500});

		    }

                    messageContent  = "\u200BPlease wait " + (timeout_sec-timeSinceLastCommand) +
                        " second(s) before issuing another command.\n" +
                        "You may check if your vote has been processed immediately and without penalty with \"db!vote\"";
                    message.reply(messageContent);
                    return;
                } else {
		    dbUsers[userID].isVoter = true;
                    if (DEBUG_VOTE) console.log("***** VOTE before handleCommand changed to " + voted + " for userID " + userID);
                    message.reply("\u200BThanks for voting! Restriction lessened to " + Constants.VOTE_USER_TIMEOUT_SEC + " second(s).\n");
		    return;
		}
            }).catch((err) => {
                console.log("WARNING: Could not access dbl.hasVoted database for userID: " + userID + "\n" +  err);
                return;
            });
            
        } else {
            message.reply("Please wait " + (timeout_sec-timeSinceLastCommand) + " second(s) before issuing another command.");
        }

        dbUsers[userID].timeout = dateTime.getTime();
        return;
        
    }

    // Update last access time and related stats if command succeeded
    epochTime = dateTime.getTime();
    dbUsers[userID].timeout = epochTime;
    
    if (dbUsers[userID].strikes != 0 ||
        dbUsers[userID].blocked ||
        dbUsers[userID].warned) {
        dbUsers[userID].strikes = 0;
        dbUsers[userID].blocked = false;
        dbUsers[userID].warned  = false;

        dbAWS.updateUser(dbUsers[userID]).then(dropBotUser => {
            dbUsers[userID] = dropBotUser;
            setTimeout(function() {                
                handleCommand(args, message);
            }, 100);
        }).catch((err) => {
            console.error("ERROR updateUser bot.on(message): ", err);
        });

    } else {
        setTimeout(function() {                
            handleCommand(args, message);
        }, 100);
    }


});
