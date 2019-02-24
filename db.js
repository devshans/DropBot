var AWS     = require("aws-sdk");
var Constants = require('./Constants.js');

var DEBUG_DATABASE = true;

const filenameArray = __filename.split("/");
var developerMode = filenameArray[filenameArray.length-1] == "db-dev.js" ? true : false;

AWS.config.update({
    region: "us-east-2",
    endpoint: "https://dynamodb.us-east-2.amazonaws.com"
});

var docClient = new AWS.DynamoDB.DocumentClient();

// DynamoDB Table Names
var dbTableLocationsFN = "DropLocations";
var dbTableLocationsAL = "DropLocationsAL";

if (developerMode) {
    var dbTableGuilds    = "dev_DropGuilds";
    var dbTableUsers     = "dev_DropUsers";
} else {
    var dbTableGuilds    = "DropGuilds";
    var dbTableUsers     = "DropUsers";
}

// ----------------------------------------------------------------------------------------
// Database async function implementations
// ----------------------------------------------------------------------------------------

var readUser = async function (id) {

    var params = {
        TableName: dbTableUsers,
        Key:{
	    "id":id
        }
    };

    return docClient.get(params).promise();
};

var readGuild = async function(id) {

    var params = {
        TableName: dbTableGuilds,
        Key:{
	    "id":id
        }
    };

    return docClient.get(params).promise();
};

var getGuilds = async function(id) {

    var params = {
        TableName: dbTableGuilds,
        Key:{
	    "id":id
        }
    };
    
    return docClient.get(params).promise();
};

var databasePut = async function (params) {

    return docClient.put(params).promise();
    
};

var databaseUpdate = async function (params) {

    return docClient.update(params).promise();
    
};

var databaseUpdate = async function (params) {

    return docClient.update(params).promise();
    
};

var initUser = async function (dropBotUser) {

    return new Promise(function(resolve, reject) {

        var userPromise = getUsers(dropBotUser.id);

        userPromise.then(function(result) {

            var epochTime = new Date().getTime();

            if (result.Item == null) {
                if (DEBUG_DATABASE) console.log("Creating NEW user database entry: " + dropBotUser.name + "#" + dropBotUser.disc + "[" + dropBotUser.id + "]");

                var params = {
                    TableName: dbTableUsers,
                    Item:{
                        "id"           :dropBotUser.id,
                        "discriminator":dropBotUser.disc,
                        "name"         :dropBotUser.name,
                        "accessTime"   :dropBotUser.timeout,
                        "creationTime" :epochTime,
                        "lastVoteTime" :epochTime,
                        "numAccesses"  :1,
                        "numVotes"     :0,
                        "isVoter"      :false,
                        "blocked"      :false
                    }
                };

		databasePut(params).then(function(result) {
                    if (DEBUG_DATABASE) console.log("Successfully created new user entry.");
                    resolve(dropBotUser);
                }, function(err) {
                    console.error("ERROR initUser: Failed to create database entry.\n" + err);
                    reject(err);
                });

            } else {
                resolve(dropBotUser);
            }

        }, function(err) {
            console.log(err);
            reject(err);
        });

    });

};

async function updateUser(dropBotUser) {

    return new Promise(function(resolve, reject) {

        var epochTime = new Date().getTime();

        if (DEBUG_DATABASE) console.log("udpateUser: " + dropBotUser.name + "#" + dropBotUser.disc + "[" + dropBotUser.id + "]");

        var params = {
            TableName: dbTableUsers,
            Key:{
                "id":dropBotUser.id
            },
            ConditionExpression: 'attribute_exists(id)',
            UpdateExpression: "set accessTime = :a, blocked = :b, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":a":epochTime,
                ":val":1,
                ":b":dropBotUser.blocked
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {
            if (DEBUG_DATABASE) console.log("Successfully updated user database entry.");
            resolve(dropBotUser);
        }, function(err) {
            console.error("ERROR updateUser: Failed to update user database entry:\n" + err);
            reject(err);
        });

    });

};

var getUsers = async function (id) {

    console.log("getUsers: ", id);

    var params = {
        TableName: dbTableUsers,
        Key:{
	    "id":id
        }
    };

    return docClient.get(params).promise();
};


