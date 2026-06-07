import {
  createGoogleImageFetchTransport as createGoogleHttpTransport,
  createOpenAIHttpTransport,
  type GoogleImageTransport,
  type OpenAIImageTransport,
} from "../providers";

export function createOpenAIImageFetchTransport(fetchImpl: typeof fetch): OpenAIImageTransport {
  return createOpenAIHttpTransport(fetchImpl);
}

export function createGoogleImageFetchTransport(fetchImpl: typeof fetch): GoogleImageTransport {
  return createGoogleHttpTransport(fetchImpl);
}
