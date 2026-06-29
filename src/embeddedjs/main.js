import {} from "piu/MC";
import Message from "pebble/message";
import Button from "pebble/button";
import {colours, formatTime, skins, styles} from "./assets";
import {
  LabelTimeBehaviour,
  MenuList,
  // MenuScrollBehavior,
  ProgressBehaviour,
} from "./behaviours";

const UI_CONFIG = Object.freeze({
  quiet:        {title: "Ssht... no music playing", icon: 0, hasCassette: false},
  disconnected: {title: "Disconnected", icon: 0, hasCassette: false},
  stopped:      {title: "Stopped", icon: 0, hasCassette: true },
  paused:       {title: "Paused", icon: 1, hasCassette: true },
  playing:      {title: "Playing", icon: 2, hasCassette: true }
});

const appMessage = new Message({
  keys: ["COMMAND", "DATA"],
  onReadable() {
    const msg = this.read();
    const command = msg.get("COMMAND");
    const data = msg.get("DATA");
    if (command === 0) {
      const parsed = JSON.parse(data);
      renderStatus(parsed);
    } else if (command === 1 || command === 2) {
      renderMenu(
        data.split(","),
        command === 1 ? 'album' : 'player'
      );
    }
  },
  onWritable() {
    appMessageWritable = true;

    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = null;
      const map = new Map([
        ["COMMAND", cmd.command],
      ]);
      if (cmd.data) {
        map.set("DATA", cmd.data);
      }
      this.write(map);
    }
  },
  onSuspend() {
    appMessageWritable = false;
  },
});
let appMessageWritable = false;
let pendingCommand = null;

new Button({
  types: ["select", "up", "down", "back"],
  onPush(down, type) {
    if (!down && playerWrapper.visible) {
      if (type === "select") {
        trySend(1); // Play/pause toggle
      } else if (type === "up") {
        trySend(2); // Previous track
      } else if (type === "down") {
        trySend(3); // Next track
      } else {
        application.exit();
      }
    } else if (!down && menuWrapper.visible) {
      if (type === "up") {
        menuWrapper.content(1).content(0).moveSelection(-1);
      } else if (type === "down") {
        menuWrapper.content(1).content(0).moveSelection(1);
      } else if (type === "select") {
        const menu = menuWrapper.content(1).content(0);
        const item = menu.getSelectedItem();
        toggleMenu(false);
        menu.empty();
        trySend(
          item.type === 'album' ? 7 : 8,
          item.id
        );
      } else {
        toggleMenu(false);
      }
    }
  }
});

const actionBar = new Column(null, {
  width: 19,
  height: screen.height,
  right: 0,
  top: 0,
  contents: [
    new Content(null, { width: 17, height: 14, skin: skins.actionBar, variant: 4, top: 30 }),
    new Content(null, { width: 17, height: 14, skin: skins.actionBar, variant: 5, top: 60 }),
    new Content(null, { width: 17, height: 14, skin: skins.actionBar, variant: 3, top: 60 }),
  ],
  skin: skins.blackBg,
});

function toggleMenu(visible) {
  menuWrapper.visible = visible;
  playerWrapper.visible = !visible;

  actionBar.content(0).variant = visible ? 0 : 4;
  actionBar.content(1).variant = visible ? 1 : 5;
  actionBar.content(2).variant = visible ? 2 : 3;
}

const speakerLabel = new Label(null, { string: "-", style: styles[0] });

const progressLabel = new Label(null, {
  Behavior: LabelTimeBehaviour,
  interval: 1000,
  string: "--:--",
  style: styles[0],
});

const progressDurationLabel = new Label(null, {
  string: "/ --:--",
  style: styles[0],
});

const progressIcon = new Content(null, {
  top: 7,
  width: 10,
  height: 8,
  right: 5,
  skin: skins.playBar,
  variant: 0,
});

