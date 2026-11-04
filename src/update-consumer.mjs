import {readFileSync, writeFileSync, appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const NAME = '@nexa-llc/law-graph';
const PREFIX = 'https://codeload.github.com/NexA-LLC/law-graph/tar.gz/';
export async function updateConsumer({cwd = process.cwd(), write = false, fetchImpl = fetch} = {}) {
  const file = resolve(cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const current = pkg.dependencies?.[NAME];
  if (typeof current !== 'string' || !current.startsWith(PREFIX) || !/^[0-9a-f]{40}$/.test(current.slice(PREFIX.length))) throw new Error('Expected an exact HTTPS Law Graph commit dependency');
  const headers = {accept: 'application/vnd.github+json'};
  if (process.env.GITHUB_TOKEN) headers.authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const response = await fetchImpl('https://api.github.com/repos/NexA-LLC/law-graph/branches/main', {headers, redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('Unable to read public Law Graph main: HTTP ' + response.status);
  const upstream = await response.json();
  const revision = upstream.commit?.sha;
  if (!/^[0-9a-f]{40}$/.test(revision || '')) throw new Error('Invalid upstream commit');
  const target = PREFIX + revision;
  if (current !== target) {
    const manifestResponse = await fetchImpl('https://raw.githubusercontent.com/NexA-LLC/law-graph/' + revision + '/package.json', {redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!manifestResponse.ok) throw new Error('Unable to read upstream package manifest');
    const manifest = await manifestResponse.json();
    if (manifest.name !== NAME || manifest.researchProtocol !== 1 || !manifest.exports?.['./research']) throw new Error('Upstream does not provide the supported research interface');
    if (write) {pkg.dependencies[NAME] = target; writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');}
  }
  return {changed: current !== target, written: write && current !== target, from: current, to: target, revision};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {write: {type: 'boolean', default: false}}});
  updateConsumer({write: values.write}).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + result.changed + '\n');
  }).catch(error => {process.stderr.write(error.message + '\n'); process.exitCode = 1;});
}
