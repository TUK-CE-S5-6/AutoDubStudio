import React, { useState, useRef, useEffect } from 'react';

function Clip({ clip, currentTime, zIndex }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const clipStart = clip.start;
    const clipEnd = clip.start + clip.duration;

    if (currentTime >= clipStart && currentTime <= clipEnd) {
      video.style.visibility = 'visible';
      const clipTime = currentTime - clipStart;
      if (Math.abs(video.currentTime - clipTime) > 0.2) {
        video.currentTime = clipTime;
      }
      if (video.paused) {
        video.play().catch(err => console.error("Play error:", err));
      }
    } else {
      video.pause();
      video.style.visibility = 'hidden';
    }
  }, [currentTime, clip]);

  return (
    <video
      ref={videoRef}
      src={clip.url}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex,
        pointerEvents: 'none',
        visibility: 'hidden',
      }}
      preload="auto"
    />
  );
}

function VideoTimelinePreview() {
  const [clips, setClips] = useState([]);
  const [globalTime, setGlobalTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animationFrameId = useRef(null);
  const startTimeRef = useRef(null);

  // 두 개의 파일 선택 리스트
  const [selectedFiles1, setSelectedFiles1] = useState([]);
  const [selectedFiles2, setSelectedFiles2] = useState([]);

  const updateTime = (timestamp) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) / 1000;
    setGlobalTime(elapsed);
    animationFrameId.current = requestAnimationFrame(updateTime);
  };

  useEffect(() => {
    if (playing) {
      animationFrameId.current = requestAnimationFrame(updateTime);
    } else if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [playing]);

  // 파일 선택 처리
  const handleFileSelection = (event, setSelectedFiles) => {
    const files = Array.from(event.target.files);
    const filesWithStart = files.map(file => ({
      file,
      start: 0,
    }));
    setSelectedFiles(prev => [...prev, ...filesWithStart]);
  };

  // 시작 시간 변경 처리
  const handleStartChange = (e, index, setSelectedFiles) => {
    const newStart = e.target.value;
    setSelectedFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], start: newStart };
      return updated;
    });
  };

  // 클립 추가 처리
  const handleAddClips = (selectedFiles) => {
    selectedFiles.forEach(selected => {
      const { file, start } = selected;
      const startTime = parseFloat(start);
      if (isNaN(startTime)) return;

      const url = URL.createObjectURL(file);
      const tempVideo = document.createElement('video');
      tempVideo.src = url;
      tempVideo.preload = 'metadata';
      tempVideo.onloadedmetadata = () => {
        const duration = tempVideo.duration;
        setClips(prev => [
          ...prev,
          { id: Date.now() + Math.random(), url, start: startTime, duration }
        ]);
      };
    });
  };

  const handlePlay = () => {
    setPlaying(true);
    startTimeRef.current = performance.now();
  };

  const handleStop = () => {
    setPlaying(false);
    setGlobalTime(0);
  };

  return (
    <div>
      {/* 첫 번째 파일 선택 */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>첫 번째 그룹</h3>
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={(e) => handleFileSelection(e, setSelectedFiles1)}
        />
        {selectedFiles1.map((selected, index) => (
          <div key={index} style={{ marginTop: '0.5rem' }}>
            <span>{selected.file.name}</span>
            <input
              type="number"
              value={selected.start}
              onChange={(e) => handleStartChange(e, index, setSelectedFiles1)}
              placeholder="시작 시간 (초)"
              step="0.1"
              style={{ marginLeft: '0.5rem' }}
            />
          </div>
        ))}
        <button type="button" onClick={() => handleAddClips(selectedFiles1)} style={{ marginTop: '0.5rem' }}>
          첫 번째 클립 추가
        </button>
      </div>

      {/* 두 번째 파일 선택 */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>두 번째 그룹</h3>
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={(e) => handleFileSelection(e, setSelectedFiles2)}
        />
        {selectedFiles2.map((selected, index) => (
          <div key={index} style={{ marginTop: '0.5rem' }}>
            <span>{selected.file.name}</span>
            <input
              type="number"
              value={selected.start}
              onChange={(e) => handleStartChange(e, index, setSelectedFiles2)}
              placeholder="시작 시간 (초)"
              step="0.1"
              style={{ marginLeft: '0.5rem' }}
            />
          </div>
        ))}
        <button type="button" onClick={() => handleAddClips(selectedFiles2)} style={{ marginTop: '0.5rem' }}>
          두 번째 클립 추가
        </button>
      </div>

      {/* 컨트롤 버튼 */}
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={handlePlay}>미리보기 시작</button>
        <button onClick={handleStop} style={{ marginLeft: '0.5rem' }}>미리보기 정지</button>
      </div>

      {/* 미리보기 화면 */}
      <div
        style={{
          position: 'relative',
          width: '640px',
          height: '360px',
          background: 'black',
          overflow: 'hidden',
        }}
      >
        {clips.map((clip, index) => (
          <Clip
            key={clip.id}
            clip={clip}
            currentTime={globalTime}
            zIndex={clips.length - index}
          />
        ))}
      </div>
      <div style={{ marginTop: '0.5rem' }}>전역 타임: {globalTime.toFixed(2)}초</div>
    </div>
  );
}

export default VideoTimelinePreview;
