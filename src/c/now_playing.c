#include "now_playing.h"

#include <pebble.h>
#include <stdio.h>
#include <string.h>

#include "messaging.h"
#include "recent_albums.h"
#include "state.h"

static Window      *s_window;

static TextLayer   *s_song_layer;
static TextLayer   *s_album_layer;
static TextLayer   *s_progress_layer;
static TextLayer   *s_duration_layer;
static TextLayer   *s_speaker_layer;

static BitmapLayer *s_cassette_layer;
static BitmapLayer *s_status_icon_layer;
static BitmapLayer *s_speaker_icon_layer;
static BitmapLayer *s_hint_prev_layer;
static BitmapLayer *s_hint_playpause_layer;
static BitmapLayer *s_hint_next_layer;

static Layer       *s_progress_bar_layer;

static GBitmap     *s_bmp_cassette;
static GBitmap     *s_bmp_nocassette;
static GBitmap     *s_bmp_play;
static GBitmap     *s_bmp_paused;
static GBitmap     *s_bmp_stopped;
static GBitmap     *s_bmp_speaker;
static GBitmap     *s_bmp_hint_prev;
static GBitmap     *s_bmp_hint_playpause;
static GBitmap     *s_bmp_hint_next;

static char s_song_buf[MA_MAX_STR * 2 + 4];
static char s_album_buf[MA_MAX_STR];
static char s_progress_buf[8];
static char s_duration_buf[12];
static char s_speaker_buf[MA_MAX_STR + 8];

static bool s_long_select = false;
static bool s_long_up     = false;
static bool s_long_down   = false;

static void format_time(uint16_t seconds, char *dst, size_t dst_len) {
  uint16_t m = seconds / 60;
  uint16_t s = seconds % 60;
  snprintf(dst, dst_len, "%u:%02u", m, s);
}

static void render_state(void) {
  MANowPlaying *np = state_now_playing();

  const char *title;
  GBitmap *status_icon;
  GBitmap *cassette;

  switch (np->state) {
    case MA_STATE_PLAYING:
      title = "Playing";
      status_icon = s_bmp_play;
      cassette = s_bmp_cassette;
      break;
    case MA_STATE_PAUSED:
      title = "Paused";
      status_icon = s_bmp_paused;
      cassette = s_bmp_cassette;
      break;
    case MA_STATE_STOPPED:
      title = "Stopped";
      status_icon = s_bmp_stopped;
      cassette = s_bmp_cassette;
      break;
    case MA_STATE_DISCONNECTED:
      title = "Disconnected";
      status_icon = s_bmp_stopped;
      cassette = s_bmp_nocassette;
      break;
    case MA_STATE_QUIET:
    default:
      title = "Ssht... no music playing";
      status_icon = s_bmp_stopped;
      cassette = s_bmp_nocassette;
      break;
  }

  if (np->song_name[0] && np->artist[0]) {
    snprintf(s_song_buf, sizeof(s_song_buf), "%s - %s", np->song_name, np->artist);
  } else {
    strncpy(s_song_buf, title, sizeof(s_song_buf) - 1);
    s_song_buf[sizeof(s_song_buf) - 1] = '\0';
  }
  text_layer_set_text(s_song_layer, s_song_buf);

  strncpy(s_album_buf, np->album, sizeof(s_album_buf) - 1);
  s_album_buf[sizeof(s_album_buf) - 1] = '\0';
  text_layer_set_text(s_album_layer, s_album_buf);

  if (np->player_name[0]) {
    if (np->has_volume) {
      snprintf(s_speaker_buf, sizeof(s_speaker_buf), "%s (%u%%)", np->player_name, np->volume);
    } else {
      strncpy(s_speaker_buf, np->player_name, sizeof(s_speaker_buf) - 1);
      s_speaker_buf[sizeof(s_speaker_buf) - 1] = '\0';
    }
  } else {
    strncpy(s_speaker_buf, "-", sizeof(s_speaker_buf));
  }
  text_layer_set_text(s_speaker_layer, s_speaker_buf);

  if (np->position > 0) {
    format_time(np->position, s_progress_buf, sizeof(s_progress_buf));
  } else {
    strncpy(s_progress_buf, "--:--", sizeof(s_progress_buf));
  }
  text_layer_set_text(s_progress_layer, s_progress_buf);

  if (np->duration > 0) {
    char d[8];
    format_time(np->duration, d, sizeof(d));
    snprintf(s_duration_buf, sizeof(s_duration_buf), " / %s", d);
  } else {
    strncpy(s_duration_buf, " / --:--", sizeof(s_duration_buf));
  }
  text_layer_set_text(s_duration_layer, s_duration_buf);

  bitmap_layer_set_bitmap(s_cassette_layer, cassette);
  bitmap_layer_set_bitmap(s_status_icon_layer, status_icon);

  layer_mark_dirty(s_progress_bar_layer);
}

