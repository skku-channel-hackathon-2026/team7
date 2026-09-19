import MeetingApp from './meeting/MeetingApp'

// `/tutorial` is the command registered in Desk, so both /resource/wam/tutorial
// and /resource/wam/meeting serve the meeting app.
function App() {
  return <MeetingApp />
}

export default App
