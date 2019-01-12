
<p align="center"><img src="https://cdn.discordapp.com/avatars/487298106849886224/11a7eff4af1922c251ccb371599c14a2.png"></p>
<h1 align="center">Fortnite DropBot</h1>

## Description
Automated Bot for Discord VoIP application and digital distribution platform. 

Randomly selects a location to start in for the Fortnite Battle Royale game.

A small, single-file, fully featured [Discordapp](https://discordapp.com) bot built using Node.js and [discord.io](https://github.com/izy521/discord.io).
Hosted on AWS.

## Add DropBot to server:



[Add to Discord](https://discordapp.com/oauth2/authorize?client_id=487298106849886224&scope=bot&permissions=0):
https://discordapp.com/oauth2/authorize?client_id=487298106849886224&scope=bot&permissions=0

### Usage instructions:
```
Runs by sending "db!" message in a Discord server with DropBot active.
   Will randomly choose a location in Fortnite to drop.

Optional features:
usage: db![option]

db![option]    Description
-----------------------
db!            Randomly choose a Fortnite location to drop based on server settings.
db!mute        Mutes DropBot audio in voice channel.
db!unmute      Unmutes DropBot audio. Requires user by in voice channel.
db!info        Shows DropBot settings on this server
db!stop        Stop playing audio and remove DropBot from voice channel.

-----------------------
db!set [id] [weight]
  Change the chance of choosing each location.

[id]  Location
 0    Dusty Divot
 1    Fatal Fields
 2    Frosty Flights
 3    Greasy Grove
 4    Happy Hamlet
 5    Haunted Hills
 6    Junk Junction
 7    Lazy Links
 8    Lonely Lodge
 9    Loot Lake
10    Lucky Landing
11    Paradise Palms
12    Pleasant Park
13    Polar Peak
14    Retail Row
15    Salty Springs
16    Shifty Shafts
17    Snobby Shores
18    The Block
19    Tilted Towers
20    Wailing Woods

[weight] can be 0 to 10.
 10 being most likely to be chosen.
  0 being a location that will not be chosen.

All locations default to a weight of 5.
Example: To remove Happy Hamlet from the list, send message:
  "db!set 4 0
Example: To set Snobby Shores to the max chance, send message:
  "db!set 17 10
  ```

### Requirements:
* **Node.js 0.12.x** or greater
* **ffmpeg/avconv** (needs to be added to PATH)
