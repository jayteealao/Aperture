export const USE_CHAT_TRANSPORT =
  typeof window === 'undefined' ||
  window.localStorage.getItem('aperture:useChatTransport') !== 'false'
