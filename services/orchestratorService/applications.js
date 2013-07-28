var dbService = require('dbService'),
	request = require('request'),
	path = require('path'),
	fs = require('fs'),
	runners;

//Until db service is implimented, use this.
var tempApplicationList = [];

exports.runners = runners;

exports.init = function(dbServiceIP, runners) {
	dbService.init(dbServiceIP);
	this.runners = runners;
}

/*
 * Get a list of active runners from database 
 */
exports.list = function() {
	return tempRunnerList;
};

exports.deploy = function(appName) {
	var currentList = exports.runners.list();
	var availableRunner = exports.runners.getAvailableRunner();
	var runnerIp;
	for(var i = 0; i<currentList.length; i++){
		if(currentList[i].id == availableRunner){
			currentList[i].appName = appName;
			exports.runners.updateRunner(currentList[i].id, currentList[i]);
			runnerIp = currentList[i].ip;
			console.log(currentList[i].ip);
			break;
		}
	}
	console.log(path.join(__dirname, 'apps/' + appName + ".tar.gz"));
	var r = request.post(runnerIp + "/application/start")
	var form = r.form()

	form.append('applicationTar', fs.createReadStream(path.join(__dirname, 'apps/' + appName + ".tar.gz")));
	
	form.append('applicationName', appName);
}