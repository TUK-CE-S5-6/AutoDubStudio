// Video_Track.jsx
import React, { useState, useRef, useEffect, useContext } from 'react';
import { VideoContext } from './VideoContext';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

// =======================
// 스타일 정의
// =======================
const commonContainerStyle = {
  width: '2200px',
  overflowX: 'auto',
};

const timelineContainerStyle = {
  width: '2200px',
  height: '30px',
  paddingTop: '20px',
  borderBottom: '1px solid #000',
  backgroundColor: '#f7f7f7',
  position: 'sticky',
  top: 0,
  zIndex: 200,
};

const videoTrackContainerStyle = {
  minWidth: '30000px',
  height: '100px', // 비디오 트랙 영역 높이
  backgroundColor: '#eef',
};

const draggableItemStyle = {
  position: 'absolute',
  top: '10px',
  height: '80px', // 컨테이너보다 약간 작게
  border: '1px solid #000',
  cursor: 'grab',
  zIndex: 10,
  backgroundColor: '#fff',
};

// =======================
// 타임라인 헬퍼 함수들
// =======================
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

const renderTimelineComponent = (duration) => {
  const ticks = [];
  const totalSec = Math.floor(duration);
  for (let i = 0; i <= totalSec; i++) {
    const leftPos = i * 50; // 1초당 50px 간격
    const isBigTick = i % 5 === 0;
    const tickHeight = isBigTick ? 15 : 8;
    const tickWidth = isBigTick ? '2px' : '1px';
    ticks.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${leftPos}px`,
          bottom: '0px',
          width: tickWidth,
          height: `${tickHeight}px`,
          backgroundColor: '#000',
        }}
      >
        {isBigTick && (
          <span
            style={{
              position: 'absolute',
              top: '-20px',
              left: '-20px',
              fontSize: '10px',
              fontWeight: 'bold',
            }}
          >
            {formatTime(i)}
          </span>
        )}
      </div>
    );
  }
  return ticks;
};

// =======================
// 비디오 트랙 정보 생성 함수
// =======================
function generateVideoTrackInfo(file) {
  return new Promise((resolve, reject) => {
    const videoElem = document.createElement('video');
    videoElem.preload = 'metadata';
    videoElem.muted = true; // 자동 재생 방지
    videoElem.src = URL.createObjectURL(file);

    videoElem.onloadedmetadata = () => {
      const videoDuration = videoElem.duration;
      // timeline에서의 표시 폭 (1초당 50px)
      const timelineWidth = Math.ceil(videoDuration * 50);
      // 영상의 실제 해상도
      const videoWidth = videoElem.videoWidth;
      const videoHeight = videoElem.videoHeight;
      // 캔버스를 사용하여 첫 프레임 썸네일 생성 (16:9 비율)
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      videoElem.currentTime = 0;
      videoElem.onseeked = () => {
        ctx.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
        const thumbnail = canvas.toDataURL('image/png');
        resolve({
          id: String(Date.now() + Math.random()),
          file, // File 객체
          delayPx: 0,
          duration: videoDuration,
          width: timelineWidth, // 타임라인 상 표시되는 너비
          thumbnail,
          videoWidth,  // 실제 영상 해상도 width
          videoHeight, // 실제 영상 해상도 height
        });
      };
    };

    videoElem.onerror = (error) => {
      reject(error);
    };
  });
}

// =======================
// 편집 정보를 JSON 형식으로 생성하여 콘솔에 출력하는 함수
// =======================
async function sendEditingInfoAndLog(videoTracks) {
  const exportData = {
    timelineDuration: Math.max(
      ...videoTracks.flatMap(group =>
        group.tracks.map(track => track.delayPx / 50 + track.duration)
      )
    ),
    videoTracks: videoTracks.map(group => ({
      id: group.id,
      tracks: group.tracks.map(track => ({
        id: track.id,
        delay: track.delayPx / 50, // 초 단위
        duration: track.duration,
        width: track.width,
        thumbnail: track.thumbnail,
        filePath: track.file.path || null, // 파일 경로 (존재하면)
      })),
    })),
  };
  const jsonString = JSON.stringify(exportData, null, 2);
  console.log("전송할 편집 정보:\n", jsonString);
}

// =======================
// 메인 Video_Track 컴포넌트
// =======================
const Video_Track = () => {
  const [videoTracks, setVideoTracks] = useState([]);
  const [timelineDuration, setTimelineDuration] = useState(0); // 초 단위
  const [outputUrl, setOutputUrl] = useState(null);
  const trackContainerRef = useRef(null);

  // ffmpeg 관련 상태 및 ref
  const ffmpegRef = useRef(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  // VideoContext 사용 (마스터 재생바 연동)
  const { videoURL, currentTime, setCurrentTime, duration, videoRef } = useContext(VideoContext);

  // ffmpeg 로드 (최초 한 번)
  useEffect(() => {
    const loadFFmpeg = async () => {
      if (!ffmpegRef.current) {
        ffmpegRef.current = createFFmpeg({ log: true });
      }
      if (!ffmpegLoaded) {
        await ffmpegRef.current.load();
        setFfmpegLoaded(true);
      }
    };
    loadFFmpeg();
  }, [ffmpegLoaded]);

  const addVideoTrack = () => {
    setVideoTracks(prev => [...prev, { id: String(Date.now() + Math.random()), tracks: [] }]);
  };

  // Output 버튼: 편집 정보를 JSON 형식으로 생성하여 콘솔에 출력
  const handleOutput = async () => {
    try {
      await sendEditingInfoAndLog(videoTracks);
    } catch (err) {
      console.error("Output 에러:", err);
    }
  };

  // ★★★★★ 수정된 인코딩 및 다운로드 함수: VideoEncoder의 세그먼트 방식을 사용 ★★★★★
  const handleRenderDownload = async () => {
    if (!ffmpegLoaded) {
      alert("FFmpeg가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.");
      return;
    }

    try {
      // 1. 모든 그룹의 트랙을 플래튼하여 단일 배열로 만듭니다.
      const flattenedTracks = [];
      videoTracks.forEach((group) => {
        group.tracks.forEach(track => {
          flattenedTracks.push(track);
        });
      });

      if (flattenedTracks.length === 0) {
        alert("비디오 트랙을 업로드해주세요.");
        return;
      }

      // 2. flattenedTracks를 시작시간(delayPx를 초로 변환) 기준 정렬
      flattenedTracks.sort((a, b) => (a.delayPx / 50) - (b.delayPx / 50));

      // 3. 첫번째 트랙의 실제 영상 해상도를 기준으로 사용 (없으면 기본값 사용)
      const videoResWidth = flattenedTracks[0].videoWidth || 720;
      const videoResHeight = flattenedTracks[0].videoHeight || 1280;

      // 4. 타임라인 상의 세그먼트 생성 (gap 및 영상 세그먼트)
      let segments = [];
      let currentTimeSeg = 0;
      flattenedTracks.forEach(track => {
        const startTime = track.delayPx / 50;
        if (startTime > currentTimeSeg) {
          // gap 세그먼트 추가
          segments.push({ type: 'gap', duration: startTime - currentTimeSeg });
        }
        segments.push({ type: 'video', fileName: `video_${track.id}.mp4`, duration: track.duration });
        currentTimeSeg = startTime + track.duration;
      });
      // (필요하다면 마지막 gap 추가 가능)

      // 5. ffmpeg 가상 파일 시스템에 각 트랙 파일 저장 (파일명: video_{track.id}.mp4)
      for (const track of flattenedTracks) {
        const fileData = await fetchFile(track.file);
        await ffmpegRef.current.FS('writeFile', `video_${track.id}.mp4`, fileData);
      }

      // 6. ffmpeg 명령어 인자 구성
      let ffmpegArgs = [];
      // 영상 입력 파일은 segments 중 type 'video'에 해당하는 것만 -i로 추가합니다.
      let videoInputCount = 0;
      segments.forEach(segment => {
        if (segment.type === 'video') {
          ffmpegArgs.push('-i', segment.fileName);
          videoInputCount++;
        }
      });

      // 7. filter_complex 문자열 생성
      let filterParts = [];
      let videoInputUsed = 0; // -i 순서 인덱스
      segments.forEach((segment, index) => {
        if (segment.type === 'video') {
          filterParts.push(
            `[${videoInputUsed}:v]setpts=PTS-STARTPTS[vS${index}]; ` +
            `[${videoInputUsed}:a]asetpts=PTS-STARTPTS[aS${index}];`
          );
          videoInputUsed++;
        } else if (segment.type === 'gap') {
          const gapDuration = segment.duration.toFixed(2);
          filterParts.push(
            // gap 세그먼트 생성 시 영상의 해상도(videoResWidth x videoResHeight) 사용
            `color=c=black:s=${videoResWidth}x${videoResHeight}:d=${gapDuration}:r=60, setpts=PTS-STARTPTS[vS${index}]; ` +
            `anullsrc=cl=stereo:r=48000,atrim=duration=${gapDuration},asetpts=PTS-STARTPTS[aS${index}];`
          );
        }
      });

      // 8. concat 필터: 각 세그먼트의 video와 audio 스트림을 순차적으로 연결
      let concatInputs = '';
      for (let i = 0; i < segments.length; i++) {
        concatInputs += `[vS${i}][aS${i}]`;
      }
      filterParts.push(`${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);
      const filterComplex = filterParts.join(' ');

      ffmpegArgs.push(
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-map', '[outa]',
        'output.mp4'
      );

      console.log("FFmpeg 인자:", ffmpegArgs.join(' '));
      // 9. ffmpeg 실행 (렌더링)
      await ffmpegRef.current.run(...ffmpegArgs);

      // 10. 출력 파일 읽기 및 Blob URL 생성
      const data = ffmpegRef.current.FS('readFile', 'output.mp4');
      const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(videoBlob);
      setOutputUrl(videoUrl);
      alert("렌더링 완료! 아래의 다운로드 링크를 이용하세요.");
    } catch (error) {
      console.error("렌더링 에러:", error);
    }
  };
  // ★★★★★ 끝 ★★★★★

  const handleFileUploadForVideoTrack = async (groupId, e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      try {
        const newTrackInfos = await Promise.all(
          files.map(file => generateVideoTrackInfo(file))
        );
        setVideoTracks(prev =>
          prev.map(group =>
            group.id === groupId
              ? { ...group, tracks: [...group.tracks, ...newTrackInfos] }
              : group
          )
        );
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleMouseDown = (e, groupId, trackId) => {
    e.preventDefault();
    const startX = e.clientX;
    const item = e.currentTarget;
    const initialLeft = parseInt(item.style.left, 10) || 0;
    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      let newLeft = initialLeft + delta;
      const containerRect = item.parentElement.getBoundingClientRect();
      newLeft = Math.max(0, Math.min(newLeft, containerRect.width - item.offsetWidth));
      item.style.left = `${newLeft}px`;
    };
    const onMouseUp = () => {
      const containerRect = item.parentElement.getBoundingClientRect();
      let finalLeft = parseInt(item.style.left, 10) || 0;
      finalLeft = Math.max(0, Math.min(finalLeft, containerRect.width - item.offsetWidth));
      setVideoTracks(prev =>
        prev.map(group =>
          group.id === groupId
            ? {
                ...group,
                tracks: group.tracks.map(t =>
                  t.id === trackId ? { ...t, delayPx: finalLeft } : t
                ),
              }
            : group
        )
      );
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    let maxTime = 0;
    videoTracks.forEach((group) => {
      group.tracks.forEach((track) => {
        const offset = track.delayPx / 50;
        const endTime = offset + track.duration;
        if (endTime > maxTime) {
          maxTime = endTime;
        }
      });
    });
    setTimelineDuration(maxTime);
  }, [videoTracks]);

  const sliderRef = useRef(null);
  const [sliderWidth, setSliderWidth] = useState(0);
  useEffect(() => {
    if (sliderRef.current) {
      setSliderWidth(sliderRef.current.offsetWidth);
    }
  }, [sliderRef, videoURL, duration]);

  const handleSliderChange = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div>
      <h1>Video Track (비디오 트랙 편집)</h1>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleOutput}>Output (Send JSON to Console)</button>
        <button onClick={addVideoTrack}>Add Video Track</button>
        <button onClick={handleRenderDownload}>Render &amp; Download</button>
      </div>
      {outputUrl && (
        <div style={{ marginBottom: '10px' }}>
          <a href={outputUrl} download="output.mp4">
            최종 영상 다운로드
          </a>
        </div>
      )}
      <div style={commonContainerStyle}>
        <div style={{ ...timelineContainerStyle, position: 'sticky', top: 0 }}>
          <div style={{ width: `${duration * 50}px`, position: 'relative' }}>
            {duration > 0 && renderTimelineComponent(duration)}
            <div
              ref={sliderRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 1000,
              }}
            >
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onInput={handleSliderChange}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
        <div style={videoTrackContainerStyle} ref={trackContainerRef}>
          {videoTracks.map((group) => (
            <div key={group.id} style={{ marginBottom: '10px', position: 'relative' }}>
              <div>
                <button onClick={() => document.getElementById(`file-input-${group.id}`).click()}>
                  Upload Video File
                </button>
              </div>
              <input
                id={`file-input-${group.id}`}
                type="file"
                accept="video/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFileUploadForVideoTrack(group.id, e)}
              />
              <div style={{ position: 'relative', height: '100%' }}>
                {group.tracks.map((track) => (
                  <div
                    key={track.id}
                    style={{
                      ...draggableItemStyle,
                      left: `${track.delayPx}px`,
                      width: `${track.width}px`,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, group.id, track.id)}
                  >
                    <img
                      src={track.thumbnail}
                      alt="video thumbnail"
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Video_Track;
