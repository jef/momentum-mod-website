import { ParsedResponse, RequestUtil } from './request.util';
import {
  Gamemode,
  RunSegment,
  RunSplits,
  RunSubsegment,
  Tickrates,
  TrackType
} from '@momentum/constants';
import { sleep } from '@momentum/util-fn';
import * as ReplayFile from '@momentum/formats/replay';

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

  replayBuffer = Buffer.alloc(4000);
  segments: RunSegment[] = [
    {
      subsegments: [],
      stats: {} as any,
      checkpointsOrdered: true,
      effectiveStartVelocity: { x: 0, y: 0, z: 0 }
    }
  ];

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
      this.segments.push({
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
      this.segments.at(-1).subsegments.push(subseg);
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

    const header: ReplayFile.ReplayHeader = {
      magic: ReplayFile.REPLAY_MAGIC,
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

    const splits: RunSplits = {
      segments: this.segments,
      trackStats: {
        maxHorizontalSpeed: 0,
        maxOverallSpeed: 0,
        overallDistanceTravelled: 0,
        jumps: 0,
        strafes: 0,
        horizontalDistanceTravelled: 0
      }
    };

    ReplayFile.Writer.writeHeader(header, this.replayBuffer);
    ReplayFile.Writer.writeRunSplits(splits, this.replayBuffer);

    // Pass context to callback and execute, allowing tests to manipulate all
    // sorts of nonsense. Gotta love JS!
    args?.beforeSave?.(this);

    await sleep(50);

    args?.beforeSubmit?.(this);

    return this.req.postOctetStream({
      url: `session/run/${this.sessionID}/end`,
      body: this.replayBuffer,
      token: this.props.token ?? ''
    });
  }
}