var initGuildDatabase = async function(dropBotGuild, defaultWeightsFN, defaultWeightsAL) {
   
    return new Promise(function(resolve, reject) {

        var guildPromise = getGuilds(dropBotGuild.id);

        guildPromise.then(function(result) {

            dropBotGuild.updateNotice = false;
            dropBotGuild.defaultWeightsFN = defaultWeightsFN;
            dropBotGuild.defaultWeightsAL = defaultWeightsAL;

            var dbStringFN = defaultWeightsFN.reduce((map, obj) => (map[obj.id] = obj.weight, map), {});
	    var dbStringAL = defaultWeightsAL.reduce((map, obj) => (map[obj.id] = obj.weight, map), {});

	    var epochTime = new Date().getTime();
	    
            if (result.Item == null) {
                // Create entry in database.
                console.log("Creating NEW guild database entry: " + dropBotGuild.name + "[" + dropBotGuild.id + "]");
                var params = {
                    TableName: dbTableGuilds,
                    Item:{
                        "name":dropBotGuild.name,
                        "id":dropBotGuild.id,
                        "numAccesses":1,
                        "dropLocations":dbStringFN,
                        "dropLocationsAL":dbStringAL,			
			"audioMute":false,
                        "updateNotice":true,
			"defaultGame":"fortnite",
			"lastVoteTime":epochTime			
                    }
                };

                databasePut(params).then(function(result) {
                    if (DEBUG_DATABASE) console.log("Successfully created NEW guild database entry.");
                    resolve(dropBotGuild);
                }, function(err) {
                    console.error("ERROR: Failed to create database entry:\n" + err);
                    reject(err);
                });

            } else {
                if (DEBUG_DATABASE) console.log("Guild already exists in database..");

                //fixme - SPS. Push these guilds to a queue that is sent out separately.
                // Send a message to the guild if it is the first access since an update.
                if (! (result.Item.updateNotice)) {
                    dropBotGuild.updateNotice = true;
                    console.log("*** Sending update message to guild: " + dropBotGuild.id);
                }
                
                resolve(dropBotGuild);
            }

        }, function(err) {
            console.log(err);
            reject(err);
        });

    });

};


var initGuild = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        var promises = [];

        if (DEBUG_DATABASE) console.log("Getting dropLocation weights for guild: " + dropBotGuild.id);

        dropBotGuild.dropLocationsFN = [];
        dropBotGuild.dropWeightsFN   = 0;
        dropBotGuild.dropLocationsAL = [];
        dropBotGuild.dropWeightsAL   = 0;
        dropBotGuild.defaultGame     = "fortnite";
	dropBotGuild.audioMute       = false;

        readGuild(dropBotGuild.id).then(result => {

	    if (result.Item === undefined || result.Item == null) {
                console.error("ERROR initGuild " + dropBotGuild.id + ":\nresult.Item is null.");
                reject ("result.Item is null");
	    }
	    
	    var myDropLocationsFN = result.Item.dropLocations;
	    var myDropLocationsAL = result.Item.dropLocationsAL;

	    dropBotGuild.defaultGame = result.Item.defaultGame;            
	    dropBotGuild.audioMute   = result.Item.audioMute;

	    for (var i in myDropLocationsFN) {
                dropBotGuild.dropWeightsFN += myDropLocationsFN[i];
                dropBotGuild.dropLocationsFN.push({
		    id: i,
		    weight: myDropLocationsFN[i]
                });
	    }

	    for (var i in myDropLocationsAL) {
                dropBotGuild.dropWeightsAL += myDropLocationsAL[i];
                dropBotGuild.dropLocationsAL.push({
		    id: i,
		    weight: myDropLocationsAL[i]
                });
	    }

	    resolve(dropBotGuild);
	    
        }).catch((e) => {
	    console.error("ERROR initGuild " + dropBotGuild.id + ":\n" + e);
	    reject(e);
        });

    });

};

var resetGuild = async function(dropBotGuild, defaultWeightsFN, defaultWeightsAL) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("resetGuild for guild: ", dropBotGuild.id);



        dropBotGuild.defaultGame = "fortnite";
    	dropBotGuild.audioMute   = false;

        var prevDropLocationsFN = dropBotGuild.dropLocationsFN;       
        var prevDropLocationsAL = dropBotGuild.dropLocationsAL;

        dropBotGuild.dropLocationsFN = [];
        dropBotGuild.dropWeightsFN   = 0;
        for (var dropLocationID in prevDropLocationsFN) {
            dropBotGuild.dropLocationsFN.push({
                id: dropLocationID,
                weight: defaultWeightsFN[dropLocationID]['weight']
            });
            dropBotGuild.dropWeightsFN += Number(defaultWeightsFN[dropLocationID]['weight']);
        }
	
        dropBotGuild.dropLocationsAL = [];
        dropBotGuild.dropWeightsAL   = 0;
        for (var dropLocationID in prevDropLocationsAL) {
            dropBotGuild.dropLocationsAL.push({
                id: dropLocationID,
                weight: defaultWeightsAL[dropLocationID]['weight']
            });
            dropBotGuild.dropWeightsAL += Number(defaultWeightsAL[dropLocationID]['weight']);
        }
      

        var dbStringFN = dropBotGuild.dropLocationsFN.reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});
        var dbStringAL = dropBotGuild.dropLocationsAL.reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});	

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set dropLocations = :dfn, dropLocationsAL = :dal, defaultGame = :dg, audioMute = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":dfn":dbStringFN,
		":dal":dbStringAL,
                ":dg":dropBotGuild.defaultGame,
                ":bool":dropBotGuild.audioMute,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {	
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildAll: Failed to update database entry.\n" + err);
            reject(err);
        });

    });
    
};


