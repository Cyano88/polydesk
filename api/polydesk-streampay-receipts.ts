type UnsupportedStreampayReceipt = {
  proof: {
    seller: string
  }
  [key: string]: unknown
} | null

export async function findCreatorUnlockReceipt(_activityId?: string): Promise<UnsupportedStreampayReceipt> {
  return null
}

export async function findCheckpointReceipt(_receiptId?: string): Promise<UnsupportedStreampayReceipt> {
  return null
}

export async function updateCreatorUnlockOgProof(_activityId?: string, _og?: unknown): Promise<void> {
  return undefined
}
