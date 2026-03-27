export const KubeConfig = jest.fn().mockImplementation(() => ({
  loadFromCluster: jest.fn(),
  makeApiClient: jest.fn(() => ({})),
}));

export const BatchV1Api = jest.fn();
export const CoreV1Api = jest.fn();
