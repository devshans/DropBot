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

    gameHeaderString() {      
                
        return("+----+------------------------------+-------------------------------+\n" +            
               "|    |         Fortnite             |           Apex Legends        |\n" +
               "+----+------------------------------+-------------------------------+\n" +
               "| ID |   Location     | Wt | Chance |    Location     | Wt | Chance |\n" +
               "+----+----------------+----+--------+-----------------+----+--------+\n");
    }   

    gameTable() {

        var messageContent = "";
        var dropChance = 0;

        var dropLocationID = 0;
        var dropLocationWeight;
        var dropLocationName;
        
        for (var i in this.dropLocationsFN) {

            dropLocationID = i;
            dropLocationWeight = this.dropLocationsFN[i]['weight'];
            dropLocationName   = Constants.dropLocationNamesFN[dropLocationID];
            dropChance         = this.dropLocationsFN[dropLocationID]['weight'] / this.dropWeightsFN * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);            

	    messageContent += "| ";
            if (dropLocationID < 10) messageContent += " " + dropLocationID;
            else                     messageContent += dropLocationID;

            messageContent += " | " + dropLocationName;
            for (var j = dropLocationName.length; j < 14; j++) {
                messageContent += " ";
            }

            messageContent += " | " + dropLocationWeight;
            if (dropLocationWeight != 10) messageContent += " ";

            messageContent += " |  " + dropChance + "% ";

            if (this.dropLocationsAL[i] === undefined || this.dropLocationsAL[i] === null) {
                messageContent += " |                 |    |        |\n";
                continue;
            }

            dropLocationWeight = this.dropLocationsAL[i]['weight'];
            dropLocationName   = Constants.dropLocationNamesAL[dropLocationID];
            dropChance         = this.dropLocationsAL[dropLocationID]['weight'] / this.dropWeightsAL * 100;
            if (dropChance != 100) dropChance = dropChance.toPrecision(2);            

            messageContent += " | " + dropLocationName;
            for (var j = dropLocationName.length; j < 15; j++) {
                messageContent += " ";
            }

            messageContent += " | " + dropLocationWeight;
            if (dropLocationWeight != 10) messageContent += " ";

            messageContent += " |  " + dropChance + "%  |\n";
            
        }
        messageContent += "+----+------------------------------+-----------------+----+--------+\n";
        return messageContent;

        
    }

    headerString() {
        var messageContent = "";
        var versionNum = this.majorVersion < 10 ?
            `DropBot ${this.majorVersion}.${this.minorVersion} Guild Settings ` :
            `DropBot ${this.majorVersion}.${this.minorVersion} Guild Settings` ;
        var guildName = this.name;
        if (this.name.length < 25) {
            for (var j = this.name.length; j < 15; j++) {
                guildName += " ";
            }
        } else {
            guildName = this.name.substring(0, 15);
        }
        var audioMuteString = this.audioMute ? "True " : "False";
        var defaultGameString = this.defaultGame == "fortnite" ? "  Fortnite  " : "Apex Legends";

        messageContent += "+-------------------------------------------------------------------+\n";
        messageContent += `|                     ${versionNum}                   |\n`;
        messageContent += `+-------------------------------------------------------------------+\n`;
        messageContent += `|   Guild ID   | ${this.id} | Guild Name  | ${guildName} |\n`;
        messageContent += `+--------------+--------------------+-------------+-----------------+\n`;
        messageContent += `| Default Game | ${defaultGameString}       | Audio Muted | ${audioMuteString}           |\n`;
        messageContent += "+-------------------------------------------------------------------+\n";

        return messageContent;
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
