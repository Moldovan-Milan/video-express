import React, { useRef } from "react";

const VideoPlayer = ({ src }) => {
  return (
    <div>
      <video src={src} controls width="500" height="500">
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
