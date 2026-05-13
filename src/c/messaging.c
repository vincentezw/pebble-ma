#include "messaging.h"

#include <string.h>
#include <stdlib.h>

#include "jsmn.h"
#include "state.h"

#define MAX_TOKENS 256

static MAUpdateCallback s_now_playing_cb = NULL;
static MAUpdateCallback s_albums_cb      = NULL;
static MAUpdateCallback s_speakers_cb    = NULL;

static jsmntok_t s_tokens[MAX_TOKENS];

static bool tok_eq(const char *json, const jsmntok_t *t, const char *s) {
  if (t->type != JSMN_STRING) return false;
  size_t len = (size_t)(t->end - t->start);
  return strlen(s) == len && strncmp(json + t->start, s, len) == 0;
}

static void tok_copy(const char *json, const jsmntok_t *t, char *dst, size_t dst_len) {
  if (!dst || dst_len == 0) return;
  if (!t || t->type == JSMN_UNDEFINED) {
    dst[0] = '\0';
    return;
  }
  size_t len = (size_t)(t->end - t->start);
  if (len >= dst_len) len = dst_len - 1;
  memcpy(dst, json + t->start, len);
  dst[len] = '\0';
}

static int tok_to_int(const char *json, const jsmntok_t *t) {
  if (!t || t->type != JSMN_PRIMITIVE) return 0;
  char buf[12];
  size_t len = (size_t)(t->end - t->start);
  if (len >= sizeof(buf)) len = sizeof(buf) - 1;
  memcpy(buf, json + t->start, len);
  buf[len] = '\0';
  return atoi(buf);
}

static int subtree_tokens(const jsmntok_t *t, int count, int i) {
  if (i >= count) return 0;
  int consumed = 1;
  if (t[i].type == JSMN_OBJECT) {
    for (int k = 0; k < t[i].size; k++) {
      consumed += 1;  // key
      consumed += subtree_tokens(t, count, i + consumed);  // value
    }
  } else if (t[i].type == JSMN_ARRAY) {
    for (int k = 0; k < t[i].size; k++) {
      consumed += subtree_tokens(t, count, i + consumed);
    }
  }
  return consumed;
}

// Walk an object's keys looking for `key`. Returns the index of the *value*
// token for that key, or -1 if not found. `obj_idx` is the index of the
// JSMN_OBJECT token.
static int obj_find(const char *json, const jsmntok_t *t, int count, int obj_idx, const char *key) {
  if (obj_idx >= count || t[obj_idx].type != JSMN_OBJECT) return -1;
  int i = obj_idx + 1;
  for (int k = 0; k < t[obj_idx].size; k++) {
    if (i >= count) return -1;
    if (tok_eq(json, &t[i], key)) {
      return i + 1;
    }
    int val_idx = i + 1;
    i = val_idx + subtree_tokens(t, count, val_idx);
  }
  return -1;
}

static MAPlayState parse_play_state(const char *s) {
  if (strcmp(s, "playing") == 0)      return MA_STATE_PLAYING;
  if (strcmp(s, "paused") == 0)       return MA_STATE_PAUSED;
  if (strcmp(s, "stopped") == 0)      return MA_STATE_STOPPED;
  if (strcmp(s, "disconnected") == 0) return MA_STATE_DISCONNECTED;
  return MA_STATE_QUIET;
}

static void parse_now_playing(const char *json, int count) {
  MANowPlaying *np = state_now_playing();
  char buf[MA_MAX_STR];

  int idx;
  if ((idx = obj_find(json, s_tokens, count, 0, "state")) >= 0) {
    tok_copy(json, &s_tokens[idx], buf, sizeof(buf));
    np->state = parse_play_state(buf);
  } else {
    np->state = MA_STATE_QUIET;
  }

  np->player_name[0] = '\0';
  if ((idx = obj_find(json, s_tokens, count, 0, "player_name")) >= 0) {
    tok_copy(json, &s_tokens[idx], np->player_name, sizeof(np->player_name));
  }
  np->song_name[0] = '\0';
  if ((idx = obj_find(json, s_tokens, count, 0, "song_name")) >= 0) {
    tok_copy(json, &s_tokens[idx], np->song_name, sizeof(np->song_name));
  }
  np->artist[0] = '\0';
  if ((idx = obj_find(json, s_tokens, count, 0, "artist")) >= 0) {
    tok_copy(json, &s_tokens[idx], np->artist, sizeof(np->artist));
  }
  np->album[0] = '\0';
  if ((idx = obj_find(json, s_tokens, count, 0, "album")) >= 0) {
    tok_copy(json, &s_tokens[idx], np->album, sizeof(np->album));
  }

  np->duration = 0;
  if ((idx = obj_find(json, s_tokens, count, 0, "duration")) >= 0) {
    np->duration = (uint16_t)tok_to_int(json, &s_tokens[idx]);
  }
  np->position = 0;
  if ((idx = obj_find(json, s_tokens, count, 0, "position")) >= 0) {
    np->position = (uint16_t)tok_to_int(json, &s_tokens[idx]);
  }
  np->has_volume = false;
  np->volume = 0;
  if ((idx = obj_find(json, s_tokens, count, 0, "volume")) >= 0) {
    np->volume = (uint8_t)tok_to_int(json, &s_tokens[idx]);
    np->has_volume = true;
  }

  if (s_now_playing_cb) s_now_playing_cb();
}

