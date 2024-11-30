import { RunSessionTimestamp, User } from '@prisma/client';
import {
  RunValidationError,
  MapZones,
  RunValidationErrorType as ErrorType,
  Tickrates,
  TrackType,
  Segment,
  RunSplits
} from '@momentum/constants';
import * as ReplayFile from '@momentum/formats/replay';
import { CompletedRunSession, ProcessedRun } from './run-session.interface';
import { approxEq } from '@momentum/util-fn';
import { Logger } from '@nestjs/common';

/**
 * Class for managing the parsing of a replay file and validating it against
 * run data
 */
export class RunProcessor {
  readonly buffer: Buffer;
  readonly session: CompletedRunSession;
  readonly user: User;
  readonly zones: MapZones;
  readonly replayHeader: ReplayFile.ReplayHeader;
  readonly splits: RunSplits;

  static readonly logger = new Logger('Run Processor');

  private constructor(
    buffer: Buffer,
    session: CompletedRunSession,
    user: User
  ) {
    try {
      this.buffer = buffer;
      this.session = session;
      this.user = user;
      this.zones = JSON.parse(session.mmap.currentVersion.zones);
      this.replayHeader = ReplayFile.Reader.readHeader(this.buffer);
      this.splits = ReplayFile.Reader.readRunSplits(this.buffer);
    } catch {
      throw new RunValidationError(ErrorType.BAD_REPLAY_FILE);
    }
  }

  /** @throws {RunValidationError} */
  static parse(buffer: Buffer, session: CompletedRunSession, user: User) {
    return new RunProcessor(buffer, session, user);
  }

