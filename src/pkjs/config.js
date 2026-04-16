module.exports = [
  {
    "type": "heading",
    "defaultValue": "Pebble MA Settings"
  },
  {
    "type": "text",
    "defaultValue": "Enter your configuration details"
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Music Assistant Configuration"
      },
      {
        "type": "input",
        "messageKey": "MAUrl",
        "label": "Music Assistant Websocket URL",
        "defaultValue": "",
        "attributes": {
          "placeholder": "wss://music.mydomain.ps"
        }
      },
      {
        "type": "input",
        "messageKey": "MAToken",
        "label": "Long-Lived Access Token",
        "defaultValue": "",
        "attributes": {
          "placeholder": "abcdef1234567890abcdef1234567890abcdef12"
        }
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