static void progress_bar_update(Layer *layer, GContext *ctx) {
  MANowPlaying *np = state_now_playing();
  GRect b = layer_get_bounds(layer);

  graphics_context_set_fill_color(ctx, GColorLightGray);
  graphics_fill_rect(ctx, b, 0, GCornerNone);

  if (np->duration == 0) return;

  uint32_t fill = ((uint32_t)b.size.w * np->position) / np->duration;
  if (fill > (uint32_t)b.size.w) fill = b.size.w;

  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, GRect(0, 0, fill, b.size.h), 0, GCornerNone);
}

static void tick_handler(struct tm *now, TimeUnits units) {
  MANowPlaying *np = state_now_playing();
  if (np->state != MA_STATE_PLAYING) return;

  np->position++;
  if (np->duration && np->position > np->duration) np->position = np->duration;

  if (np->position > 0) {
    format_time(np->position, s_progress_buf, sizeof(s_progress_buf));
  } else {
    strncpy(s_progress_buf, "--:--", sizeof(s_progress_buf));
  }
  text_layer_set_text(s_progress_layer, s_progress_buf);
  layer_mark_dirty(s_progress_bar_layer);
}

// ── buttons ─────────────────────────────────────────────────────────────────

static void select_long_down(ClickRecognizerRef rec, void *ctx) {
  s_long_select = true;
  recent_albums_push();
}
static void select_release(ClickRecognizerRef rec, void *ctx) {
  if (!s_long_select) messaging_send_command(CMD_PLAY_PAUSE);
  s_long_select = false;
}

static void up_long_down(ClickRecognizerRef rec, void *ctx) {
  s_long_up = true;
  messaging_send_command(CMD_VOLUME_UP);
}
static void up_release(ClickRecognizerRef rec, void *ctx) {
  if (!s_long_up) messaging_send_command(CMD_PREVIOUS);
  s_long_up = false;
}

static void down_long_down(ClickRecognizerRef rec, void *ctx) {
  s_long_down = true;
  messaging_send_command(CMD_VOLUME_DOWN);
}
static void down_release(ClickRecognizerRef rec, void *ctx) {
  if (!s_long_down) messaging_send_command(CMD_NEXT);
  s_long_down = false;
}

static void click_config(void *ctx) {
  window_long_click_subscribe(BUTTON_ID_SELECT, 600, select_long_down, select_release);
  window_long_click_subscribe(BUTTON_ID_UP,     600, up_long_down,     up_release);
  window_long_click_subscribe(BUTTON_ID_DOWN,   600, down_long_down,   down_release);
}

// ── window lifecycle ────────────────────────────────────────────────────────

static TextLayer *make_text(Layer *parent, GRect frame, const char *font_key, GTextAlignment align) {
  TextLayer *t = text_layer_create(frame);
  text_layer_set_font(t, fonts_get_system_font(font_key));
  text_layer_set_text_alignment(t, align);
  text_layer_set_background_color(t, GColorClear);
  text_layer_set_text_color(t, GColorBlack);
  layer_add_child(parent, text_layer_get_layer(t));
  return t;
}

static BitmapLayer *make_bitmap(Layer *parent, GRect frame, GBitmap *bmp) {
  BitmapLayer *l = bitmap_layer_create(frame);
  bitmap_layer_set_compositing_mode(l, GCompOpSet);
  bitmap_layer_set_bitmap(l, bmp);
  layer_add_child(parent, bitmap_layer_get_layer(l));
  return l;
}