  /** @throws {RunValidationError} */
  validateSessionTimestamps() {
    const { timestamps, trackType, trackNum } = this.session;

    // Not giving specific reasons for throwing - if this ever happens they
    // an update timed out, the map zones are buggy, or someone's submitting
    // something nefarious. There's better ways to warn the user if they time
    // out, ideally as soon as it happens. If it's something nefarious don't
    // help them out with detailed errors.
    //
    // Note that that currently, the timestamps do NOT include hitting the end
    // zone. The game is stupid and can't send a multipart form, and needs to
    // send a replay file, so we determine the final time by parsing the replay,
    // rather than a timestamp. This will probably change in the future!

    if (timestamps.length === 0) {
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
    }

    // Check time is always increasing
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i].time < timestamps[i - 1].time) {
        throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
      }
    }

    // Check for duplicates
    if (
      new Set(
        timestamps.map(
          // Random bitshift to combine segment and checkpoint into single
          // unique number used by Set ctor's uniqueness comparison
          ({ segment, checkpoint }) => (segment << 8) | checkpoint
        )
      ).size !== timestamps.length
    ) {
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
    }

    // Stage or bonus runs
    if (trackType !== TrackType.MAIN) {
      // Only one segment, and must match trackType
      if (!timestamps.every(({ segment }) => segment === trackNum - 1)) {
        throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
      }

      const segment =
        trackType === TrackType.STAGE
          ? this.zones.tracks.main.zones.segments[trackNum - 1]
          : this.zones.tracks.bonuses[trackNum - 1].zones.segments[0];

      this.validateSegment(segment, timestamps);

      return;
    }

    // Main track runs from here on out.
    // Segments are always ordered and required!
    const { zones } = this.zones.tracks.main;

    // trackNum must always be 1
    if (trackNum !== 1) {
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
    }

    // Check first timestamp is in first segment and last timestamp is in last
    if (
      timestamps[0].segment !== 0 ||
      timestamps.at(-1).segment !== zones.segments.length - 1
    ) {
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
    }

    // Check ordered, validate segments as we go
    let lastSegment = 0;
    let segmentStartIndex = 0;
    for (const [index, { segment }] of timestamps.entries()) {
      if (segment === lastSegment) {
        continue;
      }

      if (segment !== lastSegment + 1) {
        throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
      }

      this.validateSegment(
        zones.segments[lastSegment],
        timestamps.slice(segmentStartIndex, index)
      );

      lastSegment = segment;
      segmentStartIndex = index;
    }

    // Validate last segment
    this.validateSegment(
      zones.segments.at(-1),
      timestamps.slice(segmentStartIndex)
    );

    // Check required. Checking and this and that there's no duplicates
    // establishes that every segment has been hit.
    if (
      new Set(timestamps.map(({ segment }) => segment)).size !==
      zones.segments.length
    ) {
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
    }
  }

  private validateSegment(
    { checkpoints, checkpointsRequired, checkpointsOrdered }: Segment,
    timestamps: RunSessionTimestamp[]
  ) {
    // First checkpoint is always the start zone. It's never possible to skip a
    // start zone.
    if (timestamps[0].checkpoint !== 0) {
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
    }

    if (checkpointsOrdered) {
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i].checkpoint <= timestamps[i - 1].checkpoint) {
          throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
        }
      }
    }

    let expectedTimestamps = checkpoints.length;

    // If stagesEndAtStageStarts is true then then timestamps should
    // contain every checkpoint, since the end zone is either the first cp
    // of the next segment, or the main track's end zone.
    // If false, the end zone is the final checkpoint of the current segment,
    // so the timestamps should contain every checkpoint except the last.
    // Remember, the /end request sent on hitting the end zone doesn't have a
    // timestamp.
    if (
      this.session.trackType === TrackType.STAGE &&
      !this.zones.tracks.main.stagesEndAtStageStarts
    )
      expectedTimestamps -= 1;

    if (checkpointsRequired && timestamps.length !== expectedTimestamps)
      throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);
  }

  /** @throws {RunValidationError} */
  validateReplayHeader() {
    const { session, replayHeader: header } = this;

    if (header.trackType !== session.trackType)
      throw new RunValidationError(ErrorType.BAD_META);

    if (header.trackNum !== session.trackNum)
      throw new RunValidationError(ErrorType.BAD_META);

    if (header.magic !== ReplayFile.REPLAY_MAGIC)
      throw new RunValidationError(ErrorType.BAD_META);

    if (
      header.mapHash.toUpperCase() !==
      session.mmap.currentVersion.bspHash.toUpperCase()
    )
      throw new RunValidationError(ErrorType.BAD_META);

    if (header.mapName !== session.mmap.name)
      throw new RunValidationError(ErrorType.BAD_META);

    if (header.playerSteamID !== this.user.steamID)
      throw new RunValidationError(ErrorType.BAD_META);

    if (header.gamemode !== session.gamemode)
      throw new RunValidationError(ErrorType.BAD_META);

    if (!approxEq(header.tickInterval, Tickrates.get(session.gamemode)))
      throw new RunValidationError(ErrorType.OUT_OF_SYNC);

    // Note: runTime is in seconds, but in general, this code and tests uses ms
    // everywhere, try to stay consistent and convert any second-based values
    // to ms immediately.
    const headerRunTime = header.runTime * 1000;
    const headerTimestamp = Number(header.timestamp); // Unix time when replay file was written
    const sessionStart = this.session.createdAt.getTime();
    const now = Date.now();

    const sessionTime = now - sessionStart;
    const submitDelay = sessionTime - headerRunTime;
    const acceptableSubmitDelay = 10_000 + Math.min(headerRunTime / 60, 20_000);

    if (
      // Negative submit delay could theoretically happen if the run start
      // request arrives late, but end request is on time - allow a 1s margin.
      submitDelay < -1000 ||
      // 10,000 ms (10 seconds) for the timer stage -> end record -> submit,
      // then we add a second for every minute in the replay so longer replays
      // have more time to submit, up to a max of 20,000 ms. These constants are
      // assumed by unit tests, if changing them, change tests to.
      submitDelay > acceptableSubmitDelay ||
      // Max 1 second from replay file being written to now.
      now - headerTimestamp > 1000 ||
      // Timestamp in the future makes no sense.
      headerTimestamp > now
    ) {
      // Curious how often we see this fail, current value may be a bit harsh.
      RunProcessor.logger.log(
        `Rejecting run with submit delay of ${submitDelay / 1000}s. ` +
          `SessionID: ${this.session.id.toString()}, ` +
          `UserID: ${this.user.id.toString()}, ` +
          `Session start: ${this.session.createdAt.toISOString()}, ` +
          `Now: ${new Date().toISOString()}, ` +
          `Replay run time: ${header.runTime}, ` +
          `Replay timestamp: ${headerTimestamp}, ` +
          `Acceptable submit delay: ${acceptableSubmitDelay}`
      );

      throw new RunValidationError(ErrorType.OUT_OF_SYNC);
    }
  }

  validateRunSplits() {
    const acceptableDesync = 5000; // 5s

    for (const { segment, checkpoint, createdAt } of this.session.timestamps) {
      const splitSubSeg =
        this.splits.segments?.[segment]?.subsegments?.[checkpoint];

      // TODO: Not sure if this is right, or if check is needed...
      if (!splitSubSeg || splitSubSeg.minorNum !== checkpoint - 1)
        throw new RunValidationError(ErrorType.BAD_TIMESTAMPS);

      const desync = createdAt.getTime() - splitSubSeg.timeReached;
      if (desync < 0 || desync > acceptableDesync)
        throw new RunValidationError(ErrorType.OUT_OF_SYNC);
    }
  }

  getProcessed(): ProcessedRun {
    return {
      userID: this.user.id,
      mapID: this.session.mapID,
      gamemode: this.session.gamemode,
      trackType: this.session.trackType,
      trackNum: this.session.trackNum,
      time: this.replayHeader.runTime,
      splits: this.splits,
      flags: []
    };
  }
}
