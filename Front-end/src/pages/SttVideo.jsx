import React, { useState } from 'react';

function VideoTranscription() {
  const [videoFile, setVideoFile] = useState(null);
  const [fileName, setFileName] = useState(''); // 업로드된 파일명 저장
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [ttsStatus, setTtsStatus] = useState(''); // TTS 상태
  const [ttsFiles, setTtsFiles] = useState([]); // TTS 파일 목록
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setVideoFile(file);

    // 파일 이름에서 확장자를 제거하여 저장
    const nameWithoutExtension =
      file?.name.split('.').slice(0, -1).join('.') || '';
    setFileName(nameWithoutExtension);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!videoFile) {
      alert('파일을 선택하세요!');
      return;
    }

    const formData = new FormData();
    formData.append('file', videoFile);

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/stt-video', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setTranscription(result.transcription); // 한글 대본
        setTranslation(result.translation); // 영어 번역 대본
      } else {
        const errorData = await response.json();
        alert(`업로드 실패: ${errorData.detail}`);
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTTS = async () => {
    if (!fileName) {
      alert('TTS를 생성할 파일명을 찾을 수 없습니다.');
      return;
    }

    setTtsStatus('TTS 생성 중...');
    try {
      const response = await fetch('http://localhost:8000/generate-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_name: fileName }), // 파일명 전송
      });

      if (response.ok) {
        const result = await response.json();
        setTtsFiles(result.files || []); // TTS 파일 목록 설정
        setTtsStatus('TTS 생성 완료!');
      } else {
        const errorData = await response.json();
        alert(`TTS 생성 실패: ${errorData.detail}`);
        setTtsStatus('TTS 생성 실패');
      }
    } catch (error) {
      console.error('Error generating TTS:', error);
      alert('TTS 생성 중 오류가 발생했습니다.');
      setTtsStatus('TTS 생성 실패');
    }
  };

  return (
    <div>
      <h1>동영상 대본 추출 및 음성 생성</h1>
      <form onSubmit={handleUpload}>
        <input type="file" accept="video/*" onChange={handleFileChange} />
        <button type="submit" disabled={loading}>
          {loading ? '추출 중...' : '업로드 및 대본 추출'}
        </button>
      </form>

      {transcription && (
        <div>
          <h2>한글 대본 결과:</h2>
          <pre>{transcription}</pre>
        </div>
      )}

      {translation && (
        <div>
          <h2>영어 번역 결과:</h2>
          <pre>{translation}</pre>
          <button
            onClick={handleGenerateTTS}
            disabled={ttsStatus === 'TTS 생성 중...'}
          >
            {ttsStatus || 'TTS 생성하기'}
          </button>
        </div>
      )}

      {ttsFiles.length > 0 && (
        <div>
          <h2>영어 음성 파일 (TTS):</h2>
          <ul>
            {ttsFiles.map((file, index) => (
              <li key={index}>
                <a
                  href={`http://localhost:8000/${file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {file.split('/').pop()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default VideoTranscription;
