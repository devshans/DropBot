/*
    @document   : DropBotSharder.js
    @author     : devshans
    @copyright  : 2019, devshans
    @license    : The MIT License (MIT) - see LICENSE
    @repository : https://github.com/devshans/DropBot
    @description: Utility class that spawns shards of the DropBot process. 
                  Each shard is completely separate from the other. 
*/

// Allow a separate Developer bot for testing to be spawned based on the filename.
const filenameArray = __filename.split("/");
const developerMode = filenameArray[filenameArray.length-1] == "DropBotSharder-dev.js" ? true : false;
if (developerMode) console.log("Launching DropBotSharder-dev.js in DEVELOPER mode.");
else               console.log("** Launching DropBotSharder.js in PRODUCTION mode. **"); 

// Read in DropBot configuration and configure appropriately
const config = require('./config.json')
const token    = developerMode ? config.tokenDev    : config.token;
const mainFile = developerMode ? "./DropBot-dev.js" : "./DropBot.js";

// Args to send to main DropBot process.
//   Will show up starting at index 2. e.g. "process.argv[2]"
const shardArgs = [
    developerMode // Passed as string "true" or "false" to specify if it is a developer bot for testing
]

// The Shard Manager takes a path to a file and spawns it under the 
//   specified amount of shards safely. 
// If you do not select an amount of shards, the manager will automatically 
//   decide the best amount.
const { ShardingManager } = require('discord.js');
const manager = new ShardingManager(mainFile, { token: token, shardArgs: shardArgs });

// Set number of shards to spawn.
//   "undefined" will use default which will allow the manager to automatically decide the best amount.
const numShards = developerMode ? 2 : undefined; 

manager.spawn(numShards, 1000).then(() => console.log(`[SHARD] ShardingManager successful spawn`))
    .catch(err => console.error(`[SHARD] ShardingManager failed to spawn shards\n${err}`));

// Emitted upon launching a shard.
manager.on('launch', shard => console.log(`[SHARD] Launch event complete - ${shard.manager.totalShards} shards`));

// Emitted upon recieving a message from a shard.
//   e.g. client.shard.send(`Hello shard from shard ${client.shard.id}`);
manager.on('message', function(shard, message) {
    //console.log(`[SHARD] Received message from Shard ID ${shard.id}:\n${message}`);
});
