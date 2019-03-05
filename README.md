
<p align="center"><img src="https://images.discordapp.net/avatars/487298106849886224/3a7aecf76365ae6df789ff9486a32d47.png"></p>
<h1 align="center">Apex Legends and Fortnite DropBot</h1>

<p align="center">
  <a href="https://discordbots.org/bot/487298106849886224" >
    <img src="https://discordbots.org/api/widget/487298106849886224.svg" alt="DropBot" />
  </a>
</p>

## Description
Automated Bot for Discord VoIP application and digital distribution platform. 

Randomly selects a location to start in for the Apex Legends and Fortnite Battle Royale games.

[Official Discord Bot](https://discordbots.org/bot/487298106849886224):
https://discordbots.org/bot/487298106849886224

A small, single-file, fully featured [Discordapp](https://discordapp.com) bot built using Node.js and [discord.js](https://discord.js.org).
Hosted on AWS.

## Add DropBot to server:

[Add to Discord](https://discordapp.com/oauth2/authorize?client_id=487298106849886224&scope=bot&permissions=0):
https://discordapp.com/oauth2/authorize?client_id=487298106849886224&scope=bot&permissions=0

### Usage instructions:
```
Add DropBot to a Discord server and see help by sending a "db!help" message in a channel with DropBot active.
   Will randomly choose a location in Apex Legends and Fortnite to drop.
   
Optional features:
usage: db![option]

db![option]    Description
-----------------------
db!drop  /  db!       : Uses the default game location for randomly choosing a drop location. Change with "db!default"
db!default [game]     : Sets the default game for "db!drop" and "db!" commands. Legal options are "apex" and "fortnite".
db!fortnite           : Randomly choose a Fortnite location to drop based on server settings.
db!apex               : Randomly choose an Apex Legends location to drop based on server settings.
db!mute               : Mutes DropBot audio in voice channel.
db!unmute             : Unmutes DropBot audio. Requires user to be in a voice channel.
db!settings           : Shows all DropBot settings on this server.
db!reset              : Resets all DropBot settings to their defaults on this server.
db!info               : Shows DropBot information and links/commands for additional help.
db!stop               : Stop playing audio and remove DropBot from voice channel.
db!help               : Show this help message again.
db!donate             : Get link to donate to help support bot development and hosting fees.
db!vote               : Check and update vote status for bot within the last 24 hours without rate limit penalty.
db!set  [id] [weight] : Change the percentage chance of choosing each Fortnite location. Use "db!set help" for more info.
db!aset [id] [weight] : Change the percentage chance of choosing each Apex Legends location. Use "db!set help" for more info.

-----------------------
db!set [id] [weight]
  Change the chance of choosing each Fortnite location.

-------------- Fortnite ---------------
  ID   Location        Weight  % Chance
  -------------------------------------
   0 - Dusty Divot     - 5     - 4.8%
   1 - Fatal Fields    - 5     - 4.8%
   2 - Frosty Flights  - 5     - 4.8%
   3 - Happy Hamlet    - 5     - 4.8%
   4 - Haunted Hills   - 5     - 4.8%
   5 - Junk Junction   - 5     - 4.8%
   6 - Lazy Lagoon     - 5     - 4.8%
   7 - Lonely Lodge    - 5     - 4.8%
   8 - Loot Lake       - 5     - 4.8%
   9 - Lucky Landing   - 5     - 4.8%
  10 - Paradise Palms  - 5     - 4.8%
  11 - Pleasant Park   - 5     - 4.8%
  12 - Polar Peak      - 5     - 4.8%
  13 - Retail Row      - 5     - 4.8%
  14 - Salty Springs   - 5     - 4.8%
  15 - Shifty Shafts   - 5     - 4.8%
  16 - Snobby Shores   - 5     - 4.8%
  17 - Sunny Steps     - 5     - 4.8%
  18 - The Block       - 5     - 4.8%
  19 - Tilted Towers   - 5     - 4.8%
  20 - Tomato Temple   - 5     - 4.8%
  ------------------------------------
Total weight: 105

db!aset [id] [weight]
  Change the chance of choosing each Fortnite location.

------------ Apex Legends -------------
  ID   Location        Weight  % Chance
  -------------------------------------
   0 - Airbase         - 5     - 5.9%
   1 - Artillery       - 5     - 5.9%
   2 - Bridges         - 5     - 5.9%
   3 - Bunker          - 5     - 5.9%
   4 - Cascades        - 5     - 5.9%
   5 - Hydro Dam       - 5     - 5.9%
   6 - Market          - 5     - 5.9%
   7 - Relay           - 5     - 5.9%
   8 - Repulsor        - 5     - 5.9%
   9 - Runoff          - 5     - 5.9%
  10 - Skull Town      - 5     - 5.9%
  11 - Slum Lakes      - 5     - 5.9%
  12 - Swamps          - 5     - 5.9%
  13 - The Pit         - 5     - 5.9%
  14 - Thunderdome     - 5     - 5.9%
  15 - Water Treatment - 5     - 5.9%
  16 - Wetlands        - 5     - 5.9%
  ------------------------------------
Total weight: 85


[weight] can be 0 to 10.
 10 being most likely to be chosen.
  0 being a location that will not be chosen.

All locations default to a weight of 5.
Example: To remove Fortnite's Happy Hamlet from the list, send message:
  "db!set 3 0
Example: To set Apex Legend's Slum Lakes to the max chance, send message:
  "db!aset 11 10
  ```
  
