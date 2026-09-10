param([Parameter(ValueFromRemainingArguments=$true)][string[]]$PluginArgs)
$taskOwnerRoot = [Environment]::GetFolderPath('UserProfile')
$taskWalletHome = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.onchainos')).Trim()
$taskConfigDir = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.config\polymarket')).Trim()
$taskBinary = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.local\bin\polydesk-polymarket-linux')).Trim()
if (!$taskWalletHome -or !$taskConfigDir -or !$taskBinary) { throw 'Could not resolve the existing local wallet paths.' }
# Original Windows binary is preserved. The Linux CLI hash is verified in the audit.
& wsl.exe --exec env "ONCHAINOS_HOME=$taskWalletHome" "POLYMARKET_CONFIG_DIR=$taskConfigDir" 'POLYMARKET_ONCHAINOS_BIN=/root/.local/bin/onchainos' $taskBinary @PluginArgs
exit $LASTEXITCODE
