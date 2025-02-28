import React, { useState } from 'react';

const AudioGenerator = () => {
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAudioUrl(null);

    try {
      // FormData를 사용하여 서버에 전송
      const formData = new FormData();
      formData.append('text', text);
      formData.append('duration', 10.0); // 선택 사항 (필요시)
      formData.append('prompt_influence', 0.3); // 선택 사항 (필요시)

      const response = await fetch(
        'http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8002/generate-sound-effect',
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('오디오 생성에 실패했습니다.');
      }

      // 서버에서 JSON 응답을 받음 (예: { message: "...", file_url: "/extracted_audio/sound_effects/xxx.mp3" })
      const data = await response.json();
      // 서버가 상대 경로를 반환하는 경우, 전체 URL로 변경합니다.
      const completeUrl = data.file_url.startsWith('http')
        ? data.file_url
        : `http://ec2-13-211-6-9.ap-southeast-2.compute.amazonaws.com:8002${data.file_url}`;
      setAudioUrl(completeUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>효과음 생성하기</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="효과음에 대한 설명을 입력하세요."
          rows="4"
          style={{ width: '100%', padding: '10px', fontSize: '16px' }}
        />
        <br />
        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: '10px', padding: '10px 20px' }}
        >
          {loading ? '생성 중...' : '효과음 생성'}
        </button>
      </form>
      {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
      {audioUrl && (
        <div style={{ marginTop: '20px' }}>
          <h3>생성된 오디오:</h3>
          <audio controls src={audioUrl} style={{ width: '100%' }}>
            브라우저가 audio 태그를 지원하지 않습니다.
          </audio>
          <br />
          <a
            href={audioUrl}
            download="generated.mp3"
            style={{ display: 'inline-block', marginTop: '10px' }}
          >
            파일 다운로드
          </a>
        </div>
      )}
    </div>
  );
};

export default AudioGenerator;
