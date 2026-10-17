import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
export const WAIT_MS = 20 * 60 * 1000,
  POLL_MS = 30000,
  DEPLOY_TIMEOUT_MS = 8 * 60 * 1000;

// CI authenticates with Fly SSH; the HTTP guard is reachable only on loopback.
export async function gateRequest(action, owner, { app = 'bonked', machine, run = execute } = {}) {
  if (!['acquire', 'release'].includes(action) || !/^[a-zA-Z0-9-]{16,80}$/.test(owner))
    throw Error('Invalid deployment request');
  const code = `(async()=>{const r=await fetch('http://127.0.0.1:'+(process.env.PORT||3210)+'/internal/deployment?action=${action}',{method:'POST',headers:{'x-deployment-owner':'${owner}'},signal:AbortSignal.timeout(5000)});console.log('BONKED_GATE '+JSON.stringify({status:r.status,body:await r.json()}));})()`;
  const encoded = Buffer.from(code).toString('base64');
  const command = `node --input-type=module -e 'await eval(Buffer.from("${encoded}","base64").toString())'`;
  const { stdout } = await run(
    'flyctl',
    ['ssh', 'console', '--app', app, '--machine', machine, '--quiet', '--command', command],
    { timeout: 20000, maxBuffer: 1024 * 1024 },
  );
  const line = stdout.split('\n').find((line) => line.startsWith('BONKED_GATE '));
  if (!line) throw Error('Deployment guard unavailable; refusing to restart the server.');
  return JSON.parse(line.slice('BONKED_GATE '.length));
}

export async function deployWhenIdle({
  gate,
  deploy,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
  waitMs = WAIT_MS,
}) {
  const deadline = now() + waitMs;
  while (now() < deadline) {
    const result = await gate('acquire');
    if (result.status === 200 && result.body.paused) {
      log('Server empty; new room entry paused while deploying the prebuilt image.');
      try {
        await deploy();
        return true;
      } finally {
        try {
          await gate('release');
        } catch {
          log('Could not release the pause; it expires automatically within ten minutes.');
        }
      }
    }
    if (result.status !== 409)
      throw Error(`Deployment guard returned ${result.status}; refusing to deploy.`);
    log(
      `Deployment waiting: ${result.body.players} player(s) in ${result.body.occupiedRooms} room(s).`,
    );
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - now())));
  }
  log(
    'Deployment deferred: server stayed occupied. Current version remains running. Rerun this workflow later.',
  );
  return false;
}

async function main() {
  const image = process.env.BONKED_IMAGE;
  if (!image) throw Error('BONKED_IMAGE must name the prebuilt image.');
  const { stdout } = await execute('flyctl', ['machine', 'list', '--app', 'bonked', '--json']);
  const machines = JSON.parse(stdout);
  if (machines.length !== 1) throw Error('Expected exactly one machine.');
  // Wake an autostopped machine before SSH without creating a room.
  const health = await fetch('https://bonked.fly.dev/health', {
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  if (!health.ok) throw Error('Live server is not healthy; refusing to deploy.');
  const owner = randomUUID(),
    machine = machines[0].id;
  const deployed = await deployWhenIdle({
    gate: (action) => gateRequest(action, owner, { machine }),
    deploy: async () => {
      const result = await execute(
        'flyctl',
        [
          'deploy',
          '--app',
          'bonked',
          '--image',
          image,
          '--ha=false',
          '--strategy',
          'rolling',
          '--yes',
        ],
        { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    },
  });
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_OUTPUT, `deployed=${deployed}\n`);
  }
  if (!deployed && process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      '### Deployment deferred\nPlayers were still in rooms after twenty minutes. Nothing was restarted. Rerun this workflow to try again.\n',
    );
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
