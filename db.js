var AWS     = require("aws-sdk");

var DEBUG_DATABASE = true;

//fixme - SPS. Change this back for release.
//var developerMode = filenameArray[filenameArray.length-1] == "DropBot-dev.js" ? true : false;
var developerMode = true;

AWS.config.update({
    region: "us-east-2",
    endpoint: "https://dynamodb.us-east-2.amazonaws.com"
});

var docClient = new AWS.DynamoDB.DocumentClient();

// DynamoDB Table Names
var dbTableLocationsFN = "DropLocations";
var dbTableLocationsAL = "DropLocationsAL";

//fixme - SPS. Auto-detect like in main file
var developerMode = true;

if (developerMode) {
    var dbTableGuilds    = "dev_DropGuilds";
    var dbTableUsers     = "dev_DropUsers";
} else {
    var dbTableGuilds    = "DropGuilds";
    var dbTableUsers     = "DropUsers";
}


module.exports = {
    
    scanUsers : function(callback) {
	docClient.scan({TableName: dbTableUsers}, callback);
    },

    // ----------------------------------------------------------------------------------------
    // Database async functions
    // ----------------------------------------------------------------------------------------

    databasePut : async function (params) {

	return docClient.put(params).promise();
	
    },

    databaseUpdate : async function (params) {

	return docClient.update(params).promise();
	
    },
    
    getDropBotUsers : async function (id) {

	console.log("getDropBotUsers: ", id);

	var params = {
            TableName: dbTableUsers,
            Key:{
		"id":id
            }
	};

	return docClient.get(params).promise();
    },

    getDropBotGuilds : async function (id) {

	var params = {
            TableName: dbTableGuilds,
            Key:{
		"id":id
            }
	};

	return docClient.get(params).promise();
    },

    getDropLocationFN : async function (id) {

	var params = {
            TableName: dbTableLocationsFN,
            Key:{
		"id":id
            }
	};

	return docClient.get(params).promise();
    },

    getDropLocationAL : async function (id) {

	var params = {
            TableName: dbTableLocationsAL,
            Key:{
		"id":id
            }
	};

	return docClient.get(params).promise();
    },

    readUser : async function (id) {

	var params = {
            TableName: dbTableUsers,
            Key:{
		"id":id
            }
	};

	return docClient.get(params).promise();
    },

    readGuild : async function (id) {

	var params = {
            TableName: dbTableGuilds,
            Key:{
		"id":id
            }
	};

	return docClient.get(params).promise();
    }
    
}

