import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import "./CombinedTrack.css";

// 타임라인 헬퍼 함수
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
    const leftPos = i * 50;
    const isBigTick = i % 5 === 0;
    ticks.push(
      <div
        key={i}
        className="timeline-tick"
        style={{
          left: `${leftPos}px`,
          width: isBigTick ? '2px' : '1px',
          height: isBigTick ? '3px' : '1px'
        }}
      >
        <span
          className="timeline-label"
          style={{
            top: isBigTick ? '-20px' : '-12px',
            left: isBigTick ? '-20px' : '-12px',
            fontSize: isBigTick ? '10px' : '8px',
            fontWeight: isBigTick ? 'bold' : 'normal'
          }}
        >
          {formatTime(i)}
        </span>
      </div>
    );
  }
  return ticks;
};

// ------------------ 오디오 헬퍼 함수들 ------------------
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

async function generateWaveformFromUrl(url, width, height) {
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return generateWaveformImage(audioBuffer, width, height);
}

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

async function combineAudioFilesWithDelays(tracks) {
  if (tracks.length === 0) return null;
  const audioContext = new AudioContext();

  const readTrackAsArrayBuffer = (track) => {
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

      if (track.file instanceof Blob) {
        reader.readAsArrayBuffer(track.file);
      } else if (track.url) {
        fetch(track.url)
          .then((res) => res.blob())
          .then((blob) => {
            reader.readAsArrayBuffer(blob);
          })
          .catch((err) => reject(err));
      } else {
        reject(new Error("No valid file or url found for track"));
      }
    });
  };

  const promises = tracks.map(track => readTrackAsArrayBuffer(track));
  const decodedTracks = await Promise.all(promises);

  const sampleRate = decodedTracks[0].buffer.sampleRate;
  const numChannels = Math.max(...decodedTracks.map(dt => dt.buffer.numberOfChannels));

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
      const inputChannel = (channel < buffer.numberOfChannels) ? channel : 0;
      const inputData = buffer.getChannelData(inputChannel);
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

/**
 * 비디오 파일에서 2초 간격으로 프레임을 캡쳐하여,
 * 각 프레임은 고정 크기 (2초×50px = 100px × thumbnailHeight)를 유지하고,
 * 최종 결과 이미지는 영상 길이 × 50px 너비로 클리핑됩니다.
 */
function generateCompositeThumbnail(file, interval = 2, thumbnailHeight = 90) {
  return new Promise((resolve, reject) => {
    const videoElem = document.createElement('video');
    videoElem.preload = 'metadata';
    videoElem.muted = true;
    videoElem.src = URL.createObjectURL(file);

    videoElem.onloadedmetadata = () => {
      const duration = videoElem.duration;
      const fixedFrameWidth = interval * 50; // 2초 = 100px
      const totalFrames = Math.ceil(duration / interval);
      const fullCanvasWidth = totalFrames * fixedFrameWidth;
      const finalCanvasWidth = duration * 50;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = fullCanvasWidth;
      tempCanvas.height = thumbnailHeight;
      const tempCtx = tempCanvas.getContext('2d');

      let currentFrame = 0;

      const captureFrame = () => {
        if (currentFrame >= totalFrames) {
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = finalCanvasWidth;
          finalCanvas.height = thumbnailHeight;
          const finalCtx = finalCanvas.getContext('2d');
          finalCtx.drawImage(tempCanvas, 0, 0, finalCanvasWidth, thumbnailHeight, 0, 0, finalCanvasWidth, thumbnailHeight);
          resolve(finalCanvas.toDataURL('image/png'));
          return;
        }
        const time = Math.min(currentFrame * interval, duration);
        videoElem.currentTime = time;
      };

      videoElem.onseeked = () => {
        const xPos = currentFrame * fixedFrameWidth;
        tempCtx.drawImage(videoElem, xPos, 0, fixedFrameWidth, thumbnailHeight);
        currentFrame++;
        captureFrame();
      };

      captureFrame();
    };

    videoElem.onerror = (err) => {
      reject(err);
    };
  });
}

function generateVideoTrackInfo(file) {
  return new Promise((resolve, reject) => {
    generateCompositeThumbnail(file, 2, 90)
      .then((compositeThumbnail) => {
        const videoElem = document.createElement('video');
        videoElem.preload = 'metadata';
        videoElem.src = URL.createObjectURL(file);
        videoElem.onloadedmetadata = () => {
          const videoDuration = videoElem.duration;
          const timelineWidth = Math.ceil(videoDuration * 50);
          const videoWidth = videoElem.videoWidth;
          const videoHeight = videoElem.videoHeight;
          resolve({
            id: String(Date.now() + Math.random()),
            file,
            delayPx: 0,
            duration: videoDuration,
            width: timelineWidth,
            thumbnail: compositeThumbnail,
            videoWidth,
            videoHeight
          });
        };
        videoElem.onerror = (error) => {
          reject(error);
        };
      })
      .catch(reject);
  });
}

