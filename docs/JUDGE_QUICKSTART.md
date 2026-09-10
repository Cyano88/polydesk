# Judge quickstart: no wallet and no spending

Use Ubuntu 24.04 (including an Ubuntu terminal in WSL). Install Git, Node.js 20 or newer with npm, and Python 3.12 with the venv module. Run every command below inside the Linux shell, on the Linux filesystem. Do not run npm through a Windows PATH entry.

```sh
git clone https://github.com/Cyano88/polydesk.git
cd polydesk
node --version
python3 --version
npm ci --ignore-scripts
sh scripts/build-sibyl-runtime.sh
node scripts/judge-reproduce.mjs
```

If Ubuntu reports that venv is unavailable, install the python3-venv OS package and retry the runtime command. Node, Python and OS-package installation are prerequisites, not hidden installs performed by the test runner. npm dependencies use the committed lockfile. The Python runtime uses the committed sibyl-memory-client 0.8.0 wheel hash with --require-hashes and --no-deps. Setup needs internet to download dependencies; the actual judge tests use synthetic provider and chain fixtures.

## Expected result

The command writes .judge-artifacts/result.json and tests.log. Require pass true, no failed or skipped tests, realSdk true, freshNodeProcess true, continuationPassed true, missingMemoryBlocks true and restoredMemoryRecalls true. It prints the checkout commit and timestamps. Each invocation creates a new private temporary memory directory and never reads your wallet or production memory. The directory is retained for inspection; it contains synthetic fixtures only.

The flow captures a synthetic finalized receipt through the real SDK, starts another Node process, recalls it, and evaluates the supported memory-dependent continuation. An isolated missing-memory run must fail; restoring the original test path must succeed. Separate tests cover missing SELL history, position mismatch and stale exposure acknowledgement. Production memory is not deleted.

## What this proves and does not prove

This is a reproducible no-spend judge path. It does not submit a trade, make a service payment, test live market liquidity, or prove hosted governed receipt-memory acceptance. The separate live September 10 BUY/SELL evidence is linked from the demo runbook. Display the synthetic label during recording; do not pass off fixture transactions as live receipts.

The live buyer launcher additionally needs owner-controlled Onchain OS credentials and the reviewed PolyDesk native executor, plus live market, region, balance and approval checks. That live executor is not built or installed by these instructions. No private binary or credentials are required for judge reproduction. A fresh-machine live-trading install remains a separate distribution task.

For the video, record the command and its fresh-process memory evidence continuously with its timestamp/commit visible, alongside the published actual live receipt evidence. The README points to memory write/read code and declares prior work. Licensing and public submission remain separate requirements.
