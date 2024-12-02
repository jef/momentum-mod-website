import { readFileSync, writeFileSync } from 'node:fs';
import { readRunSplits } from '../src/replay-reader';

const replay = readFileSync('./tmp.mtv');

writeFileSync('./splits.json', JSON.stringify(readRunSplits(replay), null, 2));
