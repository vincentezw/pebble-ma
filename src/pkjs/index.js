var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, {autoHandleEvents: false});

var maUrl, maToken;
function loadSettings() {
  maUrl = localStorage.getItem("MA_URL") || '';
  maToken = localStorage.getItem("MA_TOKEN") || '';

  // Older builds may have stored null as the literal string "null".
  if (maUrl === 'null') maUrl = '';
  if (maToken === 'null') maToken = '';
}

Pebble.addEventListener('showConfiguration', function(e) {
  loadSettings();

  // Clay only pre-populates fields from its own `clay-settings` blob.
  // Keep it in sync with the settings we actually use so reopening the
  // config page shows the previously saved values.
  clay.setSettings({
    MAUrl: maUrl || '',
    MAToken: maToken || '',
  });

  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;

  var dict;
  try {
    // Parse via Clay so it also persists to `clay-settings`, which is what
    // generateUrl() reads the next time the config page is opened.
    dict = clay.getSettings(e.response, false);
  } catch (err) {
    console.log('[MA] failed to parse settings: ' + err.message);
    return;
  }

  maUrl = (dict.MAUrl && dict.MAUrl.value) || '';
  maToken = (dict.MAToken && dict.MAToken.value) || '';

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

var ws            = null;
var authed        = false;
var msgId         = 0;
var players       = {};  // queue_id → current state object
var debounceTimer = null;
var lastSentSig   = null;

function wsSend(command, args) {
  var id = String(++msgId);
  var pending = {};
  pending[id] = true;
  ws.send(JSON.stringify({ message_id: id, command: command, args: args || {} }));
  return id;
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

Pebble.addEventListener('appmessage', function (e) {
  // Commands from watch — wire up when watch has buttons
  var commands = {
    1: 'play_pause',
    2: 'previous',
    3: 'next',
    4: 'volume_down',
    5: 'volume_up',
  };
  var commandType = commands[e.payload.COMMAND];
  sendPlayerCommand(commandType);

  console.log('[MA] from watch: ' + JSON.stringify(e.payload));
});


