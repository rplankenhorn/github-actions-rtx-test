import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { createHash } from 'crypto';
import { hashFiles as hash } from '@actions/glob';
import { restoreCache, saveCache } from '@actions/cache/lib/cache.js';

const hashFiles = async (
  matchPatterns,
  followSymbolicLinks = false
) => {
  const patterns = matchPatterns.join('\n');
  const match = await hash(patterns, { followSymbolicLinks });
  if (match === '') return;
  return match;
}

const main = async () => {
  const asdfDir = path.join(os.homedir(), '.asdf');

  const asdfCacheOptions = {
    id: 'asdf',
    version: 3,
    inputPaths: ['.tool-versions'],
    cachedPaths: [asdfDir],
    allowPartialRestore: true
  };

  const data = await fs.promises.readFile('.tool-versions');
  
  const fileHash = createHash('sha256').update(data).digest('hex');

  const primaryKey = `javascript-${process.env['RUNNER_OS']}-${process.env['RUNNER_ARCH']}-${
    asdfCacheOptions.id
  }-cache-v${asdfCacheOptions.version}-${fileHash}`;
  
  const cacheId = restoreCache(asdfCacheOptions.inputPaths, primaryKey);
  
  const cacheHit = cacheId === primaryKey;
  
  if (cacheId === primaryKey) {
    core.info(`Cache restored from primaryKey ${primaryKey}`);
  } else {
    core.info(`Cloning asdf into ASDF_DIR: ${asdfDir}`);
    const branch = 'master';
    await exec.exec('git', [
      'clone',
      '--depth',
      '1',
      '--branch',
      branch,
      'https://github.com/asdf-vm/asdf.git',
      asdfDir
    ]);
  }
  
  core.exportVariable('ASDF_DIR', asdfDir);
  core.exportVariable('ASDF_DATA_DIR', asdfDir);
  core.addPath(`${asdfDir}/bin`);
  core.addPath(`${asdfDir}/shims`);
  
  if (!cacheHit) {
    await exec.exec('asdf', ['plugin-add', 'nodejs']);
    await exec.exec('asdf', ['plugin-add', 'pnpm']);
    await exec.exec('asdf', ['plugin-add', 'java']);
  }
  
  await exec.exec('asdf', 'plugin-list');
  await exec.exec('asdf', 'install');
  
  let saveCacheId = -1;
  try {
    saveCacheId = await saveCache(asdfCacheOptions.cachedPaths, primaryKey);
    if (saveCacheId !== -1) {
      core.info(`Cache saved with key: ${primaryKey}`);
    }
  } catch (err) {
    core.info(`${err}, ${JSON.stringify(asdfCacheOptions)}`);
  }
};

main();