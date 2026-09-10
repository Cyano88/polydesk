param([switch]$Recover,[switch]$ReviewMemory,[switch]$CaptureMemory,[string]$MemoryExecutionId,[string]$MemoryOwner,[string]$MemoryToken,[Parameter(ValueFromRemainingArguments=$true)][string[]]$PluginArgs)
$taskOwnerRoot = [Environment]::GetFolderPath('UserProfile')
$taskLedger = Join-Path $taskOwnerRoot '.config\polymarket\polydesk-executions'
if (!$env:POLYDESK_LOCAL_MEMORY_PYTHON) { $env:POLYDESK_LOCAL_MEMORY_PYTHON = '/root/polydesk-buyer-candidate.hXrameVt/runtime/bin/python' }
if (!$env:POLYDESK_LOCAL_MEMORY_ROOT) { $env:POLYDESK_LOCAL_MEMORY_ROOT = '/root/.local/share/polydesk-local-finalized-memory' }
if ($CaptureMemory) {
  & node (Join-Path $PSScriptRoot 'polymarket-local-memory.mjs') capture $taskLedger $MemoryExecutionId
  exit $LASTEXITCODE
}
if ($ReviewMemory) {
  & node (Join-Path $PSScriptRoot 'polymarket-local-memory.mjs') review $taskLedger $MemoryOwner $MemoryToken
  exit $LASTEXITCODE
}
if ($Recover) {
  & node (Join-Path $PSScriptRoot 'polymarket-execution-recovery.mjs') $taskLedger
  exit $LASTEXITCODE
}
$taskWalletHome = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.onchainos')).Trim()
$taskConfigDir = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.config\polymarket')).Trim()
$taskBinary = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.local\bin\polydesk-polymarket-linux')).Trim()
if ($env:POLYDESK_MANAGED_CONSTRAINTS) {
  $taskManagedBinary = Join-Path $taskOwnerRoot '.local\bin\polydesk-polymarket-managed-linux'
  $taskManagedHash = '3ae311482ea308fbcdac0098b379f3c5d4b9253bd212ff95ceb1c80e40054e24'
  if (!(Test-Path -LiteralPath $taskManagedBinary) -or (Get-FileHash -LiteralPath $taskManagedBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskManagedHash) { throw 'Reviewed managed-native binary unavailable; no managed order attempted.' }
  if ($PluginArgs[0] -ne 'buy') { throw 'Managed local execution currently supports BUY only.' }
  $taskBinary = (wsl.exe --exec wslpath -u $taskManagedBinary).Trim()
}

if (!$taskWalletHome -or !$taskConfigDir -or !$taskBinary) { throw 'Could not resolve the existing local wallet paths.' }
$taskBuilderCode = '0x873845696727f985cc6a23dcdffaefefd3f47a712dd8a02f1a938cac615844db' # Public PolyDesk code confirmed by owner, 2026-09-10.
if ($env:POLYMARKET_BUILDER_CODE -and $env:POLYMARKET_BUILDER_CODE -ne $taskBuilderCode) { throw 'Builder code conflicts with the verified PolyDesk profile.' }
if ($PluginArgs[0] -in @('buy','sell') -and $taskBuilderCode -notmatch '^0x[0-9a-fA-F]{64}$') { throw 'Set the verified public POLYMARKET_BUILDER_CODE before trading.' }
# Original Windows binary is preserved. The Linux CLI hash is verified in the audit.
$taskWslArgs = @('--exec','env',"POLYMARKET_BUILDER_CODE=$taskBuilderCode","ONCHAINOS_HOME=$taskWalletHome","POLYMARKET_CONFIG_DIR=$taskConfigDir",'POLYMARKET_ONCHAINOS_BIN=/root/.local/bin/onchainos',$taskBinary) + $PluginArgs
if ($env:POLYDESK_MANAGED_CONSTRAINTS) { $taskWslArgs = $taskWslArgs[0..1] + @('POLYDESK_MANAGED_CONSTRAINTS=' + $env:POLYDESK_MANAGED_CONSTRAINTS) + $taskWslArgs[2..($taskWslArgs.Length-1)] }
$taskLiveOrder = $PluginArgs[0] -in @('buy','sell') -and '--dry-run' -notin $PluginArgs -and '--help' -notin $PluginArgs -and '-h' -notin $PluginArgs
if ($taskLiveOrder) {
  $taskRecoveryText = & node (Join-Path $PSScriptRoot 'polymarket-execution-recovery.mjs') $taskLedger
  if ($LASTEXITCODE -ne 0) { Write-Output $taskRecoveryText; throw 'Interrupted execution remains unresolved; no new order attempted.' }
  $taskRecovery = $taskRecoveryText | ConvertFrom-Json
  if ($taskRecovery.state -ne 'NO_UNCERTAIN_EXECUTION') {
    Write-Output $taskRecoveryText
    throw 'Previous execution reconciled. Review its result before requesting a fresh trade preview; no new order attempted.'
  }
  $taskLedger = Join-Path $taskOwnerRoot '.config\polymarket\polydesk-executions'
  if (!$env:POLYDESK_EXECUTION_ID) { throw 'Set POLYDESK_EXECUTION_ID to the stable buyer-authorized order ID. Never generate a new ID to retry an uncertain order.' }
  if ($PluginArgs[0] -eq 'sell') {
    $taskAllowedFlags = @('--market-id','--outcome','--shares','--price','--order-type','--strategy-id','--autotrade-job')
    foreach ($taskArg in $PluginArgs) { if ($taskArg.StartsWith('--') -and $taskArg -notin $taskAllowedFlags) { throw 'Unsupported or overriding flag in guarded sell; no order attempted.' } }
    $taskValues = @{}
    foreach ($taskFlag in @('--market-id','--outcome','--shares','--price','--order-type')) {
      $taskIndices = @(0..($PluginArgs.Length-1) | Where-Object { $PluginArgs[$_] -eq $taskFlag })
      if ($taskIndices.Count -ne 1 -or $taskIndices[0]+1 -ge $PluginArgs.Length) { throw "Exactly one $taskFlag is required for guarded sell execution." }
      $taskValues[$taskFlag] = $PluginArgs[$taskIndices[0]+1]
    }
    if ($taskValues['--order-type'] -ne 'FOK' -or $taskValues['--market-id'] -notmatch '^[a-z0-9-]{1,200}$' -or '--mode' -in $PluginArgs -or '--token-id' -in $PluginArgs -or '--expires' -in $PluginArgs -or '--post-only' -in $PluginArgs) { throw 'Guarded sells require the exact market slug, deposit-wallet mode and unchanged FOK policy.' }
    Push-Location (Join-Path $PSScriptRoot '..')
    try {
      & node --import tsx (Join-Path $PSScriptRoot 'polymarket-sell-preflight.ts') --market-slug $taskValues['--market-id'] --outcome $taskValues['--outcome'] --shares $taskValues['--shares'] --price $taskValues['--price'] --linux-wallet
    } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'Fresh sell preflight failed; no order attempted.' }
  }
  & node (Join-Path $PSScriptRoot 'polymarket-execution-guard.mjs') $taskLedger $env:POLYDESK_EXECUTION_ID wsl.exe @taskWslArgs
  $taskSubmissionExit = $LASTEXITCODE
  if ($taskSubmissionExit -eq 0) {
    # Separate read-only settlement/memory work; never replay the executor on failure.
    # Preserve stdout's existing order response for callers that parse its last JSON line.
    $taskMemoryResult = & node (Join-Path $PSScriptRoot 'polymarket-local-memory.mjs') capture $taskLedger $env:POLYDESK_EXECUTION_ID
    [Console]::Error.WriteLine(($taskMemoryResult -join [Environment]::NewLine))
  }
  exit $taskSubmissionExit
} else {
  & wsl.exe @taskWslArgs
}
exit $LASTEXITCODE
