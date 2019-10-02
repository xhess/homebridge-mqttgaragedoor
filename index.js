// MQTT GarageDoor Accessory plugin for HomeBridge
//
// Remember to add accessory to config.json. Example:
// "accessories": [
//     {
//            	"accessory": "mqttgaragedoor",
//            	"name": "NAME OF THE GARAGE DOOR OPENER",
//            	"url": "URL OF THE BROKER",
//  	      	"username": "USERNAME OF THE BROKER",
//		"password": "PASSWORD OF THE BROKER"
// 		"caption": "LABEL OF THE GARAGE DOOR OPENER",
//		"lwt": "OPTIONAL: DOOR OPENER MQTT LAST WILL AND TESTAMENT TOPIC"
//		"lwtPayload": "lwt Payload"
// 		"topics": {
// 				"statusSet": 	"MQTT TOPIC TO SET THE DOOR OPENER"
// 				"statusGet": 	"OPTIONAL: MQTT TOPIC TO GET THE DOOR STATUS",
// 				"statusTele": 	"OPTIONAL: MQTT TOPIC TO GET THE DOOR STATUS FROM RECURING TELEMETRY",
// 				"openValue": 	"OPTIONAL VALUE THAT MEANS OPEN (DEFAULT true)"
// 				"closedValue": 	"OPTIONAL VALUE THAT MEANS CLOSED (DEFAULT true)"
//				"statusCmdTopic": "OPTIONAL: MQTT TOPIC TO ASK ABOUT THE STATUS",
//				"statusCmd": "OPTIONAL: THE STATUS COMMAND ( DEFAULT "")",
// 			},
//              "doorRunInSeconds": "OPEN/CLOSE RUN TIME IN SECONDS (DEFAULT 20"),
//		"pauseInSeconds" : "IF DEFINED : AUTO CLOSE AFTER [Seconds]" 
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

'use strict';

var Service, Characteristic, DoorState, PlatformAccessory;
var mqtt = require('mqtt');

/**
 * A simple clone function that also allows you to pass an "extend" object whose properties will be
 * added to the cloned copy of the original object passed.
 */
function clone(object, extend) {

  var cloned = {};

  for (var key in object) {
    cloned[key] = object[key];
  }

  for (var key in extend) {
    cloned[key] = extend[key];
  }

  return cloned;
};

function findVal(object, key) {
    var value;
    Object.keys(object).some(function(k) {
        if (k === key) {
            value = object[k];
            return true;
        }
        if (object[k] && typeof object[k] === 'object') {
            value = findVal(object[k], key);
            return value !== undefined;
        }
    });
    return value;
}

function MqttGarageDoorAccessory(log, config) {
  	this.log          	= log;
  	this.name 		= config["name"];
  	this.url 		= config["url"];
	this.client_Id 		= 'mqttjs_' + Math.random().toString(16).substr(2, 8);
	this.options = {
	    	keepalive: 10,
    		clientId: this.client_Id,
	    	protocolId: 'MQTT',
    		protocolVersion: 4,
    		clean: true,
    		reconnectPeriod: 2000,
    		connectTimeout: 30 * 1000,
		will: {
			topic: '/lwt',
			payload: this.name + ' Connection Closed abnormally..!',
			qos: 0,
			retain: false
		},
	    	username: config["username"],
		password: config["password"],
    		rejectUnauthorized: false
	};

	this.caption		= config["caption"];
	this.topicStatusTele	= config["topics"].statusTele; 
	this.topicStatusGet	= config["topics"].statusGet;
	this.topicStatusSet	= config["topics"].statusSet;
	this.OpenValue		= ( config["topics"].openValue !== undefined ) ? config["topics"].openValue : "true";
	this.ClosedValue	= ( config["topics"].closedValue !== undefined ) ? config["topics"].closedValue : "true";
	this.statusCmdTopic	= config["topics"].statusCmdTopic; 
	this.statusCmd		= ( config["topics"].statusCmd !== undefined ) ? config["topics"].statusCmd : "";
	this.statusToggleCmd	= ( config["topics"].statusToggleCmd !== undefined ) ? config["topics"].statusToggleCmd : "on";

	if( this.topicStatusTele != undefined || this.topicStatusGet != undefined ) {
		this.lwt = config["lwt"];
		this.lwt_payload = config["lwtPayload"];
 	};

	this.doorRunInSeconds 	= (config["doorRunInSeconds"] !== undefined ? config["doorRunInSeconds"] : 20 ); 
	if( !( this.topicStatusTele !== undefined || this.topicStatusGet !== undefined ) ) this.pauseInSeconds = config["pauseInSeconds"]; 

	this.topicverbose	= config["topics"].showlog;

	this.Running = false;
	this.LastDistance = -1;
	this.Closed = true;
	this.Open = !this.Closed;
	this.DoorStateChanged = false;

	var that = this;

	this.garageDoorOpener = new Service.GarageDoorOpener(this.name);

	this.currentDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.CurrentDoorState);
    	this.currentDoorState
		.on('get', this.getState.bind(this));

	this.targetDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.TargetDoorState);
    	this.targetDoorState
		.on('set', this.setTargetState.bind(this))
    		.on('get', this.checkReachable.bind(this));

	this.ObstructionDetected = this.garageDoorOpener.getCharacteristic(Characteristic.ObstructionDetected);
	this.ObstructionDetected.on('get', this.checkReachable.bind(this));

	if (this.lwt !== undefined ) this.reachable = false
	else this.reachable = true;  

    	this.infoService = new Service.AccessoryInformation();
    	this.infoService
      	   .setCharacteristic(Characteristic.Manufacturer, "Opensource Community")
           .setCharacteristic(Characteristic.Model, "Homebridge MQTT GarageDoor")
	   .setCharacteristic(Characteristic.FirmwareRevision,"1.0.2");