static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect bounds = layer_get_bounds(root);
  window_set_background_color(w, GColorWhite);

  s_bmp_cassette        = gbitmap_create_with_resource(RESOURCE_ID_CASSETTE);
  s_bmp_nocassette      = gbitmap_create_with_resource(RESOURCE_ID_NOCASETTE);
  s_bmp_play            = gbitmap_create_with_resource(RESOURCE_ID_ICONPLAY);
  s_bmp_paused          = gbitmap_create_with_resource(RESOURCE_ID_ICONPAUSED);
  s_bmp_stopped         = gbitmap_create_with_resource(RESOURCE_ID_ICONSTOPPED);
  s_bmp_speaker         = gbitmap_create_with_resource(RESOURCE_ID_ICONSPEAKER);
  s_bmp_hint_prev       = gbitmap_create_with_resource(RESOURCE_ID_ICON_PREVIOUS);
  s_bmp_hint_playpause  = gbitmap_create_with_resource(RESOURCE_ID_ICON_PLAYPAUSE);
  s_bmp_hint_next       = gbitmap_create_with_resource(RESOURCE_ID_ICON_NEXT);

  const int16_t W = bounds.size.w;

  // Right-hand button hints (column of 3 small bitmaps, mirrors Piu iconColumn).
  GRect hint_prev_frame      = GRect(W - 14, 18,                 12, 12);
  GRect hint_playpause_frame = GRect(W - 14, (bounds.size.h - 12) / 2, 12, 12);
  GRect hint_next_frame      = GRect(W - 14, bounds.size.h - 30, 12, 12);
  s_hint_prev_layer       = make_bitmap(root, hint_prev_frame,      s_bmp_hint_prev);
  s_hint_playpause_layer  = make_bitmap(root, hint_playpause_frame, s_bmp_hint_playpause);
  s_hint_next_layer       = make_bitmap(root, hint_next_frame,      s_bmp_hint_next);

  const int16_t CONTENT_W = W - 18;  // leave room for the hint column

  // Song / artist label.
  s_song_layer = make_text(root, GRect(4, 24, CONTENT_W, 56),
                           FONT_KEY_GOTHIC_18_BOLD, GTextAlignmentCenter);

  // Cassette in the middle.
  s_cassette_layer = make_bitmap(root,
    GRect((CONTENT_W - 32) / 2, 84, 32, 24), s_bmp_nocassette);

  // Album label below the cassette.
  s_album_layer = make_text(root, GRect(4, 114, CONTENT_W, 28),
                            FONT_KEY_GOTHIC_18, GTextAlignmentCenter);

  // Progress bar.
  s_progress_bar_layer = layer_create(GRect(10, 150, CONTENT_W - 12, 4));
  layer_set_update_proc(s_progress_bar_layer, progress_bar_update);
  layer_add_child(root, s_progress_bar_layer);

  // Progress row: status icon + elapsed + duration.
  s_status_icon_layer = make_bitmap(root, GRect(12, 162, 10, 10), s_bmp_stopped);
  s_progress_layer = make_text(root, GRect(28, 156, 60, 24),
                               FONT_KEY_GOTHIC_18, GTextAlignmentLeft);
  s_duration_layer = make_text(root, GRect(88, 156, CONTENT_W - 88, 24),
                               FONT_KEY_GOTHIC_18, GTextAlignmentLeft);

  // Speaker row at the bottom.
  s_speaker_icon_layer = make_bitmap(root, GRect(12, bounds.size.h - 28, 15, 15),
                                     s_bmp_speaker);
  s_speaker_layer = make_text(root, GRect(32, bounds.size.h - 30, CONTENT_W - 32, 24),
                              FONT_KEY_GOTHIC_18, GTextAlignmentLeft);

  render_state();
  tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
}

static void window_unload(Window *w) {
  tick_timer_service_unsubscribe();

  text_layer_destroy(s_song_layer);
  text_layer_destroy(s_album_layer);
  text_layer_destroy(s_progress_layer);
  text_layer_destroy(s_duration_layer);
  text_layer_destroy(s_speaker_layer);

  bitmap_layer_destroy(s_cassette_layer);
  bitmap_layer_destroy(s_status_icon_layer);
  bitmap_layer_destroy(s_speaker_icon_layer);
  bitmap_layer_destroy(s_hint_prev_layer);
  bitmap_layer_destroy(s_hint_playpause_layer);
  bitmap_layer_destroy(s_hint_next_layer);

  layer_destroy(s_progress_bar_layer);

  gbitmap_destroy(s_bmp_cassette);
  gbitmap_destroy(s_bmp_nocassette);
  gbitmap_destroy(s_bmp_play);
  gbitmap_destroy(s_bmp_paused);
  gbitmap_destroy(s_bmp_stopped);
  gbitmap_destroy(s_bmp_speaker);
  gbitmap_destroy(s_bmp_hint_prev);
  gbitmap_destroy(s_bmp_hint_playpause);
  gbitmap_destroy(s_bmp_hint_next);
}

void now_playing_push(void) {
  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = window_load,
      .unload = window_unload,
    });
    window_set_click_config_provider(s_window, click_config);
  }
  window_stack_push(s_window, true);
}

void now_playing_refresh(void) {
  if (!s_window || !window_is_loaded(s_window)) return;
  render_state();
}

void now_playing_deinit(void) {
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
}
