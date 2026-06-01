export function providerCredentialKeyRef(input: { workspaceId: string; providerId: string }): string {
  return `${input.workspaceId}:${input.providerId}:default`;
}
