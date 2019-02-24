/*
    @document   : DropBotSharder.js
    @author     : devshans
    @copyright  : 2019, devshans
    @license    : The MIT License (MIT) - see LICENSE
    @repository : https://github.com/devshans/DropBot
*/

const { ShardingManager } = require('discord.js');

// Allow a separate Developer bot to be spawned based on the filename.
const filenameArray = __filename.split("/");
const developerMode = filenameArray[filenameArray.length-1] == "DropBotSharder-dev.js" ? true : false;

const config = require('./config.json')

if (developerMode) console.log("Launching DropBotSharder-dev.js in DEVELOPER mode.");
else               console.log("** Launching DropBotSharder.js in PRODUCTION mode. **"); 

const token    = developerMode ? config.tokenDev    : config.token;
const mainFile = developerMode ? "./DropBot-dev.js" : "./DropBot.js";

const shardArgs = [
    developerMode
]

const manager = new ShardingManager(mainFile, { token: token, shardArgs: shardArgs });

const numShards = developerMode ? 2 : undefined; // undefined will use default which will autoscale.

//manager.spawn();
manager.spawn(numShards, 1000).then(() => console.log(`[SHARD] ShardingManager successful spawn`))
    .catch(err => console.error(`[SHARD] ShardingManager failed to spawn shards\n${err}`));

manager.on('launch', shard => console.log(`[SHARD] Launch event complete - ${shard.manager.totalShards} shards`));

// Recieves messages from shard.
//   e.g. client.shard.send(`Hello shard from shard ${client.shard.id}`);
manager.on('message', function(shard, message) {
    console.log(`[SHARD] Received message from Shard ID ${shard.id}:\n${message}`);
});
