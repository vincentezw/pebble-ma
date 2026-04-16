import {} from "piu/MC";
import Message from "pebble/message";
import Button from "pebble/button";
import {colours, formatTime, skins, styles, textures} from "./assets";
import {LabelTimeBehaviour, ProgressBehaviour} from "./behaviours";

const appMessage = new Message({
  keys: ["COMMAND", "DATA", "HOUR12", "OFFSET"],
  onReadable() {
    const msg = this.read();
    const data = msg.get("DATA");
    const parsed = JSON.parse(data);
    renderStatus(parsed);
  },
  onWritable() {
    appMessageWritable = true;

    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = null;
      this.write(new Map([
        ["COMMAND", cmd],
      ]));
    }
  },
  onSuspend() {
    appMessageWritable = false;
  },
});
let appMessageWritable = false;
let pendingCommand = null;

let pressTimer = null;
let longPressTriggered = false;

new Button({
  types: ["select", "up", "down"],
  onPush(down, type) {
    if (down) {
      longPressTriggered = false;
      pressTimer = setTimeout(() => {
        longPressTriggered = true;
        if (type === "down") {
          trySend(4); // Volume down
        } else if (type === "up") {
          trySend(5); // Volume up
        }
      }, 600);
    } else {
      clearTimeout(pressTimer);

      if (!longPressTriggered) {
        if (type === "select") {
          trySend(1); // Play/pause toggle
        } else if (type === "up") {
          trySend(2); // Previous track
        } else if (type === "down") {
          trySend(3); // Next track
        }
      }
    }
  }
});

const Icon = Content.template($ => ({
  width: 12,
  height: 52,
  skin: new Skin({
    x: 0, y: 0,
    width: 12,
    height: 12,
    texture: $,
  }),
}));

const iconColumn = new Column(null, {
  width: 10,
  right: 0,
  contents: [
    new Icon(textures.iconPrev), 
    new Icon(textures.iconPlayPause),
    new Icon(textures.iconNext),
  ],
});

const cassette = new Content(null, {
  width: 32,
  height: 24,
  left: 84,
  top: 85,
  skin: skins.noCassette,
});

const nowPlayingLabel = new Text(null, {
  width: 200,
  top: 40,
  style: styles.main,
});

const albumLabel = new Text(null, {
  width: 200,
  top: 120,
  style: styles.main,
});

const speakerLabel = new Label(null, { string: "-", style: styles.main });
const speakerRow = new Row(null, {
  horizontal: 'center',
  top: 200,
  contents: [
    new Content(null, {
      width: 15,
      height: 15,
      top: 4,
      skin: new Skin({
        x: 0, y: 0,
        width: 15,
        height: 15,
        texture: textures.speaker,
      }),
    }),
    speakerLabel,
  ],
});

const progressBar = new Port(null, {
  width: 160,
  height: 3,
  top: 160,
  left: 20,
  behavior: new ProgressBehaviour(),
  interval: 1000,
  skin: new Skin({fill: colours.grey}),
});

const progressLabel = new Label(null, {
  behavior: new LabelTimeBehaviour(),
  interval: 1000,
  string: "--:--",
  style: styles.main,
});

const progressDurationLabel = new Label(null, {
  string: "/ --:--",
  style: styles.main,
});

const progressIcon = new Content(null, {
  top: 7,
  width: 10,
  height: 8,
  right: 5,
  skin: skins.stopped,
});

const progressRow = new Row(null, {
  horizontal: 'center',
  top: 170,
  contents: [
    progressIcon,
    progressLabel,
    progressDurationLabel,
  ],
});

const application = new Application(null, {
  contents: [
    iconColumn,
    nowPlayingLabel,
    albumLabel,
    cassette,
    progressBar,
    progressRow,
    speakerRow
  ],
  skin: new Skin({ fill: "white" })
});


const UI_CONFIG = Object.freeze({
  quiet:        {title: "Ssht... no music playing", icon: "stopped", hasCassette: false},
  disconnected: {title: "Disconnected", icon: "stopped", hasCassette: false},
  stopped:      {title: "Stopped", icon: "stopped", hasCassette: true },
  paused:       {title: "Paused", icon: "paused", hasCassette: true },
  playing:      {title: "Playing", icon: "play", hasCassette: true }
});

function renderStatus(data) {
  const config = UI_CONFIG[data.state] || UI_CONFIG.quiet;
  
  progressBar.delegate("sync", data.position, data.duration, data.state);
  progressLabel.delegate("sync", data.position, data.state);
  
  nowPlayingLabel.string = data.song_name && data.artist 
    ? `${data.song_name} - ${data.artist}` 
    : config.title;
    
  albumLabel.string = data.album || "";
  let speakerLabelString = data.player_name || "-";
  if (data.volume !== undefined) {
    speakerLabelString += ` (${data.volume}%)`;
  }
  speakerLabel.string = speakerLabelString;
  
  cassette.skin = config.hasCassette ? skins.cassette : skins.noCassette;
  progressIcon.skin = skins[config.icon];
  progressDurationLabel.string = data.duration ? ` / ${formatTime(data.duration)}` : "/ --:--";
}

function trySend(command) {
  if (appMessageWritable) {
    appMessage.write(new Map([
      ["COMMAND", command],
    ]));
  } else {
    pendingCommand = command;
  }
}

export default application;
