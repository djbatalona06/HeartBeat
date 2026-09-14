#!/usr/bin/env node
// Publishes the C# game core to WebAssembly for the Vite build to pick up.
//
// The only reason this is a script rather than a bare `dotnet publish` line in
// package.json: the WebAssembly SDK writes content-hashed filenames into
// `wwwroot/_framework/` and never removes the previous ones. Publish twice and
// the directory holds two runtimes; publish ten times and it holds ten. Vite
// only bundles what the manifest names, so this never produced a wrong build -
// it just quietly grew a few megabytes per publish on every developer's disk
// and in every CI cache. Clearing the output first costs nothing and keeps
// `du -sh` honest.

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(root, 'game', 'HeartBeat.Game.Wasm', 'HeartBeat.Game.Wasm.csproj');
const output = join(root, 'game', 'HeartBeat.Game.Wasm', 'bin', 'Release');

rmSync(output, { recursive: true, force: true });

try {
  execFileSync('dotnet', ['publish', project, '-c', 'Release'], { stdio: 'inherit', cwd: root });
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(
      '\nThe .NET SDK is not installed, so Eve\'s Garden\'s game core cannot be built.\n' +
      'Install .NET 10 and the wasm workload:\n' +
      '  https://dotnet.microsoft.com/download  (or: apt-get install dotnet-sdk-10.0)\n' +
      '  dotnet workload install wasm-tools\n',
    );
  }
  process.exit(1);
}
