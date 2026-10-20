export async function activateRelease(input: {
  previous: string
  switchCurrent: () => Promise<void>
  restart: () => Promise<void>
  health: () => Promise<void>
  prune: () => Promise<void>
  restorePrevious: () => Promise<void>
}): Promise<void> {
  await input.switchCurrent()
  try {
    await input.restart()
    await input.health()
  } catch (error) {
    if (input.previous) {
      try {
        await input.restorePrevious()
        await input.restart()
      } catch (rollbackError) {
        const reason = error instanceof Error ? error.message : 'Deployment failed'
        const rollback = rollbackError instanceof Error ? rollbackError.message : 'rollback failed'
        throw new Error(`${reason}. Could not restore the previous release: ${rollback}`)
      }
    }
    throw error
  }
  await input.prune()
}
