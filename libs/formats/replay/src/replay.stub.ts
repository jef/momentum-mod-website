import { REPLAY_MAGIC, ReplayHeader } from './index';
import { Gamemode, RunSplits, TrackType } from '@momentum/constants';

const BASE_TIME = 1732297480885;
const BIG_BASE_TIME = BigInt(BASE_TIME);

export const ReplayHeaderStub: ReplayHeader = {
  magic: REPLAY_MAGIC,
  formatVersion: -1,
  timestamp: BIG_BASE_TIME + 10000n,
  mapName: 'surf_jason_bourne',
  mapHash: 'A'.repeat(40),
  gamemode: Gamemode.SJ,
  tickInterval: 0.00999999991324,
  playerSteamID: 123456n,
  playerName: 'Bono',
  trackType: TrackType.MAIN,
  trackNum: 1,
  runTime: 10.01
};

export const RunSplitsStub: RunSplits = {
  trackStats: {
    jumps: 1,
    strafes: 1,
    horizontalDistanceTravelled: 1,
    overallDistanceTravelled: 1000,
    maxOverallSpeed: 100,
    maxHorizontalSpeed: 1
  },
  segments: [
    {
      checkpointsOrdered: true,
      effectiveStartVelocity: { x: 100, y: -100, z: 0 },
      subsegments: [
        {
          velocityWhenReached: { x: 0, y: 0, z: 3500 },
          timeReached: BASE_TIME + 1000,
          minorNum: 1
        }
      ],
      stats: {
        jumps: 1,
        strafes: 1,
        horizontalDistanceTravelled: 1,
        overallDistanceTravelled: 1,
        maxOverallSpeed: 1,
        maxHorizontalSpeed: 1
      }
    }
  ]
};
