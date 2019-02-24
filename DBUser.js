var Constants = require('./Constants.js');

class DBUser {

    constructor(id, name, disc) {
	this.id      = id;
        this.name    = name;
        this.disc    = disc;
	this.timeout = new Date().getTime()-1000;
	this.strikes = 0;
	this.blocked = false;
	this.isVoter = true;
	this.warned  = false; 
    }

    print() {
	console.log(`DBUser class ${this.name}#${this.disc}[${this.id}]`);
    }
    
    toString() {

        var messageContent = "```";

        messageContent += `${this.name}#${this.disc}[${this.id}]\n`;
        messageContent += "  Timeout - " + this.timeout + "\n";
	messageContent += "  Strikes - " + this.strikes + "\n";
	messageContent += "  Blocked - " + this.blocked + "\n";
	messageContent += "  IsVoter - " + this.isVoter + "\n";
    	messageContent += "  Warned  - " + this.warned  + "\n";
        
        messageContent += "```";

        return messageContent;
    }
}

module.exports = DBUser;
