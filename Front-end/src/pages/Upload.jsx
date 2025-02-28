// VideoUpload.jsx
import React, { useState } from 'react';

function VideoUpload({ formData, setFormData }) {
  const [videoFile, setVideoFile] = useState(null);
  const [responseMessage, setResponseMessage] = useState('');
  const [localVideoData, setLocalVideoData] = useState(null); // 컴포넌트 내에서 JSON 데이터 임시 저장

  const handleFileChange = (e) => {
    setVideoFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!videoFile) {
      alert('파일을 선택하세요!');
      return;
    }

    const uploadFormData = new FormData();
    uploadFormData.append('file', videoFile);

    try {
      // 🎥 비디오 업로드 및 JSON 수신
      const uploadResponse = await fetch('http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8000/upload-video', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        setResponseMessage(`업로드 실패: ${errorData.detail}`);
        return;
      }

      const uploadResult = await uploadResponse.json();
      setResponseMessage('업로드 성공!');
      setLocalVideoData(uploadResult);

      // 부모(App.js)에서 관리하는 formData 업데이트하기
      // 기존 formData에 새로운 필드를 추가하려면 기존 항목들을 복사하여 새 FormData 생성
      const newFormData = new FormData();
      // 기존 formData 복사 (필요한 경우)
      for (let [key, value] of formData.entries()) {
        newFormData.append(key, value);
      }
      // 업로드 결과 JSON 데이터를 문자열로 저장
      newFormData.set('videoData', JSON.stringify(uploadResult));
      // 비디오 URL과 오디오 URL도 업데이트
      newFormData.set(
        'videoURL',
        `http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8000/videos/${uploadResult.video.file_name}`
      );
      newFormData.set(
        'audioURL',
        `http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8000/extracted_audio/${uploadResult.background_music.file_path
          .replace(/^extracted_audio[\\/]/, '')
          .replace(/\\/g, '/')}`
      );
      // 필요한 경우 추가로 JSON 데이터를 배열에 저장하는 등 다른 작업도 가능
      setFormData(newFormData);

    } catch (error) {
      console.error('Error:', error);
      setResponseMessage('오류가 발생했습니다.');
    }
  };

  return (
    <div>
      <h1>동영상 업로드 및 JSON 데이터 보기</h1>
      <form onSubmit={handleUpload}>
        <input type="file" accept="video/*" onChange={handleFileChange} />
        <button type="submit">업로드</button>
      </form>
      {responseMessage && <p>{responseMessage}</p>}

      {localVideoData && (
        <div>
          {/* 전체 처리 시간 및 단계별 시간 표시 */}
          {localVideoData.timings && (
            <div>
              <h2>⏱️ 처리 시간</h2>
              <p>
                <strong>총 처리 시간:</strong>{' '}
                {localVideoData.timings.overall_time.toFixed(2)} 초
              </p>
              <h3>각 단계별 처리 시간</h3>
              <ul>
                <li>
                  <strong>업로드 시간:</strong>{' '}
                  {localVideoData.timings.upload_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>오디오 추출 시간:</strong>{' '}
                  {localVideoData.timings.audio_extraction_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>Spleeter 분리 시간:</strong>{' '}
                  {localVideoData.timings.spleeter_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>DB 저장 시간:</strong>{' '}
                  {localVideoData.timings.db_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>STT 처리 시간:</strong>{' '}
                  {localVideoData.timings.stt_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>번역 처리 시간:</strong>{' '}
                  {localVideoData.timings.translation_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>TTS 생성 시간:</strong>{' '}
                  {localVideoData.timings.tts_time.toFixed(2)} 초
                </li>
                <li>
                  <strong>최종 결과 조회 시간:</strong>{' '}
                  {localVideoData.timings.get_time.toFixed(2)} 초
                </li>
              </ul>
            </div>
          )}

          <h2>📌 비디오 정보</h2>
          <p>
            <strong>파일명:</strong> {localVideoData.video.file_name}
          </p>
          <p>
            <strong>파일 경로:</strong> {localVideoData.video.file_path}
          </p>
          <p>
            <strong>길이:</strong> {localVideoData.video.duration}초
          </p>

          {/* 🎥 비디오 실행 */}
          <video controls width="600" crossOrigin="anonymous">
            <source
              src={`http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8000/videos/${localVideoData.video.file_name}`}
              type="video/mp4"
            />
            브라우저가 비디오 태그를 지원하지 않습니다.
          </video>

          <h2>🎼 배경음 정보</h2>
          {localVideoData.background_music.file_path ? (
            <>
              <p>
                <strong>파일 경로:</strong>{' '}
                {localVideoData.background_music.file_path}
              </p>
              <p>
                <strong>볼륨:</strong> {localVideoData.background_music.volume}
              </p>

              {/* 🎵 배경음 재생 */}
              <audio controls crossOrigin="anonymous">
                <source
                  src={`http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8000/extracted_audio/${localVideoData.background_music.file_path
                    .replace(/^extracted_audio[\\/]/, '')
                    .replace(/\\/g, '/')}`}
                  type="audio/mp3"
                />
              </audio>
            </>
          ) : (
            <p>배경음 없음</p>
          )}

          <h2>🎙️ TTS 트랙</h2>
          {localVideoData.tts_tracks.length > 0 ? (
            <ul>
              {localVideoData.tts_tracks.map((tts) => (
                <li key={tts.tts_id}>
                  <p>
                    <strong>파일 경로:</strong> {tts.file_path}
                  </p>
                  <p>
                    <strong>시작 시간:</strong> {tts.start_time}초
                  </p>
                  <p>
                    <strong>길이:</strong> {tts.duration}초
                  </p>
                  <p>
                    <strong>목소리:</strong> {tts.voice}
                  </p>
                  <p>
                    <strong>번역 텍스트:</strong> {tts.translated_text}
                  </p>
                  <p>
                    <strong>원본 텍스트:</strong> {tts.original_text}
                  </p>
                  <p>
                    <strong>화자:</strong> {tts.speaker}
                  </p>
                  {/* 🎤 TTS 음성 재생 */}
                  <audio controls crossOrigin="anonymous">
                    <source
                      src={`http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8000/extracted_audio/${tts.file_path
                        .replace(/^extracted_audio[\\/]/, '')
                        .replace(/\\/g, '/')}`}
                      type="audio/mp3"
                    />
                  </audio>
                </li>
              ))}
            </ul>
          ) : (
            <p>TTS 트랙 없음</p>
          )}

          {/* 맨 아래에 로컬 JSON 데이터 출력 */}
          <div style={{ marginTop: '20px' }}>
            <h2>테스트: 로컬 JSON 데이터 출력</h2>
            <pre>{JSON.stringify(localVideoData, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoUpload;
