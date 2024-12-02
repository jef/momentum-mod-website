import { ParsedResponse, RequestUtil } from './request.util';
import {
  Gamemode,
  RunSubsegment,
  Tickrates,
  TrackType
} from '@momentum/constants';
import * as Random from '@momentum/random';
import { arrayFrom, sleep } from '@momentum/util-fn';
import { REPLAY_MAGIC, ReplayHeader } from '@momentum/formats/replay';

const DEFAULT_DELAY_MS = 10;

export interface RunTesterProps {
  token?: string;
  mapID: number;
  mapName: string;
  mapHash: string;
  steamID: bigint;
  playerName: string;
  gamemode: Gamemode;
  trackType: TrackType;
  trackNum: number;
}

/**
 * Testing utility which fires run timestamp update calls to the server, then
 * generates replay header and splits in sync with the server's run updates.
 */
export class RunTester {
  props: RunTesterProps;

  sessionID: number;

  startTime: number;
  currTime: number;

  currSeg: number;
  currCP: number;

  splits = { segments: [] };

  private req: RequestUtil;

  constructor(req: RequestUtil, props: RunTesterProps) {
    this.req = req;
    this.props = props;
  }

  static async run(args: {
    req: RequestUtil;
    props: RunTesterProps;
    zones: number[]; // array of number of minor checkpoints. 4 cp linear would be [0, 0, 0, 0]
    delay?: number;
    startSeg?: number;
  }) {
    const runTester = new RunTester(args.req, args.props);

    await runTester.startRun({ startSeg: args.startSeg });

    await runTester.doZones(args.zones, args.delay ?? DEFAULT_DELAY_MS);

    return runTester.endRun({ delay: args.delay ?? DEFAULT_DELAY_MS });
  }

  async startRun(args?: { startSeg?: number }) {
    this.currSeg = args?.startSeg ?? 0;
    this.currCP = 0;
    this.startTime = Date.now();

    const res = await this.req.post({
      url: 'session/run',
      body: {
        mapID: this.props.mapID,
        gamemode: this.props.gamemode,
        trackType: this.props.trackType,
        trackNum: this.props.trackNum
      },
      status: 200,
      token: this.props.token ?? ''
    });
    this.sessionID = res.body.id;
  }

  async doZones(zones: number[], delay = DEFAULT_DELAY_MS) {
    for (const [i, zone] of zones.entries()) {
      if (i > 0) await this.startSegment({ delay });
      for (let j = 0; j < zone; j++) {
        await this.doCP({ delay });
      }
    }
  }

  async doCP(args?: { delay?: number; setCP?: number }) {
    this.currCP = args?.setCP ?? this.currCP + 1;
    return this.doUpdate(false, args?.delay ?? DEFAULT_DELAY_MS);
  }

  async startSegment(args?: {
    delay?: number;
    setSeg?: number;
    setCP?: number;
  }) {
    this.currSeg = args?.setSeg ?? this.currSeg + 1;
    this.currCP = args?.setCP ?? 0;
    return this.doUpdate(true, args?.delay ?? DEFAULT_DELAY_MS);
  }

  async doUpdate(isNewSegment: boolean, delay = DEFAULT_DELAY_MS) {
    // Wish we could use Jest fake timers here, but won't work with a live DB,
    // as we rely on createdAt values generated from Prisma/Postgres
    await sleep(delay);

    this.currTime = Date.now();
    const timeTotal = Date.now() - this.startTime;

    await this.req.post({
      url: `session/run/${this.sessionID}`,
      body: { segment: this.currSeg, checkpoint: this.currCP, time: timeTotal },
      status: 204,
      token: this.props.token ?? ''
    });

    const subseg: RunSubsegment = {
      velocityWhenReached: { x: 0, y: 0, z: 0 },
      timeReached: timeTotal,
      minorNum: this.currCP + 1
    };

    if (isNewSegment) {
      this.splits.segments.push({
        effectiveStartVelocity: { x: 0, y: 0, z: 0 },
        checkpointsOrdered: true,
        stats: {
          jumps: 0,
          strafes: 0,
          horizontalDistanceTravelled: 0,
          overallDistanceTravelled: 0,
          maxOverallSpeed: 0,
          maxHorizontalSpeed: 0
        },
        subsegments: [subseg]
      });
    } else {
      this.splits.segments.at(-1).subsegments.push(subseg);
    }
  }

