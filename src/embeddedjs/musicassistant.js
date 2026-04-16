// currently unused, maybe in the future we can handle this, or at least some part, on the watch.
// Currently the limited heap memory does not allow it.
import WebSocketClient from "embedded:network/websocket/client";

export default class MusicAssistantClient {
  constructor(host, path, token) {
    this.host = host;
    this.path = path;
    this.token = token;

    this.authed = false;
    this.msgId = 0;
    this.pending = new Map();
    this.buffer = ""; // Storage for fragments

    this.ws = new WebSocketClient({
      host: this.host,
      path: this.path,
      port: 443,
      secure: true,
      onReadable: (count, options) => this.receive(count, options),
      onWritable: (count) => {
        // Low-level client triggers this often; only log if needed
      },
      onClose: () => console.log("Disconnected"),
      onError: () => console.log("Connection Error")
    });
  }

  receive(_count, options) {
    const data = this.ws.read();
    if (!(data instanceof ArrayBuffer)) { return };

    this.buffer += String.fromArrayBuffer(data);

    if (options.more) {
      return;
    }

    let msg;
    try {
      console.log("Received Raw Message:", this.buffer);
      // let cleaned = this.buffer
      // .replace(/"streamdetails":\{.*?\}/g, '"sd":{}')
      // .replace(/"device_info":\{.*?\}/g, '"device_info":{}')
      // .replace(/"supported_features":\[.*?\]/g, '"f":[]')
      // .replace(/"can_group_with":\[.*?\]/g, '"g":[]')
      // .replace(/"source_list":\[.*?\]/g, '"s":[]')
      // .replace(/"hide_player_in_ui":\[.*?\]/g, '"h":[]')
      // .replace(/"extra_attributes":\{.*?\}/g, '"x":{}')
      msg = JSON.parse(this.buffer);
      this.buffer = "";
    } catch (e) {
      console.log("buffer");
      return;
    }
    for (const key in msg) {
      console.log(`  ${key}: ${JSON.stringify(msg[key])}`);
    }
    if (msg.data) {
      for (const key in msg.data) {
        console.log(`    ${key}: ${JSON.stringify(msg.data[key])}`);
      }
    }
    if (msg.result) {
      for (const key in msg.result) {
        console.log(`    ${key}: ${JSON.stringify(msg.result[key])}`);
      }
    }

    // 1. Handshake
    if (msg.server_id && !this.authed) {
      this.send('auth', { token: this.token })
        .then(() => {
          this.authed = true;
        })
        .catch(e => console.log("Auth Failed", e));
      return;
    }

    // 2. Auth Success Check
    if (!this.authed && !msg.error_code) {
      this.authed = true;
      this.onReady?.();
      return;
    }

    // 3. Command Responses
    const p = this.pending.get(msg.message_id);
    if (p) {
      this.pending.delete(msg.message_id);
      if (msg.error_code) p.rej(msg.details);
      else p.res(msg.result);
    }

    if (msg.event === "media_item_played") {
      // This is your Now Playing data
      this.updateNowPlaying?.(msg.data);
    }
  }

  send(command, args = {}) {
    return new Promise((res, rej) => {
      const id = String(++this.msgId);
      this.pending.set(id, { res, rej });

      const payload = JSON.stringify({
        message_id: id,
        command,
        args
      });

      this.ws.write(ArrayBuffer.fromString(payload), {binary: false, mask: true});
    });
  }
}
