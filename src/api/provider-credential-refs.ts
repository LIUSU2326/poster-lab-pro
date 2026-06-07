export function providerCredentialKeyRef(input: { workspaceId: string; providerId: string; keyRef?: string | null | undefined }): string {
  const explicit = input.keyRef?.trim();
  if (explicit) return explicit;
  return `${input.workspaceId}:${input.providerId}:default`;
}
