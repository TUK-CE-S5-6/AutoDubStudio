import React, { useState, useEffect, useRef, useMemo } from 'react';
import './VideoViewer.css';

const VideoViewer = ({ formData }) => {
  const [previewVideos, setPreviewVideos] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // 전채 재생 시간 (초, 1초 단위 업데이트)
  const [globalPlaybackTime, setGlobalPlaybackTime] = useState(0);
  // slider 최대값 (전체 재생 시간)
  const [maxPlaybackTime, setMaxPlaybackTime] = useState(0);
  
  const videoRefs = useRef([]);
  const audioRef = useRef(null);
  const timeoutIdsRef = useRef([]);
  const intervalRef = useRef(null);
  const defaultDuration = 10;

  // previewVideos 배열을 startTime 기준 오름차순 정렬 (먼저 생성된 비디오가 위에 오도록)
  const sortedVideos = useMemo(() => {
    return [...previewVideos].sort((a, b) => a.startTime - b.startTime);
  }, [previewVideos]);

  // formData 업데이트 시 previewVideos와 audioUrl 추출 및 전채 재생시간 초기화
  useEffect(() => {
    if (formData) {
      const previewVideosStr = formData.get('previewVideos');
      if (previewVideosStr) {
        try {
          const videos = JSON.parse(previewVideosStr);
          console.log("추출된 previewVideos:", videos);
          setPreviewVideos(videos);
        } catch (e) {
          console.error('FormData의 previewVideos 파싱 오류:', e);
        }
      }
      const aUrl = formData.get('combinedAudioUrl');
      setAudioUrl(aUrl);
      setGlobalPlaybackTime(0);
    }
  }, [formData]);

  // previewVideos 업데이트 시 slider 최대값(maxPlaybackTime) 계산
  useEffect(() => {
    if (previewVideos.length > 0) {
      const computedMax = Math.max(
        ...previewVideos.map(video => video.startTime + (video.duration !== undefined ? video.duration : defaultDuration))
      );
      setMaxPlaybackTime(computedMax);
    } else {
      setMaxPlaybackTime(0);
    }
  }, [previewVideos]);

  // isPlaying이 true일 때 1초마다 globalPlaybackTime 자동 증가
  useEffect(() => {
    if (isPlaying) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setGlobalPlaybackTime(prev => {
            const next = prev + 1;
            if (next >= maxPlaybackTime) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              setIsPlaying(false);
              return prev;
            }
            return next;
          });
        }, 1000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, maxPlaybackTime]);

  // globalPlaybackTime 변경 시 각 미디어 요소의 currentTime 업데이트
  useEffect(() => {
    sortedVideos.forEach((videoData, index) => {
      const videoEl = videoRefs.current[index];
      if (videoEl) {
        const effectiveDuration = videoData.duration !== undefined ? videoData.duration : defaultDuration;
        const videoTime = globalPlaybackTime >= videoData.startTime ? globalPlaybackTime - videoData.startTime : 0;
        if (globalPlaybackTime < videoData.startTime + effectiveDuration) {
          videoEl.currentTime = videoTime;
        }
      }
    });
    if (audioUrl && audioRef.current) {
      audioRef.current.currentTime = globalPlaybackTime;
    }
  }, [globalPlaybackTime, sortedVideos, audioUrl]);

  // isPlaying 상태에 따라 미디어 재생/일시정지 및 예약된 타임아웃 관리
  useEffect(() => {
    timeoutIdsRef.current.forEach(id => clearTimeout(id));
    timeoutIdsRef.current = [];
    
    if (!isPlaying) {
      videoRefs.current.forEach(video => video && video.pause());
      if (audioUrl && audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      sortedVideos.forEach((videoData, index) => {
        const videoEl = videoRefs.current[index];
        if (videoEl) {
          const effectiveDuration = videoData.duration !== undefined ? videoData.duration : defaultDuration;
          // 만약 globalPlaybackTime이 종료 시점을 넘었다면 play() 호출하지 않음
          if (globalPlaybackTime >= videoData.startTime + effectiveDuration) {
            videoEl.pause();
            return;
          }
          const delay = videoData.startTime - globalPlaybackTime;
          if (delay <= 0) {
            videoEl.play().catch(err => console.error("비디오 재생 오류:", err));
          } else {
            const timeoutId = setTimeout(() => {
              videoEl.play().catch(err => console.error("비디오 재생 오류:", err));
            }, delay * 1000);
            timeoutIdsRef.current.push(timeoutId);
          }
        }
      });
      if (audioUrl && audioRef.current) {
        audioRef.current.play().catch(err => console.error("오디오 재생 오류:", err));
      }
    }
  }, [isPlaying, globalPlaybackTime, sortedVideos, audioUrl]);

  // Slider 조작 시 예약된 타임아웃 취소 후 globalPlaybackTime 업데이트
  const handleSliderChange = (e) => {
    timeoutIdsRef.current.forEach(id => clearTimeout(id));
    timeoutIdsRef.current = [];
    setGlobalPlaybackTime(parseFloat(e.target.value));
  };

  // 현재 활성 비디오 인덱스 계산
  const currentVideoIndex = sortedVideos.reduce((lastIndex, video, idx) => {
    const effectiveDuration = video.duration !== undefined ? video.duration : defaultDuration;
    if (
      globalPlaybackTime >= video.startTime &&
      globalPlaybackTime < video.startTime + effectiveDuration
    ) {
      return idx;
    }
    return lastIndex;
  }, -1);

  // 재생/정지 버튼: 정지 시 현재 활성 비디오의 currentTime 반영 후 isPlaying 토글
  const togglePlayPause = () => {
    if (isPlaying) {
      if (currentVideoIndex !== -1) {
        const activeVideo = videoRefs.current[currentVideoIndex];
        if (activeVideo) {
          const newTime = sortedVideos[currentVideoIndex].startTime + activeVideo.currentTime;
          setGlobalPlaybackTime(newTime);
        }
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  };

  // 비디오가 재생되어야 할 구간이 없으면 placeholder 표시 여부
  const isAnyVideoActive = sortedVideos.some(videoData => {
    const effectiveDuration = videoData.duration !== undefined ? videoData.duration : defaultDuration;
    return globalPlaybackTime >= videoData.startTime && globalPlaybackTime < videoData.startTime + effectiveDuration;
  });

  // 추가: formData에서 combinedAudioVolume 값을 읽어 audio 볼륨 조절 (0~100 -> 0~1)
  useEffect(() => {
    const volumeStr = formData.get('combinedAudioVolume');
    if (volumeStr && audioRef.current) {
      const vol = parseInt(volumeStr, 10);
      audioRef.current.volume = vol / 100;
    }
  }, [formData, audioUrl]);

  return (
    <div className="video-viewer">
      <button onClick={togglePlayPause}>
        {isPlaying ? "전체 정지" : "전체 재생"}
      </button>
      <div className="video-container">
        {sortedVideos.map((videoData, index) => {
          const effectiveDuration = videoData.duration !== undefined ? videoData.duration : defaultDuration;
          const isActive =
            globalPlaybackTime >= videoData.startTime &&
            globalPlaybackTime < videoData.startTime + effectiveDuration;
          return (
            <video
              key={index}
              ref={el => (videoRefs.current[index] = el)}
              src={videoData.url}
              className="video-element"
              playsInline
              style={{
                display: isActive ? "block" : "none",
                zIndex: sortedVideos.length - index
              }}
            />
          );
        })}
        {!isAnyVideoActive && <div className="placeholder"></div>}
        {audioUrl && (
          <audio ref={audioRef} src={audioUrl} style={{ display: "none" }} />
        )}
      </div>
      <div className="playback-bar">
        <input
          type="range"
          min="0"
          max={maxPlaybackTime}
          step="1"
          value={globalPlaybackTime}
          onChange={handleSliderChange}
        />
        <span>{globalPlaybackTime.toFixed(0)} s</span>
      </div>
    </div>
  );
};

export default VideoViewer;