const playerWrapper = new Container(null, {
  top: 0,
  left: 0,
  right: 19,
  bottom: 0,
  contents: [
    new Content(null, {
      width: 32,
      height: 24,
      left: 84,
      top: 85,
      skin: skins.noCassette,
    }),
    new Label(null, {
      width: 200,
      top: 40,
      style: styles[0],
    }),
    new Label(null, {
      width: 200,
      top: 120,
      style: styles[0],
    }),
    new Row(null, {
      active: true,
      backgroundTouch: true,
      horizontal: 'center',
      top: 200,
      contents: [
        new Content(null, {
          width: 15,
          height: 15,
          top: 4,
          skin: skins.speaker,
        }),
        speakerLabel,
      ],
      Behavior: class extends Behavior {
        onTouchBegan() {
          trySend(6);
        }
      },
    }),
    new Row(null, {
      horizontal: 'center',
      top: 170,
      contents: [
        progressIcon,
        progressLabel,
        progressDurationLabel,
      ],
    }),
    new Port(null, {
      width: 160,
      height: 3,
      top: 160,
      left: 20,
      Behavior: ProgressBehaviour,
      interval: 1000,
      skin: new Skin({fill: colours.grey}),
    }),
  ],
});

const menuWrapper = new Column(null, {
  top: 0,
  left: 0,
  right: 19,
  bottom: 0,
  visible: false,
  contents: [
    new Label(null, {
      style: styles[1],
      height: 20,
      left: 0,
      right: 0,
      skin: skins.menuHeader,
    }),
    new Scroller(null, {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      clip: true,
      active: true,
      Behavior: class extends Behavior {
        onTouchBegan(scroller, id, x, y) {
          this.anchor = scroller.scroll.y;
          this.y = y;
          this.waiting = true;
        }
        onTouchMoved(scroller, id, x, y, ticks) {
          let delta = y - this.y;
          if (this.waiting) {
            if (Math.abs(delta) < 8)
              return;
            this.waiting = false;
            scroller.captureTouch(id, x, y, ticks);
          }
          scroller.scrollTo(0, this.anchor - delta);
        }
      },
      contents: [
        new MenuList({
          top: 0, right: 0, left: 0,
        }),
      ],
    }),
  ],
});

const application = new Application(null, {
  contents: [
    actionBar,
    playerWrapper,
    menuWrapper,
  ],
  skin: new Skin({ fill: "white" }),
  touchCount: 1,
});


function renderMenu(items, type) {
  menuWrapper.content(0).string = type === 'album' ? 
    " Recently played albums" : " Play album on";
  const menuList = menuWrapper.content(1).content(0);
  menuList.empty();
  for (let index = 0; index < items.length; index++) {
    const itemData = items[index].split(":");
    const label = new Label(null, {
      string: ` ${decodeURIComponent(itemData[1])}`,
      height: 20,
      left: 0, top: 0, right: 0,
      skin: index === 0 ? skins.blackBg : skins.whiteBg,
      style: index === 0 ? styles[1] : styles[2],
    });
    label.maId = itemData[0];
    label.menuType = type;
    menuList.add(label);
  }
  toggleMenu(items.length > 0);
}

function renderStatus(data) {
  const config = UI_CONFIG[data.state] || UI_CONFIG.quiet;
  
  playerWrapper.content(5).delegate("sync", data.position, data.duration, data.state);
  progressLabel.delegate("sync", data.position, data.state);

  let titleString = config.title;
  if (data.song_name && data.artist) {
    titleString = `${data.song_name} - ${data.artist}`;
    if (titleString.length > 32) {
      titleString = titleString.slice(0, 29) + "...";
    }
  }
  playerWrapper.content(1).string = titleString;

  playerWrapper.content(2).string = data.album || "";
  let speakerLabelString = data.player_name || "-";
  if (data.volume !== undefined) {
    speakerLabelString += ` (${data.volume}%)`;
  }
  speakerLabel.string = speakerLabelString;
  
  playerWrapper.content(0).skin = config.hasCassette ? skins.cassette : skins.noCassette;
  progressIcon.variant = config.icon;
  progressDurationLabel.string = data.duration ? ` / ${formatTime(data.duration)}` : "/ --:--";
}

function trySend(command, data = null) {
  if (appMessageWritable) {
    const map = new Map([
      ["COMMAND", command],
    ]);
    if (data) {
      map.set("DATA", data);
    }
    appMessage.write(map);
  } else {
    pendingCommand = {command, data};
  }
}

export default application;
