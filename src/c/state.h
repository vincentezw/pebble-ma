#pragma once

#include <pebble.h>

#define MA_MAX_STR        48
#define MA_MAX_ID         40
#define MA_MAX_ALBUMS     20
#define MA_MAX_SPEAKERS   10

typedef enum {
  MA_STATE_QUIET = 0,
  MA_STATE_DISCONNECTED,
  MA_STATE_STOPPED,
  MA_STATE_PAUSED,
  MA_STATE_PLAYING,
} MAPlayState;

typedef struct {
  MAPlayState state;
  char player_name[MA_MAX_STR];
  char song_name[MA_MAX_STR];
  char artist[MA_MAX_STR];
  char album[MA_MAX_STR];
  uint16_t duration;
  uint16_t position;
  uint8_t volume;
  bool has_volume;
} MANowPlaying;

typedef struct {
  char id[MA_MAX_ID];
  char name[MA_MAX_STR];
  char artist[MA_MAX_STR];
} MAAlbum;

typedef struct {
  char id[MA_MAX_ID];
  char name[MA_MAX_STR];
} MASpeaker;

typedef struct {
  MAAlbum items[MA_MAX_ALBUMS];
  uint8_t count;
  bool loaded;
} MAAlbumList;

typedef struct {
  MASpeaker items[MA_MAX_SPEAKERS];
  uint8_t count;
  bool loaded;
} MASpeakerList;

MANowPlaying  *state_now_playing(void);
MAAlbumList   *state_albums(void);
MASpeakerList *state_speakers(void);

void state_set_selected_album_id(const char *id);
const char *state_selected_album_id(void);

void state_reset_albums(void);
void state_reset_speakers(void);
