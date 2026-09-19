import ReactDOM from 'react-dom/client'
import { WamProvider } from '@channel.io/app-sdk-wam'

import App from './App.tsx'
import '@channel.io/bezier-react/styles.css'
import './index.css'

async function start() {
  // Outside Desk (local `pnpm dev:wam`) there is no host bridge; install a
  // development stand-in. This branch is removed from production builds.
  if (import.meta.env.DEV && !window.ChannelIOWam) {
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
