import {
  double,
  float,
  int32,
  int64,
  TrackType,
  uint64,
  uint8
} from '@momentum/constants';
import { magic } from '@momentum/util-fn';

export * as Reader from './replay-reader';
export * as Writer from './replay-writer';
export * as Stubs from './replay.stub';

export const REPLAY_MAGIC: int32 = magic('MMTV');

/**
 * ReplayHeader struct in C++
 * 193 bytes total, packed on byte boundaries with #pragma pack(1)
 * @see momtv.h, mom_timer_defs.h (licensee-only)
 */
// prettier-ignore
export interface ReplayHeader {
  //                         Size     Offset
  magic: int32;           // 4        0
  formatVersion: int32;   // 4        4
  timestamp: int64;       // 8        8
  mapName: string;        // 64       16
  mapHash: string;        // 41       80
  gamemode: uint8;        // 1        121
  tickInterval: float;    // 4        122
  playerSteamID: uint64;  // 8        126
  playerName: string;     // 32       134
  trackType: TrackType;   // 1        166
  trackNum: uint8;        // 1        167
  runTime: double;        // 8        168
  // Other stuff, unused  // 17       176
}

export interface TrackID {
  type: uint8;
  number: uint8;
}
