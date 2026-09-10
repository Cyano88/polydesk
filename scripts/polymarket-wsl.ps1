param([Parameter(ValueFromRemainingArguments=$true)][string[]]$PluginArgs)
$taskOwnerRoot = [Environment]::GetFolderPath('UserProfile')
$taskWalletHome = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.onchainos')).Trim()
$taskConfigDir = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.config\polymarket')).Trim()
$taskBinary = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.local\bin\polydesk-polymarket-linux')).Trim()
if (!$taskWalletHome -or !$taskConfigDir -or !$taskBinary) { throw 'Could not resolve the existing local wallet paths.' }
$taskBuilderCode = '0x873845696727f985cc6a23dcdffaefefd3f47a712dd8a02f1a938cac615844db' # Public PolyDesk code confirmed by owner, 2026-09-10.
if ($env:POLYMARKET_BUILDER_CODE -and $env:POLYMARKET_BUILDER_CODE -ne $taskBuilderCode) { throw 'Builder code conflicts with the verified PolyDesk profile.' }
if ($PluginArgs[0] -in @('buy','sell') -and $taskBuilderCode -notmatch '^0x[0-9a-fA-F]{64}$') { throw 'Set the verified public POLYMARKET_BUILDER_CODE before trading.' }
# Original Windows binary is preserved. The Linux CLI hash is verified in the audit.
$taskWslArgs = @('--exec','env',"POLYMARKET_BUILDER_CODE=$taskBuilderCode","ONCHAINOS_HOME=$taskWalletHome","POLYMARKET_CONFIG_DIR=$taskConfigDir",'POLYMARKET_ONCHAINOS_BIN=/root/.local/bin/onchainos',$taskBinary) + $PluginArgs
$taskLiveOrder = $PluginArgs[0] -in @('buy','sell') -and '--dry-run' -notin $PluginArgs -and '--help' -notin $PluginArgs -and '-h' -notin $PluginArgs
if ($taskLiveOrder) {
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
} else {
  & wsl.exe @taskWslArgs
}
exit $LASTEXITCODE
