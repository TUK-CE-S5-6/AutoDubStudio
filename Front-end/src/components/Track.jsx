// Track.jsx
import React, { useState, useRef, useEffect, useContext } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { VideoContext } from './VideoContext';
import VideoPlaybackControl from './VideoPlaybackControl';

// =======================
// 스타일 정의
// =======================
const commonContainerStyle = {
  width: '2200px',
  overflowX: 'auto'
};

const timelineContainerStyle = {
  width: '2200px',
  height: '30px',
  paddingTop: '20px',
  borderBottom: '1px solid #000',
  backgroundColor: '#f7f7f7',
  position: 'sticky',
  top: 0,
  zIndex: 200
};

const mintBoxStyle = {
  minWidth: '30000px',
  height: '60px',
  backgroundColor: '#AAF0D1'
};

const blueBoxStyle = {
  minWidth: '30000px',
  height: '60px',
  backgroundColor: '#00aaff',
  position: 'relative'
};

const draggableItemStyle = {
  position: 'absolute',
  top: '0px',
  height: '40px',
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  border: '1px solid #000',
  textAlign: 'center',
  lineHeight: '40px',
  cursor: 'grab',
  zIndex: 10
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

// 1초마다 작은 눈금, 5초마다 큰 눈금(라벨 포함)으로 타임라인 눈금을 렌더링
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
          backgroundColor: '#000'
        }}
      >
        {isBigTick && (
          <span
            style={{
              position: 'absolute',
              top: '-20px',
              left: '-20px',
              fontSize: '10px',
              fontWeight: 'bold'
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
// WAV 인코딩 및 오디오 처리 관련 함수들
// =======================
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function encodeWAV(samples, sampleRate, numChannels, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);
  floatTo16BitPCM(view, 44, samples);
  return buffer;
}

function audioBufferToWav(buffer, opt) {
  opt = opt || {};
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = opt.float32 ? 3 : 1;
  const bitDepth = format === 3 ? 32 : 16;

  let samples;
  if (numChannels === 2) {
    const channelData0 = buffer.getChannelData(0);
    const channelData1 = buffer.getChannelData(1);
    const length = channelData0.length + channelData1.length;
    samples = new Float32Array(length);
    let index = 0;
    for (let i = 0; i < channelData0.length; i++) {
      samples[index++] = channelData0[i];
      samples[index++] = channelData1[i];
    }
  } else {
    samples = buffer.getChannelData(0);
  }
  return encodeWAV(samples, sampleRate, numChannels, bitDepth);
}

//
// 개별 파일의 파형 이미지 생성 함수
//
function generateWaveformImage(audioBuffer, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ddd';
  ctx.fillRect(0, 0, width, height);
  const data = audioBuffer.getChannelData(0);
  const step = Math.floor(data.length / width);
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[i * step + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    const y1 = (1 + min) * 0.5 * height;
    const y2 = (1 + max) * 0.5 * height;
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();
  return canvas.toDataURL();
}

//
// generateTrackInfo 함수
//
function generateTrackInfo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;
        const width = Math.ceil(duration * 50);
        const waveformImage = generateWaveformImage(audioBuffer, width, 40);
        resolve({
          id: String(Date.now() + Math.random()),
          file,
          delayPx: 0,
          duration,
          width,
          waveformImage
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (e) => {
      if (reader.error && reader.error.name === 'AbortError') return;
      reject(reader.error);
    };
    reader.readAsArrayBuffer(file);
  });
}

//
// 여러 Audio 파일 병합 함수 (delay 적용)
//
async function combineAudioFilesWithDelays(tracks) {
  if (tracks.length === 0) return null;
  const audioContext = new AudioContext();
  const promises = tracks.map(track => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const delaySec = track.delayPx * 0.02;
          resolve({ buffer: audioBuffer, delaySec });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (e) => {
        if (reader.error && reader.error.name === 'AbortError') return;
        reject(reader.error);
      };
      reader.readAsArrayBuffer(track.file);
    });
  });
  const decodedTracks = await Promise.all(promises);
  const sampleRate = decodedTracks[0].buffer.sampleRate;
  const numChannels = decodedTracks[0].buffer.numberOfChannels;
  const trackInfos = decodedTracks.map(({ buffer, delaySec }) => {
    const delaySamples = Math.floor(delaySec * sampleRate);
    const endSample = delaySamples + buffer.length;
    return { buffer, delaySamples, endSample };
  });
  const totalLength = Math.max(...trackInfos.map(info => info.endSample));
  const outputBuffer = audioContext.createBuffer(numChannels, totalLength, sampleRate);
  trackInfos.forEach(({ buffer, delaySamples }) => {
    for (let channel = 0; channel < numChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      const inputData = buffer.getChannelData(channel);
      for (let i = 0; i < inputData.length; i++) {
        const idx = i + delaySamples;
        if (idx < totalLength) {
          outputData[idx] += inputData[i];
        }
      }
    }
  });
  const wavBuffer = audioBufferToWav(outputBuffer);
  const blob = new Blob([new DataView(wavBuffer)], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// =======================
// 메인 Track 컴포넌트
// =======================
const Track = () => {
  // blueTracks: 각 blue track 그룹 배열, 각 그룹은 { id, tracks: [], (옵션) jsonData }
  const [blueTracks, setBlueTracks] = useState([]);
  const [combinedAudioUrl, setCombinedAudioUrl] = useState(null);
  const [totalDurationWS, setTotalDurationWS] = useState(0); // WaveSurfer 파형용 전체 길이
  const mintContainerRef = useRef(null);
  const waveSurferRef = useRef(null);

  // JSON 입력 모달 관련 state
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [selectedBlueTrackId, setSelectedBlueTrackId] = useState(null);

  // VideoContext 사용: 재생바 연동을 위한 값들
  const { videoURL, currentTime, setCurrentTime, duration, videoRef } = useContext(VideoContext);

  // "Add Blue Track" 버튼
  const addBlueTrack = () => {
    setBlueTracks(prev => [...prev, { id: String(Date.now() + Math.random()), tracks: [] }]);
  };

  // 각 blue track 그룹별 파일 업로드 처리
  const handleFileUploadForBlueTrack = async (blueTrackId, e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      try {
        const newTrackInfos = await Promise.all(
          files.map(file => generateTrackInfo(file))
        );
        setBlueTracks(prev =>
          prev.map(bt =>
            bt.id === blueTrackId
              ? { ...bt, tracks: [...bt.tracks, ...newTrackInfos] }
              : bt
          )
        );
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 드래그 로직: blue track 그룹 내 아이템 이동
  const handleMouseDown = (e, blueTrackId, trackId) => {
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
      setBlueTracks(prev =>
        prev.map(bt =>
          bt.id === blueTrackId
            ? {
                ...bt,
                tracks: bt.tracks.map(t =>
                  t.id === trackId ? { ...t, delayPx: finalLeft } : t
                )
              }
            : bt
        )
      );
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // blueTracks 변경 시 병합된 오디오 URL 생성 (WaveSurfer용)
  useEffect(() => {
    const mergedTracks = [];
    for (const bt of blueTracks) {
      for (const t of bt.tracks) {
        mergedTracks.push(t);
      }
    }
    if (mergedTracks.length > 0) {
      combineAudioFilesWithDelays(mergedTracks)
        .then(url => setCombinedAudioUrl(url))
        .catch(err => console.error(err));
    }
  }, [blueTracks]);

  // WaveSurfer 초기화 및 파형 렌더링 (민트색 상자)
  useEffect(() => {
    if (combinedAudioUrl && mintContainerRef.current) {
      if (waveSurferRef.current) {
        try {
          waveSurferRef.current.destroy();
        } catch (error) {
          if (error.name !== 'AbortError') console.error(error);
        }
      }
      waveSurferRef.current = WaveSurfer.create({
        container: mintContainerRef.current,
        waveColor: '#555',
        progressColor: '#ff5500',
        cursorColor: '#333',
        barWidth: 2,
        height: 60,
        minPxPerSec: 50,
        scrollParent: true,
        fillParent: false
      });
      waveSurferRef.current.load(combinedAudioUrl);
      waveSurferRef.current.on('ready', () => {
        waveSurferRef.current.zoom(50);
        setTotalDurationWS(waveSurferRef.current.getDuration());
      });
      waveSurferRef.current.on('finish', () => {
        // 재생 종료 시 처리
      });
    }
    return () => {
      if (waveSurferRef.current) {
        try {
          waveSurferRef.current.destroy();
        } catch (error) {
          if (error.name !== 'AbortError') console.error(error);
        }
      }
    };
  }, [combinedAudioUrl]);

  const handlePlayPause = () => {
    if (waveSurferRef.current) {
      waveSurferRef.current.playPause();
    }
  };

  // JSON 입력 모달 관련 함수
  const openJsonModal = (blueTrackId) => {
    setSelectedBlueTrackId(blueTrackId);
    setShowJsonModal(true);
  };

  const handleJsonCancel = () => {
    setShowJsonModal(false);
    setJsonText('');
    setSelectedBlueTrackId(null);
  };

  const handleJsonSubmit = () => {
    try {
      const parsed = JSON.parse(jsonText);
      console.log("Parsed JSON:", parsed);
      setBlueTracks(prev =>
        prev.map(bt =>
          bt.id === selectedBlueTrackId ? { ...bt, jsonData: parsed } : bt
        )
      );
    } catch (error) {
      console.error("Invalid JSON:", error);
      alert("입력한 텍스트가 유효한 JSON 형식이 아닙니다.");
      return;
    }
    setShowJsonModal(false);
    setJsonText('');
    setSelectedBlueTrackId(null);
  };

  // VideoContext를 사용한 재생바(슬라이더) 오버레이
  // Asd.jsx와 동일하게, VideoContext의 duration을 기준으로 슬라이더를 렌더링합니다.
  const sliderRef = useRef(null);
  const [sliderWidth, setSliderWidth] = useState(0);
  useEffect(() => {
    if (sliderRef.current) {
      setSliderWidth(sliderRef.current.offsetWidth);
    }
  }, [sliderRef, videoURL, duration]);

  // onInput 이벤트를 사용하여 슬라이더 값 변경 시 즉시 currentTime 업데이트
  const handleSliderChange = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex' }}>
        {/* 왼쪽: Additional Container */}
        <div
          style={{
            width: '300px',
            flexShrink: 0,
            border: '1px solid #ccc',
            padding: '10px',
            boxSizing: 'border-box'
          }}
        >
          <h3>Additional Container</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={handlePlayPause}>Play/Pause (WS)</button>
          </div>
          <div style={{ marginTop: '10px' }}>
            <button onClick={addBlueTrack}>Add Blue Track</button>
          </div>
          {/* Video Playback Control (별도 컴포넌트) */}
          <VideoPlaybackControl />
        </div>

        {/* 오른쪽: 공통 컨테이너 (타임라인, 민트색 상자, blueTracks 등) */}
        <div style={commonContainerStyle}>
          {/* 타임라인 컨테이너 - 재생바 오버레이 포함 */}
          <div style={{ ...timelineContainerStyle, position: 'sticky', top: 0 }}>
            {/* 타임라인 컨테이너의 너비는 VideoContext의 duration을 기준 (1초당 50px) */}
            <div style={{ width: `${duration * 50}px`, position: 'relative' }}>
              {duration > 0 && renderTimelineComponent(duration)}
              {/* 재생바 오버레이: 타임라인 내부에 절대 위치로 배치, 너비는 100%로 수정 */}
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

          {/* 민트색 상자: 병합된 오디오 파형 렌더링 */}
          <div style={mintBoxStyle} ref={mintContainerRef} />

          {/* 각 blue track 그룹 렌더링 */}
          {blueTracks.map((bt) => (
            <div key={bt.id} style={{ marginTop: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  marginTop: '10px'
                }}
              >
                <button
                  onClick={() => {
                    document.getElementById(`file-input-${bt.id}`).click();
                  }}
                >
                  Upload Audio File
                </button>
                <button onClick={() => openJsonModal(bt.id)}>입력 JSON</button>
              </div>
              <input
                id={`file-input-${bt.id}`}
                type="file"
                accept="audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFileUploadForBlueTrack(bt.id, e)}
              />
              <div style={blueBoxStyle}>
                {bt.tracks.map((track) => (
                  <div
                    key={track.id}
                    style={{
                      ...draggableItemStyle,
                      left: `${track.delayPx}px`,
                      width: `${track.width}px`
                    }}
                    onMouseDown={(e) => handleMouseDown(e, bt.id, track.id)}
                  >
                    <img
                      src={track.waveformImage}
                      alt="waveform"
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                ))}
              </div>
              {bt.jsonData && (
                <div style={{ marginTop: '5px', fontSize: '12px', color: '#333' }}>
                  <pre>{JSON.stringify(bt.jsonData, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* JSON 입력 모달 */}
      {showJsonModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '5px',
              width: '80%',
              maxWidth: '500px'
            }}
          >
            <h3>JSON 텍스트 입력</h3>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              style={{ width: '100%', height: '200px' }}
            />
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <button onClick={handleJsonCancel} style={{ marginRight: '10px' }}>
                취소
              </button>
              <button onClick={handleJsonSubmit}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Track;
