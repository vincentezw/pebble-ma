#pragma once

#include <pebble.h>

#define CMD_PLAY_PAUSE        1
#define CMD_PREVIOUS          2
#define CMD_NEXT              3
#define CMD_VOLUME_DOWN       4
#define CMD_VOLUME_UP         5
#define CMD_REQUEST_ALBUMS    6
#define CMD_REQUEST_SPEAKERS  7
#define CMD_PLAY_ALBUM        8

typedef void (*MAUpdateCallback)(void);

void messaging_init(void);
void messaging_deinit(void);

void messaging_set_now_playing_handler(MAUpdateCallback cb);
void messaging_set_albums_handler(MAUpdateCallback cb);
void messaging_set_speakers_handler(MAUpdateCallback cb);

void messaging_send_command(uint8_t command);
void messaging_send_play_album(const char *album_id, const char *player_id);
