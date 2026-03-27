'use strict';

const controllerHealth = () => ({
  component: 'controller',
  status: 'healthy',
  managedBy: 'autopilot',
  checkedAt: new Date().toISOString(),
});

module.exports = { controllerHealth };
