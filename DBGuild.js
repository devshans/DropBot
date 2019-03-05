var Constants = require('./Constants.js');

class DBGuild {

    constructor(id, name) {
	this.id = id;
        this.name = name;
        this.majorVersion = Constants.majorVersion;
        this.majorVersion = Constants.minorVersion;
	this.dropLocationsFN = {};
	this.dropWeightsFN   = {};
	this.dropLocationsAL = {};
	this.dropWeightsAL   = {};
	this.defaultGame     = {}; 
	this.audioMute       = {};
	this.updateNotice    = {};
    }

    print() {
	console.log(`DBGuild class ${this.name}[${this.id}]`);
    }

    headerString() {
        return (`DropBot ${this.majorVersion}.${this.minorVersion} Guild Settings\n` +
                "---------------------------------\n" + 
	        "Server ID    : " + this.id           + "\n" + 
	        "Server Name  : " + this.name         + "\n" +
                "Default Game : " + this.defaultGame  + "\n" + 
	        "Audio Muted  : " + this.audioMute    + "\n\n");
    }

    fortniteHeader() {
        return( "-------------- Fortnite ---------------\n" +
                "  ID   Location        Weight  % Chance\n" + 
                "  -------------------------------------\n" );
    }

    fortniteWeights() {
        
        var messageContent = "";
        var dropChance = 0;
        for (var i in this.dropLocationsFN) {

            var dropLocationID = i;
            var dropLocationWeight = this.dropLocationsFN[i]['weight'];
            var dropLocationName   = Constants.dropLocationNamesFN[dropLocationID];
            var dropChance         = this.dropLocationsFN[dropLocationID]['weight'] / this.dropWeightsFN * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);

	    messageContent += "  ";
            if (dropLocationID < 10) messageContent += " " + dropLocationID;
            else                     messageContent += dropLocationID;

            messageContent += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                messageContent += " ";
            }

            messageContent += " - " + dropLocationWeight + "   ";
            if (dropLocationWeight != 10) messageContent += " ";

            messageContent += " - " + dropChance + "%\n";
            
        }
        return messageContent;

    }

    fortniteFooter() {
        return ("  ------------------------------------\n" +
                "Total weight: " + this.dropWeightsFN + "\n\n"
               );
        
    }

    apexHeader() {
        return( "------------ Apex Legends -------------\n" +
                "  ID   Location        Weight  % Chance\n" + 
                "  -------------------------------------\n" );
    }    

    apexWeights() {
        
        var messageContent = "";
        var dropChance = 0;
        for (var i in this.dropLocationsAL) {

            var dropLocationID = i;
            var dropLocationWeight = this.dropLocationsAL[i]['weight'];
            var dropLocationName   = Constants.dropLocationNamesAL[dropLocationID];
            var dropChance         = this.dropLocationsAL[dropLocationID]['weight'] / this.dropWeightsAL * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);

	    messageContent += "  ";
            if (dropLocationID < 10) messageContent += " " + dropLocationID;
            else                     messageContent += dropLocationID;

            messageContent += " - " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                messageContent += " ";
            }

            messageContent += " - " + dropLocationWeight + "   ";
            if (dropLocationWeight != 10) messageContent += " ";

            messageContent += " - " + dropChance + "%\n";
            
        }
        return messageContent;

    }

    apexFooter() {
        return ("  ------------------------------------\n" +
                "Total weight: " + this.dropWeightsAL + "\n\n"
               );
        
    }

    fortniteToString() {
        return (this.fortniteHeader()  +
                this.fortniteWeights() +
                this.fortniteFooter()
               );
    }

    apexToString() {
        return (this.apexHeader()  +
                this.apexWeights() +
                this.apexFooter()
               );
    }   
    
    toString() {

        var messageContent = "```";

        messageContent += this.headerString();
        messageContent += this.fortniteToString();
        messageContent += this.apexToString();
        
        messageContent += "```";

        return messageContent;
    }
}

module.exports = DBGuild;
