export const getAutopilotInfo = (): Record<string, unknown> => ({
  managedBy: 'autopilot',
  lastChange: new Date().toISOString(),
  component: 'agent',
});
