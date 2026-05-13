#include "recent_albums.h"

#include <pebble.h>

#include "messaging.h"
#include "speakers.h"
#include "state.h"

static Window    *s_window;
static MenuLayer *s_menu;

static uint16_t menu_num_rows(MenuLayer *m, uint16_t section, void *ctx) {
  MAAlbumList *al = state_albums();
  if (!al->loaded) return 1;
  if (al->count == 0) return 1;
  return al->count;
}

static int16_t menu_row_height(MenuLayer *m, MenuIndex *idx, void *ctx) {
  return 44;
}

static void menu_draw_row(GContext *gctx, const Layer *cell_layer,
                          MenuIndex *idx, void *ctx) {
  MAAlbumList *al = state_albums();

  if (!al->loaded) {
    menu_cell_basic_draw(gctx, cell_layer, "Loading…", NULL, NULL);
    return;
  }
  if (al->count == 0) {
    menu_cell_basic_draw(gctx, cell_layer, "No recent albums", NULL, NULL);
    return;
  }
  if (idx->row >= al->count) return;

  MAAlbum *a = &al->items[idx->row];
  menu_cell_basic_draw(gctx, cell_layer, a->name, a->artist, NULL);
}

static void menu_select_click(MenuLayer *m, MenuIndex *idx, void *ctx) {
  MAAlbumList *al = state_albums();
  if (!al->loaded || al->count == 0) return;
  if (idx->row >= al->count) return;

  state_set_selected_album_id(al->items[idx->row].id);
  speakers_push();
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

void recent_albums_push(void) {
  state_reset_albums();
  messaging_send_command(CMD_REQUEST_ALBUMS);

  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = window_load,
      .unload = window_unload,
    });
  }
  window_stack_push(s_window, true);
}

void recent_albums_refresh(void) {
  if (s_menu) menu_layer_reload_data(s_menu);
}

void recent_albums_deinit(void) {
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
}
