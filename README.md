# homebridge-mqttgaragedoor
An homebridge plugin that create an HomeKit Garage Door Opener accessory mapped on MQTT topics, this is a fork from homebridge-mqttgaragedoor by iomax.
It is modified to be used with a tasmota esp with a relais to toggle the door state and an sr-04 distance sensor to determin the state.

# Installation
Follow the instruction in [homebridge](https://www.npmjs.com/package/homebridge) for the homebridge server installation.
The plugin must be cloned locally (git clone https://github.com/iomax/homebridge-mqttgaragedoor.git ) and should be installed "globally" by typing:

    npm install -g ./homebridge-mqttgaragedoor
   
# Release notes
Version 1.0.2

# Configuration
Remember to configure the plugin in config.json in your home directory inside the .homebridge directory. Configuration parameters:
```javascript
{
  "accessory": "mqttgaragedoor",
  "name": "NAME OF THE GARAGE DOOR OPENER",
  "url": "URL OF THE BROKER",
  "username": "USERNAME OF THE BROKER",
  "password": "PASSWORD OF THE BROKER"
  "caption": "LABEL OF THE GARAGE DOOR OPENER",
  "lwt": "OPTIONAL: DOOR OPENER MQTT LAST WILL AND TESTAMENT TOPIC",
  "lwtPayload": "lwt Payload",
  "topics": {
		"statusSet":	"MQTT TOPIC TO SET THE DOOR OPENER",
		"statusGet":	"OPTIONAL: MQTT TOPIC TO GET THE DOOR STATUS",
		"statusTele":	"OPTIONAL: MQTT TOPIC TO GET THE DOOR STATUS FROM RECURING TELEMETRY",
		"openValue":	"OPTIONAL VALUE THAT MEANS OPEN (DEFAULT true)",
		"closedValue":	"OPTIONAL VALUE THAT MEANS CLOSED (DEFAULT true)",
		"statusCmdTopic": "OPTIONAL: MQTT TOPIC TO ASK ABOUT THE STATUS",
		"statusCmd":	"OPTIONAL: THE STATUS COMMAND ( DEFAULT '' )"
            },
  "doorRunInSeconds": "OPEN/CLOSE RUN TIME IN SECONDS (DEFAULT 20"),
  "pauseInSeconds" : "IF DEFINED : AUTO CLOSE AFTER [Seconds]"
}
```

# Credit

The original homebridge MQTT plugins work was done by [ilcato](https://github.com/ilcato) in his [homebridge-mqttswitch](https://github.com/ilcato/homebridge-mqttswitch) project.

The original homebridge GarageDoor plugin work was done by [belamonica] (https://github.com/benlamonica) in his [homebridge-rasppi-gpio-garagedoor] (https://github.com/benlamonica/homebridge-rasppi-gpio-garagedoor) project.

The original homebridge-mqttgaragedoor plugin work was done by [iomax] (https://github.com/iomax) in his [homebridge-mqttgaragedoor] (https://github.com/iomax/homebridge-mqttgaragedoor) project.