// BlueTrackOtherMenu 컴포넌트
const BlueTrackOtherMenu = ({ onUploadAudio, onOpenJson, onDeleteGroup }) => {
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef(null);
  const toggleMenu = (e) => {
    e.stopPropagation();
    setShowMenu(prev => !prev);
  };
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div ref={containerRef} className="other-button-menu">
      <button onClick={toggleMenu}>기타</button>
      {showMenu && (
        <div className="menu-dropdown">
          <ul>
            <li onClick={onUploadAudio}>Upload Audio File</li>
            <li onClick={onOpenJson}>입력 JSON</li>
            <li style={{ color: 'red' }} onClick={onDeleteGroup}>그룹 삭제</li>
          </ul>
        </div>
      )}
    </div>
  );
};

// RedTrackOtherMenu 컴포넌트
const RedTrackOtherMenu = ({ onUploadVideo, onDeleteGroup }) => {
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef(null);
  const toggleMenu = (e) => {
    e.stopPropagation();
    setShowMenu(prev => !prev);
  };
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div ref={containerRef} className="other-button-menu">
      <button onClick={toggleMenu}>기타</button>
      {showMenu && (
        <div className="menu-dropdown">
          <ul>
            <li onClick={onUploadVideo}>Upload Video File</li>
            <li style={{ color: 'red' }} onClick={onDeleteGroup}>그룹 삭제</li>
          </ul>
        </div>
      )}
    </div>
  );
};

