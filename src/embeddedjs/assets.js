const colours = Object.freeze({ black: "#000000", grey: "#888888" });

const styles = Object.freeze({
  main: new Style({ color: colours.black, font: "18px Gothic" }),
});

const textures = Object.freeze({
  iconPlayPause: new Texture(1),
  iconNext: new Texture(2),
  iconPrev: new Texture(3),
  cassette: new Texture(4),
  noCassette: new Texture(5),
  play: new Texture(6),
  paused: new Texture(7),
  stopped: new Texture(8),
  speaker: new Texture(9),
});

const skins = Object.freeze({
  cassette: new Skin({ texture: textures.cassette, width: 34, height: 24 }),
  noCassette: new Skin({ texture: textures.noCassette, width: 34, height: 24 }),
  play: new Skin({ texture: textures.play, width: 10, height: 8 }),
  paused: new Skin({ texture: textures.paused, width: 10, height: 8 }),
  stopped: new Skin({ texture: textures.stopped, width: 10, height: 8 }),
  speaker: new Skin({ texture: textures.speaker, width: 15, height: 15 }),
});

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "--:--";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export {colours, styles, skins, textures, formatTime};
