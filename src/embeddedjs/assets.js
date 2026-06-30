import {} from "piu/MC";

const colours = Object.freeze({
  black: "#000000",
  grey: "#888888",
  white: "#FFFFFF",
  blue: "#577dfa",
});

// using array to save some memory
const styles = [
  new Style({ color: colours.black, font: "18px Gothic" }), // main
  new Style({ color: colours.white, horizontal: "left", font: "18px Gothic" }), // selected
  new Style({ color: colours.black, horizontal: "left", font: "18px Gothic" }), // unselected
];

const skins = Object.freeze({
  actionBar: new Skin({
    texture: new Texture(1),
    width: 17,
    height: 14,
    fill: colours.black,
    variants: 17,
  }),
  playBar: new Skin({
    texture: new Texture(5),
    width: 10,
    height: 8,
    fill: colours.white,
    variants: 10,
  }),
  cassette: new Skin({ texture: new Texture(2), width: 34, height: 24 }),
  noCassette: new Skin({ texture: new Texture(3), width: 34, height: 24 }),
  menuHeader: new Skin({ fill: colours.blue }),
  blackBg: new Skin({ fill: colours.black }),
  whiteBg: new Skin({ fill: colours.white }),
  speaker: new Skin({ texture: new Texture(4), width: 15, height: 15 }),
});

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "--:--";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export {colours, styles, skins, formatTime};
