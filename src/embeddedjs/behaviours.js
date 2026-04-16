import {} from "piu/MC";
import {colours, formatTime} from "./assets";

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

export {LabelTimeBehaviour, ProgressBehaviour};
