import "./App.css";
import VideoPlayer from "./components/VideoPlayer";

function App() {
  return (
    <div className="App">
      <VideoPlayer src={"http://localhost:8080/video/5"} videoId={1} />
    </div>
  );
}

export default App;
