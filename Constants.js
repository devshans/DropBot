/*
    @document   : Constants.js
    @author     : devshans
    @copyright  : 2019, devshans
    @license    : The MIT License (MIT) - see LICENSE
    @repository : https://github.com/devshans/DropBot
*/

const MAJOR_VERSION = 9;
const MINOR_VERSION = 4;

const DEFAULT_WEIGHT    = 5;
const NUM_LOCATIONS_MAX = 50
const NUM_LOCATIONS_FN  = 21;
const NUM_LOCATIONS_AL  = 17;

// Fortnite specific stuff
var dropLocationNamesFN = [
    "Dusty Divot"
    ,"Fatal Fields"
    ,"Frosty Flights"
    ,"Happy Hamlet"
    ,"Haunted Hills"
    ,"Junk Junction"
    ,"Lazy Lagoon"
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
    ,"Sunny Steps"
    ,"The Block"
    ,"Tilted Towers"
    ,"Volcano"    
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

// Initialize arrays of default weights
var defaultWeightsMax = [];
var defaultWeightsFN  = [];
var defaultWeightsAL  = [];

for (var i = 0; i < NUM_LOCATIONS_MAX; i++) {
    defaultWeightsMax.push({
        id: i,
        weight: DEFAULT_WEIGHT
    });
}

//fixme - SPS. Make this configurable for legal array indices that can be non-consecutive.
for (var i = 0; i < NUM_LOCATIONS_FN; i++) {
    defaultWeightsFN.push({
        id: i,
        weight: DEFAULT_WEIGHT
    });
}
for (var i = 0; i < NUM_LOCATIONS_AL; i++) {
    defaultWeightsAL.push({
        id: i,
        weight: DEFAULT_WEIGHT
    });
}

module.exports = {

    MAJOR_VERSION : MAJOR_VERSION,
    MINOR_VERSION : MINOR_VERSION,

    DEFAULT_WEIGHT : DEFAULT_WEIGHT,
    NUM_LOCATIONS_MAX : NUM_LOCATIONS_MAX,
    NUM_LOCATIONS_FN : NUM_LOCATIONS_FN,
    NUM_LOCATIONS_AL : NUM_LOCATIONS_AL,
    
    dropLocationNamesFN : dropLocationNamesFN,
    dropLocationNamesAL : dropLocationNamesAL,

    defaultWeightsMax : defaultWeightsMax,
    defaultWeightsFN  : defaultWeightsFN,
    defaultWeightsAL  : defaultWeightsAL,

    // Discord ID of this bot to identify ourselves.
    DROPBOT_ID      : "487298106849886224",
    DEV_DROPBOT_ID  : "533851604651081728",

    DROPBOT_SERVER_ID        : "534217612805275658", // Official DropBot Server
    DROPBOT_TEST_CHANNEL_ID1 : "535268088569135116", // dropbot-test-1
    DROPBOT_TEST_CHANNEL_ID2 : "535268112833052672", // dropbot-test-2

    NO_VOTE_USER_TIMEOUT_SEC : (1 * 60),
    VOTE_USER_TIMEOUT_SEC    : 1,
    USER_MAX_STRIKES         : 5,
    
    DEFAULT_WEIGHT :  5,
    MAX_WEIGHT     : 10
    
}
