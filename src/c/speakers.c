#include "speakers.h"

#include <pebble.h>

#include "messaging.h"
#include "state.h"

static Window    *s_window;
static MenuLayer *s_menu;

static uint16_t menu_num_rows(MenuLayer *m, uint16_t section, void *ctx) {
  MASpeakerList *sl = state_speakers();
  if (!sl->loaded) return 1;
  if (sl->count == 0) return 1;
  return sl->count;
}

static int16_t menu_row_height(MenuLayer *m, MenuIndex *idx, void *ctx) {
  return 36;
}

static void menu_draw_row(GContext *gctx, const Layer *cell_layer,
                          MenuIndex *idx, void *ctx) {
  MASpeakerList *sl = state_speakers();

  if (!sl->loaded) {
    menu_cell_basic_draw(gctx, cell_layer, "Loading…", NULL, NULL);
    return;
  }
  if (sl->count == 0) {
    menu_cell_basic_draw(gctx, cell_layer, "No speakers available", NULL, NULL);
    return;
  }
  if (idx->row >= sl->count) return;

  menu_cell_basic_draw(gctx, cell_layer, sl->items[idx->row].name, NULL, NULL);
}

static void menu_select_click(MenuLayer *m, MenuIndex *idx, void *ctx) {
  MASpeakerList *sl = state_speakers();
  if (!sl->loaded || sl->count == 0) return;
  if (idx->row >= sl->count) return;

  messaging_send_play_album(state_selected_album_id(), sl->items[idx->row].id);
  // Pop both speakers + recent_albums so we land back at now-playing.
  window_stack_pop(false);
  window_stack_pop(true);
}

static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  GRect bounds = layer_get_bounds(root);

  s_menu = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_menu, NULL, (MenuLayerCallbacks) {
    .get_num_rows    = menu_num_rows,
    .get_cell_height = menu_row_height,
    .draw_row        = menu_draw_row,
    .select_click    = menu_select_click,
  });
  menu_layer_set_click_config_onto_window(s_menu, w);
  layer_add_child(root, menu_layer_get_layer(s_menu));
}

static void window_unload(Window *w) {
  menu_layer_destroy(s_menu);
  s_menu = NULL;
}

void speakers_push(void) {
  state_reset_speakers();
  messaging_send_command(CMD_REQUEST_SPEAKERS);

  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = window_load,
      .unload = window_unload,
    });
  }
  window_stack_push(s_window, true);
}

void speakers_refresh(void) {
  if (s_menu) menu_layer_reload_data(s_menu);
}

void speakers_deinit(void) {
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
}
