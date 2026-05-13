var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, {autoHandleEvents: false});

var maUrl, maToken;
function loadSettings() {
  maUrl = localStorage.getItem("MA_URL");
  maToken = localStorage.getItem("MA_TOKEN");
}

Pebble.addEventListener('showConfiguration', function(e) {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;

  const decoded = decodeURIComponent(e.response);
  const dict = JSON.parse(decoded);

  maUrl = (dict.MAUrl && dict.MAUrl.value) || null;
  maToken = (dict.MAToken && dict.MAToken.value) || null;

  localStorage.setItem("MA_URL", maUrl);
  localStorage.setItem("MA_TOKEN", maToken);

  loadSettings();

  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  
  connect();
});

var DEBOUNCE_MS = 750;

var ws               = null;
var authed           = false;
var msgId            = 0;
var players          = {};  // queue_id → current state object
var debounceTimer    = null;
var lastSentSig      = null;
var pendingResponses = {};  // message_id → callback(result, msg)

function wsSend(command, args, onResult) {
  var id = String(++msgId);
  if (onResult) pendingResponses[id] = onResult;
  ws.send(JSON.stringify({ message_id: id, command: command, args: args || {} }));
  return id;
}

function trunc(s, n) {
  if (!s) return '';
  s = String(s);
  return s.length > n ? s.substring(0, n) : s;
}

// ─── player state ─────────────────────────────────────────────────────────────

function activePlayer() {
  var paused = null;
  for (var id in players) {
    var p = players[id];
    if (p.STATE === 'playing') return p;
    if (p.STATE === 'paused' && !paused) paused = p;
  }
  return paused;
}

function stateFromQueue(queueState, hasCurrentItem) {
  if (queueState === 'playing') return 'playing';
  if (hasCurrentItem)           return 'paused';
  return 'stopped';
}

// ─── watch messaging ──────────────────────────────────────────────────────────

function schedulePush() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(push, DEBOUNCE_MS);
}

function push() {
  debounceTimer = null;
  var p = activePlayer();
  var payload;
  if (!p) {
    payload = JSON.stringify({
      state: 'quiet',
    });
  } else {
    var sig = p.PLAYER_NAME + '|' + p.STATE + '|' + p.SONG_NAME + '|' + p.VOLUME;
    if (sig === lastSentSig) {return;}
    lastSentSig = sig;

    payload = JSON.stringify({
      state:       p.STATE,
      player_name: p.PLAYER_NAME,
      song_name:   p.SONG_NAME,
      artist:      p.ARTIST,
      album:       p.ALBUM,
      duration:    p.DURATION,
      position:    p.POSITION,
      volume:      p.VOLUME,
    });
  }

  Pebble.sendAppMessage({ DATA: payload },
    function ()    { console.log('[MA] sent: ' + sig); },
    function (err) { console.log('[MA] send failed: ' + JSON.stringify(err)); }
  );
}

// ─── event / data handlers ────────────────────────────────────────────────────

function applyQueue(data) {
  var qid   = data.queue_id;
  var item  = data.current_item || null;
  var media = item && item.media_item || null;

  if (!players[qid]) players[qid] = {};
  var p = players[qid];

  p.STATE       = stateFromQueue(data.state, !!item);
  p.PLAYER_NAME = data.display_name || qid;
  p.SONG_NAME   = (media && media.name) || (item && item.name) || '';
  p.ARTIST      = (media && media.artists && media.artists[0] && media.artists[0].name) || '';
  p.ALBUM       = (media && media.album && media.album.name) || '';
  p.DURATION    = (item && item.duration) || 0;
  p.POSITION    = Math.floor(data.elapsed_time || 0);
}

function onQueueUpdated(data) {
  applyQueue(data);
  schedulePush();
}

function onPlayerUpdated(data) {
  var p = players[data.player_id];
  if (!p) {
    return;
  }

  var stateChanged = false;
  var volumeChanged = false;

  var newState = 'stopped';
  if (data.state === 'playing') {
    newState = 'playing';
  } else if (p.SONG_NAME) {
    newState = 'paused';
  }

  if (p.STATE !== newState) {
    p.STATE = newState;
    stateChanged = true;
  }

  if (data.volume_level !== undefined && p.VOLUME !== data.volume_level) {
    p.VOLUME = data.volume_level;
    volumeChanged = true;
  }

  if (stateChanged || volumeChanged) {
    schedulePush();
  }
}

function onEvent(event, data) {
  console.log('[MA] event: ' + event);
  switch (event) {
    case 'queue_updated':  onQueueUpdated(data);  break;
    case 'player_updated': onPlayerUpdated(data); break;
    // case 'media_item_played': onMediaItemPlayed(data); break;
    default: console.log('[MA] unhandled event: ' + event);
  }
}

// ─── connection ───────────────────────────────────────────────────────────────

