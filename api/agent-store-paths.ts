type StorePathEnv = {
  DATA_PATH?: string
  AGENT_ACTIVITY_STORE?: string
}

export function resolveAgentActivityStorePath(env: StorePathEnv = process.env) {
  const dataPath = env.DATA_PATH?.trim()
  return env.AGENT_ACTIVITY_STORE?.trim()
    || (dataPath ? `${dataPath}/agent-activity.json` : './data/agent-activity.json')
}