// CombinedTrack 컴포넌트
const CombinedTrack = ({ formData, setFormData ,globalTime}) => {
  const [blueTracks, setBlueTracks] = useState([]);
  const [redTracks, setRedTracks] = useState([]);
  const [combinedAudioUrl, setCombinedAudioUrl] = useState(null);
  const [outputUrl, setOutputUrl] = useState(null);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [selectedBlueTrackId, setSelectedBlueTrackId] = useState(null);

  // contextMenu 상태 (우클릭 시 트랙 삭제 옵션)
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    trackType: '',
    groupId: null,
    trackId: null
  });

  // WaveSurfer 및 관련 ref
  const mintContainerRef = useRef(null);
  const waveSurferRef = useRef(null);
  const sliderRef = useRef(null);

  // 타임라인의 duration (previewVideos 정보를 통해 계산; 기본 20초)
  const [timelineDuration, setTimelineDuration] = useState(20);
  useEffect(() => {
    const previewVideosStr = formData.get('previewVideos');
    if (previewVideosStr) {
      try {
        const videos = JSON.parse(previewVideosStr);
        const maxTime = Math.max(...videos.map(video => video.startTime + (video.duration !== undefined ? video.duration : 10)));
        setTimelineDuration(maxTime);
      } catch (error) {
        setTimelineDuration(20);
      }
    } else {
      setTimelineDuration(20);
    }
  }, [formData]);

  // 타임라인 슬라이더(내부)를 globalTime에 따라 이동시키기
  useEffect(() => {
    const timelineEl = document.querySelector('.timeline-container .timeline-inner');
    if (timelineEl) {
      timelineEl.style.transform = `translateX(-${globalTime * 50}px)`;
    }
  }, [globalTime]);

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
          bt.id === selectedBlueTrackId ? { ...bt, jsonData: parsed, jsonApplied: false } : bt
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

  // 그룹 추가 및 삭제 함수 (볼륨 기본값 100)
  const addBlueTrack = () => {
    setBlueTracks(prev => [...prev, { id: String(Date.now() + Math.random()), tracks: [], volume: 100 }]);
  };

  const addRedTrack = () => {
    setRedTracks(prev => [...prev, { id: String(Date.now() + Math.random()), tracks: [], volume: 100 }]);
  };

  const handleDeleteBlueGroup = (blueTrackId) => {
    setBlueTracks(prev => prev.filter(bt => bt.id !== blueTrackId));
  };

  const handleDeleteRedGroup = (redTrackId) => {
    setRedTracks(prev => prev.filter(rt => rt.id !== redTrackId));
  };

  // 볼륨 변경 핸들러
  const handleBlueTrackVolumeChange = (blueTrackId, newVolume) => {
    setBlueTracks(prev =>
      prev.map(bt => bt.id === blueTrackId ? { ...bt, volume: newVolume } : bt)
    );
  };

  const handleRedTrackVolumeChange = (redTrackId, newVolume) => {
    setRedTracks(prev =>
      prev.map(rt => rt.id === redTrackId ? { ...rt, volume: newVolume } : rt)
    );
  };

  const handleProcessJsonTracks = () => {
    console.log("Process JSON Tracks 버튼 클릭");
    alert("Process JSON Tracks 기능을 구현하세요.");
  };

  const handleSendFinalVideo = () => {
    console.log("Send Final Video 버튼 클릭");
    alert("최종 영상 전송 기능을 구현하세요.");
  };

  const handlePreview = async () => {
    try {
      if (!redTracks || redTracks.length === 0) {
        alert("비디오 트랙이 없습니다.");
        return;
      }
      const allRedTracks = redTracks.flatMap((group) =>
        group.tracks.map((track) => ({
          ...track,
          startTime: track.delayPx / 50,
        }))
      );
      if (allRedTracks.length === 0) {
        alert("비디오 트랙이 없습니다.");
        return;
      }
      const previewVideos = allRedTracks.map((track) => ({
        url: track.url ? track.url : track.file ? URL.createObjectURL(track.file) : "",
        startTime: track.startTime,
        duration: track.duration || 0,
      }));
      const newFormData = new FormData();
      for (let [key, value] of formData.entries()) {
        newFormData.append(key, value);
      }
      newFormData.set('previewFlag', 'true');
      newFormData.set('updatedAt', new Date().toISOString());
      newFormData.set('redTrackStartTimes', JSON.stringify(allRedTracks.map((track) => track.startTime)));
      // 볼륨 정보 추가
      newFormData.set('blueTrackVolumes', JSON.stringify(blueTracks.map(bt => bt.volume)));
      newFormData.set('redTrackVolumes', JSON.stringify(redTracks.map(rt => rt.volume)));
      if (combinedAudioUrl) {
        newFormData.set('combinedAudioUrl', combinedAudioUrl);
      }
      newFormData.set('previewVideos', JSON.stringify(previewVideos));
      setFormData(newFormData);
      const formDataObj = {};
      for (let [key, value] of newFormData.entries()) {
        formDataObj[key] = value instanceof Blob ? (value.name ? value.name : "[Blob]") : value;
      }
      console.log("미리보기 및 FormData 업데이트가 완료되었습니다.", formDataObj);
    } catch (error) {
      console.error("handlePreview 에러:", error);
    }
  };

  const handleMergeMedia = async () => {
    if (!combinedAudioUrl) {
      alert("병합된 오디오가 없습니다.");
      return;
    }
    const allRedTracks = redTracks.flatMap((group, groupIndex) =>
      group.tracks.map(track => ({ ...track, groupIndex }))
    );
    if (allRedTracks.length === 0) {
      alert("비디오 트랙이 없습니다.");
      return;
    }
    const startTimes = allRedTracks.map(track => track.delayPx / 50);
    const redTrackIndices = allRedTracks.map(track => track.groupIndex);
    const sortedArray = allRedTracks
      .map((track, index) => ({
        ...track,
        startTime: startTimes[index],
        redIndex: redTrackIndices[index]
      }))
      .sort((a, b) => a.redIndex - b.redIndex)
      .reverse();
    const sortedStartTimes = sortedArray.map(item => item.startTime);
    try {
      const audioResponse = await fetch(combinedAudioUrl);
      const audioBlob = await audioResponse.blob();
      const audioFile = new File([audioBlob], "merged_audio.wav", { type: "audio/wav" });
      const formDataForMerge = new FormData();
      formDataForMerge.append("audio", audioFile);
      sortedArray.forEach(track => {
        formDataForMerge.append("video", track.file);
      });
      formDataForMerge.append("start_times", JSON.stringify(sortedStartTimes));
      formDataForMerge.append("red_track_indices", JSON.stringify(sortedArray.map(item => item.redIndex)));
      const response = await fetch("http://localhost:8000/merge-media", {
        method: "POST",
        body: formDataForMerge,
      });
      if (!response.ok) {
        throw new Error("서버 병합 오류");
      }
      const mergedBlob = await response.blob();
      const mergedUrl = URL.createObjectURL(mergedBlob);
      setOutputUrl(mergedUrl);
      const newFormData = new FormData();
      for (let [key, value] of formData.entries()) {
        newFormData.append(key, value);
      }
      newFormData.set('mergedVideoUrl', mergedUrl);
      setFormData(newFormData);
      alert("병합 완료!");
    } catch (error) {
      console.error(error);
      alert("병합 중 오류 발생: " + error.message);
    }
  };

  // 개별 트랙 삭제 함수 (우클릭 컨텍스트 메뉴로 삭제)
  const handleDeleteBlueTrack = (blueTrackId, trackId) => {
    setBlueTracks(prev =>
      prev.map(bt =>
        bt.id === blueTrackId ? { ...bt, tracks: bt.tracks.filter(t => t.id !== trackId) } : bt
      )
    );
  };

  const handleDeleteRedTrack = (redTrackId, trackId) => {
    setRedTracks(prev =>
      prev.map(rt =>
        rt.id === redTrackId ? { ...rt, tracks: rt.tracks.filter(t => t.id !== trackId) } : rt
      )
    );
  };

  // 파일 업로드 핸들러 (blueTracks)
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

  // 파일 업로드 핸들러 (redTracks)
  const handleFileUploadForRedTrack = async (redTrackId, e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      try {
        const newTrackInfos = await Promise.all(
          files.map(file => generateVideoTrackInfo(file))
        );
        setRedTracks(prev =>
          prev.map(rt =>
            rt.id === redTrackId
              ? { ...rt, tracks: [...rt.tracks, ...newTrackInfos] }
              : rt
          )
        );
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 드래그 핸들러 (blueTracks)
  const handleBlueTrackMouseDown = (e, blueTrackId, trackId) => {
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
            ? { ...bt, tracks: bt.tracks.map(t => (t.id === trackId ? { ...t, delayPx: finalLeft } : t)) }
            : bt
        )
      );
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 드래그 핸들러 (redTracks)
  const handleRedTrackMouseDown = (e, redTrackId, trackId) => {
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
      setRedTracks(prev =>
        prev.map(rt =>
          rt.id === redTrackId
            ? { ...rt, tracks: rt.tracks.map(t => (t.id === trackId ? { ...t, delayPx: finalLeft } : t)) }
            : rt
        )
      );
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // blueTracks 변경 시, 오디오 병합 (WaveSurfer용)
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
    } else {
      setCombinedAudioUrl(null);
    }
  }, [blueTracks]);

  // WaveSurfer 초기화: 오디오 파형 렌더링
  useEffect(() => {
    if (combinedAudioUrl && mintContainerRef.current) {
      if (waveSurferRef.current) {
        try {
          waveSurferRef.current.destroy();
        } catch (error) {
          console.error(error);
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
      });
    }
    return () => {
      if (waveSurferRef.current) {
        try {
          waveSurferRef.current.destroy();
        } catch (error) {
          console.error(error);
        }
      }
    };
  }, [combinedAudioUrl]);

  // 재생/일시정지 버튼
  const handlePlayPause = () => {
    if (waveSurferRef.current) {
      waveSurferRef.current.playPause();
    }
  };

  // 슬라이더 변경 핸들러 (예시)
  const handleSliderChange = (e) => {
    const newTime = parseFloat(e.target.value);
    // 필요에 따라 처리
  };

  // 우클릭 시 컨텍스트 메뉴 표시 핸들러
  const handleTrackContextMenu = (e, trackType, groupId, trackId) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      trackType,
      groupId,
      trackId
    });
  };

  // 컨텍스트 메뉴의 삭제 옵션 선택 시
  const handleContextMenuDelete = () => {
    if (contextMenu.trackType === 'blue') {
      handleDeleteBlueTrack(contextMenu.groupId, contextMenu.trackId);
    } else if (contextMenu.trackType === 'red') {
      handleDeleteRedTrack(contextMenu.groupId, contextMenu.trackId);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  // 전역 클릭 시 컨텍스트 메뉴 숨김
  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu.visible]);

  return (
    <div className="combined-track-container">
      <div>
        <div style={{ width: '2200px', flexShrink: 0, border: '1px solid #ccc', padding: '10px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
            <button onClick={handlePlayPause}>Play/Pause (WS)</button>
            <button onClick={addBlueTrack}>Add Blue Track</button>
            <button onClick={addRedTrack}>Add Red Track</button>
            <button onClick={handleProcessJsonTracks}>Process JSON Tracks</button>
            <button onClick={handleMergeMedia}>Merge &amp; Download Video</button>
            <button onClick={handlePreview}>PreView &amp; Update FormData</button>
          </div>
          {outputUrl && (
            <>
              <div style={{ marginTop: '10px' }}>
                <a href={outputUrl} download="merged_output.mp4">최종 영상 다운로드</a>
              </div>
              <div style={{ marginTop: '10px' }}>
                <button onClick={handleSendFinalVideo}>최종 영상 보내기</button>
              </div>
            </>
          )}
        </div>
        <div className="timeline-container">
          <div style={{ width: '1000px', position: 'relative' }}>
            {renderTimelineComponent(20)}
            <div ref={sliderRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 1000 }}>
              <input
                type="range"
                min="0"
                max={20}
                step="0.1"
                defaultValue="0"
                onInput={handleSliderChange}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
        <div className="mint-box" ref={mintContainerRef} />
      </div>

      {/* blueTracks 렌더링 (오디오 트랙) */}
      {blueTracks.map(bt => (
        <div key={bt.id} style={{ marginTop: '10px', display: 'flex' }}>
          <div style={{ width: '150px', backgroundColor: '#eee', padding: '10px' }}>
            <BlueTrackOtherMenu
              onUploadAudio={() => document.getElementById(`file-input-blue-${bt.id}`).click()}
              onOpenJson={() => openJsonModal(bt.id)}
              onDeleteGroup={() => handleDeleteBlueGroup(bt.id)}
            />
            {/* 볼륨 컨트롤 슬라이더 */}
            <div className="volume-control">
              <label style={{ fontSize: '12px', color: '#dcddde' }}>Volume</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={bt.volume}
                onChange={(e) => handleBlueTrackVolumeChange(bt.id, parseInt(e.target.value))}
              />
            </div>
          </div>
          <div style={{ flexGrow: 1 }}>
            <input
              id={`file-input-blue-${bt.id}`}
              type="file"
              accept="audio/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFileUploadForBlueTrack(bt.id, e)}
            />
            <div className="blue-box">
              {bt.tracks.map(track => (
                <div
                  key={track.id}
                  className="draggable-item"
                  style={{ left: `${track.delayPx}px`, width: `${track.width}px` }}
                  onMouseDown={(e) => handleBlueTrackMouseDown(e, bt.id, track.id)}
                  onContextMenu={(e) => handleTrackContextMenu(e, 'blue', bt.id, track.id)}
                >
                  <img src={track.waveformImage} alt="waveform" style={{ width: '100%', height: '100%' }} />
                </div>
              ))}
            </div>
            {bt.jsonData && (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#dcddde' }}>
                <pre>{JSON.stringify(bt.jsonData, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* redTracks 렌더링 (비디오 트랙) */}
      {redTracks.map(rt => (
        <div key={rt.id} style={{ marginTop: '10px', display: 'flex' }}>
          <div style={{ width: '150px', backgroundColor: '#eee', padding: '10px' }}>
            <RedTrackOtherMenu
              onUploadVideo={() => document.getElementById(`file-input-red-${rt.id}`).click()}
              onDeleteGroup={() => handleDeleteRedGroup(rt.id)}
            />
            {/* 볼륨 컨트롤 슬라이더 */}
            <div className="volume-control">
              <label style={{ fontSize: '12px', color: '#dcddde' }}>Volume</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={rt.volume}
                onChange={(e) => handleRedTrackVolumeChange(rt.id, parseInt(e.target.value))}
              />
            </div>
          </div>
          <div style={{ flexGrow: 1 }}>
            <input
              id={`file-input-red-${rt.id}`}
              type="file"
              accept="video/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFileUploadForRedTrack(rt.id, e)}
            />
            <div className="red-box">
              {rt.tracks.map(track => (
                <div
                  key={track.id}
                  className="draggable-item"
                  style={{ left: `${track.delayPx}px`, width: `${track.width}px` }}
                  onMouseDown={(e) => handleRedTrackMouseDown(e, rt.id, track.id)}
                  onContextMenu={(e) => handleTrackContextMenu(e, 'red', rt.id, track.id)}
                >
                  <img src={track.thumbnail} alt="video thumbnail" style={{ width: '100%', height: '100%' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: '#36393f',
            border: '1px solid #72767d',
            padding: '5px',
            zIndex: 2000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            color: '#dcddde'
          }}
        >
          <div style={{ cursor: 'pointer' }} onClick={handleContextMenuDelete}>
            삭제
          </div>
        </div>
      )}

      {/* JSON 입력 모달 */}
      {showJsonModal && (
        <div className="json-modal">
          <div className="modal-content">
            <h3>JSON 텍스트 입력</h3>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
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

export default CombinedTrack;
