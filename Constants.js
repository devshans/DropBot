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

module.exports = {
    dropLocationNamesFN : dropLocationNamesFN,
    dropLocationNamesAL : dropLocationNamesAL,

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
