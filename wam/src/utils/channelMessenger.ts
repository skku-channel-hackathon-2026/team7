// Channel Talk web messenger (plugin). The plugin key is a public identifier
// meant for browser code, unlike the app secret, which must never live here.
const CHANNEL_PLUGIN_KEY = 'a7d6086d-46c8-4593-8532-296829c7af40'
const CHANNEL_PLUGIN_SRC = 'https://cdn.channel.io/plugin/ch-plugin-web.js'

type ChannelIOFn = ((...args: unknown[]) => void) & {
  q?: unknown[][]
  c?: (args: unknown[]) => void
}

declare global {
  interface Window {
    ChannelIO?: ChannelIOFn
    ChannelIOInitialized?: boolean
  }
}

function loadScript() {
  if (window.ChannelIOInitialized) return
  window.ChannelIOInitialized = true
  const script = document.createElement('script')
  script.async = true
  script.src = CHANNEL_PLUGIN_SRC
  document.head.appendChild(script)
}

export function bootChannelMessenger() {
  if (window.ChannelIO) return

  // Queue calls until the SDK script loads and replays them.
  const ch: ChannelIOFn = (...args: unknown[]) => ch.c?.(args)
  ch.q = []
  ch.c = (args) => ch.q?.push(args)
  window.ChannelIO = ch

  if (document.readyState === 'complete') {
    loadScript()
  } else {
    window.addEventListener('DOMContentLoaded', loadScript)
    window.addEventListener('load', loadScript)
  }

  window.ChannelIO('boot', { pluginKey: CHANNEL_PLUGIN_KEY })
}