var updateGuildAll = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildAll for guild: ", dropBotGuild.id);

        var dbStringFN = dropBotGuild.dropLocationsFN.reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});
        var dbStringAL = dropBotGuild.dropLocationsAL.reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});	

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set dropLocations = :dfn, dropLocationsAL = :dal, defaultGame = :dg, audioMute = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":dfn":dbStringFN,
		":dal":dbStringAL,
                ":dg":dropBotGuild.defaultGame,
                ":bool":dropBotGuild.audioMute,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {	
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildAll: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

};


var updateGuildDropsFN = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildDropsFN for guild: ", dropBotGuild.id);

        var dbStringFN = dropBotGuild.dropLocationsFN.reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set dropLocations = :d, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":d":dbStringFN,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildDropsFN: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

};

var updateGuildDropsAL = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildDropsAL for guild: ", dropBotGuild.id);

        var dbStringAL = dropBotGuild.dropLocationsAL.reduce((map, obj) => (map[obj.id] = parseInt(obj.weight), map), {});

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set dropLocationsAL = :d, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":d":dbStringAL,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {
            if (DEBUG_DATABASE) console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildDropsAL: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

};

var updateGuildDefaultGame = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildDefaultGame for guild: ", dropBotGuild.id, " to ", dropBotGuild.defaultGame);

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set defaultGame = :dg, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":dg":dropBotGuild.defaultGame,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {
            console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildDefaultGame: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

};

var updateGuildAudioMute = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildAudioMute for guild: ", dropBotGuild.id, " to ", dropBotGuild.audioMute);

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set audioMute = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":bool":dropBotGuild.audioMute,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {
            console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildAudioMute: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

};

var updateGuildUpdateNotice = async function(dropBotGuild) {

    return new Promise(function(resolve, reject) {

        if (DEBUG_DATABASE) console.log("updateGuildUpdateNotice for guild: ", dropBotGuild.id, " to \"true\"");

        var params = {
            TableName: dbTableGuilds,
            Key:{
                "id":dropBotGuild.id
            },
            UpdateExpression: "set updateNotice = :bool, numAccesses = numAccesses + :val",
            ExpressionAttributeValues:{
                ":bool":true,
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        };

	databaseUpdate(params).then(function(result) {
            console.log("Successfully updated entry.");
            resolve(dropBotGuild);
        }, function(err) {
            console.error("ERROR updateGuildUpdateNotice: Failed to update database entry.\n" + err);
            reject(err);
        });

    });

};


var getDropLocationFN = async function (id) {

    var params = {
        TableName: dbTableLocationsFN,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
};

var getDropLocationAL = async function (id) {

    var params = {
        TableName: dbTableLocationsAL,
        Key:{
            "id":id
        }
    };

    return docClient.get(params).promise();
};


var initDefaultWeightsFN = async function () {

    return new Promise(function(resolve, reject) {

        var promises = [];
        var defaultWeightsFN = [];

        console.log("Getting Fortnite default weights for client.");

        for (var id = 0; id < Constants.dropLocationNamesFN.length; id++) {
            promises.push(getDropLocationFN(id));
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

var initDefaultWeightsAL = async function () {

    return new Promise(function(resolve, reject) {

        var promises = [];
        var defaultWeightsAL = [];

        console.log("Getting Apex default weights for client.");

        for (var id = 0; id < Constants.dropLocationNamesAL.length; id++) {
            promises.push(getDropLocationAL(id));
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

};


// ----------------------------------------------------------------------------------------
// Database function exports
// ----------------------------------------------------------------------------------------

module.exports = {
    
    databasePut    : databasePut,
    databaseUpdate : databaseUpdate,

    // DropBot Locations Database(s) Functions
    initDefaultWeightsFN : initDefaultWeightsFN,
    initDefaultWeightsAL : initDefaultWeightsAL,

    // DropBot User Database Functions
    initUser   : initUser,
    readUser   : readUser,
    updateUser : updateUser,
    getUsers   : getUsers,
        
    // DropBot Guild Database functions

    initGuildDatabase       : initGuildDatabase,
    initGuild               : initGuild,
    readGuild               : readGuild,
    resetGuild              : resetGuild,
    getGuilds               : getGuilds,  
    updateGuildAll          : updateGuildAll,
    updateGuildDropsFN      : updateGuildDropsFN,
    updateGuildDropsAL      : updateGuildDropsAL,
    updateGuildDefaultGame  : updateGuildDefaultGame,
    updateGuildAudioMute    : updateGuildAudioMute,
    updateGuildUpdateNotice : updateGuildUpdateNotice,
    
    
}
