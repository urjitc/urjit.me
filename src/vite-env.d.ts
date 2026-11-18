/// <reference types="vite/client" />

/** The W3C Audio Session API (Safari only so far), not yet in TypeScript's DOM lib. */
interface Navigator {
  audioSession?: {
    type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'
  }
}
