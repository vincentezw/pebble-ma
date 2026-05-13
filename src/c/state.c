#include "state.h"

#include <string.h>

static MANowPlaying  s_now_playing;
static MAAlbumList   s_albums;
static MASpeakerList s_speakers;
static char          s_selected_album_id[MA_MAX_ID];

MANowPlaying *state_now_playing(void) {
  return &s_now_playing;
}

MAAlbumList *state_albums(void) {
  return &s_albums;
}

MASpeakerList *state_speakers(void) {
  return &s_speakers;
}

void state_set_selected_album_id(const char *id) {
  strncpy(s_selected_album_id, id, sizeof(s_selected_album_id) - 1);
  s_selected_album_id[sizeof(s_selected_album_id) - 1] = '\0';
}

const char *state_selected_album_id(void) {
  return s_selected_album_id;
}

void state_reset_albums(void) {
  s_albums.count = 0;
  s_albums.loaded = false;
}

void state_reset_speakers(void) {
  s_speakers.count = 0;
  s_speakers.loaded = false;
}
