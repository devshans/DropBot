const auth = require('./auth.json')

const { ShardingManager } = require('discord.js');

const manager = new ShardingManager('./DropBot.js', { token: auth.token });

manager.spawn();
manager.on('launch', shard => console.log(`[SHARD] Shard ${shard.id}/${shard.manager.totalShards}`));
