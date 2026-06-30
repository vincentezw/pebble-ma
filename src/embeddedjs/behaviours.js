import {} from "piu/MC";
import {colours, formatTime, skins, styles} from "./assets";

class LabelTimeBehaviour extends Behavior {
  onCreate(position, _) {
    this.position = position || null;
    this.playing = false;
  }

  sync(label, position, state) {
    this.position = position || 0;
    this.playing = (state === "playing");

    // Update the label's string property
    label.string = this.position ? formatTime(this.position) : "--:--";

    if (this.playing) {
      label.start();
    } else {
      label.stop();
    }
  }

  onTimeChanged(label) {
    if (this.playing) {
      this.position += 1;
      label.string = formatTime(this.position);
    }
  }
}

class MenuList extends Column {
  constructor($) {
    super(null, $);
    this.selectedIndex = 0;
  }
  updateSelection() {
    for (let i = 0; i < this.length; i++) {
      const item = this.content(i);
      if (i === this.selectedIndex) {
        item.style = styles[1];
        item.skin = skins.blackBg;
      } else {
        item.style = styles[2];
        item.skin = skins.whiteBg;
      }
    }
  }

  moveSelection(delta) {
    const newIndex = this.selectedIndex + delta;
    if (newIndex >= 0 && newIndex < this.length) {
      this.selectedIndex = newIndex;
      this.updateSelection();
    }
  }

  getSelectedItem() {
    const item = this.content(this.selectedIndex);
    this.selectedIndex = 0; // reset
    return {
      id: item.maId,
      type: item.menuType,
    }
  }
}

class ProgressBehaviour extends Behavior {
  onCreate(data, _) {
    this.position = data.position || 0;
    this.duration = data.duration || 0;
    this.playing = false;
  }

  onDraw(port) {
    const percent = Math.min(100, (this.position / this.duration) * 100);
    const width = port.width * (percent / 100);
    port.fillColor(colours.black, 0, 0, width, 3);
  }

  sync(port, position, duration, state) {
    this.position = position;
    this.duration = duration || 1;
    this.playing = (state === "playing");

    if (this.playing) {
      port.start();
    } else {
      port.stop();
    }
    port.invalidate();
  }

  onTimeChanged(port) {
    if (this.playing) {
      this.position += 1;
      if (this.position > this.duration) {
        this.position = this.duration;
      }
      port.invalidate();
    }
  }
}

export {
  LabelTimeBehaviour,
  MenuList,
  ProgressBehaviour
};
