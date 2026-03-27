export const agentHealth = (): Record<string, unknown> => ({
  component: 'agent',
  status: 'healthy',
  managedBy: 'autopilot',
  checkedAt: new Date().toISOString(),
});
