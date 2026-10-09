// Private host/server transport; only plain core presentation crosses it.
export const previewChannel = {
  configuration: 'expec/previewConfiguration',
  selection: 'expec/previewSelection',
  publication: 'expec/previewPublication',
} as const;
