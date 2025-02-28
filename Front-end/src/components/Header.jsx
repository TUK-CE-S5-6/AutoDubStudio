import React from 'react';
import { Link } from 'react-router-dom';

function Header() {
  return (
    <header style={{ padding: '10px', backgroundColor: '#eee' }}>
      <nav>
        <Link to="/">홈</Link> |
        <Link to="/signup">회원가입</Link> |
        <Link to="/upload">파일 업로드</Link> |
        <Link to="/stt">대본 추출</Link>  |
        <Link to="/audio">오디오</Link> 
      </nav>
    </header>
  );
}

export default Header;