  async endRun(args?: {
    delay?: number;
    beforeSubmit?: (self: RunTester) => void;
    beforeSave?: (self: RunTester) => void;
  }): Promise<ParsedResponse> {
    const delay = args?.delay ?? DEFAULT_DELAY_MS;

    await sleep(delay);
    const timeTotal = Date.now() - this.startTime;

    const header: ReplayHeader = {
      magic: REPLAY_MAGIC,
      formatVersion: -1,
      timestamp: BigInt(Date.now()),
      mapName: this.props.mapName,
      mapHash: this.props.mapHash,
      gamemode: this.props.gamemode,
      tickInterval: Tickrates.get(this.props.gamemode),
      playerSteamID: this.props.steamID,
      playerName: this.props.playerName,
      trackType: this.props.trackType,
      trackNum: this.props.trackNum,
      runTime: timeTotal / 1000
    };

    // TODO: Leaving several parts of this file commented out until we refactor
    // replay file to support new zones!
    // if (this.replay.zoneStats.length > 0) {
    //   this.replay.zoneStats.push({
    //     zoneNum: this.currZone,
    //     baseStats: RunTester.createStats(
    //       new Date(),
    //       this.replay.zoneStats.at(-1).baseStats.totalTime
    //     )
    //   });
    //
    //   this.replay.overallStats = {
    //     jumps: this.sumField('jumps'),
    //     strafes: this.sumField('strafes'),
    //     avgStrafeSync: this.sumField('avgStrafeSync'),
    //     avgStrafeSync2: this.sumField('avgStrafeSync2'),
    //     enterTime: 0,
    //     totalTime: this.replay.zoneStats.at(-1).baseStats.totalTime,
    //     velMax3D: this.sumField('velMax3D'),
    //     velMax2D: this.sumField('velMax2D'),
    //     velAvg3D: this.sumField('velAvg3D'),
    //     velAvg2D: this.sumField('velAvg2D'),
    //     velEnter3D: this.sumField('velEnter3D'),
    //     velEnter2D: this.sumField('velEnter2D'),
    //     velExit3D: this.sumField('velExit3D'),
    //     velExit2D: this.sumField('velExit2D')
    //   };
    // } else {
    //   this.replay.overallStats = RunTester.createStats(new Date(), 0);
    // }

    this.replay.frames = arrayFrom(this.stopTick, () =>
      RunTester.createFrame()
    );

    // Pass context to callback and execute, allowing tests to manipulate all
    // sorts of nonsense. Gotta love JS!
    args?.beforeSave?.(this);

    this.writeReplayFile(args?.writeStats ?? true, args?.writeFrames ?? true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    args?.beforeSubmit?.(this);

    return this.req.postOctetStream({
      url: `session/run/${this.sessionID}/end`,
      body: this.replayBuffer.buffer,
      token: this.props.token ?? ''
    });
  }

  private sumField(fieldName: string): number {
    return this.replay.zoneStats.reduce(
      (r, zs: ZoneStats) => r + zs.baseStats[fieldName],
      0
    );
  }

  private writeReplayFile(writeStats = true, writeFrames = true) {
    // Header
    this.replayBuffer.writeHeader(this.replay);

    // TODO: See above
    // // Stats
    // if (writeStats) {
    //   this.replayFile.writeInt8(1, false); // hasStats
    //   this.replayFile.writeInt8(this.replay.zoneStats.length); // numZones
    //
    //   // Only testing non-IL for now
    //   this.replayFile.writeBaseStats(
    //     this.replay.overallStats,
    //     this.replay.header.tickRate
    //   );
    //   for (const zone of this.replay.zoneStats)
    //     this.replayFile.writeBaseStats(
    //       zone.baseStats,
    //       this.replay.header.tickRate
    //     );
    // }
    //
    // if (writeFrames) {
    //   this.replayFile.writeInt32(this.replay.frames.length);
    //   // Frames
    //   for (const frame of this.replay.frames)
    //     this.replayFile.writeRunFrame(frame);
    // }
  }

  private static createStats(startDate: Date, previousTime: number): BaseStats {
    const sqrt2 = Math.sqrt(2);
    const sqrt3 = Math.sqrt(3);
    return {
      jumps: Random.int(0, 5),
      strafes: Random.int(0, 5),
      avgStrafeSync: Random.float(70, 90),
      avgStrafeSync2: Random.float(70, 90),
      enterTime: previousTime,
      totalTime: (Date.now() - startDate.getTime()) / 1000,
      velMax3D: Random.float(0, sqrt3 * 3500),
      velMax2D: Random.float(0, sqrt2 * 3500),
      velAvg3D: Random.float(0, sqrt3 * 3500),
      velAvg2D: Random.float(0, sqrt2 * 3500),
      velEnter3D: Random.float(0, sqrt3 * 3500),
      velEnter2D: Random.float(0, sqrt2 * 3500),
      velExit3D: Random.float(0, sqrt3 * 3500),
      velExit2D: Random.float(0, sqrt2 * 3500)
    };
  }

  // We don't actually validate these, this should pass fine.
  private static createFrame(): RunFrame {
    return {
      eyeAngleX: 0,
      eyeAngleY: 0,
      eyeAngleZ: 0,
      posX: 0,
      posZ: 0,
      posY: 0,
      viewOffset: 0,
      buttons: 0
    };
  }
}