function connect() {
  if (!maUrl || !maToken) {
    console.log('[MA] connect aborted: missing settings');
    return;
  }

  authed = false;
  var socketPath = maUrl.replace(/^http/, 'ws');
  socketPath = socketPath.replace(/\/+$/, '');
  socketPath += '/ws';
  ws = new WebSocket(socketPath);

  ws.onmessage = function (e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch (e) { console.log(e); return; }

    if (msg.server_id && !authed) {
      wsSend('auth', { token: maToken });
      return;
    }

    if (!authed) {
      if (msg.error_code) { console.log('[MA] auth failed'); return; }
      authed = true;
      console.log('[MA] authenticated — fetching initial state');
      // MA doesn't push current state on connect, so ask for it.
      wsSend('player_queues/all');
      wsSend('players/all');
      return;
    }

    // Dispatch by message_id when we have a pending callback for it.
    if (msg.message_id && pendingResponses[msg.message_id]) {
      var handler = pendingResponses[msg.message_id];
      delete pendingResponses[msg.message_id];
      handler(msg.result, msg);
      return;
    }

    // Response to player_queues/all — seed initial player state.
    if (msg.message_id && Array.isArray(msg.result)) {
      msg.result.forEach(function (item) {
        if (item.queue_id) {
          applyQueue(item);
        } else if (item.player_id) {
          // Use our new refactored logic to catch the volume
          onPlayerUpdated(item);
        }
      });
      push();
      return;
    }

    if (msg.event) onEvent(msg.event, msg.data);
  };

  ws.onerror = function () { console.log('[MA] ws error'); };
  ws.onclose = function () {
    console.log('[MA] ws closed — reconnecting in 5 s');
    Pebble.sendAppMessage({ DATA: JSON.stringify({ state: 'disconnected' }) });
    setTimeout(connect, 5000);
  };
}

function sendPlayerCommand(commandType) {
  var p = activePlayer();
  if (!p || !authed || !ws) {
    return;
  }

  var qid = null;
  for (var id in players) {
    if (players[id] === p) { qid = id; break; }
  }
  if (!qid) {
    return;
  }

  if (commandType === 'volume_up' || commandType === 'volume_down') {
    console.log('volume command received: ' + commandType);
    var currentVol = p.VOLUME || 0;
    var step = 2; 
    var newVol = (commandType === 'volume_up') ? currentVol + step : currentVol - step;
    newVol = Math.max(0, Math.min(100, newVol));
    
    wsSend('players/cmd/volume_set', { player_id: qid, volume_level: newVol });
    return;
  }

  console.log('[MA] Sending transport command: ' + commandType);
  wsSend('player_queues/' + commandType, { queue_id: qid });
}

// ─── Pebble lifecycle ─────────────────────────────────────────────────────────
Pebble.addEventListener('ready', function () {
  console.log('[MA] ready');

  loadSettings();
  if (!maUrl || !maToken) {
    console.log('[MA] missing config — open settings');
    return;
  }

  connect();
});

function sendRecentAlbums() {
  if (!authed || !ws) return;
  // NOTE: command name "music/recently_played" is a best guess at the MA API.
  // If MA returns nothing or errors, swap for the correct command/args.
  wsSend('music/recently_played', { limit: 20 }, function (result) {
    var items = [];
    if (Array.isArray(result)) {
      for (var i = 0; i < result.length && items.length < 20; i++) {
        var r = result[i] || {};
        var artistName = '';
        if (r.artists && r.artists[0]) artistName = r.artists[0].name || '';
        else if (r.artist) artistName = r.artist;
        items.push({
          id:     trunc(r.uri || r.item_id || r.id || '', 40),
          name:   trunc(r.name || r.title || '', 40),
          artist: trunc(artistName, 40),
        });
      }
    }
    Pebble.sendAppMessage({
      DATA: JSON.stringify({ type: 'recent_albums', items: items }),
    });
  });
}

function sendSpeakers() {
  if (!authed || !ws) return;
  wsSend('players/all', {}, function (result) {
    var items = [];
    if (Array.isArray(result)) {
      for (var i = 0; i < result.length && items.length < 10; i++) {
        var p = result[i] || {};
        items.push({
          id:   trunc(p.player_id || '', 40),
          name: trunc(p.display_name || p.name || p.player_id || '', 40),
        });
      }
    }
    Pebble.sendAppMessage({
      DATA: JSON.stringify({ type: 'speakers', items: items }),
    });
  });
}

function playAlbum(payload) {
  if (!authed || !ws) return;
  var data;
  try { data = JSON.parse(payload); } catch (e) { return; }
  if (!data || !data.album_id || !data.player_id) return;
  // NOTE: best guess at MA's play_media shape. Adjust args if MA expects
  // a different field name (e.g. `media`, `uri`, `items`).
  wsSend('player_queues/play_media', {
    queue_id: data.player_id,
    media:    data.album_id,
  });
}

Pebble.addEventListener('appmessage', function (e) {
  console.log('[MA] from watch: ' + JSON.stringify(e.payload));

  var cmd = e.payload.COMMAND;
  var transport = { 1: 'play_pause', 2: 'previous', 3: 'next',
                    4: 'volume_down', 5: 'volume_up' };

  if (transport[cmd]) {
    sendPlayerCommand(transport[cmd]);
    return;
  }

  switch (cmd) {
    case 6: sendRecentAlbums();        break;
    case 7: sendSpeakers();            break;
    case 8: playAlbum(e.payload.DATA); break;
    default: console.log('[MA] unknown COMMAND: ' + cmd);
  }
});