//           .setCharacteristic(Characteristic.SerialNumber, "Version 1.0.2");


	// connect to MQTT broker
	this.client = mqtt.connect(this.url, this.options);
	this.client.on('error', function () {
		that.log('Error event on MQTT');
	});


	// Fixed issue where after disconnections topics would no resubscripted
	// based on idea by [MrBalonio] (https://github.com/mrbalonio)
	this.client.on('connect', function () {
		that.log('Subscribing to topics');
 		if( that.topicStatusTele !== undefined ) that.client.subscribe(that.topicStatusTele);
 		if( that.topicStatusGet !== undefined ) that.client.subscribe(that.topicStatusGet);
 		if( that.lwt !== undefined ) that.client.subscribe(that.lwt);
	});

	this.client.on('message', function (topic, message) {
		var status = message.toString();
		if( topic == that.lwt ) {
			if ( message == that.lwt_payload ) {
				that.log("Gone Offline");
				that.reachable = false;
			// Trick to force "Not Responding" state
				that.garageDoorOpener.removeCharacteristic(that.StatusFault);
			} else {
 				if(!that.reachable) {
                                	that.reachable = true;
                        // Trick to force the clear of the "Not Responding" state
                                that.garageDoorOpener.addOptionalCharacteristic(Characteristic.StatusFault);
                                that.StatusFault = that.garageDoorOpener.getCharacteristic(Characteristic.StatusFault);
                        	};
			}
		} else {
			if(!that.reachable) {
				that.reachable = true;
			// Trick to force the clear of the "Not Responding" state
				that.garageDoorOpener.addOptionalCharacteristic(Characteristic.StatusFault);
				that.StatusFault = that.garageDoorOpener.getCharacteristic(Characteristic.StatusFault);
			};
			var topicGotStatus = false;
			if (topic == that.topicStatusGet) {
				var statusObject = JSON.parse(status);
				var topicGotStatusDistance = findVal(statusObject,'Distance');
				if (topicGotStatusDistance !== undefined) {
					if (topicGotStatusDistance < that.OpenValue) {
	                                        that.isOpen(true);
                                                var NewDoorState = DoorState.OPEN;
                                                var NewTarget = DoorState.CLOSED;
						topicGotStatus = true;
			 		} else if (topicGotStatusDistance > that.ClosedValue) {
						that.isClosed(true);
						var NewDoorState = DoorState.CLOSED;
						var NewTarget = DoorState.OPEN;
						topicGotStatus = true;
					} else {
						//TODO: RUNNING STATE OR STATE STOPPED IN BETWEEN	
					}
					that.LastDistance = topicGotStatusDistance;
				}
			};

	        	that.showLog("Getting state " +that.doorStateReadable(NewDoorState) + " its was " + that.doorStateReadable(that.currentDoorState.value) + " [TOPIC : " + topic + " ]");
			if ( topicGotStatus ) {
				that.setObstructionState( false );
        			that.currentDoorState.setValue(NewDoorState);
	               		that.targetDoorState.updateValue(NewDoorState);
				that.Running = false;
				clearTimeout( that.TimeOut );
				if ( (that.pauseInSeconds !== undefined) && that.isOpen() ) {
					that.TimeOut = setTimeout(that.autoClose.bind(that), that.pauseInSeconds * 1000);
				};
			} else if (!that.Running && that.DoorStateChanged ) { 
                       		that.targetDoorState.setValue( NewTarget, undefined, "fromGetValue");
			};
			that.showLog("Final Getting State is " + that.doorStateReadable(that.currentDoorState.value) );
		}
	});
    	
    	this.currentDoorState.updateValue( DoorState.CLOSED );
   	this.targetDoorState.updateValue( DoorState.CLOSED );
        this.currentDoorState.getValue();
}

module.exports = function(homebridge) {
  	Service = homebridge.hap.Service;
  	Characteristic = homebridge.hap.Characteristic;
	DoorState = homebridge.hap.Characteristic.CurrentDoorState;

  	homebridge.registerAccessory("homebridge-mqttgaragedoor", "mqttgaragedoor", MqttGarageDoorAccessory);
}

