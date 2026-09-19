import {
  HeightSynchronizer,
  WamHeader,
  WamThemeProvider,
} from '@channel.io/app-sdk-wam-ui'
import { useWamClose } from '@channel.io/app-sdk-wam'

import { isMobile } from './utils/userAgent'
import Send from './pages/Send'
import MeetingApp from './meeting/MeetingApp'
import { isTutorialWam } from './utils/wamRoute'

function TutorialApp() {
  const { close } = useWamClose()

  return (
    <WamThemeProvider>
      <HeightSynchronizer maxHeight={480}>
        <WamHeader
          title="Tutorial"
          onClose={close}
        />
        <div style={{ padding: isMobile() ? '0 16px 16px' : '0 24px 24px' }}>
          <Send />
        </div>
      </HeightSynchronizer>
    </WamThemeProvider>
  )
}

// The same bundle is served at /resource/wam/tutorial and /resource/wam/meeting.
function App() {
  return isTutorialWam() ? <TutorialApp /> : <MeetingApp />
}

export default App
