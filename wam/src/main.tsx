import ReactDOM from 'react-dom/client'
import { WamProvider } from '@channel.io/app-sdk-wam'

import App from './App.tsx'
import { bootChannelMessenger } from './utils/channelMessenger'
import '@channel.io/bezier-react/styles.css'
import './index.css'

async function start() {
  const inDesk = Boolean(window.ChannelIOWam)

  // Outside Desk the page is a plain web page, so show the Channel Talk
  // messenger there. Inside Desk the WAM is already part of the messenger UI.
  if (!inDesk) {
    bootChannelMessenger()
  }

  // Outside Desk (local `pnpm dev:wam`) there is no host bridge; install a
  // development stand-in. This branch is removed from production builds.
  if (import.meta.env.DEV && !inDesk) {
    const { installDevBridge } = await import('./dev/devBridge')
    await installDevBridge()
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <WamProvider>
      <App />
    </WamProvider>
  )
}

void start()
