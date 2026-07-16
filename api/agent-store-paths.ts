type StorePathEnv = {
  DATA_PATH?: string
  AGENT_WALLET_PROVISION_STORE?: string
  AGENT_ACTIVITY_STORE?: string
}

export function resolveAgentWalletStorePath(env: StorePathEnv = process.env) {
  const dataPath = env.DATA_PATH?.trim()
  return env.AGENT_WALLET_PROVISION_STORE?.trim()
    || (dataPath ? `${dataPath}/agent-wallet-provisioning.json` : './data/agent-wallet-provisioning.json')
}

export function resolveAgentActivityStorePath(env: StorePathEnv = process.env) {
  const dataPath = env.DATA_PATH?.trim()
  return env.AGENT_ACTIVITY_STORE?.trim()
    || (dataPath ? `${dataPath}/agent-activity.json` : './data/agent-activity.json')
}
