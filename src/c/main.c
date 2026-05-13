#include <pebble.h>

#include "messaging.h"
#include "now_playing.h"
#include "recent_albums.h"
#include "speakers.h"
#include "state.h"

static void on_now_playing_update(void) {
  now_playing_refresh();
}

static void on_albums_update(void) {
  recent_albums_refresh();
}

static void on_speakers_update(void) {
  speakers_refresh();
}

static void init(void) {
  messaging_set_now_playing_handler(on_now_playing_update);
  messaging_set_albums_handler(on_albums_update);
  messaging_set_speakers_handler(on_speakers_update);
  messaging_init();

  now_playing_push();
}

static void deinit(void) {
  messaging_deinit();
  speakers_deinit();
  recent_albums_deinit();
  now_playing_deinit();
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