static void parse_albums(const char *json, int count) {
  int items_idx = obj_find(json, s_tokens, count, 0, "items");
  MAAlbumList *al = state_albums();
  al->count = 0;

  if (items_idx < 0 || s_tokens[items_idx].type != JSMN_ARRAY) {
    al->loaded = true;
    if (s_albums_cb) s_albums_cb();
    return;
  }

  int arr_size = s_tokens[items_idx].size;
  if (arr_size > MA_MAX_ALBUMS) arr_size = MA_MAX_ALBUMS;

  int i = items_idx + 1;
  for (int k = 0; k < arr_size; k++) {
    if (i >= count) break;
    if (s_tokens[i].type == JSMN_OBJECT) {
      MAAlbum *a = &al->items[al->count];
      a->id[0] = a->name[0] = a->artist[0] = '\0';
      int idx;
      if ((idx = obj_find(json, s_tokens, count, i, "id")) >= 0)
        tok_copy(json, &s_tokens[idx], a->id, sizeof(a->id));
      if ((idx = obj_find(json, s_tokens, count, i, "name")) >= 0)
        tok_copy(json, &s_tokens[idx], a->name, sizeof(a->name));
      if ((idx = obj_find(json, s_tokens, count, i, "artist")) >= 0)
        tok_copy(json, &s_tokens[idx], a->artist, sizeof(a->artist));
      al->count++;
    }
    i += subtree_tokens(s_tokens, count, i);
  }
  al->loaded = true;

  if (s_albums_cb) s_albums_cb();
}

static void parse_speakers(const char *json, int count) {
  int items_idx = obj_find(json, s_tokens, count, 0, "items");
  MASpeakerList *sl = state_speakers();
  sl->count = 0;

  if (items_idx < 0 || s_tokens[items_idx].type != JSMN_ARRAY) {
    sl->loaded = true;
    if (s_speakers_cb) s_speakers_cb();
    return;
  }

  int arr_size = s_tokens[items_idx].size;
  if (arr_size > MA_MAX_SPEAKERS) arr_size = MA_MAX_SPEAKERS;

  int i = items_idx + 1;
  for (int k = 0; k < arr_size; k++) {
    if (i >= count) break;
    if (s_tokens[i].type == JSMN_OBJECT) {
      MASpeaker *sp = &sl->items[sl->count];
      sp->id[0] = sp->name[0] = '\0';
      int idx;
      if ((idx = obj_find(json, s_tokens, count, i, "id")) >= 0)
        tok_copy(json, &s_tokens[idx], sp->id, sizeof(sp->id));
      if ((idx = obj_find(json, s_tokens, count, i, "name")) >= 0)
        tok_copy(json, &s_tokens[idx], sp->name, sizeof(sp->name));
      sl->count++;
    }
    i += subtree_tokens(s_tokens, count, i);
  }
  sl->loaded = true;

  if (s_speakers_cb) s_speakers_cb();
}

static void dispatch(const char *json) {
  jsmn_parser parser;
  jsmn_init(&parser);

  int count = jsmn_parse(&parser, json, strlen(json), s_tokens, MAX_TOKENS);
  if (count < 1 || s_tokens[0].type != JSMN_OBJECT) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "[MA] bad inbound json (%d)", count);
    return;
  }

  int type_idx = obj_find(json, s_tokens, count, 0, "type");
  if (type_idx < 0) {
    parse_now_playing(json, count);
    return;
  }
  if (tok_eq(json, &s_tokens[type_idx], "recent_albums")) {
    parse_albums(json, count);
  } else if (tok_eq(json, &s_tokens[type_idx], "speakers")) {
    parse_speakers(json, count);
  } else {
    APP_LOG(APP_LOG_LEVEL_WARNING, "[MA] unknown msg type");
  }
}

static void inbox_received(DictionaryIterator *iter, void *ctx) {
  Tuple *data = dict_find(iter, MESSAGE_KEY_DATA);
  if (!data || data->type != TUPLE_CSTRING) return;
  dispatch(data->value->cstring);
}

static void inbox_dropped(AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "[MA] inbox dropped: %d", reason);
}

static void outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "[MA] outbox failed: %d", reason);
}

void messaging_init(void) {
  app_message_register_inbox_received(inbox_received);
  app_message_register_inbox_dropped(inbox_dropped);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(4096, 256);
}

void messaging_deinit(void) {
  app_message_deregister_callbacks();
}

void messaging_set_now_playing_handler(MAUpdateCallback cb) { s_now_playing_cb = cb; }
void messaging_set_albums_handler(MAUpdateCallback cb)      { s_albums_cb = cb; }
void messaging_set_speakers_handler(MAUpdateCallback cb)    { s_speakers_cb = cb; }

void messaging_send_command(uint8_t command) {
  DictionaryIterator *iter;
  AppMessageResult r = app_message_outbox_begin(&iter);
  if (r != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "[MA] outbox begin: %d", r);
    return;
  }
  dict_write_uint8(iter, MESSAGE_KEY_COMMAND, command);
  app_message_outbox_send();
}

void messaging_send_play_album(const char *album_id, const char *player_id) {
  DictionaryIterator *iter;
  AppMessageResult r = app_message_outbox_begin(&iter);
  if (r != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "[MA] outbox begin: %d", r);
    return;
  }

  char payload[160];
  snprintf(payload, sizeof(payload),
           "{\"album_id\":\"%s\",\"player_id\":\"%s\"}",
           album_id ? album_id : "",
           player_id ? player_id : "");

  dict_write_uint8(iter, MESSAGE_KEY_COMMAND, CMD_PLAY_ALBUM);
  dict_write_cstring(iter, MESSAGE_KEY_DATA, payload);
  app_message_outbox_send();
}
