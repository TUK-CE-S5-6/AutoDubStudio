import React, { useState } from 'react';

function SignUp() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:8000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        const data = await response.json();
        alert(`회원가입 성공: user_id = ${data.user_id}`);
      } else {
        const errData = await response.json();
        alert(`회원가입 실패: ${errData.detail || '서버 오류'}`);
      }
    } catch (error) {
      console.error(error);
      alert('오류가 발생했습니다.');
    }
  };

  return (
    <div>
      <h1>회원가입</h1>
      <form onSubmit={handleSignUp}>
        <div>
          <label>사용자 이름</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디를 입력하세요"
            required
          />
        </div>
        <div>
          <label>비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            required
          />
        </div>
        <button type="submit">가입하기</button>
      </form>
    </div>
  );
}

export default SignUp;