MqttGarageDoorAccessory.prototype = {
	
	doorStateReadable : function( doorState ) {
		switch (doorState) {
		case DoorState.OPEN:
			return "OPEN";
		case DoorState.OPENING:
			return "OPENING";
		case DoorState.CLOSING:
			return "CLOSING";
		case DoorState.CLOSED:
			return "CLOSED";
		case DoorState.STOPPED:
			return "STOPPED";
		}
	},

	showLog: function( msg, status ) {
	     if( this.topicverbose !== undefined ) {
                if ( msg !== undefined)  this.log( msg );
                if( status !== undefined) this.log("Status : " + this.doorStateReadable(status));
		this.log(" isClosed : " + this.isClosed() + " / " + this.Closed );
		this.log(" isOpen : " + this.isOpen() + " / " + this.Open );
		this.log(" currentState (HK) : " + this.doorStateReadable(this.currentDoorState.value) ); 
	 	this.log(" targetState (HK) : " + this.doorStateReadable(this.targetDoorState.value) );
		this.log(" Running : " + this.Running );
		this.log("----"  );
            }
	},

	checkReachable: function( callback ) {
		if( this.reachable ) callback()
		else callback(1);
	},

	autoClose : function() {
              	this.targetDoorState.setValue(DoorState.CLOSED, undefined, 'fromGetValue');
	},

	setTargetState: function(status, callback, context) {
	 	this.showLog("Setting Target :", status);
		if( this.reachable) {
			if( status != this.currentDoorState.value ) {
				this.setObstructionState( false);
				clearTimeout( this.TimeOut );
        			this.Running = true; 
				this.TimeOut = setTimeout(this.setFinalDoorState.bind(this), this.doorRunInSeconds * 1000);
				if ( context !== 'fromGetValue'){
		        		this.log("Triggering GarageDoor Command");
					this.client.publish(this.topicStatusSet, this.statusToggleCmd);
				};
            			this.currentDoorState.setValue( (status == DoorState.OPEN ?  DoorState.OPENING : DoorState.CLOSING ) );
			};
			callback();
		} else callback(1);
	},

	isClosed: function(status) {
		if( status !== undefined ) { 
			if( this.Closed !== status  ) {
				this.DoorStateChanged = true;
				this.Closed = status;
                		if( this.topicStatusGet == undefined ) this.Open = ! this.Closed;
			} else this.DoorStateChanged = false;
		};
		return(this.Closed);
 	},

	isOpen: function(status) {
		if( status !== undefined ) {
			if( this.Open !== status ) {
				this.DoorStateChanged = true;
				this.Open = status;
				if( this.topicStatusGet == undefined ) this.Closed = ! this.Open;
			} else this.DoorStateChanged = false;
		};
		return(this.Open);
 	},

	setFinalDoorState: function() {
	 	this.showLog("Setting Final", this.targetDoorState.value);

		this.Running = false;
		delete this.TimeOut;

		switch(this.targetDoorState.value) {
			case DoorState.OPEN:
				if(this.topicStatusGet == undefined) this.isOpen(true);
				break;
			case DoorState.CLOSED:
				if(this.topicStatusGet == undefined) this.isClosed(true);
				break;
		};
		if( ! this.getObstructionState() ){
			if (((this.targetDoorState.value == DoorState.OPEN) && this.isOpen()) !== ((this.targetDoorState.value == DoorState.CLOSED) && this.isClosed()) ) {
				this.currentDoorState.setValue( ( this.isClosed() ? DoorState.CLOSED : DoorState.OPEN) );
				if ( (this.pauseInSeconds !== undefined) && this.isOpen() ) this.TimeOut = setTimeout(this.autoClose.bind(this), this.pauseInSeconds * 1000);
			} else {
				this.setObstructionState( true );
			};
		};
	 	this.showLog("Setting Final END" );
  	},

	getState: function( callback ) {
		if( this.statusCmdTopic !== undefined ) this.client.publish(this.statusCmdTopic, this.statusCmd); 
		if( this.reachable) {
    			this.log("Garage Door is " + this.doorStateReadable(this.currentDoorState.value) );
                	callback(null, this.currentDoorState.value);
		} else {
			this.log("Offline");
			callback(1);
		}
	},

        getObstructionState: function() {
		var isC = this.isClosed();
	        var isO = this.isOpen();
		var obs =  ( ( ( !this.Running ) && (isO == isC ) ) || ( isC && isO ) ) ;
		this.setObstructionState( obs);
		return(obs);
	}, 
			
	setObstructionState: function( state ) {
		if ( state )  {
                   this.currentDoorState.setValue( DoorState.STOPPED );
                   if( !this.isClosed() ) this.targetDoorState.updateValue( DoorState.OPEN)
		   else this.targetDoorState.updateValue( 1 - this.targetDoorState.value);
		};
                this.ObstructionDetected.setValue( state );
		this.showLog("Set Obstruction " + state );
	},	

	getServices:  function() {
		return [this.infoService, this.garageDoorOpener];
	},
};
